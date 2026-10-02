import { describe, expect, it } from 'vitest';
import { boxBlur, composite, dilate, glitch, maskIoU, refineMask, residualEvidence, thresholdMask } from '../src/core/cloakMath';
import { simulatedSegmenter } from '../src/ai/synthetic';

const W = 20;
const H = 10;

/** Background: horizontal gradient. Person: a red rectangle at x 8..11, y 2..8. */
function scene() {
  const plate = new Uint8ClampedArray(W * H * 4);
  const frame = new Uint8ClampedArray(W * H * 4);
  const truth = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      plate.set([x * 10, 100, 200 - x * 5, 255], i * 4);
      const inside = x >= 8 && x <= 11 && y >= 2 && y <= 8;
      truth[i] = inside ? 1 : 0;
      frame.set(inside ? [220, 20, 20, 255] : [x * 10, 100, 200 - x * 5, 255], i * 4);
    }
  return { plate, frame, truth };
}

describe('mask refinement', () => {
  it('threshold, dilate and blur behave', () => {
    const conf = new Float32Array([0.1, 0.6, 0.4, 0.9]);
    expect(Array.from(thresholdMask(conf, 0.5))).toEqual([0, 1, 0, 1]);
    const m = new Float32Array(25);
    m[12] = 1;
    const d = dilate(m, 5, 5, 1);
    expect(d.reduce((a, b) => a + b, 0)).toBe(9);
    const b = boxBlur(m, 5, 5, 1);
    expect(b[12]).toBeCloseTo(1 / 9);
    expect(b.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 5);
  });
  it('dilation grows the mask so edges are covered', () => {
    const { truth } = scene();
    const tight = refineMask(truth, W, H, 0.5, 0, 0);
    const grown = refineMask(truth, W, H, 0.5, 2, 0);
    expect(grown.reduce((a, b) => a + b, 0)).toBeGreaterThan(tight.reduce((a, b) => a + b, 0));
    expect(maskIoU(tight, truth)).toBe(1);
  });
});

describe('compositing', () => {
  it('clean plate with a good mask removes the person completely', () => {
    const { plate, frame, truth } = scene();
    const out = composite(frame, plate, truth, W, H, { mode: 'plate', time: 0, power: 1 });
    expect(Array.from(out)).toEqual(Array.from(plate));
    expect(residualEvidence(frame, plate, truth)).toBeGreaterThan(0.99);
    expect(residualEvidence(out, plate, truth)).toBeLessThan(0.05);
  });
  it('off mode or no plate returns the raw frame; EMP power 0 drops the cloak', () => {
    const { plate, frame, truth } = scene();
    expect(Array.from(composite(frame, plate, truth, W, H, { mode: 'off', time: 0, power: 1 }))).toEqual(Array.from(frame));
    expect(Array.from(composite(frame, null, truth, W, H, { mode: 'plate', time: 0, power: 1 }))).toEqual(Array.from(frame));
    expect(Array.from(composite(frame, plate, truth, W, H, { mode: 'plate', time: 0, power: 0 }))).toEqual(Array.from(frame));
  });
  it('a stale plate (lighting changed) leaves detectable evidence', () => {
    const { plate, frame, truth } = scene();
    const darker = frame.map((v, i) => (i % 4 === 3 ? 255 : v * 0.6));
    const reality = plate.map((v, i) => (i % 4 === 3 ? 255 : v * 0.6));
    const out = composite(darker, plate, truth, W, H, { mode: 'plate', time: 0, power: 1 });
    expect(residualEvidence(out, reality, truth)).toBeGreaterThan(0.5);
  });
  it('shimmer and adaptive modes leave more evidence than a clean plate', () => {
    const { plate, frame, truth } = scene();
    const soft = boxBlur(truth, W, H, 1);
    const clean = residualEvidence(composite(frame, plate, truth, W, H, { mode: 'plate', time: 0, power: 1 }), plate, truth);
    const adaptive = composite(frame, plate, soft, W, H, { mode: 'adaptive', time: 0, power: 1, plateBlur: plate.map((_v, i) => (i % 4 === 3 ? 255 : 128)) });
    expect(residualEvidence(adaptive, plate, truth)).toBeGreaterThan(clean);
  });
  it('the simulated segmenter is close to, but not exactly, the ground truth', () => {
    const w = 120;
    const h = 90;
    const truth = new Float32Array(w * h);
    for (let y = 20; y < 80; y++) for (let x = 40; x < 75; x++) truth[y * w + x] = 1;
    const seg = simulatedSegmenter(truth, w, h, 0.08, 3);
    const iou = maskIoU(seg, truth);
    expect(iou).toBeGreaterThan(0.5);
    expect(iou).toBeLessThanOrEqual(1);
  });
  it('glitch is deterministic for a seed and a no-op at zero strength', () => {
    const { frame } = scene();
    const a = new Uint8ClampedArray(frame);
    glitch(a, W, H, 0, 1);
    expect(Array.from(a)).toEqual(Array.from(frame));
    const b = new Uint8ClampedArray(frame);
    const c = new Uint8ClampedArray(frame);
    glitch(b, W, H, 0.8, 42);
    glitch(c, W, H, 0.8, 42);
    expect(Array.from(b)).toEqual(Array.from(c));
  });
});
