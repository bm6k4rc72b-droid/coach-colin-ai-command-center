/**
 * Sunlight on the site: where the sun is, which ground and which roofs it
 * reaches, and how much energy arrives.
 *
 * Sun position is NOAA's algorithm (below), checked in the tests against
 * NREL's Solar Position Algorithm (pvlib) to a few hundredths of a degree;
 * sunrise and sunset come from SunCalc (mourner/suncalc, BSD-2). Shading is exact geometry, not a shadow-map picture: from a
 * point at height z₀ the ray toward the sun rises tan(h) metres per metre of
 * ground; it is blocked by a building when, over the stretch [s_in, s_out] of
 * ground where the ray is above that building's footprint, the ray is below
 * its roof and above its base at some point — i.e. when
 * z₀ + s_in·tan h < H and z₀ + s_out·tan h > H_min.
 *
 * Clear-sky irradiance uses Haurwitz (1945): GHI = 1098·cos z·e^(−0.059/cos z)
 * W/m², the simplest clear-sky model that needs nothing but the zenith angle
 * (the constants pvlib uses). Real yearly totals come from Open-Meteo's
 * reanalysis archive when online; the clear-sky figure is the ceiling.
 *
 * @module black-optic-6/site/sun
 */

import SunCalc from '../../vendor/suncalc/suncalc.js';
import { inFootprint } from './buildings.js';

const RAD = Math.PI / 180;

/**
 * Sun position by NOAA's solar-position algorithm (Meeus, *Astronomical
 * Algorithms*), good to about 0.01° between 1800 and 2100 — checked against
 * NREL's SPA in the tests. (SunCalc's simpler series is ~0.2° off in azimuth,
 * fine for sunrise times, which is all it is used for here.)
 *
 * @returns {{altitudeDeg: number, geometricDeg: number, azimuthDeg: number, dir: number[], declinationDeg: number, equationOfTimeMin: number}}
 *   altitude includes atmospheric refraction (where the light actually comes
 *   from); azimuth is from north, clockwise; dir is the unit vector toward the
 *   apparent sun (east, north, up).
 */
export function sunAt(date, lat, lon) {
  const ms = +date;
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const y = Math.tan(eps / 2) ** 2;
  const L0r = L0 * RAD;
  const eot = (4 / RAD) * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const minutes = ((ms % 86400000) + 86400000) % 86400000 / 60000;
  const tst = (((minutes + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = (tst / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZ = Math.min(1, Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)));
  const geometric = 90 - Math.acos(cosZ) / RAD;
  const az = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180) % 360 + 360) % 360;
  const alt = geometric + refraction(geometric);
  const h = alt * RAD; const a = az * RAD;
  return {
    altitudeDeg: alt, geometricDeg: geometric, azimuthDeg: az, declinationDeg: decl / RAD, equationOfTimeMin: eot,
    dir: [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)],
  };
}

/** NOAA's atmospheric refraction correction, degrees, for a geometric elevation in degrees. */
export function refraction(elev) {
  if (elev > 85) return 0;
  const t = Math.tan(elev * RAD);
  let arcsec;
  if (elev > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (elev > -0.575) arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else arcsec = -20.772 / t;
  return arcsec / 3600;
}

/** Sunrise, sunset and solar noon for a date. */
export function sunTimes(date, lat, lon) {
  const t = SunCalc.getTimes(date, lat, lon);
  return { sunrise: t.sunrise, sunset: t.sunset, solarNoon: t.solarNoon, dayLengthH: (t.sunset - t.sunrise) / 3.6e6 };
}

/** Haurwitz clear-sky global horizontal irradiance, W/m². */
export function clearSkyGhi(zenithDeg) {
  const c = Math.cos(zenithDeg * RAD);
  return c > 0 ? 1098 * c * Math.exp(-0.059 / c) : 0;
}

/**
 * Distances along a 2-D ray where it is inside a footprint (even–odd over all
 * rings).
 *
 * @param {number[]} p Ray start [x, y].
 * @param {number[]} u Unit direction [ux, uy].
 * @returns {number[][]} [s_in, s_out] intervals, s ≥ 0.
 */
export function rayIntervals(p, u, b) {
  const hits = [];
  for (const ring of [b.outer, ...b.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [ax, ay] = ring[j]; const [bx, by] = ring[i];
      const ex = bx - ax; const ey = by - ay;
      const den = u[0] * ey - u[1] * ex;
      if (Math.abs(den) < 1e-15) continue;
      const wx = ax - p[0]; const wy = ay - p[1];
      const s = (wx * ey - wy * ex) / den; // along the ray
      const t = (wx * u[1] - wy * u[0]) / den; // along the edge
      if (s > 1e-9 && t >= 0 && t < 1) hits.push(s);
    }
  }
  hits.sort((x, y) => x - y);
  const out = [];
  let inside = inFootprint(p, b);
  let start = inside ? 0 : null;
  for (const s of hits) {
    if (inside) { out.push([start, s]); inside = false; } else { start = s; inside = true; }
  }
  if (inside) out.push([start, Infinity]);
  return out;
}

/**
 * Is the sun blocked for a point at height z₀?
 *
 * @param {number[]} p [x, y]
 * @param {number} z0 Height of the point, metres.
 * @param {number[]} dir Unit vector toward the sun (east, north, up).
 * @param {object[]} buildings
 * @param {object} [skip] A building to ignore (the roof being tested).
 */
export function shaded(p, z0, dir, buildings, skip = null) {
  if (dir[2] <= 0) return true; // night
  const horiz = Math.hypot(dir[0], dir[1]);
  if (horiz < 1e-9) return false; // sun at the zenith: nothing casts a shadow sideways
  const u = [dir[0] / horiz, dir[1] / horiz];
  const tanH = dir[2] / horiz;
  for (const b of buildings) {
    if (b === skip) continue;
    for (const [s0, s1] of rayIntervals(p, u, b)) {
      if (z0 + s0 * tanH < b.heightM && z0 + s1 * tanH > b.minHeightM) return true;
    }
  }
  return false;
}

/** The sun's track over one day at a fixed step. */
export function dayTrack(date, lat, lon, stepMin = 15) {
  const t = sunTimes(date, lat, lon);
  const out = [];
  if (!(t.sunrise instanceof Date) || Number.isNaN(+t.sunrise)) return out;
  for (let ms = +t.sunrise; ms <= +t.sunset; ms += stepMin * 60e3) out.push({ at: new Date(ms), ...sunAt(new Date(ms), lat, lon) });
  return out;
}

/**
 * Hours of direct sun on the ground across a grid, for one day.
 *
 * @returns {{hours: Float32Array, cols: number, rows: number, cell: number, x0: number, y0: number, dayHours: number}}
 *   NaN inside buildings. Row 0 is the southern edge.
 */
export function sunHoursGrid(buildings, box, cell, date, lat, lon, stepMin = 15) {
  const cols = Math.max(1, Math.ceil((box.x1 - box.x0) / cell));
  const rows = Math.max(1, Math.ceil((box.y1 - box.y0) / cell));
  const hours = new Float32Array(cols * rows);
  const track = dayTrack(date, lat, lon, stepMin).filter((s) => s.altitudeDeg > 0);
  const dt = stepMin / 60;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const p = [box.x0 + (c + 0.5) * cell, box.y0 + (r + 0.5) * cell];
      if (buildings.some((b) => inFootprint(p, b))) { hours[r * cols + c] = NaN; continue; }
      let h = 0;
      for (const s of track) if (!shaded(p, 0, s.dir, buildings)) h += dt;
      hours[r * cols + c] = h;
    }
  }
  return { hours, cols, rows, cell, x0: box.x0, y0: box.y0, dayHours: track.length * dt };
}

/** Hours of direct sun on a building's roof centre (neighbours can shade it). */
export function roofSunHours(b, centre, buildings, date, lat, lon, stepMin = 15) {
  const dt = stepMin / 60;
  let h = 0;
  for (const s of dayTrack(date, lat, lon, stepMin)) if (s.altitudeDeg > 0 && !shaded(centre, b.heightM + 0.01, s.dir, buildings, b)) h += dt;
  return h;
}

/**
 * Clear-sky irradiation on a horizontal surface over a year, kWh/m².
 * Trapezoid-free: a mid-step rectangle rule at stepMin resolution.
 */
export function clearSkyYearKWh(lat, lon, year, stepMin = 30) {
  let wh = 0;
  const start = Date.UTC(year, 0, 1); const end = Date.UTC(year + 1, 0, 1);
  for (let ms = start + (stepMin * 60e3) / 2; ms < end; ms += stepMin * 60e3) {
    const s = sunAt(new Date(ms), lat, lon);
    wh += clearSkyGhi(90 - s.geometricDeg) * (stepMin / 60);
  }
  return wh / 1000;
}
