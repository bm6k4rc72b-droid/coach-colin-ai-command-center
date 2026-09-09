/**
 * The claims made on top of the tracking.
 *
 * These are the numbers that end up on a graphic, so most of what is tested
 * here is not "is the arithmetic right" but "does the app refuse to overclaim".
 * A possession bar that reaches 100% while the ball was visible for six seconds
 * is arithmetically fine and dishonest; the assertions below are written to
 * fail if that ever becomes possible.
 *
 * @module tests/touchline/analysis
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL_RADIUS_M,
  PossessionLedger,
  controlOf,
  longestSpells,
} from '../../public/touchline/js/possession.js';
import {
  CORRIDOR_M,
  offsetFromLane,
  passLane,
  passOptions,
  pressureOn,
} from '../../public/touchline/js/passing.js';
import { controlGrid, spaceAround, teamShape } from '../../public/touchline/js/space.js';
import { definitions, occupancy, playerRow, playerTable, teamTotals } from '../../public/touchline/js/metrics.js';
import { matchReport, distance, duration } from '../../public/touchline/js/report.js';
import { SYSTEM_PROMPT, buildRequest, extractText } from '../../public/touchline/js/llm.js';
import { DIMENSIONS } from './synthetic.mjs';

const squad = [
  { id: 1, x: 40, y: 34, team: 'home' },
  { id: 2, x: 44, y: 30, team: 'away' },
  { id: 3, x: 60, y: 34, team: 'home' },
  { id: 4, x: 20, y: 20, team: 'away' },
];

test('a visible ball at a player’s feet is that player’s', () => {
  const control = controlOf(squad, { visible: true, x: 40.5, y: 34.2, speedMps: 1 });
  assert.equal(control.state, 'held');
  assert.equal(control.team, 'home');
  assert.equal(control.playerId, 1);
  assert.ok(control.distanceM < 1);
});

test('a ball nobody can see belongs to nobody', () => {
  const control = controlOf(squad, { visible: false, x: 40, y: 34, speedMps: 0 });
  assert.equal(control.state, 'unseen');
  assert.equal(control.team, null);
});

test('a ball in flight belongs to nobody, however close a player is', () => {
  const control = controlOf(squad, { visible: true, x: 40.1, y: 34, speedMps: 22 });
  assert.equal(control.state, 'in-flight');
  assert.equal(control.team, null);
});

test('a ball in open space is loose, not the nearest player’s', () => {
  const control = controlOf(squad, { visible: true, x: 80, y: 60, speedMps: 0.5 });
  assert.equal(control.state, 'loose');
  assert.equal(control.team, null);
});

test('two opponents equally close is contested, not a coin flip', () => {
  const pair = [
    { id: 1, x: 40, y: 34, team: 'home' },
    { id: 2, x: 40.4, y: 34, team: 'away' },
  ];
  const control = controlOf(pair, { visible: true, x: 40.2, y: 34, speedMps: 0.4 });
  assert.equal(control.state, 'contested');
  assert.equal(control.team, null);
});

test('a goalkeeper on the ball is not counted as team possession', () => {
  const control = controlOf(
    [{ id: 9, x: 5, y: 34, team: 'other' }],
    { visible: true, x: 5.2, y: 34, speedMps: 0.2 },
  );
  assert.equal(control.state, 'loose');
  assert.equal(control.team, null);
});

test('the control radius is a footballer’s reach, not a postcode', () => {
  assert.ok(CONTROL_RADIUS_M > 1 && CONTROL_RADIUS_M < 4);
});

test('possession never switches on a single frame', () => {
  const ledger = new PossessionLedger();
  for (let i = 0; i < 30; i += 1) {
    ledger.update({ state: 'held', team: 'home', playerId: 1 }, i * 40);
  }
  assert.equal(ledger.holder, 'home');
  // One frame of the other side is noise.
  ledger.update({ state: 'held', team: 'away', playerId: 2 }, 30 * 40);
  assert.equal(ledger.holder, 'home', 'a single frame flipped possession');
  for (let i = 31; i < 60; i += 1) {
    ledger.update({ state: 'held', team: 'away', playerId: 2 }, i * 40);
  }
  assert.equal(ledger.holder, 'away', 'a real turnover never registered');
  assert.equal(ledger.summary().turnovers, 1);
});

test('time the ball was invisible is never shared out between the teams', () => {
  const ledger = new PossessionLedger();
  let t = 0;
  const step = () => {
    t += 40;
    return t;
  };
  for (let i = 0; i < 50; i += 1) ledger.update({ state: 'held', team: 'home', playerId: 1 }, step());
  for (let i = 0; i < 150; i += 1) ledger.update({ state: 'unseen', team: null, playerId: null }, step());
  const summary = ledger.summary();
  assert.ok(summary.homeShare > 0.99, 'the only attributable time was not attributed');
  assert.ok(
    summary.assignedShare < 0.3,
    `the app claimed ${(summary.assignedShare * 100).toFixed(0)}% of the clock was attributed`,
  );
  assert.ok(summary.unassignedMs.unseen > 5000);
  // The headline share and the honesty figure must disagree — that is the point.
  assert.ok(summary.homeShare > summary.assignedShare);
});

test('a session with no ball produces no possession at all', () => {
  const ledger = new PossessionLedger();
  for (let i = 0; i < 100; i += 1) {
    ledger.update({ state: 'unseen', team: null, playerId: null }, i * 40);
  }
  const summary = ledger.summary();
  assert.equal(summary.assignedMs, 0);
  assert.equal(summary.homeShare, 0);
  assert.equal(summary.awayShare, 0);
  assert.equal(summary.assignedShare, 0);
});

test('spells record how long each side actually kept it', () => {
  const spells = [
    { team: 'home', startMs: 0, endMs: 8000 },
    { team: 'away', startMs: 8000, endMs: 11000 },
    { team: 'home', startMs: 11000, endMs: 13000 },
  ];
  const longest = longestSpells(spells);
  assert.equal(longest.home, 8);
  assert.equal(longest.away, 3);
});

test('a point’s distance from a lane is perpendicular, and clamped to the ends', () => {
  const inside = offsetFromLane({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(Math.abs(inside.offsetM - 3) < 1e-9);
  assert.ok(Math.abs(inside.alongM - 5) < 1e-9);
  const beyond = offsetFromLane({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(Math.abs(beyond.offsetM - 10) < 1e-9, 'a point past the receiver was projected onto air');
  assert.equal(beyond.t, 1);
});

test('a defender standing in the lane screens it', () => {
  const lane = passLane(
    { x: 40, y: 34 },
    { x: 60, y: 34 },
    [{ id: 9, x: 50, y: 34.4, vx: 0, vy: 0 }],
  );
  assert.ok(lane.screened);
  assert.ok(Math.abs(lane.clearanceM - 0.4) < 0.01);
  assert.equal(lane.screens.length, 1);
  assert.ok(Math.abs(lane.screens[0].alongM - 10) < 0.01);
  assert.ok(lane.openness < 0.35);
});

test('a lane with nobody near it is clear, and says how clear', () => {
  const lane = passLane(
    { x: 40, y: 34 },
    { x: 60, y: 34 },
    [{ id: 9, x: 50, y: 44, vx: 0, vy: 0 }],
  );
  assert.ok(!lane.screened);
  assert.ok(Math.abs(lane.clearanceM - 10) < 0.01);
  assert.equal(lane.openness, 1);
  assert.equal(lane.screens.length, 0);
});

test('a lane closing at four metres a second is reported as closing', () => {
  const open = passLane({ x: 40, y: 34 }, { x: 60, y: 34 }, [{ id: 9, x: 50, y: 40, vx: 0, vy: -6 }]);
  assert.ok(!open.screened || open.closing);
  assert.ok(open.closing, 'a defender sprinting into the lane was reported as no threat');
  assert.ok(open.clearanceAtArrivalM < open.clearanceM);
  assert.ok(open.flightSeconds > 0.5 && open.flightSeconds < 3);
});

test('openness is an index between nothing and one, never a probability', () => {
  const wide = passLane({ x: 0, y: 34 }, { x: 30, y: 34 }, []);
  assert.equal(wide.openness, 1, 'an empty pitch was not fully open');
  const blocked = passLane({ x: 0, y: 34 }, { x: 30, y: 34 }, [{ id: 1, x: 15, y: 34 }]);
  assert.equal(blocked.openness, 0);
  assert.ok(CORRIDOR_M > 1, 'the corridor a pass needs is wider than a metre');
});

test('pass options are ranked, and forward passes are identified', () => {
  const carrier = { id: 1, x: 40, y: 34 };
  const mates = [
    { id: 2, x: 60, y: 34, label: 'blocked' },
    { id: 3, x: 50, y: 20, label: 'open' },
    { id: 4, x: 30, y: 40, label: 'backwards' },
  ];
  const opponents = [{ id: 9, x: 50, y: 34.2, vx: 0, vy: 0 }];
  const options = passOptions(carrier, mates, opponents, {});
  assert.equal(options.length, 3);
  assert.equal(options[options.length - 1].label, 'blocked', 'the screened lane was not ranked last');
  assert.ok(options.find((o) => o.label === 'open').forward);
  assert.ok(!options.find((o) => o.label === 'backwards').forward);
  for (const option of options) {
    assert.ok(option.receiverSpaceM > 0, 'a receiver had no space measurement');
  }
});

test('a carrier is never offered a pass to themselves', () => {
  const carrier = { id: 1, x: 40, y: 34 };
  const options = passOptions(carrier, [carrier, { id: 2, x: 55, y: 34 }], [], {});
  assert.equal(options.length, 1);
  assert.equal(options[0].id, 2);
});

test('pressure counts opponents and notices one closing', () => {
  const pressure = pressureOn({ x: 40, y: 34 }, [
    { id: 9, x: 42, y: 34, vx: -3, vy: 0 },
    { id: 10, x: 44, y: 34, vx: 0, vy: 0 },
    { id: 11, x: 80, y: 34, vx: 0, vy: 0 },
  ]);
  assert.equal(pressure.within, 2);
  assert.equal(pressure.nearestId, 9);
  assert.ok(Math.abs(pressure.nearestM - 2) < 1e-9);
  assert.ok(pressure.closingMps > 2.5, 'a defender running at the carrier read as holding');
});

test('territory covers the whole pitch and no more of it', () => {
  const grid = controlGrid(squad, { dimensions: DIMENSIONS });
  const total = grid.areas.home + grid.areas.away + grid.areas.other;
  assert.ok(
    Math.abs(total - DIMENSIONS.lengthM * DIMENSIONS.widthM) < 1,
    `territory summed to ${total.toFixed(0)} m² on a ${DIMENSIONS.lengthM * DIMENSIONS.widthM} m² pitch`,
  );
  const shares = grid.shares.home + grid.shares.away + grid.shares.other;
  assert.ok(Math.abs(shares - 1) < 1e-6);
});

test('momentum counts: a player running into space owns more of it', () => {
  const still = controlGrid(
    [
      { id: 1, x: 40, y: 34, vx: 0, vy: 0, team: 'home' },
      { id: 2, x: 60, y: 34, vx: 0, vy: 0, team: 'away' },
    ],
    { dimensions: DIMENSIONS },
  );
  const running = controlGrid(
    [
      { id: 1, x: 40, y: 34, vx: 8, vy: 0, team: 'home' },
      { id: 2, x: 60, y: 34, vx: 0, vy: 0, team: 'away' },
    ],
    { dimensions: DIMENSIONS },
  );
  assert.ok(
    running.shares.home > still.shares.home + 0.02,
    'a player sprinting into space gained no territory',
  );
});

test('local space is measured on the pitch, not over the car park', () => {
  const corner = spaceAround({ x: 1, y: 1 }, squad, { dimensions: DIMENSIONS, radiusM: 20 });
  const middle = spaceAround({ x: 52, y: 34 }, squad, { dimensions: DIMENSIONS, radiusM: 20 });
  assert.ok(corner.samples < middle.samples, 'space off the touchline was counted');
  assert.ok(Math.abs(corner.home + corner.away + corner.other - 1) < 1e-6);
});

test('team shape reports how many players it was computed from', () => {
  const shape = teamShape([
    { x: 30, y: 20, team: 'home' },
    { x: 34, y: 48, team: 'home' },
    { x: 40, y: 34, team: 'home' },
  ]);
  assert.equal(shape.count, 3);
  assert.equal(shape.widthM, 28);
  assert.equal(shape.depthM, 10);
  assert.equal(shape.lineM, 30);
  const empty = teamShape([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.centroid, null, 'a shape was invented for a team with nobody visible');
});

test('a player row carries how much of the session it is based on', () => {
  const track = {
    id: 3,
    label: '#3',
    team: 'home',
    x: 40,
    y: 34,
    distanceM: 900,
    highIntensityM: 200,
    sprints: 4,
    topSpeedMps: 8,
    speedMps: 3,
    firstSeenMs: 0,
    lastSeenMs: 60000,
    path: [
      { t: 0, x: 10, y: 34 },
      { t: 60000, x: 40, y: 34 },
    ],
  };
  const row = playerRow(track, 300000);
  assert.equal(row.coverage, 0.2);
  assert.equal(row.distanceM, 900, 'a partial track was scaled up to a full session');
  assert.ok(Math.abs(row.metresPerMinute - 900) < 1);
  assert.equal(row.displacementM, 30);
});

test('short tracks stay out of the table rather than filling it with fragments', () => {
  const rows = playerTable(
    [
      { id: 1, label: '#1', team: 'home', x: 0, y: 0, distanceM: 10, highIntensityM: 0, sprints: 0, topSpeedMps: 2, speedMps: 0, firstSeenMs: 0, lastSeenMs: 500, path: [] },
      { id: 2, label: '#2', team: 'away', x: 0, y: 0, distanceM: 40, highIntensityM: 0, sprints: 0, topSpeedMps: 3, speedMps: 0, firstSeenMs: 0, lastSeenMs: 20000, path: [] },
    ],
    20000,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, '#2');
});

test('team totals say how many players they are a total of', () => {
  const totals = teamTotals([
    { distanceM: 900, highIntensityM: 100, sprints: 2, topSpeedKph: 28, coverage: 0.5 },
    { distanceM: 700, highIntensityM: 80, sprints: 1, topSpeedKph: 31, coverage: 0.3 },
  ]);
  assert.equal(totals.tracked, 2);
  assert.equal(totals.distanceM, 1600);
  assert.equal(totals.topSpeedKph, 31);
  assert.ok(Math.abs(totals.meanCoverage - 0.4) < 1e-9);
});

test('a heat map counts time, not frames', () => {
  const standing = occupancy(
    [
      { t: 0, x: 10, y: 10 },
      { t: 4000, x: 10, y: 10 },
      { t: 8000, x: 10, y: 10 },
    ],
    { dimensions: DIMENSIONS, cellM: 5 },
  );
  assert.ok(Math.abs(standing.peak - 8) < 1e-6, `peak dwell was ${standing.peak} s, expected 8`);
});

test('the running thresholds are published with the numbers', () => {
  const thresholds = definitions();
  assert.ok(Math.abs(thresholds.sprintKph - 25.2) < 0.1);
  assert.ok(Math.abs(thresholds.highIntensityKph - 19.8) < 0.1);
});

test('the report leads with what could not be seen', () => {
  const ledger = new PossessionLedger();
  let t = 0;
  for (let i = 0; i < 40; i += 1) ledger.update({ state: 'held', team: 'home', playerId: 1 }, (t += 40));
  for (let i = 0; i < 20; i += 1) ledger.update({ state: 'held', team: 'away', playerId: 2 }, (t += 40));
  for (let i = 0; i < 120; i += 1) ledger.update({ state: 'unseen' }, (t += 40));

  const rows = playerTable(
    [
      { id: 1, label: '#1', team: 'home', x: 40, y: 34, distanceM: 1200, highIntensityM: 300, sprints: 3, topSpeedMps: 8.2, speedMps: 4, firstSeenMs: 0, lastSeenMs: 30000, path: [] },
      { id: 2, label: '#2', team: 'away', x: 50, y: 30, distanceM: 800, highIntensityM: 100, sprints: 1, topSpeedMps: 7.1, speedMps: 3, firstSeenMs: 0, lastSeenMs: 20000, path: [] },
    ],
    40000,
  );
  const report = matchReport({
    sessionMs: 40000,
    possession: ledger.summary(),
    ball: { seenShare: 0.31 },
    rows,
    totals: {
      home: teamTotals(rows.filter((r) => r.team === 'home')),
      away: teamTotals(rows.filter((r) => r.team === 'away')),
    },
    teams: { names: { home: 'Team A', away: 'Team B' } },
    calibration: { residualM: 0.18, worstM: 0.4 },
    staleFrames: 7,
  });

  assert.ok(report.caveats.length >= 3);
  assert.match(report.caveats[0], /31%/, 'the ball-visible share was not the first thing said');
  assert.ok(
    report.caveats.some((line) => line.includes('0.18')),
    'the calibration error was not reported',
  );
  assert.ok(report.caveats.some((line) => line.includes('7')), 'stale frames went unmentioned');
  assert.ok(
    report.lines.some((line) => line.includes('attributed')),
    'the possession line did not name its denominator',
  );
  assert.match(report.headline, /attributed/);

  // The digest that a language model would receive must carry the caveats too,
  // or the model becomes the place the honesty is lost.
  assert.ok('attributedShare' in report.digest.possession);
  assert.ok(report.digest.players.every((player) => 'coverage' in player));
  assert.equal(report.digest.staleFrames, 7);
});

test('a report with nothing to report says so instead of inventing a headline', () => {
  const ledger = new PossessionLedger();
  for (let i = 0; i < 50; i += 1) ledger.update({ state: 'unseen' }, i * 40);
  const report = matchReport({
    sessionMs: 2000,
    possession: ledger.summary(),
    ball: { seenShare: 0 },
    rows: [],
    totals: { home: teamTotals([]), away: teamTotals([]) },
    teams: { names: { home: 'Team A', away: 'Team B' } },
    calibration: null,
    staleFrames: 0,
  });
  assert.match(report.headline, /never attributable/);
  assert.ok(report.caveats.some((line) => line.includes('No pitch calibration')));
});

test('formatting reads as a person would write it', () => {
  assert.equal(distance(430), '430 m');
  assert.equal(distance(9400), '9.40 km');
  assert.equal(duration(45000), '45 s');
  assert.equal(duration(605000), '10 min 5 s');
});

test('the analyst is forbidden from doing the things that would ruin it', () => {
  assert.match(SYSTEM_PROMPT, /Never scale a/);
  assert.match(SYSTEM_PROMPT, /attributedShare/);
  assert.match(SYSTEM_PROMPT, /Never rate, rank or grade/);
  assert.match(SYSTEM_PROMPT, /Never guess a name/);
});

test('the analyst request carries numbers and no imagery', () => {
  const request = buildRequest(
    { provider: 'anthropic', key: 'sk-test', url: 'https://example.invalid', model: 'claude-sonnet-5' },
    'digest here',
  );
  assert.equal(request.headers['x-api-key'], 'sk-test');
  const body = JSON.parse(request.body);
  assert.equal(body.system, SYSTEM_PROMPT);
  assert.ok(!request.body.includes('data:image'), 'an image made it into the request');
  const openai = buildRequest(
    { provider: 'openai', key: 'sk-test', url: 'https://example.invalid', model: 'gpt-4o-mini' },
    'digest here',
  );
  assert.equal(JSON.parse(openai.body).messages[0].role, 'system');
  assert.equal(extractText({ content: [{ type: 'text', text: 'hello' }] }), 'hello');
  assert.equal(extractText({ choices: [{ message: { content: 'hi' } }] }), 'hi');
  assert.equal(extractText({}), '');
});
