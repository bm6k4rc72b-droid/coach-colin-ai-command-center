/**
 * Vegetation indices: the maths, and the line between where and why.
 *
 * @module tests/black-optic-6/spectral
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableIndices, computeIndex, INDICES, indexColour, indexMap, interpret,
  statistics, TIERS, toReflectance, worstZones,
} from '../../public/black-optic-6/js/spectral.js';

test('every index declares its bands, its range and its failure mode', () => {
  const seen = new Set();
  for (const index of INDICES) {
    assert.ok(index.id && !seen.has(index.id), `duplicate index ${index.id}`);
    seen.add(index.id);
    assert.ok(index.bands.length >= 2, `${index.id} needs bands`);
    assert.ok(index.range[1] > index.range[0], `${index.id} has no range`);
    assert.ok(index.limit.length > 30, `${index.id} must state how it fails`);
    assert.equal(typeof index.compute, 'function');
  }
});

test('an ordinary camera unlocks only the visible indices', () => {
  const visible = availableIndices(['red', 'green', 'blue']).map((index) => index.id);
  assert.deepEqual(visible.sort(), ['exg', 'tgi', 'vari']);
  assert.ok(!visible.includes('ndvi'), 'NDVI must not be offered without near-infrared');

  const multispectral = availableIndices(['blue', 'green', 'red', 'rededge', 'nir']).map((i) => i.id);
  assert.ok(multispectral.includes('ndvi') && multispectral.includes('ndre'));
});

test('NDVI separates vigorous canopy from stressed, and is bounded', () => {
  const healthy = computeIndex('ndvi', { nir: 0.5, red: 0.05 });
  const stressed = computeIndex('ndvi', { nir: 0.25, red: 0.2 });
  const soil = computeIndex('ndvi', { nir: 0.25, red: 0.28 });
  assert.ok(healthy > 0.7, `healthy canopy should be high, got ${healthy}`);
  assert.ok(stressed < healthy && stressed > 0);
  assert.ok(soil < 0, 'bare soil goes negative');
  for (const index of INDICES) {
    const value = computeIndex(index, { nir: 1, red: 0, green: 0, blue: 0, rededge: 0.001 });
    if (value === null) continue;
    assert.ok(value >= index.range[0] && value <= index.range[1], `${index.id} escaped its range`);
  }
});

test('TGI separates canopy from soil instead of saturating', () => {
  const canopy = computeIndex('tgi', { red: 0.20, green: 0.35, blue: 0.15 });
  const soil = computeIndex('tgi', { red: 0.40, green: 0.35, blue: 0.30 });
  const index = INDICES.find((entry) => entry.id === 'tgi');
  assert.ok(canopy > soil * 5, 'canopy and soil must be far apart, not both clamped');
  assert.ok(canopy < index.range[1], 'a real canopy value must sit inside the range, not on its edge');
  assert.ok(soil > index.range[0]);
});

test('a missing band returns null rather than a plausible number', () => {
  assert.equal(computeIndex('ndvi', { red: 0.1 }), null);
  assert.equal(computeIndex('ndre', { nir: 0.4 }), null);
  assert.equal(computeIndex('nonexistent', { nir: 1, red: 0 }), null);
});

test('reflectance calibration scales against a known panel', () => {
  assert.ok(Math.abs(toReflectance(100, 200, 0.5) - 0.25) < 1e-9);
  assert.equal(toReflectance(100, 0, 0.5), 0, 'a panel with no signal cannot calibrate anything');
  // The same leaf under twice the light gives the same reflectance once calibrated.
  const dim = toReflectance(60, 120, 0.5);
  const bright = toReflectance(120, 240, 0.5);
  assert.ok(Math.abs(dim - bright) < 1e-9, 'calibration is what makes two flights comparable');
});

test('statistics report the spread, not only the middle', () => {
  const stats = statistics([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  assert.equal(stats.count, 9);
  assert.ok(Math.abs(stats.mean - 0.5) < 1e-9);
  assert.ok(stats.p10 < stats.median && stats.median < stats.p90);
  assert.equal(statistics([]).count, 0);
});

/**
 * A synthetic scene: green canopy on the left, bare soil on the right.
 *
 * @returns {{bands: object, width: number, height: number}} The image.
 */
function scene() {
  const width = 40;
  const height = 20;
  const count = width * height;
  const red = new Uint8ClampedArray(count);
  const green = new Uint8ClampedArray(count);
  const blue = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i += 1) {
    const canopy = (i % width) < width / 2;
    red[i] = canopy ? 60 : 150;
    green[i] = canopy ? 150 : 130;
    blue[i] = canopy ? 50 : 110;
  }
  return { bands: { red, green, blue }, width, height };
}

test('the ground is masked out before anything is averaged', () => {
  const image = scene();
  const masked = indexMap(image, 'vari', { canopyThreshold: 0.05 });
  const unmasked = indexMap(image, 'vari', {});
  assert.ok(masked.stats.count < unmasked.stats.count, 'masking must exclude pixels');
  assert.ok(
    masked.stats.mean > unmasked.stats.mean,
    'averaging the bare alleys drags the index down and reads as stress',
  );
});

test('worst zones are ranked lowest first and stay inside the grid', () => {
  const image = scene();
  const map = indexMap(image, 'vari', {});
  const zones = worstZones(map, image.width, image.height, 4);
  assert.ok(zones.length > 0);
  assert.equal(zones[0].rank, 1);
  for (let i = 1; i < zones.length; i += 1) {
    assert.ok(zones[i].mean >= zones[i - 1].mean, 'zones must be ordered worst first');
    assert.ok(zones[i].col < 4 && zones[i].row < 4);
  }
});

test('false colour runs red to green and survives a masked pixel', () => {
  const low = indexColour(0, [0, 1]);
  const high = indexColour(1, [0, 1]);
  assert.ok(low[0] > low[1], 'the low end is red');
  assert.ok(high[1] > high[0], 'the high end is green');
  assert.deepEqual(indexColour(NaN, [0, 1]), [18, 22, 28], 'masked pixels are ground, not a colour');
});

test('the reading always refuses to name a nutrient', () => {
  const image = scene();
  const map = indexMap(image, 'vari', { canopyThreshold: 0.05 });
  for (const calibrated of [true, false]) {
    const reading = interpret(map.index, map.stats, calibrated);
    const denied = reading.doesNotSupport.join(' ');
    assert.match(denied, /which nutrient/i, 'the console must never imply it reads nitrogen');
    assert.match(denied, /no absolute|absolute score/i);
    assert.ok(reading.headline.length > 20);
    assert.ok(reading.next.length > 20);
    if (!calibrated) {
      assert.match(denied, /panel/i, 'without a panel, flights are not comparable and it must say so');
    }
  }
});

test('a uniform frame is reported as uniform rather than as healthy', () => {
  const uniform = statistics(Array.from({ length: 500 }, () => 0.42));
  const reading = interpret(INDICES[1], uniform, false);
  assert.match(reading.headline, /uniform/i);
  assert.match(reading.next, /rarely justify|compare/i);
});

test('the instrument ladder is honest about the top end', () => {
  assert.ok(TIERS.length >= 4);
  const hyperspectral = TIERS.find((tier) => /hyperspectral/i.test(tier.tier));
  assert.match(hyperspectral.note, /tissue tests/i, 'the expensive instrument still cannot do chemistry');
  const free = TIERS.find((tier) => /nothing|free/i.test(tier.cost));
  assert.ok(free, 'there must be a tier that costs nothing');
});
