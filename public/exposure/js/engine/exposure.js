/**
 * The Exposure engine.
 *
 * Fantasy tools count points; this one counts how many ways a single Sunday
 * can go wrong at once. A player started in three leagues who also carries a
 * prop lean is one injury away from ruining four different results, and that
 * is a fact about the user's portfolio rather than about the player.
 *
 * @module exposure/engine/exposure
 */

import { player } from '../data/players.js';

/**
 * Risk bands, in order of severity.
 *
 * - `OK` — one start, or bench-only.
 * - `STACKED` — two starts, or one start plus a lean.
 * - `OVERLOADED` — three or more starts, or two starts plus a lean.
 */
export const RISK = { OK: 'OK', STACKED: 'STACKED', OVERLOADED: 'OVERLOADED' };

/**
 * Weight a portfolio position. Starts carry the weight; a bench spot is a
 * lottery ticket, not exposure, so it counts for very little.
 *
 * @param {{started: number, benched: number, lean: boolean}} counts Position counts.
 * @returns {number} Concentration score.
 */
export function concentrationScore({ started, benched, lean }) {
  return started * 2 + (lean ? 1 : 0) + benched * 0.25;
}

/**
 * Classify a position into a risk band.
 *
 * @param {{started: number, benched: number, lean: boolean}} counts Position counts.
 * @returns {string} One of {@link RISK}.
 */
export function riskTag({ started, benched = 0, lean = false }) {
  if (started >= 3 || (started >= 2 && lean)) return RISK.OVERLOADED;
  if (started === 2 || (started === 1 && lean)) return RISK.STACKED;
  return RISK.OK;
}

/**
 * Build the exposure table.
 *
 * @param {object[]} leagues Connected leagues.
 * @param {object[]} [leans] Saved prop leans.
 * @returns {Array<object>} One row per owned player, most concentrated first.
 */
export function buildExposure(leagues, leans = []) {
  /** @type {Map<string, {startedIn: string[], benchedIn: string[]}>} */
  const rows = new Map();
  const touch = (id) => {
    if (!rows.has(id)) rows.set(id, { startedIn: [], benchedIn: [] });
    return rows.get(id);
  };

  for (const league of leagues) {
    for (const id of league.starters) touch(id).startedIn.push(league.id);
    for (const id of league.bench) touch(id).benchedIn.push(league.id);
  }
  // A lean on a player nobody rosters is still exposure — it is money on the
  // same Sunday — so it earns a row of its own.
  for (const lean of leans) touch(lean.playerId);

  const leanBy = new Map(leans.map((lean) => [lean.playerId, lean]));
  const leagueName = new Map(leagues.map((league) => [league.id, league.name]));

  return [...rows.entries()]
    .map(([playerId, counts]) => {
      const lean = leanBy.get(playerId) || null;
      const shape = { started: counts.startedIn.length, benched: counts.benchedIn.length, lean: Boolean(lean) };
      return {
        playerId,
        player: player(playerId),
        startedIn: counts.startedIn,
        benchedIn: counts.benchedIn,
        startedNames: counts.startedIn.map((id) => leagueName.get(id) || id),
        benchedNames: counts.benchedIn.map((id) => leagueName.get(id) || id),
        started: shape.started,
        benched: shape.benched,
        lean,
        risk: riskTag(shape),
        score: concentrationScore(shape),
      };
    })
    .sort((a, b) => b.score - a.score
      || (a.player?.name || '').localeCompare(b.player?.name || ''));
}

/**
 * Concentration alerts for the home screen: the players a user is doubled up
 * on, phrased as something to act on.
 *
 * @param {object[]} leagues Connected leagues.
 * @param {object[]} [leans] Saved prop leans.
 * @returns {Array<{playerId: string, risk: string, headline: string, detail: string}>} Alerts.
 */
export function concentrationAlerts(leagues, leans = []) {
  return buildExposure(leagues, leans)
    .filter((row) => row.risk !== RISK.OK && row.player)
    .map((row) => {
      const parts = [];
      if (row.started) parts.push(`started in ${row.started} league${row.started === 1 ? '' : 's'}`);
      if (row.lean) parts.push(`a ${row.lean.side.toLowerCase()} lean on ${row.lean.marketLabel.toLowerCase()}`);
      if (row.benched) parts.push(`benched in ${row.benched}`);
      return {
        playerId: row.playerId,
        risk: row.risk,
        headline: `${row.player.name} — ${row.risk.toLowerCase()}`,
        detail: `${parts.join(', ')}. One injury moves ${row.started + (row.lean ? 1 : 0)} results at once.`,
      };
    });
}

/**
 * Totals for the exposure header.
 *
 * @param {Array<object>} rows Rows from {@link buildExposure}.
 * @returns {{players: number, overloaded: number, stacked: number, leans: number}} Counts.
 */
export function exposureSummary(rows) {
  return {
    players: rows.length,
    overloaded: rows.filter((r) => r.risk === RISK.OVERLOADED).length,
    stacked: rows.filter((r) => r.risk === RISK.STACKED).length,
    leans: rows.filter((r) => r.lean).length,
  };
}
