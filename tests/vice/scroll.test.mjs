/**
 * Turning a scrollbar into a timeline.
 *
 * The interesting failure this suite is written against is not a wrong number
 * — it is a page that was correct on the machine it was built on. Section
 * heights change with the width of the screen, the length of the copy and the
 * font that actually loaded, and a naive `scrollY / height` mapping quietly
 * moves every set piece when any of that changes.
 *
 * So the mapping is measured from the sections themselves, and what is
 * asserted here is that it survives the sections being the wrong size.
 *
 * @module tests/vice/scroll
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  actScrollMap, cardTransform, documentProgress, parallaxShift, progressFromMap, rackPosition, railSegments, revealAmount,
} from '../../public/vice/js/scroll.js';
import { ACTS } from '../../public/vice/js/sequence.js';

test('document progress runs 0 to 1 and survives a page shorter than the window', () => {
  assert.equal(documentProgress(0, 3000, 1000), 0);
  assert.equal(documentProgress(1000, 3000, 1000), 0.5);
  assert.equal(documentProgress(2000, 3000, 1000), 1);
  assert.equal(documentProgress(5000, 3000, 1000), 1, 'overscroll is clamped');
  assert.equal(documentProgress(0, 800, 1000), 0, 'a page with nothing to scroll is at the top');
});

test('the measured map puts each act exactly where its section starts', () => {
  // Deliberately uneven: the sections are nothing like their act spans.
  const tops = { arrival: 0, brief: 500, chase: 700, fleet: 4000, cavalry: 4200, agents: 9000, detonation: 9400, aftermath: 9800 };
  const travel = 10000;
  const map = actScrollMap(ACTS, tops, travel);

  for (const act of ACTS) {
    const at = progressFromMap(tops[act.id], map, travel);
    assert.ok(
      Math.abs(at - act.from) < 1e-9,
      `${act.id} starts at progress ${at}, should be ${act.from}`,
    );
  }
});

test('progress through the map is monotonic', () => {
  const tops = { arrival: 0, brief: 500, chase: 700, fleet: 4000, cavalry: 4200, agents: 9000, detonation: 9400, aftermath: 9800 };
  const map = actScrollMap(ACTS, tops, 10000);
  let previous = -1;
  for (let y = 0; y <= 10000; y += 25) {
    const p = progressFromMap(y, map, 10000);
    assert.ok(p >= previous - 1e-12, `progress went backwards at ${y}`);
    assert.ok(p >= 0 && p <= 1);
    previous = p;
  }
  assert.equal(progressFromMap(10000, map, 10000), 1);
});

test('a missing section does not break the map', () => {
  // A section can be absent — a variant of the page, a block removed.
  const tops = { arrival: 0, chase: 1000, aftermath: 8000 };
  const map = actScrollMap(ACTS, tops, 10000);
  assert.equal(map.length, 3);
  assert.ok(Math.abs(progressFromMap(1000, map, 10000) - 0.2) < 1e-9);
  assert.ok(Math.abs(progressFromMap(8000, map, 10000) - 0.84) < 1e-9);
});

test('with no map at all the page still runs its film', () => {
  assert.equal(progressFromMap(0, [], 1000), 0);
  assert.ok(progressFromMap(500, [], 1000) > 0.4);
  assert.ok(progressFromMap(500, null, 1000) > 0.4);
});

test('a Map works as well as an object, since that is what the DOM pass builds', () => {
  const tops = new Map([['arrival', 0], ['brief', 200], ['chase', 400]]);
  const map = actScrollMap(ACTS, tops, 1000);
  assert.equal(map[0].id, 'arrival');
  assert.deepEqual(map[1].pixels, [200, 400]);
});

test('reveal rises with the element and completes before it leaves', () => {
  const viewport = 1000;
  assert.equal(revealAmount({ top: 1200, height: 300, viewport }), 0, 'below the fold');
  const middle = revealAmount({ top: 700, height: 300, viewport });
  assert.ok(middle > 0 && middle < 1, `mid-reveal was ${middle}`);
  assert.equal(revealAmount({ top: 300, height: 300, viewport }), 1, 'fully up');
  assert.equal(
    revealAmount({ top: -600, height: 300, viewport }), 1,
    'an element already off the top is revealed, not reset',
  );
});

test('an element taller than the viewport cannot stall half-revealed', () => {
  const viewport = 800;
  assert.equal(revealAmount({ top: 200, height: 4000, viewport }), 1);
});

test('parallax moves against the scroll and is zero at centre screen', () => {
  const viewport = 1000;
  const centred = parallaxShift({ top: 350, height: 300, viewport, depth: 0.4 });
  assert.ok(Math.abs(centred) < 1e-9, `expected no shift at centre, got ${centred}`);
  const below = parallaxShift({ top: 900, height: 300, viewport, depth: 0.4 });
  const above = parallaxShift({ top: -200, height: 300, viewport, depth: 0.4 });
  assert.ok(below < 0 && above > 0, 'the layer must travel through, not with, the scroll');
  assert.equal(parallaxShift({ top: 900, height: 300, viewport, depth: 0 }), -0);
});

test('the rail is one segment per act, summing to the whole bar', () => {
  const segments = railSegments(ACTS, 0.5);
  assert.equal(segments.length, ACTS.length);
  const total = segments.reduce((carry, segment) => carry + segment.width, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const active = segments.filter((segment) => segment.active);
  assert.equal(active.length, 1, 'exactly one act is current');
  assert.equal(active[0].id, 'cavalry');
  for (const segment of segments) assert.ok(segment.fill >= 0 && segment.fill <= 1);
});

test('rail segments before the reading position are full and after it are empty', () => {
  const segments = railSegments(ACTS, 0.5);
  const byId = Object.fromEntries(segments.map((segment) => [segment.id, segment]));
  assert.equal(byId.chase.fill, 1);
  assert.equal(byId.detonation.fill, 0);
});

test('the rack covers every card across its section and no more', () => {
  assert.deepEqual(rackPosition({ t: 0, count: 11, visible: 1 }), { offset: 0, index: 0 });
  assert.deepEqual(rackPosition({ t: 1, count: 11, visible: 1 }), { offset: 10, index: 10 });
  assert.equal(rackPosition({ t: 0.5, count: 11, visible: 1 }).offset, 5);
  assert.equal(rackPosition({ t: 2, count: 11, visible: 1 }).offset, 10, 'clamped');
  assert.equal(rackPosition({ t: 0.5, count: 1, visible: 1 }).offset, 0, 'a single card does not travel');
});

test('a rack card turns away as it leaves the middle and never inverts', () => {
  const focused = cardTransform(0);
  assert.equal(focused.rotateY, -0, 'the focused card faces the reader');
  assert.equal(focused.opacity, 1);
  assert.equal(focused.scale, 1);

  const left = cardTransform(-1);
  const right = cardTransform(1);
  assert.ok(left.rotateY > 0 && right.rotateY < 0, 'cards turn towards the centre');
  assert.ok(Math.abs(left.rotateY) === Math.abs(right.rotateY), 'symmetric');

  let previous = 1;
  for (let d = 0; d <= 6; d += 0.25) {
    const transform = cardTransform(d);
    assert.ok(transform.opacity <= previous + 1e-9, 'opacity must fall away from focus');
    assert.ok(transform.scale > 0, 'a card never turns inside out');
    assert.ok(Math.abs(transform.rotateY) <= 46, 'and never turns past edge-on');
    previous = transform.opacity;
  }
});
