/**
 * Turning a list of reps into the numbers on screen.
 *
 * Two kinds of metric live in the dictionary and they cannot be averaged the
 * same way. A *per-rep* metric has a value on every qualifying rep and the
 * summary is its central tendency. An *aggregate* metric only exists across a
 * set — a rate, a compliance share, a scatter about a mean — and asking for it
 * on one rep is meaningless. `metricKind` says which is which, and `aggregate`
 * is the only function the views call.
 *
 * Reps that cannot answer a question are excluded, never defaulted: a sack has
 * no release point and no ball flight, so it is absent from release scatter and
 * from velocity, and present in the OODA and outcome views where it belongs.
 */

import type { MetricId } from '../domain/metrics';
import type { ThrowRecord } from '../domain/types';
import { KINETIC_SEGMENTS } from '../domain/types';
import { mean, median, rate, rmsAbout } from '../lib/stats';

export type MetricKind = 'per-rep' | 'aggregate';

/** Reps where the ball actually left the hand — the only ones with mechanics to measure. */
export function isThrow(record: ThrowRecord): boolean {
  return record.release !== null && record.flight !== null;
}

/**
 * Reps that count toward accuracy. A throwaway has a release point and a release
 * time — it belongs in the mechanics views — but it is a deliberate decision not
 * to target a receiver, and charting convention keeps it out of the accuracy
 * denominator. Counting it as an inaccurate throw would score ball protection as
 * a miss.
 */
export function isChartedThrow(record: ThrowRecord): boolean {
  return isThrow(record) && record.outcome.result !== 'throwaway';
}

/** Reps charted as pressured: a rusher inside the pocket within 2.5 s of the snap. */
export function isPressured(record: ThrowRecord): boolean {
  return record.context.pressure;
}

/** Reps thrown off a broken platform — the chaos half of the loop-stability split. */
export function isChaos(record: ThrowRecord): boolean {
  return record.context.pocketState === 'collapsed' || record.context.pocketState === 'off-platform';
}

/**
 * Whether one rep's five segment peaks fired proximal to distal.
 *
 * The order checked is the anatomical chain: pelvis, trunk, shoulder internal
 * rotation, elbow extension, wrist. `toleranceMs` exists because the two distal
 * peaks are genuinely near-simultaneous in high-effort throwing — peak elbow
 * extension velocity can lead peak shoulder internal rotation by a few
 * milliseconds in a perfectly healthy rep — so a distal pair inside the
 * tolerance is scored as compliant rather than as a violation.
 */
export function isSequenced(record: ThrowRecord, toleranceMs = 12): boolean {
  const times = KINETIC_SEGMENTS.map(
    (segment) => record.kinetics.find((k) => k.segment === segment)?.timeToPeakMs ?? Number.NaN,
  );
  for (let i = 1; i < times.length; i += 1) {
    const previous = times[i - 1] as number;
    const current = times[i] as number;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
    if (current < previous - toleranceMs) return false;
  }
  return true;
}

/** The first violated link in the chain, or null when the rep sequenced. */
export function sequenceBreakAt(record: ThrowRecord, toleranceMs = 12): string | null {
  for (let i = 1; i < KINETIC_SEGMENTS.length; i += 1) {
    const previous = record.kinetics.find((k) => k.segment === KINETIC_SEGMENTS[i - 1])?.timeToPeakMs;
    const current = record.kinetics.find((k) => k.segment === KINETIC_SEGMENTS[i])?.timeToPeakMs;
    if (previous === undefined || current === undefined) return 'incomplete solve';
    if (current < previous - toleranceMs) return `${KINETIC_SEGMENTS[i]} before ${KINETIC_SEGMENTS[i - 1]}`;
  }
  return null;
}

/** Mean gap between adjacent segment peaks on one rep, in ms. */
export function transferLagMs(record: ThrowRecord): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < KINETIC_SEGMENTS.length; i += 1) {
    const previous = record.kinetics.find((k) => k.segment === KINETIC_SEGMENTS[i - 1])?.timeToPeakMs;
    const current = record.kinetics.find((k) => k.segment === KINETIC_SEGMENTS[i])?.timeToPeakMs;
    if (previous === undefined || current === undefined) return null;
    gaps.push(current - previous);
  }
  return mean(gaps);
}

/** Per-rep accessors. A null means this rep cannot answer, and it is dropped. */
const PER_REP: Partial<Record<MetricId, (r: ThrowRecord) => number | null>> = {
  timeToRelease: (r) => (r.release ? r.release.timeToReleaseMs / 1000 : null),
  releaseHeight: (r) => r.release?.releaseHeightIn ?? null,
  armSlot: (r) => r.release?.armSlotDeg ?? null,
  velocity: (r) => r.flight?.velocityMph ?? null,
  spinRate: (r) => r.flight?.spinRateRpm ?? null,
  spiralEfficiency: (r) => r.flight?.spiralEfficiencyPct ?? null,
  wobble: (r) => r.flight?.wobbleDeg ?? null,
  shoulderEr: (r) => (isThrow(r) ? r.joints.shoulderExternalRotationDeg : null),
  elbowFlexionRelease: (r) => (isThrow(r) ? r.joints.elbowFlexionAtReleaseDeg : null),
  hipShoulderSeparation: (r) => (isThrow(r) ? r.joints.hipShoulderSeparationDeg : null),
  frontKneeFlexion: (r) => (isThrow(r) ? r.joints.frontKneeFlexionDeg : null),
  trunkTilt: (r) => (isThrow(r) ? r.joints.trunkLateralTiltDeg : null),
  pelvisPeak: (r) => peak(r, 'pelvis'),
  trunkPeak: (r) => peak(r, 'trunk'),
  shoulderIrPeak: (r) => peak(r, 'shoulder-ir'),
  transferLag: (r) => (isThrow(r) ? transferLagMs(r) : null),
  elbowVarus: (r) => (isThrow(r) ? r.symmetry.elbowVarusTorqueNm : null),
  dropTime: (r) => r.footwork.dropTimeMs / 1000,
  baseWidth: (r) => r.footwork.baseWidthIn,
  strideLength: (r) => (isThrow(r) ? r.footwork.strideLengthPctHeight : null),
  coverageIdTime: (r) => r.cognition.coverageIdMs,
  decisionLatency: (r) => r.cognition.decisionLatencyMs,
  progressionSpeed: (r) => r.cognition.perProgressionMs,
  workingMemoryLoad: (r) => r.cognition.workingMemoryLoad,
  gazeDwell: (r) => r.cognition.gazeDwellPrimaryMs,
  oodaLoop: (r) => r.ooda?.loopMs ?? null,
  oodaObserve: (r) => r.ooda?.observeMs ?? null,
  oodaOrient: (r) => r.ooda?.orientMs ?? null,
  oodaDecide: (r) => r.ooda?.decideMs ?? null,
  oodaAct: (r) => r.ooda?.actMs ?? null,
  leadLegBraking: (r) => (isThrow(r) ? r.symmetry.leadLegBrakingForceBw : null),
  trailLegDrive: (r) => (isThrow(r) ? r.symmetry.trailLegDriveForceBw : null),
  pelvisAsymmetry: (r) => {
    if (!isThrow(r)) return null;
    const { throwSidePelvisRotationDeg: a, gloveSidePelvisRotationDeg: b } = r.symmetry;
    const centre = (a + b) / 2;
    return centre <= 0 ? null : ((a - b) / centre) * 100;
  },
  armStress: (r) => {
    const velocity = r.flight?.velocityMph;
    if (!velocity || velocity <= 0 || !isThrow(r)) return null;
    return r.symmetry.elbowVarusTorqueNm / velocity;
  },
  placement: (r) => (isChartedThrow(r) ? r.outcome.placementScore : null),
  epaPerDropback: (r) => r.outcome.epa,
};

function peak(record: ThrowRecord, segment: (typeof KINETIC_SEGMENTS)[number]): number | null {
  return record.kinetics.find((k) => k.segment === segment)?.peakAngularVelocityDegPerSec ?? null;
}

export function metricKind(id: MetricId): MetricKind {
  return PER_REP[id] ? 'per-rep' : 'aggregate';
}

/** The per-rep accessor for a metric, or null for an aggregate-only metric. */
export function repAccessor(id: MetricId): ((r: ThrowRecord) => number | null) | null {
  return PER_REP[id] ?? null;
}

/** Every value a per-rep metric takes over a set of reps, in order, nulls dropped. */
export function repValues(records: readonly ThrowRecord[], id: MetricId): number[] {
  const accessor = PER_REP[id];
  if (!accessor) return [];
  const out: number[] = [];
  for (const record of records) {
    const value = accessor(record);
    if (value !== null && Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * How many reps in a set actually contribute to a metric.
 *
 * For a per-rep metric that is the count of non-null values. For an aggregate
 * metric it is the size of the denominator the metric is computed over, which
 * is not the same as the number of dropbacks: on-target rate excludes
 * throwaways and sacks, release scatter excludes anything with no release
 * point. Reporting a rate as "n = 21" when it was computed on fourteen reps is
 * a small lie that a reader will eventually catch.
 */
export function qualifyingCount(records: readonly ThrowRecord[], id: MetricId): number {
  switch (id) {
    case 'onTargetRate':
    case 'anticipatoryRate':
    case 'placement':
      return records.filter(isChartedThrow).length;
    case 'lookOffRate':
      return records.filter((r) => isChartedThrow(r) && (r.flight?.airYards ?? 0) >= 10).length;
    case 'releaseConsistency':
      return records.filter((r) => r.release !== null).length;
    case 'sequenceOrder':
    case 'loopStability':
      return records.filter(isThrow).length;
    case 'coverageIdAccuracy':
      return records.length;
    default:
      return repValues(records, id).length;
  }
}

/**
 * The one number a set of reps gives for a metric.
 *
 * Per-rep metrics summarise by median rather than mean wherever a single
 * mis-solved rep could move the answer; rates and shares are computed over the
 * reps that qualify for the question being asked, which is not always every rep
 * in the set.
 */
export function aggregate(records: readonly ThrowRecord[], id: MetricId): number | null {
  switch (id) {
    case 'releaseConsistency': {
      const released = records.filter((r) => r.release !== null);
      if (released.length < 4) return null;
      const heights = released.map((r) => (r.release as NonNullable<typeof r.release>).releaseHeightIn);
      const laterals = released.map((r) => (r.release as NonNullable<typeof r.release>).releaseLateralIn);
      const hRms = rmsAbout(heights, mean(heights) as number);
      const lRms = rmsAbout(laterals, mean(laterals) as number);
      if (hRms === null || lRms === null) return null;
      // Radial scatter about the mean release point, both axes together.
      return Math.sqrt(hRms * hRms + lRms * lRms);
    }
    case 'sequenceOrder': {
      const throwsOnly = records.filter(isThrow);
      const share = rate(throwsOnly, (r) => isSequenced(r));
      return share === null ? null : share * 100;
    }
    case 'coverageIdAccuracy': {
      const share = rate(records, (r) => r.cognition.coverageIdCorrect);
      return share === null ? null : share * 100;
    }
    case 'anticipatoryRate': {
      const throwsOnly = records.filter(isChartedThrow);
      const share = rate(throwsOnly, (r) => r.cognition.anticipatory);
      return share === null ? null : share * 100;
    }
    case 'lookOffRate': {
      // Only middle-of-field throws can displace a deep safety, so the rest are
      // not eligible and are excluded from the denominator.
      const eligible = records.filter((r) => isChartedThrow(r) && (r.flight?.airYards ?? 0) >= 10);
      const share = rate(eligible, (r) => r.cognition.safetyLookOff);
      return share === null ? null : share * 100;
    }
    case 'onTargetRate': {
      const throwsOnly = records.filter(isChartedThrow);
      const share = rate(throwsOnly, (r) => r.outcome.onTarget);
      return share === null ? null : share * 100;
    }
    case 'loopStability': {
      const structured = repValues(records.filter((r) => !isChaos(r)), 'oodaLoop');
      const chaos = repValues(records.filter(isChaos), 'oodaLoop');
      const s = median(structured);
      const c = median(chaos);
      if (s === null || c === null || c <= 0) return null;
      // 100% means the loop does not lengthen at all when structure is lost.
      return Math.min(100, (s / c) * 100);
    }
    case 'epaPerDropback':
      return mean(repValues(records, 'epaPerDropback'));
    default: {
      const values = repValues(records, id);
      if (values.length === 0) return null;
      return median(values);
    }
  }
}
