import test from 'node:test';
import assert from 'node:assert/strict';
import { adsbLolUrl, FPM, FT, KT, openskyUrl, parseOpenSky, parseReadsb, relate } from '../../public/black-optic-6/js/intel/adsb.js';
import { kmByClass, nearestLine, outputMW, parsePower, plantsBySource, powerQuery, voltageClass, voltagesKv } from '../../public/black-optic-6/js/intel/grid.js';
import { acsUrl, housingRatios, monthlyPayment, parseAcs, parseElevation, parseFcc, parseFema } from '../../public/black-optic-6/js/intel/property.js';
import { ago, explain } from '../../public/black-optic-6/js/intel/fetch.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const lompoc = { lat: 34.6391, lon: -120.4579, elevM: 30 };

test('unit constants are exact', () => {
  assert.equal(FT, 0.3048); close(KT, 0.514444, 1e-6); close(FPM, 0.00508, 1e-12);
});

test('OpenSky state vectors by index', () => {
  const a = parseOpenSky({ time: 1000, states: [
    ['a1b2c3', 'UAL123  ', 'United States', 990, 995, -120.40, 34.70, 3000, false, 200, 270, -5, null, 3050, '7700', false, 0],
    ['ffffff', null, 'X', null, 1000, null, null, null, true, null, null, null, null, null, null, false, 0],
  ] });
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].callsign, a[0].altM, a[0].baroM, a[0].ageS, a[0].squawk], ['UAL123', 3050, 3000, 10, '7700']);
  assert.match(openskyUrl(lompoc, 50), /lamin=34\.1894&lomin=-121\.0044&lamax=35\.0888&lomax=-119\.9114/);
});

test('readsb v2 in feet and knots becomes SI', () => {
  const a = parseReadsb({ ac: [
    { hex: '~a00001', flight: 'N123AB ', lat: 34.65, lon: -120.46, alt_baro: 1000, alt_geom: 1100, gs: 100, track: 90, baro_rate: -500, squawk: '1200', t: 'C172', r: 'N123AB', dbFlags: 0, seen_pos: 1.2 },
    { hex: 'ae0001', lat: 34.7, lon: -120.6, alt_baro: 'ground', gs: 5, dbFlags: 1 },
    { hex: 'nopos' },
  ] });
  assert.equal(a.length, 2);
  close(a[0].altM, 1100 * 0.3048, 1e-9); close(a[0].speedMs, 51.4444, 1e-4); close(a[0].vrateMs, -2.54, 1e-9);
  assert.equal(a[0].icao, 'a00001');
  assert.equal(a[1].onGround, true); assert.equal(a[1].altM, 0); assert.equal(a[1].military, true);
  assert.equal(adsbLolUrl(lompoc, 92.6), 'https://api.adsb.lol/v2/point/34.6391/-120.4579/50');
});

test('relate: range, look angle and the two ranch alerts', () => {
  const low = relate({ lat: 34.65, lon: -120.4579, altM: 230, onGround: false, squawk: '7600' }, lompoc);
  close(low.km, (34.65 - 34.6391) * 111.195, 0.001, 'due north distance');
  close(low.bearing, 0, 1e-6);
  close(low.aglM, 200, 1e-9);
  close(low.elevDeg, Math.atan2(0.2 - low.km ** 2 / (2 * 6371.0088), low.km) * 180 / Math.PI, 1e-9);
  assert.equal(low.alerts.length, 2);
  assert.match(low.alerts[0], /radio failure/);
  const high = relate({ lat: 34.65, lon: -120.4579, altM: 10000, onGround: false }, lompoc);
  assert.equal(high.alerts.length, 0);
});

test('power: voltages, outputs, classes', () => {
  assert.deepEqual(voltagesKv('115000;12470'), [115, 12.47]);
  assert.deepEqual(voltagesKv(undefined), []);
  assert.equal(outputMW('50 MW'), 50); assert.equal(outputMW('1.2 GW'), 1200); assert.equal(outputMW('800 kW'), 0.8); assert.equal(outputMW('yes'), null);
  assert.equal(voltageClass(500), 'extra-high voltage'); assert.equal(voltageClass(230), 'transmission'); assert.equal(voltageClass(115), 'sub-transmission'); assert.equal(voltageClass(12.47), 'distribution');
  assert.match(powerQuery(34.6, -120.4, 20000), /around:20000,34\.60000,-120\.40000/);
});

test('power: parse Overpass, line lengths, nearest line, plant totals', () => {
  const p = parsePower({ elements: [
    { type: 'way', id: 1, tags: { power: 'line', voltage: '115000' }, geometry: [{ lat: 34.6, lon: -120.5 }, { lat: 34.7, lon: -120.5 }] },
    { type: 'way', id: 2, tags: { power: 'minor_line' }, geometry: [{ lat: 34.64, lon: -120.46 }, { lat: 34.64, lon: -120.45 }] },
    { type: 'way', id: 3, tags: { power: 'substation', name: 'Lompoc', voltage: '115000;12000' }, geometry: [{ lat: 34.6, lon: -120.4 }, { lat: 34.602, lon: -120.4 }, { lat: 34.602, lon: -120.398 }] },
    { type: 'node', id: 4, lat: 34.7, lon: -120.6, tags: { power: 'plant', 'plant:source': 'solar', 'plant:output:electricity': '20 MW', name: 'Solar A' } },
    { type: 'node', id: 5, lat: 34.71, lon: -120.61, tags: { power: 'plant', 'plant:source': 'solar', 'plant:output:electricity': 'yes' } },
  ] });
  assert.equal(p.lines.length, 2); assert.equal(p.substations.length, 1); assert.equal(p.plants.length, 2);
  close(p.lines[0].km, 0.1 * 111.195, 0.001, '0.1° of latitude');
  assert.equal(p.lines[1].cls, 'distribution');
  close(p.substations[0].lat, (34.6 + 34.602 + 34.602) / 3, 1e-12);
  const near = nearestLine(p.lines, { lat: 34.65, lon: -120.45 });
  close(near.km, 0.01 * 111.195, 0.001, 'distribution line 0.01° south');
  const tx = nearestLine(p.lines, { lat: 34.65, lon: -120.45 }, 69);
  close(tx.km, 0.05 * 111.195 * Math.cos(34.65 * Math.PI / 180), 0.002, 'transmission line 0.05° west');
  const by = kmByClass(p.lines);
  assert.ok(by['sub-transmission'] > 11 && by.distribution > 0.9);
  assert.deepEqual(plantsBySource(p.plants), { solar: { count: 2, mw: 20, unknownMw: 1 } });
});

test('property: FCC, ACS, ratios, payment, FEMA, elevation', () => {
  const f = parseFcc({ results: [{ block_fips: '060830020011000', county_name: 'Santa Barbara County', state_code: 'CA' }] });
  assert.deepEqual([f.state, f.county, f.tract], ['06', '083', '002001']);
  assert.match(acsUrl(f), /for=tract:002001&in=state:06%20county:083/);
  assert.match(acsUrl(f, 'county'), /for=county:083&in=state:06$/);
  const a = parseAcs([['NAME', 'B25077_001E', 'B25064_001E', 'B19013_001E', 'B25035_001E', 'B25003_001E', 'B25003_002E', 'B25002_001E', 'B25002_003E', 'B01003_001E', 'state', 'county', 'tract'],
    ['Census Tract 20.01', '600000', '2000', '80000', '-666666666', '1000', '550', '1050', '50', '3000', '06', '083', '002001']]);
  assert.equal(a.medianYearBuilt, null);
  const r = housingRatios(a);
  close(r.priceToRent, 25, 1e-12); close(r.grossYieldPct, 4, 1e-12); close(r.valueToIncome, 7.5, 1e-12);
  close(r.rentShareOfIncomePct, 30, 1e-12); close(r.ownerPct, 55, 1e-12); close(r.vacancyPct, 100 * 50 / 1050, 1e-12);
  // $480,000 at 6.5 % over 30 years: the standard amortisation table gives $3,033.93.
  close(monthlyPayment(480000, 6.5), 3033.93, 0.01);
  close(monthlyPayment(360000, 0), 1000, 1e-9);
  assert.equal(parseFema({ features: [{ attributes: { FLD_ZONE: 'AE', SFHA_TF: 'T', STATIC_BFE: 12 } }] }).high, true);
  assert.match(parseFema({ features: [{ attributes: { FLD_ZONE: 'X', ZONE_SUBTY: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD', SFHA_TF: 'F' } }] }).text, /moderate/);
  assert.equal(parseFema({ features: [] }).zone, null);
  assert.equal(parseElevation({ value: '28.4' }), 28.4); assert.equal(parseElevation({ value: -1000000 }), null);
});

test('fetch helpers explain refusals in words', () => {
  assert.match(explain(new TypeError('Failed to fetch'), 'https://ssd-api.jpl.nasa.gov/sentry.api'), /ssd-api\.jpl\.nasa\.gov could not be reached/);
  assert.match(explain({ name: 'AbortError' }, 'https://x.org/a'), /did not answer in time/);
  assert.equal(ago(0, 30000), '30 s ago'); assert.equal(ago(0, 7200000), '2 h ago');
});
