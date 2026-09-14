/**
 * The devices that plug in, the sensors that pair, and the head that points.
 *
 * @module tests/black-optic-6/link
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FAMILIES, identify, ROUTES } from '../../public/black-optic-6/js/devices.js';
import { capability, decodeHeartRate, variability } from '../../public/black-optic-6/js/biolink.js';
import { aimError, chooseSubject, DEADBAND, MAX_RATE_DEG, PanTilt } from '../../public/black-optic-6/js/track.js';

/* ---------------------------------------------------------------- devices */

test('a DJI camera in webcam mode is recognised as an ordinary camera', () => {
  for (const label of ['DJI Osmo Pocket 3', 'DJI Action 4', 'Osmo Pocket']) {
    const family = identify(label);
    assert.ok(family, `${label} should be recognised`);
    assert.equal(family.id, 'dji-pocket');
    assert.match(family.route, /USB/);
  }
});

test('capture cards and GoPros are recognised, and nonsense is not', () => {
  assert.equal(identify('Cam Link 4K').id, 'capture');
  assert.equal(identify('GoPro HERO12').id, 'gopro');
  assert.equal(identify('Some Unknown Widget'), null);
  assert.equal(identify(undefined), null);
});

test('every family and route explains how the video reaches the console', () => {
  for (const family of FAMILIES) {
    assert.ok(family.route && family.note.length > 30, `${family.id} needs a route and a note`);
  }
  for (const route of ROUTES) {
    assert.ok(route.note.length > 30, `${route.id} needs an explanation`);
  }
});

test('cloud-only cameras are marked blocked rather than offered', () => {
  const cloud = ROUTES.find((route) => route.id === 'cloud-only');
  assert.equal(cloud.state, 'BLOCKED');
  assert.equal(cloud.route, 'None');
});

/* ---------------------------------------------------------------- biolink */

/**
 * Build a heart rate packet.
 *
 * @param {object} options Packet contents.
 * @returns {DataView} The encoded characteristic value.
 */
function packet({ bpm = 72, wide = false, rr = [], contact = null }) {
  let flags = 0;
  if (wide) flags |= 0x01;
  if (contact !== null) flags |= 0x04 | (contact ? 0x02 : 0);
  if (rr.length) flags |= 0x10;
  const size = 1 + (wide ? 2 : 1) + rr.length * 2;
  const view = new DataView(new ArrayBuffer(size));
  view.setUint8(0, flags);
  let offset = 1;
  if (wide) {
    view.setUint16(offset, bpm, true);
    offset += 2;
  } else {
    view.setUint8(offset, bpm);
    offset += 1;
  }
  for (const interval of rr) {
    view.setUint16(offset, Math.round((interval / 1000) * 1024), true);
    offset += 2;
  }
  return view;
}

test('an eight-bit and a sixteen-bit rate both decode', () => {
  assert.equal(decodeHeartRate(packet({ bpm: 72 })).bpm, 72);
  assert.equal(decodeHeartRate(packet({ bpm: 300, wide: true })).bpm, 300);
});

test('beat intervals decode to milliseconds', () => {
  const decoded = decodeHeartRate(packet({ bpm: 60, rr: [1000, 980] }));
  assert.equal(decoded.rrMs.length, 2);
  assert.ok(Math.abs(decoded.rrMs[0] - 1000) <= 1);
  assert.ok(Math.abs(decoded.rrMs[1] - 980) <= 1);
});

test('contact is reported only when the sensor claims to support it', () => {
  assert.equal(decodeHeartRate(packet({ bpm: 70 })).contact, null, 'unsupported is not "poor contact"');
  assert.equal(decodeHeartRate(packet({ bpm: 70, contact: true })).contact, true);
  assert.equal(decodeHeartRate(packet({ bpm: 70, contact: false })).contact, false);
});

test('variability needs enough clean beats and rejects impossible ones', () => {
  assert.equal(variability([800, 810]).rmssdMs, null, 'two beats is not a measurement');
  assert.equal(variability([800, 50, 5000, 810]).rmssdMs, null, 'out-of-range intervals are dropped');
  const steady = variability([800, 800, 800, 800]);
  assert.equal(steady.rmssdMs, 0);
  assert.ok(variability([800, 850, 790, 860]).rmssdMs > 0);
});

test('the wearable capability names what pairs and what never will', () => {
  const capable = capability();
  assert.equal(typeof capable.available, 'boolean');
  assert.ok(capable.works.some((line) => /strap/i.test(line)));
  assert.ok(capable.doesNot.some((line) => /Apple Watch/i.test(line)));
  assert.ok(
    capable.doesNot.some((line) => /stress|readiness|strain/i.test(line)),
    'vendor wellness scores are not measurements and must be listed as unavailable',
  );
});

/* ------------------------------------------------------------------ track */

const FRAME = { width: 320, height: 240 };

test('aim error is zero at the centre and signed toward the edges', () => {
  assert.equal(aimError({ x: 140, y: 100, width: 40, height: 40 }, FRAME).magnitude, 0);
  assert.ok(aimError({ x: 280, y: 100, width: 40, height: 40 }, FRAME).x > 0.7);
  assert.ok(aimError({ x: 0, y: 100, width: 40, height: 40 }, FRAME).x < -0.7);
  assert.ok(aimError({ x: 140, y: 0, width: 40, height: 40 }, FRAME).y < -0.7);
});

test('a centred subject produces no movement', () => {
  const head = new PanTilt();
  const command = head.step({ x: DEADBAND / 2, y: 0 }, 0.1);
  assert.equal(command.moving, false);
  assert.equal(command.pan, 0);
  assert.equal(command.tilt, 0);
});

test('an off-centre subject is corrected toward the centre, at a bounded rate', () => {
  const head = new PanTilt();
  let command;
  for (let i = 0; i < 10; i += 1) command = head.step({ x: 0.8, y: -0.5 }, 0.1);
  assert.ok(command.moving);
  assert.ok(command.pan > 0, 'a subject to the right pans right');
  assert.ok(command.tilt < 0, 'a subject above tilts up');
  assert.ok(Math.abs(command.pan) <= MAX_RATE_DEG);
  assert.ok(Math.abs(command.tilt) <= MAX_RATE_DEG);
});

test('the command slews rather than jumping, so the picture stays watchable', () => {
  const head = new PanTilt();
  const first = head.step({ x: 1, y: 1 }, 0.02);
  assert.ok(Math.abs(first.pan) < MAX_RATE_DEG, 'a single short step cannot reach full rate');
});

test('losing the subject stops the head instead of letting it hunt', () => {
  const head = new PanTilt();
  for (let i = 0; i < 5; i += 1) head.step({ x: 0.8, y: 0 }, 0.1);
  const stopped = head.step(null, 0.1);
  assert.equal(stopped.pan, 0);
  assert.equal(stopped.tilt, 0);
  assert.equal(stopped.moving, false);
});

test('the controller has no notion of where a subject will be', () => {
  // The refusal is structural, not a comment: nothing in the loop extrapolates
  // target motion, so there is no lead calculation to repurpose.
  const source = PanTilt.prototype.step.toString() + PanTilt.toString();
  assert.doesNotMatch(source, /lead|intercept|predict|ballist|muzzle|projectile|fire/i);
});

test('the head keeps following one subject rather than switching every frame', () => {
  const contacts = [
    { id: 1, box: { x: 0, y: 0, width: 20, height: 40 }, ageSec: 5 },
    { id: 2, box: { x: 100, y: 0, width: 60, height: 80 }, ageSec: 0.2 },
  ];
  assert.equal(chooseSubject(contacts, 1).id, 1, 'a bigger newcomer must not steal the lock');
  assert.equal(chooseSubject(contacts, null).id, 1, 'with no lock, presence beats size');
  assert.equal(chooseSubject([], 1), null);
});
