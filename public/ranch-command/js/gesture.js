/**
 * RANCH COMMAND — air-swipe detection.
 *
 * Turns a stream of horizontal hand positions into "next" and "previous"
 * swipes. The input is deliberately one number per frame — where the
 * fingertip (or the centre of motion) is across the camera's view, from 0 at
 * the reader's left to 1 at their right — so the same detector serves the
 * hand tracker and the motion fallback, and can be tested without a camera.
 *
 * What makes an air swipe feel good is mostly what it refuses:
 *
 * - **Jitter.** A hand held still still shakes. A One Euro filter smooths
 *   slow movement hard and fast movement barely, so resting hands go quiet
 *   while a real flick keeps its speed.
 * - **The return stroke.** Every swipe is followed by the hand coming back.
 *   Read naively, that is a swipe the other way. After a swipe the detector
 *   is disarmed until the hand slows to rest, and the opposite direction is
 *   locked out for a moment longer.
 * - **Drift.** A slow walk of the hand across the frame covers the distance
 *   but never the speed. A swipe needs both, inside a short window.
 *
 * Every threshold comes from calibration rather than a guess: the reader
 * makes a few swipes of their own and holds still once, and the thresholds
 * are set from what their hand actually did.
 *
 * @module ranch-command/gesture
 */

/* ------------------------------------------------------------- filtering */

/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): an adaptive low-pass
 * filter whose cutoff rises with speed.
 */
export class OneEuro {
  /**
   * @param {{ minCutoff?: number, beta?: number, dCutoff?: number }} [options] Filter tuning.
   */
  // beta is in cutoff-Hz per (width/s): a swipe runs at 1–3 widths a second,
  // so a beta near 1 opens the filter right up mid-swipe and leaves rest shut.
  constructor({ minCutoff = 1.2, beta = 1, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  /** Forget history. */
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  /**
   * @param {number} cutoff Cutoff frequency in Hz.
   * @param {number} dt Seconds since the last sample.
   * @returns {number} Smoothing factor.
   */
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /**
   * @param {number} value The raw sample.
   * @param {number} t Time in seconds.
   * @returns {number} The filtered value.
   */
  filter(value, t) {
    if (this.x === null || this.t === null || t <= this.t) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = t - this.t;
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

/* ------------------------------------------------------------- thresholds */

/**
 * Defaults, used until the reader calibrates. Distances are fractions of the
 * camera's width; speeds are widths per second.
 */
export const DEFAULTS = Object.freeze({
  minDistance: 0.22,
  minSpeed: 1.1,
  maxDuration: 0.55,
  restSpeed: 0.35,
  cooldown: 0.45,
  oppositeLock: 0.9,
});

/** The ranges calibration is allowed to land in, so one odd swipe cannot break it. */
const LIMITS = {
  minDistance: [0.1, 0.45],
  minSpeed: [0.5, 3],
  restSpeed: [0.12, 0.8],
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/* --------------------------------------------------------------- detector */

/**
 * The swipe detector.
 *
 * Feed it `push(x, t)` every frame, or `push(null, t)` when no hand is seen.
 * It returns `'next'`, `'prev'` or `null`.
 */
export class SwipeDetector {
  /**
   * @param {object} [thresholds] Overrides for {@link DEFAULTS}.
   * @param {{ invert?: boolean }} [options] Invert swaps which way is "next".
   */
  constructor(thresholds = {}, { invert = false } = {}) {
    this.set(thresholds);
    this.invert = invert;
    this.filterX = new OneEuro();
    this.reset();
  }

  /**
   * Replace thresholds.
   *
   * @param {object} thresholds Overrides for {@link DEFAULTS}.
   */
  set(thresholds) {
    this.thresholds = { ...DEFAULTS, ...thresholds };
  }

  /** Forget the hand. */
  reset() {
    this.samples = [];
    this.armed = true;
    this.lastSwipeAt = -Infinity;
    this.lastDirection = 0;
    this.speed = 0;
    this.filterX?.reset();
  }

  /**
   * Feed one frame.
   *
   * @param {number|null} x Hand position in [0, 1], reader's left to right, or null.
   * @param {number} t Time in seconds.
   * @returns {'next'|'prev'|null} A swipe, if this frame completed one.
   */
  push(x, t) {
    const th = this.thresholds;
    if (x === null || !Number.isFinite(x)) {
      // A hand that leaves the frame mid-stroke does not complete it, and a
      // hand that comes back starts fresh.
      this.samples = [];
      this.filterX.reset();
      this.speed = 0;
      this.armed = true;
      return null;
    }
    const fx = this.filterX.filter(x, t);
    this.samples.push({ x: fx, t });
    while (this.samples.length && t - this.samples[0].t > th.maxDuration) this.samples.shift();

    const n = this.samples.length;
    if (n >= 2) {
      const a = this.samples[n - 2];
      const b = this.samples[n - 1];
      this.speed = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    }

    // Re-arm only once the hand has come to rest after the last swipe.
    if (!this.armed) {
      if (Math.abs(this.speed) < th.restSpeed && t - this.lastSwipeAt > th.cooldown) {
        this.armed = true;
        this.samples = [{ x: fx, t }];
      }
      return null;
    }
    if (n < 3) return null;

    // Displacement over the window, measured from its extreme so a stroke
    // that wound up slightly the other way first still counts in full.
    const first = this.samples[0];
    let lo = first;
    let hi = first;
    for (const s of this.samples) {
      if (s.x < lo.x) lo = s;
      if (s.x > hi.x) hi = s;
    }
    const last = this.samples[n - 1];
    const rightward = last.x - lo.x;
    const leftward = hi.x - last.x;
    const direction = rightward >= leftward ? 1 : -1;
    const distance = Math.max(rightward, leftward);
    const peak = this.peakSpeed(direction);

    if (distance < th.minDistance || peak < th.minSpeed) return null;
    // The return stroke: the opposite of the last swipe, too soon after it.
    if (direction === -this.lastDirection && t - this.lastSwipeAt < th.oppositeLock) return null;

    this.armed = false;
    this.lastSwipeAt = t;
    this.lastDirection = direction;
    this.samples = [];
    // Moving the hand toward the reader's left pulls the next slide in, the
    // same as dragging a page on a touch screen.
    const next = direction < 0;
    return (next !== this.invert) ? 'next' : 'prev';
  }

  /**
   * Fastest frame-to-frame speed in one direction across the window.
   *
   * @param {number} direction +1 rightward, −1 leftward.
   * @returns {number} Widths per second.
   */
  peakSpeed(direction) {
    let peak = 0;
    for (let i = 1; i < this.samples.length; i += 1) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      if (b.t <= a.t) continue;
      const v = ((b.x - a.x) / (b.t - a.t)) * direction;
      if (v > peak) peak = v;
    }
    return peak;
  }
}

/* ------------------------------------------------------------ calibration */

/**
 * Measure one recorded stroke.
 *
 * @param {Array<{ x: number, t: number }>} samples Raw samples of one swipe attempt.
 * @returns {{ distance: number, peak: number, duration: number }|null} The stroke.
 */
export function measureStroke(samples) {
  const clean = samples.filter((s) => Number.isFinite(s.x));
  if (clean.length < 3) return null;
  const filter = new OneEuro();
  const smooth = clean.map((s) => ({ x: filter.filter(s.x, s.t), t: s.t }));
  let lo = smooth[0];
  let hi = smooth[0];
  for (const s of smooth) {
    if (s.x < lo.x) lo = s;
    if (s.x > hi.x) hi = s;
  }
  let peak = 0;
  for (let i = 1; i < smooth.length; i += 1) {
    const dt = smooth[i].t - smooth[i - 1].t;
    if (dt > 0) peak = Math.max(peak, Math.abs(smooth[i].x - smooth[i - 1].x) / dt);
  }
  return { distance: hi.x - lo.x, peak, duration: Math.abs(hi.t - lo.t) };
}

/**
 * Measure how much a still hand shakes.
 *
 * @param {Array<{ x: number, t: number }>} samples A second or two of a held hand.
 * @returns {number} The 90th-percentile frame speed, widths per second.
 */
export function measureRest(samples) {
  const filter = new OneEuro();
  const smooth = samples.filter((s) => Number.isFinite(s.x)).map((s) => ({ x: filter.filter(s.x, s.t), t: s.t }));
  const speeds = [];
  for (let i = 1; i < smooth.length; i += 1) {
    const dt = smooth[i].t - smooth[i - 1].t;
    if (dt > 0) speeds.push(Math.abs(smooth[i].x - smooth[i - 1].x) / dt);
  }
  if (!speeds.length) return 0;
  speeds.sort((a, b) => a - b);
  return speeds[Math.min(speeds.length - 1, Math.floor(speeds.length * 0.9))];
}

/**
 * Turn the reader's own swipes into thresholds.
 *
 * Thresholds sit at roughly half of a typical stroke — low enough that a lazy
 * swipe still counts, high enough that reaching for a coffee does not — and
 * the rest speed sits clear of the hand's measured shake.
 *
 * @param {{ strokes: Array<object>, rest: number }} recording Measured strokes and rest shake.
 * @returns {{ thresholds: object, quality: number, notes: string[] }} The calibration.
 */
export function calibrate({ strokes, rest }) {
  const good = strokes.filter(Boolean).filter((s) => s.distance > 0.05 && s.peak > 0.2);
  const notes = [];
  if (good.length < 2) {
    return { thresholds: { ...DEFAULTS }, quality: 0, notes: ['Not enough clear swipes were seen. Keep your whole hand in view and swipe a little wider.'] };
  }
  const distance = median(good.map((s) => s.distance));
  const peak = median(good.map((s) => s.peak));
  const thresholds = {
    ...DEFAULTS,
    minDistance: clamp(distance * 0.5, LIMITS.minDistance),
    minSpeed: clamp(peak * 0.45, LIMITS.minSpeed),
    restSpeed: clamp(Math.max(rest * 2.5, peak * 0.12), LIMITS.restSpeed),
  };
  // A threshold that sits below the shake would fire on a still hand.
  if (thresholds.minSpeed < thresholds.restSpeed * 1.6) {
    thresholds.minSpeed = clamp(thresholds.restSpeed * 1.6, LIMITS.minSpeed);
    notes.push('Your hand was shaky at rest, so swipes need a little more speed to count.');
  }
  const spread = Math.max(...good.map((s) => s.distance)) - Math.min(...good.map((s) => s.distance));
  const consistency = Math.max(0, 1 - spread / Math.max(distance, 0.01));
  const quality = Math.round(100 * Math.min(1, 0.4 + 0.15 * good.length) * (0.5 + 0.5 * consistency));
  if (distance < 0.25) notes.push('Your swipes were short. That works, but a wider swipe is more reliable in poor light.');
  if (!notes.length) notes.push('Clean, consistent swipes. Thresholds are set from your hand.');
  return { thresholds, quality, notes };
}

/* ---------------------------------------------------------- motion source */

/**
 * The motion fallback: where in the frame things are moving.
 *
 * Used when the hand model cannot run — gloves, a dark barn, an old phone. It
 * differences successive downsampled frames and returns the horizontal
 * centre of the pixels that changed, or null when too little moved to mean
 * anything.
 */
export class MotionCentroid {
  /**
   * @param {{ threshold?: number, minFraction?: number }} [options] Pixel change threshold and minimum moving fraction.
   */
  constructor({ threshold = 28, minFraction = 0.015 } = {}) {
    this.threshold = threshold;
    this.minFraction = minFraction;
    this.previous = null;
  }

  /**
   * @param {Uint8ClampedArray} rgba Frame pixels.
   * @param {number} width Frame width.
   * @param {number} height Frame height.
   * @param {{ mirror?: boolean }} [options] Mirror for a selfie camera.
   * @returns {number|null} The centroid in [0, 1], or null.
   */
  push(rgba, width, height, { mirror = false } = {}) {
    const n = width * height;
    const gray = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    }
    const prev = this.previous;
    this.previous = gray;
    if (!prev || prev.length !== n) return null;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      if (Math.abs(gray[i] - prev[i]) > this.threshold) {
        sum += i % width;
        count += 1;
      }
    }
    if (count < n * this.minFraction) return null;
    const x = sum / count / Math.max(1, width - 1);
    return mirror ? 1 - x : x;
  }
}
