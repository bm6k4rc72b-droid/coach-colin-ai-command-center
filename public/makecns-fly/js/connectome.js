/**
 * The wiring — and an honest account of whose wiring it is.
 *
 * The demonstration this app was built to examine describes "a full
 * computational reconstruction of an adult fruit fly brain" hooked to a drone.
 * This app does not ship that reconstruction, and will not pretend to. The
 * published adult *Drosophila* connectomes are large scientific datasets with
 * their own citation and licence terms, they are hundreds of megabytes to
 * gigabytes on disk, and none of them fits in a browser tab at real-time rates.
 * Anyone who tells you otherwise has quietly changed one of those three facts.
 *
 * So there are exactly two things this module can give you, and it labels which
 * one you have at all times:
 *
 * 1. **A matched synthetic network.** Generated here, from a seed, with its
 *    summary statistics — size ratio, excitatory fraction, degree tail, synapse
 *    weight distribution — set to published values. It is not a fly brain. It is
 *    a network with a fly brain's *shape*. {@link Connectome#provenance} says
 *    `synthetic` and the app prints that on the face of the UI, not in a
 *    footnote.
 *
 * 2. **A real edge list you supplied.** {@link importEdgeList} takes a
 *    neuron-to-neuron table exported from a connectome browser and builds the
 *    same structure from it. Then `provenance` says `imported`, and carries
 *    whatever attribution string you passed with it.
 *
 * The figures in {@link PROFILES} are as published, with sources, including the
 * one from the post that started this — which matches neither of the two main
 * reconstructions, and is recorded here as an unresolved discrepancy rather than
 * silently corrected or silently repeated.
 *
 * @module makecns-fly/connectome
 */

import { Rng } from './rng.js';

/**
 * Published reference figures, and the claim under examination.
 *
 * `neurons` and `synapses` are whole-dataset counts as reported by the source.
 * They are *not* what this app simulates — see {@link Connectome#scale}.
 *
 * @type {Readonly<Record<string, Readonly<object>>>}
 */
export const PROFILES = Object.freeze({
  flywire: Object.freeze({
    id: 'flywire',
    label: 'FlyWire adult female brain',
    neurons: 139255,
    synapses: 54500000,
    /** Reported chemical-synapse edges above the usual 5-synapse threshold, order of magnitude. */
    edges: 2700000,
    excitatoryFraction: 0.62,
    source: 'Dorkenwald et al., "Neuronal wiring diagram of an adult brain", Nature 632 (2024)',
    note: 'Whole-brain proofread reconstruction. Counts vary by a few percent with proofreading version and synapse threshold.',
  }),
  hemibrain: Object.freeze({
    id: 'hemibrain',
    label: 'Janelia hemibrain v1.2 (partial central brain)',
    neurons: 25000,
    synapses: 20000000,
    edges: 600000,
    excitatoryFraction: 0.6,
    source: 'Scheffer et al., "A connectome and analysis of the adult Drosophila central brain", eLife 9 (2020)',
    note: 'A region of one hemisphere, not a whole brain. Included because partial datasets are often quoted as whole ones.',
  }),
  claimed: Object.freeze({
    id: 'claimed',
    label: 'Figures quoted in the drone demonstration',
    neurons: 166700,
    synapses: 25000000,
    edges: 2500000,
    excitatoryFraction: 0.62,
    source: 'Social-media post describing the fruit-fly-brain drone demonstration (techcos.ai, reposting @SpikeCalls)',
    note: 'Unresolved: the neuron count exceeds FlyWire’s and the synapse count is well below it. No published adult reconstruction has both. Reproduced here as quoted, not endorsed.',
  }),
});

/** Populations the flight loop needs to address by name. */
export const POPULATIONS = Object.freeze(['sensory', 'proprio', 'inter', 'motor']);

/**
 * How the simulated neurons are divided between roles.
 *
 * These fractions are an engineering choice, not a measurement — the fly does
 * not label its neurons "motor readout". They are stated here so the choice is
 * visible rather than buried in a constructor.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const POPULATION_FRACTIONS = Object.freeze({
  sensory: 0.04,
  proprio: 0.08,
  inter: 0.8,
  motor: 0.08,
});

/**
 * A sparse directed network in compressed-row form, indexed by *source* neuron.
 *
 * Out-edge CSR rather than in-edge, because the inner loop of the simulation
 * iterates over the neurons that spiked — a few per step — and needs their
 * targets. In-edge order would require touching every neuron every step.
 */
export class Connectome {
  /**
   * @param {object} spec Structure.
   * @param {number} spec.count Number of simulated neurons.
   * @param {Int32Array} spec.rowPtr Length `count + 1`; edges of neuron `i` are `[rowPtr[i], rowPtr[i+1])`.
   * @param {Int32Array} spec.target Postsynaptic neuron per edge.
   * @param {Float32Array} spec.weight Signed synaptic weight per edge, in units of membrane potential.
   * @param {Int8Array} spec.sign `+1` excitatory, `-1` inhibitory, per neuron.
   * @param {Record<string, {start: number, end: number}>} spec.populations Index ranges per role.
   * @param {object} spec.provenance Where this wiring came from.
   */
  constructor(spec) {
    this.count = spec.count;
    this.rowPtr = spec.rowPtr;
    this.target = spec.target;
    this.weight = spec.weight;
    this.sign = spec.sign;
    this.populations = spec.populations;
    this.provenance = spec.provenance;
  }

  /** @returns {number} Number of directed connections. */
  get edgeCount() {
    return this.target.length;
  }

  /**
   * Indices belonging to a named population.
   *
   * @param {string} name One of {@link POPULATIONS}.
   * @returns {{start: number, end: number, size: number}} Half-open range.
   */
  range(name) {
    const r = this.populations[name];
    if (!r) throw new Error(`unknown population: ${name}`);
    return { start: r.start, end: r.end, size: r.end - r.start };
  }

  /**
   * What fraction of the referenced dataset this actually is.
   *
   * The number the app prints next to the word "connectome". It is small, and it
   * is supposed to be visible.
   *
   * @returns {{simulated: number, referenced: number, fraction: number}} Scale.
   */
  get scale() {
    const referenced = this.provenance.reference?.neurons ?? this.count;
    return { simulated: this.count, referenced, fraction: this.count / referenced };
  }

  /**
   * Summary statistics, for the provenance panel and for the tests that check
   * the generator did what it claimed.
   *
   * @returns {object} Measured statistics of this network.
   */
  statistics() {
    const outDegree = new Int32Array(this.count);
    const inDegree = new Int32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      outDegree[i] = this.rowPtr[i + 1] - this.rowPtr[i];
      for (let e = this.rowPtr[i]; e < this.rowPtr[i + 1]; e += 1) inDegree[this.target[e]] += 1;
    }
    let excitatory = 0;
    for (let i = 0; i < this.count; i += 1) if (this.sign[i] > 0) excitatory += 1;
    let weightSum = 0;
    let absSum = 0;
    for (let e = 0; e < this.weight.length; e += 1) {
      weightSum += this.weight[e];
      absSum += Math.abs(this.weight[e]);
    }
    return {
      neurons: this.count,
      edges: this.edgeCount,
      meanOutDegree: this.edgeCount / this.count,
      maxOutDegree: outDegree.reduce((a, b) => Math.max(a, b), 0),
      maxInDegree: inDegree.reduce((a, b) => Math.max(a, b), 0),
      excitatoryFraction: excitatory / this.count,
      meanWeight: this.edgeCount ? weightSum / this.edgeCount : 0,
      meanAbsWeight: this.edgeCount ? absSum / this.edgeCount : 0,
      /** Coefficient of variation of out-degree — the tail the generator is matching. */
      outDegreeCv: cv(outDegree),
    };
  }
}

/** Coefficient of variation of an integer array. */
function cv(values) {
  const n = values.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += values[i];
  const mean = sum / n;
  if (mean === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i += 1) acc += (values[i] - mean) ** 2;
  return Math.sqrt(acc / n) / mean;
}

/**
 * Build a network with a connectome's statistics and none of its identity.
 *
 * The structure is deliberately not uniform random. Three properties are matched
 * because all three change the dynamics in ways you can see on the raster:
 *
 *   - **Heavy-tailed out-degree.** A few neurons drive thousands of others.
 *     Log-normal, which is what the counted datasets show.
 *   - **Log-normal synapse weight.** Most connections are weak; a small number
 *     carry the network.
 *   - **Distance-biased targeting.** Neurons connect preferentially within their
 *     own population and to the next one along, which is what gives the network
 *     any structure at all for a readout to exploit. A fully uniform graph is a
 *     well-stirred soup and behaves like one.
 *
 * Inhibition is set by neuron, not by synapse: a neuron's outgoing connections
 * all carry its sign. That is Dale's principle, which real brains obey and
 * randomly-signed weight matrices do not.
 *
 * @param {object} [options] Generator settings.
 * @param {number} [options.count] Neurons to simulate.
 * @param {string} [options.profile] Key into {@link PROFILES} for the statistics to match.
 * @param {number|string} [options.seed] Seed.
 * @param {number} [options.meanDegree] Mean out-degree.
 * @param {number} [options.weightScale] Multiplier on all synaptic weights, in mV.
 * @param {number} [options.sensoryDivergence] Out-degree multiplier for sensory and
 *   proprioceptive afferents. Afferents fan out far more than central neurons do;
 *   at 1 they do not, and the sensory signal arrives as a whisper into a crowd.
 * @param {number} [options.afferentToMotor] Fraction of afferent connections that
 *   reach the motor pool directly rather than via interneurons. Short sensorimotor
 *   paths are the rule in insects — descending neurons synapse onto motor neurons
 *   with very few steps in between — and they are also what decides whether a
 *   sensory signal survives the crossing at all. At zero, everything must pass
 *   through the interneuron pool, where afferent drive is a small fraction of each
 *   cell's input and the signal is swamped. That is measurable in the app.
 * @param {number} [options.recurrentScale] Multiplier on the weight of every
 *   connection originating in the interneuron or motor pools. This is the single
 *   knob that decides whether the network transmits information or destroys it —
 *   see {@link module:makecns-fly/net} and the recurrent-gain control in the app.
 * @returns {Connectome} A synthetic network, labelled as such.
 */
export function buildSynthetic(options = {}) {
  const {
    count = 4096,
    profile = 'flywire',
    seed = 1,
    meanDegree = 32,
    weightScale = 1,
    sensoryDivergence = 4,
    recurrentScale = 0.2,
    afferentToMotor = 0.25,
  } = options;
  const reference = PROFILES[profile];
  if (!reference) throw new Error(`unknown profile: ${profile}`);
  if (count < 64) throw new Error('need at least 64 neurons for the populations to be non-empty');

  const rng = new Rng(seed).stream('connectome');
  const degreeRng = rng.stream('degree');
  const targetRng = rng.stream('target');
  const weightRng = rng.stream('weight');
  const signRng = rng.stream('sign');

  const populations = {};
  let cursor = 0;
  for (const name of POPULATIONS) {
    const size = name === 'inter'
      ? count - cursor - Math.round(count * POPULATION_FRACTIONS.motor)
      : Math.max(8, Math.round(count * POPULATION_FRACTIONS[name]));
    const end = name === 'motor' ? count : Math.min(count, cursor + size);
    populations[name] = { start: cursor, end };
    cursor = end;
  }

  // Sign by neuron (Dale), with sensory afferents excitatory as they are in fly
  // olfaction and vision — an inhibitory sensory afferent would be a modelling
  // error, not a variation.
  const sign = new Int8Array(count);
  const target = populations;
  for (let i = 0; i < count; i += 1) {
    const isSensory = i >= target.sensory.start && i < target.proprio.end;
    sign[i] = isSensory || signRng.uniform() < reference.excitatoryFraction ? 1 : -1;
  }

  // Log-normal out-degree with the requested mean. sigma chosen to give a
  // coefficient of variation near 1, matching counted connectomes' spread.
  const sigma = 0.8;
  const mu = Math.log(meanDegree) - (sigma * sigma) / 2;
  const degrees = new Int32Array(count);
  let totalEdges = 0;
  const afferentEnd = populations.proprio.end;
  for (let i = 0; i < count; i += 1) {
    const fanOut = i < afferentEnd ? sensoryDivergence : 1;
    const d = Math.min(count - 1, Math.max(1, Math.round(degreeRng.logNormal(mu, sigma) * fanOut)));
    degrees[i] = d;
    totalEdges += d;
  }

  const rowPtr = new Int32Array(count + 1);
  for (let i = 0; i < count; i += 1) rowPtr[i + 1] = rowPtr[i] + degrees[i];
  const targets = new Int32Array(totalEdges);
  const weights = new Float32Array(totalEdges);

  // Targeting: mostly forward through sensory → inter → motor, with recurrence
  // inside the interneuron pool, which is where any memory in this network lives.
  const order = POPULATIONS;
  const roleOf = new Uint8Array(count);
  for (let p = 0; p < order.length; p += 1) {
    const r = populations[order[p]];
    for (let i = r.start; i < r.end; i += 1) roleOf[i] = p;
  }

  const wMu = Math.log(0.18 * weightScale) - 0.5 * 0.9 * 0.9;
  for (let i = 0; i < count; i += 1) {
    const role = roleOf[i];
    for (let e = rowPtr[i]; e < rowPtr[i + 1]; e += 1) {
      const roll = targetRng.uniform();
      let destRole;
      if (role === 3) destRole = roll < 0.7 ? 2 : 3; // motor feeds back to inter
      else if (role === 2) destRole = roll < 0.72 ? 2 : 3; // inter: recurrent, then motor
      else if (roll < afferentToMotor) destRole = 3; // afferent straight to motor
      else destRole = roll < 0.85 ? 2 : role; // sensory/proprio: forward into inter
      const r = populations[order[destRole]];
      const span = r.end - r.start;
      let t = r.start + targetRng.int(0, span);
      if (t === i) t = r.start + ((t - r.start + 1) % span);
      targets[e] = t;
      // Inhibitory synapses are stronger per-synapse than excitatory ones, which
      // is how a brain with a 60/40 split stays balanced instead of seizing.
      // Afferent weights are divided down by the square root of their fan-out.
      // Without this, raising divergence does not spread the signal further — it
      // simply drives the whole network into saturation, where every neuron fires
      // near its refractory ceiling and carries no information at all.
      const spread = role < 2 ? 1 / Math.sqrt(sensoryDivergence) : recurrentScale;
      const magnitude = weightRng.logNormal(wMu, 0.9) * spread;
      weights[e] = sign[i] > 0 ? magnitude : -magnitude * 1.9;
    }
  }

  return new Connectome({
    count,
    rowPtr,
    target: targets,
    weight: weights,
    sign,
    populations,
    provenance: {
      kind: 'synthetic',
      label: `Synthetic network, statistics matched to ${reference.label}`,
      reference,
      seed: typeof seed === 'string' ? seed : Number(seed),
      meanDegree,
      sensoryDivergence,
      recurrentScale,
      afferentToMotor,
      attribution: null,
      warning:
        'This is not a fly brain. It is a generated network whose size ratio, excitatory fraction, degree tail and weight distribution are set to published values for the referenced dataset. Nothing in it corresponds to an identified neuron.',
    },
  });
}

/**
 * Build the same structure from a real neuron-to-neuron table.
 *
 * Takes what connectome browsers export: rows of source, target, synapse count
 * and a neurotransmitter label. Unknown transmitters are counted and reported
 * rather than guessed at — `sign` defaults to excitatory for those, and the
 * count of assumptions appears in the provenance so it can be stated on screen.
 *
 * @param {Array<{pre: (string|number), post: (string|number), synapses?: number, nt?: string}>} rows Edge table.
 * @param {object} [options] Import settings.
 * @param {string} [options.attribution] Citation string for the dataset, shown in the UI.
 * @param {number} [options.minSynapses] Drop connections below this synapse count.
 * @param {number} [options.weightScale] Millivolts per synapse.
 * @param {Record<string, {start: number, end: number}>} [options.populations] Role ranges; defaults to fractions.
 * @returns {Connectome} A network built from the supplied table.
 */
export function importEdgeList(rows, options = {}) {
  const { attribution = null, minSynapses = 5, weightScale = 0.02 } = options;
  const index = new Map();
  const idOf = (key) => {
    const k = String(key);
    let id = index.get(k);
    if (id === undefined) {
      id = index.size;
      index.set(k, id);
    }
    return id;
  };

  const kept = [];
  let dropped = 0;
  for (const row of rows) {
    const synapses = Number(row.synapses ?? 1);
    if (!(synapses >= minSynapses)) {
      dropped += 1;
      continue;
    }
    kept.push({ pre: idOf(row.pre), post: idOf(row.post), synapses, nt: String(row.nt ?? '').toLowerCase() });
  }
  const count = index.size;
  if (count === 0) throw new Error('edge list produced no neurons');

  const inhibitory = new Set(['gaba', 'glut', 'glutamate']);
  const sign = new Int8Array(count).fill(1);
  const seen = new Set();
  let assumed = 0;
  for (const edge of kept) {
    if (seen.has(edge.pre)) continue;
    seen.add(edge.pre);
    if (edge.nt === '') assumed += 1;
    else if (inhibitory.has(edge.nt)) sign[edge.pre] = -1;
  }

  const degrees = new Int32Array(count);
  for (const edge of kept) degrees[edge.pre] += 1;
  const rowPtr = new Int32Array(count + 1);
  for (let i = 0; i < count; i += 1) rowPtr[i + 1] = rowPtr[i] + degrees[i];
  const cursor = rowPtr.slice(0, count);
  const targets = new Int32Array(kept.length);
  const weights = new Float32Array(kept.length);
  for (const edge of kept) {
    const slot = cursor[edge.pre];
    cursor[edge.pre] = slot + 1;
    targets[slot] = edge.post;
    weights[slot] = sign[edge.pre] * edge.synapses * weightScale;
  }

  const populations = options.populations ?? sliceRoles(count);
  return new Connectome({
    count,
    rowPtr,
    target: targets,
    weight: weights,
    sign,
    populations,
    provenance: {
      kind: 'imported',
      label: attribution ? `Imported: ${attribution}` : 'Imported edge list (no attribution supplied)',
      reference: null,
      seed: null,
      attribution,
      droppedConnections: dropped,
      assumedExcitatory: assumed,
      warning: assumed
        ? `${assumed} neurons had no neurotransmitter label and were assumed excitatory. Sign errors change the dynamics more than any other single import choice.`
        : null,
    },
  });
}

/** Default role ranges by fraction, used when an import brings no labels. */
function sliceRoles(count) {
  const populations = {};
  let cursor = 0;
  for (const name of POPULATIONS) {
    const size = name === 'inter'
      ? count - cursor - Math.round(count * POPULATION_FRACTIONS.motor)
      : Math.max(1, Math.round(count * POPULATION_FRACTIONS[name]));
    const end = name === 'motor' ? count : Math.min(count, cursor + size);
    populations[name] = { start: cursor, end };
    cursor = end;
  }
  return populations;
}
