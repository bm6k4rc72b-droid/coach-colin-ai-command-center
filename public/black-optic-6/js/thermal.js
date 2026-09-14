/**
 * Thermal rendering: every palette a thermal camera offers, and one hard rule.
 *
 * A thermal "view" is not a camera mode. It is a colour ramp applied to a field
 * of numbers, plus a decision about which two numbers sit at the ends of that
 * ramp. Every palette on every FLIR, Seek and Hikvision is that same operation
 * with different control points, which is why all of them are here and why they
 * are cheap to add.
 *
 * The rule is about what the field contains, and it is the reason this module
 * exists rather than a palette array:
 *
 * - **Radiometric** — a linked camera reporting a temperature per pixel. Spot
 *   readings, isotherms and area statistics are in degrees and mean something.
 * - **Thermal** — a thermal camera sending a picture rather than measurements.
 *   Hotter is brighter and that is all; degrees are unavailable and the console
 *   refuses to invent them.
 * - **Luminance** — an ordinary camera. The palettes still apply, and what they
 *   are colouring is *brightness*, not heat. A white shirt in shade will paint
 *   hotter than a face in sun, which is exactly backwards.
 *
 * That last case is the one that matters, because an ironbow ramp over a
 * night-time frame looks convincingly like thermal imaging and is nothing of the
 * kind — it is the single most common way this genre misleads. So the source is
 * carried with the field, temperature readouts are withheld unless the source
 * can support them, and {@link canReadTemperature} is what the interface asks
 * before printing a number with a degree sign on it.
 *
 * @module black-optic-6/thermal
 */

/**
 * A colour ramp.
 *
 * @typedef {object} Palette
 * @property {string} id Identifier.
 * @property {string} name What the camera makers call it.
 * @property {Array<[number, number, number, number]>} stops Position 0..1, then red, green, blue.
 * @property {string} use When a thermographer reaches for it.
 */

/** Every palette, in the order a camera menu tends to list them. */
export const PALETTES = Object.freeze([
  {
    id: 'white-hot',
    name: 'White Hot',
    stops: [[0, 0, 0, 0], [1, 255, 255, 255]],
    use: 'The default, and the one to search with. Nothing distracts, and the eye finds a warm shape against a cold field faster than in any colour ramp.',
  },
  {
    id: 'black-hot',
    name: 'Black Hot',
    stops: [[0, 255, 255, 255], [1, 0, 0, 0]],
    use: 'White Hot inverted. Faces and animals read more naturally, which is why hunters and search teams tend to prefer it.',
  },
  {
    id: 'ironbow',
    name: 'Ironbow',
    stops: [
      [0, 0, 0, 12], [0.18, 40, 8, 90], [0.36, 120, 20, 120],
      [0.54, 200, 50, 70], [0.72, 245, 120, 20], [0.88, 255, 205, 40], [1, 255, 255, 235],
    ],
    use: 'The classic. Monotone in lightness, so every step up looks brighter than the last and small differences survive being looked at quickly.',
  },
  {
    id: 'lava',
    name: 'Lava',
    stops: [
      [0, 0, 0, 0], [0.25, 70, 0, 0], [0.5, 180, 20, 0],
      [0.72, 240, 110, 0], [0.9, 255, 210, 60], [1, 255, 255, 255],
    ],
    use: 'Ironbow without the purple. Cleaner on hot targets — machinery, exhausts, a fire — where the low end does not matter.',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    stops: [
      [0, 0, 0, 24], [0.3, 10, 40, 110], [0.55, 20, 110, 170],
      [0.75, 180, 190, 60], [0.9, 250, 220, 90], [1, 255, 255, 255],
    ],
    use: 'Cold field in blue, warm targets in yellow. Good outdoors at night, where most of the frame is genuinely cold.',
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    stops: [
      [0, 10, 10, 120], [0.25, 0, 150, 200], [0.5, 40, 180, 60],
      [0.75, 240, 220, 40], [1, 220, 30, 30],
    ],
    use: 'Maximum discrimination across a narrow span. Useful for finding a small difference; bad for judging absolute heat, because the eye cannot rank hues.',
  },
  {
    id: 'rainbow-hc',
    name: 'Rainbow HC',
    stops: [
      [0, 0, 0, 0], [0.16, 20, 20, 160], [0.34, 0, 170, 210], [0.5, 30, 190, 60],
      [0.68, 245, 225, 40], [0.85, 235, 60, 30], [1, 255, 255, 255],
    ],
    use: 'High-contrast rainbow with black and white on the ends. Finds the extremes fast and bands everything in between.',
  },
  {
    id: 'amber',
    name: 'Amber',
    stops: [[0, 0, 0, 0], [0.5, 120, 60, 0], [0.8, 230, 150, 20], [1, 255, 230, 170]],
    use: 'Monochrome amber. Easy on night-adapted eyes over a long watch, which is the whole reason it exists.',
  },
  {
    id: 'sepia',
    name: 'Sepia',
    stops: [[0, 10, 6, 0], [0.4, 90, 60, 35], [0.75, 190, 150, 105], [1, 255, 240, 220]],
    use: 'Low-contrast and restful. For staring at a scene for an hour without fatigue.',
  },
  {
    id: 'glowbow',
    name: 'Glowbow',
    stops: [
      [0, 0, 0, 0], [0.2, 60, 0, 60], [0.42, 170, 20, 60],
      [0.62, 240, 90, 30], [0.8, 255, 180, 40], [0.93, 255, 245, 150], [1, 235, 250, 255],
    ],
    use: 'Ironbow pushed brighter at the top. Separates several warm things from each other rather than from the background.',
  },
  {
    id: 'rain',
    name: 'Rain',
    stops: [
      [0, 0, 0, 0], [0.2, 0, 30, 90], [0.45, 0, 120, 120],
      [0.65, 60, 180, 60], [0.82, 240, 210, 50], [1, 230, 60, 40],
    ],
    use: 'The medical ramp. Built for small differences across skin, and it shows them on anything else with a narrow span too.',
  },
  {
    id: 'green-hot',
    name: 'Green Hot',
    stops: [[0, 0, 0, 0], [0.45, 0, 80, 20], [0.78, 60, 210, 60], [1, 220, 255, 210]],
    use: 'The image-intensifier look. No real advantage over White Hot, and it is what people expect night vision to look like.',
  },
  {
    id: 'red-hot',
    name: 'Red Hot',
    stops: [[0, 0, 0, 0], [0.5, 110, 0, 0], [0.82, 235, 40, 20], [1, 255, 220, 200]],
    use: 'Monochrome red. Preserves dark adaptation better than anything else here, at the cost of dynamic range.',
  },
]);

/** What a field's numbers actually are, and what may be said about them. */
export const SOURCES = Object.freeze({
  RADIOMETRIC: {
    id: 'RADIOMETRIC',
    label: 'Radiometric',
    unit: '°C',
    temperature: true,
    provenance: 'LINK',
    meaning: 'A linked camera reporting a calibrated temperature per pixel. Spot readings and isotherms are in degrees.',
  },
  THERMAL: {
    id: 'THERMAL',
    label: 'Thermal (image only)',
    unit: '',
    temperature: false,
    provenance: 'LINK',
    meaning: 'A thermal camera sending a picture rather than measurements. Hotter is brighter; there are no degrees in the signal to report.',
  },
  LUMINANCE: {
    id: 'LUMINANCE',
    label: 'Visible light',
    unit: '',
    temperature: false,
    provenance: 'MODEL',
    meaning: 'An ordinary camera. These palettes are colouring brightness, not heat — a white shirt in shade paints hotter than a face in sun.',
  },
});

/**
 * Whether a source supports printing a temperature.
 *
 * @param {string} sourceId Source identifier.
 * @returns {boolean} True only for a radiometric feed.
 */
export function canReadTemperature(sourceId) {
  return Boolean(SOURCES[sourceId]?.temperature);
}

/**
 * Look up a palette, falling back to the one that misleads least.
 *
 * @param {string} id Palette identifier.
 * @returns {Palette} The palette.
 */
export function paletteFor(id) {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

/**
 * Expand a palette into a 256-entry lookup table.
 *
 * Interpolated once and reused for every pixel of every frame; computing the
 * ramp per pixel is the difference between thirty frames a second and four.
 *
 * @param {Palette} palette The palette.
 * @returns {Uint8ClampedArray} 768 bytes, red green blue per step.
 */
export function rampTable(palette) {
  const table = new Uint8ClampedArray(256 * 3);
  const stops = palette.stops;
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let upper = 1;
    while (upper < stops.length - 1 && stops[upper][0] < t) upper += 1;
    const a = stops[upper - 1];
    const b = stops[upper];
    const span = Math.max(1e-6, b[0] - a[0]);
    const k = Math.max(0, Math.min(1, (t - a[0]) / span));
    table[i * 3] = a[1] + (b[1] - a[1]) * k;
    table[i * 3 + 1] = a[2] + (b[2] - a[2]) * k;
    table[i * 3 + 2] = a[3] + (b[3] - a[3]) * k;
  }
  return table;
}

/**
 * Automatic gain: the two values that should sit at the ends of the ramp.
 *
 * Percentiles rather than the true minimum and maximum, because one dead pixel
 * or one patch of sky sets the scale for the entire frame and flattens
 * everything a watcher actually cares about. This is what every thermal camera
 * is doing when its picture "adjusts itself" as you pan.
 *
 * @param {ArrayLike<number>} field The scalar field.
 * @param {object} [options] Percentile bounds.
 * @param {number} [options.low=0.02] Lower percentile.
 * @param {number} [options.high=0.98] Upper percentile.
 * @returns {{low: number, high: number, span: number}} The ends of the ramp.
 */
export function autoGain(field, options = {}) {
  const lowQ = options.low ?? 0.02;
  const highQ = options.high ?? 0.98;
  const sample = [];
  // Every pixel is unnecessary; a stride is stable and far cheaper per frame.
  const stride = Math.max(1, Math.floor(field.length / 4096));
  for (let i = 0; i < field.length; i += stride) {
    const value = field[i];
    if (Number.isFinite(value)) sample.push(value);
  }
  if (!sample.length) return { low: 0, high: 1, span: 1 };
  sample.sort((a, b) => a - b);
  const at = (q) => sample[Math.min(sample.length - 1, Math.max(0, Math.floor(q * sample.length)))];
  const low = at(lowQ);
  const high = at(highQ);
  const span = Math.max(1e-6, high - low);
  return { low, high, span };
}

/**
 * Manual level and span, the way a thermographer sets a scale by hand.
 *
 * Automatic gain re-scales as the scene changes, which makes two frames
 * incomparable. Fixing the ends is how a thermal image stops being a picture and
 * starts being a measurement you can put beside yesterday's.
 *
 * @param {number} level Centre of the scale.
 * @param {number} span Width of the scale.
 * @returns {{low: number, high: number, span: number}} The ends of the ramp.
 */
export function manualGain(level, span) {
  const width = Math.max(1e-6, span);
  return { low: level - width / 2, high: level + width / 2, span: width };
}

/** Isotherm modes: which part of the scale gets picked out. */
export const ISOTHERM_MODES = Object.freeze([
  { id: 'off', name: 'Off', note: 'No highlight.' },
  { id: 'above', name: 'Above', note: 'Everything hotter than the threshold, in alarm colour.' },
  { id: 'below', name: 'Below', note: 'Everything colder than the threshold — insulation gaps, water ingress.' },
  { id: 'between', name: 'Band', note: 'A window of the scale. The way a body is picked out of a warm background.' },
]);

/**
 * Whether a value falls inside an isotherm.
 *
 * @param {number} value The field value.
 * @param {{mode: string, low: number, high: number}} isotherm The isotherm setting.
 * @returns {boolean} True if it should be highlighted.
 */
export function inIsotherm(value, isotherm) {
  if (!isotherm || isotherm.mode === 'off' || !Number.isFinite(value)) return false;
  if (isotherm.mode === 'above') return value >= isotherm.low;
  if (isotherm.mode === 'below') return value <= isotherm.high;
  return value >= isotherm.low && value <= isotherm.high;
}

/**
 * Correct a measured temperature for emissivity and reflected background.
 *
 * The correction most people skip and then misread their own camera. A thermal
 * camera measures radiance and converts it assuming a perfect emitter; a shiny
 * surface emits less and reflects its surroundings, so bare metal reads far
 * colder than it is. Skin, soil, painted surfaces and vegetation are all close
 * to 0.95 and need almost none of this — polished steel at 0.1 needs all of it.
 *
 * Stefan-Boltzmann in kelvin: the reflected component is removed before the
 * fourth root, which is why a large correction is not a linear offset.
 *
 * @param {number} measuredC Temperature as reported by the camera, in Celsius.
 * @param {number} emissivity Surface emissivity, 0..1.
 * @param {number} reflectedC Temperature of the surroundings, in Celsius.
 * @returns {number} Corrected object temperature in Celsius.
 */
export function emissivityCorrect(measuredC, emissivity, reflectedC) {
  const e = Math.max(0.01, Math.min(1, emissivity));
  const measuredK = measuredC + 273.15;
  const reflectedK = reflectedC + 273.15;
  const objectK4 = (measuredK ** 4 - (1 - e) * reflectedK ** 4) / e;
  if (objectK4 <= 0) return measuredC;
  return objectK4 ** 0.25 - 273.15;
}

/** Emissivity of things a ranch camera is actually pointed at. */
export const EMISSIVITY = Object.freeze([
  { name: 'Skin', value: 0.98 },
  { name: 'Vegetation, soil', value: 0.95 },
  { name: 'Painted surfaces, brick', value: 0.94 },
  { name: 'Water', value: 0.96 },
  { name: 'Oxidised steel', value: 0.8 },
  { name: 'Galvanised sheet', value: 0.28 },
  { name: 'Polished aluminium', value: 0.05 },
]);

/**
 * The value at a point — the spot meter every thermal camera has.
 *
 * @param {ArrayLike<number>} field The scalar field.
 * @param {number} width Field width.
 * @param {number} x Column.
 * @param {number} y Row.
 * @param {number} [radius=1] Averaging radius, in pixels.
 * @returns {number|null} The mean value around the point, or null if out of frame.
 */
export function spot(field, width, x, y, radius = 1) {
  const height = field.length / width;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  let sum = 0;
  let count = 0;
  for (let row = y - radius; row <= y + radius; row += 1) {
    for (let col = x - radius; col <= x + radius; col += 1) {
      if (col < 0 || row < 0 || col >= width || row >= height) continue;
      const value = field[row * width + col];
      if (!Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
  }
  return count ? sum / count : null;
}

/**
 * Minimum, maximum and mean inside a box — the area measurement tool.
 *
 * @param {ArrayLike<number>} field The scalar field.
 * @param {number} width Field width.
 * @param {{x: number, y: number, w: number, h: number}} box The region.
 * @returns {{min: number, max: number, mean: number, count: number,
 *   hotspot: {x: number, y: number}|null}} The statistics.
 */
export function areaStats(field, width, box) {
  const height = field.length / width;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  let hotspot = null;

  for (let row = Math.max(0, box.y); row < Math.min(height, box.y + box.h); row += 1) {
    for (let col = Math.max(0, box.x); col < Math.min(width, box.x + box.w); col += 1) {
      const value = field[row * width + col];
      if (!Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) {
        max = value;
        hotspot = { x: col, y: row };
      }
      sum += value;
      count += 1;
    }
  }

  if (!count) return { min: NaN, max: NaN, mean: NaN, count: 0, hotspot: null };
  return { min, max, mean: sum / count, count, hotspot };
}

/**
 * Extract a scalar field from an ordinary colour frame.
 *
 * Rec. 709 luminance. The result is brightness and is tagged as such — this is
 * the function that makes a visible camera renderable with thermal palettes, and
 * the tag is what stops the result being read as heat.
 *
 * @param {ImageData} frame The source frame.
 * @returns {{field: Float32Array, width: number, height: number, source: string}}
 *   The field, marked as luminance.
 */
export function luminanceField(frame) {
  const count = frame.width * frame.height;
  const field = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    field[i] = (0.2126 * frame.data[p] + 0.7152 * frame.data[p + 1] + 0.0722 * frame.data[p + 2]) / 255;
  }
  return { field, width: frame.width, height: frame.height, source: 'LUMINANCE' };
}

/**
 * Render a field through a palette.
 *
 * @param {object} input The field to draw.
 * @param {ArrayLike<number>} input.field Scalar values.
 * @param {number} input.width Field width.
 * @param {ImageData} output Destination, matching the field's dimensions.
 * @param {object} options Rendering settings.
 * @param {Uint8ClampedArray} options.ramp Palette lookup table.
 * @param {{low: number, span: number}} options.gain Ends of the scale.
 * @param {{mode: string, low: number, high: number, colour: [number, number, number]}} [options.isotherm]
 *   Highlight settings.
 * @param {ImageData} [options.fusion] Visible frame to blend edges from.
 * @param {number} [options.fusionStrength=0] How much edge detail to lay over, 0..1.
 * @returns {ImageData} The destination, filled.
 */
export function render(input, output, options) {
  const { field, width } = input;
  const { ramp, gain, isotherm = null, fusion = null, fusionStrength = 0 } = options;
  const dst = output.data;
  const count = field.length;
  const height = count / width;
  const alarm = isotherm?.colour ?? [255, 59, 78];

  for (let i = 0; i < count; i += 1) {
    const value = field[i];
    const p = i * 4;

    if (!Number.isFinite(value)) {
      dst[p] = 8;
      dst[p + 1] = 10;
      dst[p + 2] = 14;
      dst[p + 3] = 255;
      continue;
    }

    if (inIsotherm(value, isotherm)) {
      dst[p] = alarm[0];
      dst[p + 1] = alarm[1];
      dst[p + 2] = alarm[2];
      dst[p + 3] = 255;
      continue;
    }

    const t = Math.max(0, Math.min(255, Math.round(((value - gain.low) / gain.span) * 255)));
    dst[p] = ramp[t * 3];
    dst[p + 1] = ramp[t * 3 + 1];
    dst[p + 2] = ramp[t * 3 + 2];
    dst[p + 3] = 255;
  }

  // Fusion: outlines from the visible camera laid over the thermal picture. A
  // thermal image has no edges a person can navigate by — a doorway and the wall
  // beside it are the same temperature — so borrowing the edges is what makes
  // the frame legible without pretending the detail is thermal.
  if (fusion && fusionStrength > 0) {
    const strength = Math.min(1, fusionStrength);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        const left = luminanceAt(fusion, i - 1);
        const right = luminanceAt(fusion, i + 1);
        const up = luminanceAt(fusion, i - width);
        const down = luminanceAt(fusion, i + width);
        const edge = Math.min(255, (Math.abs(right - left) + Math.abs(down - up)) * 2);
        if (edge < 24) continue;
        const p = i * 4;
        const lift = (edge / 255) * strength * 255;
        dst[p] = Math.min(255, dst[p] + lift);
        dst[p + 1] = Math.min(255, dst[p + 1] + lift);
        dst[p + 2] = Math.min(255, dst[p + 2] + lift);
      }
    }
  }

  return output;
}

/**
 * Luminance of one pixel of a frame.
 *
 * @param {ImageData} frame The frame.
 * @param {number} index Pixel index.
 * @returns {number} Luminance, 0–255.
 */
function luminanceAt(frame, index) {
  const p = index * 4;
  return 0.2126 * frame.data[p] + 0.7152 * frame.data[p + 1] + 0.0722 * frame.data[p + 2];
}

/**
 * What may honestly be said about a reading from this source.
 *
 * @param {string} sourceId Source identifier.
 * @param {number|null} value The raw field value.
 * @returns {{text: string, temperature: boolean, note: string}} How to print it.
 */
export function readout(sourceId, value) {
  const source = SOURCES[sourceId] ?? SOURCES.LUMINANCE;
  if (value === null || !Number.isFinite(value)) {
    return { text: '—', temperature: false, note: source.meaning };
  }
  if (source.temperature) {
    return { text: `${value.toFixed(1)} °C`, temperature: true, note: source.meaning };
  }
  // Deliberately unitless. A number with a degree sign on it, taken from a field
  // that contains no temperature, is the failure this whole module is arranged
  // to prevent.
  return {
    text: `${(value * 100).toFixed(0)}% of scale`,
    temperature: false,
    note: source.meaning,
  };
}
