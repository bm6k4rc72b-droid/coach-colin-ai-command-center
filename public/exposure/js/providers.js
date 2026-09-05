/**
 * League and odds provider seams.
 *
 * Every screen reads leagues through `connectProvider()` and numbers through
 * `oddsProvider`, so replacing the mocks with real integrations is a change to
 * this one file. The mock handshake is deliberately shaped like the real
 * thing — a redirect the user approves, then a token exchange, then a league
 * list — so the calling code already handles latency and failure.
 *
 * No credential is requested, stored or transmitted here. The mock "consent"
 * step is a local dialog; it never opens a provider's site.
 *
 * @module exposure/providers
 */

import { DEMO_LEAGUES } from './data/leagues.js';
import { gamesForWeek } from './data/games.js';
import { gameBoard, propsFor } from './data/market.js';

/**
 * @typedef {object} Provider
 * @property {string} id Provider identifier.
 * @property {string} name Display name.
 * @property {string} blurb What connecting does, in one line.
 * @property {string} mark Two-letter text mark; providers get no logo either.
 */

/** @type {Provider[]} */
export const PROVIDERS = [
  { id: 'espn', name: 'ESPN', blurb: 'Redraft and keeper leagues.', mark: 'ES' },
  { id: 'sleeper', name: 'Sleeper', blurb: 'Redraft, dynasty and best-ball.', mark: 'SL' },
  { id: 'yahoo', name: 'Yahoo', blurb: 'Public and private leagues.', mark: 'YA' },
];

/** How long the mock handshake pretends to take, in milliseconds. */
export const MOCK_LATENCY = 650;

/**
 * Leagues a provider would return.
 *
 * @param {string} providerId Provider identifier.
 * @returns {object[]} Leagues, deep-copied so callers cannot mutate the seed.
 */
export function leaguesForProvider(providerId) {
  return DEMO_LEAGUES
    .filter((league) => league.provider === providerId)
    .map((league) => structuredClone(league));
}

/**
 * Run the mock OAuth handshake.
 *
 * @param {string} providerId Provider identifier.
 * @param {object} [options] Options.
 * @param {number} [options.latency] Override the simulated round trip.
 * @param {(step: string) => void} [options.onStep] Progress callback: `redirect`, `consent`, `exchange`, `fetch`.
 * @returns {Promise<{provider: Provider, leagues: object[]}>} Connected leagues.
 * @throws {Error} When the provider is unknown or returns no leagues.
 */
export async function connectProvider(providerId, options = {}) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const latency = options.latency ?? MOCK_LATENCY;
  const step = options.onStep || (() => {});
  const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  step('redirect');
  await pause(latency * 0.3);
  step('consent');
  await pause(latency * 0.3);
  step('exchange');
  await pause(latency * 0.2);
  step('fetch');
  await pause(latency * 0.2);

  const leagues = leaguesForProvider(providerId);
  if (!leagues.length) {
    throw new Error(`${provider.name} returned no leagues for this account.`);
  }
  return { provider, leagues };
}

/**
 * The odds seam.
 *
 * A real implementation swaps these three methods for calls to an odds API and
 * keeps the same return shapes. Everything is read-only by design: there is no
 * method here that could place, price or settle a wager, because the app is not
 * a sportsbook and does not take them.
 */
export const oddsProvider = {
  /** Provenance shown in the UI so nobody mistakes the demo board for a live one. */
  source: { name: 'Demo board', live: false, note: 'Sample numbers from invented books.' },

  /**
   * Game lines for a week.
   *
   * @param {number} week Week number.
   * @returns {Array<{game: object, board: object}>} Priced games.
   */
  games(week) {
    return gamesForWeek(week).map((game) => ({ game, board: gameBoard(game) }));
  },

  /**
   * Player prop markets.
   *
   * @param {string} playerId Player id.
   * @param {number} week Week number.
   * @returns {object[]} Priced markets.
   */
  props(playerId, week) {
    return propsFor(playerId, week);
  },
};
