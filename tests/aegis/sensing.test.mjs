/**
 * The three channels, one at a time, against signals whose answer is known.
 *
 * The scenario tests prove the chain works end to end. These prove that each
 * channel is measuring the thing it says it is measuring, which is what makes
 * the reasons on the console's screen true rather than merely plausible.
 *
 * @module tests/aegis/sensing
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { BREATH_FLOOR, IMPACT_G, analyseInertial, angleBetween, breathing, magnitudeG } from '../../public/aegis/js/inertial.js';
import { ONSET_RATIO, analyseAcoustic, bands } from '../../public/aegis/js/acoustic.js';
import { AXIS_MIN_ELONGATION, FloorModel, bottomClipped, buried, principalAxis, readPosture } from '../../public/aegis/js/posture.js';
import { FallMachine, inside } from '../../public/aegis/js/kinematics.js';
import { clean, createField, regions, segment, updateField } from '../../public/aegis/js/silhouette.js';

const G = 9.80665;

/**
 * Build a stretch of accelerometer samples.
 *
 * @param {object} options How to build it.
 * @param {number} options.seconds How long.
 * @param {(t: number) => {ax: number, ay: number, az: number}} options.at The signal.
 * @param {number} [options.rate] Samples per second.
 * @returns {{t: number, ax: number, ay: number, az: number}[]} The samples.
 */
function samples({ seconds, at, rate = 50 }) {
  const out = [];
  for (let i = 0; i <= seconds * rate; i += 1) {
    const t = i / rate;
    out.push({ t: t * 1000, ...at(t) });
  }
  return out;
}

/* ------------------------------------------------------------------ inertial */

test('magnitude and attitude are read the way the physics says', () => {
  assert.ok(Math.abs(magnitudeG({ ax: 0, ay: G, az: 0 }) - 1) < 1e-9);
  assert.ok(Math.abs(angleBetween({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }) - 90) < 1e-9);
  assert.equal(angleBetween({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 0);
});

test('a still person is told apart from a still object by their breathing', () => {
  const person = samples({
    seconds: 6,
    at: (t) => {
      const breath = 1 + 0.006 * Math.sin(t * 2 * Math.PI * 0.24);
      return { ax: 0.4 * breath, ay: G * breath, az: 0.1 * breath };
    },
  });
  const object = samples({ seconds: 6, at: () => ({ ax: 0.4, ay: G, az: 0.1 }) });
  const alive = breathing(person);
  const dead = breathing(object);
  assert.ok(alive.detected, `breathing should be found; rms ${alive.rms.toFixed(5)}`);
  assert.ok(alive.rateHz > 0.15 && alive.rateHz < 0.4, `rate came back at ${alive.rateHz.toFixed(2)} Hz`);
  assert.ok(!dead.detected, 'a rigid signal is not a resting body');
  assert.ok(dead.rms < BREATH_FLOOR);
});

test('a fall is the dip, the spike, the turn and the silence together', () => {
  const fall = samples({
    seconds: 8,
    at: (t) => {
      if (t < 3) return { ax: 0.2, ay: G, az: 0 };
      if (t < 3.3) return { ax: 0.1, ay: G * 0.35, az: 0 };
      if (t < 3.4) return { ax: G * 2, ay: G * 3.4, az: G * 1.2 };
      const breath = 1 + 0.006 * Math.sin(t * 2 * Math.PI * 0.24);
      return { ax: G * 0.95 * breath, ay: G * 0.28 * breath, az: 0.1 };
    },
  });
  const reading = analyseInertial(fall, { nowMs: 8000 });
  assert.ok(reading.impact.found && reading.impact.peakG > IMPACT_G);
  assert.ok(reading.freefall.found, 'the unloading before contact should be seen');
  assert.ok(reading.tilt.turned, `orientation changed by only ${reading.tilt.degrees.toFixed(0)}°`);
  assert.ok(reading.after.still);
  assert.ok(reading.breath.detected, 'a fallen person is still breathing');
  assert.equal(reading.against, 0, 'nothing here argues against a fall');
  assert.ok(reading.likelihood > 0.7, `likelihood came back at ${reading.likelihood.toFixed(2)}`);
});

test('a device set down hard argues against, rather than staying quiet', () => {
  const dropped = samples({
    seconds: 8,
    at: (t) => {
      if (t < 3) return { ax: 0.2, ay: G, az: 0 };
      if (t < 3.3) return { ax: 0.05, ay: G * 0.2, az: 0 };
      if (t < 3.4) return { ax: G * 0.4, ay: G * 4.2, az: G * 0.3 };
      return { ax: 0.2, ay: G * 0.999, az: 0.02 };
    },
  });
  const reading = analyseInertial(dropped, { nowMs: 8000 });
  assert.ok(reading.impact.found, 'the impact is real');
  assert.ok(reading.after.still);
  assert.ok(!reading.breath.detected, 'nothing alive is holding it');
  assert.ok(reading.against > 0.5, 'this is a finding, not an absence of one');
  assert.ok(reading.likelihood < 0.35);
});

test('sitting down hard makes a spike without turning over', () => {
  const sat = samples({
    seconds: 8,
    at: (t) => {
      if (t < 3.35) return { ax: 0.2, ay: G, az: 0 };
      if (t < 3.45) return { ax: 0.3, ay: G * 2.6, az: 0.2 };
      const breath = 1 + 0.006 * Math.sin(t * 2 * Math.PI * 0.24);
      return { ax: 0.2 * breath, ay: G * breath, az: 0 };
    },
  });
  const reading = analyseInertial(sat, { nowMs: 8000 });
  assert.ok(reading.impact.found);
  assert.ok(!reading.tilt.turned, 'somebody sitting down has not turned over');
  assert.ok(reading.against > 0, 'unchanged orientation is evidence against a fall');
  assert.ok(reading.likelihood < 0.5);
});

test('no data is reported as no data rather than as no fall', () => {
  const empty = analyseInertial([]);
  assert.equal(empty.available, false);
  assert.equal(empty.likelihood, 0);
  assert.equal(empty.against, 0);
});

/* ------------------------------------------------------------------ acoustic */

test('band energies separate a dull thump from a bright clatter', () => {
  const rate = 44100;
  const bins = 512;
  const low = new Float32Array(bins).fill(-90);
  const high = new Float32Array(bins).fill(-90);
  for (let i = 0; i < bins; i += 1) {
    const hz = ((i + 0.5) * (rate / 2)) / bins;
    if (hz < 400) low[i] = -10;
    if (hz > 3000) high[i] = -10;
  }
  const dull = bands(low, rate);
  const bright = bands(high, rate);
  assert.ok(dull.centroidHz < 500, `dull centroid was ${dull.centroidHz.toFixed(0)} Hz`);
  assert.ok(bright.centroidHz > 3000, `bright centroid was ${bright.centroidHz.toFixed(0)} Hz`);
  assert.ok(dull.low > dull.high && bright.high > bright.low);
});

/**
 * Build a stretch of band readings with an optional transient.
 *
 * @param {object} options How to build it.
 * @param {number} [options.at] When the transient happens, in seconds.
 * @param {number} [options.peak] Its low-band energy.
 * @param {number} [options.centroid] Its centroid.
 * @param {number} [options.floorTone] The room's level.
 * @returns {object[]} Readings at 30 Hz.
 */
function room({ at = null, peak = 0.5, centroid = 420, floorTone = 0.001 }) {
  const out = [];
  for (let i = 0; i <= 90; i += 1) {
    const t = i / 30;
    let low = floorTone;
    let centroidHz = 900;
    if (at != null && t >= at && t < at + 1) {
      const envelope = Math.exp(-(t - at) * 11);
      low += peak * envelope;
      centroidHz = centroid;
    }
    out.push({ t: t * 1000, low, mid: low * 0.2, high: low * 0.1, total: low * 1.3, centroidHz });
  }
  return out;
}

test('a quiet room reports a quiet room', () => {
  const reading = analyseAcoustic(room({}), { nowMs: 3000 });
  assert.equal(reading.available, true);
  assert.equal(reading.onset, false);
  assert.equal(reading.likelihood, 0);
});

test('a dull low transient scores; a bright one is argued against', () => {
  const thump = analyseAcoustic(room({ at: 1.2, centroid: 420 }), { nowMs: 3000 });
  const clatter = analyseAcoustic(room({ at: 1.2, centroid: 3200 }), { nowMs: 3000 });
  assert.ok(thump.onset && thump.ratio > ONSET_RATIO);
  assert.ok(thump.likelihood > clatter.likelihood);
  assert.ok(clatter.against > 0, 'something ringing is positive evidence it was an object');
  assert.match(thump.reasons.join(' '), /consistent with a body/i);
});

test('room sound alone can never approach an alarm', () => {
  const loud = analyseAcoustic(room({ at: 1.2, peak: 40, centroid: 300 }), { nowMs: 3000 });
  assert.ok(loud.likelihood <= 0.58, `a very loud thump still reached only ${loud.likelihood.toFixed(2)}`);
});

/* ------------------------------------------------------------------- posture */

test('a principal axis is only reported when the shape has one', () => {
  const upright = principalAxis({ mxx: 4, myy: 400, mxy: 0 });
  const flat = principalAxis({ mxx: 400, myy: 4, mxy: 0 });
  const blob = principalAxis({ mxx: 100, myy: 105, mxy: 2 });
  assert.ok(upright.torsoDeg < 3, `upright read ${upright.torsoDeg}°`);
  assert.ok(flat.torsoDeg > 87, `flat read ${flat.torsoDeg}°`);
  assert.equal(blob.torsoDeg, null, 'a round blob has no meaningful axis');
  assert.ok(blob.elongation < AXIS_MIN_ELONGATION);
});

test('a body in front of furniture is not treated as behind it', () => {
  const furniture = [{ x: 0.0, y: 0.58, w: 0.3, h: 0.28 }];
  const behind = { minX: 10, maxX: 50, minY: 20, maxY: 112 };
  const inFront = { minX: 10, maxX: 50, minY: 40, maxY: 178 };
  assert.equal(bottomClipped(behind, furniture, 256, 192), true);
  assert.equal(bottomClipped(inFront, furniture, 256, 192), false, 'below the piece is in front of it');
  assert.equal(bottomClipped(inFront, [], 256, 192), false);
  // The frame's own bottom edge is an occluder too.
  assert.equal(bottomClipped({ minX: 10, maxX: 50, minY: 40, maxY: 191 }, [], 256, 192), true);
});

test('being buried is a fact about how much is showing, not about rows', () => {
  assert.equal(buried(10, 120), true);
  assert.equal(buried(60, 120), false);
  assert.equal(buried(10, 0), false, 'with no scale there is nothing to be buried against');
});

test('the scale model rides the top of its samples, not the middle', () => {
  const floor = new FloorModel();
  // Twenty honest standing frames, then ten of somebody crouching. A fit
  // through the middle would learn a standing height between the two.
  for (let i = 0; i < 20; i += 1) floor.observeStanding(160 + (i % 4), 120, 100, i * 100);
  for (let i = 0; i < 10; i += 1) floor.observeStanding(160 + (i % 4), 70, 100, 2000 + i * 100);
  assert.ok(
    floor.extentAt(160) > 110,
    `standing height collapsed to ${floor.extentAt(160).toFixed(0)} px after some short frames`,
  );
});

test('a coasted floor reference is spent by movement, not by time', () => {
  const floor = new FloorModel();
  for (let i = 0; i < 16; i += 1) floor.observeStanding(160, 120, 100, i * 100);
  const still = floor.reference(null, 90000, 100);
  assert.equal(still.imputed, true);
  assert.equal(still.row, 160);
  assert.ok(still.drift < 0.01, 'somebody who has not moved has not spent their reference');
  const wandered = floor.reference(null, 2000, 100 + 150);
  assert.ok(wandered.drift > 1, 'somebody a hundred and fifty pixels along has');
});

/* ---------------------------------------------------------------- kinematics */

test('a zone test is a zone test', () => {
  const zones = [{ x: 0.6, y: 0.5, w: 0.3, h: 0.4 }];
  assert.equal(inside(0.7, 0.6, zones), true);
  assert.equal(inside(0.5, 0.6, zones), false);
  assert.equal(inside(0.7, 0.6, []), false);
});

/**
 * Feed the state machine a posture directly.
 *
 * @param {FallMachine} machine The machine.
 * @param {number} timeMs When.
 * @param {number} stature How tall they are now.
 * @param {object} [over] Posture overrides.
 * @returns {object} The reading.
 */
function feed(machine, timeMs, stature, over = {}) {
  return machine.update({
    present: true,
    headRow: 100 - stature * 100,
    footRow: 100,
    centreCol: 128,
    stature,
    torsoDeg: stature > 0.7 ? 4 : 70,
    elongation: 2,
    aspect: 2,
    occlusion: 0,
    imputed: false,
    headHidden: false,
    confidence: 1,
    note: 'clear view',
    ...over,
  }, { timeMs, width: 256, height: 192 });
}

test('somebody discovered on the floor is never dressed up as a watched fall', () => {
  const machine = new FallMachine({ dwellMs: 2000 });
  let reading = feed(machine, 0, 0.18);
  assert.equal(reading.state, 'found-down');
  assert.equal(reading.transitObserved, false);
  reading = feed(machine, 5000, 0.18);
  assert.ok(reading.likelihood <= 0.66, 'an unwatched discovery is capped');
  assert.match(reading.reasons.join(' '), /not observed|was not seen/i);
});

test('a watched descent that stays down is called a fall', () => {
  const machine = new FallMachine({ dwellMs: 2000 });
  for (let t = 0; t < 2000; t += 100) feed(machine, t, 1);
  feed(machine, 2100, 0.6);
  feed(machine, 2200, 0.2);
  let reading = feed(machine, 2300, 0.18);
  assert.ok(['descending', 'grounded'].includes(reading.state), `state was ${reading.state}`);
  assert.equal(reading.transitObserved, true);
  for (let t = 2400; t < 7000; t += 100) reading = feed(machine, t, 0.18);
  assert.equal(reading.state, 'down');
  assert.ok(reading.likelihood > 0.85);
});

test('a weak measurement is downgraded and says why', () => {
  const machine = new FallMachine({ dwellMs: 1000 });
  for (let t = 0; t < 2000; t += 100) feed(machine, t, 1);
  feed(machine, 2100, 0.2);
  let reading;
  for (let t = 2200; t < 6000; t += 100) {
    reading = feed(machine, t, 0.18, { imputed: true, occlusion: 0.4, confidence: 0.4 });
  }
  assert.equal(reading.degraded, true);
  assert.match(reading.reasons.join(' '), /imputed/i);
});

/* --------------------------------------------------------------- silhouette */

test('a still body is not absorbed into the background while it is held', () => {
  const width = 48;
  const height = 48;
  /**
   * A frame with a bright square in it.
   *
   * @param {boolean} withBody Whether to draw the body.
   * @returns {object} An ImageData-shaped frame.
   */
  const frame = (withBody) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const x = i % width;
      const y = (i - x) / width;
      const body = withBody && x > 16 && x < 32 && y > 8 && y < 40;
      const value = body ? 220 : 60;
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
    return { width, height, data };
  };

  const field = createField(width, height);
  for (let i = 0; i < 40; i += 1) updateField(field, frame(false));
  const hold = new Uint8Array(width * height);
  for (let y = 6; y < 42; y += 1) for (let x = 14; x < 34; x += 1) hold[y * width + x] = 1;
  // Two hundred frames of somebody lying perfectly still: exactly the case the
  // hold mask exists for, and exactly the case where a system that loses them
  // is at its most dangerous.
  for (let i = 0; i < 200; i += 1) updateField(field, frame(true), { hold });
  const { mask } = segment(field, frame(true), { sensitivity: 0.5 });
  const found = regions(clean(mask, width, height), width, height, 20);
  assert.equal(found.length, 1, 'the body should still be a single region after 200 frames');
  assert.ok(found[0].area > 300, `only ${found[0].area} pixels survived`);
});

test('a shadow is rejected and an object is not', () => {
  const width = 32;
  const height = 32;
  /**
   * A frame that is optionally darkened over part of itself.
   *
   * @param {number} scale How much darker, as a ratio.
   * @param {boolean} tint Whether to change the colour ratios too.
   * @returns {object} An ImageData-shaped frame.
   */
  const frame = (scale = 1, tint = false) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const x = i % width;
      const shaded = x > 12 && x < 24;
      const factor = shaded ? scale : 1;
      data[i * 4] = 140 * factor * (tint && shaded ? 0.5 : 1);
      data[i * 4 + 1] = 120 * factor;
      data[i * 4 + 2] = 100 * factor;
      data[i * 4 + 3] = 255;
    }
    return { width, height, data };
  };
  const field = createField(width, height);
  for (let i = 0; i < 40; i += 1) updateField(field, frame());
  const shadow = segment(field, frame(0.62), { sensitivity: 0.5 });
  const object = segment(field, frame(0.62, true), { sensitivity: 0.5 });
  assert.ok(shadow.shadows > 200, 'a uniform darkening should be recognised as shadow');
  assert.ok(shadow.count < object.count, 'an object that changes the colour ratios is not rejected');
});

test('a large region is found without overflowing anything', () => {
  const width = 200;
  const height = 200;
  const mask = new Uint8Array(width * height).fill(1);
  const found = regions(mask, width, height, 10);
  assert.equal(found.length, 1);
  assert.equal(found[0].area, width * height);
  assert.equal(found[0].minX, 0);
  assert.equal(found[0].maxY, height - 1);
});

test('readPosture reports nothing found rather than guessing', () => {
  const reading = readPosture(null, {
    width: 256, height: 192, timeMs: 0, floor: new FloorModel(), occluders: [],
  });
  assert.equal(reading.present, false);
  assert.equal(reading.confidence, 0);
  assert.ok(Number.isNaN(reading.stature));
});
