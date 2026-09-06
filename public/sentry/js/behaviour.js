/**
 * What a track's shape and motion actually support saying.
 *
 * This is the module most likely to be over-read, so it is worth being blunt
 * about its ceiling: everything here is kinematics. Cadence, sinuosity, dwell,
 * posture ratio and limb activity are measurements of where a body was and how
 * fast parts of it moved. None of them is a mental state. A person pacing by a
 * door is a person whose path reversed direction six times — not a person who
 * is "nervous", and not a person who is "casing the building". The app reports
 * the reversals and lets a human draw the conclusion, because the alternative
 * is a machine that produces suspicion about strangers from arithmetic.
 *
 * Where the literature does support an inference the module says so and gives
 * the number behind it. Walking cadence really does cluster near 100–120 steps
 * a minute in adults and really does separate a walk from a run; a
 * height-to-width ratio really does separate someone upright from someone
 * crouched or prone, which is the measurement behind the fall alert. Those are
 * geometry, and they are stated as geometry.
 *
 * The spectral work is shared with the Baseline vitals app rather than
 * reimplemented — the estimator that finds a breathing rate in a noisy trace is
 * the same estimator that finds a step rate, and it has tests of its own.
 *
 * @module sentry/behaviour
 */

import {
  dominantFrequency,
  powerSpectrum,
  resampleUniform,
  spectralSnrDb,
  standardDeviation,
} from '../../baseline/js/signal.js';

/** Rate the sampled series are placed on before spectral work, hertz. */
export const ANALYSIS_HZ = 15;

/** Step frequencies a human gait can occupy, hertz (60–210 steps a minute). */
export const GAIT_BAND = Object.freeze({ minHz: 1.0, maxHz: 3.5 });

/** Below this signal-to-noise, no cadence is claimed. */
export const GAIT_SNR_FLOOR = 1.5;

/**
 * Step rate from the rise and fall of a subject's ground contact.
 *
 * A walking body's lowest point oscillates once per footfall, which survives at
 * resolutions far too low to see limbs at all — the whole point of measuring it
 * this way rather than by finding legs. The frequency is the step rate; halve it
 * for stride rate.
 *
 * @param {Array<{t: number, value: number}>} samples Per-frame lowest row of the
 *   subject, with capture times in milliseconds.
 * @returns {{stepsPerMin: number, hz: number, snrDb: number,
 *   confident: boolean}|null} Cadence estimate, or null when the record is too
 *   short.
 */
export function cadence(samples) {
  if (!samples || samples.length < ANALYSIS_HZ * 2) return null;
  const times = samples.map((s) => s.t);
  const values = samples.map((s) => s.value);
  const grid = resampleUniform(values, times, ANALYSIS_HZ);
  // Two seconds is the floor: a cadence claim needs at least a couple of full
  // step cycles, and the resampler returns an empty series for a record that
  // spans no time at all.
  if (grid.values.length < ANALYSIS_HZ * 2) return null;
  const spectrum = powerSpectrum(grid.values, ANALYSIS_HZ, GAIT_BAND);
  const peak = dominantFrequency(spectrum);
  if (!peak.hz) return null;
  const snrDb = spectralSnrDb(spectrum, peak.hz);
  return {
    stepsPerMin: peak.hz * 60,
    hz: peak.hz,
    snrDb,
    confident: snrDb >= GAIT_SNR_FLOOR,
  };
}

/**
 * How much a path wandered, relative to getting where it got.
 *
 * One is a straight line. Two means the subject covered twice the ground their
 * displacement accounts for. It is the cheapest separator there is between
 * crossing a space and moving around inside it.
 *
 * @param {Array<{x: number|null, y: number|null}>} path Ground path.
 * @returns {number|null} Ratio of path length to net displacement, or null
 *   without metric coordinates.
 */
export function sinuosity(path) {
  const points = (path ?? []).filter((p) => p.x !== null && p.y !== null);
  if (points.length < 3) return null;
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const net = Math.hypot(
    points[points.length - 1].x - points[0].x,
    points[points.length - 1].y - points[0].y,
  );
  if (net < 0.2) return length > 0.5 ? 99 : null;
  return length / net;
}

/**
 * Longest continuous time spent inside a small radius.
 *
 * @param {Array<{t: number, x: number|null, y: number|null}>} path Ground path.
 * @param {number} [radiusM=1.5] Radius that counts as staying put.
 * @returns {number} Seconds.
 */
export function dwellSeconds(path, radiusM = 1.5) {
  const points = (path ?? []).filter((p) => p.x !== null && p.y !== null);
  if (points.length < 2) return 0;
  let best = 0;
  let anchor = 0;
  for (let i = 1; i < points.length; i += 1) {
    const drift = Math.hypot(points[i].x - points[anchor].x, points[i].y - points[anchor].y);
    if (drift > radiusM) {
      anchor = i;
      continue;
    }
    best = Math.max(best, (points[i].t - points[anchor].t) / 1000);
  }
  return best;
}

/**
 * Count direction reversals along a path.
 *
 * Pacing shows up here and almost nowhere else: someone walking back and forth
 * across the same few metres has near-zero net displacement, a high sinuosity
 * and a reversal every few seconds, and each of the three alone has innocent
 * explanations.
 *
 * @param {Array<{t: number, x: number|null, y: number|null}>} path Ground path.
 * @param {number} [minLegM=1.2] Distance a leg must cover to count.
 * @returns {number} Reversals.
 */
export function reversals(path, minLegM = 1.2) {
  const points = (path ?? []).filter((p) => p.x !== null && p.y !== null);
  if (points.length < 4) return 0;
  let count = 0;
  let legStart = points[0];
  let heading = null;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - legStart.x;
    const dy = points[i].y - legStart.y;
    const leg = Math.hypot(dx, dy);
    if (leg < minLegM) continue;
    const next = { x: dx / leg, y: dy / leg };
    if (heading) {
      const dot = heading.x * next.x + heading.y * next.y;
      // Reversal, not a corner: the new leg must point back the way it came.
      if (dot < -0.5) count += 1;
    }
    heading = next;
    legStart = points[i];
  }
  return count;
}

/**
 * Posture from the aspect ratio of the subject's bounding box.
 *
 * @param {number} boxHeight Height in pixels.
 * @param {number} boxWidth Width in pixels.
 * @returns {{posture: string, ratio: number}} Posture label and the ratio.
 */
export function posture(boxHeight, boxWidth) {
  const ratio = boxHeight / Math.max(1, boxWidth);
  if (ratio >= 1.8) return { posture: 'upright', ratio };
  if (ratio >= 1.15) return { posture: 'stooped', ratio };
  if (ratio >= 0.75) return { posture: 'low', ratio };
  return { posture: 'prone', ratio };
}

/**
 * Whether a track just went from upright to horizontal and stayed there.
 *
 * This is the one behaviour measure worth alerting on by itself, because the
 * failure mode is benign — somebody bends down to tie a lace and the app asks a
 * question — and the miss is not.
 *
 * @param {Array<{t: number, ratio: number}>} history Posture ratio over time.
 * @param {object} [options] Detection thresholds.
 * @param {number} [options.settleSec=3] Seconds the low posture must persist.
 * @returns {boolean} True when a fall pattern is present.
 */
export function fallPattern(history, options = {}) {
  const { settleSec = 3 } = options;
  if (!history || history.length < 6) return false;
  const last = history[history.length - 1];
  if (last.ratio >= 0.9) return false;
  let wasUpright = false;
  let lowSince = null;
  for (const sample of history) {
    if (sample.ratio >= 1.6) {
      wasUpright = true;
      lowSince = null;
    } else if (wasUpright && sample.ratio < 0.9) {
      if (lowSince === null) lowSince = sample.t;
    } else if (sample.ratio >= 1.15) {
      lowSince = null;
    }
  }
  return lowSince !== null && (last.t - lowSince) / 1000 >= settleSec;
}

/**
 * Upper-body activity relative to the subject's own overall motion.
 *
 * Arm and hand movement raises the change energy in the top third of a subject
 * without moving the body's centre. The ratio is what makes it usable: it is
 * high for someone gesturing, waving, or working at a lock while standing
 * still, and unremarkable for someone simply walking, whose whole silhouette is
 * moving together.
 *
 * @param {Array<{t: number, value: number}>} upper Per-frame mean change energy
 *   in the subject's top third.
 * @param {number} speedMps The subject's ground speed.
 * @returns {{index: number, elevated: boolean}|null} Activity index, or null
 *   when the record is too short.
 */
export function limbActivity(upper, speedMps) {
  if (!upper || upper.length < 10) return null;
  const values = upper.map((s) => s.value);
  const spread = standardDeviation(values);
  const level = values.reduce((a, b) => a + b, 0) / values.length;
  if (level < 1e-6) return { index: 0, elevated: false };
  // Walking moves the whole body, so its upper-third energy is high but steady;
  // gesturing is bursty. Variability over level separates them, and dividing
  // through by speed stops a fast walk from reading as activity.
  const index = (spread / level) * (1 / (1 + speedMps));
  return { index, elevated: index > 0.35 };
}
