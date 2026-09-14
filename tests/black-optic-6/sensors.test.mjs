/**
 * The sensor maths: what each one can honestly report, and where it refuses.
 *
 * @module tests/black-optic-6/sensors
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BANDS, backgroundDb, bandEnergy, describeImpulse, findImpulses, rmsDb, spectralFlatness,
} from '../../public/black-optic-6/js/acoustic.js';
import {
  areaHectares, crossing, distanceToEdgeM, fenceState, inside, USELESS_ACCURACY_M,
} from '../../public/black-optic-6/js/perimeter.js';
import {
  LAYERS, TASKING_LADDER, latestDate, metresPerPixel, mosaic, resolutionNote, tileFor, tileUrl,
} from '../../public/black-optic-6/js/satellite.js';
import { alertState } from '../../public/black-optic-6/js/watch.js';
import { ringCapacity, Vault } from '../../public/black-optic-6/js/vault.js';

/** A 400 m square of Napa hillside. */
const BOUNDARY = [
  { lat: 38.5000, lon: -122.4000 },
  { lat: 38.5000, lon: -122.3954 },
  { lat: 38.5036, lon: -122.3954 },
  { lat: 38.5036, lon: -122.4000 },
];

/* ---------------------------------------------------------------- acoustic */

test('level is measured in dBFS and silence does not read as sound', () => {
  assert.equal(rmsDb(new Float32Array(128)), -120);
  assert.ok(rmsDb(Array.from({ length: 128 }, () => 0.5)) > -12);
  assert.ok(rmsDb(Array.from({ length: 128 }, () => 0.05)) < rmsDb(Array.from({ length: 128 }, () => 0.5)));
});

test('the background level is a median, so one loud event cannot raise the threshold', () => {
  const quiet = Array.from({ length: 60 }, () => -60);
  const withBang = [...quiet];
  withBang[30] = -6;
  assert.equal(backgroundDb(quiet), backgroundDb(withBang), 'an impulse must not move the floor it is judged against');
});

test('an impulse is found, reported once, and timed', () => {
  const levels = Array.from({ length: 400 }, (_, i) => -60 + Math.sin(i / 7) * 1.5);
  levels[250] = -42;
  levels[251] = -18;
  levels[252] = -30;
  const found = findImpulses(levels);
  assert.equal(found.length, 1, 'one bang is one event, not three');
  assert.ok(Math.abs(found[0].atSec - 2.51) < 0.05);
  assert.ok(found[0].riseDb > 30);
});

test('a slow swell is not an impulse and a quiet click is not an event', () => {
  const swell = Array.from({ length: 300 }, (_, i) => -70 + i * 0.05);
  assert.equal(findImpulses(swell).length, 0, 'a gradual rise is not an impulse');

  const quietClick = Array.from({ length: 300 }, () => -95);
  quietClick[150] = -70;
  assert.equal(findImpulses(quietClick).length, 0, 'below the floor, nothing is an event however sharp');
});

test('flatness separates broadband from tonal', () => {
  assert.ok(spectralFlatness(Array.from({ length: 64 }, () => 1)) > 0.9);
  assert.ok(spectralFlatness(Array.from({ length: 64 }, (_, i) => (i === 5 ? 1 : 0.001))) < 0.2);
  assert.equal(spectralFlatness([]), 0);
});

test('band energy is a fraction of the whole and the bands are named', () => {
  const magnitudes = Array.from({ length: 512 }, () => 1);
  const energy = bandEnergy(magnitudes, 48000, BANDS);
  const total = Object.values(energy).reduce((a, b) => a + b, 0);
  assert.ok(total > 0 && total <= 1.001);
  for (const band of BANDS) assert.ok(band.name in energy);
});

test('an impulse is described by shape and never named as a source', () => {
  const sharp = describeImpulse({ riseMs: 8, peakDb: -12 }, 0.7);
  assert.match(sharp.shape, /sharp/);
  // The console must not assert what made the sound.
  for (const flatness of [0.1, 0.5, 0.9]) {
    for (const riseMs of [5, 200]) {
      const described = describeImpulse({ riseMs, peakDb: -10 }, flatness);
      assert.doesNotMatch(described.shape, /gunshot|firearm|shot fired/i);
    }
  }
  assert.match(sharp.note, /cannot separate/i);
});

/* --------------------------------------------------------------- perimeter */

test('inside and outside are distinguished, and a degenerate boundary is neither', () => {
  assert.equal(inside({ lat: 38.5018, lon: -122.3977 }, BOUNDARY), true);
  assert.equal(inside({ lat: 38.4980, lon: -122.3977 }, BOUNDARY), false);
  assert.equal(inside({ lat: 38.5018, lon: -122.3977 }, [{ lat: 0, lon: 0 }]), false);
});

test('distance to the boundary measures to the edge, not to the nearest corner', () => {
  // Just inside the middle of the southern edge: the nearest corner is ~200 m
  // away along the fence, the nearest edge is a few metres below.
  const point = { lat: 38.50005, lon: -122.3977 };
  const metres = distanceToEdgeM(point, BOUNDARY);
  assert.ok(metres < 20, `expected a few metres to the edge, got ${metres.toFixed(0)}`);
});

test('a fix that straddles the line refuses to pick a side', () => {
  const straddling = fenceState({ lat: 38.5000, lon: -122.3977, accuracyM: 14 }, BOUNDARY);
  assert.equal(straddling.resolved, false);
  assert.equal(straddling.state, 'unresolved');
  assert.match(straddling.verdict, /straddles/);
});

test('a useless fix is refused outright, however far from the line it looks', () => {
  const useless = fenceState({ lat: 38.5018, lon: -122.3977, accuracyM: USELESS_ACCURACY_M + 5 }, BOUNDARY);
  assert.equal(useless.resolved, false);
  assert.match(useless.verdict, /too coarse/i);
});

test('a good fix well inside resolves, and says how far from the line it is', () => {
  const good = fenceState({ lat: 38.5018, lon: -122.3977, accuracyM: 6 }, BOUNDARY);
  assert.equal(good.resolved, true);
  assert.equal(good.inside, true);
  assert.ok(good.distanceM > 100);
});

test('a crossing needs two resolved fixes on opposite sides', () => {
  const inside_ = fenceState({ lat: 38.5018, lon: -122.3977, accuracyM: 6 }, BOUNDARY);
  const outside = fenceState({ lat: 38.4980, lon: -122.3977, accuracyM: 5 }, BOUNDARY);
  const vague = fenceState({ lat: 38.5000, lon: -122.3977, accuracyM: 14 }, BOUNDARY);

  assert.equal(crossing(inside_, outside).crossed, true);
  assert.equal(crossing(inside_, outside).direction, 'exited');
  assert.equal(crossing(inside_, vague).crossed, false, 'an unresolved fix cannot complete a crossing');
  assert.equal(crossing(inside_, inside_).crossed, false);
  assert.equal(crossing(null, outside).crossed, false);
});

test('no fix and no boundary are different answers, and neither is an alert', () => {
  assert.equal(fenceState(null, BOUNDARY).state, 'no-fix');
  assert.equal(fenceState({ lat: 38.5, lon: -122.4, accuracyM: 5 }, []).state, 'no-boundary');
});

test('the enclosed area is about right for a 400 m square', () => {
  const hectares = areaHectares(BOUNDARY);
  assert.ok(hectares > 14 && hectares < 18, `expected about 16 ha, got ${hectares.toFixed(1)}`);
  assert.equal(areaHectares([{ lat: 0, lon: 0 }]), 0);
});

/* --------------------------------------------------------------- satellite */

test('tile maths puts a position in the right tile and scales with zoom', () => {
  const napa = { lat: 38.5025, lon: -122.3977 };
  const low = tileFor(napa.lat, napa.lon, 3);
  const high = tileFor(napa.lat, napa.lon, 8);
  assert.ok(high.x > low.x && high.y > low.y);
  assert.ok(metresPerPixel(napa.lat, 8) < metresPerPixel(napa.lat, 3));
  assert.ok(metresPerPixel(0, 8) > metresPerPixel(60, 8), 'ground per pixel shrinks toward the poles');
});

test('a tile URL is a real GIBS request', () => {
  const url = tileUrl(LAYERS[0], '2026-09-13', { x: 40, y: 98, z: 8 });
  assert.match(url, /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\//);
  assert.ok(url.includes(LAYERS[0].id));
  assert.ok(url.endsWith('/8/98/40.jpg'));
});

test('a mosaic is square, centred, and never asks for a zoom the layer lacks', () => {
  for (const layer of LAYERS) {
    const grid = mosaic(layer, latestDate(), { lat: 38.5, lon: -122.4 }, 3);
    assert.equal(grid.tiles.length, 9);
    assert.ok(grid.zoom <= layer.maxZoom);
    assert.ok(grid.metresPerPixel > 0);
  }
});

test('the date defaults behind today, because near-real-time lags its overpass', () => {
  const now = Date.parse('2026-09-14T09:00:00Z');
  assert.equal(latestDate(now), '2026-09-13');
});

test('every layer states what it cannot resolve', () => {
  for (const layer of LAYERS) {
    const note = resolutionNote(layer);
    assert.equal(note.metresPerPixel, layer.metresPerPixel);
    assert.match(note.verdict, /never people or vehicles/);
    assert.ok(note.personFraction.includes('people'));
  }
});

test('the tasking ladder is honest at both ends', () => {
  assert.ok(TASKING_LADDER.length >= 4);
  assert.match(TASKING_LADDER[0].cost, /none/i);
  const sharpest = TASKING_LADDER[TASKING_LADDER.length - 1];
  assert.match(sharpest.note, /not a person|smudge/i);
});

/* ------------------------------------------------------------- watch/vault */

test('an alert needs something person-sized that stayed a while', () => {
  assert.equal(alertState([]).alert, false);
  const fleeting = [{ classification: { value: 'person' }, ageSec: 0.4 }];
  assert.equal(alertState(fleeting).alert, false, 'a flicker is not an intrusion');
  const animal = [{ classification: { value: 'animal' }, ageSec: 30 }];
  assert.equal(alertState(animal).alert, false, 'a deer is not an intrusion');
  const person = [{ classification: { value: 'person' }, ageSec: 4 }];
  assert.equal(alertState(person).alert, true);
  assert.match(alertState(person).reason, /1 contact/);
});

test('the vault ring is sized to hold the whole window', () => {
  assert.equal(ringCapacity(60), 60);
  assert.equal(ringCapacity(0.5), 1);
  assert.ok(ringCapacity(30) + ringCapacity(30) >= 60);
});

test('a clip filename carries its time and its hash', () => {
  const name = Vault.filename({
    atMs: Date.parse('2026-09-14T02:14:03Z'),
    hash: 'abc123def4567890',
    mime: 'video/mp4',
  });
  assert.match(name, /^bo6-2026-09-14T02-14-03-abc123def456\.mp4$/);
  assert.match(Vault.filename({ atMs: 0, hash: '', mime: 'video/webm' }), /\.webm$/);
});
