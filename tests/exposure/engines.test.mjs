/**
 * Unit tests for the EXPOSURE engines.
 *
 * The verdicts, the risk bands and the best-number rule are the product, not
 * implementation details, so they are pinned here rather than eyeballed in the
 * browser.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allPlayers, player } from '../../public/exposure/js/data/players.js';
import { DEMO_LEAGUES, projectedFor, recordThrough, startersOf } from '../../public/exposure/js/data/leagues.js';
import { gamesForWeek, impliedTotal, opponentFor } from '../../public/exposure/js/data/games.js';
import { BOOKS, propsFor } from '../../public/exposure/js/data/market.js';
import { comparePlayers, reasonFor, startSit } from '../../public/exposure/js/engine/startsit.js';
import { RISK, buildExposure, concentrationAlerts, riskTag } from '../../public/exposure/js/engine/exposure.js';
import { bestQuote, impliedProbability, leanFor, shopSpread } from '../../public/exposure/js/engine/market.js';
import { GAME_TICKS, createLiveDesk, scoreStats } from '../../public/exposure/js/engine/live.js';

/** Count sentences the way a reader does. */
const sentences = (text) => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

test('every start/sit reason is exactly two sentences', () => {
  for (const p of allPlayers()) {
    const call = startSit(p, { week: 1, scoring: 'ppr', slot: p.pos });
    const parts = sentences(call.reason);
    assert.equal(parts.length, 2, `${p.name}: ${call.reason}`);
    assert.ok(!/\.\./.test(call.reason), `${p.name} has doubled punctuation`);
    assert.ok(call.reason.length > 60, `${p.name}'s reason is too thin`);
  }
});

test('verdicts and confidence stay inside their ranges', () => {
  for (const week of [1, 2, 3]) {
    for (const p of allPlayers()) {
      const call = startSit(p, { week, scoring: 'ppr', slot: p.pos });
      assert.ok(['START', 'SIT', 'WATCH'].includes(call.verdict), `${p.name}: ${call.verdict}`);
      assert.ok(call.confidence >= 1 && call.confidence <= 5);
      assert.equal(call.drivers.length, 5);
    }
  }
});

test('a ruled-out player is always a sit, at full confidence', () => {
  const out = allPlayers().find((p) => p.injury.status === 'OUT');
  const call = startSit(out, { week: 1, scoring: 'ppr', slot: out.pos });
  assert.equal(call.verdict, 'SIT');
  assert.equal(call.confidence, 5);
  assert.match(call.reason, /ruled out/);
});

test('a questionable designation caps confidence at three', () => {
  const questionable = allPlayers().filter((p) => p.injury.status === 'QUESTIONABLE');
  assert.ok(questionable.length, 'the demo pool needs a questionable player');
  for (const p of questionable) {
    assert.ok(startSit(p, { week: 1, scoring: 'ppr', slot: p.pos }).confidence <= 3, p.name);
  }
});

test('scoring format moves the call for a reception-heavy back', () => {
  const back = player('rb-ruiz');
  const ppr = startSit(back, { week: 1, scoring: 'ppr', slot: 'RB' });
  const std = startSit(back, { week: 1, scoring: 'std', slot: 'RB' });
  assert.ok(ppr.score > std.score, 'full-point scoring should help a pass-catching back');
});

test('reasonFor never doubles a sentence stop', () => {
  const drivers = [
    { label: 'Matchup', value: 4, note: 'Opponent ranks 30 of 32 against RBs.' },
    { label: 'Availability', value: -6, note: 'listed questionable (Ankle; limited all week).' },
  ];
  const text = reasonFor(player('rb-kemp'), 'WATCH', drivers, 'QUESTIONABLE');
  assert.equal(sentences(text).length, 2);
  assert.ok(!text.includes('..'));
});

test('compare picks the higher case and explains itself', () => {
  const result = comparePlayers(player('rb-kemp'), player('rb-sowell'), { week: 1, scoring: 'ppr', slot: 'RB' });
  assert.equal(result.winner.id, 'rb-kemp');
  assert.ok(result.margin > 0);
  assert.match(result.summary, /Rashad Kemp/);
});

test('risk bands follow the concentration rule', () => {
  assert.equal(riskTag({ started: 1 }), RISK.OK);
  assert.equal(riskTag({ started: 0, benched: 3 }), RISK.OK);
  assert.equal(riskTag({ started: 2 }), RISK.STACKED);
  assert.equal(riskTag({ started: 1, lean: true }), RISK.STACKED);
  assert.equal(riskTag({ started: 3 }), RISK.OVERLOADED);
  assert.equal(riskTag({ started: 2, lean: true }), RISK.OVERLOADED);
});

test('the demo leagues produce a triple-exposed running back', () => {
  const rows = buildExposure(DEMO_LEAGUES, []);
  const kemp = rows.find((row) => row.playerId === 'rb-kemp');
  assert.equal(kemp.started, 3);
  assert.equal(kemp.risk, RISK.OVERLOADED);
  assert.equal(rows[0].playerId, 'rb-kemp', 'the most concentrated player sorts first');
});

test('two leagues plus a lean is also overloaded', () => {
  const two = DEMO_LEAGUES.slice(0, 2);
  const lean = { playerId: 'rb-kemp', side: 'OVER', marketKey: 'rec_yds', marketLabel: 'Receiving yards' };
  assert.equal(buildExposure(two, []).find((r) => r.playerId === 'rb-kemp').risk, RISK.STACKED);
  assert.equal(buildExposure(two, [lean]).find((r) => r.playerId === 'rb-kemp').risk, RISK.OVERLOADED);
});

test('a lean on an unrostered player still earns a row, at a single exposure', () => {
  const rows = buildExposure([], [{ playerId: 'wr-petit', side: 'UNDER', marketKey: 'rec_yds', marketLabel: 'Receiving yards' }]);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].lean, 'the lean has to survive into the row');
  assert.equal(rows[0].risk, RISK.OK, 'one lean and no roster spot is one result, not a stack');
});

test('concentration alerts name the player and the cost', () => {
  const alerts = concentrationAlerts(DEMO_LEAGUES, []);
  assert.ok(alerts.length >= 1);
  assert.match(alerts[0].headline, /Rashad Kemp/);
  assert.match(alerts[0].detail, /started in 3 leagues/);
});

test('the best number is the lowest line for an over and the highest for an under', () => {
  for (const p of allPlayers()) {
    for (const market of propsFor(p, 1)) {
      if (market.key === 'atd') {
        const best = bestQuote(market, 'OVER');
        assert.equal(best.over, Math.max(...market.quotes.map((q) => q.over)), `${p.name} anytime TD`);
        continue;
      }
      const over = bestQuote(market, 'OVER');
      const under = bestQuote(market, 'UNDER');
      assert.equal(over.line, Math.min(...market.quotes.map((q) => q.line)), `${p.name} ${market.label} over`);
      assert.equal(under.line, Math.max(...market.quotes.map((q) => q.line)), `${p.name} ${market.label} under`);
    }
  }
});

test('price breaks a tie between two books on the same line', () => {
  const market = {
    key: 'rec_yds',
    quotes: [
      { book: 'a', line: 60.5, over: -115, under: -105 },
      { book: 'b', line: 60.5, over: -105, under: -115 },
    ],
  };
  assert.equal(bestQuote(market, 'OVER').book, 'b');
  assert.equal(bestQuote(market, 'UNDER').book, 'a');
});

test('shopping reports the gap between the best and worst number', () => {
  const market = propsFor(player('wr-lund'), 1).find((m) => m.key === 'rec_yds');
  const spread = shopSpread(market, 'OVER');
  assert.ok(spread.lineGap > 0);
  assert.ok(spread.best.line <= spread.worst.line);
});

test('implied probability round-trips a fair price', () => {
  assert.ok(Math.abs(impliedProbability(-110) - 0.5238) < 0.001);
  assert.ok(Math.abs(impliedProbability(150) - 0.4) < 0.001);
});

test('the desk takes both sides across the board, and never a side with no edge', () => {
  const verdicts = new Set();
  for (const p of allPlayers()) {
    for (const market of propsFor(p, 1)) {
      const lean = leanFor(p, market);
      verdicts.add(lean.verdict);
      assert.ok(['LEAN OVER', 'LEAN UNDER', 'WATCH'].includes(lean.verdict));
      if (lean.verdict === 'WATCH') assert.ok(Math.abs(lean.edge) < 0.2);
    }
  }
  assert.ok(verdicts.has('LEAN OVER'), 'no over lean anywhere on the board');
  assert.ok(verdicts.has('LEAN UNDER'), 'no under lean anywhere on the board');
  assert.ok(verdicts.has('WATCH'), 'every number cannot be mispriced');
});

test('fantasy scoring counts receptions by format', () => {
  const line = { rec: 6, recYds: 80, rushYds: 20, td: 1 };
  assert.equal(scoreStats(line, 'ppr'), 22);
  assert.equal(scoreStats(line, 'half'), 19);
  assert.equal(scoreStats(line, 'std'), 16);
});

test('the live desk is deterministic and produces plausible volume', () => {
  const ids = [...new Set(DEMO_LEAGUES.flatMap((league) => league.starters))];
  const run = () => {
    const desk = createLiveDesk({ playerIds: ids, week: 1, leagues: DEMO_LEAGUES, seed: 42 });
    for (let i = 0; i < GAME_TICKS; i += 1) desk.tick();
    return desk;
  };
  const first = run();
  const second = run();
  assert.deepEqual(
    first.rows().map((row) => row.points),
    second.rows().map((row) => row.points),
    'the same seed must replay the same Sunday',
  );

  const live = first.rows().filter((row) => row.state === 'LIVE');
  assert.ok(live.length, 'week 1 needs a live game');
  for (const row of live) {
    assert.ok(row.stats.targets <= 16, `${row.player.name} saw ${row.stats.targets} targets`);
    assert.ok(row.stats.carries <= 26, `${row.player.name} took ${row.stats.carries} carries`);
  }
  const upcoming = first.rows().filter((row) => row.state === 'UPCOMING');
  assert.ok(upcoming.every((row) => row.points === 0), 'a game that has not kicked off scores nothing');
  assert.ok(first.rows().some((row) => row.state === 'FINAL' && row.points > 0), 'finished games need a final line');
});

test('the live desk raises the four alert kinds it promises', () => {
  const ids = [...new Set(DEMO_LEAGUES.flatMap((league) => league.starters))];
  const desk = createLiveDesk({ playerIds: ids, week: 1, leagues: DEMO_LEAGUES, seed: 7 });
  for (let i = 0; i < 120; i += 1) desk.tick();
  const kinds = new Set(desk.alerts().map((alert) => alert.kind));
  for (const kind of ['DROUGHT', 'GOAL_LINE', 'SCORE', 'OPPONENT']) {
    assert.ok(kinds.has(kind), `never saw a ${kind} alert`);
  }
});

test('league projections and records read off the roster', () => {
  for (const league of DEMO_LEAGUES) {
    assert.equal(startersOf(league).length, 7);
    assert.ok(projectedFor(league) > 80, `${league.name} projects too low`);
    assert.equal(recordThrough(league, 1).text, '0-0');
    assert.equal(recordThrough(league, 3).w + recordThrough(league, 3).l, 2);
  }
});

test('the slate carries a full board and implied totals that add up', () => {
  for (const week of [1, 2, 3]) {
    const games = gamesForWeek(week);
    assert.equal(games.length, 8);
    for (const game of games) {
      const sum = impliedTotal(game.home, week) + impliedTotal(game.away, week);
      assert.ok(Math.abs(sum - game.total) < 0.15, `${game.id}: ${sum} vs ${game.total}`);
      assert.equal(opponentFor(game.home, week).opp, game.away);
    }
  }
});

test('every priced market quotes all three books', () => {
  for (const p of allPlayers()) {
    const markets = propsFor(p, 1);
    assert.ok(markets.length >= 2, `${p.name} has too few markets`);
    for (const market of markets) {
      assert.equal(market.quotes.length, BOOKS.length);
      assert.deepEqual(market.quotes.map((q) => q.book), BOOKS.map((b) => b.id));
    }
  }
});
