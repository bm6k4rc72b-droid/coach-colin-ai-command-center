/**
 * The Comparison Lab.
 *
 * Put two compounds side by side across the axes that actually decide which
 * one a reader should take seriously: mechanism, who it was studied in, how
 * good that study was, what is unresolved, and what a regulator says about it.
 *
 * The lab has one editorial rule: it never declares a winner on outcomes. It
 * declares which compound has the better *evidence*, which is a different and
 * far more defensible statement — and one that frequently surprises people,
 * because the popular compound usually loses.
 *
 * @module astra/compare
 */

import { PEPTIDES, STACKS, findAny } from './data/peptides.js';
import { tier, tierMix } from './evidence.js';
import { entryReading } from './engine.js';

/** The axes every comparison reports on, in order. */
export const AXES = [
  { id: 'mechanism', label: 'Proposed mechanism' },
  { id: 'population', label: 'Who it was studied in' },
  { id: 'quality', label: 'Evidence quality' },
  { id: 'uncertainty', label: 'Known uncertainties' },
  { id: 'regulatory', label: 'Regulatory status' },
];

/**
 * Everything comparable — compounds and stacks together.
 *
 * @returns {Array<{ id: string, name: string, kind: string }>} Options.
 */
export function comparable() {
  return [
    ...PEPTIDES.map((entry) => ({ id: entry.id, name: entry.name, kind: 'peptide' })),
    ...STACKS.map((entry) => ({ id: entry.id, name: entry.name, kind: 'stack' })),
  ];
}

/**
 * Summarise one side of a comparison.
 *
 * @param {object} entry A peptide or stack record.
 * @returns {object} The column.
 */
function column(entry) {
  const isStack = Boolean(entry.members);
  const studies = isStack
    ? entry.members.flatMap((id) => (findAny(id)?.studies || []))
    : entry.studies;
  // The engine owns the stack rule, so a combination can never out-rank its
  // weakest component here either.
  const reading = entryReading(entry);

  const humanStudies = studies.filter((study) => tier(study.tier).rank <= 3);
  const bestHuman = humanStudies.reduce((acc, study) => (!acc || tier(study.tier).rank < tier(acc.tier).rank ? study : acc), null);

  return {
    entry,
    isStack,
    studies,
    reading,
    mix: tierMix(studies),
    axes: {
      mechanism: isStack
        ? entry.rationale
        : entry.mechanisms.map((mechanism) => `${mechanism.title} (${tier(mechanism.tier).label.toLowerCase()})`).join('; '),
      population: bestHuman
        ? `${bestHuman.population} — n=${bestHuman.n || 'not stated'}, ${bestHuman.design.toLowerCase()}`
        : 'No human study. Animal, cell or mechanism only.',
      quality: `${reading.best.label} at best. ${humanStudies.length} human ${humanStudies.length === 1 ? 'study' : 'studies'}, ${studies.length - humanStudies.length} preclinical.${isStack ? ' No study of the combination exists.' : ''}`,
      uncertainty: (entry.uncertainties || []).slice(0, 3).join(' '),
      regulatory: isStack
        ? 'Governed by the strictest status among its components.'
        : `${entry.regulatory.headline} ${entry.regulatory.sport}`,
    },
  };
}

/**
 * Compare two compounds.
 *
 * @param {string} leftId First compound id.
 * @param {string} rightId Second compound id.
 * @returns {object|null} The comparison, or null if either side is unknown.
 */
export function compare(leftId, rightId) {
  const leftEntry = findAny(leftId);
  const rightEntry = findAny(rightId);
  if (!leftEntry || !rightEntry || leftEntry.id === rightEntry.id) return null;

  const left = column(leftEntry);
  const right = column(rightEntry);
  const gap = left.reading.score - right.reading.score;
  const leader = gap === 0 ? null : (gap > 0 ? left : right);
  const trailer = leader === left ? right : left;

  const shared = leftEntry.systems.filter((system) => rightEntry.systems.includes(system));
  const sharedGoals = (leftEntry.goals || []).filter((goal) => (rightEntry.goals || []).includes(goal));

  return {
    left,
    right,
    axes: AXES.map((axis) => ({ ...axis, left: left.axes[axis.id], right: right.axes[axis.id] })),
    shared,
    sharedGoals,
    verdict: verdict({ leader, trailer, gap, shared }),
  };
}

/**
 * Write the comparison verdict.
 *
 * @param {object} parts Comparison parts.
 * @returns {{ headline: string, body: string, caution: string }} The verdict.
 */
function verdict({ leader, trailer, gap, shared }) {
  if (!leader) {
    return {
      headline: 'Evenly matched on evidence',
      body: 'Both compounds sit at the same confidence level, which usually means both are resting on the same tier of research rather than that both are well supported.',
      caution: 'Equal confidence is not the same as equal usefulness, and neither reading says anything about an individual.',
    };
  }
  const magnitude = Math.abs(gap);
  const strength = magnitude > 0.35 ? 'decisively' : magnitude > 0.15 ? 'clearly' : 'narrowly';
  return {
    headline: `${leader.entry.name} has the ${strength} better evidence base`,
    body: `${leader.entry.name} reaches ${Math.round(leader.reading.score * 100)}% confidence against ${Math.round(trailer.reading.score * 100)}% for ${trailer.entry.name}, and the reason is design rather than enthusiasm: ${leader.reading.best.label.toLowerCase()} versus ${trailer.reading.best.label.toLowerCase()}. ${shared.length ? 'They overlap on body systems, so people do compare them directly — but ' : 'They target different systems, so '}the comparison is about how well each has been tested, not about which works better for anyone.`,
    caution: 'This ranks evidence, not effect. A compound can have excellent evidence for a small effect, or thin evidence for a large one, and nothing here predicts what happens in a given person.',
  };
}

/**
 * Suggest an interesting pairing — used to seed the lab with something worth
 * looking at rather than an empty form.
 *
 * @returns {[string, string]} Two compound ids.
 */
export function suggestedPair() {
  return ['bpc-157', 'semaglutide'];
}
