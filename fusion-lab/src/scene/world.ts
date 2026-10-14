/**
 * The 3D tokamak: an ITER-scale cutaway (metres) with superconducting coils, central solenoid,
 * vacuum vessel, blanket, divertor, heating systems and a glowing plasma whose particles follow
 * the helical magnetic field. Bloom post-processing; click any part to select it.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GEOMETRY } from '../core/physics';
import type { PartId } from '../core/parts';
import { CAP_FRAG, CAP_VERT, LINE_FRAG, LINE_VERT, PARTICLE_FRAG, PARTICLE_VERT, PLASMA_FRAG, PLASMA_VERT, SKY_FRAG, SKY_VERT } from './shaders';

const { R0, a, kappa, delta } = GEOMETRY;
/** The cutaway opens the front quarter (around +z, facing the default camera). */
const PHI0 = Math.PI * 0.27;
const PHIL = Math.PI * 2 - Math.PI * 0.54;

/** D-shaped cross-section point at poloidal angle θ for scale s (s = 1 is the plasma edge). */
export const dPoint = (th: number, s: number): THREE.Vector2 => new THREE.Vector2(R0 + a * s * Math.cos(th + delta * Math.sin(th)), kappa * a * s * Math.sin(th));
const dLoop = (s: number, n = 96) => Array.from({ length: n + 1 }, (_, i) => dPoint(-Math.PI / 2 + (i / n) * Math.PI * 2, s));

export interface PlasmaLook {
  heat: number;
  power: number;
  kink: number;
  flicker: number;
  q0: number;
  qa: number;
}

interface Neutron {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  bred: boolean;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private groups: Partial<Record<PartId, THREE.Group>> = {};
  private explodeDir: Partial<Record<PartId, (o: THREE.Object3D) => THREE.Vector3>> = {};
  private basePos = new Map<THREE.Object3D, THREE.Vector3>();
  private pickables: THREE.Mesh[] = [];
  private plasmaMat!: THREE.ShaderMaterial;
  private particleMat!: THREE.ShaderMaterial;
  private capMat!: THREE.ShaderMaterial;
  private lineMats: THREE.ShaderMaterial[] = [];
  private beamMat!: THREE.MeshBasicMaterial;
  private rfRings: THREE.Mesh[] = [];
  private strike!: THREE.MeshBasicMaterial;
  private neutrons: Neutron[] = [];
  private neutronGeo: THREE.BufferGeometry;
  private breedGeo: THREE.BufferGeometry;
  private breedLife: number[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  hovered: PartId | null = null;
  selected: PartId | null = null;
  explode = 0;
  explodeTarget = 0;
  look: PlasmaLook = { heat: 0.8, power: 0.7, kink: 0, flicker: 0, q0: 1, qa: 3.2 };
  /** Neutrons per second to spawn (scaled from fusion power). */
  neutronRate = 60;
  heatingOn = 1;
  fieldLines = true;
  cutaway = true;
  onPick: ((p: PartId | null) => void) | null = null;
  private flyTo: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private t = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    this.camera.position.set(16, 11, 27);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 8;
    this.controls.maxDistance = 90;
    this.controls.addEventListener('start', () => (this.flyTo = null));

    this.sky();
    this.lights();
    this.buildPlasma();
    this.buildVesselAndBlanket();
    this.buildDivertor();
    this.buildTF();
    this.buildCS();
    this.buildPF();
    this.buildHeating();
    this.buildCryostat();
    this.neutronGeo = new THREE.BufferGeometry();
    this.neutronGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    this.scene.add(new THREE.Points(this.neutronGeo, new THREE.PointsMaterial({ color: 0xbfe9ff, size: 0.28, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.breedGeo = new THREE.BufferGeometry();
    this.breedGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
    this.scene.add(new THREE.Points(this.breedGeo, new THREE.PointsMaterial({ color: 0x4ade80, size: 0.55, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.7, 0.45, 0.42);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    canvas.addEventListener('pointerleave', () => this.pointer.set(9, 9));
    let down = { x: 0, y: 0 };
    canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const hit = this.pick();
      this.onPick?.(hit);
    });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private sky(): void {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(sky);
    const n = 2500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(400 + Math.random() * 400);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.35, 0.7, 0.6 + Math.random() * 0.35);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false })));
  }

  private lights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9ab8ff, 0x1a0b2e, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(20, 30, 25);
    this.scene.add(key);
    // The plasma itself lights the inside of the machine
    const glow = new THREE.PointLight(0xff4df0, 30, 30, 1.6);
    glow.position.set(0, 0, 0);
    this.scene.add(glow);
    for (const ang of [0.4, 2.5, 4.4]) {
      const pl = new THREE.PointLight(0x38bdf8, 14, 16, 1.6);
      pl.position.set(Math.sin(ang) * R0, 0, Math.cos(ang) * R0);
      this.scene.add(pl);
    }
  }

  private group(id: PartId, dir: (o: THREE.Object3D) => THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    g.userData.part = id;
    this.groups[id] = g;
    this.explodeDir[id] = dir;
    this.scene.add(g);
    return g;
  }

  private addMesh(g: THREE.Group, m: THREE.Mesh, id: PartId, pickable = true): THREE.Mesh {
    m.userData.part = id;
    g.add(m);
    this.basePos.set(m, m.position.clone());
    if (pickable) this.pickables.push(m);
    return m;
  }

  /** A solid D-shaped shell between scales sIn and sOut, cut away at the front with end caps. */
  private shell(g: THREE.Group, id: PartId, sIn: number, sOut: number, mat: THREE.Material, capMat: THREE.Material): void {
    for (const s of [sIn, sOut]) this.addMesh(g, new THREE.Mesh(new THREE.LatheGeometry(dLoop(s), 128, PHI0, PHIL), mat), id);
    const shape = new THREE.Shape(dLoop(sOut, 96));
    shape.holes.push(new THREE.Path(dLoop(sIn, 96).reverse()));
    for (const phi of [PHI0, PHI0 + PHIL]) {
      const cap = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), capMat);
      cap.rotation.y = phi - Math.PI / 2;
      this.addMesh(g, cap, id);
    }
  }

  private buildPlasma(): void {
    const g = this.group('plasma', () => new THREE.Vector3());
    this.plasmaMat = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VERT,
      fragmentShader: PLASMA_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uHeat: { value: 0.8 },
        uPower: { value: 0.7 },
        uKink: { value: 0 },
        uFlicker: { value: 0 },
        uColA: { value: new THREE.Color(0xff2bd6) },
        uColB: { value: new THREE.Color(0x3ad7ff) },
        uColC: { value: new THREE.Color(0xfff2c4) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (const s of [0.98, 0.6]) {
      const m = new THREE.Mesh(new THREE.LatheGeometry(dLoop(s, 72), 160, PHI0, PHIL), this.plasmaMat);
      this.addMesh(g, m, 'plasma', s === 0.98);
    }
    // Glowing cross-sections on the two cut faces
    this.capMat = new THREE.ShaderMaterial({
      vertexShader: CAP_VERT,
      fragmentShader: CAP_FRAG,
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0.8 }, uPower: { value: 0.7 }, uFlicker: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const capShape = new THREE.Shape(dLoop(0.99, 96));
    for (const phi of [PHI0, PHI0 + PHIL]) {
      const cap = new THREE.Mesh(new THREE.ShapeGeometry(capShape, 64), this.capMat);
      cap.rotation.y = phi - Math.PI / 2;
      this.addMesh(g, cap, 'plasma');
    }
    // Particles riding the helical field
    const N = 5200;
    const geo = new THREE.BufferGeometry();
    const attrs = { aR: new Float32Array(N), aTh: new Float32Array(N), aPhi: new Float32Array(N), aSpeed: new Float32Array(N), aKind: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      attrs.aR[i] = Math.sqrt(Math.random()) * 0.95;
      attrs.aTh[i] = Math.random() * Math.PI * 2;
      attrs.aPhi[i] = Math.random() * Math.PI * 2;
      attrs.aSpeed[i] = (0.25 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1);
      attrs.aKind[i] = Math.random() < 0.06 ? 1 : 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    for (const [k, v] of Object.entries(attrs)) geo.setAttribute(k, new THREE.BufferAttribute(v, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0.8 }, uKink: { value: 0 }, uSize: { value: 1.8 }, uQ0: { value: 1 }, uQa: { value: 3.2 }, uGap: { value: Math.PI * 0.27 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, this.particleMat);
    pts.frustumCulled = false;
    g.add(pts);
    // Flowing helical magnetic field lines
    const colors = [0x22d3ee, 0xa78bfa, 0xf472b6];
    [0.55, 0.8, 1.02].forEach((s, k) => {
      const q = 1 + 2.2 * s * s;
      const pts2: THREE.Vector3[] = [];
      const u: number[] = [];
      const turns = Math.ceil(q * 3);
      const steps = 1600;
      for (let i = 0; i <= steps; i++) {
        const phi = (i / steps) * Math.PI * 2 * turns;
        const th = phi / q + k;
        const p = dPoint(th, s);
        pts2.push(new THREE.Vector3(p.x * Math.sin(phi), p.y, p.x * Math.cos(phi)));
        u.push(i / steps);
      }
      const lg = new THREE.BufferGeometry().setFromPoints(pts2);
      lg.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(u), 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: LINE_VERT,
        fragmentShader: LINE_FRAG,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(colors[k]) }, uOpacity: { value: k === 2 ? 0.55 : 0.75 }, uGap: { value: Math.PI * 0.27 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.lineMats.push(mat);
      g.add(new THREE.Line(lg, mat));
    });
  }

  private tileTexture(base: string, line: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = line;
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(24, 4);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildVesselAndBlanket(): void {
    const gb = this.group('blanket', () => new THREE.Vector3());
    const blanketMat = new THREE.MeshPhysicalMaterial({ map: this.tileTexture('#1f8f6a', '#0b3d2e'), metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide, emissive: new THREE.Color(0x0b4a36), emissiveIntensity: 0.6 });
    const blanketCap = new THREE.MeshStandardMaterial({ color: 0x34d399, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0f5e44, emissiveIntensity: 0.5 });
    this.shell(gb, 'blanket', 1.06, 1.15, blanketMat, blanketCap);
    const gv = this.group('vessel', () => new THREE.Vector3());
    const vesselMat = new THREE.MeshPhysicalMaterial({ color: 0x8fa3c0, metalness: 0.95, roughness: 0.28, clearcoat: 0.6, side: THREE.DoubleSide });
    const vesselCap = new THREE.MeshStandardMaterial({ color: 0x5b6b85, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
    this.shell(gv, 'vessel', 1.18, 1.32, vesselMat, vesselCap);
    // Ports around the vessel
    for (let i = 0; i < 9; i++) {
      const phi = PHI0 + (PHIL * (i + 0.5)) / 9;
      const port = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 2.2), vesselMat);
      const R = R0 + a * 1.42;
      port.position.set(Math.sin(phi) * R, 0, Math.cos(phi) * R);
      port.rotation.y = phi;
      this.addMesh(gv, port, 'vessel');
    }
  }

  private buildDivertor(): void {
    const g = this.group('divertor', () => new THREE.Vector3());
    const zb = -kappa * a * 1.02;
    const prof = [
      new THREE.Vector2(R0 - 1.6, zb + 0.15),
      new THREE.Vector2(R0 - 1.1, zb + 0.95),
      new THREE.Vector2(R0 - 0.7, zb + 0.35),
      new THREE.Vector2(R0 - 0.1, zb + 0.6),
      new THREE.Vector2(R0 + 0.5, zb + 0.35),
      new THREE.Vector2(R0 + 0.95, zb + 0.95),
      new THREE.Vector2(R0 + 1.45, zb + 0.15),
      new THREE.Vector2(R0 - 1.6, zb + 0.15),
    ];
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x3b3f52, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
    this.addMesh(g, new THREE.Mesh(new THREE.LatheGeometry(prof, 128, PHI0, PHIL), mat), 'divertor');
    // Glowing strike points where the exhaust heat lands
    this.strike = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const R of [R0 - 0.85, R0 + 0.72]) {
      const pts = [new THREE.Vector2(R - 0.12, zb + 0.6), new THREE.Vector2(R + 0.12, zb + 0.6), new THREE.Vector2(R + 0.12, zb + 0.72), new THREE.Vector2(R - 0.12, zb + 0.72), new THREE.Vector2(R - 0.12, zb + 0.6)];
      this.addMesh(g, new THREE.Mesh(new THREE.LatheGeometry(pts, 128, PHI0, PHIL), this.strike), 'divertor');
    }
  }

  private buildTF(): void {
    const g = this.group('tf', (o) => {
      const phi = o.userData.phi as number;
      return new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(6);
    });
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x6d28d9, metalness: 0.75, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, emissive: 0x2a0d5e, emissiveIntensity: 0.5 });
    const loop: THREE.Vector3[] = [];
    for (let i = 0; i < 80; i++) {
      const th = (i / 80) * Math.PI * 2;
      const p = dPoint(th, 1.62);
      loop.push(new THREE.Vector3(Math.max(p.x, 3.15), p.y * 1.12, 0));
    }
    const curve = new THREE.CatmullRomCurve3(loop, true);
    const geo = new THREE.TubeGeometry(curve, 160, 0.48, 4, true);
    for (let i = 0; i < 18; i++) {
      const phi = (i / 18) * Math.PI * 2 + Math.PI / 18;
      const inCut = ((phi - PHI0 + Math.PI * 4) % (Math.PI * 2)) > PHIL;
      if (inCut) continue;
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = phi - Math.PI / 2;
      m.userData.phi = phi;
      this.addMesh(g, m, 'tf');
    }
  }

  private buildCS(): void {
    const g = this.group('cs', () => new THREE.Vector3(0, 10, 0));
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x0e7490, metalness: 0.8, roughness: 0.22, clearcoat: 1, emissive: 0x0891b2, emissiveIntensity: 0.35 });
    const ring = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    for (let k = 0; k < 6; k++) {
      const y = -6.9 + k * 2.76;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 2.5, 64, 1, true), mat);
      m.position.y = y;
      this.addMesh(g, m, 'cs');
      const band = new THREE.Mesh(new THREE.TorusGeometry(2.08, 0.05, 8, 96), ring);
      band.rotation.x = Math.PI / 2;
      band.position.y = y + 1.28;
      this.addMesh(g, band, 'cs', false);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 17, 32), new THREE.MeshStandardMaterial({ color: 0x0b1220, metalness: 0.6, roughness: 0.5 }));
    this.addMesh(g, core, 'cs');
  }

  private buildPF(): void {
    const g = this.group('pf', (o) => {
      const z = o.userData.z as number;
      return new THREE.Vector3(0, Math.sign(z) * 4, 0);
    });
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.25, clearcoat: 1, emissive: 0x075985, emissiveIntensity: 0.45 });
    const coils: [number, number, number][] = [
      [4.0, 7.9, 0.5],
      [8.3, 6.9, 0.45],
      [11.6, 3.2, 0.55],
      [11.6, -2.3, 0.55],
      [8.4, -6.9, 0.5],
      [4.4, -7.7, 0.6],
    ];
    for (const [R, z, r] of coils) {
      const circ = Array.from({ length: 25 }, (_, i) => new THREE.Vector2(R + r * Math.cos((i / 24) * Math.PI * 2), z + r * 1.3 * Math.sin((i / 24) * Math.PI * 2)));
      const m = new THREE.Mesh(new THREE.LatheGeometry(circ, 128, PHI0, PHIL), mat);
      m.userData.z = z;
      this.addMesh(g, m, 'pf');
    }
  }

  private buildHeating(): void {
    const g = this.group('heating', () => new THREE.Vector3(5, 0, 0));
    const phi = PHI0 + PHIL * 0.12;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 3.2), new THREE.MeshPhysicalMaterial({ color: 0xa16207, metalness: 0.7, roughness: 0.3, clearcoat: 0.8, emissive: 0x3d2a03, emissiveIntensity: 0.6 }));
    const Rb = 17;
    body.position.set(Math.sin(phi) * Rb, 0.4, Math.cos(phi) * Rb);
    body.rotation.y = phi;
    this.addMesh(g, body, 'heating');
    // Beam duct and the glowing neutral beam entering the plasma tangentially
    const tgtPhi = phi + 0.42;
    const tgt = new THREE.Vector3(Math.sin(tgtPhi) * R0, 0.2, Math.cos(tgtPhi) * R0);
    const start = body.position.clone();
    const dir = tgt.clone().sub(start);
    const len = dir.length();
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len * 0.62, 20), new THREE.MeshPhysicalMaterial({ color: 0x8fa3c0, metalness: 0.9, roughness: 0.3 }));
    duct.position.copy(start.clone().add(dir.clone().multiplyScalar(0.31)));
    duct.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.addMesh(g, duct, 'heating');
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd33d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 12), this.beamMat);
    beam.position.copy(start.clone().add(dir.clone().multiplyScalar(0.5)));
    beam.quaternion.copy(duct.quaternion);
    this.addMesh(g, beam, 'heating', false);
    // RF antenna on the outboard wall, radiating rings
    const aPhi = PHI0 + PHIL * 0.82;
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 1.8), new THREE.MeshPhysicalMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2, emissive: 0x6b5200, emissiveIntensity: 0.8 }));
    const Ra = R0 + a * 1.05;
    ant.position.set(Math.sin(aPhi) * Ra, 0, Math.cos(aPhi) * Ra);
    ant.rotation.y = aPhi;
    this.addMesh(g, ant, 'heating');
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.copy(ant.position);
      ring.rotation.y = aPhi;
      ring.userData.k = k;
      g.add(ring);
      this.rfRings.push(ring);
    }
  }

  private buildCryostat(): void {
    const g = this.group('cryostat', () => new THREE.Vector3());
    const prof = [new THREE.Vector2(0.1, -12.5), new THREE.Vector2(14.5, -12.5), new THREE.Vector2(14.5, 12.5), new THREE.Vector2(0.1, 12.5)];
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x7dd3fc, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false });
    this.addMesh(g, new THREE.Mesh(new THREE.LatheGeometry(prof, 96, PHI0, PHIL), mat), 'cryostat');
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.LatheGeometry(prof, 24, PHI0, PHIL), 30), new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.12 }));
    g.add(edges);
  }

  private pick(): PartId | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const vis = this.pickables.filter((m) => m.visible && m.parent?.visible);
    const hit = this.raycaster.intersectObjects(vis, false)[0];
    return hit ? (hit.object.userData.part as PartId) : null;
  }

  /** Smoothly move the camera to frame a part. */
  focus(id: PartId | null): void {
    // Looking square-on into the cut face shows the D-shaped cross-section of the machine.
    const sn = Math.sin(PHI0);
    const cs = Math.cos(PHI0);
    const face = (R: number, Z: number, dist: number, up: number): [THREE.Vector3, THREE.Vector3] => {
      const tgt = new THREE.Vector3(sn * R, Z, cs * R);
      const pos = tgt.clone().add(new THREE.Vector3(-cs, 0, sn).multiplyScalar(dist)).add(new THREE.Vector3(0, up, 0));
      return [pos, tgt];
    };
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const views: Record<PartId | 'all', [THREE.Vector3, THREE.Vector3]> = {
      all: [v3(16, 11, 27), v3(0, -0.5, 0)],
      plasma: face(R0, 0, 13, 3),
      blanket: face(R0 + 1.4, 0.5, 8.5, 1.5),
      vessel: face(R0 + 1.2, 0, 12, 4),
      divertor: face(R0, -3.1, 7.5, 0.8),
      tf: [v3(24, 12, 25), v3(0, 0, 0)],
      cs: [v3(9, 5, 15), v3(0, 0, 0)],
      pf: [v3(27, 17, 27), v3(0, 0, 0)],
      heating: [v3(24, 9, 20), v3(9, 0, 4)],
      cryostat: [v3(32, 22, 40), v3(0, 0, 0)],
    };
    const [pos, target] = views[id ?? 'all'];
    this.flyTo = { pos, target };
  }

  setLook(l: Partial<PlasmaLook>): void {
    this.look = { ...this.look, ...l };
  }

  private spawnNeutron(): void {
    const phi = Math.random() * Math.PI * 2;
    const th = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.8;
    const p = dPoint(th, r);
    const pos = new THREE.Vector3(p.x * Math.sin(phi), p.y, p.x * Math.cos(phi));
    const vel = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 6);
    this.neutrons.push({ pos, vel, life: 0, bred: false });
    if (this.neutrons.length > 600) this.neutrons.shift();
  }

  update(dt: number): void {
    this.t += dt;
    const L = this.look;
    this.plasmaMat.uniforms.uTime.value = this.t;
    this.plasmaMat.uniforms.uHeat.value = L.heat;
    this.plasmaMat.uniforms.uPower.value = L.power;
    this.plasmaMat.uniforms.uKink.value = L.kink;
    this.plasmaMat.uniforms.uFlicker.value = L.flicker;
    this.capMat.uniforms.uTime.value = this.t;
    this.capMat.uniforms.uHeat.value = L.heat;
    this.capMat.uniforms.uPower.value = L.power;
    this.capMat.uniforms.uFlicker.value = L.flicker;
    this.particleMat.uniforms.uTime.value = this.t;
    this.particleMat.uniforms.uHeat.value = L.heat;
    this.particleMat.uniforms.uKink.value = L.kink;
    this.particleMat.uniforms.uQ0.value = L.q0;
    this.particleMat.uniforms.uQa.value = L.qa;
    for (const m of this.lineMats) m.uniforms.uTime.value = this.t;
    this.lineMats.forEach((m) => (m.visible = this.fieldLines));
    // Heating visuals
    this.beamMat.opacity = this.heatingOn * (0.55 + 0.35 * Math.sin(this.t * 20));
    for (const r of this.rfRings) {
      const k = r.userData.k as number;
      const ph = (this.t * 0.8 + k / 3) % 1;
      r.scale.setScalar(0.4 + ph * 2.4);
      (r.material as THREE.MeshBasicMaterial).opacity = this.heatingOn * (1 - ph) * 0.7;
    }
    this.strike.opacity = 0.3 + 0.7 * L.heat * (0.85 + 0.15 * Math.sin(this.t * 13));
    this.bloom.strength = 0.45 + 0.4 * L.power;

    // Neutrons: born in the plasma, absorbed in the blanket (some breed tritium)
    const spawn = this.neutronRate * dt;
    for (let i = 0; i < Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0); i++) this.spawnNeutron();
    const npos = this.neutronGeo.getAttribute('position') as THREE.BufferAttribute;
    const bpos = this.breedGeo.getAttribute('position') as THREE.BufferAttribute;
    let k = 0;
    this.neutrons = this.neutrons.filter((n) => {
      n.pos.addScaledVector(n.vel, dt);
      n.life += dt;
      const R = Math.hypot(n.pos.x, n.pos.z);
      const dR = R - R0;
      const s = Math.hypot(dR / a, n.pos.y / (kappa * a));
      if (s > 1.08) {
        if (Math.random() < 0.35) {
          const i = this.breedLife.findIndex((l) => l <= 0);
          const idx = i >= 0 ? i : this.breedLife.length < 200 ? this.breedLife.length : -1;
          if (idx >= 0) {
            this.breedLife[idx] = 0.9;
            bpos.setXYZ(idx, n.pos.x, n.pos.y, n.pos.z);
          }
        }
        return false;
      }
      if (k < 600) npos.setXYZ(k++, n.pos.x, n.pos.y, n.pos.z);
      return n.life < 3;
    });
    for (let i = k; i < 600; i++) npos.setXYZ(i, 0, -9999, 0);
    npos.needsUpdate = true;
    for (let i = 0; i < this.breedLife.length; i++) {
      this.breedLife[i] -= dt;
      if (this.breedLife[i] <= 0) bpos.setXYZ(i, 0, -9999, 0);
    }
    bpos.needsUpdate = true;

    // Exploded view
    this.explode += (this.explodeTarget - this.explode) * Math.min(1, dt * 3);
    const e = this.explode * this.explode * (3 - 2 * this.explode);
    for (const [id, g] of Object.entries(this.groups) as [PartId, THREE.Group][]) {
      const dir = this.explodeDir[id]!;
      for (const child of g.children) {
        const base = this.basePos.get(child);
        if (!base) continue;
        child.position.copy(base).addScaledVector(dir(child), e);
      }
    }
    (this.groups.cryostat as THREE.Group).visible = this.explode < 0.5;

    // Hover / selection glow
    const hov = this.pick();
    if (hov !== this.hovered) {
      this.hovered = hov;
      this.canvas.style.cursor = hov ? 'pointer' : 'grab';
    }
    for (const m of this.pickables) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!('emissiveIntensity' in mat)) continue;
      if (mat.userData.baseEmissive === undefined) mat.userData.baseEmissive = mat.emissiveIntensity;
      const id = m.userData.part as PartId;
      mat.emissiveIntensity = (mat.userData.baseEmissive as number) + (id === this.selected ? 1.2 + 0.4 * Math.sin(this.t * 5) : id === this.hovered ? 0.8 : 0);
    }

    if (this.flyTo) {
      const k2 = Math.min(1, dt * 2.2);
      this.camera.position.lerp(this.flyTo.pos, k2);
      this.controls.target.lerp(this.flyTo.target, k2);
      if (this.camera.position.distanceTo(this.flyTo.pos) < 0.05) this.flyTo = null;
    }
    this.controls.update();
    this.composer.render();
  }
}
