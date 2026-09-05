/**
 * From a handful of shot corners to a drawing a builder would accept.
 *
 * Survey points arrive noisy: a corner shot from across a room carries a few
 * centimetres of aim error, and no two walls come back exactly square. A plan
 * that renders that honestly is useless — a bid needs "3.66 m", not
 * "3.6412 m at 89.3° to the last wall".
 *
 * So this module does two jobs. It measures the polygon (area, perimeter, wall
 * runs, volume), and it *regularises* it: finds the dominant axis of the room,
 * squares the walls that were nearly square already, and leaves alone the ones
 * that were genuinely off. Real rooms are overwhelmingly rectilinear, so
 * assuming right angles recovers accuracy rather than inventing it — but the
 * tolerance is explicit, and anything outside it survives untouched, because
 * some rooms really do have a canted bay and squaring it would be a lie.
 *
 * Coordinates are metres in the room's own frame: +Y along the survey's first
 * sighting, +X to its right, origin where the operator stood.
 *
 * @module housewright/plan
 */

import { R2D, SQFT, bearing, clamp, distance, wrapQuarter } from './mathkit.js';

/** Openings default to these clear sizes when the operator does not measure them. */
export const OPENING_SIZES = {
  door: { width: 0.815, height: 2.032 },
  double: { width: 1.525, height: 2.032 },
  window: { width: 1.2, height: 1.4 },
  opening: { width: 1.8, height: 2.032 },
};

/**
 * Signed area of a polygon by the shoelace formula.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @returns {number} Twice the signed area, halved — positive counter-clockwise.
 */
export function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Floor area of a closed polygon.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @returns {number} Area in square metres.
 */
export function area(points) {
  return points.length < 3 ? 0 : Math.abs(signedArea(points));
}

/**
 * Perimeter of a closed polygon.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @returns {number} Length in metres.
 */
export function perimeter(points) {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    sum += distance(points[i], points[(i + 1) % points.length]);
  }
  return sum;
}

/**
 * Axis-aligned bounds of a point set.
 *
 * @param {Array<{x: number, y: number}>} points Vertices.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, depth: number}}
 *   The bounding box, zero-sized when there are no points.
 */
export function bounds(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, depth: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, depth: maxY - minY };
}

/**
 * Ensure a polygon winds counter-clockwise.
 *
 * The massing renderer assumes one winding so its wall normals point out of
 * the room rather than into it.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @returns {Array<{x: number, y: number}>} The same ring, possibly reversed.
 */
export function orient(points) {
  return signedArea(points) < 0 ? [...points].reverse() : [...points];
}

/**
 * The dominant axis of a set of walls.
 *
 * Every wall votes for an angle, weighted by its length, and the votes are
 * taken modulo 90° because a wall and the wall at right angles to it agree
 * about which way the room is squared. The circular mean of those votes is
 * the room's grid.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @returns {number} The grid angle in degrees, within [0, 90).
 */
export function dominantAxis(points) {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = distance(a, b);
    if (length < 1e-6) continue;
    // Four-fold symmetry becomes one full turn when the angle is quadrupled,
    // which is what makes a plain circular mean legal here.
    const theta = Math.atan2(b.y - a.y, b.x - a.x) * 4;
    sx += Math.cos(theta) * length;
    sy += Math.sin(theta) * length;
  }
  if (sx === 0 && sy === 0) return 0;
  return wrapQuarter(Math.atan2(sy, sx) * R2D / 4);
}

/**
 * Rotate a point set about the origin.
 *
 * @param {Array<{x: number, y: number}>} points Vertices.
 * @param {number} radians Rotation.
 * @returns {Array<{x: number, y: number}>} The rotated set.
 */
export function rotate(points, radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return points.map((p) => ({ ...p, x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/**
 * Square up the walls that were nearly square already.
 *
 * Each wall within `toleranceDeg` of the room's grid is snapped to it by
 * averaging the two endpoints on the axis that should be constant. Vertices
 * are shared, so the passes are run twice: the first squares each wall in
 * isolation, the second settles the corners where two squared walls disagree.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @param {object} [options] Tuning.
 * @param {number} [options.toleranceDeg=12] How far off square a wall may be
 *   and still be treated as a squaring error rather than a design.
 * @param {number} [options.passes=2] Relaxation passes.
 * @returns {{points: Array<{x: number, y: number}>, axis: number, snapped: number,
 *   shift: number}} The regularised ring, the grid angle it was squared to,
 *   how many walls were snapped, and the largest distance any corner moved.
 */
export function regularise(points, options = {}) {
  const { toleranceDeg = 12, passes = 2 } = options;
  if (points.length < 3) return { points: [...points], axis: 0, snapped: 0, shift: 0 };

  const axis = dominantAxis(points);
  const radians = -axis * Math.PI / 180;
  let working = rotate(points, radians);
  let snapped = 0;

  for (let pass = 0; pass < passes; pass += 1) {
    snapped = 0;
    const next = working.map((p) => ({ ...p }));
    for (let i = 0; i < working.length; i += 1) {
      const j = (i + 1) % working.length;
      const a = working[i];
      const b = working[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      const angle = Math.atan2(dy, dx) * R2D;
      const off = Math.min(wrapQuarter(angle), 90 - wrapQuarter(angle));
      if (off > toleranceDeg) continue;
      snapped += 1;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const mean = (a.y + b.y) / 2;
        next[i].y = mean;
        next[j].y = mean;
      } else {
        const mean = (a.x + b.x) / 2;
        next[i].x = mean;
        next[j].x = mean;
      }
    }
    working = next;
  }

  const result = rotate(working, -radians);
  let shift = 0;
  for (let i = 0; i < points.length; i += 1) {
    shift = Math.max(shift, distance(points[i], result[i]));
  }
  return { points: result, axis, snapped, shift };
}

/**
 * The walls of a polygon, as a builder would list them.
 *
 * @param {Array<{x: number, y: number}>} points Ordered vertices.
 * @returns {Array<{index: number, a: object, b: object, length: number,
 *   bearing: number, mid: {x: number, y: number}, normal: {x: number, y: number}}>}
 *   One entry per wall run, with an outward normal for label placement.
 */
export function walls(points) {
  const ring = orient(points);
  return ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length];
    const length = distance(a, b);
    const dx = length ? (b.x - a.x) / length : 0;
    const dy = length ? (b.y - a.y) / length : 0;
    return {
      index,
      a,
      b,
      length,
      bearing: bearing(a, b),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      // Counter-clockwise winding puts the outward normal to the right of travel.
      normal: { x: dy, y: -dx },
    };
  });
}

/**
 * Build a measured room from survey corners.
 *
 * @param {object} spec The room.
 * @param {string} spec.name Room name.
 * @param {string} spec.type Room type key, used by the report engine.
 * @param {Array<{x: number, y: number}>} spec.points Survey corners, in order.
 * @param {number} [spec.ceiling=2.44] Ceiling height in metres.
 * @param {Array<object>} [spec.openings] Doors and windows.
 * @param {object} [spec.light] Output of `finish.readRoomLight`, if any.
 * @param {object} [options] Passed to `regularise`; `{ square: false }` skips it.
 * @returns {object} The room, with geometry and derived quantities.
 */
export function buildRoom(spec, options = {}) {
  const { square = true } = options;
  const raw = orient(spec.points || []);
  const fitted = square && raw.length >= 3 ? regularise(raw, options) : { points: raw, axis: 0, snapped: 0, shift: 0 };
  const ring = fitted.points;
  const ceiling = spec.ceiling || 2.44;
  const floorArea = area(ring);
  const runs = walls(ring);
  const openings = spec.openings || [];
  const openingArea = openings.reduce((sum, o) => sum + (o.width || 0) * (o.height || 0), 0);
  const wallArea = Math.max(perimeter(ring) * ceiling - openingArea, 0);
  const box = bounds(ring);

  return {
    name: spec.name || 'Room',
    type: spec.type || 'other',
    points: ring,
    rawPoints: raw,
    ceiling,
    openings,
    walls: runs,
    area: floorArea,
    areaSqft: floorArea / SQFT,
    perimeter: perimeter(ring),
    wallArea,
    glazedArea: openings.filter((o) => o.kind === 'window').reduce((s, o) => s + o.width * o.height, 0),
    volume: floorArea * ceiling,
    bounds: box,
    axis: fitted.axis,
    snapped: fitted.snapped,
    squaringShift: fitted.shift,
    light: spec.light || null,
    notes: spec.notes || '',
  };
}

/**
 * Place an opening on a wall.
 *
 * @param {object} room A room from `buildRoom`.
 * @param {number} wallIndex Which wall run.
 * @param {number} along Distance from the wall's start, metres.
 * @param {string} [kind='door'] A key of `OPENING_SIZES`.
 * @param {object} [size] Explicit `{width, height}` override.
 * @returns {object} The opening record, ready to push onto `room.openings`.
 */
export function makeOpening(room, wallIndex, along, kind = 'door', size = null) {
  const wall = room.walls[wallIndex % room.walls.length];
  const spec = size || OPENING_SIZES[kind] || OPENING_SIZES.door;
  const width = Math.min(spec.width, Math.max(wall.length - 0.1, 0.1));
  const clamped = clamp(along, width / 2, Math.max(wall.length - width / 2, width / 2));
  return {
    wall: wall.index,
    along: clamped,
    width,
    height: Math.min(spec.height, room.ceiling - 0.05),
    sill: kind === 'window' ? 0.9 : 0,
    kind,
  };
}

/**
 * Combine rooms into a whole-property summary.
 *
 * @param {Array<object>} rooms Rooms from `buildRoom`.
 * @returns {object} Totals the report engine works from.
 */
export function summarise(rooms) {
  const total = rooms.reduce((sum, r) => sum + r.area, 0);
  const glazing = rooms.reduce((sum, r) => sum + r.glazedArea, 0);
  const ceilings = rooms.filter((r) => r.area > 0);
  const meanCeiling = ceilings.length
    ? ceilings.reduce((sum, r) => sum + r.ceiling * r.area, 0) / total
    : 0;
  return {
    rooms: rooms.length,
    area: total,
    areaSqft: total / SQFT,
    volume: rooms.reduce((sum, r) => sum + r.volume, 0),
    glazedArea: glazing,
    // Daylight factor's crudest proxy, and the one every building code uses:
    // glass as a share of floor. Under about 8% a room reads as dim.
    glazingRatio: total > 0 ? glazing / total : 0,
    meanCeiling,
    tallest: rooms.reduce((best, r) => Math.max(best, r.ceiling), 0),
  };
}

/**
 * Render a room to a dimensioned blueprint, as standalone SVG.
 *
 * @param {object} room A room from `buildRoom`.
 * @param {object} [options] Drawing options.
 * @param {number} [options.width=900] Canvas width in user units.
 * @param {number} [options.height=700] Canvas height.
 * @param {number} [options.padding=90] Margin for dimension strings.
 * @param {string} [options.units='both'] `'metric'`, `'imperial'` or `'both'`.
 * @param {string} [options.title] Sheet title.
 * @returns {string} An SVG document.
 */
export function toSvg(room, options = {}) {
  const {
    width = 900,
    height = 700,
    padding = 90,
    units = 'both',
    title = room.name,
  } = options;
  const box = room.bounds;
  const span = Math.max(box.width, box.depth, 0.5);
  const scale = Math.min((width - padding * 2) / Math.max(box.width, 0.001), (height - padding * 2) / Math.max(box.depth, 0.001));
  const ox = padding + ((width - padding * 2) - box.width * scale) / 2;
  const oy = padding + ((height - padding * 2) - box.depth * scale) / 2;
  // SVG y runs down the page; a plan's y runs up it, so the axis is flipped
  // here rather than everywhere the geometry is used.
  const px = (p) => (p.x - box.minX) * scale + ox;
  const py = (p) => (box.maxY - p.y) * scale + oy;

  const label = (metres) => {
    const feet = metres / 0.3048;
    const ft = Math.floor(feet);
    const inches = Math.round((feet - ft) * 12);
    const imperial = inches === 12 ? `${ft + 1}'-0"` : `${ft}'-${inches}"`;
    if (units === 'metric') return `${metres.toFixed(2)} m`;
    if (units === 'imperial') return imperial;
    return `${metres.toFixed(2)} m  ·  ${imperial}`;
  };

  const ring = room.points.map((p) => `${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#0b1015"/>`);
  parts.push('<g stroke="#1b2a35" stroke-width="0.5">');
  for (let gx = 0; gx <= width; gx += 30) parts.push(`<line x1="${gx}" y1="0" x2="${gx}" y2="${height}"/>`);
  for (let gy = 0; gy <= height; gy += 30) parts.push(`<line x1="0" y1="${gy}" x2="${width}" y2="${gy}"/>`);
  parts.push('</g>');

  parts.push(`<polygon points="${ring}" fill="#12212b" stroke="#63e0c8" stroke-width="3" stroke-linejoin="round"/>`);

  for (const wall of room.walls) {
    const mid = wall.mid;
    const nx = wall.normal.x;
    const ny = wall.normal.y;
    const lx = px({ x: mid.x + nx * (span * 0.07), y: mid.y + ny * (span * 0.07) });
    const ly = py({ x: mid.x + nx * (span * 0.07), y: mid.y + ny * (span * 0.07) });
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#9fd8ff" font-size="13" text-anchor="middle" dominant-baseline="middle">${label(wall.length)}</text>`);
  }

  for (const opening of room.openings) {
    const wall = room.walls[opening.wall];
    if (!wall) continue;
    const t0 = (opening.along - opening.width / 2) / wall.length;
    const t1 = (opening.along + opening.width / 2) / wall.length;
    const at = (t) => ({ x: wall.a.x + (wall.b.x - wall.a.x) * t, y: wall.a.y + (wall.b.y - wall.a.y) * t });
    const p0 = at(t0);
    const p1 = at(t1);
    const colour = opening.kind === 'window' ? '#ffd479' : '#ff9c6e';
    parts.push(`<line x1="${px(p0).toFixed(1)}" y1="${py(p0).toFixed(1)}" x2="${px(p1).toFixed(1)}" y2="${py(p1).toFixed(1)}" stroke="${colour}" stroke-width="7" stroke-linecap="butt"/>`);
  }

  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  parts.push(`<text x="${px(centre).toFixed(1)}" y="${(py(centre) - 8).toFixed(1)}" fill="#e7f4ff" font-size="20" text-anchor="middle">${escapeXml(room.name)}</text>`);
  parts.push(`<text x="${px(centre).toFixed(1)}" y="${(py(centre) + 16).toFixed(1)}" fill="#7fa8bf" font-size="13" text-anchor="middle">${room.area.toFixed(1)} m² · ${Math.round(room.areaSqft)} sq ft · clg ${room.ceiling.toFixed(2)} m</text>`);

  parts.push(`<text x="${padding - 40}" y="34" fill="#63e0c8" font-size="15">${escapeXml(title)}</text>`);
  parts.push(`<text x="${padding - 40}" y="54" fill="#5b7f93" font-size="11">HOUSEWRIGHT · measured survey · planning grade, not a stamped drawing</text>`);

  // Scale bar: one metre, drawn at the same scale as the plan.
  const barY = height - 34;
  parts.push(`<line x1="${padding - 40}" y1="${barY}" x2="${padding - 40 + scale}" y2="${barY}" stroke="#e7f4ff" stroke-width="2"/>`);
  parts.push(`<text x="${padding - 40}" y="${barY - 8}" fill="#7fa8bf" font-size="11">1 m</text>`);
  parts.push(`<g transform="translate(${width - 60} 60)"><path d="M0 -26 L9 12 L0 4 L-9 12 Z" fill="#63e0c8"/><text x="0" y="30" fill="#7fa8bf" font-size="11" text-anchor="middle">REF</text></g>`);
  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * Escape text for inclusion in XML.
 *
 * @param {string} text Raw text.
 * @returns {string} Escaped text.
 */
export function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}
