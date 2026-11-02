/**
 * People flow across the site: the walking distance from every point to the
 * assembly point, going around buildings, and the direction to walk.
 *
 * The site is rasterised (buildings are obstacles) and Dijkstra's algorithm
 * runs outward from the assembly point over an 8-connected grid — straight
 * steps cost one cell, diagonal steps √2 cells, and a diagonal may not cut the
 * corner of a building. The result is a distance field; walking time is
 * distance over 1.2 m/s, a typical unhurried adult walking speed outdoors.
 * Every cell also points to its downhill neighbour, which is the route.
 *
 * Grid distances overestimate true Euclidean paths by at most about 8 %
 * (the 8-connected metric), which the panel states.
 *
 * @module black-optic-6/site/flow
 */

import { inFootprint } from './buildings.js';

export const WALK_MPS = 1.2;

/** Binary heap keyed on distance. */
class Heap {
  constructor() { this.a = []; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/** Rasterise: 1 where a cell centre is inside any building. Row 0 is the southern edge. */
export function obstacles(buildings, box, cell) {
  const cols = Math.max(1, Math.ceil((box.x1 - box.x0) / cell));
  const rows = Math.max(1, Math.ceil((box.y1 - box.y0) / cell));
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const p = [box.x0 + (c + 0.5) * cell, box.y0 + (r + 0.5) * cell];
    if (buildings.some((b) => inFootprint(p, b))) blocked[r * cols + c] = 1;
  }
  return { blocked, cols, rows, cell, x0: box.x0, y0: box.y0 };
}

/** Cell index of a point (clamped). */
export function cellOf(grid, [x, y]) {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.x0) / grid.cell)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((y - grid.y0) / grid.cell)));
  return r * grid.cols + c;
}

/** Nearest open cell to a point (a door lies on a wall; step outside it). */
export function nearestOpen(grid, p) {
  const start = cellOf(grid, p);
  if (!grid.blocked[start]) return start;
  const sc = start % grid.cols; const sr = Math.floor(start / grid.cols);
  for (let rad = 1; rad < Math.max(grid.cols, grid.rows); rad += 1) {
    let best = -1; let bestD = Infinity;
    for (let dr = -rad; dr <= rad; dr += 1) for (let dc = -rad; dc <= rad; dc += 1) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const r = sr + dr; const c = sc + dc;
      if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue;
      const i = r * grid.cols + c;
      const d = dr * dr + dc * dc;
      if (!grid.blocked[i] && d < bestD) { best = i; bestD = d; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/**
 * Walking distance (metres) from every open cell to a target point.
 *
 * @returns {{dist: Float64Array, next: Int32Array}} next is the neighbour to step to (−1 at the target or unreachable).
 */
export function distanceField(grid, target) {
  const n = grid.cols * grid.rows;
  // Float64: heap keys are doubles, and a float32 store rounds below its own key,
  // which would make the stale-entry check skip live nodes.
  const dist = new Float64Array(n).fill(Infinity);
  const next = new Int32Array(n).fill(-1);
  const t = nearestOpen(grid, target);
  if (t < 0) return { dist, next };
  dist[t] = 0;
  const heap = new Heap();
  heap.push(0, t);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const c = i % grid.cols; const r = (i - c) / grid.cols;
    for (const [dc, dr, w] of STEPS) {
      const nc = c + dc; const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const j = nr * grid.cols + nc;
      if (grid.blocked[j]) continue;
      if (dc && dr && (grid.blocked[r * grid.cols + nc] || grid.blocked[nr * grid.cols + c])) continue; // no corner cutting
      const nd = d + w * grid.cell;
      if (nd < dist[j]) { dist[j] = nd; next[j] = i; heap.push(nd, j); }
    }
  }
  return { dist, next };
}

/** The route from a point to the target, as cell centres. */
export function route(grid, field, from) {
  const pts = [];
  let i = nearestOpen(grid, from);
  let guard = grid.cols * grid.rows;
  while (i >= 0 && guard-- > 0) {
    const c = i % grid.cols; const r = (i - c) / grid.cols;
    pts.push([grid.x0 + (c + 0.5) * grid.cell, grid.y0 + (r + 0.5) * grid.cell]);
    if (field.dist[i] === 0) break;
    i = field.next[i];
  }
  return pts;
}

/** Walking distance from a point (nearest open cell) to the target. */
export function distanceFrom(grid, field, p) {
  const i = nearestOpen(grid, p);
  return i < 0 ? Infinity : field.dist[i];
}
