/**
 * Rebuildable tube geometry along a polyline with a per-ring radius (parallel-transport frames).
 * Extra per-ring float attributes (e.g. contrast arrival, beat weight) are supported.
 */
import * as THREE from 'three';
import type { Vec3 } from '../config/anatomy';

export interface TubeOptions {
  radial: number;
  capacity: number;
  extras?: string[];
  /** UV v coordinate per mm of length. */
  vScale?: number;
}

export class Tube {
  readonly geometry = new THREE.BufferGeometry();
  readonly radial: number;
  readonly capacity: number;
  private pos: Float32Array;
  private nrm: Float32Array;
  private uv: Float32Array;
  private extras: Record<string, Float32Array> = {};
  private vScale: number;
  rings = 0;

  constructor(opts: TubeOptions) {
    this.radial = opts.radial;
    this.capacity = Math.max(2, opts.capacity);
    this.vScale = opts.vScale ?? 1;
    const vpr = this.radial + 1;
    const nv = this.capacity * vpr;
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    this.uv = new Float32Array(nv * 2);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    for (const e of opts.extras ?? []) {
      this.extras[e] = new Float32Array(nv);
      this.geometry.setAttribute(e, new THREE.BufferAttribute(this.extras[e], 1).setUsage(THREE.DynamicDrawUsage));
    }
    const idx = new Uint32Array((this.capacity - 1) * this.radial * 6);
    let k = 0;
    for (let i = 0; i < this.capacity - 1; i++) {
      for (let j = 0; j < this.radial; j++) {
        const a = i * vpr + j;
        const b = (i + 1) * vpr + j;
        idx[k++] = a;
        idx[k++] = a + 1;
        idx[k++] = b;
        idx[k++] = b;
        idx[k++] = a + 1;
        idx[k++] = b + 1;
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  }

  /**
   * Rebuild from points. `radius` is a constant or per-point array. `extras` are per-point arrays.
   */
  update(pts: Vec3[], radius: number | ArrayLike<number>, extras?: Record<string, ArrayLike<number>>): void {
    const n = Math.min(pts.length, this.capacity);
    this.rings = n;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const vpr = this.radial + 1;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      let tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      if (i === 0) {
        // initial normal: any perpendicular
        const ux = Math.abs(ty) < 0.9 ? 0 : 1;
        const uy = Math.abs(ty) < 0.9 ? 1 : 0;
        nx = ty * 0 - tz * uy;
        ny = tz * ux - tx * 0;
        nz = tx * uy - ty * ux;
      } else {
        along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
      }
      // project previous normal onto the plane ⟂ T
      const d = nx * tx + ny * ty + nz * tz;
      nx -= d * tx;
      ny -= d * ty;
      nz -= d * tz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const bx = ty * nz - tz * ny;
      const by = tz * nx - tx * nz;
      const bz = tx * ny - ty * nx;
      const r = typeof radius === 'number' ? radius : radius[i];
      for (let j = 0; j <= this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const ox = c * nx + s * bx;
        const oy = c * ny + s * by;
        const oz = c * nz + s * bz;
        const vi = i * vpr + j;
        this.pos[vi * 3] = p[0] + ox * r;
        this.pos[vi * 3 + 1] = p[1] + oy * r;
        this.pos[vi * 3 + 2] = p[2] + oz * r;
        this.nrm[vi * 3] = ox;
        this.nrm[vi * 3 + 1] = oy;
        this.nrm[vi * 3 + 2] = oz;
        this.uv[vi * 2] = j / this.radial;
        this.uv[vi * 2 + 1] = along * this.vScale;
        if (extras) for (const k in extras) this.extras[k][vi] = extras[k][i];
      }
    }
    this.geometry.setDrawRange(0, (n - 1) * this.radial * 6);
    const g = this.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
    if (extras) for (const k in extras) (g.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Update only extra attributes (same ring count). */
  updateExtras(extras: Record<string, ArrayLike<number>>): void {
    const vpr = this.radial + 1;
    for (const k in extras) {
      const arr = this.extras[k];
      const src = extras[k];
      for (let i = 0; i < this.rings; i++) for (let j = 0; j < vpr; j++) arr[i * vpr + j] = src[i];
      (this.geometry.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
