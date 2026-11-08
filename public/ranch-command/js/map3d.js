/**
 * RANCH COMMAND — the 3D ranch.
 *
 * A holographic model of the property: terrain as a gold contour mesh,
 * cameras as gold beacons, aircraft as red, radios and sensors as neon
 * green, each placed from its real latitude and longitude around the ranch's
 * home point. Drop in an OpenDroneMap orthophoto and the terrain is draped
 * with the actual ranch.
 *
 * @module ranch-command/map3d
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GOLD = 0xffcf4a;
const RED = 0xff2d3d;
const GREEN = 0x39ff14;

/** Metres east/north of home for a coordinate. */
export function toLocal(home, lat, lon) {
  const R = 6371000;
  const x = ((lon - home.lon) * Math.PI / 180) * R * Math.cos(home.lat * Math.PI / 180);
  const z = -((lat - home.lat) * Math.PI / 180) * R;
  return { x, z };
}

/** Deterministic rolling hills, so the same ranch looks the same on every visit. */
function height(x, z) {
  return 6 * Math.sin(x * 0.011) * Math.cos(z * 0.013)
    + 3.5 * Math.sin((x + z) * 0.024 + 1.3)
    + 1.6 * Math.cos(x * 0.051 - z * 0.037);
}

export class RanchMap {
  /**
   * @param {HTMLCanvasElement} canvas Where to draw.
   * @param {{ home: { lat: number, lon: number }, reducedMotion?: boolean }} options Options.
   */
  constructor(canvas, { home, reducedMotion = false }) {
    this.canvas = canvas;
    this.home = home;
    this.reducedMotion = reducedMotion;
    this.extent = 600;
    this.markers = new Map();
    this.yaw = 0.6;
    this.pitch = 0.62;
    this.tilt = { x: 0, y: 0 };
    this.running = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0016);
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 4000);

    // Terrain: a solid black skin with gold contour wireframe over it.
    const size = this.extent * 2;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    this.groundMaterial = new THREE.MeshBasicMaterial({ color: 0x050505 });
    this.ground = new THREE.Mesh(geo, this.groundMaterial);
    this.scene.add(this.ground);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.22 }));
    wire.position.y = 0.05;
    this.scene.add(wire);
    this.wire = wire;

    // A neon-green perimeter ring at the edge of the map.
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.extent * 0.93, this.extent * 0.94, 128), new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 9;
    this.scene.add(ring);
    this.ring = ring;

    // The home beacon.
    this.addMarker('home', { kind: 'home', lat: home.lat, lon: home.lon, label: 'HQ' });

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.1, 0.55, 0.1);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;

    this.bindDrag();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Match the canvas size. */
  resize() {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Drag to turn the ranch, without dragging the slide track with it. */
  bindDrag() {
    let last = null;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); e.stopPropagation(); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.yaw -= (e.clientX - last.x) * 0.006;
      this.pitch = Math.min(1.3, Math.max(0.25, this.pitch + (e.clientY - last.y) * 0.004));
      last = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
    });
    const end = () => { last = null; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /**
   * Place or move a marker.
   *
   * @param {string} id Marker id.
   * @param {{ kind: 'home'|'camera'|'drone'|'node'|'alert', lat?: number, lon?: number, label?: string, x?: number, z?: number }} m The marker.
   */
  addMarker(id, m) {
    let p = { x: m.x ?? 0, z: m.z ?? 0 };
    if (Number.isFinite(m.lat) && Number.isFinite(m.lon)) p = toLocal(this.home, m.lat, m.lon);
    // Things beyond the model are pinned to its edge rather than lost.
    const r = Math.hypot(p.x, p.z);
    if (r > this.extent * 0.9) { p.x *= (this.extent * 0.9) / r; p.z *= (this.extent * 0.9) / r; }
    const color = { home: GOLD, camera: GOLD, drone: RED, node: GREEN, alert: RED }[m.kind] || GREEN;
    let entry = this.markers.get(id);
    if (!entry) {
      const group = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 70, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      beam.position.y = 35;
      const head = new THREE.Mesh(m.kind === 'drone' ? new THREE.OctahedronGeometry(13) : new THREE.SphereGeometry(m.kind === 'home' ? 15 : 10, 20, 14), new THREE.MeshBasicMaterial({ color }));
      head.position.y = m.kind === 'drone' ? 78 : 72;
      const pulse = new THREE.Mesh(new THREE.RingGeometry(12, 15, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.y = 1;
      group.add(beam, head, pulse);
      this.scene.add(group);
      entry = { group, head, pulse, kind: m.kind, label: m.label };
      this.markers.set(id, entry);
    }
    entry.label = m.label || entry.label;
    entry.group.position.set(p.x, height(p.x, p.z), p.z);
  }

  /** Remove markers not in a set of ids. */
  prune(keep) {
    for (const [id, entry] of this.markers) {
      if (id === 'home' || keep.has(id)) continue;
      this.scene.remove(entry.group);
      this.markers.delete(id);
    }
  }

  /**
   * Drape an orthophoto over the terrain.
   *
   * @param {string} url An image URL (an OpenDroneMap `odm_orthophoto` export as PNG or JPEG).
   * @returns {Promise<void>} Resolves when loaded.
   */
  async drape(url) {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.groundMaterial.map = texture;
    this.groundMaterial.color.set(0xffffff);
    this.groundMaterial.needsUpdate = true;
    this.wire.material.opacity = 0.08;
  }

  /** Start drawing. */
  start() {
    if (this.running) return;
    this.running = true;
    const clock = new THREE.Clock();
    const frame = () => {
      if (!this.running) return;
      const t = clock.getElapsedTime();
      if (!this.reducedMotion) this.yaw += 0.0012;
      const yaw = this.yaw + this.tilt.x * 0.35;
      const pitch = Math.min(1.3, Math.max(0.25, this.pitch + this.tilt.y * 0.2));
      const d = this.extent * 1.55;
      this.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
      this.camera.lookAt(0, 0, 0);
      for (const entry of this.markers.values()) {
        const s = 1 + ((t * 0.8 + entry.group.position.x * 0.01) % 1) * 3;
        entry.pulse.scale.set(s, s, s);
        entry.pulse.material.opacity = 0.8 * (1 - (s - 1) / 3);
        entry.head.rotation.y = t;
      }
      this.ring.rotation.z = t * 0.05;
      this.composer.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Stop drawing (off-screen slides cost nothing). */
  stop() {
    this.running = false;
  }

  /**
   * Screen positions of labelled markers, for the HTML label layer.
   *
   * @returns {Array<{ id: string, label: string, kind: string, x: number, y: number }>} Labels.
   */
  labels() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const out = [];
    const v = new THREE.Vector3();
    for (const [id, entry] of this.markers) {
      if (!entry.label) continue;
      entry.head.getWorldPosition(v);
      v.project(this.camera);
      if (v.z > 1) continue;
      out.push({ id, label: entry.label, kind: entry.kind, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h });
    }
    return out;
  }
}
