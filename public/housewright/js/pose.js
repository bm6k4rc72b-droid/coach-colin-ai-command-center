/**
 * Where you are pointing, in the room's own coordinates.
 *
 * A phone knows two things a tape measure does not: which way it is facing,
 * and roughly how high off the floor it is being held. That is enough to
 * measure a room, because a ray leaving a known height at a known depression
 * angle meets the floor at exactly one place:
 *
 *     distance = height / tan(depression)
 *
 * So the survey is: hold the phone at a stated height, point at where a wall
 * meets the floor, take a shot. Each shot becomes a floor coordinate. Four
 * shots make a rectangle; twelve make an L-shaped great room.
 *
 * Three things about this are worth being honest about up front, because they
 * bound the accuracy and the UI says so too:
 *
 *  1. **Height is the whole ball game.** A 3% error in the stated hold height
 *     is a 3% error in every distance. `calibrate()` exists to remove it
 *     against something of known size.
 *  2. **Indoor compass is a liar.** Steel studs, appliances and underfloor
 *     heating drag magnetic north around by tens of degrees. So the survey
 *     never uses absolute heading — every shot is expressed relative to the
 *     first shot of that room, and the plan is oriented afterwards.
 *  3. **Grazing angles are noise amplifiers.** Near the horizon `tan` runs to
 *     infinity, so a point aimed 2° below level is unusable. `floorHit`
 *     refuses those rather than reporting a confident number.
 *
 * World frame throughout: X east, Y north, Z up, floor at Z = 0 — the frame
 * the W3C DeviceOrientation spec uses, so no axis juggling on the way in.
 *
 * @module housewright/pose
 */

import { D2R, R2D, clamp, normalise, wrapDegrees } from './mathkit.js';

/** Below this depression angle a floor shot is refused as too grazing. */
export const MIN_DEPRESSION_DEG = 4;

/** Above this the phone is pointing at its own feet and the hit is trivially close. */
export const MAX_DEPRESSION_DEG = 86;

/**
 * Rotation matrix taking device coordinates into world coordinates.
 *
 * This is the composition the DeviceOrientation spec defines, `Rz(α)·Rx(β)·Ry(γ)`,
 * written out rather than multiplied at runtime.
 *
 * @param {number} alpha Rotation about the world Z axis, degrees.
 * @param {number} beta Front-to-back tilt, degrees.
 * @param {number} gamma Left-to-right tilt, degrees.
 * @returns {number[]} Row-major 3×3, nine numbers.
 */
export function orientationMatrix(alpha, beta, gamma) {
  const a = alpha * D2R;
  const b = beta * D2R;
  const g = gamma * D2R;
  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);
  return [
    cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
    -cB * sG, sB, cB * cG,
  ];
}

/**
 * Apply a row-major 3×3 to a vector.
 *
 * @param {number[]} m Nine numbers.
 * @param {{x: number, y: number, z: number}} v Vector.
 * @returns {{x: number, y: number, z: number}} The transformed vector.
 */
export function transform(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

/**
 * The direction a point on the screen looks along, in device coordinates.
 *
 * The rear camera looks along −Z of the device frame. A pixel away from the
 * centre tilts that ray by the half-angle its offset subtends, which for a
 * rectilinear lens is a plain tangent relationship.
 *
 * @param {object} sample Screen point and lens.
 * @param {number} [sample.u=0] Horizontal position, −1 at the left edge, +1 right.
 * @param {number} [sample.v=0] Vertical position, −1 at the top edge, +1 bottom.
 * @param {number} [sample.fovX=64] Horizontal field of view, degrees.
 * @param {number} [sample.fovY=48] Vertical field of view, degrees.
 * @param {number} [sample.screenAngle=0] `screen.orientation.angle`, degrees.
 * @returns {{x: number, y: number, z: number}} Unit vector in device coordinates.
 */
export function screenRay({ u = 0, v = 0, fovX = 64, fovY = 48, screenAngle = 0 } = {}) {
  // In the screen's own frame: right is +X, up is +Y, and the lens looks at −Z.
  const sx = u * Math.tan(fovX * 0.5 * D2R);
  const sy = -v * Math.tan(fovY * 0.5 * D2R);
  // The screen frame is the device frame turned about its own Z by the screen
  // orientation angle, so undoing that turn puts the ray back on the hardware.
  const t = screenAngle * D2R;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return normalise({ x: sx * c - sy * s, y: sx * s + sy * c, z: -1 });
}

/**
 * The world-space ray a screen point is looking along.
 *
 * @param {object} sample Orientation and screen point.
 * @param {number} sample.alpha Heading, degrees — pass it already relative to
 *   the survey's reference heading (see `relativeHeading`).
 * @param {number} sample.beta Front-to-back tilt, degrees.
 * @param {number} sample.gamma Left-to-right tilt, degrees.
 * @param {number} [sample.screenAngle=0] Screen orientation, degrees.
 * @param {number} [sample.u=0] Horizontal screen position, −1 to +1.
 * @param {number} [sample.v=0] Vertical screen position, −1 to +1.
 * @param {number} [sample.fovX=64] Horizontal field of view, degrees.
 * @param {number} [sample.fovY=48] Vertical field of view, degrees.
 * @returns {{x: number, y: number, z: number}} Unit vector, world frame.
 */
export function pointingRay(sample) {
  const { alpha = 0, beta = 0, gamma = 0 } = sample;
  return normalise(transform(orientationMatrix(alpha, beta, gamma), screenRay(sample)));
}

/**
 * Express a heading relative to the first shot of a survey.
 *
 * @param {number} alpha This shot's heading, degrees.
 * @param {number} reference The survey's reference heading, degrees.
 * @returns {number} The difference, wrapped into (−180, 180].
 */
export function relativeHeading(alpha, reference) {
  return wrapDegrees(alpha - reference);
}

/**
 * How far below level a ray points, in degrees.
 *
 * @param {{x: number, y: number, z: number}} ray Unit vector, world frame.
 * @returns {number} Positive when pointing down, negative when pointing up.
 */
export function depression(ray) {
  return -Math.asin(clamp(ray.z, -1, 1)) * R2D;
}

/**
 * Intersect a pointing ray with the floor.
 *
 * @param {number} height Hold height above the floor, metres.
 * @param {{x: number, y: number, z: number}} ray Unit vector, world frame.
 * @param {object} [options] Limits.
 * @param {number} [options.minDepression] Shallowest usable angle, degrees.
 * @param {number} [options.maxDepression] Steepest usable angle, degrees.
 * @returns {{x: number, y: number, range: number, distance: number, depression: number, spread: number}|null}
 *   The floor point in room coordinates, the slant range along the ray, the
 *   horizontal distance, the depression angle, and `spread` — the metres of
 *   error one degree of aiming error costs at this angle, and `relative` — the
 *   same figure as a fraction of the distance being measured. `null` when the
 *   ray does not usefully reach the floor.
 */
export function floorHit(height, ray, options = {}) {
  const {
    minDepression = MIN_DEPRESSION_DEG,
    maxDepression = MAX_DEPRESSION_DEG,
  } = options;
  const angle = depression(ray);
  if (!(angle >= minDepression) || angle > maxDepression) return null;
  if (!(height > 0)) return null;

  const range = height / -ray.z;
  const x = ray.x * range;
  const y = ray.y * range;
  const horizontal = Math.hypot(x, y);
  // d(distance)/d(angle) for distance = h/tan(θ) is −h/sin²θ. Reported per
  // degree, it is the number the reticle turns red over.
  const sin = Math.sin(angle * D2R);
  const spread = (height / (sin * sin)) * D2R;
  // Absolute spread grows with distance, but so does the measurement, so it
  // is the wrong thing to judge a shot by. The *relative* error is
  // 2·rad/sin(2θ) — remarkably flat at 3.5–5% per degree across the whole
  // useful window, bottoming out at 45° and climbing steeply only as the ray
  // approaches level or vertical. That is what the reticle grades on.
  const relative = horizontal > 0 ? spread / horizontal : Infinity;
  return { x, y, range, distance: horizontal, depression: angle, spread, relative };
}

/**
 * Height of whatever a ray hits on a vertical surface at a known distance.
 *
 * Used for ceiling height, window heads and sill heights: stand still, shoot
 * the floor at the base of the wall to fix the distance, then shoot the
 * feature above it without moving.
 *
 * @param {number} height Hold height above the floor, metres.
 * @param {{x: number, y: number, z: number}} ray Unit vector, world frame.
 * @param {number} horizontalDistance Distance to that wall, metres.
 * @returns {number|null} Height above the floor in metres, or `null` when the
 *   ray is too close to vertical to be attributed to that wall.
 */
export function heightAtDistance(height, ray, horizontalDistance) {
  const horizontal = Math.hypot(ray.x, ray.y);
  if (horizontal < 0.06) return null;
  return height + horizontalDistance * (ray.z / horizontal);
}

/**
 * Correct the hold height against something of known size.
 *
 * The operator shoots the floor at the base of a reference — a door, a
 * countertop, a tape pulled to a mark — and states the true distance. Since
 * distance scales linearly with height, the fix is a single ratio.
 *
 * @param {number} statedHeight The height currently assumed, metres.
 * @param {number} measuredDistance What the app reported, metres.
 * @param {number} trueDistance What it actually is, metres.
 * @returns {{height: number, error: number}} The corrected height and the
 *   fractional error that was removed.
 */
export function calibrate(statedHeight, measuredDistance, trueDistance) {
  if (!(measuredDistance > 0) || !(trueDistance > 0)) {
    return { height: statedHeight, error: 0 };
  }
  const ratio = trueDistance / measuredDistance;
  return { height: statedHeight * ratio, error: ratio - 1 };
}

/**
 * Metres per pixel for a reference of known width, held parallel to the lens.
 *
 * This is the fallback path for a laptop with no orientation sensors, and for
 * a phone measuring something that is not on the floor. It assumes the
 * reference and the thing being measured are the same distance away and
 * square to the camera — true enough for a wall shot head-on, wrong for a
 * receding one, and the UI says so.
 *
 * @param {number} pixelSpan Reference length in the photo, pixels.
 * @param {number} realSpan Its true length, metres.
 * @returns {number} Metres per pixel, or 0 when the input is unusable.
 */
export function scaleFromReference(pixelSpan, realSpan) {
  if (!(pixelSpan > 0) || !(realSpan > 0)) return 0;
  return realSpan / pixelSpan;
}

/**
 * Length of a traced span under a reference scale.
 *
 * @param {{x: number, y: number}} a One end, pixels.
 * @param {{x: number, y: number}} b The other end, pixels.
 * @param {number} metresPerPixel From `scaleFromReference`.
 * @returns {number} Length in metres.
 */
export function spanLength(a, b, metresPerPixel) {
  return Math.hypot(b.x - a.x, b.y - a.y) * metresPerPixel;
}

/**
 * A rolling average of shots taken while the operator holds still.
 *
 * A single frame of orientation data is jittery by a degree or so. Dwelling on
 * a corner for a second and averaging what arrives is worth more than any
 * filter applied afterwards, and it also gives the hold gesture something to
 * do with the time it is already spending.
 *
 * @returns {{add: (hit: object) => void, result: () => object|null, count: number}}
 *   An accumulator. `result` returns the mean hit plus `scatter`, the RMS
 *   spread of the samples in metres — the honest error bar on that corner.
 */
export function createAccumulator() {
  const samples = [];
  return {
    get count() {
      return samples.length;
    },
    add(hit) {
      if (hit) samples.push(hit);
    },
    result() {
      if (samples.length === 0) return null;
      let x = 0;
      let y = 0;
      let range = 0;
      for (const s of samples) {
        x += s.x;
        y += s.y;
        range += s.range;
      }
      const n = samples.length;
      const mean = { x: x / n, y: y / n, range: range / n };
      let variance = 0;
      for (const s of samples) {
        variance += (s.x - mean.x) ** 2 + (s.y - mean.y) ** 2;
      }
      return {
        x: mean.x,
        y: mean.y,
        range: mean.range,
        distance: Math.hypot(mean.x, mean.y),
        samples: n,
        scatter: Math.sqrt(variance / n),
      };
    },
  };
}
