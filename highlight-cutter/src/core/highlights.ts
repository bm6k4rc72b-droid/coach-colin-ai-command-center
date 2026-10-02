/**
 * Turn per-step features into an excitement score, then pick, pad and merge the best moments
 * into a highlight reel. Pure and unit tested.
 */
import { clamp, localMaxima, movingAverage, robustScale } from './signal';

/** Raw features sampled every `step` seconds (index i covers time i·step). */
export interface Features {
  step: number;
  duration: number;
  /** Loudness in dB. */
  audio: number[] | null;
  /** Frame-difference motion (cuts removed). */
  motion: number[];
  cuts: boolean[];
  /** Object-detector "action" score (people + ball), when enabled. */
  objects: number[] | null;
}

export interface Weights {
  audio: number;
  motion: number;
  cuts: number;
  objects: number;
}

export const DEFAULT_WEIGHTS: Weights = { audio: 0.5, motion: 0.35, cuts: 0.15, objects: 0 };

/**
 * How features combine. 'sum' (late fusion by weighted average) lets one loud feature win alone;
 * 'agree' also multiplies by how much the features agree (their geometric mean), so a moment
 * must be loud AND busy to score highly.
 */
export type Fusion = 'sum' | 'agree';

export interface PickOptions {
  /** Target reel length (s). */
  target: number;
  /** Seconds kept before the peak (the build-up) and after it (the reaction). */
  pre: number;
  post: number;
  /** Two peaks closer than this are the same moment. */
  minGap: number;
  /** Ignore peaks scoring below this fraction of the best peak. */
  relative: number;
}

export const DEFAULT_PICK: PickOptions = { target: 30, pre: 3, post: 3, minGap: 6, relative: 0.4 };

export interface Scored {
  /** Per-step 0..1 tracks after scaling, and the combined score. */
  audio: number[];
  motion: number[];
  cuts: number[];
  objects: number[];
  score: number[];
}

/** Spread each cut into a short bump, mostly *before* it: broadcasts cut to a replay right after the action. */
export function cutBumps(cuts: boolean[], step: number, before = 4, after = 1): number[] {
  const out = cuts.map(() => 0);
  cuts.forEach((c, i) => {
    if (!c) return;
    for (let j = Math.max(0, i - Math.round(before / step)); j <= Math.min(cuts.length - 1, i + Math.round(after / step)); j++) out[j] = 1;
  });
  return out;
}

export function score(f: Features, w: Weights, fusion: Fusion = 'agree'): Scored {
  const n = f.motion.length;
  const zero = () => new Array<number>(n).fill(0);
  const audio = f.audio ? robustScale(movingAverage(f.audio, 3)) : zero();
  const motion = robustScale(movingAverage(f.motion, 3));
  const cuts = cutBumps(f.cuts, f.step);
  const objects = f.objects ? robustScale(movingAverage(f.objects, 3)) : zero();
  // Only count the weights of features we actually have.
  const wa = f.audio ? w.audio : 0;
  const wo = f.objects ? w.objects : 0;
  const total = wa + w.motion + w.cuts + wo || 1;
  const tracks: number[][] = [];
  if (wa > 0) tracks.push(audio);
  if (w.motion > 0) tracks.push(motion);
  if (wo > 0) tracks.push(objects);
  const raw = audio.map((_, i) => {
    const sum = (wa * audio[i] + w.motion * motion[i] + w.cuts * cuts[i] + wo * objects[i]) / total;
    if (fusion === 'sum' || tracks.length < 2) return sum;
    const agree = Math.pow(tracks.reduce((p, t) => p * Math.max(t[i], 0.001), 1), 1 / tracks.length);
    return sum * (0.25 + 0.75 * agree);
  });
  return { audio, motion, cuts, objects, score: movingAverage(raw, 3) };
}

export interface Segment {
  start: number;
  end: number;
  peak: number;
  score: number;
  reasons: string[];
}

function reasons(s: Scored, i: number): string[] {
  const r: string[] = [];
  if (s.audio[i] > 0.6) r.push('crowd noise');
  if (s.motion[i] > 0.6) r.push('fast motion');
  if (s.cuts[i] > 0) r.push('cut to replay');
  if (s.objects[i] > 0.6) r.push('players & ball');
  return r.length ? r : ['mild activity'];
}

/** Greedy peak picking: best peak first, skip near-duplicates, pad, stop at the target length. */
export function pick(s: Scored, f: Features, o: PickOptions): Segment[] {
  const best = Math.max(0, ...s.score);
  const peaks = localMaxima(s.score, Math.max(0.05, best * o.relative)).sort((a, b) => s.score[b] - s.score[a]);
  const chosen: Segment[] = [];
  let total = 0;
  for (const i of peaks) {
    if (total >= o.target) break;
    const t = i * f.step;
    if (chosen.some((c) => Math.abs(c.peak - t) < o.minGap)) continue;
    const seg = { start: clamp(t - o.pre, 0, f.duration), end: clamp(t + o.post, 0, f.duration), peak: t, score: s.score[i], reasons: reasons(s, i) };
    chosen.push(seg);
    total += seg.end - seg.start;
  }
  return merge(chosen);
}

/** Sort by time and join overlapping segments. */
export function merge(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of [...segs].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      if (s.score > last.score) {
        last.score = s.score;
        last.peak = s.peak;
      }
      last.reasons = [...new Set([...last.reasons, ...s.reasons])];
    } else out.push({ ...s, reasons: [...s.reasons] });
  }
  return out;
}

export const reelLength = (segs: Segment[]) => segs.reduce((a, s) => a + s.end - s.start, 0);

/** Compare picks with known moments (the demo's script): which were found, which picks were false. */
export function evaluate(segs: Segment[], truth: { t: number; label: string }[], decoys: { t0: number; t1: number; label: string }[]) {
  const found = truth.filter((m) => segs.some((s) => m.t >= s.start - 0.5 && m.t <= s.end + 0.5));
  const fooledBy = decoys.filter((d) => segs.some((s) => s.peak >= d.t0 - 1 && s.peak <= d.t1 + 1));
  const falsePicks = segs.filter((s) => !truth.some((m) => m.t >= s.start - 0.5 && m.t <= s.end + 0.5));
  return { found: found.length, total: truth.length, missed: truth.filter((m) => !found.includes(m)), fooledBy, falsePicks: falsePicks.length };
}
