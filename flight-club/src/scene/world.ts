/**
 * Three.js view of a session. The simulation uses x = right, z = forward, which is
 * mirror-image to Three.js (whose right-handed x is left when looking down +z), so every
 * position is drawn with x flipped and every rotation as (qx, −qy, −qz, qw).
 */
import * as THREE from 'three';
import { SUIT } from '../config/suit';
import type { Course } from '../core/courses';
import type { Thrusters } from '../core/flight';
import { qRotate, type V3 } from '../core/math';
import type { Session } from '../core/session';

const TRAIL = 400;
const R = (p: V3) => new THREE.Vector3(-p[0], p[1], p[2]);

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1500);
  private suit = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private nozzles: THREE.Group[] = [];
  private courseGroup = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private shadow: THREE.Mesh;
  private camPos = new THREE.Vector3(0, 4, -10);
  private courseId = '';
  private lastT = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = new THREE.Color(0x87a8c8);
    this.scene.fog = new THREE.Fog(0x87a8c8, 120, 600);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5240, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(-60, 120, -40);
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x5f6b58 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(600, 60, 0x3e4a3a, 0x56634f);
    grid.position.y = 0.02;
    this.scene.add(grid);
    this.backdrop();
    this.scene.add(this.courseGroup);
    this.buildSuit();
    this.scene.add(this.suit);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.7 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 450;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Distant city skyline (decoration only — not part of any course's terrain). */
  private backdrop(): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8d97a6 });
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = 260 + r() * 200;
      const h = 20 + r() * 90;
      const b = new THREE.Mesh(new THREE.BoxGeometry(14 + r() * 20, h, 14 + r() * 20), mat);
      b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
      this.scene.add(b);
    }
  }

  private buildSuit(): void {
    const red = new THREE.MeshStandardMaterial({ color: 0xa3141c, metalness: 0.7, roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a925, metalness: 0.8, roughness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xbfefff });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      this.suit.add(b);
      return b;
    };
    // Origin = centre of mass (~waist). Boots at y = −1.0, palms at y = −0.15, x = ±0.5.
    box(0.44, 0.6, 0.26, red, 0, 0.25);
    box(0.36, 0.3, 0.22, gold, 0, -0.15);
    box(0.24, 0.28, 0.26, red, 0, 0.72);
    box(0.18, 0.1, 0.02, gold, 0, 0.74, 0.135);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), glow);
    core.position.set(0, 0.36, 0.135);
    this.suit.add(core);
    for (const s of [-1, 1]) {
      box(0.15, 0.85, 0.18, red, s * 0.12, -0.62);
      box(0.11, 0.55, 0.12, gold, s * 0.36, 0.2);
      box(0.1, 0.35, 0.12, red, s * 0.46, -0.05);
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.85 });
    // Render-space jet positions (x mirrored): bootL, bootR, palmL, palmR.
    const jets: [number, number][] = [
      [SUIT.bootOffsetX, SUIT.bootOffsetY],
      [-SUIT.bootOffsetX, SUIT.bootOffsetY],
      [SUIT.palmOffsetX, SUIT.palmOffsetY],
      [-SUIT.palmOffsetX, SUIT.palmOffsetY],
    ];
    for (const [x, y] of jets) {
      const n = new THREE.Group();
      n.position.set(x, y, 0);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 14), gold);
      n.add(ring);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1, 14, 1, true), flameMat);
      f.rotation.x = Math.PI; // point down
      n.add(f);
      this.flames.push(f);
      this.nozzles.push(n);
      this.suit.add(n);
    }
  }

  setCourse(c: Course): void {
    if (c.id === this.courseId) return;
    this.courseId = c.id;
    this.courseGroup.clear();
    this.rings = [];
    const padMat = new THREE.MeshLambertMaterial({ color: 0x2d3440 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(c.padRadius, c.padRadius, 0.12, 40), padMat);
    pad.position.copy(R(c.pad)).add(new THREE.Vector3(0, 0.06, 0));
    this.courseGroup.add(pad);
    const mark = new THREE.Mesh(new THREE.RingGeometry(c.padRadius * 0.55, c.padRadius * 0.7, 40), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.copy(R(c.pad)).add(new THREE.Vector3(0, 0.13, 0));
    this.courseGroup.add(mark);
    if (c.start[0] !== c.pad[0] || c.start[2] !== c.pad[2]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.1, 32), padMat);
      sp.position.copy(R(c.start)).add(new THREE.Vector3(0, 0.05, 0));
      this.courseGroup.add(sp);
    }
    const bMat = new THREE.MeshLambertMaterial({ color: 0x9aa3b0 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
    for (const b of c.buildings) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), bMat);
      m.position.set(-b.x, b.h / 2, b.z);
      this.courseGroup.add(m);
      for (let y = 3; y < b.h - 1; y += 3.5) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.05, 1.2, b.d + 0.05), winMat);
        band.position.set(-b.x, y, b.z);
        this.courseGroup.add(band);
      }
    }
    for (const r of c.rings) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r.radius, 0.22, 10, 40), new THREE.MeshBasicMaterial({ color: 0xffb703 }));
      m.position.copy(R(r.pos));
      m.lookAt(m.position.clone().add(R(r.normal)));
      this.courseGroup.add(m);
      this.rings.push(m);
    }
    this.trailPts = [];
    this.camPos.set(0, 4, -10);
  }

  private setThrust(t: Thrusters): void {
    const fs = [t.bootL / SUIT.bootMax, t.bootR / SUIT.bootMax, t.palmL / SUIT.palmMax, t.palmR / SUIT.palmMax];
    const gim = [t.bootGimbal, t.bootGimbal, t.palmGimbalL, t.palmGimbalR];
    for (let i = 0; i < 4; i++) {
      const len = fs[i] > 0.01 ? 0.3 + fs[i] * 1.6 * (0.9 + Math.random() * 0.2) : 0.001;
      this.flames[i].scale.set(1, len, 1);
      this.flames[i].position.y = -len / 2 - 0.04;
      // Gimbal tilts the jet toward +z (forward), so the nozzle exhaust swings backward.
      this.nozzles[i].rotation.x = gim[i];
    }
  }

  update(ss: Session): void {
    this.setCourse(ss.course);
    const s = ss.s;
    const p = R(s.pos);
    this.suit.position.copy(p);
    this.suit.quaternion.set(s.q[0], -s.q[1], -s.q[2], s.q[3]);
    this.setThrust(s.thrusters);
    this.shadow.position.set(p.x, 0.03, p.z);
    for (const b of ss.course.buildings) if (Math.abs(s.pos[0] - b.x) <= b.w / 2 && Math.abs(s.pos[2] - b.z) <= b.d / 2) this.shadow.position.y = b.h + 0.03;
    this.rings.forEach((m, i) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(i < ss.p.ringIndex ? 0x4ade80 : i === ss.p.ringIndex ? 0xffb703 : 0x9aa3b0);
    });

    if (s.t < this.lastT) this.trailPts = [];
    this.lastT = s.t;
    const last = this.trailPts[this.trailPts.length - 1];
    if (!last || last.distanceTo(p) > 0.6) {
      this.trailPts.push(p.clone());
      if (this.trailPts.length > TRAIL) this.trailPts.shift();
      const attr = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      this.trailPts.forEach((v, i) => attr.setXYZ(i, v.x, v.y, v.z));
      attr.needsUpdate = true;
      this.trail.geometry.setDrawRange(0, this.trailPts.length);
    }

    // Chase camera behind and above, following heading (not pitch/roll, to stay readable).
    const fwd = qRotate(s.q, [0, 0, 1]);
    const h = Math.hypot(fwd[0], fwd[2]) || 1;
    const back = new THREE.Vector3(fwd[0] / h, 0, fwd[2] / h);
    const want = R([s.pos[0] - back.x * 9, s.pos[1] + 3.2, s.pos[2] - back.z * 9]);
    want.y = Math.max(want.y, 1.5);
    this.camPos.lerp(want, 0.08);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(R([s.pos[0] + back.x * 4, s.pos[1] + 0.5, s.pos[2] + back.z * 4]));
    this.renderer.render(this.scene, this.camera);
  }
}
