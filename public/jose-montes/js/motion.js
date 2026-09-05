/**
 * Air scrolling: the maths.
 *
 * The camera watches for a hand and turns its vertical travel into scroll.
 * There is no model and no network call — a downscaled grayscale frame is
 * differenced against the previous one, the moving pixels are weighed, and
 * their centre of mass is tracked between frames. That is enough to follow a
 * hand or a finger reliably in ordinary light, and it costs a fraction of a
 * millisecond.
 *
 * The whole pipeline is pure arithmetic over typed arrays so it can be tested
 * against synthetic frames without a camera.
 *
 * @module jose-montes/motion
 */

import { clamp } from './mathkit.js';

/**
 * Reduce an RGBA frame to a small grayscale buffer.
 *
 * @param {Uint8ClampedArray} rgba Source pixels, `w * h * 4`.
 * @param {number} w Source width.
 * @param {number} h Source height.
 * @param {number} cols Destination width.
 * @param {number} rows Destination height.
 * @param {Float32Array} [out] Optional destination to reuse.
 * @returns {Float32Array} Luminance, 0–1, `cols * rows`.
 */
export function downsample(rgba, w, h, cols, rows, out = new Float32Array(cols * rows)) {
  const cellW = w / cols;
  const cellH = h / rows;
  for (let r = 0; r < rows; r += 1) {
    const y0 = Math.floor(r * cellH);
    const y1 = Math.max(Math.floor((r + 1) * cellH), y0 + 1);
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor(c * cellW);
      const x1 = Math.max(Math.floor((c + 1) * cellW), x0 + 1);
      let sum = 0;
      let n = 0;
      // Step by two on both axes: at this resolution the extra samples buy
      // nothing but time.
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          sum += (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) / 255;
          n += 1;
        }
      }
      out[r * cols + c] = n ? sum / n : 0;
    }
  }
  return out;
}

/**
 * Compare two grayscale frames and locate the movement.
 *
 * @param {Float32Array} previous Last frame.
 * @param {Float32Array} current This frame.
 * @param {number} cols Grid width.
 * @param {number} rows Grid height.
 * @param {number} [threshold] Per-cell luminance change that counts as motion.
 * @returns {{ energy: number, x: number, y: number, cells: number }}
 *   Fraction of the frame moving, and the centre of that movement in
 *   normalised coordinates (0–1, y down). `x`/`y` are −1 when nothing moved.
 */
export function motionField(previous, current, cols, rows, threshold = 0.055) {
  let weight = 0;
  let sx = 0;
  let sy = 0;
  let cells = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const delta = Math.abs(current[i] - previous[i]);
      if (delta < threshold) continue;
      // Weighting by magnitude keeps a bright moving hand from being pulled
      // off centre by faint noise elsewhere in the frame.
      const w = delta - threshold;
      weight += w;
      sx += (c + 0.5) / cols * w;
      sy += (r + 0.5) / rows * w;
      cells += 1;
    }
  }
  if (weight <= 0) return { energy: 0, x: -1, y: -1, cells: 0 };
  return {
    energy: cells / (cols * rows),
    x: sx / weight,
    y: sy / weight,
    cells,
  };
}

/**
 * A fresh tracker.
 *
 * @returns {object} Opaque state for `trackGesture`.
 */
export function createTracker() {
  return { y: -1, x: -1, velocity: 0, present: false, hold: 0, idle: 0 };
}

/**
 * Turn one motion sample into a scroll impulse.
 *
 * Three rules keep it usable rather than merely clever:
 *
 *  1. **A hand, not a flicker.** Motion has to cover a minimum share of the
 *     frame before the tracker latches, so a passing shadow does nothing.
 *  2. **A deadzone.** Travel under a few percent of the frame is ignored, so
 *     a hand held still does not creep the page.
 *  3. **Release on absence.** A short grace period, then the tracker forgets
 *     where the hand was, so the next gesture starts clean instead of
 *     teleporting the page.
 *
 * @param {object} state Tracker state, mutated in place.
 * @param {{ energy: number, y: number, x: number }} sample From `motionField`.
 * @param {number} dt Seconds since the previous sample.
 * @param {object} [options] Tuning.
 * @param {number} [options.enter] Energy needed to latch on.
 * @param {number} [options.exit] Energy below which the hand is considered gone.
 * @param {number} [options.deadzone] Ignored travel, as a fraction of frame height.
 * @param {number} [options.gain] Pixels of scroll per frame-height of travel.
 * @returns {{ present: boolean, delta: number, x: number, y: number }}
 *   Whether a hand is being tracked, and how far to scroll this frame.
 */
export function trackGesture(state, sample, dt, options = {}) {
  const {
    enter = 0.045,
    exit = 0.018,
    deadzone = 0.012,
    gain = 2100,
  } = options;

  if (sample.energy < exit) {
    state.idle += dt;
    if (state.idle > 0.4) {
      state.present = false;
      state.y = -1;
      state.x = -1;
      state.velocity = 0;
    }
    return { present: state.present, delta: 0, x: state.x, y: state.y };
  }

  state.idle = 0;
  if (!state.present) {
    if (sample.energy < enter) return { present: false, delta: 0, x: -1, y: -1 };
    // Latch without scrolling: the first frame only establishes where the
    // hand is, or the page would jump by the whole frame height.
    state.present = true;
    state.y = sample.y;
    state.x = sample.x;
    return { present: true, delta: 0, x: state.x, y: state.y };
  }

  const travel = sample.y - state.y;
  state.y = sample.y;
  state.x = sample.x;
  const magnitude = Math.abs(travel);
  if (magnitude < deadzone) return { present: true, delta: 0, x: state.x, y: state.y };

  // A hand moving down scrolls the page down, which is what everyone expects
  // from a scrollbar and the opposite of what they expect from a touchscreen.
  // The scrollbar reading wins because there is no surface being dragged.
  const signed = (travel > 0 ? magnitude - deadzone : -(magnitude - deadzone));
  const delta = clamp(signed * gain, -260, 260);
  state.velocity = delta;
  return { present: true, delta, x: state.x, y: state.y };
}
