/**
 * Minimal 3D maths for the ASTRA laboratory renderer.
 *
 * The platform ships no dependencies, so the matrix and vector operations the
 * lab needs live here. Everything is column-major and `Float32Array`-shaped so
 * results go straight to `uniformMatrix4fv` without a copy.
 *
 * @module astra/mathkit
 */

/**
 * Identity matrix.
 *
 * @returns {Float32Array} A fresh 4x4 identity.
 */
export function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/**
 * Multiply two 4x4 matrices (`a * b`, column-major).
 *
 * @param {Float32Array} a Left matrix.
 * @param {Float32Array} b Right matrix.
 * @param {Float32Array} [out] Optional destination.
 * @returns {Float32Array} `out`, or a new matrix.
 */
export function multiply(a, b, out = identity()) {
  const r = out === a || out === b ? new Float32Array(16) : out;
  for (let c = 0; c < 4; c += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = sum;
    }
  }
  if (r !== out) out.set(r);
  return out;
}

/**
 * Perspective projection.
 *
 * @param {number} fovY Vertical field of view, radians.
 * @param {number} aspect Width / height.
 * @param {number} near Near plane (> 0).
 * @param {number} far Far plane.
 * @returns {Float32Array} Projection matrix.
 */
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/**
 * Normalise a 3-vector.
 *
 * @param {number[]} v Vector.
 * @returns {number[]} Unit-length copy, or the zero vector unchanged.
 */
export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Cross product of two 3-vectors.
 *
 * @param {number[]} a First vector.
 * @param {number[]} b Second vector.
 * @returns {number[]} `a x b`.
 */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Dot product of two 3-vectors.
 *
 * @param {number[]} a First vector.
 * @param {number[]} b Second vector.
 * @returns {number} The scalar product.
 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * A right-handed view matrix.
 *
 * @param {number[]} eye Camera position.
 * @param {number[]} target Look-at point.
 * @param {number[]} up World up.
 * @returns {Float32Array} View matrix.
 */
export function lookAt(eye, target, up = [0, 1, 0]) {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
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
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/**
 * Uniform or per-axis scale matrix.
 *
 * @param {number} x X scale.
 * @param {number} [y] Y scale, defaults to `x`.
 * @param {number} [z] Z scale, defaults to `x`.
 * @returns {Float32Array} The matrix.
 */
export function scaling(x, y = x, z = x) {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

/**
 * Rotation about X.
 *
 * @param {number} rad Angle in radians.
 * @returns {Float32Array} The matrix.
 */
export function rotationX(rad) {
  const m = identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

/**
 * Rotation about Y.
 *
 * @param {number} rad Angle in radians.
 * @returns {Float32Array} The matrix.
 */
export function rotationY(rad) {
  const m = identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

/**
 * Clamp a number into a range.
 *
 * @param {number} value Input.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number} The clamped value.
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Frame-rate independent approach towards a target.
 *
 * @param {number} current Current value.
 * @param {number} target Desired value.
 * @param {number} rate Approach rate per second.
 * @param {number} dt Seconds elapsed.
 * @returns {number} The eased value.
 */
export function approach(current, target, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

/**
 * Smoothstep between two edges.
 *
 * @param {number} edge0 Lower edge.
 * @param {number} edge1 Upper edge.
 * @param {number} x Input.
 * @returns {number} A value in [0, 1].
 */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * A small deterministic pseudo-random generator.
 *
 * Determinism matters here: the lab's molecule cloud, the mote field and the
 * knowledge-graph layout must look the same on every load, and the tests need
 * to be able to assert on generated geometry.
 *
 * @param {number} seed Any integer.
 * @returns {() => number} A function returning values in [0, 1).
 */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
