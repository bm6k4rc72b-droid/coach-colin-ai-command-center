/**
 * The demo slate: a Week 1-style Sunday, three weeks deep.
 *
 * Everything here is sample data seeded into the app so the desk works with
 * no backend and no keys. Week 1 carries hand-written kickoff windows and
 * game states so the Command Center has something to show; weeks 2 and 3 are
 * generated from the same pairing rotation with a deterministic pseudo-random
 * source, so a reload never reshuffles the board under the user.
 *
 * Game states are a fixed property of the demo rather than a function of the
 * wall clock: a demo that only looks alive on a Sunday afternoon is a demo
 * nobody can review.
 *
 * @module exposure/data/games
 */

/** Weeks the demo slate covers. */
export const WEEKS = [1, 2, 3];

/** Kickoff windows, as text. Times are illustrative. */
const WINDOWS = ['Sun 1:00 PM ET', 'Sun 1:00 PM ET', 'Sun 4:05 PM ET', 'Sun 4:25 PM ET', 'Sun 8:20 PM ET'];

/**
 * Pairings per week, as `[away, home]`. Sixteen clubs, eight games, rotated
 * so a player's opponent genuinely changes when the week picker moves.
 */
const PAIRINGS = {
  1: [['LAC', 'KC'], ['NYJ', 'BUF'], ['DAL', 'PHI'], ['GB', 'DET'],
    ['SEA', 'SF'], ['CIN', 'BAL'], ['HOU', 'MIA'], ['TB', 'MIN']],
  2: [['KC', 'BUF'], ['LAC', 'NYJ'], ['PHI', 'DET'], ['DAL', 'GB'],
    ['SF', 'BAL'], ['SEA', 'CIN'], ['MIA', 'MIN'], ['HOU', 'TB']],
  3: [['BUF', 'PHI'], ['DET', 'KC'], ['NYJ', 'DAL'], ['GB', 'LAC'],
    ['BAL', 'MIA'], ['MIN', 'SF'], ['CIN', 'HOU'], ['TB', 'SEA']],
};

/**
 * Week 1 game states, so the Command Center shows a real mix. Index matches
 * `PAIRINGS[1]`.
 */
const WEEK_ONE_STATE = ['LIVE', 'LIVE', 'FINAL', 'UPCOMING', 'UPCOMING', 'FINAL', 'UPCOMING', 'UPCOMING'];

/** Week 1 numbers, hand-set so the demo reads like a plausible board. */
const WEEK_ONE_LINES = {
  'LAC@KC': { spread: -3.5, total: 47.5 },
  'NYJ@BUF': { spread: -6.5, total: 42.5 },
  'DAL@PHI': { spread: -2.5, total: 49.5 },
  'GB@DET': { spread: -1.5, total: 51.5 },
  'SEA@SF': { spread: -4.5, total: 44.5 },
  'CIN@BAL': { spread: -3, total: 48.5 },
  'HOU@MIA': { spread: 1.5, total: 45.5 },
  'TB@MIN': { spread: -2, total: 43.5 },
};

/**
 * Deterministic 32-bit hash, used as a seed so generated numbers are stable
 * across reloads and identical in the tests.
 *
 * @param {string} text Seed text.
 * @returns {number} Hash in [0, 2^32).
 */
export function seedOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Seeded pseudo-random generator (mulberry32).
 *
 * @param {number} seed Starting state.
 * @returns {() => number} Generator returning [0, 1).
 */
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round to the nearest half point, the way a board is priced. */
const toHalf = (value) => Math.round(value * 2) / 2;

/**
 * @typedef {object} Game
 * @property {string} id Stable identifier, e.g. `w1-LAC@KC`.
 * @property {number} week Week number.
 * @property {string} away Away team abbreviation.
 * @property {string} home Home team abbreviation.
 * @property {string} kickoff Kickoff window text.
 * @property {'UPCOMING'|'LIVE'|'FINAL'} state Demo game state.
 * @property {string} quarter Period text when live or final.
 * @property {{home: number, away: number}} score Demo score.
 * @property {number} spread Home spread, negative when the home side is favoured.
 * @property {number} total Game total.
 */

/**
 * Build the slate for one week.
 *
 * @param {number} week Week number.
 * @returns {Game[]} Games in kickoff order.
 */
export function gamesForWeek(week) {
  const pairs = PAIRINGS[week] || [];
  return pairs.map(([away, home], index) => {
    const key = `${away}@${home}`;
    const random = rng(seedOf(`${week}:${key}`));
    const base = WEEK_ONE_LINES[key];
    const spread = base ? base.spread : toHalf(-(random() * 9 - 3.5));
    const total = base ? base.total : toHalf(40 + random() * 12);
    const state = week === 1 ? WEEK_ONE_STATE[index] : 'UPCOMING';
    const scored = state !== 'UPCOMING';
    return {
      id: `w${week}-${key}`,
      week,
      away,
      home,
      kickoff: WINDOWS[index % WINDOWS.length],
      state,
      quarter: state === 'LIVE' ? ['Q2 08:41', 'Q3 11:02', 'Q2 02:15'][index % 3] : (state === 'FINAL' ? 'Final' : ''),
      score: {
        away: scored ? 7 + Math.floor(random() * 18) : 0,
        home: scored ? 10 + Math.floor(random() * 18) : 0,
      },
      spread,
      total,
    };
  });
}

/**
 * The game a club plays in a given week.
 *
 * @param {string} abbr Team abbreviation.
 * @param {number} week Week number.
 * @returns {Game|null} The game, or null on a bye/unknown club.
 */
export function gameFor(abbr, week) {
  return gamesForWeek(week).find((g) => g.home === abbr || g.away === abbr) || null;
}

/**
 * Opponent description for a club in a week.
 *
 * @param {string} abbr Team abbreviation.
 * @param {number} week Week number.
 * @returns {{opp: string, home: boolean, label: string}|null} Opponent info, or null on a bye.
 */
export function opponentFor(abbr, week) {
  const game = gameFor(abbr, week);
  if (!game) return null;
  const home = game.home === abbr;
  const opp = home ? game.away : game.home;
  return { opp, home, label: `${home ? 'vs' : '@'} ${opp}` };
}

/**
 * Implied team total: half the game total, adjusted by the spread. This is the
 * ordinary back-of-envelope version, and it is what the start/sit engine uses
 * as its environment input.
 *
 * @param {string} abbr Team abbreviation.
 * @param {number} week Week number.
 * @returns {number} Implied points, or 21 when the club is not on the slate.
 */
export function impliedTotal(abbr, week) {
  const game = gameFor(abbr, week);
  if (!game) return 21;
  const home = game.home === abbr;
  // `spread` is quoted from the home side, so a negative number is a home favourite.
  const edge = home ? -game.spread : game.spread;
  return Math.round((game.total / 2 + edge / 2) * 10) / 10;
}
