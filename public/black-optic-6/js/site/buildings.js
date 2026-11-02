/**
 * Buildings from open data, in metres.
 *
 * "Scan any building from official data" without a subscription means reading
 * the open building layers: OpenStreetMap (footprints, and height or levels
 * where mappers recorded them), Microsoft's Global ML Building Footprints
 * (GeoJSON with a model-estimated height), or the ranch twin's own layout.
 * Everything is brought into one shape: a footprint ring in local metres
 * (x east, y north) around the site origin, a height, and where that height
 * came from — because a height read off a "height=8.5" tag and one assumed
 * from "building=barn" deserve different confidence, and the panels say which.
 *
 * Local metres use the WGS 84 meridian and parallel arc lengths per degree
 * at the site latitude; over a few hundred metres the error of this local
 * tangent-plane approximation is far below the accuracy of any footprint.
 *
 * @module black-optic-6/site/buildings
 */

const RAD = Math.PI / 180;

/** Metres per degree of latitude at φ (WGS 84 series). */
export function metresPerDegLat(latDeg) {
  const p = latDeg * RAD;
  return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
}

/** Metres per degree of longitude at φ (WGS 84 series). */
export function metresPerDegLon(latDeg) {
  const p = latDeg * RAD;
  return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
}

/** [lat, lon] → [x east, y north] metres about an origin. */
export function toLocal(origin, lat, lon) {
  return [(lon - origin.lon) * metresPerDegLon(origin.lat), (lat - origin.lat) * metresPerDegLat(origin.lat)];
}

/** [x, y] metres → {lat, lon}. */
export function fromLocal(origin, x, y) {
  return { lat: origin.lat + y / metresPerDegLat(origin.lat), lon: origin.lon + x / metresPerDegLon(origin.lat) };
}

/* ----------------------------------------------------------- geometry */

/** Signed area (shoelace); positive when counter-clockwise. Ring may be closed or open. */
export function signedArea(ring) {
  let s = 0;
  const n = ring.length - (samePoint(ring[0], ring[ring.length - 1]) ? 1 : 0);
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Perimeter of a ring. */
export function perimeter(ring) {
  let s = 0;
  const n = ring.length - (samePoint(ring[0], ring[ring.length - 1]) ? 1 : 0);
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % n];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

/** Area centroid of a ring. */
export function centroid(ring) {
  const n = ring.length - (samePoint(ring[0], ring[ring.length - 1]) ? 1 : 0);
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % n];
    const c = x1 * y2 - x2 * y1;
    a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  if (Math.abs(a) < 1e-12) return ring[0].slice();
  return [cx / (3 * a), cy / (3 * a)];
}

function samePoint(a, b) {
  return a && b && Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
}

/** Open ring (no repeated closing point), counter-clockwise. */
export function normaliseRing(ring, ccw = true) {
  const r = samePoint(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
  if ((signedArea(r) > 0) !== ccw) r.reverse();
  return r;
}

/** Even–odd point-in-ring. */
export function pointInRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the footprint: in the outer ring and in no hole. */
export function inFootprint(p, b) {
  return pointInRing(p, b.outer) && !b.holes.some((h) => pointInRing(p, h));
}

/* ------------------------------------------------------------ heights */

/** Storey height assumed when only a level count is known, metres. */
export const STOREY_M = 3;

/**
 * Parse an OSM length: "12", "12 m", "12.5m", "40'", "40 ft", "12'6\"".
 *
 * @returns {number|null} Metres.
 */
export function parseLength(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase().replace(',', '.');
  let m = /^(-?\d+(?:\.\d+)?)\s*(m|metres?|meters?)?$/.exec(s);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in))?$/.exec(s);
  if (m) return Number(m[1]) * 0.3048 + (m[2] ? Number(m[2]) * 0.0254 : 0);
  m = /^(\d+(?:\.\d+)?)\s*(?:"|in)$/.exec(s);
  if (m) return Number(m[1]) * 0.0254;
  return null;
}

/** Typical heights when nothing was mapped. Assumptions, labelled as such. */
export const TYPE_DEFAULTS = Object.freeze({
  house: 6, detached: 6, residential: 6, farm: 6, bungalow: 4, cabin: 4,
  barn: 8, farm_auxiliary: 6, stable: 5, cowshed: 5, sty: 3, greenhouse: 4, silo: 12,
  shed: 3, garage: 3, garages: 3, carport: 3, hut: 3, roof: 4,
  apartments: 12, commercial: 10, retail: 6, office: 12, industrial: 9, warehouse: 9,
  church: 12, school: 9, hospital: 15, hotel: 15, yes: 6,
});

/**
 * A building's height from its tags.
 *
 * @param {Record<string, string>} tags
 * @returns {{heightM: number, minHeightM: number, levels: number|null, source: 'height tag'|'levels tag'|'type default'}}
 */
export function heightOf(tags = {}) {
  const minHeightM = parseLength(tags.min_height) ?? (tags['building:min_level'] ? Number(tags['building:min_level']) * STOREY_M : 0);
  const levelsTag = tags['building:levels'] != null ? Number(tags['building:levels']) : null;
  const roofLevels = tags['roof:levels'] != null ? Number(tags['roof:levels']) : 0;
  const levels = Number.isFinite(levelsTag) ? levelsTag : null;
  const h = parseLength(tags.height) ?? parseLength(tags['building:height']);
  if (h != null && h > minHeightM) return { heightM: h, minHeightM, levels, source: 'height tag' };
  if (levels != null && levels > 0) {
    const roof = parseLength(tags['roof:height']) ?? (Number.isFinite(roofLevels) ? roofLevels * STOREY_M : 0);
    return { heightM: levels * STOREY_M + roof, minHeightM, levels, source: 'levels tag' };
  }
  return { heightM: TYPE_DEFAULTS[tags.building] ?? TYPE_DEFAULTS.yes, minHeightM, levels: null, source: 'type default' };
}

/* ---------------------------------------------------------- buildings */

/**
 * The one building shape the site deck uses.
 *
 * @typedef {object} Building
 * @property {string} id
 * @property {string} name
 * @property {string} kind building=* value or twin type
 * @property {number[][]} outer CCW ring, local metres
 * @property {number[][][]} holes CW rings
 * @property {number} heightM
 * @property {number} minHeightM
 * @property {number|null} levels
 * @property {string} source Where the height came from.
 * @property {Record<string, string>} tags
 */

function makeBuilding(id, tags, outer, holes, h, origin = 'osm') {
  return {
    id: String(id), name: tags.name || tags['addr:housename'] || [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || '',
    kind: tags.building || 'yes', outer: normaliseRing(outer, true), holes: holes.map((r) => normaliseRing(r, false)),
    heightM: h.heightM, minHeightM: h.minHeightM, levels: h.levels, source: h.source, tags, origin,
  };
}

/** Overpass QL for every building in a box (south, west, north, east), with inline geometry. */
export function overpassQuery([south, west, north, east]) {
  const b = [south, west, north, east].map((v) => v.toFixed(6)).join(',');
  return `[out:json][timeout:25];(way["building"](${b});relation["building"]["type"="multipolygon"](${b}););out geom;`;
}

/** Public Overpass endpoints, tried in order. */
export const OVERPASS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]);

/** Join way segments (arrays of points) into closed rings by matching endpoints. */
export function stitch(segments) {
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const pool = segments.map((s) => s.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i += 1) {
        const s = pool[i];
        const end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) ring = ring.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

/**
 * Overpass JSON (out geom) → buildings in local metres.
 *
 * @param {object} json
 * @param {{lat: number, lon: number}} origin
 * @returns {Building[]}
 */
export function fromOverpass(json, origin) {
  const out = [];
  const local = (g) => toLocal(origin, g.lat, g.lon);
  for (const el of json?.elements ?? []) {
    const tags = el.tags ?? {};
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 4) {
      const ring = el.geometry.map(local);
      if (Math.abs(signedArea(ring)) > 1) out.push(makeBuilding(`way/${el.id}`, tags, ring, [], heightOf(tags)));
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const seg = (role) => el.members.filter((m) => m.type === 'way' && (m.role || 'outer') === role && m.geometry).map((m) => m.geometry.map(local));
      const outers = stitch(seg('outer'));
      const inners = stitch(seg('inner'));
      for (const o of outers) {
        const holes = inners.filter((h) => pointInRing(h[0], o));
        out.push(makeBuilding(`relation/${el.id}${outers.length > 1 ? `#${outers.indexOf(o)}` : ''}`, tags, o, holes, heightOf(tags)));
      }
    }
  }
  return out;
}

/**
 * GeoJSON building footprints (Microsoft Global ML Building Footprints, or any
 * export) → buildings. A "height" property ≥ 0 is used; Microsoft writes −1
 * where it has no estimate.
 */
export function fromGeoJSON(geojson, origin) {
  const features = geojson?.type === 'FeatureCollection' ? geojson.features : [geojson];
  const out = [];
  features.forEach((f, i) => {
    const g = f?.geometry; const p = f?.properties ?? {};
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const [outer, ...holes] = poly.map((ring) => ring.map(([lon, lat]) => toLocal(origin, lat, lon)));
      if (!outer || Math.abs(signedArea(outer)) < 1) continue;
      const tags = Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)]));
      const hp = Number(p.height);
      const h = Number.isFinite(hp) && hp > 0
        ? { heightM: hp, minHeightM: 0, levels: null, source: p.confidence != null || 'release' in p ? 'model estimate (Microsoft)' : 'height property' }
        : heightOf({ building: p.building ?? 'yes', ...tags });
      out.push(makeBuilding(f.id ?? `feature/${i}`, { building: 'yes', ...tags }, outer, holes, h, 'geojson'));
    }
  });
  return out;
}

/** The ranch twin's solid structures as buildings (twin x east, z south; north is −z). */
export function fromTwin(layout, types) {
  const out = [];
  for (const o of layout?.objects ?? []) {
    const t = types[o.type];
    if (!t || !t.solid || o.type === 'tree') continue;
    const c = Math.cos(-(o.rot || 0)); const s = Math.sin(-(o.rot || 0));
    const hw = t.w / 2; const hd = t.d / 2;
    const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [o.x + x * c - z * s, -(o.z + x * s + z * c)]);
    out.push(makeBuilding(o.id, { building: o.type, name: t.label }, ring, [], { heightM: t.h, minHeightM: 0, levels: null, source: 'twin layout' }, 'twin'));
  }
  return out;
}

/** Kinds that are one tall storey unless mappers said otherwise (barn, shed, silo…). */
export const SINGLE_STOREY = new Set(['barn', 'farm_auxiliary', 'stable', 'cowshed', 'sty', 'greenhouse', 'silo', 'shed', 'garage', 'garages', 'carport', 'hut', 'roof', 'warehouse', 'industrial', 'church', 'sports_hall', 'hangar', 'tank', 'storage_tank', 'water_tower']);

/**
 * Everything the panels report about one building's shape.
 *
 * @param {Building} b
 */
export function metrics(b) {
  const area = Math.abs(signedArea(b.outer)) - b.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
  const per = perimeter(b.outer) + b.holes.reduce((s, h) => s + perimeter(h), 0);
  const tall = Math.max(0, b.heightM - b.minHeightM);
  const floors = b.levels ?? (SINGLE_STOREY.has(b.kind) ? 1 : Math.max(1, Math.round(tall / STOREY_M)));
  return {
    footprintM2: area, perimeterM: per, heightM: b.heightM, wallM2: per * tall, volumeM3: area * tall,
    floors, grossFloorM2: area * floors, centroid: centroid(b.outer),
  };
}

/** Bounds of a set of buildings, padded. */
export function bounds(buildings, pad = 20) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const b of buildings) for (const [x, y] of b.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (!Number.isFinite(x0)) return { x0: -50, y0: -50, x1: 50, y1: 50 };
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
