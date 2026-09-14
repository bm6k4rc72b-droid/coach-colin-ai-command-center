/**
 * Sonar mapping, dead reckoning and the drift that has to be admitted.
 *
 * @module tests/black-optic-6/subsurface
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beamCells, capacity, coverage, createGrid, deadReckon, driftEstimate,
  HIT_UPDATE, integrateScan, matchScan, occupancy,
} from '../../public/black-optic-6/js/sonar.js';

/** A grid centred on the vehicle's start. */
function grid() {
  const made = createGrid({ widthM: 40, heightM: 40, cellM: 0.5 });
  made.origin = { x: -20, y: -20 };
  return made;
}

/** A full circular scan at a constant range. */
function ring(rangeM, beams = 36) {
  return Array.from({ length: beams }, (_, i) => ({ bearingDeg: i * (360 / beams), rangeM }));
}

test('an empty grid knows nothing, and says so rather than guessing', () => {
  const map = grid();
  assert.equal(occupancy(map, 20, 20), 0.5);
  assert.equal(occupancy(map, -5, 20), 0.5, 'outside the grid is unknown, not free');
  assert.equal(coverage(map).known, 0);
});

test('a beam clears the water in front of it and marks the return', () => {
  const map = grid();
  const pose = { x: 0, y: 0, headingDeg: 0 };
  const { free, hit, spreadM } = beamCells(map, pose, 0, 10, 30);
  assert.ok(free.length > 10, 'the water in front should be cleared');
  assert.ok(hit.length > 1, 'a 30° beam at 10 m is wide, and the map should show that');
  assert.ok(spreadM > 4, `expected a wide footprint, got ${spreadM.toFixed(1)} m`);
});

test('a wider beam at longer range covers more ground, as the cone says it must', () => {
  const map = grid();
  const pose = { x: 0, y: 0, headingDeg: 0 };
  const near = beamCells(map, pose, 0, 5, 30).spreadM;
  const far = beamCells(map, pose, 0, 15, 30).spreadM;
  const narrow = beamCells(map, pose, 0, 15, 10).spreadM;
  assert.ok(far > near * 2, 'range widens the cone');
  assert.ok(narrow < far, 'a narrower beam resolves better');
});

test('a scan fills the map: open water near the vehicle, structure at the wall', () => {
  const map = grid();
  const pose = { x: 0, y: 0, headingDeg: 0 };
  const result = integrateScan(map, pose, ring(12));
  assert.ok(result.updated > 500 && result.hits > 50);

  const nearVehicle = occupancy(map, 40, 42);
  const atWall = occupancy(map, 40, 40 + 24);
  assert.ok(nearVehicle < 0.45, `water beside the vehicle should read open, got ${nearVehicle.toFixed(2)}`);
  assert.ok(atWall > 0.7, `the wall should read occupied, got ${atWall.toFixed(2)}`);
});

test('returns beyond the sensor range are discarded, not drawn as walls', () => {
  const map = grid();
  const pose = { x: 0, y: 0, headingDeg: 0 };
  const result = integrateScan(map, pose, ring(500), { maxRangeM: 50 });
  assert.equal(result.hits, 0, 'a return past the sensor limit is a no-return');
});

test('evidence is clamped so a cell can always be argued out of again', () => {
  const map = grid();
  const pose = { x: 0, y: 0, headingDeg: 0 };
  for (let i = 0; i < 200; i += 1) integrateScan(map, pose, ring(12));
  const atWall = occupancy(map, 40, 40 + 24);
  assert.ok(atWall < 1, 'certainty must never reach one');
  assert.ok(Math.max(...map.logOdds) <= 6 + HIT_UPDATE);
});

test('dead reckoning drifts, and the drift grows with distance rather than averaging out', () => {
  const start = { x: 0, y: 0, headingDeg: 0, elapsedSec: 0, driftM: 0 };
  const short = deadReckon(start, { speedMps: 0.5, headingDeg: 0, dtSec: 60 });
  const long = deadReckon(start, { speedMps: 0.5, headingDeg: 0, dtSec: 600 });
  assert.ok(long.driftM > short.driftM * 8, 'a heading bias accumulates; it does not cancel');
  assert.ok(long.driftM > 4, `ten minutes at half a metre per second should be metres, got ${long.driftM.toFixed(1)}`);
  assert.equal(driftEstimate(0, 1), 0);
  assert.equal(driftEstimate(600, 0), 0, 'a stationary vehicle does not drift');
});

test('scan matching pulls a wrong position back toward the truth', () => {
  const map = grid();
  const truth = { x: 0, y: 0, headingDeg: 0 };
  for (let i = 0; i < 3; i += 1) integrateScan(map, truth, ring(12));

  const lost = { ...truth, x: 1.5, elapsedSec: 300, driftM: 3 };
  const matched = matchScan(map, lost, ring(12), { radiusM: 2 });
  assert.equal(matched.confident, true, 'a dam wall is plenty of structure to match against');
  assert.ok(Math.abs(matched.pose.x) < Math.abs(lost.x), 'the correction must move toward the truth');
  assert.equal(matched.pose.driftM, 0, 'a confident match resets the accumulated drift');
});

test('with nothing to match against, the position is left alone rather than nudged', () => {
  const empty = grid();
  const lost = { x: 1.5, y: 0, headingDeg: 0, elapsedSec: 300, driftM: 3 };
  const matched = matchScan(empty, lost, ring(12), { radiusM: 2 });
  assert.equal(matched.confident, false, 'an empty map offers no evidence');
  assert.equal(matched.pose.x, lost.x, 'an unconfident match must not move the vehicle');
  assert.equal(matched.pose.driftM, 3, 'and must not clear the drift it has not corrected');
});

test('too few beams is never a confident match, however good the score', () => {
  const map = grid();
  const truth = { x: 0, y: 0, headingDeg: 0 };
  integrateScan(map, truth, ring(12));
  const sparse = matchScan(map, { ...truth, x: 0.5 }, ring(12, 4), { radiusM: 1 });
  assert.equal(sparse.confident, false);
});

test('capacity is a bounded estimate and says how confident it is', () => {
  const thin = capacity(Array.from({ length: 5 }, () => ({ depthM: 3 })), 10000);
  assert.match(thin.note, /Only 5 soundings/);

  const survey = capacity(Array.from({ length: 60 }, () => ({ depthM: 3 })), 10000);
  assert.equal(survey.volumeM3, 30000);
  assert.equal(survey.megalitres, 30);
  assert.match(survey.note, /upper bound/i, 'sloping banks hold less than a prism and it must say so');

  const none = capacity([], 10000);
  assert.equal(none.count, 0);
  assert.equal(none.volumeM3, 0);
  assert.equal(capacity([{ depthM: 3 }], 0).volumeM3, 0, 'no area, no volume');
});

test('coverage counts only cells that have evidence', () => {
  const map = grid();
  assert.equal(coverage(map).fraction, 0);
  integrateScan(map, { x: 0, y: 0, headingDeg: 0 }, ring(12));
  const after = coverage(map);
  assert.ok(after.fraction > 0.05 && after.fraction < 1, 'one scan maps some of the dam, not all of it');
  assert.ok(after.occupied > 0 && after.occupied < after.known);
});
