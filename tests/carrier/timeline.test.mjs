/**
 * Time: boundaries, dissolves, and what happens past the end.
 *
 * @module tests/carrier/timeline
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, crossfadeAt, cueAt, frameTimes } from '../../public/carrier/js/timeline.js';
import { CUT_SEC, parseScript } from '../../public/carrier/js/script.js';

/**
 * A script of scenes with the given durations.
 *
 * @param {number[]} durations Seconds per scene.
 * @returns {object} A parsed script.
 */
function script(durations) {
  return parseScript({
    scenes: durations.map((seconds, i) => ({ id: `s${i + 1}`, seconds, title: `Scene ${i + 1}` })),
  });
}

test('scenes are laid end to end and the total is their sum', () => {
  const timeline = buildTimeline(script([4, 3, 5]));
  assert.equal(timeline.total, 12);
  assert.deepEqual(timeline.cues.map((c) => [c.start, c.end]), [[0, 4], [4, 7], [7, 12]]);
});

test('a cut belongs to the incoming scene, so it costs no extra running time', () => {
  const durations = [4, 3, 5];
  assert.equal(buildTimeline(script(durations)).total, durations.reduce((a, b) => a + b));
});

test('the scene at a boundary is the incoming one', () => {
  const timeline = buildTimeline(script([4, 3]));
  assert.equal(cueAt(timeline, 3.999).cue.scene.id, 's1');
  assert.equal(cueAt(timeline, 4).cue.scene.id, 's2');
  assert.equal(cueAt(timeline, 4).tLocal, 0);
});

test('time past the end holds the last scene rather than falling off it', () => {
  const timeline = buildTimeline(script([4, 3]));
  const past = cueAt(timeline, 99);
  assert.equal(past.cue.scene.id, 's2');
  assert.ok(past.tLocal <= 3);
});

test('negative time clamps to the first frame', () => {
  const timeline = buildTimeline(script([4]));
  assert.equal(cueAt(timeline, -5).tLocal, 0);
});

test('an empty episode has no scene at any time', () => {
  const timeline = buildTimeline(script([]));
  assert.equal(timeline.total, 0);
  assert.equal(cueAt(timeline, 0), null);
  assert.equal(crossfadeAt(timeline, 0), null);
});

test('the first scene never dissolves in from nothing', () => {
  const timeline = buildTimeline(script([4, 3]));
  const opening = crossfadeAt(timeline, 0);
  assert.equal(opening.from, null);
  assert.equal(opening.mix, 1);
});

test('a cut mixes from the outgoing scene and completes on time', () => {
  const timeline = buildTimeline(script([4, 3]));
  const early = crossfadeAt(timeline, 4.01);
  assert.equal(early.from.scene.id, 's1');
  assert.equal(early.to.scene.id, 's2');
  assert.ok(early.mix > 0 && early.mix < 0.2);

  const after = crossfadeAt(timeline, 4 + CUT_SEC + 0.01);
  assert.equal(after.from, null);
  assert.equal(after.mix, 1);
});

test('a scene shorter than a cut still resolves', () => {
  const timeline = buildTimeline(script([4, 0.2]));
  const mid = crossfadeAt(timeline, 4.1);
  assert.ok(mid.mix > 0 && mid.mix <= 1);
});

test('frame times start at zero and land on the requested rate', () => {
  const times = frameTimes(2, 30);
  assert.equal(times.length, 60);
  assert.equal(times[0], 0);
  assert.ok(Math.abs(times[1] - 1 / 30) < 1e-9);
});
