/**
 * The whole chain, against scenes whose answer is known exactly.
 *
 * These are the tests that matter most, because every honest claim the app
 * makes rests on the arithmetic they check. A subject is walked across a
 * synthetic yard at an exact speed through an exact camera; segmentation,
 * tracking, calibration and the gait estimator then have to agree with the
 * fixture to within a stated tolerance. A change that quietly biases distances
 * upward by a tenth fails here rather than being noticed by somebody looking at
 * a number on a phone and wondering.
 *
 * @module tests/sentry/pipeline
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_POSE, idle, walk } from './synthetic.mjs';
import { blobs, clean, createBackground, segment, updateBackground } from '../../public/sentry/js/scene.js';
import { Tracker } from '../../public/sentry/js/tracker.js';
import { cadence } from '../../public/sentry/js/behaviour.js';
import { fitPose, groundPoint, imagePoint, pose, standingHeight } from '../../public/sentry/js/ground.js';

/**
 * Mark the pixels of detected regions, as the app does, so a subject who stops
 * moving is not absorbed into the background.
 *
 * @param {import('../../public/sentry/js/scene.js').Blob[]} regions Detections.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {Uint8Array} Hold mask.
 */
function holdMask(regions, width, height) {
  const mask = new Uint8Array(width * height);
  for (const region of regions) {
    for (let y = Math.max(0, region.minY - 1); y <= Math.min(height - 1, region.maxY + 1); y += 1) {
      for (let x = Math.max(0, region.minX - 1); x <= Math.min(width - 1, region.maxX + 1); x += 1) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

/**
 * Run the app's per-frame pipeline over a fixture.
 *
 * @param {object} options Passed to {@link walk}.
 * @returns {{truth: object, track: object|null, tracker: Tracker}} The answer
 *   the fixture holds and the track the pipeline produced.
 */
function runScene(options) {
  const { frames, truth } = walk(options);
  const background = createBackground(FIXTURE_POSE.width, FIXTURE_POSE.height);
  for (const { frame } of idle(30)) {
    updateBackground(background, frame, { rate: background.frames < 12 ? 6 : 1 });
  }
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  let last = null;
  for (const { frame, timeMs } of frames) {
    const detection = segment(background, frame, {});
    const mask = clean(detection.mask, frame.width, frame.height);
    const regions = blobs(mask, frame.width, frame.height, { minArea: 12, energy: detection.energy });
    const { live } = tracker.update(regions, timeMs, { frame, width: frame.width });
    if (live.length) last = live[0];
    updateBackground(background, frame, {
      rate: 1,
      hold: holdMask(regions, frame.width, frame.height),
    });
  }
  return { truth, track: last, tracker };
}

test('a walking subject is found and held as one track', () => {
  const { track, tracker } = runScene({ speedMps: 1.0, seconds: 8 });
  assert.ok(track, 'the subject should be tracked');
  assert.equal(track.id, 1, 'identity should not be reassigned mid-walk');
  assert.ok(track.hits > 100, `expected a long run of detections, got ${track.hits}`);
  assert.equal(tracker.tracks.length, 1, 'one subject should not produce several tracks');
});

test('distance walked is recovered within a tenth', () => {
  for (const speedMps of [0.7, 1.0, 1.6]) {
    const { truth, track } = runScene({ speedMps, seconds: 8 });
    const error = Math.abs(track.distanceM - truth.distanceM) / truth.distanceM;
    assert.ok(
      error < 0.1,
      `at ${speedMps} m/s: reported ${track.distanceM.toFixed(2)} m against ${truth.distanceM.toFixed(2)} m (${(error * 100).toFixed(1)}% out)`,
    );
  }
});

test('speed is recovered within a fifth', () => {
  for (const speedMps of [0.7, 1.0, 1.6]) {
    const { track } = runScene({ speedMps, seconds: 8 });
    const error = Math.abs(track.peakSpeedMps - speedMps) / speedMps;
    assert.ok(
      error < 0.2,
      `at ${speedMps} m/s: peak read ${track.peakSpeedMps.toFixed(2)} m/s (${(error * 100).toFixed(1)}% out)`,
    );
  }
});

test('a subject who never moves accumulates no distance at all', () => {
  // The failure this guards against is not cosmetic. Centroid jitter summed
  // over a night turns a parked car into something that walked a kilometre, and
  // every distance the app reports becomes worthless at the same moment.
  const { track } = runScene({
    speedMps: 0,
    seconds: 10,
    from: { x: 0, y: 6 },
    to: { x: 1, y: 6 },
  });
  assert.ok(track, 'a stationary subject should still be tracked');
  assert.equal(track.distanceM, 0, `stationary subject logged ${track.distanceM.toFixed(3)} m of travel`);
  assert.equal(track.peakSpeedMps, 0, 'a stationary subject should never register a speed');
});

test('standing height comes back close to the truth', () => {
  for (const heightM of [1.55, 1.75, 1.95]) {
    const { track } = runScene({ speedMps: 1.0, seconds: 8, heightM });
    // The estimate sits a couple of centimetres low: the opening still shaves
    // a row off the crown, and a row near the top of frame is worth more ground
    // than one near the bottom. Five centimetres is comfortably tight enough to
    // keep an adult inside the person band and a fox outside it.
    const error = track.heightM - heightM;
    assert.ok(
      error > -0.06 && error < 0.06,
      `${heightM} m subject measured ${track.heightM.toFixed(2)} m`,
    );
  }
});

test('gait cadence matches the fixture step rate', () => {
  for (const stepHz of [1.6, 1.8, 2.1]) {
    const { track } = runScene({ speedMps: 1.0, seconds: 8, stepHz });
    const gait = cadence(track.bobs);
    assert.ok(gait, 'a walking subject should produce a cadence estimate');
    assert.ok(gait.confident, `cadence at ${stepHz} Hz was not confident (${gait.snrDb.toFixed(1)} dB)`);
    const error = Math.abs(gait.stepsPerMin - stepHz * 60);
    assert.ok(error < 8, `expected ${(stepHz * 60).toFixed(0)} spm, got ${gait.stepsPerMin.toFixed(0)}`);
  }
});

test('a scene with nothing in it produces no tracks', () => {
  const background = createBackground(FIXTURE_POSE.width, FIXTURE_POSE.height);
  const tracker = new Tracker({ pose: FIXTURE_POSE });
  const frames = idle(120, 15);
  for (const { frame } of frames) {
    updateBackground(background, frame, { rate: background.frames < 12 ? 6 : 1 });
  }
  let born = 0;
  for (const { frame, timeMs } of idle(90, 15)) {
    const detection = segment(background, frame, {});
    const mask = clean(detection.mask, frame.width, frame.height);
    const regions = blobs(mask, frame.width, frame.height, { minArea: 12 });
    born += tracker.update(regions, Math.abs(timeMs), { frame, width: frame.width }).born.length;
    updateBackground(background, frame, { rate: 1 });
  }
  assert.equal(born, 0, 'sensor noise on an empty scene must not create subjects');
});

test('a marked rectangle recovers the camera pose that drew it', () => {
  const truth = pose({ heightM: 3.6, tiltDeg: 26, fovDeg: 64, width: 192, height: 144 });
  const rectangle = [
    { x: -1.5, y: 4 },
    { x: 1.5, y: 4 },
    { x: 1.5, y: 8 },
    { x: -1.5, y: 8 },
  ];
  const marks = rectangle.map((p) => {
    const image = imagePoint(truth, p.x, p.y);
    return { u: image.u, v: image.v };
  });
  const fit = fitPose(marks, { widthM: 3, depthM: 4, width: 192, height: 144 });
  assert.ok(fit, 'the fit should succeed on an exact rectangle');
  assert.ok(fit.residualM < 0.05, `residual ${fit.residualM.toFixed(3)} m is too large`);
  assert.ok(Math.abs(fit.pose.heightM - truth.heightM) < 0.3, `height ${fit.pose.heightM.toFixed(2)} m`);
  assert.ok(Math.abs(fit.pose.tiltDeg - truth.tiltDeg) < 3, `tilt ${fit.pose.tiltDeg.toFixed(1)}°`);
  assert.ok(Math.abs(fit.pose.fovDeg - truth.fovDeg) < 5, `fov ${fit.pose.fovDeg.toFixed(1)}°`);
});

test('projection and back-projection agree', () => {
  const camera = pose({ heightM: 2.8, tiltDeg: 18, fovDeg: 72, width: 320, height: 240 });
  for (const point of [{ x: 0, y: 5 }, { x: -3, y: 12 }, { x: 4.5, y: 7.25 }]) {
    const image = imagePoint(camera, point.x, point.y);
    const back = groundPoint(camera, image.u, image.v);
    assert.ok(Math.abs(back.x - point.x) < 1e-6 && Math.abs(back.y - point.y) < 1e-6);
  }
});

test('nothing above the horizon is given a ground position', () => {
  const camera = pose({ heightM: 3, tiltDeg: 12, fovDeg: 70, width: 320, height: 240 });
  assert.equal(groundPoint(camera, 160, 0), null, 'the top of frame is sky, not ground');
  assert.ok(groundPoint(camera, 160, 239), 'the bottom of frame is ground');
});

test('height is measured from the vertical above the ground contact', () => {
  const camera = pose({ heightM: 4, tiltDeg: 30, fovDeg: 65, width: 320, height: 240 });
  for (const metres of [0.4, 1.2, 1.8, 2.4]) {
    const foot = imagePoint(camera, 1.2, 7, 0);
    const head = imagePoint(camera, 1.2, 7, metres);
    const measured = standingHeight(camera, foot, head);
    assert.ok(Math.abs(measured - metres) < 1e-6, `${metres} m read as ${measured}`);
  }
});
