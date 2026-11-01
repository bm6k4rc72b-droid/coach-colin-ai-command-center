/**
 * Depth Anything × the ground plane: click the ground, get a real distance,
 * and let the calibration fill itself in.
 *
 * The console already turns pixels into metres with three typed numbers —
 * mount height h, down tilt t, field of view — through a pinhole camera over a
 * flat ground (sentry/ground.js). A monocular depth network adds a second,
 * independent opinion about every pixel. The two meet on the ground.
 *
 * The one equation everything here rests on. A camera at height h, pitched
 * down by t, no roll; normalised image row yₙ = (v − H/2)/f with f the focal
 * length in pixels. A ground pixel's depth along the optical axis Z satisfies
 *
 *     1/Z = (yₙ·cos t + sin t) / h                                  (1)
 *
 * — inverse depth on a flat ground is a straight line in image row. (Derived
 * from the same axes as ground.js: camera "down" is world (0, −sin t, −cos t),
 * "forward" is (0, cos t, −sin t); the ray (·, yₙZ, Z) meets z = −h.) The line
 * crosses zero at yₙ = −tan t, which is exactly ground.js's horizon row.
 *
 * Three uses of (1):
 *
 * 1. Metric depth model (metres out): fit 1/Z = a·yₙ + b on ground pixels, then
 *    t = atan2(b, a) and h = 1/√(a² + b²). Full auto-calibration, both numbers.
 * 2. Relative model (Depth Anything V2 — disparity d = α/Z + β, α and β
 *    unknown): with the usual β ≈ 0, d is also linear in yₙ, and its zero
 *    crossing is the horizon, so tilt comes out as atan2(B, A). Height cannot —
 *    the network has no scale — so one tape-measured ground click supplies it.
 * 3. Any pose (typed or fitted): fit d = α·(1/Z_ground) + β over ground pixels,
 *    which pins α and β. Then any pixel, ground or not — a post, a ewe, a truck
 *    — has Z = α/(d − β) and a slant range Z·√(1 + xₙ² + yₙ²).
 *
 * Every fit is robust (Tukey biweight, iteratively reweighted), because the
 * bottom of a ranch frame is mostly ground and partly sheep, and the sheep must
 * not bend the line. Each result carries its residual and inlier share so the
 * panel can say how much it believes itself.
 *
 * Pure: no DOM, no model. Inputs are numbers and typed arrays.
 *
 * @module black-optic-6/ai/depth-calib
 */

const RAD = Math.PI / 180;

/** Focal length in pixels for a horizontal field of view. */
export function focalPx(width, fovDeg) {
  return width / 2 / Math.tan((fovDeg * RAD) / 2);
}

/** Normalised image coordinates (xₙ, yₙ) of pixel (u, v). */
export function normalised(u, v, width, height, fovDeg) {
  const f = focalPx(width, fovDeg);
  return { xn: (u - width / 2) / f, yn: (v - height / 2) / f };
}

/**
 * Inverse optical-axis depth of the ground at an image row — equation (1).
 *
 * @returns {number} 1/Z in 1/metres; ≤ 0 on or above the horizon.
 */
export function groundInverseDepth({ heightM, tiltDeg, fovDeg, width, height }, v) {
  const { yn } = normalised(width / 2, v, width, height, fovDeg);
  const t = tiltDeg * RAD;
  return (yn * Math.cos(t) + Math.sin(t)) / heightM;
}

/** The horizon row implied by a tilt, same as ground.js horizonRow. */
export function horizonRowFor(tiltDeg, width, height, fovDeg) {
  return height / 2 - focalPx(width, fovDeg) * Math.tan(tiltDeg * RAD);
}

/**
 * Weighted least-squares line y = m·x + c.
 *
 * @returns {{m: number, c: number}|null} Null when x has no spread.
 */
export function weightedLine(xs, ys, ws) {
  let sw = 0; let sx = 0; let sy = 0;
  for (let i = 0; i < xs.length; i += 1) { const w = ws ? ws[i] : 1; sw += w; sx += w * xs[i]; sy += w * ys[i]; }
  if (!(sw > 0)) return null;
  const mx = sx / sw; const my = sy / sw;
  let sxx = 0; let sxy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const w = ws ? ws[i] : 1;
    sxx += w * (xs[i] - mx) ** 2;
    sxy += w * (xs[i] - mx) * (ys[i] - my);
  }
  if (!(sxx > 1e-18)) return null;
  const m = sxy / sxx;
  return { m, c: my - m * mx };
}

/** Median of a numeric array (copy-sorted). */
export function median(values) {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort();
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/**
 * A line fitted robustly: ordinary least squares, then Tukey-biweight IRLS with
 * the scale set from the median absolute deviation (σ ≈ 1.4826·MAD, cut-off
 * 4.685σ, the 95 %-efficiency constant).
 *
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @param {object} [options]
 * @param {number} [options.iterations=12]
 * @returns {{m: number, c: number, sigma: number, inliers: number, r2: number}|null}
 */
export function robustLine(xs, ys, { iterations = 12 } = {}) {
  if (xs.length < 3) return null;
  let line = weightedLine(xs, ys);
  if (!line) return null;
  const n = xs.length;
  const ws = new Float64Array(n).fill(1);
  const res = new Float64Array(n);
  let sigma = 0;
  for (let k = 0; k < iterations; k += 1) {
    for (let i = 0; i < n; i += 1) res[i] = ys[i] - (line.m * xs[i] + line.c);
    const mad = median(Array.from(res, Math.abs));
    sigma = 1.4826 * mad;
    if (!(sigma > 1e-15)) break; // an exact fit: nothing left to reweight
    const cut = 4.685 * sigma;
    for (let i = 0; i < n; i += 1) {
      const r = Math.abs(res[i]) / cut;
      ws[i] = r < 1 ? (1 - r * r) ** 2 : 0;
    }
    const next = weightedLine(xs, ys, ws);
    if (!next) break;
    const moved = Math.abs(next.m - line.m) + Math.abs(next.c - line.c);
    line = next;
    if (moved < 1e-12 * (1 + Math.abs(line.m) + Math.abs(line.c))) break;
  }
  let inliers = 0; let ssr = 0; let sst = 0; let wsum = 0; let my = 0;
  for (let i = 0; i < n; i += 1) { wsum += ws[i]; my += ws[i] * ys[i]; }
  my = wsum > 0 ? my / wsum : 0;
  for (let i = 0; i < n; i += 1) {
    if (ws[i] > 0) inliers += 1;
    ssr += ws[i] * (ys[i] - (line.m * xs[i] + line.c)) ** 2;
    sst += ws[i] * (ys[i] - my) ** 2;
  }
  return { ...line, sigma, inliers: inliers / n, r2: sst > 0 ? 1 - ssr / sst : 1 };
}

/**
 * Pick ground samples from a depth map: every `step`-th pixel in the band
 * between `fromFrac` of the frame height (or a little below a known horizon,
 * whichever is lower) and the bottom edge.
 *
 * @param {{data: ArrayLike<number>, width: number, height: number}} map Depth or
 *   disparity at frame resolution, row-major.
 * @returns {{v: Float64Array, value: Float64Array, u: Float64Array}}
 */
export function groundSamples(map, { fromFrac = 0.55, horizonRow = null, step = 4, valid = (x) => Number.isFinite(x) && x > 0 } = {}) {
  const start = Math.max(Math.floor(map.height * fromFrac), horizonRow == null ? 0 : Math.ceil(horizonRow + map.height * 0.08));
  const us = []; const vs = []; const values = [];
  for (let v = start; v < map.height; v += step) {
    for (let u = step >> 1; u < map.width; u += step) {
      const x = map.data[v * map.width + u];
      if (valid(x)) { us.push(u); vs.push(v); values.push(x); }
    }
  }
  return { u: Float64Array.from(us), v: Float64Array.from(vs), value: Float64Array.from(values) };
}

/**
 * Use 1 — a METRIC depth map: recover both height and tilt from the ground.
 *
 * @param {{v: ArrayLike<number>, value: ArrayLike<number>}} samples Ground rows
 *   and their metric optical-axis depth Z in metres.
 * @param {{width: number, height: number, fovDeg: number}} frame
 * @returns {{heightM: number, tiltDeg: number, horizonRow: number, inliers: number, r2: number}|null}
 */
export function calibrateMetric(samples, { width, height, fovDeg }) {
  const f = focalPx(width, fovDeg);
  const xs = Array.from(samples.v, (v) => (v - height / 2) / f);
  const ys = Array.from(samples.value, (z) => 1 / z);
  const line = robustLine(xs, ys);
  if (!line) return null;
  // 1/Z = a·yₙ + b with a = cos t / h, b = sin t / h.
  const a = line.m; const b = line.c;
  if (!(a > 0)) return null; // inverse depth must grow down the frame on a ground
  const heightM = 1 / Math.hypot(a, b);
  const tiltDeg = Math.atan2(b, a) / RAD;
  return { heightM, tiltDeg, horizonRow: height / 2 - f * (b / a), inliers: line.inliers, r2: line.r2 };
}

/**
 * Use 2 — a RELATIVE (disparity) map: recover tilt from where the ground's
 * disparity line runs out, assuming the network's shift β is negligible.
 *
 * @returns {{tiltDeg: number, horizonRow: number, inliers: number, r2: number, assumption: string}|null}
 */
export function calibrateTiltRelative(samples, { width, height, fovDeg }) {
  const f = focalPx(width, fovDeg);
  const xs = Array.from(samples.v, (v) => (v - height / 2) / f);
  const line = robustLine(xs, samples.value);
  if (!line || !(line.m > 0)) return null;
  const tiltDeg = Math.atan2(line.c, line.m) / RAD;
  return {
    tiltDeg,
    horizonRow: height / 2 - f * (line.c / line.m),
    inliers: line.inliers,
    r2: line.r2,
    assumption: 'Assumes the network’s disparity has no constant offset (β ≈ 0). Check the horizon line it draws.',
  };
}

/**
 * Height from one tape-measured ground click: with tilt and FOV known, the
 * horizontal distance to a ground pixel is proportional to h.
 *
 * @param {{tiltDeg: number, fovDeg: number, width: number, height: number}} frame
 * @param {number} u Clicked column.
 * @param {number} v Clicked row (must be below the horizon).
 * @param {number} knownM Tape-measured horizontal distance from the foot of the mast.
 * @returns {number|null} Mount height in metres.
 */
export function heightFromAnchor({ tiltDeg, fovDeg, width, height }, u, v, knownM) {
  const { xn, yn } = normalised(u, v, width, height, fovDeg);
  const t = tiltDeg * RAD;
  const dz = -yn * Math.cos(t) - Math.sin(t); // world z of the ray (·, yₙ, 1)
  if (!(dz < -1e-9) || !(knownM > 0)) return null;
  const dy = -yn * Math.sin(t) + Math.cos(t);
  const horizontalPerH = Math.hypot(xn, dy) / -dz; // ground distance for h = 1
  return knownM / horizontalPerH;
}

/**
 * Use 3 — tie a disparity map to a known pose. Fits d = α·(1/Z_ground) + β over
 * ground samples; afterwards every pixel has a metric depth.
 *
 * @param {{v: ArrayLike<number>, value: ArrayLike<number>}} samples Ground disparity.
 * @param {{heightM: number, tiltDeg: number, fovDeg: number, width: number, height: number}} pose
 * @returns {{alpha: number, beta: number, inliers: number, r2: number}|null}
 */
export function scaleDisparity(samples, pose) {
  const xs = []; const ys = [];
  for (let i = 0; i < samples.v.length; i += 1) {
    const inv = groundInverseDepth(pose, samples.v[i]);
    if (inv > 0) { xs.push(inv); ys.push(samples.value[i]); }
  }
  const line = robustLine(xs, ys);
  if (!line || !(line.m > 0)) return null;
  return { alpha: line.m, beta: line.c, inliers: line.inliers, r2: line.r2 };
}

/**
 * Metric distance at any pixel.
 *
 * @param {{alpha: number, beta: number}|null} scale From scaleDisparity; null when the
 *   map is already metric.
 * @param {number} value Disparity (or metric Z when scale is null) at the pixel.
 * @param {number} [maxM=2000] Beyond this the answer is noise and is refused.
 * @returns {{depthM: number, rangeM: number}|null} Optical-axis depth and slant range.
 */
export function distanceAt(scale, value, u, v, { width, height, fovDeg }, maxM = 2000) {
  let z;
  if (scale) {
    const denom = value - scale.beta;
    if (!(denom > 1e-9)) return null; // at or beyond what the fit can resolve
    z = scale.alpha / denom;
  } else {
    z = value;
  }
  // Past a couple of kilometres the disparity is within noise of β: refuse.
  if (!(z > 0) || !Number.isFinite(z) || z > maxM) return null;
  const { xn, yn } = normalised(u, v, width, height, fovDeg);
  return { depthM: z, rangeM: z * Math.hypot(1, xn, yn) };
}

/**
 * Tilt from a phone's own orientation sensor, portrait, rear camera:
 * β = 90° is upright (camera level), β = 0° is flat face-up (camera straight down).
 *
 * @param {number} betaDeg DeviceOrientationEvent.beta.
 * @returns {number|null} Down tilt in degrees.
 */
export function tiltFromOrientation(betaDeg) {
  if (!Number.isFinite(betaDeg)) return null;
  return 90 - betaDeg;
}

/**
 * Sample a model-resolution map at frame coordinates (bilinear).
 *
 * @param {{data: ArrayLike<number>, width: number, height: number}} map
 * @param {number} u Column in a frame of width fw.
 * @param {number} v Row in a frame of height fh.
 */
export function sampleAt(map, u, v, fw, fh) {
  const x = Math.min(map.width - 1, Math.max(0, (u + 0.5) * (map.width / fw) - 0.5));
  const y = Math.min(map.height - 1, Math.max(0, (v + 0.5) * (map.height / fh) - 0.5));
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const x1 = Math.min(map.width - 1, x0 + 1); const y1 = Math.min(map.height - 1, y0 + 1);
  const fx = x - x0; const fy = y - y0;
  const at = (xx, yy) => map.data[yy * map.width + xx];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

/** Resample a model-resolution map to frame resolution. */
export function resample(map, fw, fh) {
  const out = new Float32Array(fw * fh);
  for (let v = 0; v < fh; v += 1) for (let u = 0; u < fw; u += 1) out[v * fw + u] = sampleAt(map, u, v, fw, fh);
  return { data: out, width: fw, height: fh };
}
