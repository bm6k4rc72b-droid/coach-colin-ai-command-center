/**
 * Detection-pipeline tests.
 *
 * Frames are synthesized rather than photographed so the expected answer is
 * known exactly: a disc of a chosen hue on a canopy-green field must come back
 * as one cluster at the maturity that hue encodes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeFrame, sampleHue, samplePatch } from '../../public/harvest-eye/js/vision.js';
import { CROP_PROFILES, maturityFromHue, learnAnchor, stageFor } from '../../public/harvest-eye/js/crops.js';
import { hueDelta, rgbToHsv, whiteBalanceGains } from '../../public/harvest-eye/js/color.js';

const TOMATO = CROP_PROFILES.find((profile) => profile.id === 'tomato');

/**
 * Convert HSV to 8-bit RGB, for building synthetic frames.
 *
 * @param {number} h Hue in degrees.
 * @param {number} s Saturation in [0,1].
 * @param {number} v Value in [0,1].
 * @returns {[number, number, number]} RGB triple.
 */
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const table = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = table[Math.floor(h / 60) % 6];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Build a frame containing discs of given hues on a foliage-green field.
 *
 * @param {object} spec Frame spec.
 * @param {number} [spec.width=160] Frame width.
 * @param {number} [spec.height=120] Frame height.
 * @param {Array<{x:number,y:number,r:number,h:number,s?:number,v?:number}>} spec.discs Discs to draw.
 * @param {number} [spec.noise=0] Per-channel uniform noise amplitude.
 * @returns {{data:Uint8ClampedArray,width:number,height:number}} Synthetic frame.
 */
function makeFrame({ width = 160, height = 120, discs = [], noise = 0 }) {
  const data = new Uint8ClampedArray(width * height * 4);
  const bg = hsvToRgb(120, 0.55, 0.35);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      let [r, g, b] = bg;
      for (const disc of discs) {
        const dx = x - disc.x;
        const dy = y - disc.y;
        if (dx * dx + dy * dy <= disc.r * disc.r) {
          [r, g, b] = hsvToRgb(disc.h, disc.s ?? 0.8, disc.v ?? 0.75);
        }
      }
      const jitter = noise ? (Math.random() - 0.5) * noise : 0;
      data[p] = r + jitter;
      data[p + 1] = g + jitter;
      data[p + 2] = b + jitter;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

test('a red disc on foliage reads as one harvest-ready cluster', () => {
  const frame = makeFrame({ discs: [{ x: 80, y: 60, r: 22, h: 6 }] });
  const result = analyzeFrame(frame, TOMATO);
  assert.equal(result.clusters.length, 1);
  const [cluster] = result.clusters;
  assert.ok(cluster.maturity > TOMATO.harvestAt, `maturity ${cluster.maturity} should clear harvest threshold`);
  assert.equal(cluster.stage, stageFor(cluster.maturity).label);
  assert.ok(cluster.confidence > 0.5, `confidence ${cluster.confidence} should be decisive`);
  assert.equal(result.readyShare, 1);
});

test('an unripe orange disc is detected but not called ready', () => {
  const frame = makeFrame({ discs: [{ x: 80, y: 60, r: 22, h: 40 }] });
  const result = analyzeFrame(frame, TOMATO);
  assert.equal(result.clusters.length, 1);
  assert.ok(result.clusters[0].maturity < TOMATO.harvestAt);
  assert.equal(result.readyShare, 0);
});

test('bare foliage produces no detections', () => {
  const result = analyzeFrame(makeFrame({ discs: [] }), TOMATO);
  assert.equal(result.clusters.length, 0);
  assert.equal(result.meanMaturity, 0);
});

test('several fruit are separated into distinct clusters', () => {
  const frame = makeFrame({
    discs: [
      { x: 40, y: 40, r: 16, h: 8 },
      { x: 110, y: 45, r: 16, h: 20 },
      { x: 75, y: 95, r: 16, h: 50 },
    ],
  });
  const result = analyzeFrame(frame, TOMATO);
  assert.equal(result.clusters.length, 3);
  assert.ok(Math.abs(result.readyShare - 2 / 3) < 0.2);
});

test('detection survives sensor noise', () => {
  const frame = makeFrame({ discs: [{ x: 80, y: 60, r: 24, h: 8 }], noise: 26 });
  const result = analyzeFrame(frame, TOMATO);
  assert.equal(result.clusters.length, 1);
  assert.ok(result.clusters[0].maturity > TOMATO.harvestAt);
});

test('a blue object is not mistaken for fruit', () => {
  const frame = makeFrame({ discs: [{ x: 80, y: 60, r: 24, h: 220 }] });
  assert.equal(analyzeFrame(frame, TOMATO).clusters.length, 0);
});

test('maturity rises monotonically along the ripening path', () => {
  const hues = [100, 70, 50, 30, 14, 4];
  const values = hues.map((h) => maturityFromHue(TOMATO, h).m);
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] > values[i - 1], `m(${hues[i]}°) should exceed m(${hues[i - 1]}°)`);
  }
});

test('hues far from the crop path are rejected by tolerance', () => {
  assert.ok(maturityFromHue(TOMATO, 210).error > TOMATO.tolerance);
  assert.equal(maturityFromHue(TOMATO, 32).error, 0);
});

test('hue delta wraps across red', () => {
  assert.equal(hueDelta(350, 10), 20);
  assert.equal(hueDelta(10, 350), -20);
});

test('white balance neutralizes a colour cast', () => {
  const gains = whiteBalanceGains({ r: 200, g: 160, b: 120 });
  const hsv = rgbToHsv(200 * gains.r, 160 * gains.g, 120 * gains.b);
  assert.ok(hsv.s < 0.02, `corrected patch should be near-neutral, saturation was ${hsv.s}`);
});

test('white balance ignores a patch too dark to trust', () => {
  assert.deepEqual(whiteBalanceGains({ r: 3, g: 2, b: 1 }), { r: 1, g: 1, b: 1 });
});

test('a warm cast pushes fruit toward false ripeness until corrected', () => {
  const disc = [{ x: 80, y: 60, r: 24, h: 45 }];
  const frame = makeFrame({ discs: disc });
  // Simulate late-afternoon light: lift red, drop blue.
  const warm = { data: Uint8ClampedArray.from(frame.data), width: frame.width, height: frame.height };
  for (let i = 0; i < warm.data.length; i += 4) {
    warm.data[i] = Math.min(255, warm.data[i] * 1.25);
    warm.data[i + 2] = warm.data[i + 2] * 0.8;
  }
  const uncorrected = analyzeFrame(warm, TOMATO);
  const gains = whiteBalanceGains({ r: 128 * 1.25, g: 128, b: 128 * 0.8 });
  const corrected = analyzeFrame(warm, TOMATO, { gains });
  assert.ok(uncorrected.clusters.length && corrected.clusters.length);
  assert.ok(
    corrected.clusters[0].maturity < uncorrected.clusters[0].maturity,
    'calibration should walk the warm-light maturity back down',
  );
});

test('samplePatch averages the centre of the frame', () => {
  const frame = makeFrame({ discs: [{ x: 80, y: 60, r: 40, h: 0, s: 0, v: 0.8 }] });
  const patch = samplePatch(frame, 0.3);
  assert.ok(Math.abs(patch.r - patch.g) < 2 && Math.abs(patch.g - patch.b) < 2);
  assert.ok(patch.r > 190);
});

test('sampleHue reads the colour under a tap', () => {
  const frame = makeFrame({ discs: [{ x: 40, y: 40, r: 18, h: 12 }] });
  const sample = sampleHue(frame, 40, 40, 4);
  assert.ok(Math.abs(hueDelta(sample.hue, 12)) < 4);
  assert.ok(sample.saturation > 0.6);
});

test('teach mode bends the nearest anchor toward the sampled hue', () => {
  const taught = learnAnchor(TOMATO, 1, 350, 0.5);
  const ripeAnchor = taught.huePath[taught.huePath.length - 1];
  assert.ok(Math.abs(hueDelta(ripeAnchor.h, 350)) < Math.abs(hueDelta(TOMATO.huePath[5].h, 350)));
  assert.deepEqual(taught.huePath.slice(0, 5), TOMATO.huePath.slice(0, 5));
  assert.equal(TOMATO.huePath[5].h, 4, 'the shipped profile must not be mutated');
});

test('every shipped profile has a monotonic, in-range ripening path', () => {
  for (const profile of CROP_PROFILES) {
    assert.ok(profile.huePath.length >= 4, `${profile.id} needs enough anchors`);
    assert.equal(profile.huePath[0].m, 0);
    assert.equal(profile.huePath[profile.huePath.length - 1].m, 1);
    for (let i = 1; i < profile.huePath.length; i += 1) {
      assert.ok(profile.huePath[i].m > profile.huePath[i - 1].m, `${profile.id} anchors must ascend`);
    }
    assert.ok(profile.harvestAt < profile.overripeAt, `${profile.id} needs a non-empty window`);
    assert.ok(profile.cycleDays > 0);
    for (const anchor of profile.huePath) {
      assert.ok(anchor.h >= 0 && anchor.h < 360, `${profile.id} hue out of range`);
    }
  }
});
