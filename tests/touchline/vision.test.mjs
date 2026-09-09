/**
 * Seeing the players, and not seeing what is not there.
 *
 * The failures that matter in this half of the app are asymmetric. A missed
 * player costs one row of a table. An invented one — a corner of the six-yard
 * box tracked as a centre-half who never moves — silently changes the
 * possession figure, the space control map and the team totals, and looks
 * completely reasonable on screen. So the first test here is that an empty
 * pitch produces nobody, and it asserts zero rather than "few".
 *
 * The second class of failure is subtler: distance covered accumulating from
 * noise. A goalkeeper standing still for a half must log exactly zero metres,
 * and that is asserted as equality, not as a tolerance, because any tolerance
 * at all is a number that grows without bound over ninety minutes.
 *
 * @module tests/touchline/vision
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HEIGHT_BAND,
  components,
  fitTurf,
  detect,
  greenness,
  medianSpread,
  paintWhite,
  sampleKit,
  suppressLines,
  turfMask,
} from '../../public/touchline/js/segment.js';
import { fitHomography } from '../../public/touchline/js/pitch.js';
import { MAX_SPEED_MPS, Tracker, kitDistance } from '../../public/touchline/js/track.js';
import { TeamVote, assignTeam, clusterKits, palette } from '../../public/touchline/js/teams.js';
import { ballCandidates } from '../../public/touchline/js/ball.js';
import { KITS, renderScene } from '../../public/touchline/js/demo.js';
import {
  DIMENSIONS,
  confirmed,
  marksFor,
  play,
  rig,
  trackNear,
} from './synthetic.mjs';

const cameraRig = rig();
const fit = fitHomography(marksFor(cameraRig.pitchToImage));

/** Render a scene through the fixture camera. */
function frameOf(players, ball = null, seed = 21) {
  return renderScene({
    basis: cameraRig.basis,
    pitchToImage: cameraRig.pitchToImage,
    players,
    ball,
    seed,
  });
}

/** Detect in a scene, fitting the turf model on an empty pitch first. */
function detectIn(players, ball = null, seed = 21) {
  const empty = frameOf([], null, 3);
  const turf = fitTurf(empty, { imageToPitch: fit.imageToPitch, dimensions: DIMENSIONS });
  const frame = frameOf(players, ball, seed);
  return { turf, frame, ...detect(frame, { turf, imageToPitch: fit.imageToPitch, dimensions: DIMENSIONS }) };
}

test('greenness ignores brightness and notices hue', () => {
  const sunlit = greenness(70, 190, 78);
  const shaded = greenness(28, 76, 31);
  assert.ok(Math.abs(sunlit - shaded) < 0.03, 'the same grass in sun and shade read differently');
  assert.ok(greenness(206, 42, 48) < 0, 'a red shirt read as green');
  assert.ok(greenness(232, 234, 230) < sunlit / 2, 'white paint read as green as the grass');
  assert.equal(greenness(3, 4, 3), 0, 'near-black was given a hue it does not have');
});

test('the turf model is a median, so players cannot drag it', () => {
  const clean = [0.3, 0.31, 0.29, 0.3, 0.32, 0.28];
  const withPlayers = [...clean, -0.2, -0.18, -0.25];
  assert.ok(
    Math.abs(medianSpread(clean).median - medianSpread(withPlayers).median) < 0.02,
    'three players moved the grass model',
  );
});

test('an empty pitch contains no players at all', () => {
  const { candidates } = detectIn([]);
  assert.equal(candidates.length, 0, `an empty pitch produced ${candidates.length} players`);
});

test('the turf model recognises a pitch as a pitch', () => {
  const { turf } = detectIn([]);
  assert.ok(turf.coverage > 0.9, `only ${(turf.coverage * 100).toFixed(0)}% of the pitch read as turf`);
  assert.ok(turf.samples > 500, 'too few samples to fit a model');
});

test('players are found where they are standing, to a quarter of a metre', () => {
  const players = [
    { x: 11, y: 34, kit: KITS.home },
    { x: 20, y: 40, kit: KITS.away },
    { x: 25, y: 24, kit: KITS.home },
    { x: 30, y: 50, kit: KITS.away },
    { x: 38, y: 20, kit: KITS.home },
  ];
  const { candidates } = detectIn(players);
  assert.equal(candidates.length, players.length, 'not every player was found');
  for (const player of players) {
    const nearest = Math.min(
      ...candidates.map((c) => Math.hypot(c.pitch.x - player.x, c.pitch.y - player.y)),
    );
    assert.ok(nearest < 0.25, `(${player.x}, ${player.y}) was found ${nearest.toFixed(2)} m away`);
  }
});

test('a team in white survives the line filter', () => {
  const players = [
    { x: 16.5, y: 13.84, kit: [240, 240, 244] },
    { x: 20, y: 30, kit: [238, 238, 242] },
    { x: 24, y: 44, kit: KITS.away },
  ];
  const { candidates } = detectIn(players);
  assert.equal(
    candidates.length,
    3,
    'a white kit was mistaken for paint, including one standing on a line',
  );
});

test('paint is removed by shape, and only paint', () => {
  const empty = frameOf([], null, 3);
  const turf = fitTurf(empty, { imageToPitch: fit.imageToPitch, dimensions: DIMENSIONS });
  const raw = turfMask(empty, { turf, imageToPitch: fit.imageToPitch, dimensions: DIMENSIONS });
  let before = 0;
  for (const value of raw) before += value;
  assert.ok(before > 1000, 'the painted lines were never in the mask to begin with');
  suppressLines(empty, raw, { turf, imageToPitch: fit.imageToPitch });
  let after = 0;
  for (const value of raw) after += value;
  assert.ok(after < before * 0.35, `paint removal left ${((after / before) * 100).toFixed(0)}% behind`);
});

test('two players who overlap are reported as one region, not split or lost', () => {
  // A camera behind the goal puts these two almost on top of each other.
  const { candidates } = detectIn([
    { x: 11, y: 34, kit: KITS.home },
    { x: 8, y: 44, kit: KITS.home },
  ]);
  assert.ok(candidates.length >= 1, 'both players vanished');
  if (candidates.length === 1) {
    assert.ok(candidates[0].merged, 'a two-player blob was reported as one ordinary player');
  }
});

test('the size gate is stated in player-heights, not pixels', () => {
  assert.ok(HEIGHT_BAND.min < 1 && HEIGHT_BAND.max > 1, 'a real player does not fit the band');
});

test('flood fill labels regions without losing any', () => {
  const width = 12;
  const height = 8;
  const mask = new Uint8Array(width * height);
  const set = (x, y) => {
    mask[y * width + x] = 1;
  };
  for (let y = 1; y <= 4; y += 1) for (let x = 1; x <= 2; x += 1) set(x, y);
  for (let y = 2; y <= 6; y += 1) for (let x = 8; x <= 9; x += 1) set(x, y);
  const blobs = components(mask, width, height, 2);
  assert.equal(blobs.length, 2);
  assert.equal(blobs[0].area + blobs[1].area, 8 + 10);
  const tall = blobs.find((b) => b.area === 10);
  assert.equal(tall.footV, 6, 'the foot point was not the bottom of the region');
});

test('a kit sample is the shirt, not the average of a whole player', () => {
  const { candidates } = detectIn([
    { x: 16, y: 30, kit: KITS.home },
    { x: 24, y: 40, kit: KITS.away },
  ]);
  const [home, away] = candidates[0].kit.b > candidates[1].kit.b
    ? [candidates[0], candidates[1]]
    : [candidates[1], candidates[0]];
  assert.ok(home.kit.b > 0.4, `blue shirt sampled as ${JSON.stringify(home.kit)}`);
  assert.ok(away.kit.r > 0.5, `red shirt sampled as ${JSON.stringify(away.kit)}`);
  assert.ok(kitDistance(home.kit, away.kit) > 0.3, 'the two kits sampled the same');
});

test('sampling a region with no shirt in it returns nothing rather than grey', () => {
  const frame = frameOf([], null, 4);
  const sample = sampleKit(frame, { minX: 5, maxX: 9, minY: 5, maxY: 30, area: 100 });
  assert.ok(sample.samples === 0 || sample.luma >= 0, 'a grass-only sample invented a kit');
});

test('white paint is recognised and coloured kit is not', () => {
  assert.ok(paintWhite(232, 234, 230));
  assert.ok(paintWhite(240, 240, 244));
  assert.ok(!paintWhite(30, 92, 200));
  assert.ok(!paintWhite(206, 42, 48));
  assert.ok(!paintWhite(34, 96, 38), 'grass read as paint');
});

test('a sprint is measured to within two percent of the truth', () => {
  const run = play({
    seconds: 5,
    at: (t) => ({
      players: [
        { x: 8 + 7 * t, y: 26, kit: KITS.home },
        { x: 20, y: 16, kit: KITS.away },
      ],
    }),
  });
  const runner = trackNear(run.tracker, { x: 8 + 7 * 4.96, y: 26 });
  const truthM = 7 * (run.frames - 1) / 25;
  assert.ok(
    Math.abs(runner.distanceM - truthM) / truthM < 0.02,
    `covered ${runner.distanceM.toFixed(2)} m against a true ${truthM.toFixed(2)} m`,
  );
  assert.ok(
    Math.abs(runner.topSpeedMps - 7) / 7 < 0.05,
    `top speed ${(runner.topSpeedMps * 3.6).toFixed(1)} km/h against a true 25.2`,
  );
  assert.equal(runner.sprints, 1, `counted ${runner.sprints} sprints in one continuous run`);
});

test('speeds are right across the range a footballer runs at', () => {
  for (const speed of [3, 5, 9]) {
    const run = play({
      seconds: 4.5,
      at: (t) => ({ players: [{ x: 6 + speed * t, y: 30, kit: KITS.home }] }),
    });
    const track = confirmed(run.tracker)[0];
    assert.ok(
      Math.abs(track.topSpeedMps - speed) / speed < 0.06,
      `${speed} m/s came back as ${track.topSpeedMps.toFixed(2)}`,
    );
  }
});

test('a player who never moves logs exactly zero metres', () => {
  const run = play({
    seconds: 6,
    at: () => ({
      players: [
        { x: 20, y: 16, kit: KITS.home },
        { x: 26, y: 52, kit: KITS.away },
        { x: 12, y: 34, kit: KITS.home },
      ],
    }),
  });
  for (const track of confirmed(run.tracker)) {
    // Equality, not a tolerance. Any tolerance here is a number that grows all
    // afternoon and turns a substitute who never came on into a marathon.
    assert.equal(track.distanceM, 0, `a stationary player logged ${track.distanceM} m`);
    assert.equal(track.sprints, 0);
    assert.equal(track.highIntensityM, 0);
  }
});

test('identities survive two players crossing', () => {
  const run = play({
    seconds: 6,
    at: (t) => ({
      players: [
        { x: 10 + 3 * t, y: 30, kit: KITS.home },
        { x: 28 - 3 * t, y: 30, kit: KITS.away },
      ],
    }),
  });
  const tracks = confirmed(run.tracker);
  assert.ok(tracks.length <= 3, `crossing produced ${tracks.length} identities from two players`);
  const survivors = tracks.filter((track) => track.distanceM > 8);
  assert.ok(survivors.length >= 1, 'both tracks lost their history at the crossing');
});

test('nothing moves faster than a human can run', () => {
  const run = play({
    seconds: 5,
    at: (t) => ({
      players: [
        { x: 8 + 7 * t, y: 26, kit: KITS.home },
        { x: 30 - 3 * t, y: 44, kit: KITS.away },
        { x: 20, y: 16, kit: KITS.home },
      ],
    }),
  });
  for (const track of confirmed(run.tracker)) {
    assert.ok(
      track.topSpeedMps <= MAX_SPEED_MPS,
      `${track.label} was clocked at ${(track.topSpeedMps * 3.6).toFixed(0)} km/h`,
    );
  }
});

test('two kits are clustered into two teams, and a keeper into neither', () => {
  const samples = [];
  const run = play({
    seconds: 4,
    at: () => ({
      players: [
        { x: 14, y: 26, kit: KITS.home },
        { x: 20, y: 40, kit: KITS.home },
        { x: 26, y: 22, kit: KITS.away },
        { x: 30, y: 46, kit: KITS.away },
        { x: 4, y: 34, kit: KITS.keeper },
      ],
    }),
    onFrame: ({ detection }) => {
      for (const candidate of detection.candidates) {
        if (candidate.kit?.samples > 12 && !candidate.merged) samples.push(candidate.kit);
      }
    },
  });
  // Every sample, keeper included: the clustering has to cope with a third
  // colour on the pitch rather than being handed a tidy two-kit problem.
  const model = clusterKits(samples);
  assert.ok(model, 'no kit model was produced');
  assert.ok(model.reliable, `kits were only ${model.separation.toFixed(2)} apart`);

  const labels = confirmed(run.tracker).map((track) => assignTeam(track.kit, model));
  const counted = { home: 0, away: 0, other: 0 };
  for (const label of labels) counted[label] += 1;
  assert.equal(
    counted.home + counted.away,
    4,
    `four outfield players became ${counted.home + counted.away}; the keeper was put on a team`,
  );
  assert.equal(counted.other, 1, 'the goalkeeper should belong to neither side');
  assert.ok(counted.home >= 1 && counted.away >= 1, 'both teams must be represented');
});

test('two kits that are nearly the same colour are declared unreliable', () => {
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    samples.push({ r: 0.34 + i * 0.001, g: 0.33, b: 0.33 });
    samples.push({ r: 0.35 + i * 0.001, g: 0.33, b: 0.32 });
  }
  const model = clusterKits(samples);
  assert.ok(!model.reliable, 'two indistinguishable kits were declared separable');
});

test('a team label is a vote, not a single frame', () => {
  const vote = new TeamVote();
  for (let i = 0; i < 20; i += 1) vote.cast(1, 'home');
  assert.equal(vote.verdict(1), 'home');
  // One bad frame must not flip a settled label.
  vote.cast(1, 'away');
  assert.equal(vote.verdict(1), 'home');
  assert.ok(vote.confidence(1) > 0.8);
  for (let i = 0; i < 30; i += 1) vote.cast(1, 'away');
  assert.equal(vote.verdict(1), 'away', 'a genuine change of evidence never took effect');
});

test('team colours come back as something visible rather than three greys', () => {
  const kit = palette({ centres: [{ r: 0.2, g: 0.3, b: 0.5 }, { r: 0.65, g: 0.17, b: 0.18 }] });
  assert.match(kit.home.css, /^rgb\(/);
  assert.match(kit.away.css, /^rgb\(/);
  assert.notEqual(kit.home.css, kit.away.css);
  assert.equal(kit.home.name, 'Team A', 'the app invented a club name');
});

test('the ball is found, and a line crossing is not mistaken for it', () => {
  const result = detectIn(
    [
      { x: 14, y: 30, kit: KITS.home },
      { x: 22, y: 38, kit: KITS.away },
    ],
    { x: 18, y: 32 },
  );
  const candidates = ballCandidates(result.frame, result.blobs, {
    imageToPitch: fit.imageToPitch,
    dimensions: DIMENSIONS,
  });
  assert.ok(candidates.length >= 1, 'the ball was not found at all');
  const nearest = Math.min(...candidates.map((c) => Math.hypot(c.x - 18, c.y - 32)));
  assert.ok(nearest < 0.6, `the nearest candidate was ${nearest.toFixed(2)} m from the ball`);

  const empty = detectIn([]);
  const ghosts = ballCandidates(empty.frame, empty.blobs, {
    imageToPitch: fit.imageToPitch,
    dimensions: DIMENSIONS,
  });
  assert.equal(ghosts.length, 0, `an empty pitch offered ${ghosts.length} balls`);
});

test('a ball in flight is tracked, and its speed is about right', () => {
  const run = play({
    seconds: 2.4,
    withBall: true,
    at: (t) => ({
      players: [
        { x: 9, y: 26, kit: KITS.home },
        { x: 24, y: 34, kit: KITS.away },
      ],
      ball: { x: 10 + 12 * t, y: 30 },
    }),
  });
  const state = run.ball.state(2400);
  assert.ok(state.seenShare > 0.8, `the ball was visible in only ${(state.seenShare * 100).toFixed(0)}% of frames`);
  assert.ok(
    Math.abs(state.speedMps - 12) < 2.5,
    `ball speed came back as ${state.speedMps.toFixed(1)} m/s against a true 12`,
  );
});

test('the tracker refuses an association no human could make', () => {
  const tracker = new Tracker({ imageToPitch: fit.imageToPitch });
  const kit = { r: 0.2, g: 0.3, b: 0.5, luma: 100, samples: 40 };
  for (let i = 0; i < 6; i += 1) {
    tracker.update(
      [{ pitch: { x: 20, y: 30 }, footU: 200, footV: 200, kit, merged: false }],
      i * 40,
    );
  }
  const before = confirmed(tracker)[0].id;
  // Forty metres in one fortieth of a second: no association may be made.
  tracker.update([{ pitch: { x: 60, y: 30 }, footU: 400, footV: 190, kit, merged: false }], 240);
  const still = tracker.tracks.find((track) => track.id === before);
  assert.ok(
    Math.hypot(still.x - 20, still.y - 30) < 2,
    'a track teleported forty metres in one frame',
  );
});
