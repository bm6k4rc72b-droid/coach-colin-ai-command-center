/**
 * Device meshes (guide, wire, balloon/stent catheter, deployed stents) for both scenes.
 * Geometry is shared between the lit 3D scene and the X-ray scene; it is rebuilt every frame
 * from the 1D rail state, with heartbeat displacement applied on the CPU.
 */
import * as THREE from 'three';
import { ATTENUATION, GUIDE, INFLATION, WIRE, type Vec3 } from '../config/anatomy';
import { beatDisplace } from '../anatomy/heart';
import { arcLengths } from '../anatomy/math';
import { pointAt, type Vessel } from '../anatomy/vessels';
import { catheterDiameter } from '../physics/balloon';
import { catheterGeometry, deviceRail, guidePolyline, wirePolyline, type Polyline } from '../physics/geometry';
import type { Simulation, StentRecord } from '../procedure/sim';
import { strutTexture, withBeat, xrayMaterial } from './materials';
import { Tube } from './tube';

export const BALLOON_YELLOW = 0xf2c933;

interface Pair {
  tube: Tube;
  m3: THREE.Mesh;
  mx: THREE.Mesh;
}

export class DeviceMeshes {
  readonly group3d = new THREE.Group();
  readonly groupX = new THREE.Group();
  private guide: Pair;
  private wire: Pair;
  private wireTip: Pair;
  private shaft: Pair;
  private balloon: Pair;
  private cathTip: Pair;
  private crimped: Pair;
  private balloonMat3: THREE.MeshStandardMaterial;
  private balloonMatX: THREE.ShaderMaterial;
  private markers3: THREE.Mesh[] = [];
  private markersX: THREE.Mesh[] = [];
  private stents: { key: string; tube: Tube; m3: THREE.Mesh; mx: THREE.Mesh }[] = [];
  private strut = strutTexture();
  /** Current (beating) tip position of the active device, for camera follow. */
  readonly tip = new THREE.Vector3();

  constructor(private sim: Simulation) {
    const mk = (radial: number, capacity: number, m3: THREE.Material, mx: THREE.Material, vScale = 1): Pair => {
      const tube = new Tube({ radial, capacity, vScale });
      const a = new THREE.Mesh(tube.geometry, m3);
      const b = new THREE.Mesh(tube.geometry, mx);
      a.frustumCulled = false;
      b.frustumCulled = false;
      this.group3d.add(a);
      this.groupX.add(b);
      return { tube, m3: a, mx: b };
    };
    const plastic = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1 });
    this.guide = mk(12, 1400, plastic(0x8fb3e0), xrayMaterial({ mu: ATTENUATION.guide, size: GUIDE.outerDiameter / 2 }));
    this.wire = mk(
      6,
      2600,
      new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.25, metalness: 0.85 }),
      xrayMaterial({ mu: ATTENUATION.wire, size: 0.26 }),
    );
    this.wireTip = mk(
      6,
      200,
      new THREE.MeshStandardMaterial({ color: 0xcfa64a, roughness: 0.3, metalness: 0.8 }),
      xrayMaterial({ mu: ATTENUATION.wireTip, size: 0.32 }),
    );
    this.shaft = mk(8, 2600, plastic(0xc7d3e6), xrayMaterial({ mu: 0.12, size: 0.45 }));
    this.balloonMat3 = new THREE.MeshStandardMaterial({
      color: 0xdfe6ee,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.8,
    });
    this.balloonMatX = xrayMaterial({ mu: 0.05, size: 0.5 });
    this.balloon = mk(18, 200, this.balloonMat3, this.balloonMatX);
    this.cathTip = mk(8, 40, plastic(0xc7d3e6), xrayMaterial({ mu: 0.12, size: 0.4 }));
    const crimpMat = new THREE.MeshStandardMaterial({
      color: 0xc9ced6,
      metalness: 0.9,
      roughness: 0.3,
      alphaMap: this.strut,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    });
    this.crimped = mk(18, 200, crimpMat, xrayMaterial({ mu: ATTENUATION.stentShell, size: 0.12, shell: true }), 1 / 2.2);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.SphereGeometry(0.62, 12, 8);
      const a = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 0.9, roughness: 0.3 }));
      const b = new THREE.Mesh(g, xrayMaterial({ mu: ATTENUATION.marker, size: 0.62 }));
      this.group3d.add(a);
      this.groupX.add(b);
      this.markers3.push(a);
      this.markersX.push(b);
    }
  }

  update(time: number, beatS: number, centre: Vec3): void {
    const sim = this.sim;
    const anat = sim.anat;
    const disp = (pl: Polyline): Vec3[] => pl.pts.map((p, i) => beatDisplace(p, centre, beatS, pl.w[i]));

    const g = sim.guide;
    const gpl = guidePolyline(anat, g.s, g.angle, g.engaged, sim.wire.legs);
    this.guide.tube.update(disp(gpl), GUIDE.outerDiameter / 2);
    const gp = gpl.pts.at(-1)!;
    this.tip.set(...beatDisplace(gp, centre, beatS, gpl.w.at(-1)!));

    const c = sim.catheter;
    const dMax = Math.max(sim.wire.d, c ? c.pos + INFLATION.tipLength + 1 : 0) + 1;
    const rail = deviceRail(anat, gpl, g.engaged, sim.wire.legs, dMax);

    // Wire
    const showWire = sim.wireLoaded;
    this.wire.m3.visible = this.wire.mx.visible = showWire;
    this.wireTip.m3.visible = this.wireTip.mx.visible = showWire;
    if (showWire) {
      const wpl = wirePolyline(rail, sim.wire.d, sim.wire.angle, sim.wire.buckling, time);
      const pts = disp(wpl);
      const sl = arcLengths(pts);
      const L = sl[sl.length - 1];
      let split = pts.length - 1;
      while (split > 0 && L - sl[split] < WIRE.tipLength) split--;
      this.wire.tube.update(pts.slice(0, split + 1), 0.22);
      this.wireTip.tube.update(pts.slice(split), 0.26);
      if (sim.tool === 'wire') this.tip.set(...pts[pts.length - 1]);
    }

    // Catheter
    const showCat = !!c;
    for (const p of [this.shaft, this.balloon, this.cathTip]) p.m3.visible = p.mx.visible = showCat;
    for (const m of [...this.markers3, ...this.markersX]) m.visible = showCat;
    this.crimped.m3.visible = this.crimped.mx.visible = !!c && c.kind === 'stent' && !c.deployed;
    if (c) {
      const cg = catheterGeometry(rail, c.pos, c.length);
      const d = catheterDiameter(c);
      this.shaft.tube.update(disp(cg.shaft), 0.45);
      const bp = disp(cg.balloon);
      // Tapered balloon ends.
      const bl = arcLengths(bp);
      const BL = bl[bl.length - 1] || 1;
      const radii = bl.map((x) => {
        const e = Math.min(x, BL - x);
        const taper = Math.min(1, e / 1.2);
        return Math.max(0.42, (d / 2) * (0.55 + 0.45 * taper));
      });
      this.balloon.tube.update(bp, radii);
      this.cathTip.tube.update(disp(cg.tip), 0.38);
      for (let i = 0; i < 2; i++) {
        const p = beatDisplace(cg.markers[i], centre, beatS, cg.markerW[i]);
        this.markers3[i].position.set(...p);
        this.markersX[i].position.set(...p);
      }
      const inflated = c.pressure > 0.3 && !c.ruptured;
      this.balloonMat3.color.setHex(inflated ? BALLOON_YELLOW : c.ruptured ? 0x8a8f96 : 0xdfe6ee);
      this.balloonMat3.opacity = inflated ? 0.92 : 0.8;
      this.balloonMatX.uniforms.uMu.value = inflated ? ATTENUATION.balloonContrast : 0.04;
      this.balloonMatX.uniforms.uSize.value = Math.max(0.5, d / 2);
      if (c.kind === 'stent' && !c.deployed) this.crimped.tube.update(bp, radii.map((r) => r + 0.06));
      if (sim.tool === 'balloon' || sim.tool === 'stent') this.tip.set(...beatDisplace(cg.markers[1], centre, beatS, cg.markerW[1]));
    }

    this.syncStents();
  }

  private syncStents(): void {
    const sim = this.sim;
    sim.stents.forEach((st, i) => {
      const key = `${st.s0.toFixed(2)}:${st.s1.toFixed(2)}:${st.diameter.toFixed(3)}`;
      let e = this.stents[i];
      if (!e) {
        const tube = new Tube({ radial: 22, capacity: 200, extras: ['aBeatW'], vScale: 1 / 2.2 });
        const m3 = new THREE.Mesh(
          tube.geometry,
          withBeat(
            new THREE.MeshStandardMaterial({
              color: 0xd4d8de,
              metalness: 0.95,
              roughness: 0.25,
              alphaMap: this.strut,
              transparent: true,
              alphaTest: 0.4,
              side: THREE.DoubleSide,
            }),
          ),
        );
        const mx = new THREE.Mesh(tube.geometry, xrayMaterial({ mu: ATTENUATION.stentShell, size: 0.12, shell: true, beat: true }));
        m3.frustumCulled = false;
        mx.frustumCulled = false;
        this.group3d.add(m3);
        this.groupX.add(mx);
        e = { key: '', tube, m3, mx };
        this.stents.push(e);
      }
      if (e.key !== key) {
        e.key = key;
        buildStentTube(e.tube, sim.anat.vessels[st.vessel], st);
      }
    });
  }
}

function buildStentTube(tube: Tube, v: Vessel, st: StentRecord): void {
  const pts: Vec3[] = [];
  const n = Math.max(2, Math.round((st.s1 - st.s0) / 0.4));
  for (let i = 0; i <= n; i++) pts.push(pointAt(v.pts, v.s, st.s0 + ((st.s1 - st.s0) * i) / n));
  const r = (st.diameter * (1 - INFLATION.stentRecoil)) / 2 + 0.03;
  tube.update(
    pts,
    r,
    { aBeatW: pts.map(() => 1) },
  );
}
