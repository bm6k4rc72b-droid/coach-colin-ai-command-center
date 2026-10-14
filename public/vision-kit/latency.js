/**
 * A measurement-first latency harness, in the spirit of glance-speedlab: every camera
 * inference loop is broken into named stages, each timed on every frame, and reported as
 * median and p95 rather than a single flattering average.
 *
 * Stages used by the consoles: capture (grab the frame) → transport (resize/copy to the model)
 * → inference (the model itself) → scoring (tracking, rules, alerts) → full loop.
 *
 * The harness also answers glance-speedlab's batching question for a browser: asking several
 * questions of one frame in a single pass (detect once, then run every rule on the same
 * detections) versus running the pipeline once per question.
 *
 * Pure: give it timestamps; it does the statistics.
 *
 * @module vision-kit/latency
 */

export const STAGES = Object.freeze(['capture', 'transport', 'inference', 'scoring', 'loop']);

/** Quantile of a numeric array (linear interpolation). */
export function quantile(values, q) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export class LatencyHarness {
  /** @param {number} [window] samples kept per stage */
  constructor(window = 120) {
    this.window = window;
    /** @type {Record<string, number[]>} */
    this.samples = {};
    this.frames = 0;
    this.t0 = null;
    this.marks = {};
  }

  /** Start a frame. @param {number} now ms */
  begin(now) {
    this.t0 = now;
    this.last = now;
    this.marks = {};
  }

  /** Close a stage at time `now` (ms since the previous mark). */
  mark(stage, now) {
    if (this.t0 === null) return;
    this.push(stage, now - this.last);
    this.last = now;
  }

  /** End the frame: records the full loop. */
  end(now) {
    if (this.t0 === null) return;
    this.push('loop', now - this.t0);
    this.frames++;
    this.t0 = null;
  }

  push(stage, ms) {
    const a = (this.samples[stage] ??= []);
    a.push(ms);
    if (a.length > this.window) a.shift();
  }

  /** Per-stage median, p95 and mean in ms. */
  stats() {
    const out = {};
    for (const [k, v] of Object.entries(this.samples)) {
      out[k] = { median: quantile(v, 0.5), p95: quantile(v, 0.95), mean: v.reduce((a, b) => a + b, 0) / v.length, n: v.length };
    }
    return out;
  }

  /** Frames per second implied by the median full loop. */
  fps() {
    const m = quantile(this.samples.loop ?? [], 0.5);
    return m > 0 ? 1000 / m : 0;
  }
}

/** Percentage change from a to b (negative = faster). */
export const pctChange = (a, b) => (a > 0 ? ((b - a) / a) * 100 : 0);

/**
 * Batched vs sequential questions: with `q` questions per frame, sequential runs inference
 * q times; batched runs it once and only repeats the cheap scoring step.
 */
export function batchingModel(inferenceMs, scoringMs, q) {
  const sequential = q * (inferenceMs + scoringMs);
  const batched = inferenceMs + q * scoringMs;
  return { sequential, batched, speedup: batched > 0 ? sequential / batched : 1 };
}
