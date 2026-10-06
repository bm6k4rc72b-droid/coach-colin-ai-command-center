/**
 * Signal filters for noisy per-frame measurements.
 *
 * Pose landmarks jitter by a few pixels frame to frame; differentiate that
 * twice for acceleration and the noise swamps the signal. The One Euro filter
 * (Casiez, Roussel & Vogel, CHI 2012) adapts its cutoff to the signal's speed:
 * heavy smoothing when still, light smoothing when moving, so it removes
 * jitter without the lag a fixed low-pass adds to fast movements.
 *
 * @module vulture/filters
 */

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  /**
   * @param {number} [minCutoff=1.0] Hz — lower = smoother at rest.
   * @param {number} [beta=0.02] Speed coefficient — higher = less lag when moving.
   * @param {number} [dCutoff=1.0] Hz cutoff for the derivative estimate.
   */
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  /**
   * @param {number} value Raw sample.
   * @param {number} t Timestamp in seconds.
   * @returns {number} Filtered sample.
   */
  filter(value, t) {
    if (!Number.isFinite(value)) return this.x ?? value;
    if (this.x === null || this.t === null || t <= this.t) {
      this.x = value; this.t = t;
      return value;
    }
    const dt = t - this.t;
    this.t = t;
    const dRaw = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

/** Exponential moving average with a time constant, robust to uneven frame times. */
export class Ema {
  /** @param {number} tau Time constant in seconds. */
  constructor(tau) {
    this.tau = tau;
    this.v = null;
    this.t = null;
  }

  /**
   * @param {number} value Sample.
   * @param {number} t Seconds.
   * @returns {number} Smoothed value.
   */
  push(value, t) {
    if (!Number.isFinite(value)) return this.v ?? 0;
    if (this.v === null || this.t === null) { this.v = value; this.t = t; return value; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    this.v += (1 - Math.exp(-dt / this.tau)) * (value - this.v);
    return this.v;
  }

  reset() { this.v = null; this.t = null; }
}

/** Finite-difference derivative of an already-smoothed signal, itself EMA-smoothed. */
export class Derivative {
  /** @param {number} [tau=0.08] Smoothing on the derivative, seconds. */
  constructor(tau = 0.08) {
    this.ema = new Ema(tau);
    this.prev = null;
    this.prevT = null;
  }

  /**
   * @param {number} value Sample.
   * @param {number} t Seconds.
   * @returns {number} d(value)/dt.
   */
  push(value, t) {
    if (this.prev === null || t <= this.prevT) { this.prev = value; this.prevT = t; return this.ema.v ?? 0; }
    const d = (value - this.prev) / (t - this.prevT);
    this.prev = value; this.prevT = t;
    return this.ema.push(d, t);
  }

  reset() { this.ema.reset(); this.prev = null; this.prevT = null; }
}
