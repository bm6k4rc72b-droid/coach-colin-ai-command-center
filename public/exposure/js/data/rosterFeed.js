/**
 * Live roster identities.
 *
 * The demo seed carries usage profiles, projections and scheme notes for a set
 * of roles — a workhorse back on one club, a slot receiver on another. This
 * module fills in *who those roles actually are* from Sleeper's public,
 * key-free player index, so the desk shows the league's real names, clubs,
 * positions and injury designations instead of invented ones.
 *
 * The split matters. Identity and injury designations come from the feed
 * because they are facts about real people and the app has no business
 * inventing them. Everything the desk computes — projections, opportunity
 * figures, prop numbers, verdicts — stays the desk's own model and is badged
 * as demo wherever it is shown.
 *
 * Three states, and the interface always says which one it is in:
 *
 * - `LIVE` — fetched from the feed this session.
 * - `CACHED` — read from the last good fetch, up to a day old.
 * - `DEMO` — no feed reached, so the seed's own placeholder names are showing.
 *
 * @module exposure/data/rosterFeed
 */

/** Sleeper's public player index. No key, no account, read-only. */
export const FEED_URL = 'https://api.sleeper.app/v1/players/nfl';

/** Where the trimmed roster is kept between visits. */
export const CACHE_KEY = 'exposure.roster.v1';

/** How long a cached roster is served before the desk tries the feed again. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** How long to wait on the feed before falling back. */
export const FETCH_TIMEOUT_MS = 8000;

/** Positions the desk models. */
export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** How many players to keep per club and position. */
const KEEP_PER_SLOT = 6;

/**
 * Injury designations, mapped from the feed's vocabulary to the desk's.
 *
 * Anything that keeps a player off the field reads as `OUT`; anything the feed
 * does not report at all is `ACTIVE`, because "no designation" is what an
 * empty injury field means.
 */
const INJURY_MAP = {
  Questionable: 'QUESTIONABLE',
  Doubtful: 'DOUBTFUL',
  Out: 'OUT',
  IR: 'OUT',
  PUP: 'OUT',
  NA: 'OUT',
  Sus: 'OUT',
  COV: 'OUT',
  DNR: 'OUT',
  Probable: 'PROBABLE',
};

/**
 * Normalise one raw feed record.
 *
 * @param {object} raw Feed record.
 * @returns {object|null} A roster entry, or null when the record is unusable.
 */
export function normalisePlayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const team = typeof raw.team === 'string' ? raw.team.toUpperCase() : '';
  const position = typeof raw.position === 'string' ? raw.position.toUpperCase() : '';
  const first = String(raw.first_name || '').trim();
  const last = String(raw.last_name || '').trim();
  if (!team || !first || !last) return null;
  if (!POSITIONS.includes(position)) return null;
  // `active` is absent on some records; only an explicit false rules a player out.
  if (raw.active === false) return null;

  const status = INJURY_MAP[raw.injury_status] || (raw.injury_status ? 'QUESTIONABLE' : 'ACTIVE');
  return {
    id: String(raw.player_id ?? `${first}-${last}-${team}`),
    first,
    last,
    name: `${first} ${last}`,
    team,
    pos: position,
    // Sleeper's `search_rank` is its own relevance ordering; the depth chart
    // fills in where it exists. Together they are a good enough stand-in for
    // "who is first on this club at this position".
    rank: Number.isFinite(raw.search_rank) ? raw.search_rank : 9_999_999,
    depthOrder: Number.isFinite(raw.depth_chart_order) ? raw.depth_chart_order : 99,
    injury: {
      status,
      note: status === 'ACTIVE' ? '' : String(raw.injury_notes || raw.injury_body_part || '').trim(),
    },
  };
}

/**
 * Trim a whole feed payload down to the clubs the desk actually shows.
 *
 * The raw index is several megabytes of every player who has ever been in the
 * database; the desk needs a few hundred records, and only those go anywhere
 * near local storage.
 *
 * @param {object} payload Raw feed payload, keyed by player id.
 * @param {string[]} teams Team abbreviations to keep.
 * @returns {object[]} Roster entries, ordered by club, position and depth.
 */
export function trimFeed(payload, teams) {
  const wanted = new Set(teams.map((t) => t.toUpperCase()));
  /** @type {Map<string, object[]>} */
  const buckets = new Map();

  for (const raw of Object.values(payload || {})) {
    const entry = normalisePlayer(raw);
    if (!entry || !wanted.has(entry.team)) continue;
    const key = `${entry.team}:${entry.pos}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }

  const kept = [];
  for (const [, list] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.rank - b.rank || a.depthOrder - b.depthOrder || a.name.localeCompare(b.name));
    kept.push(...list.slice(0, KEEP_PER_SLOT).map((entry, index) => ({ ...entry, depth: index + 1 })));
  }
  return kept;
}

/**
 * Index a trimmed roster for lookup by club, position and depth.
 *
 * @param {object[]} roster Trimmed roster entries.
 * @returns {Map<string, object>} Keyed `TEAM:POS:DEPTH`.
 */
export function indexRoster(roster) {
  return new Map((roster || []).map((entry) => [`${entry.team}:${entry.pos}:${entry.depth}`, entry]));
}

/**
 * Read the cached roster.
 *
 * @param {Storage} [store] Storage to read, for tests.
 * @returns {{roster: object[], fetchedAt: number}|null} The cache, or null.
 */
export function readCache(store = safeStorage()) {
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.roster) || !parsed.roster.length) return null;
    if (!Number.isFinite(parsed.fetchedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write the cache, tolerating a storage that refuses.
 *
 * @param {{roster: object[], fetchedAt: number}} value The cache.
 * @param {Storage} [store] Storage to write, for tests.
 * @returns {boolean} Whether it was written.
 */
export function writeCache(value, store = safeStorage()) {
  if (!store) return false;
  try {
    store.setItem(CACHE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Local storage where it exists, and nothing where it does not. */
function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether a cache entry is still fresh.
 *
 * @param {{fetchedAt: number}|null} cache The cache.
 * @param {number} [now] Current time.
 * @returns {boolean} True when it may be served without refetching.
 */
export function isFresh(cache, now = Date.now()) {
  return Boolean(cache) && now - cache.fetchedAt < CACHE_TTL_MS;
}

/**
 * Load roster identities.
 *
 * Never throws and never blocks the app: a feed that is unreachable, blocked
 * by a content policy, slow, or serving something unexpected simply leaves the
 * desk on its demo names, which is a state the interface names out loud.
 *
 * @param {object} options Options.
 * @param {string[]} options.teams Clubs to keep.
 * @param {boolean} [options.force] Ignore a fresh cache and refetch.
 * @param {Function} [options.fetchImpl] Fetch implementation, for tests.
 * @param {string} [options.url] Feed URL, for tests.
 * @param {Storage} [options.store] Storage, for tests.
 * @param {number} [options.now] Current time, for tests.
 * @returns {Promise<{source: 'LIVE'|'CACHED'|'DEMO', roster: object[], fetchedAt: number|null, error: string}>}
 *   The roster and where it came from.
 */
export async function loadRoster({
  teams,
  force = false,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  url = FEED_URL,
  store = safeStorage(),
  now = Date.now(),
} = {}) {
  const cache = readCache(store);
  if (!force && isFresh(cache, now)) {
    return { source: 'CACHED', roster: cache.roster, fetchedAt: cache.fetchedAt, error: '' };
  }
  if (!fetchImpl) {
    return fallback(cache, 'This browser has no fetch available.');
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl(url, { signal: controller ? controller.signal : undefined });
    if (!response || !response.ok) {
      throw new Error(`feed answered ${response ? response.status : 'nothing'}`);
    }
    const payload = await response.json();
    const roster = trimFeed(payload, teams);
    if (!roster.length) throw new Error('feed carried no players for these clubs');
    writeCache({ roster, fetchedAt: now }, store);
    return { source: 'LIVE', roster, fetchedAt: now, error: '' };
  } catch (failure) {
    return fallback(cache, describe(failure));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Serve a stale cache if there is one, and admit to the demo names if not.
 *
 * @param {{roster: object[], fetchedAt: number}|null} cache The cache.
 * @param {string} error What went wrong.
 * @returns {{source: string, roster: object[], fetchedAt: number|null, error: string}} The result.
 */
function fallback(cache, error) {
  if (cache) return { source: 'CACHED', roster: cache.roster, fetchedAt: cache.fetchedAt, error };
  return { source: 'DEMO', roster: [], fetchedAt: null, error };
}

/**
 * A short reason, safe to put on screen.
 *
 * @param {unknown} failure Whatever was thrown.
 * @returns {string} One line.
 */
function describe(failure) {
  if (failure && failure.name === 'AbortError') return 'The roster feed timed out.';
  const message = failure && failure.message ? String(failure.message) : String(failure);
  return `Could not reach the roster feed (${message}).`;
}

/**
 * Human-readable provenance for the status line.
 *
 * @param {{source: string, fetchedAt: number|null}} state Load result.
 * @param {number} [now] Current time.
 * @returns {string} e.g. `Rosters LIVE · just now`.
 */
export function describeSource(state, now = Date.now()) {
  if (!state || state.source === 'DEMO') return 'Rosters DEMO · placeholder names';
  const age = Math.max(0, now - (state.fetchedAt ?? now));
  const minutes = Math.round(age / 60000);
  const when = minutes < 1 ? 'just now'
    : (minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`);
  return `Rosters ${state.source} · ${when}`;
}
