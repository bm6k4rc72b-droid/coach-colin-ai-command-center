/**
 * Unit tests for the PULSE signal-processing core.
 *
 * The core ships under `public/pulse/` so the app runs from a static host
 * with no build step; these tests import that same file, so what is tested is
 * exactly what the browser loads.
 *
 * @module vitals/vitalsCore.test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANALYSIS_HZ,
  analyzeBuffer,
  assessQuality,
  bandpass,
  classifyRate,
  createRateTracker,
  createSampleBuffer,
  detectPeaks,
  detrend,
  estimateRate,
  fftInPlace,
  frameMotion,
  intervalStats,
  isSkinPixel,
  meanRgbInRegion,
  movingAverage,
  nextPowerOfTwo,
  posProject,
  powerSpectrum,
  pulseSignal,
  resampleUniform,
  roiForMode,
  standardize,
  stdDev,
  weightedMedian,
} from '../../public/pulse/vitals-core.js';

/** Deterministic uniform noise in [-1, 1] so failures are reproducible. */
function makeNoise(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/**
 * Synthesise a skin-reflectance RGB trace: a shared illumination wander
 * multiplying all three channels, plus a blood-volume pulse whose per-channel
 * amplitudes follow the usual green-dominant signature.
 */
function syntheticSkinTrace({
  bpm = 72,
  seconds = 20,
  fs = ANALYSIS_HZ,
  pulseAmplitude = 0.01,
  noiseAmplitude = 0.4,
  seed = 7,
} = {}) {
  const noise = makeNoise(seed);
  const n = Math.round(seconds * fs);
  const base = [140, 110, 100];
  const bvp = [0.33, 0.77, 0.53];
  const t = new Float64Array(n);
  const r = new Float64Array(n);
  const g = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const time = i / fs;
    const pulse = Math.sin(2 * Math.PI * (bpm / 60) * time);
    // Slow illumination wander well below the pulse band, shared by channels.
    const illumination = 1 + 0.12 * Math.sin(2 * Math.PI * 0.13 * time) + 0.05 * Math.sin(2 * Math.PI * 0.31 * time);
    t[i] = time;
    r[i] = base[0] * illumination * (1 + bvp[0] * pulseAmplitude * pulse) + noise() * noiseAmplitude;
    g[i] = base[1] * illumination * (1 + bvp[1] * pulseAmplitude * pulse) + noise() * noiseAmplitude;
    b[i] = base[2] * illumination * (1 + bvp[2] * pulseAmplitude * pulse) + noise() * noiseAmplitude;
  }
  return { t, r, g, b };
}

/* -- resampling and detrending --------------------------------------------- */

test('resampleUniform interpolates an irregular series onto a fixed grid', () => {
  const t = [0, 0.5, 1.5, 2];
  const v = [0, 5, 15, 20];
  const out = resampleUniform(t, v, 2);
  assert.equal(out.length, 5); // 0, 0.5, 1.0, 1.5, 2.0
  assert.ok(Math.abs(out[0] - 0) < 1e-9);
  assert.ok(Math.abs(out[2] - 10) < 1e-9);
  assert.ok(Math.abs(out[4] - 20) < 1e-9);
});

test('resampleUniform tolerates degenerate inputs', () => {
  assert.equal(resampleUniform([], [], 30).length, 0);
  assert.deepEqual(Array.from(resampleUniform([1], [4], 30)), [4]);
});

test('movingAverage preserves length and flattens a constant series', () => {
  const out = movingAverage(new Float64Array(20).fill(3), 5);
  assert.equal(out.length, 20);
  for (const value of out) assert.ok(Math.abs(value - 3) < 1e-12);
});

test('detrend removes a linear ramp but keeps the oscillation', () => {
  const fs = 30;
  const n = fs * 10;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) x[i] = 0.5 * (i / fs) + Math.sin(2 * Math.PI * 1.2 * (i / fs));
  const out = detrend(x, fs * 2);
  const half = Math.floor(n / 2);
  const firstHalfMean = out.subarray(0, half).reduce((a, v) => a + v, 0) / half;
  const secondHalfMean = out.subarray(half).reduce((a, v) => a + v, 0) / (n - half);
  assert.ok(Math.abs(firstHalfMean - secondHalfMean) < 0.2, 'drift should be gone');
  assert.ok(stdDev(out) > 0.5, 'oscillation should survive');
});

test('standardize yields zero mean and unit variance', () => {
  const out = standardize(Float64Array.from([1, 2, 3, 4, 5]));
  assert.ok(Math.abs(out.reduce((a, v) => a + v, 0)) < 1e-12);
  assert.ok(Math.abs(stdDev(out) - 1) < 1e-12);
});

/* -- spectral machinery ---------------------------------------------------- */

test('nextPowerOfTwo rounds up', () => {
  assert.equal(nextPowerOfTwo(1), 1);
  assert.equal(nextPowerOfTwo(5), 8);
  assert.equal(nextPowerOfTwo(1024), 1024);
});

test('fftInPlace matches a naive DFT', () => {
  const n = 16;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const noise = makeNoise(3);
  const input = Array.from({ length: n }, () => noise());
  re.set(input);
  const expected = [];
  for (let k = 0; k < n; k += 1) {
    let sumRe = 0;
    let sumIm = 0;
    for (let j = 0; j < n; j += 1) {
      const ang = (-2 * Math.PI * k * j) / n;
      sumRe += input[j] * Math.cos(ang);
      sumIm += input[j] * Math.sin(ang);
    }
    expected.push([sumRe, sumIm]);
  }
  fftInPlace(re, im);
  for (let k = 0; k < n; k += 1) {
    assert.ok(Math.abs(re[k] - expected[k][0]) < 1e-9, `real bin ${k}`);
    assert.ok(Math.abs(im[k] - expected[k][1]) < 1e-9, `imag bin ${k}`);
  }
});

test('fftInPlace rejects non power-of-two lengths', () => {
  assert.throws(() => fftInPlace(new Float64Array(6), new Float64Array(6)), /power of two/);
});

test('powerSpectrum peaks at the synthesised frequency', () => {
  const fs = 30;
  const n = fs * 10;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) x[i] = Math.sin(2 * Math.PI * 1.5 * (i / fs));
  const { freqs, power } = powerSpectrum(x, fs);
  let peak = 0;
  for (let i = 1; i < power.length; i += 1) if (power[i] > power[peak]) peak = i;
  assert.ok(Math.abs(freqs[peak] - 1.5) < 0.05, `peak at ${freqs[peak]} Hz`);
});

test('bandpass keeps in-band content and rejects out-of-band content', () => {
  const fs = 30;
  const n = fs * 12;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const time = i / fs;
    x[i] = Math.sin(2 * Math.PI * 1.2 * time) + 2 * Math.sin(2 * Math.PI * 0.1 * time) + 1.5 * Math.sin(2 * Math.PI * 8 * time);
  }
  const filtered = bandpass(x, fs, 0.7, 4);
  const { freqs, power } = powerSpectrum(filtered, fs);
  const powerNear = (hz) => {
    let best = 0;
    for (let i = 0; i < freqs.length; i += 1) if (Math.abs(freqs[i] - hz) < 0.1) best = Math.max(best, power[i]);
    return best;
  };
  assert.ok(powerNear(1.2) > 50 * powerNear(0.1), 'drift suppressed');
  assert.ok(powerNear(1.2) > 50 * powerNear(8), 'high-frequency noise suppressed');
});

/* -- rate estimation ------------------------------------------------------- */

test('estimateRate recovers a clean 72 bpm oscillation with high confidence', () => {
  const fs = 30;
  const n = fs * 15;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) x[i] = Math.sin(2 * Math.PI * 1.2 * (i / fs));
  const result = estimateRate(x, fs);
  assert.ok(result, 'estimate produced');
  assert.ok(Math.abs(result.bpm - 72) < 1, `bpm was ${result.bpm}`);
  assert.ok(result.confidence > 0.8, `confidence was ${result.confidence}`);
});

test('estimateRate reports low confidence for broadband noise', () => {
  const noise = makeNoise(11);
  const x = new Float64Array(30 * 15);
  for (let i = 0; i < x.length; i += 1) x[i] = noise();
  const result = estimateRate(x, 30);
  assert.ok(result, 'estimate produced');
  assert.ok(result.confidence < 0.45, `confidence was ${result.confidence}`);
});

test('estimateRate keeps its peak inside the configured band', () => {
  const fs = 30;
  const n = fs * 15;
  const x = new Float64Array(n);
  // 300 bpm (5 Hz) is above the band; the estimator must not report it.
  for (let i = 0; i < n; i += 1) x[i] = Math.sin(2 * Math.PI * 5 * (i / fs));
  const result = estimateRate(x, fs, { minBpm: 42, maxBpm: 240 });
  assert.ok(result.bpm >= 42 && result.bpm <= 240, `bpm was ${result.bpm}`);
});

test('estimateRate returns null when there is not enough signal', () => {
  assert.equal(estimateRate(new Float64Array(3), 30), null);
});

/* -- chrominance projection ------------------------------------------------ */

test('posProject recovers the pulse through shared illumination wander', () => {
  const fs = ANALYSIS_HZ;
  const { r, g, b } = syntheticSkinTrace({ bpm: 66, seconds: 20, fs });
  const signal = posProject(r, g, b, fs);
  const result = estimateRate(signal, fs);
  assert.ok(Math.abs(result.bpm - 66) < 2.5, `bpm was ${result.bpm}`);
  assert.ok(result.confidence > 0.5, `confidence was ${result.confidence}`);
});

test('pulseSignal inverts the finger-mode red channel', () => {
  const fs = 30;
  const n = fs * 10;
  const r = new Float64Array(n);
  for (let i = 0; i < n; i += 1) r[i] = 200 - 5 * Math.sin(2 * Math.PI * 1.1 * (i / fs));
  const signal = pulseSignal({ r, g: r, b: r }, fs, 'finger');
  const result = estimateRate(signal, fs);
  assert.ok(Math.abs(result.bpm - 66) < 2, `bpm was ${result.bpm}`);
  // Absorption dips the red channel on each systole, so the displayed trace
  // must be flipped to put the upstroke on top.
  const raw = detrend(r, fs);
  let opposed = 0;
  for (let i = 0; i < n; i += 1) if (Math.sign(signal[i]) === -Math.sign(raw[i])) opposed += 1;
  assert.ok(opposed > n * 0.9, 'finger waveform should be the negated red trace');
});

/* -- temporal tracking ----------------------------------------------------- */

test('weightedMedian favours the heavier cluster', () => {
  assert.equal(weightedMedian([60, 70, 140], [1, 1, 0.05]), 70);
  assert.equal(weightedMedian([10], [1]), 10);
  assert.ok(Number.isNaN(weightedMedian([], [])));
});

test('rate tracker discards low-confidence estimates and harmonic slips', () => {
  const tracker = createRateTracker({ windowSeconds: 10, minConfidence: 0.4 });
  assert.equal(tracker.push(0, 72, 0.2), false, 'low confidence rejected');
  for (let i = 0; i < 8; i += 1) tracker.push(i, 72 + (i % 2 ? 1 : -1), 0.8);
  tracker.push(8, 144, 0.45); // a doubled peak sneaking past the threshold
  const value = tracker.value();
  assert.ok(Math.abs(value.bpm - 72) <= 1, `bpm was ${value.bpm}`);
  assert.equal(value.samples, 9);
});

test('rate tracker forgets estimates older than its window', () => {
  const tracker = createRateTracker({ windowSeconds: 5, minConfidence: 0.1 });
  tracker.push(0, 60, 0.9);
  tracker.push(20, 90, 0.9);
  const value = tracker.value();
  assert.equal(value.samples, 1);
  assert.equal(value.bpm, 90);
  tracker.clear();
  assert.equal(tracker.value(), null);
});

test('rate tracker stability falls as estimates scatter', () => {
  const steady = createRateTracker({ minConfidence: 0.1 });
  const jittery = createRateTracker({ minConfidence: 0.1 });
  for (let i = 0; i < 6; i += 1) {
    steady.push(i, 70 + (i % 2), 0.9);
    jittery.push(i, 70 + i * 6, 0.9);
  }
  assert.ok(steady.value().stability > jittery.value().stability);
});

/* -- beats and variability ------------------------------------------------- */

test('detectPeaks and intervalStats recover the beat interval', () => {
  const fs = 30;
  const n = fs * 12;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) x[i] = Math.sin(2 * Math.PI * 1.25 * (i / fs));
  const peaks = detectPeaks(x, fs);
  assert.ok(peaks.length >= 12, `found ${peaks.length} peaks`);
  const stats = intervalStats(peaks, fs);
  assert.ok(Math.abs(stats.bpm - 75) < 3, `interval bpm was ${stats.bpm}`);
  assert.ok(stats.sdnn < 40, `sdnn was ${stats.sdnn}`);
});

test('intervalStats needs at least three beats', () => {
  assert.equal(intervalStats([10, 40], 30), null);
});

/* -- frame analysis -------------------------------------------------------- */

/** Build a flat ImageData-like buffer of one colour. */
function solidImage(width, height, [r, g, b]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

test('isSkinPixel accepts skin-like colours and rejects obvious non-skin', () => {
  assert.ok(isSkinPixel(200, 150, 130), 'light skin');
  assert.ok(isSkinPixel(120, 80, 60), 'deep skin');
  assert.ok(!isSkinPixel(40, 90, 200), 'blue shirt');
  assert.ok(!isSkinPixel(10, 10, 10), 'shadow');
});

test('meanRgbInRegion averages only the requested rectangle', () => {
  const image = solidImage(20, 20, [200, 150, 130]);
  // Paint the left half blue; the ROI on the right must not see it.
  for (let y = 0; y < 20; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const i = (y * 20 + x) * 4;
      image.data[i] = 20; image.data[i + 1] = 40; image.data[i + 2] = 220;
    }
  }
  const stats = meanRgbInRegion(image, { x: 10, y: 0, width: 10, height: 20 });
  assert.ok(Math.abs(stats.r - 200) < 1e-6);
  assert.ok(Math.abs(stats.g - 150) < 1e-6);
  assert.equal(stats.skinFraction, 1);
});

test('meanRgbInRegion falls back to all pixels when the skin rule rejects the region', () => {
  const image = solidImage(10, 10, [30, 60, 210]);
  const stats = meanRgbInRegion(image, { x: 0, y: 0, width: 10, height: 10 });
  assert.equal(stats.skinFraction, 0);
  assert.ok(Math.abs(stats.b - 210) < 1e-6, 'still reports a mean');
});

test('meanRgbInRegion reports clipping and clamps to frame bounds', () => {
  const image = solidImage(8, 8, [255, 255, 255]);
  const stats = meanRgbInRegion(image, { x: -20, y: -20, width: 200, height: 200 });
  assert.equal(stats.clippedFraction, 1);
  assert.equal(stats.pixels, 64);
});

test('meanRgbInRegion returns zeros for an empty rectangle', () => {
  const stats = meanRgbInRegion(solidImage(4, 4, [10, 10, 10]), { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(stats.pixels, 0);
  assert.equal(stats.brightness, 0);
});

test('frameMotion is zero for identical frames and rises with change', () => {
  const a = Float64Array.from([10, 20, 30, 40]);
  assert.equal(frameMotion(a, a), 0);
  assert.equal(frameMotion(null, a), 0);
  assert.ok(frameMotion(a, Float64Array.from([10, 20, 30, 200])) > 0);
  assert.ok(frameMotion(Float64Array.from([0, 0]), a) === 0, 'mismatched lengths ignored');
});

test('assessQuality names the dominant problem', () => {
  assert.match(assessQuality({ brightness: 10, mode: 'face' }).hint, /dark/i);
  assert.match(assessQuality({ brightness: 250, clippedFraction: 0.5 }).hint, /overexposed/i);
  assert.match(assessQuality({ brightness: 120, motion: 0.2 }).hint, /movement|moving/i);
  assert.match(assessQuality({ brightness: 120, skinFraction: 0.01 }).hint, /face/i);
  assert.equal(assessQuality({ brightness: 130, motion: 0.001, skinFraction: 0.8, snrDb: 12 }).level, 'good');
  assert.equal(assessQuality({ brightness: 10 }).level, 'poor');
});

test('roiForMode targets the forehead when a face box is supplied', () => {
  const withFace = roiForMode('face', 640, 480, { x: 200, y: 100, width: 200, height: 240 });
  assert.equal(withFace.x, 250);
  assert.ok(withFace.y > 100 && withFace.y < 160, 'sits at the top of the face box');
  assert.ok(withFace.height < 240 * 0.3, 'forehead band, not the whole face');

  const fallback = roiForMode('face', 640, 480);
  assert.ok(fallback.x > 0 && fallback.x + fallback.width <= 640);

  const finger = roiForMode('finger', 640, 480);
  assert.equal(finger.width, 320);
  assert.equal(finger.height, 240);
});

test('classifyRate describes the reading without diagnosing', () => {
  assert.equal(classifyRate(45).tone, 'low');
  assert.equal(classifyRate(72).tone, 'normal');
  assert.equal(classifyRate(130).tone, 'high');
  assert.equal(classifyRate(Number.NaN).label, 'no reading');
});

/* -- end to end ------------------------------------------------------------ */

test('sample buffer keeps a chronological window at capacity', () => {
  const buffer = createSampleBuffer(4);
  for (let i = 0; i < 7; i += 1) buffer.push({ t: i, r: i, g: i, b: i });
  assert.equal(buffer.size(), 4);
  assert.deepEqual(Array.from(buffer.series().t), [3, 4, 5, 6]);
  assert.equal(buffer.spanSeconds(), 3);
  buffer.clear();
  assert.equal(buffer.size(), 0);
  assert.equal(buffer.spanSeconds(), 0);
});

test('analyzeBuffer reports acquiring until the window fills', () => {
  const buffer = createSampleBuffer(600);
  for (let i = 0; i < 60; i += 1) buffer.push({ t: i / 30, r: 140, g: 110, b: 100 });
  const result = analyzeBuffer(buffer);
  assert.equal(result.status, 'acquiring');
  assert.ok(result.progress > 0 && result.progress < 1);
});

test('analyzeBuffer estimates a plausible rate from jittered camera frames', () => {
  const fs = ANALYSIS_HZ;
  const trace = syntheticSkinTrace({ bpm: 78, seconds: 20, fs });
  const jitter = makeNoise(23);
  const buffer = createSampleBuffer(2000);
  for (let i = 0; i < trace.t.length; i += 1) {
    // Real capture timestamps wobble by a few milliseconds per frame.
    buffer.push({
      t: trace.t[i] + jitter() * 0.004,
      r: trace.r[i],
      g: trace.g[i],
      b: trace.b[i],
      motion: 0.005,
      brightness: 120,
    });
  }
  const result = analyzeBuffer(buffer, { mode: 'face', fs });
  assert.equal(result.status, 'ready');
  assert.ok(Math.abs(result.bpm - 78) < 3, `bpm was ${result.bpm}`);
  assert.ok(result.confidence > 0.5, `confidence was ${result.confidence}`);
  assert.ok(result.waveform.length > fs * 10, 'waveform returned for display');
  assert.ok(result.spectrum.bpms.length > 0, 'spectrum returned for display');
});

test('analyzeBuffer trims to the trailing analysis window', () => {
  const fs = ANALYSIS_HZ;
  const trace = syntheticSkinTrace({ bpm: 90, seconds: 60, fs });
  const buffer = createSampleBuffer(4000);
  for (let i = 0; i < trace.t.length; i += 1) {
    buffer.push({ t: trace.t[i], r: trace.r[i], g: trace.g[i], b: trace.b[i] });
  }
  const result = analyzeBuffer(buffer, { mode: 'face', fs, maxWindowSeconds: 15 });
  assert.equal(result.status, 'ready');
  assert.ok(result.waveform.length <= fs * 15 + 2, `waveform held ${result.waveform.length} samples`);
  assert.ok(Math.abs(result.bpm - 90) < 3, `bpm was ${result.bpm}`);
});
