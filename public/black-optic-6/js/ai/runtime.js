/**
 * Loading the on-device models. Browser-only.
 *
 * Libraries are served from this site (vendor/), so after one visit the
 * console's code works without the internet. Model weights for the vision
 * models download once from the Hugging Face hub and are cached by the browser
 * (transformers.js keeps them in Cache Storage); YAMNet's weights ship with the
 * site. Device: WebGPU when the browser has it, otherwise WebAssembly.
 *
 * @module black-optic-6/ai/runtime
 */

const VENDOR = new URL('../../vendor/', import.meta.url).href;

/** Vision models offered, by job. Ids are Hugging Face ONNX repos. */
export const MODELS = Object.freeze({
  depth: [
    { id: 'onnx-community/depth-anything-v2-small', label: 'Depth Anything V2 small · relative', metric: false },
  ],
  openVocab: [
    { id: 'Xenova/owlvit-base-patch32', label: 'OWL-ViT B/32 · fastest', task: 'zero-shot-object-detection' },
    { id: 'onnx-community/grounding-dino-tiny-ONNX', label: 'Grounding DINO tiny · heavier', task: 'zero-shot-object-detection' },
  ],
  segment: [
    { id: 'Xenova/slimsam-77-uniform', label: 'SlimSAM · click to mask' },
  ],
});

let transformers = null;
const pipes = new Map();

/** Which device transformers.js should use here. */
export function preferredDevice() {
  return typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm';
}

/** Load (once) the vendored transformers.js and point ONNX Runtime at the vendored WASM. */
export async function loadTransformers() {
  if (transformers) return transformers;
  const lib = await import(`${VENDOR}transformers/transformers.min.js`);
  lib.env.allowLocalModels = false;
  lib.env.backends.onnx.wasm.wasmPaths = `${VENDOR}transformers/`;
  transformers = lib;
  return lib;
}

/**
 * A cached transformers.js pipeline, WebGPU first then WASM.
 *
 * @param {string} task e.g. 'depth-estimation'.
 * @param {string} model Hub id.
 * @param {(text: string) => void} [onStatus]
 * @returns {Promise<{pipe: Function, device: string}>}
 */
export async function getPipeline(task, model, onStatus = () => {}) {
  const key = `${task}|${model}`;
  if (pipes.has(key)) return pipes.get(key);
  onStatus('Loading the runtime…');
  const { pipeline } = await loadTransformers();
  const progress = (p) => {
    if (p.status === 'progress' && p.total) onStatus(`Downloading ${p.file ?? 'weights'} ${Math.round((p.loaded / p.total) * 100)}%`);
  };
  const attempt = async (device) => ({
    pipe: await pipeline(task, model, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback: progress }),
    device,
  });
  let result;
  try {
    if (preferredDevice() !== 'webgpu') throw new Error('no WebGPU');
    result = await attempt('webgpu');
  } catch {
    result = await attempt('wasm');
  }
  pipes.set(key, result);
  onStatus(`Ready · ${result.device}`);
  return result;
}

/** Segment-anything needs the model and processor directly (no pipeline). */
let sam = null;
export async function getSam(model, onStatus = () => {}) {
  if (sam?.id === model) return sam;
  onStatus('Loading the runtime…');
  const { SamModel, AutoProcessor } = await loadTransformers();
  const device = preferredDevice();
  const progress = (p) => {
    if (p.status === 'progress' && p.total) onStatus(`Downloading ${p.file ?? 'weights'} ${Math.round((p.loaded / p.total) * 100)}%`);
  };
  let samModel;
  try {
    samModel = await SamModel.from_pretrained(model, { device, dtype: 'fp32', progress_callback: progress });
  } catch {
    samModel = await SamModel.from_pretrained(model, { device: 'wasm', dtype: 'q8', progress_callback: progress });
  }
  const processor = await AutoProcessor.from_pretrained(model);
  sam = { id: model, model: samModel, processor };
  onStatus('Segmenter ready');
  return sam;
}

/** Wrap a canvas as a transformers.js RawImage. */
export async function rawImage(canvas) {
  const { RawImage } = await loadTransformers();
  return RawImage.fromCanvas ? RawImage.fromCanvas(canvas) : RawImage.read(canvas.toDataURL('image/jpeg', 0.9));
}

/** Read a depth-estimation result's float map: {data, width, height} at model resolution. */
export function depthMapOf(out) {
  const t = out?.predicted_depth;
  if (t?.dims && t.data) {
    const dims = t.dims.filter((d) => d !== 1);
    const [height, width] = dims.length >= 2 ? dims.slice(-2) : [t.dims.at(-2), t.dims.at(-1)];
    return { data: Float32Array.from(t.data), width, height };
  }
  const img = out?.depth;
  const ch = img.channels ?? 1;
  const data = new Float32Array(img.width * img.height);
  for (let i = 0; i < data.length; i += 1) data[i] = img.data[i * ch] / 255;
  return { data, width: img.width, height: img.height };
}

/** The YAMNet classifier through MediaPipe, entirely from this site. */
let audioClassifier = null;
export async function getAudioClassifier() {
  if (audioClassifier) return audioClassifier;
  const { AudioClassifier } = await import(`${VENDOR}mediapipe/audio_bundle.mjs`);
  const fileset = {
    wasmLoaderPath: `${VENDOR}mediapipe/audio_wasm_internal.js`,
    wasmBinaryPath: `${VENDOR}mediapipe/audio_wasm_internal.wasm`,
  };
  audioClassifier = await AudioClassifier.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${VENDOR}models/yamnet.tflite` },
    maxResults: 40,
    scoreThreshold: 0.02,
  });
  return audioClassifier;
}

/** geotiff.js (UMD) as a global. */
let geotiff = null;
export function loadGeoTiff() {
  if (geotiff) return geotiff;
  geotiff = new Promise((resolve, reject) => {
    if (globalThis.GeoTIFF) { resolve(globalThis.GeoTIFF); return; }
    const s = document.createElement('script');
    s.src = `${VENDOR}geotiff/geotiff.js`;
    s.onload = () => resolve(globalThis.GeoTIFF);
    s.onerror = () => reject(new Error('geotiff.js did not load'));
    document.head.append(s);
  });
  return geotiff;
}
