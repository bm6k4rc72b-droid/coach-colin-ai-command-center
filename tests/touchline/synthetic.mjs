/**
 * Scenes with known answers, built from the app's own renderer.
 *
 * Every claim Touchline makes is a measurement, and a measurement is only worth
 * testing against a scene whose answer is known before the app runs. The
 * generator that produces those scenes is not a test fixture — it ships, as
 * `demo.js`, because the same clip that lets a reader judge the app in ten
 * seconds is the one that lets a test check the app against numbers written in
 * metres and seconds.
 *
 * This module is the thin layer on top: a camera to film through, a way to
 * describe a passage of play, and a runner that plays it through the real
 * pipeline. When a test says the app returned 25.4 km/h, the fixture knows the
 * choreography asked for 25.2, and the gap is what is being asserted.
 *
 * @module tests/touchline/synthetic
 */

import {
  DEMO_CAMERA,
  KITS,
  camera,
  cameraBasis,
  project,
  renderScene,
} from '../../public/touchline/js/demo.js';
import { fitHomography } from '../../public/touchline/js/pitch.js';
import { detect, fitTurf } from '../../public/touchline/js/segment.js';
import { Tracker } from '../../public/touchline/js/track.js';
import { BallTracker, ballCandidates } from '../../public/touchline/js/ball.js';

export { KITS, camera, cameraBasis, project, renderScene };

/** The pitch every fixture plays on. */
export const DIMENSIONS = Object.freeze({ lengthM: 105, widthM: 68 });

/**
 * The fixture camera and its exact ground homography.
 *
 * @param {object} [spec=DEMO_CAMERA] Camera placement.
 * @returns {{basis: object, pitchToImage: number[], spec: object}} The camera.
 */
export function rig(spec = DEMO_CAMERA) {
  return { basis: cameraBasis(spec), pitchToImage: camera(spec), spec };
}

/**
 * Landmarks a person could plausibly click, with their exact image positions.
 *
 * These are what calibration is fed. They are computed rather than clicked, so
 * the tests separate "is the geometry right" from "did somebody tap accurately"
 * — {@link jitterMarks} is what introduces the second.
 *
 * @param {number[]} pitchToImage Ground homography.
 * @param {[number, number][]} [points] Pitch landmarks to use.
 * @returns {{image: {x: number, y: number}, pitch: {x: number, y: number}}[]}
 *   Correspondences ready for `fitHomography`.
 */
export function marksFor(
  pitchToImage,
  points = [
    [16.5, 54.16],
    [16.5, 13.84],
    [0, 54.16],
    [5.5, 13.84],
    [11, 34],
  ],
) {
  return points.map(([x, y]) => {
    const at = project(pitchToImage, x, y);
    return { image: { x: at.x, y: at.y }, pitch: { x, y } };
  });
}

/**
 * Move each mark by up to a pixel or two, the way a thumb on glass would.
 *
 * @param {object[]} marks Marks to disturb.
 * @param {number} [pixels=1.5] Largest displacement.
 * @param {number} [seed=3] Noise seed.
 * @returns {object[]} Disturbed copies.
 */
export function jitterMarks(marks, pixels = 1.5, seed = 3) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
  return marks.map((mark) => ({
    ...mark,
    image: { x: mark.image.x + next() * pixels, y: mark.image.y + next() * pixels },
  }));
}

/**
 * Play a passage of play through the real pipeline.
 *
 * @param {object} script What happens.
 * @param {(t: number) => {players: object[], ball?: object}} script.at Scene at
 *   a given time in seconds.
 * @param {number} [script.seconds=4] How long to run for.
 * @param {number} [script.fps=25] Frame rate.
 * @param {object} [script.rig] Camera, from {@link rig}.
 * @param {object[]} [script.marks] Calibration marks; exact ones by default.
 * @param {boolean} [script.withBall=false] Whether to run the ball detector.
 * @param {(frame: object) => void} [script.onFrame] Called per analysed frame.
 * @returns {{
 *   tracker: Tracker, ball: BallTracker, fit: object, turf: object,
 *   frames: number, worstDetectionErrorM: number, detectionsPerFrame: number[],
 *   truth: object[][]
 * }} Everything the assertions need.
 */
export function play(script) {
  const {
    at,
    seconds = 4,
    fps = 25,
    rig: cameraRig = rig(),
    marks = marksFor(cameraRig.pitchToImage),
    withBall = false,
    onFrame = null,
  } = script;
  const fit = fitHomography(marks);
  const tracker = new Tracker({ imageToPitch: fit.imageToPitch });
  const ball = new BallTracker({ imageToPitch: fit.imageToPitch });
  let turf = null;
  let worstDetectionErrorM = 0;
  const detectionsPerFrame = [];
  const truth = [];
  const total = Math.round(seconds * fps);

  for (let i = 0; i < total; i += 1) {
    const t = i / fps;
    const scene = at(t);
    const frame = renderScene({
      basis: cameraRig.basis,
      pitchToImage: cameraRig.pitchToImage,
      players: scene.players,
      ball: scene.ball ?? null,
      seed: 101 + i,
    });
    if (!turf) {
      turf = fitTurf(frame, { imageToPitch: fit.imageToPitch, dimensions: DIMENSIONS });
    }
    const detection = detect(frame, {
      turf,
      imageToPitch: fit.imageToPitch,
      dimensions: DIMENSIONS,
    });
    detectionsPerFrame.push(detection.candidates.length);
    truth.push(scene.players.map((player) => ({ x: player.x, y: player.y })));

    for (const candidate of detection.candidates) {
      let nearest = Infinity;
      for (const player of scene.players) {
        const gap = Math.hypot(player.x - candidate.pitch.x, player.y - candidate.pitch.y);
        if (gap < nearest) nearest = gap;
      }
      if (nearest > worstDetectionErrorM) worstDetectionErrorM = nearest;
    }

    const result = tracker.update(detection.candidates, t * 1000);
    if (withBall) {
      ball.update(
        ballCandidates(frame, detection.blobs, {
          imageToPitch: fit.imageToPitch,
          dimensions: DIMENSIONS,
        }),
        t * 1000,
      );
    }
    if (onFrame) {
      onFrame({ index: i, timeMs: t * 1000, frame, detection, tracked: result, scene });
    }
  }

  return {
    tracker,
    ball,
    fit,
    turf,
    frames: total,
    worstDetectionErrorM,
    detectionsPerFrame,
    truth,
  };
}

/**
 * The confirmed tracks a run produced, longest-lived first.
 *
 * @param {Tracker} tracker Tracker from {@link play}.
 * @returns {object[]} Confirmed tracks.
 */
export function confirmed(tracker) {
  return tracker.tracks
    .filter((track) => track.confirmed)
    .sort((a, b) => b.distanceM - a.distanceM);
}

/**
 * The track that ended up nearest a given pitch position.
 *
 * @param {Tracker} tracker Tracker from {@link play}.
 * @param {{x: number, y: number}} point Where to look.
 * @returns {object|null} The nearest confirmed track.
 */
export function trackNear(tracker, point) {
  let best = null;
  let bestGap = Infinity;
  for (const track of confirmed(tracker)) {
    const gap = Math.hypot(track.x - point.x, track.y - point.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = track;
    }
  }
  return best;
}
