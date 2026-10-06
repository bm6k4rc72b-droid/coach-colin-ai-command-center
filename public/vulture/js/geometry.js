/**
 * Plane and sphere geometry shared by the lot engine, the tracker, the
 * kinetics engine and the route-safety model. Pure functions, no DOM.
 *
 * Image coordinates are normalised to [0,1] on both axes so a space drawn on
 * a 720p preview still lines up when the same camera streams at 4K.
 *
 * @module vulture/geometry
 */

/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */

/**
 * Ray-casting point-in-polygon test.
 *
 * @param {Point} p Query point.
 * @param {Point[]} poly Polygon vertices, either winding.
 * @returns {boolean} True when p is inside.
 */
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Signed shoelace area; absolute value is the polygon area.
 *
 * @param {Point[]} poly Polygon vertices.
 * @returns {number} Area (positive for counter-clockwise in y-up space).
 */
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(s) / 2;
}

/**
 * Vertex average (good enough for label placement on convex spaces).
 *
 * @param {Point[]} poly Polygon vertices.
 * @returns {Point} Centroid.
 */
export function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

/**
 * Stratified sample points inside a polygon, used to estimate how much of a
 * space a detection box covers without a general polygon-clipping routine.
 *
 * @param {Point[]} poly Polygon vertices.
 * @param {number} [grid=12] Samples per axis across the bounding box.
 * @returns {Point[]} Points that fall inside the polygon.
 */
export function samplePolygon(poly, grid = 12) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const dx = (Math.max(...xs) - x0) / grid;
  const dy = (Math.max(...ys) - y0) / grid;
  const out = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const p = { x: x0 + (i + 0.5) * dx, y: y0 + (j + 0.5) * dy };
      if (pointInPolygon(p, poly)) out.push(p);
    }
  }
  if (!out.length) out.push(centroid(poly));
  return out;
}

/**
 * Fraction of a polygon's sample points covered by an axis-aligned box.
 *
 * @param {Point[]} samples Output of samplePolygon.
 * @param {Box} box Detection box.
 * @returns {number} Coverage in [0,1].
 */
export function coverage(samples, box) {
  let hit = 0;
  for (const p of samples) {
    if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) hit++;
  }
  return hit / samples.length;
}

/**
 * Intersection-over-union of two boxes.
 *
 * @param {Box} a First box.
 * @param {Box} b Second box.
 * @returns {number} IoU in [0,1].
 */
export function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 2-D cross product of (b - a) × (c - a). Its sign says which side of the
 * directed line a→b the point c lies on.
 *
 * @param {Point} a Line start.
 * @param {Point} b Line end.
 * @param {Point} c Query point.
 * @returns {number} Signed doubled triangle area.
 */
export function side(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Proper segment intersection test (shared endpoints count as crossing).
 *
 * @param {Point} p1 First segment start.
 * @param {Point} p2 First segment end.
 * @param {Point} q1 Second segment start.
 * @param {Point} q2 Second segment end.
 * @returns {boolean} True if the segments intersect.
 */
export function segmentsIntersect(p1, p2, q1, q2) {
  const d1 = side(q1, q2, p1);
  const d2 = side(q1, q2, p2);
  const d3 = side(p1, p2, q1);
  const d4 = side(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || d1 === 0 || d2 === 0)
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0) || d3 === 0 || d4 === 0)
    && !(d1 === 0 && d2 === 0);
}

/**
 * Interior angle at vertex b formed by a-b-c, in degrees (0..180).
 * Works for 2-D or 3-D points (z optional).
 *
 * @param {{x:number,y:number,z?:number}} a First point.
 * @param {{x:number,y:number,z?:number}} b Vertex.
 * @param {{x:number,y:number,z?:number}} c Third point.
 * @returns {number} Angle in degrees, NaN for a degenerate triangle.
 */
export function jointAngle(a, b, c) {
  const ux = a.x - b.x; const uy = a.y - b.y; const uz = (a.z ?? 0) - (b.z ?? 0);
  const vx = c.x - b.x; const vy = c.y - b.y; const vz = (c.z ?? 0) - (b.z ?? 0);
  const nu = Math.hypot(ux, uy, uz);
  const nv = Math.hypot(vx, vy, vz);
  if (nu === 0 || nv === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (nu * nv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Bilinear subdivision of a quadrilateral row into n equal stalls. The quad is
 * given as front-left, front-right, back-right, back-left; stalls are cut
 * along the front edge, which is how painted bays are laid out.
 *
 * @param {Point[]} quad Four corners.
 * @param {number} n Number of stalls.
 * @returns {Point[][]} n four-point polygons.
 */
export function subdivideQuad(quad, n) {
  const [a, b, c, d] = quad;
  const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    out.push([lerp(a, b, t0), lerp(a, b, t1), lerp(d, c, t1), lerp(d, c, t0)]);
  }
  return out;
}

const EARTH_R = 6371008.8;

/**
 * Great-circle distance.
 *
 * @param {number} lat1 Latitude 1 (deg).
 * @param {number} lon1 Longitude 1 (deg).
 * @param {number} lat2 Latitude 2 (deg).
 * @param {number} lon2 Longitude 2 (deg).
 * @returns {number} Metres.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance from a point to a segment on a local equirectangular projection —
 * accurate to centimetres over the tens of metres it is used for.
 *
 * @param {number[]} p [lat, lon] query.
 * @param {number[]} a [lat, lon] segment start.
 * @param {number[]} b [lat, lon] segment end.
 * @returns {number} Metres.
 */
export function pointSegmentDistance(p, a, b) {
  const k = Math.cos((p[0] * Math.PI) / 180) * 111320;
  const ax = (a[1] - p[1]) * k; const ay = (a[0] - p[0]) * 110540;
  const bx = (b[1] - p[1]) * k; const by = (b[0] - p[0]) * 110540;
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Resample a polyline at a fixed spacing (keeps both ends).
 *
 * @param {number[][]} line [lat, lon] vertices.
 * @param {number} step Spacing in metres.
 * @returns {{pts:number[][], dist:number[]}} Samples with cumulative distance.
 */
export function resample(line, step) {
  const pts = [line[0]];
  const dist = [0];
  let carried = 0;
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const [la, lo] = line[i - 1];
    const [lb, lob] = line[i];
    const seg = haversine(la, lo, lb, lob);
    let pos = step - carried;
    while (pos <= seg) {
      const t = pos / seg;
      pts.push([la + (lb - la) * t, lo + (lob - lo) * t]);
      dist.push(total + pos);
      pos += step;
    }
    carried = seg - (pos - step);
    total += seg;
  }
  const last = line[line.length - 1];
  if (dist[dist.length - 1] < total - 1e-6) { pts.push(last); dist.push(total); }
  return { pts, dist };
}
