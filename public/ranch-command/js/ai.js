/**
 * RANCH COMMAND — the AI that runs where.
 *
 * Three tiers, each labelled on screen with where it actually ran:
 *
 * 1. **On this device** — MediaPipe, bundled with the dashboard: an
 *    EfficientDet-Lite0 detector (people, vehicles, cattle, horses, sheep,
 *    dogs, birds, bears) and the hand tracker behind the air swipe. Works
 *    offline, on an iPhone, with no server.
 * 2. **On the edge box** — the ranch-edge service on a Jetson or a PC with an
 *    NVIDIA GPU: NanoOWL and NanoSAM on TensorRT, MegaDetector V6, RF-DETR
 *    and Cowcatcher. This is where the heavy models belong.
 * 3. **In the browser, from the internet** — when there is no edge box, the
 *    same model families NanoOWL and NanoSAM are built from (OWL-ViT and a
 *    distilled SAM) can run in the browser via transformers.js. Slower, and
 *    a large one-off download, but the same capability.
 *
 * @module ranch-command/ai
 */

const BASE = new URL('..', import.meta.url).href;

/* ---------------------------------------------------------- MediaPipe */

let visionModule = null;
let fileset = null;

/** Load the bundled MediaPipe runtime once. */
async function mediapipe() {
  if (!visionModule) {
    visionModule = await import(`${BASE}vendor/mediapipe/vision_bundle.mjs`);
    fileset = await visionModule.FilesetResolver.forVisionTasks(`${BASE}vendor/mediapipe/wasm`);
  }
  return { vision: visionModule, fileset };
}

/**
 * The on-device object detector.
 *
 * @param {{ scoreThreshold?: number, delegate?: 'GPU'|'CPU' }} [options] Options.
 * @returns {Promise<object>} A MediaPipe ObjectDetector in VIDEO mode.
 */
export async function createDetector({ scoreThreshold = 0.4, delegate = 'CPU' } = {}) {
  const { vision, fileset: files } = await mediapipe();
  // CPU (XNNPACK) by default. The bundled detector is the int8-quantised
  // EfficientDet-Lite0, and in testing the GPU delegate ran it without error
  // and returned no detections at all — a silent failure is the worst kind
  // for a security camera. On CPU it found the same person at 79%.
  return vision.ObjectDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${BASE}models/efficientdet_lite0.tflite`, delegate },
    runningMode: 'VIDEO',
    scoreThreshold,
    maxResults: 12,
  });
}

/**
 * The on-device hand tracker.
 *
 * @returns {Promise<object>} A MediaPipe HandLandmarker in VIDEO mode.
 */
export async function createHandTracker({ delegate = 'CPU' } = {}) {
  const { vision, fileset: files } = await mediapipe();
  // CPU for the same reason as the detector: it is the path verified to
  // return hands. Pass `delegate: 'GPU'` to try the faster one on a device.
  return vision.HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/**
 * Flatten a MediaPipe detection result.
 *
 * @param {object} result `detectForVideo` output.
 * @returns {Array<{ label: string, score: number, box: { x: number, y: number, w: number, h: number } }>} Detections in source pixels.
 */
export function detections(result) {
  return (result?.detections || []).map((d) => {
    const c = d.categories?.[0] || {};
    const b = d.boundingBox || {};
    return { label: c.categoryName || 'object', score: c.score || 0, box: { x: b.originX, y: b.originY, w: b.width, h: b.height } };
  });
}

/* ------------------------------------------------------------ the edge */

/**
 * Ask the edge box for something.
 *
 * @param {string} edgeUrl Base URL of ranch-edge.
 * @param {string} path API path.
 * @param {object} [body] JSON body; GET when absent.
 * @returns {Promise<object>} The JSON answer.
 */
export async function edge(edgeUrl, path, body) {
  if (!edgeUrl) throw new Error('No edge box is configured.');
  const response = await fetch(`${edgeUrl.replace(/\/$/, '')}${path}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  if (!response.ok) throw new Error(`The edge box answered ${response.status}.`);
  return response.json();
}

/* ------------------------------------------------- browser fallbacks */

// transformers.js and its models come from the internet on first use and are
// cached by the browser after that.
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
let transformers = null;
let owl = null;
let sam = null;

async function hf() {
  if (!transformers) transformers = await import(/* @vite-ignore */ TRANSFORMERS);
  return transformers;
}

/**
 * Open-vocabulary detection — find things by describing them.
 *
 * On the edge box this is NanoOWL (OWL-ViT on TensorRT). Without one, the
 * same OWL-ViT model runs here.
 *
 * @param {{ image: string, prompts: string[], threshold?: number, edgeUrl?: string, onProgress?: Function }} request A JPEG data URL and the phrases.
 * @returns {Promise<{ via: string, detections: Array<{ label: string, score: number, box: { x: number, y: number, w: number, h: number } }> }>} Results.
 */
export async function findByText({ image, prompts, threshold = 0.1, edgeUrl, onProgress }) {
  if (edgeUrl) {
    const out = await edge(edgeUrl, '/v1/owl', { image, prompts, threshold });
    return { via: out.via || 'NanoOWL · edge', detections: out.detections.map((d) => ({ label: d.label, score: d.score, box: { x: d.box[0], y: d.box[1], w: d.box[2] - d.box[0], h: d.box[3] - d.box[1] } })) };
  }
  const T = await hf();
  if (!owl) owl = await T.pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch32', { progress_callback: onProgress });
  const raw = await owl(image, prompts, { threshold });
  return {
    via: 'OWL-ViT · this browser',
    detections: raw.map((d) => ({ label: d.label, score: d.score, box: { x: d.box.xmin, y: d.box.ymin, w: d.box.xmax - d.box.xmin, h: d.box.ymax - d.box.ymin } })),
  };
}

/**
 * Segment whatever is under a tap.
 *
 * On the edge box this is NanoSAM (a distilled MobileSAM on TensorRT).
 * Without one, SlimSAM — another distilled SAM — runs here.
 *
 * @param {{ image: string, point: [number, number], edgeUrl?: string, onProgress?: Function }} request A JPEG data URL and a point in its pixels.
 * @returns {Promise<{ via: string, mask: ImageData|string, score: number }>} A mask: ImageData in the browser path, a PNG data URL from the edge.
 */
export async function segmentAt({ image, point, edgeUrl, onProgress }) {
  if (edgeUrl) {
    const out = await edge(edgeUrl, '/v1/sam', { image, points: [[point[0], point[1], 1]] });
    return { via: out.via || 'NanoSAM · edge', mask: out.mask, score: out.score };
  }
  const T = await hf();
  if (!sam) {
    sam = {
      model: await T.SamModel.from_pretrained('Xenova/slimsam-77-uniform', { progress_callback: onProgress }),
      processor: await T.AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform'),
    };
  }
  const raw = await T.RawImage.fromURL(image);
  const inputs = await sam.processor(raw, { input_points: [[[point[0], point[1]]]], input_labels: [[1]] });
  const outputs = await sam.model(inputs);
  const masks = await sam.processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const scores = outputs.iou_scores.data;
  let best = 0;
  for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[best]) best = i;
  const mask = masks[0];
  const [, , h, w] = mask.dims;
  const data = new Uint8ClampedArray(w * h * 4);
  const offset = best * w * h;
  for (let i = 0; i < w * h; i += 1) {
    if (mask.data[offset + i]) data.set([57, 255, 20, 140], i * 4);
  }
  return { via: 'SlimSAM · this browser', mask: new ImageData(data, w, h), score: scores[best] };
}

/**
 * Grab a frame from a video or image element as a JPEG data URL.
 *
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source The source.
 * @param {number} [maxWidth] Downscale wide frames to this width.
 * @returns {{ url: string, width: number, height: number }} The frame.
 */
export function grabFrame(source, maxWidth = 960) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  if (!w || !h) throw new Error('That feed has no picture yet.');
  const scale = Math.min(1, maxWidth / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return { url: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height };
}
