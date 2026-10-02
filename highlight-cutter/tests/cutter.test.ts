import { describe, expect, it } from 'vitest';
import { DECOYS, demoAudio, drawDemo, DEMO_DURATION, MOMENTS, shotAt } from '../src/core/demo';
import { FeatureBuilder } from '../src/core/extract';
import { cutBumps, DEFAULT_PICK, DEFAULT_WEIGHTS, evaluate, merge, pick, reelLength, score, type Features } from '../src/core/highlights';
import { localMaxima, movingAverage, percentile, pool, rmsEnvelope, robustScale, toDb } from '../src/core/signal';
import { TOUR, TourRunner, type TourActions } from '../src/core/tour';
import { detectCuts, frameDiff, histDistance, histogram, luma, motionWithoutCuts } from '../src/core/vision';
import { stepFor } from '../src/media/analyze';
import { Raster } from './raster';

describe('signal', () => {
  it('RMS of a full-scale sine is 1/√2 (−3 dB)', () => {
    const sr = 8000;
    const s = new Float32Array(sr).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / sr));
    const env = rmsEnvelope(s, sr, 0.1);
    expect(env).toHaveLength(10);
    expect(env[3]).toBeCloseTo(Math.SQRT1_2, 2);
    expect(toDb(env[3])).toBeCloseTo(-3.01, 1);
  });
  it('robust scaling ignores one huge outlier', () => {
    const x = [...Array.from({ length: 99 }, (_, i) => i + 1), 100000];
    const s = robustScale(x);
    expect(s[89]).toBeGreaterThan(0.8); // min–max scaling would give 0.0009
    expect(s[99]).toBe(1);
    expect(s[0]).toBe(0);
  });
  it('helpers', () => {
    expect(movingAverage([0, 3, 0], 3)).toEqual([1.5, 1, 1.5]);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(pool([1, 1, 3, 3], 0.25, 0.5, 2)).toEqual([1, 3]);
    expect(localMaxima([0, 1, 0, 2, 2, 0, 3])).toEqual([1, 3, 4, 6]);
  });
});

describe('vision', () => {
  const flat = (v: number) => new Float32Array(100).fill(v);
  it('frame difference and histogram distance', () => {
    expect(frameDiff(flat(0), flat(255))).toBe(1);
    expect(frameDiff(flat(10), flat(10))).toBe(0);
    expect(histDistance(histogram(flat(0)), histogram(flat(255)))).toBe(1);
    expect(histDistance(histogram(flat(50)), histogram(flat(51)))).toBe(0);
  });
  it('luma uses Rec. 601 weights', () => {
    expect(luma(new Uint8ClampedArray([255, 0, 0, 255]))[0]).toBeCloseTo(76.2, 1);
  });
  it('cuts use an adaptive threshold and are removed from motion', () => {
    const d = [0.02, 0.03, 0.02, 0.9, 0.03, 0.02, 0.04, 0.02];
    const cuts = detectCuts(d);
    expect(cuts).toEqual([false, false, false, true, false, false, false, false]);
    const m = motionWithoutCuts([0.1, 0.1, 0.1, 0.8, 0.3, 0.1, 0.1, 0.1], cuts);
    expect(m[3]).toBeCloseTo(0.2, 6);
  });
});

describe('picking', () => {
  const f: Features = { step: 1, duration: 40, audio: null, motion: [], cuts: [], objects: null };
  for (let i = 0; i < 40; i++) {
    f.motion.push(i === 10 ? 1 : i === 12 ? 0.9 : i === 30 ? 0.8 : 0.01 * (i % 3));
    f.cuts.push(false);
  }
  it('dedupes nearby peaks, pads, and stops at the target', () => {
    const s = score(f, DEFAULT_WEIGHTS);
    const segs = pick(s, f, { ...DEFAULT_PICK, target: 100 });
    expect(segs.map((x) => Math.round(x.peak))).toEqual([10, 30]);
    expect(segs[0].start).toBe(7);
    const one = pick(s, f, { ...DEFAULT_PICK, target: 3 });
    expect(one).toHaveLength(1);
  });
  it('merges overlapping segments', () => {
    const m = merge([
      { start: 5, end: 9, peak: 7, score: 0.5, reasons: ['a'] },
      { start: 0, end: 6, peak: 3, score: 0.9, reasons: ['b'] },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ start: 0, end: 9, peak: 3 });
    expect(reelLength(m)).toBe(9);
  });
  it('cut bumps reach back before the cut', () => {
    expect(cutBumps([false, false, false, false, true, false, false], 1, 2, 1)).toEqual([0, 0, 1, 1, 1, 1, 0]);
  });
  it('long videos are sampled more coarsely', () => {
    expect(stepFor(60)).toBe(0.5);
    expect(stepFor(3600)).toBe(6);
  });
});

describe('demo match end to end', () => {
  const step = 0.5;
  const fb = new FeatureBuilder(step, DEMO_DURATION);
  for (let t = 0; t < DEMO_DURATION; t += step) {
    const r = new Raster(96, 54);
    drawDemo(r, 96, 54, t);
    fb.addFrame(r.px);
  }
  fb.setAudio(demoAudio(), 16000);
  const f = fb.build();
  const run = (w = DEFAULT_WEIGHTS, fu: 'sum' | 'agree' = 'agree') => evaluate(pick(score(f, w, fu), f, DEFAULT_PICK), MOMENTS, DECOYS);

  it('detects every shot change (replays and the advert) and nothing else', () => {
    const cutTimes = f.cuts.map((c, i) => (c ? i * step : -1)).filter((t) => t >= 0);
    const expected = new Set<number>();
    for (let t = step; t < DEMO_DURATION; t += step) if (shotAt(t).shot !== shotAt(t - step).shot) expected.add(t);
    expect(new Set(cutTimes)).toEqual(expected);
  });
  it('loudness alone is fooled by the advert', () => {
    expect(run({ audio: 1, motion: 0, cuts: 0, objects: 0 }, 'sum').fooledBy.map((d) => d.t0)).toContain(27);
  });
  it('motion alone is fooled by the camera pan', () => {
    expect(run({ audio: 0, motion: 1, cuts: 0, objects: 0 }, 'sum').fooledBy.map((d) => d.t0)).toContain(41);
  });
  it('a weighted sum still lets the advert through', () => {
    expect(run(DEFAULT_WEIGHTS, 'sum').fooledBy.length).toBeGreaterThan(0);
  });
  it('requiring agreement finds all five highlights with no traps', () => {
    const e = run();
    expect(e.found).toBe(5);
    expect(e.fooledBy).toHaveLength(0);
    expect(e.falsePicks).toBe(0);
  });
});

describe('tour', () => {
  it('walks every step and stops', () => {
    const calls: string[] = [];
    const a: TourActions = {
      loadDemo: () => calls.push('demo'),
      setWeights: () => calls.push('w'),
      setFusion: (f) => calls.push(`fusion:${f}`),
      setPick: () => calls.push('pick'),
      playReel: () => calls.push('reel'),
      stopPlayback: () => {},
      highlight: () => {},
    };
    const t = new TourRunner(a);
    t.start();
    for (let i = 0; i < 1000 && t.active; i++) t.update(0.5);
    expect(t.active).toBe(false);
    expect(t.index).toBe(TOUR.length);
    expect(calls).toEqual(expect.arrayContaining(['demo', 'fusion:sum', 'fusion:agree', 'reel']));
  });
});
