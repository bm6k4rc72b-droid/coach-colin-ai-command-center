import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tracker } from '../src/core/tracker.ts';
import type { Detection } from '../src/core/types.ts';

const person = (x: number, y = 0.4, score = 0.8): Detection => ({
  box: { x, y, w: 0.08, h: 0.28 },
  score,
  label: 'person',
});

test('a steadily moving subject keeps one identity', () => {
  const tr = new Tracker();
  let t = 0;
  for (let i = 0; i < 20; i++) {
    tr.update([person(0.1 + i * 0.02)], (t += 40));
  }
  const live = tr.all();
  assert.equal(live.length, 1);
  assert.equal(live[0].id, 1);
  assert.equal(live[0].state, 'confirmed');
  assert.equal(live[0].hits, 20);
});

test('a track is tentative before minHits and confirmed after', () => {
  const tr = new Tracker({ minHits: 3 });
  tr.update([person(0.1)], 0);
  assert.equal(tr.all()[0].state, 'tentative');
  tr.update([person(0.11)], 40);
  assert.equal(tr.all()[0].state, 'tentative');
  tr.update([person(0.12)], 80);
  assert.equal(tr.all()[0].state, 'confirmed');
});

test('identity survives a low-confidence stretch (the BYTE second pass)', () => {
  const tr = new Tracker({ minHits: 3, highScore: 0.5 });
  let t = 0;
  for (let i = 0; i < 6; i++) tr.update([person(0.1 + i * 0.02, 0.4, 0.8)], (t += 40));
  const idBefore = tr.all()[0].id;

  // subject passes behind a hedge — score collapses but the box is still there
  for (let i = 6; i < 12; i++) tr.update([person(0.1 + i * 0.02, 0.4, 0.3)], (t += 40));

  const live = tr.all();
  assert.equal(live.length, 1, 'no second track should have been created');
  assert.equal(live[0].id, idBefore, 'identity must be preserved through occlusion');
});

test('weak detections alone never spawn a track', () => {
  const tr = new Tracker({ highScore: 0.5 });
  for (let i = 0; i < 10; i++) tr.update([person(0.1 + i * 0.02, 0.4, 0.3)], i * 40);
  assert.equal(tr.all().length, 0);
});

test('a track is dropped after maxAge frames with no detection', () => {
  const tr = new Tracker({ maxAge: 5, minHits: 2 });
  let t = 0;
  for (let i = 0; i < 5; i++) tr.update([person(0.1 + i * 0.02)], (t += 40));
  assert.equal(tr.all().length, 1);
  for (let i = 0; i < 6; i++) tr.update([], (t += 40));
  assert.equal(tr.all().length, 0);
});

test('two separated subjects get two identities', () => {
  const tr = new Tracker();
  let t = 0;
  for (let i = 0; i < 10; i++) {
    tr.update([person(0.1 + i * 0.01), person(0.7 - i * 0.01)], (t += 40));
  }
  assert.equal(tr.all().length, 2);
  assert.equal(new Set(tr.all().map((x) => x.id)).size, 2);
});

test('path history is bounded', () => {
  const tr = new Tracker({ maxPath: 10 });
  let t = 0;
  for (let i = 0; i < 40; i++) tr.update([person(0.1 + i * 0.005)], (t += 40));
  assert.ok(tr.all()[0].path.length <= 10);
});

test('reset clears tracks and identity counter', () => {
  const tr = new Tracker();
  tr.update([person(0.1)], 0);
  tr.reset();
  assert.equal(tr.all().length, 0);
  tr.update([person(0.1)], 40);
  assert.equal(tr.all()[0].id, 1);
});
