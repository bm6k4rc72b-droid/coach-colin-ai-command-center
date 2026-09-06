/**
 * Turning pixels into metres.
 *
 * A track drawn in image coordinates is worth very little. "The subject moved
 * 340 pixels" answers nothing a guard would ask; "the subject crossed 7.7 m of
 * the yard at 0.97 m/s" answers most of them. Every number this app reports in
 * metres comes through here, and the reason the module is this careful is that
 * a plausible-looking wrong scale is worse than no scale at all — it produces
 * confident nonsense about how fast something was moving.
 *
 * The model is a pinhole camera at a known height above a flat ground plane,
 * pitched down by a known angle, with no roll and square pixels. Three numbers
 * — height, tilt, horizontal field of view — fix the whole projection, and all
 * three are things a person can supply or that `fitPose` can recover from one
 * marked rectangle of known size. A homography would be equivalent, but nobody
 * can sanity-check eight coefficients by eye, and everybody can check whether
 * their camera is about three metres up and tilted about twenty degrees.
 *
 * The flat-ground assumption is the load-bearing one. On a slope, on stairs, or
 * for anything not touching the ground, the metres are wrong — which is why
 * `groundPoint` reports the geometry it used and the caller surfaces it.
 *
 * Axes: world X to the camera's right, Y away from it along the ground, Z up,
 * with the camera at (0, 0, height). Image u from the left edge, v from the
 * top.
 *
 * @module sentry/ground
 */

/** Degrees to radians. */
const RAD = Math.PI / 180;

/**
 * A calibrated camera pose.
 *
 * @typedef {object} Pose
 * @property {number} heightM Camera height above the ground plane, metres.
 * @property {number} tiltDeg Downward pitch from horizontal, degrees.
 * @property {number} fovDeg Horizontal field of view, degrees.
 * @property {number} width Image width in pixels the pose was defined for.
 * @property {number} height Image height in pixels.
 */

/**
 * Build a pose from the three numbers that define it.
 *
 * @param {object} spec Pose fields.
 * @param {number} spec.heightM Camera height above ground, metres.
 * @param {number} spec.tiltDeg Downward pitch, degrees (0 = horizontal).
 * @param {number} spec.fovDeg Horizontal field of view, degrees.
 * @param {number} spec.width Image width, pixels.
 * @param {number} spec.height Image height, pixels.
 * @returns {Pose} Frozen pose.
 */
export function pose({ heightM, tiltDeg, fovDeg, width, height }) {
  return Object.freeze({ heightM, tiltDeg, fovDeg, width, height });
}

/**
 * Focal length in pixels implied by a pose's field of view.
 *
 * @param {Pose} p Camera pose.
 * @returns {number} Focal length, pixels.
 */
export function focalPx(p) {
  return p.width / 2 / Math.tan((p.fovDeg * RAD) / 2);
}

/**
 * The world-space direction a pixel looks along.
 *
 * @param {Pose} p Camera pose.
 * @param {number} u Pixel column from the left edge.
 * @param {number} v Pixel row from the top edge.
 * @returns {{x: number, y: number, z: number}} Unnormalized direction in world
 *   axes.
 */
export function rayFor(p, u, v) {
  const f = focalPx(p);
  // Camera frame: right, down, forward.
  const ax = u - p.width / 2;
  const ay = v - p.height / 2;
  const az = f;
  const t = p.tiltDeg * RAD;
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  return {
    x: ax,
    y: -ay * sin + az * cos,
    z: -ay * cos - az * sin,
  };
}

/**
 * The image row the horizon falls on.
 *
 * Anything above it looks at the sky and has no ground intersection, so this is
 * the line the tracker refuses to measure across.
 *
 * @param {Pose} p Camera pose.
 * @returns {number} Row in pixels; may be negative when the camera is pitched
 *   steeply enough that the horizon is out of frame above.
 */
export function horizonRow(p) {
  const t = p.tiltDeg * RAD;
  // The ray is level with the ground when its world z-component is zero:
  //   -ay·cos(t) - f·sin(t) = 0  →  ay = -f·tan(t).
  return p.height / 2 - focalPx(p) * Math.tan(t);
}

/**
 * Project a pixel onto the ground plane.
 *
 * @param {Pose} p Camera pose.
 * @param {number} u Pixel column.
 * @param {number} v Pixel row.
 * @returns {{x: number, y: number, rangeM: number}|null} Ground position in
 *   metres and slant range from the camera, or null when the pixel is on or
 *   above the horizon.
 */
export function groundPoint(p, u, v) {
  const d = rayFor(p, u, v);
  if (d.z >= -1e-9) return null;
  const t = p.heightM / -d.z;
  const x = t * d.x;
  const y = t * d.y;
  return { x, y, rangeM: Math.hypot(x, y, p.heightM) };
}

/**
 * Where a ground position lands in the image.
 *
 * The inverse of {@link groundPoint}, used to draw zones and plan-view grids
 * back onto the live frame.
 *
 * @param {Pose} p Camera pose.
 * @param {number} x Ground X in metres.
 * @param {number} y Ground Y in metres.
 * @param {number} [z=0] Height above the ground plane, metres.
 * @returns {{u: number, v: number}|null} Pixel position, or null when the point
 *   is behind the camera.
 */
export function imagePoint(p, x, y, z = 0) {
  const t = p.tiltDeg * RAD;
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  // World offset from the camera, expressed in camera axes (right, down,
  // forward) — the transpose of the rotation `rayFor` applies.
  const wx = x;
  const wy = y;
  const wz = z - p.heightM;
  const right = wx;
  const down = -wy * sin - wz * cos;
  const forward = wy * cos - wz * sin;
  if (forward <= 1e-9) return null;
  const f = focalPx(p);
  return {
    u: p.width / 2 + (right * f) / forward,
    v: p.height / 2 + (down * f) / forward,
  };
}

/**
 * Estimate how tall something standing on the ground is.
 *
 * The foot pixel fixes where the subject stands; the head pixel then has to lie
 * on the vertical line rising from that spot, so the height is read off where
 * the head ray passes it. The least-squares parameter keeps the answer stable
 * when the subject is near the image centre and the horizontal components of
 * the ray are small.
 *
 * @param {Pose} p Camera pose.
 * @param {{u: number, v: number}} foot Ground-contact pixel.
 * @param {{u: number, v: number}} head Topmost pixel of the subject.
 * @returns {number|null} Height in metres, or null when either pixel is
 *   unusable.
 */
export function standingHeight(p, foot, head) {
  const ground = groundPoint(p, foot.u, foot.v);
  if (!ground) return null;
  const d = rayFor(p, head.u, head.v);
  const denom = d.x * d.x + d.y * d.y;
  if (denom < 1e-12) return null;
  const t = (ground.x * d.x + ground.y * d.y) / denom;
  if (t <= 0) return null;
  const z = p.heightM + t * d.z;
  return Number.isFinite(z) ? z : null;
}

/**
 * Metres per pixel on the ground at a given image row.
 *
 * Perspective means one number cannot describe a scene: a pixel at the bottom
 * of the frame may cover a centimetre and one near the horizon several metres.
 * The tracker uses this to size its noise floor per track rather than globally,
 * which is what stops a distant subject's jitter from being logged as walking.
 *
 * @param {Pose} p Camera pose.
 * @param {number} v Pixel row.
 * @returns {number|null} Approximate ground metres spanned by one pixel, or
 *   null above the horizon.
 */
export function scaleAtRow(p, v) {
  const a = groundPoint(p, p.width / 2, v);
  const b = groundPoint(p, p.width / 2 + 1, v);
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Best-fit rigid alignment error between two point sets.
 *
 * Used by {@link fitPose} as its objective: the marked quadrilateral, once
 * projected to the ground, should be congruent to the rectangle the user
 * measured — where it sits and which way it faces are irrelevant, so those
 * degrees of freedom are removed before the residual is taken.
 *
 * @param {Array<{x: number, y: number}>} a Projected points.
 * @param {Array<{x: number, y: number}>} b Reference points, same order.
 * @returns {number} Root-mean-square residual in metres after the best rotation
 *   and translation.
 */
export function rigidResidual(a, b) {
  const n = a.length;
  if (!n || n !== b.length) return Infinity;
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < n; i += 1) {
    ax += a[i].x;
    ay += a[i].y;
    bx += b[i].x;
    by += b[i].y;
  }
  ax /= n;
  ay /= n;
  bx /= n;
  by /= n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const px = a[i].x - ax;
    const py = a[i].y - ay;
    const qx = b[i].x - bx;
    const qy = b[i].y - by;
    sxx += px * qx + py * qy;
    sxy += px * qy - py * qx;
  }
  const norm = Math.hypot(sxx, sxy);
  const cos = norm < 1e-12 ? 1 : sxx / norm;
  const sin = norm < 1e-12 ? 0 : sxy / norm;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const px = a[i].x - ax;
    const py = a[i].y - ay;
    const rx = px * cos - py * sin;
    const ry = px * sin + py * cos;
    const dx = rx - (b[i].x - bx);
    const dy = ry - (b[i].y - by);
    total += dx * dx + dy * dy;
  }
  return Math.sqrt(total / n);
}

/** Search bounds for {@link fitPose}, wide enough for any plausible install. */
const FIT_BOUNDS = Object.freeze({
  heightM: [0.6, 15],
  tiltDeg: [0, 80],
  fovDeg: [35, 110],
});

/**
 * Recover a pose from one marked rectangle of known size.
 *
 * The user marks four ground points that they know form a rectangle — a patio,
 * a parking bay, a rug, four paving slabs — and gives its width and depth. Any
 * pose that projects those four pixels onto a congruent rectangle explains the
 * scene, and a coarse-to-fine search finds it. Three rounds of grid refinement
 * beat a gradient method here because the residual surface has a shallow ridge
 * where height and field of view trade off, and a descent started in the wrong
 * place slides along it.
 *
 * @param {Array<{u: number, v: number}>} marks Four image points, in order
 *   around the rectangle.
 * @param {object} spec Rectangle and image geometry.
 * @param {number} spec.widthM Length of the first side, metres.
 * @param {number} spec.depthM Length of the second side, metres.
 * @param {number} spec.width Image width, pixels.
 * @param {number} spec.height Image height, pixels.
 * @returns {{pose: Pose, residualM: number}|null} Best pose and its residual,
 *   or null when the marks cannot be projected at all.
 */
export function fitPose(marks, { widthM, depthM, width, height }) {
  if (!Array.isArray(marks) || marks.length !== 4) return null;
  const reference = [
    { x: 0, y: 0 },
    { x: widthM, y: 0 },
    { x: widthM, y: depthM },
    { x: 0, y: depthM },
  ];
  const score = (heightM, tiltDeg, fovDeg) => {
    const candidate = pose({ heightM, tiltDeg, fovDeg, width, height });
    const projected = [];
    for (const m of marks) {
      const g = groundPoint(candidate, m.u, m.v);
      if (!g) return Infinity;
      projected.push(g);
    }
    return rigidResidual(projected, reference);
  };

  let span = {
    heightM: FIT_BOUNDS.heightM,
    tiltDeg: FIT_BOUNDS.tiltDeg,
    fovDeg: FIT_BOUNDS.fovDeg,
  };
  let best = null;
  for (let round = 0; round < 4; round += 1) {
    const steps = round === 0 ? 12 : 9;
    let roundBest = null;
    for (let i = 0; i <= steps; i += 1) {
      const h = span.heightM[0] + ((span.heightM[1] - span.heightM[0]) * i) / steps;
      for (let j = 0; j <= steps; j += 1) {
        const t = span.tiltDeg[0] + ((span.tiltDeg[1] - span.tiltDeg[0]) * j) / steps;
        for (let k = 0; k <= steps; k += 1) {
          const f = span.fovDeg[0] + ((span.fovDeg[1] - span.fovDeg[0]) * k) / steps;
          const residual = score(h, t, f);
          if (!roundBest || residual < roundBest.residual) {
            roundBest = { heightM: h, tiltDeg: t, fovDeg: f, residual };
          }
        }
      }
    }
    if (!roundBest || !Number.isFinite(roundBest.residual)) return best && { pose: pose({ ...best, width, height }), residualM: best.residual };
    best = roundBest;
    const shrink = (range, centre, factor) => {
      const halfWidth = ((range[1] - range[0]) * factor) / 2;
      return [Math.max(range[0], centre - halfWidth), Math.min(range[1], centre + halfWidth)];
    };
    span = {
      heightM: shrink(span.heightM, roundBest.heightM, 0.34),
      tiltDeg: shrink(span.tiltDeg, roundBest.tiltDeg, 0.34),
      fovDeg: shrink(span.fovDeg, roundBest.fovDeg, 0.34),
    };
  }
  if (!best) return null;
  return {
    pose: pose({ heightM: best.heightM, tiltDeg: best.tiltDeg, fovDeg: best.fovDeg, width, height }),
    residualM: best.residual,
  };
}
