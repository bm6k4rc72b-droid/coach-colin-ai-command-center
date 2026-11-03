/**
 * Earth-orbit tracking: SGP4 on CelesTrak's published orbital data.
 *
 * CelesTrak (Dr T. S. Kelso) republishes the US Space Force's general
 * perturbations element sets as OMM JSON. SGP4 — the propagator those
 * elements are fitted for, and the only one they are valid with — runs here
 * through satellite.js (MIT). Its accuracy is about a kilometre at epoch and
 * degrades by a few kilometres a day, so element sets older than a few days
 * are flagged.
 *
 * Passes over the ranch are found by stepping 20 s and bisecting each
 * horizon crossing to one second. Naked-eye visibility needs two things the
 * elements do not give directly: the observer in darkness (Sun below −6°,
 * civil twilight) and the satellite in sunlight, tested against a
 * cylindrical Earth shadow — a standard approximation that errs only in the
 * few seconds of penumbra.
 *
 * @module black-optic-6/space/sats
 */

import {
  degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic, geodeticToEcf, gstime, json2satrec, propagate,
} from '../../vendor/satellite/satellite.es.js';
import { sunAt } from '../site/sun.js';

const RAD = Math.PI / 180;
const RE_KM = 6378.137;

export const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php';
export const GROUPS = Object.freeze([
  { id: 'stations', label: 'Space stations (ISS, Tiangong)' },
  { id: 'visual', label: '100 brightest' },
  { id: 'starlink', label: 'SpaceX Starlink (all)' },
  { id: 'gps-ops', label: 'GPS' },
  { id: 'weather', label: 'Weather' },
  { id: 'last-30-days', label: 'Launched in the last 30 days' },
]);
export const groupUrl = (id) => `${CELESTRAK}?GROUP=${encodeURIComponent(id)}&FORMAT=json`;

/** Build SGP4 records from OMM JSON; drops records SGP4 cannot initialise. */
export function satrecs(omms) {
  const out = [];
  for (const omm of Array.isArray(omms) ? omms : []) {
    try {
      const rec = json2satrec(omm);
      if (rec.error) continue;
      out.push({ name: String(omm.OBJECT_NAME ?? omm.NORAD_CAT_ID), id: Number(omm.NORAD_CAT_ID), epoch: new Date(String(omm.EPOCH).endsWith('Z') ? omm.EPOCH : `${omm.EPOCH}Z`), rec });
    } catch { /* malformed record: skip */ }
  }
  return out;
}

/** Age of an element set, days. */
export const ageDays = (sat, date) => (+date - +sat.epoch) / 86400000;

/**
 * Where a satellite is.
 *
 * @returns {{eci: {x: number, y: number, z: number}, lat: number, lon: number, altKm: number, speedKms: number}|null}
 */
export function locate(sat, date) {
  const pv = propagate(sat.rec, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const g = eciToGeodetic(pv.position, gstime(date));
  const v = pv.velocity;
  return { eci: pv.position, lat: degreesLat(g.latitude), lon: degreesLong(g.longitude), altKm: g.height, speedKms: Math.hypot(v.x, v.y, v.z) };
}

/** Azimuth, elevation (degrees) and range (km) from an observer {lat, lon, hKm}. */
export function look(sat, date, obs) {
  const pv = propagate(sat.rec, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const ecf = eciToEcf(pv.position, gstime(date));
  const la = ecfToLookAngles({ latitude: obs.lat * RAD, longitude: obs.lon * RAD, height: obs.hKm ?? 0 }, ecf);
  return { az: ((la.azimuth / RAD) + 360) % 360, el: la.elevation / RAD, rangeKm: la.rangeSat, eci: pv.position };
}

/**
 * Unit vector to the Sun in the equatorial frame of date (Astronomical
 * Almanac low-precision formulae, ~0.01°).
 */
export function sunVector(date) {
  const n = +date / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * RAD;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  return [Math.cos(lambda), Math.cos(eps) * Math.sin(lambda), Math.sin(eps) * Math.sin(lambda)];
}

/** Is a point (ECI km) in sunlight? Cylindrical shadow of radius RE behind Earth. */
export function sunlit(eci, date) {
  const s = sunVector(date);
  const d = eci.x * s[0] + eci.y * s[1] + eci.z * s[2];
  if (d > 0) return true;
  const px = eci.x - d * s[0]; const py = eci.y - d * s[1]; const pz = eci.z - d * s[2];
  return Math.hypot(px, py, pz) > RE_KM;
}

/**
 * Passes above minEl in the next `hours`.
 *
 * @returns {{rise: Date, peak: Date, set: Date, maxEl: number, peakAz: number, riseAz: number, setAz: number, visible: boolean}[]}
 */
export function passes(sat, obs, start = new Date(), hours = 24, minEl = 10, stepS = 20) {
  const elAt = (t) => look(sat, new Date(t), obs)?.el ?? -90;
  const cross = (t0, t1) => { // bisection to 1 s on the minEl crossing
    let a = t0; let b = t1; const up = elAt(a) < minEl;
    while (b - a > 1000) { const m = (a + b) / 2; if ((elAt(m) < minEl) === up) a = m; else b = m; }
    return (a + b) / 2;
  };
  const out = [];
  const t0 = +start; const t1 = t0 + hours * 3600000; const dt = stepS * 1000;
  let prev = elAt(t0); let cur = null;
  if (prev >= minEl) cur = { rise: t0, peak: t0, maxEl: prev };
  for (let t = t0 + dt; t <= t1; t += dt) {
    const el = elAt(t);
    if (prev < minEl && el >= minEl) cur = { rise: cross(t - dt, t), peak: t, maxEl: el };
    if (cur && el >= minEl && el > cur.maxEl) { cur.maxEl = el; cur.peak = t; }
    if (cur && prev >= minEl && el < minEl) { cur.set = cross(t - dt, t); out.push(finish(cur)); cur = null; }
    prev = el;
  }
  if (cur) { cur.set = t1; out.push(finish(cur)); }
  return out;

  function finish(p) {
    const peakLook = look(sat, new Date(p.peak), obs);
    const dark = sunAt(new Date(p.peak), obs.lat, obs.lon).geometricDeg < -6;
    return {
      rise: new Date(p.rise), peak: new Date(p.peak), set: new Date(p.set), maxEl: p.maxEl,
      riseAz: look(sat, new Date(p.rise), obs)?.az ?? null, peakAz: peakLook?.az ?? null, setAz: look(sat, new Date(p.set), obs)?.az ?? null,
      visible: dark && Boolean(peakLook && sunlit(peakLook.eci, new Date(p.peak))),
    };
  }
}

/** Geodetic → ECF km (for drawing ground points on the globe). */
export const groundEcf = (lat, lon, hKm = 0) => geodeticToEcf({ latitude: lat * RAD, longitude: lon * RAD, height: hKm });
