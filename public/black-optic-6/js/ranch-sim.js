/**
 * Ranch twin — layout model and the simulation that runs on it.
 *
 * The layout is what the operator draws in the architect: buildings, pens,
 * troughs, gates, cameras, trees and fence lines, in metres on the ground plane
 * (x east, z south). The simulation puts a flock, a herd, a crew and the
 * ranch's movable assets on that layout and raises the events a ranch actually
 * cares about: a sheep left behind, the headcount through a gate not matching
 * the flock, a worker alone and overdue a check-in, a person inside a moving
 * machine's danger zone, an asset outside the boundary, and a dog among the
 * flock.
 *
 * Fences are real to the simulation: an animal's step is rejected if it would
 * cross a fence segment, and a gate object cuts a gap in whatever fence runs
 * through it. So a fence the operator draws in the architect changes where the
 * flock can go.
 *
 * Every number this module produces is modelled, and the deck badges say so.
 * Crew positions come only from tags the crew have opted in to carry, and only
 * while they are on shift. There is no face recognition anywhere.
 *
 * Pure: no DOM, no rendering, deterministic for a seed.
 *
 * @module black-optic-6/ranch-sim
 */

/** Object types the architect can place. Footprints in metres. */
export const TYPES = Object.freeze({
  barn: { label: 'Barn', w: 18, d: 12, h: 8, solid: true },
  house: { label: 'House', w: 14, d: 10, h: 6, solid: true },
  shed: { label: 'Machine shed', w: 10, d: 7, h: 4.5, solid: true },
  silo: { label: 'Silo', w: 5, d: 5, h: 12, solid: true },
  tank: { label: 'Water tank', w: 4, d: 4, h: 3, solid: true },
  trough: { label: 'Trough', w: 3, d: 1, h: 0.6, solid: false },
  gate: { label: 'Gate', w: 6, d: 0.3, h: 1.3, solid: false },
  camera: { label: 'Camera', w: 0.6, d: 0.6, h: 5, solid: false, fov: 85, range: 58 },
  tree: { label: 'Tree', w: 5, d: 5, h: 7, solid: true },
});

export const BOUNDS = Object.freeze({ x0: -80, z0: -55, x1: 80, z1: 55 });

let uid = 0;
export const newId = (p = 'o') => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

/** The sample ranch the twin opens with. */
export function sampleLayout() {
  const o = (type, x, z, rot = 0, extra = {}) => ({ id: `${type}-${x}-${z}`, type, x, z, rot, ...extra });
  return {
    version: 1,
    objects: [
      o('house', -55, 36), o('barn', -22, 22), o('shed', -40, 6, Math.PI / 2), o('silo', -6, 30), o('silo', 0, 30), o('tank', 6, 20),
      o('trough', 50, -42), o('trough', -45, -32, Math.PI / 2), o('trough', 18, -6),
      o('gate', 17, -15), o('gate', -45, -10), o('gate', 30, -7.5, Math.PI / 2),
      o('camera', -13, 15, 0, { yaw: 2.6, name: 'Barn east' }), o('camera', 17, -12, 0, { yaw: 3.14, name: 'Gate' }),
      o('camera', -70, -48, 0, { yaw: 0.8, name: 'Herd SW' }), o('camera', -48, 30, 0, { yaw: -0.4, name: 'Yard' }),
      o('tree', -66, 20), o('tree', -62, 46), o('tree', 40, 30), o('tree', 48, 34), o('tree', 66, 10), o('tree', -10, -30), o('tree', 75, -50), o('tree', -75, 0),
    ],
    fences: [
      // North paddock (sheep), holding pen beside it, and the herd paddock.
      { id: 'f-paddock', pts: [[5, -15], [70, -15], [70, -52], [5, -52], [5, -15]] },
      { id: 'f-pen', pts: [[5, -15], [5, 0], [30, 0], [30, -15]] },
      { id: 'f-herd', pts: [[-72, -10], [-20, -10], [-20, -52], [-72, -52], [-72, -10]] },
    ],
    zones: {
      paddock: [[5, -15], [70, -15], [70, -52], [5, -52]],
      pen: [[5, 0], [30, 0], [30, -15], [5, -15]],
      herd: [[-72, -10], [-20, -10], [-20, -52], [-72, -52]],
    },
  };
}

/** Deterministic PRNG. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Point in polygon (ray casting). */
export function inPolygon([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function centroid(poly) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of poly) {
    x += px;
    z += pz;
  }
  return [x / poly.length, z / poly.length];
}

/** Do segments ab and cd intersect (proper or touching)? */
export function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/** Corners of a placed object's footprint. */
export function footprint(obj) {
  const t = TYPES[obj.type];
  const c = Math.cos(obj.rot ?? 0);
  const s = Math.sin(obj.rot ?? 0);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = (u * t.w) / 2;
    const lz = (v * t.d) / 2;
    return [obj.x + lx * c - lz * s, obj.z + lx * s + lz * c];
  });
}

/**
 * Fence segments after gates cut their gaps. A gate removes the part of any
 * segment within half its width of the gate centre, if the segment passes
 * within 1.5 m of it.
 * @returns {number[][]} [x1, z1, x2, z2] segments
 */
export function fenceSegments(layout) {
  const gates = layout.objects.filter((o) => o.type === 'gate');
  const out = [];
  for (const f of layout.fences) {
    for (let i = 0; i < f.pts.length - 1; i++) {
      let pieces = [[f.pts[i], f.pts[i + 1]]];
      for (const g of gates) {
        const half = TYPES.gate.w / 2;
        const next = [];
        for (const [a, b] of pieces) {
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const len = Math.hypot(dx, dz) || 1;
          const t = ((g.x - a[0]) * dx + (g.z - a[1]) * dz) / (len * len);
          const px = a[0] + t * dx;
          const pz = a[1] + t * dz;
          if (t < 0 || t > 1 || Math.hypot(g.x - px, g.z - pz) > 1.5) {
            next.push([a, b]);
            continue;
          }
          const t0 = t - half / len;
          const t1 = t + half / len;
          if (t0 > 0) next.push([a, [a[0] + dx * t0, a[1] + dz * t0]]);
          if (t1 < 1) next.push([[a[0] + dx * t1, a[1] + dz * t1], b]);
        }
        pieces = next;
      }
      for (const [a, b] of pieces) out.push([a[0], a[1], b[0], b[1]]);
    }
  }
  return out;
}

/** Wall segments for camera line of sight: the footprints of solid objects. */
export function occluders(layout) {
  const out = [];
  for (const o of layout.objects) {
    if (!TYPES[o.type]?.solid || o.type === 'tree') continue;
    const fp = footprint(o);
    for (let i = 0; i < 4; i++) out.push([...fp[i], ...fp[(i + 1) % 4]]);
  }
  return out;
}

/** Cameras in the layout in the shape vision-kit/twin.js expects. */
export function layoutCameras(layout, { offline = [], ir = false } = {}) {
  return layout.objects
    .filter((o) => o.type === 'camera')
    .map((o) => ({ id: o.id, name: o.name ?? 'Camera', x: o.x, z: o.z, yaw: o.yaw ?? o.rot ?? 0, fov: o.fov ?? TYPES.camera.fov, range: o.range ?? TYPES.camera.range, ir: ir || !!o.ir, online: !offline.includes(o.id) }));
}

/** The gate between the paddock and the pen, used for the headcount line. */
export function penGate(layout) {
  const gates = layout.objects.filter((o) => o.type === 'gate');
  const z = layout.zones?.pen;
  if (!z || !gates.length) return null;
  const [cx, cz] = centroid(z);
  return gates.reduce((best, g) => (!best || Math.hypot(g.x - cx, g.z - cz) < Math.hypot(best.x - cx, best.z - cz) ? g : best), null);
}

export const CREW = Object.freeze([
  { id: 'w1', name: 'Ana', role: 'Stock lead', colour: '#ffb23d' },
  { id: 'w2', name: 'Mo', role: 'Fencing', colour: '#29e07f' },
  { id: 'w3', name: 'Jess', role: 'Machinery', colour: '#4fe8ff' },
]);

export const ASSETS = Object.freeze([
  { id: 'a1', name: 'Tractor', kind: 'tractor', machine: true },
  { id: 'a2', name: 'Quad bike', kind: 'quad', machine: true },
  { id: 'a3', name: 'Tool trailer', kind: 'trailer', machine: false },
  { id: 'a4', name: 'Fence energiser', kind: 'item', machine: false },
]);

const DANGER_RADIUS = 6;
const LONE_AFTER = 90; // seconds overdue (time-compressed for the demo)
const STRAY_AFTER = 8;

export class RanchSim {
  /**
   * @param {ReturnType<typeof sampleLayout>} layout
   * @param {{seed?:number, sheep?:number, cattle?:number}} [opt]
   */
  constructor(layout, opt = {}) {
    const { seed = 7, sheep = 48, cattle = 14 } = opt;
    this.rand = rng(seed);
    this.t = 0;
    this.events = [];
    this.flockMode = 'graze';
    this.gateCount = { in: 0, out: 0 };
    this.consent = Object.fromEntries(CREW.map((c) => [c.id, true]));
    this.setLayout(layout);
    const P = layout.zones.paddock;
    const H = layout.zones.herd;
    this.sheep = Array.from({ length: sheep }, (_, i) => this.spawnAnimal(`s${i + 1}`, 'sheep', P, 1.1));
    this.cattle = Array.from({ length: cattle }, (_, i) => this.spawnAnimal(`c${i + 1}`, 'cow', H, 1.6));
    this.flockSize = sheep;
    this.dog = null;
    this.crew = CREW.map((c, i) => ({
      ...c,
      x: [-30, 40, -8][i],
      z: [12, -30, 12][i],
      heading: 0,
      task: 0,
      lastCheckIn: 0,
      onShift: true,
      route: [
        [[-30, 12], [-10, -5], [15, -10], [12, -5], [-25, 15]],
        [[40, -30], [68, -30], [68, -50], [40, -50], [69, -14]],
        [[-36, 6], [-30, -2], [10, 8], [30, 8], [-36, 6]],
      ][i],
      wait: 0,
    }));
    this.assets = ASSETS.map((a, i) => ({ ...a, x: [-30, -36, -44, -38][i], z: [-2, 10, 4, 6][i], heading: 0, moving: false, route: i === 0 ? [[-30, -2], [10, 8], [45, 8], [45, -8], [-30, -2]] : null, task: 0, lastSeen: 0 }));
    this.strayClock = new Map();
    this.flagged = new Set();
  }

  setLayout(layout) {
    this.layout = layout;
    this.fences = fenceSegments(layout);
  }

  spawnAnimal(id, kind, poly, size) {
    const [cx, cz] = centroid(poly);
    let x = cx;
    let z = cz;
    for (let k = 0; k < 40; k++) {
      x = cx + (this.rand() - 0.5) * 30;
      z = cz + (this.rand() - 0.5) * 22;
      if (inPolygon([x, z], poly)) break;
    }
    return { id, kind, x, z, vx: 0, vz: 0, heading: this.rand() * 6.28, size, graze: this.rand() * 10 };
  }

  /** Would a step from a to b cross a fence? */
  blocked(ax, az, bx, bz) {
    for (const [x1, z1, x2, z2] of this.fences) if (segmentsCross([ax, az], [bx, bz], [x1, z1], [x2, z2])) return true;
    return false;
  }

  log(type, text, data = {}) {
    this.events.unshift({ t: this.t, type, text, ...data });
    if (this.events.length > 40) this.events.length = 40;
  }

  /** Send the flock through the gate into the pen, or back out to graze. */
  command(mode) {
    this.flockMode = mode;
    this.log('command', mode === 'pen' ? 'Flock sent through the gate to the holding pen' : 'Flock released to graze');
  }

  checkIn(id) {
    const w = this.crew.find((c) => c.id === id);
    if (w) {
      w.lastCheckIn = this.t;
      this.flagged.delete('lone:' + id);
      this.log('checkin', `${w.name} checked in`);
    }
  }

  setConsent(id, on) {
    this.consent[id] = on;
    const w = this.crew.find((c) => c.id === id);
    this.log('consent', `${w?.name ?? id} ${on ? 'opted in to' : 'opted out of'} tag tracking`);
  }

  releaseDog() {
    this.dog = { id: 'd1', kind: 'dog', x: 72, z: -34, vx: -3, vz: 0, heading: Math.PI, size: 0.8, life: 40 };
    this.log('alert', 'Dog detected at the east fence, moving toward the flock', { level: 'alert' });
  }

  /** Crew positions only for consenting, on-shift crew. */
  visibleCrew() {
    return this.crew.filter((w) => this.consent[w.id] && w.onShift);
  }

  flockCentre() {
    const n = this.sheep.length || 1;
    return [this.sheep.reduce((a, s) => a + s.x, 0) / n, this.sheep.reduce((a, s) => a + s.z, 0) / n];
  }

  step(dt) {
    this.t += dt;
    const Z = this.layout.zones;
    const gate = penGate(this.layout);
    // ── Flock (boids: separation, cohesion, wander; fences are hard) ──
    const [fx, fz] = this.flockCentre();
    const target = this.flockMode === 'pen' ? (gate && inPolygon([fx, fz], Z.paddock) ? [gate.x, gate.z - 4] : centroid(Z.pen)) : null;
    const herdStep = (a, mates, speed, home) => {
      let ax = 0;
      let az = 0;
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const b of mates) {
        if (b === a) continue;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.5 * 2.5 && d2 > 1e-6) {
          ax += dx / d2;
          az += dz / d2;
        }
        if (d2 < 30 * 30) {
          cx += b.x;
          cz += b.z;
          n++;
        }
      }
      if (n) {
        ax += ((cx / n - a.x) * 0.02);
        az += ((cz / n - a.z) * 0.02);
      }
      a.graze -= dt;
      if (a.graze < 0) {
        a.heading += (this.rand() - 0.5) * 2;
        a.graze = 2 + this.rand() * 6;
      }
      const wander = a.graze > 1.5 ? 0.15 : 0.6;
      ax += Math.cos(a.heading) * wander;
      az += Math.sin(a.heading) * wander;
      if (home && !inPolygon([a.x, a.z], home)) {
        const [hx, hz] = centroid(home);
        ax += (hx - a.x) * 0.05;
        az += (hz - a.z) * 0.05;
      }
      return [ax, az, speed];
    };
    const flee = (a, k) => {
      if (!this.dog) return [0, 0];
      const dx = a.x - this.dog.x;
      const dz = a.z - this.dog.z;
      const d = Math.hypot(dx, dz);
      return d < 18 ? [(dx / d) * k * (1 - d / 18), (dz / d) * k * (1 - d / 18)] : [0, 0];
    };
    for (const s of this.sheep) {
      let [ax, az, sp] = herdStep(s, this.sheep, 1.2, this.flockMode === 'pen' ? null : Z.paddock);
      if (target) {
        const dx = target[0] - s.x;
        const dz = target[1] - s.z;
        const d = Math.hypot(dx, dz) || 1;
        ax += (dx / d) * 1.4;
        az += (dz / d) * 1.4;
        // Once through the gate, head for the pen centre.
        if (gate && Math.abs(s.x - gate.x) < 3.5 && s.z > gate.z - 6 && s.z < gate.z + 1) {
          const [px, pz] = centroid(Z.pen);
          ax += (px - s.x) * 0.2;
          az += (pz - s.z) * 0.2 + 1.5;
        }
        sp = 1.9;
      }
      const [gx, gz] = flee(s, 6);
      ax += gx;
      az += gz;
      this.move(s, ax, az, sp + Math.hypot(gx, gz) * 0.5, dt);
    }
    for (const c of this.cattle) {
      const [ax, az] = herdStep(c, this.cattle, 0.6, Z.herd);
      this.move(c, ax, az, 0.6, dt);
    }
    // ── Dog ──
    if (this.dog) {
      const D = this.dog;
      D.life -= dt;
      const dx = fx - D.x;
      const dz = fz - D.z;
      const d = Math.hypot(dx, dz) || 1;
      D.vx = (dx / d) * 4.5;
      D.vz = (dz / d) * 4.5 + Math.sin(this.t * 2) * 2;
      D.x += D.vx * dt;
      D.z += D.vz * dt;
      D.heading = Math.atan2(D.vz, D.vx);
      if (D.life <= 0) {
        this.dog = null;
        this.log('info', 'Dog left the property');
      }
    }
    // ── Gate headcount: sheep whose centre crosses the gate line ──
    if (gate) {
      for (const s of this.sheep) {
        const side = s.z > gate.z ? 1 : -1;
        if (s.side !== undefined && side !== s.side && Math.abs(s.x - gate.x) < TYPES.gate.w) {
          if (side > 0) this.gateCount.in++;
          else this.gateCount.out++;
        }
        s.side = side;
      }
    }
    // ── Stragglers ──
    const dists = this.sheep.map((s) => Math.hypot(s.x - fx, s.z - fz)).sort((a, b) => a - b);
    const med = dists[Math.floor(dists.length / 2)] ?? 0;
    for (const s of this.sheep) {
      const d = Math.hypot(s.x - fx, s.z - fz);
      const far = d > Math.max(18, med * 3);
      const c = far ? (this.strayClock.get(s.id) ?? 0) + dt : 0;
      this.strayClock.set(s.id, c);
      if (c >= STRAY_AFTER && !this.flagged.has('stray:' + s.id)) {
        this.flagged.add('stray:' + s.id);
        this.log('stray', `Sheep ${s.id.slice(1)} is ${d.toFixed(0)} m from the flock`, { level: 'caution', id: s.id });
      }
      if (!far) this.flagged.delete('stray:' + s.id);
    }
    // ── Crew ──
    for (const w of this.crew) {
      if (w.wait > 0) w.wait -= dt;
      else {
        const [tx, tz] = w.route[(w.task + 1) % w.route.length];
        const dx = tx - w.x;
        const dz = tz - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) {
          w.task = (w.task + 1) % w.route.length;
          w.wait = 6 + this.rand() * 10;
        } else {
          w.x += (dx / d) * Math.min(d, 1.3 * dt);
          w.z += (dz / d) * Math.min(d, 1.3 * dt);
          w.heading = Math.atan2(dz, dx);
        }
      }
    }
    // ── Assets ──
    for (const a of this.assets) {
      a.moving = false;
      if (!a.route) continue;
      const [tx, tz] = a.route[(a.task + 1) % a.route.length];
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8) a.task = (a.task + 1) % a.route.length;
      else {
        a.x += (dx / d) * Math.min(d, 3.2 * dt);
        a.z += (dz / d) * Math.min(d, 3.2 * dt);
        a.heading = Math.atan2(dz, dx);
        a.moving = true;
      }
    }
    // ── Safety rules ──
    for (const w of this.visibleCrew()) {
      for (const a of this.assets) {
        if (!a.machine || !a.moving) continue;
        const key = `danger:${w.id}:${a.id}`;
        const d = Math.hypot(w.x - a.x, w.z - a.z);
        if (d < DANGER_RADIUS && !this.flagged.has(key)) {
          this.flagged.add(key);
          this.log('danger', `${w.name} is ${d.toFixed(1)} m from the moving ${a.name.toLowerCase()}`, { level: 'alert', id: w.id });
        } else if (d > DANGER_RADIUS + 3) this.flagged.delete(key);
      }
      const others = this.visibleCrew().filter((o) => o !== w);
      const alone = others.every((o) => Math.hypot(o.x - w.x, o.z - w.z) > 45);
      const overdue = this.t - w.lastCheckIn > LONE_AFTER;
      if (alone && overdue && !this.flagged.has('lone:' + w.id)) {
        this.flagged.add('lone:' + w.id);
        this.log('lone', `${w.name} is working alone and is overdue a check-in`, { level: 'caution', id: w.id });
      }
    }
    for (const a of this.assets) {
      const out = a.x < BOUNDS.x0 || a.x > BOUNDS.x1 || a.z < BOUNDS.z0 || a.z > BOUNDS.z1;
      if (out && !this.flagged.has('fence:' + a.id)) {
        this.flagged.add('fence:' + a.id);
        this.log('asset', `${a.name} has left the property boundary`, { level: 'alert' });
      }
    }
  }

  move(a, ax, az, speed, dt) {
    const k = 1 - Math.exp(-dt * 2.5);
    a.vx += (ax - a.vx) * k;
    a.vz += (az - a.vz) * k;
    const v = Math.hypot(a.vx, a.vz);
    if (v > speed) {
      a.vx *= speed / v;
      a.vz *= speed / v;
    }
    const nx = a.x + a.vx * dt;
    const nz = a.z + a.vz * dt;
    if (this.blocked(a.x, a.z, nx, nz)) {
      a.vx *= -0.4;
      a.vz *= -0.4;
      a.heading += Math.PI * (0.5 + this.rand() * 0.5);
      return;
    }
    a.x = nx;
    a.z = nz;
    if (v > 0.05) a.heading = Math.atan2(a.vz, a.vx);
  }

  /** Headcount summary for the flock deck. */
  headcount() {
    const pen = this.layout.zones.pen;
    const inPen = this.sheep.filter((s) => inPolygon([s.x, s.z], pen)).length;
    return { flock: this.flockSize, inPen, outPen: this.sheep.length - inPen, gateIn: this.gateCount.in, gateOut: this.gateCount.out, net: this.gateCount.in - this.gateCount.out };
  }
}

/** Validate and normalise a layout loaded from storage or a file. */
export function parseLayout(json) {
  const L = typeof json === 'string' ? JSON.parse(json) : json;
  if (!L || !Array.isArray(L.objects) || !Array.isArray(L.fences)) throw new Error('Not a ranch layout');
  const objects = L.objects
    .filter((o) => TYPES[o.type] && Number.isFinite(o.x) && Number.isFinite(o.z))
    .map((o) => ({ ...o, id: String(o.id ?? newId()), rot: Number(o.rot) || 0, x: Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, o.x)), z: Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, o.z)) }));
  const fences = L.fences
    .filter((f) => Array.isArray(f.pts) && f.pts.length >= 2 && f.pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))
    .map((f) => ({ id: String(f.id ?? newId('f')), pts: f.pts.map(([x, z]) => [x, z]) }));
  return { version: 1, objects, fences, zones: L.zones ?? sampleLayout().zones };
}
