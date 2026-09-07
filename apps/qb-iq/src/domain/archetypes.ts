/**
 * Archetype composites.
 *
 * Comparison against a named professional is both a licensing problem and a bad
 * idea analytically — one passer's numbers are a sample of one, measured on a
 * rig you do not control. What is useful is a *composite*: a pooled, de-identified
 * profile of passers who solve the position the same way, which gives an
 * athlete a direction to move in without pretending anyone should become a
 * specific person.
 *
 * The four here are the recognisable ways the job gets done. Each value is the
 * composite's central figure in the metric's own unit; `spread` is the
 * composite's interquartile half-width, so a comparison can say "inside the
 * band" rather than "above or below the line".
 */

import type { MetricId } from './metrics';
import type { ArchetypeId } from './types';

export interface ArchetypeBand {
  centre: number;
  spread: number;
}

export interface Archetype {
  id: ArchetypeId;
  label: string;
  /** What this composite is built from and what it optimises for. */
  thesis: string;
  /** Pooled sample size behind the composite. */
  pooledFrom: number;
  bands: Partial<Record<MetricId, ArchetypeBand>>;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'rhythm-passer',
    label: 'Rhythm Passer',
    thesis:
      'Wins before the rush arrives. Short observe and orient spans, high anticipation, tight release scatter; accepts a lower ceiling on off-schedule reps in exchange for almost never being late.',
    pooledFrom: 14,
    bands: {
      timeToRelease: { centre: 2.42, spread: 0.11 },
      decisionLatency: { centre: 258, spread: 26 },
      anticipatoryRate: { centre: 44, spread: 5 },
      releaseConsistency: { centre: 1.9, spread: 0.35 },
      oodaLoop: { centre: 2420, spread: 110 },
      loopStability: { centre: 79, spread: 5 },
      onTargetRate: { centre: 79, spread: 3.5 },
      velocity: { centre: 54.5, spread: 2.2 },
      composure: { centre: 71, spread: 6 },
    },
  },
  {
    id: 'creator',
    label: 'Creator',
    thesis:
      'Holds value after the play breaks. Loop time degrades least under disorder and off-platform mechanics stay sequenced; pays for it with a longer average release and more variance in placement.',
    pooledFrom: 11,
    bands: {
      timeToRelease: { centre: 2.86, spread: 0.14 },
      decisionLatency: { centre: 296, spread: 32 },
      anticipatoryRate: { centre: 31, spread: 6 },
      releaseConsistency: { centre: 2.9, spread: 0.45 },
      oodaLoop: { centre: 2860, spread: 140 },
      loopStability: { centre: 91, spread: 4 },
      onTargetRate: { centre: 74, spread: 4 },
      velocity: { centre: 57.5, spread: 2.4 },
      composure: { centre: 84, spread: 5 },
    },
  },
  {
    id: 'field-general',
    label: 'Field General',
    thesis:
      'Wins the pre-snap and the situation. Highest coverage-ID accuracy and situational decision score, best completion rate at high working-memory load; average arm, average loop, very few free losses.',
    pooledFrom: 16,
    bands: {
      timeToRelease: { centre: 2.58, spread: 0.12 },
      decisionLatency: { centre: 272, spread: 24 },
      anticipatoryRate: { centre: 40, spread: 5 },
      coverageIdAccuracy: { centre: 91, spread: 2.5 },
      situationalScore: { centre: 84, spread: 4 },
      oodaLoop: { centre: 2580, spread: 120 },
      loopStability: { centre: 82, spread: 5 },
      onTargetRate: { centre: 77, spread: 3 },
      velocity: { centre: 53.5, spread: 2.0 },
      composure: { centre: 76, spread: 5 },
    },
  },
  {
    id: 'gunslinger',
    label: 'Gunslinger',
    thesis:
      'Sells velocity and window size. Highest ball speed, spin and deep-shot rate; the widest gap between clean and pressured accuracy, and the loop that lengthens most when the picture is disguised.',
    pooledFrom: 9,
    bands: {
      timeToRelease: { centre: 2.74, spread: 0.15 },
      decisionLatency: { centre: 249, spread: 34 },
      anticipatoryRate: { centre: 34, spread: 7 },
      velocity: { centre: 60.5, spread: 2.1 },
      spinRate: { centre: 665, spread: 32 },
      oodaLoop: { centre: 2740, spread: 150 },
      loopStability: { centre: 74, spread: 7 },
      onTargetRate: { centre: 72, spread: 4.5 },
      composure: { centre: 64, spread: 8 },
    },
  },
];

export function archetype(id: ArchetypeId): Archetype {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown archetype: ${id}`);
  return found;
}
