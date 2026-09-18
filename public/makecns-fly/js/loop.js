/**
 * The closed loop, assembled — and instrumented so it cannot flatter itself.
 *
 * Sensors to spikes to throttles to physics to sensors, at one millisecond a
 * step. Everything in this file is plumbing; the claims live in the modules it
 * connects. What this file adds is bookkeeping, and the bookkeeping is the
 * product: how long the craft stayed up, how far off the commanded altitude it
 * sat, how much of that flight had a teacher connected, and under which
 * ablation.
 *
 * The loop has three phases and shows which it is in at all times:
 *
 *   - **`settle`** — the network runs with the craft on the ground, so the rate
 *     filters are at their working point before anything is measured. Skipping
 *     this makes the first second of every flight a transient, which is exactly
 *     the second a demonstration video would show.
 *   - **`training`** — only in the `trained` readout mode. The teacher flies the
 *     craft and the readout is fitted to it. Nothing measured here counts.
 *   - **`flying`** — the teacher is disconnected. Whatever happens now is the
 *     result.
 *
 * The eleven seconds in the original claim — "within just 11 seconds of
 * operation, the simulated brain began holding altitude" — is why the phase
 * clock is reported in seconds since the loop began as well as seconds since the
 * teacher was cut. Those are very different numbers and only one of them is the
 * interesting one.
 *
 * @module makecns-fly/loop
 */

import { buildSynthetic } from './connectome.js';
import { SpikingNetwork } from './net.js';
import { SensoryEncoder } from './encode.js';
import { MotorDecoder } from './decode.js';
import { Quadrotor } from './plant.js';
import { teacherCommand } from './teacher.js';
import { Rng } from './rng.js';

/** Loop constants. */
export const DEFAULT_LOOP = Object.freeze({
  /** Simulation timestep, milliseconds. The network and the airframe share it. */
  dtMs: 1,
  /** How often the readout is evaluated and the motors are updated, milliseconds. */
  controlEveryMs: 5,
  /** Seconds of network activity before anything is commanded. */
  settleSeconds: 0.5,
  /** Seconds the teacher is connected, in `trained` mode. */
  trainSeconds: 60,
  /**
   * Seconds at the end of training during which control is handed over
   * gradually — the readout flies an increasing share while the teacher keeps
   * supplying targets.
   *
   * Without this the readout is trained by pure imitation: it only ever sees
   * states the teacher's own good flying produced. The moment it takes over, its
   * small errors carry the craft into states it was never trained on, where it
   * makes larger errors, and the thing diverges. That is covariate shift, it is
   * the standard failure of behaviour cloning (Ross, Gordon and Bagnell, 2011),
   * and it is *exactly* what a demonstration that flies for a few seconds and then
   * ends looks like.
   *
   * Handing over gradually while still learning is the standard remedy. It is
   * also another thing the flight needs that no account of it mentions.
   */
  handoverSeconds: 30,
  /** Commanded altitude at fully closed and fully open palm, metres. */
  altitudeAtClosedM: 0.25,
  altitudeAtOpenM: 1.6,
  /** Altitude error within which the craft counts as holding, metres. */
  holdToleranceM: 0.25,
  /** Tilt beyond which it does not count as holding, radians. */
  holdTiltRad: 0.44,
  /** Telemetry history length, samples at the control rate. */
  historySamples: 1200,
  /**
   * Exploration dither added to the teacher's command during training, in
   * throttle units.
   *
   * Necessary, and worth saying why. A readout can only learn a relationship
   * from states it has seen, and a well-flown quadrotor never leaves level
   * flight — train on the teacher's own trajectory and the roll channel is a
   * constant zero, from which nothing about roll can be learnt. So the teacher is
   * deliberately disturbed during training, the craft wanders, and the readout
   * sees the corrections. This is textbook persistent excitation, and it is
   * another thing the demonstration's account has no room for: the training
   * flight has to be worse than the final one on purpose.
   */
  explorationDither: 0.06,
  /** Time constant of that dither, milliseconds — slow enough to move the airframe. */
  ditherTauMs: 120,
});

/** Phases, in the order they occur. */
export const PHASES = Object.freeze(['settle', 'training', 'flying', 'ended']);

/**
 * A complete sensor-to-motor flight loop with its own scorekeeping.
 */
export class FlightLoop {
  /**
   * @param {object} [options] Settings.
   * @param {number} [options.neurons] Simulated neuron count.
   * @param {string} [options.profile] Connectome profile to match.
   * @param {number|string} [options.seed] Root seed for everything.
   * @param {string} [options.sensorSet] Key into {@link module:makecns-fly/encode.SENSOR_SETS}.
   * @param {string} [options.readoutMode] Key into {@link module:makecns-fly/decode.READOUT_MODES}.
   * @param {string} [options.ablation] Key into {@link module:makecns-fly/net.ABLATIONS}.
   * @param {string} [options.flightAblation] An ablation applied at the moment the
   *   teacher is disconnected, leaving training untouched. This is the one that
   *   measures anything: handicap the network *after* it has been fitted, and the
   *   change in flight is attributable to the network rather than to the fit.
   * @param {object} [options.loop] Overrides for {@link DEFAULT_LOOP}.
   * @param {object} [options.plant] Options for {@link module:makecns-fly/plant.Quadrotor}.
   */
  constructor(options = {}) {
    const seed = options.seed ?? 1;
    this.options = options;
    this.config = { ...DEFAULT_LOOP, ...(options.loop ?? {}) };
    this.connectome = options.connectome
      ?? buildSynthetic({ count: options.neurons ?? 2048, profile: options.profile ?? 'flywire', seed });
    this.net = new SpikingNetwork(this.connectome, { seed, ablation: options.ablation ?? 'intact' });
    this.encoder = new SensoryEncoder(this.connectome, { sensorSet: options.sensorSet ?? 'hand+proprioception' });
    this.decoder = new MotorDecoder(this.connectome, { seed, mode: options.readoutMode ?? 'trained' });
    this.plant = new Quadrotor({ seed, ...(options.plant ?? {}) });
    this.palm = 0.5;
    this.history = [];
    this.ditherRng = new Rng(seed).stream('dither');
    this.reset();
  }

  /** Restart the flight without rebuilding the network's wiring. */
  reset() {
    this.net.reset();
    this.decoder.reset();
    this.plant.reset();
    this.tMs = 0;
    this.phase = 'settle';
    this.phaseStartMs = 0;
    this.command = new Float32Array(4).fill(0);
    this.teacherLast = new Float32Array(4).fill(0);
    this.history = [];
    this.dither = new Float32Array(4);
    this.handover = 0;
    this.unsupervisedStartMs = null;
    this.stepsSinceControl = 0;
    this.trainError = 0;
    this.saturatedChannels = [];
    this.dither = new Float32Array(4);
    this.metrics = {
      controlSamples: 0,
      holdSamples: 0,
      errorSumSq: 0,
      tiltSumSq: 0,
      flyingMs: 0,
      firstHoldMs: null,
      crashedAtMs: null,
      maxAltitudeM: 0,
      throttleSaturation: 0,
    };
  }

  /** @returns {number} Seconds spent in the training phase so far. */
  get trainingElapsedSeconds() {
    return this.phase === 'training' ? (this.tMs - this.phaseStartMs) / 1000 : 0;
  }

  /** @returns {number} Commanded altitude implied by the current palm reading, metres. */
  get targetAltitudeM() {
    const { altitudeAtClosedM, altitudeAtOpenM } = this.config;
    return altitudeAtClosedM + this.palm * (altitudeAtOpenM - altitudeAtClosedM);
  }

  /**
   * Set the gesture input.
   *
   * @param {number} openness Palm openness in [0, 1].
   */
  setPalm(openness) {
    this.palm = Math.max(0, Math.min(1, Number(openness) || 0));
  }

  /** @returns {boolean} Whether the drone's own state reaches the network. */
  get closedLoop() {
    return this.encoder.closedLoop;
  }

  /**
   * Advance the whole loop by one timestep.
   *
   * @returns {object} A snapshot suitable for rendering.
   */
  step() {
    const { dtMs, controlEveryMs, settleSeconds, trainSeconds } = this.config;
    const dtS = dtMs / 1000;
    const state = this.plant.state();

    // 1. Sense. The encoder decides what of this the network is allowed to see;
    //    in `hand-only` every proprioceptive term below is computed and discarded,
    //    which is the whole experiment.
    const observation = {
      palm: this.palm,
      z: state.pos.z,
      vz: state.vel.z,
      roll: state.att.roll,
      pitch: state.att.pitch,
      p: state.rate.p,
      q: state.rate.q,
    };
    const { current, saturated } = this.encoder.encode(observation);
    this.saturatedChannels = saturated;

    // 2. Spike.
    this.net.step(current, dtMs);

    // 3. Phase bookkeeping.
    const seconds = this.tMs / 1000;
    if (this.phase === 'settle' && seconds >= settleSeconds) {
      this.phase = this.decoder.mode === 'trained' ? 'training' : 'flying';
      this.phaseStartMs = this.tMs;
      if (this.phase === 'flying') {
        this.unsupervisedStartMs = this.tMs;
        if (this.options.flightAblation) this.net.setAblation(this.options.flightAblation);
      }
    } else if (this.phase === 'training' && (this.tMs - this.phaseStartMs) / 1000 >= trainSeconds) {
      this.phase = 'flying';
      this.phaseStartMs = this.tMs;
      this.unsupervisedStartMs = this.tMs;
      if (this.options.flightAblation) this.net.setAblation(this.options.flightAblation);
    }

    // 4. Control, at the control rate rather than the network's timestep.
    this.stepsSinceControl += dtMs;
    if (this.stepsSinceControl >= controlEveryMs) {
      const elapsed = this.stepsSinceControl;
      this.stepsSinceControl = 0;
      const teacher = teacherCommand(state, this.targetAltitudeM, this.plant.hoverThrottle);
      this.teacherLast = teacher;

      if (this.phase === 'settle') {
        this.command = new Float32Array(4);
      } else if (this.phase === 'training') {
        // The readout is fitted to the teacher's *undithered* command, but the
        // craft flies the dithered, partly self-flown one. The target stays clean
        // while the states visited stay varied — and, towards the end, are the
        // states the readout's own mistakes produce.
        this.trainError = this.decoder.train(this.net, teacher, this.plant.hoverThrottle, elapsed);
        const alpha = 1 - Math.exp(-elapsed / this.config.ditherTauMs);
        const trained = this.trainingElapsedSeconds;
        const { trainSeconds, handoverSeconds } = this.config;
        const start = Math.max(0, trainSeconds - handoverSeconds);
        this.handover = handoverSeconds > 0
          ? Math.max(0, Math.min(1, (trained - start) / handoverSeconds))
          : 0;
        const readout = this.handover > 0
          ? this.decoder.command(this.net, this.plant.hoverThrottle)
          : null;
        const blended = new Float32Array(4);
        for (let i = 0; i < 4; i += 1) {
          this.dither[i] += (this.ditherRng.normal(0, this.config.explorationDither) - this.dither[i]) * alpha;
          const base = readout
            ? (1 - this.handover) * teacher[i] + this.handover * readout[i]
            : teacher[i];
          blended[i] = Math.max(0, Math.min(1, base + this.dither[i] * (1 - this.handover)));
        }
        this.command = blended;
      } else if (this.decoder.mode === 'direct') {
        this.command = teacher;
      } else {
        this.command = this.decoder.command(this.net, this.plant.hoverThrottle);
      }
      this.recordSample(state);
    }

    // 5. Fly.
    this.plant.step(this.command, dtS);
    if (this.plant.crashed && this.metrics.crashedAtMs === null) {
      this.metrics.crashedAtMs = this.tMs;
      this.phase = 'ended';
    }

    this.tMs += dtMs;
    return this.snapshot();
  }

  /**
   * Score one control sample. Only samples taken in the `flying` phase count —
   * a result that includes the teacher's own flying is not a result.
   *
   * @param {object} state Plant state at the sample.
   */
  recordSample(state) {
    const target = this.targetAltitudeM;
    const error = state.pos.z - target;
    const holding = Math.abs(error) <= this.config.holdToleranceM
      && state.tiltRad <= this.config.holdTiltRad
      && !state.crashed;

    this.history.push({
      tMs: this.tMs,
      phase: this.phase,
      z: state.pos.z,
      target,
      tilt: state.tiltRad,
      throttle: Array.from(this.command),
      teacher: Array.from(this.teacherLast),
      rateHz: this.net.meanRateHz(),
      motorHz: this.net.populationRateHz('motor'),
      holding,
    });
    if (this.history.length > this.config.historySamples) this.history.shift();

    // Scoring continues after a crash, deliberately. Stopping the count at the
    // crash would score a craft only over the seconds it managed to survive, so a
    // controller that flies beautifully for one second of a twenty-second window
    // and then tumbles would report a near-perfect hold. Every sample in the
    // window counts, and a wrecked aircraft is not holding altitude.
    if (this.unsupervisedStartMs === null) return;
    const m = this.metrics;
    m.controlSamples += 1;
    m.errorSumSq += error * error;
    m.tiltSumSq += state.tiltRad * state.tiltRad;
    m.flyingMs = this.tMs - this.unsupervisedStartMs;
    m.maxAltitudeM = Math.max(m.maxAltitudeM, state.pos.z);
    if (holding) {
      m.holdSamples += 1;
      if (m.firstHoldMs === null) m.firstHoldMs = this.tMs - this.phaseStartMs;
    } else if (m.firstHoldMs !== null && !holding) {
      // A hold that did not last was not a hold. Requiring it to be re-earned is
      // the difference between "began hovering at 11 seconds" and "hovered".
      m.firstHoldMs = null;
    }
    for (let i = 0; i < 4; i += 1) {
      if (this.command[i] <= 0.001 || this.command[i] >= 0.999) m.throttleSaturation += 0.25;
    }
  }

  /**
   * The result so far.
   *
   * `holdFraction` is the headline: the share of unsupervised control samples in
   * which the craft was within tolerance of the commanded altitude and roughly
   * level. One is a hover. Zero is a video.
   *
   * @returns {object} Scores, with the caveats that qualify them.
   */
  score() {
    const m = this.metrics;
    const n = Math.max(1, m.controlSamples);
    return {
      holdFraction: m.holdSamples / n,
      rmsAltitudeErrorM: Math.sqrt(m.errorSumSq / n),
      rmsTiltDeg: Math.sqrt(m.tiltSumSq / n) * 57.2958,
      unsupervisedSeconds: m.flyingMs / 1000,
      survived: !this.plant.crashed,
      crashedAtSeconds: m.crashedAtMs === null ? null : m.crashedAtMs / 1000,
      crashReason: this.plant.crashReason,
      firstSustainedHoldSeconds: m.firstHoldMs === null ? null : m.firstHoldMs / 1000,
      maxAltitudeM: m.maxAltitudeM,
      saturationFraction: m.throttleSaturation / n,
      closedLoop: this.closedLoop,
      supervisedSeconds: this.decoder.trainedMs / 1000,
      samples: m.controlSamples,
    };
  }

  /** @returns {object} Everything the UI paints in one frame. */
  snapshot() {
    return {
      tMs: this.tMs,
      phase: this.phase,
      phaseSeconds: (this.tMs - this.phaseStartMs) / 1000,
      palm: this.palm,
      target: this.targetAltitudeM,
      state: this.plant.state(),
      command: Array.from(this.command),
      teacher: Array.from(this.teacherLast),
      meanRateHz: this.net.meanRateHz(),
      motorRateHz: this.net.populationRateHz('motor'),
      spikes: this.net.currentSpikes(),
      trainError: this.trainError,
      handover: this.handover,
      weightNorm: this.decoder.weightNorm(),
      saturatedChannels: this.saturatedChannels,
      closedLoop: this.closedLoop,
    };
  }

  /**
   * Run without a browser, for the ledger and the tests.
   *
   * @param {number} seconds Simulated seconds to run.
   * @param {(loop: FlightLoop) => void} [onStep] Called once per simulated step.
   * @returns {object} {@link #score} at the end.
   */
  run(seconds, onStep) {
    const steps = Math.round((seconds * 1000) / this.config.dtMs);
    for (let i = 0; i < steps; i += 1) {
      this.step();
      if (onStep) onStep(this);
    }
    return this.score();
  }
}
