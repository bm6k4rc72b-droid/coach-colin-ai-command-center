/**
 * Seeded pseudo-randomness.
 *
 * The demo data has to be identical on every load and in every test run — a
 * dashboard whose headline number changes when you refresh is not a dashboard,
 * and a synthetic dataset you cannot re-derive is not testable. mulberry32 is
 * used because it is four lines, has a well-behaved period for a dataset this
 * size, and can be reimplemented anywhere the fixtures need reproducing.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  uniform(lo: number, hi: number): number;
  /** Normal draw with the given mean and standard deviation. */
  gauss(mean: number, sd: number): number;
  /** Normal draw truncated to [lo, hi] by resampling, so the tails are cut rather than piled on the bounds. */
  gaussClamped(mean: number, sd: number, lo: number, hi: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform integer in [lo, hi]. */
  int(lo: number, hi: number): number;
  /** Uniform choice. */
  pick<T>(items: readonly T[]): T;
  /** Choice with weights, which need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
}

/** Turn a string into a 32-bit seed, so seeds can be readable ids. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;
  let spare: number | null = null;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Box–Muller, keeping the second variate rather than throwing it away.
  const standardNormal = (): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u <= Number.EPSILON) u = next();
    while (v <= Number.EPSILON) v = next();
    const radius = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * v;
    spare = radius * Math.sin(theta);
    return radius * Math.cos(theta);
  };

  const rng: Rng = {
    next,
    uniform: (lo, hi) => lo + next() * (hi - lo),
    gauss: (mean, sd) => mean + standardNormal() * sd,
    gaussClamped(mean, sd, lo, hi) {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const draw = mean + standardNormal() * sd;
        if (draw >= lo && draw <= hi) return draw;
      }
      return Math.min(hi, Math.max(lo, mean));
    },
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick: empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    weighted(entries) {
      let total = 0;
      for (const [, weight] of entries) total += Math.max(0, weight);
      if (total <= 0) throw new Error('weighted: weights must sum above zero');
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= Math.max(0, weight);
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
  };
  return rng;
}
