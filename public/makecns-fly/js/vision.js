/**
 * The one camera — palm openness from pixels, with its own confidence.
 *
 * The demonstration's input is a single webcam watching a hand. This module does
 * the same job, and it is the crudest thing in the app on purpose: skin-tone
 * segmentation in YCbCr, then two shape statistics. There is no hand model, no
 * landmark network and no machine learning of any kind, because a dependency
 * that must be downloaded is a dependency that will not be there when someone
 * opens this offline, and because a gesture estimator that cannot be read in one
 * sitting cannot be audited.
 *
 * The cost of that choice is accuracy, and the module states the cost rather
 * than hiding it. Skin-tone segmentation fails on unusual lighting, on a
 * skin-coloured background, on a wall lit warm, and it has a long documented
 * history of working less well for some skin tones than others. So every reading
 * carries a `confidence`, the tracker refuses to update the control value when
 * confidence is low, and the app shows the mask it is actually using rather than
 * asking anyone to take its word. Calibration is two button presses — closed
 * fist, open palm — because a fixed threshold is a promise this method cannot
 * keep across two rooms.
 *
 * Openness is estimated from two cues that move in opposite directions as a hand
 * opens:
 *
 *   - **Fill ratio.** A fist nearly fills its bounding box; a spread hand does
 *     not, because the gaps between fingers are background.
 *   - **Scanline runs.** A horizontal line across a spread hand crosses several
 *     separate patches of skin. Across a fist it crosses one.
 *
 * Neither is reliable alone. Together they are good enough for a one-dimensional
 * control, which is all that is being asked.
 *
 * @module makecns-fly/vision
 */

/** Segmentation and estimator constants. */
export const DEFAULT_VISION = Object.freeze({
  /** YCbCr skin-tone window. Wide, because a narrow one fails on whole rooms. */
  cbMin: 77,
  cbMax: 132,
  crMin: 133,
  crMax: 177,
  /** Minimum luma — excludes deep shadow, where chroma is meaningless. */
  lumaMin: 40,
  /** Fraction of the frame a blob must cover to be treated as a hand. */
  minAreaFraction: 0.012,
  maxAreaFraction: 0.65,
  /** Smoothing on the control value, 0 (none) to 1 (frozen). */
  smoothing: 0.72,
  /** Confidence below which the reading is discarded rather than used. */
  confidenceFloor: 0.35,
});

/**
 * Classify pixels as skin or not, in YCbCr.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame Image data.
 * @param {object} [options] Overrides for {@link DEFAULT_VISION}.
 * @returns {{mask: Uint8Array, width: number, height: number, area: number}} Binary mask.
 */
export function skinMask(frame, options = {}) {
  const o = { ...DEFAULT_VISION, ...options };
  const { data, width, height } = frame;
  const mask = new Uint8Array(width * height);
  let area = 0;
  for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < o.lumaMin) continue;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb >= o.cbMin && cb <= o.cbMax && cr >= o.crMin && cr <= o.crMax) {
      mask[i] = 1;
      area += 1;
    }
  }
  return { mask, width, height, area };
}

/**
 * Shape statistics of the largest skin region.
 *
 * The "largest region" here is the bounding box of all skin pixels rather than a
 * connected-component analysis, which is a real limitation: a face in frame is
 * skin too, and will be included. The app's answer is to tell the user to keep
 * their face out of shot and to show them the mask so they can see whether it is.
 * That is a worse answer than segmenting properly and an honest one.
 *
 * @param {{mask: Uint8Array, width: number, height: number, area: number}} masked Output of {@link skinMask}.
 * @returns {object} Bounding box, fill ratio, scanline-run statistics and confidence.
 */
export function handMetrics(masked, options = {}) {
  const o = { ...DEFAULT_VISION, ...options };
  const { mask, width, height, area } = masked;
  const frameArea = width * height;
  const fraction = area / frameArea;
  if (fraction < o.minAreaFraction || fraction > o.maxAreaFraction) {
    return {
      found: false,
      reason: fraction < o.minAreaFraction ? 'no skin-coloured region large enough' : 'skin colour fills too much of the frame',
      areaFraction: fraction,
      confidence: 0,
      fillRatio: 0,
      maxRuns: 0,
      openness: null,
      box: null,
    };
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!mask[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const fillRatio = area / (boxW * boxH);

  // Scanline runs, counted across the upper half of the box where fingers are.
  let maxRuns = 0;
  let runSum = 0;
  let rows = 0;
  const from = minY;
  const to = minY + Math.max(1, Math.floor(boxH * 0.55));
  for (let y = from; y < to && y < height; y += 1) {
    const row = y * width;
    let runs = 0;
    let inside = false;
    let runLength = 0;
    for (let x = minX; x <= maxX; x += 1) {
      const on = mask[row + x] === 1;
      if (on && !inside) {
        inside = true;
        runLength = 1;
      } else if (on) {
        runLength += 1;
      } else if (inside) {
        // Ignore specks — a two-pixel run is noise, not a finger.
        if (runLength >= Math.max(2, boxW * 0.04)) runs += 1;
        inside = false;
      }
    }
    if (inside && runLength >= Math.max(2, boxW * 0.04)) runs += 1;
    maxRuns = Math.max(maxRuns, runs);
    runSum += runs;
    rows += 1;
  }
  const meanRuns = rows ? runSum / rows : 0;

  // Two cues, averaged. Both are normalised to [0, 1] against ranges that a
  // hand actually occupies; calibration in PalmTracker rescales from there.
  const fillCue = clamp01((0.92 - fillRatio) / 0.5);
  const runCue = clamp01((meanRuns - 1) / 3);
  const openness = 0.5 * fillCue + 0.5 * runCue;

  // Confidence falls off when the region is an implausible shape for a hand —
  // very wide and flat is usually a face, an arm, or a warm-coloured wall.
  const aspect = boxW / boxH;
  const aspectPenalty = aspect > 2.2 || aspect < 0.35 ? 0.35 : 1;
  const sizePenalty = fraction > 0.4 ? 0.5 : 1;
  const confidence = clamp01(aspectPenalty * sizePenalty * Math.min(1, fraction / 0.05));

  return {
    found: true,
    reason: null,
    areaFraction: fraction,
    box: { x: minX, y: minY, width: boxW, height: boxH },
    fillRatio,
    maxRuns,
    meanRuns,
    openness,
    confidence,
  };
}

/** Clamp to the unit interval. */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Turns a stream of frames into one smoothed, calibrated control value.
 *
 * Holds its last good value when the hand is lost rather than dropping to zero,
 * because a control that slams to zero when a camera blinks is a control that
 * drops the aircraft. How long it has been holding is reported, so the app can
 * say "stale for 1.4 s" instead of showing a confident number that is 1.4 s old.
 */
export class PalmTracker {
  /** @param {object} [options] Overrides for {@link DEFAULT_VISION}. */
  constructor(options = {}) {
    this.options = { ...DEFAULT_VISION, ...options };
    this.calibration = { closed: 0.15, open: 0.72, calibrated: false };
    this.value = 0.3;
    this.rawValue = 0.3;
    this.confidence = 0;
    this.staleMs = 0;
    this.lastMetrics = null;
  }

  /**
   * Record the current reading as one end of the range.
   *
   * @param {'closed'|'open'} which Which end.
   * @returns {boolean} Whether the reading was usable.
   */
  calibrate(which) {
    if (!this.lastMetrics?.found) return false;
    this.calibration[which] = this.lastMetrics.openness;
    this.calibration.calibrated = Math.abs(this.calibration.open - this.calibration.closed) > 0.06;
    return true;
  }

  /** Return to the uncalibrated default range. */
  resetCalibration() {
    this.calibration = { closed: 0.15, open: 0.72, calibrated: false };
  }

  /**
   * Fold one frame's metrics into the control value.
   *
   * @param {object} metrics Output of {@link handMetrics}.
   * @param {number} dtMs Milliseconds since the previous frame.
   * @returns {{value: number, confidence: number, stale: boolean, staleMs: number}} Control state.
   */
  update(metrics, dtMs = 33) {
    this.lastMetrics = metrics;
    this.confidence = metrics.confidence ?? 0;
    if (!metrics.found || this.confidence < this.options.confidenceFloor) {
      this.staleMs += dtMs;
      return { value: this.value, confidence: this.confidence, stale: true, staleMs: this.staleMs };
    }
    this.staleMs = 0;
    const { closed, open } = this.calibration;
    const span = open - closed;
    this.rawValue = clamp01(Math.abs(span) < 1e-6 ? metrics.openness : (metrics.openness - closed) / span);
    const a = this.options.smoothing;
    this.value = a * this.value + (1 - a) * this.rawValue;
    return { value: this.value, confidence: this.confidence, stale: false, staleMs: 0 };
  }

  /** @returns {boolean} Whether the reading is old enough to be worth disregarding. */
  get stale() {
    return this.staleMs > 400;
  }
}
