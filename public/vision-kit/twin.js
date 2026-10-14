/**
 * Digital-twin primitives in the spirit of WareTwin: a site is a grid of cells, and the twin
 * keeps decaying heat (where things have been), computes camera coverage (what is watched),
 * and re-runs both under what-if scenarios (a camera goes offline, a light fails, a gate moves).
 *
 * Pure: no DOM. World coordinates are metres on the x–z plane.
 *
 * @module vision-kit/twin
 */

export class HeatGrid {
  /**
   * @param {{x0:number, z0:number, x1:number, z1:number, cell:number}} g bounds and cell size
   */
  constructor(g) {
    this.g = g;
    this.cols = Math.max(1, Math.ceil((g.x1 - g.x0) / g.cell));
    this.rows = Math.max(1, Math.ceil((g.z1 - g.z0) / g.cell));
    this.v = new Float32Array(this.cols * this.rows);
  }

  /** Cell index for a world point, or -1 when outside. */
  index(x, z) {
    const c = Math.floor((x - this.g.x0) / this.g.cell);
    const r = Math.floor((z - this.g.z0) / this.g.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /** Centre of cell i in world coordinates. */
  centre(i) {
    const c = i % this.cols;
    const r = Math.floor(i / this.cols);
    return [this.g.x0 + (c + 0.5) * this.g.cell, this.g.z0 + (r + 0.5) * this.g.cell];
  }

  /** Deposit heat at a point, splatted with a small Gaussian over `radius` metres. */
  add(x, z, amount = 1, radius = 0) {
    if (radius <= 0) {
      const i = this.index(x, z);
      if (i >= 0) this.v[i] += amount;
      return;
    }
    const n = Math.ceil(radius / this.g.cell);
    const c0 = Math.floor((x - this.g.x0) / this.g.cell);
    const r0 = Math.floor((z - this.g.z0) / this.g.cell);
    for (let r = r0 - n; r <= r0 + n; r++) {
      for (let c = c0 - n; c <= c0 + n; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const cx = this.g.x0 + (c + 0.5) * this.g.cell;
        const cz = this.g.z0 + (r + 0.5) * this.g.cell;
        const d2 = (cx - x) ** 2 + (cz - z) ** 2;
        this.v[r * this.cols + c] += amount * Math.exp(-d2 / (2 * (radius / 2) ** 2));
      }
    }
  }

  /** Exponential decay with a half-life in seconds. */
  decay(dt, halfLife = 30) {
    const f = Math.pow(0.5, dt / halfLife);
    for (let i = 0; i < this.v.length; i++) this.v[i] *= f;
  }

  max() {
    let m = 0;
    for (const x of this.v) if (x > m) m = x;
    return m;
  }

  /** Values scaled to 0..1. */
  normalized() {
    const m = this.max() || 1;
    return this.v.map((x) => x / m);
  }

  clear() {
    this.v.fill(0);
  }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Line-of-sight test against wall segments ([x1, z1, x2, z2]).
 */
export function blocked(ax, az, bx, bz, walls) {
  for (const [x1, z1, x2, z2] of walls) {
    const d = (bx - ax) * (z2 - z1) - (bz - az) * (x2 - x1);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((x1 - ax) * (z2 - z1) - (z1 - az) * (x2 - x1)) / d;
    const u = ((x1 - ax) * (bz - az) - (z1 - az) * (bx - ax)) / d;
    if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) return true;
  }
  return false;
}

/**
 * Does camera `cam` see the world point? Yaw 0 looks toward −z; positive yaw turns toward +x.
 * @param {{x:number, z:number, yaw:number, fov:number, range:number, online?:boolean, night?:boolean, ir?:boolean}} cam
 */
export function sees(cam, x, z, walls = [], light = 1) {
  if (cam.online === false) return false;
  const dx = x - cam.x;
  const dz = z - cam.z;
  const d = Math.hypot(dx, dz);
  // Without IR, a camera's useful range shrinks with the light level.
  const range = cam.ir ? cam.range : cam.range * (0.25 + 0.75 * light);
  if (d > range || d < 1e-6) return d < 1e-6;
  const ang = Math.atan2(dx, -dz);
  if (Math.abs(wrap(ang - cam.yaw)) > ((cam.fov * Math.PI) / 180) / 2) return false;
  return !blocked(cam.x, cam.z, x, z, walls);
}

/**
 * Coverage of a grid by cameras: each cell holds how many cameras see its centre.
 * @param {object[]} cameras
 * @param {HeatGrid} grid used only for its geometry
 * @param {{walls?:number[][], light?:number, mask?:(x:number,z:number)=>boolean}} [opt]
 * @returns {{count: Uint8Array, covered: number, total: number, ratio: number, gaps: number[]}}
 */
export function coverageGrid(cameras, grid, opt = {}) {
  const { walls = [], light = 1, mask = null } = opt;
  const count = new Uint8Array(grid.v.length);
  let covered = 0;
  let total = 0;
  const gaps = [];
  for (let i = 0; i < count.length; i++) {
    const [x, z] = grid.centre(i);
    if (mask && !mask(x, z)) {
      count[i] = 255;
      continue;
    }
    total++;
    let n = 0;
    for (const c of cameras) if (sees(c, x, z, walls, light)) n++;
    count[i] = n;
    if (n) covered++;
    else gaps.push(i);
  }
  return { count, covered, total, ratio: total ? covered / total : 0, gaps };
}

/**
 * What-if: apply a scenario (a list of mutations) to a copy of the site and report the
 * difference in coverage and in watched "heat" (activity that happens where nobody sees it).
 * @param {{cameras:object[], walls?:number[][], light?:number}} site
 * @param {{offline?:string[], light?:number, add?:object[], move?:Record<string, Partial<object>>}} scenario
 * @param {HeatGrid} grid with accumulated activity
 */
export function whatIf(site, scenario, grid, mask = null) {
  const base = coverageGrid(site.cameras, grid, { walls: site.walls, light: site.light ?? 1, mask });
  const cams = site.cameras
    .map((c) => ({ ...c, ...(scenario.move?.[c.id] ?? {}), online: c.online !== false && !scenario.offline?.includes(c.id) }))
    .concat(scenario.add ?? []);
  const next = coverageGrid(cams, grid, { walls: site.walls, light: scenario.light ?? site.light ?? 1, mask });
  const heat = grid.normalized();
  let unseenBase = 0;
  let unseenNext = 0;
  let totalHeat = 0;
  for (let i = 0; i < heat.length; i++) {
    if (base.count[i] === 255) continue;
    totalHeat += heat[i];
    if (base.count[i] === 0) unseenBase += heat[i];
    if (next.count[i] === 0) unseenNext += heat[i];
  }
  return {
    base,
    next,
    deltaCoverage: next.ratio - base.ratio,
    unseenActivityBase: totalHeat ? unseenBase / totalHeat : 0,
    unseenActivityNext: totalHeat ? unseenNext / totalHeat : 0,
    cameras: cams,
  };
}

/** Thermal-style ramp for heatmaps: 0..1 → [r, g, b] 0..1 (black → indigo → magenta → amber → white). */
export function heatRamp(t) {
  const x = Math.min(1, Math.max(0, t));
  const stops = [
    [0, [0.02, 0.02, 0.08]],
    [0.25, [0.22, 0.08, 0.55]],
    [0.5, [0.85, 0.15, 0.55]],
    [0.75, [1.0, 0.6, 0.1]],
    [1, [1.0, 0.98, 0.85]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (x - a) / (b - a);
      return ca.map((v, k) => v + (cb[k] - v) * f);
    }
  }
  return stops[stops.length - 1][1];
}
