/**
 * Breathing, region-finding and storage tests.
 *
 * The breathing tests are the interesting ones: a paced protocol is only worth
 * building if the app can tell the difference between a heart that followed it
 * and one that did not, so both cases are synthesized and both must be scored
 * correctly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROTOCOLS,
  breathState,
  breathingResponse,
  compareScans,
  cycleSeconds,
  describeResponse,
  protocolFor,
  protocolRate,
  rateTrace,
} from '../../public/baseline/js/breathe.js';
import {
  FaceRegion,
  guideRect,
  isSkin,
  measureRegion,
  regionMotion,
} from '../../public/baseline/js/roi.js';
import {
  CSV_COLUMNS,
  addSession,
  clearAll,
  loadProfile,
  loadSessions,
  saveProfile,
  saveSettings,
  sessionRow,
  toCsv,
  toJson,
} from '../../public/baseline/js/ledger.js';
import { memoryStorage, syntheticFrame } from './synthetic.mjs';

/**
 * Beat times and intervals for a heart oscillating with the breath.
 *
 * @param {object} spec Spec.
 * @param {number} spec.bpm Mean rate.
 * @param {number} spec.breaths Breathing rate per minute.
 * @param {number} spec.swing Peak-to-peak rate swing in bpm.
 * @param {number} spec.seconds Duration.
 * @returns {{beatTimes: number[], intervals: number[]}} Beats.
 */
function beatsWithRsa({ bpm, breaths, swing, seconds }) {
  const beatTimes = [0];
  const intervals = [];
  let t = 0;
  while (t < seconds) {
    const rate = bpm + (swing / 2) * Math.sin(2 * Math.PI * (breaths / 60) * t);
    const interval = 60 / rate;
    t += interval;
    beatTimes.push(t);
    intervals.push(interval * 1000);
  }
  return { beatTimes, intervals };
}

test('every protocol has a coherent cycle and rate', () => {
  for (const protocol of PROTOCOLS) {
    const cycle = cycleSeconds(protocol);
    assert.ok(cycle > 0);
    assert.ok(Math.abs(protocolRate(protocol) - 60 / cycle) < 1e-9);
    assert.ok(protocol.purpose.length > 20, `${protocol.id} does not say what it is for`);
  }
  assert.equal(protocolRate(protocolFor('coherent')), 6);
  assert.equal(protocolFor('nonsense').id, 'coherent', 'an unknown id falls back rather than throwing');
});

test('breath guidance walks the cycle and repeats', () => {
  const box = protocolFor('box');
  const phases = [0, 5, 9, 13, 16].map((t) => breathState(t, box).phase);
  assert.deepEqual(phases, ['in', 'hold', 'out', 'holdOut', 'in']);
  assert.equal(breathState(16, box).cycle, 1);
  assert.equal(breathState(0, box).cycle, 0);
});

test('the orb is fully exhaled at the start of an inhale and full at its end', () => {
  const coherent = protocolFor('coherent');
  assert.ok(Math.abs(breathState(0, coherent).scale - 0.35) < 0.01);
  assert.ok(Math.abs(breathState(3.999, coherent).scale - 1) < 0.02);
  assert.ok(Math.abs(breathState(9.999, coherent).scale - 0.35) < 0.02);
  // Negative time can arrive from a clock adjustment mid-round.
  assert.equal(breathState(-5, coherent).phase, 'in');
});

test('a heart that follows the pacing is scored as following it', () => {
  const protocol = protocolFor('coherent');
  const { beatTimes, intervals } = beatsWithRsa({ bpm: 60, breaths: 6, swing: 14, seconds: 180 });
  const response = breathingResponse({ beatTimes, intervals, protocol });
  assert.ok(response.ok);
  assert.ok(response.swingBpm > 7, `swing read ${response.swingBpm.toFixed(1)}`);
  assert.ok(response.coherence > 0.4, `coherence read ${response.coherence.toFixed(2)}`);
  assert.ok(Math.abs(response.breathsPerMin - 6) < 1.5);
  assert.match(describeResponse(response), /response/i);
});

test('a heart oscillating at the wrong rate is not credited to the pacing', () => {
  const protocol = protocolFor('coherent');
  // Breathing at 15 a minute while the app paces 6: the swing is real, the
  // coherence is not, and the wording has to distinguish them.
  const { beatTimes, intervals } = beatsWithRsa({ bpm: 60, breaths: 15, swing: 14, seconds: 180 });
  const response = breathingResponse({ beatTimes, intervals, protocol });
  assert.ok(response.coherence < 0.3, `coherence read ${response.coherence.toFixed(2)}`);
  assert.match(describeResponse(response), /not in time with the pacing/);
});

test('too few beats produce no response rather than a flattering one', () => {
  const response = breathingResponse({ beatTimes: [0, 1, 2], intervals: [900, 950], protocol: protocolFor('box') });
  assert.equal(response.ok, false);
  assert.equal(response.swingBpm, 0);
  assert.match(describeResponse(response), /Not enough clean beats/);
});

test('the rate trace is evenly sampled and in beats per minute', () => {
  const { beatTimes, intervals } = beatsWithRsa({ bpm: 72, breaths: 6, swing: 10, seconds: 60 });
  const trace = rateTrace(beatTimes, intervals, 4);
  assert.ok(trace.values.length > 200);
  for (const value of trace.values) assert.ok(value > 60 && value < 85, `stray rate ${value}`);
});

test('comparing two scans names the direction of every change', () => {
  const before = { bpm: 64, rmssd: 40, hrvReliable: true, breathsPerMin: 16 };
  const after = { bpm: 58, rmssd: 52, hrvReliable: true, breathsPerMin: 11 };
  const comparison = compareScans(before, after);
  assert.equal(comparison.deltaBpm, -6);
  assert.equal(comparison.deltaRmssd, 12);
  assert.match(comparison.text, /down 6 bpm/);
  assert.match(comparison.text, /Variability up 12 ms/);
  assert.match(comparison.text, /Breathing settled by 5/);

  const noHrv = compareScans({ ...before, hrvReliable: false }, after);
  assert.equal(noHrv.deltaRmssd, null, 'variability is not compared when one side was unreliable');
});

test('skin detection accepts skin tones across the luminance range and rejects background', () => {
  // Light, mid and deep skin samples, each of which sits inside the chrominance
  // band that the test is built on.
  assert.ok(isSkin(238, 200, 180));
  assert.ok(isSkin(196, 142, 124));
  assert.ok(isSkin(110, 72, 58));
  assert.ok(!isSkin(24, 40, 64), 'a blue wall is not skin');
  assert.ok(!isSkin(40, 120, 60), 'foliage is not skin');
  assert.ok(!isSkin(4, 3, 3), 'a dark frame is not skin');
  assert.ok(!isSkin(255, 255, 255), 'a blown-out pixel is not skin');
});

test('a region of skin is measured and a region of wall is refused', () => {
  const frame = syntheticFrame({});
  const found = measureRegion(frame, guideRect());
  assert.ok(found.found);
  assert.ok(Math.abs(found.r - 196) < 2 && Math.abs(found.g - 142) < 2);
  assert.ok(found.skin > 0.5);
  assert.ok(found.centroid.x > 0.3 && found.centroid.x < 0.7);

  const wall = measureRegion(syntheticFrame({ patch: { x: 0, y: 0, w: 0.01, h: 0.01 } }), guideRect());
  assert.equal(wall.found, false);
  assert.equal(wall.centroid, null);
});

test('clipping is measured, because a blown-out face carries no pulse', () => {
  const frame = syntheticFrame({ subject: [255, 252, 251] });
  const measured = measureRegion(frame, guideRect(), { minSkin: 0 });
  assert.ok(!measured.found || measured.clipped > 0.5);
});

test('region motion is zero for a still frame and rises when it changes', () => {
  const first = syntheticFrame({});
  const same = syntheticFrame({});
  const moved = syntheticFrame({ patch: { x: 0.4, y: 0.15, w: 0.5, h: 0.6 } });
  assert.equal(regionMotion(first, same, guideRect()), 0);
  assert.ok(regionMotion(moved, first, guideRect()) > 0.05);
  assert.equal(regionMotion(first, null, guideRect()), 0, 'the first frame has nothing to compare against');
});

test('the face region stays inside the frame and follows the skin slowly', () => {
  const region = new FaceRegion();
  region.moveTo({ x: -5, y: 2, w: 5, h: 5 });
  assert.ok(region.rect.x >= 0 && region.rect.y >= 0);
  assert.ok(region.rect.x + region.rect.w <= 1.0001);
  assert.ok(region.rect.y + region.rect.h <= 1.0001);

  region.reset();
  const before = region.rect.x;
  region.follow({ centroid: { x: 0.9, y: 0.5 } });
  const moved = region.rect.x - before;
  assert.ok(moved > 0, 'it moves toward the skin');
  assert.ok(moved < 0.1, 'but slowly, so head movement is not hidden from the quality gate');
  region.follow({ centroid: null });
  assert.equal(region.rect.x, before + moved, 'a measurement with no centroid moves nothing');
});

test('a session row is flat, small and carries no waveform', () => {
  const row = sessionRow({
    reading: {
      bpm: 57.34, hrv: { rmssd: 44.21, sdnn: 61.9, beats: 38, reliable: true },
      breathsPerMin: 12.8, confidence: 0.81, grade: 'good', snrDb: 9.2, durationSec: 40.2,
      method: 'pos', waveform: new Float64Array(1200), spectrum: { freqs: [], power: [] },
    },
    kind: 'resting',
    context: { sleepHours: 7, sleepQuality: 3, soreness: 1, stress: 1 },
    readiness: { score: 71, band: { id: 'ready' } },
    plan: { tier: 'moderate', session: { title: 'Tempo blocks' } },
    at: 1700000000000,
  });
  assert.equal(row.bpm, 57.3);
  assert.equal(row.readiness, 71);
  assert.equal(row.tier, 'moderate');
  assert.equal(row.hrvReliable, true);
  assert.ok(!('waveform' in row) && !('spectrum' in row));
  assert.ok(JSON.stringify(row).length < 500, 'a year of scans must stay small');
});

test('the ledger stores, exports and erases', () => {
  globalThis.localStorage = memoryStorage();
  clearAll();
  assert.deepEqual(loadSessions(), []);

  const row = sessionRow({
    reading: { bpm: 60, hrv: { rmssd: 40, sdnn: 55, beats: 30, reliable: true }, breathsPerMin: 13, confidence: 0.7, grade: 'good', snrDb: 7, durationSec: 40 },
    kind: 'resting',
    at: 1700000000000,
  });
  addSession(row);
  addSession({ ...row, at: 1700086400000, bpm: 58 });
  assert.equal(loadSessions().length, 2);

  const csv = toCsv(loadSessions());
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes('2023-11-14'), 'rows carry a readable timestamp');

  const exported = JSON.parse(toJson(loadSessions(), loadProfile()));
  assert.equal(exported.app, 'baseline');
  assert.equal(exported.sessions.length, 2);
  assert.ok(exported.sessions[0].at < exported.sessions[1].at, 'exports are oldest first');

  saveProfile({ age: 44, goal: 'endurance' });
  saveSettings({ scanSeconds: 60 });
  assert.equal(loadProfile().age, 44);

  clearAll();
  assert.deepEqual(loadSessions(), []);
  assert.equal(loadProfile().age, 35, 'clearing restores the defaults');
});

test('the ledger survives a store that is missing or full', () => {
  globalThis.localStorage = {
    getItem: () => 'not json at all',
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.deepEqual(loadSessions(), []);
  assert.equal(loadProfile().age, 35);
  assert.doesNotThrow(() => addSession({ at: 1, kind: 'resting', bpm: 60 }));
  assert.doesNotThrow(() => clearAll());
  delete globalThis.localStorage;
});

test('CSV quoting survives a value containing a comma', () => {
  globalThis.localStorage = memoryStorage();
  const csv = toCsv([{ at: 1700000000000, kind: 'resting', session: 'Intervals, long', bpm: 60 }]);
  assert.match(csv, /"Intervals, long"/);
  delete globalThis.localStorage;
});
