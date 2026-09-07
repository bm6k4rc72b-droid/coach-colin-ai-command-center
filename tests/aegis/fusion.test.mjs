/**
 * The rules that decide whether anybody gets telephoned.
 *
 * Every one of these is a property somebody's safety depends on, and every one
 * of them is a rule that is easy to break by accident while making the numbers
 * "better". They are asserted directly rather than through a scenario so that
 * a regression names the rule it broke.
 *
 * @module tests/aegis/fusion
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALARM, CHECK, SOLO_CAP, WATCH, coverageReport, fuse } from '../../public/aegis/js/fusion.js';

/**
 * A camera reading.
 *
 * @param {object} [over] Fields to override.
 * @returns {object} A kinematics-shaped reading.
 */
const vision = (over = {}) => ({
  state: 'grounded',
  sinceMs: 1000,
  stature: 0.2,
  descentRate: 0,
  peakRate: 1.2,
  likelihood: 0.9,
  transitObserved: false,
  degraded: false,
  reasons: ['on the floor'],
  ...over,
});

/**
 * An accelerometer reading.
 *
 * @param {object} [over] Fields to override.
 * @returns {object} An inertial-shaped reading.
 */
const inertial = (over = {}) => ({
  available: true,
  likelihood: 0,
  against: 0,
  impact: { found: false, peakG: 0, atMs: 0 },
  freefall: { found: false, minG: 1, atMs: 0 },
  tilt: { degrees: 0, turned: false },
  after: { still: false, seconds: 0 },
  breath: { detected: false, rms: 0, rateHz: 0 },
  reasons: [],
  ...over,
});

/**
 * A room-sound reading.
 *
 * @param {object} [over] Fields to override.
 * @returns {object} An acoustic-shaped reading.
 */
const acoustic = (over = {}) => ({
  available: true,
  likelihood: 0,
  against: 0,
  onset: false,
  ratio: 0,
  centroidHz: 0,
  decayMs: 0,
  atMs: 0,
  speechLike: false,
  reasons: [],
  ...over,
});

test('a sensor that is on and has seen nothing does not argue either way', () => {
  // The bug this guards against read a quiet accelerometer as proof that
  // nobody had fallen, and voted down a camera that had watched it happen.
  const quiet = fuse({
    vision: vision({ likelihood: 0.9, state: 'down', transitObserved: true }),
    inertial: inertial({ likelihood: 0 }),
    acoustic: acoustic({ likelihood: 0 }),
  });
  const alone = fuse({ vision: vision({ likelihood: 0.9, state: 'down', transitObserved: true }) });
  assert.ok(quiet.belief >= alone.belief - 1e-9, 'silent sensors must not reduce the belief');
  assert.ok(quiet.belief >= ALARM, 'a watched fall with silent corroborators still alarms');
});

test('an empty room is not fifty-fifty', () => {
  const nothing = fuse({
    vision: vision({ state: 'upright', likelihood: 0 }),
    inertial: inertial(),
    acoustic: acoustic(),
  });
  assert.ok(nothing.belief < WATCH, `an ordinary second read ${nothing.belief.toFixed(2)}`);
  assert.equal(nothing.level, 'calm');
});

test('one channel alone is capped below the alarm threshold', () => {
  const solo = fuse({ inertial: inertial({ likelihood: 0.99 }) });
  assert.ok(solo.capped, 'a lone channel should be marked as capped');
  assert.equal(solo.belief, SOLO_CAP);
  assert.ok(solo.belief < ALARM, 'a lone channel must never reach an alarm');
});

test('two agreeing channels are corroborated and may alarm', () => {
  const pair = fuse({
    vision: vision({ likelihood: 0.8 }),
    inertial: inertial({ likelihood: 0.7 }),
  });
  assert.ok(pair.corroborated);
  assert.ok(!pair.capped);
  assert.ok(pair.belief >= ALARM, `two channels at 0.8 and 0.7 gave ${pair.belief.toFixed(2)}`);
});

test('a camera that saw the descent and the aftermath counts as corroborated', () => {
  const watched = fuse({
    vision: vision({ likelihood: 0.92, state: 'down', transitObserved: true }),
  });
  assert.ok(watched.corroborated, 'two observations seven seconds apart are two observations');
  assert.ok(!watched.capped);
  assert.ok(watched.belief >= ALARM);
});

test('a camera that only found somebody down is not corroborated on its own', () => {
  const found = fuse({
    vision: vision({ likelihood: 0.92, state: 'found-down', transitObserved: false }),
  });
  assert.ok(!found.corroborated, 'one observation is one observation');
  assert.ok(found.capped);
  assert.ok(found.belief < ALARM);
  assert.match(found.headline, /on the floor/i);
});

test('contrary evidence subtracts rather than abstaining', () => {
  const withoutObjection = fuse({
    vision: vision({ likelihood: 0.75 }),
    acoustic: acoustic({ likelihood: 0.55 }),
  });
  const withObjection = fuse({
    vision: vision({ likelihood: 0.75 }),
    acoustic: acoustic({ likelihood: 0.55 }),
    inertial: inertial({ against: 0.72 }),
  });
  assert.ok(
    withObjection.belief < withoutObjection.belief,
    'a phone reporting that the still thing is not breathing must pull the total down',
  );
  assert.ok(withObjection.contradicting.includes('Carried phone'));
  assert.match(withObjection.reasons[0], /argues against/i);
});

test('the thresholds are ordered and named consistently', () => {
  assert.ok(WATCH < CHECK && CHECK < ALARM);
  assert.ok(SOLO_CAP < ALARM, 'the solo cap has to sit below the alarm or it is not a cap');
  assert.equal(fuse({ vision: vision({ likelihood: 0.2 }) }).level, 'calm');
  // Below the neutral point a channel is not making a claim, so nothing is
  // added to anything — but the console still shows the strongest doubt it
  // holds, which is what puts it in the watching band rather than at calm.
  assert.equal(fuse({ vision: vision({ likelihood: 0.45 }), inertial: inertial({ likelihood: 0.45 }) }).level, 'watching');
});

test('coverage says plainly what an installation cannot see', () => {
  const cameraOnly = coverageReport({ vision: true, inertial: false, acoustic: false });
  assert.ok(cameraOnly.coverage > 0 && cameraOnly.coverage < 1);
  assert.equal(cameraOnly.gaps.length, 2);
  assert.match(cameraOnly.gaps.join(' '), /bathroom/i);

  const nothing = coverageReport({ vision: false, inertial: false, acoustic: false });
  assert.equal(nothing.coverage, 0);
  assert.match(nothing.summary, /Nothing is watching/i);

  const everything = coverageReport({ vision: true, inertial: true, acoustic: true });
  assert.equal(everything.gaps.length, 0);
  assert.match(everything.summary, /no failure modes in common|two of them/i);
});
