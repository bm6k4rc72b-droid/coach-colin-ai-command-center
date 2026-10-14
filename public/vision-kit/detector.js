/**
 * In-browser object detection (TF.js COCO-SSD, MobileNet v2 lite) — the browser stand-in for
 * the YOLO / RT-DETR detectors in the computer-vision curriculum. Every frame stays on the
 * device: the model weights download once, the pixels never leave.
 *
 * Weights are tried from this site first (the copy cloak-lab ships), then from the
 * TensorFlow CDN. The backend can be switched between WebGL, WASM and plain CPU so the latency
 * lab can compare them like-for-like, as glance-speedlab compares inference runtimes.
 *
 * @module vision-kit/detector
 */

const TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
const WASM = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.20.0/dist/tf-backend-wasm.min.js';
const WASM_DIR = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.20.0/dist/';
const COCO = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
const LOCAL_WEIGHTS = new URL('../cloak-lab/models/coco-ssd/model.json', import.meta.url).href;

const loaded = new Map();
function script(src) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.onload = () => res();
        s.onerror = () => {
          loaded.delete(src);
          rej(new Error(`Could not load ${src}`));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return loaded.get(src);
}

/** COCO classes the consoles care about, grouped by what they mean on a ranch or in a home. */
export const CLASS_GROUPS = Object.freeze({
  person: ['person'],
  livestock: ['sheep', 'cow', 'horse'],
  animal: ['dog', 'cat', 'bird', 'bear', 'elephant', 'zebra', 'giraffe'],
  vehicle: ['car', 'truck', 'motorcycle', 'bicycle', 'bus', 'tractor'],
  item: ['backpack', 'handbag', 'suitcase', 'bottle', 'cell phone', 'chair', 'bench', 'umbrella', 'cup', 'laptop', 'book'],
});

export function groupOf(cls) {
  for (const [g, list] of Object.entries(CLASS_GROUPS)) if (list.includes(cls)) return g;
  return 'other';
}

export class Detector {
  constructor() {
    this.model = null;
    this.backend = null;
    this.weights = null;
  }

  /**
   * Load TF.js, pick a backend and load the model.
   * @param {'webgl'|'wasm'|'cpu'} [backend]
   * @param {(msg:string)=>void} [onStatus]
   */
  async load(backend = 'webgl', onStatus = () => {}) {
    onStatus('Loading TensorFlow.js…');
    await script(TF);
    await this.setBackend(backend, onStatus);
    if (!this.model) {
      onStatus('Loading COCO-SSD weights…');
      await script(COCO);
      try {
        this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: LOCAL_WEIGHTS });
        this.weights = 'self-hosted';
      } catch {
        this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
        this.weights = 'TensorFlow CDN';
      }
    }
    onStatus(`Ready · ${this.backend} · weights from ${this.weights}`);
    return this;
  }

  /** Switch runtime backend; falls back to CPU if the requested one cannot start. */
  async setBackend(name, onStatus = () => {}) {
    const tf = window.tf;
    if (name === 'wasm') {
      onStatus('Loading the WASM backend…');
      await script(WASM);
      tf.wasm?.setWasmPaths?.(WASM_DIR);
    }
    let ok = false;
    try {
      ok = await tf.setBackend(name);
      await tf.ready();
    } catch {
      ok = false;
    }
    if (!ok) {
      await tf.setBackend('cpu');
      await tf.ready();
    }
    this.backend = tf.getBackend();
    return this.backend;
  }

  /**
   * Detect objects in a video/canvas/image.
   * @returns {Promise<{box:number[], score:number, cls:string}[]>}
   */
  async detect(source, maxBoxes = 20, minScore = 0.1) {
    if (!this.model) return [];
    const preds = await this.model.detect(source, maxBoxes, minScore);
    return preds.map((p) => ({ box: p.bbox, score: p.score, cls: p.class }));
  }
}

/** Is a camera available in this browser at all? */
export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;

/** Open the camera. Resolves to the stream; the caller owns stopping it. */
export async function openCamera(video, facingMode = 'environment') {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  for (const t of stream?.getTracks?.() ?? []) t.stop();
}
