/** Accumulates per-frame measurements into Features. Shared by the browser analyser and the tests. */
import type { Features } from './highlights';
import { pool, rmsEnvelope, toDb } from './signal';
import { detectCuts, frameDiff, histDistance, histogram, motionWithoutCuts } from './vision';

export class FeatureBuilder {
  private prev: Float32Array | null = null;
  private prevHist: Float32Array | null = null;
  private diff: number[] = [];
  private hist: number[] = [];
  private audio: number[] | null = null;
  objects: number[] | null = null;

  constructor(
    public step: number,
    public duration: number,
  ) {}

  /** Add the next sampled frame (greyscale luma, any fixed size). */
  addFrame(l: Float32Array): void {
    const h = histogram(l);
    this.diff.push(this.prev ? frameDiff(this.prev, l) : 0);
    this.hist.push(this.prevHist ? histDistance(this.prevHist, h) : 0);
    this.prev = l;
    this.prevHist = h;
  }

  /** Mono samples → loudness (dB) per step, measured in 50 ms windows and averaged. */
  setAudio(samples: Float32Array, sampleRate: number): void {
    const env = rmsEnvelope(samples, sampleRate, 0.05).map(toDb);
    this.audio = pool(env, 0.05, this.step, this.diff.length || Math.ceil(this.duration / this.step));
  }

  get frames(): number {
    return this.diff.length;
  }

  build(): Features {
    const cuts = detectCuts(this.hist);
    const n = this.diff.length;
    const fit = (x: number[] | null) => (x ? Array.from({ length: n }, (_, i) => x[Math.min(i, x.length - 1)] ?? 0) : null);
    return { step: this.step, duration: this.duration, audio: fit(this.audio), motion: motionWithoutCuts(this.diff, cuts), cuts, objects: fit(this.objects) };
  }
}
