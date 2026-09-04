/**
 * Demo leagues.
 *
 * Three rosters that deliberately overlap: one running back and one receiver
 * start in all three, which is the whole point of the Exposure screen. A real
 * provider adapter returns objects of exactly this shape, so the screens never
 * learn where a league came from.
 *
 * @module exposure/data/leagues
 */

import { player, projFor } from './players.js';
import { rng, seedOf } from './games.js';

/** Starting slots, in the order a lineup is read. */
export const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];

/** Which positions may fill a slot. */
export const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

/** Scoring formats the desk understands. */
export const SCORING = [
  { id: 'ppr', name: 'PPR', note: 'One point per reception.' },
  { id: 'half', name: 'Half PPR', note: 'Half a point per reception.' },
  { id: 'std', name: 'Standard', note: 'No points for receptions.' },
];

/**
 * @typedef {object} League
 * @property {string} id Stable identifier.
 * @property {string} provider Provider id the league was connected through.
 * @property {string} name League name.
 * @property {string} teamName The user's team in that league.
 * @property {number} teams League size.
 * @property {'ppr'|'half'|'std'} scoring Scoring format.
 * @property {string[]} starters Player ids, aligned to `SLOTS`.
 * @property {string[]} bench Player ids.
 * @property {string[]} results Weekly results so a record can be shown.
 * @property {string[]} opponents Opponent team names by week.
 */

/** @type {League[]} */
export const DEMO_LEAGUES = [
  {
    id: 'lg-gauntlet',
    provider: 'espn',
    name: 'The Gauntlet',
    teamName: 'Night Shift',
    teams: 12,
    scoring: 'ppr',
    starters: ['qb-rasmussen', 'rb-kemp', 'rb-doss', 'wr-lund', 'wr-oyelaran', 'te-halloran', 'wr-vidal'],
    bench: ['rb-whitlock', 'wr-petit', 'qb-boothe', 'te-krantz', 'rb-sowell'],
    results: ['W', 'L'],
    opponents: ['Ditch the Punter', 'Muddy Pocket', 'Zone Read Zealots'],
  },
  {
    id: 'lg-third-long',
    provider: 'sleeper',
    name: 'Third & Long',
    teamName: 'Cold Open',
    teams: 12,
    scoring: 'ppr',
    starters: ['qb-vance', 'rb-kemp', 'rb-brath', 'wr-lund', 'wr-callender', 'te-pryor', 'rb-ruiz'],
    bench: ['wr-monroe', 'wr-estes', 'qb-ferrell', 'wr-nakamura', 'te-vanterpool'],
    results: ['L', 'W'],
    opponents: ['Backfield Committee', 'Play Action Pals', 'Two High Shells'],
  },
  {
    id: 'lg-pick-six',
    provider: 'yahoo',
    name: 'Pick Six',
    teamName: 'Graveyard Shift',
    teams: 12,
    scoring: 'ppr',
    starters: ['qb-trent', 'rb-kemp', 'rb-okafor', 'wr-estes', 'wr-fiedler', 'te-krantz', 'wr-lund'],
    bench: ['rb-roby', 'wr-barrantes', 'qb-boothe', 'rb-brath', 'te-pryor'],
    results: ['W', 'W'],
    opponents: ['Gap Integrity', 'The Checkdowns', 'Cover Zero Club'],
  },
];

/**
 * A league's roster as slot objects, in lineup order.
 *
 * @param {League} league The league.
 * @returns {Array<{slot: string, index: number, playerId: string, player: object|null}>} Starting lineup.
 */
export function startersOf(league) {
  return SLOTS.map((slot, index) => ({
    slot,
    index,
    playerId: league.starters[index],
    player: player(league.starters[index]),
  }));
}

/**
 * A league's bench.
 *
 * @param {League} league The league.
 * @returns {Array<{playerId: string, player: object|null}>} Bench players.
 */
export function benchOf(league) {
  return league.bench.map((playerId) => ({ playerId, player: player(playerId) }));
}

/**
 * Record before a given week.
 *
 * @param {League} league The league.
 * @param {number} week Week number.
 * @returns {{w: number, l: number, text: string}} Wins, losses and display text.
 */
export function recordThrough(league, week) {
  const played = league.results.slice(0, Math.max(0, week - 1));
  const w = played.filter((r) => r === 'W').length;
  const l = played.filter((r) => r === 'L').length;
  return { w, l, text: `${w}-${l}` };
}

/**
 * Projected points for a lineup.
 *
 * @param {League} league The league.
 * @param {'ppr'|'half'|'std'} [scoring] Override the league's own format.
 * @returns {number} Projected points, to one decimal.
 */
export function projectedFor(league, scoring = league.scoring) {
  const total = startersOf(league)
    .reduce((sum, row) => sum + (row.player ? projFor(row.player, scoring) : 0), 0);
  return Math.round(total * 10) / 10;
}

/**
 * The opponent a league team faces in a week, with a projection.
 *
 * @param {League} league The league.
 * @param {number} week Week number.
 * @returns {{name: string, projected: number}} Opponent name and projection.
 */
export function opponentTeam(league, week) {
  const name = league.opponents[(week - 1) % league.opponents.length];
  const random = rng(seedOf(`${league.id}:opp:${week}`));
  // Opponents project within about nine points of the user's lineup, so the
  // matchup card reads as a real contest rather than a coin flip.
  const projected = Math.round((projectedFor(league) - 4.5 + random() * 9) * 10) / 10;
  return { name, projected };
}

/**
 * Every player id a set of leagues touches.
 *
 * @param {League[]} leagues Connected leagues.
 * @returns {string[]} Unique player ids.
 */
export function rosteredIds(leagues) {
  const ids = new Set();
  for (const league of leagues) {
    for (const id of league.starters) ids.add(id);
    for (const id of league.bench) ids.add(id);
  }
  return [...ids];
}
