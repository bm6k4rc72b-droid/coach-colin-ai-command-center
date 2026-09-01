/**
 * Each test here is a real false positive from a real garden. If a change makes
 * one of these alert, the change is wrong — however good it looks on a
 * detection benchmark.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tracker } from '../src/core/tracker.ts';
import { Suppressor, REASON_TEXT } from '../src/core/suppression.ts';
import { DEFAULT_SUPPRESSION, type Detection, type Zone, type SuppressionReason } from '../src/core/types.ts';

const FRAME_MS = 40; // 25fps

interface Scene {
  frames: number;
  det: (i: number) => Detection[];
  brightness?: (i: number) => number;
  zones?: Zone[];
}

/** Run a scene end to end; return whether it alerted and why it did not. */
function run({ frames, det, brightness = () => 0.2, zones = [] }: Scene) {
  const tracker = new Tracker();
  const sup = new Suppressor();
  const reasons = new Set<SuppressionReason>();
  let alerted = false;
  let alertFrame = -1;

  for (let i = 0; i < frames; i++) {
    const t = i * FRAME_MS;
    const tracks = tracker.update(det(i), t);
    const { verdicts, alerts } = sup.assess({ tracks, zones, t, brightness: brightness(i) });
    for (const v of verdicts) if (v.reason) reasons.add(v.reason);
    if (alerts.length > 0 && !alerted) {
      alerted = true;
      alertFrame = i;
    }
  }
  return { alerted, alertFrame, reasons };
}

const wholeFrameZone: Zone = {
  id: 'garden',
  name: 'Garden',
  armed: true,
  points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
};

// ── the true positive ──────────────────────────────────────────────────────
test('a person walking across the garden alerts', () => {
  const { alerted, alertFrame } = run({
    frames: 60,
    det: (i) => [{ box: { x: 0.1 + i * 0.012, y: 0.4, w: 0.08, h: 0.28 }, score: 0.82, label: 'person' }],
  });
  assert.equal(alerted, true, 'a walking person must alert');
  // dwellMs is 1200 at 40ms/frame = 30 frames; allow the tracker a little lead-in
  assert.ok(alertFrame >= 30 && alertFrame <= 36, `alerted at frame ${alertFrame}`);
});

test('it alerts once, not on every subsequent frame', () => {
  const tracker = new Tracker();
  const sup = new Suppressor();
  let count = 0;
  for (let i = 0; i < 80; i++) {
    const t = i * FRAME_MS;
    const tracks = tracker.update(
      [{ box: { x: 0.1 + i * 0.008, y: 0.4, w: 0.08, h: 0.28 }, score: 0.82, label: 'person' }],
      t,
    );
    count += sup.assess({ tracks, zones: [], t, brightness: 0.2 }).alerts.length;
  }
  assert.equal(count, 1, 'one subject must produce exactly one alert');
});

// ── the false positives ────────────────────────────────────────────────────
test('a fox crossing the lawn does not alert', () => {
  const { alerted, reasons } = run({
    frames: 60,
    // low and wide rather than tall and narrow
    det: (i) => [{ box: { x: 0.1 + i * 0.014, y: 0.72, w: 0.14, h: 0.07 }, score: 0.71, label: 'person' }],
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('implausible-aspect'), [...reasons].join(', '));
});

test('a branch swinging in wind does not alert', () => {
  const { alerted, reasons } = run({
    frames: 90,
    det: (i) => [{
      // human-plausible shape, but it goes nowhere
      box: { x: 0.5 + Math.sin(i * 0.5) * 0.03, y: 0.3, w: 0.06, h: 0.2 },
      score: 0.68,
      label: 'person',
    }],
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('oscillating-motion'), [...reasons].join(', '));
});

test('a wheelie bin mistaken for a person does not alert', () => {
  const { alerted, reasons } = run({
    frames: 90,
    det: () => [{ box: { x: 0.6, y: 0.5, w: 0.07, h: 0.22 }, score: 0.66, label: 'person' }],
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('stationary-object'), [...reasons].join(', '));
});

test('rain flicker never survives long enough to alert', () => {
  const { alerted, reasons } = run({
    frames: 90,
    // a different phantom every few frames, never the same place twice
    det: (i) => (i % 3 === 0
      ? [{ box: { x: (i * 0.137) % 0.8, y: (i * 0.219) % 0.6, w: 0.07, h: 0.2 }, score: 0.6, label: 'person' }]
      : []),
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('not-yet-confirmed'), [...reasons].join(', '));
});

test('headlights sweeping the drive do not alert', () => {
  const { alerted, reasons } = run({
    frames: 40,
    det: (i) => (i >= 10
      ? [{ box: { x: 0.2 + i * 0.01, y: 0.4, w: 0.08, h: 0.28 }, score: 0.75, label: 'person' }]
      : []),
    // the scene brightens hard at frame 10 and stays bright
    brightness: (i) => (i < 10 ? 0.15 : 0.55),
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('illumination-transient'), [...reasons].join(', '));
});

test('a person on the neighbour’s path, outside the armed zone, does not alert', () => {
  const drive: Zone = {
    id: 'drive',
    name: 'Drive',
    armed: true,
    points: [{ x: 0.0, y: 0.5 }, { x: 0.45, y: 0.5 }, { x: 0.45, y: 1 }, { x: 0.0, y: 1 }],
  };
  const { alerted, reasons } = run({
    frames: 60,
    // walking along the right-hand side, feet well outside the polygon
    det: (i) => [{ box: { x: 0.6 + i * 0.004, y: 0.4, w: 0.08, h: 0.28 }, score: 0.85, label: 'person' }],
    zones: [drive],
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('outside-zone'), [...reasons].join(', '));
});

test('the same person crossing inside the armed zone does alert', () => {
  const drive: Zone = {
    id: 'drive',
    name: 'Drive',
    armed: true,
    points: [{ x: 0.0, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.9, y: 1 }, { x: 0.0, y: 1 }],
  };
  const { alerted } = run({
    frames: 60,
    det: (i) => [{ box: { x: 0.1 + i * 0.01, y: 0.45, w: 0.08, h: 0.28 }, score: 0.85, label: 'person' }],
    zones: [drive],
  });
  assert.equal(alerted, true);
});

test('an unarmed zone leaves the frame armed by default', () => {
  const { alerted } = run({
    frames: 60,
    det: (i) => [{ box: { x: 0.1 + i * 0.01, y: 0.4, w: 0.08, h: 0.28 }, score: 0.85, label: 'person' }],
    zones: [{ ...wholeFrameZone, armed: false }],
  });
  assert.equal(alerted, true, 'with no armed zone the whole frame is armed');
});

test('a second subject in the same zone is held by the cooldown', () => {
  const tracker = new Tracker();
  const sup = new Suppressor();
  const zones = [wholeFrameZone];
  let alerts = 0;

  for (let i = 0; i < 140; i++) {
    const t = i * FRAME_MS;
    const dets: Detection[] = [];
    // subject A crosses for the first 70 frames
    if (i < 70) dets.push({ box: { x: 0.05 + i * 0.008, y: 0.4, w: 0.08, h: 0.28 }, score: 0.85, label: 'person' });
    // subject B starts afterwards, well inside the same zone
    if (i >= 70) dets.push({ box: { x: 0.8 - (i - 70) * 0.008, y: 0.42, w: 0.08, h: 0.28 }, score: 0.85, label: 'person' });
    const tracks = tracker.update(dets, t);
    alerts += sup.assess({ tracks, zones, t, brightness: 0.2 }).alerts.length;
  }
  // 140 frames is 5.6s; the cooldown is 45s, so only the first should get through
  assert.equal(alerts, 1, 'the zone cooldown must hold the second subject');
});

test('a vehicle does not alert while only person is armed', () => {
  const { alerted, reasons } = run({
    frames: 60,
    det: (i) => [{ box: { x: 0.1 + i * 0.012, y: 0.4, w: 0.08, h: 0.28 }, score: 0.9, label: 'vehicle' }],
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('class-not-armed'));
});

test('a subject that is barely detected never clears the score ceiling', () => {
  const { alerted, reasons } = run({
    frames: 60,
    det: (i) => [{ box: { x: 0.1 + i * 0.012, y: 0.4, w: 0.08, h: 0.28 }, score: 0.52, label: 'person' }],
  });
  assert.equal(alerted, false);
  assert.ok(reasons.has('below-score-floor'));
  assert.ok(DEFAULT_SUPPRESSION.scoreCeiling > 0.52);
});

test('every suppression reason has user-facing text', () => {
  const codes: SuppressionReason[] = [
    'class-not-armed', 'below-score-floor', 'outside-zone', 'implausible-aspect',
    'implausible-size', 'not-yet-confirmed', 'oscillating-motion', 'stationary-object',
    'illumination-transient', 'zone-cooldown', 'already-alerted',
  ];
  for (const c of codes) {
    assert.ok(REASON_TEXT[c] && REASON_TEXT[c].length > 0, `missing text for ${c}`);
  }
});
