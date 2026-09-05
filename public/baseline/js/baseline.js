/**
 * The personal baseline: reading a body against itself.
 *
 * Population norms are close to useless for the numbers this app measures. A
 * resting heart rate of 58 is unremarkable for one person and a warning sign
 * for another; an HRV of 30 ms is poor for a twenty-year-old and excellent for
 * a sixty-year-old. Every clinically meaningful thing a coach can do with these
 * figures comes from comparing today with *your* recent history, which is why
 * this module refuses to grade anyone until there is enough history to grade
 * them against.
 *
 * All statistics here are robust — medians and median absolute deviations —
 * because the input is a handful of readings taken by an amateur with a phone,
 * and one scan taken straight after running up the stairs must not be allowed
 * to redefine what normal looks like.
 *
 * @module baseline/baseline
 */

import { clamp, median, medianAbsoluteDeviation, remap } from './signal.js';

/** Readings required before a readiness score is produced at all. */
export const BASELINE_MINIMUM = 4;

/**
 * Readiness awarded to a measure sitting exactly on its baseline.
 *
 * Not 50. A day that is entirely typical for you is a day to train as planned,
 * and it should land in the middle of the "Ready" band rather than at the edge
 * of "Steady" — otherwise the coach spends every ordinary Tuesday telling a
 * perfectly well-recovered athlete to back off.
 */
export const NEUTRAL_POINTS = 62;

/** How far back a baseline looks, in days. */
export const BASELINE_WINDOW_DAYS = 28;

/** Readiness bands, widest first, each with the language the coach uses. */
export const READINESS_BANDS = Object.freeze([
  { id: 'primed', floor: 78, label: 'Primed', tone: 'good' },
  { id: 'ready', floor: 62, label: 'Ready', tone: 'good' },
  { id: 'steady', floor: 46, label: 'Steady', tone: 'neutral' },
  { id: 'compromised', floor: 30, label: 'Compromised', tone: 'warn' },
  { id: 'depleted', floor: -Infinity, label: 'Depleted', tone: 'bad' },
]);

/**
 * Name the band a readiness score falls in.
 *
 * @param {number} score Readiness, 0–100.
 * @returns {{id: string, label: string, tone: string, floor: number}} Band.
 */
export function bandFor(score) {
  return READINESS_BANDS.find((band) => score >= band.floor) || READINESS_BANDS[READINESS_BANDS.length - 1];
}

/**
 * Robust centre and spread of one measure across the baseline window.
 *
 * @param {number[]} values Sample values.
 * @returns {{centre: number, spread: number, n: number}} Summary. `spread` is
 *   floored so that a subject whose readings are briefly identical does not get
 *   an infinite z-score on the next one that differs at all.
 */
export function summarize(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!clean.length) return { centre: 0, spread: 0, n: 0 };
  const centre = median(clean);
  const spread = medianAbsoluteDeviation(clean, centre);
  return { centre, spread: Math.max(spread, Math.abs(centre) * 0.02), n: clean.length };
}

/**
 * Build a baseline from stored sessions.
 *
 * Only resting scans count. A scan taken two minutes after a set of squats is a
 * perfectly good measurement of something, but it is not a measurement of your
 * resting state, and mixing the two would widen the baseline until nothing ever
 * looked abnormal.
 *
 * @param {Array<object>} sessions Stored sessions, any order.
 * @param {object} [options] Options.
 * @param {number} [options.now=Date.now()] Clock, for testing.
 * @param {number} [options.windowDays=BASELINE_WINDOW_DAYS] Look-back window.
 * @returns {object} Baseline summary, including whether it is usable yet.
 */
export function buildBaseline(sessions, options = {}) {
  const now = options.now ?? Date.now();
  const windowDays = options.windowDays ?? BASELINE_WINDOW_DAYS;
  const cutoff = now - windowDays * 86400000;

  const resting = sessions
    .filter((session) => session.kind === 'resting')
    .filter((session) => session.at >= cutoff)
    .filter((session) => (session.confidence ?? 0) >= 0.4)
    .sort((a, b) => a.at - b.at);

  const hrv = summarize(resting.filter((s) => s.hrvReliable).map((s) => s.rmssd));
  const restingHr = summarize(resting.map((s) => s.bpm));
  const breath = summarize(resting.map((s) => s.breathsPerMin));

  const spanDays = resting.length > 1
    ? (resting[resting.length - 1].at - resting[0].at) / 86400000
    : 0;

  return {
    n: resting.length,
    ready: resting.length >= BASELINE_MINIMUM,
    needed: Math.max(0, BASELINE_MINIMUM - resting.length),
    restingHr,
    hrv,
    breath,
    spanDays,
    lastAt: resting.length ? resting[resting.length - 1].at : null,
    sessions: resting,
  };
}

/**
 * Standard score against a robust baseline.
 *
 * @param {number} value Today's value.
 * @param {{centre: number, spread: number, n: number}} summary Baseline summary.
 * @returns {number} Z-score, or 0 when there is no baseline to compare against.
 */
export function zScore(value, summary) {
  if (!summary || !summary.n || !(summary.spread > 0) || !Number.isFinite(value)) return 0;
  return (value - summary.centre) / summary.spread;
}

/**
 * The subjective inputs the camera cannot see.
 *
 * @typedef {object} DailyContext
 * @property {number} sleepHours Hours slept last night.
 * @property {number} sleepQuality 0 (broken) to 4 (deep).
 * @property {number} soreness 0 (none) to 4 (severe).
 * @property {number} stress 0 (calm) to 4 (wired).
 * @property {number} [alcoholUnits] Drinks last night, if tracked.
 */

/**
 * Score today's readiness against the personal baseline.
 *
 * The weights are deliberately modest and the score is deliberately blunt: the
 * inputs are a phone camera and four sliders, and a number quoted to a decimal
 * place would imply a precision that does not exist. What the score is *for* is
 * choosing between a hard session, an easy one and a day off, and it is
 * accurate enough for that.
 *
 * @param {object} reading A completed scan reading.
 * @param {object} baseline Output of {@link buildBaseline}.
 * @param {DailyContext} [context] Subjective inputs.
 * @returns {object} Readiness with the drivers that produced it.
 */
export function readinessScore(reading, baseline, context = {}) {
  if (!baseline.ready) {
    return {
      score: null,
      band: { id: 'building', label: `Building baseline — ${baseline.n}/${BASELINE_MINIMUM}`, tone: 'neutral' },
      drivers: [],
      note: `A readiness score needs ${BASELINE_MINIMUM} resting scans to compare against. `
        + `${baseline.needed} more, ideally at the same time of day.`,
      confidence: 0,
    };
  }

  const drivers = [];
  let total = 0;
  let weightUsed = 0;

  /**
   * Fold one contributor into the score.
   *
   * @param {object} driver Contributor description.
   */
  const contribute = (driver) => {
    total += driver.points * driver.weight;
    weightUsed += driver.weight;
    drivers.push(driver);
  };

  // Heart-rate variability: the single most informative resting measure, and
  // the one that moves first when training load, illness or a bad night lands.
  if (reading.hrvReliable && baseline.hrv.n >= 3) {
    const z = zScore(reading.rmssd, baseline.hrv);
    contribute({
      key: 'hrv',
      label: 'Variability',
      value: `${Math.round(reading.rmssd)} ms`,
      reference: `${Math.round(baseline.hrv.centre)} ms usual`,
      z,
      points: clamp(NEUTRAL_POINTS + z * 14, 0, 100),
      weight: 0.38,
      direction: z >= 0 ? 'up' : 'down',
    });
  }

  // Resting heart rate moves the other way and moves later, but it is the more
  // robust of the two through a mediocre scan.
  {
    const z = zScore(reading.bpm, baseline.restingHr);
    contribute({
      key: 'hr',
      label: 'Resting rate',
      value: `${Math.round(reading.bpm)} bpm`,
      reference: `${Math.round(baseline.restingHr.centre)} bpm usual`,
      z,
      points: clamp(NEUTRAL_POINTS - z * 13, 0, 100),
      weight: reading.hrvReliable ? 0.24 : 0.42,
      direction: z <= 0 ? 'up' : 'down',
    });
  }

  if (Number.isFinite(context.sleepHours)) {
    const quality = Number.isFinite(context.sleepQuality) ? context.sleepQuality : 2;
    const points = clamp(
      remap(context.sleepHours, 4.5, 8, 18, 92) + (quality - 2) * 7,
      0,
      100,
    );
    contribute({
      key: 'sleep',
      label: 'Sleep',
      value: `${context.sleepHours.toFixed(1)} h`,
      reference: 'self-reported',
      z: (points - NEUTRAL_POINTS) / 18,
      points,
      weight: 0.2,
      direction: points >= NEUTRAL_POINTS ? 'up' : 'down',
    });
  }

  if (Number.isFinite(context.soreness) || Number.isFinite(context.stress)) {
    const soreness = Number.isFinite(context.soreness) ? context.soreness : 0;
    const stress = Number.isFinite(context.stress) ? context.stress : 0;
    const points = clamp(100 - (soreness * 11 + stress * 9), 0, 100);
    contribute({
      key: 'load',
      label: 'Body & mind',
      value: `soreness ${soreness}/4 · stress ${stress}/4`,
      reference: 'self-reported',
      z: (points - NEUTRAL_POINTS) / 18,
      points,
      weight: 0.18,
      direction: points >= NEUTRAL_POINTS ? 'up' : 'down',
    });
  }

  let score = weightUsed > 0 ? total / weightUsed : NEUTRAL_POINTS;

  // Alcohol suppresses HRV for a day and a half whatever the sliders say, and a
  // user who logged it deserves to see it named rather than absorbed.
  if (context.alcoholUnits > 0) {
    const penalty = Math.min(14, context.alcoholUnits * 4.5);
    score -= penalty;
    drivers.push({
      key: 'alcohol',
      label: 'Alcohol',
      value: `${context.alcoholUnits} last night`,
      reference: 'suppresses variability for ~24 h',
      z: -penalty / 10,
      points: NEUTRAL_POINTS - penalty,
      weight: 0,
      direction: 'down',
    });
  }

  score = Math.round(clamp(score, 0, 100));
  return {
    score,
    band: bandFor(score),
    drivers: drivers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)),
    note: null,
    // A readiness score inherits the confidence of the scan it was built from:
    // an uncertain scan yields an uncertain score, and the app says so.
    confidence: clamp(reading.confidence ?? 0, 0, 1),
  };
}

/**
 * Flag physiological patterns that deserve a mention rather than a workout.
 *
 * This is not diagnosis and the wording never pretends otherwise. It is the
 * same thing a good coach does when someone turns up with a resting pulse
 * fifteen beats high: not a verdict, just "that is unusual for you, and today
 * is not the day to push it".
 *
 * @param {object} reading Today's reading.
 * @param {object} baseline Personal baseline.
 * @param {DailyContext} [context] Subjective inputs.
 * @returns {Array<{id: string, severity: string, text: string}>} Flags.
 */
export function anomalyFlags(reading, baseline, context = {}) {
  const flags = [];
  if (!baseline.ready) return flags;

  const hrZ = zScore(reading.bpm, baseline.restingHr);
  const hrvZ = reading.hrvReliable ? zScore(reading.rmssd, baseline.hrv) : 0;

  if (hrZ >= 2.5) {
    flags.push({
      id: 'elevated-hr',
      severity: 'high',
      text: `Your resting rate is ${Math.round(reading.bpm - baseline.restingHr.centre)} bpm above your usual `
        + `${Math.round(baseline.restingHr.centre)}. That pattern usually means illness, dehydration, alcohol or `
        + 'a very short night. Train easy or not at all, and if it stays there for days with symptoms, that is a '
        + 'question for a clinician, not for an app.',
    });
  } else if (hrZ >= 1.6 && hrvZ <= -1.2) {
    flags.push({
      id: 'strain',
      severity: 'medium',
      text: 'Rate up and variability down together is the classic accumulated-fatigue signature. One easy day '
        + 'usually clears it; three in a row means the training block is too much, not that you are too weak.',
    });
  }

  if (reading.breathsPerMin >= 20 && baseline.breath.n >= 3
    && zScore(reading.breathsPerMin, baseline.breath) >= 2) {
    flags.push({
      id: 'breath',
      severity: 'medium',
      text: `Breathing is fast for you (${Math.round(reading.breathsPerMin)}/min). Often that is simply the scan `
        + 'catching you unsettled — try the paced breathing screen and scan again.',
    });
  }

  if (context.alcoholUnits > 0 && hrvZ <= -1) {
    flags.push({
      id: 'alcohol',
      severity: 'low',
      text: 'The variability drop is consistent with last night. It is temporary — expect it back in a day.',
    });
  }

  return flags;
}

/**
 * Extract a trend series for one measure, oldest first.
 *
 * @param {Array<object>} sessions Stored sessions.
 * @param {string} key Session field to plot.
 * @param {object} [options] Options.
 * @param {number} [options.limit=30] Maximum points returned.
 * @returns {Array<{at: number, value: number}>} Trend points.
 */
export function trendSeries(sessions, key, options = {}) {
  const limit = options.limit ?? 30;
  return sessions
    .filter((session) => session.kind === 'resting' && Number.isFinite(session[key]) && session[key] > 0)
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((session) => ({ at: session.at, value: session[key] }));
}
