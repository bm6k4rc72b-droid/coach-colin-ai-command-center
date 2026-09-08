/**
 * The evidence layer.
 *
 * Everything the platform says about a peptide carries a tier, and every tier
 * carries the same meaning everywhere it appears: on a claim, on a study, in a
 * comparison, in a myth report, on a marketing line. This module owns that
 * vocabulary and the arithmetic that turns a bag of studies into a confidence
 * reading, so a claim can never be presented more strongly in one deck than in
 * another.
 *
 * The design rule behind the numbers: a confidence score is a *summary of the
 * evidence base*, never a prediction about a person. It goes up with study
 * design, sample size, independent replication and consistency of direction,
 * and it is capped hard by the best design available. Ten mouse studies never
 * reach the ceiling of one randomised human trial.
 *
 * @module astra/evidence
 */

/**
 * Evidence tiers, strongest first.
 *
 * `weight` drives the confidence arithmetic. `floor` and `ceiling` bound the
 * band a body of evidence topping out at this tier may report: the best design
 * available picks the band, and the quantity, replication and consistency of
 * the studies at that design place you inside it.
 *
 * The floors are set so that one study at a given tier already outranks any
 * quantity of evidence at every weaker tier. That is what makes "ten mouse
 * studies never reach one randomised trial" a property of the arithmetic rather
 * than a slogan — every animal reading is capped at 0.45, and every reading
 * with a randomised human trial in it starts at 0.62.
 */
export const TIERS = [
  {
    id: 'human-rct',
    rank: 1,
    label: 'Human RCT',
    short: 'RCT',
    weight: 1,
    ceiling: 0.96,
    floor: 0.62,
    accent: '#2fe08a',
    definition: 'Randomised controlled trial in humans — participants assigned by chance, with a control group.',
    caveat: 'The strongest routine design. Still ask who was enrolled, for how long, and who paid for it.',
  },
  {
    id: 'human-trial',
    rank: 2,
    label: 'Human trial',
    short: 'Human',
    weight: 0.74,
    ceiling: 0.78,
    floor: 0.46,
    accent: '#5fd8ff',
    definition: 'Non-randomised or open-label human study — a real human sample, weaker controls.',
    caveat: 'Without randomisation and blinding, expectation and selection can produce the whole effect.',
  },
  {
    id: 'human-observational',
    rank: 3,
    label: 'Human observational',
    short: 'Observed',
    weight: 0.5,
    ceiling: 0.62,
    floor: 0.30,
    accent: '#8fb4ff',
    definition: 'Cohort, case-control, registry or case series — nobody assigned anything.',
    caveat: 'Shows association. Confounding is the default explanation until a trial says otherwise.',
  },
  {
    id: 'animal',
    rank: 4,
    label: 'Animal model',
    short: 'Animal',
    weight: 0.3,
    ceiling: 0.45,
    floor: 0.16,
    accent: '#f2b53b',
    definition: 'In vivo work in rodents or other animals.',
    caveat: 'Most animal findings do not survive translation to humans. Dose, route and physiology all differ.',
  },
  {
    id: 'invitro',
    rank: 5,
    label: 'In vitro / cell',
    short: 'In vitro',
    weight: 0.18,
    ceiling: 0.34,
    floor: 0.10,
    accent: '#c08bff',
    definition: 'Cells, tissue or biochemical assay — no organism involved.',
    caveat: 'Concentrations used in a dish are often unreachable in a living body.',
  },
  {
    id: 'mechanistic',
    rank: 6,
    label: 'Mechanistic rationale',
    short: 'Mechanism',
    weight: 0.1,
    ceiling: 0.24,
    floor: 0.06,
    accent: '#ff9d5c',
    definition: 'A plausible pathway argument drawn from related biology, not a result.',
    caveat: 'A mechanism explains how something could work. It is not evidence that it does.',
  },
  {
    id: 'anecdotal',
    rank: 7,
    label: 'Anecdote / marketing',
    short: 'Anecdote',
    weight: 0.03,
    ceiling: 0.12,
    floor: 0.02,
    accent: '#ff5c7a',
    definition: 'Testimonial, forum report, influencer claim or vendor copy.',
    caveat: 'Selection, recall and incentive all point the same way. Treat as a hypothesis at best.',
  },
];

/** Tier lookup by id. */
const TIER_BY_ID = new Map(TIERS.map((tier) => [tier.id, tier]));

/**
 * How far a study is demoted for testing something other than the claim.
 *
 * Design quality and *relevance* are different things, and conflating them is
 * the single most common way an evidence summary flatters a compound. A
 * randomised trial is a randomised trial — but a randomised trial of the
 * full-length parent protein, applied to an eye, for dry eye disease, is not
 * top-tier evidence that an injected fragment repairs a tendon.
 *
 * So each study carries a `relevance` in (0, 1]: 1 means it tested this
 * compound, by this route, for this kind of outcome. Anything less is counted
 * one or two tiers down, and the dossier says so on the study card rather than
 * hiding the adjustment.
 */
export function effectiveTier(study) {
  const base = tier(study.tier);
  const relevance = study.relevance === undefined ? 1 : study.relevance;
  const demotion = relevance >= 0.6 ? 0 : relevance >= 0.35 ? 1 : 2;
  if (!demotion) return { tier: base, demotion, relevance };
  const index = Math.min(TIERS.length - 1, base.rank - 1 + demotion);
  return { tier: TIERS[index], demotion, relevance };
}

/**
 * Why a study was counted below its design, in one sentence.
 *
 * @param {object} study A study record.
 * @returns {string|null} The note, or null when nothing was adjusted.
 */
export function relevanceNote(study) {
  const { tier: effective, demotion } = effectiveTier(study);
  if (!demotion) return null;
  return `Counted as ${effective.label.toLowerCase()} rather than ${tier(study.tier).label.toLowerCase()}: the design is sound, but what it tested is ${demotion > 1 ? 'well removed from' : 'not quite'} the claim it is used to support.`;
}

/**
 * Look a tier up, tolerating an unknown id.
 *
 * @param {string} id Tier identifier.
 * @returns {object} The tier record, or the weakest tier if unknown.
 */
export function tier(id) {
  return TIER_BY_ID.get(id) || TIERS[TIERS.length - 1];
}

/**
 * Confidence bands, used for the meter's word and colour.
 */
export const BANDS = [
  { id: 'established', min: 0.8, label: 'Well established', accent: '#2fe08a', gloss: 'Replicated in randomised human trials.' },
  { id: 'supported', min: 0.6, label: 'Human-supported', accent: '#5fd8ff', gloss: 'Real human data, with gaps worth naming.' },
  { id: 'emerging', min: 0.4, label: 'Emerging', accent: '#8fb4ff', gloss: 'Early human or strong animal signal. Unsettled.' },
  { id: 'preclinical', min: 0.22, label: 'Preclinical only', accent: '#f2b53b', gloss: 'Animal or cell work. Human translation unproven.' },
  { id: 'speculative', min: 0.1, label: 'Speculative', accent: '#ff9d5c', gloss: 'Mechanism or fragmentary data. Do not rely on it.' },
  { id: 'unsupported', min: 0, label: 'Unsupported', accent: '#ff5c7a', gloss: 'No usable evidence behind this claim.' },
];

/**
 * Map a score to its band.
 *
 * @param {number} score Confidence in [0, 1].
 * @returns {object} The band record.
 */
export function band(score) {
  return BANDS.find((entry) => score >= entry.min) || BANDS[BANDS.length - 1];
}

/**
 * Sample-size credit for one study, on a log curve.
 *
 * A trial of 2,000 is not ten times the evidence of a trial of 200, and a
 * study of eight people should not be worth the same as one of eighty.
 *
 * @param {number} n Participants or animals.
 * @returns {number} A multiplier in roughly [0.45, 1.2].
 */
export function sampleWeight(n) {
  if (!n || n <= 0) return 0.6;
  return Math.min(1.2, 0.45 + Math.log10(n + 1) * 0.28);
}

/**
 * Score a body of evidence.
 *
 * @param {Array<{ tier: string, n?: number, direction?: 1|0|-1, independent?: boolean }>} studies The evidence base.
 * @returns {{ score: number, band: object, best: object, counts: Record<string, number>,
 *   replication: number, consistency: number, reasons: string[] }} The reading.
 */
export function scoreEvidence(studies) {
  const list = (studies || []).filter(Boolean);
  const counts = {};
  for (const study of list) counts[study.tier] = (counts[study.tier] || 0) + 1;

  if (!list.length) {
    return {
      score: 0,
      band: band(0),
      best: TIERS[TIERS.length - 1],
      counts,
      replication: 0,
      consistency: 0,
      reasons: ['No studies are attached to this claim.'],
    };
  }

  // The band is set by the best *relevant* design, not simply the best design.
  const effective = list.map((study) => ({ study, ...effectiveTier(study) }));
  const best = effective.reduce((acc, item) => (item.tier.rank < acc.rank ? item.tier : acc), effective[0].tier);

  // Saturation: the mass of weighted evidence, flattening rather than
  // accumulating forever, so a wall of papers cannot climb out of its band.
  let mass = 0;
  for (const item of effective) mass += item.tier.weight * sampleWeight(item.study.n) * item.relevance;
  const saturation = 1 - Math.exp(-mass / 1.9);

  // Replication: how many independent groups reached the same tier or better.
  const atBest = effective.filter((item) => item.tier.rank <= best.rank + 1).map((item) => item.study);
  const independent = atBest.filter((study) => study.independent !== false).length;
  const replication = Math.min(1, independent / 3);

  // Consistency: do the results point the same way?
  const directed = list.filter((study) => study.direction !== undefined && study.direction !== 0);
  const positive = directed.filter((study) => study.direction > 0).length;
  const consistency = directed.length
    ? Math.abs(positive * 2 - directed.length) / directed.length
    : 0.5;

  // The band comes from the design; the position inside it comes from the
  // evidence. Nothing can leave its band in either direction.
  const quality = saturation * (0.72 + 0.16 * replication + 0.12 * consistency);
  const raw = best.floor + (best.ceiling - best.floor) * quality;
  const score = Math.min(best.ceiling, Math.max(best.floor, Number(raw.toFixed(3))));

  const reasons = [];
  reasons.push(`Best available design: ${best.label.toLowerCase()}${counts[best.id] > 1 ? ` (${counts[best.id]} studies)` : ''}, which sets a band of ${Math.round(best.floor * 100)}–${Math.round(best.ceiling * 100)}%.`);
  if (score >= best.ceiling - 0.001) reasons.push(`At the ceiling for ${best.label.toLowerCase()} — no stronger design exists here, so more of the same cannot raise it.`);
  if (independent >= 2) reasons.push(`Replicated by ${independent} independent reports at or near that tier.`);
  else reasons.push('Not independently replicated at the top tier.');
  if (directed.length >= 2) {
    reasons.push(consistency > 0.6
      ? 'Results point consistently in one direction.'
      : 'Results conflict — some studies find the effect, others do not.');
  }
  const demoted = effective.filter((item) => item.demotion).length;
  if (demoted) {
    reasons.push(`${demoted} ${demoted === 1 ? 'study was' : 'studies were'} counted below ${demoted === 1 ? 'its' : 'their'} design, because what ${demoted === 1 ? 'it' : 'they'} tested is not what the claim asserts.`);
  }
  const humans = list.filter((study) => tier(study.tier).rank <= 3).length;
  if (!humans) reasons.push('No human data at all. Everything here is animal, cell or mechanism.');

  return { score, band: band(score), best, counts, replication, consistency, reasons };
}

/**
 * A short human sentence for a confidence reading.
 *
 * @param {object} reading The result of {@link scoreEvidence}.
 * @returns {string} One sentence.
 */
export function describe(reading) {
  return `${reading.band.label} — ${Math.round(reading.score * 100)}%. ${reading.band.gloss}`;
}

/**
 * Summarise the tier mix of a study list, strongest tier first.
 *
 * @param {Array<{ tier: string }>} studies Studies.
 * @returns {Array<{ tier: object, count: number }>} Ordered counts.
 */
export function tierMix(studies) {
  const counts = new Map();
  for (const study of studies || []) {
    const id = effectiveTier(study).tier.id;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return TIERS.filter((entry) => counts.has(entry.id)).map((entry) => ({ tier: entry, count: counts.get(entry.id) }));
}
