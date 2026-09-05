/**
 * Estimator tests.
 *
 * The subject is synthetic and its true pulse, breathing rate and motion are
 * inputs, so these assertions are against known answers rather than against
 * whatever the code happened to produce last time. The negative cases matter as
 * much as the positive ones: an estimator that always answers is worse than one
 * that sometimes refuses, because a wrong heart rate is indistinguishable from
 * a right one on screen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANALYSIS_HZ,
  chromWaveform,
  estimateVitals,
  greenWaveform,
  posWaveform,
  respirationFromIntervals,
  scanQuality,
} from '../../public/baseline/js/vitals.js';
import { dominantFrequency, powerSpectrum } from '../../public/baseline/js/signal.js';
import { pulselessScan, syntheticScan } from './synthetic.mjs';

test('a clean scan recovers the true pulse rate', () => {
  for (const bpm of [48, 64, 78, 96, 132]) {
    const reading = estimateVitals(syntheticScan({ bpm }));
    assert.ok(reading.ok, `${bpm} bpm scan was rejected`);
    assert.ok(Math.abs(reading.bpm - bpm) < 2, `expected ${bpm}, got ${reading.bpm.toFixed(1)}`);
    assert.ok(reading.confidence > 0.6, `confidence was ${reading.confidence.toFixed(2)}`);
    assert.equal(reading.grade, 'good');
  }
});

test('breathing rate is recovered from the beat rhythm alone', () => {
  for (const breaths of [10, 15, 20]) {
    const reading = estimateVitals(syntheticScan({ breaths, seconds: 50 }));
    assert.equal(reading.breathSource, 'rsa');
    assert.ok(Math.abs(reading.breathsPerMin - breaths) < 2.5,
      `expected ${breaths}/min, got ${reading.breathsPerMin.toFixed(1)}`);
  }
});

test('the beat count matches the true number of beats', () => {
  const reading = estimateVitals(syntheticScan({ bpm: 60, seconds: 40, rsa: 0 }));
  // Forty seconds at sixty beats a minute is forty beats, less whatever the
  // filter's edges cost.
  assert.ok(reading.hrv.beats >= 36 && reading.hrv.beats <= 41,
    `found ${reading.hrv.beats} beats`);
});

test('common-mode motion is cancelled rather than reported as a pulse', () => {
  // The artefact sits at 54 bpm, inside the pulse band and below the true rate,
  // so a method that failed to cancel it would report 54 with high confidence.
  const reading = estimateVitals(syntheticScan({ bpm: 78, motion: 0.06, motionHz: 0.9 }));
  assert.ok(Math.abs(reading.bpm - 78) < 3, `motion won: reported ${reading.bpm.toFixed(1)}`);
  assert.ok(Math.abs(reading.bpm - 54) > 10);
});

test('POS cancels a common-mode intensity change exactly', () => {
  const hz = ANALYSIS_HZ;
  const n = hz * 20;
  const traces = { r: [], g: [], b: [] };
  for (let i = 0; i < n; i += 1) {
    // Every channel scaled together: a lamp dimming, or a head turning toward
    // the window. There is no pulse here at all, only the artefact.
    const wobble = 1 + 0.05 * Math.sin((2 * Math.PI * 1.1 * i) / hz);
    traces.r.push(190 * wobble);
    traces.g.push(138 * wobble);
    traces.b.push(122 * wobble);
  }
  const wave = posWaveform(traces, hz);
  const spectrum = powerSpectrum(wave, hz, { minHz: 0.6, maxHz: 3, stepHz: 0.01 });
  let total = 0;
  for (const power of spectrum.power) total += power;
  assert.ok(total < 1e-6, `POS leaked ${total} of the intensity artefact into the pulse band`);
});

test('a scan of something with no pulse is refused', () => {
  const reading = estimateVitals(pulselessScan({}));
  assert.equal(reading.grade, 'unusable');
  assert.ok(reading.confidence < 0.2);
  assert.ok(!reading.ok);
});

test('a scan with no face found produces nothing at all', () => {
  const reading = estimateVitals(syntheticScan({ found: false }));
  assert.equal(reading.grade, 'unusable');
  assert.equal(reading.bpm, 0);
  assert.equal(reading.coverage, 0);
  assert.match(reading.advice[0], /face/i);
});

test('losing the face part-way through costs coverage and confidence', () => {
  const full = estimateVitals(syntheticScan({ seconds: 45 }));
  const partial = estimateVitals(syntheticScan({ seconds: 45, dropFrom: 0.5 }));
  assert.ok(partial.coverage < 0.6);
  assert.ok(partial.confidence < full.confidence);
  assert.ok(partial.advice.some((line) => /oval/i.test(line)));
});

test('a dark scan still reads a rate but is downgraded and says why', () => {
  const reading = estimateVitals(syntheticScan({ bpm: 66, luma: 32 }));
  assert.ok(Math.abs(reading.bpm - 66) < 3);
  assert.notEqual(reading.grade, 'good');
  assert.ok(reading.advice.some((line) => /dark/i.test(line)));
});

test('a blown-out scan is downgraded and says why', () => {
  const reading = estimateVitals(syntheticScan({ clipped: 0.3 }));
  assert.ok(reading.confidence < 0.8);
  assert.ok(reading.advice.some((line) => /bright|sun/i.test(line)));
});

test('variability is withheld when the scan cannot support it', () => {
  const short = estimateVitals(syntheticScan({ seconds: 12 }));
  assert.ok(!short.hrv.reliable, 'a twelve-second scan must not claim an HRV figure');
  assert.ok(short.advice.some((line) => /short/i.test(line)));

  const proper = estimateVitals(syntheticScan({ seconds: 45 }));
  assert.ok(proper.hrv.reliable);
  assert.ok(proper.hrv.rmssd > 0);
});

test('a low frame rate still measures, because the grid is time-based', () => {
  const reading = estimateVitals(syntheticScan({ bpm: 72, fps: 15, seconds: 45 }));
  assert.ok(Math.abs(reading.bpm - 72) < 3, `15 fps gave ${reading.bpm.toFixed(1)}`);
});

test('a weak signal on dark skin tones is still found', () => {
  // A quarter of the pulse amplitude, which is the direction less reflected
  // light pushes the measurement in.
  const reading = estimateVitals(syntheticScan({ bpm: 58, pulse: 0.003, seconds: 50 }));
  assert.ok(Math.abs(reading.bpm - 58) < 3, `weak signal gave ${reading.bpm.toFixed(1)}`);
});

test('the chrominance and green waveforms are only produced with enough data', () => {
  const hz = ANALYSIS_HZ;
  const tiny = { r: [1, 2], g: [1, 2], b: [1, 2] };
  assert.equal(chromWaveform(tiny, hz).length, 0);
  assert.equal(posWaveform(tiny, hz).length, 0);
  assert.equal(greenWaveform([1, 2], hz).length, 0);
});

test('the green fallback finds a pulse when colour is degenerate', () => {
  const hz = ANALYSIS_HZ;
  const green = [];
  for (let i = 0; i < hz * 25; i += 1) {
    green.push(138 * (1 - 0.01 * Math.sin((2 * Math.PI * 1.2 * i) / hz)));
  }
  const wave = greenWaveform(green, hz);
  const peak = dominantFrequency(powerSpectrum(wave, hz, { minHz: 0.6, maxHz: 3, stepHz: 0.005 }));
  assert.ok(Math.abs(peak.hz * 60 - 72) < 2);
});

test('quality scoring names every problem it penalises for', () => {
  const perfect = scanQuality({
    snrDb: 12, spreadBpm: 1, coverage: 1, motion: 0.01, luma: 150, clipped: 0, durationSec: 40,
  });
  assert.equal(perfect.grade, 'good');
  assert.equal(perfect.confidence, 1);

  const awful = scanQuality({
    snrDb: -1, spreadBpm: 12, coverage: 0.5, motion: 0.12, luma: 30, clipped: 0.3, durationSec: 10,
  });
  assert.equal(awful.grade, 'unusable');
  assert.ok(awful.advice.length >= 5, 'every failing dimension is named');
});

test('respiration reports nothing when there are too few beats', () => {
  assert.equal(respirationFromIntervals([1, 2, 3], [900, 910]).breathsPerMin, 0);
});

test('a metronomic subject gets no breathing rate rather than a plausible one', () => {
  // No respiratory modulation of the beat rhythm and no visible chest movement:
  // there is nothing to measure, and the largest bump in the breathing band is
  // noise. Reporting it would be inventing a vital sign.
  const reading = estimateVitals(syntheticScan({ rsa: 0, breathLuma: 0, seconds: 45 }));
  assert.ok(reading.bpm > 0, 'the pulse is still read');
  assert.equal(reading.breathsPerMin, 0);
  assert.equal(reading.breathSource, null);
});

test('breathing falls back to frame drift when the beat rhythm carries nothing', () => {
  const reading = estimateVitals(syntheticScan({ rsa: 0, breaths: 12, breathLuma: 2, seconds: 45 }));
  assert.equal(reading.breathSource, 'baseband');
  assert.ok(Math.abs(reading.breathsPerMin - 12) < 2, `got ${reading.breathsPerMin.toFixed(1)}`);
});
