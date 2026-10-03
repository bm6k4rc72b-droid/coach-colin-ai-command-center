// DROPZONE: LOMPOC · the map. A stylised Lompoc Valley and Vandenberg Space Force Base.
// World units are metres: x = east, z = south (north = −z), origin = Ocean Ave × H St in Old Town.
// Distances BETWEEN landmarks are compressed 4 : 1 from real geography so the whole valley, the
// coast and the launch complexes fit one match; buildings, roads and rockets are real size.
// Public geography only (towns, highways, river, beaches, the public launch pads); no facility detail.

export const SCALE = 4;
export const BOUNDS = { x0: -4600, x1: 1500, z0: -3300, z1: 2300 };

// ── Value noise (pure JS, deterministic) ──
function hash2(x, z) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const fade = (t) => t * t * (3 - 2 * t);
function noise2(x, z) { const xi = Math.floor(x), zi = Math.floor(z), u = fade(x - xi), v = fade(z - zi); const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function fbm2(x, z, oct = 4) { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, z * f); f *= 2.03; amp *= 0.5; } return s; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ── Coastline: x of the shore as a function of z (piecewise linear through real shore points ÷ 4) ──
const COAST = [[-3300, -3800], [-2000, -3520], [-1225, -3420], [200, -3620], [1650, -4080], [2300, -4260]];
export function coastX(z) {
  if (z <= COAST[0][0]) return COAST[0][1];
  for (let i = 1; i < COAST.length; i++) if (z <= COAST[i][0]) { const [z0, x0] = COAST[i - 1], [z1, x1] = COAST[i]; return lerp(x0, x1, (z - z0) / (z1 - z0)) - 40 * Math.sin(z / 260); }
  return COAST[COAST.length - 1][1];
}

// ── Santa Ynez River: from the east along the north edge of town, west to the sea at Surf ──
export const RIVER = [[1500, -560], [500, -640], [-300, -700], [-1200, -760], [-2200, -900], [-2900, -1080], [-3440, -1240]];
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); return [Math.hypot(px - ax - t * dx, pz - az - t * dz), t]; }
export function polyDist(poly, x, z) { let best = Infinity, at = 0, acc = 0; for (let i = 1; i < poly.length; i++) { const [d, t] = segDist(x, z, ...poly[i - 1], ...poly[i]); const L = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); if (d < best) { best = d; at = acc + t * L; } acc += L; } return [best, at, acc]; }
const riverBed = (s, total) => lerp(26, 0.5, s / total);   // the bed falls ~25 m from Lompoc to the sea

// ── Places (positions = real offsets from Old Town ÷ 4) ──
export const POIS = [
  { id: 'oldtown', x: 0, z: 0, r: 260 },
  { id: 'fields', x: -1350, z: -60, r: 420 },
  { id: 'airport', x: -160, z: -590, r: 260 },
  { id: 'river', x: 520, z: -610, r: 200 },
  { id: 'mission', x: 925, z: -800, r: 160 },
  { id: 'village', x: -150, z: -1925, r: 360 },
  { id: 'base', x: -2420, z: -2380, r: 420 },
  { id: 'airfield', x: -2900, z: -2500, r: 380 },
  { id: 'slc4', x: -3480, z: 200, r: 220 },
  { id: 'slc6', x: -3930, z: 1650, r: 240 },
  { id: 'surf', x: -3385, z: -1330, r: 200 },
];
export const POI = Object.fromEntries(POIS.map((p) => [p.id, p]));

// Flat build sites: circles (x, z, r) blended to a level height h (null = the natural height at the centre).
const FLATS = [
  { x: 0, z: 30, r: 760, h: 30 }, { x: -160, z: -590, r: 380, h: 28 }, { x: -1350, z: -60, r: 820, h: 34 },
  { x: 925, z: -800, r: 180, h: null }, { x: -150, z: -1925, r: 520, h: null }, { x: -2420, z: -2380, r: 640, h: 120 },
  { x: -2900, z: -2500, r: 820, h: 115 }, { x: -3480, z: 200, r: 230, h: 90 }, { x: -3930, z: 1650, r: 280, h: 110 }, { x: 520, z: -610, r: 150, h: null },
];

function rawHeight(x, z) {
  // Valley floor ~30 m, a coastal terrace ~90 m in the west, Burton Mesa / Purisima Hills to the north,
  // and the steep Lompoc / Santa Rita hills to the south.
  let h = 30 + 60 * sstep(-1200, -2600, x);
  h += 85 * sstep(-950, -1600, z) + 70 * sstep(-900, -1500, z) * sstep(200, 1200, x);
  h += 330 * sstep(700, 1800, z) * (0.55 + 0.45 * sstep(-3200, -1000, x));
  h += 120 * sstep(1000, 1500, x);
  const rough = 0.25 + 0.75 * Math.max(sstep(600, 1300, Math.abs(z - 0) + Math.max(0, -x - 2200) * 0.3), sstep(800, 1400, z));
  h += (fbm2(x * 0.0016, z * 0.0016, 5) - 0.5) * 110 * rough + (fbm2(x * 0.012, z * 0.012, 2) - 0.5) * 6;
  return h;
}
const flatH = FLATS.map((f) => f.h ?? rawHeight(f.x, f.z));
const TOTAL_RIVER = polyDist(RIVER, 0, 0)[2];

export function heightAt(x, z) {
  const cx = coastX(z), dc = x - cx;
  if (dc < -15) return -4 - Math.min(40, -dc * 0.04);                    // sea floor
  let h = rawHeight(x, z);
  for (let i = 0; i < FLATS.length; i++) { const f = FLATS[i], d = Math.hypot(x - f.x, z - f.z); if (d < f.r) h = lerp(h, flatH[i], 1 - sstep(f.r * 0.6, f.r, d)); }
  // River channel.
  const [dR, s] = polyDist(RIVER, x, z), bed = riverBed(s, TOTAL_RIVER);
  if (dR < 220) h = lerp(h, Math.min(h, bed + 3 + dR * 0.04), 1 - sstep(60, 220, dR));
  if (dR < 26) h = Math.min(h, bed - 1.5 + dR * 0.05);
  // Beach (2 m) then a bluff up to the terrace; low at the river mouth near Surf.
  const mouth = 1 - sstep(150, 420, Math.hypot(x - -3400, z - -1225));
  const top = lerp(h, Math.min(h, 6), mouth);
  if (dc < 45) return lerp(1.2, 2.2, Math.max(0, dc) / 45);
  if (dc < 140) return lerp(2.2, top, sstep(45, 140, dc));
  return lerp(h, top, 0);
}

// What covers the ground (for colours and spawning).
export function landUse(x, z) {
  const dc = x - coastX(z);
  if (dc < -15) return 'sea';
  if (dc < 50) return 'beach';
  if (polyDist(RIVER, x, z)[0] < 24) return 'water';
  if (polyDist(RIVER, x, z)[0] < 90) return 'riparian';
  if (Math.abs(x) < 560 && z > -520 && z < 560 && Math.hypot(x / 1.05, z) < 640) return 'city';
  if (x > -2000 && x < -620 && z > -420 && z < 330) return 'field';
  if (Math.hypot(x + 150, z + 1925) < 380) return 'village';
  if (Math.hypot(x + 2420, z + 2380) < 470) return 'base';
  if (z > 800 || fbm2(x * 0.004, z * 0.004, 3) > 0.58) return 'chaparral';
  return 'grass';
}
export const isLand = (x, z) => x - coastX(z) > 20;

// Roads (centre lines). Widths in metres.
export const ROADS = [
  { w: 22, pts: [[0, -560], [0, 640]] },                                     // H Street (Hwy 1 through town)
  { w: 22, pts: [[1480, 10], [-520, 0]] },                                    // Ocean Ave (Hwy 246)
  { w: 14, pts: [[-520, 0], [-1900, -60], [-2700, -500], [-3300, -1180]] },   // 246 west to Surf
  { w: 14, pts: [[0, -560], [-60, -1250], [-150, -1700], [-150, -2150], [-900, -2330], [-1950, -2380]] },   // Hwy 1 north
  { w: 10, pts: [[-1900, -60], [-2600, 120], [-3330, 210]] },                 // coast road to SLC-4
  { w: 10, pts: [[-3330, 210], [-3600, 900], [-3830, 1600]] },                 // to SLC-6
  { w: 10, pts: [[560, -10], [700, -420], [925, -760]] },                     // to the Mission
];
export const RAIL = (() => { const p = []; for (let z = -3300; z <= 2300; z += 100) p.push([coastX(z) + 230, z]); return p; })();

// Deterministic RNG (mulberry32).
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
