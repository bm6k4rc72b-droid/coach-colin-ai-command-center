/**
 * The Scientific Debate Room and the Study Simulator.
 *
 * The debate room puts four reviewers on the same claim — a research scientist,
 * a clinical evidence reviewer, a sceptical reviewer and a statistics reviewer —
 * and then writes the consensus. Each reviewer reads the same corpus record and
 * disagrees for structural reasons rather than for theatre: the mechanist cares
 * about pathway, the clinician cares about population, the sceptic cares about
 * who funded it and who replicated it, the statistician cares about power and
 * the multiplicity of ways a finding could have arisen by chance.
 *
 * The simulator is the other half of the same lesson. It does not simulate
 * taking anything. It simulates *designing a study*: move the sample size, the
 * blinding, the duration and the prior plausibility, and watch what the same
 * observed result is then worth. Most people have never seen how violently a
 * conclusion moves when only the design changes, and seeing it once is worth
 * more than any amount of being told to distrust headlines.
 *
 * @module astra/reviewers
 */

import { findAny } from './data/peptides.js';
import { scoreEvidence, tier } from './evidence.js';
import { dossier } from './engine.js';

/** The panel. */
export const REVIEWERS = [
  { id: 'scientist', name: 'Research Scientist', accent: '#2fe0c0', focus: 'Mechanism and biological plausibility' },
  { id: 'clinical', name: 'Clinical Evidence Reviewer', accent: '#5fd8ff', focus: 'Population, endpoints and applicability' },
  { id: 'sceptic', name: 'Sceptical Reviewer', accent: '#ff9d5c', focus: 'Replication, funding and publication incentives' },
  { id: 'statistician', name: 'Statistics Reviewer', accent: '#c08bff', focus: 'Power, precision and the chance of a false positive' },
];

/**
 * Convene the panel on a compound.
 *
 * @param {string|object} subject Compound id or record.
 * @returns {object|null} The debate, or null if the subject is unknown.
 */
export function convene(subject) {
  const entry = typeof subject === 'string' ? findAny(subject) : subject;
  if (!entry) return null;
  const report = dossier(entry);
  const studies = entry.members
    ? entry.members.flatMap((id) => findAny(id)?.studies || [])
    : entry.studies;
  const reading = report.reading;

  const humans = studies.filter((study) => tier(study.tier).rank <= 3);
  const independent = studies.filter((study) => study.independent !== false);
  const negatives = studies.filter((study) => study.direction === -1);
  const smallest = studies.filter((study) => study.n).reduce((acc, study) => (!acc || study.n < acc.n ? study : acc), null);
  const largest = studies.filter((study) => study.n).reduce((acc, study) => (!acc || study.n > acc.n ? study : acc), null);

  const opinions = [
    {
      reviewer: REVIEWERS[0],
      position: entry.mechanisms?.length ? 'supportive with reservations' : 'neutral',
      body: entry.mechanisms?.length
        ? `The mechanism is coherent. ${entry.mechanisms[0].title} is a real pathway and the proposed route is not fanciful — but note the tier it was demonstrated at: ${tier(entry.mechanisms[0].tier).label.toLowerCase()}. Plausibility is cheap. Almost every failed drug in history had a beautiful mechanism, and I would rather see one clean human endpoint than four more pathway diagrams.`
        : `There is no characterised mechanism here to defend. A combination rationale is an argument about how components might interact, and interaction is precisely what has not been measured.`,
    },
    {
      reviewer: REVIEWERS[1],
      position: humans.length ? 'qualified' : 'opposed',
      body: humans.length
        ? `The human evidence is ${humans.length === 1 ? 'a single study' : `${humans.length} studies`}: ${humans.map((study) => `${study.population.toLowerCase()}${study.n ? ` (n=${study.n})` : ''}`).join('; ')}. My question is always the same — is the person in front of me in that population? ${humans.some((study) => /healthy/i.test(study.population)) ? 'Some of it is in healthy volunteers, which limits what it says about disease.' : 'These were specific clinical populations, and the marketing addresses a general one.'} Endpoints matter too: ${humans.some((study) => /level|expression|marker|imaging|fat|hormone/i.test(study.finding)) ? 'several of these are surrogate measures rather than outcomes a patient would feel.' : 'these are outcomes patients notice, which is the strongest thing I can say here.'}`
        : `There is no human evidence. I have nothing to review. Everything said about people is extrapolation, and I would decline to counsel a patient on this basis.`,
    },
    {
      reviewer: REVIEWERS[2],
      position: 'opposed',
      body: [
        independent.length < studies.length
          ? `${studies.length - independent.length} of ${studies.length} records come from a non-independent source. That is the single most common way a field convinces itself.`
          : `Independence looks reasonable across the records, which is more than most compounds in this category manage.`,
        negatives.length
          ? `Note the negative findings: ${negatives.length}. That they exist in the corpus is a good sign about the corpus; that marketing never mentions them is the usual sign about marketing.`
          : `There are no negative results here at all. Either nobody has looked, or the ones who looked and found nothing did not publish. Neither is reassuring.`,
        entry.regulatory ? `Regulatory reality: ${entry.regulatory.headline}` : 'Governed by the strictest status among its components.',
      ].join(' '),
    },
    {
      reviewer: REVIEWERS[3],
      position: 'cautious',
      body: [
        smallest ? `The smallest study here is n=${smallest.n}. ${smallest.n < 60 ? `At that size the minimum detectable standardised effect is about ${detectableEffect(smallest.n).toFixed(2)} — anything smaller than that is invisible to the study, so a null result would prove nothing either.` : 'That is a workable sample for a moderate effect.'}` : 'No study here reports a sample size, which makes precision unassessable.',
        largest && largest !== smallest ? `The largest is n=${largest.n}, detectable effect around ${detectableEffect(largest.n).toFixed(2)}.` : '',
        `Given the prior plausibility this field warrants, a single positive result at ${reading.best.label.toLowerCase()} carries a false-positive risk I would put near ${Math.round(falsePositiveRisk({ n: smallest?.n || 40, prior: reading.best.rank <= 2 ? 0.4 : 0.15 }) * 100)}%. Replication is not a formality here; it is the entire question.`,
      ].filter(Boolean).join(' '),
    },
  ];

  return {
    entry,
    reading,
    opinions,
    consensus: consensus({ entry, reading, humans, independent, negatives, studies }),
  };
}

/**
 * Write the panel's consensus.
 *
 * @param {object} parts Debate parts.
 * @returns {{ verdict: string, body: string, agreed: string[], disputed: string[] }} The consensus.
 */
function consensus({ entry, reading, humans, independent, negatives, studies }) {
  const agreed = [
    `The best available design for ${entry.name} is ${reading.best.label.toLowerCase()}, which caps confidence at ${Math.round(reading.best.ceiling * 100)}%.`,
    humans.length ? `${humans.length} human ${humans.length === 1 ? 'study exists' : 'studies exist'} in the corpus.` : 'No human efficacy evidence exists in the corpus.',
    entry.regulatory ? entry.regulatory.headline : 'Regulatory status is governed by the strictest component.',
  ];
  const disputed = [];
  if (entry.mechanisms?.length && !humans.length) disputed.push('Whether a well-characterised mechanism justifies any confidence in the absence of human outcomes. The scientist says a little; the clinician says none.');
  if (independent.length < studies.length) disputed.push('How much weight to place on a literature dominated by one group. The sceptic discounts it heavily; the scientist argues the work is still work.');
  if (negatives.length) disputed.push('Whether the negative findings settle the question or merely limit it to the indication tested.');
  if (!disputed.length) disputed.push('How much of the remaining uncertainty is resolvable by more of the same research rather than by a different design.');

  const verdict = reading.score >= 0.6
    ? `The panel converges: ${entry.name} has a real evidence base, and the argument is about scope rather than existence.`
    : reading.score >= 0.3
      ? `The panel splits: ${entry.name} has a coherent story and insufficient human evidence to settle it. Nobody on this panel would repeat a marketing claim about it.`
      : `The panel agrees on the negative: ${entry.name} does not have the evidence to support the claims made for it, and the disagreement is only about how charitable to be about why.`;

  return {
    verdict,
    body: `Read the disagreements rather than the verdict. Where four reviewers with different priorities reach the same conclusion, that conclusion is robust; where they split, the split names exactly which further study would resolve it. ${reading.reasons[0]}`,
    agreed,
    disputed,
  };
}

/**
 * The minimum standardised effect a two-arm trial can detect.
 *
 * The usual approximation for 80% power at a two-sided alpha of 0.05:
 * `d ≈ 2.8 × √(2 / n_per_arm)`. It is the single most clarifying number in
 * study design, and almost nobody outside statistics has seen it.
 *
 * @param {number} total Total participants across both arms.
 * @returns {number} The minimum detectable standardised effect (Cohen's d).
 */
export function detectableEffect(total) {
  const perArm = Math.max(2, (total || 0) / 2);
  return 2.8 * Math.sqrt(2 / perArm);
}

/**
 * Statistical power for a given effect and sample.
 *
 * Inverts the same approximation, clamped into a sane range.
 *
 * @param {number} total Total participants.
 * @param {number} effect The true standardised effect.
 * @returns {number} Power in [0.05, 0.99].
 */
export function power(total, effect) {
  const detectable = detectableEffect(total);
  if (!effect) return 0.05;
  // Power rises steeply once the true effect exceeds what the study can see.
  const ratio = effect / detectable;
  const value = 1 / (1 + Math.exp(-(ratio - 1) * 3.2));
  return Math.min(0.99, Math.max(0.05, value * 0.95 + 0.05));
}

/**
 * The probability that a positive result is a false positive.
 *
 * `FPR = 1 − PPV`, where `PPV = power × prior / (power × prior + α × (1 − prior))`.
 * This is the number that explains why an underpowered study of an implausible
 * hypothesis is worthless even when it reports p < 0.05.
 *
 * @param {object} options Options.
 * @param {number} options.n Total participants.
 * @param {number} options.prior Prior probability the hypothesis is true.
 * @param {number} [options.effect] True standardised effect if real.
 * @param {number} [options.alpha] Significance threshold.
 * @param {number} [options.bias] Extra false-positive inflation from flexible analysis.
 * @returns {number} The false-positive risk in [0, 1].
 */
export function falsePositiveRisk({ n, prior, effect = 0.4, alpha = 0.05, bias = 0 }) {
  const pow = power(n, effect);
  const effectiveAlpha = Math.min(0.9, alpha + bias);
  const ppv = (pow * prior) / (pow * prior + effectiveAlpha * (1 - prior) || 1e-9);
  return Math.min(1, Math.max(0, 1 - ppv));
}

/** The knobs the simulator exposes. */
export const SIM_CONTROLS = [
  { id: 'n', label: 'Participants', min: 10, max: 4000, step: 10, value: 60, unit: '' },
  { id: 'effect', label: 'True effect if real', min: 0.05, max: 1.2, step: 0.05, value: 0.4, unit: 'd' },
  { id: 'prior', label: 'Prior plausibility', min: 0.02, max: 0.9, step: 0.02, value: 0.2, unit: '' },
  { id: 'blinded', label: 'Blinding', kind: 'toggle', value: true },
  { id: 'randomised', label: 'Randomised', kind: 'toggle', value: true },
  { id: 'preregistered', label: 'Pre-registered analysis', kind: 'toggle', value: false },
  { id: 'weeks', label: 'Duration (weeks)', min: 1, max: 104, step: 1, value: 12, unit: 'w' },
  { id: 'human', label: 'Human participants', kind: 'toggle', value: true },
];

/**
 * Run the study simulator.
 *
 * @param {object} settings The control values.
 * @returns {object} What the design would be worth.
 */
export function simulate(settings) {
  const {
    n = 60, effect = 0.4, prior = 0.2, blinded = true, randomised = true,
    preregistered = false, weeks = 12, human = true,
  } = settings || {};

  // Flexible analysis and missing controls inflate the effective false-positive
  // rate far beyond the nominal alpha. These numbers are illustrative but the
  // direction and rough magnitude are well documented.
  let bias = 0;
  const penalties = [];
  if (!preregistered) { bias += 0.12; penalties.push('No pre-registration: analysis choices made after seeing the data inflate the effective false-positive rate well beyond 5%.'); }
  if (!blinded) { bias += 0.1; penalties.push('No blinding: expectation moves subjective endpoints, and often objective ones through behaviour.'); }
  if (!randomised) { bias += 0.15; penalties.push('No randomisation: the groups differ by more than the exposure, and confounding is unbounded.'); }

  const pow = power(n, effect);
  const fpr = falsePositiveRisk({ n, prior, effect, bias });
  const detectable = detectableEffect(n);

  const designTier = !human ? 'animal' : randomised && blinded ? 'human-rct' : randomised ? 'human-trial' : 'human-observational';
  const reading = scoreEvidence([{ tier: designTier, n, direction: 1, independent: true }]);

  const notes = [...penalties];
  if (effect < detectable) notes.push(`The true effect (${effect.toFixed(2)}) is smaller than this study can detect (${detectable.toFixed(2)}). A null result here would mean nothing, and a positive one would most likely be noise.`);
  if (weeks < 8) notes.push(`${weeks} weeks establishes nothing about persistence, and for most outcomes it is too short for the endpoint to move honestly.`);
  if (!human) notes.push('Animal work. Whatever the design quality, the translation gap is the dominant uncertainty.');
  if (n < 100) notes.push(`n=${n} cannot characterise harms occurring in fewer than roughly 1 in ${Math.round(100 / (n / 100)) || 100} people.`);

  return {
    settings: { n, effect, prior, blinded, randomised, preregistered, weeks, human },
    power: pow,
    detectable,
    falsePositiveRisk: fpr,
    tier: tier(designTier),
    confidence: reading.score,
    notes,
    verdict: simVerdict({ pow, fpr, human, n, effect, detectable }),
  };
}

/**
 * The simulator's one-line reading.
 *
 * @param {object} parts Simulation parts.
 * @returns {{ level: string, text: string }} The verdict.
 */
function simVerdict({ pow, fpr, human, n, effect, detectable }) {
  if (!human) {
    return { level: 'weak', text: 'However well designed, this is an animal study. Its job is to justify a human trial, not to replace one.' };
  }
  if (fpr > 0.5) {
    return { level: 'weak', text: `A positive result from this design is more likely wrong than right — false-positive risk around ${Math.round(fpr * 100)}%. The fix is not a better p-value; it is a larger sample, a pre-registered analysis, or a more plausible hypothesis.` };
  }
  if (pow < 0.5) {
    return { level: 'underpowered', text: `Power of ${Math.round(pow * 100)}%. This study is more likely to miss a real effect than to find it, and any effect it does report will be exaggerated — the winner's curse.` };
  }
  if (effect >= detectable && pow >= 0.8 && fpr < 0.2) {
    return { level: 'strong', text: `A well-powered design: ${Math.round(pow * 100)}% power, false-positive risk around ${Math.round(fpr * 100)}%. A positive result here would mean something, and a null result would be informative too.` };
  }
  return { level: 'moderate', text: `Serviceable but not decisive: ${Math.round(pow * 100)}% power and a false-positive risk near ${Math.round(fpr * 100)}%. Worth doing, not worth concluding from alone.` };
}
