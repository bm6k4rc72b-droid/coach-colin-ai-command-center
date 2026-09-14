/**
 * Harvest tracking: progress, rate, and refusing to promise a finishing time.
 *
 * @module tests/black-optic-6/harvest
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blockProgress, daySummary, estimateFinish, EXTRAPOLATION_FLOOR, pickRate,
  picksFor, SETTLED_MINUTES, yieldRanking,
} from '../../public/black-optic-6/js/harvest.js';

const BLOCK = { id: 'nw', name: 'Vineyard NW', hectares: 4, rows: 100, variety: 'Cabernet' };
const OTHER = { id: 'se', name: 'Vineyard SE', hectares: 2, rows: 50, variety: 'Merlot' };
const START = Date.parse('2026-09-14T07:00:00Z');

/**
 * A run of picks at a steady cadence.
 *
 * @param {object} options Shape of the run.
 * @returns {Array<object>} Picks.
 */
function run({ blockId = 'nw', count = 8, everyMinutes = 15, kg = 400, rows = 10 }) {
  return Array.from({ length: count }, (_, i) => ({
    blockId,
    atMs: START + i * everyMinutes * 60000,
    kg,
    rows,
  }));
}

test('picks are filtered by block and returned in order', () => {
  const picks = [...run({ blockId: 'se', count: 2 }), ...run({ count: 3 })].reverse();
  const mine = picksFor('nw', picks);
  assert.equal(mine.length, 3);
  for (let i = 1; i < mine.length; i += 1) assert.ok(mine[i].atMs >= mine[i - 1].atMs);
});

test('progress counts rows and weight, and marks a finished block', () => {
  const half = blockProgress(BLOCK, run({ count: 5 }));
  assert.equal(half.rows, 50);
  assert.equal(half.kg, 2000);
  assert.ok(Math.abs(half.fraction - 0.5) < 1e-9);
  assert.equal(half.complete, false);

  const done = blockProgress(BLOCK, run({ count: 10 }));
  assert.equal(done.complete, true);
  assert.match(done.note, /finished/i);
  assert.ok(Math.abs(done.kgPerHa - 1000) < 1e-9, '4000 kg over 4 ha is 1000 kg/ha');
});

test('a barely started block is given no yield at all', () => {
  const early = blockProgress(BLOCK, run({ count: 1 }));
  assert.ok(early.fraction < EXTRAPOLATION_FLOOR);
  assert.equal(early.kgPerHa, null, 'extrapolating from a tenth of a block is guesswork');
  assert.match(early.note, /too little to extrapolate/i);
});

test('a part-picked block is extrapolated and said to be', () => {
  const partial = blockProgress(BLOCK, run({ count: 5 }));
  assert.equal(partial.extrapolated, true);
  assert.ok(partial.kgPerHa > 0);
  assert.match(partial.note, /extrapolated/i);
  assert.ok(Math.abs(partial.kgPerHa - 1000) < 1e-6, 'a steady block extrapolates to its finished yield');
});

test('nothing logged is reported as nothing, not as zero yield', () => {
  const none = blockProgress(BLOCK, []);
  assert.equal(none.kg, 0);
  assert.equal(none.kgPerHa, null);
  assert.match(none.note, /nothing logged/i);
});

test('the rate excludes the first load, which was picked before the window', () => {
  const picks = run({ count: 5, everyMinutes: 15, kg: 400 });
  const rate = pickRate(picks, { nowMs: START + 60 * 60000 });
  // Four loads of 400 kg across the hour that elapsed.
  assert.ok(Math.abs(rate.kgPerHour - 1600) < 1, `expected 1600 kg/h, got ${rate.kgPerHour.toFixed(0)}`);
  assert.equal(rate.samples, 5);
});

test('a rate needs two picks and a span to exist at all', () => {
  assert.equal(pickRate([], {}).kgPerHour, null);
  assert.equal(pickRate(run({ count: 1 }), {}).kgPerHour, null);
  const simultaneous = [
    { blockId: 'nw', atMs: START, kg: 100 },
    { blockId: 'nw', atMs: START, kg: 100 },
  ];
  assert.equal(pickRate(simultaneous, {}).kgPerHour, null);
});

test('a short run is provisional and a long one has settled', () => {
  const short = pickRate(run({ count: 3, everyMinutes: 5 }), {});
  assert.equal(short.settled, false);
  assert.match(short.note, /provisional/i);
  assert.ok(short.spanMinutes < SETTLED_MINUTES);

  const long = pickRate(run({ count: 8, everyMinutes: 15 }), {});
  assert.equal(long.settled, true);
  assert.match(long.note, /measured over/i);
});

test('the spread separates a steady rate from stops and sprints', () => {
  const steady = pickRate(run({ count: 6, everyMinutes: 15, kg: 400 }), {});
  const lumpy = pickRate([
    { blockId: 'nw', atMs: START, kg: 400 },
    { blockId: 'nw', atMs: START + 2 * 60000, kg: 400 },
    { blockId: 'nw', atMs: START + 60 * 60000, kg: 400 },
    { blockId: 'nw', atMs: START + 62 * 60000, kg: 400 },
  ], {});
  assert.ok(lumpy.spreadKgPerHour > steady.spreadKgPerHour * 5, 'a lumpy day must not look steady');
});

test('a finish is a window, and it widens when the rate is unsettled', () => {
  const settled = estimateFinish(BLOCK, run({ count: 6, everyMinutes: 15 }), { nowMs: START + 75 * 60000 });
  assert.ok(settled.hoursMin < settled.hoursMax, 'a finish must never be a single time');
  assert.equal(settled.rowsLeft, 100 - 60);

  const rushed = estimateFinish(BLOCK, run({ count: 3, everyMinutes: 5 }), { nowMs: START + 10 * 60000 });
  const settledWidth = (settled.hoursMax - settled.hoursMin) / settled.hoursMin;
  const rushedWidth = (rushed.hoursMax - rushed.hoursMin) / rushed.hoursMin;
  assert.ok(rushedWidth > settledWidth, 'an unsettled rate deserves a wider window');
  assert.match(rushed.note, /not settled/i);
});

test('a finished block finishes now, and a block with no row rate says why', () => {
  const done = estimateFinish(BLOCK, run({ count: 10 }), { nowMs: START });
  assert.equal(done.rowsLeft, 0);
  assert.match(done.note, /finished/i);

  const noRows = estimateFinish(BLOCK, run({ count: 4, rows: 0 }), { nowMs: START });
  assert.equal(noRows.hoursMin, null);
  assert.match(noRows.note, /log rows/i);
});

test('yield ranking lists only blocks far enough through, best first', () => {
  const picks = [...run({ blockId: 'nw', count: 10, kg: 400 }), ...run({ blockId: 'se', count: 5, rows: 10, kg: 500 })];
  const ranked = yieldRanking([BLOCK, OTHER], picks);
  assert.equal(ranked.length, 2);
  assert.ok(ranked[0].kgPerHa >= ranked[1].kgPerHa, 'best yield first');
  assert.equal(ranked.find((row) => row.block.id === 'nw').extrapolated, false);

  const barely = yieldRanking([BLOCK], run({ count: 1 }));
  assert.equal(barely.length, 0, 'a block below the floor is left out entirely');
});

test('the day summary counts loads, blocks and finished blocks', () => {
  const picks = [...run({ blockId: 'nw', count: 10 }), ...run({ blockId: 'se', count: 2 })];
  const day = daySummary([BLOCK, OTHER], picks);
  assert.equal(day.kg, 12 * 400);
  assert.equal(day.blocksStarted, 2);
  assert.equal(day.blocksComplete, 1);
  assert.match(day.note, /12 loads/);

  const empty = daySummary([BLOCK], []);
  assert.equal(empty.kg, 0);
  assert.match(empty.note, /nothing logged/i);
});
