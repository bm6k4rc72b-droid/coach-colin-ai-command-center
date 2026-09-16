import test from 'node:test';
import assert from 'node:assert/strict';

import {
  G_IN, FPS_PER_MPH, MOA_IN_100, MIL_IN_100, LOADS, TARGETS, load, dragK, densityRatio,
  velocityAt, timeOfFlight, dropInches, pathInches, windDriftInches, inchesToMoa,
  inchesToMil, solve, dopeCard, scoreShot, perfectHold,
} from '../../public/black-optic-6-site/js/range.js';

const m118 = load('308-175');
const creedmoor = load('6-5cm-140');

test('the constants are the real ones, not shooter\'s-inch approximations', () => {
  assert.ok(Math.abs(G_IN - 386.088) < 0.01);
  assert.ok(Math.abs(MOA_IN_100 - 1.047) < 0.001, 'a true MOA is 1.047", not 1"');
  assert.equal(MIL_IN_100, 3.6);
  assert.ok(Math.abs(FPS_PER_MPH - 1.46667) < 0.001);
});

test('velocity falls monotonically and a higher BC keeps more of it', () => {
  let previous = m118.mv + 1;
  for (const yards of [0, 100, 200, 300, 400, 500, 600]) {
    const v = velocityAt(m118, yards);
    assert.ok(v < previous, `velocity must fall by ${yards}`);
    previous = v;
  }
  // Same distance, better bullet: the Creedmoor retains a larger fraction.
  const retained = (spec) => velocityAt(spec, 500) / spec.mv;
  assert.ok(retained(creedmoor) > retained(m118));
});

test('the model tracks published .308 175 gr data inside its stated tolerance', () => {
  // Published figures for a 2,600 fps 175 gr SMK, sea level standard.
  const published = [
    { yards: 300, velocity: 2075, tof: 0.372 },
    { yards: 500, velocity: 1770, tof: 0.708 },
  ];
  for (const row of published) {
    const firing = solve(m118, row.yards, { zeroYd: 200, densityRatio: 1 });
    assert.ok(Math.abs(firing.velocity - row.velocity) < 60,
      `velocity at ${row.yards} was ${firing.velocity.toFixed(0)}, tables say ${row.velocity}`);
    assert.ok(Math.abs(firing.timeOfFlight - row.tof) < 0.04,
      `time of flight at ${row.yards} was ${firing.timeOfFlight.toFixed(3)}, tables say ${row.tof}`);
  }
});

test('drop is gravity acting for the time of flight, and nothing else', () => {
  for (const yards of [100, 300, 600]) {
    const t = timeOfFlight(m118, yards);
    assert.ok(Math.abs(dropInches(m118, yards) - 0.5 * G_IN * t * t) < 1e-9);
  }
  // Doubling the flight time roughly quadruples the drop.
  assert.ok(dropInches(m118, 600) / dropInches(m118, 300) > 3.4);
});

test('the bullet crosses the sight line exactly at the zero', () => {
  for (const zeroYd of [100, 200, 300]) {
    assert.ok(Math.abs(pathInches(m118, zeroYd, { zeroYd })) < 1e-9, `${zeroYd} yd zero must read zero`);
  }
  // At the muzzle it is sight-height low, by definition.
  assert.ok(Math.abs(pathInches(m118, 0, { zeroYd: 200, sightHeight: 1.8 }) + 1.8) < 1e-9);
  // A 200 yd zero puts it high in the middle and low beyond.
  assert.ok(pathInches(m118, 120, { zeroYd: 200 }) > 0);
  assert.ok(pathInches(m118, 400, { zeroYd: 200 }) < 0);
});

test('wind drift uses lag time, not full time of flight', () => {
  const yards = 500;
  const drift = windDriftInches(m118, yards, { windMph: 10 });
  const t = timeOfFlight(m118, yards);
  const naive = 10 * FPS_PER_MPH * t * 12;
  assert.ok(drift < naive * 0.6, 'the full-time-of-flight mistake roughly doubles every wind call');
  // Published 10 mph full-value drift for this load at 500 is about 21 inches.
  assert.ok(Math.abs(drift - 21) < 3, `drift was ${drift.toFixed(1)}", tables say about 21"`);
});

test('drift scales linearly with wind and vanishes in a headwind', () => {
  const ten = windDriftInches(m118, 400, { windMph: 10 });
  const twenty = windDriftInches(m118, 400, { windMph: 20 });
  assert.ok(Math.abs(twenty - ten * 2) < 1e-9);
  assert.ok(Math.abs(windDriftInches(m118, 400, { windMph: 10, windAngleDeg: 0 })) < 1e-9);
  // A half-value wind is half a full-value one, near enough to sin 30°.
  const half = windDriftInches(m118, 400, { windMph: 10, windAngleDeg: 30 });
  assert.ok(Math.abs(half - ten * 0.5) < 1e-9);
});

test('a better bullet buys wind, which is why everyone changed rifles', () => {
  const heavy = windDriftInches(m118, 600, { windMph: 10 });
  const sleek = windDriftInches(creedmoor, 600, { windMph: 10 });
  assert.ok(sleek < heavy, 'the 6.5 must drift less than the .308 at 600');
});

test('thin air means less drop — the Sierra hunt is not the Napa zero', () => {
  const sea = densityRatio(0, 59);
  const mountain = densityRatio(6000, 85);
  assert.ok(Math.abs(sea - 1) < 0.01, 'sea level standard must be 1.00');
  assert.ok(mountain < 0.85);
  const low = solve(m118, 500, { zeroYd: 200, densityRatio: sea });
  const high = solve(m118, 500, { zeroYd: 200, densityRatio: mountain });
  assert.ok(Math.abs(high.pathIn) < Math.abs(low.pathIn), 'thin air must drop less');
  assert.ok(high.velocity > low.velocity);
});

test('angular conversions are right, including the MOA/mil relationship', () => {
  assert.ok(Math.abs(inchesToMoa(1.047, 100) - 1) < 1e-9);
  assert.ok(Math.abs(inchesToMil(3.6, 100) - 1) < 1e-9);
  assert.ok(Math.abs(inchesToMoa(10.47, 1000) - 1) < 1e-9, 'an angle does not change with distance');
  // 1 mil is 3.438 MOA.
  assert.ok(Math.abs(inchesToMoa(3.6, 100) - 3.438) < 0.01);
  assert.equal(inchesToMoa(5, 0), 0, 'a zero distance must not divide by zero');
});

test('the hold sign is what a turret expects: dial up for a low bullet', () => {
  const far = solve(m118, 500, { zeroYd: 200 });
  assert.ok(far.pathIn < 0, 'the bullet is low at 500');
  assert.ok(far.holdMil > 0, 'so the elevation correction must be positive');
  assert.ok(Math.abs(far.holdMoa / far.holdMil - 3.438) < 0.01);
});

test('the solver admits when it is outside its fit', () => {
  const subsonic = solve(load('22lr-40'), 300, { zeroYd: 100 });
  assert.equal(subsonic.confident, false, 'a .22 at 300 yards is well past where this model works');
  const supersonic = solve(m118, 200, { zeroYd: 200 });
  assert.equal(supersonic.confident, true);
});

test('a dope card is complete and finite for every load in the safe', () => {
  for (const spec of LOADS) {
    const card = dopeCard(spec, { zeroYd: 100, windMph: 10 });
    assert.equal(card.length, 6);
    for (const row of card) {
      for (const key of ['velocity', 'timeOfFlight', 'pathIn', 'driftIn', 'holdMil', 'windMil']) {
        assert.ok(Number.isFinite(row[key]), `${spec.id} produced a non-finite ${key} at ${row.yards}`);
      }
      assert.ok(row.velocity > 0);
    }
  }
});

test('every target is static steel or paper at a measured distance', () => {
  for (const target of TARGETS) {
    assert.ok(target.yards >= 100);
    assert.ok(target.diameterIn > 0);
    assert.ok(['steel', 'paper'].includes(target.kind), 'the only things on this range are inanimate');
  }
});

test('a perfect hold hits dead centre, which is what makes the reveal teach', () => {
  for (const target of TARGETS) {
    const options = { zeroYd: 200, windMph: 12 };
    const perfect = perfectHold(m118, target, options);
    const shot = scoreShot(m118, target, { x: perfect.x, y: perfect.y }, options);
    assert.ok(shot.hit, `the correct hold must hit at ${target.yards}`);
    assert.ok(shot.missIn < 1e-9, 'and it must be a centre hit, not merely a hit');
  }
});

test('a miss names the dominant error rather than saying "miss"', () => {
  const target = TARGETS.find((t) => t.yards === 500);
  const options = { zeroYd: 200, windMph: 0 };
  // Aiming dead centre at 500 with a 200 yd zero drops far under the plate.
  const low = scoreShot(m118, target, { x: 0, y: 0 }, options);
  assert.equal(low.hit, false);
  assert.match(low.cause, /low/);

  // Correct elevation, no wind call, strong wind.
  const elevation = perfectHold(m118, target, { zeroYd: 200, windMph: 0 }).y;
  const windy = scoreShot(m118, target, { x: 0, y: elevation }, { zeroYd: 200, windMph: 20 });
  assert.equal(windy.hit, false);
  assert.match(windy.cause, /wind/);
});

test('dragK never divides by zero, whatever BC is handed to it', () => {
  assert.ok(Number.isFinite(dragK(0)));
  assert.ok(Number.isFinite(dragK(-1)));
  assert.ok(dragK(0.2) > dragK(0.6), 'a worse bullet must slow down faster');
});

test('load() falls back rather than returning undefined mid-render', () => {
  assert.equal(load('nonexistent').id, '308-168');
  assert.equal(load('6-5cm-140').id, '6-5cm-140');
});
