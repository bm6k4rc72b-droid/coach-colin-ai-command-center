/**
 * Satellite access, and what that phrase can honestly mean.
 *
 * It means real imagery over your coordinates, fetched free, updated daily. It
 * does not mean a camera you can point. Nothing civilian loiters over a
 * particular vineyard, and the constellations that pass overhead see the ground
 * at a scale where a person is far smaller than the error in a single pixel.
 *
 * The numbers that settle it: the daily free layers resolve 250 m per pixel.
 * A person is about half a metre across. Roughly a quarter of a million people
 * would fit in one pixel of the picture this panel can fetch. Even the sharpest
 * commercial tasking — about 30 cm, paid, days of lead time — resolves a vehicle
 * as a smudge and a person not at all.
 *
 * What that leaves is genuinely useful and worth having on a ranch console:
 * where the fires are within hours of an overpass, how the vines are doing
 * across the whole property in one frame, what changed between last week and
 * this, and exactly when the next satellite will look. This module builds those
 * requests and states the resolution on every one of them, because a panel
 * showing orbital imagery invites exactly the wrong assumption.
 *
 * Overpass prediction is the fire console's, not a second copy.
 *
 * @module black-optic-6/satellite
 */

import { SATELLITES, nextLooks } from '../../emberline/js/overpass.js';

/** NASA's public tile service. No key, no account, CORS open. */
export const GIBS_ROOT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

/**
 * An imagery layer this panel can fetch.
 *
 * @typedef {object} Layer
 * @property {string} id GIBS layer identifier.
 * @property {string} name What the console calls it.
 * @property {number} metresPerPixel Native ground resolution.
 * @property {string} matrixSet GIBS tile matrix set.
 * @property {string} ext File extension.
 * @property {number} maxZoom Deepest zoom the layer actually carries.
 * @property {string} cadence How often a new frame appears.
 * @property {string} use What it is good for on a property this size.
 */

/** The layers worth having, and nothing that only looks impressive. */
export const LAYERS = Object.freeze([
  {
    id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    name: 'True colour · VIIRS',
    metresPerPixel: 250,
    matrixSet: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxZoom: 9,
    cadence: 'Daily, early afternoon',
    use: 'Smoke plumes, flood, snow, gross land change. Your whole property is a few pixels across.',
  },
  {
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    name: 'True colour · MODIS Terra',
    metresPerPixel: 250,
    matrixSet: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxZoom: 9,
    cadence: 'Daily, late morning',
    use: 'A second daily look at a different hour — useful when one pass is clouded.',
  },
  {
    id: 'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance',
    name: 'Night lights · Day-Night Band',
    metresPerPixel: 500,
    matrixSet: 'GoogleMapsCompatible_Level8',
    ext: 'png',
    maxZoom: 8,
    cadence: 'Nightly, about 01:30 local',
    use: 'Lights at night across the region. A lit yard may show; a vehicle will not.',
  },
  {
    id: 'MODIS_Terra_NDVI_8Day',
    name: 'Vegetation index · NDVI',
    metresPerPixel: 250,
    matrixSet: 'GoogleMapsCompatible_Level9',
    ext: 'png',
    maxZoom: 9,
    cadence: 'Every 8 days',
    use: 'Canopy vigour across the block. For row-level vine stress you want Sentinel-2 at 10 m, or a camera in the air.',
  },
  {
    id: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    name: 'Thermal anomalies · 375 m',
    metresPerPixel: 375,
    matrixSet: 'GoogleMapsCompatible_Level7',
    ext: 'png',
    maxZoom: 7,
    cadence: 'Each overpass, within about three hours',
    use: 'Active fire detections. The one orbital layer that should ever raise an alarm here.',
  },
]);

/**
 * Ground resolution of a Web Mercator tile pixel, in metres.
 *
 * @param {number} lat Latitude in degrees.
 * @param {number} zoom Tile zoom level.
 * @returns {number} Metres per pixel.
 */
export function metresPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * The tile containing a position.
 *
 * @param {number} lat Latitude in degrees.
 * @param {number} lon Longitude in degrees.
 * @param {number} zoom Tile zoom level.
 * @returns {{x: number, y: number, z: number}} Tile coordinates.
 */
export function tileFor(lat, lon, zoom) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: zoom };
}

/**
 * A tile URL for a layer, date and tile.
 *
 * @param {Layer} layer The imagery layer.
 * @param {string} isoDate Date as `YYYY-MM-DD`.
 * @param {{x: number, y: number, z: number}} tile Tile coordinates.
 * @returns {string} A fetchable URL.
 */
export function tileUrl(layer, isoDate, tile) {
  return `${GIBS_ROOT}/${layer.id}/default/${isoDate}/${layer.matrixSet}/${tile.z}/${tile.y}/${tile.x}.${layer.ext}`;
}

/**
 * The tiles covering a square around a position, and where to draw each.
 *
 * @param {Layer} layer The imagery layer.
 * @param {string} isoDate Date as `YYYY-MM-DD`.
 * @param {{lat: number, lon: number}} centre Position of interest.
 * @param {number} [span=3] Tiles per side; odd numbers keep the centre centred.
 * @returns {{zoom: number, metresPerPixel: number, tiles: Array<{url: string, col: number, row: number}>}}
 *   A mosaic description.
 */
export function mosaic(layer, isoDate, centre, span = 3) {
  const zoom = Math.min(layer.maxZoom, 8);
  const middle = tileFor(centre.lat, centre.lon, zoom);
  const half = Math.floor(span / 2);
  const tiles = [];
  for (let row = -half; row <= half; row += 1) {
    for (let col = -half; col <= half; col += 1) {
      tiles.push({
        url: tileUrl(layer, isoDate, { x: middle.x + col, y: middle.y + row, z: zoom }),
        col: col + half,
        row: row + half,
      });
    }
  }
  return { zoom, metresPerPixel: metresPerPixel(centre.lat, zoom), tiles };
}

/**
 * The most recent date a layer is likely to have.
 *
 * Near-real-time products lag their overpass by a few hours, so "today" is often
 * empty until the afternoon and a request for it returns blank tiles. Stepping
 * back a day is the difference between a picture and an empty panel.
 *
 * @param {number} [nowMs=Date.now()] Clock.
 * @param {number} [backDays=1] How far back to step.
 * @returns {string} `YYYY-MM-DD`.
 */
export function latestDate(nowMs = Date.now(), backDays = 1) {
  const date = new Date(nowMs - backDays * 86400000);
  return date.toISOString().slice(0, 10);
}

/**
 * What a layer can and cannot resolve, in plain terms.
 *
 * Every fetched frame is captioned with this. The panel is the single most
 * likely place on the console for somebody to believe they are looking at
 * something they are not.
 *
 * @param {Layer} layer The imagery layer.
 * @returns {{metresPerPixel: number, personFraction: string, vehicle: string, verdict: string}}
 *   The honest caption.
 */
export function resolutionNote(layer) {
  const people = (layer.metresPerPixel / 0.5) ** 2;
  return {
    metresPerPixel: layer.metresPerPixel,
    personFraction: `about ${Math.round(people).toLocaleString('en-US')} people would fit in one pixel`,
    vehicle: 'a vehicle is roughly one fiftieth of a pixel across',
    verdict: `${layer.metresPerPixel} m per pixel — land cover and heat, never people or vehicles.`,
  };
}

/**
 * When each satellite next looks at a position.
 *
 * @param {{lat: number, lon: number}} place The property.
 * @param {number} [fromMs=Date.now()] Clock.
 * @param {number} [count=4] How many windows to return.
 * @returns {Array<object>} Upcoming looks, soonest first.
 */
export function upcomingLooks(place, fromMs = Date.now(), count = 4) {
  return nextLooks(place, fromMs, count);
}

/**
 * Sharper imagery than the free layers, and what it costs.
 *
 * Kept as data rather than prose so the panel can show the ladder honestly: the
 * question is never "can a satellite see my ranch" but "at what resolution, how
 * often, and for how much".
 */
export const TASKING_LADDER = Object.freeze([
  {
    tier: 'Free · daily',
    resolution: '250–375 m',
    revisit: 'Twice a day',
    cost: 'None',
    note: 'What this panel fetches. Fires, smoke, flood, canopy.',
  },
  {
    tier: 'Free · multispectral',
    resolution: '10 m',
    revisit: 'Every 5 days',
    cost: 'None, with a Copernicus account',
    note: 'Sentinel-2. Genuinely useful per-block vine stress; needs a key, so it is a setup step rather than a fetch.',
  },
  {
    tier: 'Commercial · monitoring',
    resolution: '3 m',
    revisit: 'Daily',
    cost: 'Subscription, thousands a year',
    note: 'Planet-class. You can see a barn, a dam, a new track. Not a person.',
  },
  {
    tier: 'Commercial · tasking',
    resolution: '30–50 cm',
    revisit: 'Booked, days of lead time',
    cost: 'Per scene, hundreds to thousands',
    note: 'The sharpest civilian imagery there is. A vehicle is a few pixels; a person is a smudge in ideal light.',
  },
]);

/** Re-exported so a panel can name the satellites without a second import. */
export { SATELLITES };
