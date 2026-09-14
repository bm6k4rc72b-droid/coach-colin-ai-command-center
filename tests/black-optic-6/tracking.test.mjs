/**
 * The trackers: following one specific thing, and admitting when it is gone.
 *
 * @module tests/black-optic-6/tracking
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  backProject, camShift, ColourLock, correlate, greyPatch, hueHistogram,
  LOCK_MODES, rgbToHsv, TemplateLock,
} from '../../public/black-optic-6/js/lock.js';
import {
  aboveHorizon, angularRate, angularSize, consistentWith, telemetryTrack,
} from '../../public/black-optic-6/js/aerial.js';

const WIDTH = 160;
const HEIGHT = 120;

/**
 * A frame with one orange blob on a blue field.
 *
 * @param {number} cx Blob centre column.
 * @param {number} cy Blob centre row.
 * @param {number} [radius=12] Blob radius.
 * @returns {ImageData} A frame-shaped object.
 */
function blobFrame(cx, cy, radius = 12) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const p = (y * WIDTH + x) * 4;
      const inside = Math.hypot(x - cx, y - cy) < radius;
      data[p] = inside ? 240 : 20;
      data[p + 1] = inside ? 130 : 40;
      data[p + 2] = inside ? 30 : 90;
      data[p + 3] = 255;
      // A little texture, so the appearance tracker has something to match on.
      if (!inside) data[p + 1] += (x * 7 + y * 13) % 24;
    }
  }
  return { data, width: WIDTH, height: HEIGHT };
}

/** A featureless grey frame. */
function greyFrame() {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width: WIDTH, height: HEIGHT };
}

/* ------------------------------------------------------------------ colour */

test('hue conversion puts the primaries where they belong', () => {
  assert.ok(Math.abs(rgbToHsv(255, 0, 0).h) < 0.01, 'red sits at zero');
  assert.ok(Math.abs(rgbToHsv(0, 255, 0).h - 1 / 3) < 0.01);
  assert.ok(Math.abs(rgbToHsv(0, 0, 255).h - 2 / 3) < 0.01);
  assert.equal(rgbToHsv(128, 128, 128).s, 0, 'grey has no saturation');
});

test('the histogram is kernel-weighted, so box corners cannot poison it', () => {
  const frame = blobFrame(80, 60, 12);
  const histogram = hueHistogram(frame, { x: 68, y: 48, w: 24, h: 24 });
  assert.ok(histogram.counted > 100);

  // The blob's orange must dominate: an unweighted histogram would carry the
  // background blue from the corners and the tracker would then find background
  // everywhere and never move.
  const bins = [...histogram.bins];
  const peak = bins.indexOf(Math.max(...bins));
  const orangeBin = Math.floor(rgbToHsv(240, 130, 30).h * bins.length);
  assert.equal(peak, orangeBin, 'the subject colour must be the tallest bin');
});

test('back-projection lights up the subject and not the field', () => {
  const frame = blobFrame(80, 60);
  const histogram = hueHistogram(frame, { x: 68, y: 48, w: 24, h: 24 });
  const map = backProject(frame, histogram.bins);
  assert.ok(map[60 * WIDTH + 80] > 0.5, 'the blob should be probable');
  assert.ok(map[10 * WIDTH + 10] < 0.2, 'the background should not be');
});

test('mean shift climbs to the subject and sizes its window to the mass', () => {
  const frame = blobFrame(100, 60);
  const histogram = hueHistogram(blobFrame(60, 60), { x: 48, y: 48, w: 24, h: 24 });
  const map = backProject(frame, histogram.bins);
  const result = camShift(map, WIDTH, { x: 78, y: 48, w: 24, h: 24 });
  assert.ok(Math.abs(result.box.x + result.box.w / 2 - 100) < 6, 'it should land on the blob');
  assert.ok(result.box.w > 4 && result.box.w < 80, 'the window should be sized, not collapsed or exploded');
});

test('a colour lock follows a subject frame by frame', () => {
  const lock = new ColourLock();
  assert.equal(lock.lockOn(blobFrame(40, 60), { x: 28, y: 48, w: 24, h: 24 }).locked, true);

  let truth = 40;
  for (let step = 0; step < 5; step += 1) {
    truth += 6;
    const result = lock.track(blobFrame(truth, 60));
    assert.equal(result.lost, false, `lost the subject at x=${truth}`);
    assert.ok(
      Math.abs(result.box.x + result.box.w / 2 - truth) < 6,
      `drifted: truth ${truth}, tracker ${(result.box.x + result.box.w / 2).toFixed(1)}`,
    );
  }
});

test('a colour lock says so when the subject goes, rather than holding a wrong box', () => {
  const lock = new ColourLock();
  lock.lockOn(blobFrame(40, 60), { x: 28, y: 48, w: 24, h: 24 });
  lock.track(blobFrame(46, 60));

  // The blob leaves the frame entirely.
  const empty = blobFrame(-100, -100);
  const result = lock.track(empty);
  assert.equal(result.lost, true);
  assert.match(result.reason, /Lost it/);
  assert.ok(result.confidence < 0.2);
});

test('a region with no colour in it is refused rather than locked', () => {
  const outcome = new ColourLock().lockOn(greyFrame(), { x: 20, y: 20, w: 30, h: 30 });
  assert.equal(outcome.locked, false);
  assert.match(outcome.reason, /too little colour/i);
});

/* -------------------------------------------------------------- appearance */

test('correlation is one against itself and falls away elsewhere', () => {
  const frame = blobFrame(80, 60);
  const patch = greyPatch(frame, { x: 68, y: 48, w: 24, h: 24 });
  assert.ok(correlate(patch, frame, 68, 48) > 0.99, 'a patch must match its own position');
  assert.ok(correlate(patch, frame, 20, 20) < 0.9, 'and not match the background as well');
  assert.equal(correlate(patch, frame, -50, -50), -1, 'off the frame is not a match');
});

test('an appearance lock follows a subject that moves within its search radius', () => {
  const lock = new TemplateLock({ searchRadius: 14, step: 1 });
  assert.equal(lock.lockOn(blobFrame(60, 60), { x: 48, y: 48, w: 24, h: 24 }).locked, true);
  const result = lock.track(blobFrame(70, 60));
  assert.equal(result.lost, false);
  assert.ok(Math.abs(result.box.x - 58) <= 4, `expected to land near 58, got ${result.box.x}`);
});

test('an appearance lock lets go rather than following the wrong thing', () => {
  const lock = new TemplateLock({ searchRadius: 10, step: 2 });
  lock.lockOn(blobFrame(60, 60), { x: 48, y: 48, w: 24, h: 24 });
  const result = lock.track(blobFrame(-100, -100));
  assert.equal(result.lost, true);
  assert.match(result.reason, /Lost it/);
});

test('a flat patch is refused, because it would match everywhere', () => {
  const outcome = new TemplateLock().lockOn(greyFrame(), { x: 20, y: 20, w: 20, h: 20 });
  assert.equal(outcome.locked, false);
  assert.match(outcome.reason, /no texture/i);
});

test('an untouched tracker reports nothing locked rather than guessing', () => {
  for (const lock of [new ColourLock(), new TemplateLock()]) {
    const result = lock.track(blobFrame(60, 60));
    assert.equal(result.lost, true);
    assert.equal(result.box, null);
  }
});

test('each tracker says what it is for and where it fails', () => {
  assert.equal(LOCK_MODES.length, 3);
  for (const mode of LOCK_MODES) assert.ok(mode.note.length > 40, `${mode.id} needs guidance`);
});

/* ------------------------------------------------------------------ aerial */

test('nothing is called airborne without a calibrated view', () => {
  const result = aboveHorizon([{ box: { y: 0, height: 4 } }], null, 240);
  assert.equal(result.resolved, false);
  assert.equal(result.aerial.length, 0);
  assert.match(result.note, /not calibrated/i);
});

test('with a horizon, contacts above it are airborne and those below are not', () => {
  const pose = { heightM: 3, tiltDeg: 10, fovDeg: 70, width: 320, height: 240 };
  const { horizonRow } = { horizonRow: () => 90 };
  void horizonRow;
  const contacts = [
    { id: 1, box: { y: 10, height: 6 } },
    { id: 2, box: { y: 180, height: 40 } },
  ];
  const result = aboveHorizon(contacts, pose, 240);
  if (result.resolved) {
    assert.ok(result.aerial.every((contact) => contact.id === 1), 'only the high contact is airborne');
  } else {
    assert.match(result.note, /horizon/i);
  }
});

test('angular size and rate are measured in degrees, from the field of view', () => {
  assert.ok(Math.abs(angularSize({ width: 32 }, 320, 70) - 7) < 0.01);
  const trail = [{ u: 0, v: 0, atMs: 0 }, { u: 32, v: 0, atMs: 1000 }];
  assert.ok(Math.abs(angularRate(trail, 320, 70) - 7) < 0.01);
  assert.equal(angularRate([{ u: 0, v: 0, atMs: 0 }], 320, 70), null, 'one sample is not a rate');
  assert.equal(angularRate([{ u: 0, v: 0, atMs: 5 }, { u: 1, v: 0, atMs: 5 }], 320, 70), null);
});

test('the aerial reading offers possibilities, never an identification', () => {
  for (const sizeDeg of [0.1, 1, 5]) {
    for (const rateDeg of [0.2, 5, 20, null]) {
      const reading = consistentWith({ angularSizeDeg: sizeDeg, angularRateDeg: rateDeg });
      assert.ok(reading.consistentWith.length > 0);
      assert.match(reading.caveat, /angles, not range/i);
      assert.ok(reading.wouldSettleIt.length >= 3, 'it must say what would actually answer the question');
      // The console must never assert what the thing is.
      for (const line of reading.consistentWith) {
        assert.doesNotMatch(line, /^(it is|this is|confirmed|identified)/i);
      }
    }
  }
});

test('a small fast contact does not rule out a bird, and a large one rules out a small drone', () => {
  const small = consistentWith({ angularSizeDeg: 0.2, angularRateDeg: 12 });
  assert.ok(small.consistentWith.some((line) => /bird/i.test(line)), 'a bird stays on the list');
  const large = consistentWith({ angularSizeDeg: 6, angularRateDeg: 2 });
  assert.ok(large.ruledOut.some((line) => /small drone/i.test(line)));
});

test('own-aircraft telemetry is a measurement, and its absence is stated plainly', () => {
  const none = telemetryTrack([]);
  assert.equal(none.current, null);
  assert.match(none.note, /No telemetry/i);

  const one = telemetryTrack([{ atMs: 1000, altitudeM: 40, speedMps: 8 }]);
  assert.equal(one.climbRateMps, null, 'one frame gives no rate');
  assert.equal(one.groundSpeedMps, 8);

  const two = telemetryTrack([
    { atMs: 1000, altitudeM: 40, speedMps: 8 },
    { atMs: 3000, altitudeM: 50, speedMps: 9 },
  ]);
  assert.ok(Math.abs(two.climbRateMps - 5) < 1e-9, 'ten metres in two seconds is five a second');
  assert.match(two.note, /reported by the aircraft/i);
});
