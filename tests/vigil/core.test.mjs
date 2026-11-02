/**
 * VIGIL's numbers and its fall logic, checked without a browser.
 *
 * The build sheet is quoted to a client, so the totals, the monthly schedule and
 * the PDF must agree to the cent. The simulated fall must also look like a fall
 * to the same FallWatch the camera mode uses.
 *
 * @module tests/vigil/core
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { totals, schedule, unitEconomics, LADDER, ladderAt, pose, poseBox } from '../../public/vigil/js/core.js';
import { FallWatch } from '../../public/vision-kit/bytetrack.js';

const catalog = JSON.parse(await readFile(new URL('../../public/vigil/data/catalog.json', import.meta.url), 'utf8'));

test('section totals add up to the grand total', () => {
  const T = totals(catalog);
  assert.equal(T.total, T.sections.reduce((a, s) => a + s.total, 0));
  assert.equal(T.total, 619140);
});

test('every line names its tech and AI, and repos look like owner/name', () => {
  for (const s of catalog.sections) for (const it of s.items) {
    assert.ok(it.price > 0 && it.tech && it.ai && it.what, it.name);
    for (const r of it.repos) assert.match(r, /^[\w.-]+\/[\w.-]+( \(HF\))?$/, r);
  }
});

test('12 payments repay the total to the cent, remainder on the first', () => {
  for (const total of [619140, 447359.94, 100000.01]) {
    const S = schedule(total);
    assert.equal(Math.round((S.first + S.monthly * 11) * 100), Math.round(total * 100));
    assert.ok(S.first >= S.monthly);
  }
});

test('unit economics match the proposal example', () => {
  const e = unitEconomics({ beds: 540, homes: 250, bedPrice: 59, homePrice: 189, bedCost: 14, homeCost: 41, kitPrice: 699, kitCost: 310 });
  assert.equal(e.mrr, 79110);
  assert.equal(e.arr, 949320);
  assert.ok(e.grossMargin > 0.75 && e.grossMargin < 0.8);
});

test('the ladder stops climbing once someone acknowledges', () => {
  const steps = ladderAt(90, 30);
  assert.equal(steps.find((s) => s.at === 60).state, 'skipped');
  assert.equal(steps.find((s) => s.at === 4).state, 'done');
  assert.ok(LADDER.every((s, i) => i === 0 || s.at > LADDER[i - 1].at));
});

test("the simulated fall trips the camera mode's FallWatch; walking does not", () => {
  const run = (resident) => {
    const fw = new FallWatch({ fps: 10, confirmSec: 1.5, stillSec: 999 });
    const events = [];
    for (let t = 0; t < 8; t += 0.1) {
      const [x, y, w, h] = poseBox(pose(resident, t).kp);
      events.push(...fw.update([{ id: 1, cls: 'person', box: [x * 1000, y * 1000, w * 1000, h * 1000] }], t));
    }
    return events.map((e) => e.type);
  };
  assert.deepEqual(run({ x: 0.5, y: 0.9, phase: 0 }), []);
  assert.ok(run({ x: 0.5, y: 0.9, phase: 0, fallAt: 2 }).includes('fall'));
  assert.deepEqual(run({ x: 0.5, y: 0.9, phase: 0, seated: true }), []);
});
