/**
 * Signal-processing tests.
 *
 * Every waveform here is synthesized, so the right answer is known to the
 * decimal place rather than argued about: a 72 bpm sinusoid must come back as
 * 1.2 Hz, twelve peaks must be found in ten seconds, and a filter that shifts
 * peaks must fail rather than quietly inflate the variability figure it feeds.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bandPower,
  bandpassFir,
  cleanIntervals,
  clamp,
  detrend,
  dominantFrequency,
  findPeaks,
  intervalsFromTimes,
  mean,
  median,
  medianAbsoluteDeviation,
  movingAverage,
  normalize,
  powerSpectrum,
  refinePeakTimes,
  remap,
  resampleUniform,
  rmssd,
  sdnn,
  spectralSnrDb,
  standardDeviation,
} from '../../public/baseline/js/signal.js';

/**
 * Build a sampled sinusoid.
 *
 * @param {object} spec Waveform spec.
 * @param {number} spec.hz Sample rate.
 * @param {number} spec.seconds Duration.
 * @param {number} spec.freq Frequency in hertz.
 * @param {number} [spec.amplitude=1] Amplitude.
 * @param {number} [spec.offset=0] DC offset.
 * @param {number} [spec.noise=0] Uniform noise amplitude.
 * @param {number} [spec.seed=11] Noise seed.
 * @returns {number[]} Samples.
 */
function sine({ hz, seconds, freq, amplitude = 1, offset = 0, noise = 0, seed = 11 }) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
  const out = [];
  for (let i = 0; i < Math.round(hz * seconds); i += 1) {
    out.push(offset + amplitude * Math.sin((2 * Math.PI * freq * i) / hz) + noise * rnd());
  }
  return out;
}

test('descriptive statistics agree with hand-computed values', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Math.abs(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
  assert.equal(mean([]), 0);
  assert.equal(standardDeviation([7]), 0);
});

test('the median absolute deviation ignores a single wild reading', () => {
  const steady = [50, 52, 51, 49, 50, 51];
  const withOutlier = [...steady, 140];
  const madGrowth = medianAbsoluteDeviation(withOutlier) / medianAbsoluteDeviation(steady);
  const sdGrowth = standardDeviation(withOutlier) / standardDeviation(steady);
  // The same outlier moves a standard deviation by an order of magnitude, which
  // is exactly why the baseline is not built from one.
  assert.ok(sdGrowth > 10, `SD grew ${sdGrowth}x`);
  assert.ok(madGrowth < sdGrowth / 4, `MAD grew ${madGrowth}x against SD's ${sdGrowth}x`);
});

test('detrending removes drift and leaves the oscillation', () => {
  const hz = 30;
  const drifting = sine({ hz, seconds: 10, freq: 1.2 })
    .map((value, index) => value + index * 0.01);
  const flat = detrend(drifting, 45);
  assert.ok(Math.abs(mean(flat)) < 0.05);
  const spectrum = powerSpectrum(flat, hz, { minHz: 0.7, maxHz: 4, stepHz: 0.005 });
  assert.ok(Math.abs(dominantFrequency(spectrum).hz - 1.2) < 0.02);
});

test('a moving average of a constant series is that constant', () => {
  const flat = movingAverage([5, 5, 5, 5, 5], 3);
  for (const value of flat) assert.ok(Math.abs(value - 5) < 1e-12);
});

test('normalize produces zero mean and unit variance, and tolerates a flat input', () => {
  const scaled = normalize([2, 4, 6, 8]);
  assert.ok(Math.abs(mean(scaled)) < 1e-12);
  assert.ok(Math.abs(standardDeviation(scaled) - 1) < 1e-9);
  assert.deepEqual(Array.from(normalize([3, 3, 3])), [0, 0, 0]);
});

test('resampling repairs a jittery frame clock', () => {
  // Frames arrive late and early, as they do on a real phone, but the underlying
  // oscillation is exactly 1.1 Hz and must still be recovered as such.
  const values = [];
  const times = [];
  let t = 0;
  for (let i = 0; i < 900; i += 1) {
    t += 33.3 + (i % 7) * 4 - 12;
    values.push(Math.sin(2 * Math.PI * 1.1 * (t / 1000)));
    times.push(t);
  }
  const grid = resampleUniform(values, times, 30);
  assert.ok(grid.values.length > 700);
  const spectrum = powerSpectrum(grid.values, 30, { minHz: 0.7, maxHz: 4, stepHz: 0.005 });
  assert.ok(Math.abs(dominantFrequency(spectrum).hz - 1.1) < 0.02);
});

test('resampling refuses to invent a series from nothing', () => {
  assert.equal(resampleUniform([1], [0], 30).values.length, 0);
  assert.equal(resampleUniform([1, 2], [5, 5], 30).values.length, 0);
});

test('the band-pass keeps its band and rejects what is outside it', () => {
  const hz = 30;
  const mixed = sine({ hz, seconds: 20, freq: 1.2 })
    .map((value, index) => value
      + 2 * Math.sin((2 * Math.PI * 0.1 * index) / hz)
      + 0.8 * Math.sin((2 * Math.PI * 8 * index) / hz));
  const filtered = bandpassFir(mixed, hz, 0.7, 3.5, 121);
  const spectrum = powerSpectrum(filtered, hz, { minHz: 0.05, maxHz: 12, stepHz: 0.01 });
  const inBand = bandPower(spectrum, 1.0, 1.4);
  assert.ok(inBand > bandPower(spectrum, 0.05, 0.5) * 10, 'slow drift is rejected');
  assert.ok(inBand > bandPower(spectrum, 6, 12) * 10, 'high-frequency noise is rejected');
});

test('the band-pass does not shift peaks, so intervals stay honest', () => {
  const hz = 30;
  const clean = sine({ hz, seconds: 20, freq: 1 });
  const filtered = bandpassFir(clean, hz, 0.7, 3.5, 121);
  const rawPeaks = findPeaks(clean, hz, {});
  const filteredPeaks = findPeaks(filtered, hz, {});
  assert.equal(rawPeaks.length, filteredPeaks.length);
  for (let i = 0; i < rawPeaks.length; i += 1) {
    assert.ok(Math.abs(rawPeaks[i] - filteredPeaks[i]) <= 1, 'peaks stay put through the filter');
  }
});

test('peak counting matches the true beat count', () => {
  const hz = 30;
  const wave = sine({ hz, seconds: 10, freq: 1.2, noise: 0.05 });
  const peaks = findPeaks(bandpassFir(wave, hz, 0.7, 3.5, 121), hz, {});
  assert.ok(peaks.length === 12 || peaks.length === 11, `expected about 12 beats, found ${peaks.length}`);
});

test('the refractory period rejects a dicrotic notch', () => {
  const hz = 30;
  // A pulse plus a smaller secondary bump 0.2 s later, as an arterial waveform
  // genuinely has: naive peak-picking would double the heart rate.
  const wave = [];
  for (let i = 0; i < hz * 10; i += 1) {
    const t = i / hz;
    wave.push(Math.sin(2 * Math.PI * 1 * t) + 0.45 * Math.sin(2 * Math.PI * 1 * (t - 0.22)));
  }
  const peaks = findPeaks(wave, hz, { minSpacingSec: 0.4 });
  assert.ok(peaks.length <= 11, `found ${peaks.length} peaks in ten one-hertz beats`);
});

test('sub-sample peak refinement drops the variability floor', () => {
  const hz = 30;
  const wave = bandpassFir(sine({ hz, seconds: 25, freq: 68 / 60 }), hz, 0.7, 3.5, 121);
  const peaks = findPeaks(wave, hz, {});
  const coarse = cleanIntervals(peaks.slice(1).map((peak, i) => ((peak - peaks[i]) / hz) * 1000));
  const refined = cleanIntervals(intervalsFromTimes(refinePeakTimes(wave, hz, peaks)));
  // A perfectly regular waveform has no variability at all; quantization to the
  // frame grid manufactures roughly 30 ms of it, which is the same size as a
  // real RMSSD and would therefore be indistinguishable from one.
  assert.ok(rmssd(coarse) > 20, `coarse floor was ${rmssd(coarse)}`);
  assert.ok(rmssd(refined) < 8, `refined floor was ${rmssd(refined)}`);
  assert.ok(Math.abs(mean(refined) - 60000 / 68) < 5);
});

test('interval cleaning drops a missed and a doubled beat', () => {
  const intervals = [900, 890, 910, 1800, 895, 450, 905];
  const cleaned = cleanIntervals(intervals);
  assert.ok(!cleaned.includes(1800), 'a missed beat is removed');
  assert.ok(!cleaned.includes(450), 'a spurious beat is removed');
  assert.equal(cleaned.length, 5);
});

test('RMSSD and SDNN match hand calculation', () => {
  const intervals = [800, 820, 810, 830];
  // Successive differences: 20, -10, 20 -> sqrt((400 + 100 + 400) / 3).
  assert.ok(Math.abs(rmssd(intervals) - Math.sqrt(900 / 3)) < 1e-9);
  assert.ok(Math.abs(sdnn(intervals) - standardDeviation(intervals)) < 1e-12);
  assert.equal(rmssd([800, 820]), 0, 'too few intervals reports nothing rather than guessing');
});

test('spectral SNR separates a real pulse from noise', () => {
  const hz = 30;
  const clean = powerSpectrum(detrend(sine({ hz, seconds: 20, freq: 1.2 }), 45), hz, {});
  const cleanPeak = dominantFrequency(clean);
  assert.ok(spectralSnrDb(clean, cleanPeak.hz) > 10);

  const noise = powerSpectrum(detrend(sine({ hz, seconds: 20, freq: 1.2, amplitude: 0, noise: 2 }), 45), hz, {});
  const noisePeak = dominantFrequency(noise);
  assert.ok(spectralSnrDb(noise, noisePeak.hz) < 2, 'noise cannot masquerade as a strong pulse');
  assert.equal(spectralSnrDb(clean, 0), -30);
});

test('parabolic interpolation beats the bin spacing', () => {
  const hz = 30;
  // 1.223 Hz sits between 0.02 Hz bins, so only interpolation can find it.
  const wave = detrend(sine({ hz, seconds: 20, freq: 1.223 }), 45);
  const coarse = powerSpectrum(wave, hz, { minHz: 0.7, maxHz: 4, stepHz: 0.02 });
  assert.ok(Math.abs(dominantFrequency(coarse).hz - 1.223) < 0.008);
});

test('clamp and remap behave at and beyond their limits', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(remap(5, 0, 10, 0, 100), 50);
  assert.equal(remap(-1, 0, 10, 0, 100), 0);
  assert.equal(remap(11, 0, 10, 0, 100), 100);
  assert.equal(remap(5, 3, 3, 7, 9), 7);
});
