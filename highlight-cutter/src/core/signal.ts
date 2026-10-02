/** Audio and time-series signal processing. Pure (no DOM, no Web Audio) and unit tested. */

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Root-mean-square loudness of each window of `hop` seconds. */
export function rmsEnvelope(samples: Float32Array, sampleRate: number, hop: number): number[] {
  const n = Math.max(1, Math.round(sampleRate * hop));
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += n) {
    let sum = 0;
    const end = Math.min(samples.length, i + n);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / (end - i)));
  }
  return out;
}

/** Amplitude → decibels relative to full scale (floored at −90 dB). */
export const toDb = (a: number) => 20 * Math.log10(Math.max(a, 3e-5));

/** Centred moving average over `w` samples (w odd works best). */
export function movingAverage(x: number[], w: number): number[] {
  const h = Math.floor(w / 2);
  return x.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = i - h; j <= i + h; j++)
      if (j >= 0 && j < x.length) {
        s += x[j];
        c++;
      }
    return s / c;
  });
}

export function percentile(x: number[], p: number): number {
  if (!x.length) return 0;
  const s = [...x].sort((a, b) => a - b);
  const i = clamp((s.length - 1) * p, 0, s.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export const median = (x: number[]) => percentile(x, 0.5);

/**
 * Robust 0..1 scaling: the median maps to 0 and the 97th percentile to 1, so a few extreme
 * samples cannot squash everything else (unlike min–max scaling).
 */
export function robustScale(x: number[]): number[] {
  const lo = median(x);
  const hi = percentile(x, 0.97);
  const span = hi - lo || 1;
  return x.map((v) => clamp((v - lo) / span, 0, 1));
}

/** Average consecutive groups so a series at `fromStep` seconds becomes one at `toStep` seconds. */
export function pool(x: number[], fromStep: number, toStep: number, length: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < length; k++) {
    const a = Math.floor((k * toStep) / fromStep);
    const b = Math.max(a + 1, Math.floor(((k + 1) * toStep) / fromStep));
    let s = 0;
    let c = 0;
    for (let i = a; i < b && i < x.length; i++) {
      s += x[i];
      c++;
    }
    out.push(c ? s / c : 0);
  }
  return out;
}

/** Indices of local maxima (≥ both neighbours, strictly > one) above `floor`. */
export function localMaxima(x: number[], floor = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < x.length; i++) {
    const l = i > 0 ? x[i - 1] : -Infinity;
    const r = i < x.length - 1 ? x[i + 1] : -Infinity;
    if (x[i] > floor && x[i] >= l && x[i] >= r && (x[i] > l || x[i] > r)) out.push(i);
  }
  return out;
}
