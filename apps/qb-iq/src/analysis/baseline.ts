/**
 * The athlete's own normal, and what counts as a departure from it.
 *
 * There is no population table in this file, deliberately. A quarterback whose
 * lead leg has always braked at 1.85 ×BW is not injured because a textbook says
 * 2.1, and one who has always thrown from a 52° slot has not "lost his arm slot"
 * because the average professional throws from 58°. Every flag in QB IQ is a
 * departure from the *same athlete's* earlier reps, scored with a median and a
 * median absolute deviation so that a handful of off-platform throws or a
 * mis-solved rep cannot quietly redefine the baseline they are being judged
 * against.
 *
 * Three things a flag has to survive before it is shown: enough reps in the
 * baseline window to have a spread at all, enough reps in the recent window to
 * be more than noise, and a robust z beyond the threshold in the direction that
 * is actually bad for that metric.
 */

import { metric, type MetricId } from '../domain/metrics';
import type { ThrowRecord } from '../domain/types';
import { mad, median, robustZ } from '../lib/stats';
import { repValues } from './aggregate';

export interface BaselineStat {
  metric: MetricId;
  median: number;
  /** Scaled median absolute deviation. Null when the window has no usable spread. */
  mad: number | null;
  n: number;
}

/** Minimum reps in the reference window before a metric can have a baseline at all. */
export const MIN_BASELINE_REPS = 40;
/** Minimum reps in the recent window before it is compared against one. */
export const MIN_RECENT_REPS = 15;

export function buildBaseline(records: readonly ThrowRecord[], ids: readonly MetricId[]): Map<MetricId, BaselineStat> {
  const out = new Map<MetricId, BaselineStat>();
  for (const id of ids) {
    const values = repValues(records, id);
    const med = median(values);
    if (med === null || values.length < MIN_BASELINE_REPS) continue;
    out.set(id, { metric: id, median: med, mad: mad(values), n: values.length });
  }
  return out;
}

export type FlagSeverity = 'watch' | 'elevated' | 'high';

export interface RiskFlag {
  metric: MetricId;
  severity: FlagSeverity;
  /** Robust z of the recent window's median against the baseline distribution. */
  z: number;
  recentMedian: number;
  baselineMedian: number;
  recentN: number;
  baselineN: number;
  /** Plain statement of what changed and what it usually means. */
  note: string;
}

/** Metrics the risk engine watches. Each is something a departure would matter for. */
export const MONITORED: readonly MetricId[] = [
  'leadLegBraking',
  'trailLegDrive',
  'pelvisAsymmetry',
  'armStress',
  'elbowVarus',
  'shoulderEr',
  'trunkTilt',
  'armSlot',
  'releaseHeight',
  'strideLength',
  'velocity',
];

const NOTES: Partial<Record<MetricId, { rise: string; fall: string }>> = {
  leadLegBraking: {
    rise: 'the front leg is blocking harder than usual — check whether velocity rose with it',
    fall: 'the front leg has stopped braking as hard; the energy it is not absorbing has to be produced somewhere else, usually the arm',
  },
  armStress: {
    rise: 'more elbow load per mile per hour of ball speed — the same throw is costing more arm than it used to',
    fall: 'less elbow load per unit of ball speed, which is the direction mechanical work is supposed to move',
  },
  elbowVarus: {
    rise: 'medial elbow load above this athlete’s established range; read it beside velocity before acting',
    fall: 'medial elbow load below the established range, usually a drop in throw effort rather than a mechanical gain',
  },
  trunkTilt: {
    rise: 'the trunk is leaning further away from the throw than it has been — the classic way a passer gets over a ball he can no longer get behind',
    fall: 'a more upright trunk at release than usual',
  },
  shoulderEr: {
    rise: 'more lay-back than this athlete’s norm, which raises anterior shoulder exposure',
    fall: 'less lay-back than usual — often the first thing to go when the shoulder is guarding',
  },
  armSlot: {
    rise: 'the slot has climbed above the athlete’s established window',
    fall: 'the slot has dropped below the established window; sustained slot drop is a fatigue or shoulder finding, not a style choice',
  },
  velocity: { rise: 'ball speed above the established range', fall: 'ball speed below the established range' },
  sequenceOrder: {
    rise: 'the chain is sequencing more reliably than the baseline window',
    fall: 'more reps are firing out of proximal-to-distal order, which loads the arm rather than the trunk',
  },
  pelvisAsymmetry: {
    rise: 'the turn has become more one-sided toward the throwing side',
    fall: 'the turn has become more one-sided toward the glove side',
  },
  strideLength: { rise: 'longer stride than the established window', fall: 'shorter stride than the established window' },
  releaseHeight: { rise: 'a higher release point than usual', fall: 'a lower release point than usual — check it against trunk tilt and slot' },
  trailLegDrive: { rise: 'more drive off the back leg than usual', fall: 'less drive off the back leg than usual' },
};

function severityFor(absZ: number): FlagSeverity | null {
  if (absZ >= 3.5) return 'high';
  if (absZ >= 2.5) return 'elevated';
  if (absZ >= 1.8) return 'watch';
  return null;
}

/**
 * Compare a recent window against a baseline window and return what moved.
 *
 * The direction test uses the metric's own `better`: a rise in velocity is not a
 * flag, a rise in arm stress is, and for a banded metric either direction counts
 * because the band is the target.
 */
export function detectFlags(
  recent: readonly ThrowRecord[],
  baselineWindow: readonly ThrowRecord[],
  ids: readonly MetricId[] = MONITORED,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const id of ids) {
    const baselineValues = repValues(baselineWindow, id);
    const recentValues = repValues(recent, id);
    if (baselineValues.length < MIN_BASELINE_REPS || recentValues.length < MIN_RECENT_REPS) continue;

    const recentMedian = median(recentValues) as number;
    const baselineMedian = median(baselineValues) as number;
    const z = robustZ(recentMedian, baselineValues);
    if (z === null) continue;

    const severity = severityFor(Math.abs(z));
    if (!severity) continue;

    const def = metric(id);
    const rising = z > 0;
    const bad = def.better === 'band' ? true : def.better === 'higher' ? !rising : rising;
    if (!bad) continue;

    const note = NOTES[id]?.[rising ? 'rise' : 'fall'] ?? `${rising ? 'above' : 'below'} the athlete’s established range`;
    flags.push({
      metric: id,
      severity,
      z,
      recentMedian,
      baselineMedian,
      recentN: recentValues.length,
      baselineN: baselineValues.length,
      note,
    });
  }
  return flags.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/**
 * Split a season into a baseline window and a recent window at a week boundary.
 * The default splits the last four game weeks off as "recent", which is roughly
 * the shortest span that clears the rep minimum for a starting quarterback.
 */
export function splitByRecentWeeks(
  records: readonly ThrowRecord[],
  weekOf: (record: ThrowRecord) => number,
  recentWeeks = 4,
): { baseline: ThrowRecord[]; recent: ThrowRecord[]; cutoffWeek: number } {
  const weeks = [...new Set(records.map(weekOf))].sort((a, b) => a - b);
  const cutoffWeek = weeks[Math.max(0, weeks.length - recentWeeks)] ?? 0;
  return {
    baseline: records.filter((r) => weekOf(r) < cutoffWeek),
    recent: records.filter((r) => weekOf(r) >= cutoffWeek),
    cutoffWeek,
  };
}
