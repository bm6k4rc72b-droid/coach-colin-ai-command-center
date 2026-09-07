/**
 * Separating a body from a room.
 *
 * Everything Aegis claims rests on one binary decision made about every pixel,
 * many times a second: is this the room, or is this the person in it? The two
 * ways to get it wrong are not symmetric. A missed body is a fall nobody hears
 * about. A body invented out of a curtain moving in a draught is an alarm at
 * 3 a.m. in a house where somebody is asleep, and three of those teach the
 * household to ignore the fourth.
 *
 * **Why a Gaussian model rather than a frame difference.** A frame difference
 * sees only edges of motion, so a person who lies still stops existing — which
 * is precisely the state this app must keep watching. The model here holds a
 * running mean *and* a running variance for every pixel, so a body is anything
 * far from its pixel's mean measured in that pixel's own standard deviations.
 * A corner where a television flickers has a huge variance and is therefore
 * hard to trigger; a still patch of carpet has almost none and a shin crossing
 * it is unmissable. One global threshold could never be right for both.
 *
 * **Why the variance is not allowed to learn from the body.** If the model
 * absorbed the subject it would, after a minute of them lying on the floor,
 * decide the floor has a person-shaped pattern on it and stop reporting them.
 * The caller passes a hold mask covering last frame's detections, and those
 * pixels are frozen. This is the difference between an app that notices
 * somebody is down and an app that notices for ninety seconds.
 *
 * **Why shadows get their own test.** A hard shadow is a real, large luminance
 * change, so no luminance threshold rejects it. What separates the two is that
 * a shadow scales all three colour channels by roughly one factor while an
 * object changes the ratios between them. Left in, a shadow doubles a
 * subject's apparent width, drags the lowest visible row sideways, and turns
 * somebody standing beside a lamp into somebody lying down.
 *
 * Nothing here touches a DOM, a camera or a canvas. Frames are plain
 * `{width, height, data}` records, so the whole stage runs in Node against
 * scenes whose contents are known exactly.
 *
 * @module aegis/silhouette
 */

import { clamp } from './mathkit.js';

/**
 * A per-pixel background model.
 *
 * @typedef {object} Field
 * @property {number} width Frame width in pixels.
 * @property {number} height Frame height in pixels.
 * @property {Float32Array} mean Mean luminance per pixel, 0–255.
 * @property {Float32Array} red Mean red channel.
 * @property {Float32Array} green Mean green channel.
 * @property {Float32Array} blue Mean blue channel.
 * @property {Float32Array} variance Running variance of luminance.
 * @property {number} frames How many frames have been absorbed.
 */

/** Variance floor, in luminance units squared. Below it, sensor noise wins. */
const VARIANCE_FLOOR = 9;

/** Variance ceiling, so one violent change cannot deafen a pixel for minutes. */
const VARIANCE_CEILING = 1600;

/** Chromaticity distance under which a darker pixel is called a shadow. */
const SHADOW_CHROMA = 0.055;

/** How much darker than the background a shadow may be, as a ratio. */
const SHADOW_FLOOR = 0.42;

/**
 * Luminance from an RGB triple, Rec. 601.
 *
 * @param {number} r Red, 0–255.
 * @param {number} g Green, 0–255.
 * @param {number} b Blue, 0–255.
 * @returns {number} Luminance, 0–255.
 */
export function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Create an empty background model.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {Field} A model with no frames absorbed.
 */
export function createField(width, height) {
  const n = width * height;
  return {
    width,
    height,
    mean: new Float32Array(n),
    red: new Float32Array(n),
    green: new Float32Array(n),
    blue: new Float32Array(n),
    variance: new Float32Array(n).fill(VARIANCE_FLOOR * 4),
    frames: 0,
  };
}

/**
 * Absorb a frame into the model.
 *
 * @param {Field} field The model, updated in place.
 * @param {{width: number, height: number, data: Uint8ClampedArray}} frame The frame.
 * @param {object} [options] Options.
 * @param {Uint8Array} [options.hold] Pixels to leave untouched — last frame's body.
 * @param {number} [options.rate] Learning rate, 0–1. Higher forgets faster.
 * @returns {Field} The same model.
 */
export function updateField(field, frame, options = {}) {
  const { hold = null } = options;
  // The first frames are learned almost outright: a model that creeps toward
  // an empty room from black spends its first ten seconds reporting the
  // furniture as a person.
  const rate = options.rate ?? (field.frames < 12 ? 0.35 : 0.02);
  const { data } = frame;
  const n = field.width * field.height;
  for (let i = 0; i < n; i += 1) {
    if (hold && hold[i]) continue;
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = luma(r, g, b);
    const delta = y - field.mean[i];
    field.mean[i] += delta * rate;
    field.red[i] += (r - field.red[i]) * rate;
    field.green[i] += (g - field.green[i]) * rate;
    field.blue[i] += (b - field.blue[i]) * rate;
    // Variance tracks the *squared* residual against the mean before the
    // update, which is what makes a flickering pixel expensive to trigger.
    const v = field.variance[i] + (delta * delta - field.variance[i]) * rate;
    field.variance[i] = clamp(v, VARIANCE_FLOOR, VARIANCE_CEILING);
  }
  field.frames += 1;
  return field;
}

/**
 * Decide which pixels are not the room.
 *
 * @param {Field} field The background model.
 * @param {{width: number, height: number, data: Uint8ClampedArray}} frame The frame.
 * @param {object} [options] Options.
 * @param {number} [options.sensitivity] 0–1; how many standard deviations a
 *   pixel must move. 0.5 is roughly 3.2σ.
 * @returns {{mask: Uint8Array, count: number, shadows: number}} The foreground
 *   mask, how many pixels it holds, and how many were rejected as shadow.
 */
export function segment(field, frame, options = {}) {
  const sensitivity = clamp(options.sensitivity ?? 0.5, 0, 1);
  // 5.0σ at the cautious end, 1.8σ at the eager end.
  const sigmas = 5.0 - sensitivity * 3.2;
  const { data } = frame;
  const n = field.width * field.height;
  const mask = new Uint8Array(n);
  let count = 0;
  let shadows = 0;
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = luma(r, g, b);
    const residual = y - field.mean[i];
    const threshold = sigmas * Math.sqrt(field.variance[i]);
    if (Math.abs(residual) < threshold) continue;
    // Darker than the background is the only case a shadow can be, so the
    // chromaticity test is only paid for on those pixels.
    if (residual < 0) {
      const bg = field.mean[i];
      const ratio = bg > 4 ? y / bg : 1;
      if (ratio > SHADOW_FLOOR) {
        const sum = r + g + b + 1e-6;
        const bSum = field.red[i] + field.green[i] + field.blue[i] + 1e-6;
        const dr = r / sum - field.red[i] / bSum;
        const dg = g / sum - field.green[i] / bSum;
        if (Math.hypot(dr, dg) < SHADOW_CHROMA) {
          shadows += 1;
          continue;
        }
      }
    }
    mask[i] = 1;
    count += 1;
  }
  return { mask, count, shadows };
}

/**
 * Remove speckle and close small gaps: one erosion, then two dilations.
 *
 * The asymmetry is deliberate. Eroding first kills isolated noise pixels;
 * dilating twice afterwards rejoins a body that compression noise has split
 * across a dark garment, which matters because a subject cut into two regions
 * halves their apparent height and reads as a crouch.
 *
 * @param {Uint8Array} mask The mask, not modified.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {Uint8Array} A cleaned copy.
 */
export function clean(mask, width, height) {
  let current = morph(mask, width, height, 0);
  current = morph(current, width, height, 1);
  current = morph(current, width, height, 1);
  return current;
}

/**
 * One morphological pass over the four-connected neighbourhood.
 *
 * @param {Uint8Array} mask Source mask.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {0|1} dilate 0 to erode, 1 to dilate.
 * @returns {Uint8Array} The result.
 */
function morph(mask, width, height, dilate) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const up = y > 0 ? mask[i - width] : mask[i];
      const down = y < height - 1 ? mask[i + width] : mask[i];
      const left = x > 0 ? mask[i - 1] : mask[i];
      const right = x < width - 1 ? mask[i + 1] : mask[i];
      const sum = mask[i] + up + down + left + right;
      out[i] = dilate ? (sum > 0 ? 1 : 0) : (sum === 5 ? 1 : 0);
    }
  }
  return out;
}

/**
 * A connected region of foreground.
 *
 * @typedef {object} Region
 * @property {number} area Pixel count.
 * @property {number} minX Bounding box, inclusive.
 * @property {number} minY Bounding box, inclusive.
 * @property {number} maxX Bounding box, inclusive.
 * @property {number} maxY Bounding box, inclusive.
 * @property {number} cx Centroid column.
 * @property {number} cy Centroid row.
 * @property {number} mxx Second central moment, columns.
 * @property {number} myy Second central moment, rows.
 * @property {number} mxy Second central mixed moment.
 * @property {Int32Array} rowWidths Foreground pixels per row of the box.
 */

/**
 * Find connected regions, largest first.
 *
 * Four-connected flood fill with an explicit stack: a recursive fill on a
 * 320×240 mask of one large region overflows the stack on Safari, which is
 * exactly the frame in which somebody is closest to the camera.
 *
 * @param {Uint8Array} mask A cleaned foreground mask.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} [minArea] Regions smaller than this are discarded.
 * @returns {Region[]} Regions, largest area first.
 */
export function regions(mask, width, height, minArea = 24) {
  const seen = new Uint8Array(mask.length);
  const found = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    const rows = new Map();
    while (top > 0) {
      const i = stack[top -= 1];
      const x = i % width;
      const y = (i - x) / width;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      rows.set(y, (rows.get(y) || 0) + 1);
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top] = i - 1; top += 1; }
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top] = i + 1; top += 1; }
      if (y > 0 && mask[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[top] = i - width; top += 1; }
      if (y < height - 1 && mask[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[top] = i + width; top += 1; }
    }
    if (area < minArea) continue;
    const cx = sx / area;
    const cy = sy / area;
    const rowWidths = new Int32Array(maxY - minY + 1);
    for (const [y, n] of rows) rowWidths[y - minY] = n;
    found.push({
      area,
      minX,
      minY,
      maxX,
      maxY,
      cx,
      cy,
      mxx: sxx / area - cx * cx,
      myy: syy / area - cy * cy,
      mxy: sxy / area - cx * cy,
      rowWidths,
    });
  }
  found.sort((a, b) => b.area - a.area);
  return found;
}

/**
 * Paint a hold mask over regions, so the model does not learn the subject.
 *
 * The margin matters: a body's edge pixels are a blend of body and room, and
 * absorbing those alone still etches an outline into the background that shows
 * up as a halo the moment the subject moves.
 *
 * @param {Region[]} found Regions to protect.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} [margin] Pixels of padding around each box.
 * @returns {Uint8Array} The hold mask.
 */
export function holdMask(found, width, height, margin = 3) {
  const mask = new Uint8Array(width * height);
  for (const region of found) {
    const x0 = Math.max(0, region.minX - margin);
    const x1 = Math.min(width - 1, region.maxX + margin);
    const y0 = Math.max(0, region.minY - margin);
    const y1 = Math.min(height - 1, region.maxY + margin);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}
