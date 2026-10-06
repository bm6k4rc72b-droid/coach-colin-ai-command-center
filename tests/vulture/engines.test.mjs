/**
 * VultureSystemV1 engine tests: geometry, tracking, zone occupancy, line
 * counting, kinetics (angles, reps, scale, force) and the route-risk model.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coverage, haversine, iou, jointAngle, pointInPolygon, polygonArea, resample, samplePolygon, segmentsIntersect, subdivideQuad,
} from '../../public/vulture/js/geometry.js';
import { Tracker } from '../../public/vulture/js/tracker.js';
import { LotModel, samplesToCsv } from '../../public/vulture/js/lot.js';
import { KineticsEngine } from '../../public/vulture/js/kinetics.js';
import {
  band, darkness, elevationStats, routeScore, scoreSegment, sunAltitude, surfaceInfo, weatherHazard,
} from '../../public/vulture/js/risk.js';
import { simulatedPose } from '../../public/vulture/js/sim.js';

const sq = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }];

test('geometry basics', () => {
  assert.ok(pointInPolygon({ x: 0.2, y: 0.2 }, sq));
  assert.ok(!pointInPolygon({ x: 0.4, y: 0.2 }, sq));
  assert.ok(Math.abs(polygonArea(sq) - 0.04) < 1e-12);
  assert.equal(iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }), 1);
  assert.ok(Math.abs(iou({ x: 0, y: 0, w: 2, h: 1 }, { x: 1, y: 0, w: 2, h: 1 }) - 1 / 3) < 1e-12);
  const s = samplePolygon(sq);
  assert.equal(coverage(s, { x: 0, y: 0, w: 1, h: 1 }), 1);
  assert.ok(Math.abs(coverage(s, { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }) - 0.5) < 0.05);
  assert.ok(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }));
  assert.ok(!segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }));
  assert.ok(Math.abs(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }) - 90) < 1e-9);
  assert.ok(Math.abs(jointAngle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }) - 180) < 1e-9);
  const stalls = subdivideQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 4);
  assert.equal(stalls.length, 4);
  assert.ok(Math.abs(polygonArea(stalls[2]) - 0.25) < 1e-12);
});

test('haversine and resample', () => {
  const d = haversine(51.5, -0.1, 51.5, -0.09);
  assert.ok(Math.abs(d - 694) < 3, `got ${d}`);
  const r = resample([[51.5, -0.1], [51.5, -0.09]], 100);
  assert.equal(r.pts.length, 8); // 0,100..600, end at ~694
  assert.ok(Math.abs(r.dist[r.dist.length - 1] - d) < 1e-6);
  for (let i = 1; i < r.dist.length - 1; i++) assert.ok(Math.abs(r.dist[i] - 100 * i) < 1e-6);
});

test('tracker keeps identity across frames and misses', () => {
  const tr = new Tracker({ minHits: 2 });
  let t = 0;
  const car = (x) => ({ label: 'car', score: 0.9, x, y: 0.5, w: 0.1, h: 0.08 });
  tr.update([car(0.1)], t += 100);
  const v = tr.update([car(0.11)], t += 100);
  assert.equal(v.length, 1);
  const id = v[0].id;
  tr.update([], t += 100); // occluded
  const v2 = tr.update([car(0.13)], t += 100);
  assert.equal(v2[0].id, id);
  // A truck flicker stays the same vehicle.
  const v3 = tr.update([{ ...car(0.14), label: 'truck' }], t += 100);
  assert.equal(v3[0].id, id);
});

test('space occupancy is debounced and produces dwell stats', () => {
  const lot = new LotModel([{ id: 's1', name: 'Space 1', kind: 'space', points: sq }], { enterMs: 2000, exitMs: 4000, sampleMs: 1000 });
  const parked = [{ id: 1, label: 'car', box: { x: 0.1, y: 0.12, w: 0.2, h: 0.17 }, foot: { x: 0.2, y: 0.29 } }];
  const events = [];
  for (let t = 0; t <= 1500; t += 100) events.push(...lot.update(parked, t));
  assert.equal(lot.summary().occupied, 0, 'not occupied before enterMs');
  for (let t = 1600; t <= 2100; t += 100) events.push(...lot.update(parked, t));
  assert.equal(lot.summary().occupied, 1);
  assert.equal(events.filter((e) => e.type === 'space-occupied').length, 1);
  // A one-second gap in detections does not vacate it.
  for (let t = 2200; t <= 3200; t += 100) lot.update([], t);
  for (let t = 3300; t <= 60000; t += 100) lot.update(parked, t);
  assert.equal(lot.summary().occupied, 1);
  for (let t = 60100; t <= 64200; t += 100) events.push(...lot.update([], t));
  assert.equal(lot.summary().occupied, 0);
  const vac = events.find((e) => e.type === 'space-vacated');
  assert.ok(vac && vac.dwell > 55000 && vac.dwell < 62000);
  const a = lot.analytics(64200)[0];
  assert.equal(a.turnovers, 1);
  assert.ok(a.utilisation > 85 && a.utilisation < 100, `util ${a.utilisation}`);
  assert.ok(lot.samples.length > 50);
  const csv = samplesToCsv(lot.samples, lot.zones);
  assert.match(csv.split('\n')[0], /Space 1/);
});

test('people in restricted zone and line counting by direction', () => {
  const zones = [
    { id: 'r', name: 'Bay', kind: 'restricted', points: sq },
    { id: 'l', name: 'Gate', kind: 'line', points: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }] },
  ];
  const lot = new LotModel(zones);
  const ev1 = lot.update([{ id: 7, label: 'person', box: { x: 0.15, y: 0.1, w: 0.05, h: 0.15 }, foot: { x: 0.175, y: 0.25 } }], 0);
  assert.equal(ev1.filter((e) => e.type === 'zone-enter').length, 1);
  const ev2 = lot.update([{ id: 7, label: 'person', box: { x: 0.15, y: 0.1, w: 0.05, h: 0.15 }, foot: { x: 0.175, y: 0.25 } }], 100);
  assert.equal(ev2.length, 0, 'no repeat while still inside');
  const car = (fx, px) => ({ id: 9, label: 'car', box: { x: fx - 0.05, y: 0.4, w: 0.1, h: 0.1 }, foot: { x: fx, y: 0.5 }, prevFoot: { x: px, y: 0.5 } });
  lot.update([car(0.55, 0.45)], 200);
  lot.update([car(0.45, 0.55)], 300);
  lot.update([car(0.43, 0.45)], 400); // no crossing
  const s = lot.summary();
  assert.equal(s.countIn + s.countOut, 2);
  assert.equal(s.countIn, 1);
  assert.equal(s.countOut, 1);
});

test('kinetics: angles, auto-scale, squat reps and force from simulated pose', () => {
  const k = new KineticsEngine({ massKg: 80, heightM: 1.8, exercise: 'squat' });
  let f;
  // 10 s of squats at 30 fps, 2.5 s per rep.
  for (let i = 0; i <= 300; i++) {
    const t = i * (1000 / 30);
    const lm = simulatedPose('squat', t / 1000, { period: 2.5 });
    f = k.update(lm, null, t, 16 / 9);
  }
  assert.ok(f.calibrated, 'standing frames calibrate scale');
  assert.ok(k.reps.length >= 3 && k.reps.length <= 4, `reps ${k.reps.length}`);
  assert.ok(k.reps[0].depth < 100, `depth ${k.reps[0].depth}`);
  assert.ok(k.rom.lKnee.max > 165);
  // Mean force over whole cycles ≈ body weight (no net vertical acceleration).
  const forces = k.log.map((r) => r.force).filter(Number.isFinite);
  const meanF = forces.reduce((a, b) => a + b, 0) / forces.length;
  assert.ok(Math.abs(meanF - 80 * 9.80665) < 60, `mean force ${meanF}`);
  assert.ok(f.activation.Quads >= 0 && f.activation.Quads <= 100);
  assert.match(k.toCsv().split('\n')[0], /lKnee_deg/);
});

test('kinetics: running cadence and speed', () => {
  const k = new KineticsEngine({ heightM: 1.75, exercise: 'run' });
  let f;
  for (let i = 0; i <= 240; i++) {
    const t = i * (1000 / 60);
    f = k.update(simulatedPose('stand', 0), null, t, 16 / 9); // calibrate first
  }
  for (let i = 0; i <= 480; i++) {
    const t = 4000 + i * (1000 / 60);
    f = k.update(simulatedPose('run', t / 1000, { cadence: 170, speed: 0.12 }), null, t, 16 / 9);
  }
  assert.ok(Math.abs(f.cadence - 170) < 12, `cadence ${f.cadence}`);
  assert.ok(f.speed > 0, 'speed measured from hip translation');
});

test('risk model', () => {
  // Summer noon in London: sun high. Midnight: below horizon.
  assert.ok(sunAltitude(new Date('2026-06-21T12:00:00Z'), 51.5, -0.1) > 55);
  assert.ok(sunAltitude(new Date('2026-06-21T00:00:00Z'), 51.5, -0.1) < 0);
  assert.equal(darkness(30), 0);
  assert.equal(darkness(-10), 1);
  assert.equal(surfaceInfo({ surface: 'gravel' }).bucket, 'Gravel / dirt');
  assert.ok(weatherHazard({ precipitation: 2, temperature_2m: 0 }) > 0.6);
  const day = scoreSegment({ lengthM: 100, lamps: 0, pois: 5, tags: { highway: 'footway', surface: 'asphalt' }, grade: 0 }, { dark: 0, weather: 0 });
  const night = scoreSegment({ lengthM: 100, lamps: 0, pois: 0, tags: { highway: 'path', surface: 'dirt' }, grade: 0.12 }, { dark: 1, weather: 0.3 });
  assert.ok(day.score < 30, `day ${day.score}`);
  assert.ok(night.score > 60, `night ${night.score}`);
  assert.equal(band(day.score), 'LOW');
  assert.equal(band(night.score), 'MODERATE');
  assert.equal(band(71), 'HIGH');
  const r = routeScore([{ score: 10, lengthM: 900 }, { score: 90, lengthM: 100 }]);
  assert.ok(r > 18 && r < 50, `route ${r}`);
  const e = elevationStats([100, 110, 105, 120], [0, 100, 200, 300]);
  assert.equal(e.ascent, 25);
  assert.equal(e.descent, 5);
  assert.ok(Math.abs(e.maxGrade - 15) < 1e-9);
});

test('route analysis pipeline with mocked open-data APIs', async () => {
  const { analyseRoute } = await import('../../public/vulture/js/route.js');
  // 1 km straight east-west route; the eastern half is an unlit dirt path.
  const line = [[51.5, -0.1], [51.5, -0.0856]];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.includes('/v1/elevation')) {
      const lons = new URL(u).searchParams.get('longitude').split(',').map(Number);
      return json({ elevation: lons.map((lon) => 20 + (lon + 0.1) * 2000) }); // gentle climb eastward
    }
    if (u.includes('/v1/forecast')) return json({ current: { temperature_2m: 12, precipitation: 0, wind_speed_10m: 10, weather_code: 1 } });
    if (u.includes('interpreter')) {
      assert.match(decodeURIComponent(init.body), /street_lamp/);
      const lamps = [];
      for (let lon = -0.1; lon < -0.093; lon += 0.0005) lamps.push({ type: 'node', id: lamps.length, lat: 51.5, lon });
      return json({ elements: [
        { type: 'way', id: 1, tags: { highway: 'footway', surface: 'asphalt', lit: 'yes' }, geometry: [{ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: -0.093 }] },
        { type: 'way', id: 2, tags: { highway: 'path', surface: 'dirt' }, geometry: [{ lat: 51.5, lon: -0.093 }, { lat: 51.5, lon: -0.0856 }] },
        ...lamps,
        { type: 'node', id: 999, lat: 51.5001, lon: -0.099, tags: { amenity: 'cafe' } },
      ] });
    }
    throw new Error(`unexpected ${u}`);
  };
  try {
    const night = await analyseRoute(line, new Date('2026-12-21T23:00:00Z'));
    const day = await analyseRoute(line, new Date('2026-06-21T12:00:00Z'));
    assert.equal(night.warnings.length, 0, night.warnings.join());
    assert.ok(Math.abs(night.total - 1000) < 30, `length ${night.total}`);
    assert.ok(night.segs.length >= 8);
    const west = night.segs.filter((s) => s.b[1] < -0.094);
    const east = night.segs.filter((s) => s.a[1] > -0.092);
    assert.ok(west.every((s) => s.tags.lit === 'yes'));
    assert.ok(east.every((s) => s.tags.surface === 'dirt'));
    const mean = (a) => a.reduce((x, s) => x + s.score, 0) / a.length;
    assert.ok(mean(east) > mean(west) + 20, `east ${mean(east)} west ${mean(west)}`);
    assert.ok(night.score > day.score, `night ${night.score} day ${day.score}`);
    assert.ok(night.surface.find(([k]) => k === 'Gravel / dirt')[1] > 40);
    assert.ok(night.elevStats.ascent > 0);
    assert.ok(night.lampsPerKm > 10);
  } finally {
    globalThis.fetch = realFetch;
  }
});
