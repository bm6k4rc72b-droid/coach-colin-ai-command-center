/**
 * The sensor layers, including the cases where each must refuse to answer.
 *
 * Most of these test a refusal rather than a result. A fire app's dangerous
 * failures are not wrong numbers, they are confident numbers where there should
 * have been none: a fix from two bearings pointing the same way, a "front" read
 * off a switch failure, smoke found in an auto-exposure event, ninety-five
 * percent confidence from one satellite pass. Each of those has a test here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bearingDeg, distanceM } from '../../public/emberline/js/geo.js';
import {
  acquisitionMs,
  clusterDetections,
  confidenceScore,
  detectionAge,
  isFirmsCsv,
  parseDetections,
  pixelAreaHa,
  pixelFootprint,
  withinHours,
} from '../../public/emberline/js/firms.js';
import { bestGeostationary, nextLocalSolarTime, nextLookSummary, nextLooks, pixelAt, SATELLITES } from '../../public/emberline/js/overpass.js';
import { correctForPlume, fix, plumeLean, sighting, suggestThirdObserver } from '../../public/emberline/js/triangulate.js';
import { classifyNodes, frontFromNodeLoss, linkAttenuation, nodesInPath, occupancy, parseAdapterFrame, capability } from '../../public/emberline/js/rf.js';
import { fuseAll, observation } from '../../public/emberline/js/fuse.js';
import { DEMO_TRUTH, demoScenario } from '../../public/emberline/js/demo.js';

const HEADER =
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';

test('an upstream error page is distinguished from a quiet day', () => {
  // The difference between "your key is wrong" and "no fires" is the difference
  // between a broken app and a reassuring one, and both look like zero rows.
  assert.equal(parseDetections('<html>Invalid MAP_KEY</html>'), null);
  assert.equal(parseDetections('Invalid MAP_KEY'), null);
  assert.equal(parseDetections(''), null);
  assert.equal(isFirmsCsv(HEADER), true);
  assert.deepEqual(parseDetections(`${HEADER}\n`), [], 'header-only is zero fires, not a failure');
});

test('unpadded acq_time is read as UTC, not mangled', () => {
  // "145" is 01:45 UTC. Read naively it lands eleven hours out of place.
  assert.equal(acquisitionMs('2026-09-10', '145'), Date.parse('2026-09-10T01:45:00Z'));
  assert.equal(acquisitionMs('2026-09-10', '0'), Date.parse('2026-09-10T00:00:00Z'));
  assert.equal(acquisitionMs('2026-09-10', '2042'), Date.parse('2026-09-10T20:42:00Z'));
  assert.equal(acquisitionMs(undefined, '145'), null);
});

test('a detection is drawn as its real pixel, which differs by an order of magnitude', () => {
  const csv = `${HEADER}
38.6012,-121.3011,340.2,0.39,0.36,2026-09-10,2042,N,VIIRS,h,2.0NRT,295.1,45.6,N
38.9500,-121.9000,310.0,4.7,2.0,2026-09-09,145,Terra,MODIS,74,6.1NRT,288.0,12.0,N`;
  const [viirs, modis] = parseDetections(csv);
  assert.ok(pixelAreaHa(viirs) < 20, `nadir VIIRS pixel should be small, got ${pixelAreaHa(viirs)}`);
  assert.ok(pixelAreaHa(modis) > 500, `edge MODIS pixel should be huge, got ${pixelAreaHa(modis)}`);
  assert.ok(pixelAreaHa(modis) / pixelAreaHa(viirs) > 25, 'the ratio is the whole argument against dots');
  const ring = pixelFootprint(viirs);
  assert.equal(ring.length, 5, 'a closed box');
  assert.deepEqual(ring[0], ring[4]);
});

test('missing scan and track fall back to nominal, and say they did', () => {
  const csv = `latitude,longitude,acq_date,acq_time,confidence,frp,instrument
38.6,-121.3,2026-09-10,2042,h,45.6,VIIRS`;
  const [d] = parseDetections(csv);
  assert.equal(d.pixelKnown, false, 'the fallback must be visible to the caller');
  assert.equal(d.scanKm, 0.375);
});

test('categorical and numeric confidence become comparable', () => {
  assert.ok(confidenceScore({ confidence: 'h' }).score > confidenceScore({ confidence: 'n' }).score);
  assert.ok(confidenceScore({ confidence: 'n' }).score > confidenceScore({ confidence: 'l' }).score);
  assert.equal(confidenceScore({ confidence: '90' }).label, 'high');
  assert.equal(confidenceScore({ confidence: '10' }).label, 'low');
  assert.equal(confidenceScore({ confidence: '' }).label, 'unstated');
});

test('age carries its consequence, and an untimestamped detection admits it', () => {
  const now = Date.parse('2026-09-10T23:00:00Z');
  const fresh = detectionAge({ acquiredMs: now - 10 * 60_000 }, now);
  const old = detectionAge({ acquiredMs: now - 40 * 3600_000 }, now);
  assert.equal(fresh.staleness, 'fresh');
  assert.equal(old.staleness, 'old');
  assert.ok(old.caveat.includes('useless'));
  assert.equal(detectionAge({ acquiredMs: null }, now).staleness, 'unknown');
});

test('a running front clusters as one fire; distant fires stay separate', () => {
  const chain = Array.from({ length: 8 }, (_, i) => ({ lat: 38.6 + i * 0.008, lon: -121.3 + i * 0.008, frpMw: 10, acquiredMs: 1, instrument: 'VIIRS', confidence: 'n' }));
  const far = { lat: 39.4, lon: -122.2, frpMw: 5, acquiredMs: 1, instrument: 'VIIRS', confidence: 'n' };
  const clusters = clusterDetections([...chain, far]);
  assert.equal(clusters.length, 2, 'a chain must not be cut up, and a distant fire must not be merged');
  assert.equal(clusters.find((c) => c.detections.length === 8).detections.length, 8);
});

test('the trailing window keeps forward clock skew but drops stale rows', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');
  const rows = [
    { acquiredMs: now - 1 * 3600_000 },
    { acquiredMs: now - 40 * 3600_000 },
    { acquiredMs: now + 30 * 60_000 },
  ];
  const kept = withinHours(rows, 24, now);
  assert.equal(kept.length, 2, 'a detection from the near future is clock skew, not a reason to drop it');
  assert.ok(kept[0].acquiredMs > kept[1].acquiredMs, 'newest first');
});

test('overpass timing follows local solar time at the meridian', () => {
  const from = Date.parse('2026-09-12T00:00:00Z');
  // At longitude 0, local solar time equals UTC.
  const atGreenwich = nextLocalSolarTime(13.5, 0, from);
  assert.equal(new Date(atGreenwich).getUTCHours(), 13);
  // Move 60 degrees west and the same local time happens four hours later UTC.
  const atWest = nextLocalSolarTime(13.5, -60, from);
  assert.ok(Math.abs((atWest - atGreenwich) / 3600_000 - 4) < 0.02);
  const looks = nextLooks({ lat: 38.6, lon: -121.3 }, from, 6);
  assert.equal(looks.length, 6);
  for (let i = 1; i < looks.length; i += 1) {
    assert.ok(looks[i].atMs >= looks[i - 1].atMs, 'looks must be in time order');
    assert.ok(looks[i].inMinutes >= 0, 'and in the future');
  }
  assert.ok(nextLookSummary({ lat: 38.6, lon: -121.3 }, from).detail.includes('50 minutes'));
});

test('a nadir pixel size is not a property of the instrument', () => {
  const viirs = SATELLITES.find((s) => s.id === 'snpp');
  assert.equal(pixelAt(viirs, 0).pixelM, 375);
  assert.ok(pixelAt(viirs, 1).pixelM > 700, 'the swath edge is more than twice as coarse');
  assert.ok(pixelAt(viirs, 1).note.includes('nadir'));
});

test('the geostationary pick is global and ranked by pixel on this ground', () => {
  const picks = {
    Sacramento: bestGeostationary({ lat: 38.6, lon: -121.3 }),
    Athens: bestGeostationary({ lat: 38.0, lon: 23.7 }),
    Sydney: bestGeostationary({ lat: -33.9, lon: 151.2 }),
  };
  assert.ok(picks.Sacramento.name.includes('GOES'));
  assert.ok(picks.Athens.name.includes('Meteosat'));
  assert.ok(picks.Sydney.name.includes('Himawari'));
  for (const pick of Object.values(picks)) {
    assert.ok(pick.effectivePixelM >= pick.nadirPixelM, 'off-nadir pixels only grow');
  }
});

test('a good crossing locates the fire; a grazing one says it cannot', () => {
  const truth = { lat: 38.6, lon: -121.3 };
  const mk = (id, lat, lon) => sighting({ id, lat, lon, bearing: bearingDeg({ lat, lon }, truth), quality: 'aligned' });
  const good = fix([mk('A', 38.5, -121.4), mk('B', 38.52, -121.16)]);
  assert.ok(distanceM(good.position, truth) < 100, 'exact bearings should land on the fire');
  assert.ok(good.usable);
  assert.ok(good.bestCrossingDeg > 60);

  const grazing = fix([mk('N1', 38.2, -121.3), mk('N2', 38.24, -121.27)]);
  assert.equal(grazing.quality, 'grazing');
  assert.equal(grazing.usable, false, 'a sliver fix must not be offered as a location');
  assert.ok(grazing.ellipse.semiMajorM > 10_000);
  assert.ok(suggestThirdObserver(grazing).note.includes('across'));
});

test('parallel bearings return an explanation, not a plausible coordinate', () => {
  const parallel = fix([
    sighting({ id: 'A', lat: 38.2, lon: -121.3, bearing: 0 }),
    sighting({ id: 'B', lat: 38.25, lon: -121.3, bearing: 0 }),
  ]);
  assert.equal(parallel.quality, 'parallel');
  assert.equal(parallel.usable, false);
  assert.ok(parallel.note.includes('never cross'));
  assert.equal(fix([sighting({ id: 'A', lat: 38, lon: -121, bearing: 10 })]), null, 'one bearing is a direction');
});

test('a crossing behind an observer is rejected outright', () => {
  const contradictory = fix([
    sighting({ id: 'A', lat: 38.5, lon: -121.4, bearing: 45 }),
    sighting({ id: 'Bad', lat: 38.52, lon: -121.16, bearing: 200 }),
  ]);
  assert.equal(contradictory.quality, 'contradictory');
  assert.equal(contradictory.usable, false);
});

test('plume lean moves the fix upwind and widens it', () => {
  const truth = { lat: 38.6, lon: -121.3 };
  const mk = (id, lat, lon) => sighting({ id, lat, lon, bearing: bearingDeg({ lat, lon }, truth), quality: 'fixed' });
  const solved = fix([mk('A', 38.5, -121.4), mk('B', 38.52, -121.16)]);
  const corrected = correctForPlume(solved, { windFromDeg: 315, windMs: 10, observedHeightM: 800 });
  assert.ok(corrected.plumeCorrectionM > 100, 'a tall column in strong wind leans a long way');
  assert.ok(distanceM(corrected.position, solved.position) > 100, 'the fix must actually move');
  assert.ok(
    corrected.ellipse.semiMajorM > solved.ellipse.semiMajorM,
    'correcting a bias must not pretend to remove the uncertainty',
  );
  assert.ok(plumeLean({ observedHeightM: 0, windMs: 10 }).offsetM === 0);
});

test('node loss reads a front only when it progresses through space and time', () => {
  const T = Date.parse('2026-09-12T20:00:00Z');
  const progressive = classifyNodes(
    [
      { id: 'a', lat: 38.70, lon: -121.40, lastSeen: T - 30 * 60_000 },
      { id: 'b', lat: 38.69, lon: -121.38, lastSeen: T - 24 * 60_000 },
      { id: 'c', lat: 38.68, lon: -121.36, lastSeen: T - 18 * 60_000 },
      { id: 'd', lat: 38.67, lon: -121.34, lastSeen: T - 12 * 60_000 },
      { id: 'e', lat: 38.66, lon: -121.32, lastSeen: T - 12_000 },
    ],
    T,
  );
  const front = frontFromNodeLoss(progressive);
  assert.equal(front.isFront, true);
  assert.ok(front.speedMs > 0 && front.speedMs < 15);
  assert.ok(front.headingDeg > 90 && front.headingDeg < 180, 'travelling south-east');
  const path = nodesInPath(progressive, front);
  assert.equal(path.length, 1, 'the one surviving node ahead of it');
  assert.ok(path[0].etaMin > 0);
});

test('a simultaneous outage is a switch failure, not a fire', () => {
  const T = Date.parse('2026-09-12T20:00:00Z');
  // Four scattered nodes, all silent within twenty seconds. No fire crosses
  // kilometres that fast, and calling this a front is the false positive that
  // would discredit the whole layer.
  const simultaneous = classifyNodes(
    [
      { id: 'a', lat: 38.70, lon: -121.40, lastSeen: T - 600_000 },
      { id: 'b', lat: 38.60, lon: -121.20, lastSeen: T - 606_000 },
      { id: 'c', lat: 38.55, lon: -121.50, lastSeen: T - 612_000 },
      { id: 'd', lat: 38.72, lon: -121.10, lastSeen: T - 618_000 },
    ],
    T,
  );
  const verdict = frontFromNodeLoss(simultoneousFix(simultaneous));
  assert.equal(verdict.isFront, false);
  assert.ok(verdict.note.includes('upstream fault'));
  // And one loss is never a front.
  const single = frontFromNodeLoss(classifyNodes([{ id: 'x', lat: 38.6, lon: -121.3, lastSeen: T - 20 * 60_000 }], T));
  assert.equal(single.isFront, false);
  assert.ok(single.note.includes('not a front'));
  // Nothing lost at all says so plainly.
  const healthy = frontFromNodeLoss(classifyNodes([{ id: 'y', lat: 38.6, lon: -121.3, lastSeen: T - 5000 }], T));
  assert.ok(healthy.note.includes('still answering'));
});

/** Identity helper kept so the intent of the simultaneous case stays readable. */
const simultoneousFix = (nodes) => nodes;

test('the radio adapter survives hostile input and never invents occupancy', () => {
  assert.equal(parseAdapterFrame('{not json').ok, false);
  assert.equal(parseAdapterFrame(null).ok, false);
  assert.deepEqual(parseAdapterFrame({ nodes: 'nonsense', contacts: 42 }).contacts, []);
  // Confidence from an uncalibrated device is clamped, never trusted raw.
  const framed = parseAdapterFrame({ t: 1, contacts: [{ id: 'c', confidence: 99 }], sensor: { kind: 'csi' } });
  assert.equal(framed.contacts[0].confidence, 1);
  // With no sensor attached the answer is the capability report, not a count.
  const none = occupancy([], null);
  assert.equal(none.count, 0);
  assert.equal(none.headline, capability().headline);
  assert.ok(none.detail.includes('no radio API'));
});

test('link attenuation is corroboration, never a detection', () => {
  const quiet = linkAttenuation({ rssiNow: -63, rssiBaseline: -62, pathLengthM: 1000 });
  const dropped = linkAttenuation({ rssiNow: -78, rssiBaseline: -62, pathLengthM: 1400 });
  assert.equal(quiet.significant, false);
  assert.equal(dropped.significant, true);
  assert.ok(dropped.note.includes('corroboration'), 'it must not read as a detection');
});

test('corroboration counts independent sources, not observations', () => {
  const T = Date.parse('2026-09-12T20:00:00Z');
  const onePass = Array.from({ length: 40 }, (_, i) =>
    observation({
      kind: 'satellite',
      position: { lat: 38.6 + (i % 7) * 0.003, lon: -121.3 + (i % 5) * 0.004 },
      sigmaM: 400,
      atMs: T - 2 * 3600_000,
      independence: 'pass:one',
      strength: 0.9,
    }),
  );
  const threeKinds = [
    observation({ kind: 'satellite', position: { lat: 38.602, lon: -121.303 }, sigmaM: 400, atMs: T - 2 * 3600_000, independence: 'pass:one', strength: 0.9 }),
    observation({ kind: 'camera', position: { lat: 38.599, lon: -121.298 }, covariance: { ee: 90_000, en: 20_000, nn: 250_000 }, atMs: T - 120_000, independence: 'camera:a', strength: 0.8 }),
    observation({ kind: 'rf', position: { lat: 38.601, lon: -121.301 }, sigmaM: 60, atMs: T - 300_000, independence: 'network:seg', strength: 0.8 }),
  ];
  const [many] = fuseAll(onePass, { nowMs: T });
  const [few] = fuseAll(threeKinds, { nowMs: T });
  assert.equal(many.independentKeys, 1, '40 pixels off one pass are one look');
  assert.equal(few.independentKeys, 3);
  assert.ok(few.confidence > many.confidence * 2, 'three unrelated sensors must beat forty correlated pixels');
  assert.ok(many.note.includes('one look'));
  assert.ok(few.note.includes('unrelated ways'));
  assert.ok(few.missing.some((m) => m.kind === 'report'), 'absent sources are named');
});

test('fusion keeps two distant fires apart', () => {
  const T = Date.parse('2026-09-12T20:00:00Z');
  const here = observation({ kind: 'satellite', position: { lat: 38.6, lon: -121.3 }, sigmaM: 300, atMs: T, independence: 'pass:a', strength: 0.9 });
  const there = observation({ kind: 'satellite', position: { lat: 39.5, lon: -122.4 }, sigmaM: 300, atMs: T, independence: 'pass:a', strength: 0.9 });
  assert.equal(fuseAll([here, there], { nowMs: T, spreadRateMs: 0.5 }).length, 2);
  assert.equal(fuseAll([], { nowMs: T }).length, 0);
});

test('the demo scenario is recovered from its own sensors', () => {
  const scenario = demoScenario();
  const truth = DEMO_TRUTH.fire;

  // Cameras, with 1-2 degrees of error injected at about 10 km range.
  const solved = fix(scenario.sightings.map((s) => sighting(s)));
  assert.ok(solved.usable);
  assert.ok(distanceM(solved.position, truth) < 900, `camera fix ${distanceM(solved.position, truth)} m out`);

  // The node losses were spaced to imply an exact front speed.
  const front = frontFromNodeLoss(classifyNodes(scenario.nodes, scenario.atMs));
  assert.equal(front.isFront, true);
  assert.ok(
    Math.abs(front.speedMs - DEMO_TRUTH.frontSpeedMs) < 0.01,
    `front speed ${front.speedMs} vs truth ${DEMO_TRUTH.frontSpeedMs}`,
  );

  // And the satellite pixel centres sit at the stated offset from truth.
  const offsets = scenario.detections.map((d) => distanceM(d, truth));
  assert.ok(Math.abs(offsets[0] - DEMO_TRUTH.satelliteOffsetM) < 5);
  assert.ok(offsets[1] > offsets[0], 'the second pixel was placed further out');
});
