/**
 * Play-engine verification against synthetic tracks.
 *
 * A scripted rep is fed through the engine frame by frame, with a hand-built
 * homography and known ground truth, so the numbers the HUD reports can be
 * checked against what actually happened. This is the test that catches a
 * plausible-looking but wrong "12.9 yards".
 *
 * The QB rep being simulated, at 60fps:
 *   - Snap at t=0, QB stationary in the pocket.
 *   - A defender closes from 12 yards out and breaks the 3.5-yard pressure
 *     radius at t=1.60s.
 *   - QB holds a beat, then escapes at 5 yd/s starting t=2.00s.
 *   - Release at t=3.00s, having covered 5.0 yards of escape.
 */
import { join } from 'node:path';
import { compile } from './compile.mjs';

const out = compile(['src/vision/homography.ts', 'src/vision/players.ts', 'src/metrics/playEngine.ts']);

const { PlayEngine, PRESSURE_RADIUS_YARDS } = await import(join(out, 'metrics/playEngine.js'));

let failures = 0;
const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!condition) failures++;
};
const near = (a, b, tol) => a !== null && Math.abs(a - b) <= tol;

/**
 * An identity-style homography: 10 pixels per yard, no perspective. Real
 * calibration is exercised in verify-math.mjs; here a simple known mapping
 * isolates the engine's timing and integration logic from projection.
 */
const PX_PER_YARD = 10;
const H = [1 / PX_PER_YARD, 0, 0, 0, 1 / PX_PER_YARD, 0, 0, 0, 1];

/** Build a player whose ankles sit at a given field position, in yards. */
const playerAt = (id, team, xYd, yYd) => {
  const x = xYd * PX_PER_YARD;
  const y = yYd * PX_PER_YARD;
  return {
    id, team, score: 0.9,
    box: { x: x - 15, y: y - 70, width: 30, height: 70 },
    keypoints: [
      { name: 'left_ankle', x: x - 3, y, score: 0.9 },
      { name: 'right_ankle', x: x + 3, y, score: 0.9 },
    ],
  };
};

const FPS = 60;
const STEP_MS = 1000 / FPS;
const QB_START = { x: 20, y: 30 };
const PRESSURE_BREAK_S = 1.6;
const ESCAPE_START_S = 2.0;
const ESCAPE_SPEED = 5;   // yd/s
const RELEASE_S = 3.0;

/** Defender closes on the QB, reaching exactly the pressure radius at 1.60s. */
const defenderDistanceAt = (t) => {
  const startDistance = 12;
  const closingRate = (startDistance - PRESSURE_RADIUS_YARDS) / PRESSURE_BREAK_S;
  return Math.max(0.5, startDistance - closingRate * t);
};

const qbPositionAt = (t) => {
  if (t <= ESCAPE_START_S) return { ...QB_START };
  return { x: QB_START.x + (t - ESCAPE_START_S) * ESCAPE_SPEED, y: QB_START.y };
};

const engine = new PlayEngine();
engine.setHomography(H);

const t0 = 1000;
check('snap is refused without calibration', (() => {
  const cold = new PlayEngine();
  return cold.snap(9, t0) === false;
})());

check('snap starts the rep once calibrated', engine.snap(9, t0) === true);

let framesAtRelease = null;
for (let frame = 0; ; frame++) {
  const t = (frame * STEP_MS) / 1000;
  if (t > RELEASE_S) break;

  const qb = qbPositionAt(t);
  const players = [
    playerAt(9, 0, qb.x, qb.y),
    // Defender approaches along +x, on the same line as the QB.
    playerAt(55, 1, qb.x + defenderDistanceAt(t), qb.y),
    // A team-mate parked inside the pressure radius the whole rep: pressure
    // must never fire on him, which is what the team check exists for.
    playerAt(72, 0, qb.x + 1.5, qb.y + 1),
  ];

  engine.update(players, t0 + frame * STEP_MS);
  framesAtRelease = frame;
}

engine.markThrow(
  [playerAt(9, 0, ...Object.values(qbPositionAt(RELEASE_S))),
   playerAt(55, 1, qbPositionAt(RELEASE_S).x + defenderDistanceAt(RELEASE_S), qbPositionAt(RELEASE_S).y)],
  t0 + framesAtRelease * STEP_MS,
);

// Ball lands 13 yards downfield of the release point, in pixels.
const release = qbPositionAt(RELEASE_S);
engine.markTarget({ x: (release.x + 13) * PX_PER_YARD, y: release.y * PX_PER_YARD });

const s = engine.snapshot();
console.log('\nsnapshot:', JSON.stringify(s, (_, v) =>
  typeof v === 'number' ? Number(v.toFixed(3)) : v));
console.log();

check('pressure onset matches the scripted break', near(s.pressureOnset, PRESSURE_BREAK_S, 0.05),
  `${s.pressureOnset?.toFixed(2)}s vs 1.60s`);

// Response is measured from onset, and the QB does not move until 2.00s, so the
// expected latency is 0.40s. Smoothing adds a small lag before the speed
// threshold is crossed, which is why the tolerance is a couple of frames.
check('pressure response measures onset -> movement',
  near(s.pressureResponse, ESCAPE_START_S - PRESSURE_BREAK_S, 0.12),
  `${s.pressureResponse?.toFixed(2)}s vs 0.40s`);

check('a team-mate inside the radius does not trigger pressure',
  s.pressureOnset > 1.0, 'onset came from the defender, not the nearby team-mate');

const expectedMovement = (RELEASE_S - ESCAPE_START_S) * ESCAPE_SPEED;
check('total movement integrates to the true path length',
  near(s.totalMovement, expectedMovement, 0.35),
  `${s.totalMovement.toFixed(2)} yd vs ${expectedMovement.toFixed(2)} yd`);

check('time to throw matches the release', near(s.timeToThrow, RELEASE_S, 0.05),
  `${s.timeToThrow?.toFixed(2)}s vs 3.00s`);

check('throw distance measured from the release point', near(s.throwDistance, 13, 0.2),
  `${s.throwDistance?.toFixed(2)} yd vs 13.00 yd`);

check('separation at release recorded', near(s.separationAtRelease, defenderDistanceAt(RELEASE_S), 0.3),
  `${s.separationAtRelease?.toFixed(2)} yd`);

// --- A clean-pocket rep must report no pressure at all, not zero. ---
const clean = new PlayEngine();
clean.setHomography(H);
clean.snap(9, 0);
for (let frame = 0; frame <= 120; frame++) {
  clean.update([
    playerAt(9, 0, QB_START.x, QB_START.y),
    playerAt(55, 1, QB_START.x + 15, QB_START.y),
  ], frame * STEP_MS);
}
const cleanSnap = clean.snapshot();
check('clean pocket reports no pressure', cleanSnap.pressureOnset === null);
check('clean pocket reports no response', cleanSnap.pressureResponse === null);
check('a stationary QB does not accumulate jitter yards', cleanSnap.totalMovement < 0.2,
  `${cleanSnap.totalMovement.toFixed(3)} yd over 2s standing still`);

// --- Losing the track mid-play must not corrupt the path length. ---
const occluded = new PlayEngine();
occluded.setHomography(H);
occluded.snap(9, 0);
for (let frame = 0; frame <= 120; frame++) {
  const t = (frame * STEP_MS) / 1000;
  const qb = { x: QB_START.x + t * 2, y: QB_START.y };   // steady 2 yd/s
  // The QB vanishes from detections for half a second mid-rep.
  const visible = !(t > 0.8 && t < 1.3);
  occluded.update(visible ? [playerAt(9, 0, qb.x, qb.y)] : [], frame * STEP_MS);
}
occluded.markThrow([], 120 * STEP_MS);
const occludedSnap = occluded.snapshot();
// True end-to-end travel is 2 yd/s over 2.0s = 4.0 yd. The QB is invisible for
// 0.5s in the middle, and the engine commits that gap as one straight-line
// displacement, so the full 4.0 should survive: bounded on BOTH sides, because
// a one-sided upper bound would also pass an engine that counted almost nothing.
check('occlusion gap neither inflates nor loses distance',
  occludedSnap.totalMovement > 3.6 && occludedSnap.totalMovement < 4.3,
  `${occludedSnap.totalMovement.toFixed(2)} yd vs true 4.00 yd across a 0.5s dropout`);

// --- Slow movement must be counted. This is the frame-rate trap: at 60fps a
// 2 yd/s jog advances only 0.033 yd per frame, so any per-frame distance floor
// coarse enough to reject jitter also silently deletes the whole rep. ---
const slow = new PlayEngine();
slow.setHomography(H);
slow.snap(9, 0);
for (let frame = 0; frame <= 120; frame++) {
  const t = (frame * STEP_MS) / 1000;
  slow.update([playerAt(9, 0, QB_START.x + t * 2, QB_START.y)], frame * STEP_MS);
}
slow.markThrow([], 120 * STEP_MS);
const slowSnap = slow.snapshot();
check('a slow 2 yd/s drift is measured, not filtered away',
  near(slowSnap.totalMovement, 4.0, 0.3),
  `${slowSnap.totalMovement.toFixed(2)} yd vs true 4.00 yd at 60fps`);

// --- Jitter rejection under simulated detector noise. ---
// A deterministic pseudo-random wobble of a few pixels on each ankle, which is
// what MoveNet actually produces on a stationary player.
let seed = 12345;
const noise = (amplitudePx) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return ((seed / 0x7fffffff) - 0.5) * 2 * amplitudePx;
};
const noisy = new PlayEngine();
noisy.setHomography(H);
noisy.snap(9, 0);
for (let frame = 0; frame <= 180; frame++) {
  const p = playerAt(9, 0, QB_START.x, QB_START.y);
  for (const kp of p.keypoints) { kp.x += noise(3); kp.y += noise(3); }
  noisy.update([p], frame * STEP_MS);
}
noisy.markThrow([], 180 * STEP_MS);
const noisySnap = noisy.snapshot();
check('detector jitter does not accumulate phantom yards',
  noisySnap.totalMovement < 0.6,
  `${noisySnap.totalMovement.toFixed(2)} yd over 3s of a stationary QB with 3px ankle noise`);

console.log(failures === 0 ? '\nAll engine checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
