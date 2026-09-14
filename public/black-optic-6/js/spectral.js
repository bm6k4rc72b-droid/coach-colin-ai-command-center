/**
 * Vegetation indices: what the light coming off a canopy can and cannot tell you.
 *
 * The specification asked for a hyperspectral camera reading nutrient
 * deficiencies. Two separate things are tangled in that sentence and pulling
 * them apart is most of this module's value.
 *
 * **The instrument.** A true hyperspectral sensor records a hundred or more
 * narrow contiguous bands per pixel and costs more than a tractor. A
 * multispectral sensor records five or six broad bands — blue, green, red, red
 * edge, near-infrared — and is what every published vineyard result actually
 * used. An ordinary camera records three, and its near-infrared is deliberately
 * filtered out at the factory. Each of those tiers supports different indices,
 * so every index here declares which bands it needs and the console only offers
 * the ones the connected source can actually feed.
 *
 * **The inference.** No camera at any price measures nitrogen. It measures
 * reflectance. An index built from that reflectance tells you *where this block
 * differs from the rest of the block* — which is genuinely valuable, because it
 * turns a forty-hectare walk into three flags on a map. It does not tell you
 * *which nutrient*, and the published work that maps spectra to a specific
 * deficiency did it by pairing flights with laboratory tissue tests from the
 * same vines on the same day. Skip that step and you are fertilising a guess.
 *
 * So {@link interpret} exists, it is called on every result, and it says the
 * uncomfortable half out loud.
 *
 * @module black-optic-6/spectral
 */

/**
 * A vegetation index.
 *
 * @typedef {object} Index
 * @property {string} id Short identifier.
 * @property {string} name Full name.
 * @property {string[]} bands Bands required, from `blue` `green` `red` `rededge` `nir`.
 * @property {[number, number]} range Values the index can take.
 * @property {(bands: Record<string, number>) => number} compute The formula.
 * @property {string} measures What it responds to.
 * @property {string} limit The failure mode worth knowing before acting on it.
 */

/** Soil-adjustment constant for SAVI. 0.5 suits partial canopy cover, as in vine rows. */
export const SAVI_L = 0.5;

/** Every index, cheapest instrument first. */
export const INDICES = Object.freeze([
  {
    id: 'tgi',
    name: 'Triangular Greenness Index',
    bands: ['red', 'green', 'blue'],
    // The classic coefficients are large: green canopy lands near +17 on
    // reflectance and bare soil near +1, so a ±1 range would clamp every real
    // image to a flat block and throw away the whole signal.
    range: [-40, 40],
    compute: ({ red, green, blue }) => -0.5 * (190 * (red - green) - 120 * (red - blue)),
    measures: 'Chlorophyll concentration, from an ordinary colour camera.',
    limit: 'The only visible-band index with a defensible link to chlorophyll, and it still needs even lighting across the frame. Overcast is better than sun.',
  },
  {
    id: 'vari',
    name: 'Visible Atmospherically Resistant Index',
    bands: ['red', 'green', 'blue'],
    range: [-1, 1],
    compute: ({ red, green, blue }) => (green - red) / Math.max(1e-6, green + red - blue),
    measures: 'Canopy greenness and fractional cover, from an ordinary colour camera.',
    limit: 'Tracks how much green is in the pixel, not how healthy it is. Bare soil between rows drags it down and will look like stress if you let it into the average.',
  },
  {
    id: 'exg',
    name: 'Excess Green',
    bands: ['red', 'green', 'blue'],
    range: [-2, 2],
    compute: ({ red, green, blue }) => {
      const total = Math.max(1e-6, red + green + blue);
      return 2 * (green / total) - (red / total) - (blue / total);
    },
    measures: 'Separating plant from soil. The standard way to mask out the ground.',
    limit: 'A segmentation tool, not a health measure. Use it to decide which pixels are canopy, then run a real index on those.',
  },
  {
    id: 'ndvi',
    name: 'Normalised Difference Vegetation Index',
    bands: ['nir', 'red'],
    range: [-1, 1],
    compute: ({ nir, red }) => (nir - red) / Math.max(1e-6, nir + red),
    measures: 'Biomass and canopy vigour. The index everything else is compared against.',
    limit: 'Saturates once the canopy closes — above about three leaf layers it stops changing, which in a healthy mid-season vineyard is most of the block. That is why NDRE exists.',
  },
  {
    id: 'gndvi',
    name: 'Green NDVI',
    bands: ['nir', 'green'],
    range: [-1, 1],
    compute: ({ nir, green }) => (nir - green) / Math.max(1e-6, nir + green),
    measures: 'Chlorophyll, with more headroom than NDVI in dense canopy.',
    limit: 'More sensitive than NDVI at the top end, less well established. Useful as a second opinion rather than a primary.',
  },
  {
    id: 'ndre',
    name: 'Normalised Difference Red Edge',
    bands: ['nir', 'rededge'],
    range: [-1, 1],
    compute: ({ nir, rededge }) => (nir - rededge) / Math.max(1e-6, nir + rededge),
    measures: 'Chlorophyll in a closed canopy — the one that keeps working when NDVI has flattened.',
    limit: 'Needs a red-edge band, which is the line between a £300 converted camera and a £4,000 multispectral one.',
  },
  {
    id: 'savi',
    name: 'Soil-Adjusted Vegetation Index',
    bands: ['nir', 'red'],
    range: [-1.5, 1.5],
    compute: ({ nir, red }) => ((nir - red) / Math.max(1e-6, nir + red + SAVI_L)) * (1 + SAVI_L),
    measures: 'Vigour where bare ground shows between the rows — which is every vineyard.',
    limit: 'The soil correction is a fixed constant, so it helps rather than solves. Early season, with wide bare alleys, still biases low.',
  },
  {
    id: 'msavi2',
    name: 'Modified SAVI 2',
    bands: ['nir', 'red'],
    range: [-1, 1],
    compute: ({ nir, red }) => (
      (2 * nir + 1 - Math.sqrt(Math.max(0, (2 * nir + 1) ** 2 - 8 * (nir - red)))) / 2
    ),
    measures: 'Vigour with the soil term derived from the scene instead of assumed.',
    limit: 'Better than SAVI on bare ground and harder to explain to anybody you hand the map to.',
  },
  {
    id: 'cire',
    name: 'Red Edge Chlorophyll Index',
    bands: ['nir', 'rededge'],
    range: [0, 12],
    compute: ({ nir, rededge }) => (nir / Math.max(1e-6, rededge)) - 1,
    measures: 'Leaf chlorophyll content, and the closest any index gets to a nitrogen proxy.',
    limit: 'Closest is not close. It still needs tissue tests from your own vines to turn a number into a recommendation.',
  },
]);

/** The instrument tiers, and what each one unlocks. */
export const TIERS = Object.freeze([
  {
    tier: 'Phone or drone RGB',
    bands: ['red', 'green', 'blue'],
    cost: 'Nothing — you own it',
    note: 'TGI, VARI and Excess Green. Enough to find where a block differs; not enough to say why.',
  },
  {
    tier: 'NIR-converted camera',
    bands: ['red', 'green', 'blue', 'nir'],
    cost: '£30 filter swap to about £300',
    note: 'Unlocks NDVI and SAVI. The single biggest capability jump per pound on this list.',
  },
  {
    tier: 'Multispectral drone camera',
    bands: ['blue', 'green', 'red', 'rededge', 'nir'],
    cost: '£3,000–8,000',
    note: 'Adds red edge, so NDRE and CIre work in a closed canopy. This is what the published vineyard studies flew.',
  },
  {
    tier: 'True hyperspectral',
    bands: ['100+ contiguous narrow bands'],
    cost: '£15,000–60,000',
    note: 'Push-broom, needs a stabilised gimbal and careful calibration per flight. Research instrument. It still does not read nitrogen without tissue tests.',
  },
  {
    tier: 'Sentinel-2, from orbit',
    bands: ['blue', 'green', 'red', 'rededge', 'nir'],
    cost: 'Free, with an account',
    note: '10 m pixels every few days over the whole property. For block-scale vigour this beats owning anything, and costs a login.',
  },
]);

/**
 * Which indices a set of available bands can support.
 *
 * @param {string[]} available Band names the source provides.
 * @returns {Index[]} Indices that can be computed.
 */
export function availableIndices(available) {
  const have = new Set(available);
  return INDICES.filter((index) => index.bands.every((band) => have.has(band)));
}

/**
 * Convert raw digital numbers to reflectance using a calibration panel.
 *
 * Without this, two flights are not comparable — the same vine photographed
 * under thin cloud and under full sun produces different numbers from the same
 * leaf, and the difference is larger than the stress you are looking for. A
 * panel of known reflectance in the frame turns brightness into a physical
 * quantity, which is the whole basis for saying this week is worse than last.
 *
 * Single-point scaling against one panel. Two panels of different brightness
 * would let the offset be fitted too; one is what most people actually own.
 *
 * @param {number} raw Digital number from the image.
 * @param {number} panelRaw Digital number measured on the panel.
 * @param {number} panelReflectance Panel's known reflectance, 0..1.
 * @returns {number} Reflectance, 0..1.
 */
export function toReflectance(raw, panelRaw, panelReflectance) {
  if (!(panelRaw > 0)) return 0;
  return Math.max(0, Math.min(1.5, (raw / panelRaw) * panelReflectance));
}

/**
 * Compute an index from a set of band values.
 *
 * @param {Index|string} index The index or its id.
 * @param {Record<string, number>} bands Band values, reflectance or normalised DN.
 * @returns {number|null} The index value, or null when a band is missing.
 */
export function computeIndex(index, bands) {
  const definition = typeof index === 'string' ? INDICES.find((entry) => entry.id === index) : index;
  if (!definition) return null;
  for (const band of definition.bands) {
    if (!Number.isFinite(bands[band])) return null;
  }
  const value = definition.compute(bands);
  if (!Number.isFinite(value)) return null;
  return Math.max(definition.range[0], Math.min(definition.range[1], value));
}

/**
 * Compute an index across an image, returning the map and its statistics.
 *
 * @param {object} source Image bands.
 * @param {Record<string, Float32Array|Uint8ClampedArray>} source.bands Per-pixel band values.
 * @param {number} source.width Image width.
 * @param {number} source.height Image height.
 * @param {Index|string} index The index to compute.
 * @param {object} [options] Masking.
 * @param {number} [options.canopyThreshold] Excess Green value below which a
 *   pixel is treated as ground and excluded.
 * @returns {{values: Float32Array, mask: Uint8Array, stats: object}} The map.
 */
export function indexMap(source, index, options = {}) {
  const definition = typeof index === 'string' ? INDICES.find((entry) => entry.id === index) : index;
  const count = source.width * source.height;
  const values = new Float32Array(count);
  const mask = new Uint8Array(count);
  const kept = [];

  for (let i = 0; i < count; i += 1) {
    const bands = {};
    for (const [name, array] of Object.entries(source.bands)) {
      bands[name] = array[i] / (array instanceof Uint8ClampedArray ? 255 : 1);
    }

    // Soil is excluded before anything is averaged. An index averaged over the
    // alleys measures how much bare ground is in the frame, which changes with
    // mowing and tells you nothing about the vines.
    if (options.canopyThreshold !== undefined && bands.red !== undefined) {
      const green = computeIndex('exg', bands);
      if (green === null || green < options.canopyThreshold) {
        values[i] = NaN;
        continue;
      }
    }

    const value = computeIndex(definition, bands);
    if (value === null) {
      values[i] = NaN;
      continue;
    }
    values[i] = value;
    mask[i] = 1;
    kept.push(value);
  }

  return { values, mask, stats: statistics(kept), index: definition };
}

/**
 * Summary statistics for a set of index values.
 *
 * Percentiles rather than only a mean, because the useful question in a block is
 * "which tenth is worst" and a mean hides exactly that.
 *
 * @param {number[]} values Index values, soil already excluded.
 * @returns {{count: number, mean: number, sd: number, p10: number, median: number,
 *   p90: number, range: number}} The statistics.
 */
export function statistics(values) {
  if (!values.length) {
    return { count: 0, mean: NaN, sd: NaN, p10: NaN, median: NaN, p90: NaN, range: NaN };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    count: values.length,
    mean,
    sd: Math.sqrt(variance),
    p10: at(0.1),
    median: at(0.5),
    p90: at(0.9),
    range: sorted[sorted.length - 1] - sorted[0],
  };
}

/**
 * The worst zones in a map, as a grid of cells ranked by index.
 *
 * This is the output that is actually worth having: not a pretty picture, but a
 * short list of places to walk to with a soil auger and a tissue bag.
 *
 * @param {{values: Float32Array}} map An index map.
 * @param {number} width Image width.
 * @param {number} height Image height.
 * @param {number} [cells=6] Grid cells per side.
 * @returns {Array<{col: number, row: number, mean: number, count: number, rank: number}>}
 *   Cells, worst first.
 */
export function worstZones(map, width, height, cells = 6) {
  const cellW = Math.ceil(width / cells);
  const cellH = Math.ceil(height / cells);
  const zones = [];

  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      let sum = 0;
      let count = 0;
      for (let y = row * cellH; y < Math.min(height, (row + 1) * cellH); y += 1) {
        for (let x = col * cellW; x < Math.min(width, (col + 1) * cellW); x += 1) {
          const value = map.values[y * width + x];
          if (Number.isNaN(value)) continue;
          sum += value;
          count += 1;
        }
      }
      if (count > 0) zones.push({ col, row, mean: sum / count, count });
    }
  }

  zones.sort((a, b) => a.mean - b.mean);
  return zones.map((zone, i) => ({ ...zone, rank: i + 1 }));
}

/**
 * False colour for an index value: red through yellow to green.
 *
 * @param {number} value The index value.
 * @param {[number, number]} bounds Low and high ends of the scale.
 * @returns {[number, number, number]} Red, green and blue, 0–255.
 */
export function indexColour(value, bounds) {
  if (Number.isNaN(value)) return [18, 22, 28];
  const [low, high] = bounds;
  const t = Math.max(0, Math.min(1, (value - low) / Math.max(1e-6, high - low)));
  if (t < 0.5) {
    const k = t * 2;
    return [220, Math.round(40 + k * 175), 40];
  }
  const k = (t - 0.5) * 2;
  return [Math.round(220 - k * 180), Math.round(215 - k * 15), Math.round(40 + k * 40)];
}

/**
 * What a result does and does not license you to conclude.
 *
 * Always attached to a computed map. The spread matters more than the mean: a
 * uniformly low block is usually the variety, the rootstock or the season, while
 * a high spread with a cluster of low cells is a thing on the ground with a
 * cause you can go and find.
 *
 * @param {Index} index The index computed.
 * @param {object} stats Its statistics.
 * @param {boolean} calibrated Whether a reflectance panel was used.
 * @returns {{headline: string, supports: string[], doesNotSupport: string[], next: string}}
 *   The reading.
 */
export function interpret(index, stats, calibrated) {
  const spread = stats.p90 - stats.p10;
  const uniform = spread < (index.range[1] - index.range[0]) * 0.06;

  const headline = stats.count === 0
    ? 'Nothing to measure — every pixel was masked as ground or lacked a band.'
    : uniform
      ? `Uniform across the frame (10th to 90th percentile spans ${spread.toFixed(3)}). Whatever is going on is going on everywhere.`
      : `Variable across the frame (10th to 90th percentile spans ${spread.toFixed(3)}). The low cells are worth walking to.`;

  const supports = [
    'Where this frame differs from itself — relative, within one image, under one light.',
    index.measures,
  ];
  if (calibrated) {
    supports.push('Comparison against other flights, because a panel fixed the brightness to reflectance.');
  }

  const doesNotSupport = [
    'Which nutrient. No camera measures nitrogen, phosphorus or potassium — it measures reflected light.',
    'An absolute score. There is no healthy number for this index; there is only this block against itself.',
  ];
  if (!calibrated) {
    doesNotSupport.push('Comparison with any other image. Without a reflectance panel, today and last week are different scales.');
  }
  doesNotSupport.push(index.limit);

  return {
    headline,
    supports,
    doesNotSupport,
    next: uniform
      ? 'Uniform frames rarely justify a flight. Compare blocks, or compare this block to itself a fortnight apart with a panel in shot.'
      : 'Walk the lowest-ranked cells. Take tissue samples there and from a good cell, send both, and let the laboratory name the deficiency. The map found the spot; it cannot do the chemistry.',
  };
}
