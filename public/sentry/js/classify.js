/**
 * What kind of thing is that, from geometry alone.
 *
 * There is no neural network here and no recognition of any kind. The app knows
 * a subject's height in metres, how wide they are relative to that, how solid
 * the silhouette is, how fast they crossed the ground and whether their gait
 * has a step rhythm — and those five numbers separate the four categories that
 * matter for a perimeter (a person, a smaller four-legged animal, a vehicle,
 * and everything else) well enough to be useful and badly enough that the app
 * must always show its reasoning.
 *
 * That is a deliberate choice, not a shortcut. A classifier that says "person,
 * 94%" invites the operator to stop looking. One that says "person — 1.74 m
 * tall, upright, 112 steps a minute" hands them the evidence, and when a deer
 * standing on its hind legs at the edge of the drive gets called a person, they
 * can see exactly which measurement misled it.
 *
 * Every threshold below is a stated assumption about a physical world, and each
 * one is wrong somewhere: a child is shorter than the person band, a crawling
 * adult is not upright, a large dog reaches the small-person band. The
 * confidence score exists to make those cases read as uncertain rather than as
 * a different answer.
 *
 * @module sentry/classify
 */

/** The categories the geometry can separate. */
export const CLASSES = Object.freeze(['person', 'animal', 'vehicle', 'unknown']);

/**
 * Height bands in metres. Overlaps are intentional: the score falls off inside
 * them rather than snapping between labels.
 */
const HEIGHT = Object.freeze({
  person: [1.25, 2.15],
  animal: [0.15, 1.35],
  vehicle: [1.2, 4.2],
});

/**
 * Score a track against every category.
 *
 * @param {object} evidence What is known about the track.
 * @param {number|null} evidence.heightM Estimated standing height.
 * @param {number} evidence.aspect Bounding-box height over width.
 * @param {number} evidence.fill Filled fraction of the bounding box.
 * @param {number} evidence.speedMps Smoothed ground speed.
 * @param {number} evidence.peakSpeedMps Fastest smoothed speed seen.
 * @param {{stepsPerMin: number, confident: boolean}|null} [evidence.cadence]
 *   Gait estimate, when one is available.
 * @returns {{label: string, confidence: number, reasons: string[],
 *   scores: Record<string, number>}} Best label with the evidence for it.
 */
export function classify(evidence) {
  const { heightM = null, aspect = 1, fill = 0.5, speedMps = 0, peakSpeedMps = 0, cadence = null } =
    evidence ?? {};

  const reasons = [];
  const scores = { person: 0, animal: 0, vehicle: 0, unknown: 0.25 };

  if (heightM === null) {
    // Without a calibrated ground plane there is no height, and height is doing
    // most of the work. Say so rather than guessing from pixels.
    return {
      label: 'unknown',
      confidence: 0,
      reasons: ['no ground calibration, so no height in metres'],
      scores,
    };
  }

  scores.person += band(heightM, HEIGHT.person) * 0.45;
  scores.animal += band(heightM, HEIGHT.animal) * 0.4;
  scores.vehicle += band(heightM, HEIGHT.vehicle) * 0.2;
  reasons.push(`${heightM.toFixed(2)} m tall`);

  // Upright and narrow is a person; longer than tall is a quadruped or a car.
  if (aspect >= 1.7) {
    scores.person += 0.3;
    reasons.push(`upright silhouette (${aspect.toFixed(1)}:1)`);
  } else if (aspect <= 0.9) {
    scores.animal += 0.2;
    scores.vehicle += 0.3;
    reasons.push(`wider than tall (${aspect.toFixed(1)}:1)`);
  }

  // A vehicle is a solid rectangle; a body leaves gaps between limbs.
  if (fill > 0.75) {
    scores.vehicle += 0.2;
    reasons.push(`solid outline (${Math.round(fill * 100)}% of its box)`);
  } else if (fill < 0.6) {
    scores.person += 0.08;
    scores.animal += 0.08;
  }

  if (peakSpeedMps > 8) {
    scores.vehicle += 0.4;
    scores.person -= 0.3;
    reasons.push(`reached ${peakSpeedMps.toFixed(1)} m/s, beyond a sprint`);
  } else if (speedMps > 0.4 && speedMps < 2.2) {
    scores.person += 0.1;
    scores.animal += 0.05;
  }

  if (cadence?.confident) {
    const spm = cadence.stepsPerMin;
    if (spm >= 85 && spm <= 145) {
      scores.person += 0.3;
      reasons.push(`${Math.round(spm)} steps a minute, a human walking rhythm`);
    } else if (spm > 145) {
      scores.animal += 0.2;
      reasons.push(`${Math.round(spm)} footfalls a minute, faster than a human walk`);
    }
  } else if (speedMps > 0.5) {
    // Moving with no rhythm at all is what a rolling object looks like.
    scores.vehicle += 0.12;
    reasons.push('no gait rhythm in the motion');
  }

  let label = 'unknown';
  let best = 0;
  for (const key of CLASSES) {
    if (scores[key] > best) {
      best = scores[key];
      label = key;
    }
  }
  const runnerUp = CLASSES.filter((k) => k !== label).reduce((m, k) => Math.max(m, scores[k]), 0);
  // Confidence is the margin over the next-best answer, not the raw score: two
  // categories that both fit are exactly the case an operator should see as
  // uncertain.
  const confidence = best <= 0 ? 0 : Math.max(0, Math.min(1, (best - runnerUp) / Math.max(0.35, best)));
  return { label, confidence, reasons, scores };
}

/**
 * How well a value sits inside a band, falling off toward its edges.
 *
 * @param {number} value Measurement.
 * @param {[number, number]} range Band edges.
 * @returns {number} 1 at the centre, 0 outside.
 */
function band(value, [low, high]) {
  if (value <= low || value >= high) return 0;
  const centre = (low + high) / 2;
  const half = (high - low) / 2;
  return 1 - Math.abs(value - centre) / half;
}

/**
 * A one-line plain-English reading of a classification.
 *
 * @param {{label: string, confidence: number, reasons: string[]}} result
 *   Classification.
 * @returns {string} Sentence naming the label, the certainty and the evidence.
 */
export function describe(result) {
  if (result.label === 'unknown' || result.confidence < 0.15) {
    return `Unclassified — ${result.reasons.join(', ') || 'not enough evidence'}.`;
  }
  const strength = result.confidence > 0.6 ? 'Likely' : result.confidence > 0.3 ? 'Probably' : 'Possibly';
  const noun = { person: 'a person', animal: 'an animal', vehicle: 'a vehicle' }[result.label];
  return `${strength} ${noun} — ${result.reasons.join(', ')}.`;
}
