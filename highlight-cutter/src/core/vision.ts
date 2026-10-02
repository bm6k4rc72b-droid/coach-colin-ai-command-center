/** Classic computer-vision features on small greyscale frames. Pure and unit tested. */
import { median, percentile } from './signal';

/** RGBA pixels → luma (Rec. 601 weights), 0..255. */
export function luma(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return out;
}

/** Frame differencing: mean absolute luma change between two frames, 0..1. */
export function frameDiff(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length / 255;
}

/** Normalised luma histogram. Robust to motion, sensitive to a change of shot. */
export function histogram(l: Float32Array, bins = 32): Float32Array {
  const h = new Float32Array(bins);
  for (let i = 0; i < l.length; i++) h[Math.min(bins - 1, Math.floor((l[i] / 256) * bins))]++;
  for (let i = 0; i < bins; i++) h[i] /= l.length;
  return h;
}

/** Histogram distance: half the L1 distance, 0 (same) .. 1 (no overlap). */
export function histDistance(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / 2;
}

/**
 * Shot-boundary detection with an adaptive threshold: a cut is a histogram jump far above
 * this video's typical frame-to-frame change (median + k × spread), and above a hard floor.
 */
export function detectCuts(dist: number[], k = 4, floor = 0.3): boolean[] {
  const m = median(dist);
  const spread = Math.max(percentile(dist, 0.75) - m, 0.01);
  const thr = Math.max(floor, m + k * spread);
  return dist.map((d) => d > thr);
}

/** Motion with cuts removed: a cut changes every pixel but is not motion, so borrow the neighbours. */
export function motionWithoutCuts(diff: number[], cuts: boolean[]): number[] {
  return diff.map((d, i) => {
    if (!cuts[i]) return d;
    const n = [diff[i - 1], diff[i + 1]].filter((v, j) => v !== undefined && !cuts[i - 1 + 2 * j]);
    return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
  });
}
