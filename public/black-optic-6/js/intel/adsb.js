/**
 * Aircraft around the ranch, from ADS-B: the position reports aircraft
 * broadcast in the clear and volunteer receivers relay to open networks.
 *
 * Sources, tried in order: OpenSky Network (research network, anonymous
 * quota of a few hundred requests a day), adsb.lol and airplanes.live (both
 * open, unfiltered feeds in the readsb "v2" format). Positions are the
 * aircraft's own GPS reports — Linked, not measured here. Aircraft that do not
 * broadcast (many military, some private, anything with its transponder off)
 * are simply absent, so an empty sky on this map is not an empty sky.
 *
 * @module black-optic-6/intel/adsb
 */

import { bbox, bearingDeg, elevationDeg, haversineKm } from './geo.js';

export const FT = 0.3048;
export const KT = 1852 / 3600; // m/s per knot, exact
export const FPM = FT / 60;

export const openskyUrl = (o, km) => { const b = bbox(o, km); return `https://opensky-network.org/api/states/all?lamin=${b.lamin.toFixed(4)}&lomin=${b.lomin.toFixed(4)}&lamax=${b.lamax.toFixed(4)}&lomax=${b.lomax.toFixed(4)}`; };
const nm = (km) => Math.min(250, Math.max(1, Math.round(km / 1.852)));
export const adsbLolUrl = (o, km) => `https://api.adsb.lol/v2/point/${o.lat.toFixed(4)}/${o.lon.toFixed(4)}/${nm(km)}`;
export const airplanesLiveUrl = (o, km) => `https://api.airplanes.live/v2/point/${o.lat.toFixed(4)}/${o.lon.toFixed(4)}/${nm(km)}`;

/** OpenSky /states/all → aircraft (SI units). */
export function parseOpenSky(json) {
  const now = Number(json?.time) || null;
  return (Array.isArray(json?.states) ? json.states : []).map((s) => ({
    icao: String(s[0] ?? '').toLowerCase(), callsign: String(s[1] ?? '').trim(), country: String(s[2] ?? ''),
    lon: s[5], lat: s[6], altM: s[13] ?? s[7], baroM: s[7], onGround: Boolean(s[8]),
    speedMs: s[9], trackDeg: s[10], vrateMs: s[11], squawk: s[14] ? String(s[14]) : null,
    ageS: now && s[3] ? now - s[3] : null, type: null, reg: null, military: false, source: 'OpenSky',
  })).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
}

/** readsb v2 (adsb.lol, airplanes.live) → aircraft (SI units). */
export function parseReadsb(json, source = 'adsb.lol') {
  return (Array.isArray(json?.ac) ? json.ac : []).map((a) => {
    const ground = a.alt_baro === 'ground';
    const baro = ground ? 0 : Number.isFinite(a.alt_baro) ? a.alt_baro * FT : null;
    const geom = Number.isFinite(a.alt_geom) ? a.alt_geom * FT : null;
    return {
      icao: String(a.hex ?? '').replace(/^~/, '').toLowerCase(), callsign: String(a.flight ?? '').trim(), country: '',
      lat: a.lat, lon: a.lon, altM: geom ?? baro, baroM: baro, onGround: ground,
      speedMs: Number.isFinite(a.gs) ? a.gs * KT : null, trackDeg: Number.isFinite(a.track) ? a.track : null,
      vrateMs: Number.isFinite(a.baro_rate ?? a.geom_rate) ? (a.baro_rate ?? a.geom_rate) * FPM : null,
      squawk: a.squawk ? String(a.squawk) : null, ageS: Number.isFinite(a.seen_pos) ? a.seen_pos : null,
      type: a.t ? String(a.t) : null, reg: a.r ? String(a.r) : null, desc: a.desc ? String(a.desc) : null,
      military: Boolean((a.dbFlags ?? 0) & 1), source,
    };
  }).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
}

/** Emergency squawk codes (ICAO). */
export const SQUAWKS = Object.freeze({ 7500: 'unlawful interference (hijack)', 7600: 'radio failure', 7700: 'general emergency' });

/**
 * Range, bearing and look angle from the observer; alerts that matter on a
 * ranch: an emergency squawk anywhere in range, or anything low and close.
 *
 * @param {object} a From parseOpenSky / parseReadsb.
 * @param {{lat: number, lon: number, elevM?: number}} obs
 */
export function relate(a, obs, { lowM = 300, closeKm = 3 } = {}) {
  const km = haversineKm(obs, a);
  const aglM = a.altM != null ? a.altM - (obs.elevM ?? 0) : null;
  const elev = aglM != null ? elevationDeg(km, aglM / 1000) : null;
  const slantKm = aglM != null ? Math.hypot(km, aglM / 1000) : null;
  const alerts = [];
  if (a.squawk && SQUAWKS[a.squawk]) alerts.push(`squawking ${a.squawk}: ${SQUAWKS[a.squawk]}`);
  if (!a.onGround && aglM != null && aglM < lowM && km < closeKm) alerts.push(`low and close: ${Math.round(aglM)} m above the ranch's ground, ${km.toFixed(1)} km away`);
  return { ...a, km, bearing: bearingDeg(obs, a), elevDeg: elev, slantKm, aglM, alerts };
}
