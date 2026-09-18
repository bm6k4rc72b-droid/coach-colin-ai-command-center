/**
 * The airframe, and the claim that it is not secretly flying itself.
 *
 * Almost every assertion here is a test that the plant is *bad* at something. An
 * airframe that hovers under constant throttle would make every result in this
 * app meaningless, so the first tests establish that this one does not, and the
 * rest check that the physics is the physics rather than a stabiliser wearing a
 * physics costume.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_AIRFRAME, Quadrotor, ROTORS } from '../../public/makecns-fly/js/plant.js';
import { TEACHER_GAINS, teacherCommand, teacherParameterCount } from '../../public/makecns-fly/js/teacher.js';

const hover = (q) => {
  const u = q.hoverThrottle;
  return [u, u, u, u];
};

test('constant throttle does not hover — it tumbles, and quickly', () => {
  const q = new Quadrotor({ seed: 4 });
  const command = [0.56, 0.56, 0.56, 0.56];
  let state = q.state();
  for (let i = 0; i < 6000 && !state.crashed; i += 1) state = q.step(command, 0.001);
  assert.ok(state.crashed, 'an untrimmed quadrotor under open-loop throttle must not stay up');
  assert.ok(state.t < 2, `it should fall in well under two seconds, took ${state.t}`);
  assert.match(state.crashReason, /tumbled/);
});

test('the hover throttle is the throttle at which thrust equals weight', () => {
  const q = new Quadrotor({ seed: 1, trimErrorPct: 0, gustMs: 0 });
  const a = q.airframe;
  const thrust = 4 * a.kThrust * q.hoverThrottle ** 2;
  assert.ok(Math.abs(thrust - a.massKg * a.gravityMs2) < 1e-6);
});

test('the airframe is not trimmed, and says so with numbers', () => {
  const q = new Quadrotor({ seed: 7 });
  const imperfections = q.imperfections();
  assert.equal(imperfections.rotorTrimPct.length, 4);
  assert.ok(Math.abs(imperfections.worstRotorPct) > 0.5, 'rotors must actually differ');
  assert.ok(imperfections.timeToFallMs > 0 && imperfections.timeToFallMs < 10000);
  assert.ok(['centre of mass', 'rotor spread'].includes(imperfections.dominant));
  const balanced = new Quadrotor({ seed: 7, trimErrorPct: 0, comOffsetM: 0 });
  assert.equal(balanced.timeToFallMs, Number.POSITIVE_INFINITY,
    'a perfectly balanced airframe has no uncorrected torque, and the figure must say so');
  assert.ok(imperfections.gustMs > 0, 'the air is not still by default');
});

test('the same seed flies the same flight, so a rerun is a check', () => {
  const fly = () => {
    const q = new Quadrotor({ seed: 19 });
    let state = q.state();
    for (let i = 0; i < 1500; i += 1) state = q.step(teacherCommand(state, 1, q.hoverThrottle), 0.001);
    return state;
  };
  const a = fly();
  const b = fly();
  assert.equal(a.pos.z, b.pos.z);
  assert.equal(a.att.roll, b.att.roll);
});

test('motor lag means the command is not the thrust', () => {
  const q = new Quadrotor({ seed: 3, gustMs: 0 });
  q.step([1, 1, 1, 1], 0.001);
  assert.ok(q.omega[0] < 0.2, 'rotors cannot reach full speed in one millisecond');
  for (let i = 0; i < 400; i += 1) q.step([1, 1, 1, 1], 0.001);
  assert.ok(q.omega[0] > 0.9, 'and they must get there eventually');
});

test('differential throttle produces rotation in the expected direction', () => {
  const q = new Quadrotor({ seed: 5, trimErrorPct: 0, gustMs: 0, comOffsetM: 0 });
  const u = q.hoverThrottle;
  const command = new Array(4).fill(u);
  command[ROTORS.indexOf('left')] = u + 0.05;
  command[ROTORS.indexOf('right')] = u - 0.05;
  let state = q.state();
  for (let i = 0; i < 200; i += 1) state = q.step(command, 0.001);
  assert.ok(state.att.roll > 0, 'more thrust on the left must roll one way, consistently');
});

test('tilting costs lift, which is why attitude matters to altitude', () => {
  // Balanced and still, so the only difference between the two runs is the tilt.
  const level = new Quadrotor({ seed: 2, trimErrorPct: 0, gustMs: 0, comOffsetM: 0 });
  const u = level.hoverThrottle + 0.05;
  let state = level.state();
  for (let i = 0; i < 500; i += 1) state = level.step([u, u, u, u], 0.001);
  const climbed = state.pos.z;

  const tilted = new Quadrotor({ seed: 2, trimErrorPct: 0, gustMs: 0, comOffsetM: 0 });
  tilted.att.roll = 0.5;
  let tiltedState = tilted.state();
  for (let i = 0; i < 500; i += 1) tiltedState = tilted.step([u, u, u, u], 0.001);
  assert.ok(tiltedState.pos.z < climbed, 'a tilted craft must climb less than a level one');
});

test('the teacher holds altitude on the airframe it was placed for', () => {
  const q = new Quadrotor({ seed: 4 });
  let state = q.state();
  for (let i = 0; i < 12000 && !state.crashed; i += 1) {
    state = q.step(teacherCommand(state, 1.0, q.hoverThrottle), 0.001);
  }
  assert.ok(!state.crashed, `the reference controller must fly: ${state.crashReason}`);
  assert.ok(Math.abs(state.pos.z - 1.0) < 0.1, `altitude ${state.pos.z} should be near 1.0 m`);
  assert.ok(state.tiltRad < 0.35, `tilt ${state.tiltRad} rad should stay modest`);
});

test('the teacher does not live on its clamp — if it did, its output would be a square wave', () => {
  const q = new Quadrotor({ seed: 4 });
  let state = q.state();
  let onRail = 0;
  let samples = 0;
  for (let i = 0; i < 12000 && !state.crashed; i += 1) {
    const command = teacherCommand(state, 1.0, q.hoverThrottle);
    if (i % 5 === 0) {
      samples += 1;
      const rollTerm = (command[ROTORS.indexOf('left')] - command[ROTORS.indexOf('right')]) / 2;
      if (Math.abs(Math.abs(rollTerm) - TEACHER_GAINS.attitudeClamp) < 1e-6) onRail += 1;
    }
    state = q.step(command, 0.001);
  }
  assert.ok(onRail / samples < 0.02, `teacher saturated on ${((onRail / samples) * 100).toFixed(0)}% of samples`);
});

test('the teacher is small enough to count', () => {
  assert.equal(teacherParameterCount(), 5);
  assert.ok(TEACHER_GAINS.attitudeP > 0 && TEACHER_GAINS.attitudeD > 0);
});

test('a landing is not a crash but an arrival is', () => {
  const gentle = new Quadrotor({ seed: 1, gustMs: 0, trimErrorPct: 0 });
  gentle.pos.z = 0.05;
  gentle.vel.z = -0.2;
  gentle.airborne = true;
  let state = gentle.state();
  for (let i = 0; i < 400; i += 1) state = gentle.step([0, 0, 0, 0], 0.001);
  assert.ok(!state.crashed, 'touching down slowly is landing');

  const hard = new Quadrotor({ seed: 1, gustMs: 0, trimErrorPct: 0 });
  hard.pos.z = 0.05;
  hard.vel.z = -DEFAULT_AIRFRAME.crashSpeedMs * 2;
  hard.airborne = true;
  let hardState = hard.state();
  for (let i = 0; i < 400 && !hardState.crashed; i += 1) hardState = hard.step([0, 0, 0, 0], 0.001);
  assert.ok(hardState.crashed, 'arriving fast is not');
});

test('there is a ceiling, and leaving it is a failure rather than a success', () => {
  const q = new Quadrotor({ seed: 1, gustMs: 0, trimErrorPct: 0 });
  let state = q.state();
  for (let i = 0; i < 20000 && !state.crashed; i += 1) state = q.step([1, 1, 1, 1], 0.001);
  assert.ok(state.crashed);
  assert.match(state.crashReason, /left the volume|tumbled/);
});
