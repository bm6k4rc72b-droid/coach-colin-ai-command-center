/**
 * Getting the network out to the motors — and where the control actually lives.
 *
 * The demonstration's phrasing is "the simulated wiring routed throttle outputs
 * to coin-sized propellers", which sounds like the network's own connectivity
 * decided what the motors did. Between any spiking network and any motor there
 * is a readout, and the readout is a function with parameters. The only question
 * worth asking is who chose them.
 *
 * Three answers are available here, and swapping between them is the experiment:
 *
 *   - **`fixed-random`** — weights drawn once from a seed and never touched. This
 *     is the honest version of "we just wired the motor neurons to the props". It
 *     is also the version that does not fly, and watching it not fly is the
 *     control condition the interesting modes are measured against.
 *   - **`trained`** — the same linear map, with its weights fitted online by
 *     recursive least squares to reproduce {@link module:makecns-fly/teacher}'s
 *     output from the network's rates. Standard reservoir computing. It works.
 *     It also means a hand-tuned PD controller's behaviour has been copied into
 *     the readout, and {@link #provenance} says so in as many words.
 *   - **`direct`** — no network at all; the teacher drives the motors. Present so
 *     that "how well can this airframe possibly be flown" is a measured number
 *     rather than an assumption.
 *
 * Two things are handed to the readout for free, and both must be declared.
 *
 * The first is the feed-forward hover term. Adding the airframe's known hover
 * throttle to every output means the readout only has to learn the *correction*,
 * which is both standard practice and a large piece of prior knowledge about the
 * plant.
 *
 * The second is the output basis, and it turns out to decide everything. A
 * readout that predicts four absolute rotor throttles will not fly this
 * airframe, and the reason is worth understanding because it is invisible from
 * the outside. Almost all the variance in those four numbers is common-mode —
 * they rise and fall together with the altitude command. The part that keeps the
 * craft upright is the *difference* between opposite rotors, and it is under one
 * percent of the signal. A least-squares fit spends its capacity where the
 * variance is, so it reproduces the collective beautifully and discards the
 * differential, and the craft holds altitude perfectly for a third of a second
 * and then tumbles. Measured, not theorised: it is the `rotors` basis below, and
 * it is kept so anyone can watch it happen.
 *
 * The fix is to give the readout a basis in which the thing that matters has its
 * own axis — collective, roll, pitch, yaw — and mix back to rotors afterwards.
 * That mixing matrix is the airframe's geometry. It is knowledge about the plant,
 * supplied by an engineer, and without it none of this flies. It belongs in the
 * ledger next to the hover term and the teacher, and it is there.
 *
 * @module makecns-fly/decode
 */

import { Rng } from './rng.js';

/** How the readout weights are chosen. */
export const READOUT_MODES = Object.freeze(['fixed-random', 'trained', 'direct']);

/** Readout constants. */
export const DEFAULT_READOUT = Object.freeze({
  /** Neurons sampled as readout features. */
  featureCount: 300,
  /** Rate scale, hertz per unit feature — keeps features near unit magnitude. */
  featureScaleHz: 20,
  /** Recursive-least-squares forgetting factor. 1 means never forget. */
  forgetting: 0.9999,
  /** Initial inverse-correlation magnitude. Larger means faster, twitchier fitting. */
  initialP: 1.0,
  /** Weight magnitude for the fixed-random readout. */
  randomScale: 0.05,
  /** Add the airframe's known hover throttle to every output. */
  feedForwardHover: true,
  /**
   * Read each sampled neuron through both the slow and the fast rate filter.
   *
   * Doubles the feature count and is what lets the readout form a derivative —
   * see {@link module:makecns-fly/net.DEFAULT_PARAMS.tauFastMs}. Switch it off to
   * watch a lag-only readout fail to damp anything.
   */
  dualTimescale: true,
  /**
   * What the four outputs mean: `control-axes` for collective/roll/pitch/yaw, or
   * `rotors` for four absolute throttles. See the module note — this choice is
   * the difference between flying and not.
   */
  outputBasis: 'control-axes',
});

/** Output bases the readout can be fitted in. */
export const OUTPUT_BASES = Object.freeze(['control-axes', 'rotors']);

/**
 * Convert four rotor throttles into collective, roll, pitch and yaw components.
 *
 * Plus configuration, in {@link module:makecns-fly/plant.ROTORS} order:
 * front, right, back, left.
 *
 * @param {ArrayLike<number>} rotors Four throttles.
 * @returns {Float32Array} `[collective, roll, pitch, yaw]`.
 */
export function rotorsToAxes(rotors) {
  const [front, right, back, left] = rotors;
  const out = new Float32Array(4);
  out[0] = (front + right + back + left) / 4;
  out[1] = (left - right) / 2;
  out[2] = (back - front) / 2;
  out[3] = (front + back - right - left) / 4;
  return out;
}

/**
 * The inverse of {@link rotorsToAxes}.
 *
 * @param {ArrayLike<number>} axes `[collective, roll, pitch, yaw]`.
 * @returns {Float32Array} Four throttles in rotor order.
 */
export function axesToRotors(axes) {
  const [collective, roll, pitch, yaw] = axes;
  const out = new Float32Array(4);
  out[0] = collective - pitch + yaw; // front
  out[1] = collective - roll - yaw; // right
  out[2] = collective + pitch + yaw; // back
  out[3] = collective + roll - yaw; // left
  return out;
}

/**
 * A linear readout from network rates to four throttle commands.
 */
export class MotorDecoder {
  /**
   * @param {import('./connectome.js').Connectome} connectome Source network.
   * @param {object} [options] Settings, overriding {@link DEFAULT_READOUT}.
   * @param {number|string} [options.seed] Seed for feature sampling and random weights.
   * @param {string} [options.mode] One of {@link READOUT_MODES}.
   */
  constructor(connectome, options = {}) {
    this.connectome = connectome;
    this.config = { ...DEFAULT_READOUT, ...options };
    this.mode = options.mode ?? 'trained';
    if (!READOUT_MODES.includes(this.mode)) throw new Error(`unknown readout mode: ${this.mode}`);
    if (!OUTPUT_BASES.includes(this.config.outputBasis)) {
      throw new Error(`unknown output basis: ${this.config.outputBasis}`);
    }
    const rng = new Rng(options.seed ?? 31).stream('readout');

    // Features are drawn from the motor pool first — it is the pool the wiring
    // actually routes to — and topped up from the interneuron pool when the motor
    // pool is smaller than the requested feature count.
    const motor = connectome.range('motor');
    const inter = connectome.range('inter');
    const pool = [];
    for (let i = motor.start; i < motor.end; i += 1) pool.push(i);
    const spare = [];
    for (let i = inter.start; i < inter.end; i += 1) spare.push(i);
    rng.shuffle(spare);
    while (pool.length < this.config.featureCount && spare.length) pool.push(spare.pop());
    rng.shuffle(pool);
    this.featureIndex = Int32Array.from(pool.slice(0, this.config.featureCount));
    this.motorFeatureCount = this.featureIndex.reduce(
      (n, i) => n + (i >= motor.start && i < motor.end ? 1 : 0),
      0,
    );

    const perNeuron = this.config.dualTimescale ? 2 : 1;
    const k = this.featureIndex.length * perNeuron + 1; // +1 for the constant term
    this.dim = k;
    this.x = new Float32Array(k);
    this.weights = new Float32Array(k * 4);
    this.p = new Float32Array(k * k);
    this.rng = rng;
    this.trainedMs = 0;
    this.updates = 0;
    this.lastError = new Float32Array(4);
    this.reset();
  }

  /** Forget all fitted weights and restart the estimator. */
  reset() {
    this.weights.fill(0);
    this.p.fill(0);
    for (let i = 0; i < this.dim; i += 1) this.p[i * this.dim + i] = this.config.initialP;
    this.trainedMs = 0;
    this.updates = 0;
    this.lastError.fill(0);
    if (this.mode === 'fixed-random') {
      const scale = this.config.randomScale;
      for (let i = 0; i < this.weights.length; i += 1) this.weights[i] = this.rng.normal(0, scale);
    }
  }

  /**
   * Read the current feature vector out of a network.
   *
   * @param {import('./net.js').SpikingNetwork} net Network to read.
   * @returns {Float32Array} Features, with the constant term last.
   */
  features(net) {
    const scale = 1000 / this.config.featureScaleHz;
    const count = this.featureIndex.length;
    for (let i = 0; i < count; i += 1) {
      this.x[i] = net.rates[this.featureIndex[i]] * scale;
    }
    if (this.config.dualTimescale) {
      for (let i = 0; i < count; i += 1) {
        this.x[count + i] = net.ratesFast[this.featureIndex[i]] * scale;
      }
    }
    this.x[this.dim - 1] = 1;
    return this.x;
  }

  /**
   * The throttle command implied by the network's present state.
   *
   * @param {import('./net.js').SpikingNetwork} net Network to read.
   * @param {number} hoverThrottle Airframe hover throttle, for the feed-forward term.
   * @returns {Float32Array} Four throttles in rotor order, clamped to [0, 1].
   */
  command(net, hoverThrottle) {
    const x = this.features(net);
    const bias = this.config.feedForwardHover ? hoverThrottle : 0;
    const raw = new Float32Array(4);
    for (let o = 0; o < 4; o += 1) {
      let acc = 0;
      const base = o * this.dim;
      for (let i = 0; i < this.dim; i += 1) acc += this.weights[base + i] * x[i];
      raw[o] = acc;
    }
    // In the control-axis basis only the collective carries the hover term; the
    // three differential axes are corrections about zero.
    let rotors;
    if (this.config.outputBasis === 'control-axes') {
      raw[0] += bias;
      rotors = axesToRotors(raw);
    } else {
      rotors = raw;
      for (let o = 0; o < 4; o += 1) rotors[o] += bias;
    }
    const out = new Float32Array(4);
    for (let o = 0; o < 4; o += 1) out[o] = Math.max(0, Math.min(1, rotors[o]));
    return out;
  }

  /**
   * The teacher's command, expressed in whatever basis this readout is fitted in.
   *
   * @param {ArrayLike<number>} rotorTarget Teacher's four rotor throttles.
   * @param {number} hoverThrottle Feed-forward term.
   * @returns {Float32Array} Four fitting targets.
   */
  targetVector(rotorTarget, hoverThrottle) {
    const bias = this.config.feedForwardHover ? hoverThrottle : 0;
    if (this.config.outputBasis === 'control-axes') {
      const axes = rotorsToAxes(rotorTarget);
      axes[0] -= bias;
      return axes;
    }
    const out = new Float32Array(4);
    for (let o = 0; o < 4; o += 1) out[o] = rotorTarget[o] - bias;
    return out;
  }

  /**
   * One recursive-least-squares update against a teacher's command.
   *
   * The estimator is shared across the four outputs, which is the usual FORCE
   * arrangement: one inverse-correlation matrix, four weight vectors. Cost is
   * quadratic in the feature count, which is why the flight loop trains at a few
   * hundred hertz rather than at the network's own timestep.
   *
   * @param {import('./net.js').SpikingNetwork} net Network to read.
   * @param {ArrayLike<number>} target Teacher's four throttles.
   * @param {number} hoverThrottle Feed-forward term, subtracted from the target.
   * @param {number} dtMs Simulated milliseconds since the previous update.
   * @returns {number} Mean absolute pre-update error, in throttle units.
   */
  train(net, target, hoverThrottle, dtMs = 0) {
    if (this.mode !== 'trained') return 0;
    const x = this.features(net);
    const n = this.dim;
    const lambda = this.config.forgetting;

    // k = P x / (lambda + x' P x)
    const px = new Float32Array(n);
    let xpx = 0;
    for (let i = 0; i < n; i += 1) {
      let acc = 0;
      const row = i * n;
      for (let j = 0; j < n; j += 1) acc += this.p[row + j] * x[j];
      px[i] = acc;
      xpx += x[i] * acc;
    }
    const denom = lambda + xpx;
    if (!(denom > 1e-9)) return 0;
    const gain = new Float32Array(n);
    for (let i = 0; i < n; i += 1) gain[i] = px[i] / denom;

    // Weight update, one output at a time. Each output has its own weight vector
    // and its own error, so a low-variance axis is fitted as carefully as a
    // high-variance one — which is exactly why the basis above matters.
    const targets = this.targetVector(target, hoverThrottle);
    let errorSum = 0;
    for (let o = 0; o < 4; o += 1) {
      const base = o * n;
      let predicted = 0;
      for (let i = 0; i < n; i += 1) predicted += this.weights[base + i] * x[i];
      const err = targets[o] - predicted;
      this.lastError[o] = err;
      errorSum += Math.abs(err);
      for (let i = 0; i < n; i += 1) this.weights[base + i] += gain[i] * err;
    }

    // P = (P - k (x' P)) / lambda
    for (let i = 0; i < n; i += 1) {
      const row = i * n;
      const gi = gain[i];
      for (let j = 0; j < n; j += 1) {
        this.p[row + j] = (this.p[row + j] - gi * px[j]) / lambda;
      }
    }

    this.trainedMs += dtMs;
    this.updates += 1;
    return errorSum / 4;
  }

  /**
   * Largest absolute weight, as a crude divergence check.
   *
   * Recursive least squares on a correlated feature set can run away; when it
   * does, this is the first number to move, and the flight loop watches it.
   *
   * @returns {number} Magnitude.
   */
  weightNorm() {
    let max = 0;
    for (let i = 0; i < this.weights.length; i += 1) max = Math.max(max, Math.abs(this.weights[i]));
    return max;
  }

  /**
   * What this readout is, stated plainly enough to print.
   *
   * @returns {object} Mode, parameter count, supervised time and what was given free.
   */
  provenance() {
    return {
      mode: this.mode,
      features: this.featureIndex.length,
      timescales: this.config.dualTimescale ? 2 : 1,
      fromMotorPool: this.motorFeatureCount,
      parameters: this.weights.length,
      outputBasis: this.config.outputBasis,
      supervisedSeconds: this.trainedMs / 1000,
      updates: this.updates,
      feedForwardHover: this.config.feedForwardHover,
      statement:
        this.mode === 'trained'
          ? `${this.weights.length} weights fitted by recursive least squares to a hand-tuned PD controller over ${(this.trainedMs / 1000).toFixed(1)} s of supervised flight.`
          : this.mode === 'fixed-random'
            ? `${this.weights.length} weights drawn once from a seed and never adjusted. Nothing was fitted.`
            : 'No readout. The PD controller drives the motors directly.',
    };
  }
}
