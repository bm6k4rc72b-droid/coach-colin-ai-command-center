/**
 * Vessel tubes shared by the 3D scene (lit) and the fluoro scene (X-ray + contrast).
 * Rebuilt in place when the lumen changes; contrast attributes refreshed per injection.
 */
import * as THREE from 'three';
import { ATTENUATION, FLOW } from '../config/anatomy';
import { lesionEnd, lesionStart, stenosisAt } from '../anatomy/lumen';
import { valueAt, type VesselId } from '../anatomy/vessels';
import type { Simulation } from '../procedure/sim';
import { Tube } from './tube';
import { sharedUniforms, withBeat, xrayMaterial } from './materials';
import { beatDisplace } from '../anatomy/heart';
import type { Vec3 } from '../config/anatomy';
import { add, cross, norm, perpendicular, scale, sub } from '../anatomy/math';

const NEVER = 1e6;

interface VesselEntry {
  id: VesselId;
  tube: Tube;
  mesh3d: THREE.Mesh;
  meshX: THREE.Mesh;
  matX: THREE.ShaderMaterial;
}

interface DissectionEntry {
  flap: THREE.Group;
  stain: THREE.Mesh;
  stainMat: THREE.ShaderMaterial;
  rest: Vec3;
  key: string;
}

export class VesselMeshes {
  readonly group3d = new THREE.Group();
  readonly groupX = new THREE.Group();
  private entries: VesselEntry[] = [];
  private plaque: Tube;
  private plaqueMesh: THREE.Mesh;
  private lumenVersion = -1;
  private fieldVersion = -1;
  private dissections: DissectionEntry[] = [];
  readonly pickables: THREE.Mesh[] = [];

  constructor(private sim: Simulation) {
    const anat = sim.anat;
    for (const id of Object.keys(anat.vessels) as VesselId[]) {
      const v = anat.vessels[id];
      const big = id === 'aorta';
      const tube = new Tube({ radial: big ? 36 : v.coronary ? 14 : 16, capacity: v.pts.length, extras: ['aBeatW', 'aRadius', 'aArrive', 'aTail'] });
      const color = v.coronary ? 0xc0302a : big ? 0xd46a5e : 0xa8383a;
      const opacity = v.coronary ? 0.75 : big ? 0.13 : 0.4;
      const m3 = withBeat(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.45,
          metalness: 0.05,
          transparent: true,
          opacity,
          depthWrite: v.coronary,
          side: big ? THREE.DoubleSide : THREE.FrontSide,
        }),
      );
      const mesh3d = new THREE.Mesh(tube.geometry, m3);
      mesh3d.userData.vessel = id;
      mesh3d.renderOrder = v.coronary ? 2 : 3;
      const matX = xrayMaterial({ mu: ATTENUATION.vesselBlood, beat: true, vessel: true });
      const meshX = new THREE.Mesh(tube.geometry, matX);
      this.group3d.add(mesh3d);
      this.groupX.add(meshX);
      if (v.coronary) this.pickables.push(mesh3d);
      this.entries.push({ id, tube, mesh3d, meshX, matX });
    }
    // Plaque collar around the lesion (3D only).
    this.plaque = new Tube({ radial: 16, capacity: 200, extras: ['aBeatW'] });
    this.plaqueMesh = new THREE.Mesh(
      this.plaque.geometry,
      withBeat(
        new THREE.MeshStandardMaterial({ color: 0xe8d39a, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false }),
      ),
    );
    this.plaqueMesh.renderOrder = 4;
    this.group3d.add(this.plaqueMesh);
    this.update(0);
  }

  update(t: number): void {
    const sim = this.sim;
    if (sim.lumenVersion !== this.lumenVersion) {
      this.lumenVersion = sim.lumenVersion;
      this.rebuildGeometry();
    }
    if (sim.fieldVersion !== this.fieldVersion) {
      this.fieldVersion = sim.fieldVersion;
      this.applyField();
    }
    this.syncDissections(t);
  }

  private rebuildGeometry(): void {
    const sim = this.sim;
    const field = sim.field;
    for (const e of this.entries) {
      const v = sim.anat.vessels[e.id];
      const lumen = sim.lumen[e.id];
      const radii = lumen.map((d) => Math.max(0.12, d / 2));
      const f = field?.[e.id];
      e.tube.update(v.pts, radii, {
        aBeatW: v.beatW,
        aRadius: radii,
        aArrive: f ? f.arrive.map((a) => (Number.isFinite(a) ? a : NEVER)) : v.pts.map(() => NEVER),
        aTail: f ? f.tail.map((a) => (Number.isFinite(a) ? a : NEVER)) : v.pts.map(() => NEVER),
      });
    }
    // Plaque: outer wall over the lesion, at least slightly larger than the lumen.
    const lad = sim.anat.vessels.LAD;
    const a = lesionStart(sim.lesion) - 1;
    const b = lesionEnd(sim.lesion) + 1;
    const pts: Vec3[] = [];
    const r: number[] = [];
    const w: number[] = [];
    for (let i = 0; i < lad.s.length; i++) {
      if (lad.s[i] < a || lad.s[i] > b) continue;
      const ds = stenosisAt(lad.s[i], sim.lesion);
      const ref = lad.refD[i] / 2;
      const lum = sim.lumen.LAD[i] / 2;
      pts.push(lad.pts[i]);
      r.push(Math.max(lum * 1.04 + 0.03, ref * (1 + 0.14 * ds)));
      w.push(1);
    }
    this.plaque.update(pts, r, { aBeatW: w });
  }

  private applyField(): void {
    const sim = this.sim;
    const field = sim.field;
    for (const e of this.entries) {
      const v = sim.anat.vessels[e.id];
      const f = field?.[e.id];
      e.tube.updateExtras({
        aArrive: f ? f.arrive.map((x) => (Number.isFinite(x) ? x : NEVER)) : v.pts.map(() => NEVER),
        aTail: f ? f.tail.map((x) => (Number.isFinite(x) ? x : NEVER)) : v.pts.map(() => NEVER),
      });
      // Aortic contrast is diluted: lower attenuation per mm in the wide aorta.
      const dilution = e.id === 'aorta' ? 0.09 : 1;
      e.matX.uniforms.uIntensity.value = (f?.intensity ?? 0) * dilution;
    }
    for (const d of this.dissections) this.updateStain(d);
  }

  private dissectionKey(i: number): string {
    const d = this.sim.dissections[i];
    return `${d.vessel}:${d.s.toFixed(2)}`;
  }

  private syncDissections(_t: number): void {
    const sim = this.sim;
    while (this.dissections.length < sim.dissections.length) {
      const i = this.dissections.length;
      const d = sim.dissections[i];
      const v = sim.anat.vessels[d.vessel];
      const centre = pointOn(v.pts, v.s, d.s);
      const tan = norm(sub(pointOn(v.pts, v.s, d.s + 0.5), pointOn(v.pts, v.s, d.s - 0.5)));
      const side = perpendicular(tan);
      const ref = valueAt(v.refD, v.s, d.s) / 2;
      // 3D: dark flap inside the lumen.
      // Torn intimal flap plus the intramural haematoma bulging beside the lumen.
      const flap = new THREE.Group();
      const flapMat = new THREE.MeshStandardMaterial({ color: 0x1a0606, roughness: 0.9 });
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.18, ref * 1.3, d.length), flapMat);
      const bulge = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), flapMat);
      bulge.scale.set(ref * 0.5, ref * 0.75, d.length * 0.5);
      bulge.position.set(0, ref * 0.55, 0);
      flap.add(sheet, bulge);
      flap.userData.mat = flapMat;
      const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...cross(side, tan)),
        new THREE.Vector3(...side),
        new THREE.Vector3(...tan),
      );
      flap.quaternion.setFromRotationMatrix(basis);
      const rest = add(centre, scale(side, ref * 0.3));
      flap.position.set(...rest);
      this.group3d.add(flap);
      // Fluoro: contrast stain beside the lumen that lingers after washout.
      const stainGeo = new THREE.SphereGeometry(1, 16, 12);
      const n = stainGeo.getAttribute('position').count;
      stainGeo.setAttribute('aRadius', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1.5), 1));
      stainGeo.setAttribute('aArrive', new THREE.Float32BufferAttribute(new Float32Array(n).fill(NEVER), 1));
      stainGeo.setAttribute('aTail', new THREE.Float32BufferAttribute(new Float32Array(n).fill(NEVER), 1));
      const stainMat = xrayMaterial({ mu: 0, vessel: true });
      stainMat.uniforms.uLinger.value = FLOW.stainLinger;
      const stain = new THREE.Mesh(stainGeo, stainMat);
      stain.quaternion.copy(flap.quaternion);
      stain.scale.set(1.2, 1.3, d.length * 0.45);
      const stainRest = add(centre, scale(side, ref + 0.6));
      stain.position.set(...stainRest);
      stain.userData.rest = stainRest;
      this.groupX.add(stain);
      const entry: DissectionEntry = { flap, stain, stainMat, rest, key: this.dissectionKey(i) };
      this.dissections.push(entry);
      this.updateStain(entry, i);
    }
    // Sealed dissections: flap pinned (lighter), stain fades.
    sim.dissections.forEach((d, i) => {
      const e = this.dissections[i];
      if (!e) return;
      (e.flap.userData.mat as THREE.MeshStandardMaterial).color.setHex(d.sealed ? 0x5a2a2a : 0x1a0606);
      e.stainMat.uniforms.uIntensity.value = d.sealed ? 0.25 : 0.9;
    });
    // heartbeat
    const k = sharedUniforms.uBeatK.value;
    const c = sharedUniforms.uCentre.value;
    const centre: Vec3 = [c.x, c.y, c.z];
    for (const e of this.dissections) {
      e.flap.position.set(...beatDisplace(e.rest, centre, 1 + k, 1));
      e.stain.position.set(...beatDisplace(e.stain.userData.rest as Vec3, centre, 1 + k, 1));
    }
  }

  private updateStain(e: DissectionEntry, idx?: number): void {
    const sim = this.sim;
    const i = idx ?? this.dissections.indexOf(e);
    const d = sim.dissections[i];
    if (!d) return;
    const f = sim.field?.[d.vessel];
    const v = sim.anat.vessels[d.vessel];
    let arrive = NEVER;
    let tail = NEVER;
    if (f && sim.fieldStart >= d.time) {
      const a = valueAt(f.arrive.map((x) => (Number.isFinite(x) ? x : NEVER)), v.s, d.s);
      if (a < NEVER / 2) {
        arrive = a + 0.25;
        tail = valueAt(f.tail.map((x) => (Number.isFinite(x) ? x : NEVER)), v.s, d.s);
      }
    }
    const g = e.stain.geometry;
    (g.getAttribute('aArrive').array as Float32Array).fill(arrive);
    (g.getAttribute('aTail').array as Float32Array).fill(tail);
    g.getAttribute('aArrive').needsUpdate = true;
    g.getAttribute('aTail').needsUpdate = true;
  }

  /** Lumen diameter under a 3D hit point (for the measure tool hover). */
  diameterAtHit(id: VesselId, p: THREE.Vector3): { s: number; d: number; ref: number } | null {
    const v = this.sim.anat.vessels[id];
    if (!v) return null;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < v.pts.length; i++) {
      const q = v.pts[i];
      const dd = (q[0] - p.x) ** 2 + (q[1] - p.y) ** 2 + (q[2] - p.z) ** 2;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return { s: v.s[best], d: this.sim.lumen[id][best], ref: v.refD[best] };
  }
}

function pointOn(pts: Vec3[], s: number[], x: number): Vec3 {
  let i = 0;
  while (i < s.length - 2 && s[i + 1] < x) i++;
  const t = Math.max(0, Math.min(1, (x - s[i]) / (s[i + 1] - s[i] || 1)));
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t];
}

