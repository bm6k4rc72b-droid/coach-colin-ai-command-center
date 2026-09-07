/**
 * Turning a measured frame into a picture somebody can read.
 *
 * The camera view is an instrument, not a photograph, and it is treated as
 * one. Three things happen to every frame before it is shown:
 *
 * **It is graded, not displayed.** A raw webcam frame of a dim hallway is a
 * brown smear in which none of the reasoning is visible. The frame is stretched
 * between its own second and ninety-eighth percentiles and mapped through a
 * warm monochrome ramp, so the picture has the same contrast at midnight as at
 * noon. The ramp is labelled a palette, not a thermal image: bright means
 * bright, never hot. There is no thermal sensor in any phone, and an interface
 * that lets somebody conclude a room is empty because it looks cold would be
 * dangerous rather than merely wrong.
 *
 * **The evidence is drawn on top of it, all of it.** Not a box around a
 * person — the head row, the floor row, whether the floor row was seen or
 * coasted, the declared furniture, the rest zones, and the numbers. Somebody
 * looking at this screen should be able to see *why* the console believes what
 * it believes and to catch it being wrong. A detector that shows only its
 * conclusion cannot be argued with, and this one has to be.
 *
 * **A coasted floor reference is drawn differently from an observed one.** It
 * is dashed. That single visual distinction is the whole occlusion story made
 * visible: a solid line means the feet were seen, a dashed one means the app
 * is carrying a memory forward and knows it.
 *
 * @module aegis/views
 */

import { clamp } from './mathkit.js';

/** The grading ramps on offer. */
export const RAMPS = Object.freeze([
  { id: 'obsidian', label: 'Obsidian', hint: 'Warm monochrome. The default, and the one to present in.' },
  { id: 'plain', label: 'Plain', hint: 'The camera as it is, ungraded.' },
  { id: 'edges', label: 'Structure', hint: 'Edges only. Shows what the segmenter has to work with.' },
]);

/**
 * The obsidian ramp: black through bronze to champagne.
 *
 * @param {number} t Position along the ramp, 0–1.
 * @returns {[number, number, number]} An RGB triple.
 */
export function obsidian(t) {
  const x = clamp(t, 0, 1);
  const stops = [
    [0.00, [6, 7, 11]],
    [0.22, [26, 26, 38]],
    [0.45, [72, 58, 52]],
    [0.68, [140, 106, 62]],
    [0.86, [206, 168, 96]],
    [1.00, [246, 233, 202]],
  ];
  for (let i = 1; i < stops.length; i += 1) {
    if (x > stops[i][0]) continue;
    const [x0, c0] = stops[i - 1];
    const [x1, c1] = stops[i];
    const u = (x - x0) / (x1 - x0);
    return [
      Math.round(c0[0] + (c1[0] - c0[0]) * u),
      Math.round(c0[1] + (c1[1] - c0[1]) * u),
      Math.round(c0[2] + (c1[2] - c0[2]) * u),
    ];
  }
  return stops[stops.length - 1][1];
}

/**
 * Precompute the ramp as a lookup table.
 *
 * @returns {Uint8ClampedArray} 256 RGB triples.
 */
export function obsidianTable() {
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const [r, g, b] = obsidian(i / 255);
    table[i * 3] = r;
    table[i * 3 + 1] = g;
    table[i * 3 + 2] = b;
  }
  return table;
}

const TABLE = obsidianTable();

/**
 * Find the contrast bounds of a frame, ignoring its extremes.
 *
 * A single specular highlight — a lamp, a window — otherwise pins the top of
 * the range and leaves the whole room in the bottom fifth of the ramp.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} frame The frame.
 * @returns {{low: number, high: number}} The bounds, 0–255.
 */
export function contrastBounds(frame) {
  const histogram = new Uint32Array(256);
  const { data } = frame;
  const pixels = frame.width * frame.height;
  for (let i = 0; i < pixels; i += 1) {
    const p = i * 4;
    const y = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    histogram[y] += 1;
  }
  const lowTarget = pixels * 0.02;
  const highTarget = pixels * 0.98;
  let seen = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i += 1) {
    seen += histogram[i];
    if (low === 0 && seen >= lowTarget) low = i;
    if (seen >= highTarget) { high = i; break; }
  }
  if (high - low < 12) { low = 0; high = 255; }
  return { low, high };
}

/**
 * Grade a frame into an `ImageData` for display.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} frame The frame.
 * @param {ImageData} output Where to write; same dimensions as the frame.
 * @param {string} [ramp] Which ramp, from {@link RAMPS}.
 * @returns {ImageData} The output, written in place.
 */
export function grade(frame, output, ramp = 'obsidian') {
  const { data } = frame;
  const out = output.data;
  const pixels = frame.width * frame.height;
  if (ramp === 'plain') {
    out.set(data.subarray(0, pixels * 4));
    return output;
  }
  if (ramp === 'edges') {
    const { width } = frame;
    for (let i = 0; i < pixels; i += 1) {
      const p = i * 4;
      const x = i % width;
      const here = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      const rightIndex = x < width - 1 ? p + 4 : p;
      const downIndex = i + width < pixels ? p + width * 4 : p;
      const right = (data[rightIndex] * 77 + data[rightIndex + 1] * 150 + data[rightIndex + 2] * 29) >> 8;
      const down = (data[downIndex] * 77 + data[downIndex + 1] * 150 + data[downIndex + 2] * 29) >> 8;
      const edge = clamp(Math.hypot(here - right, here - down) * 4, 0, 255) | 0;
      out[p] = TABLE[edge * 3];
      out[p + 1] = TABLE[edge * 3 + 1];
      out[p + 2] = TABLE[edge * 3 + 2];
      out[p + 3] = 255;
    }
    return output;
  }
  const { low, high } = contrastBounds(frame);
  const span = Math.max(1, high - low);
  for (let i = 0; i < pixels; i += 1) {
    const p = i * 4;
    const y = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    const scaled = clamp(((y - low) / span) * 255, 0, 255) | 0;
    out[p] = TABLE[scaled * 3];
    out[p + 1] = TABLE[scaled * 3 + 1];
    out[p + 2] = TABLE[scaled * 3 + 2];
    out[p + 3] = 255;
  }
  return output;
}

/** Colours the overlay draws in, matched to the interface. */
export const INK = Object.freeze({
  gold: '#e8c66a',
  jade: '#5ee9b5',
  amber: '#f5b942',
  crimson: '#ff5d6e',
  cool: '#8fd6ff',
  quiet: 'rgba(233, 226, 210, 0.45)',
});

/**
 * Which colour a console level is drawn in.
 *
 * @param {string} level The level.
 * @returns {string} A CSS colour.
 */
export function levelInk(level) {
  if (level === 'alarm') return INK.crimson;
  if (level === 'checking') return INK.amber;
  if (level === 'watching') return INK.cool;
  return INK.jade;
}

/**
 * Draw the evidence over the graded picture.
 *
 * Everything is drawn in *display* pixels rather than by scaling the context
 * to frame coordinates, and that is not fussiness. The analysis frame is a few
 * hundred pixels wide and the panel it is shown in is several times that, so a
 * scaled context multiplies the type and the line weights by the same factor
 * and the readout ends up in inch-high letters across the subject's chest. The
 * geometry is projected; the ink is not.
 *
 * The picture is letterboxed rather than stretched, and the same fit is used
 * here, so a rectangle drawn over a sofa lands on the sofa. Sharing one
 * projection between the picture and the marks is the only way to guarantee
 * that, and the first version of this — which stretched one and uniformly
 * scaled the other — put every zone in the wrong place on any panel that was
 * not exactly four by three.
 *
 * @param {CanvasRenderingContext2D} ctx A context sized to the display box.
 * @param {object} scene What to draw.
 * @param {number} scene.width Frame width.
 * @param {number} scene.height Frame height.
 * @param {number} scene.fit Display pixels per frame pixel.
 * @param {number} scene.offX Left edge of the fitted picture, in display pixels.
 * @param {number} scene.offY Top edge of the fitted picture, in display pixels.
 * @param {number} [scene.dpr] Device pixel ratio, for ink weights.
 * @param {import('./silhouette.js').Region|null} [scene.region] The body.
 * @param {import('./posture.js').Posture} [scene.posture] This frame's reading.
 * @param {import('./kinematics.js').Kinematics} [scene.vision] The state.
 * @param {string} [scene.level] The console level.
 * @param {{x: number, y: number, w: number, h: number, label?: string}[]} [scene.occluders] Furniture.
 * @param {{x: number, y: number, w: number, h: number}[]} [scene.restZones] Rest zones.
 */
export function overlay(ctx, scene) {
  const { width, height, fit, offX, offY, dpr = 1 } = scene;
  const px = (x) => offX + x * fit;
  const py = (y) => offY + y * fit;
  const nx = (x) => px(x * width);
  const ny = (y) => py(y * height);
  const ink = levelInk(scene.level || 'calm');
  const hair = Math.max(1, dpr);
  const font = (size, weight = 600) => `${weight} ${size * dpr}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'alphabetic';

  for (const box of scene.restZones || []) {
    ctx.strokeStyle = 'rgba(94, 233, 181, 0.55)';
    ctx.setLineDash([5 * dpr, 5 * dpr]);
    ctx.lineWidth = hair;
    ctx.strokeRect(nx(box.x), ny(box.y), box.w * width * fit, box.h * height * fit);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(94, 233, 181, 0.8)';
    ctx.font = font(8);
    // Along the bottom edge, because a rest zone is usually drawn around a bed
    // and a furniture label is usually drawn along its top: put both at the
    // top and they collide on every room that has a bed in it.
    ctx.fillText('REST ZONE', nx(box.x) + 5 * dpr, ny(box.y + box.h) - 6 * dpr);
  }

  for (const box of scene.occluders || []) {
    ctx.strokeStyle = 'rgba(232, 198, 106, 0.45)';
    ctx.lineWidth = hair;
    ctx.strokeRect(nx(box.x), ny(box.y), box.w * width * fit, box.h * height * fit);
    ctx.fillStyle = 'rgba(232, 198, 106, 0.07)';
    ctx.fillRect(nx(box.x), ny(box.y), box.w * width * fit, box.h * height * fit);
    if (box.label) {
      ctx.fillStyle = 'rgba(232, 198, 106, 0.75)';
      ctx.font = font(8);
      ctx.fillText(box.label.toUpperCase(), nx(box.x) + 5 * dpr, ny(box.y) + 13 * dpr);
    }
  }

  const { region, posture, vision } = scene;
  if (!region || !posture?.present) { ctx.restore(); return; }

  const x0 = px(region.minX);
  const x1 = px(region.maxX);
  const y0 = py(region.minY);
  const y1 = py(region.maxY);

  // Corner brackets rather than a full box: the picture stays readable and the
  // frame does not fight the silhouette for attention.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4 * dpr;
  const bw = Math.max(8 * dpr, (x1 - x0) * 0.26);
  const bh = Math.max(8 * dpr, (y1 - y0) * 0.2);
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * bw, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * bh);
    ctx.stroke();
  }

  // The head row — the measurement everything else rests on.
  const headY = py(posture.headRow);
  ctx.strokeStyle = INK.cool;
  ctx.lineWidth = hair;
  ctx.beginPath();
  ctx.moveTo(x0 - 10 * dpr, headY);
  ctx.lineTo(x1 + 10 * dpr, headY);
  ctx.stroke();
  ctx.fillStyle = INK.cool;
  ctx.font = font(7.5);
  ctx.fillText('HEAD', x1 + 13 * dpr, headY + 3 * dpr);

  // The floor row: solid when the feet were seen, dashed when carried forward.
  const footY = py(posture.footRow);
  ctx.strokeStyle = posture.imputed ? INK.gold : INK.jade;
  ctx.setLineDash(posture.imputed ? [4 * dpr, 4 * dpr] : []);
  ctx.beginPath();
  ctx.moveTo(x0 - 14 * dpr, footY);
  ctx.lineTo(x1 + 14 * dpr, footY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = posture.imputed ? INK.gold : INK.jade;
  ctx.fillText(posture.imputed ? 'FLOOR (COASTED)' : 'FLOOR', x1 + 17 * dpr, footY + 3 * dpr);

  // The stature bar: how tall they are now against how tall they stand.
  if (Number.isFinite(posture.stature) && posture.stature > 0.02) {
    const barX = x0 - 9 * dpr;
    const standing = footY - (footY - headY) / Math.max(0.05, posture.stature);
    ctx.strokeStyle = 'rgba(233, 226, 210, 0.3)';
    ctx.lineWidth = hair;
    ctx.beginPath();
    ctx.moveTo(barX, standing);
    ctx.lineTo(barX, footY);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(barX, headY);
    ctx.lineTo(barX, footY);
    ctx.stroke();
  }

  const lines = [
    (vision?.state || 'none').toUpperCase().replace('-', ' '),
    `STATURE  ${Number.isFinite(posture.stature) ? posture.stature.toFixed(2) : '--'}`,
    `TORSO    ${posture.torsoDeg == null ? '  --' : `${posture.torsoDeg.toFixed(0).padStart(4)}°`}`,
    `DESCENT  ${(vision?.descentRate ?? 0).toFixed(2)}/s`,
    posture.imputed
      ? `OCCLUDED ${String(Math.round(posture.occlusion * 100)).padStart(3)}%  IMPUTED`
      : 'OCCLUDED   0%  DIRECT',
  ];
  ctx.font = font(9);
  const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 16 * dpr;
  const lineHeight = 13 * dpr;
  const boxHeight = lines.length * lineHeight + 10 * dpr;
  const labelX = clamp(x0, offX + 4 * dpr, offX + width * fit - boxWidth - 4 * dpr);
  const labelY = y0 - boxHeight - 8 * dpr > offY
    ? y0 - boxHeight - 8 * dpr
    : Math.min(y1 + 8 * dpr, offY + height * fit - boxHeight - 4 * dpr);
  ctx.fillStyle = 'rgba(6, 7, 11, 0.82)';
  ctx.fillRect(labelX, labelY, boxWidth, boxHeight);
  ctx.strokeStyle = ink;
  ctx.lineWidth = hair;
  ctx.strokeRect(labelX + 0.5, labelY + 0.5, boxWidth - 1, boxHeight - 1);
  lines.forEach((text, i) => {
    ctx.fillStyle = i === 0 ? ink : 'rgba(233, 226, 210, 0.86)';
    ctx.font = font(9, i === 0 ? 700 : 500);
    ctx.fillText(text, labelX + 8 * dpr, labelY + lineHeight * (i + 1));
  });
  ctx.restore();
}
