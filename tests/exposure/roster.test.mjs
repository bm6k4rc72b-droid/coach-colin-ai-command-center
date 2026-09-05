/**
 * Unit tests for the roster feed.
 *
 * The feed decides what real people are called and whether they are hurt, so
 * the boundary it must not cross — into projections, usage figures or prices —
 * is pinned here alongside the ordinary parsing and fallback behaviour.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CACHE_KEY, CACHE_TTL_MS, describeSource, indexRoster, isFresh, loadRoster,
  normalisePlayer, readCache, trimFeed, writeCache,
} from '../../public/exposure/js/data/rosterFeed.js';
import {
  PLAYERS, allPlayers, applyRosterIdentities, depthChart, mergeIdentity, player,
  resetRosterIdentities,
} from '../../public/exposure/js/data/players.js';
import { SLATE_TEAMS } from '../../public/exposure/js/data/games.js';

/** A storage stand-in that behaves like the real thing. */
function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() { return map.size; },
  };
}

/** A storage that refuses every write, the way a full or private one does. */
const hostileStore = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('quota'); },
};

/** One feed record. */
const record = (over = {}) => ({
  player_id: '100',
  first_name: 'Ada',
  last_name: 'Byron',
  team: 'DET',
  position: 'RB',
  search_rank: 20,
  active: true,
  injury_status: null,
  ...over,
});

test('a feed record becomes a roster entry', () => {
  const entry = normalisePlayer(record());
  assert.equal(entry.name, 'Ada Byron');
  assert.equal(entry.team, 'DET');
  assert.equal(entry.pos, 'RB');
  assert.equal(entry.injury.status, 'ACTIVE');
  assert.equal(entry.injury.note, '');
});

test('records the desk cannot use are dropped', () => {
  assert.equal(normalisePlayer(null), null);
  assert.equal(normalisePlayer(record({ team: null })), null);
  assert.equal(normalisePlayer(record({ position: 'K' })), null);
  assert.equal(normalisePlayer(record({ first_name: '' })), null);
  assert.equal(normalisePlayer(record({ active: false })), null);
  // A missing `active` flag is not the same as an explicit false.
  assert.ok(normalisePlayer(record({ active: undefined })));
});

test('injury designations map onto the desk vocabulary', () => {
  const status = (value) => normalisePlayer(record({ injury_status: value })).injury.status;
  assert.equal(status('Questionable'), 'QUESTIONABLE');
  assert.equal(status('Doubtful'), 'DOUBTFUL');
  assert.equal(status('Out'), 'OUT');
  assert.equal(status('IR'), 'OUT');
  assert.equal(status(null), 'ACTIVE');
  // Anything unrecognised is reported rather than silently cleared.
  assert.equal(status('Limited'), 'QUESTIONABLE');
  assert.equal(normalisePlayer(record({ injury_status: 'Out', injury_body_part: 'Knee' })).injury.note, 'Knee');
});

test('the feed is trimmed to the slate and ranked into a depth chart', () => {
  const payload = {};
  payload.a = record({ player_id: 'a', first_name: 'First', team: 'DET', search_rank: 5 });
  payload.b = record({ player_id: 'b', first_name: 'Second', team: 'DET', search_rank: 60 });
  payload.c = record({ player_id: 'c', first_name: 'Third', team: 'DET', search_rank: 900 });
  payload.d = record({ player_id: 'd', first_name: 'Elsewhere', team: 'ARI', search_rank: 1 });
  payload.e = record({ player_id: 'e', first_name: 'Receiver', team: 'DET', position: 'WR', search_rank: 3 });

  const trimmed = trimFeed(payload, ['DET']);
  const backs = trimmed.filter((entry) => entry.pos === 'RB');
  assert.deepEqual(backs.map((entry) => entry.first), ['First', 'Second', 'Third']);
  assert.deepEqual(backs.map((entry) => entry.depth), [1, 2, 3]);
  assert.ok(!trimmed.some((entry) => entry.team === 'ARI'), 'off-slate clubs are dropped');
  assert.equal(indexRoster(trimmed).get('DET:WR:1').first, 'Receiver');
});

test('a club keeps at most six players per position', () => {
  const payload = {};
  for (let i = 0; i < 20; i += 1) {
    payload[`p${i}`] = record({ player_id: `p${i}`, first_name: `Player${i}`, search_rank: i });
  }
  assert.equal(trimFeed(payload, ['DET']).length, 6);
});

test('a missing search rank sorts behind a real one', () => {
  const payload = {
    ranked: record({ player_id: 'ranked', first_name: 'Ranked', search_rank: 400 }),
    unranked: record({ player_id: 'unranked', first_name: 'Unranked', search_rank: null }),
  };
  assert.deepEqual(trimFeed(payload, ['DET']).map((e) => e.first), ['Ranked', 'Unranked']);
});

test('the cache round-trips and survives a storage that refuses', () => {
  const store = fakeStore();
  assert.equal(readCache(store), null);
  assert.equal(writeCache({ roster: [{ team: 'DET' }], fetchedAt: 10 }, store), true);
  assert.equal(readCache(store).fetchedAt, 10);
  assert.equal(store.getItem(CACHE_KEY) !== null, true);

  assert.equal(writeCache({ roster: [], fetchedAt: 1 }, hostileStore), false);
  assert.equal(readCache(hostileStore), null);
  assert.equal(readCache(fakeStore({ [CACHE_KEY]: 'not json' })), null);
  assert.equal(readCache(fakeStore({ [CACHE_KEY]: '{"roster":[],"fetchedAt":1}' })), null);
});

test('freshness is a day', () => {
  assert.equal(isFresh({ fetchedAt: 1000 }, 1000 + CACHE_TTL_MS - 1), true);
  assert.equal(isFresh({ fetchedAt: 1000 }, 1000 + CACHE_TTL_MS + 1), false);
  assert.equal(isFresh(null), false);
});

test('a reachable feed loads live and is cached', async () => {
  const store = fakeStore();
  const payload = { a: record({ player_id: 'a' }) };
  const result = await loadRoster({
    teams: ['DET'],
    fetchImpl: async () => ({ ok: true, json: async () => payload }),
    store,
    now: 5000,
  });
  assert.equal(result.source, 'LIVE');
  assert.equal(result.roster.length, 1);
  assert.equal(readCache(store).fetchedAt, 5000);
});

test('a fresh cache is served without touching the network', async () => {
  let called = false;
  const store = fakeStore();
  writeCache({ roster: [{ team: 'DET', pos: 'RB', depth: 1, first: 'A', last: 'B' }], fetchedAt: 1000 }, store);
  const result = await loadRoster({
    teams: ['DET'],
    fetchImpl: async () => { called = true; throw new Error('should not be called'); },
    store,
    now: 2000,
  });
  assert.equal(result.source, 'CACHED');
  assert.equal(called, false);
});

test('force goes back to the feed even when the cache is fresh', async () => {
  const store = fakeStore();
  writeCache({ roster: [{ team: 'DET', pos: 'RB', depth: 1, first: 'Old', last: 'Name' }], fetchedAt: 1000 }, store);
  const result = await loadRoster({
    teams: ['DET'],
    force: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ a: record({ first_name: 'New' }) }) }),
    store,
    now: 1500,
  });
  assert.equal(result.source, 'LIVE');
  assert.equal(result.roster[0].first, 'New');
});

test('an unreachable feed falls back to a stale cache, then to the demo names', async () => {
  const store = fakeStore();
  writeCache({ roster: [{ team: 'DET', pos: 'RB', depth: 1, first: 'Stale', last: 'Entry' }], fetchedAt: 1 }, store);
  const stale = await loadRoster({
    teams: ['DET'],
    fetchImpl: async () => { throw new Error('offline'); },
    store,
    now: 1 + CACHE_TTL_MS + 1,
  });
  assert.equal(stale.source, 'CACHED');
  assert.match(stale.error, /offline/);

  const empty = await loadRoster({
    teams: ['DET'],
    fetchImpl: async () => { throw new Error('offline'); },
    store: fakeStore(),
  });
  assert.equal(empty.source, 'DEMO');
  assert.equal(empty.roster.length, 0);
});

test('a feed answering with junk is treated as no feed at all', async () => {
  const cases = [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
    async () => null,
  ];
  for (const fetchImpl of cases) {
    const result = await loadRoster({ teams: ['DET'], fetchImpl, store: fakeStore() });
    assert.equal(result.source, 'DEMO');
    assert.ok(result.error.length > 0);
  }
});

test('the load never throws, whatever the environment withholds', async () => {
  const result = await loadRoster({ teams: ['DET'], fetchImpl: null, store: null });
  assert.equal(result.source, 'DEMO');
});

test('provenance reads plainly', () => {
  assert.match(describeSource({ source: 'DEMO' }), /DEMO/);
  assert.match(describeSource({ source: 'LIVE', fetchedAt: 1000 }, 1000), /LIVE · just now/);
  assert.match(describeSource({ source: 'CACHED', fetchedAt: 0 }, 3 * 60 * 60 * 1000), /3 h ago/);
});

test('the depth chart follows the seed projections', () => {
  const depths = depthChart();
  // Detroit's two seeded backs and receivers sort by projection, best first.
  assert.equal(depths.get('rb-kemp'), 1);
  const byTeamPos = new Map();
  for (const p of allPlayers()) {
    const key = `${p.team}:${p.pos}`;
    byTeamPos.set(key, [...(byTeamPos.get(key) || []), depths.get(p.id)]);
  }
  for (const [key, list] of byTeamPos) {
    assert.deepEqual([...list].sort((a, b) => a - b), list.map((_, i) => i + 1), `${key} depth is not a sequence`);
  }
});

test('identity comes from the feed and nothing else does', () => {
  const seed = { ...PLAYERS['rb-kemp'] };
  const merged = mergeIdentity(seed, {
    id: 'feed-1',
    first: 'Real',
    last: 'Player',
    name: 'Real Player',
    injury: { status: 'QUESTIONABLE', note: 'Ankle' },
  });
  assert.equal(merged.name, 'Real Player');
  assert.equal(merged.initials, 'RP');
  assert.equal(merged.identity, 'LIVE');
  assert.equal(merged.injury.status, 'QUESTIONABLE');
  // Everything the desk models is untouched.
  assert.deepEqual(merged.proj, seed.proj);
  assert.deepEqual(merged.opportunity, seed.opportunity);
  assert.deepEqual(merged.receipts, seed.receipts);
  assert.equal(merged.pos, seed.pos);
  assert.equal(merged.team, seed.team);
});

test('applying and dropping a roster leaves the seed intact', () => {
  const before = { name: player('rb-kemp').name, proj: { ...player('rb-kemp').proj } };
  const applied = applyRosterIdentities(indexRoster([{
    team: 'DET', pos: 'RB', depth: 1, first: 'Real', last: 'Back', name: 'Real Back', injury: { status: 'ACTIVE' },
  }]));
  assert.equal(applied.matched, 1);
  assert.equal(applied.total, 27);
  assert.equal(player('rb-kemp').name, 'Real Back');
  assert.equal(player('rb-kemp').identity, 'LIVE');
  // A role the feed did not fill keeps its placeholder rather than emptying.
  assert.equal(player('wr-lund').identity, 'DEMO');
  assert.equal(player('wr-lund').name, 'Xavier Lund');

  resetRosterIdentities();
  assert.equal(player('rb-kemp').name, before.name);
  assert.equal(player('rb-kemp').identity, 'DEMO');
  assert.deepEqual(player('rb-kemp').proj, before.proj);
});

test('the slate names sixteen clubs for the feed to be trimmed to', () => {
  assert.equal(SLATE_TEAMS.length, 16);
  assert.ok(SLATE_TEAMS.every((abbr) => /^[A-Z]{2,3}$/.test(abbr)));
});
