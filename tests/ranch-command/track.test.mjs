/**
 * Unit tests for tracking, tripwires, zones and voice commands.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Tracker, command, crossing, inside, iou } from '../../public/ranch-command/js/track.js';

const FRAME = { width: 1000, height: 1000 };
const box = (cx, feetY, w = 100, h = 100) => ({ x: cx - w / 2, y: feetY - h, w, h });
const det = (cx, feetY, label = 'cow', kind = 'livestock', score = 0.8) => ({ label, kind, score, box: box(cx, feetY) });

/** Walk one object along a path at `fps`, returning every event. */
function walk(tracker, path, { fps = 5, t0 = 0, label = 'cow', kind = 'livestock' } = {}) {
  const events = [];
  path.forEach(([x, y], i) => events.push(...tracker.update([det(x, y, label, kind)], t0 + i / fps, FRAME).events));
  return events;
}
const line = (from, to, steps) => Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]);

test('IoU is 1 for the same box and 0 for strangers', () => {
  assert.equal(iou(box(100, 100), box(100, 100)), 1);
  assert.equal(iou(box(100, 100), box(500, 500)), 0);
  assert.ok(Math.abs(iou({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 2 }) - 1 / 3) < 1e-9);
});

test('a crossing knows its direction, and misses do not count', () => {
  const a = [0.5, 0.2];
  const b = [0.5, 0.8];
  assert.equal(crossing(a, b, [0.4, 0.5], [0.6, 0.5]), 'in');
  assert.equal(crossing(a, b, [0.6, 0.5], [0.4, 0.5]), 'out');
  assert.equal(crossing(a, b, [0.4, 0.5], [0.45, 0.5]), null, 'did not reach the wire');
  assert.equal(crossing(a, b, [0.4, 0.9], [0.6, 0.9]), null, 'passed beyond the end of the wire');
  assert.equal(crossing(a, b, [0.4, 0.1], [0.6, 0.1]), null, 'passed before the start of the wire');
});

test('point-in-polygon handles a concave zone', () => {
  const L = [[0, 0], [1, 0], [1, 0.4], [0.4, 0.4], [0.4, 1], [0, 1]];
  assert.ok(inside(L, [0.2, 0.8]));
  assert.ok(inside(L, [0.8, 0.2]));
  assert.ok(!inside(L, [0.8, 0.8]), 'the notch of the L is outside');
});

test('an object is believed only after repeated sightings, and announced once', () => {
  const tracker = new Tracker();
  const events = walk(tracker, line([200, 500], [260, 500], 8));
  assert.deepEqual(events.filter((e) => e.type === 'new').map((e) => e.track.id), [1]);
  assert.equal(tracker.update([det(265, 500)], 2, FRAME).tracks.length, 1);
  // A single-frame ghost never becomes a track.
  const ghost = new Tracker();
  assert.equal(ghost.update([det(100, 100)], 0, FRAME).tracks.length, 0);
});

test('two objects keep their identities as they move', () => {
  const tracker = new Tracker();
  let ids = [];
  for (let i = 0; i < 10; i += 1) {
    const { tracks } = tracker.update([det(200 + i * 20, 400), det(800 - i * 20, 700, 'person', 'person')], i / 5, FRAME);
    ids = tracks.map((tr) => `${tr.id}:${tr.label}`).sort();
  }
  assert.deepEqual(ids, ['1:cow', '2:person']);
});

test('a fast mover is still followed at low frame rate', () => {
  const tracker = new Tracker();
  // Jumps of 130 px with a 100 px box: no overlap between frames at all.
  const events = walk(tracker, line([100, 500], [880, 500], 6), { fps: 2 });
  assert.equal(events.filter((e) => e.type === 'new').length, 1, 'one animal, one track');
});

test('a track is dropped after it has been gone a while', () => {
  const tracker = new Tracker();
  walk(tracker, line([200, 500], [220, 500], 4));
  assert.equal(tracker.update([], 0.9, FRAME).tracks.length, 1, 'a brief miss is forgiven');
  assert.equal(tracker.update([], 5, FRAME).tracks.length, 0);
});

test('one bad frame does not rename a cow', () => {
  const tracker = new Tracker();
  walk(tracker, line([200, 500], [220, 500], 4));
  tracker.update([det(222, 500, 'horse', 'livestock', 0.41)], 1, FRAME);
  assert.equal(tracker.tracks[0].label, 'cow');
});

test('a tripwire counts the herd through a gate, by direction', () => {
  const wire = { id: 'w1', name: 'north_gate', a: [0.5, 0.1], b: [0.5, 0.9] };
  const tracker = new Tracker({ wires: [wire] });
  const through = walk(tracker, line([300, 500], [700, 500], 10));
  assert.deepEqual(through.filter((e) => e.type === 'cross').map((e) => e.direction), ['in']);
  // A second cow comes in, then the first one leaves again.
  walk(tracker, line([300, 300], [700, 300], 10), { t0: 10 });
  walk(tracker, line([700, 700], [300, 700], 10), { t0: 20 });
  assert.deepEqual(tracker.tally('w1', 'livestock'), { in: 2, out: 1, net: 1 });
  assert.deepEqual(tracker.tally('w1'), { in: 2, out: 1, net: 1 });
  assert.deepEqual(tracker.tally('nope'), { in: 0, out: 0, net: 0 });
});

test('an animal dithering on the wire is counted once', () => {
  const wire = { id: 'w1', name: 'gate', a: [0.5, 0.1], b: [0.5, 0.9] };
  const tracker = new Tracker({ wires: [wire] });
  walk(tracker, line([440, 500], [480, 500], 4));
  // Back and forth across the line within one second.
  const jitter = [[505, 500], [495, 500], [505, 500], [495, 500], [505, 500]];
  walk(tracker, jitter, { fps: 10, t0: 1 });
  const { in: i, out: o } = tracker.tally('w1');
  assert.equal(i + o, 1);
});

test('the wire is crossed by feet, not by the middle of the body', () => {
  // A horizontal wire at 60% height. The box centre crosses it; the feet,
  // already below, never do.
  const wire = { id: 'w', name: 'fence', a: [0.1, 0.6], b: [0.9, 0.6] };
  const tracker = new Tracker({ wires: [wire] });
  const events = [];
  for (let i = 0; i < 8; i += 1) events.push(...tracker.update([{ label: 'person', kind: 'person', score: 0.9, box: { x: 400, y: 450 + i * 30, w: 100, h: 200 } }], i / 5, FRAME).events);
  assert.equal(events.filter((e) => e.type === 'cross').length, 0);
});

test('entering a zone and loitering in it are separate events', () => {
  const zone = { id: 'z1', name: 'fuel_tank', points: [[0.4, 0.4], [0.8, 0.4], [0.8, 0.8], [0.4, 0.8]], dwell: 5 };
  const tracker = new Tracker({ zones: [zone] });
  const arrive = walk(tracker, line([200, 600], [600, 600], 10), { label: 'person', kind: 'person' });
  assert.equal(arrive.filter((e) => e.type === 'enter').length, 1);
  assert.equal(arrive.filter((e) => e.type === 'dwell').length, 0);
  assert.deepEqual(tracker.zonesOf(tracker.tracks[0]), ['fuel_tank']);
  const stay = walk(tracker, Array.from({ length: 40 }, () => [600, 600]), { t0: 2.2, label: 'person', kind: 'person' });
  const dwell = stay.filter((e) => e.type === 'dwell');
  assert.equal(dwell.length, 1, 'loitering is reported once, not every frame');
  assert.ok(dwell[0].seconds >= 5);
  walk(tracker, line([600, 600], [200, 600], 6), { t0: 11, label: 'person', kind: 'person' });
  assert.deepEqual(tracker.zonesOf(tracker.tracks[0]), []);
});

test('changing the drawn geometry keeps the tracks', () => {
  const tracker = new Tracker();
  walk(tracker, line([200, 500], [240, 500], 5));
  tracker.setGeometry({ wires: [{ id: 'w', name: 'g', a: [0.5, 0], b: [0.5, 1] }], zones: [] });
  const events = walk(tracker, line([260, 500], [700, 500], 10), { t0: 1.2 });
  assert.equal(events.filter((e) => e.type === 'new').length, 0, 'same animal');
  assert.equal(events.filter((e) => e.type === 'cross').length, 1);
});

const SLIDES = [{ id: 'command', title: 'Ranch Command' }, { id: 'events', title: 'Routed, then confirmed by a person' }, { id: 'drones', title: 'Every aircraft. A pilot decides.' }, { id: 'weather', title: 'Atmospheric Intelligence' }, { id: 'vision', title: 'It knows a cow from a pickup' }];

test('commands are told apart from questions', () => {
  assert.deepEqual(command('next', SLIDES), { action: 'next' });
  assert.deepEqual(command('Siguiente', SLIDES), { action: 'next' });
  assert.deepEqual(command('go back', SLIDES), { action: 'prev' });
  assert.deepEqual(command('go to drones', SLIDES), { action: 'go', slide: 'drones' });
  assert.deepEqual(command('show me the alerts', SLIDES), { action: 'go', slide: 'events' });
  assert.deepEqual(command('open atmospheric intelligence', SLIDES), { action: 'go', slide: 'weather' });
  assert.deepEqual(command('abre el clima', SLIDES), { action: 'go', slide: 'weather' });
  assert.deepEqual(command('start sentry', SLIDES), { action: 'sentry-on' });
  assert.deepEqual(command('stop the detector', SLIDES), { action: 'sentry-off' });
  assert.equal(command('how do I connect my DJI', SLIDES), null);
  assert.equal(command('go to the moon', SLIDES), null);
  assert.equal(command('what happens next with the drone', SLIDES), null, 'a question containing "next" is still a question');
});
