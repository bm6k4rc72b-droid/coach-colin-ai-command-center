/**
 * Determinism, so that a claim made once can be made again.
 *
 * Every random number in this app comes from here, from a stated seed. That is
 * not fastidiousness — it is the only reason the measurements in
 * {@link module:makecns-fly/ledger} mean anything. The whole app exists to
 * compare a run against an ablated version of the same run, and if the two runs
 * differ in their noise as well as in the thing being ablated, the difference
 * between them measures nothing.
 *
 * So: one generator, seeded, splittable into named independent streams. Two
 * runs with the same seed and the same settings produce the same flight, the
 * same spikes, and the same numbers on screen, on any machine.
 *
 * @module makecns-fly/rng
 */

/**
 * A small, fast, well-distributed 32-bit generator (mulberry32).
 *
 * Not cryptographic and not trying to be. It is used for synaptic weights and
 * Poisson draws, where the requirement is a flat spectrum and a long enough
 * period, both of which it has.
 *
 * @param {number} seed Any integer.
 * @returns {() => number} A function returning uniform values in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a 32-bit seed (FNV-1a), so streams can be named.
 *
 * @param {string} text Stream name.
 * @returns {number} Seed.
 */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A seeded generator with named, independent sub-streams.
 *
 * Naming the streams matters more than it looks. If the connectome and the
 * Poisson encoder drew from one sequence, changing the neuron count would
 * change the input spikes too, and no two scales could be compared.
 */
export class Rng {
  /** @param {number|string} seed Root seed. */
  constructor(seed = 1) {
    this.rootSeed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.next = mulberry32(this.rootSeed);
    this.spare = null;
  }

  /**
   * An independent generator for a named purpose.
   *
   * @param {string} name Stream name, e.g. `'weights'`.
   * @returns {Rng} A generator whose sequence depends only on the root seed and the name.
   */
  stream(name) {
    return new Rng((this.rootSeed ^ hashSeed(name)) >>> 0);
  }

  /** @returns {number} Uniform in [0, 1). */
  uniform() {
    return this.next();
  }

  /**
   * @param {number} lo Inclusive lower bound.
   * @param {number} hi Exclusive upper bound.
   * @returns {number} Uniform integer.
   */
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo));
  }

  /**
   * Standard normal by Box–Muller, caching the spare deviate.
   *
   * @param {number} [mean] Mean.
   * @param {number} [sd] Standard deviation.
   * @returns {number} A normal deviate.
   */
  normal(mean = 0, sd = 1) {
    if (this.spare !== null) {
      const value = this.spare;
      this.spare = null;
      return mean + sd * value;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * f;
    return mean + sd * u * f;
  }

  /**
   * A log-normal deviate, parameterised by the *underlying* normal.
   *
   * Synapse counts per connection are heavy-tailed in every connectome that has
   * been counted, which is why this is here rather than a uniform draw: a
   * uniform weight distribution makes a network that behaves nothing like one.
   *
   * @param {number} mu Mean of the underlying normal.
   * @param {number} sigma Standard deviation of the underlying normal.
   * @returns {number} A positive deviate.
   */
  logNormal(mu, sigma) {
    return Math.exp(this.normal(mu, sigma));
  }

  /**
   * Number of events in one bin of a Poisson process.
   *
   * Knuth's method below ~30 expected events, a normal approximation above it,
   * because the multiplicative loop gets slow exactly where the approximation
   * gets good.
   *
   * @param {number} lambda Expected count. Must be finite and non-negative.
   * @returns {number} A non-negative integer.
   */
  poisson(lambda) {
    if (!(lambda > 0)) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  /**
   * Fisher–Yates, in place.
   *
   * @template T
   * @param {T[]} items Array to shuffle.
   * @returns {T[]} The same array, shuffled.
   */
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}
