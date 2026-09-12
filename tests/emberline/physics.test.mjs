/**
 * The fire physics, against published values and physical invariants.
 *
 * Two kinds of assertion here, and the distinction matters. A handful check
 * absolute numbers against BehavePlus outputs for the same inputs — those are
 * the ones that would catch a transcription error in a Rothermel coefficient.
 * The rest check invariants that must hold whatever the coefficients are: zero
 * spread at the moisture of extinction, monotonic response to wind, grass
 * faster than compacted litter. Invariants survive a recalibration; absolute
 * values catch the errors invariants cannot see. Neither alone is enough.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FUEL_MODELS,
  crownFireLikely,
  fuelModel,
  midflameWind,
  moistureDamping,
  spreadRate,
  suppressionClass,
} from '../../public/emberline/js/rothermel.js';
import {
  INPUT_BAND,
  STEADY_STATE_HORIZON_MIN,
  arrivalWindow,
  evaluate,
  fireEllipse,
  headBackRatio,
  lengthToBreadth,
  projectSpread,
  projectedArea,
} from '../../public/emberline/js/spread.js';

const ORIGIN = { lat: 38.6, lon: -121.3 };

test('all thirteen Anderson fuel models are present and resolvable', () => {
  assert.equal(Object.keys(FUEL_MODELS).length, 13);
  for (let i = 1; i <= 13; i += 1) {
    assert.ok(fuelModel(String(i)), `FM${i} by bare number`);
    assert.ok(fuelModel(`FM${i}`), `FM${i} by code`);
    assert.ok(fuelModel(`fm${i}`), `FM${i} case-insensitively`);
  }
  assert.equal(fuelModel('FM99'), null);
});

test('FM1 matches BehavePlus within a few percent at a published operating point', () => {
  // Short grass, 6% dead moisture, 2 m/s midflame, level ground. BehavePlus
  // gives about 26 m/min for these inputs; no-wind is about 1.3 m/min.
  const windy = spreadRate({ fuel: 'FM1', moisture1h: 0.06, midflameWindMs: 2 });
  assert.ok(Math.abs(windy.rateOfSpreadMMin - 26) / 26 < 0.06, `got ${windy.rateOfSpreadMMin}`);
  const calm = spreadRate({ fuel: 'FM1', moisture1h: 0.06, midflameWindMs: 0 });
  assert.ok(Math.abs(calm.rateOfSpreadMMin - 1.3) / 1.3 < 0.2, `got ${calm.rateOfSpreadMMin}`);
});

test('spread is exactly zero at and above the moisture of extinction', () => {
  // Not "small" — zero. A fuel at extinction does not creep, and a spread
  // envelope that creeps across ground which will not carry fire is the error
  // that puts a containment line in the wrong place.
  const mx = FUEL_MODELS.FM1.deadMx;
  for (const moisture of [mx, mx + 0.01, mx + 0.5]) {
    const result = spreadRate({ fuel: 'FM1', moisture1h: moisture, midflameWindMs: 5 });
    assert.equal(result.rateOfSpreadMs, 0);
    assert.equal(result.willSpread, false);
    assert.ok(result.limit.includes('moisture of extinction'));
  }
  assert.equal(moistureDamping(0.12, 0.12), 0);
  assert.equal(moistureDamping(0.5, 0.12), 0);
  assert.ok(moistureDamping(0, 0.12) > 0.99);
});

test('spread rises monotonically with wind and with slope', () => {
  let previous = -1;
  for (const wind of [0, 0.5, 1, 2, 3, 4, 6, 8]) {
    const ros = spreadRate({ fuel: 'FM2', moisture1h: 0.07, midflameWindMs: wind }).rateOfSpreadMs;
    assert.ok(ros > previous, `wind ${wind}: ${ros} should exceed ${previous}`);
    previous = ros;
  }
  previous = -1;
  for (const slope of [0, 5, 10, 20, 30, 40]) {
    const ros = spreadRate({ fuel: 'FM10', moisture1h: 0.08, midflameWindMs: 1, slopeDeg: slope }).rateOfSpreadMs;
    assert.ok(ros > previous, `slope ${slope}: ${ros} should exceed ${previous}`);
    previous = ros;
  }
});

test('grass outruns compacted timber litter under identical conditions', () => {
  const conditions = { moisture1h: 0.06, midflameWindMs: 2 };
  const grass = spreadRate({ ...conditions, fuel: 'FM1' }).rateOfSpreadMs;
  const litter = spreadRate({ ...conditions, fuel: 'FM8' }).rateOfSpreadMs;
  const slash = spreadRate({ ...conditions, fuel: 'FM13' }).rateOfSpreadMs;
  assert.ok(grass > litter * 5, 'grass should be far faster than closed litter');
  assert.ok(grass > slash, 'grass should outrun heavy slash on rate');
  // Heavy slash is slower but much more intense — the ordering inverts.
  assert.ok(
    spreadRate({ ...conditions, fuel: 'FM13' }).firelineIntensityKwM >
      spreadRate({ ...conditions, fuel: 'FM1' }).firelineIntensityKwM,
  );
});

test('midflame wind reduction is applied, and never skipped', () => {
  const open = midflameWind(10, 'open', '10m');
  const dense = midflameWind(10, 'dense', '10m');
  assert.ok(open.midflameMs < 10, 'midflame must be below the reference wind');
  assert.ok(dense.midflameMs < open.midflameMs / 3, 'closed canopy shelters far more');
  assert.equal(midflameWind(0, 'open').midflameMs, 0);
  assert.ok(midflameWind(-5, 'open').midflameMs >= 0, 'negative wind clamps to zero');
  // A 20 ft reference is already lower than a 10 m one, so it converts higher.
  assert.ok(midflameWind(10, 'open', '20ft').midflameMs > midflameWind(10, 'open', '10m').midflameMs);
});

test('flame length drives the suppression class through the standard thresholds', () => {
  assert.equal(suppressionClass(1.0).class, 'direct-hand');
  assert.equal(suppressionClass(1.5).class, 'direct-equipment');
  assert.equal(suppressionClass(2.7).class, 'indirect');
  assert.equal(suppressionClass(5.0).class, 'no-attack');
});

test('crowning is reported against Van Wagner’s threshold, not guessed', () => {
  const low = crownFireLikely(50, 5);
  const high = crownFireLikely(50_000, 2);
  assert.equal(low.likely, false);
  assert.equal(high.likely, true);
  assert.ok(high.thresholdKwM < low.thresholdKwM, 'a lower crown base crowns more easily');
  // No canopy given means no claim either way.
  assert.equal(crownFireLikely(9999, 0).likely, false);
});

test('fire shape elongates with wind and is circular without it', () => {
  assert.ok(Math.abs(lengthToBreadth(0) - 1) < 0.05, 'no wind gives a circle');
  assert.equal(headBackRatio(1), 1);
  let previous = 0;
  for (const wind of [0, 1, 2, 4, 8]) {
    const lb = lengthToBreadth(wind);
    assert.ok(lb >= previous, 'length-to-breadth must not fall as wind rises');
    previous = lb;
  }
  assert.ok(lengthToBreadth(50) <= 8, 'capped rather than extrapolated');
  assert.ok(headBackRatio(4) > 10, 'an elongated fire backs far slower than it heads');
});

test('the ellipse puts the ignition point at the rear, not the centre', () => {
  const e = fireEllipse(ORIGIN, 1, 90, 4, 3600);
  assert.ok(e.headM > e.backM * 5, 'the head must far exceed the back under wind');
  assert.ok(e.widthM < e.headM, 'and the fire must be longer than it is wide');
  const circle = fireEllipse(ORIGIN, 1, 90, 1, 3600);
  assert.ok(Math.abs(circle.headM - circle.backM) < 1e-6, 'no elongation means equal head and back');
});

test('a projection returns three ordered perimeters, and the band has width', () => {
  const conditions = { fuel: 'FM4', windMs: 10, windFromDeg: 315, moisture1h: 0.05, moistureLive: 0.7 };
  const p = projectSpread(ORIGIN, conditions, 60);
  assert.ok(p.slow.headM < p.expected.headM, 'slow run must be slower than expected');
  assert.ok(p.expected.headM < p.fast.headM, 'fast run must be faster than expected');
  const area = projectedArea(p);
  assert.ok(area.slowHa < area.expectedHa && area.expectedHa < area.fastHa);
  assert.ok(area.fastHa > area.slowHa * 1.5, 'the band must be wide enough to be worth drawing');
  assert.ok(INPUT_BAND.windLow < 1 && INPUT_BAND.windHigh > 1);
});

test('arrival is a window whose edges are ordered, on every bearing', () => {
  const conditions = {
    fuel: 'FM4', windMs: 12, windFromDeg: 315, moisture1h: 0.05,
    moistureLive: 0.65, slopeDeg: 12, aspectDeg: 135,
  };
  // Downwind, across the flank, and upwind. The flank is the case where naming
  // the fast run "earliest" produced an inverted window.
  for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const target = {
      lat: ORIGIN.lat + 0.06 * Math.cos((bearing * Math.PI) / 180),
      lon: ORIGIN.lon + 0.06 * Math.sin((bearing * Math.PI) / 180),
    };
    const a = arrivalWindow(ORIGIN, target, conditions);
    if (!a.reachable) continue;
    assert.ok(a.earliestMin <= a.expectedMin, `bearing ${bearing}: earliest after expected`);
    assert.ok(a.expectedMin <= a.latestMin, `bearing ${bearing}: expected after latest`);
    assert.ok(a.note.length > 0);
  }
});

test('downwind arrives sooner than upwind, by a wide margin', () => {
  const conditions = { fuel: 'FM4', windMs: 12, windFromDeg: 270, moisture1h: 0.05, moistureLive: 0.65 };
  const downwind = arrivalWindow(ORIGIN, { lat: ORIGIN.lat, lon: ORIGIN.lon + 0.05 }, conditions);
  const upwind = arrivalWindow(ORIGIN, { lat: ORIGIN.lat, lon: ORIGIN.lon - 0.05 }, conditions);
  assert.ok(downwind.earliestMin * 10 < upwind.earliestMin, 'upwind must be far slower');
  assert.ok(downwind.offHeadingDeg < 15);
  assert.ok(upwind.offHeadingDeg > 165);
});

test('arrivals past the steady-state horizon are flagged, not presented as times', () => {
  const conditions = { fuel: 'FM8', windMs: 1, windFromDeg: 270, moisture1h: 0.2 };
  const far = arrivalWindow(ORIGIN, { lat: ORIGIN.lat + 0.5, lon: ORIGIN.lon }, conditions);
  if (far.reachable) {
    assert.equal(far.beyondHorizon, true);
    assert.ok(far.note.includes('hours'));
    assert.ok(far.earliestMin > STEADY_STATE_HORIZON_MIN);
  }
});

test('the head points downwind, and slope bends it upslope', () => {
  const windOnly = evaluate({ fuel: 'FM2', windMs: 8, windFromDeg: 270, moisture1h: 0.07 });
  assert.ok(Math.abs(windOnly.heading - 90) < 1, 'a wind from the west drives the fire east');
  const withSlope = evaluate({
    fuel: 'FM2', windMs: 8, windFromDeg: 270, moisture1h: 0.07, slopeDeg: 30, aspectDeg: 180,
  });
  // Aspect 180 means the ground falls south, so fire is pushed north of east.
  assert.ok(withSlope.heading < 90, `slope should bend the head north of east, got ${withSlope.heading}`);
});

test('a fuel that cannot burn reports why rather than returning a small number', () => {
  const soaked = spreadRate({ fuel: 'FM8', moisture1h: 0.9, midflameWindMs: 10 });
  assert.equal(soaked.rateOfSpreadMs, 0);
  assert.ok(typeof soaked.limit === 'string' && soaked.limit.length > 10);
  assert.throws(() => spreadRate({ fuel: 'nonsense' }), /Unknown fuel model/);
});
