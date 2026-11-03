/**
 * Property intelligence from public records: what the neighbourhood's homes
 * are worth and rent for, who lives there, the flood zone and the ground
 * height — for any point in the United States.
 *
 * - Census tract: FCC Area API (the block, county and state for a point).
 * - Housing and income: US Census Bureau American Community Survey 5-year
 *   estimates for that tract, and its county for comparison. These are
 *   survey estimates with margins of error, published about a year behind,
 *   and are for the neighbourhood (a few thousand people), not a house.
 * - Flood: FEMA's National Flood Hazard Layer at the exact point.
 * - Elevation: USGS 3DEP via the Elevation Point Query Service.
 *
 * What this cannot honestly give: the value of a particular house (no open
 * sale-price data exists for most of the US), parcel lines, or ownership —
 * so it does not invent them.
 *
 * @module black-optic-6/intel/property
 */

export const ACS_YEAR = 2023;
export const ACS_VARS = Object.freeze({
  B25077_001E: 'medianValue', B25064_001E: 'medianRent', B19013_001E: 'medianIncome', B25035_001E: 'medianYearBuilt',
  B25003_001E: 'occupied', B25003_002E: 'ownerOccupied', B25002_001E: 'units', B25002_003E: 'vacant', B01003_001E: 'population',
});

export const fccUrl = (lat, lon) => `https://geo.fcc.gov/api/census/area?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&censusYear=2020&format=json`;
export function acsUrl(fips, level = 'tract') {
  const vars = ['NAME', ...Object.keys(ACS_VARS)].join(',');
  const base = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5?get=${vars}`;
  return level === 'tract'
    ? `${base}&for=tract:${fips.tract}&in=state:${fips.state}%20county:${fips.county}`
    : `${base}&for=county:${fips.county}&in=state:${fips.state}`;
}
export const femaUrl = (lat, lon) => `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${lon.toFixed(6)},${lat.toFixed(6)}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE&returnGeometry=false&f=json`;
export const elevationUrl = (lat, lon) => `https://epqs.nationalmap.gov/v1/json?x=${lon.toFixed(6)}&y=${lat.toFixed(6)}&wkid=4326&units=Meters&includeDate=false`;

/** FCC Area API → state, county and tract FIPS. */
export function parseFcc(json) {
  const r = json?.results?.[0];
  const block = String(r?.block_fips ?? '');
  if (block.length < 11) return null;
  return { state: block.slice(0, 2), county: block.slice(2, 5), tract: block.slice(5, 11), block, countyName: r.county_name ?? '', stateCode: r.state_code ?? '' };
}

/** ACS table response ([[header…], [values…]]) → named numbers; Census "not available" sentinels (≤ −222222222) become null. */
export function parseAcs(json) {
  if (!Array.isArray(json) || json.length < 2) return null;
  const [head, vals] = json;
  const out = { name: '' };
  head.forEach((h, k) => {
    if (h === 'NAME') out.name = vals[k];
    else if (ACS_VARS[h]) { const v = Number(vals[k]); out[ACS_VARS[h]] = Number.isFinite(v) && v > -1e8 ? v : null; }
  });
  return out;
}

/** Ratios people use to read a housing market. */
export function housingRatios(a) {
  const ok = (x) => Number.isFinite(x) && x > 0;
  return {
    priceToRent: ok(a.medianValue) && ok(a.medianRent) ? a.medianValue / (12 * a.medianRent) : null,
    grossYieldPct: ok(a.medianValue) && ok(a.medianRent) ? (1200 * a.medianRent) / a.medianValue : null,
    valueToIncome: ok(a.medianValue) && ok(a.medianIncome) ? a.medianValue / a.medianIncome : null,
    rentShareOfIncomePct: ok(a.medianRent) && ok(a.medianIncome) ? (1200 * a.medianRent) / a.medianIncome : null,
    ownerPct: ok(a.occupied) && Number.isFinite(a.ownerOccupied) ? (100 * a.ownerOccupied) / a.occupied : null,
    vacancyPct: ok(a.units) && Number.isFinite(a.vacant) ? (100 * a.vacant) / a.units : null,
  };
}

/**
 * Monthly principal and interest on a fixed-rate loan:
 *   M = L · i / (1 − (1 + i)^−n),  i = annual rate / 12, n = months.
 */
export function monthlyPayment(loan, annualRatePct, years = 30) {
  const n = years * 12; const i = annualRatePct / 1200;
  return i === 0 ? loan / n : (loan * i) / (1 - (1 + i) ** -n);
}

/** FEMA NFHL query → the flood zone at the point, in words. */
export function parseFema(json) {
  const a = json?.features?.[0]?.attributes;
  if (!a) return { zone: null, high: false, text: 'No FEMA flood zone is mapped at this point (unmapped, or the layer has no panel here).' };
  const zone = String(a.FLD_ZONE ?? '').trim();
  const sub = String(a.ZONE_SUBTY ?? '').trim();
  const high = a.SFHA_TF === 'T' || /^(A|V)/.test(zone);
  const bfe = Number(a.STATIC_BFE);
  let text;
  if (high) text = `Zone ${zone}: Special Flood Hazard Area — a 1 % or greater chance of flooding every year (26 % over a 30-year mortgage). Flood insurance is required for federally backed loans.${bfe > -9000 && bfe > 0 ? ` Base flood elevation ${bfe} ft.` : ''}`;
  else if (zone === 'X' && /0\.2/.test(sub)) text = 'Zone X (shaded): between the 1 % and 0.2 % annual-chance floodplains — moderate risk.';
  else if (zone === 'X') text = 'Zone X: outside the 0.2 % annual-chance floodplain — minimal mapped risk.';
  else if (zone === 'D') text = 'Zone D: possible but undetermined flood hazard; no analysis has been done.';
  else text = `Zone ${zone}${sub ? ` (${sub.toLowerCase()})` : ''}.`;
  return { zone, sub, high, text };
}

/** USGS EPQS → metres, or null where 3DEP has no data. */
export function parseElevation(json) {
  const v = Number(json?.value ?? json?.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation);
  return Number.isFinite(v) && v > -10000 ? v : null;
}
