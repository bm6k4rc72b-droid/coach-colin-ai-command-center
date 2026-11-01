/**
 * Sentinel-2 over your ranch, computed in the browser: NDVI, a moisture
 * index, the worst cells, and a cache that survives going offline.
 *
 * TorchGeo is a PyTorch library for training models on satellite imagery; it
 * runs on a workstation, not a phone. What the ranch actually needs from it —
 * "where is the pasture greenest, where is it drying out" — is two band
 * ratios over public data, which a browser can do directly:
 *
 * 1. Search Element 84's Earth Search STAC API for Sentinel-2 L2A scenes over
 *    the ranch, newest first, below a cloud cap.
 * 2. Read just the ranch's window out of the red (B04), near-infrared (B08),
 *    SWIR (B11) and scene-classification (SCL) Cloud-Optimised GeoTIFFs on
 *    AWS, with HTTP range requests (geotiff.js). The tiles are in UTM, so the
 *    ranch's lat/lon box is projected first — the Krüger series below, good
 *    to well under a millimetre inside a zone.
 * 3. Convert digital numbers to reflectance (ρ = DN·scale + offset; for
 *    processing baseline 04.00+ that is DN/10000 − 0.1 — getting the offset
 *    wrong biases NDVI, which is why it is read from the item, not assumed).
 * 4. Mask cloud, shadow, cirrus and no-data with SCL; compute
 *    NDVI = (ρnir − ρred)/(ρnir + ρred) and NDMI = (ρnir − ρswir)/(ρnir + ρswir).
 *
 * "Fire risk" here is a dryness reading from NDMI and NDVI, labelled Modelled
 * — the official danger ratings (NFDRS, the Canadian FWI) need weather and
 * fuel models this console does not have.
 *
 * @module black-optic-6/ai/ndvi
 */

export const STAC_URL = 'https://earth-search.aws.element84.com/v1/search';
export const COLLECTION = 'sentinel-2-l2a';

/* --------------------------------------------------------------- UTM */

const A_WGS84 = 6378137;
const F_WGS84 = 1 / 298.257223563;
const K0 = 0.9996;

/** UTM zone for a position, with the Norway and Svalbard exceptions. */
export function utmZone(lat, lon) {
  let zone = Math.floor((((lon + 180) % 360) + 360) % 360 / 6) + 1;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31;
    else if (lon >= 9 && lon < 21) zone = 33;
    else if (lon >= 21 && lon < 33) zone = 35;
    else if (lon >= 33 && lon < 42) zone = 37;
  }
  return zone;
}

/** EPSG code of a WGS 84 / UTM zone. */
export function epsgFor(zone, north = true) {
  return (north ? 32600 : 32700) + zone;
}

/**
 * Geographic → UTM, Krüger n-series to sixth order (Karney 2011).
 *
 * @param {number} lat Degrees.
 * @param {number} lon Degrees.
 * @param {number} [zone] Force a zone (Sentinel-2 tiles carry their own).
 * @param {boolean} [north] Hemisphere of the target CRS; defaults to lat ≥ 0.
 * @returns {{easting: number, northing: number, zone: number, north: boolean}}
 */
export function toUtm(lat, lon, zone = utmZone(lat, lon), north = lat >= 0) {
  const n = F_WGS84 / (2 - F_WGS84);
  const n2 = n * n; const n3 = n2 * n; const n4 = n3 * n; const n5 = n4 * n; const n6 = n5 * n;
  const A = (A_WGS84 / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  const alpha = [
    n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
    (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
    (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
    (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
    (212378941 * n6) / 319334400,
  ];
  const phi = (lat * Math.PI) / 180;
  const lambda = ((lon - (zone * 6 - 183)) * Math.PI) / 180;
  const e = (2 * Math.sqrt(n)) / (1 + n);
  const sin = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sin) - e * Math.atanh(e * sin));
  const xiP = Math.atan2(t, Math.cos(lambda));
  const etaP = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xiP; let eta = etaP;
  for (let j = 1; j <= 6; j += 1) {
    xi += alpha[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += alpha[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  return { easting: 500000 + K0 * A * eta, northing: (north ? 0 : 10000000) + K0 * A * xi, zone, north };
}

/** The UTM box that covers a lat/lon box (all four corners projected). */
export function utmBox([west, south, east, north], zone, isNorth) {
  const corners = [[south, west], [south, east], [north, west], [north, east]].map(([la, lo]) => toUtm(la, lo, zone, isNorth));
  return {
    minE: Math.min(...corners.map((c) => c.easting)), maxE: Math.max(...corners.map((c) => c.easting)),
    minN: Math.min(...corners.map((c) => c.northing)), maxN: Math.max(...corners.map((c) => c.northing)),
  };
}

/** A lat/lon box of half-width `radiusM` metres around a point. */
export function boxAround(lat, lon, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/* ------------------------------------------------------------- STAC */

/** POST body for the newest clear scenes over a box. */
export function stacSearch(bbox, { days = 45, maxCloud = 30, limit = 6, now = new Date() } = {}) {
  const from = new Date(now.getTime() - days * 86400e3);
  return {
    collections: [COLLECTION], bbox, limit,
    datetime: `${from.toISOString()}/${now.toISOString()}`,
    query: { 'eo:cloud_cover': { lt: maxCloud } },
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
  };
}

/** Asset keys Earth Search v1 uses (common names), with the band-number fallback. */
export const ASSETS = Object.freeze({ red: ['red', 'B04'], nir: ['nir', 'B08'], swir: ['swir16', 'B11'], scl: ['scl', 'SCL'] });

/** Find an asset by any of its names. */
export function assetOf(item, role) {
  for (const key of ASSETS[role]) if (item?.assets?.[key]) return item.assets[key];
  return null;
}

/**
 * DN → reflectance scale and offset for an asset.
 *
 * @returns {{scale: number, offset: number, source: string}}
 */
export function scaling(item, asset) {
  const band = asset?.['raster:bands']?.[0];
  if (band && Number.isFinite(band.scale)) return { scale: band.scale, offset: band.offset ?? 0, source: 'item raster:bands' };
  const baseline = parseFloat(item?.properties?.['s2:processing_baseline'] ?? '0');
  return { scale: 1e-4, offset: baseline >= 4 ? -0.1 : 0, source: `processing baseline ${baseline || 'unknown'}` };
}

/** The item's UTM EPSG code. */
export function epsgOf(item) {
  const p = item?.properties ?? {};
  const code = p['proj:epsg'] ?? (typeof p['proj:code'] === 'string' ? Number(p['proj:code'].split(':')[1]) : null);
  return Number.isFinite(code) ? code : null;
}

/* ---------------------------------------------------------- indices */

/** SCL classes kept: dark area, vegetation, bare soil, water, unclassified, snow. */
export const SCL_CLEAR = new Set([2, 4, 5, 6, 7, 11]);
export const SCL_NAMES = Object.freeze({ 0: 'no data', 1: 'saturated', 2: 'dark area', 3: 'cloud shadow', 4: 'vegetation', 5: 'bare soil', 6: 'water', 7: 'unclassified', 8: 'cloud (medium)', 9: 'cloud (high)', 10: 'cirrus', 11: 'snow' });

/** Normalised difference of two reflectances; NaN when the sum is not positive. */
export function normDiff(a, b) {
  const s = a + b;
  return s > 0 ? (a - b) / s : NaN;
}

/**
 * Indices over a window. Bands can be at different resolutions (B04/B08 at
 * 10 m, B11/SCL at 20 m); 20 m rasters are sampled nearest-neighbour onto the
 * 10 m grid.
 *
 * @param {object} r
 * @param {ArrayLike<number>} r.red
 * @param {ArrayLike<number>} r.nir
 * @param {ArrayLike<number>|null} r.swir
 * @param {ArrayLike<number>|null} r.scl
 * @param {number} r.width 10 m grid width.
 * @param {number} r.height
 * @param {number} [r.coarseWidth] 20 m grid width (≈ width/2).
 * @param {number} [r.coarseHeight]
 * @param {number[]} [r.fineOrigin] [col, row] of the 10 m window inside its tile. Sentinel-2's
 *   10 m and 20 m grids share the tile's corner, so 10 m pixel (c, r) lies exactly in 20 m
 *   pixel (⌊c/2⌋, ⌊r/2⌋); with this given, the 20 m window is taken to start at
 *   (⌊col/2⌋, ⌊row/2⌋) and every lookup is exact. Without it, proportional mapping.
 * @param {{scale: number, offset: number}} r.cal DN → reflectance.
 * @returns {{ndvi: Float32Array, ndmi: Float32Array|null, clearFraction: number, width: number, height: number}}
 */
export function indices({ red, nir, swir = null, scl = null, width, height, coarseWidth, coarseHeight, fineOrigin = null, cal }) {
  const ndvi = new Float32Array(width * height).fill(NaN);
  const ndmi = swir ? new Float32Array(width * height).fill(NaN) : null;
  const cw = coarseWidth ?? Math.ceil(width / 2); const ch = coarseHeight ?? Math.ceil(height / 2);
  const coarse = fineOrigin
    ? (x, y) => {
      const cx = Math.floor((fineOrigin[0] + x) / 2) - Math.floor(fineOrigin[0] / 2);
      const cy = Math.floor((fineOrigin[1] + y) / 2) - Math.floor(fineOrigin[1] / 2);
      return Math.min(ch - 1, cy) * cw + Math.min(cw - 1, cx);
    }
    : (x, y) => Math.min(ch - 1, Math.floor((y * ch) / height)) * cw + Math.min(cw - 1, Math.floor((x * cw) / width));
  const rho = (dn) => dn * cal.scale + cal.offset;
  let clear = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (red[i] === 0 && nir[i] === 0) continue; // no-data fill
      const c = coarse(x, y);
      if (scl && !SCL_CLEAR.has(scl[c])) continue;
      clear += 1;
      const r = rho(red[i]); const n = rho(nir[i]);
      ndvi[i] = normDiff(n, r);
      if (ndmi) ndmi[i] = normDiff(n, rho(swir[c]));
    }
  }
  return { ndvi, ndmi, clearFraction: clear / (width * height), width, height };
}

/**
 * Mean of an index per grid cell, and the worst cells first.
 *
 * @returns {{cells: {col: number, row: number, mean: number, valid: number}[], worst: object[]}}
 */
export function cellStats(values, width, height, cols = 6, rows = 6) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor((c * width) / cols); const x1 = Math.floor(((c + 1) * width) / cols);
      const y0 = Math.floor((r * height) / rows); const y1 = Math.floor(((r + 1) * height) / rows);
      let s = 0; let k = 0; let total = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        total += 1;
        const v = values[y * width + x];
        if (Number.isFinite(v)) { s += v; k += 1; }
      }
      cells.push({ col: c, row: r, mean: k ? s / k : NaN, valid: total ? k / total : 0 });
    }
  }
  const worst = cells.filter((c) => c.valid >= 0.5 && Number.isFinite(c.mean)).sort((a, b) => a.mean - b.mean);
  return { cells, worst };
}

/**
 * Dryness reading for a cell. Modelled: thresholds are common rules of thumb
 * for grassland, not a fire-danger rating.
 *
 * @returns {{level: 'wet'|'fair'|'dry'|'very dry'|'unknown', note: string}}
 */
export function dryness(ndvi, ndmi) {
  if (!Number.isFinite(ndvi)) return { level: 'unknown', note: 'No clear pixels.' };
  if (Number.isFinite(ndmi)) {
    if (ndmi < -0.2) return { level: 'very dry', note: `NDMI ${ndmi.toFixed(2)}: little leaf water — cured grass or bare ground.` };
    if (ndmi < 0) return { level: 'dry', note: `NDMI ${ndmi.toFixed(2)}: drying vegetation.` };
    if (ndmi < 0.2) return { level: 'fair', note: `NDMI ${ndmi.toFixed(2)}: moderate canopy water.` };
    return { level: 'wet', note: `NDMI ${ndmi.toFixed(2)}: well-watered canopy.` };
  }
  if (ndvi < 0.2) return { level: 'very dry', note: `NDVI ${ndvi.toFixed(2)}: sparse or senescent cover.` };
  if (ndvi < 0.4) return { level: 'dry', note: `NDVI ${ndvi.toFixed(2)}: thin cover.` };
  return { level: 'fair', note: `NDVI ${ndvi.toFixed(2)}: green cover (no SWIR band to judge water).` };
}

/**
 * The 20 m window covering a 10 m window (both grids share the tile corner).
 *
 * @param {number[]} window [left, top, right, bottom] in 10 m pixels.
 * @returns {number[]} The same in 20 m pixels.
 */
export function coarseWindow([left, top, right, bottom]) {
  return [Math.floor(left / 2), Math.floor(top / 2), Math.ceil(right / 2), Math.ceil(bottom / 2)];
}

/**
 * Pixel window of a UTM box inside a raster with a north-up geotransform.
 *
 * @param {{minE: number, maxE: number, minN: number, maxN: number}} box
 * @param {number[]} origin [x, y] of the raster's top-left corner.
 * @param {number[]} resolution [xres, yres] (yres negative for north-up).
 * @param {number} rasterWidth
 * @param {number} rasterHeight
 * @returns {number[]|null} [left, top, right, bottom], clipped, or null when outside.
 */
export function pixelWindow(box, origin, resolution, rasterWidth, rasterHeight) {
  const [ox, oy] = origin; const [rx, ry] = resolution;
  const left = Math.max(0, Math.floor((box.minE - ox) / rx));
  const right = Math.min(rasterWidth, Math.ceil((box.maxE - ox) / rx));
  const top = Math.max(0, Math.floor((box.maxN - oy) / ry));
  const bottom = Math.min(rasterHeight, Math.ceil((box.minN - oy) / ry));
  if (right <= left || bottom <= top) return null;
  return [left, top, right, bottom];
}
