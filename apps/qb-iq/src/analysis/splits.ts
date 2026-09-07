/**
 * Splits, indices and the situational rule engine.
 *
 * Everything here answers a comparison rather than a level: clean pocket versus
 * pressure, structured versus chaos, first half versus fourth quarter, low load
 * versus high load. Splits are reported with their sample sizes and an effect
 * size, because a nine-point accuracy gap on eleven reps is a rumour and the app
 * should not present it as a finding.
 */

import type { MetricId } from '../domain/metrics';
import type { PlayContext, PlayOutcome, ThrowRecord } from '../domain/types';
import { clamp, cohensD, mean, median, rate, scoreFromRange } from '../lib/stats';
import { aggregate, isChaos, isPressured, isThrow, qualifyingCount, repValues } from './aggregate';

export interface Split {
  metric: MetricId;
  /** Value on the reps matching the predicate. */
  a: number | null;
  /** Value on the reps that do not. */
  b: number | null;
  /** a − b, in the metric's own unit. */
  delta: number | null;
  /** Standardised effect size, null when either side is too small. */
  effect: number | null;
  nA: number;
  nB: number;
  /** True when both sides clear the rep floor and the split is worth reading. */
  reliable: boolean;
}

const MIN_SPLIT_REPS = 12;

export function splitBy(
  records: readonly ThrowRecord[],
  predicate: (r: ThrowRecord) => boolean,
  id: MetricId,
): Split {
  const matching = records.filter(predicate);
  const rest = records.filter((r) => !predicate(r));
  const a = aggregate(matching, id);
  const b = aggregate(rest, id);
  const nA = qualifyingCount(matching, id);
  const nB = qualifyingCount(rest, id);
  return {
    metric: id,
    a,
    b,
    delta: a !== null && b !== null ? a - b : null,
    effect: cohensD(repValues(matching, id), repValues(rest, id)),
    nA,
    nB,
    reliable: nA >= MIN_SPLIT_REPS && nB >= MIN_SPLIT_REPS,
  };
}

export interface ComposureComponent {
  label: string;
  /** The pressured-minus-clean difference, in the component's own unit. */
  delta: number;
  unit: string;
  /** 0–100 contribution after scaling. */
  score: number;
}

export interface Composure {
  score: number;
  components: ComposureComponent[];
  pressuredReps: number;
  cleanReps: number;
  reliable: boolean;
}

/**
 * Composure: how little the athlete changes when a rusher arrives.
 *
 * Four measured pressured-versus-clean deltas, each mapped onto 0–100 across a
 * stated range and then averaged with equal weight. The ranges are the honest
 * part of this index — they are written here, in one place, rather than tuned
 * until the number looked good:
 *
 *   • on-target rate       −30 pp → 0,   0 pp → 100
 *   • decision latency     +180 ms → 0,  0 ms → 100
 *   • release scatter      +2.5 in → 0,  0 in → 100
 *   • loop time            +700 ms → 0,  0 ms → 100
 *
 * A QB who is exactly as accurate, as quick to decide, as repeatable and as fast
 * around the loop under pressure as he is in a clean pocket scores 100. Nobody
 * scores 100.
 */
export function composure(records: readonly ThrowRecord[]): Composure {
  const pressured = records.filter(isPressured);
  const clean = records.filter((r) => !isPressured(r));

  const onTargetP = aggregate(pressured, 'onTargetRate');
  const onTargetC = aggregate(clean, 'onTargetRate');
  const latencyP = aggregate(pressured, 'decisionLatency');
  const latencyC = aggregate(clean, 'decisionLatency');
  const scatterP = aggregate(pressured, 'releaseConsistency');
  const scatterC = aggregate(clean, 'releaseConsistency');
  const loopP = aggregate(pressured, 'oodaLoop');
  const loopC = aggregate(clean, 'oodaLoop');

  const components: ComposureComponent[] = [];
  const push = (label: string, delta: number | null, unit: string, worst: number, best: number) => {
    if (delta === null || !Number.isFinite(delta)) return;
    components.push({ label, delta, unit, score: scoreFromRange(delta, worst, best) });
  };

  push('On-target rate', diff(onTargetP, onTargetC), 'pp', -30, 0);
  push('Decision latency', diff(latencyP, latencyC), 'ms', 180, 0);
  push('Release scatter', diff(scatterP, scatterC), 'in', 2.5, 0);
  push('Loop time', diff(loopP, loopC), 'ms', 700, 0);

  const score = components.length === 0 ? 0 : (mean(components.map((c) => c.score)) as number);
  return {
    score: Math.round(score),
    components,
    pressuredReps: pressured.length,
    cleanReps: clean.length,
    reliable: pressured.length >= MIN_SPLIT_REPS && clean.length >= MIN_SPLIT_REPS && components.length === 4,
  };
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

export interface LoadBucket {
  load: number;
  reps: number;
  onTargetPct: number | null;
  decisionLatencyMs: number | null;
  epaPerDropback: number | null;
}

/**
 * Completion quality against the number of live variables the call carried.
 * Buckets below the rep floor are returned with their counts and null values so
 * the chart can draw the gap rather than interpolate across it.
 */
export function loadCurve(records: readonly ThrowRecord[]): LoadBucket[] {
  const buckets = new Map<number, ThrowRecord[]>();
  for (const record of records) {
    const load = record.cognition.workingMemoryLoad;
    const list = buckets.get(load) ?? [];
    list.push(record);
    buckets.set(load, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([load, list]) => ({
      load,
      reps: list.length,
      onTargetPct: list.length >= 8 ? aggregate(list, 'onTargetRate') : null,
      decisionLatencyMs: list.length >= 8 ? aggregate(list, 'decisionLatency') : null,
      epaPerDropback: list.length >= 8 ? aggregate(list, 'epaPerDropback') : null,
    }));
}

export interface SituationalJudgement {
  score: number;
  /** Every rule that fired, with its adjustment, so a coach can argue with it. */
  reasons: { rule: string; delta: number }[];
}

/**
 * Situational decision quality for one rep.
 *
 * A transparent rule engine, not a model: each rule is a statement a coordinator
 * would make out loud, and every score can be expanded into the rules that
 * produced it. Rules are written against down, distance, field position, clock
 * and score — the same inputs a quarterback is given.
 */
export function situationalJudgement(context: PlayContext, outcome: PlayOutcome): SituationalJudgement {
  const reasons: { rule: string; delta: number }[] = [];
  let score = 70;
  const add = (rule: string, delta: number) => {
    if (delta === 0) return;
    reasons.push({ rule, delta });
    score += delta;
  };

  const movedChains = outcome.yards >= context.distance;
  const late = context.twoMinute;

  if (outcome.result === 'interception') {
    add('Turnover', context.redZone ? -42 : -34);
    if (context.scoreDifferential > 0) add('Turnover while ahead', -8);
  }
  if (outcome.result === 'touchdown') add('Touchdown', 22);
  if (outcome.result === 'sack') {
    add('Sack taken', context.down >= 3 ? -22 : -14);
    if (late) add('Sack inside two minutes', -12);
  }
  if (outcome.result === 'throwaway') {
    add(context.down >= 4 ? 'Throwaway on fourth down' : 'Ball protected under pressure', context.down >= 4 ? -18 : 9);
  }
  if (outcome.result === 'scramble') add(movedChains ? 'Scramble moved the chains' : 'Scramble short of the sticks', movedChains ? 12 : -4);

  if (context.down >= 3) {
    if ((outcome.result === 'complete' || outcome.result === 'touchdown') && movedChains) add('Converted on money down', 20);
    else if (outcome.result === 'complete' && !movedChains) add('Completion short of the sticks on a money down', -16);
  } else if (outcome.result === 'complete') {
    add(movedChains ? 'Stayed on schedule' : 'Positive but behind schedule', movedChains ? 8 : 2);
  }

  if (late) {
    if (outcome.result === 'complete' && !movedChains && context.distance >= 8) add('Checkdown short in a two-minute drill', -14);
    if (outcome.result === 'complete' && movedChains) add('Chains moved with the clock running', 8);
  }

  if (context.redZone && outcome.result === 'incomplete' && outcome.onTarget === false && context.down <= 2) {
    add('Threw into the field of play rather than to a fade window', -4);
  }
  if (!context.pressure && outcome.result === 'incomplete' && outcome.onTarget) add('On target, clean pocket, not caught', 4);
  if (context.pressure && outcome.onTarget) add('On target with a rusher home', 10);

  return { score: clamp(Math.round(score), 0, 100), reasons };
}

/** Mean situational score across a set of reps. */
export function situationalScore(records: readonly ThrowRecord[]): number | null {
  if (records.length === 0) return null;
  return mean(records.map((r) => situationalJudgement(r.context, r.outcome).score));
}

/** Situational scores split by game state, for the tactical view. */
export function situationalByState(records: readonly ThrowRecord[]): { state: string; score: number | null; reps: number }[] {
  const states: { state: string; test: (r: ThrowRecord) => boolean }[] = [
    { state: 'First quarter', test: (r) => r.context.quarter === 1 },
    { state: 'Third down', test: (r) => r.context.down === 3 },
    { state: 'Two-minute', test: (r) => r.context.twoMinute },
    { state: 'Red zone', test: (r) => r.context.redZone },
    { state: 'Trailing 9+', test: (r) => r.context.scoreDifferential <= -9 },
    { state: 'Under pressure', test: isPressured },
  ];
  return states.map(({ state, test }) => {
    const subset = records.filter(test);
    return { state, score: subset.length >= 10 ? situationalScore(subset) : null, reps: subset.length };
  });
}

/**
 * Late-game drop-off. Fourth-quarter reps against first-half reps on the metrics
 * that actually move with fatigue, which is a much shorter list than the ones
 * people assume move with it.
 */
export function fatigueSplit(records: readonly ThrowRecord[]): Split[] {
  const ids: MetricId[] = ['velocity', 'decisionLatency', 'releaseConsistency', 'oodaLoop', 'leadLegBraking'];
  return ids.map((id) => splitBy(records, (r) => r.context.quarter === 4, id));
}

/** The pressure block: every metric the "under duress" section reports. */
export function pressureSplits(records: readonly ThrowRecord[]): Split[] {
  const ids: MetricId[] = [
    'onTargetRate',
    'timeToRelease',
    'decisionLatency',
    'oodaLoop',
    'releaseConsistency',
    'anticipatoryRate',
    'epaPerDropback',
    'hipShoulderSeparation',
  ];
  return ids.map((id) => splitBy(records, isPressured, id));
}

/** The disorder block: structured pocket versus broken play. */
export function chaosSplits(records: readonly ThrowRecord[]): Split[] {
  const ids: MetricId[] = ['oodaLoop', 'oodaObserve', 'oodaOrient', 'oodaDecide', 'oodaAct', 'onTargetRate', 'sequenceOrder'];
  return ids.map((id) => splitBy(records, isChaos, id));
}

/** Share of reps in a set that produced a first down or a score. */
export function successRate(records: readonly ThrowRecord[]): number | null {
  const share = rate(records, (r) => r.outcome.result === 'touchdown' || r.outcome.yards >= r.context.distance);
  return share === null ? null : share * 100;
}

/** Median of a per-rep metric over the reps that qualify, for tight callouts. */
export function medianOf(records: readonly ThrowRecord[], id: MetricId): number | null {
  return median(repValues(records, id));
}

/** Reps that both cleared the confidence floor and put a ball in the air. */
export function throwsOnly(records: readonly ThrowRecord[]): ThrowRecord[] {
  return records.filter(isThrow);
}
