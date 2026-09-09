/**
 * Turning a camera's view of a pitch into metres on the pitch.
 *
 * Every honest number in this app — a speed in km/h, a pass length, how far the
 * nearest defender was — is a distance on the grass, and a distance on the
 * grass cannot be read off the screen. Twenty pixels near the far touchline is
 * a different number of metres from twenty pixels near the camera, and a tool
 * that ignores that reports a winger accelerating every time they run away from
 * the lens. So there is exactly one way into metres here, and it goes through a
 * homography fitted to points a person marked on a pitch whose dimensions they
 * typed in.
 *
 * A homography is the right model and a camera pose is not. The pitch is a
 * plane; the image is a plane; any pinhole camera looking at a plane relates
 * the two by a 3x3 matrix, whatever its height, tilt, roll, zoom or lens. That
 * matters because the footage this app is pointed at is a phone propped on a
 * fence or a clip off a laptop, where nobody knows the focal length and the
 * camera is never level.
 *
 * The price is that eight coefficients cannot be eyeballed for sanity, so the
 * fit reports what it costs: `residual` is the worst distance, in metres, that
 * a marked point lands from where the fitted matrix puts it. That number is on
 * screen the whole time the app is running. Above a metre or so the marks were
 * sloppy or the "pitch" is not flat, and everything downstream is decoration.
 *
 * Two assumptions are load-bearing and neither is hidden:
 *
 * **The plane is the ground.** A homography maps the ground plane only. A
 * player's position is therefore taken at their feet, never their centre — a
 * blob's centre floats above the grass by half a player, which at the far end
 * of a pitch is several metres of error pointing away from the camera.
 *
 * **The camera does not move.** Pan or zoom and the fit is stale. `frameShift`
 * measures how far the picture has slid so the app can either compensate for a
 * nudge or tell the user the calibration is dead, rather than quietly reporting
 * that twenty-two players sprinted sideways at once.
 *
 * Pitch coordinates: x along the length from the left goal line (0) to the
 * right (`lengthM`), y across from the near touchline (0) to the far
 * (`widthM`). Image coordinates: u from the left edge, v from the top.
 *
 * @module touchline/pitch
 */

/**
 * Dimensions and markings of a full-size pitch, in metres.
 *
 * The Laws of the Game give a range rather than a number (90-120 m by 45-90 m),
 * so these are the competition-standard dimensions, and the app asks for the
 * real ones rather than assuming these are right.
 */
export const FULL_PITCH = Object.freeze({
  lengthM: 105,
  widthM: 68,
  penaltyBoxDepthM: 16.5,
  penaltyBoxWidthM: 40.32,
  goalBoxDepthM: 5.5,
  goalBoxWidthM: 18.32,
  centreCircleRadiusM: 9.15,
  penaltySpotM: 11,
});

/**
 * Named points on a pitch that a person can actually find in a picture.
 *
 * Calibration asks for four of these. They are all intersections of painted
 * lines, because a painted intersection can be clicked to within a few pixels
 * and "about there, near the corner" cannot.
 *
 * @param {{lengthM: number, widthM: number}} [dimensions=FULL_PITCH] Pitch size.
 * @returns {{id: string, label: string, x: number, y: number}[]} Landmarks in
 *   pitch metres.
 */
export function landmarks(dimensions = FULL_PITCH) {
  const d = { ...FULL_PITCH, ...dimensions };
  const { lengthM: L, widthM: W } = d;
  const boxY0 = (W - d.penaltyBoxWidthM) / 2;
  const boxY1 = W - boxY0;
  const goalY0 = (W - d.goalBoxWidthM) / 2;
  const goalY1 = W - goalY0;
  return Object.freeze([
    { id: 'corner-near-left', label: 'Corner — near left', x: 0, y: 0 },
    { id: 'corner-far-left', label: 'Corner — far left', x: 0, y: W },
    { id: 'corner-near-right', label: 'Corner — near right', x: L, y: 0 },
    { id: 'corner-far-right', label: 'Corner — far right', x: L, y: W },
    { id: 'halfway-near', label: 'Halfway line — near touchline', x: L / 2, y: 0 },
    { id: 'halfway-far', label: 'Halfway line — far touchline', x: L / 2, y: W },
    { id: 'box-left-near', label: 'Left box — near corner', x: d.penaltyBoxDepthM, y: boxY0 },
    { id: 'box-left-far', label: 'Left box — far corner', x: d.penaltyBoxDepthM, y: boxY1 },
    { id: 'box-left-goal-near', label: 'Left box — near goal line', x: 0, y: boxY0 },
    { id: 'box-left-goal-far', label: 'Left box — far goal line', x: 0, y: boxY1 },
    { id: 'box-right-near', label: 'Right box — near corner', x: L - d.penaltyBoxDepthM, y: boxY0 },
    { id: 'box-right-far', label: 'Right box — far corner', x: L - d.penaltyBoxDepthM, y: boxY1 },
    { id: 'box-right-goal-near', label: 'Right box — near goal line', x: L, y: boxY0 },
    { id: 'box-right-goal-far', label: 'Right box — far goal line', x: L, y: boxY1 },
    { id: 'six-left-near', label: 'Left six-yard — near corner', x: d.goalBoxDepthM, y: goalY0 },
    { id: 'six-left-far', label: 'Left six-yard — far corner', x: d.goalBoxDepthM, y: goalY1 },
    { id: 'six-right-near', label: 'Right six-yard — near corner', x: L - d.goalBoxDepthM, y: goalY0 },
    { id: 'six-right-far', label: 'Right six-yard — far corner', x: L - d.goalBoxDepthM, y: goalY1 },
    { id: 'spot-left', label: 'Left penalty spot', x: d.penaltySpotM, y: W / 2 },
    { id: 'spot-right', label: 'Right penalty spot', x: L - d.penaltySpotM, y: W / 2 },
    { id: 'centre', label: 'Centre spot', x: L / 2, y: W / 2 },
  ]);
}

/**
 * The painted lines of a pitch, as segments in pitch metres.
 *
 * Used to draw the plan view and to paint the fitted model back over the
 * footage — which is the only calibration check a person can make at a glance.
 * If the drawn lines sit on the real ones, the matrix is right.
 *
 * @param {{lengthM: number, widthM: number}} [dimensions=FULL_PITCH] Pitch size.
 * @returns {{a: {x: number, y: number}, b: {x: number, y: number}}[]} Segments.
 */
export function pitchLines(dimensions = FULL_PITCH) {
  const d = { ...FULL_PITCH, ...dimensions };
  const { lengthM: L, widthM: W } = d;
  const seg = (x1, y1, x2, y2) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
  const boxY0 = (W - d.penaltyBoxWidthM) / 2;
  const boxY1 = W - boxY0;
  const goalY0 = (W - d.goalBoxWidthM) / 2;
  const goalY1 = W - goalY0;
  const lines = [
    seg(0, 0, L, 0),
    seg(0, W, L, W),
    seg(0, 0, 0, W),
    seg(L, 0, L, W),
    seg(L / 2, 0, L / 2, W),
    seg(0, boxY0, d.penaltyBoxDepthM, boxY0),
    seg(0, boxY1, d.penaltyBoxDepthM, boxY1),
    seg(d.penaltyBoxDepthM, boxY0, d.penaltyBoxDepthM, boxY1),
    seg(L, boxY0, L - d.penaltyBoxDepthM, boxY0),
    seg(L, boxY1, L - d.penaltyBoxDepthM, boxY1),
    seg(L - d.penaltyBoxDepthM, boxY0, L - d.penaltyBoxDepthM, boxY1),
    seg(0, goalY0, d.goalBoxDepthM, goalY0),
    seg(0, goalY1, d.goalBoxDepthM, goalY1),
    seg(d.goalBoxDepthM, goalY0, d.goalBoxDepthM, goalY1),
    seg(L, goalY0, L - d.goalBoxDepthM, goalY0),
    seg(L, goalY1, L - d.goalBoxDepthM, goalY1),
    seg(L - d.goalBoxDepthM, goalY0, L - d.goalBoxDepthM, goalY1),
  ];
  // The centre circle as a polyline; a homography maps circles to conics, and
  // a 48-gon through the same matrix is indistinguishable at any sane zoom.
  const steps = 48;
  for (let i = 0; i < steps; i += 1) {
    const t0 = (i / steps) * Math.PI * 2;
    const t1 = ((i + 1) / steps) * Math.PI * 2;
    lines.push(
      seg(
        L / 2 + Math.cos(t0) * d.centreCircleRadiusM,
        W / 2 + Math.sin(t0) * d.centreCircleRadiusM,
        L / 2 + Math.cos(t1) * d.centreCircleRadiusM,
        W / 2 + Math.sin(t1) * d.centreCircleRadiusM,
      ),
    );
  }
  return lines;
}

/**
 * Eigen-decomposition of a small symmetric matrix by cyclic Jacobi rotations.
 *
 * The homography fit needs the null vector of a 9x9 normal-equation matrix, and
 * pulling in a linear-algebra library for one eigenvector is not worth a
 * dependency in an app with none. Jacobi is thirty lines, converges for every
 * symmetric matrix, and needs no pivoting decisions to get wrong.
 *
 * @param {number[][]} matrix Symmetric n x n matrix; not modified.
 * @param {number} [sweeps=64] Maximum sweeps before giving up.
 * @returns {{values: number[], vectors: number[][]}} Eigenvalues, and vectors
 *   as columns: `vectors[row][k]` is row `row` of the `k`th eigenvector.
 */
export function jacobiEigen(matrix, sweeps = 64) {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

/**
 * Hartley normalisation for one set of points.
 *
 * Skipping this is the classic way to get a homography that looks fine on the
 * marked points and bends badly away from them: image coordinates in the
 * hundreds and pitch coordinates in the tens put entries of wildly different
 * magnitude in the same matrix, and the smallest singular vector of a badly
 * scaled matrix is mostly rounding error.
 *
 * @param {{x: number, y: number}[]} points Points to normalise.
 * @returns {{points: {x: number, y: number}[], transform: number[]}} Points
 *   centred with mean distance sqrt(2) from the origin, and the 3x3 transform
 *   (row-major, 9 entries) that took them there.
 */
export function normalisePoints(points) {
  const n = points.length;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;
  let mean = 0;
  for (const p of points) mean += Math.hypot(p.x - cx, p.y - cy);
  mean /= n;
  const scale = mean > 1e-12 ? Math.SQRT2 / mean : 1;
  return {
    points: points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale })),
    transform: [scale, 0, -scale * cx, 0, scale, -scale * cy, 0, 0, 1],
  };
}

/** Multiply two row-major 3x3 matrices. */
function mul3(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1)
      for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}

/**
 * Invert a row-major 3x3 matrix.
 *
 * @param {number[]} m Matrix, 9 entries.
 * @returns {number[]|null} Inverse, or null if the matrix is singular.
 */
export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
}

/**
 * Apply a homography to a point.
 *
 * @param {number[]} h Row-major 3x3 matrix.
 * @param {{x: number, y: number}} p Point.
 * @returns {{x: number, y: number, w: number}} Mapped point, with the
 *   homogeneous scale so callers can spot points behind the camera (w <= 0),
 *   which map to nonsense if divided through blindly.
 */
export function apply(h, p) {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  const safe = Math.abs(w) < 1e-12 ? (w < 0 ? -1e-12 : 1e-12) : w;
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / safe, y: (h[3] * p.x + h[4] * p.y + h[5]) / safe, w };
}

/**
 * Fit the homography taking image pixels to pitch metres.
 *
 * @param {{image: {x: number, y: number}, pitch: {x: number, y: number}}[]} marks
 *   At least four correspondences, no three of them collinear.
 * @returns {{
 *   imageToPitch: number[],
 *   pitchToImage: number[],
 *   residualM: number,
 *   worstM: number,
 *   marks: object[]
 * }|null} The fit and its cost in metres, or null if the marks are degenerate.
 */
export function fitHomography(marks) {
  if (!Array.isArray(marks) || marks.length < 4) return null;
  const src = normalisePoints(marks.map((m) => m.image));
  const dst = normalisePoints(marks.map((m) => m.pitch));
  const rows = [];
  for (let i = 0; i < marks.length; i += 1) {
    const { x, y } = src.points[i];
    const { x: X, y: Y } = dst.points[i];
    rows.push([-x, -y, -1, 0, 0, 0, X * x, X * y, X]);
    rows.push([0, 0, 0, -x, -y, -1, Y * x, Y * y, Y]);
  }
  // Normal equations rather than an SVD of A: A'A is 9x9 whatever the number of
  // marks, and Jacobi on it is exact enough once the inputs are normalised.
  const ata = Array.from({ length: 9 }, () => new Array(9).fill(0));
  for (const row of rows)
    for (let i = 0; i < 9; i += 1) for (let j = 0; j < 9; j += 1) ata[i][j] += row[i] * row[j];
  const { values, vectors } = jacobiEigen(ata);
  let best = 0;
  for (let i = 1; i < 9; i += 1) if (values[i] < values[best]) best = i;
  const hN = Array.from({ length: 9 }, (_, i) => vectors[i][best]);
  if (!hN.every(Number.isFinite)) return null;
  // Undo the normalisation: H = Tdst^-1 * Hn * Tsrc.
  const dstInv = invert3(dst.transform);
  if (!dstInv) return null;
  const h = mul3(mul3(dstInv, hN), src.transform);
  if (Math.abs(h[8]) < 1e-18) return null;
  let scaled = h.map((v) => v / h[8]);
  // A homography is defined up to scale, sign included, and half the time the
  // solver returns the negative. The sign is not cosmetic: it is the only thing
  // that separates the pitch in front of the camera from its mirror image
  // behind it. Pixels above the horizon map to that mirror with a negative
  // homogeneous scale, and without a fixed convention they silently arrive as
  // plausible pitch coordinates — which is how a stand full of spectators ends
  // up on the far touchline as a row of players. Fix the sign so that the
  // marked pitch itself has w > 0, and w becomes a usable "is this real" test.
  const anchor = marks.reduce(
    (acc, m) => ({ x: acc.x + m.image.x / marks.length, y: acc.y + m.image.y / marks.length }),
    { x: 0, y: 0 },
  );
  if (apply(scaled, anchor).w < 0) scaled = scaled.map((v) => -v);
  const inverse = invert3(scaled);
  if (!inverse) return null;

  let sum = 0;
  let worst = 0;
  const scored = marks.map((m) => {
    const got = apply(scaled, m.image);
    const error = Math.hypot(got.x - m.pitch.x, got.y - m.pitch.y);
    sum += error * error;
    if (error > worst) worst = error;
    return { ...m, errorM: error };
  });
  return {
    imageToPitch: scaled,
    pitchToImage: inverse,
    residualM: Math.sqrt(sum / marks.length),
    worstM: worst,
    marks: scored,
  };
}

/**
 * How much ground one pixel covers at an image point, along both principal
 * directions.
 *
 * A single "metres per pixel" is a lie about a camera looking along the ground.
 * One pixel sideways across the picture is a fraction of a metre; one pixel up
 * the picture, near the far touchline, can be several metres of turf. They
 * differ by a factor of ten in ordinary footage, and picking the wrong one is
 * how a tool ends up believing a player is four pixels tall.
 *
 * Both come out of the local Jacobian of the mapping, as its singular values:
 * `minM` is the least ground a pixel can cover (the direction across the
 * camera's view, which is not foreshortened) and `maxM` is the most (up the
 * picture, into the distance).
 *
 * @param {number[]} imageToPitch Row-major 3x3.
 * @param {number} u Pixel column.
 * @param {number} v Pixel row.
 * @returns {{minM: number, maxM: number, meanM: number}} Metres per pixel.
 */
export function scaleAt(imageToPitch, u, v) {
  const centre = apply(imageToPitch, { x: u, y: v });
  const right = apply(imageToPitch, { x: u + 1, y: v });
  const down = apply(imageToPitch, { x: u, y: v + 1 });
  const a = right.x - centre.x;
  const b = down.x - centre.x;
  const c = right.y - centre.y;
  const d = down.y - centre.y;
  const e = (a + d) / 2;
  const f = (a - d) / 2;
  const g = (b + c) / 2;
  const h = (b - c) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const minM = Math.abs(q - r);
  const maxM = q + r;
  return { minM, maxM, meanM: (minM + maxM) / 2 };
}

/**
 * How tall a standing player of a given height should look at an image row.
 *
 * A vertical metre and a lateral metre project the same way — both are
 * perpendicular to the line of sight — so a player's pixel height comes from
 * the *lateral* scale, `minM`. Using the averaged or the depth scale instead
 * makes every player at the far end of the pitch appear impossibly short, and
 * the size gate then throws away the half of the team furthest from the camera.
 *
 * The approximation left in it is that the player stands upright and the camera
 * has no roll. Both hold well enough for a size gate, whose job is to reject a
 * dog and a dugout rather than to measure anybody.
 *
 * @param {number[]} imageToPitch Row-major 3x3.
 * @param {number} u Pixel column of the feet.
 * @param {number} v Pixel row of the feet.
 * @param {number} [heightM=1.8] Standing height in metres.
 * @returns {number} Expected pixel height, or 0 where the mapping is unusable.
 */
export function expectedPixelHeight(imageToPitch, u, v, heightM = 1.8) {
  const { minM } = scaleAt(imageToPitch, u, v);
  if (!(minM > 1e-9)) return 0;
  return heightM / minM;
}

/**
 * Whether a pitch point is inside the playing area.
 *
 * @param {{x: number, y: number, w?: number}} p Pitch point in metres, ideally
 *   still carrying the homogeneous scale from {@link apply}.
 * @param {{lengthM: number, widthM: number}} [dimensions=FULL_PITCH] Pitch size.
 * @param {number} [marginM=2] Slack outside the lines, metres.
 * @returns {boolean} True when the point is on or near the pitch.
 */
export function onPitch(p, dimensions = FULL_PITCH, marginM = 2) {
  // A point mapped with a non-positive scale is behind the camera: the image
  // pixel was above the horizon and there is no pitch along that ray at all.
  if (typeof p.w === 'number' && p.w <= 0) return false;
  const d = { ...FULL_PITCH, ...dimensions };
  return (
    p.x >= -marginM &&
    p.x <= d.lengthM + marginM &&
    p.y >= -marginM &&
    p.y <= d.widthM + marginM
  );
}

/**
 * How far a pitch point is from the nearest painted line.
 *
 * The ball detector needs this. A ball is a small white round thing on grass,
 * and so is every place two painted lines cross when seen from a hundred metres
 * away. The difference is that the app knows exactly where the paint is — it
 * fitted a model of this pitch — so a white speck sitting on a line can be
 * declined instead of being tracked as the ball for the rest of the half.
 *
 * The cost is real and is stated rather than hidden: a ball genuinely resting
 * on a line is reported as not visible.
 *
 * @param {{x: number, y: number}} point Pitch position, metres.
 * @param {{lengthM: number, widthM: number}} [dimensions=FULL_PITCH] Pitch size.
 * @returns {number} Metres to the nearest line, on the pitch's own plane.
 */
export function distanceToLines(point, dimensions = FULL_PITCH) {
  let best = Infinity;
  for (const { a, b } of pitchLines(dimensions)) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    let t = 0;
    if (lengthSquared > 1e-12) {
      t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
    }
    const distance = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    if (distance < best) best = distance;
  }
  return best;
}

/**
 * Estimate how far the picture has slid between two frames.
 *
 * A coarse search over integer offsets, scored by mean absolute difference on a
 * subsampled grid. It exists to answer one question — has the camera moved? —
 * and to answer it cheaply enough to run on every frame. It reports translation
 * only: a pan is mostly translation over a few frames, a zoom or a big swing is
 * not, and `confidence` is what tells the caller which it is looking at.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} previous
 *   Earlier frame, RGBA.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} current
 *   Later frame, RGBA.
 * @param {number} [search=6] Maximum offset tested, pixels.
 * @returns {{dx: number, dy: number, confidence: number}} How far the picture
 *   moved — positive `dx` means the content slid to the right — and how much
 *   better the best offset was than leaving the frames alone (0 = no better, so
 *   no detectable motion). The sign is the content's displacement rather than
 *   the search offset that found it, because that is what
 *   {@link shiftHomography} needs and an inverted nudge correction is worse
 *   than none.
 */
export function frameShift(previous, current, search = 6) {
  const { width, height } = current;
  const step = Math.max(2, Math.floor(Math.min(width, height) / 48));
  const score = (dx, dy) => {
    let sum = 0;
    let count = 0;
    for (let y = search; y < height - search; y += step) {
      for (let x = search; x < width - search; x += step) {
        const a = (y * width + x) * 4;
        const b = ((y + dy) * width + (x + dx)) * 4;
        sum +=
          Math.abs(current.data[a] - previous.data[b]) +
          Math.abs(current.data[a + 1] - previous.data[b + 1]) +
          Math.abs(current.data[a + 2] - previous.data[b + 2]);
        count += 3;
      }
    }
    return count ? sum / count : Number.POSITIVE_INFINITY;
  };
  const still = score(0, 0);
  let best = { dx: 0, dy: 0, cost: still };
  for (let dy = -search; dy <= search; dy += 1) {
    for (let dx = -search; dx <= search; dx += 1) {
      if (!dx && !dy) continue;
      const cost = score(dx, dy);
      if (cost < best.cost) best = { dx, dy, cost };
    }
  }
  const confidence = still > 1e-6 ? Math.max(0, 1 - best.cost / still) : 0;
  // The search found the offset that maps the *current* frame back onto the
  // previous one, which is the negative of how the picture actually moved.
  // `|| 0` rather than plain negation: negating zero gives -0, which compares
  // unequal to 0 under Object.is and turns "the camera did not move" into a
  // surprise in every caller that tests for it.
  return { dx: -best.dx || 0, dy: -best.dy || 0, confidence };
}

/**
 * Slide a fitted homography to follow a camera that was nudged.
 *
 * Valid for pure image translation, which is what a bumped tripod produces and
 * what a slow pan approximates over a couple of frames. It is not valid for a
 * zoom or a real swing of the camera, and the app's rule is to compensate for
 * small shifts and declare the calibration stale for big ones rather than
 * pretend this covers them.
 *
 * @param {number[]} imageToPitch Row-major 3x3.
 * @param {number} dx Pixels the picture moved right.
 * @param {number} dy Pixels the picture moved down.
 * @returns {number[]} Homography for the shifted image.
 */
export function shiftHomography(imageToPitch, dx, dy) {
  return mul3(imageToPitch, [1, 0, -dx, 0, 1, -dy, 0, 0, 1]);
}
