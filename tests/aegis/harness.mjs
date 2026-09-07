/**
 * Driving a scenario through the real console pipeline from Node.
 *
 * This is deliberately the same sequence of calls `app.js` makes per frame, in
 * the same order, with the same arguments. If the two ever diverge the tests
 * stop testing the product, so the loop is kept short enough to read side by
 * side with `analyse` and `tick`.
 *
 * @module tests/aegis/harness
 */

import { DEMO_FPS, DEMO_OCCLUDERS, DEMO_REST_ZONES, Scene } from '../../public/aegis/js/demo.js';
import { clean, createField, holdMask, regions, segment, updateField } from '../../public/aegis/js/silhouette.js';
import { FloorModel, readPosture } from '../../public/aegis/js/posture.js';
import { FallMachine } from '../../public/aegis/js/kinematics.js';
import { analyseInertial } from '../../public/aegis/js/inertial.js';
import { analyseAcoustic } from '../../public/aegis/js/acoustic.js';
import { fuse } from '../../public/aegis/js/fusion.js';

/**
 * Replay a scenario and report what happened.
 *
 * @param {string} id Which scenario.
 * @param {object} [options] Options.
 * @param {number} [options.dwellMs] Override the dwell.
 * @returns {object} Everything the assertions need.
 */
export function run(id, options = {}) {
  const scene = new Scene(id);
  const field = createField(scene.width, scene.height);
  const floor = new FloorModel();
  const machine = new FallMachine({
    restZones: DEMO_REST_ZONES,
    dwellMs: options.dwellMs,
  });

  let hold = null;
  let peak = 0;
  let peakVerdict = fuse({});
  let peakRate = 0;
  let peakOcclusion = 0;
  let finalStature = NaN;
  let sawImputed = false;
  let sawInertialImpact = false;
  let sawInertialAgainst = false;
  const states = new Set();
  const trace = [];

  const step = 1 / DEMO_FPS;
  for (let seconds = 0; seconds <= scene.seconds; seconds += step) {
    const frame = scene.frameAt(seconds);
    const timeMs = seconds * 1000;
    updateField(field, frame, { hold });
    const { mask } = segment(field, frame, { sensitivity: 0.5 });
    const cleaned = clean(mask, scene.width, scene.height);
    const found = regions(cleaned, scene.width, scene.height, 60);
    hold = holdMask(found.slice(0, 2), scene.width, scene.height);
    const posture = readPosture(found[0] || null, {
      width: scene.width,
      height: scene.height,
      timeMs,
      floor,
      occluders: DEMO_OCCLUDERS,
    });
    const vision = machine.update(posture, {
      timeMs,
      width: scene.width,
      height: scene.height,
    });
    const inertial = analyseInertial(scene.motionAt(seconds), { nowMs: timeMs });
    const acoustic = analyseAcoustic(scene.audioAt(seconds), { nowMs: timeMs });
    const verdict = fuse({ vision, inertial, acoustic });

    states.add(vision.state);
    if (posture.imputed && posture.present) sawImputed = true;
    if (posture.occlusion > peakOcclusion) peakOcclusion = posture.occlusion;
    if (vision.peakRate > peakRate) peakRate = vision.peakRate;
    if (inertial.impact.found) sawInertialImpact = true;
    if (inertial.against > 0.3) sawInertialAgainst = true;
    if (Number.isFinite(posture.stature)) finalStature = vision.stature;
    if (verdict.belief > peak) { peak = verdict.belief; peakVerdict = verdict; }
    trace.push({ seconds, state: vision.state, belief: verdict.belief, stature: vision.stature });
  }

  return {
    peak,
    peakVerdict,
    peakRate,
    peakOcclusion,
    finalStature,
    sawImputed,
    sawInertialImpact,
    sawInertialAgainst,
    states,
    trace,
  };
}
