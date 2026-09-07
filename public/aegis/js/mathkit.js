/**
 * The small arithmetic every other module leans on.
 *
 * Nothing here is clever. It is collected in one place because the alternative
 * — each module carrying its own `clamp` and its own idea of what an
 * exponential average is — is how two parts of a safety system come to disagree
 * about the same number while both looking correct in review.
 *
 * @module aegis/mathkit
 */

/**
 * Constrain a value to a range.
 *
 * @param {number} value The value.
 * @param {number} low Lower bound.
 * @param {number} high Upper bound.
 * @returns {number} The constrained value.
 */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * Linear interpolation.
 *
 * @param {number} a Start.
 * @param {number} b End.
 * @param {number} t Position, 0–1 (not clamped).
 * @returns {number} The interpolated value.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a value from one range onto 0–1, clamped.
 *
 * Used everywhere a physical measurement has to become a likelihood: "a torso
 * angle of 20° is upright, 70° is down, and in between it is a proportion".
 *
 * @param {number} value The value.
 * @param {number} low The value that maps to 0.
 * @param {number} high The value that maps to 1.
 * @returns {number} The normalised value, 0–1.
 */
export function ramp(value, low, high) {
  if (high === low) return value >= high ? 1 : 0;
  return clamp((value - low) / (high - low), 0, 1);
}

/**
 * A time-constant exponential average.
 *
 * Written in terms of seconds rather than a bare coefficient because every
 * caller here is sampling at a rate it does not control — a phone that drops
 * from 30 fps to 8 in a dark hallway must not silently change how long the
 * filter remembers.
 *
 * @param {number} previous The current average.
 * @param {number} sample The new sample.
 * @param {number} dtSeconds Time since the previous sample.
 * @param {number} tauSeconds The time constant.
 * @returns {number} The updated average.
 */
export function ema(previous, sample, dtSeconds, tauSeconds) {
  if (!Number.isFinite(previous)) return sample;
  if (!(dtSeconds > 0) || !(tauSeconds > 0)) return sample;
  const alpha = 1 - Math.exp(-dtSeconds / tauSeconds);
  return previous + (sample - previous) * alpha;
}

/**
 * The median of an array of numbers.
 *
 * @param {number[]|Float32Array} values The values; not modified.
 * @returns {number} The median, or 0 when there are none.
 */
export function median(values) {
  const list = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/**
 * A quantile of an array of numbers, by linear interpolation.
 *
 * @param {number[]|Float32Array} values The values; not modified.
 * @param {number} q The quantile, 0–1.
 * @returns {number} The quantile, or 0 when there are no values.
 */
export function quantile(values, q) {
  const list = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const pos = clamp(q, 0, 1) * (list.length - 1);
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return low === high ? list[low] : lerp(list[low], list[high], pos - low);
}

/**
 * Convert a probability to log-odds.
 *
 * The fusion stage adds evidence rather than multiplying it, which is the same
 * arithmetic in a space where a channel that says "probably not" can actually
 * cancel a channel that says "probably yes". The clamp keeps a single confident
 * channel from reaching ±Infinity and becoming impossible to argue with.
 *
 * @param {number} p A probability, 0–1.
 * @returns {number} Log-odds, bounded to ±6.
 */
export function logit(p) {
  const bounded = clamp(p, 0.0025, 0.9975);
  return Math.log(bounded / (1 - bounded));
}

/**
 * Convert log-odds back to a probability.
 *
 * @param {number} x Log-odds.
 * @returns {number} A probability, 0–1.
 */
export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Shortest signed difference between two angles in degrees.
 *
 * @param {number} a First angle.
 * @param {number} b Second angle.
 * @returns {number} `a − b` folded to −180…180.
 */
export function angleDelta(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Format a duration for a person to read aloud or at a glance.
 *
 * @param {number} ms Milliseconds.
 * @returns {string} Something like `4 s`, `1 min 20 s`, `2 h 05 min`.
 */
export function duration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * A fixed-length ring of samples, oldest first when read.
 *
 * Every channel in this app asks the same question — "what did the last two
 * seconds look like?" — of a stream that never ends, on a device that must not
 * grow its heap while doing so.
 */
export class Ring {
  /** @param {number} capacity How many samples to keep. */
  constructor(capacity) {
    this.capacity = Math.max(1, capacity | 0);
    this.items = [];
    this.cursor = 0;
  }

  /**
   * Append a sample, discarding the oldest when full.
   *
   * @param {*} item The sample.
   * @returns {*} The same sample, for chaining.
   */
  push(item) {
    if (this.items.length < this.capacity) this.items.push(item);
    else {
      this.items[this.cursor] = item;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    return item;
  }

  /** @returns {*[]} The samples, oldest first. */
  toArray() {
    if (this.items.length < this.capacity) return this.items.slice();
    return this.items.slice(this.cursor).concat(this.items.slice(0, this.cursor));
  }

  /** @returns {number} How many samples are held. */
  get length() {
    return this.items.length;
  }

  /** @returns {*} The most recent sample, or undefined. */
  last() {
    if (!this.items.length) return undefined;
    const index = this.items.length < this.capacity
      ? this.items.length - 1
      : (this.cursor - 1 + this.capacity) % this.capacity;
    return this.items[index];
  }

  /** Forget everything. */
  clear() {
    this.items = [];
    this.cursor = 0;
  }
}
