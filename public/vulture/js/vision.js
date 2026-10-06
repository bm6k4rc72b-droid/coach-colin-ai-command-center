/**
 * On-device inference with Google MediaPipe Tasks (WebAssembly + WebGL/GPU).
 *
 *   - ObjectDetector, EfficientDet-Lite0 (COCO, 80 classes) for vehicles and
 *     people — the occupancy / zone pipeline.
 *   - PoseLandmarker, BlazePose (lite or full) for 33 body landmarks with
 *     metric 3-D world coordinates — the kinetics pipeline.
 *
 * Frames never leave the device: the browser downloads the runtime and the
 * model weights once, then every frame is processed locally. The GPU delegate
 * is tried first and the CPU (WASM SIMD) delegate is the fallback.
 *
 * @module vulture/vision
 */

export const TASKS_VERSION = '1.0.1';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const MODELS = {
  detector: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
  poseLite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  poseFull: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};
export const LOT_CLASSES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person'];

let lib = null;
let fileset = null;
const tasks = { detector: null, pose: null };
const status = { detector: 'idle', pose: 'idle', delegate: { detector: null, pose: null }, error: null };
let lastTs = 0;

/** Monotonic timestamps: MediaPipe VIDEO mode rejects non-increasing ones. */
function ts() {
  const now = performance.now();
  lastTs = now > lastTs ? now : lastTs + 0.01;
  return lastTs;
}

async function loadLib() {
  if (!lib) lib = await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`);
  if (!fileset) fileset = await lib.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  return lib;
}

async function create(kind, factory) {
  status[kind] = 'loading';
  for (const delegate of ['GPU', 'CPU']) {
    try {
      tasks[kind] = await factory(delegate);
      status[kind] = 'ready';
      status.delegate[kind] = delegate;
      return tasks[kind];
    } catch (err) {
      status.error = String(err?.message ?? err);
    }
  }
  status[kind] = 'error';
  throw new Error(`${kind} failed to load: ${status.error}`);
}

/**
 * Load the object detector (idempotent).
 *
 * @param {{scoreThreshold?:number}} [o] Options.
 * @returns {Promise<object>} Detector.
 */
export async function loadDetector(o = {}) {
  if (tasks.detector) return tasks.detector;
  const { ObjectDetector } = await loadLib();
  return create('detector', (delegate) => ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODELS.detector, delegate },
    runningMode: 'VIDEO',
    scoreThreshold: o.scoreThreshold ?? 0.3,
    maxResults: 60,
    categoryAllowlist: LOT_CLASSES,
  }));
}

/**
 * Load the pose landmarker (idempotent per model).
 *
 * @param {{full?:boolean}} [o] Use the full (more accurate, slower) model.
 * @returns {Promise<object>} Landmarker.
 */
export async function loadPose(o = {}) {
  if (tasks.pose) return tasks.pose;
  const { PoseLandmarker } = await loadLib();
  return create('pose', (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: o.full ? MODELS.poseFull : MODELS.poseLite, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }));
}

/** Drop the pose model so the next load picks up a different variant. */
export function unloadPose() {
  tasks.pose?.close?.();
  tasks.pose = null;
  status.pose = 'idle';
}

/**
 * Detect vehicles and people.
 *
 * @param {HTMLCanvasElement} frame Source frame.
 * @param {number} minScore Confidence floor.
 * @returns {import('./tracker.js').Detection[]} Normalised detections.
 */
export function detect(frame, minScore = 0.3) {
  if (!tasks.detector) return [];
  const res = tasks.detector.detectForVideo(frame, ts());
  const W = frame.width; const H = frame.height;
  const out = [];
  for (const d of res.detections ?? []) {
    const c = d.categories?.[0];
    if (!c || c.score < minScore) continue;
    const b = d.boundingBox;
    out.push({ label: c.categoryName, score: c.score, x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H });
  }
  return out;
}

/**
 * Estimate the pose.
 *
 * @param {HTMLCanvasElement} frame Source frame.
 * @returns {{landmarks:object[], world:object[]|null}|null} First pose or null.
 */
export function pose(frame) {
  if (!tasks.pose) return null;
  const res = tasks.pose.detectForVideo(frame, ts());
  if (!res.landmarks?.length) return null;
  return { landmarks: res.landmarks[0], world: res.worldLandmarks?.[0] ?? null };
}

export function visionStatus() {
  return { ...status, delegate: { ...status.delegate } };
}
