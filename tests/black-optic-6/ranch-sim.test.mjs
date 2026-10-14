/**
 * Ranch twin: layout geometry, fences with gate gaps, flock behaviour and the
 * safety rules.
 *
 * @module tests/black-optic-6/ranch-sim
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fenceSegments, footprint, inPolygon, layoutCameras, occluders, parseLayout, penGate,
  RanchSim, sampleLayout, segmentsCross, TYPES,
} from '../../public/black-optic-6/js/ranch-sim.js';

test('point in polygon and segment crossing', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.ok(inPolygon([5, 5], sq));
  assert.ok(!inPolygon([15, 5], sq));
  assert.ok(segmentsCross([0, 0], [10, 10], [0, 10], [10, 0]));
  assert.ok(!segmentsCross([0, 0], [1, 1], [5, 5], [6, 7]));
});

test('a gate cuts a gap in the fence it sits on', () => {
  const L = { objects: [{ id: 'g', type: 'gate', x: 5, z: 0, rot: 0 }], fences: [{ id: 'f', pts: [[0, 0], [10, 0]] }] };
  const segs = fenceSegments(L);
  assert.equal(segs.length, 2);
  const half = TYPES.gate.w / 2;
  assert.ok(Math.abs(segs[0][2] - (5 - half)) < 1e-9);
  assert.ok(Math.abs(segs[1][0] - (5 + half)) < 1e-9);
  // A gate away from the fence leaves it whole.
  const far = fenceSegments({ ...L, objects: [{ id: 'g', type: 'gate', x: 5, z: 8, rot: 0 }] });
  assert.equal(far.length, 1);
});

test('footprints rotate with the object; solid objects occlude cameras', () => {
  const fp = footprint({ type: 'barn', x: 0, z: 0, rot: Math.PI / 2 });
  const xs = fp.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - TYPES.barn.d / 2) < 1e-9);
  const L = sampleLayout();
  assert.ok(occluders(L).length >= 4 * 5);
  const cams = layoutCameras(L, { offline: [L.objects.find((o) => o.type === 'camera').id] });
  assert.equal(cams.filter((c) => !c.online).length, 1);
});

test('the flock stays inside its fences while grazing', () => {
  const L = sampleLayout();
  const sim = new RanchSim(L, { seed: 3, sheep: 30, cattle: 6 });
  for (let i = 0; i < 600; i++) sim.step(0.1);
  const outside = sim.sheep.filter((s) => !inPolygon([s.x, s.z], L.zones.paddock)).length;
  assert.equal(outside, 0);
  const strayCattle = sim.cattle.filter((c) => !inPolygon([c.x, c.z], L.zones.herd)).length;
  assert.equal(strayCattle, 0);
});

test('sending the flock to the pen moves it through the gate and the line counts it', () => {
  const L = sampleLayout();
  const sim = new RanchSim(L, { seed: 5, sheep: 24, cattle: 4 });
  sim.command('pen');
  for (let i = 0; i < 2400; i++) sim.step(0.1);
  const h = sim.headcount();
  assert.ok(h.inPen >= 18, `in pen ${h.inPen}`);
  assert.ok(h.net >= h.inPen - 2 && h.net <= h.inPen + 2, `net ${h.net} vs in pen ${h.inPen}`);
  assert.ok(penGate(L));
});

test('a drawn fence without a gate stops the flock reaching the pen', () => {
  const L = sampleLayout();
  L.objects = L.objects.filter((o) => !(o.type === 'gate' && o.x === 17));
  const sim = new RanchSim(L, { seed: 5, sheep: 20, cattle: 2 });
  sim.command('pen');
  for (let i = 0; i < 1500; i++) sim.step(0.1);
  assert.equal(sim.headcount().inPen, 0);
});

test('safety rules: lone worker, machinery zone, and consent hides a worker', () => {
  const sim = new RanchSim(sampleLayout(), { seed: 2, sheep: 8, cattle: 2 });
  for (let i = 0; i < 1500; i++) sim.step(0.1);
  const types = new Set(sim.events.map((e) => e.type));
  assert.ok(types.has('lone'), 'lone-worker alert');
  assert.ok(types.has('danger'), 'machinery-zone alert');
  sim.setConsent('w2', false);
  assert.ok(!sim.visibleCrew().some((w) => w.id === 'w2'));
  sim.checkIn('w1');
  assert.equal(sim.events[0].type, 'checkin');
});

test('a dog near the flock scatters it and is reported', () => {
  const sim = new RanchSim(sampleLayout(), { seed: 9, sheep: 30, cattle: 2 });
  sim.releaseDog();
  assert.equal(sim.events[0].level, 'alert');
  for (let i = 0; i < 200; i++) sim.step(0.1);
  assert.ok(sim.events.some((e) => e.type === 'stray') || sim.dog === null || sim.dog.life < 30);
});

test('layouts round-trip through JSON and bad input is rejected', () => {
  const L = sampleLayout();
  const back = parseLayout(JSON.stringify(L));
  assert.equal(back.objects.length, L.objects.length);
  assert.equal(back.fences.length, L.fences.length);
  assert.throws(() => parseLayout('{"nope":1}'));
  const cleaned = parseLayout({ objects: [{ type: 'ufo', x: 0, z: 0 }, { type: 'barn', x: 999, z: 0 }], fences: [{ pts: [[0, 0]] }] });
  assert.equal(cleaned.objects.length, 1);
  assert.equal(cleaned.objects[0].x, 80);
  assert.equal(cleaned.fences.length, 0);
});
