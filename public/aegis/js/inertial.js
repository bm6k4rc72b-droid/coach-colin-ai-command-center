/**
 * The phone in the pocket, as a second opinion.
 *
 * A camera cannot see into the bathroom, and the bathroom is where people
 * fall. So the second channel is inertial: the accelerometer in a phone
 * carried in a pocket, clipped to a belt or hung on a lanyard, reached through
 * `devicemotion` — no app store, no pairing, no wearable to buy. Open the page
 * on the second phone, leave it in the pocket, and it reports to the same
 * console the camera does.
 *
 * A fall has a signature in that data with four parts, and the discipline of
 * this module is that it looks for all four rather than the loud one:
 *
 * 1. **A dip.** As the body starts to go, the sensor unloads. Real human falls
 *    rarely reach true free fall — a hand hits a counter, a hip catches a
 *    chair — so the test is for a partial unloading, well under 1 g but not
 *    near zero.
 * 2. **A spike.** Impact, and it is brief: tens of milliseconds, several g.
 *    On its own this is worth almost nothing, because setting a phone down
 *    firmly produces a bigger one.
 * 3. **A turn.** The direction of gravity relative to the device changes and
 *    *stays* changed. Somebody who sat down heavily produced the spike; they
 *    did not produce a fifty-degree reorientation that persists.
 * 4. **A silence.** Afterwards, stillness.
 *
 * And then the test that stops the whole channel from being fooled by a phone
 * sliding off a table onto a rug, which produces the first, second and fourth
 * beautifully: **a still person is not a still object, because a still person
 * breathes.** A body at rest moves its chest, and the sensor sees it — a few
 * thousandths of a g, oscillating somewhere between eight and thirty times a
 * minute. A phone lying on a floor produces an order of magnitude less and no
 * rhythm at all. If the silence after an impact has no breathing in it, this
 * module says so, and the fusion stage treats the whole thing as furniture.
 *
 * The analysis is a pure function over a list of samples. The class at the
 * bottom is only plumbing: permissions, listeners, and a ring buffer.
 *
 * @module aegis/inertial
 */

import { Ring, clamp, ramp } from './mathkit.js';

/** Standard gravity, m/s². */
const G = 9.80665;

/** Magnitude below which the sensor counts as unloaded, in g. */
export const FREEFALL_G = 0.72;

/** Magnitude above which the sensor counts as impacted, in g. */
export const IMPACT_G = 2.1;

/** Reorientation, in degrees, that counts as having turned over. */
export const TILT_DEG = 45;

/**
 * RMS of the residual, in g, below which nothing alive is holding the device.
 *
 * Respiration seen by a phone in a pocket is worth a few hundredths of a metre
 * per second squared — single thousandths of a g — which is uncomfortably
 * close to the sensor's own noise and is why the rate test exists alongside
 * this one. Set too high, the test declares a fallen person to be a dropped
 * handset, which is the most dangerous mistake in this file.
 */
export const BREATH_FLOOR = 0.0015;

/** RMS of the residual, in g, above which the device is being handled. */
export const BREATH_CEILING = 0.06;

/** Breathing rates a resting adult can plausibly be at, in Hz. */
const BREATH_BAND = Object.freeze([0.10, 0.55]);

/**
 * Magnitude of a sample, in g.
 *
 * @param {{ax: number, ay: number, az: number}} sample One reading, m/s².
 * @returns {number} Magnitude in g.
 */
export function magnitudeG(sample) {
  return Math.hypot(sample.ax, sample.ay, sample.az) / G;
}

/**
 * Mean vector over a slice of samples — an estimate of gravity's direction.
 *
 * @param {{ax: number, ay: number, az: number}[]} samples The slice.
 * @returns {{x: number, y: number, z: number}|null} The mean, or null when empty.
 */
export function meanVector(samples) {
  if (!samples.length) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const s of samples) { x += s.ax; y += s.ay; z += s.az; }
  return { x: x / samples.length, y: y / samples.length, z: z / samples.length };
}

/**
 * Angle between two vectors, in degrees.
 *
 * @param {{x: number, y: number, z: number}} a First vector.
 * @param {{x: number, y: number, z: number}} b Second vector.
 * @returns {number} The angle, 0–180, or 0 when either is degenerate.
 */
export function angleBetween(a, b) {
  if (!a || !b) return 0;
  const na = Math.hypot(a.x, a.y, a.z);
  const nb = Math.hypot(b.x, b.y, b.z);
  if (na < 1e-6 || nb < 1e-6) return 0;
  const cos = clamp((a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Look for breathing in the residual of a still stretch.
 *
 * The residual is the magnitude with its own mean removed, which strips
 * gravity whatever attitude the device came to rest in. Amplitude alone is not
 * enough — a slow thermal drift has amplitude too — so the rate is checked by
 * counting mean crossings, which is the cheapest periodicity estimate there is
 * and entirely adequate for separating "roughly a breath every four seconds"
 * from "nothing" and from "being carried".
 *
 * The crossings are counted on a smoothed trace, and that is not tidying up.
 * A phone accelerometer's own noise is a few thousandths of a g — the same
 * order as the signal being looked for — so on the raw trace the sign flips at
 * the sample rate and the estimated breathing rate comes out at fifteen hertz
 * for everything, alive or not. A third-of-a-second moving average is far
 * shorter than a breath and far longer than the noise, so it removes exactly
 * the thing that is not wanted.
 *
 * @param {{t: number, ax: number, ay: number, az: number}[]} samples A still stretch.
 * @returns {{detected: boolean, rms: number, rateHz: number, seconds: number}}
 *   What was found in the silence.
 */
export function breathing(samples) {
  const seconds = samples.length > 1 ? (samples[samples.length - 1].t - samples[0].t) / 1000 : 0;
  if (samples.length < 8 || seconds < 1.5) {
    return { detected: false, rms: 0, rateHz: 0, seconds };
  }
  const raw = samples.map(magnitudeG);
  const rate = raw.length / Math.max(seconds, 1e-6);
  const span = Math.max(1, Math.round(rate * 0.33));
  const magnitudes = raw.map((_, i) => {
    const from = Math.max(0, i - span);
    const to = Math.min(raw.length - 1, i + span);
    let sum = 0;
    for (let j = from; j <= to; j += 1) sum += raw[j];
    return sum / (to - from + 1);
  });
  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  let sumSquares = 0;
  let crossings = 0;
  let previous = magnitudes[0] - mean;
  for (const m of magnitudes) {
    const residual = m - mean;
    sumSquares += residual * residual;
    if ((residual > 0 && previous <= 0) || (residual < 0 && previous >= 0)) crossings += 1;
    previous = residual;
  }
  const rms = Math.sqrt(sumSquares / magnitudes.length);
  // Two crossings per cycle.
  const rateHz = crossings / 2 / Math.max(seconds, 1e-6);
  const detected = rms >= BREATH_FLOOR
    && rms <= BREATH_CEILING
    && rateHz >= BREATH_BAND[0]
    && rateHz <= BREATH_BAND[1];
  return { detected, rms, rateHz, seconds };
}

/**
 * A reading of the inertial channel.
 *
 * @typedef {object} Inertial
 * @property {boolean} available Whether there was enough data to say anything.
 * @property {number} likelihood Belief that a fall happened, 0–1.
 * @property {{found: boolean, minG: number, atMs: number}} freefall The dip.
 * @property {{found: boolean, peakG: number, atMs: number}} impact The spike.
 * @property {{degrees: number, turned: boolean}} tilt The reorientation.
 * @property {{still: boolean, seconds: number}} after What followed.
 * @property {{detected: boolean, rms: number, rateHz: number}} breath Signs of life.
 * @property {number} against Positive evidence that this was *not* a person
 *   falling, 0–1 — distinct from simply having nothing to report.
 * @property {string[]} reasons Plain-language grounds.
 */

/**
 * Analyse a window of motion samples.
 *
 * @param {{t: number, ax: number, ay: number, az: number}[]} samples Ordered
 *   oldest first, acceleration including gravity, in m/s².
 * @param {object} [options] Options.
 * @param {number} [options.nowMs] Treat this as the present.
 * @returns {Inertial} The reading.
 */
export function analyseInertial(samples, options = {}) {
  const empty = {
    available: false,
    likelihood: 0,
    freefall: { found: false, minG: 1, atMs: 0 },
    impact: { found: false, peakG: 0, atMs: 0 },
    tilt: { degrees: 0, turned: false },
    after: { still: false, seconds: 0 },
    breath: { detected: false, rms: 0, rateHz: 0 },
    against: 0,
    reasons: ['no motion data'],
  };
  if (!samples || samples.length < 12) return empty;

  const nowMs = options.nowMs ?? samples[samples.length - 1].t;
  const magnitudes = samples.map(magnitudeG);

  // The impact is the loudest thing in the window; everything else is located
  // relative to it, because a fall's parts only mean anything in that order.
  let peak = 0;
  let peakIndex = -1;
  for (let i = 0; i < magnitudes.length; i += 1) {
    if (magnitudes[i] > peak) { peak = magnitudes[i]; peakIndex = i; }
  }
  const impactFound = peak >= IMPACT_G;
  const impactAt = peakIndex >= 0 ? samples[peakIndex].t : 0;

  // The dip must come *before* the spike, within a window a body could fall in.
  let minG = 1;
  let dipIndex = -1;
  if (peakIndex > 0) {
    for (let i = peakIndex - 1; i >= 0; i -= 1) {
      if (impactAt - samples[i].t > 1200) break;
      if (magnitudes[i] < minG) { minG = magnitudes[i]; dipIndex = i; }
    }
  }
  const freefallFound = impactFound && minG <= FREEFALL_G;

  // Attitude before, attitude after — a quarter of a second either side of the
  // impact is skipped, because during it the sensor is measuring the collision
  // rather than gravity.
  const before = samples.filter((s) => s.t < impactAt - 250 && s.t > impactAt - 1400);
  const after = samples.filter((s) => s.t > impactAt + 250);
  const degrees = angleBetween(meanVector(before), meanVector(after));
  const turned = impactFound && degrees >= TILT_DEG;

  // Stillness afterwards, measured as the spread of the magnitude.
  const afterSeconds = after.length > 1 ? (after[after.length - 1].t - after[0].t) / 1000 : 0;
  const afterMags = after.map(magnitudeG);
  const afterMean = afterMags.length
    ? afterMags.reduce((a, b) => a + b, 0) / afterMags.length
    : 1;
  const spread = afterMags.length
    ? Math.sqrt(afterMags.reduce((a, m) => a + (m - afterMean) ** 2, 0) / afterMags.length)
    : 1;
  const still = afterSeconds >= 1.5 && spread < 0.08;
  const breath = breathing(after);

  const reasons = [];
  let against = 0;
  // Log-odds would be tidier, but the four parts of a fall are not independent
  // — the dip causes the spike — so they are weighted directly and the weights
  // say plainly which evidence the system considers strong.
  let likelihood = 0;
  if (impactFound) {
    likelihood += 0.18 + 0.14 * ramp(peak, IMPACT_G, 5.5);
    reasons.push(`impact ${peak.toFixed(1)} g`);
  }
  if (freefallFound) {
    likelihood += 0.20 + 0.10 * ramp(FREEFALL_G - minG, 0, 0.55);
    reasons.push(`unloaded to ${minG.toFixed(2)} g before impact`);
  }
  if (turned) {
    likelihood += 0.26;
    reasons.push(`turned ${Math.round(degrees)}° and stayed turned`);
  } else if (impactFound && degrees < 15) {
    likelihood -= 0.12;
    against = Math.max(against, 0.3);
    reasons.push(`orientation unchanged (${Math.round(degrees)}°) — consistent with sitting down hard`);
  }
  if (still) {
    likelihood += 0.14;
    reasons.push(`still for ${afterSeconds.toFixed(1)} s afterwards`);
  }
  if (still && !breath.detected) {
    // Nothing alive is holding this device. This is a finding, not a silence,
    // so it is published as evidence against rather than merely subtracted.
    likelihood -= 0.40;
    against = Math.max(against, breath.rms < BREATH_FLOOR ? 0.72 : 0.4);
    reasons.push(breath.rms < BREATH_FLOOR
      ? 'no breathing in the stillness — the device is lying on something, not on somebody'
      : 'stillness is not a resting body');
  } else if (breath.detected) {
    reasons.push(`breathing at ${(breath.rateHz * 60).toFixed(0)}/min`);
  }
  if (!impactFound) reasons.push(`nothing above ${IMPACT_G} g in the window`);

  const ageSeconds = (nowMs - impactAt) / 1000;
  if (impactFound && ageSeconds > 30) {
    likelihood *= clamp(1 - (ageSeconds - 30) / 60, 0, 1);
    reasons.push(`impact was ${Math.round(ageSeconds)} s ago`);
  }

  return {
    available: true,
    likelihood: clamp(likelihood, 0, 1),
    freefall: { found: freefallFound, minG, atMs: dipIndex >= 0 ? samples[dipIndex].t : 0 },
    impact: { found: impactFound, peakG: peak, atMs: impactAt },
    tilt: { degrees, turned },
    after: { still, seconds: afterSeconds },
    breath,
    against: impactFound ? against : 0,
    reasons,
  };
}

/**
 * Live accelerometer plumbing.
 *
 * iOS requires a user gesture and an explicit grant before it will emit
 * `devicemotion` at all, and it does so silently — no error, no events, just a
 * channel that never reports. `start` therefore resolves with what actually
 * happened rather than assuming, so the interface can say "the phone is not
 * contributing" instead of showing a sensor that is not there.
 */
export class MotionSensor {
  /** @param {number} [seconds] How much history to keep. */
  constructor(seconds = 12) {
    this.samples = new Ring(seconds * 60);
    this.listening = false;
    this.rateHz = 0;
    this.onSample = null;
    this.handle = this.handle.bind(this);
  }

  /** @returns {boolean} Whether this browser exposes motion at all. */
  static supported() {
    return typeof globalThis.DeviceMotionEvent !== 'undefined';
  }

  /** @returns {boolean} Whether a permission prompt is required first. */
  static needsPermission() {
    return typeof globalThis.DeviceMotionEvent?.requestPermission === 'function';
  }

  /**
   * Ask for the sensor and begin listening.
   *
   * @returns {Promise<{ok: boolean, reason: string}>} What happened.
   */
  async start() {
    if (!MotionSensor.supported()) {
      return { ok: false, reason: 'This device has no motion sensor the browser can read.' };
    }
    if (MotionSensor.needsPermission()) {
      try {
        const state = await globalThis.DeviceMotionEvent.requestPermission();
        if (state !== 'granted') {
          return { ok: false, reason: 'Motion access was declined.' };
        }
      } catch {
        return { ok: false, reason: 'Motion access must be asked for from a tap.' };
      }
    }
    globalThis.addEventListener('devicemotion', this.handle);
    this.listening = true;
    // A grant is not the same as data. Laptops report the permission as
    // granted and then emit nothing at all, forever.
    const before = this.samples.length;
    await new Promise((resolve) => { setTimeout(resolve, 700); });
    if (this.samples.length === before) {
      this.stop();
      return { ok: false, reason: 'The sensor was allowed but sent nothing — this device probably has no accelerometer.' };
    }
    return { ok: true, reason: `Reporting at about ${Math.round(this.rateHz)} Hz.` };
  }

  /** Stop listening. */
  stop() {
    if (!this.listening) return;
    globalThis.removeEventListener('devicemotion', this.handle);
    this.listening = false;
  }

  /**
   * Record one event.
   *
   * @param {DeviceMotionEvent} event The event.
   */
  handle(event) {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const previous = this.samples.last();
    const t = performance.now();
    const sample = { t, ax: a.x, ay: a.y, az: a.z };
    this.samples.push(sample);
    if (previous) {
      const dt = (t - previous.t) / 1000;
      if (dt > 0) this.rateHz = this.rateHz ? this.rateHz * 0.9 + (1 / dt) * 0.1 : 1 / dt;
    }
    if (this.onSample) this.onSample(sample);
  }

  /**
   * Analyse everything held.
   *
   * @param {number} [nowMs] Treat this as the present.
   * @returns {Inertial} The reading.
   */
  read(nowMs) {
    return analyseInertial(this.samples.toArray(), { nowMs });
  }
}
