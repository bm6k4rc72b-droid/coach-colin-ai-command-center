/**
 * The boundary, and whether the fix is good enough to say which side of it you are on.
 *
 * A geofence is trivial arithmetic and a hard honesty problem. The arithmetic is
 * point-in-polygon. The problem is that a satellite fix arrives with an accuracy
 * radius — often 8 m in the open, 30 m or worse under a tree line or a barn roof
 * — and a console that tests the centre of that circle against a boundary will
 * happily announce a crossing that the fix cannot support.
 *
 * So every answer here carries `resolved`. When the accuracy radius reaches
 * across the boundary, the state is `unresolved` and no alert fires. That is the
 * difference between a tripwire and a nuisance: the fence that cried wolf at
 * three in the morning gets switched off by the second week, and then it is not
 * a fence at all.
 *
 * Distances use the shared geodesy from the fire console rather than a second
 * implementation, because two distance functions in one repository eventually
 * disagree.
 *
 * @module black-optic-6/perimeter
 */

import { distanceM, toRad } from '../../emberline/js/geo.js';

/** Fixes worse than this are not used for boundary decisions at all. */
export const USELESS_ACCURACY_M = 60;

/**
 * A position fix.
 *
 * @typedef {object} Fix
 * @property {number} lat Degrees.
 * @property {number} lon Degrees.
 * @property {number} accuracyM Radius of the 68% confidence circle.
 * @property {number} [atMs] When it was taken.
 */

/**
 * Whether a point lies inside a boundary.
 *
 * Ray casting on a local tangent plane: longitudes are scaled by the cosine of
 * latitude so a degree east is the same ground distance as a degree north. Over
 * a property-sized polygon the curvature error is millimetres.
 *
 * @param {{lat: number, lon: number}} point The position.
 * @param {Array<{lat: number, lon: number}>} boundary Polygon vertices in order.
 * @returns {boolean} True if inside.
 */
export function inside(point, boundary) {
  if (!boundary || boundary.length < 3) return false;
  const k = Math.cos(toRad(point.lat));
  const x = point.lon * k;
  const y = point.lat;
  let hit = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i, i += 1) {
    const xi = boundary[i].lon * k;
    const yi = boundary[i].lat;
    const xj = boundary[j].lon * k;
    const yj = boundary[j].lat;
    const straddles = (yi > y) !== (yj > y);
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Distance from a point to the nearest edge of a boundary, in metres.
 *
 * Unsigned — `inside` answers which side. Segments are measured properly rather
 * than by nearest vertex, which on a long fence line is the difference between
 * two metres and two hundred.
 *
 * @param {{lat: number, lon: number}} point The position.
 * @param {Array<{lat: number, lon: number}>} boundary Polygon vertices in order.
 * @returns {number} Metres to the closest edge; Infinity for a degenerate boundary.
 */
export function distanceToEdgeM(point, boundary) {
  if (!boundary || boundary.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i, i += 1) {
    best = Math.min(best, distanceToSegmentM(point, boundary[j], boundary[i]));
  }
  return best;
}

/**
 * Distance from a point to a boundary segment, in metres.
 *
 * @param {{lat: number, lon: number}} point The position.
 * @param {{lat: number, lon: number}} a One end.
 * @param {{lat: number, lon: number}} b The other end.
 * @returns {number} Metres.
 */
export function distanceToSegmentM(point, a, b) {
  const k = Math.cos(toRad(point.lat));
  const px = point.lon * k;
  const py = point.lat;
  const ax = a.lon * k;
  const ay = a.lat;
  const bx = b.lon * k;
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distanceM(point, a);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return distanceM(point, { lat: ay + dy * t, lon: (ax + dx * t) / k });
}

/**
 * Where a fix stands relative to the boundary, and whether that can be trusted.
 *
 * @param {Fix} fix The position fix.
 * @param {Array<{lat: number, lon: number}>} boundary The property boundary.
 * @returns {{state: string, inside: boolean, distanceM: number, accuracyM: number,
 *   resolved: boolean, verdict: string}} The assessment.
 */
export function fenceState(fix, boundary) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) {
    return {
      state: 'no-fix', inside: false, distanceM: NaN, accuracyM: NaN, resolved: false,
      verdict: 'No position fix.',
    };
  }
  if (!boundary || boundary.length < 3) {
    return {
      state: 'no-boundary', inside: false, distanceM: NaN, accuracyM: fix.accuracyM, resolved: false,
      verdict: 'No boundary drawn yet.',
    };
  }

  const accuracyM = Number.isFinite(fix.accuracyM) ? fix.accuracyM : USELESS_ACCURACY_M;
  const within = inside(fix, boundary);
  const metres = distanceToEdgeM(fix, boundary);

  if (accuracyM >= USELESS_ACCURACY_M) {
    return {
      state: 'unresolved',
      inside: within,
      distanceM: metres,
      accuracyM,
      resolved: false,
      verdict: `Fix is ±${accuracyM.toFixed(0)} m. Too coarse for any boundary decision.`,
    };
  }

  // The circle of possible positions reaches across the line: the fix genuinely
  // does not know which side it is on, and saying so is the only honest answer.
  if (accuracyM >= metres) {
    return {
      state: 'unresolved',
      inside: within,
      distanceM: metres,
      accuracyM,
      resolved: false,
      verdict: `${metres.toFixed(0)} m from the line with a ±${accuracyM.toFixed(0)} m fix — the fix straddles it. No alert.`,
    };
  }

  return {
    state: within ? 'inside' : 'outside',
    inside: within,
    distanceM: metres,
    accuracyM,
    resolved: true,
    verdict: within
      ? `Inside the boundary, ${metres.toFixed(0)} m from the nearest line (±${accuracyM.toFixed(0)} m).`
      : `Outside the boundary, ${metres.toFixed(0)} m beyond the nearest line (±${accuracyM.toFixed(0)} m).`,
  };
}

/**
 * Whether a boundary crossing has actually happened.
 *
 * Both the previous and the current fix must be resolved. A transition seen
 * through an unresolved fix is not a crossing, it is a gap in knowledge, and the
 * two have to be distinguished or the log fills with fictional entries every
 * time somebody walks under the oak by the gate.
 *
 * @param {object} previous Prior `fenceState` result.
 * @param {object} current Current `fenceState` result.
 * @returns {{crossed: boolean, direction: string, reason: string}} The verdict.
 */
export function crossing(previous, current) {
  if (!previous || !current) return { crossed: false, direction: 'none', reason: 'No prior fix.' };
  if (!previous.resolved || !current.resolved) {
    return { crossed: false, direction: 'none', reason: 'One of the two fixes could not resolve the boundary.' };
  }
  if (previous.inside === current.inside) {
    return { crossed: false, direction: 'none', reason: 'Same side as the previous fix.' };
  }
  return {
    crossed: true,
    direction: current.inside ? 'entered' : 'exited',
    reason: `Resolved fixes on both sides: ±${previous.accuracyM.toFixed(0)} m then ±${current.accuracyM.toFixed(0)} m.`,
  };
}

/**
 * The approximate area a boundary encloses, in hectares.
 *
 * The shoelace formula on the same tangent-plane projection. Good to a fraction
 * of a percent at property scale, and it gives an operator an immediate sanity
 * check that the polygon they drew is the land they own.
 *
 * @param {Array<{lat: number, lon: number}>} boundary Polygon vertices in order.
 * @returns {number} Hectares.
 */
export function areaHectares(boundary) {
  if (!boundary || boundary.length < 3) return 0;
  const latMean = boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length;
  const k = Math.cos(toRad(latMean));
  const metresPerDegLat = 111132.95;
  let sum = 0;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i, i += 1) {
    const xi = boundary[i].lon * k * metresPerDegLat;
    const yi = boundary[i].lat * metresPerDegLat;
    const xj = boundary[j].lon * k * metresPerDegLat;
    const yj = boundary[j].lat * metresPerDegLat;
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum / 2) / 10000;
}
