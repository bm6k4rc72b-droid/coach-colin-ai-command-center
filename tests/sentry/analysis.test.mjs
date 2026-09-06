/**
 * Zones, classification, the written summary, the palette and the RF adapter.
 *
 * The tests that matter most in this file are the ones asserting what the app
 * does *not* say: that an uncalibrated track is not classified, that a summary
 * never invents a measurement it does not have, and that a sensor sending
 * rubbish shows as a sensor sending nothing.
 *
 * @module tests/sentry/analysis
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ZoneWatch, inPolygon, segmentsCross, sideOf } from '../../public/sentry/js/zones.js';
import { classify, describe } from '../../public/sentry/js/classify.js';
import { digest, measure, toText, write } from '../../public/sentry/js/dossier.js';
import { contrastBounds, ironbow, ironbowTable } from '../../public/sentry/js/views.js';
import { capability, contactToGround, parseFrame } from '../../public/sentry/js/rf.js';
import { dwellSeconds, fallPattern, limbActivity, posture, reversals, sinuosity } from '../../public/sentry/js/behaviour.js';

/* ------------------------------------------------------------------- zones */

const SQUARE = [
  { x: -2, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 6 },
  { x: -2, y: 6 },
];

test('polygon containment', () => {
  assert.equal(inPolygon({ x: 0, y: 4 }, SQUARE), true);
  assert.equal(inPolygon({ x: 5, y: 4 }, SQUARE), false);
  assert.equal(inPolygon({ x: 0, y: 12 }, SQUARE), false);
});

test('segment crossing and sidedness', () => {
  const a = { x: -1, y: 0 };
  const b = { x: 1, y: 0 };
  assert.equal(segmentsCross({ x: 0, y: -1 }, { x: 0, y: 1 }, a, b), true);
  assert.equal(segmentsCross({ x: 3, y: -1 }, { x: 3, y: 1 }, a, b), false);
  assert.ok(sideOf(a, b, { x: 0, y: 1 }) > 0);
  assert.ok(sideOf(a, b, { x: 0, y: -1 }) < 0);
});

/**
 * Walk a track through a sequence of ground positions.
 *
 * @param {ZoneWatch} watch Watch under test.
 * @param {Array<{x: number, y: number}>} points Positions, one per step.
 * @param {number} [stepMs=200] Milliseconds a step.
 * @returns {object[]} Every event raised.
 */
function walkThrough(watch, points, stepMs = 200) {
  const events = [];
  let t = 0;
  for (const point of points) {
    const track = { id: 1, ground: point, speedMps: 1, path: [] };
    events.push(...watch.evaluate([track], (t += stepMs)));
  }
  return events;
}

test('entering and leaving an area raises one event each', () => {
  const watch = new ZoneWatch([{ id: 'z', name: 'Yard', kind: 'area', points: SQUARE }]);
  const path = [];
  for (let i = 0; i < 12; i += 1) path.push({ x: 0, y: -1 + i });
  const events = walkThrough(watch, path);
  const entries = events.filter((e) => e.type === 'entry');
  const exits = events.filter((e) => e.type === 'exit');
  assert.equal(entries.length, 1, `expected one entry, got ${entries.length}`);
  assert.equal(exits.length, 1, `expected one exit, got ${exits.length}`);
});

test('a subject sitting on the boundary does not chatter', () => {
  // Without hysteresis this produces an event per frame, which is how an
  // operator learns to ignore the app.
  const watch = new ZoneWatch([{ id: 'z', name: 'Yard', kind: 'area', points: SQUARE }]);
  const path = [];
  for (let i = 0; i < 40; i += 1) path.push({ x: 0, y: i % 2 ? 1.99 : 2.01 });
  const events = walkThrough(watch, path, 100);
  assert.ok(events.length <= 2, `boundary jitter raised ${events.length} events`);
});

test('loitering fires once, after the set time', () => {
  const watch = new ZoneWatch([
    { id: 'z', name: 'Gate', kind: 'area', points: SQUARE, loiterSec: 3 },
  ]);
  const path = [];
  for (let i = 0; i < 60; i += 1) path.push({ x: 0, y: 4 });
  const events = walkThrough(watch, path, 200);
  const loiters = events.filter((e) => e.type === 'loiter');
  assert.equal(loiters.length, 1, `expected one loiter event, got ${loiters.length}`);
  assert.ok(loiters[0].detail.includes('Gate'));
});

test('a tripwire fires on crossing and reports direction', () => {
  const watch = new ZoneWatch([
    {
      id: 'w',
      name: 'Path',
      kind: 'tripwire',
      points: [
        { x: -3, y: 4 },
        { x: 3, y: 4 },
      ],
    },
  ]);
  const path = [];
  for (let i = 0; i < 10; i += 1) path.push({ x: 0, y: 1 + i });
  const events = walkThrough(watch, path);
  assert.equal(events.length, 1, `expected one crossing, got ${events.length}`);
  assert.equal(events[0].type, 'crossing');
  assert.ok(/inbound|outbound/.test(events[0].detail));
});

test('a one-way tripwire ignores the wrong direction', () => {
  const wire = {
    id: 'w',
    name: 'Exit',
    kind: 'tripwire',
    direction: 'in',
    points: [
      { x: -3, y: 4 },
      { x: 3, y: 4 },
    ],
  };
  const forward = walkThrough(new ZoneWatch([wire]), [
    { x: 0, y: 2 },
    { x: 0, y: 6 },
  ]);
  const backward = walkThrough(new ZoneWatch([wire]), [
    { x: 0, y: 6 },
    { x: 0, y: 2 },
  ]);
  assert.equal(forward.length + backward.length, 1, 'exactly one of the two directions should fire');
});

/* -------------------------------------------------------------- behaviour */

test('sinuosity separates a crossing from wandering', () => {
  const straight = [];
  for (let i = 0; i <= 20; i += 1) straight.push({ t: i * 200, x: i * 0.3, y: 5 });
  assert.ok(sinuosity(straight) < 1.05);

  const wandering = [];
  for (let i = 0; i <= 40; i += 1) {
    wandering.push({ t: i * 200, x: Math.sin(i / 3) * 2, y: 5 + i * 0.05 });
  }
  assert.ok(sinuosity(wandering) > 2);
});

test('pacing shows up as reversals', () => {
  const pacing = [];
  for (let i = 0; i <= 80; i += 1) {
    pacing.push({ t: i * 250, x: 2 + 2 * Math.abs(((i / 20) % 2) - 1), y: 4 });
  }
  assert.ok(reversals(pacing) >= 2, 'back-and-forth movement should register reversals');

  const crossing = [];
  for (let i = 0; i <= 40; i += 1) crossing.push({ t: i * 250, x: i * 0.2, y: 4 });
  assert.equal(reversals(crossing), 0, 'a straight crossing has no reversals');
});

test('dwell measures the longest stay, not the total', () => {
  const path = [];
  for (let i = 0; i < 20; i += 1) path.push({ t: i * 500, x: 0, y: 5 });
  for (let i = 0; i < 20; i += 1) path.push({ t: 10_000 + i * 500, x: 10 + i, y: 5 });
  assert.ok(dwellSeconds(path) >= 9 && dwellSeconds(path) <= 11);
});

test('posture and the fall pattern', () => {
  assert.equal(posture(60, 20).posture, 'upright');
  assert.equal(posture(15, 50).posture, 'prone');

  const history = [];
  for (let i = 0; i < 10; i += 1) history.push({ t: i * 500, ratio: 2.4 });
  for (let i = 0; i < 12; i += 1) history.push({ t: 5000 + i * 500, ratio: 0.5 });
  assert.equal(fallPattern(history), true, 'upright then flat and staying flat is a fall');

  const crouching = [];
  for (let i = 0; i < 10; i += 1) crouching.push({ t: i * 500, ratio: 2.4 });
  for (let i = 0; i < 2; i += 1) crouching.push({ t: 5000 + i * 500, ratio: 0.6 });
  for (let i = 0; i < 6; i += 1) crouching.push({ t: 6000 + i * 500, ratio: 2.3 });
  assert.equal(fallPattern(crouching), false, 'bending down and standing back up is not a fall');
});

test('limb activity separates gesturing from walking', () => {
  const steady = [];
  for (let i = 0; i < 60; i += 1) steady.push({ t: i * 66, value: 20 });
  assert.equal(limbActivity(steady, 1.2).elevated, false);

  const bursty = [];
  for (let i = 0; i < 60; i += 1) bursty.push({ t: i * 66, value: i % 6 < 2 ? 40 : 4 });
  assert.equal(limbActivity(bursty, 0).elevated, true);
});

/* ---------------------------------------------------------- classification */

test('an uncalibrated track is not classified at all', () => {
  const result = classify({ heightM: null, aspect: 2.2, fill: 0.6, speedMps: 1.2 });
  assert.equal(result.label, 'unknown');
  assert.equal(result.confidence, 0);
  assert.match(result.reasons[0], /calibration/);
});

test('an adult-sized upright walker classifies as a person', () => {
  const result = classify({
    heightM: 1.76,
    aspect: 2.3,
    fill: 0.58,
    speedMps: 1.3,
    peakSpeedMps: 1.5,
    cadence: { stepsPerMin: 112, confident: true },
  });
  assert.equal(result.label, 'person');
  assert.ok(result.confidence > 0.3);
  assert.ok(result.reasons.some((r) => r.includes('steps a minute')));
});

test('something knee-high and longer than tall is not a person', () => {
  const result = classify({
    heightM: 0.55,
    aspect: 0.7,
    fill: 0.68,
    speedMps: 1.8,
    peakSpeedMps: 3.4,
    cadence: { stepsPerMin: 190, confident: true },
  });
  assert.equal(result.label, 'animal');
});

test('a fast, solid, wide object is a vehicle', () => {
  const result = classify({
    heightM: 1.6,
    aspect: 0.6,
    fill: 0.88,
    speedMps: 9,
    peakSpeedMps: 12,
    cadence: null,
  });
  assert.equal(result.label, 'vehicle');
});

test('an ambiguous subject is reported as uncertain, not as a coin toss', () => {
  const result = classify({
    heightM: 1.3,
    aspect: 1.2,
    fill: 0.66,
    speedMps: 0.9,
    peakSpeedMps: 1.1,
    cadence: null,
  });
  assert.ok(result.confidence < 0.4, `confidence ${result.confidence} is too assured`);
  assert.match(describe(result), /Possibly|Probably|Unclassified/);
});

/* --------------------------------------------------------------- dossier */

/**
 * A tracker-shaped record for the writer.
 *
 * @param {object} [overrides] Fields to replace.
 * @returns {object} Track-like object.
 */
function fakeTrack(overrides = {}) {
  const path = [];
  for (let i = 0; i <= 40; i += 1) path.push({ t: i * 250, x: i * 0.2, y: 5, u: 60 + i, v: 100 });
  const bobs = [];
  for (let i = 0; i <= 150; i += 1) {
    bobs.push({ t: i * 66, value: 40 + 3 * Math.sin(2 * Math.PI * 1.85 * (i * 0.066)) });
  }
  return {
    id: 7,
    startMs: 0,
    lastSeenMs: 10_000,
    distanceM: 8.0,
    speedMps: 0.82,
    peakSpeedMps: 1.1,
    heightM: 1.78,
    boxHeight: 52,
    boxWidth: 21,
    fill: 0.6,
    path,
    bobs,
    upperEnergy: bobs.map((b) => ({ t: b.t, value: 12 })),
    ...overrides,
  };
}

test('a summary quotes the measurements it was given', () => {
  const record = measure(fakeTrack());
  const summary = write(record);
  assert.match(summary.headline, /Track 7/);
  const body = summary.lines.join(' ');
  assert.match(body, /8\.0 m/, 'the distance should appear verbatim');
  assert.match(body, /0\.80 m\/s/, 'the average speed should be distance over time');
});

test('a summary never claims a measurement it does not have', () => {
  const record = measure(fakeTrack({ heightM: null, distanceM: 0, speedMps: 0, peakSpeedMps: 0 }));
  const summary = write(record);
  const text = [summary.headline, ...summary.lines, ...summary.caveats].join(' ');
  assert.ok(!/\bNaN\b|undefined/.test(text), `summary contained a hole: ${text}`);
  assert.match(summary.caveats.join(' '), /No ground calibration/);
});

test('a summary never speculates about intent', () => {
  const loiterer = fakeTrack({
    distanceM: 1.2,
    path: Array.from({ length: 200 }, (_, i) => ({ t: i * 250, x: 0.1, y: 5, u: 60, v: 100 })),
  });
  const summary = write(measure(loiterer, { events: [] }));
  const text = [summary.headline, ...summary.lines].join(' ').toLowerCase();
  for (const word of ['suspicious', 'intruder', 'threat', 'casing', 'lurking', 'prowl', 'intent']) {
    assert.ok(!text.includes(word), `the summary used the word "${word}"`);
  }
  assert.match(summary.caveats.join(' '), /say nothing about intent/);
});

test('a stationary subject is described as stationary', () => {
  const record = measure(fakeTrack({ distanceM: 0.05, speedMps: 0, peakSpeedMps: 0 }));
  assert.match(write(record).lines[0], /Stayed put/);
});

test('vitals appear only when they were actually measured', () => {
  const without = write(measure(fakeTrack(), { vitals: { breathsPerMin: null, bpm: null, grade: 'unavailable', reason: 'the subject is moving' } }));
  assert.match(without.lines.join(' '), /No vitals: the subject is moving/);

  const with_ = write(measure(fakeTrack(), { vitals: { breathsPerMin: 14.2, bpm: 68, grade: 'fair', reason: 'ok' } }));
  assert.match(with_.lines.join(' '), /Breathing about 14 a minute/);
  assert.match(with_.caveats.join(' '), /not a medical measurement/);
});

test('the digest that may leave the device carries numbers and nothing else', () => {
  const packet = digest(measure(fakeTrack()));
  const text = JSON.stringify(packet);
  assert.ok(!/data:|base64|image|frame|pixel/i.test(text), 'the digest must not contain imagery');
  assert.equal(packet.track, 7);
  assert.equal(typeof packet.metresWalked, 'number');
  assert.ok(!('name' in packet) && !('face' in packet), 'the digest must carry no identity');
});

test('the text export is stable and readable', () => {
  const record = measure(fakeTrack());
  const first = toText(record);
  const second = toText(measure(fakeTrack()));
  assert.equal(first, second, 'the writer must be deterministic');
  assert.ok(first.includes('•'), 'observations are bulleted');
  assert.ok(first.includes('—'), 'caveats are marked');
});

/* ----------------------------------------------------------------- views */

test('the ironbow ramp rises monotonically in brightness', () => {
  let previous = -1;
  for (let i = 0; i <= 100; i += 1) {
    const [r, g, b] = ironbow(i / 100);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    assert.ok(luma >= previous - 1, `the palette dipped at ${i}%`);
    previous = luma;
  }
  assert.deepEqual(ironbow(0), [0, 0, 0]);
  assert.deepEqual(ironbow(1), [255, 255, 236]);
});

test('the palette table matches the function', () => {
  const table = ironbowTable();
  for (const i of [0, 37, 128, 200, 255]) {
    const [r, g, b] = ironbow(i / 255);
    assert.deepEqual([table[i * 3], table[i * 3 + 1], table[i * 3 + 2]], [r, g, b]);
  }
});

test('contrast bounds ignore a single blown pixel', () => {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < data.length; p += 4) {
    data[p] = data[p + 1] = data[p + 2] = 40;
    data[p + 3] = 255;
  }
  data[0] = data[1] = data[2] = 255;
  const bounds = contrastBounds({ data, width, height });
  assert.ok(bounds.high < 200, `one white pixel set the top of the scale to ${bounds.high}`);
});

/* -------------------------------------------------------------------- rf */

test('with no sensor attached the adapter says so plainly', () => {
  const info = capability();
  assert.equal(info.state, 'absent');
  assert.match(info.headline, /cannot see through walls/);
  assert.ok(info.options.length >= 3, 'the operator should be told what hardware would work');
});

test('a malformed sensor frame yields nothing rather than a phantom contact', () => {
  assert.equal(parseFrame('not json'), null);
  assert.equal(parseFrame('null'), null);
  const nonsense = parseFrame(JSON.stringify({ contacts: [{ rangeM: 'x', bearingDeg: 900 }] }));
  assert.deepEqual(nonsense.contacts, [], 'unusable contacts must be dropped, not coerced');
  const partly = parseFrame(
    JSON.stringify({ contacts: [{ id: 'a', rangeM: 4, bearingDeg: 10 }, { rangeM: NaN, bearingDeg: 0 }] }),
  );
  assert.equal(partly.contacts.length, 1);
  assert.equal(partly.contacts[0].confidence, 0.5, 'a missing confidence falls back rather than becoming NaN');
});

test('a contact is placed by range and bearing from its mount', () => {
  const ground = contactToGround({ rangeM: 5, bearingDeg: 0 }, { x: 0, y: 0, headingDeg: 0 });
  assert.ok(Math.abs(ground.x) < 1e-9 && Math.abs(ground.y - 5) < 1e-9);
  const side = contactToGround({ rangeM: 5, bearingDeg: 90 }, { x: 0, y: 0, headingDeg: 0 });
  assert.ok(Math.abs(side.x - 5) < 1e-9 && Math.abs(side.y) < 1e-9);
});
