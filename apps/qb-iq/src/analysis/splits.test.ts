import { describe, expect, test } from 'vitest';
import { composure, loadCurve, situationalJudgement, situationalScore, splitBy, successRate } from './splits';
import { rep, reps } from './testFixtures';

describe('splitBy', () => {
  test('reports both sides, the difference and the sample sizes', () => {
    const sample = [
      ...reps(20, (index) => ({ id: `clean${index}`, decisionLatencyMs: 280 })),
      ...reps(20, (index) => ({ id: `press${index}`, pressure: true, decisionLatencyMs: 370 })),
    ];
    const split = splitBy(sample, (record) => record.context.pressure, 'decisionLatency');
    expect(split.a).toBe(370);
    expect(split.b).toBe(280);
    expect(split.delta).toBe(90);
    expect(split.nA).toBe(20);
    expect(split.nB).toBe(20);
    expect(split.reliable).toBe(true);
  });

  test('marks a split unreliable when either side is thin', () => {
    const sample = [
      ...reps(20, (index) => ({ id: `clean${index}` })),
      ...reps(4, (index) => ({ id: `press${index}`, pressure: true })),
    ];
    expect(splitBy(sample, (record) => record.context.pressure, 'decisionLatency').reliable).toBe(false);
  });

  test('an aggregate metric has no per-rep distribution to pool, so it reports no effect size', () => {
    const sample = [
      ...reps(20, (index) => ({ id: `clean${index}`, onTarget: true })),
      ...reps(20, (index) => ({ id: `press${index}`, pressure: true, onTarget: false })),
    ];
    const split = splitBy(sample, (record) => record.context.pressure, 'onTargetRate');
    expect(split.a).toBe(0);
    expect(split.b).toBe(100);
    expect(split.effect).toBeNull();
  });
});

describe('composure', () => {
  const clean = reps(30, (index) => ({
    id: `clean${index}`,
    onTarget: true,
    decisionLatencyMs: 280,
    loopMs: 2500,
    releaseHeightIn: 74.6 + ((index % 3) - 1) * 0.5,
    releaseLateralIn: 14.5 + ((index % 3) - 1) * 0.5,
  }));

  test('a passer unchanged by pressure scores at the top of the index', () => {
    const pressured = reps(30, (index) => ({
      id: `press${index}`,
      pressure: true,
      onTarget: true,
      decisionLatencyMs: 280,
      loopMs: 2500,
      releaseHeightIn: 74.6 + ((index % 3) - 1) * 0.5,
      releaseLateralIn: 14.5 + ((index % 3) - 1) * 0.5,
    }));
    const result = composure([...clean, ...pressured]);
    expect(result.score).toBe(100);
    expect(result.reliable).toBe(true);
    expect(result.components).toHaveLength(4);
  });

  test('degradation on every component drives the score down', () => {
    const pressured = reps(30, (index) => ({
      id: `press${index}`,
      pressure: true,
      onTarget: index % 2 === 0,
      decisionLatencyMs: 460,
      loopMs: 3200,
      releaseHeightIn: 74.6 + ((index % 3) - 1) * 1.6,
      releaseLateralIn: 14.5 + ((index % 3) - 1) * 1.6,
    }));
    const result = composure([...clean, ...pressured]);
    expect(result.score).toBeLessThan(45);
  });

  test('is marked unreliable when either side of the split is thin', () => {
    const result = composure([...clean, ...reps(3, (index) => ({ id: `p${index}`, pressure: true }))]);
    expect(result.reliable).toBe(false);
  });

  test('names each component with its own unit so the index can be taken apart', () => {
    const pressured = reps(20, (index) => ({ id: `press${index}`, pressure: true, decisionLatencyMs: 400 }));
    const labels = composure([...clean, ...pressured]).components.map((component) => component.label);
    expect(labels).toEqual(['On-target rate', 'Decision latency', 'Release scatter', 'Loop time']);
  });
});

describe('loadCurve', () => {
  test('buckets by live-variable count and scores only buckets above the floor', () => {
    const sample = [
      ...reps(12, (index) => ({ id: `low${index}`, workingMemoryLoad: 3, onTarget: true })),
      ...reps(12, (index) => ({ id: `high${index}`, workingMemoryLoad: 6, onTarget: index < 6 })),
      ...reps(3, (index) => ({ id: `rare${index}`, workingMemoryLoad: 7 })),
    ];
    const curve = loadCurve(sample);
    expect(curve.map((bucket) => bucket.load)).toEqual([3, 6, 7]);
    expect(curve[0]?.onTargetPct).toBe(100);
    expect(curve[1]?.onTargetPct).toBe(50);
    // Three reps is not a data point; the bucket is counted but not scored.
    expect(curve[2]?.reps).toBe(3);
    expect(curve[2]?.onTargetPct).toBeNull();
  });
});

describe('situationalJudgement', () => {
  test('a rep with nothing notable scores the base and fires no rule', () => {
    const record = rep({ result: 'incomplete', onTarget: false, pressure: false, yards: 0 });
    const judgement = situationalJudgement(record.context, record.outcome);
    expect(judgement.score).toBe(70);
    expect(judgement.reasons).toEqual([]);
  });

  test('a third-down conversion is rewarded and names the rule', () => {
    const record = rep({ down: 3, distance: 7, yards: 12, result: 'complete' });
    const judgement = situationalJudgement(record.context, record.outcome);
    expect(judgement.score).toBeGreaterThan(85);
    expect(judgement.reasons.map((reason) => reason.rule)).toContain('Converted on money down');
  });

  test('a completion short of the sticks on third down is penalised', () => {
    const record = rep({ down: 3, distance: 9, yards: 4, result: 'complete' });
    const judgement = situationalJudgement(record.context, record.outcome);
    expect(judgement.reasons.map((reason) => reason.rule)).toContain('Completion short of the sticks on a money down');
    expect(judgement.score).toBeLessThan(70);
  });

  test('a red-zone turnover is the heaviest penalty in the engine', () => {
    const record = rep({ result: 'interception', redZone: true, yardsToGoal: 12, yards: 0 });
    expect(situationalJudgement(record.context, record.outcome).score).toBeLessThan(35);
  });

  test('a throwaway under pressure is credited as ball protection, but not on fourth down', () => {
    const early = rep({ result: 'throwaway', down: 2, pressure: true, yards: 0, onTarget: false });
    const fourth = rep({ result: 'throwaway', down: 4, pressure: true, yards: 0, onTarget: false });
    const earlyRules = situationalJudgement(early.context, early.outcome).reasons.map((reason) => reason.rule);
    const fourthRules = situationalJudgement(fourth.context, fourth.outcome).reasons.map((reason) => reason.rule);
    expect(earlyRules).toContain('Ball protected under pressure');
    expect(fourthRules).toContain('Throwaway on fourth down');
  });

  test('a checkdown short of the sticks in a two-minute drill is penalised', () => {
    const record = rep({ twoMinute: true, quarter: 4, distance: 12, yards: 4, result: 'complete' });
    expect(
      situationalJudgement(record.context, record.outcome).reasons.map((reason) => reason.rule),
    ).toContain('Checkdown short in a two-minute drill');
  });

  test('every score is bounded to 0–100 however many rules fire', () => {
    const worst = rep({ result: 'interception', redZone: true, twoMinute: true, down: 4, scoreDifferential: 10 });
    const best = rep({ result: 'touchdown', down: 3, distance: 5, yards: 40, pressure: true });
    expect(situationalJudgement(worst.context, worst.outcome).score).toBeGreaterThanOrEqual(0);
    expect(situationalJudgement(best.context, best.outcome).score).toBeLessThanOrEqual(100);
  });

  test('every adjustment is reported, so a score can be reconstructed from its rules', () => {
    const record = rep({ down: 3, distance: 7, yards: 12, result: 'complete', pressure: true });
    const judgement = situationalJudgement(record.context, record.outcome);
    const rebuilt = judgement.reasons.reduce((total, reason) => total + reason.delta, 70);
    expect(Math.min(100, Math.max(0, rebuilt))).toBe(judgement.score);
  });
});

describe('season-level scores', () => {
  test('situationalScore averages the reps in view', () => {
    expect(situationalScore([])).toBeNull();
    expect(situationalScore(reps(4))).toBeGreaterThan(0);
  });

  test('success rate counts first downs and scores', () => {
    const sample = [
      ...reps(3, (index) => ({ id: `hit${index}`, distance: 10, yards: 14 })),
      ...reps(1, (index) => ({ id: `miss${index}`, distance: 10, yards: 3 })),
    ];
    expect(successRate(sample)).toBe(75);
  });
});
