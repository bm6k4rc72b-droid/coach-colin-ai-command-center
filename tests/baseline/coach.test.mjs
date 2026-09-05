/**
 * Baseline statistics and coaching-decision tests.
 *
 * These cover the part of the app that decides something about a person's day,
 * so the cases are chosen to be the ones where getting it wrong matters: an
 * athlete who is ill being told to do intervals, an athlete who is fine being
 * told to rest, and the refusal to score anyone at all before there is a
 * history to score them against.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASELINE_MINIMUM,
  NEUTRAL_POINTS,
  anomalyFlags,
  bandFor,
  buildBaseline,
  readinessScore,
  summarize,
  trendSeries,
  zScore,
} from '../../public/baseline/js/baseline.js';
import {
  TIERS,
  answer,
  chooseTier,
  estimatedMaxHr,
  hardDaysInARow,
  heartRateZones,
  prescribe,
  spokenBriefing,
  zoneLabel,
} from '../../public/baseline/js/coach.js';

const NOW = Date.UTC(2026, 8, 5, 7, 30);
const DAY = 86400000;

/**
 * Build a run of consistent resting scans.
 *
 * @param {object} [spec] Spec.
 * @param {number} [spec.count=10] How many scans.
 * @param {number} [spec.bpm=56] Central resting rate.
 * @param {number} [spec.rmssd=48] Central variability.
 * @param {string} [spec.tier] Prescription recorded against each scan.
 * @returns {Array<object>} Stored session rows.
 */
function history(spec = {}) {
  const { count = 10, bpm = 56, rmssd = 48, tier = 'easy' } = spec;
  const rows = [];
  for (let i = count; i >= 1; i -= 1) {
    rows.push({
      at: NOW - i * DAY,
      kind: 'resting',
      bpm: bpm + (i % 3) - 1,
      rmssd: rmssd + ((i % 5) - 2) * 2,
      breathsPerMin: 13 + (i % 2),
      confidence: 0.82,
      hrvReliable: true,
      readiness: 66,
      tier,
    });
  }
  return rows;
}

/**
 * A reading in the flat shape the scoring code consumes.
 *
 * @param {object} [spec] Overrides.
 * @returns {object} Reading.
 */
function reading(spec = {}) {
  return {
    bpm: 56, rmssd: 48, breathsPerMin: 13, confidence: 0.85, grade: 'good', hrvReliable: true, ...spec,
  };
}

test('a baseline refuses to exist until there is enough of it', () => {
  for (let count = 0; count < BASELINE_MINIMUM; count += 1) {
    const baseline = buildBaseline(history({ count }), { now: NOW });
    assert.equal(baseline.ready, false);
    assert.equal(baseline.needed, BASELINE_MINIMUM - count);
    const score = readinessScore(reading(), baseline, { sleepHours: 8 });
    assert.equal(score.score, null, `scored on ${count} scans`);
    assert.match(score.band.label, /Building/);
  }
  assert.equal(buildBaseline(history({ count: BASELINE_MINIMUM }), { now: NOW }).ready, true);
});

test('the baseline window excludes old scans and non-resting ones', () => {
  const rows = [
    ...history({ count: 6 }),
    { at: NOW - 200 * DAY, kind: 'resting', bpm: 90, rmssd: 10, confidence: 0.9, hrvReliable: true },
    { at: NOW - DAY, kind: 'post-session', bpm: 120, rmssd: 8, confidence: 0.9, hrvReliable: true },
    { at: NOW - DAY, kind: 'breathing', bpm: 52, rmssd: 90, confidence: 0.9, hrvReliable: true },
  ];
  const baseline = buildBaseline(rows, { now: NOW });
  assert.equal(baseline.n, 6, 'only recent resting scans count');
  assert.ok(Math.abs(baseline.restingHr.centre - 56) < 2);
});

test('low-confidence scans are kept out of the baseline', () => {
  const rows = [...history({ count: 5 }),
    { at: NOW - 2 * DAY, kind: 'resting', bpm: 140, rmssd: 3, confidence: 0.1, hrvReliable: false }];
  assert.equal(buildBaseline(rows, { now: NOW }).n, 5);
});

test('summarize floors the spread so a repeated reading cannot explode a z-score', () => {
  const flat = summarize([50, 50, 50, 50]);
  assert.ok(flat.spread > 0);
  assert.ok(Math.abs(zScore(51, flat)) < 2);
  assert.equal(zScore(51, { centre: 0, spread: 0, n: 0 }), 0);
});

test('a typical day scores as ready, not as a warning', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const score = readinessScore(reading(), baseline, {
    sleepHours: 7.5, sleepQuality: 2, soreness: 0, stress: 1,
  });
  assert.ok(score.score >= 62 && score.score <= 85, `an ordinary day scored ${score.score}`);
  assert.equal(bandFor(score.score).id === 'ready' || bandFor(score.score).id === 'primed', true);
  assert.ok(NEUTRAL_POINTS > 50, 'the neutral point is deliberately above the midpoint');
});

test('a bad night with a suppressed heart reads as depleted', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const score = readinessScore(reading({ bpm: 70, rmssd: 20 }), baseline, {
    sleepHours: 4.5, sleepQuality: 0, soreness: 3, stress: 4,
  });
  assert.ok(score.score < 35, `scored ${score.score}`);
  assert.equal(score.band.id, 'depleted');
  assert.equal(score.drivers[0].direction, 'down');
});

test('alcohol is named rather than quietly absorbed', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const sober = readinessScore(reading(), baseline, { sleepHours: 7.5, soreness: 0, stress: 0 });
  const drunk = readinessScore(reading(), baseline, {
    sleepHours: 7.5, soreness: 0, stress: 0, alcoholUnits: 3,
  });
  assert.ok(drunk.score < sober.score);
  assert.ok(drunk.drivers.some((driver) => driver.key === 'alcohol'));
});

test('resting rate carries more weight when variability could not be read', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const withHrv = readinessScore(reading(), baseline, {});
  const withoutHrv = readinessScore(reading({ hrvReliable: false }), baseline, {});
  const hrWeight = (score) => score.drivers.find((driver) => driver.key === 'hr').weight;
  assert.ok(hrWeight(withoutHrv) > hrWeight(withHrv));
  assert.ok(!withoutHrv.drivers.some((driver) => driver.key === 'hrv'));
});

test('a resting rate far above normal is flagged and routed to a clinician, not diagnosed', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const flags = anomalyFlags(reading({ bpm: 72, rmssd: 24 }), baseline, {});
  const flag = flags.find((entry) => entry.id === 'elevated-hr');
  assert.ok(flag, 'an elevated resting rate is flagged');
  assert.equal(flag.severity, 'high');
  assert.match(flag.text, /clinician/);
  for (const entry of flags) {
    assert.doesNotMatch(entry.text, /you have|diagnos|infection|covid/i);
  }
});

test('an ordinary reading raises no flags', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  assert.equal(anomalyFlags(reading(), baseline, {}).length, 0);
});

test('the tier ladder moves in the direction readiness demands', () => {
  const cases = [
    { readiness: 90, planned: 'moderate', expect: 'hard' },
    { readiness: 68, planned: 'hard', expect: 'hard' },
    { readiness: 52, planned: 'hard', expect: 'moderate' },
    { readiness: 38, planned: 'hard', expect: 'easy' },
    { readiness: 20, planned: 'hard', expect: 'restore' },
    { readiness: 20, planned: 'easy', expect: 'restore' },
  ];
  for (const item of cases) {
    const chosen = chooseTier({ ...item, flags: [], hardDaysInARow: 0 });
    assert.equal(chosen.tier, item.expect,
      `readiness ${item.readiness} planning ${item.planned} gave ${chosen.tier}`);
    assert.ok(chosen.reasons.length > 0, 'every choice states its reason');
  }
});

test('without a baseline the athlete keeps their plan, capped at moderate', () => {
  const capped = chooseTier({ readiness: null, planned: 'hard', flags: [], hardDaysInARow: 0 });
  assert.equal(capped.tier, 'moderate');
  const kept = chooseTier({ readiness: null, planned: 'easy', flags: [], hardDaysInARow: 0 });
  assert.equal(kept.tier, 'easy');
});

test('a high-severity flag overrides everything else', () => {
  const chosen = chooseTier({
    readiness: 95,
    planned: 'hard',
    flags: [{ severity: 'high', text: 'x' }],
    hardDaysInARow: 0,
  });
  assert.equal(chosen.tier, 'restore');
});

test('a third consecutive hard day is refused even on a good score', () => {
  const chosen = chooseTier({ readiness: 80, planned: 'hard', flags: [], hardDaysInARow: 2 });
  assert.equal(chosen.tier, 'easy');
  assert.ok(chosen.reasons.some((reason) => /back to back/.test(reason)));
});

test('consecutive hard days are counted from stored sessions', () => {
  const rows = [
    { at: NOW - 0.2 * DAY, tier: 'hard' },
    { at: NOW - 1.2 * DAY, tier: 'moderate' },
    { at: NOW - 2.2 * DAY, tier: 'easy' },
  ];
  assert.equal(hardDaysInARow(rows, NOW), 2);
  assert.equal(hardDaysInARow([{ at: NOW - 1.2 * DAY, tier: 'restore' }], NOW), 0);
  assert.equal(hardDaysInARow([], NOW), 0);
});

test('zones are built from the measured resting rate, not from age alone', () => {
  const fit = heartRateZones({ age: 40, restingHr: 45 });
  const unfit = heartRateZones({ age: 40, restingHr: 70 });
  assert.ok(fit[1].low < unfit[1].low, 'a lower resting rate lowers the reserve-based zones');
  assert.equal(estimatedMaxHr(40), 180);
  assert.ok(fit[4].high <= estimatedMaxHr(40));
  assert.match(zoneLabel(fit, 2), /^Z2 · \d+–\d+ bpm$/);
  const measured = heartRateZones({ age: 40, restingHr: 45, maxHr: 195 });
  assert.ok(measured[4].high > fit[4].high, 'a measured maximum overrides the estimate');
});

test('a prescription names its session, its ceiling and its reasons', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const context = { sleepHours: 8, sleepQuality: 3, soreness: 0, stress: 0, planned: 'moderate' };
  const scan = reading({ bpm: 52, rmssd: 60 });
  const readiness = readinessScore(scan, baseline, context);
  const plan = prescribe({
    reading: scan,
    readiness,
    baseline,
    flags: anomalyFlags(scan, baseline, context),
    context,
    profile: { age: 41, goal: 'endurance' },
    history: history(),
    now: NOW,
  });
  assert.equal(plan.tier, 'hard');
  assert.ok(plan.session.blocks.length >= 3);
  assert.equal(plan.capZone, 5);
  assert.ok(plan.rationale.length >= 2);
  assert.ok(plan.zones.length === 5);
  assert.ok(plan.spoken.includes('Readiness'));
});

test('an unusable scan produces no prescription from data, and says so', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const plan = prescribe({
    reading: { grade: 'unusable', bpm: 0, confidence: 0.1, advice: ['Too dark.'] },
    readiness: { score: null, band: {}, drivers: [] },
    baseline,
    context: { planned: 'hard' },
    profile: { age: 40, goal: 'general' },
    history: [],
    now: NOW,
  });
  assert.equal(plan.readiness, null);
  assert.match(plan.headline, /will not/i);
  assert.ok(plan.cautions.some((caution) => /generic/.test(caution)));
  assert.match(plan.spoken, /not clean enough/);
});

test('every goal and tier yields a real session', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  for (const goal of ['endurance', 'strength', 'fatloss', 'general']) {
    for (const tier of TIERS) {
      const scan = reading();
      const plan = prescribe({
        reading: scan,
        readiness: { score: 66, band: { label: 'Ready', tone: 'good' }, drivers: [] },
        baseline,
        context: { planned: tier },
        profile: { age: 35, goal },
        history: [],
        now: NOW,
      });
      assert.ok(plan.session.title.length > 3, `${goal}/${tier} has no title`);
      assert.ok(plan.session.minutes > 0);
      for (const block of plan.session.blocks) {
        assert.ok(block.label && block.detail, `${goal}/${tier} has an empty block`);
      }
    }
  }
});

test('the spoken briefing stays short and states the ceiling', () => {
  const zones = heartRateZones({ age: 40, restingHr: 55 });
  const spoken = spokenBriefing({
    tier: 'moderate',
    verdict: 'Train, but hold the ceiling',
    session: { title: 'Tempo blocks', minutes: 55 },
    readiness: { score: 66, band: { label: 'Ready' }, drivers: [{ label: 'Variability', value: '48 ms', reference: '46 ms usual' }] },
    reading: { bpm: 55 },
    zones,
    capZone: 3,
    cautions: [],
  });
  assert.match(spoken, /Readiness 66/);
  assert.match(spoken, /Tempo blocks/);
  assert.match(spoken, new RegExp(`${zones[2].high} beats`));
  assert.ok(spoken.length < 320);
});

test('offline answers cover the questions people actually ask', () => {
  const baseline = buildBaseline(history(), { now: NOW });
  const scan = reading();
  const readiness = readinessScore(scan, baseline, { sleepHours: 7 });
  const plan = prescribe({
    reading: scan, readiness, baseline, context: {}, profile: { age: 40, goal: 'general' }, history: [], now: NOW,
  });
  const context = { plan, reading: scan, baseline, readiness };

  assert.equal(answer('why this session?', context).id, 'why');
  assert.equal(answer('can I push harder anyway', context).id, 'harder');
  assert.equal(answer('what are my zones', context).id, 'zones');
  assert.equal(answer('what does my hrv mean', context).id, 'hrv');
  assert.equal(answer('how accurate is this really', context).id, 'accuracy');
  assert.match(answer('', context).text, /Ask me about/);
  assert.match(answer('how accurate is this', context).text, /none of it is a medical measurement/);
});

test('trend series are ordered oldest first and skip unusable rows', () => {
  const rows = [
    { at: NOW, kind: 'resting', bpm: 58 },
    { at: NOW - DAY, kind: 'resting', bpm: 56 },
    { at: NOW - 2 * DAY, kind: 'post-session', bpm: 120 },
    { at: NOW - 3 * DAY, kind: 'resting', bpm: 0 },
  ];
  const series = trendSeries(rows, 'bpm');
  assert.deepEqual(series.map((point) => point.value), [56, 58]);
});
