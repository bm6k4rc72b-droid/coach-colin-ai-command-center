/**
 * Small, dependency-free statistics used everywhere in the app.
 *
 * Two commitments run through this file. First, every summary that a flag or a
 * score depends on is robust — median and MAD rather than mean and standard
 * deviation — because a single sack or a mis-solved rep should not be able to
 * redefine an athlete's normal. Second, nothing here silently invents a number:
 * functions return `null` when the sample cannot support an answer, and the UI
 * is expected to say so rather than print a figure made of two data points.
 */

/** Drop nulls, undefined and non-finite values in one pass. */
export function finite(values: readonly (number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  return out;
}

export function mean(values: readonly number[]): number | null {
  const xs = finite(values);
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const x of finite(values)) total += x;
  return total;
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values: readonly number[], q: number): number | null {
  const xs = finite(values).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0] as number;
  const clamped = Math.min(1, Math.max(0, q));
  const pos = clamped * (xs.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return (xs[lo] as number) * (1 - frac) + (xs[hi] as number) * frac;
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

/** Sample standard deviation (n − 1). Null below two observations. */
export function stdDev(values: readonly number[]): number | null {
  const xs = finite(values);
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

/** Root mean square about a stated centre — the release-scatter measure. */
export function rmsAbout(values: readonly number[], centre: number): number | null {
  const xs = finite(values);
  if (xs.length === 0) return null;
  let acc = 0;
  for (const x of xs) acc += (x - centre) ** 2;
  return Math.sqrt(acc / xs.length);
}

/**
 * Median absolute deviation, scaled by 1.4826 so that on normally distributed
 * data it estimates the same quantity as the standard deviation.
 */
export function mad(values: readonly number[]): number | null {
  const xs = finite(values);
  if (xs.length < 2) return null;
  const med = median(xs) as number;
  const dev = xs.map((x) => Math.abs(x - med));
  const m = median(dev) as number;
  return 1.4826 * m;
}

/**
 * Robust z-score of `value` against a reference sample. Returns null when the
 * sample is too small, or when its spread is zero and a z-score would be
 * infinite rather than informative.
 */
export function robustZ(value: number, reference: readonly number[]): number | null {
  const xs = finite(reference);
  if (xs.length < 8) return null;
  const med = median(xs) as number;
  const scale = mad(xs);
  if (scale === null || scale <= 1e-9) return null;
  return (value - med) / scale;
}

/** Fraction of a sample satisfying a predicate, or null on an empty sample. */
export function rate<T>(items: readonly T[], predicate: (item: T) => boolean): number | null {
  if (items.length === 0) return null;
  let hits = 0;
  for (const item of items) if (predicate(item)) hits += 1;
  return hits / items.length;
}

export interface Summary {
  n: number;
  mean: number;
  median: number;
  sd: number | null;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

/** Everything a distribution strip needs, in one pass over the data. */
export function summarize(values: readonly number[]): Summary | null {
  const xs = finite(values);
  if (xs.length === 0) return null;
  return {
    n: xs.length,
    mean: mean(xs) as number,
    median: median(xs) as number,
    sd: stdDev(xs),
    p10: quantile(xs, 0.1) as number,
    p90: quantile(xs, 0.9) as number,
    min: Math.min(...xs),
    max: Math.max(...xs),
  };
}

/**
 * Trailing simple moving average. Element i is the mean of the window ending at
 * i, so the series can be plotted against the same x-axis as the raw points
 * with no lookahead. Positions with fewer than `window` observations behind
 * them are null rather than an average of a shorter window.
 */
export function rollingMean(values: readonly number[], window: number): (number | null)[] {
  if (window < 1) throw new Error('rollingMean: window must be >= 1');
  const out: (number | null)[] = [];
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) {
    acc += values[i] as number;
    if (i >= window) acc -= values[i - window] as number;
    out.push(i >= window - 1 ? acc / window : null);
  }
  return out;
}

/** Exponentially weighted mean, `alpha` in (0, 1]. Higher alpha forgets faster. */
export function ewma(values: readonly number[], alpha: number): number[] {
  if (alpha <= 0 || alpha > 1) throw new Error('ewma: alpha must be in (0, 1]');
  const out: number[] = [];
  let state: number | null = null;
  for (const x of values) {
    state = state === null ? x : alpha * x + (1 - alpha) * state;
    out.push(state);
  }
  return out;
}

export interface LinearFit {
  /** Change in y per unit of x. */
  slope: number;
  intercept: number;
  /** Coefficient of determination, 0–1. */
  r2: number;
  n: number;
}

/** Ordinary least squares on paired samples. Null when x has no variance. */
export function linearFit(xs: readonly number[], ys: readonly number[]): LinearFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i] as number;
    sy += ys[i] as number;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx <= 1e-12) return null;
  const slope = sxy / sxx;
  const r2 = syy <= 1e-12 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2, n };
}

/**
 * Cohen's d with a pooled standard deviation — the effect size behind every
 * split in the app (clean versus pressure, early versus late, high versus low
 * load). Reported alongside the raw difference so a large gap on eight reps is
 * not mistaken for a finding.
 */
export function cohensD(a: readonly number[], b: readonly number[]): number | null {
  const xa = finite(a);
  const xb = finite(b);
  if (xa.length < 2 || xb.length < 2) return null;
  const sa = stdDev(xa) as number;
  const sb = stdDev(xb) as number;
  const pooled = Math.sqrt(
    (((xa.length - 1) * sa * sa) + ((xb.length - 1) * sb * sb)) / (xa.length + xb.length - 2),
  );
  if (pooled <= 1e-9) return null;
  return ((mean(xa) as number) - (mean(xb) as number)) / pooled;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Map a value onto 0–100 across a stated range, clamped. Used for every index
 * score in the app so the scaling is visible in one place rather than inlined
 * eight times.
 */
export function scoreFromRange(value: number, worst: number, best: number): number {
  if (Math.abs(best - worst) < 1e-9) return 50;
  return clamp(((value - worst) / (best - worst)) * 100, 0, 100);
}
