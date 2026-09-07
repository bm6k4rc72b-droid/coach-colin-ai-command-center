/**
 * The whole chain, against scenes whose answer is known.
 *
 * These are the tests that matter most, because every claim on the console's
 * screen rests on them. Each of the eight scenarios is pushed through exactly
 * the code the browser runs — segmentation, posture, kinematics, the inertial
 * and acoustic channels and the fusion stage — and asserted against what
 * should have happened.
 *
 * The four negatives are the important half. Anybody can write a detector that
 * fires on a fall; the reason this app exists is that it does not fire on
 * somebody doing up a shoelace, sitting down heavily, getting into bed, or
 * dropping their phone on a hard floor. A change that quietly makes the system
 * eager fails here rather than being discovered by a household at 3 a.m.
 *
 * @module tests/aegis/pipeline
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { run } from './harness.mjs';
import { SCENARIOS } from '../../public/aegis/js/demo.js';
import { ALARM, CHECK } from '../../public/aegis/js/fusion.js';

test('every scenario reaches the verdict it is built to test', async (t) => {
  for (const scenario of SCENARIOS) {
    await t.test(`${scenario.id} — ${scenario.title}`, () => {
      const outcome = run(scenario.id);
      if (scenario.kind === 'positive') {
        assert.ok(
          outcome.peak >= ALARM,
          `${scenario.id} should alarm; peaked at ${outcome.peak.toFixed(3)}`,
        );
      } else {
        assert.ok(
          outcome.peak < CHECK,
          `${scenario.id} must not even prompt a question; peaked at ${outcome.peak.toFixed(3)}`,
        );
      }
    });
  }
});

test('sitting down heavily settles at seat height and is never called a fall', () => {
  const outcome = run('sit');
  assert.ok(outcome.states.has('seated'), 'should pass through the seated state');
  assert.ok(!outcome.states.has('down'), 'must never reach the down state');
  // The settled stature has to be recognisably a chair rather than a floor.
  assert.ok(
    outcome.finalStature > 0.42 && outcome.finalStature < 0.78,
    `settled stature ${outcome.finalStature.toFixed(2)} should be in the seat band`,
  );
});

test('a shoelace is down for six seconds and then upright again', () => {
  const outcome = run('lace');
  assert.ok(!outcome.states.has('down'), 'must never reach the down state');
  assert.ok(outcome.finalStature > 0.9, 'should end the scenario standing');
});

test('lying down inside a rest zone is not an event', () => {
  const outcome = run('bed');
  assert.ok(outcome.states.has('resting'), 'should recognise the rest zone');
  assert.ok(!outcome.states.has('down'), 'must never reach the down state');
});

test('a fall in the open is corroborated by more than the camera', () => {
  const outcome = run('fall');
  assert.ok(outcome.states.has('descending'), 'should watch the descent');
  assert.ok(outcome.states.has('down'), 'should settle into the down state');
  assert.ok(outcome.peakVerdict.corroborated, 'should be corroborated');
  assert.ok(
    outcome.peakVerdict.agreeing.length >= 2,
    `expected at least two agreeing channels, got ${outcome.peakVerdict.agreeing.join(', ')}`,
  );
});

test('a fall behind furniture is called on a coasted floor reference', () => {
  const outcome = run('occluded');
  assert.ok(outcome.states.has('down'), 'should reach the down state');
  assert.ok(outcome.sawImputed, 'the floor reference should have been coasted at some point');
  assert.ok(outcome.peakOcclusion > 0.05, 'occlusion should be reported, not zero');
});

test('a slow slump is caught by the dwell rather than by the speed', () => {
  const outcome = run('slump');
  assert.ok(outcome.states.has('down'), 'should reach the down state');
  // The whole point: it never moves fast enough to look like a topple.
  assert.ok(
    outcome.peakRate < 0.85,
    `slump peaked at ${outcome.peakRate.toFixed(2)}/s, which is fast enough to be a topple`,
  );
  assert.ok(outcome.peakVerdict.channels[0].likelihood > 0.8, 'the camera should carry this one');
});

test('a dropped phone is refused, and the refusal is a positive finding', () => {
  const outcome = run('drop');
  const inertial = outcome.peakVerdict.channels.find((c) => c.id === 'inertial');
  assert.ok(outcome.sawInertialImpact, 'the accelerometer should see a real impact');
  assert.ok(outcome.sawInertialAgainst, 'the accelerometer should argue against, not merely stay quiet');
  assert.ok(!outcome.states.has('down'), 'the camera should show somebody standing throughout');
  assert.ok(inertial, 'the inertial channel should be present in the verdict');
});
