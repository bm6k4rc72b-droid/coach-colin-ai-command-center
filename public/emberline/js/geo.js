/**
 * The geodesy everything else stands on, and the one place metres are defined.
 *
 * A fire app that is casual about coordinates produces confident nonsense. A
 * bearing taken from a camera, a satellite pixel corner, a spread ellipse an
 * hour into the future and a Wi-Fi node that just stopped answering all have to
 * land in the same frame before any of them can be compared, and "close enough
 * in degrees" is not a frame — a tenth of a degree is 11 km north-south and
 * anywhere from 11 km to nothing east-west depending on where you are standing.
 *
 * So this module fixes the conventions once:
 *
 * - Positions are `{lat, lon}` in signed decimal degrees, WGS-84.
 * - Bearings are degrees clockwise from true north, in `[0, 360)`. True, not
 *   magnetic. A camera bearing that came off a phone compass is magnetic and
 *   has to be declination-corrected before it gets here; {@link normaliseBearing}
 *   will happily accept a wrong number, so the correction is the caller's job
 *   and the app says so on screen.
 * - Distances are metres. Always metres. Never miles, never "units".
 * - Local work happens in an east-north tangent plane centred on a stated
 *   origin ({@link toLocal} / {@link fromLocal}), which is flat-Earth and
 *   proudly so: over the tens of kilometres a single incident spans, the error
 *   is centimetres, and the alternative is spherical trigonometry inside a
 *   render loop.
 *
 * The sphere used is R = 6371008.8 m, the IUGG mean radius. Not the equatorial
 * radius, which would stretch every distance by about 0.3%, which is 30 m in a
 * 10 km run to a fire front — small, but not small enough to introduce for no
 * reason.
 *
 * @module emberline/geo
 */

/** IUGG mean Earth radius, metres. */
export const EARTH_RADIUS_M = 6371008.8;

/** Degrees to radians. @param {number} deg @returns {number} */
export const toRad = (deg) => (deg * Math.PI) / 180;

/** Radians to degrees. @param {number} rad @returns {number} */
export const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Fold any bearing into `[0, 360)`.
 *
 * @param {number} deg Bearing in degrees, any sign, any magnitude.
 * @returns {number} The same bearing in `[0, 360)`; `NaN` in, `NaN` out.
 */
export function normaliseBearing(deg) {
  if (!Number.isFinite(deg)) return NaN;
  return ((deg % 360) + 360) % 360;
}

/**
 * Signed smallest angle from one bearing to another.
 *
 * Used wherever two bearings are compared — is this camera sighting the same
 * plume the other camera sees, is the wind still blowing the way it was — and
 * the answer has to survive the wrap at north. 350° and 10° are 20° apart, not
 * 340°, and code that gets this wrong fails only near north, which is to say it
 * fails in testing never and in the field sometimes.
 *
 * @param {number} from Bearing in degrees.
 * @param {number} to Bearing in degrees.
 * @returns {number} Difference in `(-180, 180]`, positive clockwise.
 */
export function bearingDelta(from, to) {
  const raw = normaliseBearing(to) - normaliseBearing(from);
  if (raw > 180) return raw - 360;
  if (raw <= -180) return raw + 360;
  return raw;
}

/**
 * Great-circle distance between two positions.
 *
 * @param {{lat: number, lon: number}} a Start.
 * @param {{lat: number, lon: number}} b End.
 * @returns {number} Metres along the sphere.
 */
export function distanceM(a, b) {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = phi2 - phi1;
  const dLambda = toRad(b.lon - a.lon);
  const h =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial great-circle bearing from one position to another.
 *
 * "Initial" matters over long legs: the bearing of a great circle changes as
 * you walk it. Over an incident-sized area the change is negligible, but the
 * satellite-overpass code uses this over thousands of kilometres, where it is
 * not.
 *
 * @param {{lat: number, lon: number}} a Start.
 * @param {{lat: number, lon: number}} b End.
 * @returns {number} Degrees clockwise from true north, in `[0, 360)`.
 */
export function bearingDeg(a, b) {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLambda = toRad(b.lon - a.lon);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return normaliseBearing(toDeg(Math.atan2(y, x)));
}

/**
 * Walk a distance along a bearing from a position.
 *
 * @param {{lat: number, lon: number}} origin Start.
 * @param {number} bearing Degrees clockwise from true north.
 * @param {number} metres Distance along the great circle.
 * @returns {{lat: number, lon: number}} The arrival point.
 */
export function destination(origin, bearing, metres) {
  const delta = metres / EARTH_RADIUS_M;
  const theta = toRad(normaliseBearing(bearing));
  const phi1 = toRad(origin.lat);
  const lambda1 = toRad(origin.lon);
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2,
    );
  return { lat: toDeg(phi2), lon: wrapLon(toDeg(lambda2)) };
}

/**
 * Fold a longitude into `[-180, 180)`.
 *
 * @param {number} lon Longitude in degrees.
 * @returns {number} The same meridian, expressed once.
 */
export function wrapLon(lon) {
  if (!Number.isFinite(lon)) return NaN;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Metres per degree of longitude at a latitude.
 *
 * Exposed because it is the number people get wrong. At 60° north a degree of
 * longitude is half what it is at the equator, and a bounding box drawn as a
 * square in degrees is a rectangle twice as tall as it is wide on the ground.
 *
 * @param {number} lat Latitude in degrees.
 * @returns {number} Metres per degree of longitude.
 */
export function metresPerDegreeLon(lat) {
  return (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(toRad(lat));
}

/** Metres per degree of latitude — constant on a sphere. @returns {number} */
export function metresPerDegreeLat() {
  return (Math.PI / 180) * EARTH_RADIUS_M;
}

/**
 * Project a position into an east-north tangent plane centred on an origin.
 *
 * @param {{lat: number, lon: number}} origin Plane centre.
 * @param {{lat: number, lon: number}} point Position to project.
 * @returns {{e: number, n: number}} Metres east and north of the origin.
 */
export function toLocal(origin, point) {
  return {
    e: wrapLon(point.lon - origin.lon) * metresPerDegreeLon(origin.lat),
    n: (point.lat - origin.lat) * metresPerDegreeLat(),
  };
}

/**
 * Lift a tangent-plane offset back to latitude and longitude.
 *
 * @param {{lat: number, lon: number}} origin Plane centre.
 * @param {{e: number, n: number}} local Metres east and north.
 * @returns {{lat: number, lon: number}} The position.
 */
export function fromLocal(origin, local) {
  return {
    lat: origin.lat + local.n / metresPerDegreeLat(),
    lon: wrapLon(origin.lon + local.e / metresPerDegreeLon(origin.lat)),
  };
}

/**
 * The mean of several positions, in the tangent plane of the first.
 *
 * @param {Array<{lat: number, lon: number}>} points At least one position.
 * @returns {?{lat: number, lon: number}} The centroid, or null for no input.
 */
export function centroid(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const origin = points[0];
  let e = 0;
  let n = 0;
  for (const point of points) {
    const local = toLocal(origin, point);
    e += local.e;
    n += local.n;
  }
  return fromLocal(origin, { e: e / points.length, n: n / points.length });
}

/**
 * A bounding box that contains every position, padded by a margin.
 *
 * @param {Array<{lat: number, lon: number}>} points Positions.
 * @param {number} [padM=0] Margin in metres on every side.
 * @returns {?{south: number, north: number, west: number, east: number}} The box.
 */
export function boundsOf(points, padM = 0) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) continue;
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    west = Math.min(west, point.lon);
    east = Math.max(east, point.lon);
  }
  if (!Number.isFinite(south)) return null;
  const padLat = padM / metresPerDegreeLat();
  const midLat = (south + north) / 2;
  const padLon = padM / Math.max(1, metresPerDegreeLon(midLat));
  return {
    south: south - padLat,
    north: north + padLat,
    west: west - padLon,
    east: east + padLon,
  };
}

/**
 * Where two bearing lines cross, in the tangent plane of the first observer.
 *
 * This is the fire lookout's method — two towers, two bearings, one fire —
 * done in metres rather than on a paper Osborne firefinder. The intersection is
 * solved as two rays, not two infinite lines, because a fix *behind* an
 * observer is not a fix: it means one of the two bearings is wrong, and
 * returning a plausible-looking coordinate for it is exactly how a crew ends up
 * driving away from a fire.
 *
 * @param {{position: {lat: number, lon: number}, bearing: number}} a First sighting.
 * @param {{position: {lat: number, lon: number}, bearing: number}} b Second sighting.
 * @returns {?{position: {lat: number, lon: number}, rangeAM: number, rangeBM: number,
 *   crossingAngleDeg: number}} The crossing point with the range along each ray
 *   and the angle the rays cross at, or null if the rays are parallel, or if
 *   the crossing lies behind either observer.
 */
export function crossBearing(a, b) {
  const origin = a.position;
  const pa = { e: 0, n: 0 };
  const pb = toLocal(origin, b.position);
  const thetaA = toRad(normaliseBearing(a.bearing));
  const thetaB = toRad(normaliseBearing(b.bearing));
  // Direction vectors in east-north. Bearing is clockwise from north, so east
  // is the sine component and north the cosine — the transpose of the usual
  // maths convention, and a classic sign bug if written from memory.
  const da = { e: Math.sin(thetaA), n: Math.cos(thetaA) };
  const db = { e: Math.sin(thetaB), n: Math.cos(thetaB) };
  const denominator = da.e * db.n - da.n * db.e;
  // Rays within a quarter degree of parallel: the crossing runs away to
  // infinity and the fix is meaningless long before the maths divides by zero.
  if (Math.abs(denominator) < Math.sin(toRad(0.25))) return null;
  const dx = pb.e - pa.e;
  const dy = pb.n - pa.n;
  const tA = (dx * db.n - dy * db.e) / denominator;
  const tB = (dx * da.n - dy * da.e) / denominator;
  if (!(tA > 0) || !(tB > 0)) return null;
  const crossingAngle = Math.abs(bearingDelta(a.bearing, b.bearing));
  return {
    position: fromLocal(origin, { e: pa.e + da.e * tA, n: pa.n + da.n * tA }),
    rangeAM: tA,
    rangeBM: tB,
    crossingAngleDeg: crossingAngle > 90 ? 180 - crossingAngle : crossingAngle,
  };
}

/**
 * Turn a 2×2 position covariance into the ellipse a person can be shown.
 *
 * Every fix in this app carries one, because a fire "at" a coordinate is a fire
 * somewhere in a region whose shape is the interesting part: two cameras
 * crossing at 80° give a small round region, the same two crossing at 8° give a
 * cigar tens of kilometres long pointed straight down the baseline. Both print
 * as a latitude and a longitude. Only one of them is a location.
 *
 * @param {{ee: number, en: number, nn: number}} covariance Metres squared, in
 *   the east-north plane.
 * @param {number} [sigmas=2] How many standard deviations the ellipse spans.
 *   Two is roughly the 86% region in 2-D — not 95%, which is the number people
 *   assume from the 1-D case.
 * @returns {{semiMajorM: number, semiMinorM: number, orientationDeg: number}}
 *   Axis half-lengths in metres and the major axis as a bearing.
 */
export function covarianceEllipse(covariance, sigmas = 2) {
  const { ee, en, nn } = covariance;
  const trace = ee + nn;
  const diff = Math.sqrt(Math.max(0, ((ee - nn) / 2) ** 2 + en * en));
  const lambda1 = Math.max(0, trace / 2 + diff);
  const lambda2 = Math.max(0, trace / 2 - diff);
  // Eigenvector of the larger eigenvalue is (en, lambda1 - ee); atan2 of it in
  // (north, east) order is the angle anticlockwise from east, and a compass
  // bearing is 90 degrees minus that. When the axes are already aligned both
  // arguments vanish and atan2(0, 0) is zero, which is the east-major answer.
  const angleFromEast = Math.atan2(lambda1 - ee, en);
  const orientation = normaliseBearing(90 - toDeg(angleFromEast));
  return {
    semiMajorM: sigmas * Math.sqrt(lambda1),
    semiMinorM: sigmas * Math.sqrt(lambda2),
    orientationDeg: orientation,
  };
}

/**
 * Sample an ellipse as a closed ring of positions, ready to draw.
 *
 * @param {{lat: number, lon: number}} centre Ellipse centre.
 * @param {{semiMajorM: number, semiMinorM: number, orientationDeg: number}} ellipse Axes.
 * @param {number} [steps=48] Vertices in the ring.
 * @returns {Array<{lat: number, lon: number}>} The ring, first vertex repeated last.
 */
export function ellipseRing(centre, ellipse, steps = 48) {
  const ring = [];
  const theta = toRad(ellipse.orientationDeg);
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    // Parametrise along the major axis first, then rotate the axis onto its
    // bearing. Major axis along the bearing, minor across it.
    const along = ellipse.semiMajorM * Math.cos(t);
    const across = ellipse.semiMinorM * Math.sin(t);
    const n = along * Math.cos(theta) - across * Math.sin(theta);
    const e = along * Math.sin(theta) + across * Math.cos(theta);
    ring.push(fromLocal(centre, { e, n }));
  }
  return ring;
}

/**
 * Area of a ring of positions, by the shoelace formula in the tangent plane.
 *
 * @param {Array<{lat: number, lon: number}>} ring Vertices, open or closed.
 * @returns {number} Square metres; zero for anything with fewer than three vertices.
 */
export function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const origin = ring[0];
  const local = ring.map((point) => toLocal(origin, point));
  let twiceArea = 0;
  for (let i = 0; i < local.length; i += 1) {
    const p = local[i];
    const q = local[(i + 1) % local.length];
    twiceArea += p.e * q.n - q.e * p.n;
  }
  return Math.abs(twiceArea) / 2;
}

/** Square metres to hectares. @param {number} m2 @returns {number} */
export const toHectares = (m2) => m2 / 10000;

/**
 * Is a position inside a ring? Ray casting in the tangent plane.
 *
 * @param {{lat: number, lon: number}} point Position to test.
 * @param {Array<{lat: number, lon: number}>} ring Polygon vertices.
 * @returns {boolean} True when the point is inside.
 */
export function pointInRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const origin = ring[0];
  const p = toLocal(origin, point);
  const local = ring.map((vertex) => toLocal(origin, vertex));
  let inside = false;
  for (let i = 0, j = local.length - 1; i < local.length; j = i, i += 1) {
    const a = local[i];
    const b = local[j];
    const straddles = a.n > p.n !== b.n > p.n;
    if (straddles && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) inside = !inside;
  }
  return inside;
}
