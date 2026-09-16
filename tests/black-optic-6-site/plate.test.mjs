import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLATES, FILL, CROWN_Y, featherAlpha, plateFrame, plateMix,
} from '../../public/black-optic-6-site/js/plate.js';
import { SCENES } from '../../public/black-optic-6-site/js/catalog.js';

test('the feather reaches exactly zero on every edge and corner', () => {
  // This is the whole reason the plate can sit on a dark page without a seam.
  // An earlier elliptical feather failed it: the ellipse had to be wider than
  // the plate to leave the subject at full opacity, so it never hit zero at the
  // sides and the plate kept a visible rectangle.
  for (const plate of PLATES) {
    const f = plate.feather;
    for (const [x, y, where] of [
      [0, 0.5, 'left'], [1, 0.5, 'right'], [0.5, 0, 'top'], [0.5, 1, 'bottom'],
      [0, 0, 'top-left'], [1, 0, 'top-right'], [0, 1, 'bottom-left'], [1, 1, 'bottom-right'],
    ]) {
      assert.equal(featherAlpha(x, y, f), 0, `${plate.id} leaks at ${where}`);
    }
  }
});

test('the feather leaves the subject and the middle untouched', () => {
  for (const plate of PLATES) {
    const f = plate.feather;
    assert.equal(featherAlpha(0.5, 0.5, f), 1, `${plate.id} dims its own centre`);
    // The hat crown is the highest thing on him and the first to be clipped.
    assert.ok(featherAlpha(0.5, plate.crown, f) > 0.92,
      `${plate.id} fades the hat at the crown line`);
  }
});

test('the feather falls off monotonically inward from each edge', () => {
  const f = PLATES[0].feather;
  let previous = -1;
  for (let x = 0; x <= 0.5; x += 0.02) {
    const a = featherAlpha(x, 0.5, f);
    assert.ok(a >= previous - 1e-9, `alpha dipped on the way in at x=${x.toFixed(2)}`);
    previous = a;
  }
  assert.ok(featherAlpha(0.02, 0.5, f) < featherAlpha(0.20, 0.5, f));
});

test('corners darken faster than edges — that is where a seam shows first', () => {
  const f = PLATES[0].feather;
  const edge = featherAlpha(0.5, 0.12, f);
  const corner = featherAlpha(0.12, 0.12, f);
  assert.ok(corner < edge, 'the corner must be at least as faded as either edge alone');
});

test('the push-in grows at a constant rate, which is the point of it', () => {
  const frameHeight = 900;
  const heights = [0, 0.25, 0.5, 0.75, 1].map((p) => plateFrame(p, frameHeight).height);
  const deltas = heights.slice(1).map((h, i) => h - heights[i]);
  for (const delta of deltas) {
    assert.ok(Math.abs(delta - deltas[0]) < 1e-9, 'the push-in must not ease in the middle');
    assert.ok(delta > 0, 'and it must always be closing');
  }
  assert.ok(Math.abs(heights[0] - frameHeight * FILL.start) < 1e-9);
  assert.ok(Math.abs(heights[4] - frameHeight * FILL.end) < 1e-9);
});

test('he ends up filling the frame, and starts well inside it', () => {
  const frameHeight = 900;
  assert.ok(FILL.start < 1, 'he must start smaller than the frame');
  assert.ok(FILL.end > 1.5, 'and finish larger than it');
  assert.ok(plateFrame(1, frameHeight).height > frameHeight);
});

test('the crown stays in frame the whole way down', () => {
  const frameHeight = 900;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const { crownY, height } = plateFrame(p, frameHeight);
    assert.ok(crownY >= 0 && crownY < frameHeight, `crown left frame at ${p.toFixed(2)}`);
    assert.ok(Number.isFinite(height) && height > 0);
  }
  assert.ok(CROWN_Y.end < CROWN_Y.start, 'his head rises in frame as he closes');
});

test('plateFrame clamps rather than extrapolating off the ends', () => {
  assert.equal(plateFrame(-4, 900).height, plateFrame(0, 900).height);
  assert.equal(plateFrame(9, 900).height, plateFrame(1, 900).height);
});

test('the hat-tip plate is held back for the very end', () => {
  assert.equal(plateMix(0).over, null);
  assert.equal(plateMix(0.5).mix, 0);
  assert.equal(plateMix(0.87).mix, 0);
  assert.ok(plateMix(0.95).mix > 0 && plateMix(0.95).mix < 1);
  assert.equal(plateMix(1).mix, 1);
  assert.equal(plateMix(1).over, 'arrival');
});

test('the dissolve is monotonic — no flicker between the two plates', () => {
  let previous = -1;
  for (let p = 0.85; p <= 1.0001; p += 0.01) {
    const { mix } = plateMix(p);
    assert.ok(mix >= previous - 1e-9, `the dissolve reversed at ${p.toFixed(2)}`);
    assert.ok(mix >= 0 && mix <= 1);
    previous = mix;
  }
});

test('every plate names a real file and a measured crown', () => {
  const ids = new Set();
  for (const plate of PLATES) {
    assert.ok(!ids.has(plate.id), `duplicate plate ${plate.id}`);
    ids.add(plate.id);
    assert.match(plate.src, /^img\/.+\.(jpg|png)$/);
    assert.ok(plate.crown > 0 && plate.crown < 0.4, `${plate.id}: the crown is near the top of a portrait`);
  }
  assert.ok(ids.has('approach') && ids.has('arrival'));
});

test('every act says which side the plate takes, and it clears the text column', () => {
  // The column alternates sides down the page: odd acts sit left, even acts
  // right, and the two centred acts are the ones where he is allowed behind the
  // words. If this drifts, a 400px photograph ends up under a paragraph.
  const centred = new Set(['arrival', 'launch']);
  SCENES.forEach((act, index) => {
    assert.ok(typeof act.side === 'number', `${act.id} has no plate placement`);
    assert.ok(act.side > 0 && act.side < 1, `${act.id} places the plate off screen`);
    if (centred.has(act.id)) return;
    // index 0 is the first child, so an even index is an odd nth-child.
    const columnIsLeft = index % 2 === 0;
    if (columnIsLeft) assert.ok(act.side > 0.5, `${act.id}: column is left, plate must go right`);
    else assert.ok(act.side < 0.5, `${act.id}: column is right, plate must go left`);
  });
});
