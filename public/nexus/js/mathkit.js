/**
 * Minimal 3D maths for the Nexus renderer.
 *
 * The app ships no dependencies, so the handful of matrix and vector
 * operations the hall needs live here. Everything is column-major and
 * `Float32Array`-shaped so results can be handed straight to
 * `uniformMatrix4fv` without a copy.
 *
 * @module nexus/mathkit
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
 * Normalise a 3-vector in place-safe fashion.
 *
 * @param {number[]} v Vector.
 * @returns {number[]} Unit-length copy (or the zero vector unchanged).
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
 * Right-handed look-at view matrix.
 *
 * @param {number[]} eye Camera position.
 * @param {number[]} target Point to look at.
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
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

/**
 * Translation matrix.
 *
 * @param {number} x X offset.
 * @param {number} y Y offset.
 * @param {number} z Z offset.
 * @returns {Float32Array} Translation.
 */
export function translation(x, y, z) {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/**
 * Rotation about the Y axis.
 *
 * @param {number} rad Angle in radians.
 * @returns {Float32Array} Rotation.
 */
export function rotationY(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/**
 * Rotation about the X axis.
 *
 * @param {number} rad Angle in radians.
 * @returns {Float32Array} Rotation.
 */
export function rotationX(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

/**
 * Uniform-ish scale matrix.
 *
 * @param {number} x X scale.
 * @param {number} y Y scale.
 * @param {number} z Z scale.
 * @returns {Float32Array} Scale.
 */
export function scaling(x, y, z) {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

/**
 * Convert geodetic coordinates to a unit-sphere position.
 *
 * Used to place live feed markers (quakes, launches, aircraft) on the
 * wireframe Earth. Longitude 0 faces +Z so the prime meridian starts toward
 * the viewer at zero spin.
 *
 * @param {number} latDeg Latitude in degrees.
 * @param {number} lonDeg Longitude in degrees.
 * @param {number} [radius] Sphere radius.
 * @returns {number[]} `[x, y, z]`.
 */
export function latLonToVec3(latDeg, lonDeg, radius = 1) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const ca = Math.cos(lat);
  return [radius * ca * Math.sin(lon), radius * Math.sin(lat), radius * ca * Math.cos(lon)];
}

/**
 * Great-circle distance between two geodetic points, in kilometres.
 *
 * @param {number} lat1 First latitude.
 * @param {number} lon1 First longitude.
 * @param {number} lat2 Second latitude.
 * @param {number} lon2 Second longitude.
 * @returns {number} Distance in km on a 6371 km sphere.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Clamp a number into a range.
 *
 * @param {number} value Input.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number} Clamped value.
 */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Frame-rate independent exponential smoothing.
 *
 * @param {number} current Current value.
 * @param {number} target Target value.
 * @param {number} rate Approach rate per second.
 * @param {number} dt Seconds since the last update.
 * @returns {number} Smoothed value.
 */
export function approach(current, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}
