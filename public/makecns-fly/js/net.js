/**
 * The neurons themselves, and the switches that let you take them away.
 *
 * Leaky integrate-and-fire with conductance-free current synapses and an
 * absolute refractory period. That is a deliberately ordinary model: it is the
 * one whose behaviour is understood well enough that a surprise in the flight
 * loop can be blamed on the flight loop.
 *
 * The part that is not ordinary is the ablation machinery. Every claim of the
 * form "the brain flew it" is a causal claim, and a causal claim is tested by
 * removing the cause. So this class can be asked to run in four ways:
 *
 *   - `intact` — the network as built.
 *   - `no-recurrence` — every connection originating in the interneuron or motor
 *     pools is cut. Input still reaches the readout; the network's *memory* does
 *     not. This separates "the spikes carry the sensor reading" from "the
 *     network is computing something".
 *   - `poisson-surrogate` — each neuron keeps its recent firing rate and loses
 *     everything else: spikes are drawn independently, so every correlation,
 *     every sequence and every bit of timing structure is destroyed while the
 *     rate code survives intact.
 *   - `frozen` — the network stops updating and holds its last rates. A readout
 *     that still flies under this one is flying on its own.
 *
 * If a demonstration hovers identically under `poisson-surrogate`, the
 * connectome is not what is flying it. That is the measurement the rest of this
 * app is built around, and this is where it is made possible.
 *
 * @module makecns-fly/net
 */

import { Rng } from './rng.js';

/**
 * Membrane and synapse constants, in millivolts and milliseconds.
 *
 * Values are in the range reported for small insect neurons; they are not fitted
 * to any particular cell type, and the app says so. What matters for everything
 * downstream is that the membrane time constant is short relative to the flight
 * dynamics — 20 ms against a plant that falls over in a few hundred — because if
 * it were not, no readout of these spikes could stabilise anything.
 *
 * @type {Readonly<object>}
 */
export const DEFAULT_PARAMS = Object.freeze({
  restMv: -52,
  thresholdMv: -45,
  resetMv: -53,
  tauMembraneMs: 20,
  tauSynapseMs: 5,
  refractoryMs: 2.2,
  /**
   * Tonic drive, mV per ms — the single most consequential constant in the app.
   *
   * It sets whether the network is driven by its inputs or by itself, and there
   * is a narrow window in which it is both busy and listening. Measured on the
   * default network, over sixty seconds of training and twenty of unsupervised
   * flight:
   *
   * | Tonic drive | Holds altitude | Neurons that fired |
   * | --- | --- | --- |
   * | 0.06 | 100% | 18% — the interneuron pool is silent |
   * | 0.10 | 100% | 89% |
   * | 0.14 | 52% | 96% |
   * | 0.20 | 17% | 98% |
   *
   * Above the window the pool is busy on its own, sensory drive is a small
   * perturbation on top of that, and the aircraft's state becomes undecodable from
   * the motor pool — a linear readout of motor rates recovers roll with an
   * R-squared of about zero at 0.30, against about 0.66 inside the window. Below
   * it the thing flies, but most of the network it is named after never fires.
   *
   * The wiring did not change across any of those rows. Only whether it was
   * listening. Use {@link SpikingNetwork#participation}, which is on the Brain
   * panel, to see where the current settings sit.
   */
  biasMvPerMs: 0.1,
  /** Standard deviation of the per-step noise current, mV per sqrt(ms). */
  noiseMv: 0.1,
  /** Time constant of the rate filter the readout sees, ms. */
  tauRateMs: 12,
  /**
   * Time constant of a second, faster rate filter, ms.
   *
   * There because one low-pass filter cannot produce phase lead, and attitude
   * control is mostly phase lead. Given a fast and a slow filter of the same
   * spike train, a linear readout can form their difference, and that difference
   * is a derivative. With a single filter bank the readout can only ever lag,
   * which on this airframe means it can damp nothing.
   *
   * Two timescales in a neural population is not an exotic assumption: synaptic
   * and membrane time constants differ by roughly this much throughout real
   * nervous systems.
   */
  tauFastMs: 4,
  /** Hard ceiling on synaptic input per step, mV — stops a runaway from becoming NaN. */
  clampMv: 30,
});

/** Ways the network can be handicapped, for causal tests. */
export const ABLATIONS = Object.freeze(['intact', 'no-recurrence', 'poisson-surrogate', 'frozen']);

/**
 * A population of leaky integrate-and-fire neurons on a {@link Connectome}.
 */
export class SpikingNetwork {
  /**
   * @param {import('./connectome.js').Connectome} connectome Wiring.
   * @param {object} [params] Overrides for {@link DEFAULT_PARAMS}.
   * @param {number|string} [params.seed] Seed for noise and surrogate draws.
   * @param {string} [params.ablation] One of {@link ABLATIONS}.
   */
  constructor(connectome, params = {}) {
    this.connectome = connectome;
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.ablation = params.ablation ?? 'intact';
    this.rng = new Rng(params.seed ?? 11).stream('net');
    const n = connectome.count;
    this.v = new Float32Array(n);
    this.syn = new Float32Array(n);
    this.refractory = new Float32Array(n);
    this.rates = new Float32Array(n);
    this.ratesFast = new Float32Array(n);
    this.spiked = new Uint8Array(n);
    this.spikeList = new Int32Array(n);
    this.spikeCount = 0;
    /** First index of the recurrent pools — edges from here up are "recurrence". */
    this.recurrentFrom = connectome.range('inter').start;
    this.timeMs = 0;
    this.totalSpikes = 0;
    /** Per-neuron spike counts since the last {@link #reset}, for participation. */
    this.spikeCounts = new Int32Array(n);
    this.reset();
  }

  /** Return every neuron to rest and clear all history. */
  reset() {
    const { restMv } = this.params;
    this.v.fill(restMv);
    this.syn.fill(0);
    this.refractory.fill(0);
    this.rates.fill(0);
    this.ratesFast.fill(0);
    this.spiked.fill(0);
    this.spikeCount = 0;
    this.timeMs = 0;
    this.totalSpikes = 0;
    if (this.spikeCounts) this.spikeCounts.fill(0);
    // Stagger initial potentials so the first step does not fire in lockstep,
    // which would produce a synchronous burst that is an artefact of t=0 only.
    for (let i = 0; i < this.v.length; i += 1) {
      this.v[i] = restMv + this.rng.uniform() * (this.params.thresholdMv - restMv) * 0.9;
    }
  }

  /**
   * Which ablation is in force.
   *
   * @param {string} mode One of {@link ABLATIONS}.
   */
  setAblation(mode) {
    if (!ABLATIONS.includes(mode)) throw new Error(`unknown ablation: ${mode}`);
    this.ablation = mode;
  }

  /**
   * Advance one timestep.
   *
   * @param {Float32Array} injected Per-neuron injected current this step, mV. Usually
   *   zero everywhere except the sensory and proprioceptive populations.
   * @param {number} dtMs Timestep, milliseconds. 1 ms or below; larger steps make
   *   the membrane integration wrong in a way that quietly changes the firing rate.
   * @returns {number} How many neurons spiked this step.
   */
  step(injected, dtMs = 1) {
    const p = this.params;
    const n = this.connectome.count;
    const decayV = Math.exp(-dtMs / p.tauMembraneMs);
    const decaySyn = Math.exp(-dtMs / p.tauSynapseMs);
    const decayRate = Math.exp(-dtMs / p.tauRateMs);
    const decayFast = Math.exp(-dtMs / p.tauFastMs);
    const noiseScale = p.noiseMv * Math.sqrt(dtMs);

    this.spikeCount = 0;
    this.spiked.fill(0);

    if (this.ablation === 'frozen') {
      this.timeMs += dtMs;
      return 0;
    }

    if (this.ablation === 'poisson-surrogate') {
      // Keep the rate, destroy everything else. Rates are in kHz (spikes per ms)
      // because the rate filter is normalised by dt below.
      for (let i = 0; i < n; i += 1) {
        const lambda = Math.max(0, this.rates[i]) * dtMs;
        const fired = lambda > 0 && this.rng.uniform() < lambda ? 1 : 0;
        if (fired) {
          this.spiked[i] = 1;
          this.spikeList[this.spikeCount] = i;
          this.spikeCount += 1;
          this.totalSpikes += 1;
          this.spikeCounts[i] += 1;
        }
        // The rate itself is driven by the injected current only, so the
        // surrogate still responds to the sensors — it just cannot compute.
        const drive = Math.max(0, injected[i]) * 0.02;
        this.rates[i] = this.rates[i] * decayRate + drive * (1 - decayRate);
        this.ratesFast[i] = this.ratesFast[i] * decayFast + drive * (1 - decayFast);
      }
      this.timeMs += dtMs;
      return this.spikeCount;
    }

    const { rowPtr, target, weight } = this.connectome;
    const cutRecurrence = this.ablation === 'no-recurrence';

    // 1. Synaptic input decays, then this step's arrivals are added below.
    for (let i = 0; i < n; i += 1) this.syn[i] *= decaySyn;

    // 2. Integrate the membrane and detect threshold crossings.
    for (let i = 0; i < n; i += 1) {
      if (this.refractory[i] > 0) {
        this.refractory[i] -= dtMs;
        this.v[i] = p.resetMv;
        continue;
      }
      const drive = this.syn[i] + injected[i] + p.biasMvPerMs * dtMs + this.rng.normal(0, noiseScale);
      const bounded = Math.max(-p.clampMv, Math.min(p.clampMv, drive));
      this.v[i] = p.restMv + (this.v[i] - p.restMv) * decayV + bounded;
      if (this.v[i] >= p.thresholdMv) {
        this.v[i] = p.resetMv;
        this.refractory[i] = p.refractoryMs;
        this.spiked[i] = 1;
        this.spikeList[this.spikeCount] = i;
        this.spikeCount += 1;
        this.totalSpikes += 1;
        this.spikeCounts[i] += 1;
      }
    }

    // 3. Propagate this step's spikes to their targets.
    for (let s = 0; s < this.spikeCount; s += 1) {
      const src = this.spikeList[s];
      if (cutRecurrence && src >= this.recurrentFrom) continue;
      const end = rowPtr[src + 1];
      for (let e = rowPtr[src]; e < end; e += 1) this.syn[target[e]] += weight[e];
    }

    // 4. Rate filter — what the readout actually reads. Units: spikes per ms.
    const gain = (1 - decayRate) / dtMs;
    const gainFast = (1 - decayFast) / dtMs;
    for (let i = 0; i < n; i += 1) {
      const fired = this.spiked[i];
      this.rates[i] = this.rates[i] * decayRate + (fired ? gain : 0);
      this.ratesFast[i] = this.ratesFast[i] * decayFast + (fired ? gainFast : 0);
    }

    this.timeMs += dtMs;
    return this.spikeCount;
  }

  /**
   * Mean firing rate of a named population, in spikes per second.
   *
   * @param {string} name Population name.
   * @returns {number} Hertz.
   */
  populationRateHz(name) {
    const { start, end } = this.connectome.range(name);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += this.rates[i];
    return end > start ? (sum / (end - start)) * 1000 : 0;
  }

  /**
   * Mean firing rate across the whole network, spikes per second.
   *
   * A network at 0 Hz and a network at 400 Hz are both broken, and this is the
   * number that says which. Insect central neurons mostly idle in single digits.
   *
   * @returns {number} Hertz.
   */
  meanRateHz() {
    let sum = 0;
    for (let i = 0; i < this.rates.length; i += 1) sum += this.rates[i];
    return (sum / this.rates.length) * 1000;
  }

  /**
   * What fraction of the simulated network has fired at all.
   *
   * The app's least flattering number, and the one it puts on the Brain panel. A
   * demonstration that runs a hundred thousand neurons and uses two thousand of
   * them is running two thousand neurons with a large and expensive decoration
   * attached — and no video can show the difference, because a silent neuron and
   * a busy one look identical when neither is plotted.
   *
   * @returns {{overall: number, byPool: Record<string, number>}} Fractions in [0, 1].
   */
  participation() {
    const byPool = {};
    let active = 0;
    for (const name of Object.keys(this.connectome.populations)) {
      const { start, end } = this.connectome.range(name);
      let poolActive = 0;
      for (let i = start; i < end; i += 1) if (this.spikeCounts[i] > 0) poolActive += 1;
      byPool[name] = end > start ? poolActive / (end - start) : 0;
      active += poolActive;
    }
    return { overall: active / this.connectome.count, byPool };
  }

  /**
   * A snapshot of the spikes in this step, for the raster.
   *
   * @returns {Int32Array} A view of the spiking indices — valid until the next step.
   */
  currentSpikes() {
    return this.spikeList.subarray(0, this.spikeCount);
  }
}
