import { describe, expect, test } from 'vitest';
import { buildBaseline, detectFlags, MIN_BASELINE_REPS, MIN_RECENT_REPS, splitByRecentWeeks } from './baseline';
import { reps } from './testFixtures';

/** A baseline window with realistic rep-to-rep jitter, so MAD is non-zero. */
function baselineWindow(count: number, centre: number, jitter = 0.08) {
  return reps(count, (index) => ({
    id: `base${index}`,
    // A deterministic saw so the sample has spread without needing a PRNG.
    leadLegBrakingForceBw: centre + ((index % 5) - 2) * jitter,
  }));
}

describe('buildBaseline', () => {
  test('produces a median and a scaled MAD once the window is long enough', () => {
    const stats = buildBaseline(baselineWindow(MIN_BASELINE_REPS, 2.0), ['leadLegBraking']);
    const entry = stats.get('leadLegBraking');
    expect(entry).toBeDefined();
    expect(entry?.median).toBeCloseTo(2.0, 6);
    expect(entry?.mad as number).toBeGreaterThan(0);
    expect(entry?.n).toBe(MIN_BASELINE_REPS);
  });

  test('refuses to establish a baseline from a short window', () => {
    const stats = buildBaseline(baselineWindow(MIN_BASELINE_REPS - 1, 2.0), ['leadLegBraking']);
    expect(stats.has('leadLegBraking')).toBe(false);
  });
});

describe('detectFlags', () => {
  test('flags a lead leg that has stopped braking as hard as this athlete’s own history', () => {
    const baseline = baselineWindow(60, 2.0);
    const recent = reps(20, (index) => ({ id: `recent${index}`, leadLegBrakingForceBw: 1.55 + ((index % 5) - 2) * 0.08 }));
    const flags = detectFlags(recent, baseline, ['leadLegBraking']);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.metric).toBe('leadLegBraking');
    expect(flags[0]?.z).toBeLessThan(0);
    expect(flags[0]?.note).toContain('stopped braking');
  });

  test('does not flag movement in the direction that is good for the metric', () => {
    const baseline = baselineWindow(60, 2.0);
    const stronger = reps(20, (index) => ({ id: `up${index}`, leadLegBrakingForceBw: 2.6 + ((index % 5) - 2) * 0.08 }));
    expect(detectFlags(stronger, baseline, ['leadLegBraking'])).toHaveLength(0);
  });

  test('flags a banded metric in either direction, because the band is the target', () => {
    // Arm slot has a target window rather than a good direction, so a slot that
    // climbs well above the athlete's own range is a finding just as a slot that
    // drops below it is.
    const withSlot = (records: ReturnType<typeof reps>, slot: (index: number) => number) =>
      records.map((record, index) => ({
        ...record,
        release: { ...(record.release as NonNullable<typeof record.release>), armSlotDeg: slot(index) },
      }));

    const baseline = withSlot(reps(60), (index) => 56 + ((index % 5) - 2) * 0.6);
    const higher = withSlot(reps(20), () => 68);
    const lower = withSlot(reps(20), () => 44);

    expect(detectFlags(higher, baseline, ['armSlot'])).toHaveLength(1);
    expect(detectFlags(lower, baseline, ['armSlot'])).toHaveLength(1);
  });

  test('stays silent when the recent window is too short to be more than noise', () => {
    const baseline = baselineWindow(60, 2.0);
    const recent = reps(MIN_RECENT_REPS - 1, (index) => ({ id: `r${index}`, leadLegBrakingForceBw: 1.4 }));
    expect(detectFlags(recent, baseline, ['leadLegBraking'])).toHaveLength(0);
  });

  test('stays silent when the baseline window cannot support a spread', () => {
    const baseline = baselineWindow(MIN_BASELINE_REPS - 1, 2.0);
    const recent = reps(20, (index) => ({ id: `r${index}`, leadLegBrakingForceBw: 1.4 }));
    expect(detectFlags(recent, baseline, ['leadLegBraking'])).toHaveLength(0);
  });

  test('grades severity by how far into the tail the recent window sits', () => {
    const baseline = baselineWindow(60, 2.0);
    const mild = detectFlags(
      reps(20, (index) => ({ id: `m${index}`, leadLegBrakingForceBw: 1.75 + ((index % 5) - 2) * 0.08 })),
      baseline,
      ['leadLegBraking'],
    );
    const severe = detectFlags(
      reps(20, (index) => ({ id: `s${index}`, leadLegBrakingForceBw: 1.2 + ((index % 5) - 2) * 0.08 })),
      baseline,
      ['leadLegBraking'],
    );
    expect(mild[0]?.severity).toBe('watch');
    expect(severe[0]?.severity).toBe('high');
  });

  test('sorts the strongest departure first', () => {
    const baseline = reps(60, (index) => ({
      id: `b${index}`,
      leadLegBrakingForceBw: 2.0 + ((index % 5) - 2) * 0.08,
      elbowVarusTorqueNm: 60 + ((index % 5) - 2) * 3,
    }));
    const recent = reps(20, (index) => ({
      id: `r${index}`,
      leadLegBrakingForceBw: 1.2 + ((index % 5) - 2) * 0.08,
      elbowVarusTorqueNm: 70 + ((index % 5) - 2) * 3,
    }));
    const flags = detectFlags(recent, baseline, ['leadLegBraking', 'elbowVarus']);
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(flags[0]?.z as number)).toBeGreaterThanOrEqual(Math.abs(flags[1]?.z as number));
  });

  test('carries the numbers a reader needs to argue with the flag', () => {
    const baseline = baselineWindow(60, 2.0);
    const recent = reps(20, (index) => ({ id: `r${index}`, leadLegBrakingForceBw: 1.5 + ((index % 5) - 2) * 0.08 }));
    const flag = detectFlags(recent, baseline, ['leadLegBraking'])[0];
    expect(flag?.recentMedian).toBeCloseTo(1.5, 6);
    expect(flag?.baselineMedian).toBeCloseTo(2.0, 6);
    expect(flag?.recentN).toBe(20);
    expect(flag?.baselineN).toBe(60);
  });
});

describe('splitByRecentWeeks', () => {
  const weekOf = (record: { context: { gameId: string } }) => Number(record.context.gameId.slice(1));

  test('splits at the boundary that leaves the requested number of weeks recent', () => {
    const records = [1, 2, 3, 4, 5, 6].flatMap((week) =>
      reps(3, (index) => ({ id: `w${week}-${index}`, gameId: `g${week}` })),
    );
    const { baseline, recent, cutoffWeek } = splitByRecentWeeks(records, weekOf, 2);
    expect(cutoffWeek).toBe(5);
    expect(recent).toHaveLength(6);
    expect(baseline).toHaveLength(12);
  });

  test('asking for more weeks than exist puts everything in the recent window', () => {
    const records = [1, 2].flatMap((week) => reps(2, (index) => ({ id: `w${week}-${index}`, gameId: `g${week}` })));
    const { baseline, recent } = splitByRecentWeeks(records, weekOf, 10);
    expect(baseline).toHaveLength(0);
    expect(recent).toHaveLength(4);
  });
});
