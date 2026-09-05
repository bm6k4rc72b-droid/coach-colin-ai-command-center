/**
 * Demo sportsbook numbers.
 *
 * The books here are invented. Printing fabricated prices under the name of a
 * real operator would be a misrepresentation of that operator's board, and
 * the point of this screen is line *shopping*, which works just as well with
 * three fictional books. Outbound links are stubs pointing at example.com;
 * `BOOKS[].deepLink` is the single seam a real affiliate or odds provider
 * would replace.
 *
 * Nothing in this module or anywhere downstream places, prices, or settles a
 * wager. The app compares publicly quoted numbers and then sends the user
 * somewhere else.
 *
 * @module exposure/data/market
 */

import { gameFor, rng, seedOf } from './games.js';
import { player as findPlayer } from './players.js';

/**
 * @typedef {object} Book
 * @property {string} id Short identifier.
 * @property {string} name Display name.
 * @property {string} deepLink URL template; `{event}` is replaced with the event key.
 */

/** @type {Book[]} */
export const BOOKS = [
  { id: 'atlas', name: 'Atlas', deepLink: 'https://example.com/atlas?event={event}' },
  { id: 'meridian', name: 'Meridian', deepLink: 'https://example.com/meridian?event={event}' },
  { id: 'harbor', name: 'Harbor', deepLink: 'https://example.com/harbor?event={event}' },
];

/**
 * Resolve a book's outbound URL for an event.
 *
 * @param {string} bookId Book identifier.
 * @param {string} eventKey Event key, e.g. a game or prop id.
 * @returns {string} An absolute URL.
 */
export function bookLink(bookId, eventKey) {
  const book = BOOKS.find((b) => b.id === bookId);
  if (!book) return 'https://example.com/';
  return book.deepLink.replace('{event}', encodeURIComponent(eventKey));
}

/**
 * Convert a win probability to American odds, with the usual house margin
 * baked in so the two sides of a market do not sum to 100%.
 *
 * @param {number} probability Fair probability in (0, 1).
 * @param {number} [margin] House margin, as a fraction.
 * @returns {number} American odds, rounded to the nearest 5.
 */
export function toAmerican(probability, margin = 0.03) {
  const p = Math.min(0.94, Math.max(0.06, probability * (1 + margin)));
  const raw = p >= 0.5 ? -(100 * p) / (1 - p) : (100 * (1 - p)) / p;
  return Math.round(raw / 5) * 5;
}

/**
 * Format American odds for display.
 *
 * @param {number} odds American odds.
 * @returns {string} e.g. `+145`, `-110`.
 */
export function formatOdds(odds) {
  return odds > 0 ? `+${odds}` : String(odds);
}

/** Round a yardage line to the nearest half point. */
const toHalf = (value) => Math.round(value * 2) / 2;

/**
 * The prop markets a position is priced in.
 *
 * @param {object} p Player record.
 * @returns {Array<{key: string, label: string, unit: string}>} Market descriptors.
 */
export function marketsFor(p) {
  const yards = {
    QB: [
      { key: 'pass_yds', label: 'Passing yards', unit: 'yds' },
      { key: 'rush_yds', label: 'Rushing yards', unit: 'yds' },
    ],
    RB: [
      { key: 'rush_yds', label: 'Rushing yards', unit: 'yds' },
      { key: 'rec_yds', label: 'Receiving yards', unit: 'yds' },
    ],
    WR: [
      { key: 'rec_yds', label: 'Receiving yards', unit: 'yds' },
    ],
    TE: [
      { key: 'rec_yds', label: 'Receiving yards', unit: 'yds' },
    ],
  }[p.pos] || [];
  // Only price a rushing market for a receiver who actually carries the ball.
  if (p.pos === 'WR' && (p.opportunity.carries || 0) >= 1) {
    yards.push({ key: 'rush_yds', label: 'Rushing yards', unit: 'yds' });
  }
  return [...yards, { key: 'atd', label: 'Anytime TD', unit: '' }];
}

/**
 * Baseline expectation for a market, derived from the player's opportunity
 * profile rather than from the projection, so the two numbers can disagree —
 * which is the entire reason a research tool exists.
 *
 * @param {object} p Player record.
 * @param {string} marketKey Market key.
 * @returns {number} Expected yards, or an anytime-TD probability for `atd`.
 */
export function baselineFor(p, marketKey) {
  const o = p.opportunity;
  switch (marketKey) {
    case 'pass_yds':
      return (o.passAttempts || 0) * 7.3;
    case 'rush_yds':
      if (p.pos === 'QB') return (o.rushAttempts || 0) * 5.4;
      if (p.pos === 'WR') return (o.carries || 0) * 7.1;
      return (o.carries || 0) * 4.35;
    case 'rec_yds':
      return (o.targets || 0) * (p.pos === 'RB' ? 6.2 : 8.9);
    case 'atd':
      // Red-zone touches carry most of the signal; volume adds a small tail.
      return Math.min(0.72, (o.rzTouches || 0) * 0.135 + (o.targets || 0) * 0.008 + (o.carries || 0) * 0.006);
    default:
      return 0;
  }
}

/**
 * Where the books hang a market, as distinct from where the desk's own
 * opportunity model puts it.
 *
 * A real board prices matchup, weather, injury news and the money already
 * taken — none of which the opportunity baseline knows about. Modelling that
 * as a seeded shade of up to 14% is what gives the desk something to disagree
 * with; a board derived straight from the model would grade every number fair
 * and the lean would be a decoration.
 *
 * @param {object} p Player record.
 * @param {string} marketKey Market key.
 * @param {number} week Week number.
 * @returns {number} The consensus anchor for the market.
 */
export function marketAnchor(p, marketKey, week) {
  const baseline = baselineFor(p, marketKey);
  const shade = (rng(seedOf(`anchor:${week}:${p.id}:${marketKey}`))() - 0.5) * 0.28;
  return baseline * (1 + shade);
}

/**
 * Price one market across all three books.
 *
 * Per-book offsets come from a seeded generator, so the board is stable but
 * the books genuinely disagree — there is always a best number to find.
 *
 * @param {object} p Player record.
 * @param {{key: string, label: string, unit: string}} market Market descriptor.
 * @param {number} week Week number.
 * @returns {{key: string, label: string, unit: string, quotes: Array<object>}} Priced market.
 */
export function priceMarket(p, market, week) {
  const anchor = marketAnchor(p, market.key, week);
  const quotes = BOOKS.map((book, index) => {
    const random = rng(seedOf(`${week}:${p.id}:${market.key}:${book.id}`));
    if (market.key === 'atd') {
      const probability = Math.min(0.8, Math.max(0.04, anchor * (0.96 + random() * 0.08)));
      return {
        book: book.id,
        bookName: book.name,
        line: null,
        over: toAmerican(probability),
        under: null,
      };
    }
    const drift = (random() - 0.5) * Math.max(2.5, anchor * 0.05);
    const line = toHalf(Math.max(0.5, anchor + drift));
    // Vig sits on the side the book shades; the offset alternates by book so
    // the price tiebreak in the best-number rule gets exercised.
    const juice = index === 1 ? 6 : 0;
    return {
      book: book.id,
      bookName: book.name,
      line,
      over: -110 - juice,
      under: -110 + juice,
    };
  });
  return { ...market, quotes };
}

/**
 * Every priced market for a player in a week.
 *
 * @param {object|string} playerOrId Player record or id.
 * @param {number} week Week number.
 * @returns {Array<object>} Priced markets.
 */
export function propsFor(playerOrId, week) {
  const p = typeof playerOrId === 'string' ? findPlayer(playerOrId) : playerOrId;
  if (!p) return [];
  return marketsFor(p).map((market) => priceMarket(p, market, week));
}

/**
 * Game lines — spread, total and moneyline — across the three books.
 *
 * @param {object} game Game record.
 * @returns {{spread: object[], total: object[], moneyline: object[]}} Priced board.
 */
export function gameBoard(game) {
  const spread = [];
  const total = [];
  const moneyline = [];
  BOOKS.forEach((book, index) => {
    const random = rng(seedOf(`${game.id}:${book.id}`));
    const spreadShift = [0, 0.5, -0.5][index];
    const homeSpread = game.spread + spreadShift;
    const totalShift = [0, -0.5, 0.5][index];
    // Convert the spread into a rough win probability: about 3 points a
    // three-point move is worth roughly a nine-point swing in win probability.
    const homeProbability = 1 / (1 + Math.exp(homeSpread / 5.5));
    spread.push({
      book: book.id,
      bookName: book.name,
      home: homeSpread,
      away: -homeSpread,
      homePrice: -110 + Math.round((random() - 0.5) * 10) * 2,
      awayPrice: -110 + Math.round((random() - 0.5) * 10) * 2,
    });
    total.push({
      book: book.id,
      bookName: book.name,
      line: game.total + totalShift,
      over: -110,
      under: -110,
    });
    moneyline.push({
      book: book.id,
      bookName: book.name,
      home: toAmerican(homeProbability),
      away: toAmerican(1 - homeProbability),
    });
  });
  return { spread, total, moneyline };
}

/**
 * Sample line-movement notes. These are static demo copy, written the way a
 * desk annotates its own board — not a feed.
 *
 * @param {string} key Game or player identifier.
 * @returns {string} A note, chosen deterministically.
 */
export function lineMoveNote(key) {
  const notes = [
    'Line dropped after the practice report.',
    'Total climbed a point and a half on the wind forecast easing.',
    'Money came in on the road side overnight; the number has not followed.',
    'Opened at a different number and has been steady since Thursday.',
    'Sharp move at open, nothing since.',
    'Receiving yards shaded down after the third-down back was ruled doubtful.',
  ];
  return notes[seedOf(String(key)) % notes.length];
}

/**
 * Everything the market screen needs for a player's prop search result.
 *
 * @param {string} query Search text.
 * @param {object[]} pool Player pool.
 * @returns {object[]} Matching players, best match first.
 */
export function searchPlayers(query, pool) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  return pool
    .map((p) => {
      const name = p.name.toLowerCase();
      const score = name.startsWith(needle) ? 3 : (name.includes(needle) ? 2
        : (p.team.toLowerCase() === needle || p.pos.toLowerCase() === needle ? 1 : 0));
      return { p, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .map((row) => row.p);
}

/**
 * The game a player appears in, for event keys and links.
 *
 * @param {object} p Player record.
 * @param {number} week Week number.
 * @returns {object|null} The game.
 */
export function gameForPlayer(p, week) {
  return gameFor(p.team, week);
}
