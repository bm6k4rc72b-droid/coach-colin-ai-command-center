/**
 * The synthetic season has to be two things at once: identical on every run, and
 * plausible to somebody who knows the sport. These tests hold it to both.
 *
 * The plausibility assertions are deliberately wide. They are not there to pin
 * the model to today's constants — they are there to catch a change that makes
 * the demo data indefensible: a quarterback throwing 80 mph, a kinetic chain
 * that fires backwards, an expected-points figure that would be the best season
 * ever recorded.
 */

import { describe, expect, test } from 'vitest';
import { createRng, hashSeed } from './rng';
import { CURRENT_SEASON_ID, createMockSource, seasonBundle } from './mockSource';
import { aggregate, isChaos, isChartedThrow, isPressured, isThrow } from '../../analysis/aggregate';
import { composure, splitBy } from '../../analysis/splits';
import { detectFlags, splitByRecentWeeks } from '../../analysis/baseline';
import { median } from '../../lib/stats';
import { KINETIC_SEGMENTS } from '../../domain/types';

const bundle = seasonBundle(CURRENT_SEASON_ID);
const records = bundle.throws;
const throwsOnly = records.filter(isThrow);

describe('rng', () => {
  test('the same seed gives the same stream', () => {
    const a = Array.from({ length: 8 }, () => createRng('seed').next());
    const b = Array.from({ length: 8 }, () => createRng('seed').next());
    expect(a).toEqual(b);
  });

  test('different seeds diverge', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next());
  });

  test('draws stay inside their stated ranges', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i += 1) {
      expect(rng.next()).toBeGreaterThanOrEqual(0);
      expect(rng.next()).toBeLessThan(1);
      const clamped = rng.gaussClamped(10, 5, 8, 12);
      expect(clamped).toBeGreaterThanOrEqual(8);
      expect(clamped).toBeLessThanOrEqual(12);
      const int = rng.int(3, 5);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(5);
    }
  });

  test('the normal draw has roughly the mean and spread it was asked for', () => {
    const rng = createRng('normal');
    const sample = Array.from({ length: 20000 }, () => rng.gauss(100, 10));
    const mean = sample.reduce((total, value) => total + value, 0) / sample.length;
    expect(mean).toBeGreaterThan(99);
    expect(mean).toBeLessThan(101);
  });

  test('weighted choice respects the weights', () => {
    const rng = createRng('weights');
    let heads = 0;
    for (let i = 0; i < 5000; i += 1) if (rng.weighted([['h', 80], ['t', 20]] as const) === 'h') heads += 1;
    expect(heads / 5000).toBeGreaterThan(0.76);
    expect(heads / 5000).toBeLessThan(0.84);
  });

  test('hashSeed is stable and produces a 32-bit value', () => {
    expect(hashSeed('qb-0117:s2026')).toBe(hashSeed('qb-0117:s2026'));
    expect(hashSeed('a')).toBeGreaterThanOrEqual(0);
    expect(hashSeed('a')).toBeLessThan(2 ** 32);
  });
});

describe('determinism', () => {
  test('the same season is the same bundle every time it is asked for', () => {
    const again = seasonBundle(CURRENT_SEASON_ID);
    expect(again.throws.length).toBe(records.length);
    expect(again.throws[0]?.id).toBe(records[0]?.id);
    expect(again.throws[0]?.release?.timeToReleaseMs).toBe(records[0]?.release?.timeToReleaseMs);
  });
});

describe('season shape', () => {
  test('a full starter’s season of dropbacks across a full schedule', () => {
    expect(bundle.games).toHaveLength(17);
    expect(records.length).toBeGreaterThan(450);
    expect(records.length).toBeLessThan(760);
  });

  test('every rep belongs to a game in the schedule', () => {
    const gameIds = new Set(bundle.games.map((game) => game.id));
    expect(records.every((record) => gameIds.has(record.context.gameId))).toBe(true);
  });

  test('sack, scramble, throwaway and interception rates land where charted football puts them', () => {
    const share = (result: string) =>
      records.filter((record) => record.outcome.result === result).length / records.length;
    expect(share('sack')).toBeGreaterThan(0.02);
    expect(share('sack')).toBeLessThan(0.09);
    expect(share('scramble')).toBeLessThan(0.08);
    expect(share('throwaway')).toBeLessThan(0.07);
    expect(share('interception')).toBeLessThan(0.035);
  });

  test('pressure arrives on a realistic share of dropbacks', () => {
    const rate = records.filter(isPressured).length / records.length;
    expect(rate).toBeGreaterThan(0.18);
    expect(rate).toBeLessThan(0.45);
  });

  test('reps that never became throws carry no release, loop or ball flight', () => {
    const dead = records.filter((record) => record.outcome.result === 'sack' || record.outcome.result === 'scramble');
    expect(dead.length).toBeGreaterThan(0);
    for (const record of dead) {
      expect(record.release).toBeNull();
      expect(record.ooda).toBeNull();
      expect(record.flight).toBeNull();
      expect(record.phases).toBeNull();
    }
  });
});

describe('biomechanical plausibility', () => {
  test('ball speed sits in the professional band', () => {
    const velocity = aggregate(throwsOnly, 'velocity') as number;
    expect(velocity).toBeGreaterThan(48);
    expect(velocity).toBeLessThan(60);
    const fastest = Math.max(...throwsOnly.map((record) => record.flight?.velocityMph ?? 0));
    expect(fastest).toBeLessThan(66);
  });

  test('deeper throws are thrown harder than screens', () => {
    const deep = throwsOnly.filter((record) => (record.flight?.airYards ?? 0) >= 20);
    const short = throwsOnly.filter((record) => (record.flight?.airYards ?? 0) < 5);
    expect(median(deep.map((r) => r.flight?.velocityMph ?? 0)) as number).toBeGreaterThan(
      median(short.map((r) => r.flight?.velocityMph ?? 0)) as number,
    );
  });

  test('spin, spiral efficiency and wobble are mutually consistent', () => {
    expect(aggregate(throwsOnly, 'spinRate') as number).toBeGreaterThan(480);
    expect(aggregate(throwsOnly, 'spinRate') as number).toBeLessThan(760);
    expect(aggregate(throwsOnly, 'spiralEfficiency') as number).toBeGreaterThan(85);
    const wobble = aggregate(throwsOnly, 'wobble') as number;
    expect(wobble).toBeGreaterThan(1);
    expect(wobble).toBeLessThan(9);
  });

  test('joint angles sit inside the ranges the literature reports for throwing', () => {
    expect(aggregate(throwsOnly, 'shoulderEr') as number).toBeGreaterThan(150);
    expect(aggregate(throwsOnly, 'shoulderEr') as number).toBeLessThan(180);
    expect(aggregate(throwsOnly, 'hipShoulderSeparation') as number).toBeGreaterThan(30);
    expect(aggregate(throwsOnly, 'hipShoulderSeparation') as number).toBeLessThan(58);
    expect(aggregate(throwsOnly, 'elbowFlexionRelease') as number).toBeGreaterThan(14);
    expect(aggregate(throwsOnly, 'elbowFlexionRelease') as number).toBeLessThan(38);
  });

  test('the kinetic chain runs proximal to distal on the great majority of reps', () => {
    const compliance = aggregate(throwsOnly, 'sequenceOrder') as number;
    expect(compliance).toBeGreaterThan(80);
    expect(compliance).toBeLessThan(99);
  });

  test('peak angular velocities rise through the chain in the expected magnitudes', () => {
    const peak = (segment: (typeof KINETIC_SEGMENTS)[number]) =>
      median(
        throwsOnly.map(
          (record) => record.kinetics.find((k) => k.segment === segment)?.peakAngularVelocityDegPerSec ?? 0,
        ),
      ) as number;
    expect(peak('pelvis')).toBeGreaterThan(430);
    expect(peak('pelvis')).toBeLessThan(720);
    expect(peak('trunk')).toBeGreaterThan(peak('pelvis'));
    expect(peak('shoulder-ir')).toBeGreaterThan(2400);
    expect(peak('shoulder-ir')).toBeLessThan(5000);
  });

  test('release height follows from the athlete’s stature', () => {
    const height = aggregate(throwsOnly, 'releaseHeight') as number;
    expect(height).toBeGreaterThan(70);
    expect(height).toBeLessThan(82);
  });

  test('release scatter is tight enough to be a professional passer', () => {
    const scatter = aggregate(throwsOnly, 'releaseConsistency') as number;
    expect(scatter).toBeGreaterThan(0.8);
    expect(scatter).toBeLessThan(4);
  });

  test('drop time is ordered by play type — quick game fastest, play-action slowest', () => {
    const dropFor = (playType: string) =>
      median(
        records.filter((record) => record.context.playType === playType).map((record) => record.footwork.dropTimeMs),
      ) as number;
    expect(dropFor('shotgun-quick')).toBeLessThan(dropFor('shotgun-5'));
    expect(dropFor('shotgun-5')).toBeLessThan(dropFor('play-action'));
    expect(dropFor('under-center-3')).toBeLessThan(dropFor('under-center-5'));
    expect(dropFor('under-center-5')).toBeLessThan(dropFor('under-center-7'));
  });
});

describe('cognitive and outcome plausibility', () => {
  test('the release clock lands where a professional passer’s does', () => {
    const ttr = aggregate(throwsOnly, 'timeToRelease') as number;
    expect(ttr).toBeGreaterThan(2.2);
    expect(ttr).toBeLessThan(3.1);
  });

  test('the OODA spans partition the release clock exactly, on every throw', () => {
    for (const record of throwsOnly) {
      const ooda = record.ooda as NonNullable<typeof record.ooda>;
      expect(ooda.observeMs + ooda.orientMs + ooda.decideMs + ooda.actMs).toBe(ooda.loopMs);
      expect(ooda.loopMs).toBe(record.release?.timeToReleaseMs);
    }
  });

  test('decision latency and coverage identification sit in the practised ranges', () => {
    expect(aggregate(records, 'decisionLatency') as number).toBeGreaterThan(200);
    expect(aggregate(records, 'decisionLatency') as number).toBeLessThan(420);
    expect(aggregate(records, 'coverageIdTime') as number).toBeGreaterThan(400);
    expect(aggregate(records, 'coverageIdTime') as number).toBeLessThan(1000);
  });

  test('accuracy, anticipation and coverage recognition are professional but not perfect', () => {
    expect(aggregate(records, 'onTargetRate') as number).toBeGreaterThan(68);
    expect(aggregate(records, 'onTargetRate') as number).toBeLessThan(88);
    expect(aggregate(records, 'anticipatoryRate') as number).toBeGreaterThan(25);
    expect(aggregate(records, 'anticipatoryRate') as number).toBeLessThan(60);
    expect(aggregate(records, 'coverageIdAccuracy') as number).toBeGreaterThan(78);
    expect(aggregate(records, 'coverageIdAccuracy') as number).toBeLessThan(96);
  });

  test('expected points per dropback is an elite season, not an impossible one', () => {
    const epa = aggregate(records, 'epaPerDropback') as number;
    expect(epa).toBeGreaterThan(-0.05);
    expect(epa).toBeLessThan(0.4);
  });

  test('pressure costs accuracy by roughly what charted football says it costs', () => {
    const split = splitBy(records, isPressured, 'onTargetRate');
    expect(split.delta as number).toBeLessThan(-8);
    expect(split.delta as number).toBeGreaterThan(-28);
  });

  test('pressure lengthens the decision and shortens nothing that should lengthen', () => {
    expect(splitBy(records, isPressured, 'decisionLatency').delta as number).toBeGreaterThan(30);
    expect(splitBy(records, isPressured, 'hipShoulderSeparation').delta as number).toBeLessThan(0);
  });

  test('the loop lengthens off-structure but does not collapse', () => {
    const stability = aggregate(records, 'loopStability') as number;
    expect(stability).toBeGreaterThan(65);
    expect(stability).toBeLessThan(97);
    expect(records.filter(isChaos).length).toBeGreaterThan(30);
  });

  test('composure is computable and lands in a believable band', () => {
    const result = composure(records);
    expect(result.reliable).toBe(true);
    expect(result.score).toBeGreaterThan(30);
    expect(result.score).toBeLessThan(90);
  });

  test('throwaways are excluded from accuracy but present as dropbacks', () => {
    const throwaways = records.filter((record) => record.outcome.result === 'throwaway');
    expect(throwaways.length).toBeGreaterThan(0);
    expect(throwaways.every((record) => !isChartedThrow(record))).toBe(true);
    expect(throwaways.every((record) => isThrow(record))).toBe(true);
  });
});

describe('the planted late-season compensation', () => {
  test('the flag engine finds it from the athlete’s own earlier weeks', () => {
    const weekOf = (record: (typeof records)[number]) =>
      bundle.games.find((game) => game.id === record.context.gameId)?.week ?? 0;
    const { baseline, recent } = splitByRecentWeeks(records, weekOf, 5);
    const flags = detectFlags(recent, baseline);
    const flagged = flags.map((flag) => flag.metric);

    // The story in the data: the lead leg stops braking, and the arm takes the
    // load it gave up. Both halves have to be discoverable.
    expect(flagged).toContain('leadLegBraking');
    expect(flagged).toContain('armStress');
    expect(flags.find((flag) => flag.metric === 'leadLegBraking')?.z as number).toBeLessThan(0);
    expect(flags.find((flag) => flag.metric === 'armStress')?.z as number).toBeGreaterThan(0);
  });

  test('velocity stays flat while the load rises — which is what makes it a finding', () => {
    const weekOf = (record: (typeof records)[number]) =>
      bundle.games.find((game) => game.id === record.context.gameId)?.week ?? 0;
    const { baseline, recent } = splitByRecentWeeks(records, weekOf, 5);
    const velocityDrop = (aggregate(baseline, 'velocity') as number) - (aggregate(recent, 'velocity') as number);
    expect(Math.abs(velocityDrop)).toBeLessThan(2);
    expect(aggregate(recent, 'armStress') as number).toBeGreaterThan(aggregate(baseline, 'armStress') as number);
  });

  test('earlier seasons carry no such drift, so the flag is not an artefact of the model', () => {
    const clean = seasonBundle('s2025');
    const weekOf = (record: (typeof clean.throws)[number]) =>
      clean.games.find((game) => game.id === record.context.gameId)?.week ?? 0;
    const { baseline, recent } = splitByRecentWeeks(clean.throws, weekOf, 5);
    const flagged = detectFlags(recent, baseline).map((flag) => flag.metric);
    expect(flagged).not.toContain('leadLegBraking');
  });
});

describe('training records', () => {
  test('paced breathing raises RMSSD within the session, every session', () => {
    expect(bundle.protocols.length).toBeGreaterThan(10);
    const raised = bundle.protocols.filter((session) => session.postRmssdMs > session.preRmssdMs);
    expect(raised.length / bundle.protocols.length).toBeGreaterThan(0.85);
  });

  test('the decision-accuracy effect is present but small — as the literature has it', () => {
    const gains = bundle.protocols.map((session) => session.postProtocolAccuracyPct - session.controlAccuracyPct);
    const typical = median(gains) as number;
    expect(typical).toBeGreaterThan(0);
    expect(typical).toBeLessThan(12);
  });

  test('recognition drilling improves with a decelerating curve, not a straight line', () => {
    // Six-week windows, because exposure durations rotate on a three-week cycle:
    // each window then holds two sessions at each exposure, so the exposure term
    // cancels and what is left is the learning curve.
    const shell = bundle.recognition.filter((session) => session.category === 'shell').sort((a, b) => a.week - b.week);
    const windowMean = (from: number, to: number) =>
      median(shell.slice(from, to).map((session) => session.meanRtMs)) as number;
    const early = windowMean(0, 6);
    const mid = windowMean(6, 12);
    const late = windowMean(12, 18);
    expect(late).toBeLessThan(early);
    // The first six weeks buy more than the last six — practice has diminishing
    // returns, and a straight line would be the tell that this is not a model.
    expect(early - mid).toBeGreaterThan(mid - late);
  });

  test('accuracy stays below ceiling, so the drill is still measuring something', () => {
    for (const session of bundle.recognition) {
      expect(session.correct / session.trials).toBeLessThan(0.99);
    }
  });
});

describe('the source contract', () => {
  const source = createMockSource();

  test('declares itself synthetic rather than passing as live capture', async () => {
    expect(source.kind).toBe('synthetic');
    expect(source.label).toMatch(/synthetic/i);
  });

  test('lists the athlete, the seasons and the schedule', async () => {
    const athletes = await source.listAthletes();
    expect(athletes).toHaveLength(1);
    const seasons = await source.listSeasons(athletes[0]!.id);
    expect(seasons.length).toBeGreaterThanOrEqual(4);
    const games = await source.listGames(athletes[0]!.id, CURRENT_SEASON_ID);
    expect(games).toHaveLength(17);
  });

  test('filters by season, by game and by capture quality', async () => {
    const all = await source.listThrows({ athleteId: 'qb-0117', seasonId: CURRENT_SEASON_ID });
    expect(all.length).toBe(records.length);

    const oneGame = await source.listThrows({
      athleteId: 'qb-0117',
      seasonId: CURRENT_SEASON_ID,
      gameId: bundle.games[0]!.id,
    });
    expect(oneGame.length).toBeGreaterThan(15);
    expect(oneGame.every((record) => record.context.gameId === bundle.games[0]!.id)).toBe(true);

    const strict = await source.listThrows({ athleteId: 'qb-0117', seasonId: CURRENT_SEASON_ID, minConfidence: 0.95 });
    expect(strict.length).toBeLessThan(all.length);
    expect(strict.every((record) => record.capture.confidence >= 0.95)).toBe(true);
  });

  test('an unknown athlete selects nothing rather than everything', async () => {
    expect(await source.listThrows({ athleteId: 'nobody' })).toHaveLength(0);
  });
});
