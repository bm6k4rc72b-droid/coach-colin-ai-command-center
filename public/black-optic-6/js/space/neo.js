/**
 * Near-Earth objects: reading JPL's published data, and the arithmetic of
 * impact risk.
 *
 * Sources, all public and free:
 * - JPL CNEOS Sentry (ssd-api.jpl.nasa.gov/sentry.api): every object with a
 *   non-zero computed impact probability over the next century, from JPL's
 *   own orbit fits and Monte Carlo of each object's uncertainty.
 * - JPL close-approach data (cad.api): every predicted pass inside a distance
 *   cut, with the nominal, minimum and maximum (3-sigma) distance.
 * - JPL Small-Body Database (sbdb.api): osculating orbital elements.
 * - NASA NeoWs (api.nasa.gov): the same JPL data re-served with an API key,
 *   used when the JPL hosts refuse a browser's cross-origin request.
 *
 * Nothing here predicts an impact. The probabilities are JPL's. What this
 * module adds is the arithmetic that explains them — size from brightness,
 * energy from size and speed, and the Palermo scale from probability and
 * energy — each formula written out so it can be checked by hand.
 *
 * @module black-optic-6/space/neo
 */

import { AU_KM, LD_KM } from './kepler.js';

export const JPL = 'https://ssd-api.jpl.nasa.gov';
export const NEOWS = 'https://api.nasa.gov/neo/rest/v1';

const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/* ----------------------------------------------------------------- Sentry */

/**
 * Parse sentry.api summary mode.
 *
 * @returns {{des: string, name: string, ip: number, psCum: number, psMax: number, tsMax: number,
 *   nImp: number, range: string, firstYear: number|null, lastObs: string, h: number|null,
 *   diameterKm: number|null, vInf: number|null}[]} Sorted by Palermo (cumulative), highest first.
 */
export function parseSentry(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows.map((r) => {
    const range = String(r.range ?? '');
    return {
      des: String(r.des ?? ''),
      name: String(r.fullname ?? r.des ?? '').trim(),
      ip: num(r.ip),
      psCum: num(r.ps_cum),
      psMax: num(r.ps_max),
      tsMax: num(r.ts_max),
      nImp: num(r.n_imp),
      range,
      firstYear: num(range.split('-')[0]),
      lastObs: String(r.last_obs ?? ''),
      h: num(r.h),
      diameterKm: num(r.diameter),
      vInf: num(r.v_inf),
    };
  }).filter((r) => r.des).sort((a, b) => (b.psCum ?? -99) - (a.psCum ?? -99));
}

/** Parse sentry.api object mode (?des=…): the summary and each potential impact. */
export function parseSentryObject(json) {
  const s = json?.summary;
  if (!s) return null;
  return {
    des: String(s.des ?? ''), name: String(s.fullname ?? s.des ?? '').trim(),
    ip: num(s.ip), psCum: num(s.ps_cum), psMax: num(s.ps_max), tsMax: num(s.ts_max), nImp: num(s.n_imp),
    energyMt: num(s.energy), massKg: num(s.mass), diameterKm: num(s.diameter), vInf: num(s.v_inf), vImp: num(s.v_imp), h: num(s.h),
    impacts: (Array.isArray(json.data) ? json.data : []).map((d) => ({
      date: String(d.date ?? ''), ip: num(d.ip), ps: num(d.ps), ts: num(d.ts), energyMt: num(d.energy), sigma: num(d.sigma_imp ?? d.sigma_vi),
    })).sort((a, b) => (b.ip ?? 0) - (a.ip ?? 0)),
  };
}

/* ------------------------------------------------------- close approaches */

/**
 * Parse cad.api: rows of strings keyed by its own "fields" list.
 *
 * @returns {{des: string, name: string, jd: number, at: Date, distAu: number, minAu: number, maxAu: number,
 *   vRel: number, h: number|null, diameterKm: number|null}[]} In date order.
 */
export function parseCad(json) {
  const f = Array.isArray(json?.fields) ? json.fields : [];
  const ix = (k) => f.indexOf(k);
  const get = (row, k) => (ix(k) >= 0 ? row[ix(k)] : null);
  return (Array.isArray(json?.data) ? json.data : []).map((row) => {
    const jd = num(get(row, 'jd'));
    return {
      des: String(get(row, 'des') ?? ''),
      name: String(get(row, 'fullname') ?? get(row, 'des') ?? '').trim(),
      jd,
      at: jd != null ? new Date((jd - 2440587.5) * 86400000) : null,
      distAu: num(get(row, 'dist')), minAu: num(get(row, 'dist_min')), maxAu: num(get(row, 'dist_max')),
      vRel: num(get(row, 'v_rel')), h: num(get(row, 'h')), diameterKm: num(get(row, 'diameter')),
    };
  }).filter((r) => r.des && r.jd != null).sort((a, b) => a.jd - b.jd);
}

/** cad.api URL: Earth passes from now to +days, inside maxAu. */
export function cadUrl(days = 60, maxAu = 0.05) {
  return `${JPL}/cad.api?date-min=now&date-max=%2B${days}&dist-max=${maxAu}&fullname=true&diameter=true&sort=date`;
}

/* ---------------------------------------------------------------- orbits */

/**
 * Orbital elements from sbdb.api (?sstr=…).
 *
 * @returns {{a: number, e: number, i: number, om: number, w: number, ma: number, epoch: number, n: number|null,
 *   q: number|null, ad: number|null, name: string, moid: number|null}|null}
 */
export function parseSbdb(json) {
  const orbit = json?.orbit;
  if (!orbit || !Array.isArray(orbit.elements)) return null;
  const el = Object.fromEntries(orbit.elements.map((x) => [x.name, num(x.value)]));
  const epoch = num(orbit.epoch);
  if (![el.a, el.e, el.i, el.om, el.w, el.ma, epoch].every(Number.isFinite)) return null;
  return {
    a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, epoch, n: el.n ?? null, q: el.q ?? null, ad: el.ad ?? null,
    name: String(json.object?.fullname ?? '').trim(), moid: num(orbit.moid),
  };
}

/** Elements from a NeoWs object (/neo/{id}) — same quantities, different names. */
export function neowsElements(neo) {
  const o = neo?.orbital_data;
  if (!o) return null;
  const el = {
    a: num(o.semi_major_axis), e: num(o.eccentricity), i: num(o.inclination), om: num(o.ascending_node_longitude),
    w: num(o.perihelion_argument), ma: num(o.mean_anomaly), epoch: num(o.epoch_osculation), n: num(o.mean_motion),
    q: num(o.perihelion_distance), ad: num(o.aphelion_distance), name: String(neo.name ?? '').trim(), moid: num(o.minimum_orbit_intersection),
  };
  return [el.a, el.e, el.i, el.om, el.w, el.ma, el.epoch].every(Number.isFinite) ? el : null;
}

/** Close approaches from a NeoWs feed (/feed?start_date&end_date), as parseCad rows. */
export function parseNeowsFeed(json) {
  const out = [];
  for (const list of Object.values(json?.near_earth_objects ?? {})) {
    for (const neo of list) {
      for (const c of neo.close_approach_data ?? []) {
        if (c.orbiting_body && c.orbiting_body !== 'Earth') continue;
        const ms = num(c.epoch_date_close_approach);
        if (ms == null) continue;
        const d = neo.estimated_diameter?.kilometers;
        out.push({
          des: String(neo.designation ?? neo.name ?? neo.id ?? '').replace(/[()]/g, '').trim(),
          name: String(neo.name ?? '').trim(), neoId: String(neo.id ?? ''),
          jd: ms / 86400000 + 2440587.5, at: new Date(ms),
          distAu: num(c.miss_distance?.astronomical), minAu: null, maxAu: null,
          vRel: num(c.relative_velocity?.kilometers_per_second), h: num(neo.absolute_magnitude_h),
          diameterKm: d ? (num(d.estimated_diameter_min) + num(d.estimated_diameter_max)) / 2 : null,
          hazardous: Boolean(neo.is_potentially_hazardous_asteroid), sentry: Boolean(neo.is_sentry_object),
        });
      }
    }
  }
  return out.sort((a, b) => a.jd - b.jd);
}

/* ------------------------------------------------------------ arithmetic */

/**
 * Diameter from absolute magnitude: D = 1329 km / √p · 10^(−H/5)
 * (Fowler & Chillemi 1992; the CNEOS conversion). Albedo p is unknown for
 * most NEOs, so callers show the range p = 0.25 (bright, smaller) to 0.05
 * (dark, larger).
 */
export function diameterFromH(H, albedo = 0.14) {
  return (1329 / Math.sqrt(albedo)) * 10 ** (-H / 5);
}

/** Earth's escape speed at the surface, km/s. */
export const V_ESC = 11.186;

/**
 * Impact speed from speed at infinity: energy conservation in Earth's well,
 * v_imp = √(v∞² + v_esc²).
 */
export const impactSpeed = (vInf) => Math.sqrt(vInf * vInf + V_ESC * V_ESC);

/**
 * Kinetic energy of an impact, megatons of TNT (1 Mt = 4.184 × 10¹⁵ J).
 * Mass is a sphere of the given diameter at an assumed bulk density
 * (2,600 kg/m³, the value Sentry assumes for a stony asteroid).
 *
 * @param {number} dKm Diameter, km.
 * @param {number} vInfKms Speed at infinity, km/s.
 * @param {number} [density=2600] kg/m³.
 */
export function impactEnergyMt(dKm, vInfKms, density = 2600) {
  const r = (dKm * 1000) / 2;
  const m = density * (4 / 3) * Math.PI * r ** 3;
  const v = impactSpeed(vInfKms) * 1000;
  return (0.5 * m * v * v) / 4.184e15;
}

/**
 * Palermo Technical Impact Hazard Scale (Chesley et al. 2002):
 *   PS = log10( P_I / (f_B · ΔT) ),   f_B = 0.03 · E^(−4/5) per year,
 * where P_I is the impact probability, E the energy in megatons and ΔT the
 * years until the potential impact. PS < −2: no concern; −2 to 0: merits
 * monitoring; > 0: more likely than the background over the same years.
 */
export function palermo(ip, energyMt, yearsAhead) {
  const fB = 0.03 * energyMt ** -0.8;
  return Math.log10(ip / (fB * yearsAhead));
}

/** Background annual frequency of impacts at least this energetic (per year). */
export const backgroundRate = (energyMt) => 0.03 * energyMt ** -0.8;

/** Torino scale (0–10): its band, as the IAU publishes it. */
export function torino(ts) {
  if (ts == null) return { band: 'unknown', tone: 'muted', text: 'Not rated.' };
  if (ts === 0) return { band: 'white', tone: 'confirm', text: 'No hazard: likelihood of collision zero, or well below a random object of the same size.' };
  if (ts === 1) return { band: 'green', tone: 'confirm', text: 'Normal: a routine discovery; further observation will very likely rule it out.' };
  if (ts <= 4) return { band: 'yellow', tone: 'caution', text: 'Meriting attention by astronomers.' };
  if (ts <= 7) return { band: 'orange', tone: 'alert', text: 'Threatening.' };
  return { band: 'red', tone: 'alert', text: 'Certain collision.' };
}

/** Distance in the units people use: au, lunar distances, km. */
export function distances(au) {
  return { au, ld: (au * AU_KM) / LD_KM, km: au * AU_KM };
}

/** "1 in N" for a probability, rounded honestly. */
export function oneIn(p) {
  if (!(p > 0)) return '—';
  const n = 1 / p;
  if (n < 10) return `1 in ${n.toFixed(1)}`;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return `1 in ${(Math.round(n / mag) * mag).toLocaleString('en-US')}`;
}
