/**
 * The 3D molecular viewer: a glowing protein ribbon, the binding pocket
 * picked out, the docking box, and the current compound drawn as sticks
 * inside it — the same picture a structural biologist stares at, rebuilt
 * with three.js so it turns in a phone browser.
 *
 * @module dockinglab/view/scene
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CPK = {
  C: 0x9fb2c8, N: 0x4f8cff, O: 0xff5a6e, S: 0xffd166, P: 0xff9f45,
  F: 0x6ef2b0, Cl: 0x6ef26e, Br: 0xc07050, I: 0xb050d0, H: 0xe8eef8, default: 0xc080ff,
};

const PHONE = matchMedia('(max-width: 820px)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !PHONE, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, PHONE ? 1.4 : 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
    this.camera.position.set(0, 0, 90);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.9;
    this.scene.add(new THREE.AmbientLight(0x7088aa, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(40, 60, 80);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fd3ff, 1.4);
    rim.position.set(-60, -20, -40);
    this.scene.add(rim);
    this.protein = new THREE.Group();
    this.pocket = new THREE.Group();
    this.ligand = new THREE.Group();
    this.boxGroup = new THREE.Group();
    this.scene.add(this.protein, this.pocket, this.ligand, this.boxGroup);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), PHONE ? 0.5 : 0.75, 0.6, 0.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.center = new THREE.Vector3();
    this.spin = true;
    this._resize();
    addEventListener('resize', () => this._resize());
    this.controls.addEventListener('start', () => { this.spin = false; });
    this._loop();
  }

  _resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear(group) { while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); } }

  /**
   * Draw the protein as a tube following the Cα trace, coloured by secondary
   * structure (helix / sheet / coil), and recentre the camera on it.
   *
   * @param {{chain:string, points:object[]}[]} segments From pdb.backbone.
   * @param {object} accent Hex colours { helix, sheet, coil } or a base colour.
   */
  showProtein(segments, colors) {
    this.clear(this.protein);
    const box = new THREE.Box3();
    const ssColor = {
      helix: new THREE.Color(colors.helix || 0xff5fa8),
      sheet: new THREE.Color(colors.sheet || 0xffd166),
      coil: new THREE.Color(colors.coil || 0x5f7fa8),
    };
    for (const seg of segments) {
      const pts = seg.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      if (pts.length < 2) continue;
      pts.forEach((p) => box.expandByPoint(p));
      const curve = new THREE.CatmullRomCurve3(pts);
      const divisions = Math.min(1200, pts.length * 6);
      const radius = PHONE ? 0.5 : 0.6;
      const geo = new THREE.TubeGeometry(curve, divisions, radius, PHONE ? 5 : 7, false);
      // Colour each ring by the secondary structure of its nearest residue.
      const colAttr = new Float32Array(geo.attributes.position.count * 3);
      const ringVerts = (PHONE ? 5 : 7) + 1;
      const rings = divisions + 1;
      for (let i = 0; i < geo.attributes.position.count; i += 1) {
        const ring = Math.floor(i / ringVerts);
        const t = ring / (rings - 1);
        const p = seg.points[Math.min(seg.points.length - 1, Math.round(t * (seg.points.length - 1)))];
        const c = ssColor[p.ss] || ssColor.coil;
        colAttr[i * 3] = c.r; colAttr[i * 3 + 1] = c.g; colAttr[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, emissive: 0x101826, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
      this.protein.add(new THREE.Mesh(geo, mat));
    }
    box.getCenter(this.center);
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 40;
    this.protein.position.set(-this.center.x, -this.center.y, -this.center.z);
    this.pocket.position.copy(this.protein.position);
    this.ligand.position.copy(this.protein.position);
    this.boxGroup.position.copy(this.protein.position);
    this.frameRadius = radius;
    this.camera.position.set(0, 0, radius * 1.9);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** Pocket residues as translucent spheres at their Cα, so the site glows. */
  showPocket(pocketResidues, backbone, accent) {
    this.clear(this.pocket);
    const colour = new THREE.Color(accent);
    const lookup = new Map();
    for (const seg of backbone) for (const p of seg.points) lookup.set(`${seg.chain}:${p.resSeq}`, p);
    const geo = new THREE.SphereGeometry(2.4, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const r of pocketResidues) {
      const p = lookup.get(`${r.chain}:${r.resSeq}`);
      if (!p) continue;
      const s = new THREE.Mesh(geo, mat);
      s.position.set(p.x, p.y, p.z);
      this.pocket.add(s);
    }
  }

  /** The docking search box as a glowing wireframe cube. */
  showBox(box, accent) {
    this.clear(this.boxGroup);
    const geo = new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.7 }));
    edges.position.set(box.center.x, box.center.y, box.center.z);
    this.boxGroup.add(edges);
    const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.05, depthWrite: false }));
    glass.position.copy(edges.position);
    this.boxGroup.add(glass);
  }

  /**
   * Draw a compound as ball-and-stick at the pocket centre, grown in with a
   * short animation. `mol` is a parsed SDF (chem.parseSDF); `center` is where
   * to place its centroid (the docking-box centre).
   */
  showLigand(mol, center) {
    this.clear(this.ligand);
    this._ligandMeshes = [];
    if (!mol) return;
    const heavy = mol.atoms.map((a, i) => ({ a, i })).filter(({ a }) => a.element !== 'H');
    let cx = 0; let cy = 0; let cz = 0;
    for (const { a } of heavy) { cx += a.x; cy += a.y; cz += a.z; }
    const n = heavy.length || 1;
    cx /= n; cy /= n; cz /= n;
    const off = new THREE.Vector3(center.x - cx, center.y - cy, center.z - cz);
    const pos = (a) => new THREE.Vector3(a.x, a.y, a.z).add(off);
    const atomGeo = new THREE.SphereGeometry(1, 16, 16);
    for (const { a } of heavy) {
      const mat = new THREE.MeshStandardMaterial({ color: CPK[a.element] ?? CPK.default, roughness: 0.25, metalness: 0.4, emissive: CPK[a.element] ?? CPK.default, emissiveIntensity: 0.35 });
      const s = new THREE.Mesh(atomGeo, mat);
      s.position.copy(pos(a));
      s.scale.setScalar(0.42);
      this.ligand.add(s);
      this._ligandMeshes.push(s);
    }
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f8, roughness: 0.3, metalness: 0.4, emissive: 0x334466, emissiveIntensity: 0.3 });
    for (const b of mol.bonds) {
      const a1 = mol.atoms[b.a]; const a2 = mol.atoms[b.b];
      if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') continue;
      const p1 = pos(a1); const p2 = pos(a2);
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      const len = p1.distanceTo(p2);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 8), stickMat);
      cyl.position.copy(mid);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
      this.ligand.add(cyl);
      this._ligandMeshes.push(cyl);
    }
    this.ligand.scale.setScalar(0.01);
    this._ligandGrow = 0;
  }

  /** Point the camera at the pocket for a close-up. */
  focusPocket(center, radius = 16) {
    const target = new THREE.Vector3(center.x, center.y, center.z).add(this.protein.position);
    this._flyTo = { target, dist: radius };
  }

  resetView() {
    this._flyTo = { target: new THREE.Vector3(0, 0, 0), dist: (this.frameRadius || 40) * 1.9 };
    this.spin = true;
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    if (this.spin) this.protein.rotation.y += 0.0015;
    this.pocket.rotation.copy(this.protein.rotation);
    this.ligand.rotation.copy(this.protein.rotation);
    this.boxGroup.rotation.copy(this.protein.rotation);
    if (this._ligandGrow != null && this._ligandGrow < 1) {
      this._ligandGrow = Math.min(1, this._ligandGrow + 0.06);
      const e = 1 - (1 - this._ligandGrow) ** 3;
      this.ligand.scale.setScalar(e);
    }
    if (this._flyTo) {
      this.controls.target.lerp(this._flyTo.target, 0.08);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      const want = this.controls.target.clone().add(dir.multiplyScalar(this._flyTo.dist));
      this.camera.position.lerp(want, 0.08);
      if (this.camera.position.distanceTo(want) < 0.5) this._flyTo = null;
    }
    this.controls.update();
    this.composer.render();
  }
}
