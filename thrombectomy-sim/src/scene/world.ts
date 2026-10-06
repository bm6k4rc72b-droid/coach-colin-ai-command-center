/**
 * 3D view: torso and head outline, the arterial tree (dimmed where there is no flow), the
 * brain's left MCA territory coloured by core / penumbra / reperfused, the clot, and the
 * devices along the route. Sim coordinates: x = patient left, y = cranial, z = anterior —
 * drawn with x mirrored so the patient faces the viewer (their left on screen right).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { pointOn, type V3 } from '../core/anatomy';
import { branchOpen, contrastReach, MCA_BRANCHES } from '../core/angio';
import type { DeviceId, Sim } from '../core/sim';

const W = (p: V3) => new THREE.Vector3(-p[0], p[1], p[2]);

const DEVICE_STYLE: Record<DeviceId, { r: number; color: number }> = {
  guide: { r: 1.35, color: 0xd9dee7 },
  asp: { r: 0.9, color: 0x2dd4bf },
  micro: { r: 0.36, color: 0xf59e0b },
};

export class World {
  private renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 1, 3000);
  controls: OrbitControls;
  follow = true;
  private vessels: Record<string, THREE.Mesh> = {};
  private occGroup = new THREE.Group();
  private devMeshes: Partial<Record<DeviceId, THREE.Mesh>> = {};
  private devKey: Partial<Record<DeviceId, string>> = {};
  private stentMesh: THREE.Mesh | null = null;
  private balloon: THREE.Mesh;
  private brain: THREE.Mesh;
  private brainBase: Float32Array;
  private brainBranch: string[] = [];
  private nextBranch: THREE.Mesh | null = null;
  private version = -1;
  private target = new THREE.Vector3(0, 120, 0);

  constructor(private canvas: HTMLCanvasElement, private sim: Sim) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = new THREE.Color(0x05080d);
    this.scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x1a1010, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-200, 400, 500);
    this.scene.add(key);
    this.camera.position.set(0, 160, 620);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.copy(this.target);
    this.controls.addEventListener('start', () => (this.follow = false));

    this.body();
    this.brain = this.makeBrain();
    this.brainBase = (this.brain.geometry.getAttribute('color') as THREE.BufferAttribute).array.slice() as Float32Array;
    this.buildVessels();
    this.scene.add(this.occGroup);
    this.balloon = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.55 }));
    this.balloon.visible = false;
    this.scene.add(this.balloon);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 640;
    const h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private body(): void {
    const ghost = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), ghost(0x9fb6d6, 0.07));
    head.scale.set(78, 105, 98);
    head.position.set(0, 228, 4);
    this.scene.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 150, 32, 1, true), ghost(0x9fb6d6, 0.05));
    neck.position.set(0, 95, -5);
    this.scene.add(neck);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(150, 130, 260, 40, 1, true), ghost(0x9fb6d6, 0.04));
    chest.scale.set(1, 1, 0.55);
    chest.position.set(0, -110, -10);
    this.scene.add(chest);
    const grid = new THREE.GridHelper(800, 40, 0x1c2633, 0x111821);
    grid.position.y = -245;
    this.scene.add(grid);
  }

  /** Two hemispheres; the left one carries per-vertex territory colours. */
  private makeBrain(): THREE.Mesh {
    const mk = (side: number) => {
      const g = new THREE.SphereGeometry(1, 64, 48);
      g.scale(33, 50, 76);
      g.translate(-side * 34, 236, -6);
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([0.78, 0.6, 0.64], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: side > 0 ? 0.6 : 0.18, roughness: 0.8, depthWrite: false }));
      this.scene.add(m);
      return m;
    };
    mk(-1);
    const left = mk(1);
    // Assign each lateral vertex of the left hemisphere to its nearest MCA cortical branch.
    const pos = left.geometry.getAttribute('position');
    const ends = MCA_BRANCHES.map((id) => {
      const seg = this.sim.tree.segs[id];
      return { id, p: W(seg.pts[seg.pts.length - 1]), mid: W(seg.pts[Math.floor(seg.pts.length / 2)]) };
    });
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const sx = -v.x; // back to sim x
      const inMca = sx > 22 && v.y < 290 && v.z > -72 && !(v.y > 270 && sx < 40);
      if (!inMca) {
        this.brainBranch.push('');
        continue;
      }
      let best = '';
      let bd = Infinity;
      for (const e of ends) {
        const d = Math.min(v.distanceTo(e.p), v.distanceTo(e.mid) * 1.1);
        if (d < bd) {
          bd = d;
          best = e.id;
        }
      }
      this.brainBranch.push(best);
    }
    return left;
  }

  private buildVessels(): void {
    const t = this.sim.tree;
    for (const id of t.order) {
      const seg = t.segs[id];
      const curve = new THREE.CatmullRomCurve3(seg.pts.map(W));
      const r = Math.max(0.55, ((seg.r0 + seg.r1) / 2) * (seg.r1 < 1.6 ? 1.25 : 1));
      const m = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(seg.length / 2)), r, 12, false),
        new THREE.MeshStandardMaterial({ color: 0xc0262d, roughness: 0.45, metalness: 0.05, transparent: true, opacity: 0.85 }),
      );
      m.renderOrder = 1;
      this.scene.add(m);
      this.vessels[id] = m;
    }
  }

  private refreshAnatomy(): void {
    const sim = this.sim;
    const reach = contrastReach(sim.tree, { seg: 'desc', u: 0 }, sim.occ);
    for (const [id, m] of Object.entries(this.vessels)) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const r = reach[id];
      const flowing = !!r && r.to > 0.5;
      mat.color.set(flowing ? 0xc0262d : 0x4b5563);
      mat.opacity = flowing ? 0.85 : 0.45;
    }
    // Occlusions
    this.occGroup.clear();
    for (const o of sim.occ) {
      const seg = sim.tree.segs[o.seg];
      const pts: THREE.Vector3[] = [];
      let left = o.len;
      let segId = o.seg;
      let u = o.u;
      // A clot can run on into the next segment (ICA terminus → M1).
      for (let guard = 0; guard < 3 && left > 0; guard++) {
        const sg = sim.tree.segs[segId];
        const end = Math.min(sg.length, u + left);
        for (let x = u; x <= end; x += 0.6) pts.push(W(pointOn(sg, x).p));
        left -= end - u;
        if (left <= 0 || segId !== 'ica') break;
        segId = 'm1';
        u = 0;
      }
      if (pts.length < 2) pts.push(W(pointOn(seg, o.u).p), W(pointOn(seg, o.u + 1).p));
      const r = pointOn(seg, o.u).r * 1.05 + 0.15;
      const color = o.kind === 'embolus' || o.kind === 'new-territory' ? 0x7f1d1d : sim.c.clot.type === 'white' ? 0xe8d9c4 : sim.c.clot.type === 'mixed' ? 0xa8505a : 0x8b0f14;
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, pts.length), r, 10, true), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      this.occGroup.add(mesh);
    }
    // Brain territory
    const open = branchOpen(sim.tree, sim.occ);
    const col = this.brain.geometry.getAttribute('color') as THREE.BufferAttribute;
    const pos = this.brain.geometry.getAttribute('position');
    const coreR = 46 * Math.cbrt(Math.min(1, sim.core / Math.max(sim.c.hypoperfused, 1)));
    const coreC = W([50, 222, -2]);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const b = this.brainBranch[i];
      let c: [number, number, number] = [this.brainBase[i * 3], this.brainBase[i * 3 + 1], this.brainBase[i * 3 + 2]];
      if (b) {
        v.fromBufferAttribute(pos, i);
        if (v.distanceTo(coreC) < coreR) c = [0.5, 0.04, 0.08];
        else if (open[b] < 0.95) c = [1, 0.66, 0.1];
        else if (sim.passes.length) c = [0.25, 0.85, 0.45];
      }
      col.setXYZ(i, c[0], c[1], c[2]);
    }
    col.needsUpdate = true;
  }

  private deviceMesh(d: DeviceId): void {
    const sim = this.sim;
    const dv = sim.dev[d];
    const key = `${dv.inBody}:${dv.s.toFixed(1)}:${sim.route.join(',')}`;
    if (this.devKey[d] === key) return;
    this.devKey[d] = key;
    const old = this.devMeshes[d];
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
    }
    const from = d === 'guide' ? 0 : Math.max(0, sim.dev.guide.s - 8);
    if (!dv.inBody || dv.s - from < 1) {
      this.devMeshes[d] = undefined;
      return;
    }
    const pts: THREE.Vector3[] = [];
    for (let x = from; x < dv.s; x += 3) pts.push(W(sim.pointAt(x).p));
    pts.push(W(sim.pointAt(dv.s).p));
    if (pts.length < 2) return;
    const st = DEVICE_STYLE[d];
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, pts.length * 2), st.r, 8, false), new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.35, metalness: 0.3 }));
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.devMeshes[d] = mesh;
  }

  private stentAndExtras(): void {
    const sim = this.sim;
    if (this.stentMesh) {
      this.scene.remove(this.stentMesh);
      this.stentMesh.geometry.dispose();
      this.stentMesh = null;
    }
    if (sim.stent) {
      const pts: THREE.Vector3[] = [];
      for (let x = sim.stent.from; x <= sim.stent.to; x += 1) pts.push(W(sim.pointAt(x).p));
      if (pts.length > 1) {
        const r = sim.pointAt((sim.stent.from + sim.stent.to) / 2).r * 1.15;
        this.stentMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 10, false), new THREE.MeshBasicMaterial({ color: 0xe5e7eb, wireframe: true }));
        this.scene.add(this.stentMesh);
      }
    }
    this.balloon.visible = sim.bgcInflated && sim.dev.guide.inBody;
    if (this.balloon.visible) {
      const p = sim.pointAt(Math.max(0, sim.dev.guide.s - 4));
      this.balloon.position.copy(W(p.p));
      this.balloon.scale.set(p.r * 1.1, p.r * 2.2, p.r * 1.1);
    }
    // Highlight the branch the active tip will enter at the next junction.
    const j = sim.phase === 'procedure' ? sim.nextJunction() : null;
    if (this.nextBranch) {
      (this.nextBranch.material as THREE.MeshStandardMaterial).emissive.set(0x000000);
      this.nextBranch = null;
    }
    if (j?.into) {
      this.nextBranch = this.vessels[j.into];
      (this.nextBranch.material as THREE.MeshStandardMaterial).emissive.set(0x8a6d00);
    }
  }

  /** Point the camera: overview in triage, follow the active tip in the procedure. */
  update(dt: number): void {
    const sim = this.sim;
    if (sim.version !== this.version) {
      this.version = sim.version;
      this.refreshAnatomy();
    } else if (Math.random() < 0.05) this.refreshAnatomy(); // core keeps growing with the clock
    for (const d of ['guide', 'asp', 'micro'] as DeviceId[]) this.deviceMesh(d);
    this.stentAndExtras();
    if (this.follow && sim.phase === 'procedure') {
      const tip = W(sim.pointAt(sim.dev[sim.active].s).p);
      this.target.lerp(tip, Math.min(1, dt * 3));
      const offset = this.camera.position.clone().sub(this.controls.target);
      const want = tip.y > 160 ? 170 : 300;
      offset.setLength(offset.length() + (want - offset.length()) * Math.min(1, dt * 1.5));
      this.controls.target.copy(this.target);
      this.camera.position.copy(this.target).add(offset);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  overview(): void {
    this.follow = false;
    this.controls.target.set(0, 120, 0);
    this.camera.position.set(0, 160, 620);
  }

  brainView(): void {
    this.follow = false;
    this.controls.target.set(-30, 235, 0);
    this.camera.position.set(-260, 270, 120);
  }
}
