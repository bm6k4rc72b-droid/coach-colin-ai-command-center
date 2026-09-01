import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  iou, foot, center, aspect, pathLength, netDisplacement, straightness,
  pointInPolygon, clampBox, predict,
} from '../src/core/geometry.ts';

test('iou is 1 for identical boxes and 0 for disjoint ones', () => {
  const b = { x: 0.1, y: 0.1, w: 0.2, h: 0.4 };
  assert.equal(iou(b, b), 1);
  assert.equal(iou(b, { x: 0.7, y: 0.7, w: 0.1, h: 0.1 }), 0);
});

test('iou of half-overlapping boxes is 1/3', () => {
  const a = { x: 0, y: 0, w: 0.2, h: 0.2 };
  const b = { x: 0.1, y: 0, w: 0.2, h: 0.2 };
  // intersection 0.1*0.2=0.02, union 0.04+0.04-0.02=0.06
  assert.ok(Math.abs(iou(a, b) - 1 / 3) < 1e-9);
});

test('foot is bottom-centre, center is the middle', () => {
  const b = { x: 0.2, y: 0.1, w: 0.4, h: 0.6 };
  assert.deepEqual(foot(b), { x: 0.4, y: 0.7 });
  assert.deepEqual(center(b), { x: 0.4, y: 0.4 });
});

test('aspect is height over width', () => {
  assert.ok(Math.abs(aspect({ x: 0, y: 0, w: 0.1, h: 0.3 }) - 3) < 1e-9);
  assert.equal(aspect({ x: 0, y: 0, w: 0, h: 0.3 }), 0);
});

test('path length accumulates, net displacement is end to end', () => {
  const path = [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.4 }];
  assert.ok(Math.abs(pathLength(path) - 0.7) < 1e-9);
  assert.ok(Math.abs(netDisplacement(path) - 0.5) < 1e-9);
});

test('straightness separates travel from oscillation', () => {
  const walk = [{ x: 0, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }];
  assert.equal(straightness(walk), 1);

  // a branch swinging back and forth around a fixed point
  const branch = [
    { x: 0.5, y: 0.5 }, { x: 0.54, y: 0.5 }, { x: 0.5, y: 0.5 },
    { x: 0.46, y: 0.5 }, { x: 0.5, y: 0.5 },
  ];
  assert.equal(straightness(branch), 0);
});

test('straightness is 1 for a path too short to judge', () => {
  assert.equal(straightness([]), 1);
  assert.equal(straightness([{ x: 0.5, y: 0.5 }]), 1);
});

test('point in polygon handles a convex zone', () => {
  const square = [
    { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 },
  ];
  assert.equal(pointInPolygon({ x: 0.5, y: 0.5 }, square), true);
  assert.equal(pointInPolygon({ x: 0.1, y: 0.5 }, square), false);
  assert.equal(pointInPolygon({ x: 0.5, y: 0.9 }, square), false);
});

test('point in polygon handles a concave zone', () => {
  // an L-shape: the notch must read as outside
  const L = [
    { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.4 },
    { x: 0.4, y: 0.4 }, { x: 0.4, y: 0.9 }, { x: 0.1, y: 0.9 },
  ];
  assert.equal(pointInPolygon({ x: 0.2, y: 0.6 }, L), true);
  assert.equal(pointInPolygon({ x: 0.7, y: 0.2 }, L), true);
  assert.equal(pointInPolygon({ x: 0.7, y: 0.7 }, L), false);
});

test('a degenerate polygon contains nothing', () => {
  assert.equal(pointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);
});

test('clampBox keeps the box inside the frame', () => {
  const b = clampBox({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
  assert.ok(b.x + b.w <= 1 + 1e-9);
  assert.ok(b.y + b.h <= 1 + 1e-9);
});

test('predict advances and clamps', () => {
  const b = predict({ x: 0.5, y: 0.5, w: 0.1, h: 0.2 }, { x: 0.1, y: 0 });
  assert.ok(Math.abs(b.x - 0.6) < 1e-9);
});
