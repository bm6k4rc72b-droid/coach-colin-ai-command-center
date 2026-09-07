import { describe, expect, test } from 'vitest';
import {
  aggregate,
  isChaos,
  isChartedThrow,
  isPressured,
  isSequenced,
  isThrow,
  qualifyingCount,
  repValues,
  sequenceBreakAt,
  transferLagMs,
} from './aggregate';
import { rep, reps } from './testFixtures';

describe('rep classification', () => {
  test('a completion is a throw and counts toward accuracy', () => {
    const record = rep();
    expect(isThrow(record)).toBe(true);
    expect(isChartedThrow(record)).toBe(true);
  });

  test('a sack has no release and is not a throw', () => {
    const record = rep({ result: 'sack' });
    expect(record.release).toBeNull();
    expect(record.ooda).toBeNull();
    expect(isThrow(record)).toBe(false);
  });

  test('a throwaway has mechanics but is kept out of the accuracy denominator', () => {
    const record = rep({ result: 'throwaway', onTarget: false });
    expect(isThrow(record)).toBe(true);
    expect(isChartedThrow(record)).toBe(false);
  });

  test('pressure and disorder are separate questions', () => {
    expect(isPressured(rep({ pressure: true, pocketState: 'muddied' }))).toBe(true);
    expect(isChaos(rep({ pressure: true, pocketState: 'muddied' }))).toBe(false);
    expect(isChaos(rep({ pressure: true, pocketState: 'collapsed' }))).toBe(true);
    expect(isChaos(rep({ pressure: true, pocketState: 'off-platform' }))).toBe(true);
  });
});

describe('kinetic sequencing', () => {
  test('a proximal-to-distal rep is compliant', () => {
    expect(isSequenced(rep())).toBe(true);
    expect(sequenceBreakAt(rep())).toBeNull();
  });

  test('a pelvis that fires after the trunk is a violation, and is named', () => {
    const record = rep({ timings: { pelvis: 90, trunk: 40 } });
    expect(isSequenced(record)).toBe(false);
    expect(sequenceBreakAt(record)).toBe('trunk before pelvis');
  });

  test('near-simultaneous distal peaks inside the tolerance are compliant, not violations', () => {
    // Peak elbow extension leading peak shoulder internal rotation by 8 ms is
    // ordinary in a healthy high-effort throw.
    const record = rep({ timings: { 'shoulder-ir': 125, 'elbow-ext': 117 } });
    expect(isSequenced(record)).toBe(true);
  });

  test('but a distal inversion beyond the tolerance is still caught', () => {
    const record = rep({ timings: { 'shoulder-ir': 140, 'elbow-ext': 100 } });
    expect(isSequenced(record)).toBe(false);
    expect(sequenceBreakAt(record)).toBe('elbow-ext before shoulder-ir');
  });

  test('the tolerance is a parameter, not a constant baked into the rule', () => {
    const record = rep({ timings: { 'shoulder-ir': 125, 'elbow-ext': 117 } });
    expect(isSequenced(record, 0)).toBe(false);
  });

  test('transfer lag is the mean gap between adjacent peaks', () => {
    // Default chain: 30, 74, 117, 129, 144 → gaps 44, 43, 12, 15 → mean 28.5.
    expect(transferLagMs(rep())).toBeCloseTo(28.5, 6);
  });
});

describe('aggregate', () => {
  test('per-rep metrics summarise by median, so one wild rep cannot move them', () => {
    const sample = [...reps(9, { velocityMph: 53 }), rep({ id: 'wild', velocityMph: 300 })];
    expect(aggregate(sample, 'velocity')).toBe(53);
  });

  test('reps that cannot answer are excluded, not defaulted to zero', () => {
    const sample = [...reps(4, { velocityMph: 55 }), rep({ id: 'sack', result: 'sack' })];
    expect(repValues(sample, 'velocity')).toEqual([55, 55, 55, 55]);
    expect(aggregate(sample, 'velocity')).toBe(55);
  });

  test('on-target rate excludes throwaways from the denominator', () => {
    const sample = [
      ...reps(3, { onTarget: true }),
      rep({ id: 'away', result: 'throwaway', onTarget: false }),
    ];
    expect(aggregate(sample, 'onTargetRate')).toBe(100);
    expect(qualifyingCount(sample, 'onTargetRate')).toBe(3);
  });

  test('sequencing compliance is a share of throws, not of dropbacks', () => {
    const sample = [
      ...reps(3),
      rep({ id: 'broken', timings: { pelvis: 200 } }),
      rep({ id: 'sack', result: 'sack' }),
    ];
    expect(aggregate(sample, 'sequenceOrder')).toBe(75);
  });

  test('release scatter is the radial RMS about the athlete’s own mean release point', () => {
    const sample = [
      rep({ id: 'a', releaseHeightIn: 75, releaseLateralIn: 14 }),
      rep({ id: 'b', releaseHeightIn: 73, releaseLateralIn: 14 }),
      rep({ id: 'c', releaseHeightIn: 75, releaseLateralIn: 16 }),
      rep({ id: 'd', releaseHeightIn: 73, releaseLateralIn: 16 }),
    ];
    // Each axis has an RMS of 1 in about its mean; the radial figure is √2.
    expect(aggregate(sample, 'releaseConsistency')).toBeCloseTo(Math.SQRT2, 6);
  });

  test('release scatter withholds an answer below four reps', () => {
    expect(aggregate(reps(3), 'releaseConsistency')).toBeNull();
  });

  test('loop stability is structured over off-structure, capped at 100', () => {
    const sample = [
      ...reps(6, { loopMs: 2500 }),
      ...reps(6, (index) => ({ id: `chaos${index}`, pressure: true, pocketState: 'collapsed', loopMs: 3000 })),
    ];
    expect(aggregate(sample, 'loopStability')).toBeCloseTo((2500 / 3000) * 100, 6);
  });

  test('loop stability cannot exceed 100 even when disorder is somehow faster', () => {
    const sample = [
      ...reps(6, { loopMs: 3000 }),
      ...reps(6, (index) => ({ id: `chaos${index}`, pressure: true, pocketState: 'collapsed', loopMs: 2400 })),
    ];
    expect(aggregate(sample, 'loopStability')).toBe(100);
  });

  test('safety displacement is scored only on throws that could move a deep safety', () => {
    const sample = [
      ...reps(4, { airYards: 15, safetyLookOff: true }),
      ...reps(4, (index) => ({ id: `short${index}`, airYards: 3, safetyLookOff: false })),
    ];
    expect(aggregate(sample, 'lookOffRate')).toBe(100);
    expect(qualifyingCount(sample, 'lookOffRate')).toBe(4);
  });

  test('arm stress is elbow load per unit of ball speed', () => {
    expect(aggregate([rep({ elbowVarusTorqueNm: 60, velocityMph: 50 })], 'armStress')).toBeCloseTo(1.2, 6);
  });

  test('pelvis asymmetry is signed and expressed against the two-side mean', () => {
    // Fixture: 52° throwing side, 48° glove side, mean 50 → +8%.
    expect(aggregate([rep()], 'pelvisAsymmetry')).toBeCloseTo(8, 6);
  });

  test('EPA averages every dropback, sacks included', () => {
    const sample = [...reps(3), rep({ id: 'sack', result: 'sack' })];
    expect(qualifyingCount(sample, 'epaPerDropback')).toBe(4);
  });

  test('an empty set answers null, never zero', () => {
    for (const id of ['velocity', 'onTargetRate', 'sequenceOrder', 'loopStability', 'releaseConsistency'] as const) {
      expect(aggregate([], id)).toBeNull();
    }
  });
});
