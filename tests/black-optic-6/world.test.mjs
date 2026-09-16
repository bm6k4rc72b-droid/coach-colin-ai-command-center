import test from 'node:test';
import assert from 'node:assert/strict';

import {
  USGS_ROOT, WINDOWS, BANDS, feedUrl, greatCircleKm, bearing, compass, MMI,
  intensity, parseQuake, parseFeed, near, describe, freshness, USGS_CREDIT,
} from '../../public/black-optic-6/js/world.js';

/** The ranch, near enough, for range maths. */
const NAPA = { lat: 38.2975, lon: -122.2869 };

const feature = (over = {}) => ({
  id: 'nc73999999',
  geometry: { type: 'Point', coordinates: [over.lon ?? -122.31, over.lat ?? 38.22, over.depth ?? 9.4] },
  properties: {
    mag: 4.2, magType: 'mw', place: '3km NW of Napa, CA', time: 1700000000000,
    updated: 1700000100000, status: 'reviewed', mmi: 5.1, cdi: 4.6, felt: 812,
    alert: 'green', tsunami: 0, url: 'https://earthquake.usgs.gov/x', net: 'nc',
    ...over.properties,
  },
});

test('feed URLs are built from the published band and window names', () => {
  assert.equal(feedUrl('2.5', 'day'), `${USGS_ROOT}/2.5_day.geojson`);
  assert.equal(feedUrl('significant', 'week'), `${USGS_ROOT}/significant_week.geojson`);
  for (const band of BANDS) {
    for (const window of WINDOWS) {
      assert.match(feedUrl(band.id, window.id), /^https:\/\/earthquake\.usgs\.gov\/.+\.geojson$/);
    }
  }
});

test('a bad band or window falls back rather than fetching a 404 forever', () => {
  assert.equal(feedUrl('M8', 'fortnight'), `${USGS_ROOT}/2.5_day.geojson`);
  assert.equal(feedUrl(), `${USGS_ROOT}/2.5_day.geojson`);
});

test('great-circle distance is right where a flat approximation would not be', () => {
  // Napa to Los Angeles, about 595 km — roughly 370 miles as the crow flies,
  // against ~400 road miles. A cos(lat)-scaled flat calculation is out by
  // kilometres at this range, which is why this is a second function.
  const la = { lat: 34.0522, lon: -118.2437 };
  const km = greatCircleKm(NAPA, la);
  assert.ok(Math.abs(km - 595) < 10, `got ${km.toFixed(0)} km`);

  assert.equal(greatCircleKm(NAPA, NAPA), 0);
  // Antipodal-ish sanity: half the circumference, about 20,015 km.
  assert.ok(Math.abs(greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }) - 20015) < 5);
  assert.ok(Number.isNaN(greatCircleKm(null, NAPA)));
});

test('bearing and compass agree on the cardinal directions', () => {
  assert.ok(Math.abs(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 0) < 1e-6);
  assert.ok(Math.abs(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 90) < 1e-6);
  assert.ok(Math.abs(bearing({ lat: 0, lon: 0 }, { lat: -1, lon: 0 }) - 180) < 1e-6);
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(180), 'S');
  assert.equal(compass(270), 'W');
  assert.equal(compass(-90), 'W', 'a negative bearing must still name a direction');
  assert.equal(compass(361), 'N');
});

test('intensity only ever describes a real reading', () => {
  assert.equal(intensity(null), null);
  assert.equal(intensity(0), null);
  assert.equal(intensity(undefined), null);
  assert.equal(intensity('big'), null);
  assert.equal(intensity(1.2).roman, 'I');
  // Rounds to nearest, the way ShakeMap reports an intensity.
  assert.equal(intensity(4.4).roman, 'IV');
  assert.equal(intensity(4.6).roman, 'V');
  assert.equal(intensity(9.9).roman, 'X+');
  // The scale is the standard one, not one invented here.
  assert.equal(MMI.length, 10);
  assert.equal(MMI[0].roman, 'I');
});

test('a feature is parsed into exactly the fields the panel shows', () => {
  const quake = parseQuake(feature());
  assert.equal(quake.magnitude, 4.2);
  assert.equal(quake.magType, 'mw');
  assert.equal(quake.depthKm, 9.4);
  assert.equal(quake.status, 'reviewed');
  assert.equal(quake.mmi, 5.1);
  assert.equal(quake.cdi, 4.6);
  assert.equal(quake.felt, 812);
  assert.equal(quake.tsunami, false);
  assert.equal(quake.lat, 38.22);
});

test('malformed features are dropped, not rendered as undefined', () => {
  assert.equal(parseQuake(null), null);
  assert.equal(parseQuake({}), null);
  assert.equal(parseQuake({ geometry: { coordinates: ['x', 'y'] }, properties: {} }), null);
  // A missing magnitude is survivable; a missing position is not.
  // Number(null) is 0, so the naive guard turns an unassigned magnitude into a
  // confident M0.0 and an absent felt-count into "0 reports".
  const noMag = parseQuake(feature({ properties: { mag: null, felt: null, cdi: null } }));
  assert.equal(noMag.magnitude, null);
  assert.equal(noMag.felt, null);
  assert.equal(noMag.cdi, null);
});

test('parseFeed reports what it dropped and what the feed claimed', () => {
  const parsed = parseFeed({
    metadata: { generated: 1700000200000, count: 3, title: 'USGS M2.5+ Past Day' },
    features: [feature(), { nonsense: true }, feature({ lat: 39, lon: -122 })],
  });
  assert.equal(parsed.quakes.length, 2);
  assert.equal(parsed.dropped, 1, 'a silent drop is how a feed change hides');
  assert.equal(parsed.claimed, 3);
  assert.equal(parsed.generated, 1700000200000);
});

test('an empty or absent feed is an ordinary case', () => {
  assert.deepEqual(parseFeed(null).quakes, []);
  assert.deepEqual(parseFeed({}).quakes, []);
  assert.equal(parseFeed({ features: [] }).dropped, 0);
});

test('near sorts closest first and filters by radius', () => {
  const quakes = [
    parseQuake(feature({ lat: 34.05, lon: -118.24 })),
    parseQuake(feature({ lat: 38.25, lon: -122.3 })),
    parseQuake(feature({ lat: 37.77, lon: -122.42 })),
  ];
  const all = near(quakes, NAPA);
  assert.equal(all.length, 3);
  for (let i = 1; i < all.length; i += 1) assert.ok(all[i].rangeKm >= all[i - 1].rangeKm);

  const close = near(quakes, NAPA, 100);
  assert.equal(close.length, 2, 'Los Angeles is not within 100 km of Napa');
  assert.deepEqual(near(quakes, null), []);
});

test('the console reports a reported intensity in preference to a modelled one', () => {
  const quake = near([parseQuake(feature())], NAPA)[0];
  const said = describe(quake);
  assert.equal(said.shaking.source, 'reported', 'what people felt beats what a model estimated');
  assert.equal(said.shaking.state, 'LINK');
  assert.match(said.shaking.note, /812 reports/);
});

test('with no Did You Feel It data it falls back to ShakeMap, labelled MODELLED', () => {
  const quake = near([parseQuake(feature({ properties: { cdi: null, felt: null } }))], NAPA)[0];
  const said = describe(quake);
  assert.equal(said.shaking.source, 'modelled');
  assert.equal(said.shaking.state, 'MODEL');
  assert.match(said.shaking.note, /not an estimate for this ranch/i);
});

test('with no published intensity the console refuses to invent one', () => {
  const quake = near([parseQuake(feature({ properties: { cdi: null, mmi: null, felt: null } }))], NAPA)[0];
  const said = describe(quake);
  assert.equal(said.shaking, null, 'no intensity may be synthesised from magnitude and distance');
  assert.ok(said.caveats.some((line) => /will not estimate/i.test(line)));
});

test('an unreviewed solution always carries the revision warning', () => {
  const quake = near([parseQuake(feature({ properties: { status: 'automatic' } }))], NAPA)[0];
  const said = describe(quake);
  assert.equal(said.reviewed, false);
  assert.ok(said.caveats.some((line) => /automatic/i.test(line) && /revis/i.test(line)));
});

test('a reviewed solution does not cry wolf', () => {
  const quake = near([parseQuake(feature())], NAPA)[0];
  assert.equal(describe(quake).reviewed, true);
  assert.ok(!describe(quake).caveats.some((line) => /automatic/i.test(line)));
});

test('a fixed depth and a large rupture are both called out', () => {
  const surface = near([parseQuake(feature({ depth: 0 }))], NAPA)[0];
  assert.ok(describe(surface).caveats.some((line) => /fixed by the analyst/i.test(line)));

  const big = near([parseQuake(feature({ properties: { mag: 6.8 } }))], NAPA)[0];
  assert.ok(describe(big).caveats.some((line) => /rupture/i.test(line)),
    'for a big event the epicentre is a misleading distance');
});

test('range is printed with precision that matches how well it is known', () => {
  const close = near([parseQuake(feature({ lat: 38.30, lon: -122.29 }))], NAPA)[0];
  assert.match(describe(close).range, /^\d+\.\d km [NSEW]/, 'under 10 km gets a decimal');
  const far = near([parseQuake(feature({ lat: 34.05, lon: -118.24 }))], NAPA)[0];
  assert.match(describe(far).range, /^\d+ km [NSEW]/, 'hundreds of km do not get a decimal');
});

test('a missing magnitude is said rather than printed as NaN', () => {
  const quake = near([parseQuake(feature({ properties: { mag: null } }))], NAPA)[0];
  assert.match(describe(quake).magnitude, /not yet assigned/i);
  assert.ok(!describe(quake).magnitude.includes('NaN'));
});

test('freshness is judged against the feed stamp, not the fetch', () => {
  const feed = { generated: 1700000000000 };
  const fresh = freshness(feed, 1700000000000 + 120000);
  assert.equal(fresh.stale, false);
  assert.match(fresh.verdict, /2 minutes ago/);

  const old = freshness(feed, 1700000000000 + 3600000);
  assert.equal(old.stale, true, 'a cached response returns instantly and is still an hour old');
  assert.match(old.verdict, /60 minutes old/);

  const unknown = freshness({ generated: null });
  assert.equal(unknown.known, false);
  assert.equal(unknown.stale, true, 'unknown age must fail closed');
});

test('the USGS credit travels with the data', () => {
  assert.match(USGS_CREDIT, /U\.S\. Geological Survey/);
});
