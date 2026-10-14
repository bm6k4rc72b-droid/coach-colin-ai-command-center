/**
 * Shared vision kit: ByteTrack-style tracking, counting line, fall watch, latency harness,
 * depth → point cloud, VPS pose solve and digital-twin coverage.
 *
 * @module tests/vision-kit
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ByteTracker, FallWatch, iou, LineCounter } from '../../public/vision-kit/bytetrack.js';
import { batchingModel, LatencyHarness, pctChange, quantile } from '../../public/vision-kit/latency.js';
import { depthToPoints, disparityToDepth, intrinsicsFromFov, turbo } from '../../public/vision-kit/pointcloud.js';
import { gpsFix, poseError, rng, simulateObservations, solvePose } from '../../public/vision-kit/vps.js';
import { blocked, coverageGrid, HeatGrid, heatRamp, sees, whatIf } from '../../public/vision-kit/twin.js';

test('iou of identical, disjoint and half-overlapping boxes', () => {
  assert.equal(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1);
  assert.equal(iou([0, 0, 10, 10], [20, 20, 5, 5]), 0);
  assert.ok(Math.abs(iou([0, 0, 10, 10], [5, 0, 10, 10]) - 1 / 3) < 1e-9);
});

test('a moving object keeps one id; tracks confirm after minHits', () => {
  const t = new ByteTracker();
  let vis = [];
  for (let f = 0; f < 10; f++) vis = t.update([{ box: [10 + f * 4, 20, 30, 60], score: 0.9, cls: 'person' }]);
  assert.equal(vis.length, 1);
  assert.equal(vis[0].id, 1);
  const t2 = new ByteTracker();
  assert.equal(t2.update([{ box: [0, 0, 10, 10], score: 0.9, cls: 'sheep' }]).length, 0, 'tentative on first sighting');
});

test('low-confidence detections keep an occluded track alive (the ByteTrack idea)', () => {
  const t = new ByteTracker();
  for (let f = 0; f < 5; f++) t.update([{ box: [100, 100, 40, 40], score: 0.9, cls: 'sheep' }]);
  const vis = t.update([{ box: [101, 100, 40, 40], score: 0.2, cls: 'sheep' }]);
  assert.equal(vis.length, 1);
  assert.equal(vis[0].id, 1);
  // A low-score detection alone never starts a new track.
  const fresh = new ByteTracker({ minHits: 1 });
  assert.equal(fresh.update([{ box: [0, 0, 10, 10], score: 0.3, cls: 'cow' }]).length, 0);
});

test('lost tracks coast and are removed after maxLost', () => {
  const t = new ByteTracker({ maxLost: 3 });
  for (let f = 0; f < 4; f++) t.update([{ box: [0, 0, 20, 20], score: 0.9, cls: 'dog' }]);
  for (let f = 0; f < 3; f++) t.update([]);
  assert.equal(t.tracks.length, 1);
  t.update([]);
  assert.equal(t.tracks.length, 0);
});

test('classes never match across each other', () => {
  const t = new ByteTracker({ minHits: 1 });
  t.update([{ box: [0, 0, 20, 20], score: 0.9, cls: 'sheep' }]);
  t.update([{ box: [0, 0, 20, 20], score: 0.9, cls: 'dog' }]);
  assert.deepEqual(new Set(t.tracks.map((x) => x.cls)), new Set(['sheep', 'dog']));
});

test('line counter counts each crossing once, by direction', () => {
  const lc = new LineCounter([50, 0], [50, 100]);
  const box = (x) => ({ id: 1, cls: 'sheep', box: [x - 5, 45, 10, 10] });
  for (const x of [10, 30, 45, 55, 70, 90]) lc.update([box(x)]);
  assert.equal(lc.in + lc.out, 1);
  for (const x of [70, 40]) lc.update([box(x)]);
  assert.equal(lc.in, 1);
  assert.equal(lc.out, 1);
  assert.equal(lc.net, 0);
  assert.equal(lc.byClass.sheep.in, 1);
});

test('fall watch: a fast drop to lying is a fall; sitting down slowly is not', () => {
  const fw = new FallWatch({ confirmSec: 1 });
  const ev = [];
  const person = (box) => [{ id: 1, cls: 'person', box }];
  for (let i = 0; i < 20; i++) ev.push(...fw.update(person([100, 100, 40, 120]), i * 0.1));
  // Collapse within 0.3 s.
  for (let i = 0; i < 30; i++) ev.push(...fw.update(person([80, 190, 120, 40]), 2 + i * 0.1));
  assert.ok(ev.some((e) => e.type === 'fall'));

  const sit = new FallWatch({ confirmSec: 1 });
  const ev2 = [];
  for (let i = 0; i < 60; i++) {
    const h = 120 - Math.min(40, i);
    ev2.push(...sit.update([{ id: 2, cls: 'person', box: [100, 100 + (120 - h), 50, h] }], i * 0.1));
  }
  assert.ok(!ev2.some((e) => e.type === 'fall'));
});

test('fall watch flags inactivity after stillSec', () => {
  const fw = new FallWatch({ stillSec: 5 });
  const ev = [];
  for (let i = 0; i <= 60; i++) ev.push(...fw.update([{ id: 3, cls: 'person', box: [0, 0, 40, 100] }], i * 0.1));
  assert.equal(ev.filter((e) => e.type === 'inactive').length, 1);
});

test('latency harness reports per-stage median and p95', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  const h = new LatencyHarness();
  for (let i = 0; i < 50; i++) {
    const t0 = i * 100;
    h.begin(t0);
    h.mark('capture', t0 + 2);
    h.mark('inference', t0 + 22);
    h.end(t0 + 25);
  }
  const s = h.stats();
  assert.equal(s.capture.median, 2);
  assert.equal(s.inference.median, 20);
  assert.equal(s.loop.median, 25);
  assert.equal(Math.round(h.fps()), 40);
  assert.equal(pctChange(100, 73), -27);
});

test('batching several questions per frame beats running the pipeline per question', () => {
  const b = batchingModel(40, 5, 4);
  assert.equal(b.sequential, 180);
  assert.equal(b.batched, 60);
  assert.equal(b.speedup, 3);
});

test('depth back-projection: centre pixel lies on the optical axis; sky is dropped', () => {
  const K = intrinsicsFromFov(4, 4, 90);
  assert.ok(Math.abs(K.fx - 2) < 1e-9);
  const depth = new Float32Array(16).fill(2);
  depth[0] = 100;
  const pc = depthToPoints(depth, K, { stride: 1, maxDepth: 50 });
  assert.equal(pc.count, 15);
  assert.equal(pc.dropped, 1);
  const centre = 2 * 4 + 2 - 1; // index of pixel (2,2) after dropping pixel 0
  assert.ok(Math.abs(pc.positions[centre * 3]) < 1e-9);
  assert.ok(Math.abs(pc.positions[centre * 3 + 2] + 2) < 1e-6);
  assert.deepEqual([...disparityToDepth([1, 2], 4)], [4, 2]);
  for (const c of turbo(0.5)) assert.ok(c >= 0 && c <= 1);
});

test('VPS solve converges to centimetre accuracy from a metre-scale guess', () => {
  const anchors = [
    { id: 'a', x: -4, y: 2.2, z: -3 },
    { id: 'b', x: 5, y: 1.1, z: -4 },
    { id: 'c', x: 4, y: 2.5, z: 4 },
    { id: 'd', x: -5, y: 0.6, z: 3 },
    { id: 'e', x: 0, y: 2.8, z: 0.5 },
  ];
  const truth = { x: 1.2, y: 1.0, z: -0.7, yaw: 0.6 };
  const obs = simulateObservations(truth, anchors, { seed: 3 });
  const guess = gpsFix(truth, rng(9), 2);
  const sol = solvePose(obs, { ...guess, yaw: 0 });
  const err = poseError(sol.pose, truth);
  assert.ok(sol.ok);
  assert.ok(err.horiz < 0.05, `horizontal error ${err.horiz}`);
  assert.ok(err.yawDeg < 1, `yaw error ${err.yawDeg}`);
  assert.ok(sol.sigma < 0.05);
});

test('VPS refuses to claim a fix from fewer than two anchors', () => {
  const sol = solvePose([], { x: 0, y: 0, z: 0, yaw: 0 });
  assert.equal(sol.ok, false);
});

test('heat grid deposits, decays by half-life and normalises', () => {
  const g = new HeatGrid({ x0: 0, z0: 0, x1: 10, z1: 10, cell: 1 });
  g.add(5.5, 5.5, 4);
  assert.equal(g.max(), 4);
  g.decay(30, 30);
  assert.equal(g.max(), 2);
  assert.equal(g.normalized()[g.index(5.5, 5.5)], 1);
  assert.equal(g.index(-1, 3), -1);
});

test('camera sight respects field of view, range, walls and darkness', () => {
  const cam = { x: 0, z: 0, yaw: 0, fov: 90, range: 10 };
  assert.ok(sees(cam, 0, -5));
  assert.ok(!sees(cam, 0, 5), 'behind the camera');
  assert.ok(!sees(cam, 0, -11), 'out of range');
  assert.ok(!sees(cam, 0, -5, [[-1, -2, 1, -2]]), 'behind a wall');
  assert.ok(!sees(cam, 0, -8, [], 0), 'too dark without IR');
  assert.ok(sees({ ...cam, ir: true }, 0, -8, [], 0), 'IR sees in the dark');
  assert.ok(blocked(0, 0, 0, -5, [[-1, -2, 1, -2]]));
});

test('what-if: taking a camera offline lowers coverage and raises unseen activity', () => {
  const g = new HeatGrid({ x0: -5, z0: -5, x1: 5, z1: 5, cell: 1 });
  g.add(0, -3, 5, 1.5);
  const site = { cameras: [{ id: 'n', x: 0, z: 4.9, yaw: 0, fov: 100, range: 12 }, { id: 's', x: 0, z: -4.9, yaw: Math.PI, fov: 100, range: 12 }] };
  const base = coverageGrid(site.cameras, g);
  assert.ok(base.ratio > 0.5);
  const r = whatIf(site, { offline: ['n', 's'] }, g);
  assert.equal(r.next.ratio, 0);
  assert.ok(r.deltaCoverage < 0);
  assert.equal(r.unseenActivityNext, 1);
  for (const c of heatRamp(0.6)) assert.ok(c >= 0 && c <= 1);
});
