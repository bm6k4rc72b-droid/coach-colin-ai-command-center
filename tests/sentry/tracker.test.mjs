/**
 * Identity: the tracker's actual job.
 *
 * Recovering a position is easy. Keeping the same number on the same subject
 * while two of them pass each other, while one steps behind a post, and while
 * neither is quite the shape they were a second ago is where a tracker is worth
 * having — and where its failures write fiction into the record rather than
 * simply losing it.
 *
 * @module tests/sentry/tracker
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_POSE } from './synthetic.mjs';
import { BIRTH_FRAMES, DEATH_FRAMES, Tracker, appearanceDistance, netDisplacement } from '../../public/sentry/js/tracker.js';

/**
 * A detection at a position, shaped like a person.
 *
 * @param {number} cx Centre column.
 * @param {number} cy Centre row.
 * @param {number} [size=10] Half-width.
 * @returns {import('../../public/sentry/js/scene.js').Blob} Blob.
 */
function blobAt(cx, cy, size = 8) {
  const height = size * 2.4;
  return {
    area: size * height * 1.4,
    minX: cx - size,
    maxX: cx + size,
    minY: cy - height / 2,
    maxY: cy + height / 2,
    cx,
    cy,
    footU: cx,
    footV: cy + height / 2,
    fill: 0.62,
    upperEnergy: 4,
  };
}

test('a track is confirmed only after a run of detections', () => {
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  for (let i = 0; i < BIRTH_FRAMES - 1; i += 1) {
    const { live } = tracker.update([blobAt(80 + i, 100)], i * 66);
    assert.equal(live.length, 0, 'a track should not be reported before it is confirmed');
  }
  const { live, born } = tracker.update([blobAt(80 + BIRTH_FRAMES, 100)], BIRTH_FRAMES * 66);
  assert.equal(live.length, 1);
  assert.equal(born.length, 1);
});

test('a one-frame blink does not create a second track', () => {
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  let t = 0;
  for (let i = 0; i < 8; i += 1) tracker.update([blobAt(60 + i * 2, 100)], (t += 66));
  tracker.update([], (t += 66));
  tracker.update([], (t += 66));
  const { live } = tracker.update([blobAt(80, 100)], (t += 66));
  assert.equal(live.length, 1, 'the track should have coasted through the gap');
  assert.equal(live[0].id, 1, 'and kept its identity');
});

test('a track is retired after a long absence', () => {
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  let t = 0;
  for (let i = 0; i < 8; i += 1) tracker.update([blobAt(60 + i * 2, 100)], (t += 66));
  let retired = [];
  for (let i = 0; i < DEATH_FRAMES + 1; i += 1) {
    retired = retired.concat(tracker.update([], (t += 66)).retired);
  }
  assert.equal(retired.length, 1, 'the track should be retired exactly once');
  assert.equal(tracker.tracks.length, 0);
});

test('two subjects passing each other keep their own identities', () => {
  // The classic failure: as the blobs converge, nearest-neighbour assignment
  // hands each track the other's history, and both paths become fiction.
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  const frame = fakeFrame(192, 144);
  let t = 0;
  const seenIds = new Map();
  for (let step = 0; step < 40; step += 1) {
    const left = 50 + step * 2.2;
    const right = 140 - step * 2.2;
    const detections = Math.abs(left - right) < 12
      ? [blobAt((left + right) / 2, 100, 12)]
      : [blobAt(left, 100), blobAt(right, 100)];
    const { live } = tracker.update(detections, (t += 66), { frame, width: 192 });
    for (const track of live) {
      if (!seenIds.has(track.id)) seenIds.set(track.id, []);
      seenIds.get(track.id).push(track.u);
    }
  }
  const ids = [...seenIds.keys()];
  assert.ok(ids.length <= 3, `crossing produced ${ids.length} identities; at most three is tolerable`);
  const leftTrack = seenIds.get(ids[0]);
  assert.ok(
    leftTrack[leftTrack.length - 1] > leftTrack[0],
    'the first track should have carried on in the direction it was going',
  );
});

test('a detection that would require impossible speed is not matched', () => {
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  let t = 0;
  for (let i = 0; i < 8; i += 1) tracker.update([blobAt(60, 110)], (t += 66));
  const before = tracker.tracks[0].u;
  // A blob on the far side of the frame one frame later is a different thing.
  tracker.update([blobAt(185, 110)], (t += 66));
  assert.ok(tracker.tracks.length >= 2, 'the far detection should start its own track');
  assert.ok(Math.abs(tracker.tracks[0].u - before) < 8, 'the original track should not have jumped');
});

test('appearance distance separates a dark subject from a bright one', () => {
  const dark = new Float32Array([0.7, 0.2, 0.1, 0, 0, 0, 0, 0]);
  const bright = new Float32Array([0, 0, 0, 0, 0, 0.1, 0.3, 0.6]);
  assert.ok(appearanceDistance(dark, dark) < 1e-6);
  assert.ok(appearanceDistance(dark, bright) > 0.9);
});

test('net displacement ignores the path taken', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 4 },
    { x: 0, y: 4 },
    { x: 0, y: 0 },
  ];
  assert.equal(netDisplacement(path), 0, 'a closed loop ends where it began');
  assert.equal(netDisplacement(path.slice(0, 3)), 5, '3-4-5 triangle');
});

test('without a pose, tracking still works but reports no metres', () => {
  const tracker = new Tracker();
  let t = 0;
  let live = [];
  for (let i = 0; i < 10; i += 1) live = tracker.update([blobAt(60 + i * 3, 100)], (t += 66)).live;
  assert.equal(live.length, 1);
  assert.equal(live[0].ground, null);
  assert.equal(live[0].distanceM, 0);
  assert.equal(live[0].heightM, null);
});

/**
 * A flat grey frame, for the appearance descriptor.
 *
 * @param {number} width Width.
 * @param {number} height Height.
 * @returns {{data: Uint8ClampedArray}} Frame.
 */
function fakeFrame(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(128);
  return { data, width, height };
}
