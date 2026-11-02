/**
 * The on-device AI stack. Each engine loads on first use and is optional: if one cannot load
 * (no WebGPU, offline on first visit, an old phone), the app falls back to the heuristics in
 * core.js and says so.
 *
 *   MediaPipe Tasks Vision  — face detector (BlazeFace) and pose landmarker. Vendored here.
 *   Tesseract.js            — on-screen text OCR (browser stand-in for PaddleOCR). Vendored.
 *   transformers.js         — CLIP zero-shot (thumbnail appeal), Twitter-RoBERTa sentiment
 *                             (comment mood) and Whisper (word-timed captions). The library is
 *                             shared with Black Optic 6; the weights come from the Hugging
 *                             Face hub once and the browser caches them.
 *
 * Nothing is uploaded: frames, audio and comments stay in the tab.
 *
 * @module viralx/ai
 */

const HERE = new URL('../', import.meta.url).href;
const V = `${HERE}vendor/`;
const TF_VENDOR = new URL('../black-optic-6/vendor/transformers/', HERE).href;

export const MODELS = {
  clip: 'Xenova/clip-vit-base-patch32',
  sentiment: 'Xenova/twitter-roberta-base-sentiment-latest',
  sentimentFallback: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  whisper: 'Xenova/whisper-base.en',
};

const once = new Map();
const memo = (key, fn) => { if (!once.has(key)) once.set(key, fn().catch((e) => { once.delete(key); throw e; })); return once.get(key); };

/* ───────────── MediaPipe ───────────── */

function vision() {
  return memo('mp', async () => {
    const mp = await import(`${V}mediapipe/vision_bundle.mjs`);
    const fileset = await mp.FilesetResolver.forVisionTasks(`${V}mediapipe`);
    return { mp, fileset };
  });
}

/** BlazeFace short-range in VIDEO mode. */
export function faceDetector() {
  return memo('face', async () => {
    const { mp, fileset } = await vision();
    const make = (delegate) => mp.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${V}models/blaze_face_short_range.tflite`, delegate },
      runningMode: 'VIDEO', minDetectionConfidence: 0.5,
    });
    try { return await make('GPU'); } catch { return make('CPU'); }
  });
}

/** Pose landmarker (lite) in VIDEO mode, up to 3 people. */
export function poseLandmarker() {
  return memo('pose', async () => {
    const { mp, fileset } = await vision();
    const make = (delegate) => mp.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${V}models/pose_landmarker_lite.task`, delegate },
      runningMode: 'VIDEO', numPoses: 3,
    });
    try { return await make('GPU'); } catch { return make('CPU'); }
  });
}

/** The 33-point BlazePose skeleton edges, for drawing. */
export const POSE_EDGES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30], [0, 11], [0, 12],
];

/* ───────────── Tesseract OCR ───────────── */

export function ocr() {
  return memo('ocr', async () => {
    const mod = await import(`${V}tesseract/tesseract.esm.min.js`);
    const T = mod.default || mod;
    return T.createWorker('eng', 1, {
      workerPath: `${V}tesseract/worker.min.js`,
      corePath: `${V}tesseract/`,
      langPath: `${V}tesseract/`,
      gzip: true,
    });
  });
}

/** Words of at least 3 letters that Tesseract is confident about. */
export async function readText(canvas) {
  const w = await ocr();
  const { data } = await w.recognize(canvas);
  return (data.words || []).filter((x) => x.confidence > 70 && /[A-Za-z]{3,}/.test(x.text)).map((x) => x.text);
}

/* ───────────── transformers.js ───────────── */

let device = null;
function transformers() {
  return memo('tf', async () => {
    const lib = await import(`${TF_VENDOR}transformers.min.js`);
    lib.env.allowLocalModels = false;
    lib.env.backends.onnx.wasm.wasmPaths = TF_VENDOR;
    return lib;
  });
}

async function pipe(task, model, onStatus, opts = {}) {
  const lib = await transformers();
  const progress = (p) => {
    if (p.status === 'progress' && p.total) onStatus?.(`Downloading ${model.split('/')[1]} ${Math.round((p.loaded / p.total) * 100)}%`);
  };
  const tryOn = (d) => lib.pipeline(task, model, { device: d, dtype: d === 'webgpu' ? 'fp32' : 'q8', progress_callback: progress, ...opts });
  if (navigator.gpu && device !== 'wasm') {
    try { const p = await tryOn('webgpu'); device = 'webgpu'; return p; } catch { /* fall through */ }
  }
  device = 'wasm';
  return tryOn('wasm');
}

/** CLIP zero-shot: the probability that each image looks like a scroll-stopping cover. */
export function clip(onStatus) {
  return memo('clip', () => pipe('zero-shot-image-classification', MODELS.clip, onStatus));
}

export const THUMB_LABELS = {
  good: [
    'an eye-catching, high-contrast social media thumbnail with an expressive face',
    'a dramatic, emotional moment captured in a vivid photo',
  ],
  bad: [
    'a blurry, dark, boring photo',
    'an empty room with nothing happening',
  ],
};

/** @returns {Promise<number[]>} appeal 0–1 per image URL/canvas */
export async function clipAppeal(images, onStatus) {
  const c = await clip(onStatus);
  const labels = [...THUMB_LABELS.good, ...THUMB_LABELS.bad];
  const out = [];
  for (const img of images) {
    const res = await c(img, labels);
    out.push(res.filter((r) => THUMB_LABELS.good.includes(r.label)).reduce((a, r) => a + r.score, 0));
  }
  return out;
}

/** Comment sentiment (Cardiff Twitter-RoBERTa; SST-2 DistilBERT if that model will not load). */
export function sentiment(onStatus) {
  return memo('sent', async () => {
    try { return { p: await pipe('text-classification', MODELS.sentiment, onStatus), model: MODELS.sentiment }; }
    catch { return { p: await pipe('text-classification', MODELS.sentimentFallback, onStatus), model: MODELS.sentimentFallback }; }
  });
}

export async function classify(texts, onStatus) {
  const { p, model } = await sentiment(onStatus);
  const out = [];
  for (const t of texts) {
    const [r] = await p(t.slice(0, 512));
    const l = r.label.toLowerCase();
    out.push(l.startsWith('pos') ? 'positive' : l.startsWith('neg') ? 'negative' : 'neutral');
  }
  return { labels: out, model };
}

/** Whisper with word timestamps, run on 16 kHz mono audio. */
export function whisper(onStatus) {
  return memo('asr', () => pipe('automatic-speech-recognition', MODELS.whisper, onStatus));
}

/** @returns {Promise<{text:string, words:{text:string,start:number,end:number}[]}>} */
export async function transcribe(pcm16k, onStatus) {
  const asr = await whisper(onStatus);
  onStatus?.('Transcribing…');
  const r = await asr(pcm16k, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
  const words = (r.chunks || []).map((c) => ({ text: c.text.trim(), start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 0.3 }));
  return { text: r.text.trim(), words };
}

export const aiDevice = () => device;
