/**
 * Route-safety model. Scores each ~100 m segment of a walking/running/cycling
 * route from open data, then rolls the segments up into one route score.
 *
 * Inputs (all fetched live, no API key — see route.js):
 *   - OpenStreetMap ways along the route: highway class, surface, lit tag;
 *   - OSM street lamps and points of interest near each segment;
 *   - Copernicus 90 m DEM elevation (Open-Meteo) → grade;
 *   - current weather (Open-Meteo);
 *   - the sun's altitude at the departure time (NOAA solar position).
 *
 * The weights are a transparent heuristic, not a crime or injury dataset:
 * every factor is shown in the UI so the athlete can see *why* a segment is
 * amber. Thresholds follow the product spec: < 30 low, 30–70 moderate, > 70 high.
 *
 * @module vulture/risk
 */

export const WEIGHTS = Object.freeze({ lighting: 0.28, isolation: 0.18, surface: 0.16, slope: 0.14, traffic: 0.14, weather: 0.1 });

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rad = Math.PI / 180;

/**
 * Solar altitude (NOAA general solar position, ~0.5° accuracy).
 *
 * @param {Date} date Instant.
 * @param {number} lat Latitude (deg).
 * @param {number} lon Longitude (deg, east positive).
 * @returns {number} Altitude above the horizon in degrees.
 */
export function sunAltitude(date, lat, lon) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = Math.floor((date.getTime() - start) / 86_400_000) + 1;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eqTime + 4 * lon;
  const ha = (tst / 4 - 180) * rad;
  const cosZ = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / rad;
}

/**
 * Darkness in [0,1]: 0 in daylight (sun > +6°), 1 after civil dusk (< −6°).
 *
 * @param {number} altitude Sun altitude, degrees.
 * @returns {number} Darkness factor.
 */
export function darkness(altitude) {
  return clamp01((6 - altitude) / 12);
}

const SURFACE_RISK = {
  asphalt: 0, paved: 0, concrete: 0, 'concrete:plates': 0.05, paving_stones: 0.05, sett: 0.15, cobblestone: 0.25,
  metal: 0.2, wood: 0.2, compacted: 0.25, fine_gravel: 0.3, gravel: 0.5, pebblestone: 0.55, unpaved: 0.5,
  dirt: 0.5, earth: 0.5, ground: 0.5, grass: 0.65, sand: 0.7, mud: 0.85, rock: 0.6,
};
const HIGHWAY_SURFACE_GUESS = { path: 0.4, track: 0.45, bridleway: 0.45, footway: 0.08, cycleway: 0.05, steps: 0.6 };
const TRAFFIC = {
  motorway: 1, trunk: 0.85, primary: 0.65, secondary: 0.5, tertiary: 0.35, unclassified: 0.25,
  residential: 0.12, service: 0.15, living_street: 0.05, pedestrian: 0, footway: 0, path: 0, cycleway: 0.05,
  track: 0.05, steps: 0, bridleway: 0,
};

/** Map an OSM surface/highway pair to a surface-risk value and a display bucket. */
export function surfaceInfo(tags = {}) {
  const s = tags.surface;
  if (s && s in SURFACE_RISK) {
    const r = SURFACE_RISK[s];
    const bucket = r <= 0.05 ? 'Paved' : r <= 0.3 ? 'Packed / fine gravel' : r <= 0.55 ? 'Gravel / dirt' : 'Grass / sand / mud';
    return { risk: r, bucket };
  }
  const g = HIGHWAY_SURFACE_GUESS[tags.highway];
  if (g !== undefined) return { risk: g, bucket: g <= 0.1 ? 'Paved' : 'Unknown (path)' };
  return { risk: 0.05, bucket: 'Paved' };
}

/** Traffic exposure in [0,1]; separated footways/sidewalks reduce it. */
export function trafficExposure(tags = {}) {
  let r = TRAFFIC[tags.highway] ?? 0.2;
  if (tags.sidewalk && tags.sidewalk !== 'no' && tags.sidewalk !== 'none') r *= 0.4;
  if (tags.foot === 'designated') r *= 0.5;
  return r;
}

/**
 * Weather hazard in [0,1] from Open-Meteo current conditions.
 *
 * @param {{precipitation?:number, wind_speed_10m?:number, temperature_2m?:number, weather_code?:number}} w Weather.
 * @returns {number} Hazard.
 */
export function weatherHazard(w = {}) {
  const p = w.precipitation ?? 0;
  const wind = w.wind_speed_10m ?? 0;
  const temp = w.temperature_2m ?? 15;
  let h = clamp01(p / 4) * 0.6 + clamp01((wind - 25) / 35) * 0.3;
  if (temp <= 1 && p > 0) h += 0.5; // freezing precipitation: ice
  if (temp >= 32) h += clamp01((temp - 32) / 8) * 0.4; // heat stress
  if ([45, 48].includes(w.weather_code)) h += 0.2; // fog
  if ((w.weather_code ?? 0) >= 95) h += 0.4; // thunderstorm
  return clamp01(h);
}

/**
 * Score one segment.
 *
 * @param {object} seg Segment facts.
 * @param {number} seg.lengthM Segment length.
 * @param {number} seg.lamps Street lamps within 40 m.
 * @param {number} seg.pois Shops/amenities within 150 m.
 * @param {object} seg.tags Tags of the nearest OSM way.
 * @param {number} seg.grade Rise/run (signed).
 * @param {object} ctx Route context.
 * @param {number} ctx.dark Darkness 0..1.
 * @param {number} ctx.weather Weather hazard 0..1.
 * @returns {{score:number, factors:Record<string,number>}} 0–100 score and its factor breakdown (each 0..1).
 */
export function scoreSegment(seg, ctx) {
  const per100 = seg.lengthM > 0 ? (seg.lamps / seg.lengthM) * 100 : 0;
  const lit = seg.tags?.lit === 'yes' ? 1 : seg.tags?.lit === 'no' ? 0 : clamp01(per100 / 2.5);
  const poiDensity = seg.lengthM > 0 ? (seg.pois / seg.lengthM) * 100 : 0;
  const factors = {
    lighting: ctx.dark * (1 - lit),
    isolation: (1 - clamp01(poiDensity / 4)) * (0.35 + 0.65 * ctx.dark),
    surface: surfaceInfo(seg.tags).risk,
    slope: clamp01(Math.abs(seg.grade || 0) / 0.15),
    traffic: trafficExposure(seg.tags),
    weather: ctx.weather,
  };
  let s = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) s += w * factors[k];
  return { score: Math.round(100 * s), factors };
}

/** Risk band label for a 0–100 score. */
export function band(score) {
  if (score < 30) return 'LOW';
  if (score <= 70) return 'MODERATE';
  return 'HIGH';
}

/**
 * Roll segment scores into a route score: the length-weighted mean, pulled
 * toward the worst stretch, because one dark isolated underpass matters more
 * than its share of the distance.
 *
 * @param {{score:number,lengthM:number}[]} segs Scored segments.
 * @returns {number} 0–100.
 */
export function routeScore(segs) {
  const total = segs.reduce((a, s) => a + s.lengthM, 0);
  if (!total) return 0;
  const mean = segs.reduce((a, s) => a + s.score * s.lengthM, 0) / total;
  const sorted = [...segs].sort((a, b) => b.score - a.score);
  let acc = 0; let worst = 0;
  for (const s of sorted) { // mean of the worst 10 % of distance
    const take = Math.min(s.lengthM, total * 0.1 - acc);
    if (take <= 0) break;
    worst += s.score * take; acc += take;
  }
  worst /= acc || 1;
  return Math.round(0.7 * mean + 0.3 * worst);
}

/**
 * Elevation statistics.
 *
 * @param {number[]} elev Elevations (m).
 * @param {number[]} dist Cumulative distance (m), same length.
 * @returns {{min:number,max:number,ascent:number,descent:number,avgGrade:number,maxGrade:number}} Stats (grades in %).
 */
export function elevationStats(elev, dist) {
  let ascent = 0; let descent = 0; let gSum = 0; let gLen = 0; let gMax = 0;
  for (let i = 1; i < elev.length; i++) {
    const d = elev[i] - elev[i - 1];
    const run = dist[i] - dist[i - 1];
    if (d > 0) ascent += d; else descent -= d;
    if (run > 0) {
      const g = Math.abs(d / run);
      gSum += g * run; gLen += run; gMax = Math.max(gMax, g);
    }
  }
  return {
    min: Math.min(...elev), max: Math.max(...elev), ascent, descent,
    avgGrade: gLen ? (gSum / gLen) * 100 : 0, maxGrade: gMax * 100,
  };
}
