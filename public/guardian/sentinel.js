import * as THREE from 'three';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';
import { ByteTracker, FallWatch } from '../vision-kit/bytetrack.js';
import { LatencyHarness, batchingModel } from '../vision-kit/latency.js';
import { HeatGrid, coverageGrid, whatIf, heatRamp } from '../vision-kit/twin.js';
import { rng, gauss, simulateObservations, solvePose, poseError } from '../vision-kit/vps.js';
import { turbo } from '../vision-kit/pointcloud.js';
import { sees } from '../vision-kit/twin.js';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN · SENTINEL — the home as a vision safety grid.
// Camera nodes with live view cones, a CCTV feed rendered from each node with
// ByteTrack IDs on it, a fall watch driven by the real tracker on projected
// detections, an activity / coverage floor overlay (digital twin), what-if
// scenarios, a companion robot localised by VPS, and a ray-cast depth scan.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const NODE_H = 1.85;
const FEED_W = 640;
const FEED_H = 360;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TICK = 0.1; // perception runs at 10 Hz, independent of the render rate

// The home's walls as 2D segments (must match sim/home.js), used for line of sight.
const WALLS = [
  [-6, -4.5, 6, -4.5], [-6, 4.5, -2.3, 4.5], [-1.1, 4.5, 6, 4.5], [-6, -4.5, -6, 4.5], [6, -4.5, 6, 4.5],
  [-1, -4.5, -1, -1.7], [-1, -0.7, -1, 0.5], [-6, 0.5, -1, 0.5],
  [-3, 0.5, -3, 1.2], [-3, 2.05, -3, 4.5],
  [0, -4.5, 0, -2.8], [0, -1.2, 0, 1.0], [0, 3.2, 0, 4.5], [3.8, 1.5, 6, 1.5],
];

// Yaw 0 looks toward −z; positive yaw turns toward +x (matches vision-kit/twin.js).
const NODES = [
  { id: 'c1', name: 'BEDROOM', x: -5.7, z: -4.2, yaw: 2.356, fov: 100, range: 7, ir: false, kind: 'cam' },
  { id: 'c2', name: 'HALL', x: -0.5, z: -4.25, yaw: Math.PI, fov: 60, range: 10, ir: true, kind: 'cam' },
  { id: 'c3', name: 'LIVING', x: 5.7, z: -4.2, yaw: -2.356, fov: 100, range: 8.5, ir: false, kind: 'cam' },
  { id: 'c4', name: 'KITCHEN', x: 5.7, z: 4.2, yaw: -0.785, fov: 100, range: 7, ir: false, kind: 'cam' },
  { id: 'c5', name: 'FOYER', x: -1.3, z: 4.2, yaw: -0.2, fov: 90, range: 6.5, ir: true, kind: 'cam' },
  { id: 'r6', name: 'BATH', x: -5.75, z: 4.25, yaw: 0.785, fov: 120, range: 4.5, ir: true, kind: 'radar' },
];
const EXTRA_NODE = { id: 'c7', name: 'HALL-S', x: -0.5, z: 4.1, yaw: 0, fov: 60, range: 10, ir: true, kind: 'cam' };

// Visual anchors the companion robot localises against (mapped features on the walls).
const ANCHORS = [
  [-5.93, 0.9, -2.5], [-3.5, 0.7, -4.43], [-1.07, 1.0, -3.2], [0.07, 0.8, -0.2], [3.0, 1.05, -4.43], [5.93, 0.75, -0.6],
  [5.93, 1.0, 2.9], [2.0, 0.8, 4.43], [-2.0, 1.0, 4.43], [-5.93, 0.8, 1.6], [-3.07, 0.95, 3.4], [-0.07, 0.6, 2.4],
].map(([x, y, z], i) => ({ id: 'A' + (i + 1), x, y, z }));

// The resident's day: [x, z, dwell seconds].
const ROUTINE = [
  [-3.3, -1.9, 3], [-1.0, -1.2, 0], [-0.5, -2.0, 0], [0.5, -2.0, 0], [3.0, -3.0, 4], [2.0, -0.5, 0], [2.0, 2.4, 4],
  [0.4, 2.1, 0], [-0.5, 1.8, 0], [-2.0, 1.6, 0], [-3.0, 1.6, 0], [-4.3, 2.6, 3], [-3.0, 1.6, 0], [-1.6, 1.4, 0],
  [-0.5, 0.8, 0], [-0.5, -1.2, 0], [-1.2, -1.2, 0],
];
const DRILL_PATH = [[-0.5, -0.6, 0.6], [-0.5, 1.0, 0], [-1.8, 1.5, 0]];
const ROBOT_PATROL = [[1.2, -0.6], [4.6, -0.6], [4.6, 0.9], [1.2, 0.9]];
const ROBOT_DISPATCH = [[0.6, 2.1], [-0.3, 2.15], [-0.7, 2.25]];

class Walker {
  constructor(pts, loop = true) {
    this.pts = pts;
    this.loop = loop;
    this.i = 0;
    this.x = pts[0][0];
    this.z = pts[0][1];
    this.wait = pts[0][2] ?? 0;
    this.heading = 0;
    this.moving = false;
    this.done = false;
    this.phase = 0;
  }
  step(dt, speed = 0.8) {
    this.moving = false;
    if (this.done) return;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    const n = this.pts.length;
    if (!this.loop && this.i >= n - 1) {
      this.done = true;
      return;
    }
    const [tx, tz] = this.pts[(this.i + 1) % n];
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) {
      this.i = (this.i + 1) % n;
      this.wait = this.pts[this.i][2] ?? 0;
      return;
    }
    const m = Math.min(d, speed * dt);
    this.x += (dx / d) * m;
    this.z += (dz / d) * m;
    const target = Math.atan2(dx, dz);
    this.heading += Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading)) * Math.min(1, dt * 6);
    this.moving = true;
    this.phase += m * 7;
  }
}

/** Distance along a 2D ray to the nearest wall. */
function rayToWalls(x, z, dx, dz, max) {
  let best = max;
  for (const [x1, z1, x2, z2] of WALLS) {
    const ex = x2 - x1;
    const ez = z2 - z1;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - x) * ez - (z1 - z) * ex) / den;
    const u = ((x1 - x) * dz - (z1 - z) * dx) / den;
    if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

function label(text, color = '#3ff3ff') {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(2.2, 0.275, 1);
  spr.userData.draw = (t, col = color) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 768, 96);
    g.font = '600 38px JetBrains Mono, monospace';
    const w = Math.min(760, g.measureText(t).width + 36);
    g.fillStyle = 'rgba(4,8,16,.78)';
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(384 - w / 2, 14, w, 66, 12);
    g.fill();
    g.stroke();
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, 384, 49);
    tex.needsUpdate = true;
  };
  spr.userData.draw(text);
  return spr;
}

const coneMat = (color, alpha) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uAlpha: { value: alpha }, uSel: { value: 0 } },
    vertexShader: 'attribute float aD; varying float vD; void main(){ vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uAlpha, uSel; varying float vD;
      void main(){
        float a = uAlpha * (1.0 - vD) * (0.55 + 0.9 * uSel);
        float scan = smoothstep(0.05, 0.0, abs(fract(uTime * 0.32) - vD)) * (0.5 + uSel);
        float edge = smoothstep(0.93, 1.0, vD) * 0.5;
        gl_FragColor = vec4(uColor * (a + (scan + edge) * uAlpha * 1.6), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

export class Sentinel {
  constructor(G) {
    this.G = G;
    this.app = G.app;
    this.home = G.home;
    this.group = new THREE.Group();
    this.home.scene.add(this.group);
    this.group.visible = false;
    this.toggles = { night: false, hall: false, ir: false, add: false };
    this.overlay = 'heat';
    this.selected = 'c5';
    this.simT = 0;
    this.acc = 0;
    this.rand = rng(11);
    this.walker = new Walker(ROUTINE);
    this.drill = null;
    this.events = [];
    this.lat = new LatencyHarness(120);
    this.heat = new HeatGrid({ x0: -6, z0: -4.5, x1: 6, z1: 4.5, cell: 0.25 });
    this.trackers = {};
    this.falls = {};
    this.lastTracks = {};
    this.nodes = {};
    this.buildNodes();
    this.buildOverlay();
    this.buildBracket();
    this.buildRobot();
    this.buildAnchors();
    this.feedRT = new THREE.WebGLRenderTarget(320, 180, { type: THREE.UnsignedByteType });
    this.feedPx = new Uint8Array(320 * 180 * 4);
    this.feedImg = null;
    this.feedT = 0;
    this.panelT = 0;
    this.lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) this.lut[i] = Math.min(255, Math.round(255 * Math.pow(Math.min(1, (i / 255) * 1.25), 1 / 2.2)));
    this.seedHeat();
    this.applyScenario();
    this.writeOverlay(0);
  }

  get nightOn() {
    return this.active && this.toggles.night;
  }
  get light() {
    return this.toggles.night ? 0.12 : 1;
  }

  // ── Scene construction ─────────────────────────────
  buildNodes() {
    for (const n of [...NODES, EXTRA_NODE]) {
      const g = new THREE.Group();
      g.position.set(n.x, NODE_H, n.z);
      g.rotation.order = 'YXZ';
      g.rotation.y = -n.yaw;
      g.rotation.x = -0.38;
      const radar = n.kind === 'radar';
      const col = radar ? '#b88bff' : '#3ff3ff';
      const metal = new THREE.MeshStandardMaterial({ color: '#1b1f2a', metalness: 0.8, roughness: 0.3 });
      const body = new THREE.Mesh(radar ? new THREE.BoxGeometry(0.26, 0.2, 0.05) : new THREE.CapsuleGeometry(0.06, 0.16, 4, 12), metal);
      if (!radar) body.rotation.x = Math.PI / 2;
      g.add(body);
      const lensMat = new THREE.MeshBasicMaterial({ color: col });
      const lens = new THREE.Mesh(radar ? new THREE.RingGeometry(0.05, 0.075, 24) : new THREE.CircleGeometry(0.04, 20), lensMat);
      lens.position.z = radar ? -0.03 : -0.15;
      lens.rotation.y = Math.PI;
      g.add(lens);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, NODE_H, 6), metal);
      mast.position.set(n.x, NODE_H / 2, n.z);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.node = n.id;
      g.add(hit);
      const lbl = label(`${n.id.toUpperCase()} · ${n.name}`, col);
      lbl.position.set(n.x, NODE_H + 0.42, n.z);
      const fan = new THREE.Mesh(new THREE.BufferGeometry(), coneMat(col, 0.2));
      const vol = new THREE.Mesh(new THREE.BufferGeometry(), coneMat(col, 0.055));
      this.group.add(g, mast, lbl, fan, vol);
      this.nodes[n.id] = { cfg: n, g, lens, lensMat, mast, lbl, fan, vol, hit, col, vcam: this.makeVcam(n) };
      this.trackers[n.id] = new ByteTracker({ maxLost: 20 });
      this.falls[n.id] = new FallWatch({ fps: 10, confirmSec: 2, stillSec: 45 });
    }
  }

  makeVcam(n) {
    const aspect = FEED_W / FEED_H;
    const vfov = (2 * Math.atan(Math.tan((n.fov * Math.PI) / 360) / aspect) * 180) / Math.PI;
    const c = new THREE.PerspectiveCamera(Math.max(vfov * 1.25, 40), aspect, 0.05, 30);
    c.position.set(n.x, NODE_H, n.z);
    c.lookAt(n.x + Math.sin(n.yaw) * 3, NODE_H - 1.25, n.z - Math.cos(n.yaw) * 3);
    c.updateMatrixWorld();
    return c;
  }

  buildCone(node, cfg, light) {
    const N = 44;
    const range = cfg.ir ? cfg.range : cfg.range * (0.25 + 0.75 * light);
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = cfg.yaw + ((i / N - 0.5) * cfg.fov * Math.PI) / 180;
      const dx = Math.sin(a);
      const dz = -Math.cos(a);
      const d = rayToWalls(cfg.x, cfg.z, dx, dz, range);
      pts.push([cfg.x + dx * d, cfg.z + dz * d, d / range]);
    }
    const fanPos = [];
    const fanD = [];
    const volPos = [];
    const volD = [];
    for (let i = 0; i < N; i++) {
      const [ax, az, ad] = pts[i];
      const [bx, bz, bd] = pts[i + 1];
      fanPos.push(cfg.x, 0.045, cfg.z, ax, 0.045, az, bx, 0.045, bz);
      fanD.push(0, ad, bd);
      volPos.push(cfg.x, NODE_H, cfg.z, ax, 0.05, az, bx, 0.05, bz);
      volD.push(0, ad, bd);
    }
    const set = (mesh, pos, d) => {
      mesh.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aD', new THREE.Float32BufferAttribute(d, 1));
      mesh.geometry = g;
    };
    set(node.fan, fanPos, fanD);
    set(node.vol, volPos, volD);
  }

  buildOverlay() {
    const H = this.heat;
    this.ovData = new Uint8Array(H.cols * H.rows * 4);
    this.ovTex = new THREE.DataTexture(this.ovData, H.cols, H.rows, THREE.RGBAFormat);
    this.ovTex.magFilter = THREE.LinearFilter;
    this.ovTex.minFilter = THREE.LinearFilter;
    this.ovTex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 9),
      new THREE.MeshBasicMaterial({ map: this.ovTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.035;
    plane.renderOrder = 2;
    this.ovPlane = plane;
    this.group.add(plane);
  }

  buildBracket() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3));
    this.bracket = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.95 }));
    this.bracketLbl = label('RESIDENT', '#3ff3ff');
    this.bracketLbl.scale.set(2.9, 0.36, 1);
    this.group.add(this.bracket, this.bracketLbl);
    this.box3 = new THREE.Box3();
  }

  buildRobot() {
    const g = new THREE.Group();
    const shell = new THREE.MeshPhysicalMaterial({ color: '#e8edf5', roughness: 0.25, clearcoat: 1, metalness: 0.1 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.14, 32), shell);
    base.position.y = 0.09;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: '#ff4fd8' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12), shell);
    mast.position.y = 0.27;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshBasicMaterial({ color: '#ff9cf0' }));
    head.position.y = 0.4;
    g.add(base, ring, mast, head);
    const glow = new THREE.PointLight('#ff4fd8', 0.5, 1.6, 2);
    glow.position.y = 0.3;
    g.add(glow);
    this.robot = { g, ring, walker: new Walker(ROBOT_PATROL.map(([x, z]) => [x, z, 0.4])), mode: 'patrol', est: null, sol: null, seed: 1, t: 0 };
    this.robot.walker.x = 1.2;
    this.robot.walker.z = -0.6;
    // VPS estimate ring (tight) and GPS uncertainty ring (wide), plus beams to anchors.
    this.vpsRing = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.28, 48), new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.vpsRing.rotation.x = -Math.PI / 2;
    this.gpsRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: '#ff4466', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.gpsRing.rotation.x = -Math.PI / 2;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ANCHORS.length * 6), 3));
    this.beams = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(g, this.vpsRing, this.gpsRing, this.beams);
  }

  buildAnchors() {
    const mat = new THREE.MeshBasicMaterial({ color: '#ff4fd8' });
    this.anchorMeshes = ANCHORS.map((a) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), mat.clone());
      m.position.set(a.x, a.y, a.z);
      this.group.add(m);
      return m;
    });
  }

  // ── Scenario / twin ────────────────────────────────
  cameras() {
    const T = this.toggles;
    const list = NODES.map((n) => ({ ...n, ir: T.ir || n.ir, online: !(T.hall && n.id === 'c2') }));
    if (T.add) list.push({ ...EXTRA_NODE, online: true });
    return list;
  }

  applyScenario() {
    this.cams = this.cameras();
    const light = this.light;
    for (const node of Object.values(this.nodes)) {
      const cfg = this.cams.find((c) => c.id === node.cfg.id);
      const shown = !!cfg;
      node.g.visible = node.mast.visible = node.lbl.visible = shown;
      node.fan.visible = node.vol.visible = shown && cfg.online;
      if (!shown) continue;
      node.live = cfg;
      node.lensMat.color.set(cfg.online ? node.col : '#ff4466');
      node.lbl.userData.draw(`${cfg.id.toUpperCase()} · ${cfg.name}${cfg.online ? '' : ' · OFF'}`, cfg.online ? node.col : '#ff4466');
      if (cfg.online) this.buildCone(node, cfg, light);
    }
    const site = { cameras: NODES.map((n) => ({ ...n })), walls: WALLS, light: 1 };
    const scen = {
      offline: this.toggles.hall ? ['c2'] : [],
      light,
      add: this.toggles.add ? [{ ...EXTRA_NODE }] : [],
      move: this.toggles.ir ? Object.fromEntries(NODES.map((n) => [n.id, { ir: true }])) : {},
    };
    this.wi = whatIf(site, scen, this.heat);
    if (this.selected && !this.cams.find((c) => c.id === this.selected)) this.selected = 'c5';
  }

  /** Pre-seed the heatmap with a simulated day of the routine. */
  seedHeat() {
    const w = new Walker(ROUTINE);
    for (let i = 0; i < 2400; i++) {
      w.step(0.25, 0.8);
      this.heat.add(w.x, w.z, 0.25, 0.6);
    }
  }

  writeOverlay(t) {
    const H = this.heat;
    const d = this.ovData;
    const mode = this.overlay;
    this.ovPlane.visible = mode !== 'off';
    if (mode === 'off') return;
    const heat = mode === 'heat' ? H.normalized() : null;
    const cov = mode === 'cov' ? this.wi.next.count : null;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3);
    for (let r = 0; r < H.rows; r++) {
      for (let c = 0; c < H.cols; c++) {
        const i = r * H.cols + c;
        const o = ((H.rows - 1 - r) * H.cols + c) * 4;
        let col;
        let a;
        if (heat) {
          const v = Math.pow(heat[i], 0.55);
          col = heatRamp(0.15 + v * 0.75);
          a = Math.min(0.78, v * 0.95) * smoothstep(0.04, 0.2, v);
        } else {
          const n = cov[i];
          if (n === 0) {
            col = [1, 0.18, 0.32];
            a = 0.5 * pulse;
          } else {
            const k = Math.min(1, n / 3);
            col = [0.15, 0.75 + 0.25 * k, 0.95];
            a = 0.12 + 0.2 * k;
          }
        }
        d[o] = col[0] * 255;
        d[o + 1] = col[1] * 255;
        d[o + 2] = col[2] * 255;
        d[o + 3] = a * 255;
      }
    }
    this.ovTex.needsUpdate = true;
  }

  // ── Perception ─────────────────────────────────────
  projectBox(vcam) {
    const b = this.box3;
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const v = new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).project(vcam);
      if (v.z > 1 || v.z < -1) return null;
      pts.push(v);
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of pts) {
      const px = ((v.x + 1) / 2) * FEED_W;
      const py = ((1 - v.y) / 2) * FEED_H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(FEED_W, x1), cy1 = Math.min(FEED_H, y1);
    if (cx1 - cx0 < 4 || cy1 - cy0 < 4) return null;
    const visible = ((cx1 - cx0) * (cy1 - cy0)) / Math.max(1, (x1 - x0) * (y1 - y0));
    return { box: [cx0, cy0, cx1 - cx0, cy1 - cy0], visible };
  }

  perceive() {
    const P = this.home.person;
    P.updateMatrixWorld(true);
    this.box3.setFromObject(P);
    const px = P.position.x;
    const pz = P.position.z;
    const light = this.light;
    for (const cam of this.cams) {
      const node = this.nodes[cam.id];
      const dets = [];
      if (cam.online && sees(cam, px, pz, WALLS, light)) {
        const pb = this.projectBox(node.vcam);
        if (pb && this.rand() > 0.03) {
          const dist = Math.hypot(px - cam.x, pz - cam.z);
          let score = 0.9 + gauss(this.rand) * 0.03 - (1 - pb.visible) * 0.5 - (dist > cam.range * 0.75 ? 0.35 : 0);
          if (!cam.ir && light < 0.5) score -= 0.3;
          score = Math.max(0.05, Math.min(0.99, score));
          const jit = pb.box.map((v) => v + gauss(this.rand) * 1.2);
          dets.push({ box: jit, score, cls: 'person' });
        }
      }
      const vis = this.trackers[cam.id].update(dets);
      this.lastTracks[cam.id] = vis;
      for (const ev of this.falls[cam.id].update(vis, this.simT)) this.onWatchEvent(cam, ev);
    }
    // Device profile for the latency panel (an edge box running a small detector).
    const r = this.rand;
    let t = 0;
    this.lat.begin(0);
    this.lat.mark('capture', (t += 1.6 + r() * 0.9));
    this.lat.mark('transport', (t += 3.8 + r() * 2.2));
    this.lat.mark('inference', (t += 23 + Math.abs(gauss(r)) * 5 + (r() < 0.04 ? 28 : 0)));
    this.lat.mark('scoring', (t += 0.5 + r() * 0.5));
    this.lat.end(t);
  }

  onWatchEvent(cam, ev) {
    if (ev.type === 'fall') {
      const D = this.drill;
      this.app.feed.push('sn.feed.fall', 'warn', { cam: `${cam.id.toUpperCase()} ${cam.name}`, id: ev.id });
      this.events.unshift({ t: this.simT, text: i18n.t('sn.feed.fall', { cam: `${cam.id.toUpperCase()} ${cam.name}`, id: ev.id }), lvl: 'bad' });
      if (D && D.onset !== null && D.detect === null) {
        const st = this.falls[cam.id].state.get(ev.id);
        const tr = this.lastTracks[cam.id].find((x) => x.id === ev.id);
        const stand = D.stand?.[cam.id];
        D.detect = st?.down ?? this.simT - 2;
        D.confirm = this.simT;
        D.cam = cam;
        D.dropPct = stand && tr ? Math.round((100 * (tr.box[1] + tr.box[3] / 2 - (stand[1] + stand[3] / 2))) / stand[3]) : '—';
        D.aspect = tr ? (tr.box[2] / tr.box[3]).toFixed(2) : '—';
        D.notify = this.simT + 0.42;
        this.app.stage.flash('#ff4466');
        sfx.warn();
        this.selected = cam.id;
        this.robot.mode = 'dispatch';
        this.robot.walker = new Walker([[this.robot.walker.x, this.robot.walker.z, 0], ...ROBOT_DISPATCH.map(([x, z]) => [x, z, 0])], false);
        this.render();
      }
    } else if (ev.type === 'recovered') {
      this.events.unshift({ t: this.simT, text: i18n.t('sn.feed.recover'), lvl: 'ok' });
    }
    this.events.length = Math.min(this.events.length, 8);
  }

  // ── Drill ──────────────────────────────────────────
  startDrill() {
    if (this.drill && !this.drill.finished) return;
    const w = new Walker(DRILL_PATH, false);
    this.drill = { walker: w, onset: null, detect: null, confirm: null, notify: null, robot: null, voice: null, fallT: 0, finished: false, start: this.simT };
    this.app.feed.push('sn.feed.drill', 'warn');
    this.G.cam.goal.t.set(-1.2, 0, 1.4);
    this.G.cam.goal.r = 11;
    this.G.cam.goal.pitch = 0.82;
    this.selected = 'c5';
    sfx.select();
    this.render();
  }

  resetDrill() {
    this.drill = null;
    this.robot.mode = 'patrol';
    this.robot.walker = new Walker(ROBOT_PATROL.map(([x, z]) => [x, z, 0.4]));
    this.robot.walker.x = 1.2;
    this.robot.walker.z = 0.9;
    this.robot.walker.i = 3;
    this.walker = new Walker(ROUTINE);
    this.walker.i = 13;
    [this.walker.x, this.walker.z] = ROUTINE[13];
    this.home.person.rotation.set(0, 0, 0);
    this.G.cam.goal.r = 19;
    this.G.cam.goal.t.set(0, 0, 0);
    this.render();
  }

  // ── Picking ────────────────────────────────────────
  pick(ray) {
    const hits = ray.intersectObjects(Object.values(this.nodes).filter((n) => n.g.visible).map((n) => n.hit), false);
    if (!hits.length) return false;
    this.selected = hits[0].object.userData.node;
    sfx.select();
    this.render();
    return true;
  }

  // ── Depth scan (ray-cast point cloud from the selected node) ──
  toggleDepth() {
    if (this.depthPts) {
      this.group.remove(this.depthPts);
      this.depthPts.geometry.dispose();
      this.depthPts = null;
      this.render();
      return;
    }
    const node = this.nodes[this.selected];
    const vcam = node.vcam;
    const meshes = [];
    const visibleUp = (o) => {
      for (let p = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    this.group.visible = false;
    this.home.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.visible !== false && !o.material.transparent && visibleUp(o)) meshes.push(o);
    });
    this.group.visible = true;
    const ray = new THREE.Raycaster();
    ray.far = node.cfg.range + 2;
    const W = 128;
    const H = 72;
    const pos = [];
    const dist = [];
    const ndc = new THREE.Vector2();
    for (let v = 0; v < H; v++) {
      for (let u = 0; u < W; u++) {
        ndc.set(((u + 0.5) / W) * 2 - 1, -(((v + 0.5) / H) * 2 - 1));
        ray.setFromCamera(ndc, vcam);
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) continue;
        pos.push(hit.point.x, hit.point.y + 0.01, hit.point.z);
        dist.push(hit.distance);
      }
    }
    const maxD = Math.max(...dist, 1);
    const col = [];
    const nd = [];
    for (const d of dist) {
      const c = turbo(1 - d / maxD);
      col.push(...c);
      nd.push(d / maxD);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aD', new THREE.Float32BufferAttribute(nd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uReveal: { value: 0 }, uSize: { value: 3.2 * Math.min(2, devicePixelRatio || 1) }, uTime: { value: 0 } },
      vertexShader: `attribute float aD; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uReveal, uSize, uTime;
        void main(){ vC = color; vA = smoothstep(uReveal, uReveal - 0.08, aD);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (6.0 / -mv.z) * (1.0 + 2.0 * smoothstep(0.04, 0.0, abs(aD - uReveal))); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; if (dot(q,q) > 0.25) discard; gl_FragColor = vec4(vC * vA * 1.2, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.depthPts = new THREE.Points(g, mat);
    this.depthPts.userData.count = dist.length;
    this.group.add(this.depthPts);
    sfx.confirm();
    this.render();
  }

  // ── Panel ──────────────────────────────────────────
  render() {
    const p = $('#panel');
    const t = (k, v) => i18n.t(k, v);
    const T = this.toggles;
    const chip = (k) => `<button class="sn-tg${T[k] ? ' on' : ''}" data-k="${k}">${t('sn.wi.' + k)}</button>`;
    const D = this.drill;
    p.innerHTML = `
      <header class="lv-head mono">${t('sn.title')}</header>
      <p class="intro">${t('sn.intro')}</p>
      <div class="sn-monitor"><canvas id="sn-cctv" width="${FEED_W}" height="${FEED_H}"></canvas>
        <div class="sn-cams">${this.cams.map((c) => `<button class="sn-cam${c.id === this.selected ? ' on' : ''}${c.online ? '' : ' off'}${c.kind === 'radar' ? ' radar' : ''}" data-id="${c.id}">${c.id.toUpperCase()}</button>`).join('')}</div></div>
      <div class="sn-stats">
        <div><b class="mono" id="sn-s-cams">—</b><small>${t('sn.stats.cams')}</small></div>
        <div><b class="mono" id="sn-s-cov">—</b><small>${t('sn.stats.cov')}</small></div>
        <div><b class="mono" id="sn-s-trk">—</b><small>${t('sn.stats.tracks')}</small></div>
        <div><b class="mono" id="sn-s-fps">—</b><small>${t('sn.stats.fps')}</small></div>
      </div>
      <div class="row-btns">
        <button class="btn ${D ? 'panel' : 'primary'}" id="sn-drill">${D ? (D.onset !== null ? t('sn.helpUp') : t('sn.drillRun')) : t('sn.drill')}</button>
        <button class="btn panel" id="sn-depth">${this.depthPts ? t('sn.depthOff') : t('sn.depth')}</button>
      </div>
      ${this.depthPts ? `<p class="mono small sn-note">${t('sn.depthNote')} · ${this.depthPts.userData.count} pts</p>` : ''}
      <div class="sn-seg"><span class="mono">${t('sn.overlay')}</span>${['heat', 'cov', 'off'].map((m) => `<button data-m="${m}" class="${this.overlay === m ? 'on' : ''}">${t('sn.ov.' + m)}</button>`).join('')}</div>
      <div class="lv-sub mono">${t('sn.wi')}</div>
      <div class="sn-tgs">${chip('night')}${chip('hall')}${chip('ir')}${chip('add')}</div>
      <p class="mono small" id="sn-wi"></p>
      <div class="lv-sub mono">${t('sn.chain')}</div>
      <ol class="sn-chain" id="sn-chain"></ol>
      <div class="lv-sub mono">${t('sn.lat')}</div>
      <div class="sn-lat" id="sn-lat"></div>
      <p class="mono small" id="sn-batch"></p>
      <p class="small sn-note">${t('sn.latNote')}</p>
      <div class="lv-sub mono">${t('sn.vps')}</div>
      <p class="small" id="sn-vps-body"></p>
      <div class="mono sn-vps" id="sn-vps"></div>
      <p class="mono small" id="sn-gps"></p>
      <div class="row-btns"><button class="btn panel" id="sn-live">◉ ${t('sn.live')}</button></div>
      <p class="small sn-note">${t('sn.liveNote')}</p>
      <div class="lv-sub mono">${t('sn.privacy')}</div>
      <ul class="sn-priv"><li>${t('sn.p1')}</li><li>${t('sn.p2')}</li><li>${t('sn.p3')}</li><li>${t('sn.p4')}</li><li>${t('sn.p5')}</li></ul>
      <p class="small sn-note">${t('sn.demo')}</p>`;
    this.cctv = p.querySelector('#sn-cctv');
    this.cctvCtx = this.cctv.getContext('2d');
    p.querySelectorAll('.sn-cam').forEach((b) => (b.onclick = () => { this.selected = b.dataset.id; sfx.select(); this.render(); }));
    p.querySelectorAll('.sn-tg').forEach((b) => (b.onclick = () => this.toggle(b.dataset.k)));
    p.querySelectorAll('.sn-seg button').forEach((b) => (b.onclick = () => { this.overlay = b.dataset.m; sfx.select(); this.render(); }));
    p.querySelector('#sn-drill').onclick = () => (this.drill ? (this.drill.onset !== null ? this.resetDrill() : null) : this.startDrill());
    p.querySelector('#sn-depth').onclick = () => this.toggleDepth();
    p.querySelector('#sn-live').onclick = () => this.G.app.openLive?.();
    this.tickPanel(true);
  }

  toggle(k) {
    this.toggles[k] = !this.toggles[k];
    sfx.select();
    this.applyScenario();
    this.render();
  }

  tickPanel() {
    const q = (s) => document.getElementById(s);
    if (!q('sn-s-cams')) return;
    const t = (k, v) => i18n.t(k, v);
    const online = this.cams.filter((c) => c.online).length;
    q('sn-s-cams').textContent = `${online}/${this.cams.length}`;
    q('sn-s-cov').textContent = `${Math.round(this.wi.next.ratio * 100)}%`;
    const seeing = Object.values(this.lastTracks).filter((v) => v.length).length;
    q('sn-s-trk').textContent = `${seeing ? 1 : 0} · ${seeing}▣`;
    const st = this.lat.stats();
    q('sn-s-fps').textContent = st.loop ? `${st.loop.median.toFixed(0)} ms` : '—';
    const W = this.wi;
    q('sn-wi').textContent = t('sn.wi.result', { a: Math.round(W.base.ratio * 100), b: Math.round(W.next.ratio * 100), c: Math.round(W.unseenActivityBase * 100), d: Math.round(W.unseenActivityNext * 100) });
    // Latency bars.
    const maxP = Math.max(1, ...['capture', 'transport', 'inference', 'scoring'].map((k) => st[k]?.p95 ?? 0));
    q('sn-lat').innerHTML = ['capture', 'transport', 'inference', 'scoring', 'loop']
      .map((k) => {
        const s = st[k];
        if (!s) return '';
        const scale = k === 'loop' ? Math.max(1, st.loop.p95) : maxP;
        return `<div class="sn-lr${k === 'loop' ? ' tot' : ''}"><span>${t('sn.lat.' + k)}</span><i><b style="width:${(100 * s.median) / scale}%"></b><em style="left:${Math.min(100, (100 * s.p95) / scale)}%"></em></i><span class="mono">${s.median.toFixed(1)} / ${s.p95.toFixed(1)}</span></div>`;
      })
      .join('');
    if (st.inference) {
      const b = batchingModel(st.inference.median, (st.scoring?.median ?? 0.6) + 1.2, 4);
      q('sn-batch').textContent = t('sn.batch', { b: b.batched.toFixed(0), s: b.sequential.toFixed(0), x: b.speedup.toFixed(1) });
    }
    // VPS.
    const R = this.robot;
    if (R.sol) {
      const e = poseError(R.sol.pose, R.solTruth);
      q('sn-vps-body').textContent = t('sn.vps.body', { n: R.obsN });
      q('sn-vps').textContent = t('sn.vps.err', { e: (e.horiz * 100).toFixed(1), s: (R.sol.sigma * 100).toFixed(1), i: R.sol.iters });
      q('sn-gps').textContent = t('sn.vps.gps', { g: '3.5' });
    }
    // Alert chain.
    const ch = q('sn-chain');
    const D = this.drill;
    if (!D || D.onset === null) {
      ch.innerHTML = `<li class="idle">${D ? t('sn.feed.drill') : t('sn.chain.idle')}</li>`;
    } else {
      const rows = [
        [D.onset, t('sn.c.onset'), 'bad'],
        [D.detect, t('sn.c.detect', { d: D.dropPct ?? '—', a: D.aspect ?? '—' }), 'warn'],
        [D.confirm, t('sn.c.confirm', { s: 2 }), 'warn'],
        [D.notify, t('sn.c.notify'), 'ok'],
        [D.robotGo, t('sn.c.robot', { e: R.sol ? (poseError(R.sol.pose, R.solTruth).horiz * 100).toFixed(1) : '—' }), 'ok'],
        [D.voice, t('sn.c.voice'), 'ok'],
        [D.voice !== null && D.voice !== undefined ? D.voice + 60 : null, t('sn.c.escalate'), 'pend'],
      ];
      ch.innerHTML = rows
        .map(([tt, txt, lvl]) => {
          const done = tt !== null && tt !== undefined && this.simT >= tt;
          const stamp = tt !== null && tt !== undefined ? `+${(tt - D.onset).toFixed(2)} s` : '…';
          return `<li class="${done ? lvl : 'wait'}"><span class="mono">${stamp}</span><span>${txt}</span></li>`;
        })
        .join('');
    }
  }

  // ── CCTV feed ──────────────────────────────────────
  drawFeed(t) {
    const ctx = this.cctvCtx;
    if (!ctx || !this.cctv.isConnected) return;
    const node = this.nodes[this.selected];
    const cam = this.cams.find((c) => c.id === this.selected);
    const g = ctx;
    const W = FEED_W;
    const H = FEED_H;
    const stamp = `${this.selected.toUpperCase()} ${node.cfg.name}  ${new Date().toLocaleTimeString('en-GB')}`;
    if (!cam || !cam.online) {
      g.fillStyle = '#07080d';
      g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(255,68,102,${0.03 + 0.03 * Math.random()})`; g.fillRect(0, y, W, 1); }
      g.fillStyle = '#ff4466';
      g.font = '600 22px JetBrains Mono, monospace';
      g.textAlign = 'center';
      g.fillText(i18n.t('sn.offline'), W / 2, H / 2);
      g.textAlign = 'left';
      g.font = '13px JetBrains Mono, monospace';
      g.fillText(stamp, 14, 24);
      return;
    }
    const radar = cam.kind === 'radar';
    const night = this.light < 0.5;
    if (radar) {
      g.fillStyle = '#0a0614';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(184,139,255,.18)';
      for (let r = 40; r < 420; r += 40) { g.beginPath(); g.arc(W / 2, H + 20, r, Math.PI, 2 * Math.PI); g.stroke(); }
      const sweep = (t * 1.4) % Math.PI;
      g.strokeStyle = 'rgba(184,139,255,.6)';
      g.beginPath(); g.moveTo(W / 2, H + 20); g.lineTo(W / 2 - Math.cos(sweep) * 420, H + 20 - Math.sin(sweep) * 420); g.stroke();
    } else {
      // Render the node's view into a small target and copy it to the 2D canvas.
      const R = this.app.stage.renderer;
      const hide = [this.group, this.home.route, ...this.home.markers.map((m) => m.g)];
      const was = hide.map((o) => o.visible);
      hide.forEach((o) => (o.visible = false));
      R.setRenderTarget(this.feedRT);
      R.render(this.home.scene, node.vcam);
      R.readRenderTargetPixels(this.feedRT, 0, 0, 320, 180, this.feedPx);
      R.setRenderTarget(null);
      hide.forEach((o, i) => (o.visible = was[i]));
      if (!this.feedImg) { this.feedCanvas = document.createElement('canvas'); this.feedCanvas.width = 320; this.feedCanvas.height = 180; this.feedImg = this.feedCanvas.getContext('2d').createImageData(320, 180); }
      const src = this.feedPx;
      const dst = this.feedImg.data;
      const L = this.lut;
      const gain = night && !cam.ir ? 0.35 : 1;
      for (let y = 0; y < 180; y++) {
        const sy = (179 - y) * 320 * 4;
        const dy = y * 320 * 4;
        for (let x = 0; x < 320 * 4; x += 4) {
          const r = L[src[sy + x]] * gain, gg = L[src[sy + x + 1]] * gain, b = L[src[sy + x + 2]] * gain;
          if (night && cam.ir) {
            const l = Math.min(255, (0.3 * r + 0.6 * gg + 0.1 * b) * 1.25 + 10);
            dst[dy + x] = l * 0.55; dst[dy + x + 1] = l; dst[dy + x + 2] = l * 0.8;
          } else {
            const l = 0.3 * r + 0.6 * gg + 0.1 * b;
            dst[dy + x] = r * 0.75 + l * 0.25; dst[dy + x + 1] = gg * 0.8 + l * 0.25; dst[dy + x + 2] = b * 0.8 + l * 0.3;
          }
          dst[dy + x + 3] = 255;
        }
      }
      this.feedCanvas.getContext('2d').putImageData(this.feedImg, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.feedCanvas, 0, 0, W, H);
      // Scanlines + grain.
      g.fillStyle = 'rgba(0,0,0,.18)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    }
    // Tracks.
    const tracks = this.trackers[cam.id].tracks.filter((x) => x.state !== 'tentative');
    for (const tr of tracks) {
      const [x, y, w, h] = tr.box;
      const fallen = this.falls[cam.id].state.get(tr.id)?.fallen;
      const col = fallen ? '#ff4466' : tr.lost ? '#ffb86b' : radar ? '#b88bff' : '#3ff3ff';
      if (!radar && tr.lost === 0) {
        // Privacy blur over the person, always on in the demo.
        g.save();
        g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.filter = 'blur(7px)';
        g.drawImage(this.cctv, 0, 0);
        g.restore();
      }
      if (radar) {
        g.fillStyle = col;
        for (let k = 0; k < 40; k++) { const a = (k * 2.4 + t) % 6.28; g.globalAlpha = 0.3 + 0.5 * Math.random(); g.fillRect(x + w / 2 + Math.cos(a) * w * 0.35 * Math.random(), y + h * Math.random(), 3, 3); }
        g.globalAlpha = 1;
      }
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash(tr.lost ? [6, 5] : []);
      const c = Math.min(16, w / 3, h / 3);
      g.beginPath();
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { g.moveTo(cx + sx * c, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * c); }
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = col + '55';
      g.beginPath();
      tr.trail.forEach(([tx, ty], i) => (i ? g.lineTo(tx, ty) : g.moveTo(tx, ty)));
      g.stroke();
      g.fillStyle = col;
      g.font = '600 13px JetBrains Mono, monospace';
      const tag = `ID ${tr.id} · person · ${tr.score.toFixed(2)}${fallen ? ' · FALL' : tr.lost ? ' · coasting' : ''}`;
      g.fillStyle = 'rgba(4,8,16,.75)';
      g.fillRect(x, Math.max(0, y - 20), g.measureText(tag).width + 10, 18);
      g.fillStyle = col;
      g.fillText(tag, x + 5, Math.max(13, y - 6));
    }
    // OSD.
    g.font = '13px JetBrains Mono, monospace';
    g.fillStyle = radar ? '#cdb6ff' : '#e8eefc';
    g.fillText(stamp, 14, 24);
    g.fillStyle = '#5dffa8';
    g.fillText(radar ? 'mmWave · 60 GHz' : `${cam.ir && night ? 'IR ' : ''}ON-DEVICE · REC OFF`, 14, H - 14);
    if (radar) { g.fillStyle = '#cdb6ff'; g.font = '12px JetBrains Mono, monospace'; g.fillText(i18n.t('sn.radar'), 14, 44); }
    else if (night && !cam.ir) { g.fillStyle = '#ffb86b'; g.fillText(i18n.t('sn.dark'), W - 170, 24); }
    g.strokeStyle = 'rgba(63,243,255,.4)';
    g.lineWidth = 1;
    g.strokeRect(W / 2 - 10, H / 2, 20, 0.5);
    g.strokeRect(W / 2, H / 2 - 10, 0.5, 20);
  }

  // ── Frame ──────────────────────────────────────────
  get active() {
    return this.G.tab === 'sentinel';
  }

  update(dt, t) {
    const on = this.active;
    this.group.visible = on;
    this.home.scene.environmentIntensity = on ? (this.toggles.night ? 0.12 : 0.35) : 1;
    if (!on) return;
    const Hm = this.home;
    const P = Hm.person;
    // Resident: routine, drill walk, or fallen.
    const D = this.drill;
    let walker = this.walker;
    if (D) {
      walker = D.walker;
      if (!walker.done) walker.step(dt, 0.85);
      else if (D.onset === null) {
        D.onset = this.simT;
        D.fallT = 0;
        D.stand = Object.fromEntries(Object.entries(this.lastTracks).filter(([, v]) => v.length).map(([id, v]) => [id, v[0].box.slice()]));
      }
    } else walker.step(dt, 0.8);
    P.position.set(walker.x, 0, walker.z);
    if (D && D.onset !== null) {
      D.fallT += dt;
      const k = Math.min(1, D.fallT / 0.5);
      const e = k * k;
      P.rotation.set(0, 0, -e * Math.PI / 2);
      P.position.set(walker.x, 0.17 * e, walker.z);
      Hm.legs[0].rotation.x = Hm.legs[1].rotation.x = 0;
    } else {
      P.rotation.set(0, walker.heading, 0);
      const sw = walker.moving ? Math.sin(walker.phase) : 0;
      Hm.legs[0].rotation.x = 0.4 * sw;
      Hm.legs[1].rotation.x = -0.4 * sw;
      P.position.y = Math.abs(sw) * 0.02;
    }
    this.heat.add(P.position.x, P.position.z, dt, 0.6);
    // Perception at a fixed rate.
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.simT += TICK;
      this.perceive();
    }
    this.updateRobot(dt, t);
    // Drill milestones that follow detection.
    if (D && D.notify !== null && D.robotGo === undefined) D.robotGo = D.notify + 0.6;
    if (D && D.robotGo !== undefined && this.robot.walker.done && D.voice === null) {
      D.voice = this.simT;
      this.app.feed.push('sn.feed.robot', 'ok');
      sfx.confirm();
    }
    // Visuals.
    for (const node of Object.values(this.nodes)) {
      const sel = node.cfg.id === this.selected ? 1 : 0;
      node.fan.material.uniforms.uTime.value = t + node.cfg.x;
      node.vol.material.uniforms.uTime.value = t + node.cfg.x;
      node.fan.material.uniforms.uSel.value += (sel - node.fan.material.uniforms.uSel.value) * Math.min(1, dt * 5);
      node.vol.material.uniforms.uSel.value = node.fan.material.uniforms.uSel.value;
      node.lens.scale.setScalar(1 + 0.25 * sel * (0.5 + 0.5 * Math.sin(t * 6)));
    }
    this.updateBracket(t);
    for (const [i, m] of this.anchorMeshes.entries()) {
      m.rotation.y += dt * 1.2;
      const seen = this.robot.seen?.has(ANCHORS[i].id);
      m.material.color.set(seen ? '#ff9cf0' : '#5a2a55');
      m.scale.setScalar(seen ? 1.2 + 0.15 * Math.sin(t * 5 + i) : 0.9);
    }
    if (this.depthPts) {
      const u = this.depthPts.material.uniforms;
      u.uReveal.value = Math.min(1.1, u.uReveal.value + dt * 0.45);
    }
    this.feedT += dt;
    if (this.feedT > 1 / 12) {
      this.feedT = 0;
      this.drawFeed(t);
    }
    this.panelT += dt;
    if (this.panelT > 0.25) {
      this.panelT = 0;
      this.heat.decay(0.25, 600);
      this.writeOverlay(t);
      this.tickPanel();
    }
  }

  updateBracket(t) {
    if (this.box3.isEmpty()) return;
    const b = this.box3.clone().expandByScalar(0.08);
    const pos = this.bracket.geometry.attributes.position;
    const s = [b.min, b.max];
    const L = 0.18;
    let k = 0;
    for (let c = 0; c < 8; c++) {
      const x = s[c & 1 ? 1 : 0].x, y = s[c & 2 ? 1 : 0].y, z = s[c & 4 ? 1 : 0].z;
      const dx = c & 1 ? -L : L, dy = c & 2 ? -L : L, dz = c & 4 ? -L : L;
      for (const [ax, ay, az] of [[dx, 0, 0], [0, dy, 0], [0, 0, dz]]) {
        pos.setXYZ(k++, x, y, z);
        pos.setXYZ(k++, x + ax, y + ay, z + az);
      }
    }
    pos.needsUpdate = true;
    const D = this.drill;
    const fallen = D && D.confirm !== null;
    const col = fallen ? '#ff4466' : D && D.onset !== null ? '#ffb86b' : '#3ff3ff';
    this.bracket.material.color.set(col);
    this.bracket.material.opacity = 0.65 + 0.35 * Math.sin(t * 5);
    this.bracketLbl.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.35, (b.min.z + b.max.z) / 2);
    const best = Object.entries(this.lastTracks).find(([id, v]) => id === this.selected && v.length) ?? Object.entries(this.lastTracks).find(([, v]) => v.length);
    const txt = best ? `RESIDENT · ID ${best[1][0].id} · ${best[0].toUpperCase()} · ${best[1][0].score.toFixed(2)}` : 'RESIDENT · COASTING';
    const full = fallen ? 'FALL · ' + txt : txt;
    if (full !== this.bracketTxt) {
      this.bracketTxt = full;
      this.bracketLbl.userData.draw(full, col);
    }
  }

  updateRobot(dt, t) {
    const R = this.robot;
    R.walker.step(dt, R.mode === 'dispatch' ? 0.9 : 0.45);
    R.g.position.set(R.walker.x, 0, R.walker.z);
    R.g.rotation.y = R.walker.heading;
    R.ring.material.color.setHSL(0.86, 1, 0.55 + 0.15 * Math.sin(t * 4));
    R.t += dt;
    R.truth = { x: R.walker.x, y: 0.4, z: R.walker.z, yaw: -R.walker.heading };
    if (R.t >= 0.25) {
      R.t = 0;
      const seen = ANCHORS.filter((a) => sees({ x: R.truth.x, z: R.truth.z, yaw: 0, fov: 360, range: 8 }, a.x, a.z, WALLS, 1));
      R.seen = new Set(seen.map((a) => a.id));
      R.obsN = seen.length;
      const obs = simulateObservations(R.truth, seen, { seed: R.seed++, rangeSigma: 0.015, angleSigma: 0.003 });
      const guess = R.sol ? { ...R.sol.pose, x: R.sol.pose.x + (R.truth.x - (R.prev?.x ?? R.truth.x)), z: R.sol.pose.z + (R.truth.z - (R.prev?.z ?? R.truth.z)), yaw: R.truth.yaw + 0.02 } : { x: R.truth.x + 1.2, y: 0.3, z: R.truth.z - 0.9, yaw: R.truth.yaw + 0.2 };
      const sol = solvePose(obs, guess, { rangeSigma: 0.015, angleSigma: 0.003 });
      if (sol.ok) {
        R.sol = sol;
        R.solTruth = { ...R.truth };
      }
      R.prev = { ...R.truth };
      const pos = this.beams.geometry.attributes.position;
      let k = 0;
      for (const a of seen) {
        pos.setXYZ(k++, R.truth.x, 0.4, R.truth.z);
        pos.setXYZ(k++, a.x, a.y, a.z);
      }
      this.beams.geometry.setDrawRange(0, k);
      pos.needsUpdate = true;
    }
    if (R.sol) {
      this.vpsRing.position.set(R.sol.pose.x, 0.04, R.sol.pose.z);
      const s = 1 + 0.08 * Math.sin(t * 6);
      this.vpsRing.scale.setScalar(s);
    }
    this.gpsRing.position.set(R.walker.x + Math.sin(t * 0.7) * 0.6, 0.04, R.walker.z + Math.cos(t * 0.5) * 0.5);
    this.gpsRing.scale.setScalar(3.5);
    this.beams.material.opacity = 0.35 + 0.25 * Math.sin(t * 8);
  }
}
