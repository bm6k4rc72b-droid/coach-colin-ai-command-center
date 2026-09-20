import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANAMORPHIC, clamp01, lerp, progressThrough, easeInOut, easeOut, easeIn,
  easeEdges, envelope, parallax, letterbox, layout, stateAt, documentHeight, positionFrom,
} from '../../public/black-optic-6-site/js/timeline.js';

test('clamp01 pins to the unit interval and survives rubbish', () => {
  assert.equal(clamp01(-3), 0);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(9), 1);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(undefined), 0);
});

test('progressThrough returns 0 below a span and 1 above it', () => {
  assert.equal(progressThrough(0, 100, 200), 0);
  assert.equal(progressThrough(150, 100, 200), 0.5);
  assert.equal(progressThrough(400, 100, 200), 1);
  // A zero-width span must not divide by zero.
  assert.equal(progressThrough(5, 10, 10), 0);
  assert.equal(progressThrough(10, 10, 10), 1);
});

test('the easings are monotonic and land exactly on their ends', () => {
  for (const ease of [easeIn, easeOut, easeInOut]) {
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = ease(t);
      assert.ok(value >= previous - 1e-9, `${ease.name} went backwards at ${t}`);
      assert.ok(value >= -1e-9 && value <= 1 + 1e-9, `${ease.name} overshot at ${t}`);
      previous = value;
    }
  }
});

test('easeEdges leaves the middle linear — the reason scrubbing feels attached', () => {
  const edge = 0.25;
  // Across the linear middle, equal steps in must give equal steps out.
  const a = easeEdges(0.40, edge);
  const b = easeEdges(0.50, edge);
  const c = easeEdges(0.60, edge);
  assert.ok(Math.abs((b - a) - (c - b)) < 1e-9);
  assert.equal(easeEdges(0, edge), 0);
  assert.equal(easeEdges(1, edge), 1);
});

test('envelope rises, holds and falls', () => {
  assert.equal(envelope(0), 0);
  assert.equal(envelope(1), 0);
  assert.ok(envelope(0.5) > 0.99);
  assert.ok(envelope(0.1, 0.2, 0.2) < envelope(0.2, 0.2, 0.2));
});

test('letterbox never produces a negative bar', () => {
  const wide = letterbox(1000, 200, ANAMORPHIC);
  assert.equal(wide.bar, 0, 'a viewport wider than the aspect has nothing to matte');
  assert.equal(wide.height, 200);

  const tall = letterbox(1000, 1000, ANAMORPHIC);
  assert.ok(Math.abs(tall.height - 1000 / ANAMORPHIC) < 1e-9);
  assert.ok(Math.abs(tall.top + tall.bottom + tall.height - 1000) < 1e-9);

  const nothing = letterbox(0, 0);
  assert.equal(nothing.bar, 0);
});

test('parallax depth 0 rides with the page and depth 1 counters it exactly', () => {
  // `===` rather than strictEqual: depth 0 yields -0, which is numerically zero
  // and stringifies as "0" in a transform, so the sign bit is not worth chasing.
  assert.ok(parallax(500, 0) === 0);
  assert.equal(parallax(500, 1), -500);
  assert.equal(parallax(500, -0.2), 100, 'negative depth overshoots forward');
});

test('layout gives weighted scenes proportional spans that tile the document', () => {
  const scenes = layout([
    { id: 'a', weight: 1 },
    { id: 'b', weight: 3 },
    { id: 'c' },
  ]);
  assert.equal(scenes[0].start, 0);
  assert.ok(Math.abs(scenes[2].end - 1) < 1e-9);
  assert.ok(Math.abs(scenes[1].span - 0.6) < 1e-9, 'weight 3 of 5 should be 60% of the film');
  for (let i = 1; i < scenes.length; i += 1) {
    assert.equal(scenes[i].start, scenes[i - 1].end, 'scenes must tile with no gap');
  }
});

test('stateAt cross-dissolves neighbours instead of cutting', () => {
  const scenes = layout([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const boundary = scenes[0].end;
  const state = stateAt(boundary, scenes);
  const a = state.scenes.find((s) => s.id === 'a');
  const b = state.scenes.find((s) => s.id === 'b');
  assert.ok(a.presence > 0 && b.presence > 0, 'both scenes must be present across a boundary');
  assert.equal(state.scenes.find((s) => s.id === 'c').presence, 0);
});

test('stateAt always names an active scene, including at both ends', () => {
  const scenes = layout([{ id: 'a' }, { id: 'b' }]);
  assert.equal(stateAt(0, scenes).active, 'a');
  assert.equal(stateAt(1, scenes).active, 'b');
  assert.equal(stateAt(-5, scenes).active, 'a');
  assert.equal(stateAt(9, scenes).active, 'b');
});

test('documentHeight and positionFrom round-trip', () => {
  const scenes = layout([{ id: 'a', weight: 2 }, { id: 'b' }]);
  const height = documentHeight(scenes, 800);
  assert.ok(height > 800);
  assert.equal(positionFrom(0, height, 800), 0);
  assert.equal(positionFrom(height - 800, height, 800), 1);
  assert.ok(Math.abs(positionFrom((height - 800) / 2, height, 800) - 0.5) < 1e-9);
});

test('lerp clamps rather than extrapolating', () => {
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(lerp(10, 20, -1), 10);
  assert.equal(lerp(10, 20, 4), 20);
});
