/**
 * The flight logic the demonstration says does not exist.
 *
 * "Without any PID loops, stability code, or pre-programmed flight parameters."
 * That sentence is the claim. This file is a PID loop, stability code, and a set
 * of pre-programmed flight parameters, and it is here for one reason: a thing
 * you refuse to implement is a thing whose contribution you cannot measure.
 *
 * It is used in exactly one place — as the *teacher* during a training phase,
 * when the readout in {@link module:makecns-fly/decode} is fitted by recursive
 * least squares to reproduce this controller's output from the network's spikes.
 * Once training ends the teacher is disconnected, and what flies afterwards is
 * the network and the fitted weights alone.
 *
 * That is a legitimate and well-understood technique — it is how reservoir
 * computing has always worked. It is also not "no control logic". The control
 * logic was here, it was optimal for this airframe, and its knowledge was copied
 * into a linear map. The app keeps a count of how many seconds the teacher was
 * connected and prints it beside every result, because a hover achieved after
 * thirty seconds of supervised fitting to a hand-tuned PD controller is a
 * different claim from a hover achieved by a brain.
 *
 * The gains below are not guessed. They are placed, from the airframe's own
 * constants, so that the closed loop has a chosen natural frequency and damping:
 *
 *   angular acceleration per unit differential throttle
 *     = 2 * (dThrust/dThrottle) * arm / I
 *
 * and the gains follow from `kp = wn^2 / that` and `kd = 2*zeta*wn / that`. For
 * the default airframe that authority is about 1300 rad/s^2 per unit throttle,
 * which is enormous — one percent of throttle is six radians per second squared —
 * and it is why hand-picked gains on this machine are almost always far too
 * stiff. A stiff controller saturates, saturation makes it bang-bang, and a
 * readout fitted to a bang-bang teacher learns a square wave it cannot reproduce.
 * That failure cost a day of this app's development and is left documented here
 * rather than tidied away.
 *
 * Nothing in this file is clever, and that is the point: what the elaborate
 * version has to beat is a dozen lines of arithmetic with its gains placed properly.
 *
 * @module makecns-fly/teacher
 */

import { ROTORS } from './plant.js';

/**
 * Gains, tuned against {@link module:makecns-fly/plant.DEFAULT_AIRFRAME}.
 *
 * @type {Readonly<object>}
 */
export const TEACHER_GAINS = Object.freeze({
  /** Altitude loop placed at about 3 rad/s, critically damped. */
  altitudeP: 0.23,
  altitudeD: 0.16,
  /** Attitude loop placed at about 12 rad/s with damping 0.9. */
  attitudeP: 0.11,
  attitudeD: 0.017,
  /**
   * Maximum authority the attitude terms may take from the throttle.
   *
   * Generous relative to the gains above — it is a backstop against a genuine
   * upset, not a working limit. If normal flight is hitting it, the gains are
   * wrong, and the app's training diagnostics report the fraction of the training
   * flight spent on this rail for exactly that reason.
   */
  attitudeClamp: 0.08,
});

/**
 * A PD controller producing four throttle commands.
 *
 * @param {object} state Plant state from {@link module:makecns-fly/plant.Quadrotor#state}.
 * @param {number} targetZ Commanded altitude, metres.
 * @param {number} hoverThrottle Feed-forward throttle for this airframe.
 * @param {object} [gains] Overrides for {@link TEACHER_GAINS}.
 * @returns {Float32Array} Four throttles in {@link ROTORS} order, clamped to [0, 1].
 */
export function teacherCommand(state, targetZ, hoverThrottle, gains = TEACHER_GAINS) {
  const g = { ...TEACHER_GAINS, ...gains };
  const base = hoverThrottle + g.altitudeP * (targetZ - state.pos.z) - g.altitudeD * state.vel.z;

  const rollTerm = clamp(-g.attitudeP * state.att.roll - g.attitudeD * state.rate.p, g.attitudeClamp);
  const pitchTerm = clamp(-g.attitudeP * state.att.pitch - g.attitudeD * state.rate.q, g.attitudeClamp);

  // Plus configuration: pitch is front/back, roll is right/left.
  const out = new Float32Array(4);
  out[ROTORS.indexOf('front')] = base - pitchTerm;
  out[ROTORS.indexOf('back')] = base + pitchTerm;
  out[ROTORS.indexOf('right')] = base - rollTerm;
  out[ROTORS.indexOf('left')] = base + rollTerm;
  for (let i = 0; i < 4; i += 1) out[i] = Math.max(0, Math.min(1, out[i]));
  return out;
}

/** Symmetric clamp. */
function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * How many free parameters the teacher has, for the honesty ledger.
 *
 * Five. The readout that replaces it has hundreds. Neither count is a virtue on
 * its own, but the comparison is the kind a reader is entitled to make.
 *
 * @returns {number} Parameter count.
 */
export function teacherParameterCount() {
  return Object.keys(TEACHER_GAINS).length;
}
