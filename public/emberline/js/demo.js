/**
 * A scenario whose answers are known before the app starts.
 *
 * Every number in here was chosen, not measured, which makes this the one place
 * in the app where ground truth exists. The fire is at an exact coordinate. The
 * camera bearings are computed *to* that coordinate and then deliberately
 * spoiled by a stated number of degrees, so the triangulator's error can be
 * compared against the error that was injected. The satellite pixels are offset
 * by a stated distance. The node losses are spaced at a stated interval, so the
 * front speed read back out of them has a right answer.
 *
 * That is what makes it a test rather than a showcase. {@link DEMO_TRUTH} is
 * imported by both the unit suites and the end-to-end harness, so the thing the
 * app is checked against is the same thing a person clicking "Run the demo"
 * sees, and a regression shows up in both at once.
 *
 * The scenario itself is ordinary on purpose: a chaparral fire in foothill
 * country on a hot afternoon with an established wind, which is the commonest
 * dangerous case there is rather than an exotic one.
 *
 * @module emberline/demo
 */

import { bearingDeg, destination } from './geo.js';

/**
 * The answers, for anything that wants to check the app against them.
 *
 * @type {Readonly<object>}
 */
export const DEMO_TRUTH = Object.freeze({
  /** Where the fire actually is. Nothing in the app is told this directly. */
  fire: Object.freeze({ lat: 38.6042, lon: -121.3125 }),
  /** Base time of the scenario, so every age in it is deterministic. */
  atMs: Date.parse('2026-09-12T21:10:00Z'),
  /** Degrees of error deliberately added to each camera bearing. */
  cameraBearingErrorDeg: Object.freeze({ 'Blue Ridge': 1.4, 'Mather Hill': -2.1, 'Olive Peak': 0.6 }),
  /** How far the satellite pixel centres sit from the true fire, metres. */
  satelliteOffsetM: 420,
  /** How old the satellite pass is at scenario time, minutes. */
  satelliteAgeMin: 132,
  /** Interval between successive node losses, seconds, and their spacing. */
  nodeLossIntervalS: 372,
  nodeSpacingM: 2130,
  /** The front speed those two imply, m/s — what the RF reader should recover. */
  frontSpeedMs: 2130 / 372,
  /** Conditions the spread model is given. */
  conditions: Object.freeze({
    fuel: 'FM4',
    windMs: 11.5,
    windFromDeg: 305,
    shelter: 'open',
    windReference: '10m',
    moisture1h: 0.045,
    moistureLive: 0.62,
    slopeDeg: 14,
    aspectDeg: 125,
    canopyBaseHeightM: 2.0,
  }),
  /** Places the scenario asks about, with their true ranges from the fire. */
  places: Object.freeze([
    Object.freeze({ name: 'Quarry Road homes', lat: 38.5795, lon: -121.2610, expectDownwind: true }),
    Object.freeze({ name: 'Ridgeview school', lat: 38.5560, lon: -121.2180, expectDownwind: true }),
    Object.freeze({ name: 'Feather Creek camp', lat: 38.6560, lon: -121.3660, expectDownwind: false }),
  ]),
});

/** Camera sites, surveyed, with the field of view each one covers. */
const CAMERA_SITES = [
  { id: 'Blue Ridge', lat: 38.5210, lon: -121.4090, quality: 'fixed' },
  { id: 'Mather Hill', lat: 38.5480, lon: -121.1720, quality: 'aligned' },
  { id: 'Olive Peak', lat: 38.7120, lon: -121.3520, quality: 'aligned' },
];

/**
 * The two satellite detections, one overpass, real pixel geometry.
 *
 * Both are given the same `independence` key downstream, because they are the
 * same pass — which is the point the fusion layer exists to make.
 *
 * @param {number} [atMs=DEMO_TRUTH.atMs] Scenario time.
 * @returns {Array<object>} Detections in the shape the FIRMS parser produces.
 */
export function demoDetections(atMs = DEMO_TRUTH.atMs) {
  const acquired = atMs - DEMO_TRUTH.satelliteAgeMin * 60_000;
  const iso = new Date(acquired).toISOString();
  const base = {
    pixelKnown: true,
    confidence: 'h',
    daynight: 'D',
    satellite: 'N20',
    instrument: 'VIIRS',
    acqDate: iso.slice(0, 10),
    acqTime: iso.slice(11, 13) + iso.slice(14, 16),
    acquiredMs: acquired,
  };
  // Offset from truth along two different bearings, at the stated distance, so
  // the pixel centres are wrong by a known amount in a known direction.
  const a = destination(DEMO_TRUTH.fire, 70, DEMO_TRUTH.satelliteOffsetM);
  const b = destination(DEMO_TRUTH.fire, 145, DEMO_TRUTH.satelliteOffsetM * 1.6);
  return [
    { ...base, lat: a.lat, lon: a.lon, scanKm: 0.44, trackKm: 0.39, frpMw: 78.4, brightnessK: 346.1 },
    { ...base, lat: b.lat, lon: b.lon, scanKm: 0.58, trackKm: 0.47, frpMw: 141.2, brightnessK: 358.9, confidence: 'n' },
  ];
}

/**
 * The three camera sightings, with their errors injected.
 *
 * @param {number} [atMs=DEMO_TRUTH.atMs] Scenario time.
 * @returns {Array<object>} Raw sighting inputs, ready for the triangulator.
 */
export function demoSightings(atMs = DEMO_TRUTH.atMs) {
  return CAMERA_SITES.map((site) => {
    const trueBearing = bearingDeg(site, DEMO_TRUTH.fire);
    return {
      id: site.id,
      lat: site.lat,
      lon: site.lon,
      // The camera sees the smoke column, not the fire, and it sees it with a
      // compass that is a little wrong. Both errors are put in on purpose.
      bearing: trueBearing + (DEMO_TRUTH.cameraBearingErrorDeg[site.id] ?? 0),
      quality: site.quality,
      atMs: atMs - 90_000,
    };
  });
}

/**
 * A mesh of ten surveyed nodes across the fire's path, four of them destroyed.
 *
 * The four losses are spaced at {@link DEMO_TRUTH.nodeLossIntervalS} apart and
 * {@link DEMO_TRUTH.nodeSpacingM} apart on the ground, running along the
 * scenario's wind direction — so the front speed the RF reader recovers has an
 * exact right answer, and the six survivors give the "about to burn" list
 * something to be about.
 *
 * @param {number} [atMs=DEMO_TRUTH.atMs] Scenario time.
 * @returns {Array<object>} Nodes in the shape the RF module classifies.
 */
export function demoNodes(atMs = DEMO_TRUTH.atMs) {
  const heading = (DEMO_TRUTH.conditions.windFromDeg + 180) % 360;
  const start = destination(DEMO_TRUTH.fire, DEMO_TRUTH.conditions.windFromDeg, 4200);
  const nodes = [];
  for (let i = 0; i < 10; i += 1) {
    const position = destination(start, heading, i * DEMO_TRUTH.nodeSpacingM);
    const lost = i < 4;
    nodes.push({
      id: `mesh-${String(i + 1).padStart(2, '0')}`,
      label: `Mesh ${i + 1}`,
      lat: position.lat,
      lon: position.lon,
      // The four that burned went silent in order; the rest answered seconds ago.
      lastSeen: lost
        ? atMs - (4 - i) * DEMO_TRUTH.nodeLossIntervalS * 1000
        : atMs - 12_000,
    });
  }
  return nodes;
}

/**
 * The whole scenario in one object.
 *
 * @param {number} [atMs=DEMO_TRUTH.atMs] Scenario time.
 * @returns {{atMs: number, detections: Array<object>, sightings: Array<object>,
 *   nodes: Array<object>, conditions: object, places: Array<object>,
 *   centre: {lat: number, lon: number}}} Everything the app needs to load.
 */
export function demoScenario(atMs = DEMO_TRUTH.atMs) {
  return {
    atMs,
    detections: demoDetections(atMs),
    sightings: demoSightings(atMs),
    nodes: demoNodes(atMs),
    conditions: { ...DEMO_TRUTH.conditions },
    places: DEMO_TRUTH.places.map((place) => ({ ...place })),
    centre: { ...DEMO_TRUTH.fire },
  };
}
