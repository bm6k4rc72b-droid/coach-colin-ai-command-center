/**
 * The Command Center's live board.
 *
 * Sunday is the only day this app is stressful, so the live desk is built to
 * answer one question fast: is anything happening to a player I am exposed to?
 * It is a simulation — the demo has no live feed — but it is a deterministic
 * one. `createLiveDesk` owns no timers and reads no clock; the screen calls
 * `tick()` and the same seed always produces the same Sunday, which is what
 * makes the alert logic testable.
 *
 * @module exposure/engine/live
 */

import { gameFor } from '../data/games.js';
import { player as findPlayer } from '../data/players.js';
import { rng, seedOf } from '../data/games.js';

/** Ticks a starter may go without a touch before the desk says so. */
export const DROUGHT_TICKS = 6;

/**
 * Fantasy points for a stat line.
 *
 * @param {object} stats Accumulated stats.
 * @param {'ppr'|'half'|'std'} [scoring] Scoring format.
 * @returns {number} Points, to one decimal.
 */
export function scoreStats(stats, scoring = 'ppr') {
  const perCatch = { ppr: 1, half: 0.5, std: 0 }[scoring] ?? 1;
  const points = (stats.passYds || 0) / 25
    + (stats.passTD || 0) * 4
    - (stats.int || 0) * 2
    + (stats.rushYds || 0) / 10
    + (stats.recYds || 0) / 10
    + (stats.rec || 0) * perCatch
    + (stats.td || 0) * 6;
  return Math.round(points * 10) / 10;
}

/** An empty stat line. */
function emptyStats() {
  return { carries: 0, rushYds: 0, targets: 0, rec: 0, recYds: 0, passYds: 0, passTD: 0, int: 0, td: 0 };
}

/**
 * How many ticks stand in for a full game. Every rate below is a per-game
 * expectation divided by this, so a back with seventeen carries gets about
 * seventeen carries over a simulated game rather than whatever a hand-tuned
 * probability happened to produce.
 */
export const GAME_TICKS = 40;

/**
 * Per-tick usage rates, derived from the player's opportunity profile.
 *
 * @param {object} p Player record.
 * @returns {{carry: number, target: number, dropback: number, score: number}} Per-tick probabilities.
 */
export function ratesFor(p) {
  const o = p.opportunity || {};
  const perTick = (perGame) => Math.min(0.9, (perGame || 0) / GAME_TICKS);
  // Anytime-score expectation, the same shape the prop board uses.
  const scoreChance = Math.min(0.75, (o.rzTouches || 0) * 0.135 + (o.targets || 0) * 0.008 + (o.carries || 0) * 0.006);
  if (p.pos === 'QB') {
    return {
      carry: perTick(o.rushAttempts),
      target: 0,
      // Completions rather than attempts: an incompletion has nothing to show.
      dropback: perTick((o.passAttempts || 0) * 0.65),
      score: perTick(scoreChance + 0.35),
    };
  }
  return {
    carry: perTick(o.carries),
    target: perTick(o.targets),
    dropback: 0,
    score: perTick(scoreChance),
  };
}

/**
 * Build a live desk over a set of players.
 *
 * @param {object} options Options.
 * @param {string[]} options.playerIds Players the user is starting somewhere.
 * @param {number} [options.week] Week number.
 * @param {'ppr'|'half'|'std'} [options.scoring] Scoring format.
 * @param {object[]} [options.leagues] Leagues, for opponent alerts.
 * @param {number} [options.seed] Seed, so a demo Sunday can be replayed.
 * @param {number} [options.prime] Ticks to run before the board is handed over.
 *   A live game showing Q2 with an empty stat line reads as broken, so the
 *   screen opens on a Sunday already in progress.
 * @returns {{ rows: () => object[], alerts: () => object[], tick: () => object, tickCount: () => number }}
 *   The desk.
 */
export function createLiveDesk({
  playerIds, week = 1, scoring = 'ppr', leagues = [], seed = 8675309, prime = 0,
}) {
  const random = rng(seed >>> 0);
  let ticks = 0;
  const alerts = [];

  const rows = playerIds
    .map((id) => findPlayer(id))
    .filter(Boolean)
    .map((p) => {
      const game = gameFor(p.team, week);
      const state = game ? game.state : 'UPCOMING';
      const stats = emptyStats();
      // A finished game needs a plausible final line at load, otherwise the
      // board opens on a wall of zeroes that reads as broken rather than done.
      if (state === 'FINAL') {
        const settle = rng(seedOf(`final:${week}:${p.id}`));
        const rates = ratesFor(p);
        for (let i = 0; i < GAME_TICKS; i += 1) {
          if (settle() < rates.carry) { stats.carries += 1; stats.rushYds += Math.round(settle() * 11) - 1; }
          if (settle() < rates.target) {
            stats.targets += 1;
            if (settle() < 0.64) { stats.rec += 1; stats.recYds += Math.round(settle() * 17); }
          }
          if (rates.dropback && settle() < rates.dropback) stats.passYds += Math.round(settle() * 16) + 3;
          if (settle() < rates.score) {
            if (p.pos === 'QB') stats.passTD += 1; else stats.td += 1;
          }
        }
      }
      return {
        playerId: p.id,
        player: p,
        game,
        state,
        stats,
        points: scoreStats(stats, scoring),
        lastTouchTick: 0,
        droughtFlagged: false,
      };
    });

  /**
   * Record an alert.
   *
   * @param {string} kind Alert kind.
   * @param {string} text What to show.
   * @param {string} [playerId] Related player.
   */
  function push(kind, text, playerId) {
    alerts.unshift({ id: `a${alerts.length + 1}-${kind}-${ticks}`, kind, text, playerId, tick: ticks });
    if (alerts.length > 40) alerts.pop();
  }

  /**
   * Advance the board one tick.
   *
   * @returns {{rows: object[], newAlerts: object[]}} The board and anything new.
   */
  function tick() {
    ticks += 1;
    const before = alerts.length;

    for (const row of rows) {
      if (row.state !== 'LIVE') continue;
      const rates = ratesFor(row.player);
      let touched = false;

      if (random() < rates.carry) {
        row.stats.carries += 1;
        row.stats.rushYds += Math.round(random() * 11) - 1;
        touched = true;
        if (random() < 0.16) push('GOAL_LINE', `Goal-line carry — ${row.player.name}.`, row.playerId);
      }
      if (random() < rates.target) {
        row.stats.targets += 1;
        touched = true;
        if (random() < 0.66) {
          row.stats.rec += 1;
          row.stats.recYds += Math.round(random() * 17);
        }
      }
      if (rates.dropback && random() < rates.dropback) {
        row.stats.passYds += Math.round(random() * 16) + 3;
        touched = true;
        if (random() < 0.02) { row.stats.int += 1; push('TURNOVER', `Interception — ${row.player.name}.`, row.playerId); }
      }
      if (random() < rates.score) {
        if (row.player.pos === 'QB') row.stats.passTD += 1; else row.stats.td += 1;
        push('SCORE', `Touchdown — ${row.player.name}.`, row.playerId);
        touched = true;
      }

      if (touched) {
        row.lastTouchTick = ticks;
        row.droughtFlagged = false;
      } else if (!row.droughtFlagged && ticks - row.lastTouchTick >= DROUGHT_TICKS) {
        row.droughtFlagged = true;
        const quarter = row.game?.quarter?.split(' ')[0] || 'this quarter';
        push('DROUGHT', `No touches in ${quarter} — ${row.player.name}.`, row.playerId);
      }

      row.points = scoreStats(row.stats, scoring);
    }

    // Opponents score too, and that is the alert people actually react to.
    if (leagues.length && random() < 0.06) {
      const league = leagues[Math.floor(random() * leagues.length)];
      const opponentName = league.opponents?.[(week - 1) % league.opponents.length] || 'Your opponent';
      push('OPPONENT', `${opponentName}'s WR just scored — ${league.name}.`);
    }

    return { rows: [...rows], newAlerts: alerts.slice(0, alerts.length - before) };
  }

  for (let i = 0; i < prime; i += 1) tick();

  return {
    rows: () => [...rows],
    alerts: () => [...alerts],
    tick,
    tickCount: () => ticks,
  };
}
