/**
 * The small amount of maths the estate site needs.
 *
 * Column-major 4×4 matrices in the OpenGL convention (so they can be handed
 * to `uniformMatrix4fv` untransposed), plus the easing and interpolation
 * helpers the scroll engine leans on. Everything here is pure, so it is
 * tested without a browser.
 *
 * @module jose-montes/mathkit
 */

/**
 * Clamp a number into a range.
 *
 * @param {number} value Input.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number} Clamped value.
 */
export function clamp(value, min = 0, max = 1) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation.
 *
 * @param {number} a Start.
 * @param {number} b End.
 * @param {number} t Position, normally 0–1.
 * @returns {number} Interpolated value.
 */
export function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a value out of one range and into 0–1, clamped.
 *
 * The workhorse of scroll-linked animation: "how far through this window are
 * we" answered in one call.
 *
 * @param {number} value Input.
 * @param {number} from Start of the input range.
 * @param {number} to End of the input range.
 * @returns {number} Normalised position, 0–1.
 */
export function progress(value, from, to) {
  if (to === from) return value >= to ? 1 : 0;
  return clamp((value - from) / (to - from), 0, 1);
}

/**
 * Smoothstep, the gentle S-curve.
 *
 * @param {number} edge0 Lower edge.
 * @param {number} edge1 Upper edge.
 * @param {number} x Input.
 * @returns {number} Eased 0–1.
 */
export function smoothstep(edge0, edge1, x) {
  const t = progress(x, edge0, edge1);
  return t * t * (3 - 2 * t);
}

/** Easing curves, keyed by the name the markup uses. */
export const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // A single, well-damped overshoot. Luxury, not bounce-house.
  back: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  expo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
};

/**
 * Frame-rate independent exponential approach.
 *
 * `rate` is the fraction of the remaining distance covered in one second, so
 * the same call behaves identically at 60 Hz and at 120 Hz.
 *
 * @param {number} current Where we are.
 * @param {number} target Where we want to be.
 * @param {number} rate Convergence per second, 0–1.
 * @param {number} dt Seconds since the last frame.
 * @returns {number} The new value.
 */
export function approach(current, target, rate, dt) {
  const k = 1 - (1 - clamp(rate, 0, 0.999999)) ** Math.max(dt, 0);
  return current + (target - current) * clamp(k, 0, 1);
}

/**
 * The identity matrix.
 *
 * @returns {Float32Array} A fresh identity.
 */
export function identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

/**
 * Multiply two matrices, `a × b`.
 *
 * @param {Float32Array} a Left operand.
 * @param {Float32Array} b Right operand.
 * @param {Float32Array} [out] Optional destination.
 * @returns {Float32Array} The product.
 */
export function multiply(a, b, out = new Float32Array(16)) {
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/**
 * A perspective projection.
 *
 * @param {number} fovY Vertical field of view, radians.
 * @param {number} aspect Width over height.
 * @param {number} near Near plane.
 * @param {number} far Far plane.
 * @returns {Float32Array} The projection.
 */
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/**
 * A right-handed look-at view matrix.
 *
 * @param {number[]} eye Camera position.
 * @param {number[]} target Point to look at.
 * @param {number[]} up World up.
 * @returns {Float32Array} The view matrix.
 */
export function lookAt(eye, target, up = [0, 1, 0]) {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -dot(x, eye);
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -dot(y, eye);
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}

/**
 * Translation matrix.
 *
 * @param {number} x X offset.
 * @param {number} y Y offset.
 * @param {number} z Z offset.
 * @returns {Float32Array} The matrix.
 */
export function translation(x, y, z) {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

/**
 * Rotation about Y.
 *
 * @param {number} angle Radians.
 * @returns {Float32Array} The matrix.
 */
export function rotationY(angle) {
  const m = identity();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

/**
 * Rotation about X.
 *
 * @param {number} angle Radians.
 * @returns {Float32Array} The matrix.
 */
export function rotationX(angle) {
  const m = identity();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

/**
 * Vector cross product.
 *
 * @param {number[]} a First vector.
 * @param {number[]} b Second vector.
 * @returns {number[]} `a × b`.
 */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Vector dot product.
 *
 * @param {number[]} a First vector.
 * @param {number[]} b Second vector.
 * @returns {number} The dot product.
 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Normalise a vector, returning a zero vector unchanged rather than NaN.
 *
 * @param {number[]} v Input vector.
 * @returns {number[]} The unit vector.
 */
export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

/**
 * A small deterministic generator, so the scene looks the same every visit.
 *
 * @param {number} seed Starting seed.
 * @returns {() => number} A function returning 0–1.
 */
export function rng(seed = 1) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}
