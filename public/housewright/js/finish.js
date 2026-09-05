/**
 * What a photograph can honestly tell you about a room.
 *
 * This is the part of the app most likely to be oversold, so its limits are
 * stated in the output itself. A downscaled frame contains real, measurable
 * facts — how bright the room is, how much of the light is daylight-coloured,
 * how much of the frame is blown out or crushed to black, how busy the
 * surfaces are. Those facts correlate usefully with the things a stager or a
 * renovation lead cares about: dim rooms, yellowed builder-grade lighting,
 * cluttered sightlines, dated warm-toned finishes.
 *
 * They are not a diagnosis. This module therefore emits *signals* with
 * confidences and plain-English evidence, never verdicts, and the report
 * engine treats them as one input among the measured geometry rather than as
 * ground truth. Nothing here is a claim about a specific material.
 *
 * @module housewright/finish
 */

import { clamp, remap } from './mathkit.js';

/**
 * Measure one frame.
 *
 * @param {Uint8ClampedArray} rgba Frame pixels.
 * @param {number} w Frame width.
 * @param {number} h Frame height.
 * @param {number} [step=4] Pixel stride; 4 samples every sixteenth pixel.
 * @returns {object} Scalar statistics of the frame, all in 0–1 unless noted.
 */
export function frameStats(rgba, w, h, step = 4) {
  let n = 0;
  let sumL = 0;
  let sumLL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;
  let blown = 0;
  let crushed = 0;
  let edge = 0;
  let previousRow = null;
  let row = new Float32Array(Math.ceil(w / step));

  for (let y = 0; y < h; y += step) {
    let column = 0;
    let lastL = -1;
    for (let x = 0; x < w; x += step, column += 1) {
      const i = (y * w + x) * 4;
      const r = rgba[i] / 255;
      const g = rgba[i + 1] / 255;
      const b = rgba[i + 2] / 255;
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      row[column] = l;
      n += 1;
      sumL += l;
      sumLL += l * l;
      sumR += r;
      sumG += g;
      sumB += b;
      sumSat += max <= 0 ? 0 : (max - min) / max;
      if (l > 0.96) blown += 1;
      if (l < 0.05) crushed += 1;
      if (lastL >= 0) edge += Math.abs(l - lastL);
      if (previousRow && column < previousRow.length) edge += Math.abs(l - previousRow[column]);
      lastL = l;
    }
    previousRow = row.slice(0, column);
  }

  if (!n) {
    return { luma: 0, contrast: 0, saturation: 0, warmth: 0, blown: 0, crushed: 0, detail: 0, samples: 0 };
  }
  const luma = sumL / n;
  const variance = Math.max(sumLL / n - luma * luma, 0);
  const red = sumR / n;
  const blue = sumB / n;
  return {
    luma,
    contrast: Math.sqrt(variance),
    saturation: sumSat / n,
    // Red over blue: incandescent and aged warm-white lamps push this well
    // above 1, north daylight sits below it. A rough correlated-colour cue,
    // not a colour temperature in kelvin, and never called one.
    warmth: blue > 0.001 ? red / blue : 2,
    blown: blown / n,
    crushed: crushed / n,
    detail: clamp(edge / (n * 2) * 6, 0, 1),
    samples: n,
  };
}

/**
 * Average a set of frame measurements.
 *
 * One frame is a moment; a room is a walk around it. The app samples several
 * frames per room and averages here so a single backlit shot out of a window
 * does not decide the whole verdict.
 *
 * @param {Array<object>} list Results of `frameStats`.
 * @returns {object} The mean of them, or a zeroed record when empty.
 */
export function meanStats(list) {
  const usable = list.filter((s) => s && s.samples > 0);
  if (!usable.length) return frameStats(new Uint8ClampedArray(0), 0, 0);
  const keys = ['luma', 'contrast', 'saturation', 'warmth', 'blown', 'crushed', 'detail'];
  const out = { samples: usable.length };
  for (const key of keys) {
    out[key] = usable.reduce((sum, s) => sum + s[key], 0) / usable.length;
  }
  return out;
}

/**
 * Turn frame statistics and geometry into named, evidenced signals.
 *
 * @param {object} stats From `meanStats`.
 * @param {object} [room] The measured room, when there is one. Its ceiling
 *   height and glazing ratio carry more weight than anything the pixels say.
 * @returns {Array<{id: string, label: string, confidence: number, evidence: string}>}
 *   Signals worth acting on, strongest first.
 */
export function signals(stats, room = null) {
  const found = [];
  const push = (id, label, confidence, evidence) => {
    if (confidence >= 0.25) found.push({ id, label, confidence: clamp(confidence, 0, 1), evidence });
  };

  push(
    'dim',
    'Reads dark on camera',
    remap(stats.luma, 0.34, 0.14, 0, 1),
    `mean brightness ${(stats.luma * 100).toFixed(0)}%, with ${(stats.crushed * 100).toFixed(0)}% of the frame crushed to black`,
  );

  push(
    'warm-cast',
    'Yellow-cast lighting',
    remap(stats.warmth, 1.16, 1.5, 0, 1),
    `red channel runs ${((stats.warmth - 1) * 100).toFixed(0)}% hotter than blue — the signature of aged warm-white lamps`,
  );

  push(
    'flat',
    'Flat, low-contrast surfaces',
    remap(stats.contrast, 0.19, 0.07, 0, 1) * remap(stats.luma, 0.1, 0.3, 0.3, 1),
    `luminance spread of ${(stats.contrast * 100).toFixed(0)} points — little modelling from the light that is there`,
  );

  push(
    'busy',
    'Busy sightlines',
    remap(stats.detail, 0.42, 0.72, 0, 1),
    `${(stats.detail * 100).toFixed(0)}% edge density across the frame`,
  );

  push(
    'blown-glazing',
    'Windows blowing out against the interior',
    remap(stats.blown, 0.04, 0.16, 0, 1),
    `${(stats.blown * 100).toFixed(0)}% of the frame clipped white — the interior is far darker than outside`,
  );

  if (room) {
    if (room.ceiling > 0) {
      push(
        'low-ceiling',
        'Ceiling below the market expectation',
        remap(room.ceiling, 2.5, 2.28, 0, 1),
        `measured ${room.ceiling.toFixed(2)} m — buyers in an elevated tier read anything under 2.7 m as builder-grade`,
      );
      push(
        'tall-ceiling',
        'Height worth making visible',
        remap(room.ceiling, 2.85, 3.4, 0, 1),
        `measured ${room.ceiling.toFixed(2)} m of clear height that the current fit-out is not using`,
      );
    }
    const glazing = room.area > 0 ? room.glazedArea / room.area : 0;
    if (room.openings && room.openings.length) {
      push(
        'under-glazed',
        'Under-glazed for its floor area',
        remap(glazing, 0.1, 0.045, 0, 1),
        `${(glazing * 100).toFixed(1)}% glass to floor, against roughly 10% for a room that feels daylit`,
      );
    }
    if (room.area > 26 && room.ceiling < 2.6) {
      push('squat', 'Large footprint under a low lid', 0.5,
        `${Math.round(room.areaSqft)} sq ft under a ${room.ceiling.toFixed(2)} m ceiling reads squat`);
    }
  }

  return found.sort((a, b) => b.confidence - a.confidence);
}

/**
 * A single 0–1 read on how well a room presents as photographed.
 *
 * @param {object} stats From `meanStats`.
 * @param {object} [room] The measured room.
 * @returns {{score: number, band: string}} The score and its plain label.
 */
export function presentation(stats, room = null) {
  const light = remap(stats.luma, 0.12, 0.4, 0, 1);
  const modelling = remap(stats.contrast, 0.05, 0.2, 0, 1);
  const neutral = 1 - remap(stats.warmth, 1.1, 1.55, 0, 1);
  const calm = 1 - remap(stats.detail, 0.45, 0.8, 0, 1);
  const height = room ? remap(room.ceiling, 2.3, 3.05, 0.4, 1) : 0.7;
  const score = clamp(light * 0.3 + modelling * 0.15 + neutral * 0.2 + calm * 0.15 + height * 0.2, 0, 1);
  const band = score > 0.78 ? 'photographs well as-is'
    : score > 0.58 ? 'presentable, gains from staging'
      : score > 0.38 ? 'needs light and styling work before listing'
        : 'will not photograph well until the light is fixed';
  return { score, band };
}
