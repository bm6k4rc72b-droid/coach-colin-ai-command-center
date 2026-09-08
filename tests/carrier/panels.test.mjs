/**
 * The arithmetic under the diagrams.
 *
 * Panels are drawings, and most of a drawing cannot be asserted about. What can
 * — and what the frames actually claim — is the model underneath: that
 * containment moves the kerb reading below the noise floor, that a patrol
 * repeats, that the rain is the same on every machine.
 *
 * @module tests/carrier/panels
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { leakField, rssiAt, NOISE_FLOOR_DBM } from '../../public/carrier/js/panels/heatmap.js';
import { occupantDots, patrolAt } from '../../public/carrier/js/panels/floorplan.js';
import { subcarrierLevels } from '../../public/carrier/js/panels/sniffer.js';
import { BONES, JOINTS, walkPose } from '../../public/carrier/js/panels/pose.js';
import { coverRect, gridCells } from '../../public/carrier/js/panels/frame.js';
import { MAX_DEPTH, PANELS, drawPanel } from '../../public/carrier/js/panels/index.js';
import { rainCells } from '../../public/carrier/js/rain.js';
import { NIGHTOWL, dbmColour } from '../../public/carrier/js/theme.js';
import { stubContext } from './stub.mjs';

/** The plan the containment scene draws. */
const PLAN = { cols: 44, rows: 26, spanM: 46, ap: { x: 0.42, y: 0.34 }, facadeY: 0.62 };

test('signal falls with distance and with anything in the way', () => {
  assert.ok(rssiAt(20, 10) < rssiAt(20, 2), 'further must be quieter');
  assert.ok(Math.abs(rssiAt(20, 2, 0) - rssiAt(20, 2, 10) - 10) < 1e-9, 'attenuation subtracts directly');
  assert.ok(Math.abs(rssiAt(20, 2) - rssiAt(20, 4) - 6) < 0.05, 'doubling distance costs about 6 dB');
});

test('the hardened side puts the kerb below the noise floor and the default does not', () => {
  const leaking = leakField({ ...PLAN, txDbm: 20, filmDb: 3 });
  const contained = leakField({ ...PLAN, txDbm: 12, filmDb: 36 });
  assert.ok(leaking.kerbDbm > NOISE_FLOOR_DBM, 'the whole point of the left field is that it leaks');
  assert.ok(contained.kerbDbm <= NOISE_FLOOR_DBM, 'the whole point of the right field is that it does not');
  assert.ok(leaking.kerbDbm - contained.kerbDbm > 30, 'the delta is the argument');
});

test('the field is one sample per cell and hotter near the access point', () => {
  const field = leakField({ ...PLAN, txDbm: 20, filmDb: 3 });
  assert.equal(field.cells.length, PLAN.cols * PLAN.rows);
  const nearAp = field.cells[Math.round(PLAN.rows * 0.34) * PLAN.cols + Math.round(PLAN.cols * 0.42)];
  const corner = field.cells[(PLAN.rows - 1) * PLAN.cols];
  assert.ok(nearAp > corner + 10);
});

test('the colour scale is monotone from noise floor to hotspot', () => {
  assert.notEqual(dbmColour(-90), dbmColour(-40));
  assert.equal(dbmColour(-200), dbmColour(-95), 'below the scale clamps');
  assert.equal(dbmColour(0), dbmColour(-30), 'above the scale clamps');
});

test('the patrol walks out and back, and repeats exactly', () => {
  const points = [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 1, y: 0 }, { id: 'C', x: 2, y: 0 }];
  const cycle = 4 * 2.4;
  const at = (t) => patrolAt(points, t, 2.4);
  assert.deepEqual(
    [at(1).x, at(1).y],
    [at(1 + cycle).x, at(1 + cycle).y],
    'a loop that does not close reads as a glitch',
  );
  assert.ok(at(6).x > at(8).x, 'the guard turns around rather than teleporting');
  assert.ok(at(0.5).from && at(0.5).to, 'the leg is always named');
});

test('occupants are placed inside their room and do not reshuffle', () => {
  const room = { id: 'conf', x: 0.2, y: 0.1, w: 0.4, h: 0.3 };
  const dots = occupantDots(room, 4);
  assert.equal(dots.length, 4);
  for (const dot of dots) {
    assert.ok(dot.x >= room.x && dot.x <= room.x + room.w, 'occupant outside its room');
    assert.ok(dot.y >= room.y && dot.y <= room.y + room.h, 'occupant outside its room');
  }
  assert.deepEqual(dots, occupantDots(room, 4));
});

test('subcarrier levels stay in range and move with time', () => {
  const now = subcarrierLevels(56, 1, 1);
  const later = subcarrierLevels(56, 4, 1);
  assert.equal(now.length, 56);
  assert.ok(now.every((v) => v >= 0 && v <= 1));
  assert.notDeepEqual(now, later, 'a channel response that never changes carries no information');
  assert.deepEqual(now, subcarrierLevels(56, 1, 1), 'the same second must draw the same response');
});

test('the pose has every joint, every bone connects two of them, and feet stay down', () => {
  const pose = walkPose(0.7);
  assert.equal(Object.keys(pose).length, JOINTS.length);
  for (const joint of JOINTS) assert.ok(pose[joint], `${joint} missing`);
  for (const [a, b] of BONES) {
    assert.ok(pose[a] && pose[b], `bone ${a}-${b} refers to a joint that does not exist`);
  }
  for (let t = 0; t < 4; t += 0.1) {
    const walking = walkPose(t);
    assert.ok(walking.rAnkle.y >= 0 && walking.lAnkle.y >= 0, 'a foot went through the floor');
    assert.ok(walking.head.y > walking.neck.y, 'the head must sit above the neck');
  }
});

test('the rain is the same on every machine and moves over time', () => {
  const now = rainCells({ cols: 8, rows: 12, t: 2, seed: 4 });
  assert.deepEqual(now, rainCells({ cols: 8, rows: 12, t: 2, seed: 4 }));
  assert.notDeepEqual(now, rainCells({ cols: 8, rows: 12, t: 9, seed: 4 }));
  assert.ok(now.every((cell) => cell.alpha > 0 && cell.alpha <= 1));
});

test('cover fitting fills the box and stays centred', () => {
  const box = { x: 10, y: 20, w: 400, h: 300 };
  const rect = coverRect(1920, 1080, box);
  assert.ok(rect.w >= box.w - 1e-9 && rect.h >= box.h - 1e-9, 'cover must not leave a gap');
  assert.ok(Math.abs((rect.x + rect.w / 2) - (box.x + box.w / 2)) < 1e-9);
  assert.deepEqual(coverRect(0, 0, box), { ...box }, 'unknown dimensions fall back to the box');
});

test('grid cells tile their box with the gap between them', () => {
  const cells = gridCells({ x: 0, y: 0, w: 100, h: 100 }, 2, 2, 10);
  assert.equal(cells.length, 4);
  assert.equal(cells[0].w, 45);
  assert.equal(cells[1].x, 55);
});

test('every registered panel draws something and an unknown type draws nothing', () => {
  const box = { x: 0, y: 0, w: 800, h: 600 };
  for (const type of Object.keys(PANELS)) {
    const ctx = stubContext();
    drawPanel(ctx, box, { type }, 1.5, { theme: NIGHTOWL, scale: 1 }, 0);
    assert.ok(ctx.calls.length > 20, `${type} drew almost nothing`);
  }
  const quiet = stubContext();
  drawPanel(quiet, box, { type: 'telepathy' }, 0, { theme: NIGHTOWL, scale: 1 });
  assert.equal(quiet.calls.length, 0);
});

test('a grid draws its cells, and self-nesting stops rather than recursing forever', () => {
  const box = { x: 0, y: 0, w: 800, h: 600 };
  const nested = stubContext();
  drawPanel(nested, box, {
    type: 'grid',
    cols: 2,
    cells: [{ type: 'pose', mode: 'skeleton' }, { type: 'sniffer' }],
  }, 1, { theme: NIGHTOWL, scale: 1 });
  assert.ok(nested.calls.length > 40);

  /** A grid that contains itself — the shape a hand-edited script can reach. */
  const loop = { type: 'grid', cols: 1, cells: [] };
  loop.cells.push(loop);
  const bounded = stubContext();
  drawPanel(bounded, box, loop, 0, { theme: NIGHTOWL, scale: 1 });
  assert.ok(bounded.calls.length < 10, 'nesting must bottom out');
  assert.ok(MAX_DEPTH >= 2);
});
