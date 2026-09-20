/**
 * The other field.
 *
 * Almost nothing in this app is about football. The homography, the tracker,
 * the noise floors and the coverage accounting all say "a flat rectangle of
 * known size", and a gridiron is as flat as a pitch. So most of what is tested
 * here is the small, specific set of things that genuinely differ — and the one
 * that matters most is paint.
 *
 * A gridiron carries six-foot numbers every ten yards. A painted "4" is the
 * same height as a standing player, the same width, fills its bounding box to
 * the same degree, and stands on the same grass. Nothing about its geometry
 * gives it away, and a phantom player who never moves would quietly enter every
 * team total, the territory map and the tracked count while looking entirely
 * reasonable. The tests below assert that it does not — and, just as
 * importantly, that the rule which removes it still finds a player standing on
 * top of one, in any colour jersey.
 *
 * @module tests/touchline/gridiron
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRIDIRON,
  HASH_INSETS,
  SPORTS,
  YARD_M,
  brownBall,
  gridironLandmarks,
  gridironLines,
  gridironPaintedRegions,
  sportById,
  whiteBall,
} from '../../public/touchline/js/sports.js';
import { apply, fitHomography } from '../../public/touchline/js/pitch.js';
import {
  PAINT_SCENERY_HEIGHT,
  PAINT_SCENERY_SHARE,
  detect,
  fitTurf,
  inPaintedRegion,
  paintFraction,
} from '../../public/touchline/js/segment.js';
import { expectedPixelHeight } from '../../public/touchline/js/pitch.js';
import { ballCandidates } from '../../public/touchline/js/ball.js';
import { separations } from '../../public/touchline/js/passing.js';
import { definitions } from '../../public/touchline/js/metrics.js';
import { matchReport } from '../../public/touchline/js/report.js';
import { PossessionLedger } from '../../public/touchline/js/possession.js';
import {
  GRIDIRON_SET_SECONDS,
  GRIDIRON_TRUTH,
  KITS,
  camera,
  cameraBasis,
  gridironChoreography,
  gridironMarks,
  gridironNumberStrokes,
  gridironScene,
  project,
  renderScene,
} from '../../public/touchline/js/demo.js';
import { confirmed, gridironRig, play, trackNear } from './synthetic.mjs';

const scene = gridironScene();
const fit = fitHomography(gridironMarks());

/** Render a gridiron frame through the demo camera. */
function frameOf(players, ball = null, seed = 21) {
  return renderScene({ ...scene, players, ball, seed });
}

/** The turf model, fitted on an empty field as the app does. */
const turf = fitTurf(frameOf([], null, 3), {
  imageToPitch: fit.imageToPitch,
  dimensions: scene.dimensions,
});

/** Detection options, with the paint gate optionally disabled. */
function options(withPaintGate = true) {
  return {
    turf,
    imageToPitch: fit.imageToPitch,
    dimensions: scene.dimensions,
    lineWidthM: scene.lineWidthM,
    paintedRegions: withPaintGate ? scene.paintedRegions : [],
  };
}

/**
 * A steep, high camera — the angle where paint stops being foreshortened.
 *
 * From the sideline a painted number is squashed to four-fifths of a player's
 * height and the ordinary size gate removes it without help. Looking down
 * steeply, it is not, and the paint rule has to do the work. This rig exists so
 * the rule is tested where it matters rather than where it is unnecessary.
 */
function steepRig() {
  const spec = { position: [48, 10, 30], target: [48, 26, 0], fovDeg: 60, width: 640, height: 360 };
  const basis = cameraBasis(spec);
  const pitchToImage = camera(spec);
  const inFrame = (mark) => {
    const at = project(pitchToImage, mark.x, mark.y);
    return at.w > 0 && at.x > 4 && at.x < 636 && at.y > 4 && at.y < 356;
  };
  const marks = gridironLandmarks()
    .filter(inFrame)
    .slice(0, 5)
    .map((mark) => {
      const at = project(pitchToImage, mark.x, mark.y);
      return { image: { x: at.x, y: at.y }, pitch: { x: mark.x, y: mark.y } };
    });
  const steepFit = fitHomography(marks);
  const paint = {
    dimensions: GRIDIRON,
    lines: gridironLines(),
    markings: gridironNumberStrokes(),
    lineWidthM: SPORTS.gridiron.lineWidthM,
  };
  const empty = renderScene({ basis, pitchToImage, ...paint, players: [], ball: null, seed: 5 });
  const steepTurf = fitTurf(empty, {
    imageToPitch: steepFit.imageToPitch,
    dimensions: GRIDIRON,
  });
  return {
    basis,
    pitchToImage,
    paint,
    fit: steepFit,
    empty,
    render: (players) => renderScene({ basis, pitchToImage, ...paint, players, ball: null, seed: 9 }),
    detect: (frame, withGate) =>
      detect(frame, {
        turf: steepTurf,
        imageToPitch: steepFit.imageToPitch,
        dimensions: GRIDIRON,
        lineWidthM: paint.lineWidthM,
        paintedRegions: withGate ? gridironPaintedRegions() : [],
      }),
  };
}

/* ------------------------------------------------------------------- field */

test('the field is the size the rulebook says it is', () => {
  // 120 yards by 160 feet. The width is the one that invites a slip: 53 1/3
  // yards is 160 feet, and dividing by three instead gives a field a third the
  // right width that still looks plausible in a log line.
  assert.ok(Math.abs(GRIDIRON.lengthM - 109.728) < 0.001, `length was ${GRIDIRON.lengthM}`);
  assert.ok(Math.abs(GRIDIRON.widthM - 48.768) < 0.001, `width was ${GRIDIRON.widthM}`);
  assert.ok(Math.abs(GRIDIRON.endZoneM - 9.144) < 0.001);
  assert.ok(Math.abs(GRIDIRON.lengthM - 2 * GRIDIRON.endZoneM - 100 * YARD_M) < 0.001);
});

test('the hash marks sit where the code being played says', () => {
  // NFL hashes are 18 feet 6 inches apart; college hashes are much wider.
  const nflGap = GRIDIRON.widthM - 2 * HASH_INSETS.nfl;
  assert.ok(Math.abs(nflGap - 5.639) < 0.01, `NFL hash gap was ${nflGap.toFixed(3)} m`);
  const ncaaGap = GRIDIRON.widthM - 2 * HASH_INSETS.ncaa;
  assert.ok(Math.abs(ncaaGap - 12.192) < 0.01, `NCAA hash gap was ${ncaaGap.toFixed(3)} m`);
  assert.ok(HASH_INSETS.ncaa < HASH_INSETS.nfl);
});

test('every yard line and hash is inside the field', () => {
  for (const { a, b } of gridironLines()) {
    for (const point of [a, b]) {
      assert.ok(point.x >= -0.01 && point.x <= GRIDIRON.lengthM + 0.01, `x ${point.x}`);
      assert.ok(point.y >= -0.01 && point.y <= GRIDIRON.widthM + 0.01, `y ${point.y}`);
    }
  }
  // Goal lines, end lines, sidelines, 21 yard lines, and the hash and sideline
  // ticks: a lot more paint than a pitch carries, which is the whole problem.
  assert.ok(gridironLines().length > 300, 'the field is missing most of its markings');
});

test('the landmarks offered first are the ones that can be hit', () => {
  const ids = SPORTS.gridiron.calibrationIds;
  assert.ok(ids.length >= 4);
  assert.ok(/hash|near|far/.test(ids[0]), `first landmark was ${ids[0]}`);
  const corners = ids.findIndex((id) => id.startsWith('corner'));
  const hashes = ids.findIndex((id) => id.includes('yard') || id.includes('fifty'));
  if (corners >= 0) {
    assert.ok(hashes < corners, 'corners were offered before hash intersections');
  }
  const all = gridironLandmarks();
  for (const id of ids) {
    assert.ok(all.some((mark) => mark.id === id), `${id} is not a real landmark`);
  }
});

test('hash landmarks recover the camera exactly', () => {
  assert.ok(fit.residualM < 1e-9, `residual was ${fit.residualM} m`);
  // Points the fit never saw must land correctly too.
  for (const [x, y] of [
    [GRIDIRON.lengthM / 2, GRIDIRON.widthM / 2],
    [GRIDIRON.endZoneM, 10],
    [70, 30],
  ]) {
    const at = project(scene.pitchToImage, x, y);
    const back = apply(fit.imageToPitch, { x: at.x, y: at.y });
    assert.ok(Math.hypot(back.x - x, back.y - y) < 1e-6, `(${x}, ${y}) came back wrong`);
  }
});

/* -------------------------------------------------------------------- paint */

test('painted regions cover the numbers and nothing else', () => {
  const regions = gridironPaintedRegions();
  assert.equal(regions.length, 18, 'nine number pairs on each side of the field');
  // The middle of the field, the hash rows and the end zones carry no numbers.
  assert.ok(!inPaintedRegion({ x: GRIDIRON.lengthM / 2, y: GRIDIRON.widthM / 2 }, regions));
  assert.ok(!inPaintedRegion({ x: 5, y: 5 }, regions));
  // Beside the 20 yard line, a dozen yards in from the sideline, there is one.
  const region = regions[0];
  assert.ok(
    inPaintedRegion({ x: (region.minX + region.maxX) / 2, y: (region.minY + region.maxY) / 2 }, regions),
  );
});

test('an empty field with numbers painted on it contains no players', () => {
  const { candidates } = detect(frameOf([]), options(true));
  assert.equal(candidates.length, 0, `an empty field produced ${candidates.length} players`);
});

test('the paint rule removes a phantom the size gate cannot', () => {
  // From a steep angle the numbers stop being foreshortened and start passing
  // every test a standing player passes. This is the case the rule exists for,
  // and asserting it here means the rule cannot be quietly deleted as dead code.
  const rig = steepRig();
  const without = rig.detect(rig.empty, false).candidates.length;
  const with_ = rig.detect(rig.empty, true).candidates.length;
  assert.ok(without > 0, 'the steep camera no longer produces a phantom to remove');
  assert.equal(with_, 0, `the paint rule left ${with_} phantoms behind`);
});

test('a player standing on a number is still found, in any colour jersey', () => {
  const rig = steepRig();
  const regions = gridironPaintedRegions();
  const spot = regions.find((region) => {
    const at = project(rig.pitchToImage, (region.minX + region.maxX) / 2, (region.minY + region.maxY) / 2);
    return at.w > 0 && at.x > 40 && at.x < 600 && at.y > 40 && at.y < 320;
  });
  assert.ok(spot, 'no painted number was usable in this frame');
  const where = { x: (spot.minX + spot.maxX) / 2, y: (spot.minY + spot.maxY) / 2 };

  for (const [name, kit] of [
    ['white', [242, 242, 246]],
    ['red', KITS.away],
    ['blue', KITS.home],
  ]) {
    const found = rig
      .detect(rig.render([{ ...where, kit }]), true)
      .candidates.filter((c) => Math.hypot(c.pitch.x - where.x, c.pitch.y - where.y) < 1.5);
    assert.equal(
      found.length,
      1,
      `a player in ${name} standing on a yard number was not reported`,
    );
  }
});

test('the paint rule needs all three of its conditions', () => {
  // Any one of them alone deletes real players, so none may drift to a value
  // that makes it vacuous.
  assert.ok(PAINT_SCENERY_SHARE > 0.5 && PAINT_SCENERY_SHARE < 1);
  assert.ok(PAINT_SCENERY_HEIGHT > 0.9 && PAINT_SCENERY_HEIGHT < 1.4);
});

test('height, not colour, is what separates paint from a player standing on it', () => {
  const rig = steepRig();
  const regions = gridironPaintedRegions();
  const spot = regions.find((region) => {
    const at = project(rig.pitchToImage, (region.minX + region.maxX) / 2, (region.minY + region.maxY) / 2);
    return at.w > 0 && at.x > 40 && at.x < 600 && at.y > 40 && at.y < 320;
  });
  const where = { x: (spot.minX + spot.maxX) / 2, y: (spot.minY + spot.maxY) / 2 };
  const at = project(rig.pitchToImage, where.x, where.y);

  /** The biggest region sitting where the number is. */
  const regionAt = (frame) => {
    const blobs = rig
      .detect(frame, false)
      .blobs.filter((blob) => Math.abs(blob.cx - at.x) < 45 && blob.area > 120)
      .sort((a, b) => b.area - a.area);
    const blob = blobs[0];
    if (!blob) return null;
    const expected = expectedPixelHeight(rig.fit.imageToPitch, blob.footU, blob.footV);
    return {
      ratio: (blob.maxY - blob.minY + 1) / expected,
      paint: paintFraction(frame, blob),
    };
  };

  const bare = regionAt(rig.empty);
  assert.ok(bare, 'the painted number produced no region at all');
  assert.ok(bare.paint > 0.95, `paint alone measured ${bare.paint.toFixed(2)} paint`);
  assert.ok(
    bare.ratio < PAINT_SCENERY_HEIGHT,
    `paint alone stood ${bare.ratio.toFixed(2)} of a player tall`,
  );

  // A player standing on that number is still mostly paint by pixel count —
  // the number is attached to them — so colour cannot be the discriminator.
  // Height can: paint lies flat and they do not.
  for (const [name, kit] of [
    ['white', [242, 242, 246]],
    ['red', KITS.away],
  ]) {
    const withPlayer = regionAt(rig.render([{ ...where, kit }]));
    assert.ok(
      withPlayer.ratio > PAINT_SCENERY_HEIGHT,
      `a player in ${name} on a number measured only ${withPlayer.ratio.toFixed(2)} tall`,
    );
    assert.ok(
      withPlayer.ratio > bare.ratio + 0.2,
      `a player in ${name} added only ${(withPlayer.ratio - bare.ratio).toFixed(2)} of height`,
    );
  }
});

/* --------------------------------------------------------------------- ball */

test('a brown ball is recognised and grass, paint and skin are not', () => {
  assert.ok(brownBall(139, 90, 55), 'leather');
  assert.ok(brownBall(100, 65, 40), 'leather in shadow');
  assert.ok(brownBall(180, 120, 75), 'leather in sun');
  assert.ok(!brownBall(34, 96, 38), 'grass read as a ball');
  assert.ok(!brownBall(232, 234, 230), 'line paint read as a ball');
  assert.ok(!brownBall(230, 190, 160), 'pale skin read as a ball');
  assert.ok(!brownBall(198, 156, 124), 'skin read as a ball');
  assert.ok(!brownBall(206, 42, 48), 'a red jersey read as a ball');
});

test('the football test and the gridiron test do not overlap', () => {
  assert.ok(whiteBall(245, 245, 245) && !brownBall(245, 245, 245));
  assert.ok(brownBall(139, 90, 55) && !whiteBall(139, 90, 55));
});

test('a thrown ball is found, and the football model would have missed it', () => {
  // Timed from the snap rather than from the top of the loop, so the quiet
  // seconds at the start of the clip cannot silently move it off the throw.
  const thrown = gridironChoreography(GRIDIRON_SET_SECONDS + 3.2);
  assert.ok(thrown.ball, 'the choreography is not throwing at this moment');
  const frame = frameOf(thrown.players, thrown.ball, 70);
  const blobs = detect(frame, options(true)).blobs;
  const shared = { imageToPitch: fit.imageToPitch, dimensions: scene.dimensions };

  const brown = ballCandidates(frame, blobs, { ...shared, ball: SPORTS.gridiron.ball });
  const near = brown.filter((c) => Math.hypot(c.x - thrown.ball.x, c.y - thrown.ball.y) < 1.5);
  assert.ok(near.length >= 1, 'the brown ball was not found');

  const white = ballCandidates(frame, blobs, { ...shared, ball: SPORTS.soccer.ball });
  const wrong = white.filter((c) => Math.hypot(c.x - thrown.ball.x, c.y - thrown.ball.y) < 1.5);
  assert.equal(wrong.length, 0, 'the football colour model should find nothing here');
});

/* ------------------------------------------------------------- measurements */

test('a receiver’s speed is measured to within a few percent', () => {
  const run = play({
    // Long enough to cover the set, the snap and the whole route.
    seconds: GRIDIRON_SET_SECONDS + GRIDIRON_TRUTH.runSeconds + 1,
    rig: gridironRig(),
    marks: gridironMarks(),
    at: (t) => gridironChoreography(t),
  });
  const truth = GRIDIRON_TRUTH.receiverSpeedMps;
  const receiver = trackNear(run.tracker, GRIDIRON_TRUTH.routeEnd);
  assert.ok(receiver, 'the receiver was never tracked');
  assert.ok(
    Math.abs(receiver.topSpeedMps - truth) / truth < 0.08,
    `top speed ${(receiver.topSpeedMps * 3.6).toFixed(1)} km/h against a true ${(truth * 3.6).toFixed(1)}`,
  );
  assert.ok(
    Math.abs(receiver.distanceM - GRIDIRON_TRUTH.runDistanceM) / GRIDIRON_TRUTH.runDistanceM < 0.08,
    `covered ${receiver.distanceM.toFixed(1)} m against a true ${GRIDIRON_TRUTH.runDistanceM.toFixed(1)}`,
  );
});

test('linemen who never move log exactly zero metres', () => {
  const run = play({
    seconds: 5,
    rig: gridironRig(),
    marks: gridironMarks(),
    at: () => ({
      players: [
        { x: 33, y: 27, kit: KITS.home },
        { x: 34.5, y: 31, kit: KITS.away },
        { x: 33, y: 34, kit: KITS.home },
        { x: 34.5, y: 37.5, kit: KITS.away },
      ],
    }),
  });
  const tracks = confirmed(run.tracker);
  assert.ok(tracks.length >= 3, `only ${tracks.length} linemen were tracked`);
  for (const track of tracks) {
    assert.equal(track.distanceM, 0, `a stationary lineman logged ${track.distanceM} m`);
    assert.equal(track.sprints, 0);
  }
});

test('a gridiron sprint is a gridiron sprint, not a football one', () => {
  const soccer = definitions(SPORTS.soccer);
  const gridiron = definitions(SPORTS.gridiron);
  assert.ok(Math.abs(soccer.sprintKph - 25.2) < 0.1);
  assert.ok(Math.abs(gridiron.sprintKph - 35.4) < 0.2, `gridiron sprint was ${gridiron.sprintKph}`);
  assert.ok(gridiron.sprintKph > soccer.sprintKph);

  // And the tracker has to use it: at 8 m/s a footballer is sprinting and a
  // gridiron player is not, so the same run must be counted differently.
  const script = {
    seconds: 4,
    marks: gridironMarks(),
    at: (t) => ({
      players: [
        { x: 30 + 8 * Math.min(t, 3.5), y: 21.6, kit: KITS.home },
        { x: 33, y: 34, kit: KITS.away },
      ],
    }),
  };
  const asGridiron = play({ ...script, rig: gridironRig() });
  const runner = trackNear(asGridiron.tracker, { x: 30 + 8 * 3.5, y: 21.6 });
  assert.ok(runner.topSpeedMps > 7, 'the runner was not measured at football sprint pace');
  assert.equal(runner.sprints, 0, 'an 8 m/s run was counted as a gridiron sprint');
});

/* ---------------------------------------------------------------- reporting */

test('possession is declined for gridiron rather than invented', () => {
  assert.equal(SPORTS.gridiron.possession, 'none');
  assert.equal(SPORTS.soccer.possession, 'proximity');
  assert.equal(SPORTS.gridiron.passLanes, false);
});

test('the report says possession is not reported, and why', () => {
  const ledger = new PossessionLedger();
  for (let i = 0; i < 50; i += 1) ledger.update({ state: 'unseen' }, i * 40);
  const report = matchReport({
    sport: SPORTS.gridiron,
    sessionMs: 20000,
    possession: ledger.summary(),
    ball: { seenShare: 0.12 },
    rows: [],
    totals: { home: { tracked: 0 }, away: { tracked: 0 } },
    teams: { names: { home: 'Team A', away: 'Team B' } },
    calibration: { residualM: 0.05, worstM: 0.1 },
    staleFrames: 0,
  });
  assert.ok(
    report.caveats.some((line) => /not reported for this sport/i.test(line)),
    'the report did not say possession is unavailable',
  );
  assert.ok(
    report.caveats.some((line) => /downs/i.test(line)),
    'the report did not say why',
  );
  assert.ok(
    !report.lines.some((line) => /held the ball/i.test(line)),
    'the report quoted a possession figure anyway',
  );
  assert.equal(report.digest.possessionReported, false);
  assert.equal(report.digest.sport, 'gridiron');
  assert.ok(!/on the ball/i.test(report.headline), `headline was "${report.headline}"`);
});

test('separation is measured from positions, with no ball needed', () => {
  const rows = separations([
    { id: 1, label: 'WR', x: 60, y: 21, team: 'home', vx: 9, vy: 0 },
    { id: 2, label: 'CB', x: 57, y: 24, team: 'away', vx: 8, vy: 1 },
    { id: 3, label: 'TE', x: 40, y: 34, team: 'home', vx: 0, vy: 0 },
    { id: 4, label: 'LB', x: 41, y: 35, team: 'away', vx: 0, vy: 0 },
  ]);
  assert.equal(rows.length, 4);
  // Most separation first.
  assert.ok(rows[0].nearestM >= rows[rows.length - 1].nearestM);
  const te = rows.find((row) => row.label === 'TE');
  assert.ok(te.nearestM < 2, `the covered player measured ${te.nearestM} m`);
  assert.ok(!te.open, 'a player a metre from an opponent was called open');
  const wr = rows.find((row) => row.label === 'WR');
  assert.ok(wr.open, 'a player four metres clear was not called open');
  assert.equal(wr.nearestId, 2);
});

test('a player with nobody to be separated from is left out', () => {
  const rows = separations([
    { id: 1, label: 'solo', x: 40, y: 20, team: 'home' },
    { id: 2, label: 'ref', x: 45, y: 25, team: 'other' },
  ]);
  assert.equal(rows.length, 0, 'separation was reported with only one side on the field');
});

test('looking a sport up never returns nothing', () => {
  assert.equal(sportById('gridiron').id, 'gridiron');
  assert.equal(sportById('soccer').id, 'soccer');
  assert.equal(sportById('quidditch').id, 'soccer');
  assert.equal(sportById(undefined).id, 'soccer');
});
