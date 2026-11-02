/**
 * The site scanner: buildings from open data, sunlight and shading, occupant
 * load and evacuation (IBC + SFPE), people flow, and energy. Sun positions are
 * checked against NREL's SPA (pvlib), clear-sky irradiance against pvlib's
 * Haurwitz, and every formula against a hand calculation.
 *
 * @module tests/black-optic-6/site
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bounds, centroid, fromGeoJSON, fromLocal, fromOverpass, fromTwin, heightOf, inFootprint, metresPerDegLat, metresPerDegLon,
  metrics, normaliseRing, overpassQuery, parseLength, perimeter, signedArea, stitch, toLocal,
} from '../../public/black-optic-6/js/site/buildings.js';
import { clearSkyGhi, clearSkyYearKWh, dayTrack, rayIntervals, roofSunHours, shaded, sunAt, sunHoursGrid, sunTimes } from '../../public/black-optic-6/js/site/sun.js';
import {
  autoExits, effectiveWidth, evacuation, K, LOAD_FACTORS, maxSpecificFlow, maxTravel, occupancyFor, occupantLoad, speed,
} from '../../public/black-optic-6/js/site/egress.js';
import { cellOf, distanceField, distanceFrom, obstacles, route } from '../../public/black-optic-6/js/site/flow.js';
import { annualLoads, archiveUrl, degreeDays, heatLossCoefficient, pvPotential, readArchive } from '../../public/black-optic-6/js/site/energy.js';
import { TYPES } from '../../public/black-optic-6/js/ranch-sim.js';

const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (±${tol})`);
const ORIGIN = { lat: 38.5025, lon: -122.3977 };
const box = (x0, y0, x1, y1, h = 6, extra = {}) => ({ id: `${x0},${y0}`, kind: 'yes', outer: normaliseRing([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), holes: [], heightM: h, minHeightM: 0, levels: null, source: 'test', tags: {}, ...extra });

/* --------------------------------------------------------------- geometry */

test('metres per degree match WGS 84 at 38.5°, and local ↔ geographic round-trips', () => {
  // Closed forms on the WGS 84 ellipsoid: meridian radius M = a(1−e²)/(1−e²sin²φ)^1.5,
  // parallel radius N·cosφ with N = a/√(1−e²sin²φ); one degree is π/180 of each.
  const a = 6378137; const f = 1 / 298.257223563; const e2 = f * (2 - f);
  const ref = (deg) => {
    const p = (deg * Math.PI) / 180; const w = 1 - e2 * Math.sin(p) ** 2;
    return { lat: ((a * (1 - e2)) / w ** 1.5) * (Math.PI / 180), lon: ((a * Math.cos(p)) / Math.sqrt(w)) * (Math.PI / 180) };
  };
  for (const deg of [0, 38.5, 60]) {
    close(metresPerDegLat(deg), ref(deg).lat, 0.05, `lat ${deg}`);
    close(metresPerDegLon(deg), ref(deg).lon, 0.05, `lon ${deg}`);
  }
  close(metresPerDegLat(0), 110574.3, 0.5);
  close(metresPerDegLon(0), 111319.5, 0.5);
  const [x, y] = toLocal(ORIGIN, 38.5034, -122.3965);
  const back = fromLocal(ORIGIN, x, y);
  close(back.lat, 38.5034, 1e-12); close(back.lon, -122.3965, 1e-12);
});

test('area, perimeter, centroid and winding', () => {
  const sq = [[0, 0], [10, 0], [10, 6], [0, 6], [0, 0]];
  assert.equal(signedArea(sq), 60);
  assert.equal(signedArea([...sq].reverse()), -60);
  assert.equal(perimeter(sq), 32);
  assert.deepEqual(centroid(sq), [5, 3]);
  const L = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]];
  close(Math.abs(signedArea(L)), 6, 1e-12);
  const c = centroid(L); // pieces: 4×1 at (2, .5) and 1×2 at (.5, 2)
  close(c[0], (4 * 2 + 2 * 0.5) / 6, 1e-12); close(c[1], (4 * 0.5 + 2 * 2) / 6, 1e-12);
  assert.ok(signedArea(normaliseRing([...sq].reverse())) > 0);
});

test('heights: tag, then levels, then an assumed type default — and the source says which', () => {
  assert.equal(parseLength('12'), 12);
  assert.equal(parseLength('12.5 m'), 12.5);
  close(parseLength("40'"), 12.192, 1e-9);
  close(parseLength('40 ft'), 12.192, 1e-9);
  close(parseLength("12'6\""), 3.81, 1e-9);
  assert.equal(parseLength('tall'), null);
  assert.deepEqual(heightOf({ building: 'barn', height: '9.5' }), { heightM: 9.5, minHeightM: 0, levels: null, source: 'height tag' });
  assert.deepEqual(heightOf({ building: 'house', 'building:levels': '2', 'roof:levels': '1' }), { heightM: 9, minHeightM: 0, levels: 2, source: 'levels tag' });
  assert.equal(heightOf({ building: 'barn' }).source, 'type default');
  assert.equal(heightOf({ building: 'barn' }).heightM, 8);
  assert.equal(heightOf({ building: 'roof', min_height: '2.5', height: '4' }).minHeightM, 2.5);
});

test('Overpass: ways and multipolygon relations (with a courtyard) become local footprints', () => {
  const g = (pts) => pts.map(([dx, dy]) => ({ lat: ORIGIN.lat + dy / metresPerDegLat(ORIGIN.lat), lon: ORIGIN.lon + dx / metresPerDegLon(ORIGIN.lat) }));
  const json = {
    elements: [
      { type: 'way', id: 1, tags: { building: 'barn', 'building:levels': '2', name: 'Big barn' }, geometry: g([[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]) },
      {
        type: 'relation', id: 9, tags: { type: 'multipolygon', building: 'yes', height: '7' },
        members: [
          { type: 'way', role: 'outer', geometry: g([[50, 0], [80, 0], [80, 30]]) }, // outer ring split into two ways
          { type: 'way', role: 'outer', geometry: g([[50, 0], [50, 30], [80, 30]]) },
          { type: 'way', role: 'inner', geometry: g([[60, 10], [70, 10], [70, 20], [60, 20], [60, 10]]) },
        ],
      },
    ],
  };
  const bs = fromOverpass(json, ORIGIN);
  assert.equal(bs.length, 2);
  const barn = bs[0];
  assert.equal(barn.name, 'Big barn'); assert.equal(barn.heightM, 6); assert.equal(barn.source, 'levels tag');
  close(metrics(barn).footprintM2, 200, 1e-6);
  const court = metrics(bs[1]);
  close(court.footprintM2, 900 - 100, 1e-6);
  assert.ok(!inFootprint([65, 15], bs[1]), 'the courtyard is not inside the building');
  assert.ok(inFootprint([55, 5], bs[1]));
  assert.equal(stitch([[[0, 0], [1, 0]], [[1, 1], [0, 0]], [[1, 0], [1, 1]]]).length, 1);
  assert.match(overpassQuery([38.5, -122.4, 38.51, -122.39]), /way\["building"\]\(38\.500000,-122\.400000,38\.510000,-122\.390000\);.*out geom;$/);
});

test('GeoJSON (Microsoft footprints) and the ranch twin both become buildings', () => {
  const sq = [[0, 0], [0.0002, 0], [0.0002, 0.0001], [0, 0.0001], [0, 0]].map(([dlon, dlat]) => [ORIGIN.lon + dlon, ORIGIN.lat + dlat]);
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { height: 7.4, confidence: 0.9 }, geometry: { type: 'Polygon', coordinates: [sq] } }, { type: 'Feature', properties: { height: -1 }, geometry: { type: 'Polygon', coordinates: [sq] } }] };
  const [a, b] = fromGeoJSON(fc, ORIGIN);
  assert.equal(a.heightM, 7.4); assert.match(a.source, /Microsoft/);
  assert.equal(b.source, 'type default', 'Microsoft −1 means no estimate');
  close(metrics(a).footprintM2, (0.0002 * metresPerDegLon(ORIGIN.lat)) * (0.0001 * metresPerDegLat(ORIGIN.lat)), 1e-6);
  const twin = fromTwin({ objects: [{ id: 'b', type: 'barn', x: 10, z: -20, rot: 0 }, { id: 't', type: 'tree', x: 0, z: 0 }, { id: 'g', type: 'gate', x: 0, z: 0 }] }, TYPES);
  assert.equal(twin.length, 1, 'trees and gates are not buildings');
  close(metrics(twin[0]).footprintM2, 18 * 12, 1e-9);
  const c = metrics(twin[0]).centroid; close(c[0], 10, 1e-9); close(c[1], 20, 1e-9); // twin −z is north
  const bb = bounds(twin, 10); close(bb.x0, 10 - 9 - 10, 1e-9);
});

/* -------------------------------------------------------------------- sun */

test('sun position agrees with NREL SPA (pvlib) to a few hundredths of a degree', () => {
  // pvlib.solarposition.get_solarposition at 38.5025, −122.3977 (geometric elevation, azimuth from north).
  // [time, geometric elevation, apparent elevation, azimuth]
  const ref = [
    ['2026-06-21T20:10:00Z', 74.931, 74.935, 178.692],
    ['2026-12-21T16:00:00Z', 5.172, 5.329, 125.618],
    ['2026-03-20T23:30:00Z', 31.490, 31.517, 241.081],
  ];
  for (const [iso, el, app, az] of ref) {
    const s = sunAt(new Date(iso), ORIGIN.lat, ORIGIN.lon);
    close(s.geometricDeg, el, 0.02, `geometric elevation ${iso}`);
    close(s.altitudeDeg, app, 0.03, `apparent elevation (refraction) ${iso}`);
    close(s.azimuthDeg, az, 0.03, `azimuth ${iso}`);
    // Compare directions, not azimuths: near the zenith azimuth swings wildly for tiny sky errors.
    const r = (az * Math.PI) / 180; const h = (el * Math.PI) / 180;
    const want = [Math.sin(r) * Math.cos(h), Math.cos(r) * Math.cos(h), Math.sin(h)];
    const sep = Math.acos(Math.min(1, s.dir.reduce((acc, v, k) => acc + v * want[k], 0))) * 180 / Math.PI;
    assert.ok(sep < 0.2, `${iso}: ${sep.toFixed(4)}° from SPA's geometric sun (refraction included)`);
    close(Math.hypot(...s.dir), 1, 1e-12);
  }
  const t = sunTimes(new Date('2026-06-21T20:00:00Z'), ORIGIN.lat, ORIGIN.lon);
  // Sunrise equation with the standard −0.833° (refraction + solar radius) at the solstice declination.
  const r = Math.PI / 180; const dec = 23.4377 * r; const phi = ORIGIN.lat * r;
  const w0 = Math.acos((Math.sin(-0.833 * r) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  close(t.dayLengthH, (2 * w0) / r / 15, 0.02);
});

test('Haurwitz clear-sky irradiance matches pvlib, and the clear-sky year is sane', () => {
  close(clearSkyGhi(30), 888.2713, 1e-3);
  close(clearSkyGhi(60), 487.8941, 1e-3);
  close(clearSkyGhi(85), 48.6299, 1e-3);
  assert.equal(clearSkyGhi(95), 0);
  const year = clearSkyYearKWh(ORIGIN.lat, ORIGIN.lon, 2025, 60);
  // A clear-sky ceiling at 38.5°N: real Napa irradiation is ~1 800 kWh/m²/yr, so the ceiling sits above it.
  assert.ok(year > 1900 && year < 2600, `${year}`);
});

test('ray intervals and exact shading by a building', () => {
  const b = box(10, -5, 20, 5, 10);
  assert.deepEqual(rayIntervals([0, 0], [1, 0], b), [[10, 20]]);
  assert.deepEqual(rayIntervals([15, 0], [1, 0], b), [[0, 5]]);
  // Sun due east at 30°: the ray from the origin reaches x = 10 at height 10·tan30 = 5.77 m < 10 m → shaded.
  const at = (alt) => [Math.cos(alt * Math.PI / 180), 0, Math.sin(alt * Math.PI / 180)];
  assert.equal(shaded([0, 0], 0, at(30), [b]), true);
  // At 46°, 10·tan46 = 10.36 m > 10 m → the ray clears the roof.
  assert.equal(shaded([0, 0], 0, at(46), [b]), false);
  // Exactly the boundary: tan h = 1 → height 10 at the wall: not below the roof.
  assert.equal(shaded([0, 0], 0, at(45.0001), [b]), false);
  // A point already 5 m up clears it at a lower sun: 5 + 10·tan h > 10 ⇔ tan h > 0.5.
  assert.equal(shaded([0, 0], 5, at(27), [b]), false);
  assert.equal(shaded([0, 0], 5, at(26), [b]), true);
  // A raised structure (carport, min height 3 m) lets low sun under it from close enough.
  const carport = box(10, -5, 20, 5, 4, { minHeightM: 3 });
  // At 5° the ray is 0.87–1.75 m high over it: it passes underneath.
  assert.equal(shaded([0, 0], 0, at(5), [carport]), false);
  // At 10° it rises from 1.76 m to 3.53 m across it — into the 3–4 m roof slab: blocked.
  assert.equal(shaded([0, 0], 0, at(10), [carport]), true);
});

test('the shadow line on the ground matches h / tan(altitude)', () => {
  // A 10 m tall wall-like block; at noon in June the sun is ~75° high in the south.
  const b = box(-50, 0, 50, 2, 10);
  const date = new Date('2026-06-21T20:12:00Z');
  const s = sunAt(date, ORIGIN.lat, ORIGIN.lon);
  const reach = 10 / Math.tan(s.altitudeDeg * Math.PI / 180); // shadow falls north of the block
  assert.equal(shaded([0, 2 + reach - 0.05], 0, s.dir, [b]), true);
  assert.equal(shaded([0, 2 + reach + 0.05], 0, s.dir, [b]), false);
  assert.equal(shaded([0, -0.5], 0, s.dir, [b]), false, 'the sunny side');
});

test('sun-hours grid: open ground gets the whole day, the north side of a barn less', () => {
  const barn = box(-10, -5, 10, 5, 8);
  const date = new Date('2026-12-21T20:00:00Z');
  const g = sunHoursGrid([barn], { x0: -30, y0: -30, x1: 30, y1: 30 }, 2, date, ORIGIN.lat, ORIGIN.lon, 15);
  const at = (x, y) => g.hours[Math.floor((y - g.y0) / g.cell) * g.cols + Math.floor((x - g.x0) / g.cell)];
  assert.ok(Number.isNaN(at(0, 0)), 'inside the barn');
  close(at(0, -25), g.dayHours, 1e-9, 'south of the barn, unshaded all day');
  assert.ok(at(0, 7) < g.dayHours / 2, `north of the barn in December: ${at(0, 7)} h of ${g.dayHours}`);
  assert.ok(dayTrack(date, ORIGIN.lat, ORIGIN.lon, 15).length > 30);
  // A roof is never shaded by itself, but a taller neighbour to its south shades it in winter.
  const tower = box(-10, -25, 10, -15, 30);
  close(roofSunHours(barn, [0, 0], [barn], date, ORIGIN.lat, ORIGIN.lon), g.dayHours, 0.26);
  assert.ok(roofSunHours(barn, [0, 0], [barn, tower], date, ORIGIN.lat, ORIGIN.lon) < g.dayHours - 1);
});

/* ----------------------------------------------------------------- egress */

test('IBC occupant loads, exactly converted and rounded up', () => {
  close(LOAD_FACTORS.residential.m2, 18.5806, 1e-4);
  close(LOAD_FACTORS.agricultural.m2, 27.8709, 1e-4);
  assert.equal(occupantLoad(300, 'agricultural'), 11); // 300 / 27.87 = 10.76 → 11
  assert.equal(occupantLoad(27.870912, 'agricultural'), 1);
  assert.equal(occupancyFor('barn'), 'agricultural');
  assert.equal(occupancyFor('house'), 'residential');
  assert.equal(occupancyFor('shed'), 'storage');
  assert.equal(occupancyFor('church'), 'assembly');
  assert.equal(occupancyFor('silo'), 'unoccupied');
  assert.equal(occupantLoad(500, 'unoccupied'), 0);
  // A barn is one tall storey; a 9 m house without a level count is three.
  assert.equal(metrics(box(0, 0, 18, 12, 8, { kind: 'barn' })).floors, 1);
  assert.equal(metrics(box(0, 0, 10, 10, 9, { kind: 'house' })).floors, 3);
  assert.equal(metrics(box(0, 0, 10, 10, 9, { kind: 'barn', levels: 2 })).floors, 2);
});

test('SFPE hydraulic model constants', () => {
  close(speed(0), 1.40 * (1 - 0.266 * 0.54), 1e-12);
  close(speed(0), 1.199, 1e-3);
  close(maxSpecificFlow(K.door), 1.316, 1e-3);
  close(maxSpecificFlow(K.stair711), 1.015, 1e-3);
  close(effectiveWidth(0.91), 0.61, 1e-12);
  assert.equal(effectiveWidth(0.2), 0);
});

test('evacuation time: hand calculation for a barn and a two-storey house', () => {
  // 120 people, two 0.91 m doors: capacity 2 × 1.316 × 0.61 = 1.6056 p/s → 74.7 s queue.
  const e = evacuation({ occupants: 120, exits: 2, travelM: 24, preMovementS: 60 });
  close(e.doorCapacity, 2 * maxSpecificFlow() * 0.61, 1e-12);
  close(e.queueS, 120 / e.doorCapacity, 1e-9);
  close(e.travelS, 24 / speed(0), 1e-9);
  close(e.totalS, 60 + 24 / speed(0) + 120 / e.doorCapacity, 1e-9);
  assert.equal(e.controlling, 'exit doors');
  // Two storeys, one narrow stair: the stair controls.
  const h = evacuation({ occupants: 60, exits: 2, travelM: 15, floors: 2, stairs: 1, stairClearM: 0.9 });
  assert.equal(h.controlling, 'stairs');
  close(h.queueS, 30 / (maxSpecificFlow(K.stair711) * 0.6), 1e-9);
  const ring = normaliseRing([[0, 0], [30, 0], [30, 10], [0, 10]]);
  const exits = autoExits(ring, 2);
  assert.deepEqual(exits.map((p) => p.map((v) => Math.round(v))).sort(), [[15, 0], [15, 10]]);
  close(maxTravel(ring, exits), Math.hypot(15, 0), 1e-9);
});

/* ------------------------------------------------------------------- flow */

test('people flow: walking distance goes around a building, never through it', () => {
  const wall = box(-2, -20, 2, 20, 5);
  const area = { x0: -30, y0: -30, x1: 30, y1: 30 };
  const grid = obstacles([wall], area, 1);
  assert.equal(grid.blocked[cellOf(grid, [0, 0])], 1);
  const field = distanceField(grid, [20, 0]);
  const d = distanceFrom(grid, field, [-20, 0]);
  // Straight line would be 40 m; around the wall's end it is at least 2·√(20² + 20²) ≈ 56.6 m.
  assert.ok(d > 56 && d < 56.6 * 1.09, `${d}`);
  const path = route(grid, field, [-20, 0]);
  assert.ok(path.every((p) => !inFootprint(p, wall)));
  close(path.at(-1)[0], 20.5, 0.6);
  assert.equal(distanceFrom(grid, field, [20, 0]), 0);
  // Open ground: 8-connected distance is within 8 % of the straight line.
  const open = obstacles([], area, 1);
  const f2 = distanceField(open, [0, 0]);
  const dd = distanceFrom(open, f2, [20, 10]);
  assert.ok(dd >= Math.hypot(20, 10) - 1.5 && dd <= Math.hypot(20, 10) * 1.09, `${dd}`);
});

/* ----------------------------------------------------------------- energy */

test('degree days, archive reading and unit conversion', () => {
  assert.deepEqual(degreeDays([10, 18, 25, NaN]), { hdd: 8, cdd: 7, days: 3 });
  const json = { daily: { temperature_2m_mean: [5, 15, 20, null], shortwave_radiation_sum: [10.8, 18, 25.2, null] } };
  const r = readArchive(json);
  close(r.irradiationKWhM2, ((10.8 + 18 + 25.2) / 3.6) * (4 / 3), 1e-9, 'MJ → kWh, missing day scaled');
  assert.equal(r.hdd, 13 + 3); assert.equal(r.cdd, 2); assert.equal(r.missingDays, 1);
  assert.match(archiveUrl(38.5025, -122.3977, 2025), /archive-api\.open-meteo\.com\/v1\/archive\?latitude=38\.5025&longitude=-122\.3977&start_date=2025-01-01&end_date=2025-12-31/);
});

test('rooftop solar and heat loss, by hand', () => {
  const pv = pvPotential({ roofM2: 216, irradiationKWhM2: 1800 });
  close(pv.kWp, 216 * 0.7 * 0.2, 1e-12);
  close(pv.kWhYear, 30.24 * 1800 * 0.8, 1e-9);
  const m = metrics(box(0, 0, 18, 12, 8));
  assert.equal(m.wallM2, 60 * 8); assert.equal(m.volumeM3, 216 * 8);
  const hl = heatLossCoefficient({ wallM2: m.wallM2, roofM2: m.footprintM2, floorM2: m.footprintM2, volumeM3: m.volumeM3 });
  close(hl.fabric, 0.6 * 480 + 0.4 * 216 + 0.5 * 216, 1e-9);
  close(hl.ventilation, (1200 / 3600) * 0.5 * 1728, 1e-9);
  const loads = annualLoads(hl.ua, 1500, 400);
  close(loads.heatKWh, hl.ua * 1500 * 24 / 1000, 1e-9);
});
