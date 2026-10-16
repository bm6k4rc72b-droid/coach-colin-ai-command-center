/**
 * The 3D Roadster: a procedurally lofted hypercar body (clearcoat paint, tinted glass canopy,
 * light blades), four wheels with brake discs that glow with heat, and the hidden machinery:
 * a floor battery pack, three motors with half-shafts, the cold-gas thruster package, seats and
 * active aero. A reflective studio floor, a ring light, energy-flow particles, thruster plumes,
 * speed streaks and an anamorphic grade. Click any part to select it.
 *
 * Units: metres. The car points along +x, y is up.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { PART_ORDER, PARTS, type PartId } from '../core/parts';
import { FLOW_FRAG, FLOW_VERT, GradeShader, plumeMaterial, rimMaterial, SKY_FRAG, SKY_VERT } from './shaders';

const FRONT_AXLE = 1.27;
const REAR_AXLE = -1.33;
const TRACK = 0.86;
const WHEEL_R = 0.36;
const ARCH_R = 0.45;

/* ------------------------------------------------------------- body shape */

/** Piecewise-smooth profile through control points (x ascending), sampled by x. */
function profile(pts: [number, number][]): (x: number) => number {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const samples = curve.getPoints(600);
  return (x: number) => {
    if (x <= samples[0].x) return samples[0].y;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].x >= x) {
        const a = samples[i - 1];
        const b = samples[i];
        return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1e-6, b.x - a.x);
      }
    }
    return samples[samples.length - 1].y;
  };
}

const TOP = profile([[-2.12, 0.6], [-2.02, 0.79], [-1.72, 0.85], [-1.3, 0.88], [-0.95, 0.94], [-0.55, 1.08], [-0.1, 1.13], [0.3, 1.09], [0.78, 0.86], [1.25, 0.73], [1.75, 0.63], [2.12, 0.46]]);
const BASE = profile([[-2.12, 0.34], [-1.8, 0.2], [-1.2, 0.13], [0.8, 0.13], [1.7, 0.16], [2.12, 0.27]]);
const HALF_W = profile([[-2.12, 0.8], [-1.85, 0.95], [-1.35, 1.0], [-0.6, 0.95], [0.2, 0.93], [1.25, 0.97], [1.75, 0.9], [2.12, 0.66]]);
const BELT = 0.83;
export const CAR_LENGTH = 4.24;

function bottomAt(x: number): number {
  let b = BASE(x);
  for (const ax of [FRONT_AXLE, REAR_AXLE]) {
    const dx = x - ax;
    if (Math.abs(dx) < ARCH_R) b = Math.max(b, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - dx * dx) + 0.03);
  }
  return b;
}

/** Point on the right half (z ≥ 0) of the section at x, for φ ∈ [−π/2, π/2] (bottom → top). */
function sectionPoint(x: number, phi: number): [number, number] {
  const top = TOP(x);
  const bot = bottomAt(x);
  const H = Math.max(0.02, top - bot);
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const n = phi < 0 ? 5 : 2.3;
  const yn = Math.sign(s) * Math.abs(s) ** (2 / n);
  const zn = Math.abs(c) ** (2 / n);
  const y = bot + H * (0.5 + 0.5 * yn);
  const cabin = top > 0.95;
  const belt = Math.min(BELT, bot + H * 0.62);
  const topScale = cabin ? 0.6 : 0.84;
  const k = y > belt ? THREE.MathUtils.smoothstep((y - belt) / Math.max(0.01, top - belt), 0, 1) : 0;
  const w = HALF_W(x) * zn * (1 - (1 - topScale) * k);
  return [y, w];
}

interface BodyGeo {
  geo: THREE.BufferGeometry;
}

/** Loft the body. Triangles in the cabin greenhouse go to group 1 (glass), the rest to group 0. */
function buildBody(): BodyGeo {
  const NX = 150;
  const NR = 72; // ring points (full ring)
  const pos: number[] = [];
  const glass: boolean[] = [];
  for (let i = 0; i <= NX; i++) {
    const x = -CAR_LENGTH / 2 + (CAR_LENGTH * i) / NX;
    const top = TOP(x);
    for (let j = 0; j <= NR; j++) {
      const t = j / NR; // 0 → bottom centre, going round the right side to top, then the left side back
      const phi = -Math.PI / 2 + t * Math.PI * 2;
      const right = t <= 0.5;
      const ph = right ? phi : Math.PI - phi;
      const [y, w] = sectionPoint(x, ph);
      pos.push(x, y, right ? w : -w);
      glass.push(top > 0.95 && y > BELT - 0.01 && x > -1.0 && x < 0.97);
    }
  }
  const paint: number[] = [];
  const glassIdx: number[] = [];
  const lower: number[] = [];
  const low = (k: number) => pos[k * 3 + 1] < 0.4 && pos[k * 3] > -1.75 && pos[k * 3] < 1.72;
  const W = NR + 1;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * W + j;
      const b = (i + 1) * W + j;
      const tri = (p: number, q: number, r: number) => ((glass[p] && glass[q] && glass[r]) ? glassIdx : low(p) && low(q) && low(r) ? lower : paint).push(p, q, r);
      tri(a, b, a + 1);
      tri(b, b + 1, a + 1);
    }
  }
  // End caps (fans to the section centre).
  for (const i of [0, NX]) {
    const centre = pos.length / 3;
    const x = pos[i * W * 3];
    pos.push(x, (TOP(x) + bottomAt(x)) / 2, 0);
    glass.push(false);
    for (let j = 0; j < NR; j++) {
      const a = i * W + j;
      if (i === 0) paint.push(centre, a + 1, a);
      else paint.push(centre, a, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([...paint, ...glassIdx, ...lower]);
  geo.addGroup(0, paint.length, 0);
  geo.addGroup(paint.length, glassIdx.length, 1);
  geo.addGroup(paint.length + glassIdx.length, lower.length, 2);
  geo.computeVertexNormals();
  return { geo };
}

/* ----------------------------------------------------------------- world */

export interface DriveState {
  v: number;
  a: number;
  /** Battery power, W (negative while regenerating). */
  power: number;
  thrust: number;
  braking: number;
}

interface FlowPath {
  curve: THREE.CatmullRomCurve3;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);
  controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private car = new THREE.Group();
  private chassis = new THREE.Group();
  private groups: Partial<Record<PartId, THREE.Group>> = {};
  private explodeOffset: Partial<Record<PartId, THREE.Vector3>> = {};
  private pickables: THREE.Object3D[] = [];
  private partMats = new Map<PartId, THREE.MeshStandardMaterial[]>();
  private paint!: THREE.MeshPhysicalMaterial;
  private glass!: THREE.MeshPhysicalMaterial;
  private carbon!: THREE.MeshPhysicalMaterial;
  private rim!: THREE.ShaderMaterial;
  private wheels: { spin: THREE.Group; disc: THREE.MeshStandardMaterial; front: boolean }[] = [];
  private spoiler!: THREE.Group;
  private plumes: THREE.ShaderMaterial[] = [];
  private flowMat!: THREE.ShaderMaterial;
  private flowGeo!: THREE.BufferGeometry;
  private flows: FlowPath[] = [];
  private flowT: Float32Array = new Float32Array(0);
  private cells!: THREE.InstancedMesh;
  private cellMat!: THREE.MeshStandardMaterial;
  private coilMats: THREE.MeshStandardMaterial[] = [];
  private lanes!: THREE.InstancedMesh;
  private streaks!: THREE.LineSegments;
  private streakPos!: Float32Array;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private flyTo: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private t = 0;
  private distance = 0;
  private brakeHeat = 0;
  private pitch = 0;
  private xrayAmt = 0;
  selected: PartId | null = null;
  hovered: PartId | null = null;
  explode = 0;
  explodeTarget = 0;
  xray = false;
  thrusterPackage = false;
  cinema = false;
  drive: DriveState = { v: 0, a: 0, power: 0, thrust: 0, braking: 0 };
  onPick: ((p: PartId | null) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.6;
    this.scene.fog = new THREE.Fog('#05030a', 18, 70);
    this.camera.position.set(6.4, 2.1, 6.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.55, 0);
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('start', () => (this.flyTo = null));

    this.studio();
    this.scene.add(this.car);
    this.car.add(this.chassis);
    this.buildBodyParts();
    this.buildBattery();
    this.buildMotors();
    this.buildWheels();
    this.buildAero();
    this.buildThrusters();
    this.buildCabin();
    this.buildFlow();
    this.buildMotion();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

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
      this.onPick?.(this.pick());
    });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.grade?.uniforms.uRes.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 50 : w / h < 1.4 ? 40 : 32;
    this.camera.updateProjectionMatrix();
  }

  /* --------------------------------------------------------- studio */

  private studio(): void {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(sky);
    // Mirror floor, darkened by a radial veil so it reads as polished concrete.
    const mirror = new Reflector(new THREE.CircleGeometry(60, 64), { textureWidth: 1024, textureHeight: 1024, color: 0x6a6a74 });
    mirror.rotation.x = -Math.PI / 2;
    this.scene.add(mirror);
    const veilTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, 'rgba(0,0,0,0.35)');
      grd.addColorStop(0.35, 'rgba(0,0,0,0.6)');
      grd.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    const veil = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ color: 0x06050a, transparent: true, alphaMap: veilTex, opacity: 0.94, depthWrite: false }));
    veil.rotation.x = -Math.PI / 2;
    veil.position.y = 0.004;
    veil.material.alphaMap!.colorSpace = THREE.NoColorSpace;
    this.scene.add(veil);
    // Shadow catcher under the car.
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    // Ring light overhead and floor light strips: they are what the clearcoat reflects.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.02, 12, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.15, 1.25) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.6;
    this.scene.add(ring);
    for (const z of [-3.4, 3.4]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(18, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: z < 0 ? new THREE.Color(0.2, 1.3, 2.2) : new THREE.Color(2.2, 0.3, 0.6) }));
      strip.position.set(0, 0.01, z);
      this.scene.add(strip);
    }
    const key = new THREE.SpotLight('#fff1e0', 40, 30, 0.75, 0.8, 1.6);
    key.position.set(3, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    this.scene.add(key, key.target);
    const rimL = new THREE.SpotLight('#ff3b6b', 12, 30, 0.6, 0.9, 1.6);
    rimL.position.set(-6, 3, -4);
    const rimC = new THREE.SpotLight('#38bdf8', 9, 30, 0.6, 0.9, 1.6);
    rimC.position.set(6, 1.4, -5);
    this.scene.add(rimL, rimL.target, rimC, rimC.target);
    this.scene.add(new THREE.HemisphereLight('#7c89b6', '#1a0d12', 0.6));
  }

  /* ---------------------------------------------------------- parts */

  private part(id: PartId, parent: THREE.Object3D = this.chassis): THREE.Group {
    const g = new THREE.Group();
    g.userData.part = id;
    parent.add(g);
    this.groups[id] = g;
    return g;
  }

  private mat(id: PartId, params: THREE.MeshStandardMaterialParameters | THREE.MeshPhysicalMaterialParameters, physical = false): THREE.MeshStandardMaterial {
    const m = physical ? new THREE.MeshPhysicalMaterial(params as THREE.MeshPhysicalMaterialParameters) : new THREE.MeshStandardMaterial(params);
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseIntensity = m.emissiveIntensity;
    const list = this.partMats.get(id) ?? [];
    list.push(m);
    this.partMats.set(id, list);
    return m;
  }

  private add(g: THREE.Group, mesh: THREE.Mesh, id: PartId, shadow = true): THREE.Mesh {
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    mesh.userData.part = id;
    g.add(mesh);
    this.pickables.push(mesh);
    return mesh;
  }

  private buildBodyParts(): void {
    const body = this.part('body');
    const roof = this.part('roof');
    const { geo } = buildBody();
    this.paint = this.mat('body', { color: '#8a0716', metalness: 0.35, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 0.55 } as THREE.MeshPhysicalMaterialParameters, true) as THREE.MeshPhysicalMaterial;
    this.glass = this.mat('roof', { color: '#010103', metalness: 0.0, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.12, transparent: true, opacity: 0.96, envMapIntensity: 0.55 } as THREE.MeshPhysicalMaterialParameters, true) as THREE.MeshPhysicalMaterial;
    this.carbon = this.mat('body', { color: '#09090c', metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 } as THREE.MeshPhysicalMaterialParameters, true) as THREE.MeshPhysicalMaterial;
    const shell = new THREE.Mesh(geo, [this.paint, this.glass, this.carbon]);
    this.add(body, shell, 'body');
    this.rim = rimMaterial('#5eead4');
    const rimMesh = new THREE.Mesh(geo, this.rim);
    rimMesh.scale.setScalar(1.002);
    rimMesh.renderOrder = 5;
    body.add(rimMesh);
    // Light blades: front and a full-width tail bar.
    const lightMat = this.mat('body', { color: '#000', emissive: new THREE.Color('#dff4ff'), emissiveIntensity: 4 });
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.86, 0.66, s * 0.84), new THREE.Vector3(1.98, 0.62, s * 0.66), new THREE.Vector3(2.06, 0.56, s * 0.42)]);
      this.add(body, new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 8), lightMat), 'body', false);
    }
    const tail = new THREE.CatmullRomCurve3([-0.86, -0.5, 0, 0.5, 0.86].map((z) => new THREE.Vector3(-2.04 + Math.abs(z) * 0.08, 0.76, z)));
    this.add(body, new THREE.Mesh(new THREE.TubeGeometry(tail, 40, 0.016, 8), this.mat('body', { color: '#000', emissive: new THREE.Color('#ff1530'), emissiveIntensity: 5 })), 'body', false);
    // Splitter, side skirts, diffuser fins, mirrors.
    const carbon = this.mat('body', { color: '#0b0b0e', roughness: 0.35, metalness: 0.3 });
    this.add(body, new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 1.5), carbon), 'body').position.set(1.98, 0.17, 0);
    for (const s of [-1, 1]) this.add(body, new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.06), carbon), 'body').position.set(-0.03, 0.17, s * 0.93);
    for (let i = -3; i <= 3; i++) this.add(body, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.012), carbon), 'body').position.set(-1.98, 0.27, i * 0.17);
    for (const s of [-1, 1]) {
      const m = this.add(body, new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), this.paint), 'body');
      m.scale.set(1.2, 0.6, 0.7);
      m.position.set(0.72, 0.93, s * 0.86);
    }
    // The removable roof panel sits over the cabin glass and lifts away in the exploded view.
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.012, 1.0), this.glass);
    roofPanel.position.set(-0.05, 1.135, 0);
    this.add(roof, roofPanel, 'roof');
    this.explodeOffset.body = new THREE.Vector3(0, 1.0, 0);
    this.explodeOffset.roof = new THREE.Vector3(0, 1.9, 0);
  }

  private buildBattery(): void {
    const g = this.part('battery');
    const frame = this.mat('battery', { color: '#1d2a33', metalness: 0.8, roughness: 0.35 });
    this.add(g, new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.14, 1.42), frame), 'battery').position.set(-0.05, 0.22, 0);
    this.cellMat = this.mat('battery', { color: '#0f3440', emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.3 });
    const nx = 12;
    const nz = 6;
    this.cells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.145, 0.05, 0.21), this.cellMat, nx * nz);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      m.makeTranslation(-0.95 + i * 0.163 + 0.08, 0.315, -0.6 + j * 0.235 + 0.02);
      this.cells.setMatrixAt(k++, m);
    }
    this.cells.userData.part = 'battery';
    g.add(this.cells);
    this.pickables.push(this.cells);
    this.explodeOffset.battery = new THREE.Vector3(0, -0.15, 0).add(new THREE.Vector3(0, 0, 0));
  }

  private motor(g: THREE.Group, id: PartId, x: number, z: number, len: number): void {
    const housing = this.mat(id, { color: '#6d28d9', metalness: 0.75, roughness: 0.3 });
    const coil = this.mat(id, { color: '#3b0764', emissive: new THREE.Color(PARTS[id].color), emissiveIntensity: 0.4 });
    this.coilMats.push(coil);
    const h = this.add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, len, 28), housing), id);
    h.rotation.x = Math.PI / 2;
    h.position.set(x, WHEEL_R, z);
    for (const dz of [-len / 2 - 0.004, len / 2 + 0.004]) {
      const r = this.add(g, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 32), coil), id, false);
      r.position.set(x, WHEEL_R, z + dz);
    }
    const inv = this.add(g, new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, len * 0.9), this.mat(id, { color: '#334155', metalness: 0.7, roughness: 0.4 })), id);
    inv.position.set(x + (x > 0 ? -0.22 : 0.22), WHEEL_R + 0.16, z);
  }

  private buildMotors(): void {
    const front = this.part('motorFront');
    this.motor(front, 'motorFront', FRONT_AXLE, 0, 0.42);
    const rear = this.part('motorsRear');
    this.motor(rear, 'motorsRear', REAR_AXLE, -0.24, 0.36);
    this.motor(rear, 'motorsRear', REAR_AXLE, 0.24, 0.36);
    const shaftMat = this.mat('motorsRear', { color: '#9ca3af', metalness: 1, roughness: 0.25 });
    for (const [x, g] of [[FRONT_AXLE, front], [REAR_AXLE, rear]] as [number, THREE.Group][]) {
      for (const s of [-1, 1]) {
        const shaft = this.add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 10), shaftMat), x > 0 ? 'motorFront' : 'motorsRear');
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(x, WHEEL_R, s * 0.52);
      }
    }
    this.explodeOffset.motorFront = new THREE.Vector3(0.9, 0.2, 0);
    this.explodeOffset.motorsRear = new THREE.Vector3(-0.9, 0.2, 0);
  }

  private buildWheels(): void {
    const wheels = this.part('wheels', this.car);
    const brakes = this.part('brakes', this.car);
    const tyreProfile: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI;
      tyreProfile.push(new THREE.Vector2(WHEEL_R - 0.06 + Math.sin(a) * 0.06, -0.15 + (1 - Math.cos(a)) * 0.15));
    }
    const tyreGeo = new THREE.LatheGeometry(tyreProfile, 48);
    tyreGeo.rotateX(Math.PI / 2);
    const tyre = this.mat('wheels', { color: '#101012', roughness: 0.85 });
    const rimMat = this.mat('wheels', { color: '#2a2d33', metalness: 0.95, roughness: 0.22 });
    const accent = this.mat('wheels', { color: '#c7ccd6', metalness: 1, roughness: 0.15 });
    const caliperMat = this.mat('brakes', { color: '#d9112b', metalness: 0.4, roughness: 0.35 });
    for (const [x, z] of [[FRONT_AXLE, TRACK], [FRONT_AXLE, -TRACK], [REAR_AXLE, TRACK], [REAR_AXLE, -TRACK]]) {
      const hub = new THREE.Group();
      hub.position.set(x, WHEEL_R, z);
      wheels.add(hub);
      const spin = new THREE.Group();
      hub.add(spin);
      this.add(wheels, new THREE.Mesh(tyreGeo, tyre), 'wheels');
      const t = wheels.children[wheels.children.length - 1];
      wheels.remove(t);
      spin.add(t);
      const face = z > 0 ? 1 : -1;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R - 0.07, WHEEL_R - 0.07, 0.02, 40), rimMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = face * 0.1;
      spin.add(disc);
      for (let i = 0; i < 10; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, WHEEL_R - 0.11, 0.03), i % 2 ? rimMat : accent);
        const a = (i / 10) * Math.PI * 2;
        spoke.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, face * 0.115);
        spoke.rotation.z = a - Math.PI / 2 + 0.25;
        spin.add(spoke);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), accent);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = face * 0.13;
      spin.add(cap);
      spin.traverse((o) => {
        o.userData.part = 'wheels';
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          this.pickables.push(o);
        }
      });
      // Brake disc (spins) and caliper (fixed); the disc glows with heat.
      const discMat = this.mat('brakes', { color: '#4b4f57', metalness: 0.9, roughness: 0.4, emissive: new THREE.Color('#ff3a00'), emissiveIntensity: 0 });
      const bdisc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 40), discMat);
      bdisc.rotation.x = Math.PI / 2;
      bdisc.position.z = face * 0.02;
      bdisc.userData.part = 'brakes';
      spin.add(bdisc);
      this.pickables.push(bdisc);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.07), caliperMat);
      cal.position.set(x + (x > 0 ? -0.15 : 0.15), WHEEL_R + 0.13, z + face * 0.05);
      this.add(brakes, cal, 'brakes');
      this.wheels.push({ spin, disc: discMat, front: x > 0 });
    }
    this.explodeOffset.wheels = new THREE.Vector3(0, 0, 0);
    this.explodeOffset.brakes = new THREE.Vector3(0, 0, 0);
  }

  private buildAero(): void {
    const g = this.part('aero');
    const carbon = this.mat('aero', { color: '#0d0d10', roughness: 0.3, metalness: 0.4 });
    this.spoiler = new THREE.Group();
    this.spoiler.position.set(-1.88, 0.86, 0);
    g.add(this.spoiler);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 1.55), carbon);
    blade.rotation.z = 0.12;
    blade.castShadow = true;
    blade.userData.part = 'aero';
    this.spoiler.add(blade);
    this.pickables.push(blade);
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.02), carbon);
      strut.position.set(0, -0.06, s * 0.5);
      strut.userData.part = 'aero';
      this.spoiler.add(strut);
    }
    this.explodeOffset.aero = new THREE.Vector3(-0.4, 1.3, 0);
  }

  private buildThrusters(): void {
    const g = this.part('thrusters');
    const tankMat = this.mat('thrusters', { color: '#1e1b24', metalness: 0.4, roughness: 0.25, emissive: new THREE.Color('#f472b6'), emissiveIntensity: 0.12 });
    const tank = this.add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.85, 8, 24), tankMat), 'thrusters');
    tank.rotation.x = Math.PI / 2;
    tank.position.set(-0.95, 0.56, 0);
    const bandMat = this.mat('thrusters', { color: '#f472b6', emissive: new THREE.Color('#f472b6'), emissiveIntensity: 1.2 });
    for (const z of [-0.3, 0, 0.3]) {
      const band = this.add(g, new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.008, 6, 32), bandMat), 'thrusters', false);
      band.position.set(-0.95, 0.56, z);
    }
    const nozzleMat = this.mat('thrusters', { color: '#cbd5e1', metalness: 1, roughness: 0.2 });
    const nozzles: [number, number, number][] = [[-2.08, 0.42, 0.45], [-2.08, 0.42, -0.45], [-2.06, 0.58, 0.22], [-2.06, 0.58, -0.22]];
    for (const [x, y, z] of nozzles) {
      const n = this.add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.1, 16, 1, true), nozzleMat), 'thrusters');
      n.rotation.z = Math.PI / 2;
      n.position.set(x, y, z);
      const pm = plumeMaterial();
      this.plumes.push(pm);
      const geo = new THREE.ConeGeometry(0.16, 1.6, 24, 1, true);
      geo.translate(0, -0.8, 0);
      const plume = new THREE.Mesh(geo, pm);
      plume.rotation.z = -Math.PI / 2;
      plume.position.set(x - 0.05, y, z);
      g.add(plume);
    }
    this.explodeOffset.thrusters = new THREE.Vector3(0, 1.5, 0);
  }

  private buildCabin(): void {
    const g = this.part('cabin');
    const leather = this.mat('cabin', { color: '#1c1c22', roughness: 0.7 });
    const stitch = this.mat('cabin', { color: '#e5e7eb', roughness: 0.5 });
    const seat = (x: number, z: number, s: number) => {
      this.add(g, new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.1, 0.44 * s), leather), 'cabin').position.set(x, 0.42, z);
      const back = this.add(g, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55 * s, 0.44 * s), leather), 'cabin');
      back.position.set(x - 0.24 * s, 0.68, z);
      back.rotation.z = 0.22;
      this.add(g, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5 * s, 0.02), stitch), 'cabin', false).position.set(x - 0.18 * s, 0.68, z);
    };
    seat(0.05, 0.4, 1);
    seat(0.05, -0.4, 1);
    seat(-0.75, 0.32, 0.75);
    seat(-0.75, -0.32, 0.75);
    const wheel = this.add(g, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 36), leather), 'cabin');
    wheel.position.set(0.55, 0.78, 0.4);
    wheel.rotation.y = Math.PI / 2;
    wheel.rotation.x = 0.3;
    const dash = this.add(g, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.5), this.mat('cabin', { color: '#0b0b0f', emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.25 })), 'cabin');
    dash.position.set(0.72, 0.74, 0);
    this.explodeOffset.cabin = new THREE.Vector3(0, 0.35, 0);
  }

  /* ---------------------------------------------- energy flow & motion */

  private buildFlow(): void {
    const packC = new THREE.Vector3(-0.05, 0.34, 0);
    const targets = [new THREE.Vector3(FRONT_AXLE, WHEEL_R + 0.12, 0), new THREE.Vector3(REAR_AXLE, WHEEL_R + 0.12, -0.24), new THREE.Vector3(REAR_AXLE, WHEEL_R + 0.12, 0.24)];
    for (const t of targets) {
      for (const dz of [-0.35, 0, 0.35]) {
        const start = packC.clone().add(new THREE.Vector3(0, 0, dz));
        const mid = start.clone().lerp(t, 0.5).add(new THREE.Vector3(0, 0.12, 0));
        this.flows.push({ curve: new THREE.CatmullRomCurve3([start, mid, t]) });
      }
    }
    const N = 360;
    this.flowT = new Float32Array(N);
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.flowT[i] = Math.random();
      seeds[i] = Math.random();
    }
    this.flowGeo = new THREE.BufferGeometry();
    this.flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.flowGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.flowMat = new THREE.ShaderMaterial({
      vertexShader: FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      uniforms: { uTime: { value: 0 }, uSpeed: { value: 0 }, uSize: { value: 7 * Math.min(2, devicePixelRatio || 1) }, uColor: { value: new THREE.Color('#38e1ff') }, uAmount: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const pts = new THREE.Points(this.flowGeo, this.flowMat);
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    this.chassis.add(pts);
  }

  private buildMotion(): void {
    // Lane markers on the floor scroll past when the car "moves".
    this.lanes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.8), transparent: true, opacity: 0.7, depthWrite: false }), 40);
    this.lanes.rotation.x = -Math.PI / 2;
    this.lanes.position.y = 0.008;
    this.scene.add(this.lanes);
    // Speed streaks.
    const n = 160;
    this.streakPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.resetStreak(i, Math.random() * 60 - 30);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(1.2, 1.4, 1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
  }

  private resetStreak(i: number, x: number): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const z = side * (1.6 + Math.random() * 6);
    const y = 0.1 + Math.random() * 3.5;
    this.streakPos.set([x, y, z, x + 1, y, z], i * 6);
  }

  /* ------------------------------------------------------- picking */

  private pick(): PartId | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const vis = this.pickables.filter((o) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    });
    for (const h of this.raycaster.intersectObjects(vis, false)) {
      const id = h.object.userData.part as PartId | undefined;
      if (!id) continue;
      // In x-ray mode, clicks pass through the shell to what is inside.
      if (this.xray && (id === 'body' || id === 'roof')) continue;
      return id;
    }
    return null;
  }

  focus(id: PartId | null): void {
    const views: Partial<Record<PartId, [number[], number[]]>> = {
      body: [[5.8, 1.8, 4.8], [0, 0.6, 0]],
      roof: [[2.2, 3.6, 3.2], [0, 1.0, 0]],
      battery: [[1.6, 2.7, 3.4], [-0.05, 0.3, 0]],
      motorFront: [[3.6, 1.4, 2.0], [FRONT_AXLE, 0.4, 0]],
      motorsRear: [[-3.6, 1.4, 2.2], [REAR_AXLE, 0.4, 0]],
      wheels: [[2.6, 0.7, 3.0], [FRONT_AXLE, 0.36, TRACK]],
      brakes: [[2.0, 0.6, 2.4], [FRONT_AXLE, 0.36, TRACK]],
      aero: [[-4.6, 1.8, 2.4], [-1.8, 0.8, 0]],
      thrusters: [[-4.4, 1.0, 2.6], [-1.6, 0.5, 0]],
      cabin: [[1.2, 2.6, 2.2], [0, 0.6, 0]],
    };
    const v = id ? views[id] : null;
    const [p, t] = v ?? [[6.4, 2.1, 6.2], [0, 0.55, 0]];
    this.flyTo = { pos: new THREE.Vector3(...p), target: new THREE.Vector3(...t) };
  }

  /** Low tracking shot used while the car launches. */
  chase(): void {
    this.flyTo = { pos: new THREE.Vector3(4.2, 0.75, 3.9), target: new THREE.Vector3(0.2, 0.5, 0) };
  }

  /* ---------------------------------------------------------- frame */

  update(dt: number): void {
    this.t += dt;
    const D = this.drive;
    // Fly-to camera.
    if (this.flyTo) {
      const k = 1 - Math.exp(-dt * 2.6);
      this.camera.position.lerp(this.flyTo.pos, k);
      this.controls.target.lerp(this.flyTo.target, k);
      if (this.camera.position.distanceTo(this.flyTo.pos) < 0.02) this.flyTo = null;
    }
    this.controls.update();
    // Hover.
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const h = this.pointer.x > 2 ? null : this.pick();
    if (h !== this.hovered) {
      this.hovered = h;
      this.canvas.style.cursor = h ? 'pointer' : 'grab';
    }
    // Explode.
    this.explode += (this.explodeTarget - this.explode) * (1 - Math.exp(-dt * 3));
    for (const id of PART_ORDER) {
      const g = this.groups[id];
      const off = this.explodeOffset[id];
      if (g && off) g.position.copy(off).multiplyScalar(this.explode);
    }
    // Wheels splay outwards in the exploded view.
    for (const [i, w] of this.wheels.entries()) {
      const hub = w.spin.parent!;
      const side = i % 2 === 0 ? 1 : -1;
      hub.position.z = side * (TRACK + this.explode * 0.75);
      w.spin.rotation.z -= (D.v / WHEEL_R) * dt;
      // Brake heat: rises with braking power, cools exponentially.
      w.disc.emissiveIntensity = Math.min(3, this.brakeHeat * (w.front ? 1.2 : 0.8));
    }
    this.brakeHeat = Math.max(0, this.brakeHeat + D.braking * Math.min(1, D.v / 30) * dt * 1.6 - this.brakeHeat * dt * 0.35);
    // Body pitch: squat under acceleration, dive under braking.
    const targetPitch = THREE.MathUtils.clamp(D.a * 0.0024 - D.braking * 0.02, -0.03, 0.04);
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-dt * 6));
    this.chassis.rotation.z = this.pitch;
    this.chassis.position.y = -Math.abs(this.pitch) * 0.6;
    // X-ray: paint fades, rim glows.
    this.xrayAmt += ((this.xray ? 1 : 0) - this.xrayAmt) * (1 - Math.exp(-dt * 4));
    const xa = this.xrayAmt;
    this.paint.transparent = xa > 0.01;
    this.paint.opacity = 1 - 0.93 * xa;
    this.paint.depthWrite = xa < 0.5;
    this.glass.opacity = 0.96 - 0.8 * xa;
    this.carbon.transparent = xa > 0.01;
    this.carbon.opacity = 1 - 0.93 * xa;
    this.carbon.depthWrite = xa < 0.5;
    this.rim.uniforms.uAmount.value = xa;
    this.rim.uniforms.uTime.value = this.t;
    // Hidden machinery is shown in x-ray and exploded views (and the cabin through the glass).
    const inside = xa > 0.05 || this.explode > 0.05;
    for (const id of ['battery', 'motorFront', 'motorsRear'] as PartId[]) this.groups[id]!.visible = inside || this.selected === id;
    this.groups.thrusters!.visible = this.thrusterPackage || (inside && this.selected === 'thrusters');
    // Energy flow and cell glow follow battery power.
    const pw = D.power;
    const flow = Math.min(1, Math.abs(pw) / 6e5);
    this.cellMat.emissiveIntensity = 0.25 + 2.2 * flow + (this.selected === 'battery' ? 0.6 + 0.3 * Math.sin(this.t * 5) : 0);
    this.cellMat.emissive.set(pw < -1000 ? '#4ade80' : '#22d3ee');
    for (const c of this.coilMats) c.emissiveIntensity = 0.3 + 3 * flow;
    this.flowMat.uniforms.uAmount.value = inside || flow > 0.02 ? Math.max(0.12 * (inside ? 1 : 0), flow * 0.45) : 0;
    this.flowMat.uniforms.uColor.value.set(pw < -1000 ? '#4ade80' : '#38e1ff');
    this.flowMat.uniforms.uTime.value = this.t;
    const posAttr = this.flowGeo.attributes.position as THREE.BufferAttribute;
    const speed = (0.25 + flow * 2.5) * (pw < -1000 ? -1 : 1);
    const p = new THREE.Vector3();
    for (let i = 0; i < this.flowT.length; i++) {
      this.flowT[i] = (((this.flowT[i] + dt * speed * (0.6 + (i % 7) * 0.08)) % 1) + 1) % 1;
      this.flows[i % this.flows.length].curve.getPointAt(this.flowT[i], p);
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    posAttr.needsUpdate = true;
    // Thruster plumes.
    const th = Math.min(1, D.thrust / 22000);
    for (const pm of this.plumes) {
      pm.uniforms.uAmount.value = th * 0.45 * (0.85 + 0.15 * Math.sin(this.t * 90));
      pm.uniforms.uTime.value = this.t;
    }
    // Spoiler rises with speed.
    const up = THREE.MathUtils.clamp((D.v - 20) / 30, 0, 1) + (this.selected === 'aero' ? 0.6 : 0);
    this.spoiler.position.y = 0.86 + Math.min(1, up) * 0.18;
    this.spoiler.rotation.z = Math.min(1, up) * 0.12;
    // Ground motion: lanes and streaks scroll past.
    this.distance += D.v * dt;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const x = ((((i * 4 - this.distance) % 160) + 160) % 160) - 80;
      m.makeTranslation(x, i % 2 ? 2.6 : -2.6, 0);
      this.lanes.setMatrixAt(i, m);
    }
    this.lanes.instanceMatrix.needsUpdate = true;
    (this.lanes.material as THREE.MeshBasicMaterial).opacity = Math.min(0.75, D.v / 6);
    const sp = this.streakPos;
    const len = Math.min(6, D.v * 0.06);
    for (let i = 0; i < sp.length / 6; i++) {
      let x = sp[i * 6] - D.v * dt * 1.4;
      if (x < -35) {
        this.resetStreak(i, 35);
        x = 35;
      }
      sp[i * 6] = x;
      sp[i * 6 + 3] = x + len;
    }
    (this.streaks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.streaks.material as THREE.LineBasicMaterial).opacity = Math.min(0.8, Math.max(0, (D.v - 5) / 40));
    // Camera shake at launch.
    if (D.a > 3) {
      const s = Math.min(0.012, D.a * 0.0006);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    // Selection and hover glow (base values restored every frame, so nothing compounds).
    for (const [id, mats] of this.partMats) {
      const on = id === this.selected ? 0.6 + 0.4 * Math.sin(this.t * 4) : id === this.hovered ? 0.35 : 0;
      for (const mm of mats) {
        if (mm === this.cellMat || this.coilMats.includes(mm) || mm.emissiveIntensity > 3.5) continue;
        if (mm.userData.disc) continue;
        if (on > 0) {
          mm.emissive.set(PARTS[id].color);
          mm.emissiveIntensity = on * 0.45;
        } else if (!this.wheels.some((w) => w.disc === mm)) {
          mm.emissive.copy(mm.userData.baseEmissive);
          mm.emissiveIntensity = mm.userData.baseIntensity;
        }
      }
    }
    this.bloom.strength = 0.5 + Math.min(0.2, flow * 0.15 + th * 0.1);
    this.grade.uniforms.uTime.value = this.t;
    this.grade.uniforms.uSpeed.value = Math.min(1, D.v / 70);
    this.grade.uniforms.uBars.value += ((this.cinema ? 1 : 0) - this.grade.uniforms.uBars.value) * Math.min(1, dt * 4);
    this.composer.render();
  }
}
