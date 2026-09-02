/**
 * Tests for the parts that turn detections into decisions: tracking, the
 * harvest forecast, the ledger and the row-walk transect.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ClusterTracker, iou } from '../../public/harvest-eye/js/tracker.js';
import {
  forecastHarvest, formatDays, ripeningVelocity, spoilageRisk, temperatureFactor,
} from '../../public/harvest-eye/js/forecast.js';
import { Ledger, MAX_SCANS, toCsv, toGeoJson } from '../../public/harvest-eye/js/ledger.js';
import { RowWalk, haversine } from '../../public/harvest-eye/js/rowwalk.js';
import { CROP_PROFILES } from '../../public/harvest-eye/js/crops.js';

const TOMATO = CROP_PROFILES.find((profile) => profile.id === 'tomato');
const DAY = 86_400_000;

/**
 * Minimal in-memory stand-in for the Web Storage API.
 *
 * @returns {Storage} Storage-shaped object backed by a Map.
 */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
}

/**
 * Build a cluster-shaped box for tracker tests.
 *
 * @param {number} x Left edge.
 * @param {number} y Top edge.
 * @param {number} maturity Maturity in [0,1].
 * @returns {object} Cluster stand-in.
 */
function box(x, y, maturity) {
  return {
    x, y, w: 20, h: 20, area: 400, maturity, hue: 10, confidence: 0.8,
    fillRatio: 0.78, texture: 0.1, count: 1, stage: 'Ripening', color: '#f28c28',
  };
}

/* ------------------------------------------------------------- tracking */

test('iou is 1 for identical boxes and 0 for disjoint ones', () => {
  assert.equal(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }), 1);
  assert.equal(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 40, w: 10, h: 10 }), 0);
});

test('a fruit keeps its identity as it drifts across frames', () => {
  const tracker = new ClusterTracker({ prefix: 'TM' });
  const first = tracker.update([box(10, 10, 0.5)], TOMATO.harvestAt);
  const id = first.tracks[0].id;
  assert.equal(id, 'TM001');
  for (let step = 1; step <= 4; step += 1) {
    const next = tracker.update([box(10 + step * 3, 10, 0.5)], TOMATO.harvestAt);
    assert.equal(next.tracks.length, 1);
    assert.equal(next.tracks[0].id, id, 'the same fruit must keep its label');
  }
});

test('a fruit that jumps across the frame becomes a new identity', () => {
  const tracker = new ClusterTracker({ prefix: 'TM' });
  tracker.update([box(10, 10, 0.5)], TOMATO.harvestAt);
  const next = tracker.update([box(120, 90, 0.5)], TOMATO.harvestAt);
  assert.equal(next.tracks[0].id, 'TM002');
});

test('crossing the harvest threshold is reported once, not every frame', () => {
  const tracker = new ClusterTracker({ prefix: 'TM', smoothing: 1 });
  assert.equal(tracker.update([box(10, 10, 0.5)], TOMATO.harvestAt).ripened.length, 0);
  assert.equal(tracker.update([box(10, 10, 0.9)], TOMATO.harvestAt).ripened.length, 1);
  assert.equal(tracker.update([box(10, 10, 0.92)], TOMATO.harvestAt).ripened.length, 0);
});

test('a track survives a brief dropout and then expires', () => {
  const tracker = new ClusterTracker({ prefix: 'TM', maxMissing: 2 });
  tracker.update([box(10, 10, 0.5)], TOMATO.harvestAt);
  tracker.update([], TOMATO.harvestAt);
  assert.equal(tracker.tracks.size, 1, 'one missed frame should not drop the fruit');
  tracker.update([], TOMATO.harvestAt);
  tracker.update([], TOMATO.harvestAt);
  assert.equal(tracker.tracks.size, 0, 'a long absence should retire the track');
});

test('maturity is smoothed rather than snapped to the newest frame', () => {
  const tracker = new ClusterTracker({ prefix: 'TM', smoothing: 0.35 });
  tracker.update([box(10, 10, 0.4)], TOMATO.harvestAt);
  const next = tracker.update([box(10, 10, 0.9)], TOMATO.harvestAt);
  const value = next.tracks[0].maturity;
  assert.ok(value > 0.4 && value < 0.9, `smoothed maturity ${value} should lag the jump`);
});

/* ------------------------------------------------------------- forecast */

test('temperature warps the ripening rate around the reference', () => {
  assert.equal(temperatureFactor(22, 22), 1);
  assert.ok(temperatureFactor(32, 22) > 1.9);
  assert.ok(temperatureFactor(12, 22) < 0.55);
  assert.equal(temperatureFactor(Number.NaN, 22), 1);
});

test('with no history the forecast falls back to the nominal cycle', () => {
  const forecast = forecastHarvest(TOMATO, 0.32, { tempC: 22 });
  assert.equal(forecast.basis, 'nominal');
  const expected = (TOMATO.harvestAt - 0.32) * TOMATO.cycleDays;
  assert.ok(Math.abs(forecast.daysToHarvest - expected) < 0.01);
});

test('a measured ripening rate replaces the nominal guess', () => {
  const now = Date.now();
  const scans = [
    { ts: now - 6 * DAY, meanMaturity: 0.30 },
    { ts: now - 3 * DAY, meanMaturity: 0.45 },
    { ts: now, meanMaturity: 0.60 },
  ];
  const measured = ripeningVelocity(scans);
  assert.ok(Math.abs(measured.velocity - 0.05) < 1e-6, 'should read 5 % per day');
  assert.ok(measured.r2 > 0.99);
  const forecast = forecastHarvest(TOMATO, 0.6, { measured, tempC: 22 });
  assert.equal(forecast.basis, 'measured');
  assert.ok(Math.abs(forecast.daysToHarvest - (TOMATO.harvestAt - 0.6) / 0.05) < 0.01);
  assert.ok(forecast.confidence > 0.8);
});

test('a noisy or backwards history is not trusted over the nominal rate', () => {
  const now = Date.now();
  const noisy = ripeningVelocity([
    { ts: now - 4 * DAY, meanMaturity: 0.6 },
    { ts: now - 2 * DAY, meanMaturity: 0.2 },
    { ts: now, meanMaturity: 0.55 },
  ]);
  assert.equal(forecastHarvest(TOMATO, 0.55, { measured: noisy }).basis, 'nominal');
});

test('velocity needs two readings far enough apart to mean anything', () => {
  const now = Date.now();
  assert.equal(ripeningVelocity([{ ts: now, meanMaturity: 0.4 }]), null);
  assert.equal(ripeningVelocity([
    { ts: now, meanMaturity: 0.4 },
    { ts: now + 3600_000, meanMaturity: 0.9 },
  ]), null, 'an hour apart is camera noise, not ripening');
});

test('status walks from immature through the window to full colour', () => {
  const at = (m) => forecastHarvest(TOMATO, m, { tempC: 22 }).status;
  assert.equal(at(0.1), 'immature');
  assert.equal(at(0.5), 'approaching');
  assert.equal(at(0.75), 'ready');
  assert.equal(at(0.93), 'closing');
  assert.equal(at(0.99), 'peak');
});

test('days to harvest never goes negative once the window has opened', () => {
  const forecast = forecastHarvest(TOMATO, 0.99, { tempC: 22 });
  assert.equal(forecast.daysToHarvest, 0);
  assert.equal(forecast.daysToOverripe, 0);
});

test('spoilage risk is zero before the window and grows inside it', () => {
  const rate = 1 / TOMATO.cycleDays;
  assert.equal(spoilageRisk(TOMATO, 0.4, rate, 100).lossPerDay, 0);
  const inside = spoilageRisk(TOMATO, 0.8, rate, 100);
  assert.ok(inside.lossPerDay > 0);
  assert.ok(inside.daysLeft > 0 && inside.daysLeft < TOMATO.cycleDays);
});

test('day counts are phrased the way a grower would say them', () => {
  assert.equal(formatDays(0), 'today');
  assert.equal(formatDays(1), 'tomorrow');
  assert.equal(formatDays(6.4), '6 days');
  assert.equal(formatDays(21), '3 weeks');
  assert.equal(formatDays(Number.NaN), '—');
});

/* --------------------------------------------------------------- ledger */

test('scans round-trip through storage and group by plot and crop', () => {
  const ledger = new Ledger(memoryStorage());
  ledger.add({ plot: 'North 4', cropId: 'tomato', meanMaturity: 0.4 });
  ledger.add({ plot: 'North 4', cropId: 'tomato', meanMaturity: 0.5 });
  ledger.add({ plot: 'North 4', cropId: 'chili', meanMaturity: 0.9 });
  ledger.add({ plot: 'South 1', cropId: 'tomato', meanMaturity: 0.2 });

  assert.equal(ledger.scans().length, 4);
  assert.equal(ledger.history('North 4', 'tomato').length, 2);
  assert.deepEqual(ledger.plots(), ['South 1', 'North 4']);

  const history = ledger.history('North 4', 'tomato');
  assert.ok(history[0].ts <= history[1].ts, 'history is chronological for the regression');
});

test('a corrupted store degrades to empty instead of throwing', () => {
  const storage = memoryStorage();
  storage.setItem('harvesteye.scans.v1', '{not json');
  const ledger = new Ledger(storage);
  assert.deepEqual(ledger.scans(), []);
  assert.doesNotThrow(() => ledger.add({ plot: 'A', cropId: 'tomato', meanMaturity: 0.5 }));
  assert.equal(ledger.scans().length, 1);
});

test('the ledger is capped so a long season cannot exhaust storage', () => {
  const ledger = new Ledger(memoryStorage());
  const rows = Array.from({ length: MAX_SCANS + 20 }, (_, i) => ({ id: `x${i}`, ts: i }));
  ledger.write('harvesteye.scans.v1', rows);
  ledger.add({ plot: 'A', cropId: 'tomato', meanMaturity: 0.5 });
  assert.equal(ledger.scans().length, MAX_SCANS);
});

test('settings and taught profiles persist independently', () => {
  const ledger = new Ledger(memoryStorage());
  ledger.saveSettings({ plot: 'West 2' });
  ledger.saveSettings({ tempC: 30 });
  assert.deepEqual(ledger.settings(), { plot: 'West 2', tempC: 30 });
  ledger.saveProfileOverride('tomato', { huePath: [{ h: 5, m: 1 }] });
  assert.equal(ledger.profileOverrides().tomato.huePath[0].h, 5);
  ledger.resetProfiles();
  assert.deepEqual(ledger.profileOverrides(), {});
  assert.equal(ledger.settings().plot, 'West 2', 'resetting colours must not clear settings');
});

test('CSV export quotes fields that would otherwise break the file', () => {
  const csv = toCsv([{
    id: 's1', ts: 0, plot: 'North "big", row 3', cropId: 'tomato',
    lat: 1.5, lon: -2.5, accuracy: 4, meanMaturity: 0.5, readyShare: 0.25,
    decayShare: 0, clusters: 3, fruitEstimate: 9, confidence: 0.7, tempC: 22,
    note: 'line\nbreak',
  }]);
  const [header, ...rest] = csv.trim().split('\n');
  assert.ok(header.startsWith('id,timestamp,plot,crop'));
  assert.ok(rest.join('\n').includes('"North ""big"", row 3"'));
  assert.ok(rest.join('\n').includes('"line\nbreak"'));
});

test('GeoJSON export drops scans that have no fix', () => {
  const geo = toGeoJson([
    { id: 'a', ts: 0, plot: 'A', cropId: 'tomato', lat: 10, lon: 20, meanMaturity: 0.5 },
    { id: 'b', ts: 0, plot: 'A', cropId: 'tomato', lat: null, lon: null, meanMaturity: 0.5 },
  ]);
  assert.equal(geo.type, 'FeatureCollection');
  assert.equal(geo.features.length, 1);
  assert.deepEqual(geo.features[0].geometry.coordinates, [20, 10], 'GeoJSON is lon,lat');
});

/* ------------------------------------------------------------- row walk */

test('haversine measures a short row in metres', () => {
  const metres = haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 });
  assert.ok(Math.abs(metres - 111.3) < 0.5, `expected ~111 m, got ${metres}`);
});

test('a walked row bins readings by distance', () => {
  const row = new RowWalk({ binMetres: 5 });
  for (let step = 0; step < 12; step += 1) {
    row.add({
      lat: 0,
      lon: (step * 2) / 111_320,
      accuracy: 5,
      maturity: step < 6 ? 0.3 : 0.9,
      readyShare: step < 6 ? 0 : 1,
      fruit: 4,
      ts: step * 1000,
    });
  }
  const summary = row.summary();
  assert.ok(Math.abs(summary.distance - 22) < 1.5, `expected ~22 m, got ${summary.distance}`);
  assert.equal(summary.samples, 12);
  assert.ok(summary.readyShare > 0.4 && summary.readyShare < 0.75);
  assert.ok(summary.fruitPerMetre > 0);
  assert.ok(summary.hotspots[0].readyShare === 1, 'the ripe end of the row leads the hotspots');
});

test('GPS jitter does not inflate the transect length', () => {
  const row = new RowWalk();
  for (let i = 0; i < 40; i += 1) {
    row.add({ lat: 0, lon: (Math.random() * 0.5) / 111_320, accuracy: 5, maturity: 0.5, readyShare: 0.5, fruit: 1 });
  }
  assert.equal(row.summary().distance, 0, 'sub-metre wobble is not walking');
});

test('a poor fix is ignored for distance but still contributes a reading', () => {
  const row = new RowWalk({ maxAccuracy: 20 });
  row.add({ lat: 0, lon: 0, accuracy: 5, maturity: 0.5, readyShare: 0.5, fruit: 2 });
  row.add({ lat: 0, lon: 0.001, accuracy: 90, maturity: 0.9, readyShare: 1, fruit: 2 });
  const summary = row.summary();
  assert.equal(summary.distance, 0);
  assert.equal(summary.samples, 2);
});

test('resetting clears the transect', () => {
  const row = new RowWalk();
  row.add({ maturity: 0.5, readyShare: 0.5, fruit: 1 });
  row.reset();
  assert.equal(row.summary().samples, 0);
  assert.deepEqual(row.strip(), []);
});
