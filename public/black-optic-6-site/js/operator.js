/**
 * The operator — an original figure, drawn as a rig, walking toward camera.
 *
 * The brief asked for a specific character from a game. That likeness belongs to
 * somebody else, so this is a different design built to the same read: long
 * storm coat, hard-surface shoulder and shin plates, a full visor with a single
 * horizontal light bar. Nothing here is traced. It is a skeleton with angles,
 * which is the only reason it can walk at all — a traced still cannot take a
 * step.
 *
 * Three things make the approach read as cinema rather than a sprite scaling up:
 *
 * - **Screen size grows linearly, not distance.** Apparent height goes as 1/d,
 *   so walking 64 m → 2.6 m at a constant pace would sit motionless for most of
 *   the scroll and then explode in the last tenth. Instead the timeline
 *   interpolates 1/d, which puts the *growth on screen* at a constant rate. It
 *   is the same trick a dolly operator uses to keep a subject's size changing
 *   evenly through a push-in.
 * - **The gait is driven by ground covered, not by time.** Step count is
 *   distance ÷ stride length. Scroll back and his feet walk backwards through
 *   the same footfalls; stop scrolling and he stops mid-step, weight on one
 *   leg. A figure whose legs cycle on a timer while his position is scrubbed is
 *   the single most common tell of a fake walk cycle.
 * - **Stride is anthropometric.** 0.43 × standing height is the ratio measured
 *   across adult walking gait, so a 1.83 m operator takes a 0.79 m step and
 *   crosses 64 m in about 81 of them. The number is not decorative; it sets how
 *   fast his legs move relative to the ground, and the eye notices when it is
 *   wrong even when it cannot say why.
 *
 * @module black-optic-6-site/operator
 */

import { clamp01, lerp } from './timeline.js';

/** Standing height, metres. Tall, but inside the human range. */
export const HEIGHT_M = 1.83;

/** Stride length as a fraction of standing height, from adult gait studies. */
export const STRIDE_RATIO = 0.43;

/** Where the walk starts and stops, in metres from camera. */
export const APPROACH = Object.freeze({ startM: 64, endM: 2.6 });

/**
 * Pinhole focal length in pixels, for a 1080-tall frame with a ~34° vertical
 * field of view — a 50 mm-equivalent look, the least editorial lens there is.
 */
export const FOCAL_PX = 1740;

/** Stride length in metres for a given standing height. */
export function strideLength(heightM = HEIGHT_M) {
  return heightM * STRIDE_RATIO;
}

/**
 * Distance from camera at a scroll progress.
 *
 * Interpolating reciprocal distance is what keeps apparent size changing at a
 * constant rate. See the module note.
 */
export function distanceAt(progress, approach = APPROACH) {
  const inverse = lerp(1 / approach.startM, 1 / approach.endM, clamp01(progress));
  return 1 / inverse;
}

/** Apparent height in pixels at a distance, for a frame of a given height. */
export function apparentHeight(distanceM, frameHeight = 1080, heightM = HEIGHT_M) {
  if (!(distanceM > 0)) return frameHeight * 4;
  const focal = FOCAL_PX * (frameHeight / 1080);
  return (focal * heightM) / distanceM;
}

/**
 * Gait phase, 0..1 over one full two-step cycle, from ground covered.
 *
 * Returned as `{ phase, steps }` because the step count is worth having: the
 * footfall is what a dust puff or a footstep cue should fire on, and firing it
 * off a phase wrap alone drops steps when the scroll jumps.
 */
export function gaitPhase(distanceCovered, heightM = HEIGHT_M) {
  const stride = strideLength(heightM);
  const steps = Math.max(distanceCovered, 0) / stride;
  return { steps, phase: ((steps / 2) % 1 + 1) % 1 };
}

/** Degrees → radians, because every angle below is written in degrees. */
const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Joint angles for a walk cycle at a phase.
 *
 * The hip is very close to a sinusoid in real gait. The knee is not — it flexes
 * sharply through swing and stays near-straight through stance, so it gets a
 * rectified sine biased into the swing half. Arms swing in counterphase to the
 * leg on the same side, at roughly half the amplitude, which is what stops a
 * walk looking like a march.
 *
 * All angles are in degrees, measured from straight down, positive forward.
 */
export function gaitPose(phase, { amplitude = 1 } = {}) {
  const t = ((phase % 1) + 1) % 1;
  const theta = t * Math.PI * 2;
  const hipSwing = 24 * amplitude;

  const leg = (offset) => {
    const a = theta + offset;
    const hip = Math.sin(a) * hipSwing;
    // Swing phase is the half of the cycle where the hip is travelling forward.
    const swing = Math.max(Math.sin(a - Math.PI / 2), 0);
    const knee = (8 + 52 * swing * swing) * amplitude;
    const ankle = Math.sin(a + Math.PI / 3) * 12 * amplitude;
    return { hip, knee, ankle };
  };

  const left = leg(0);
  const right = leg(Math.PI);
  const bob = Math.abs(Math.cos(theta)) * 0.018 * amplitude;

  return {
    phase: t,
    left,
    right,
    // Arms counter the leg on the same side.
    leftArm: { shoulder: -right.hip * 0.55, elbow: 14 + Math.max(right.hip, 0) * 0.5 },
    rightArm: { shoulder: -left.hip * 0.55, elbow: 14 + Math.max(left.hip, 0) * 0.5 },
    /** Vertical bob as a fraction of standing height — twice per cycle. */
    bob,
    /** Torso counter-rotation, radians, opposing the pelvis. */
    twist: rad(-Math.sin(theta) * 6 * amplitude),
  };
}

/**
 * What he is doing in each act.
 *
 * The brief was that he uses the platform's features as he walks. Each posture
 * names the prop, how much it costs him in arm swing (a figure holding a rifle
 * does not swing both arms), and which hand carries it.
 */
export const POSTURES = Object.freeze([
  { id: 'arrival', prop: 'none', label: 'Approach', swing: 1, hand: null,
    note: 'Nothing in hand. The first thing the platform does is watch, and watching needs no equipment.' },
  { id: 'optics', prop: 'tablet', label: 'Console in hand', swing: 0.55, hand: 'left',
    note: 'Console up, one-handed, screen turned away from his own eyes — the way anyone reads a display at night when they still need their night vision.' },
  { id: 'thermal', prop: 'monocular', label: 'Thermal monocular', swing: 0.35, hand: 'right',
    note: 'Monocular to the eye. Both elbows in, because a shaky thermal image is worse than none.' },
  { id: 'satellite', prop: 'tablet', label: 'Orbital tasking', swing: 0.6, hand: 'left',
    note: 'Looking up, then down at the tablet. The overpass is a clock, not a camera you point.' },
  { id: 'aerial', prop: 'controller', label: 'Drone controller', swing: 0.25, hand: 'both',
    note: 'Two hands on sticks, head up. The one moment in the film where he is not looking at a screen.' },
  { id: 'wearables', prop: 'watch', label: 'Wrist check', swing: 0.5, hand: 'left',
    note: 'Wrist turned in. Heart rate is the one reading on him rather than around him.' },
  { id: 'field', prop: 'spotter', label: 'Glassing the block', swing: 0.3, hand: 'both',
    note: 'Glassing a vine block at first light — the same optics that find a person find a deer in the fruit.' },
  { id: 'range', prop: 'rifle-low', label: 'Low ready', swing: 0.15, hand: 'both',
    note: 'Muzzle down, off the targets, finger straight. The range section is about hitting steel at known distance, and it starts the way a range starts.' },
  { id: 'demo', prop: 'tablet', label: 'Running the demo', swing: 0.55, hand: 'left',
    note: 'Back to the console. Everything he just used is on one screen.' },
  { id: 'ledger', prop: 'none', label: 'The ledger', swing: 0.9, hand: null,
    note: 'Empty hands again, facing camera. What the platform will not do is said standing still.' },
  { id: 'launch', prop: 'none', label: 'Enter', swing: 1, hand: null,
    note: 'Walks past the lens and out of frame left. The console is already open behind him.' },
]);

/** Look up a posture by scene id, falling back to empty hands. */
export function postureFor(id) {
  return POSTURES.find((posture) => posture.id === id) || POSTURES[0];
}

/**
 * Everything about the figure at a scroll position.
 *
 * `groundY` is where his feet land as a fraction of frame height: he starts
 * near the horizon and ends with his feet below the bottom of frame, which is
 * what "walking past the camera" costs you.
 */
export function operatorAt(progress, {
  frameHeight = 1080,
  approach = APPROACH,
  posture = POSTURES[0],
  heightM = HEIGHT_M,
} = {}) {
  const p = clamp01(progress);
  const distanceM = distanceAt(p, approach);
  const covered = approach.startM - distanceM;
  const gait = gaitPhase(covered, heightM);
  const pose = gaitPose(gait.phase, { amplitude: posture.swing ?? 1 });
  const height = apparentHeight(distanceM, frameHeight, heightM);

  // Horizon sits a little above centre; his feet drop below it as he nears.
  const horizon = 0.46;
  const groundY = horizon + (1 - horizon) * Math.pow(p, 1.7) * 1.18;

  return {
    progress: p,
    distanceM,
    coveredM: covered,
    steps: gait.steps,
    heightPx: height,
    groundY,
    footY: frameHeight * groundY,
    headY: frameHeight * groundY - height * (1 - pose.bob),
    pose,
    posture,
    /** Atmospheric haze: far figures wash out toward the fog colour. */
    haze: clamp01((distanceM - approach.endM) / (approach.startM - approach.endM)) * 0.82,
    /** Rim light strengthens as he enters the practical lights near camera. */
    rim: clamp01(1 - distanceM / 18),
  };
}

/**
 * The rig: joint positions in a unit space where the feet are at y = 0 and the
 * top of the head is at y = 1, x = 0 on the centre line.
 *
 * Segment proportions are Vitruvian-ish canonical fractions of standing height
 * — head 0.13, shoulder at 0.82, hip at 0.53, knee at 0.28. Getting these
 * right matters more than any amount of rendering: a figure with a short femur
 * reads as a child no matter how good the coat looks.
 */
export function rig(pose, { lean = 0 } = {}) {
  const hipY = 0.53;
  const shoulderY = 0.82;
  const neckY = 0.865;
  const headY = 0.932;
  const thigh = 0.25;
  const shin = 0.24;
  const upperArm = 0.16;
  const foreArm = 0.15;
  const shoulderHalf = 0.105;
  const hipHalf = 0.055;

  const point = (x, y) => ({ x: x + (y - hipY) * lean, y });

  const legChain = (side, joint) => {
    const hipX = side * hipHalf;
    const hip = point(hipX, hipY);
    const hipA = rad(joint.hip);
    const knee = { x: hip.x + Math.sin(hipA) * thigh, y: hip.y - Math.cos(hipA) * thigh };
    const kneeA = hipA - rad(joint.knee);
    const ankle = { x: knee.x + Math.sin(kneeA) * shin, y: knee.y - Math.cos(kneeA) * shin };
    const toeA = kneeA + rad(joint.ankle + 78);
    const toe = { x: ankle.x + Math.sin(toeA) * 0.075, y: ankle.y - Math.cos(toeA) * 0.075 };
    return { hip, knee, ankle, toe };
  };

  const armChain = (side, joint) => {
    const shoulder = point(side * shoulderHalf, shoulderY);
    const a = rad(joint.shoulder);
    const elbow = { x: shoulder.x + Math.sin(a) * upperArm, y: shoulder.y - Math.cos(a) * upperArm };
    const b = a + rad(joint.elbow);
    const hand = { x: elbow.x + Math.sin(b) * foreArm, y: elbow.y - Math.cos(b) * foreArm };
    return { shoulder, elbow, hand };
  };

  return {
    pelvis: point(0, hipY),
    neck: point(0, neckY),
    head: point(0, headY),
    crown: point(0, 1),
    shoulderL: point(-shoulderHalf, shoulderY),
    shoulderR: point(shoulderHalf, shoulderY),
    legL: legChain(-1, pose.left),
    legR: legChain(1, pose.right),
    armL: armChain(-1, pose.leftArm),
    armR: armChain(1, pose.rightArm),
    twist: pose.twist,
  };
}
