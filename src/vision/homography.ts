/**
 * Pixel -> field-coordinate mapping.
 *
 * Every distance metric in this app (yards moved, defender separation, throw
 * distance) is meaningless until we can turn a screen pixel into a point on the
 * field. A phone on a sideline or in the stands sees the field under a
 * perspective transform, so a fixed "pixels per yard" scale is wrong: 10 yards
 * near the camera covers far more pixels than 10 yards at the far hash.
 *
 * A homography is the correct model for that. It maps one plane (the field) to
 * another (the sensor) and is fully determined by 4 point correspondences, which
 * the user supplies by tapping 4 landmarks whose real spacing they know
 * (e.g. the corners of a 10 x 15 yard box formed by two yard lines, a sideline
 * and the near hash marks).
 */

export type Point = { x: number; y: number };

/** Row-major 3x3 matrix. */
export type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/**
 * Solve A x = b by Gauss-Jordan elimination with partial pivoting.
 * Returns null when the system is singular (degenerate calibration points).
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Work on an augmented copy so the caller's arrays stay intact.
  const m = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const d = m[col][col];
    for (let k = col; k <= n; k++) m[col][k] /= d;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = m[row][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) m[row][k] -= f * m[col][k];
    }
  }

  return m.map((row) => row[n]);
}

/**
 * Direct Linear Transform for exactly 4 correspondences.
 *
 * With h33 fixed at 1 the 4 point pairs give 8 equations in 8 unknowns, so the
 * system is square and needs no least-squares step.
 */
export function computeHomography(src: Point[], dst: Point[]): Matrix3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem(A, b);
  if (!h) return null;

  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as Matrix3;
}

/** Apply a homography to a point. Returns null for points on the horizon. */
export function applyHomography(H: Matrix3, p: Point): Point | null {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  // w collapses to zero along the vanishing line, where the mapping is undefined.
  if (Math.abs(w) < 1e-9) return null;
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The reference rectangle the user is asked to tap, in yards.
 *
 * Order is clockwise from the near-left corner and must match the order the
 * taps are collected in. Defaults describe the box between two 5-yard lines,
 * the sideline and the near hash — a shape available on essentially any
 * marked football field.
 */
export function referenceRectangle(widthYards: number, depthYards: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: widthYards, y: 0 },
    { x: widthYards, y: depthYards },
    { x: 0, y: depthYards },
  ];
}
