/**
 * Getting the world into the network — and the question that decides everything.
 *
 * The demonstration this app examines is explicit about its sensing: "a lone
 * camera tracks hand gestures, mapping palm openness directly to the neural
 * network's sensory inputs." One channel. The hand.
 *
 * That single sentence settles the outcome before any neuron fires, and it is
 * worth being blunt about why. A controller can only correct an error it can
 * observe. If the only thing entering the network is how open a person's palm
 * is, then nothing entering the network depends on the drone's altitude, its
 * attitude, or its rates. The loop is not closed. It is a hand connected to four
 * motors through an elaborate and entirely open-loop function. Such a machine
 * cannot hold altitude for the same reason a radio cannot: no error signal
 * reaches it. It does not matter how many neurons are in the middle, whether
 * they were reconstructed from a real brain, or how long they are left running.
 *
 * So this module offers both configurations, by name, and the app puts the
 * choice on the front panel rather than in a settings drawer:
 *
 *   - **`hand-only`** — exactly as described. One channel. Use it to watch the
 *     claim fail, with the failure timed against the airframe's own
 *     {@link module:makecns-fly/plant.Quadrotor#timeToFallMs}.
 *   - **`hand+proprioception`** — the hand, plus altitude, vertical speed, roll,
 *     pitch and the two body rates. This is what closing the loop costs. It is
 *     six extra channels that the demonstration does not mention having.
 *
 * Encoding is by Gaussian tuning curves over a population, which is how insect
 * and vertebrate sensory systems both do it: each neuron has a preferred value
 * and fires most strongly near it. One consequence matters downstream — a
 * population code is redundant and smooth, so a *linear* readout of it can
 * recover the encoded value quite well. Keep that in mind when the readout later
 * turns out to be doing the work.
 *
 * @module makecns-fly/encode
 */

/**
 * The channels available, with the range each is scaled against.
 *
 * Ranges are not cosmetic: a channel whose range is wrong is a sensor that
 * saturates, and a saturated sensor reports a constant, which is the same as
 * having no sensor at all.
 *
 * @type {ReadonlyArray<Readonly<object>>}
 */
export const CHANNELS = Object.freeze([
  Object.freeze({ key: 'palm', label: 'Palm openness', unit: '', min: 0, max: 1, pool: 'sensory', group: 'hand' }),
  Object.freeze({ key: 'z', label: 'Altitude', unit: 'm', min: 0, max: 2.5, pool: 'proprio', group: 'proprio' }),
  Object.freeze({ key: 'vz', label: 'Vertical speed', unit: 'm/s', min: -1.2, max: 1.2, pool: 'proprio', group: 'proprio' }),
  Object.freeze({ key: 'roll', label: 'Roll', unit: 'rad', min: -0.25, max: 0.25, pool: 'proprio', group: 'proprio' }),
  Object.freeze({ key: 'pitch', label: 'Pitch', unit: 'rad', min: -0.25, max: 0.25, pool: 'proprio', group: 'proprio' }),
  Object.freeze({ key: 'p', label: 'Roll rate', unit: 'rad/s', min: -3, max: 3, pool: 'proprio', group: 'proprio' }),
  Object.freeze({ key: 'q', label: 'Pitch rate', unit: 'rad/s', min: -3, max: 3, pool: 'proprio', group: 'proprio' }),
]);

/** The two sensor configurations the app compares. */
export const SENSOR_SETS = Object.freeze({
  'hand-only': Object.freeze({
    id: 'hand-only',
    label: 'One camera, palm openness only',
    channels: Object.freeze(['palm']),
    note: 'As described in the demonstration. The loop is open: nothing the drone does can reach the network.',
    closedLoop: false,
  }),
  'hand+proprioception': Object.freeze({
    id: 'hand+proprioception',
    label: 'Palm openness, plus six proprioceptive channels',
    channels: Object.freeze(['palm', 'z', 'vz', 'roll', 'pitch', 'p', 'q']),
    note: 'What closing the loop actually requires. The extra channels are an inertial measurement unit, which the demonstration does not mention.',
    closedLoop: true,
  }),
});

/** Encoding constants. */
export const DEFAULT_ENCODING = Object.freeze({
  /** Injected current at the peak of a tuning curve, mV per ms. */
  gainMvPerMs: 0.62,
  /**
   * Tuning width as a fraction of the channel's range.
   *
   * Sharp on purpose. A broad curve makes every neuron respond to everything,
   * and the small attitude errors that matter during a hover — a couple of
   * degrees — then move no neuron's rate enough to be read back out through the
   * noise. This is measurable: broadening this to 0.16 costs most of the
   * motor pool's attitude decodability.
   */
  tuningWidth: 0.07,
  /** Fraction of a channel's neurons tuned in the opposite direction (off-cells). */
  offCellFraction: 0.35,
});

/**
 * A population-coded sensory front end.
 */
export class SensoryEncoder {
  /**
   * @param {import('./connectome.js').Connectome} connectome Target network.
   * @param {object} [options] Settings.
   * @param {string} [options.sensorSet] Key into {@link SENSOR_SETS}.
   * @param {object} [options.encoding] Overrides for {@link DEFAULT_ENCODING}.
   * @param {Record<string, {min: number, max: number}>} [options.ranges] Per-channel
   *   range overrides. A sensor's range is its resolution: the same population
   *   spread over a quarter of the span resolves four times as fine a change, and
   *   for attitude during hover that difference decides whether the readout can
   *   see the error it is meant to correct at all.
   */
  constructor(connectome, options = {}) {
    this.connectome = connectome;
    this.encoding = { ...DEFAULT_ENCODING, ...(options.encoding ?? {}) };
    this.ranges = new Map(CHANNELS.map((c) => [c.key, { min: c.min, max: c.max }]));
    for (const [key, range] of Object.entries(options.ranges ?? {})) {
      if (!this.ranges.has(key)) throw new Error(`unknown channel: ${key}`);
      this.ranges.set(key, { min: range.min, max: range.max });
    }
    this.current = new Float32Array(connectome.count);
    this.setSensorSet(options.sensorSet ?? 'hand+proprioception');
  }

  /**
   * Choose which channels exist, and lay them out across the sensory pools.
   *
   * Changing this changes what the network can possibly know, which is why it is
   * a method with a name rather than a flag on the step function.
   *
   * @param {string} id Key into {@link SENSOR_SETS}.
   */
  setSensorSet(id) {
    const set = SENSOR_SETS[id];
    if (!set) throw new Error(`unknown sensor set: ${id}`);
    this.sensorSet = set;
    this.active = CHANNELS.filter((c) => set.channels.includes(c.key));

    // Lay each channel out over the pool it belongs to. If a set has no
    // proprioceptive channels, the proprioceptive pool simply receives nothing —
    // it is not repurposed, because a silent pool is visible on the raster and a
    // repurposed one is not.
    this.layout = new Map();
    for (const pool of ['sensory', 'proprio']) {
      const inPool = this.active.filter((c) => c.pool === pool);
      if (!inPool.length) continue;
      const { start, end } = this.connectome.range(pool);
      const per = Math.floor((end - start) / inPool.length);
      inPool.forEach((channel, index) => {
        const from = start + index * per;
        const to = index === inPool.length - 1 ? end : from + per;
        const size = to - from;
        const preferred = new Float32Array(size);
        const polarity = new Int8Array(size);
        const offCount = Math.round(size * this.encoding.offCellFraction);
        for (let i = 0; i < size; i += 1) {
          preferred[i] = size === 1 ? 0.5 : i / (size - 1);
          polarity[i] = i < size - offCount ? 1 : -1;
        }
        this.layout.set(channel.key, { from, to, preferred, polarity, channel });
      });
    }
  }

  /**
   * Scale a raw observation into [0, 1] against its channel's stated range.
   *
   * Clamps rather than extrapolates, and reports the clamp — a channel pinned at
   * a rail is a sensor that has stopped sensing, and the flight loop is entitled
   * to know that happened.
   *
   * @param {string} key Channel key.
   * @param {number} value Raw value in the channel's units.
   * @returns {{norm: number, saturated: boolean}} Normalised value.
   */
  normalise(key, value) {
    const range = this.ranges.get(key);
    if (!range) throw new Error(`unknown channel: ${key}`);
    const span = range.max - range.min;
    const raw = (Number(value) - range.min) / span;
    const norm = Math.max(0, Math.min(1, raw));
    return { norm, saturated: raw !== norm };
  }

  /**
   * Build this step's injected current from an observation.
   *
   * @param {Record<string, number>} observation Values by channel key. Keys not in
   *   the active sensor set are ignored — silently, because the whole point of
   *   `hand-only` is that the drone's state is available and deliberately unused.
   * @returns {{current: Float32Array, saturated: string[]}} Current per neuron and any pinned channels.
   */
  encode(observation) {
    this.current.fill(0);
    const saturated = [];
    const width = this.encoding.tuningWidth;
    const twoSigmaSq = 2 * width * width;
    for (const [key, slot] of this.layout) {
      const { norm, saturated: pinned } = this.normalise(key, observation[key] ?? 0);
      if (pinned) saturated.push(key);
      const { from, preferred, polarity } = slot;
      for (let i = 0; i < preferred.length; i += 1) {
        const target = polarity[i] > 0 ? preferred[i] : 1 - preferred[i];
        const d = norm - target;
        const activation = Math.exp(-(d * d) / twoSigmaSq);
        this.current[from + i] = activation * this.encoding.gainMvPerMs;
      }
    }
    return { current: this.current, saturated };
  }

  /**
   * How many neurons each channel drives — for the panel that has to show that
   * `hand-only` leaves most of the front end dark.
   *
   * @returns {Array<object>} One row per active channel.
   */
  allocation() {
    return Array.from(this.layout.values()).map((slot) => ({
      key: slot.channel.key,
      label: slot.channel.label,
      pool: slot.channel.pool,
      neurons: slot.to - slot.from,
    }));
  }

  /**
   * Whether the drone's own state reaches the network at all.
   *
   * The single most important boolean in the app: if this is false, no amount of
   * neural machinery downstream can stabilise anything, and every hover observed
   * in that configuration came from somewhere else.
   *
   * @returns {boolean} True when at least one proprioceptive channel is active.
   */
  get closedLoop() {
    return this.active.some((c) => c.group === 'proprio');
  }
}
