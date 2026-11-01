/**
 * Detection plumbing shared by the three detectors Black Optic 6 can run:
 *
 * - Open-vocabulary (type "bolt cutters, white truck, coyote"): OWL-ViT / OWLv2
 *   or Grounding DINO through transformers.js on WebGPU, falling back to WASM.
 * - Closed-set COCO (COCO-SSD, already in vision-kit, Apache-2.0).
 * - A YOLOv8-format ONNX you export yourself, decoded here (see the licence
 *   note in installs.js — Ultralytics weights and code are AGPL-3.0).
 *
 * Everything below is pure geometry so it can be tested: query parsing,
 * letterboxing, YOLO head decoding, per-class non-maximum suppression, and
 * choosing which track a typed query should lock.
 *
 * Boxes are [x, y, w, h] in frame pixels, top-left origin, the same as
 * vision-kit/bytetrack.js so detections drop straight into ByteTracker.
 *
 * @module black-optic-6/ai/detect
 */

/** The 80 COCO class names in the order YOLOv8 and COCO-SSD index them. */
export const COCO = Object.freeze([
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle',
  'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
  'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed',
  'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven',
  'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
]);

/** At most this many typed queries: each one is a text embedding per frame. */
export const MAX_QUERIES = 12;

/**
 * Split what the operator typed into detector queries.
 *
 * @param {string} text e.g. "bolt cutters, white truck, coyote".
 * @returns {string[]} Trimmed, lower-cased, de-duplicated queries.
 */
export function parseQueries(text) {
  const seen = new Set();
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    const q = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (q && q.length <= 60) seen.add(q);
    if (seen.size >= MAX_QUERIES) break;
  }
  return [...seen];
}

/** OWL-style prompts read better as "a photo of a …". */
export function promptFor(query) {
  return /^(a|an|the)\s/.test(query) ? `a photo of ${query}` : `a photo of a ${query}`;
}

/** Intersection over union of two [x, y, w, h] boxes. */
export function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Greedy per-class non-maximum suppression.
 *
 * @param {{box: number[], score: number, cls: string}[]} dets
 * @param {number} [threshold=0.5] IoU above which the weaker box is dropped.
 */
export function nms(dets, threshold = 0.5) {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const d of sorted) {
    if (kept.every((k) => k.cls !== d.cls || iou(k.box, d.box) <= threshold)) kept.push(d);
  }
  return kept;
}

/**
 * Letterbox geometry: fit a srcW×srcH frame inside size×size without
 * distortion, centred, padding the rest (YOLOv8's export convention).
 */
export function letterbox(srcW, srcH, size = 640) {
  const scale = Math.min(size / srcW, size / srcH);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  return { scale, padX: (size - w) / 2, padY: (size - h) / 2, w, h, size };
}

/**
 * Decode a YOLOv8 detection head. The ONNX export emits [1, 4 + C, N]: for each
 * of N anchors, centre-x, centre-y, width, height in letterboxed pixels, then C
 * class scores (already sigmoided; v8 has no objectness term).
 *
 * @param {Float32Array} data The output tensor's data.
 * @param {number[]} dims Its dims, [1, 4 + C, N] (or [1, N, 4 + C], detected).
 * @param {object} lb From letterbox().
 * @param {object} [options]
 * @param {number} [options.scoreThreshold=0.25]
 * @param {number} [options.iouThreshold=0.45]
 * @param {string[]} [options.labels=COCO]
 * @returns {{box: number[], score: number, cls: string, classId: number}[]}
 */
export function decodeYolo(data, dims, lb, { scoreThreshold = 0.25, iouThreshold = 0.45, labels = COCO } = {}) {
  const [, a, b] = dims;
  // Channels-first is the default export; read channels-last if that is what came out.
  const want = 4 + labels.length;
  const channelsFirst = a === want ? true : b === want ? false : a < b;
  const channels = channelsFirst ? a : b;
  const anchors = channelsFirst ? b : a;
  const at = channelsFirst ? (c, i) => data[c * anchors + i] : (c, i) => data[i * channels + c];
  const classes = channels - 4;
  const out = [];
  for (let i = 0; i < anchors; i += 1) {
    let best = -1; let score = 0;
    for (let c = 0; c < classes; c += 1) {
      const s = at(4 + c, i);
      if (s > score) { score = s; best = c; }
    }
    if (score < scoreThreshold) continue;
    const cx = (at(0, i) - lb.padX) / lb.scale;
    const cy = (at(1, i) - lb.padY) / lb.scale;
    const w = at(2, i) / lb.scale;
    const h = at(3, i) / lb.scale;
    out.push({ box: [cx - w / 2, cy - h / 2, w, h], score, classId: best, cls: labels[best] ?? `class ${best}` });
  }
  return nms(out, iouThreshold);
}

/**
 * transformers.js zero-shot / object-detection output to tracker detections.
 * Its boxes are {xmin, ymin, xmax, ymax} in input pixels (percentage=false).
 *
 * @param {{score: number, label: string, box: {xmin: number, ymin: number, xmax: number, ymax: number}}[]} results
 * @param {number} [sx=1] Scale from model-input pixels to frame pixels, x.
 * @param {number} [sy=1] Same, y.
 */
export function fromTransformers(results, sx = 1, sy = 1) {
  return (results ?? []).map((r) => ({
    box: [r.box.xmin * sx, r.box.ymin * sy, (r.box.xmax - r.box.xmin) * sx, (r.box.ymax - r.box.ymin) * sy],
    score: r.score,
    cls: String(r.label).replace(/^a photo of (a |an )?/, ''),
  }));
}

/**
 * Which track a query locks: the confirmed track of that class with the best
 * recent score, preferring the one already locked (no flicker between two
 * equally likely trucks).
 *
 * @param {{id: number, cls: string, score: number}[]} tracks Visible tracks.
 * @param {string[]} queries Lock-worthy classes.
 * @param {number|null} [current] Currently locked track id.
 * @returns {object|null}
 */
export function chooseLock(tracks, queries, current = null) {
  const wanted = new Set(queries);
  const candidates = tracks.filter((t) => wanted.has(t.cls));
  if (!candidates.length) return null;
  const held = candidates.find((t) => t.id === current);
  if (held) return held;
  return candidates.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
}
