/**
 * The power grid around a place, from OpenStreetMap: transmission and
 * distribution lines with their voltages, substations, and power plants with
 * their fuel and rated output.
 *
 * Coverage is volunteers' mapping. High-voltage transmission in the United
 * States is mapped almost completely; local distribution lines and pole
 * transformers are mapped patchily. Absence on this map is not absence on
 * the ground, and every count says "mapped".
 *
 * @module black-optic-6/intel/grid
 */

import { haversineKm, segmentDistance, toLocal } from './geo.js';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Overpass QL for power infrastructure within radiusM of a point. */
export function powerQuery(lat, lon, radiusM) {
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:60];(way["power"~"^(line|minor_line|cable)$"]${around};way["power"~"^(substation|plant)$"]${around};node["power"~"^(substation|plant)$"]${around};);out tags geom;`;
}

/** "115000;12470" → [115, 12.47] kV. */
export function voltagesKv(tag) {
  return String(tag ?? '').split(/[;,]/).map((v) => Number(v.trim()) / 1000).filter((v) => Number.isFinite(v) && v > 0);
}

/** "50 MW", "1.2 GW", "800 kW", "yes" → megawatts or null. */
export function outputMW(tag) {
  const m = /^\s*([\d.]+)\s*(gw|mw|kw|w)?\s*$/i.exec(String(tag ?? ''));
  if (!m) return null;
  const v = Number(m[1]); const u = (m[2] ?? 'mw').toLowerCase();
  return u === 'gw' ? v * 1000 : u === 'kw' ? v / 1000 : u === 'w' ? v / 1e6 : v;
}

/** Voltage class names as US utilities use them. */
export function voltageClass(kv) {
  if (kv == null) return 'unknown';
  if (kv >= 500) return 'extra-high voltage';
  if (kv >= 230) return 'transmission';
  if (kv >= 69) return 'sub-transmission';
  return 'distribution';
}
export const CLASS_COLOURS = Object.freeze({ 'extra-high voltage': '#ff3b4e', transmission: '#ff9f43', 'sub-transmission': '#ffd166', distribution: '#4fe8ff', unknown: '#7f8c9a' });

const centroid = (pts) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length });

/**
 * @returns {{lines: object[], substations: object[], plants: object[]}}
 */
export function parsePower(json) {
  const lines = []; const substations = []; const plants = [];
  for (const e of Array.isArray(json?.elements) ? json.elements : []) {
    const t = e.tags ?? {};
    const pts = e.type === 'node' ? [{ lat: e.lat, lon: e.lon }] : (e.geometry ?? []).filter((p) => Number.isFinite(p.lat));
    if (!pts.length) continue;
    const kv = voltagesKv(t.voltage);
    if (/^(line|minor_line|cable)$/.test(t.power) && pts.length > 1) {
      let km = 0;
      for (let k = 1; k < pts.length; k += 1) km += haversineKm(pts[k - 1], pts[k]);
      const maxKv = kv.length ? Math.max(...kv) : null;
      lines.push({ id: e.id, kind: t.power, voltages: kv, maxKv, cls: voltageClass(maxKv ?? (t.power === 'minor_line' ? 12 : null)), operator: t.operator ?? '', name: t.name ?? t.ref ?? '', pts, km });
    } else if (t.power === 'substation') {
      substations.push({ id: e.id, name: t.name ?? '', operator: t.operator ?? '', voltages: kv, kind: t.substation ?? '', ...centroid(pts) });
    } else if (t.power === 'plant') {
      plants.push({ id: e.id, name: t.name ?? '', operator: t.operator ?? '', source: t['plant:source'] ?? t['generator:source'] ?? 'unknown', method: t['plant:method'] ?? '', mw: outputMW(t['plant:output:electricity']), ...centroid(pts) });
    }
  }
  return { lines, substations, plants };
}

/** Distance from a point to the nearest line (optionally ≥ minKv), km. */
export function nearestLine(lines, origin, minKv = 0) {
  let best = null;
  for (const l of lines) {
    if (minKv && !(l.maxKv >= minKv)) continue;
    const pts = l.pts.map((p) => toLocal(origin, p));
    for (let k = 1; k < pts.length; k += 1) {
      const d = segmentDistance([0, 0], pts[k - 1], pts[k]);
      if (!best || d < best.km) best = { km: d, line: l };
    }
  }
  return best;
}

/** Kilometres of mapped line by voltage class. */
export function kmByClass(lines) {
  const out = {};
  for (const l of lines) out[l.cls] = (out[l.cls] ?? 0) + l.km;
  return out;
}

/** Plants grouped by source with total mapped MW. */
export function plantsBySource(plants) {
  const out = {};
  for (const p of plants) {
    const g = (out[p.source] ??= { count: 0, mw: 0, unknownMw: 0 });
    g.count += 1;
    if (p.mw != null) g.mw += p.mw; else g.unknownMw += 1;
  }
  return out;
}
