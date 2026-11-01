/**
 * Click a sheep, keep its name: segment-anything masks and a persistent ID
 * that survives leaving one camera and turning up on another.
 *
 * What runs where, honestly. SAM 2's memory-attention video tracker is a
 * PyTorch model that needs a GPU; nothing in a browser runs it today. What
 * does run in the browser is SAM's promptable image segmenter (SlimSAM /
 * SAM-family ONNX through transformers.js): give it a click, get a mask. So
 * the console does what SAM 2 does in spirit, in two cheaper pieces:
 *
 * 1. Click → mask on the current frame (the segmenter), and every few seconds
 *    the mask is re-prompted at the tracked box's centre so it keeps its shape.
 * 2. Between re-prompts the box is carried by the console's existing trackers,
 *    and the mask's colour signature becomes the ID: when a subject appears on
 *    another feed, its signature is compared to every known ID by the
 *    Bhattacharyya coefficient and the best match above a threshold inherits
 *    the name.
 *
 * Colour re-identification is weak evidence — two white Dorper ewes look the
 * same — so every handover carries its similarity score and is badged
 * Modelled. That is also why nothing here recognises faces: a colour histogram
 * cannot, by construction.
 *
 * @module black-optic-6/ai/reid
 */

/** Hue bins × saturation bins for chromatic pixels, plus grey-level bins. */
export const HUE_BINS = 18;
export const SAT_BINS = 3;
export const GREY_BINS = 8;
export const SIGNATURE_LENGTH = HUE_BINS * SAT_BINS + GREY_BINS;

/** Saturation below which a pixel is treated as grey (white wool, black tyre). */
export const GREY_BELOW = 0.18;

/** Bhattacharyya coefficient a handover must reach. */
export const MATCH_AT = 0.86;

/**
 * Area, box and centroid of a binary mask.
 *
 * @param {ArrayLike<number>} mask width×height, non-zero = inside.
 * @returns {{area: number, box: number[]|null, centroid: number[]|null}}
 */
export function maskStats(mask, width, height) {
  let area = 0; let sx = 0; let sy = 0;
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      area += 1; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!area) return { area: 0, box: null, centroid: null };
  return { area, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], centroid: [sx / area, sy / area] };
}

/** Intersection over union of two binary masks of equal size. */
export function maskIou(a, b) {
  let inter = 0; let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i] ? 1 : 0; const q = b[i] ? 1 : 0;
    inter += p & q; union += p | q;
  }
  return union ? inter / union : 0;
}

/**
 * A normalised colour signature of the pixels under a mask (or inside a box
 * when no mask is given).
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {ArrayLike<number>|null} mask Same size as the frame, or null.
 * @param {number[]} [box] [x, y, w, h] limiting the scan.
 * @returns {Float64Array} Sums to 1 (all zeros when nothing was inside).
 */
export function signature(frame, mask, box = [0, 0, frame.width, frame.height]) {
  const hist = new Float64Array(SIGNATURE_LENGTH);
  const xa = Math.max(0, Math.floor(box[0])); const ya = Math.max(0, Math.floor(box[1]));
  const xb = Math.min(frame.width, Math.ceil(box[0] + box[2])); const yb = Math.min(frame.height, Math.ceil(box[1] + box[3]));
  let n = 0;
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) {
      const i = y * frame.width + x;
      if (mask && !mask[i]) continue;
      const r = frame.data[i * 4] / 255; const g = frame.data[i * 4 + 1] / 255; const b = frame.data[i * 4 + 2] / 255;
      const max = Math.max(r, g, b); const min = Math.min(r, g, b);
      const s = max > 0 ? (max - min) / max : 0;
      // Soft binning: each pixel is shared between its two nearest bin
      // centres, so a small lighting change moves weight instead of flipping
      // a pixel into a different bin.
      if (s < GREY_BELOW || max < 0.08) {
        const pos = Math.min(GREY_BINS - 1, Math.max(0, max * GREY_BINS - 0.5));
        const lo = Math.floor(pos); const hi = Math.min(GREY_BINS - 1, lo + 1); const t = pos - lo;
        hist[HUE_BINS * SAT_BINS + lo] += 1 - t;
        hist[HUE_BINS * SAT_BINS + hi] += t;
      } else {
        const d = max - min;
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        const hp = (h / 360) * HUE_BINS - 0.5; // circular
        const h0 = ((Math.floor(hp) % HUE_BINS) + HUE_BINS) % HUE_BINS; const h1 = (h0 + 1) % HUE_BINS; const ht = hp - Math.floor(hp);
        const sb = Math.min(SAT_BINS - 1, Math.floor(((s - GREY_BELOW) / (1 - GREY_BELOW)) * SAT_BINS));
        hist[h0 * SAT_BINS + sb] += 1 - ht;
        hist[h1 * SAT_BINS + sb] += ht;
      }
      n += 1;
    }
  }
  if (n) for (let k = 0; k < hist.length; k += 1) hist[k] /= n;
  return hist;
}

/** Bhattacharyya coefficient Σ√(pᵢqᵢ) of two normalised histograms: 1 identical, 0 disjoint. */
export function bhattacharyya(p, q) {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) s += Math.sqrt(p[i] * q[i]);
  return s;
}

/**
 * Persistent IDs across feeds.
 */
export class IdRegistry {
  constructor({ matchAt = MATCH_AT, blend = 0.2 } = {}) {
    this.matchAt = matchAt;
    this.blend = blend;
    /** @type {{id: string, label: string, signature: Float64Array, seen: Record<string, number>}[]} */
    this.ids = [];
    this.next = 1;
  }

  /**
   * Register a subject the operator clicked.
   *
   * @returns {object} The new identity.
   */
  enrol(sig, feed, label = 'subject', atMs = Date.now()) {
    const entry = { id: `BO6-${String(this.next++).padStart(3, '0')}`, label, signature: Float64Array.from(sig), seen: { [feed]: atMs } };
    this.ids.push(entry);
    return entry;
  }

  /**
   * Find the best known identity for a signature seen on some feed.
   *
   * @returns {{entry: object, similarity: number}|null} Null when nothing reaches the threshold.
   */
  match(sig, feed, atMs = Date.now()) {
    let best = null;
    for (const entry of this.ids) {
      const similarity = bhattacharyya(entry.signature, sig);
      if (!best || similarity > best.similarity) best = { entry, similarity };
    }
    if (!best || best.similarity < this.matchAt) return null;
    // Let the stored signature drift slowly toward new views (light changes).
    const s = best.entry.signature;
    for (let k = 0; k < s.length; k += 1) s[k] = (1 - this.blend) * s[k] + this.blend * sig[k];
    best.entry.seen[feed] = atMs;
    return best;
  }
}

/**
 * Pick the best of SAM's (usually three) proposed masks by its own IoU estimate.
 *
 * @param {number[]} scores Predicted IoU per mask.
 * @returns {number} Index of the mask to use.
 */
export function bestMask(scores) {
  let k = 0;
  for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[k]) k = i;
  return k;
}
