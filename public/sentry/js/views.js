/**
 * Ways of looking at the same frame.
 *
 * Four of these exist because a night-time perimeter camera is a bad picture in
 * four different ways, and each view fixes one of them. The false-colour view
 * spreads eight bits of murky luminance across a palette the eye can actually
 * discriminate; the silhouette view drops the scene entirely and shows only what
 * the segmenter believes is there, which is the fastest way to see it failing;
 * the motion view accumulates change so a slow subject leaves a trail; the edge
 * view survives glare that washes out everything else.
 *
 * The first of those has a name it must not be given. **This is not thermal
 * imaging.** An ironbow palette applied to visible-light luminance produces an
 * image that looks exactly like a thermal camera's output and carries none of
 * its information: bright means bright, not hot. A white shirt reads "hot" and a
 * person in dark clothing reads "cold". Radiometric temperature needs a
 * long-wave infrared sensor, which no phone and no webcam has, so the palette is
 * labelled by what it actually is everywhere it appears. Getting this wrong is
 * how someone concludes a room is empty because the false-colour view is uniform.
 *
 * @module sentry/views
 */

/** The views the renderer can produce. */
export const VIEWS = Object.freeze([
  { id: 'natural', label: 'Natural', hint: 'The camera, untouched.' },
  { id: 'ironbow', label: 'Ironbow', hint: 'Brightness as colour. Not temperature.' },
  { id: 'motion', label: 'Motion', hint: 'Change since the background settled.' },
  { id: 'silhouette', label: 'Silhouette', hint: 'What the segmenter thinks is there.' },
  { id: 'edges', label: 'Edges', hint: 'Outlines only — survives glare.' },
]);

/**
 * Ironbow palette: black through purple and red to white.
 *
 * The classic thermographer's ramp, chosen because it is monotone in perceived
 * lightness — every step up the scale looks brighter than the last — which is
 * what makes small differences visible where a rainbow palette would invent
 * banding that is not in the data.
 *
 * @param {number} t Position on the ramp, 0 to 1.
 * @returns {[number, number, number]} Red, green and blue, 0–255.
 */
export function ironbow(t) {
  const x = Math.min(1, Math.max(0, t));
  const stops = [
    [0, 0, 0, 0],
    [0.15, 26, 8, 68],
    [0.32, 92, 12, 110],
    [0.5, 158, 34, 88],
    [0.66, 214, 78, 32],
    [0.82, 246, 148, 12],
    [0.93, 252, 214, 74],
    [1, 255, 255, 236],
  ];
  for (let i = 1; i < stops.length; i += 1) {
    if (x > stops[i][0]) continue;
    const [t0, r0, g0, b0] = stops[i - 1];
    const [t1, r1, g1, b1] = stops[i];
    const a = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
    return [
      Math.round(r0 + (r1 - r0) * a),
      Math.round(g0 + (g1 - g0) * a),
      Math.round(b0 + (b1 - b0) * a),
    ];
  }
  return [255, 255, 236];
}

/**
 * A 256-entry lookup of the palette, so the per-pixel path is an array read.
 *
 * @returns {Uint8ClampedArray} RGB triples for luminance 0–255.
 */
export function ironbowTable() {
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const [r, g, b] = ironbow(i / 255);
    table[i * 3] = r;
    table[i * 3 + 1] = g;
    table[i * 3 + 2] = b;
  }
  return table;
}

const IRONBOW = ironbowTable();

/**
 * Contrast bounds that put most of the frame across the full palette.
 *
 * A raw night frame occupies perhaps forty of the two hundred and fifty-six
 * available levels, so mapping 0–255 onto the ramp wastes almost all of it. The
 * second and ninety-eighth percentiles are used rather than the extremes,
 * because a single blown streetlight pixel would otherwise set the top of the
 * scale and flatten everything else.
 *
 * @param {{data: Uint8ClampedArray}} frame RGBA pixels.
 * @returns {{low: number, high: number}} Luminance bounds to stretch between.
 */
export function contrastBounds(frame) {
  const histogram = new Uint32Array(256);
  const data = frame.data;
  let total = 0;
  for (let p = 0; p < data.length; p += 4) {
    const y = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    histogram[y] += 1;
    total += 1;
  }
  if (!total) return { low: 0, high: 255 };
  const lowTarget = total * 0.02;
  const highTarget = total * 0.98;
  let seen = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i += 1) {
    seen += histogram[i];
    if (seen >= lowTarget) {
      low = i;
      break;
    }
  }
  seen = 0;
  for (let i = 0; i < 256; i += 1) {
    seen += histogram[i];
    if (seen >= highTarget) {
      high = i;
      break;
    }
  }
  if (high - low < 16) return { low: Math.max(0, low - 8), high: Math.min(255, low + 8) };
  return { low, high };
}

/**
 * Render one of the views into an output buffer.
 *
 * @param {string} view A view id from {@link VIEWS}.
 * @param {object} input Everything the views can draw from.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} input.frame
 *   Source pixels.
 * @param {Uint8Array} [input.mask] Foreground mask from the segmenter.
 * @param {Float32Array} [input.energy] Per-pixel change magnitude.
 * @param {Float32Array} [input.trail] Decaying accumulation of past change.
 * @param {ImageData} output Destination, same dimensions as the frame.
 * @returns {ImageData} The destination, filled.
 */
export function render(view, input, output) {
  const { frame, mask = null, energy = null, trail = null } = input;
  const src = frame.data;
  const dst = output.data;
  const n = frame.width * frame.height;

  if (view === 'ironbow') {
    const { low, high } = contrastBounds(frame);
    const span = Math.max(1, high - low);
    for (let i = 0; i < n; i += 1) {
      const p = i * 4;
      const y = (src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29) >> 8;
      const stretched = Math.min(255, Math.max(0, Math.round(((y - low) * 255) / span)));
      const t = stretched * 3;
      dst[p] = IRONBOW[t];
      dst[p + 1] = IRONBOW[t + 1];
      dst[p + 2] = IRONBOW[t + 2];
      dst[p + 3] = 255;
    }
    return output;
  }

  if (view === 'motion') {
    for (let i = 0; i < n; i += 1) {
      const p = i * 4;
      const level = trail ? trail[i] : energy ? energy[i] : 0;
      const t = Math.min(255, Math.round(level * 4)) * 3;
      // Keep a dim version of the scene underneath so the trail has somewhere
      // to be: a pure difference image is unreadable as a place.
      const base = ((src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29) >> 8) * 0.22;
      dst[p] = Math.min(255, base + IRONBOW[t]);
      dst[p + 1] = Math.min(255, base + IRONBOW[t + 1]);
      dst[p + 2] = Math.min(255, base + IRONBOW[t + 2]);
      dst[p + 3] = 255;
    }
    return output;
  }

  if (view === 'silhouette') {
    for (let i = 0; i < n; i += 1) {
      const p = i * 4;
      const on = mask ? mask[i] : 0;
      const base = ((src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29) >> 8) * 0.18;
      dst[p] = on ? 96 : base;
      dst[p + 1] = on ? 244 : base;
      dst[p + 2] = on ? 196 : base * 1.15;
      dst[p + 3] = 255;
    }
    return output;
  }

  if (view === 'edges') {
    const { width, height } = frame;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const p = i * 4;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          dst[p] = dst[p + 1] = dst[p + 2] = 0;
          dst[p + 3] = 255;
          continue;
        }
        const at = (xx, yy) => {
          const q = (yy * width + xx) * 4;
          return (src[q] * 77 + src[q + 1] * 150 + src[q + 2] * 29) >> 8;
        };
        // Sobel, unrolled: three multiplies a tap and no inner loop, because
        // this runs on every pixel of every frame on a phone.
        const gx =
          -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
          at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy =
          -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
          at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const magnitude = Math.min(255, Math.hypot(gx, gy));
        dst[p] = magnitude * 0.55;
        dst[p + 1] = magnitude;
        dst[p + 2] = magnitude * 0.82;
        dst[p + 3] = 255;
      }
    }
    return output;
  }

  dst.set(src);
  return output;
}

/**
 * Decay and add to the motion trail.
 *
 * The half-life is what makes a slow subject visible: change from four seconds
 * ago is still faintly on screen, so a path emerges from motion too gradual to
 * notice frame by frame.
 *
 * @param {Float32Array} trail Accumulator, updated in place.
 * @param {Float32Array} energy This frame's change magnitude.
 * @param {number} [decay=0.94] Fraction retained per frame.
 * @returns {Float32Array} The accumulator.
 */
export function accumulate(trail, energy, decay = 0.94) {
  for (let i = 0; i < trail.length; i += 1) {
    const kept = trail[i] * decay;
    trail[i] = energy[i] > kept ? energy[i] : kept;
  }
  return trail;
}
