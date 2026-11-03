import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AU_KM, bodyPosition, dist, ellipsePoint, fromJulian, J2000, julian, K_DEG, orbitPath, periodDays, planetElements, planetPosition, PLANETS, RAD, solveKepler,
} from '../../public/black-optic-6/js/space/kepler.js';
import {
  backgroundRate, cadUrl, diameterFromH, distances, impactEnergyMt, impactSpeed, neowsElements, oneIn, palermo, parseCad, parseNeowsFeed, parseSbdb, parseSentry, parseSentryObject, torino,
} from '../../public/black-optic-6/js/space/neo.js';
import { ageDays, locate, look, passes, satrecs, sunlit, sunVector } from '../../public/black-optic-6/js/space/sats.js';
import { countdown, fromRanch, parseLaunches } from '../../public/black-optic-6/js/space/launches.js';
import { bbox, bearingDeg, compass, elevationDeg, haversineKm, segmentDistance, toLocal } from '../../public/black-optic-6/js/intel/geo.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (±${tol})`);

test('Kepler solver: residual below 1e-12 across eccentricities and anomalies', () => {
  for (const e of [0, 0.0167, 0.2, 0.5, 0.9, 0.97, 0.999]) {
    for (let M = -6; M <= 6; M += 0.37) {
      const E = solveKepler(M, e);
      const m = Math.atan2(Math.sin(M), Math.cos(M));
      close(E - e * Math.sin(E), m, 1e-12, `e=${e} M=${M}`);
    }
  }
});

test('julian dates', () => {
  assert.equal(julian(new Date('2000-01-01T12:00:00Z')), J2000);
  assert.equal(+fromJulian(2440587.5), 0);
});

test('Earth on 2000-01-01 12:00: the known heliocentric position, r = 0.9833 au', () => {
  const p = planetPosition('earth', J2000);
  // JPL Horizons, Earth-Moon barycentre, ecliptic J2000: x ≈ −0.1771, y ≈ +0.9672 au.
  close(p[0], -0.1771, 0.003, 'x'); close(p[1], 0.9672, 0.003, 'y'); close(p[2], 0, 1e-4, 'z');
  close(Math.hypot(...p), 0.98329, 0.0002, 'r (perihelion is on 3 January)');
});

test('planet periods from Table 1 rates and Kepler III agree', () => {
  // Sidereal periods, days: Mars 686.98, Jupiter 4332.6.
  close(36525 * 360 / PLANETS.mars.rate[3], 686.98, 0.05, 'Mars from L rate');
  close(36525 * 360 / PLANETS.jupiter.rate[3], 4332.6, 1, 'Jupiter from L rate');
  close(periodDays(1), 365.2569, 0.001, 'Kepler III at 1 au (Gaussian year)');
});

test('orbits: distance stays between perihelion and aphelion; one period returns home', () => {
  const o = { a: 0.9224, e: 0.1911, i: 3.34, om: 204.0, w: 126.6, ma: 180, epoch: 2460000.5 }; // Apophis-like
  for (let jd = o.epoch; jd < o.epoch + 400; jd += 7) {
    const r = Math.hypot(...bodyPosition(o, jd));
    assert.ok(r >= o.a * (1 - o.e) - 1e-9 && r <= o.a * (1 + o.e) + 1e-9);
  }
  const P = periodDays(o.a);
  assert.ok(dist(bodyPosition(o, o.epoch), bodyPosition(o, o.epoch + P)) < 1e-9);
  assert.equal(bodyPosition({ ...o, e: 1.2 }, o.epoch), null);
  const path = orbitPath(o, 90);
  assert.equal(path.length, 91);
  close(Math.hypot(...path[0]), o.a * (1 - o.e), 1e-12, 'E = 0 is perihelion');
  // Inclination: max |z| / a is sin(i) for a circle.
  const circle = orbitPath({ a: 1, e: 0, i: 30, om: 10, w: 0 }, 360);
  close(Math.max(...circle.map((p) => p[2])), Math.sin(30 * RAD), 1e-4, 'max z');
  close(K_DEG, 0.9856076686, 1e-9, 'k in deg/day');
});

test('Sentry summary and object parsing', () => {
  const rows = parseSentry({ count: '2', data: [
    { des: '2000 SG344', fullname: '(2000 SG344)', ip: '0.00274', ps_cum: '-2.77', ps_max: '-3.11', ts_max: '0', n_imp: 300, range: '2069-2122', last_obs: '2000-10-03', h: '24.8', diameter: '0.037', v_inf: '1.36' },
    { des: '29075', fullname: '29075 (1950 DA)', ip: '3.8e-4', ps_cum: '-0.93', ps_max: '-0.93', ts_max: null, n_imp: 1, range: '2880-2880', last_obs: '2021-01-01', h: '17.9', diameter: '1.3', v_inf: '14.1' },
  ] });
  assert.equal(rows[0].des, '29075'); // highest Palermo first
  assert.equal(rows[0].firstYear, 2880);
  assert.equal(rows[1].ip, 0.00274);
  assert.equal(rows[1].tsMax, 0);
  const obj = parseSentryObject({ summary: { des: '29075', ip: '3.8e-4', energy: '7.4e4' }, data: [{ date: '2880-03-16.99', ip: '3.8e-4', ps: '-0.93', ts: null }] });
  assert.equal(obj.energyMt, 74000);
  assert.equal(obj.impacts[0].date, '2880-03-16.99');
  assert.deepEqual(parseSentry({}), []);
});

test('close-approach parsing follows the fields list, not column positions', () => {
  const cad = parseCad({
    fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h', 'diameter', 'diameter_sigma', 'fullname'],
    data: [['2024 XY', '3', '2460700.5', '2025-Jan-25 00:00', '0.0123', '0.0120', '0.0126', '8.2', '8.1', '< 00:01', '25.1', null, null, '       (2024 XY)']],
  });
  assert.equal(cad[0].name, '(2024 XY)');
  assert.equal(cad[0].at.toISOString(), '2025-01-25T00:00:00.000Z');
  assert.equal(cad[0].distAu, 0.0123);
  close(distances(cad[0].distAu).ld, 0.0123 * AU_KM / 384400, 1e-9);
  close(distances(1).ld, 389.17, 0.01, '1 au in lunar distances');
  assert.match(cadUrl(30, 0.02), /date-max=%2B30&dist-max=0.02/);
});

test('SBDB and NeoWs elements', () => {
  const el = parseSbdb({ object: { fullname: '99942 Apophis (2004 MN4)' }, orbit: { epoch: '2461000.5', moid: '.000251', elements: [
    { name: 'e', value: '.1911' }, { name: 'a', value: '.9224' }, { name: 'q', value: '.7461' }, { name: 'i', value: '3.34' },
    { name: 'om', value: '203.96' }, { name: 'w', value: '126.6' }, { name: 'ma', value: '12.3' }, { name: 'n', value: '1.1121' },
  ] } });
  assert.equal(el.a, 0.9224); assert.equal(el.epoch, 2461000.5); assert.equal(el.n, 1.1121); assert.equal(el.moid, 0.000251);
  close(el.n, 0.9856076686 / el.a ** 1.5, 0.002, 'n matches Kepler III');
  assert.equal(parseSbdb({ orbit: { elements: [] } }), null);
  const nw = neowsElements({ name: 'Apophis', orbital_data: { semi_major_axis: '.9224', eccentricity: '.1911', inclination: '3.34', ascending_node_longitude: '203.96', perihelion_argument: '126.6', mean_anomaly: '12.3', epoch_osculation: '2461000.5', mean_motion: '1.1121' } });
  assert.equal(nw.om, 203.96);
  const feed = parseNeowsFeed({ near_earth_objects: { '2026-11-04': [{ id: '1', name: '(2026 AB)', absolute_magnitude_h: 26, is_potentially_hazardous_asteroid: false, is_sentry_object: true,
    estimated_diameter: { kilometers: { estimated_diameter_min: 0.01, estimated_diameter_max: 0.03 } },
    close_approach_data: [{ epoch_date_close_approach: 1793750400000, miss_distance: { astronomical: '0.002' }, relative_velocity: { kilometers_per_second: '9.5' }, orbiting_body: 'Earth' },
      { epoch_date_close_approach: 1793750400000, miss_distance: { astronomical: '0.3' }, relative_velocity: { kilometers_per_second: '9' }, orbiting_body: 'Mars' }] }] } });
  assert.equal(feed.length, 1);
  assert.equal(feed[0].des, '2026 AB');
  close(feed[0].diameterKm, 0.02, 1e-12);
  assert.equal(feed[0].sentry, true);
});

test('impact arithmetic, by hand', () => {
  // D = 1329/√0.14 · 10^(−22/5) km = 3551.9 × 3.981e-5 = 0.1414 km.
  close(diameterFromH(22, 0.14), 0.14140, 0.00005, 'D(H=22)');
  close(diameterFromH(22, 0.25) / diameterFromH(22, 0.05), Math.sqrt(0.05 / 0.25), 1e-12, 'albedo scaling');
  // v_imp = √(5.84² + 11.186²) = 12.619 km/s.
  close(impactSpeed(5.84), 12.6188, 0.0005, 'v_imp');
  // 370 m stony sphere at 2600 kg/m³: m = 6.8957e10 kg; E = ½ m v² = 5.490e18 J = 1312 Mt.
  close(impactEnergyMt(0.37, 5.84), 1312.2, 1.0, 'energy');
  // Palermo: P = 1e-4, E = 100 Mt, ΔT = 10 y → f_B = 0.03 · 100^-0.8 = 7.536e-4; PS = log10(1e-4 / 7.536e-3) = −1.877.
  close(backgroundRate(100), 7.5357e-4, 1e-7, 'f_B');
  close(palermo(1e-4, 100, 10), -1.8772, 0.0005, 'PS');
  assert.equal(torino(0).band, 'white');
  assert.equal(torino(3).band, 'yellow');
  assert.equal(oneIn(0.00274), '1 in 360');
  assert.equal(oneIn(3.8e-4), '1 in 2,600');
  assert.equal(oneIn(0), '—');
});

// Vallado et al. 2006, "Revisiting Spacetrack Report #3", verification case 00005, t = 0:
//   r = (7022.46529266, −1400.08296755, 0.03995155) km.
const OMM_00005 = {
  OBJECT_NAME: 'TEST 00005', OBJECT_ID: '1958-002B', EPOCH: '2000-06-27T18:50:19.733568', MEAN_MOTION: 10.82419157, ECCENTRICITY: 0.1859667,
  INCLINATION: 34.2682, RA_OF_ASC_NODE: 348.7242, ARG_OF_PERICENTER: 331.7664, MEAN_ANOMALY: 19.3264, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 5, ELEMENT_SET_NO: 475, REV_AT_EPOCH: 41366, BSTAR: 0.28098e-4, MEAN_MOTION_DOT: 0.00000023, MEAN_MOTION_DDOT: 0,
};

test('SGP4 through satellite.js reproduces Vallado’s verification vector', () => {
  const [sat] = satrecs([OMM_00005, { bad: true }]);
  assert.ok(sat);
  const p = locate(sat, sat.epoch);
  close(p.eci.x, 7022.46529266, 0.01, 'x'); close(p.eci.y, -1400.08296755, 0.01, 'y'); close(p.eci.z, 0.03995155, 0.01, 'z');
  close(p.altKm, Math.hypot(7022.46529266, -1400.08296755, 0.03995155) - 6378.137, 25, 'altitude (geodetic, near the equator)');
  close(ageDays(sat, new Date(+sat.epoch + 3 * 86400000)), 3, 1e-9);
});

test('sun vector and the Earth-shadow test', () => {
  const s = sunVector(new Date('2026-06-21T12:00:00Z')); // solstice: declination ≈ +23.44°
  close(Math.asin(s[2]) / RAD, 23.44, 0.05, 'declination');
  close(Math.hypot(...s), 1, 1e-12);
  const d = new Date('2026-06-21T12:00:00Z');
  assert.equal(sunlit({ x: 7000 * s[0], y: 7000 * s[1], z: 7000 * s[2] }, d), true);
  assert.equal(sunlit({ x: -7000 * s[0], y: -7000 * s[1], z: -7000 * s[2] }, d), false); // directly behind Earth
  assert.equal(sunlit({ x: -7000 * s[0] + 9000 * s[1], y: -7000 * s[1] - 9000 * s[0], z: -7000 * s[2] }, d), true); // behind but off the shadow axis
});

test('passes: rise below peak, set after peak, elevation at rise is the threshold', () => {
  const [sat] = satrecs([OMM_00005]);
  const obs = { lat: 34.64, lon: -120.46, hKm: 0.03 };
  const list = passes(sat, obs, sat.epoch, 24, 10);
  assert.ok(list.length >= 1);
  for (const p of list.filter((x) => +x.set < +sat.epoch + 23.9 * 3600000 && +x.rise > +sat.epoch)) {
    assert.ok(p.rise < p.peak && p.peak < p.set);
    close(look(sat, p.rise, obs).el, 10, 0.05, 'rise at 10°');
    close(look(sat, p.set, obs).el, 10, 0.05, 'set at 10°');
    assert.ok(p.maxEl >= 10 && p.maxEl <= 90);
  }
});

test('launch parsing and distance from the ranch', () => {
  const ls = parseLaunches({ results: [
    { id: 'b', name: 'Falcon 9 Block 5 | Starlink Group 11-9', net: '2026-11-08T03:00:00Z', status: { name: 'Go for Launch' }, launch_service_provider: { name: 'SpaceX' },
      rocket: { configuration: { full_name: 'Falcon 9 Block 5' } }, mission: { description: 'Starlink batch', orbit: { name: 'Low Earth Orbit' } },
      pad: { name: 'Space Launch Complex 4E', latitude: '34.632', longitude: '-120.611', location: { name: 'Vandenberg SFB, CA, USA' } } },
    { id: 'a', name: 'Earlier', net: '2026-11-05T00:00:00Z', pad: {} },
  ] });
  assert.equal(ls[0].name, 'Earlier');
  const lompoc = { lat: 34.6391, lon: -120.4579 };
  const r = fromRanch(ls[1], lompoc);
  close(r.km, 14.0, 0.3, 'SLC-4E from Lompoc');
  assert.equal(r.compass, 'W');
  assert.equal(fromRanch(ls[0], lompoc), null);
  assert.equal(countdown(new Date('2026-11-08T03:00:00Z'), new Date('2026-11-05T01:30:00Z')), 'T− 3 d 1 h 30 min');
});

test('geo helpers', () => {
  // One degree of latitude on the mean sphere: 2πR/360 = 111.195 km.
  close(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111.195, 0.001);
  close(haversineKm({ lat: 51.5007, lon: -0.1246 }, { lat: 40.6892, lon: -74.0445 }), 5574.8, 1, 'London to New York');
  close(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 90, 1e-9);
  assert.equal(compass(359), 'N'); assert.equal(compass(200), 'SSW');
  close(elevationDeg(100, 10), Math.atan2(10 - 10000 / (2 * 6371.0088), 100) / RAD, 1e-12);
  assert.ok(elevationDeg(300, 3) < 0, 'a 3 km-high aircraft 300 km away is below the horizon');
  const [x, y] = toLocal({ lat: 45, lon: 0 }, { lat: 45, lon: 1 });
  close(x, 111.195 * Math.cos(45 * RAD), 0.001); close(y, 0, 1e-12);
  const b = bbox({ lat: 0, lon: 0 }, 111.195);
  close(b.lamax, 1, 1e-4);
  close(segmentDistance([0, 1], [-1, 0], [1, 0]), 1, 1e-12);
  close(segmentDistance([3, 4], [-1, 0], [0, 0]), 5, 1e-12);
});
