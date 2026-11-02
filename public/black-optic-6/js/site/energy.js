/**
 * Energy: what the roof could generate, and what the building loses to the
 * weather — from measured climate where the internet allows, a clear-sky
 * ceiling where it does not.
 *
 * Climate: Open-Meteo's historical archive (ERA5-based reanalysis, free, CC BY
 * 4.0) gives a full year of daily mean temperature and shortwave radiation for
 * the site. Radiation arrives in MJ/m² per day; 1 kWh = 3.6 MJ.
 *
 * Solar: peak power kWp = usable roof area × module power density
 * (0.20 kWp/m² for ~20 %-efficient modules at 1000 W/m²); annual yield =
 * kWp × annual horizontal irradiation (kWh/m², numerically equal to "peak sun
 * hours" per year) × performance ratio 0.80. Flat-plane, no tilt gain — a
 * conservative first look, not a design.
 *
 * Heat: the steady-state degree-day method. Heat-loss coefficient
 * UA = Σ Uᵢ·Aᵢ + ρc·n·V/3600 (ρc of air ≈ 1200 J/m³K → 0.333 W·h/m³K),
 * annual heating energy Q = UA·HDD·24/1000 kWh with HDD on an 18 °C base. The
 * U-values default to an uninsulated-to-modest farm building and are editable
 * assumptions, stated on the panel.
 *
 * @module black-optic-6/site/energy
 */

export const MJ_PER_KWH = 3.6;

/** Open-Meteo historical-archive URL for one calendar year. */
export function archiveUrl(lat, lon, year) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    start_date: `${year}-01-01`, end_date: `${year}-12-31`,
    daily: 'temperature_2m_mean,shortwave_radiation_sum', timezone: 'auto',
  });
  return `https://archive-api.open-meteo.com/v1/archive?${p}`;
}

/**
 * Degree days from daily mean temperatures.
 *
 * @param {number[]} means °C
 * @param {number} [base=18]
 */
export function degreeDays(means, base = 18) {
  let hdd = 0; let cdd = 0; let n = 0;
  for (const t of means) {
    if (!Number.isFinite(t)) continue;
    n += 1;
    if (t < base) hdd += base - t; else cdd += t - base;
  }
  return { hdd, cdd, days: n };
}

/**
 * Read an Open-Meteo archive response.
 *
 * @returns {{irradiationKWhM2: number, hdd: number, cdd: number, days: number, missingDays: number, meanTempC: number}}
 */
export function readArchive(json) {
  const t = json?.daily?.temperature_2m_mean ?? [];
  const sw = json?.daily?.shortwave_radiation_sum ?? [];
  const dd = degreeDays(t);
  let mj = 0; let swDays = 0;
  for (const v of sw) if (Number.isFinite(v)) { mj += v; swDays += 1; }
  // Scale a few missing days up to a full year rather than under-report it.
  const days = Math.max(t.length, sw.length);
  const irradiationKWhM2 = swDays ? (mj / MJ_PER_KWH) * (days / swDays) : NaN;
  const finite = t.filter(Number.isFinite);
  return {
    irradiationKWhM2, hdd: dd.hdd, cdd: dd.cdd, days, missingDays: days - Math.min(dd.days, swDays),
    meanTempC: finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : NaN,
  };
}

/** Rooftop PV potential. */
export function pvPotential({ roofM2, irradiationKWhM2, usable = 0.7, kWpPerM2 = 0.2, performanceRatio = 0.8 }) {
  const kWp = roofM2 * usable * kWpPerM2;
  return { kWp, kWhYear: kWp * irradiationKWhM2 * performanceRatio, usableM2: roofM2 * usable };
}

/** Default U-values, W/m²K: a modest farm building. */
export const U_DEFAULTS = Object.freeze({ wall: 0.6, roof: 0.4, floor: 0.5, ach: 0.5 });

/** Heat-loss coefficient UA in W/K. */
export function heatLossCoefficient({ wallM2, roofM2, floorM2, volumeM3 }, u = U_DEFAULTS) {
  const fabric = u.wall * wallM2 + u.roof * roofM2 + u.floor * floorM2;
  const ventilation = (1200 / 3600) * u.ach * volumeM3;
  return { ua: fabric + ventilation, fabric, ventilation };
}

/** Annual heating and cooling energy (thermal, before any heater or AC efficiency), kWh. */
export function annualLoads(ua, hdd, cdd) {
  return { heatKWh: (ua * hdd * 24) / 1000, coolKWh: (ua * cdd * 24) / 1000 };
}
