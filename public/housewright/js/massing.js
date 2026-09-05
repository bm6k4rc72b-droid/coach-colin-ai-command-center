/**
 * The floor plan, stood up.
 *
 * A plan is what a builder prices from; a massing model is what a seller
 * understands. This module extrudes the surveyed polygon into walls, cuts the
 * openings out of them, and paints the result with a painter's-algorithm
 * renderer into a plain 2D canvas.
 *
 * There is no WebGL here and no library, for one reason: the whole app has to
 * survive being opened on a five-year-old Android in a basement with no
 * signal. A depth-sorted set of flat quads is perfectly adequate for a room —
 * a convex-ish box seen from outside has no self-intersection to speak of, so
 * sorting by face centroid is not an approximation that ever visibly fails
 * here — and it costs nothing to start up.
 *
 * @module housewright/massing
 */

import { D2R, clamp } from './mathkit.js';

/**
 * Extrude a room polygon into a solid.
 *
 * @param {object} room A room from `plan.buildRoom`.
 * @param {object} [options] Build options.
 * @param {boolean} [options.ceiling=false] Include the ceiling slab. Off by
 *   default: a room is nearly always looked at from above, and a lid hides
 *   everything worth seeing.
 * @returns {{vertices: Array<object>, faces: Array<object>, centre: object,
 *   radius: number}} A model in world metres, and the sphere that bounds it.
 */
export function extrude(room, options = {}) {
  const { ceiling = false } = options;
  const ring = room.points;
  const h = room.ceiling;
  const vertices = [];
  const faces = [];

  for (const p of ring) vertices.push({ x: p.x, y: p.y, z: 0 });
  for (const p of ring) vertices.push({ x: p.x, y: p.y, z: h });

  const n = ring.length;
  faces.push({
    kind: 'floor',
    indices: ring.map((_, i) => i),
    tone: 0.34,
  });
  if (ceiling) {
    faces.push({ kind: 'ceiling', indices: ring.map((_, i) => i + n).reverse(), tone: 0.2 });
  }

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const openings = (room.openings || []).filter((o) => o.wall === i);
    const wall = room.walls[i];
    if (!openings.length) {
      faces.push({ kind: 'wall', wall: i, indices: [i, j, j + n, i + n], tone: 0.62 });
      continue;
    }
    // A wall with holes becomes a strip of panels between them, plus a header
    // over each and a sill under each window. Cheaper and steadier than a
    // general polygon-with-holes triangulation, and the geometry is a strip.
    const cuts = openings
      .map((o) => ({
        start: clamp(o.along - o.width / 2, 0, wall.length),
        end: clamp(o.along + o.width / 2, 0, wall.length),
        sill: o.sill || 0,
        head: Math.min((o.sill || 0) + o.height, h),
        kind: o.kind,
      }))
      .sort((a, b) => a.start - b.start);

    const at = (t, z) => {
      const p = { x: wall.a.x + (wall.b.x - wall.a.x) * t, y: wall.a.y + (wall.b.y - wall.a.y) * t, z };
      vertices.push(p);
      return vertices.length - 1;
    };

    let cursor = 0;
    for (const cut of cuts) {
      if (cut.start > cursor + 0.005) {
        const t0 = cursor / wall.length;
        const t1 = cut.start / wall.length;
        faces.push({ kind: 'wall', wall: i, indices: [at(t0, 0), at(t1, 0), at(t1, h), at(t0, h)], tone: 0.62 });
      }
      const a = cut.start / wall.length;
      const b = cut.end / wall.length;
      if (cut.head < h - 0.005) {
        faces.push({ kind: 'wall', wall: i, indices: [at(a, cut.head), at(b, cut.head), at(b, h), at(a, h)], tone: 0.55 });
      }
      if (cut.sill > 0.005) {
        faces.push({ kind: 'wall', wall: i, indices: [at(a, 0), at(b, 0), at(b, cut.sill), at(a, cut.sill)], tone: 0.55 });
      }
      faces.push({
        kind: cut.kind === 'window' ? 'glass' : 'void',
        wall: i,
        indices: [at(a, cut.sill), at(b, cut.sill), at(b, cut.head), at(a, cut.head)],
        tone: cut.kind === 'window' ? 0.85 : 0.12,
      });
      cursor = Math.max(cursor, cut.end);
    }
    if (cursor < wall.length - 0.005) {
      const t0 = cursor / wall.length;
      faces.push({ kind: 'wall', wall: i, indices: [at(t0, 0), at(1, 0), at(1, h), at(t0, h)], tone: 0.62 });
    }
  }

  let cx = 0;
  let cy = 0;
  for (const p of ring) { cx += p.x; cy += p.y; }
  const centre = { x: cx / n, y: cy / n, z: h / 2 };
  let radius = 0.5;
  for (const v of vertices) {
    radius = Math.max(radius, Math.hypot(v.x - centre.x, v.y - centre.y, v.z - centre.z));
  }
  return { vertices, faces, centre, radius };
}

/**
 * A camera orbiting the model.
 *
 * @param {object} model From `extrude`.
 * @param {object} [view] Orbit parameters.
 * @param {number} [view.yaw=35] Rotation about the model's vertical, degrees.
 * @param {number} [view.pitch=28] Elevation above the floor plane, degrees.
 * @param {number} [view.zoom=1] Distance multiplier; larger pulls back.
 * @param {number} [view.fov=42] Vertical field of view, degrees.
 * @returns {object} A camera the projector understands.
 */
export function orbitCamera(model, view = {}) {
  const { yaw = 35, pitch = 28, zoom = 1, fov = 42 } = view;
  const a = yaw * D2R;
  const e = clamp(pitch, 3, 87) * D2R;
  const distance = (model.radius / Math.tan(fov * 0.5 * D2R)) * 2.1 * zoom;
  const eye = {
    x: model.centre.x + Math.cos(e) * Math.sin(a) * distance,
    y: model.centre.y + Math.cos(e) * Math.cos(a) * distance,
    z: model.centre.z + Math.sin(e) * distance,
  };
  return { eye, target: model.centre, fov, distance };
}

/**
 * Project a world point to normalised screen coordinates.
 *
 * @param {{x: number, y: number, z: number}} p World point.
 * @param {object} camera From `orbitCamera`.
 * @param {number} aspect Viewport width over height.
 * @returns {{x: number, y: number, depth: number}} Screen position in −1..1
 *   with y up, and the distance along the view axis.
 */
export function project(p, camera, aspect) {
  const f = {
    x: camera.target.x - camera.eye.x,
    y: camera.target.y - camera.eye.y,
    z: camera.target.z - camera.eye.z,
  };
  const fl = Math.hypot(f.x, f.y, f.z) || 1;
  f.x /= fl; f.y /= fl; f.z /= fl;
  // World up is +Z, so the camera's right is forward × up and its own up
  // follows from those two. A camera looking straight down would degenerate
  // here, which is why `orbitCamera` clamps the pitch below 90°.
  const r = { x: f.y, y: -f.x, z: 0 };
  const rl = Math.hypot(r.x, r.y, r.z) || 1;
  r.x /= rl; r.y /= rl; r.z /= rl;
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const d = { x: p.x - camera.eye.x, y: p.y - camera.eye.y, z: p.z - camera.eye.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  const right = d.x * r.x + d.y * r.y + d.z * r.z;
  const up = d.x * u.x + d.y * u.y + d.z * u.z;
  const scale = 1 / Math.tan(camera.fov * 0.5 * D2R);
  const safe = Math.max(depth, 0.01);
  return { x: (right / safe) * scale / aspect, y: (up / safe) * scale, depth };
}

/**
 * Sort faces back to front and hand back draw-ready polygons.
 *
 * @param {object} model From `extrude`.
 * @param {object} camera From `orbitCamera`.
 * @param {number} width Viewport width in pixels.
 * @param {number} height Viewport height in pixels.
 * @returns {Array<object>} Faces with pixel-space points, nearest last.
 */
export function rasterOrder(model, camera, width, height) {
  const aspect = width / Math.max(height, 1);
  const projected = model.vertices.map((v) => project(v, camera, aspect));
  const out = [];
  for (const face of model.faces) {
    let depth = 0;
    let behind = false;
    const points = [];
    for (const i of face.indices) {
      const p = projected[i];
      if (p.depth <= 0.02) { behind = true; break; }
      depth += p.depth;
      points.push({
        x: (p.x * 0.5 + 0.5) * width,
        y: (0.5 - p.y * 0.5) * height,
      });
    }
    if (behind || points.length < 3) continue;
    out.push({ ...face, points, depth: depth / face.indices.length });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

/** Face colours, keyed by what the face is. */
export const PALETTE = {
  floor: '#1d3340',
  ceiling: '#16232c',
  wall: '#274456',
  glass: '#7fd8ff',
  void: '#0a1016',
};

/**
 * Draw a massing model into a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx Destination context.
 * @param {object} model From `extrude`.
 * @param {object} camera From `orbitCamera`.
 * @param {object} [options] Drawing options.
 * @param {number} [options.width] Viewport width; defaults to the canvas.
 * @param {number} [options.height] Viewport height.
 * @param {boolean} [options.edges=true] Draw the wireframe over the fills.
 * @returns {number} How many faces were drawn.
 */
export function render(ctx, model, camera, options = {}) {
  const width = options.width || ctx.canvas.width;
  const height = options.height || ctx.canvas.height;
  const { edges = true } = options;
  ctx.clearRect(0, 0, width, height);
  const faces = rasterOrder(model, camera, width, height);
  for (const face of faces) {
    ctx.beginPath();
    ctx.moveTo(face.points[0].x, face.points[0].y);
    for (let i = 1; i < face.points.length; i += 1) ctx.lineTo(face.points[i].x, face.points[i].y);
    ctx.closePath();
    ctx.globalAlpha = face.kind === 'glass' ? 0.5 : 0.92;
    ctx.fillStyle = PALETTE[face.kind] || PALETTE.wall;
    ctx.fill();
    if (edges) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = face.kind === 'glass' ? '#9fe8ff' : '#4c7f96';
      ctx.lineWidth = face.kind === 'floor' ? 2 : 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return faces.length;
}
