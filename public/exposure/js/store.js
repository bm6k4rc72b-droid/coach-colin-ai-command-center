/**
 * Application state.
 *
 * Everything the user has — the age check, the account stub, connected
 * leagues, saved leans, settings — lives in one object in local storage on
 * their own device. There is no server, so there is nothing to sync, nothing
 * to leak, and `reset()` genuinely deletes the account rather than filing a
 * request with someone.
 *
 * @module exposure/store
 */

import { SLOT_ELIGIBILITY, SLOTS } from './data/leagues.js';

const KEY = 'exposure.state.v1';

/** @returns {object} A fresh, empty state. */
export function emptyState() {
  return {
    version: 1,
    /** `unset` until the user answers the 21+ question; then `verified` or `declined`. */
    age: 'unset',
    seenDisclosure: false,
    account: null,
    leagues: [],
    leans: [],
    week: 1,
    activeLeagueId: null,
    settings: { hideBetting: false, defaultScoring: 'ppr' },
    readAlerts: [],
  };
}

/** Read persisted state, tolerating a cleared or hostile store. */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return { ...emptyState(), ...parsed, settings: { ...emptyState().settings, ...(parsed.settings || {}) } };
  } catch {
    return emptyState();
  }
}

let state = typeof localStorage === 'undefined' ? emptyState() : load();
/** @type {Set<(state: object) => void>} */
const listeners = new Set();

/** Persist, ignoring quota and private-mode failures — the app still works in memory. */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* A session that cannot persist is still a usable session. */
  }
}

/** Notify subscribers. */
function emit() {
  for (const listener of listeners) listener(state);
}

/**
 * Current state. Treat the result as read-only; mutate through the actions.
 *
 * @returns {object} The state.
 */
export function getState() {
  return state;
}

/**
 * Subscribe to state changes.
 *
 * @param {(state: object) => void} listener Called after every change.
 * @returns {() => void} Unsubscribe.
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Apply a change.
 *
 * @param {(draft: object) => object|void} mutate Receives the state; may return a replacement.
 * @returns {object} The new state.
 */
export function update(mutate) {
  const next = mutate(state);
  if (next) state = next;
  save();
  emit();
  return state;
}

/* ---------------------------------------------------------------- actions */

/**
 * Record the answer to the 21-or-older question.
 *
 * Declining is a supported answer, not a dead end: the app hides every odds
 * surface and keeps working as a fantasy tool.
 *
 * @param {boolean} isAdult Whether the user affirmed they are 21 or older.
 * @returns {object} New state.
 */
export function setAge(isAdult) {
  return update((s) => {
    s.age = isAdult ? 'verified' : 'declined';
    s.seenDisclosure = true;
    if (!isAdult) s.settings.hideBetting = true;
    return s;
  });
}

/** @returns {boolean} Whether odds surfaces may be shown at all. */
export function bettingVisible() {
  return state.age === 'verified' && !state.settings.hideBetting;
}

/**
 * Create the local account stub.
 *
 * The "magic link" is a local ceremony: no email is sent, nothing leaves the
 * device, and the address is only used as a display name.
 *
 * @param {string} email Email address.
 * @param {string} [favoriteTeam] Favourite team, as text.
 * @returns {object} New state.
 */
export function signIn(email, favoriteTeam = '') {
  return update((s) => {
    s.account = { email: String(email).trim(), favoriteTeam, since: new Date().toISOString() };
    return s;
  });
}

/**
 * Store the favourite club, as text only.
 *
 * @param {string} teamAbbr Team abbreviation, or an empty string to clear.
 * @returns {object} New state.
 */
export function setFavoriteTeam(teamAbbr) {
  return update((s) => {
    if (!s.account) s.account = { email: '', favoriteTeam: '', since: new Date().toISOString() };
    s.account.favoriteTeam = teamAbbr || '';
    return s;
  });
}

/**
 * Add leagues returned by a provider, replacing any with the same id.
 *
 * @param {object[]} leagues Leagues to add.
 * @returns {object} New state.
 */
export function addLeagues(leagues) {
  return update((s) => {
    const byId = new Map(s.leagues.map((l) => [l.id, l]));
    for (const league of leagues) byId.set(league.id, { ...league, connectedAt: new Date().toISOString() });
    s.leagues = [...byId.values()];
    if (!s.activeLeagueId && s.leagues.length) s.activeLeagueId = s.leagues[0].id;
    return s;
  });
}

/**
 * Disconnect a league.
 *
 * @param {string} leagueId League id.
 * @returns {object} New state.
 */
export function removeLeague(leagueId) {
  return update((s) => {
    s.leagues = s.leagues.filter((l) => l.id !== leagueId);
    if (s.activeLeagueId === leagueId) s.activeLeagueId = s.leagues[0]?.id || null;
    return s;
  });
}

/**
 * Change a league's scoring format.
 *
 * @param {string} leagueId League id.
 * @param {'ppr'|'half'|'std'} scoring Scoring format.
 * @returns {object} New state.
 */
export function setLeagueScoring(leagueId, scoring) {
  return update((s) => {
    const league = s.leagues.find((l) => l.id === leagueId);
    if (league) league.scoring = scoring;
    return s;
  });
}

/**
 * Swap a bench player into a starting slot.
 *
 * @param {string} leagueId League id.
 * @param {number} slotIndex Index into `SLOTS`.
 * @param {string} benchPlayerId Bench player to promote.
 * @returns {object} New state.
 */
export function swapIntoLineup(leagueId, slotIndex, benchPlayerId) {
  return update((s) => {
    const league = s.leagues.find((l) => l.id === leagueId);
    if (!league) return s;
    const benchIndex = league.bench.indexOf(benchPlayerId);
    if (benchIndex < 0) return s;
    const outgoing = league.starters[slotIndex];
    league.starters[slotIndex] = benchPlayerId;
    league.bench[benchIndex] = outgoing;
    return s;
  });
}

/**
 * Whether a player may fill a slot.
 *
 * @param {string} slot Slot name.
 * @param {string} pos Player position.
 * @returns {boolean} True when eligible.
 */
export function slotAccepts(slot, pos) {
  return (SLOT_ELIGIBILITY[slot] || []).includes(pos);
}

/**
 * Save a prop lean. One lean per player and market; saving again replaces it.
 *
 * A lean is a note, not a bet. Nothing is staked, priced or settled.
 *
 * @param {object} lean Lean record.
 * @returns {object} New state.
 */
export function saveLean(lean) {
  return update((s) => {
    s.leans = [
      ...s.leans.filter((l) => !(l.playerId === lean.playerId && l.marketKey === lean.marketKey)),
      { ...lean, savedAt: new Date().toISOString() },
    ];
    return s;
  });
}

/**
 * Remove a saved lean.
 *
 * @param {string} playerId Player id.
 * @param {string} marketKey Market key.
 * @returns {object} New state.
 */
export function removeLean(playerId, marketKey) {
  return update((s) => {
    s.leans = s.leans.filter((l) => !(l.playerId === playerId && l.marketKey === marketKey));
    return s;
  });
}

/**
 * The lean saved for a player and market, if any.
 *
 * @param {string} playerId Player id.
 * @param {string} [marketKey] Market key; omit to match any market.
 * @returns {object|null} The lean.
 */
export function findLean(playerId, marketKey) {
  return state.leans.find((l) => l.playerId === playerId
    && (marketKey === undefined || l.marketKey === marketKey)) || null;
}

/**
 * Set the week being viewed.
 *
 * @param {number} week Week number.
 * @returns {object} New state.
 */
export function setWeek(week) {
  return update((s) => { s.week = week; return s; });
}

/**
 * Set the league the lineup screen is showing.
 *
 * @param {string} leagueId League id.
 * @returns {object} New state.
 */
export function setActiveLeague(leagueId) {
  return update((s) => { s.activeLeagueId = leagueId; return s; });
}

/**
 * Toggle the betting surfaces.
 *
 * @param {boolean} hidden Whether to hide them.
 * @returns {object} New state.
 */
export function setHideBetting(hidden) {
  return update((s) => { s.settings.hideBetting = Boolean(hidden); return s; });
}

/**
 * Mark alerts as read.
 *
 * @param {string[]} ids Alert ids.
 * @returns {object} New state.
 */
export function markAlertsRead(ids) {
  return update((s) => {
    s.readAlerts = [...new Set([...s.readAlerts, ...ids])].slice(-200);
    return s;
  });
}

/**
 * Delete everything. This is the whole account: there is no copy elsewhere.
 *
 * @returns {object} A fresh state.
 */
export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing persisted; the in-memory reset below is the whole job. */
  }
  state = emptyState();
  emit();
  return state;
}

/**
 * The league currently in focus.
 *
 * @returns {object|null} The active league.
 */
export function activeLeague() {
  return state.leagues.find((l) => l.id === state.activeLeagueId) || state.leagues[0] || null;
}

export { SLOTS };
