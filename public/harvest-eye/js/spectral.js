/**
 * Vegetation indices and canopy stress analysis.
 *
 * **What this is not.** A phone camera is not a hyperspectral instrument. It
 * has three broad, overlapping colour channels and an IR-cut filter bonded over
 * the sensor, so it cannot resolve narrow bands and cannot see near-infrared at
 * all. Nothing here reconstructs a spectral cube, and NDVI — which is defined
 * on NIR — is unavailable from an unmodified phone. Claiming otherwise would be
 * a lie told in false colour.
 *
 * **What this is.** The published visible-band indices that agronomy actually
 * uses when only RGB is available: ExG for separating canopy from soil, NGRDI
 * and VARI for vigour and canopy cover, GLI for green fraction, and TGI, which
 * correlates with leaf chlorophyll — and therefore nitrogen status — precisely
 * because it is a triangle drawn between the red, green and blue band centres
 * of an ordinary camera. Plus true NDVI when the operator attaches an
 * IR-converted camera, where one channel really does carry NIR.
 *
 * Every index is computed per pixel on the same downscaled frame the maturity
 * detector uses, masked to vegetation by a clamped Otsu split (on ExG, or on
 * NDVI where the camera can see NIR), and reduced to zonal statistics over a
 * tile grid — which is what a drone map is, minus the drone.
 *
 * References: Woebbecke 1995 (ExG); Hunt 2005 (NGRDI); Gitelson 2002 (VARI);
 * Louhaichi 2001 (GLI); Hunt 2011, 2013 (TGI); Rouse 1974 (NDVI);
 * Otsu 1979 (thresholding).
 *
 * @module harvest-eye/spectral
 */

import { NEUTRAL_GAINS, rgbToHsv } from './color.js';

/**
 * @typedef {object} SpectralIndex
 * @property {string} id Stable identifier.
 * @property {string} name Display name.
 * @property {string} short Compact label for the overlay legend.
 * @property {'rgb'|'nir'} needs Whether a NIR-capable camera is required.
 * @property {[number, number]} range Display range, used to normalize colour.
 * @property {number} stressBelow Values under this count as stressed canopy.
 * @property {string} measures One line on what it actually indicates.
 * @property {string} formula Human-readable formula.
 */

/**
 * Camera types the app knows how to read.
 *
 * An IR conversion — removing the sensor's IR-cut filter and fitting a red or
 * blue long-pass filter — is a genuine, cheap route to NDVI: one channel then
 * carries NIR and another carries visible light. This is the Public Lab
 * "Infragram" arrangement, and it is why NDVI here is gated on the operator
 * telling the app what is bolted to the phone.
 *
 * @type {ReadonlyArray<{id:string,name:string,nir:string|null,visible:string|null,note:string}>}
 */
export const CAMERA_MODES = Object.freeze([
  {
    id: 'rgb',
    name: 'Standard camera',
    nir: null,
    visible: null,
    note: 'Ordinary phone camera. Visible-band indices only — no NIR, so no NDVI.',
  },
  {
    id: 'ir-red',
    name: 'IR-converted, red filter',
    nir: 'r',
    visible: 'b',
    note: 'IR-cut filter removed, red long-pass fitted: red channel carries NIR, blue carries visible.',
  },
  {
    id: 'ir-blue',
    name: 'IR-converted, blue filter',
    nir: 'r',
    visible: 'b',
    note: 'Superblue/Wratten 44A conversion: red channel carries NIR, blue carries visible blue.',
  },
]);

/** @type {ReadonlyArray<SpectralIndex>} */
export const INDICES = Object.freeze([
  {
    id: 'exg',
    name: 'Excess Green',
    short: 'ExG',
    needs: 'rgb',
    range: [-0.15, 0.55],
    stressBelow: 0.1,
    measures: 'Canopy against soil. The workhorse mask, not a health reading.',
    formula: '2g − r − b (chromatic coordinates)',
  },
  {
    id: 'ngrdi',
    name: 'Green-Red Difference',
    short: 'NGRDI',
    needs: 'rgb',
    range: [-0.15, 0.35],
    stressBelow: 0.05,
    measures: 'Vigour and biomass. Falls as canopy yellows or thins.',
    formula: '(G − R) / (G + R)',
  },
  {
    id: 'vari',
    name: 'Visible Atmospherically Resistant',
    short: 'VARI',
    needs: 'rgb',
    range: [-0.25, 0.6],
    stressBelow: 0.08,
    measures: 'Canopy cover, with some resilience to changing illumination.',
    formula: '(G − R) / (G + R − B)',
  },
  {
    id: 'gli',
    name: 'Green Leaf Index',
    short: 'GLI',
    needs: 'rgb',
    range: [-0.2, 0.5],
    stressBelow: 0.06,
    measures: 'Green fraction of the canopy — thinning and senescence.',
    formula: '(2G − R − B) / (2G + R + B)',
  },
  {
    id: 'tgi',
    name: 'Triangular Greenness',
    short: 'TGI',
    needs: 'rgb',
    range: [-0.25, 0.55],
    stressBelow: 0.1,
    measures: 'Leaf chlorophyll, and so nitrogen status. The nutrient index.',
    formula: '−0.5[190(R − G) − 120(R − B)], scaled',
  },
  {
    id: 'ndvi',
    name: 'NDVI',
    short: 'NDVI',
    needs: 'nir',
    range: [-0.1, 0.85],
    stressBelow: 0.3,
    measures: 'The real thing: near-infrared against red, the index every satellite and ag drone reports.',
    formula: '(NIR − RED) / (NIR + RED)',
  },
]);

/**
 * Look up an index definition.
 *
 * @param {string} id Index id.
 * @returns {SpectralIndex} The definition, defaulting to ExG.
 */
export function indexById(id) {
  return INDICES.find((entry) => entry.id === id) || INDICES[0];
}

/**
 * Indices usable with a given camera.
 *
 * @param {string} cameraMode Camera mode id.
 * @returns {SpectralIndex[]} Indices this hardware can actually produce.
 */
export function availableIndices(cameraMode) {
  const mode = CAMERA_MODES.find((entry) => entry.id === cameraMode) || CAMERA_MODES[0];
  return INDICES.filter((entry) => entry.needs === 'rgb' || mode.nir !== null);
}

/**
 * Evaluate one index for a single pixel.
 *
 * @param {string} id Index id.
 * @param {number} r Red, 0–1.
 * @param {number} g Green, 0–1.
 * @param {number} b Blue, 0–1.
 * @param {{nir:number, visible:number}|null} [ir] Channel assignment for an
 *   IR-converted camera, already extracted from the pixel.
 * @returns {number} Index value, or NaN when it is undefined for this pixel.
 */
export function indexValue(id, r, g, b, ir = null) {
  // NDVI lives in the IR channels, so it is answered before the visible-light
  // guard below — an all-zero RGB triple says nothing about what NIR saw.
  if (id === 'ndvi') {
    if (!ir) return Number.NaN;
    const d = ir.nir + ir.visible;
    return d <= 1e-6 ? Number.NaN : (ir.nir - ir.visible) / d;
  }

  const sum = r + g + b;
  if (sum <= 1e-6) return Number.NaN;

  switch (id) {
    case 'exg': {
      // Chromatic coordinates first: this is what makes ExG a shape in colour
      // space rather than a brightness reading.
      return (2 * g - r - b) / sum;
    }
    case 'ngrdi': {
      const d = g + r;
      return d <= 1e-6 ? Number.NaN : (g - r) / d;
    }
    case 'vari': {
      const d = g + r - b;
      // The denominator crosses zero on strongly blue pixels (sky, shadow,
      // water), where the ratio explodes; those pixels have no VARI.
      return Math.abs(d) < 0.02 ? Number.NaN : (g - r) / d;
    }
    case 'gli': {
      const d = 2 * g + r + b;
      return d <= 1e-6 ? Number.NaN : (2 * g - r - b) / d;
    }
    case 'tgi': {
      // Band centres 670/550/480 nm give the 190 and 120 coefficients. Divided
      // by 95 so the useful span lands in roughly [-1, 1] like its neighbours.
      return (-0.5 * (190 * (r - g) - 120 * (r - b))) / 95;
    }
    default:
      return Number.NaN;
  }
}

/**
 * Otsu's threshold over a 256-bin histogram.
 *
 * Picks the split that maximizes between-class variance — the standard way to
 * separate canopy from soil without asking the operator to tune a slider for
 * every field and every hour of the day.
 *
 * @param {Uint32Array|number[]} histogram Bin counts.
 * @param {number} total Sample count.
 * @returns {number} Bin index of the threshold.
 */
export function otsuThreshold(histogram, total) {
  if (!total) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let bestVariance = -1;
  for (let i = 0; i < 256; i += 1) {
    weightB += histogram[i];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += i * histogram[i];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = i;
    }
  }
  return best;
}

/**
 * Percentile of a sorted-in-place copy of the samples.
 *
 * @param {number[]} values Sample values.
 * @param {number} p Percentile in [0,1].
 * @returns {number} The percentile, or NaN when there are no samples.
 */
function percentile(values, p) {
  if (!values.length) return Number.NaN;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)));
  return values[index];
}

/**
 * Red–yellow–green ramp for index maps.
 *
 * Red reads as stressed and green as healthy, which is the convention every
 * agronomy map already uses; inventing a prettier palette would only make the
 * output harder to compare with the rest of the industry.
 *
 * @param {number} t Normalized value in [0,1].
 * @returns {[number, number, number]} RGB in 0–255.
 */
export function ramp(t) {
  const stops = [
    [0.0, [122, 24, 20]],
    [0.25, [214, 60, 40]],
    [0.5, [240, 170, 40]],
    [0.72, [168, 214, 60]],
    [1.0, [22, 128, 58]],
  ];
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return [22, 128, 58];
}

/**
 * Analyse a frame for canopy condition.
 *
 * @param {{data:Uint8ClampedArray,width:number,height:number}} frame Source pixels.
 * @param {object} [options] Analysis options.
 * @param {string} [options.index='exg'] Index to map.
 * @param {string} [options.cameraMode='rgb'] Camera mode id.
 * @param {{r:number,g:number,b:number}} [options.gains] White-balance gains.
 * @param {number} [options.tileCols=12] Tile grid width for patchiness.
 * @param {number} [options.tileRows=9] Tile grid height.
 * @param {number} [options.minVegetation=0.02] Below this canopy fraction the
 *   frame is reported as having nothing to measure.
 * @returns {{
 *   index:SpectralIndex, width:number, height:number,
 *   values:Float32Array, mask:Uint8Array,
 *   canopyCover:number, chlorosisShare:number, necrosisShare:number,
 *   stats:{mean:number,p10:number,p90:number,min:number,max:number,cv:number,
 *          stressedShare:number,relativeStressShare:number,zoneDeficit:number,
 *          reference:number,weakZone:number,relativeCut:number,zones:number,
 *          samples:number},
 *   tiles:Array<{col:number,row:number,x:number,y:number,w:number,h:number,mean:number,cover:number}>,
 *   hotspots:Array<object>, usable:boolean
 * }} Canopy analysis.
 */
export function analyzeCanopy(frame, options = {}) {
  const { data, width, height } = frame;
  const definition = indexById(options.index || 'exg');
  const gains = options.gains || NEUTRAL_GAINS;
  const mode = CAMERA_MODES.find((entry) => entry.id === (options.cameraMode || 'rgb'))
    || CAMERA_MODES[0];
  const tileCols = options.tileCols ?? 12;
  const tileRows = options.tileRows ?? 9;
  const minVegetation = options.minVegetation ?? 0.02;

  const n = width * height;
  const values = new Float32Array(n);
  const maskMetric = new Float32Array(n);
  const mask = new Uint8Array(n);
  const histogram = new Uint32Array(256);
  const hsv = { h: 0, s: 0, v: 0 };

  // What counts as "a plant pixel" depends on what the sensor can see. An
  // ordinary camera separates canopy from soil on Excess Green; an IR
  // conversion does it far better on NDVI, where vegetation is unmistakable.
  const maskIndex = mode.nir ? 'ndvi' : 'exg';
  const maskSpan = mode.nir ? { lo: -1, hi: 1 } : { lo: -1, hi: 2 };
  const maskBand = mode.nir ? { floor: 0.08, ceiling: 0.35 } : { floor: 0.03, ceiling: 0.18 };

  let chlorosis = 0;
  let necrosis = 0;
  let leafish = 0;

  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const r8 = Math.min(255, data[p] * gains.r);
    const g8 = Math.min(255, data[p + 1] * gains.g);
    const b8 = Math.min(255, data[p + 2] * gains.b);
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;

    const ir = mode.nir
      ? { nir: mode.nir === 'r' ? r : b, visible: mode.visible === 'b' ? b : r }
      : null;
    values[i] = indexValue(definition.id, r, g, b, ir);

    const metric = definition.id === maskIndex
      ? values[i]
      : indexValue(maskIndex, r, g, b, ir);
    maskMetric[i] = metric;
    if (Number.isFinite(metric)) {
      const t = (metric - maskSpan.lo) / (maskSpan.hi - maskSpan.lo);
      histogram[Math.min(255, Math.max(0, Math.round(t * 255)))] += 1;
    }

    // Symptom fractions are hue classifications, deliberately independent of
    // the index: a grower can act on "12 % of the leaf area is necrotic" in a
    // way they cannot act on "TGI is 0.21".
    rgbToHsv(r8, g8, b8, hsv);
    if (hsv.v > 0.12) {
      const green = hsv.h > 70 && hsv.h < 175 && hsv.s > 0.18;
      const yellow = hsv.h >= 40 && hsv.h <= 70 && hsv.s > 0.3 && hsv.v > 0.35;
      const brown = hsv.h >= 10 && hsv.h < 45 && hsv.s > 0.15 && hsv.v < 0.45;
      if (green || yellow || brown) leafish += 1;
      if (yellow) chlorosis += 1;
      if (brown) necrosis += 1;
    }
  }

  let counted = 0;
  for (let i = 0; i < 256; i += 1) counted += histogram[i];
  const threshold = otsuThreshold(histogram, counted);
  const otsuCut = maskSpan.lo + (threshold / 255) * (maskSpan.hi - maskSpan.lo);
  // Otsu is clamped into a band, and the ceiling is the part that matters: on a
  // frame filled edge to edge with canopy there is no soil mode to find, so an
  // unclamped split lands *inside* the vegetation and quietly discards the
  // stressed plants — deleting exactly what the operator opened the app to see.
  const cut = Math.min(maskBand.ceiling, Math.max(maskBand.floor, otsuCut));

  const samples = [];
  let covered = 0;
  for (let i = 0; i < n; i += 1) {
    if (maskMetric[i] >= cut) {
      mask[i] = 1;
      covered += 1;
      const value = values[i];
      if (Number.isFinite(value)) samples.push(value);
    }
  }

  const canopyCover = covered / n;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.length
    ? samples.reduce((sum, value) => sum + value, 0) / samples.length
    : Number.NaN;
  let variance = 0;
  for (const value of samples) variance += (value - mean) ** 2;
  const sd = samples.length > 1 ? Math.sqrt(variance / (samples.length - 1)) : 0;
  const stressed = samples.filter((value) => value < definition.stressBelow).length;

  const tiles = [];
  const tileW = Math.max(1, Math.floor(width / tileCols));
  const tileH = Math.max(1, Math.floor(height / tileRows));
  for (let row = 0; row < tileRows; row += 1) {
    for (let col = 0; col < tileCols; col += 1) {
      const x0 = col * tileW;
      const y0 = row * tileH;
      const x1 = col === tileCols - 1 ? width : x0 + tileW;
      const y1 = row === tileRows - 1 ? height : y0 + tileH;
      let sum = 0;
      let count = 0;
      let area = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = y * width + x;
          area += 1;
          if (mask[i] && Number.isFinite(values[i])) {
            sum += values[i];
            count += 1;
          }
        }
      }
      tiles.push({
        col,
        row,
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
        mean: count ? sum / count : Number.NaN,
        cover: area ? count / area : 0,
      });
    }
  }

  // Hotspots are the weakest tiles that still hold enough canopy to be a real
  // reading — a bare-soil tile is not a stressed tile.
  const measurable = tiles.filter((tile) => tile.cover > 0.2 && Number.isFinite(tile.mean));
  const hotspots = [...measurable].sort((a, b) => a.mean - b.mean).slice(0, 4);

  // Absolute thresholds are close to meaningless for these indices: a TGI of
  // 0.28 is poor in one crop and excellent in another. What a zone map is for
  // is *within-field* variation, so the working measure is relative — canopy
  // sitting well below this field's own strongest tenth, the same "fraction of
  // reference" logic a reference strip gives you in the field.
  //
  // It is computed on zones rather than pixels deliberately. Per-pixel, sensor
  // noise alone puts a tail below any relative cut and every uniform field
  // reports a few percent of phantom stress; a zone is the unit a grower can
  // actually drive a machine to anyway.
  const zoneMeans = measurable.map((tile) => tile.mean).sort((a, b) => a - b);
  const reference = percentile(zoneMeans, 0.9);
  const weakZone = percentile(zoneMeans, 0.1);
  // `zoneDeficit` carries no threshold at all: it is simply how far the weak
  // end of the field sits below its own strong end, as a fraction. A grower
  // can read "the weak zones are 18 % down on the best" without anyone having
  // decided what "stressed" means for their crop this week.
  const zoneDeficit = Number.isFinite(reference) && reference > 0.02
    ? Math.max(0, (reference - weakZone) / reference)
    : 0;
  // The one threshold that remains is explicit: a zone more than a tenth below
  // the reference is worth walking to. Ten per cent bands are the convention
  // management-zone maps are already drawn in.
  const relativeCut = Number.isFinite(reference) && reference > 0.02
    ? reference * 0.9
    : Number.NaN;
  const relativeStressShare = zoneMeans.length && Number.isFinite(relativeCut)
    ? zoneMeans.filter((value) => value < relativeCut).length / zoneMeans.length
    : 0;

  return {
    index: definition,
    width,
    height,
    values,
    mask,
    canopyCover,
    chlorosisShare: leafish ? chlorosis / leafish : 0,
    necrosisShare: leafish ? necrosis / leafish : 0,
    stats: {
      mean,
      p10: percentile(sorted, 0.1),
      p90: percentile(sorted, 0.9),
      min: sorted.length ? sorted[0] : Number.NaN,
      max: sorted.length ? sorted[sorted.length - 1] : Number.NaN,
      cv: Number.isFinite(mean) && Math.abs(mean) > 1e-6 ? sd / Math.abs(mean) : 0,
      stressedShare: samples.length ? stressed / samples.length : 0,
      relativeStressShare,
      zoneDeficit,
      reference,
      weakZone,
      relativeCut,
      zones: zoneMeans.length,
      samples: samples.length,
    },
    tiles,
    hotspots,
    usable: canopyCover >= minVegetation && samples.length > 0,
  };
}

/**
 * Paint an index map as false colour into an RGBA buffer.
 *
 * Non-canopy pixels are left transparent rather than coloured, so the operator
 * sees the index sitting on the plants instead of a pretty rectangle that also
 * claims to measure the soil, the sky and their boots.
 *
 * @param {object} analysis Result of {@link analyzeCanopy}.
 * @param {object} [options] Paint options.
 * @param {number} [options.alpha=190] Opacity for canopy pixels, 0–255.
 * @returns {ImageData|{data:Uint8ClampedArray,width:number,height:number}} The
 *   painted map, ready to be drawn to a canvas.
 */
export function paintIndexMap(analysis, options = {}) {
  const { width, height, values, mask, index } = analysis;
  const alpha = options.alpha ?? 190;
  const [lo, hi] = index.range;
  const span = hi - lo || 1;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    if (!mask[i] || !Number.isFinite(values[i])) {
      out[p + 3] = 0;
      continue;
    }
    const [r, g, b] = ramp((values[i] - lo) / span);
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = alpha;
  }

  if (typeof ImageData === 'function') return new ImageData(out, width, height);
  return { data: out, width, height };
}

/**
 * Turn canopy statistics into a sentence a grower can act on.
 *
 * The index number is evidence, not advice. This is the translation layer, and
 * it is deliberately conservative: it names what was seen and what it is
 * consistent with, never a diagnosis the camera cannot support.
 *
 * @param {object} analysis Result of {@link analyzeCanopy}.
 * @param {object} [baseline] This block's own history, when it exists.
 * @param {number} [baseline.mean] Previous mean index for the block.
 * @param {number} [baseline.canopyCover] Previous canopy cover.
 * @returns {{headline:string, detail:string, severity:'ok'|'watch'|'alert'}}
 *   Verdict for the readout.
 */
export function interpretCanopy(analysis, baseline = null) {
  if (!analysis.usable) {
    return {
      headline: 'No canopy in frame',
      detail: 'Fill the view with foliage — the index is measured on plant pixels only.',
      severity: 'ok',
    };
  }

  const { stats, index } = analysis;
  const parts = [];
  let severity = 'ok';

  if (stats.stressedShare > 0.35) {
    severity = 'alert';
    parts.push(`${Math.round(stats.stressedShare * 100)}% of canopy below the ${index.short} floor`);
  }

  const deficitPct = Math.round(stats.zoneDeficit * 100);
  const weakPct = Math.round(stats.relativeStressShare * 100);
  if (stats.zoneDeficit > 0.2) {
    severity = 'alert';
    parts.push(`weak zones are ${deficitPct}% down on the best of this field`);
  } else if (stats.zoneDeficit > 0.08) {
    if (severity !== 'alert') severity = 'watch';
    parts.push(`weak zones ${deficitPct}% below the field's best tenth`);
  }
  if (weakPct >= 5) parts.push(`${weakPct}% of zones worth walking to`);

  if (analysis.necrosisShare > 0.08) {
    severity = 'alert';
    parts.push(`${Math.round(analysis.necrosisShare * 100)}% necrotic tissue — lesions or burn`);
  }
  if (analysis.chlorosisShare > 0.12) {
    if (severity !== 'alert') severity = 'watch';
    parts.push(`${Math.round(analysis.chlorosisShare * 100)}% yellowing — consistent with nitrogen shortfall`);
  }
  if (stats.cv > 0.45) {
    if (severity !== 'alert') severity = 'watch';
    parts.push('patchy across the frame, not uniform');
  }

  if (baseline && Number.isFinite(baseline.mean)) {
    const drop = baseline.mean - stats.mean;
    if (drop > 0.04) {
      severity = severity === 'ok' ? 'watch' : severity;
      parts.push(`down ${drop.toFixed(3)} on this block's last reading`);
    } else if (drop < -0.04) {
      parts.push(`up ${Math.abs(drop).toFixed(3)} on this block's last reading`);
    }
  }

  const headline = {
    ok: 'Canopy looks even',
    watch: 'Worth a closer look',
    alert: 'Canopy stress detected',
  }[severity];

  return {
    headline,
    detail: parts.length
      ? parts.join(' · ')
      : `${index.short} ${stats.mean.toFixed(3)} across ${Math.round(analysis.canopyCover * 100)}% canopy cover`,
    severity,
  };
}
