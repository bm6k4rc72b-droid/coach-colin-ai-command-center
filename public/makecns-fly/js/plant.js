/**
 * The thing being flown — a micro quadrotor, with no help built in.
 *
 * This is the half of the demonstration nobody checks, and it is where the
 * cheating usually is. A quadrotor whose four rotors are identical, whose centre
 * of mass sits exactly between them, and whose attitude is held fixed by the
 * simulator will "hover" under constant throttle. Wire anything at all to that
 * and it looks like flight. It is not: the airframe is doing it.
 *
 * So this airframe is built to be unforgiving in the three ways a real one is:
 *
 *   - **Attitude is an unstable double integrator.** Differential thrust produces
 *     angular acceleration, and nothing restores level. Left alone, it falls over
 *     in a few hundred milliseconds — {@link Quadrotor#timeToFallMs} says how
 *     many, for the current airframe, so the number the controller must beat is
 *     on record before the controller exists.
 *   - **It is not trimmed.** Rotors differ by a few percent and the centre of
 *     mass is offset, both seeded and both reported. Constant equal throttle
 *     drifts, tilts and eventually tumbles.
 *   - **The air is not still.** Gusts are drawn from a seeded process and are the
 *     same on every run with the same seed, so a controller cannot be lucky twice
 *     in a way that a rerun would not expose.
 *
 * There is no stabilisation of any kind in this file. No rate damping, no
 * attitude hold, no altitude hold, no PID. Everything below is Newton and Euler,
 * a first-order motor lag, and linear drag. If the craft hovers, something
 * outside this file made it hover, and {@link module:makecns-fly/ledger} exists
 * to find out what.
 *
 * Units are SI throughout: metres, kilograms, seconds, radians.
 *
 * @module makecns-fly/plant
 */

import { Rng } from './rng.js';

/**
 * A coin-propeller micro quadrotor, roughly the class of machine in the
 * demonstration: tens of grams, thrust-to-weight near four, and an attitude
 * loop far faster than a person can close by hand.
 *
 * @type {Readonly<object>}
 */
export const DEFAULT_AIRFRAME = Object.freeze({
  massKg: 0.031,
  armM: 0.032,
  /** Moments of inertia about body x, y, z. */
  ixx: 1.5e-5,
  iyy: 1.5e-5,
  izz: 2.6e-5,
  /** Thrust per rotor at full command, newtons: `thrustN = kThrust * throttle^2`. */
  kThrust: 0.304,
  /** Reaction-torque coefficient, newton-metres per newton of thrust. */
  kTorque: 0.0075,
  /** Motor and propeller spin-up time constant, seconds. */
  motorTauS: 0.032,
  /** Translational drag, newtons per metre per second. */
  dragNsPerM: 0.022,
  /** Rotational drag, newton-metres per radian per second. Small — props are not a rudder. */
  angularDragNmsPerRad: 6.0e-6,
  gravityMs2: 9.81,
  /** Impact speed above which a landing is a crash, m/s. */
  crashSpeedMs: 1.6,
  /** Tilt beyond which the craft cannot recover, radians. */
  crashTiltRad: 1.05,
  /** Ceiling, metres — a tabletop demonstration, not a flight. */
  ceilingM: 3.0,
});

/** Rotor layout: front, right, back, left, in a plus configuration. */
export const ROTORS = Object.freeze(['front', 'right', 'back', 'left']);

/**
 * A rigid-body quadrotor integrated with semi-implicit Euler.
 */
export class Quadrotor {
  /**
   * @param {object} [options] Settings.
   * @param {object} [options.airframe] Overrides for {@link DEFAULT_AIRFRAME}.
   * @param {number|string} [options.seed] Seed for trim error and gusts.
   * @param {number} [options.gustMs] Gust standard deviation, m/s. Zero for still air.
   * @param {number} [options.trimErrorPct] Rotor-to-rotor thrust spread, percent.
   * @param {number} [options.comOffsetM] Centre-of-mass offset standard deviation,
   *   metres. Pass 0 for a perfectly balanced airframe — useful for isolating one
   *   effect in a test, and misleading as a demonstration setting, because a
   *   balanced airframe is a much easier one to fly.
   */
  constructor(options = {}) {
    this.airframe = { ...DEFAULT_AIRFRAME, ...(options.airframe ?? {}) };
    this.rng = new Rng(options.seed ?? 21).stream('plant');
    this.gustMs = options.gustMs ?? 0.35;
    this.trimErrorPct = options.trimErrorPct ?? 4;

    // Per-rotor efficiency, fixed for the life of the airframe. A real machine's
    // rotors differ by more than this after its first hard landing.
    this.rotorTrim = new Float32Array(4);
    for (let i = 0; i < 4; i += 1) {
      this.rotorTrim[i] = 1 + this.rng.normal(0, this.trimErrorPct / 100);
    }
    // Centre of mass offset from the geometric centre, metres. This, not the
    // rotor spread, is usually the dominant uncorrected torque on a small
    // airframe — see timeToFallMs, which measures the one that actually bites.
    const comSd = options.comOffsetM ?? this.airframe.armM * 0.05;
    this.comOffset = {
      x: this.rng.normal(0, comSd),
      y: this.rng.normal(0, comSd),
    };
    this.gust = { x: 0, y: 0, z: 0 };
    this.reset();
  }

  /** Put the craft back on the ground, rotors stopped, history cleared. */
  reset() {
    this.t = 0;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.att = { roll: 0, pitch: 0, yaw: 0 };
    this.rate = { p: 0, q: 0, r: 0 };
    this.omega = new Float32Array(4);
    this.throttle = new Float32Array(4);
    this.crashed = false;
    this.crashReason = null;
    this.airborne = false;
    this.gust = { x: 0, y: 0, z: 0 };
  }

  /**
   * The throttle at which total thrust equals weight, for a perfectly trimmed
   * airframe.
   *
   * Worth printing next to whatever the controller is commanding: a readout
   * sitting exactly here is holding altitude by arithmetic, not by feedback.
   *
   * @returns {number} Throttle in [0, 1].
   */
  get hoverThrottle() {
    const weight = this.airframe.massKg * this.airframe.gravityMs2;
    return Math.sqrt(weight / (4 * this.airframe.kThrust));
  }

  /**
   * How long this airframe takes to reach an unrecoverable tilt from level, with
   * its rotors held at hover and nothing correcting it.
   *
   * The benchmark any claimed stabiliser has to beat, computed from *this*
   * airframe's actual imperfections rather than from a nominal figure. Both
   * sources of uncorrected torque are included, and on a small machine the second
   * is usually the larger: the rotors differ from each other, and the centre of
   * mass is not between them. Quoting only the rotor spread — as a first draft of
   * this method did — understates the instability by about four times.
   *
   * @returns {number} Milliseconds.
   */
  get timeToFallMs() {
    const a = this.airframe;
    const weight = a.massKg * a.gravityMs2;
    const perRotor = weight / 4;
    const spread = Math.max(
      Math.abs(this.rotorTrim[3] - this.rotorTrim[1]),
      Math.abs(this.rotorTrim[2] - this.rotorTrim[0]),
    );
    const trimTorque = perRotor * spread * a.armM;
    const comTorque = weight * Math.max(Math.abs(this.comOffset.x), Math.abs(this.comOffset.y));
    const torque = trimTorque + comTorque;
    if (!(torque > 0)) return Number.POSITIVE_INFINITY;
    const angAccel = torque / a.ixx;
    return Math.sqrt((2 * a.crashTiltRad) / angAccel) * 1000;
  }

  /** @returns {number} Tilt from level, radians. */
  get tiltRad() {
    return Math.acos(
      Math.max(-1, Math.min(1, Math.cos(this.att.roll) * Math.cos(this.att.pitch))),
    );
  }

  /**
   * Advance the airframe.
   *
   * @param {ArrayLike<number>} commands Four throttle commands in [0, 1], in
   *   {@link ROTORS} order. Values outside the range are clamped, not rejected —
   *   a controller that saturates is a fact to be measured, not an error.
   * @param {number} dtS Timestep, seconds. Keep at or below 2 ms; the attitude
   *   loop of this airframe is fast enough that larger steps integrate visibly wrong.
   * @returns {object} The state after the step.
   */
  step(commands, dtS) {
    const a = this.airframe;
    if (this.crashed) return this.state();

    // Motor lag. The command is not the thrust; this is the single most commonly
    // omitted piece of a quadrotor model, and it is what limits control bandwidth.
    const alpha = 1 - Math.exp(-dtS / a.motorTauS);
    const thrust = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < 4; i += 1) {
      const cmd = Math.max(0, Math.min(1, Number(commands[i]) || 0));
      this.throttle[i] = cmd;
      this.omega[i] += (cmd - this.omega[i]) * alpha;
      thrust[i] = a.kThrust * this.omega[i] * this.omega[i] * this.rotorTrim[i];
      total += thrust[i];
    }

    // Body torques. Plus-configuration: front/back set pitch, right/left set roll,
    // and the reaction torques of the two spin directions set yaw.
    const [front, right, back, left] = thrust;
    const torqueRoll = a.armM * (left - right) + total * this.comOffset.y;
    const torquePitch = a.armM * (back - front) - total * this.comOffset.x;
    const torqueYaw = a.kTorque * (front + back - right - left);

    this.rate.p += ((torqueRoll - a.angularDragNmsPerRad * this.rate.p) / a.ixx) * dtS;
    this.rate.q += ((torquePitch - a.angularDragNmsPerRad * this.rate.q) / a.iyy) * dtS;
    this.rate.r += ((torqueYaw - a.angularDragNmsPerRad * this.rate.r) / a.izz) * dtS;

    this.att.roll += this.rate.p * dtS;
    this.att.pitch += this.rate.q * dtS;
    this.att.yaw += this.rate.r * dtS;

    // Thrust direction: body z expressed in world, ZYX convention.
    const { roll, pitch, yaw } = this.att;
    const sr = Math.sin(roll);
    const cr = Math.cos(roll);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const bodyZ = {
      x: cr * sp * cy + sr * sy,
      y: cr * sp * sy - sr * cy,
      z: cr * cp,
    };

    // Gusts: a first-order process, so they have duration rather than being
    // per-step noise that any integrator averages away for free.
    const gustAlpha = 1 - Math.exp(-dtS / 0.45);
    this.gust.x += (this.rng.normal(0, this.gustMs) - this.gust.x) * gustAlpha;
    this.gust.y += (this.rng.normal(0, this.gustMs) - this.gust.y) * gustAlpha;
    this.gust.z += (this.rng.normal(0, this.gustMs * 0.5) - this.gust.z) * gustAlpha;

    const relX = this.vel.x - this.gust.x;
    const relY = this.vel.y - this.gust.y;
    const relZ = this.vel.z - this.gust.z;

    const ax = (total * bodyZ.x - a.dragNsPerM * relX) / a.massKg;
    const ay = (total * bodyZ.y - a.dragNsPerM * relY) / a.massKg;
    const az = (total * bodyZ.z - a.dragNsPerM * relZ) / a.massKg - a.gravityMs2;

    this.vel.x += ax * dtS;
    this.vel.y += ay * dtS;
    this.vel.z += az * dtS;

    this.pos.x += this.vel.x * dtS;
    this.pos.y += this.vel.y * dtS;
    this.pos.z += this.vel.z * dtS;

    if (this.pos.z > 0.02) this.airborne = true;

    // Ground contact. Touching down gently is landing; arriving fast, or arriving
    // on your side, is not.
    if (this.pos.z <= 0) {
      const impact = -this.vel.z;
      this.pos.z = 0;
      if (this.airborne && (impact > a.crashSpeedMs || this.tiltRad > a.crashTiltRad)) {
        this.crashed = true;
        this.crashReason = impact > a.crashSpeedMs
          ? `ground impact at ${impact.toFixed(2)} m/s`
          : `landed at ${(this.tiltRad * 57.2958).toFixed(0)}° of tilt`;
      }
      if (this.vel.z < 0) this.vel.z = 0;
      this.vel.x *= 0.6;
      this.vel.y *= 0.6;
      this.rate.p *= 0.5;
      this.rate.q *= 0.5;
    }

    if (this.tiltRad > a.crashTiltRad && this.pos.z > 0) {
      this.crashed = true;
      this.crashReason = `tumbled past ${(a.crashTiltRad * 57.2958).toFixed(0)}°`;
    }
    if (this.pos.z > a.ceilingM) {
      this.crashed = true;
      this.crashReason = `left the volume at ${this.pos.z.toFixed(2)} m`;
    }

    this.t += dtS;
    return this.state();
  }

  /**
   * The state a sensor could plausibly observe.
   *
   * Deliberately the *full* state — what the encoder is allowed to see is decided
   * in {@link module:makecns-fly/encode}, not here, so that the choice is one
   * visible line rather than a property of the physics.
   *
   * @returns {object} Position, velocity, attitude, body rates and flags.
   */
  state() {
    return {
      t: this.t,
      pos: { ...this.pos },
      vel: { ...this.vel },
      att: { ...this.att },
      rate: { ...this.rate },
      tiltRad: this.tiltRad,
      throttle: Array.from(this.throttle),
      crashed: this.crashed,
      crashReason: this.crashReason,
      airborne: this.airborne,
    };
  }

  /**
   * What is wrong with this airframe, in words, for the panel that has to admit it.
   *
   * @returns {object} Trim spread, centre-of-mass offset and gust strength.
   */
  imperfections() {
    const spread = Array.from(this.rotorTrim).map((v) => (v - 1) * 100);
    return {
      rotorTrimPct: spread,
      worstRotorPct: spread.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0),
      comOffsetMm: {
        x: this.comOffset.x * 1000,
        y: this.comOffset.y * 1000,
      },
      /** Which imperfection dominates — the honest answer is usually the mass. */
      dominant: Math.abs(this.comOffset.y) * this.airframe.massKg * this.airframe.gravityMs2
        > (this.airframe.massKg * this.airframe.gravityMs2 / 4) * Math.abs(this.rotorTrim[3] - this.rotorTrim[1]) * this.airframe.armM
        ? 'centre of mass'
        : 'rotor spread',
      gustMs: this.gustMs,
      timeToFallMs: this.timeToFallMs,
      hoverThrottle: this.hoverThrottle,
    };
  }
}
