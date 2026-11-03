/**
 * Great-circle geometry on a spherical Earth (R = 6,371.0088 km, the IUGG
 * mean radius). Haversine distance, initial bearing, and a local flat
 * projection for drawing maps a few hundred kilometres across, where the
 * equirectangular error is under 0.5 %.
 *
 * @module black-optic-6/intel/geo
 */

export const R_EARTH_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Haversine distance, km. */
export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD; const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from true north. */
export function bearingDeg(a, b) {
  const p1 = a.lat * RAD; const p2 = b.lat * RAD; const dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** Sixteen-point compass name of a bearing. */
export function compass(deg) {
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Elevation angle of a target at height h above the observer's ground at
 * ground distance d, including Earth's curvature: the target drops below the
 * observer's tangent plane by d²/2R. Degrees.
 */
export function elevationDeg(dKm, hKm) {
  return Math.atan2(hKm - (dKm * dKm) / (2 * R_EARTH_KM), dKm) / RAD;
}

/** Local east/north kilometres around an origin (equirectangular). */
export function toLocal(origin, p) {
  return [(p.lon - origin.lon) * RAD * R_EARTH_KM * Math.cos(origin.lat * RAD), (p.lat - origin.lat) * RAD * R_EARTH_KM];
}

/** Latitude/longitude box around a point, for API bounding-box queries. */
export function bbox(origin, radiusKm) {
  const dLat = radiusKm / (R_EARTH_KM * RAD);
  const dLon = dLat / Math.max(0.01, Math.cos(origin.lat * RAD));
  return { lamin: origin.lat - dLat, lamax: origin.lat + dLat, lomin: origin.lon - dLon, lomax: origin.lon + dLon };
}

/** Shortest distance from point p to segment ab, all in local km [x, y]. */
export function segmentDistance(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
