/**
 * Ranch twin — the 3D view and the architect.
 *
 * A golden-hour (or moonlit) model of the ranch, shot through an anamorphic
 * grade: long shadows, warm fog, blue lens streaks on every light, letterbox
 * and grain. On it: the layout the operator builds (place, move, rotate,
 * delete buildings, gates, troughs, cameras and trees; draw fences), the
 * simulated flock, herd, crew and machinery, live camera cones, and a floor
 * overlay of activity heat or camera coverage.
 *
 * Rendering only. Layout rules and the simulation live in ranch-sim.js; this
 * file never decides anything a test should check.
 *
 * @module black-optic-6/twin3d
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCinemaStage } from '../../vision-kit/cinema.js';
import { HeatGrid, coverageGrid, heatRamp } from '../../vision-kit/twin.js';
import { BOUNDS, TYPES, fenceSegments, footprint, layoutCameras, newId, occluders } from './ranch-sim.js';

const W = BOUNDS.x1 - BOUNDS.x0;
const D = BOUNDS.z1 - BOUNDS.z0;

/* ------------------------------------------------------------- textures */

function groundTexture(layout) {
  const S = 6; // px per metre
  const c = document.createElement('canvas');
  c.width = W * S;
  c.height = D * S;
  const g = c.getContext('2d');
  const toPx = (x, z) => [(x - BOUNDS.x0) * S, (z - BOUNDS.z0) * S];
  g.fillStyle = '#6a7a36';
  g.fillRect(0, 0, c.width, c.height);
  // Grass variation: layered soft blotches.
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = r() * c.width;
    const y = r() * c.height;
    const rad = 6 + r() * 40;
    const hue = 62 + r() * 30;
    g.fillStyle = `hsla(${hue}, ${30 + r() * 25}%, ${20 + r() * 16}%, ${0.08 + r() * 0.12})`;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.5 + r()), r() * 3, 0, 7);
    g.fill();
  }
  // Paddocks are greener; the yard is worn.
  const poly = (pts, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(...toPx(x, z)) : g.moveTo(...toPx(x, z))));
    g.closePath();
    g.fill();
  };
  if (layout.zones) {
    poly(layout.zones.paddock, 'rgba(90,120,40,.35)');
    poly(layout.zones.herd, 'rgba(110,110,45,.3)');
    poly(layout.zones.pen, 'rgba(120,96,60,.45)');
  }
  g.fillStyle = 'rgba(130,108,72,.55)';
  g.beginPath();
  g.ellipse(...toPx(-35, 20), 34 * S, 22 * S, 0, 0, 7);
  g.fill();
  // Dirt tracks.
  g.strokeStyle = 'rgba(140,112,74,.8)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [w, pts] of [[4, [[-80, 26], [-55, 28], [-30, 18], [-30, -2], [10, 8], [45, 8], [45, -8]]], [3, [[-30, -2], [-45, -10], [-46, -30]]], [3, [[10, 8], [17, -2], [17, -20]]]]) {
    g.lineWidth = w * S;
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(...toPx(x, z)) : g.moveTo(...toPx(x, z))));
    g.stroke();
  }
  // Fine grass speckle.
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.6;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* --------------------------------------------------------------- shaders */

const skyMat = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uNight: { value: 0 }, uSun: { value: new THREE.Vector3(0.6, 0.12, -0.8) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uNight; uniform vec3 uSun; varying vec3 vP;
      void main(){
        float h = clamp(vP.y, -0.2, 1.0);
        vec3 dayTop = vec3(0.12, 0.2, 0.42), dayHz = vec3(1.0, 0.56, 0.26);
        vec3 ntTop = vec3(0.01, 0.015, 0.04), ntHz = vec3(0.05, 0.08, 0.16);
        vec3 top = mix(dayTop, ntTop, uNight), hz = mix(dayHz, ntHz, uNight);
        vec3 col = mix(hz, top, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vP), normalize(uSun)), 0.0);
        col += mix(vec3(1.0, 0.7, 0.4), vec3(0.6, 0.7, 1.0), uNight) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
        // stars
        vec3 q = floor(vP * 420.0);
        float st = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        col += uNight * step(0.9985, st) * smoothstep(0.05, 0.4, h) * 1.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

const coneMat = (color, alpha) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uAlpha: { value: alpha }, uSel: { value: 0 } },
    vertexShader: 'attribute float aD; varying float vD; void main(){ vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uAlpha, uSel; varying float vD;
      void main(){
        float a = uAlpha * (1.0 - vD) * (0.6 + 0.8 * uSel);
        float scan = smoothstep(0.04, 0.0, abs(fract(uTime * 0.25) - vD));
        float edge = smoothstep(0.94, 1.0, vD) * 0.6;
        gl_FragColor = vec4(uColor * (a + (scan + edge) * uAlpha * 1.4), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 80;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  spr.scale.set(9, 1.4, 1);
  spr.renderOrder = 10;
  spr.userData.draw = (t, col = color) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 80);
    g.font = '600 30px ui-monospace, Menlo, monospace';
    const w = Math.min(500, g.measureText(t).width + 30);
    g.fillStyle = 'rgba(4,6,10,.72)';
    g.fillRect(256 - w / 2, 14, w, 50);
    g.fillStyle = col;
    g.fillRect(256 - w / 2, 14, 3, 50);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, 256, 40);
    tex.needsUpdate = true;
  };
  spr.userData.draw(text);
  return spr;
}

/* -------------------------------------------------------------- builders */

const M = {
  barnRed: new THREE.MeshStandardMaterial({ color: '#8a2a1f', roughness: 0.85 }),
  roof: new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.55, metalness: 0.4 }),
  trim: new THREE.MeshStandardMaterial({ color: '#e9e2d0', roughness: 0.7 }),
  house: new THREE.MeshStandardMaterial({ color: '#d8c7a4', roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.35, metalness: 0.85 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.5, metalness: 0.6 }),
  wood: new THREE.MeshStandardMaterial({ color: '#6b4f33', roughness: 0.9 }),
  water: new THREE.MeshStandardMaterial({ color: '#2b5f7a', roughness: 0.05, metalness: 0.3 }),
  gate: new THREE.MeshStandardMaterial({ color: '#e0a526', roughness: 0.5, metalness: 0.5 }),
  trunk: new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 }),
  leaves: new THREE.MeshStandardMaterial({ color: '#3c5a22', roughness: 0.95, flatShading: true }),
  leaves2: new THREE.MeshStandardMaterial({ color: '#56702a', roughness: 0.95, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb357', emissiveIntensity: 0.0, roughness: 0.2 }),
  lens: new THREE.MeshBasicMaterial({ color: '#4fe8ff' }),
  wool: new THREE.MeshStandardMaterial({ color: '#ece6d6', roughness: 1 }),
  face: new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.8 }),
  cow: new THREE.MeshStandardMaterial({ color: '#2a1f1a', roughness: 0.9 }),
  green: new THREE.MeshStandardMaterial({ color: '#2f7a32', roughness: 0.5, metalness: 0.3 }),
  tyre: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.5, metalness: 0.3 }),
};

function gable(w, d, h, mat) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - 0.4, 0);
  s.lineTo(0, h);
  s.lineTo(w / 2 + 0.4, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d + 0.8, bevelEnabled: false });
  geo.translate(0, 0, -(d + 0.8) / 2);
  return new THREE.Mesh(geo, mat);
}

function buildObject(o) {
  const t = TYPES[o.type];
  const g = new THREE.Group();
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (o.type) {
    case 'barn': {
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w, 5, t.d), M.barnRed), 0, 2.5, 0);
      add(gable(t.w, t.d, 3.2, M.roof), 0, 5, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(4.5, 4, 0.2), M.trim), 0, 2, t.d / 2 + 0.05);
      add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.4, 0.22), M.barnRed), 0, 1.9, t.d / 2 + 0.08);
      const win = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.2), M.glass), 0, 6.1, t.d / 2 + 0.6);
      win.userData.window = true;
      break;
    }
    case 'house': {
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w, 3.4, t.d), M.house), 0, 1.7, 0);
      add(gable(t.w, t.d, 2.6, M.roof), 0, 3.4, 0);
      for (const x of [-4, 0, 4]) add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.15), M.glass), x, 1.9, t.d / 2 + 0.05).userData.window = true;
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w + 2, 0.15, 3), M.wood), 0, 0.3, t.d / 2 + 1.5);
      break;
    }
    case 'shed': {
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w, 3.6, t.d), M.metal), 0, 1.8, 0);
      add(gable(t.w, t.d, 1.2, M.darkMetal), 0, 3.6, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.15), M.darkMetal), 0, 1.5, t.d / 2 + 0.05);
      break;
    }
    case 'silo': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 10, 28), M.metal), 0, 5, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.metal), 0, 10, 0);
      for (let y = 1; y < 10; y += 1.5) add(new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.05, 6, 32), M.darkMetal), 0, y, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 'tank': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2.6, 24), M.metal), 0, 1.3, 0);
      add(new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.6, 24), M.darkMetal), 0, 2.9, 0);
      break;
    }
    case 'trough': {
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.6, t.d), M.metal), 0, 0.3, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w - 0.2, 0.05, t.d - 0.2), M.water), 0, 0.56, 0);
      break;
    }
    case 'gate': {
      for (const y of [0.35, 0.8, 1.2]) add(new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.08, 0.08), M.gate), 0, y, 0);
      for (const x of [-t.w / 2, t.w / 2]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), M.wood), x, 0.8, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), M.gate), 0, 0.78, 0).rotation.z = 0.9;
      break;
    }
    case 'camera': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, t.h, 8), M.darkMetal), 0, t.h / 2, 0);
      const head = new THREE.Group();
      head.position.y = t.h;
      head.rotation.order = 'YXZ';
      head.rotation.y = -(o.yaw ?? 0) - g.rotation.y;
      head.rotation.x = -0.35;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 10), M.darkMetal);
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      head.add(body);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), M.lens.clone());
      lens.position.z = -0.42;
      lens.rotation.y = Math.PI;
      head.add(lens);
      g.add(head);
      g.userData.lens = lens;
      g.userData.head = head;
      break;
    }
    case 'tree': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 7), M.trunk), 0, 1.5, 0);
      const k = 0.8 + ((o.x * 7.3 + o.z * 3.1) % 1 + 1) % 1 * 0.5;
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 * k, 1), M.leaves), 0, 4.2 * k, 0);
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * k, 1), M.leaves2), 0.9, 5.4 * k, 0.4);
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * k, 1), M.leaves), -0.9, 5.0 * k, -0.5);
      break;
    }
    default:
      add(new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), M.metal), 0, t.h / 2, 0);
  }
  g.position.set(o.x, 0, o.z);
  g.rotation.y = -(o.rot ?? 0);
  if (o.type === 'camera') g.userData.head.rotation.y = -(o.yaw ?? 0) - g.rotation.y;
  g.userData.objId = o.id;
  g.traverse((m) => (m.userData.objId = o.id));
  return g;
}

/* --------------------------------------------------------------- the twin */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{sim: import('./ranch-sim.js').RanchSim, onSelect?: Function, onChange?: Function}} opt
 */
export function createTwin(canvas, opt) {
  const { sim } = opt;
  const stage = createCinemaStage(canvas, { bloom: [0.5, 0.55, 0.85], exposure: 1.35, bars: 2.39 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 2.39, 0.5, 900);
  camera.position.set(-95, 62, 95);
  stage.use(scene, camera);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-5, 0, -5);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 18;
  controls.maxDistance = 260;
  controls.update();

  // ── Sky, fog, light ──
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), skyMat());
  scene.add(sky);
  scene.fog = new THREE.Fog('#d8996a', 190, 620);
  const sun = new THREE.DirectionalLight('#ffbf80', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 500 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#8fb0ff', '#4a3a22', 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight('#7f9cff', 0);
  moon.position.set(80, 140, 60);
  scene.add(moon);

  // ── Ground: ranch plane plus rolling hills to the horizon ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: groundTexture(sim.layout), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, 0, (BOUNDS.z0 + BOUNDS.z1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  const hillsGeo = new THREE.PlaneGeometry(1100, 1100, 120, 120);
  const hp = hillsGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    const y = hp.getY(i);
    const out = Math.max(0, Math.max(Math.abs(x) - W / 2 - 4, Math.abs(y) - D / 2 - 4));
    const h = out > 0 ? Math.min(1, out / 120) * (14 + 10 * Math.sin(x * 0.012) * Math.cos(y * 0.015) + 6 * Math.sin(x * 0.04 + y * 0.03)) : -0.2;
    hp.setZ(i, h - 0.25);
  }
  hillsGeo.computeVertexNormals();
  const hills = new THREE.Mesh(hillsGeo, new THREE.MeshStandardMaterial({ color: '#4a5226', roughness: 1 }));
  hills.rotation.x = -Math.PI / 2;
  hills.receiveShadow = true;
  scene.add(hills);
  // Distant tree line for depth.
  const farTrees = new THREE.InstancedMesh(new THREE.ConeGeometry(3, 11, 6), new THREE.MeshStandardMaterial({ color: '#2c3a1c', roughness: 1, flatShading: true }), 260);
  {
    const m = new THREE.Matrix4();
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const rad = 150 + r() * 160;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad * 0.8;
      const k = 0.7 + r() * 0.9;
      m.compose(new THREE.Vector3(x, 4 + k * 4, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k));
      farTrees.setMatrixAt(i, m);
    }
    farTrees.castShadow = true;
    scene.add(farTrees);
  }

  // ── Layout objects and fences ──
  const layoutGroup = new THREE.Group();
  scene.add(layoutGroup);
  const fenceGroup = new THREE.Group();
  scene.add(fenceGroup);
  const coneGroup = new THREE.Group();
  scene.add(coneGroup);
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  const objMeshes = new Map();

  function buildFences() {
    fenceGroup.clear();
    const segs = fenceSegments(sim.layout);
    let posts = 0;
    for (const [x1, z1, x2, z2] of segs) posts += Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 3) + 1;
    const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), M.wood, Math.max(1, posts));
    postMesh.castShadow = true;
    const m = new THREE.Matrix4();
    let k = 0;
    const railGeo = new THREE.BoxGeometry(1, 0.06, 0.06);
    for (const [x1, z1, x2, z2] of segs) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.ceil(len / 3);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        m.makeTranslation(x1 + (x2 - x1) * t, 0.75, z1 + (z2 - z1) * t);
        postMesh.setMatrixAt(k++, m);
      }
      for (const y of [0.55, 1.05, 1.4]) {
        const rail = new THREE.Mesh(railGeo, M.wood);
        rail.scale.x = len;
        rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        rail.castShadow = true;
        fenceGroup.add(rail);
      }
    }
    postMesh.count = k;
    fenceGroup.add(postMesh);
  }

  function rayToWalls(x, z, dx, dz, max, walls) {
    let best = max;
    for (const [x1, z1, x2, z2] of walls) {
      const ex = x2 - x1;
      const ez = z2 - z1;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - x) * ez - (z1 - z) * ex) / den;
      const u = ((x1 - x) * dz - (z1 - z) * dx) / den;
      if (t > 0.3 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }

  let scenario = { offline: [], ir: false };
  let night = 0;
  function buildCones() {
    coneGroup.clear();
    const walls = occluders(sim.layout);
    const light = 1 - night * 0.85;
    for (const cam of layoutCameras(sim.layout, scenario)) {
      if (!cam.online) continue;
      const range = cam.ir ? cam.range : cam.range * (0.25 + 0.75 * light);
      const N = 40;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const a = cam.yaw + ((i / N - 0.5) * cam.fov * Math.PI) / 180;
        const dx = Math.sin(a);
        const dz = -Math.cos(a);
        const d = rayToWalls(cam.x, cam.z, dx, dz, range, walls);
        pts.push([cam.x + dx * d, cam.z + dz * d, d / range]);
      }
      const fan = [];
      const fanD = [];
      const vol = [];
      const volD = [];
      for (let i = 0; i < N; i++) {
        const [ax, az, ad] = pts[i];
        const [bx, bz, bd] = pts[i + 1];
        fan.push(cam.x, 0.12, cam.z, ax, 0.12, az, bx, 0.12, bz);
        fanD.push(0, ad, bd);
        vol.push(cam.x, TYPES.camera.h, cam.z, ax, 0.15, az, bx, 0.15, bz);
        volD.push(0, ad, bd);
      }
      const mk = (pos, d, alpha) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('aD', new THREE.Float32BufferAttribute(d, 1));
        const mesh = new THREE.Mesh(geo, coneMat(cam.ir && night > 0.5 ? '#b18cff' : '#4fe8ff', alpha));
        mesh.userData.camId = cam.id;
        coneGroup.add(mesh);
      };
      mk(fan, fanD, 0.16);
      mk(vol, volD, 0.035);
    }
  }

  function buildLayout() {
    layoutGroup.clear();
    labelGroup.children.filter((c) => c.userData.camLabel).forEach((c) => labelGroup.remove(c));
    objMeshes.clear();
    for (const o of sim.layout.objects) {
      const g = buildObject(o);
      layoutGroup.add(g);
      objMeshes.set(o.id, g);
      if (o.type === 'camera') {
        const off = scenario.offline.includes(o.id);
        const l = label(`CAM · ${(o.name ?? 'Camera').toUpperCase()}${off ? ' · OFF' : ''}`, off ? '#ff3b4e' : '#4fe8ff');
        l.position.set(o.x, TYPES.camera.h + 2.2, o.z);
        l.userData.camLabel = true;
        labelGroup.add(l);
        g.userData.lens.material.color.set(off ? '#ff3b4e' : '#4fe8ff');
      }
    }
    buildFences();
    buildCones();
    updateCoverage();
  }

  // ── Floor overlay: activity heat / coverage ──
  const heat = new HeatGrid({ x0: BOUNDS.x0, z0: BOUNDS.z0, x1: BOUNDS.x1, z1: BOUNDS.z1, cell: 2 });
  const ovData = new Uint8Array(heat.cols * heat.rows * 4);
  const ovTex = new THREE.DataTexture(ovData, heat.cols, heat.rows, THREE.RGBAFormat);
  ovTex.magFilter = THREE.LinearFilter;
  ovTex.minFilter = THREE.LinearFilter;
  ovTex.colorSpace = THREE.SRGBColorSpace;
  const ovPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: ovTex, transparent: true, depthWrite: false, toneMapped: false }));
  ovPlane.rotation.x = -Math.PI / 2;
  ovPlane.position.set(ground.position.x, 0.08, ground.position.z);
  ovPlane.renderOrder = 2;
  scene.add(ovPlane);
  let overlay = 'heat';
  let coverage = null;
  function updateCoverage() {
    coverage = coverageGrid(layoutCameras(sim.layout, scenario), heat, { walls: occluders(sim.layout), light: 1 - night * 0.85 });
  }
  function writeOverlay(t) {
    ovPlane.visible = overlay !== 'off' && !cinema;
    if (!ovPlane.visible) return;
    const hv = heat.normalized();
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    for (let r = 0; r < heat.rows; r++) {
      for (let c = 0; c < heat.cols; c++) {
        const i = r * heat.cols + c;
        const o = ((heat.rows - 1 - r) * heat.cols + c) * 4;
        let col;
        let a;
        if (overlay === 'heat') {
          const v = Math.pow(hv[i], 0.5);
          col = heatRamp(0.15 + v * 0.8);
          a = Math.min(0.8, v) * Math.min(1, v * 6);
        } else {
          const n = coverage.count[i];
          if (n === 0) {
            col = [1, 0.23, 0.3];
            a = 0.28 * pulse;
          } else {
            col = [0.3, 0.9, 1];
            a = 0.1 + 0.12 * Math.min(1, n / 2);
          }
        }
        ovData[o] = col[0] * 255;
        ovData[o + 1] = col[1] * 255;
        ovData[o + 2] = col[2] * 255;
        ovData[o + 3] = a * 255;
      }
    }
    ovTex.needsUpdate = true;
  }

  // ── Living things ──
  const sheepBody = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 10, 8), M.wool, sim.sheep.length);
  const sheepHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), M.face, sim.sheep.length);
  const cowBody = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1.1, 0.9), M.cow, sim.cattle.length);
  const cowHead = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.5, 0.45), M.cow, sim.cattle.length);
  for (const m of [sheepBody, sheepHead, cowBody, cowHead]) {
    m.castShadow = true;
    m.frustumCulled = false;
    scene.add(m);
  }
  const dogMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.3), new THREE.MeshStandardMaterial({ color: '#7a5a3a' }));
  dogMesh.castShadow = true;
  const dogRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.7, 40), new THREE.MeshBasicMaterial({ color: '#ff3b4e', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  dogRing.rotation.x = -Math.PI / 2;
  scene.add(dogMesh, dogRing);

  const crew = sim.crew.map((w) => {
    const g = new THREE.Group();
    const vest = new THREE.MeshStandardMaterial({ color: w.colour, emissive: w.colour, emissiveIntensity: 0.25, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 10), vest);
    body.position.y = 0.95;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: '#c49a7a' }));
    head.position.y = 1.85;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), new THREE.MeshStandardMaterial({ color: '#d9c39a' }));
    hat.position.y = 2.02;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 36), new THREE.MeshBasicMaterial({ color: w.colour, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 14, 6, 1, true), new THREE.MeshBasicMaterial({ color: w.colour, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 7;
    const tagLight = new THREE.PointLight(w.colour, 0, 9, 2);
    tagLight.position.y = 1.2;
    g.add(body, head, hat, ring, beam, tagLight);
    const l = label(`${w.name.toUpperCase()} · TAG`, w.colour);
    l.scale.set(7, 1.1, 1);
    labelGroup.add(l);
    scene.add(g);
    return { w, g, ring, beam, tagLight, label: l };
  });

  const assets = sim.assets.map((a) => {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    if (a.kind === 'tractor') {
      add(new THREE.BoxGeometry(3.2, 1.2, 1.6), M.green, 0, 1.2, 0);
      add(new THREE.BoxGeometry(1.4, 1.5, 1.4), new THREE.MeshStandardMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.45, roughness: 0.1 }), -0.6, 2.5, 0);
      for (const [x, r, z] of [[-1, 0.9, 0.9], [-1, 0.9, -0.9], [1.2, 0.55, 0.8], [1.2, 0.55, -0.8]]) add(new THREE.CylinderGeometry(r, r, 0.45, 16), M.tyre, x, r, z).rotation.x = Math.PI / 2;
      const hl = new THREE.SpotLight('#fff1d0', 0, 40, 0.5, 0.6, 1.4);
      hl.position.set(1.7, 1.6, 0);
      hl.target.position.set(10, 0, 0);
      g.add(hl, hl.target);
      g.userData.headlight = hl;
    } else if (a.kind === 'quad') {
      add(new THREE.BoxGeometry(1.8, 0.6, 1), M.red, 0, 0.8, 0);
      for (const [x, z] of [[-0.7, 0.55], [-0.7, -0.55], [0.7, 0.55], [0.7, -0.55]]) add(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), M.tyre, x, 0.35, z).rotation.x = Math.PI / 2;
    } else if (a.kind === 'trailer') {
      add(new THREE.BoxGeometry(3, 0.8, 1.8), M.darkMetal, 0, 0.9, 0);
      for (const z of [0.95, -0.95]) add(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12), M.tyre, 0, 0.4, z).rotation.x = Math.PI / 2;
    } else {
      add(new THREE.BoxGeometry(0.6, 0.4, 0.4), M.gate, 0, 0.2, 0);
    }
    const tag = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: '#4fe8ff' }));
    tag.position.y = a.kind === 'tractor' ? 4 : 2;
    g.add(tag);
    const zone = new THREE.Mesh(new THREE.RingGeometry(5.8, 6, 64), new THREE.MeshBasicMaterial({ color: '#ff3b4e', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.12;
    scene.add(g, zone);
    return { a, g, tag, zone };
  });

  // ── Selection, ghost, fence drawing ──
  const selRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({ color: '#4fe8ff', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.position.y = 0.15;
  selRing.visible = false;
  scene.add(selRing);
  let ghost = null;
  const fenceLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffb23d' }));
  scene.add(fenceLine);
  let tool = 'select';
  let selected = null;
  let fenceDraft = null;
  let drag = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, p) ? p : null;
  };
  const snap = (v, s = 1) => Math.round(v / s) * s;
  const clampB = (x, z) => [Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z))];

  function setGhost(type) {
    if (ghost) scene.remove(ghost);
    ghost = null;
    if (!TYPES[type]) return;
    ghost = buildObject({ id: 'ghost', type, x: 0, z: 0, rot: 0, yaw: 0 });
    ghost.traverse((m) => {
      if (m.isMesh) {
        m.material = new THREE.MeshBasicMaterial({ color: '#4fe8ff', transparent: true, opacity: 0.35, depthWrite: false });
        m.castShadow = false;
      }
    });
    ghost.visible = false;
    scene.add(ghost);
  }

  function select(id) {
    selected = id;
    const o = sim.layout.objects.find((x) => x.id === id);
    selRing.visible = !!o;
    if (o) {
      const t = TYPES[o.type];
      selRing.scale.setScalar(Math.max(t.w, t.d) * 0.62 + 0.8);
      selRing.position.set(o.x, 0.15, o.z);
    }
    opt.onSelect?.(o ?? null);
  }

  const changed = () => {
    sim.setLayout(sim.layout);
    buildLayout();
    select(selected);
    opt.onChange?.(sim.layout);
  };

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(layoutGroup.children, true)[0];
    return hit?.object.userData.objId ?? null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (cinema || e.button !== 0) return;
    const p = groundPoint(e);
    if (tool === 'select') {
      const id = pick(e);
      select(id);
      if (id && p) {
        const o = sim.layout.objects.find((x) => x.id === id);
        drag = { id, dx: o.x - p.x, dz: o.z - p.z, moved: false };
        controls.enabled = false;
        canvas.setPointerCapture?.(e.pointerId);
      }
    } else if (tool === 'fence' && p) {
      const [x, z] = clampB(snap(p.x), snap(p.z));
      fenceDraft = fenceDraft ?? { id: newId('f'), pts: [] };
      fenceDraft.pts.push([x, z]);
      updateFenceLine(p);
    } else if (TYPES[tool] && p) {
      const [x, z] = clampB(snap(p.x), snap(p.z));
      const o = { id: newId(tool), type: tool, x, z, rot: ghost?.userData.rot ?? 0 };
      if (tool === 'camera') {
        o.yaw = Math.atan2(-5 - x, z + 5);
        o.name = `Cam ${sim.layout.objects.filter((q) => q.type === 'camera').length + 1}`;
      }
      sim.layout.objects.push(o);
      selected = o.id;
      changed();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = groundPoint(e);
    if (drag && p) {
      const o = sim.layout.objects.find((x) => x.id === drag.id);
      const [x, z] = clampB(snap(p.x + drag.dx), snap(p.z + drag.dz));
      if (x !== o.x || z !== o.z) {
        o.x = x;
        o.z = z;
        const g = objMeshes.get(o.id);
        g.position.set(x, 0, z);
        selRing.position.set(x, 0.15, z);
        drag.moved = true;
      }
    }
    if (ghost && p) {
      ghost.visible = true;
      ghost.position.set(snap(p.x), 0, snap(p.z));
    }
    if (tool === 'fence' && fenceDraft && p) updateFenceLine(p);
  });
  const endDrag = () => {
    if (drag?.moved) changed();
    drag = null;
    controls.enabled = !cinema;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => finishFence());
  canvas.addEventListener('pointerleave', () => ghost && (ghost.visible = false));

  function updateFenceLine(p) {
    const pts = (fenceDraft?.pts ?? []).map(([x, z]) => new THREE.Vector3(x, 0.4, z));
    if (p) pts.push(new THREE.Vector3(snap(p.x), 0.4, snap(p.z)));
    fenceLine.geometry.dispose();
    fenceLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
  function finishFence() {
    if (fenceDraft && fenceDraft.pts.length >= 2) {
      // Drop the duplicate point a double-click adds.
      const pts = fenceDraft.pts.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      if (pts.length >= 2) sim.layout.fences.push({ id: fenceDraft.id, pts });
      changed();
    }
    fenceDraft = null;
    updateFenceLine(null);
  }

  // ── Cinema camera ──
  let cinema = false;
  let cineT = 0;
  const cinePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-110, 30, 70), new THREE.Vector3(-40, 14, 60), new THREE.Vector3(20, 9, 30), new THREE.Vector3(60, 18, -10),
    new THREE.Vector3(40, 26, -70), new THREE.Vector3(-30, 20, -75), new THREE.Vector3(-90, 40, -20),
  ], true, 'catmullrom', 0.5);
  const cineLook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-25, 4, 15), new THREE.Vector3(-20, 3, 20), new THREE.Vector3(15, 1, -20), new THREE.Vector3(35, 1, -32),
    new THREE.Vector3(20, 2, -10), new THREE.Vector3(-45, 1, -30), new THREE.Vector3(-30, 4, 10),
  ], true, 'catmullrom', 0.5);

  // ── Frame ──
  let heatT = 0;
  let ovT = 0;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tmpS = new THREE.Vector3();
  function placeAnimal(list, body, head, bodyY, headOff, scale) {
    list.forEach((a, i) => {
      q.setFromAxisAngle(up, -a.heading);
      const bob = Math.abs(Math.sin(a.x * 0.7 + a.z * 0.5)) * 0.05;
      tmpS.set(scale[0], scale[1], scale[2]);
      mtx.compose(new THREE.Vector3(a.x, bodyY + bob, a.z), q, tmpS);
      body.setMatrixAt(i, mtx);
      const hx = a.x + Math.cos(a.heading) * headOff[0];
      const hz = a.z + Math.sin(a.heading) * headOff[0];
      mtx.compose(new THREE.Vector3(hx, headOff[1], hz), q, new THREE.Vector3(1, 1, 1));
      head.setMatrixAt(i, mtx);
    });
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }

  function setNight(v) {
    night = v;
    const dayK = 1 - v;
    sun.intensity = 4.2 * dayK;
    sun.color.setHSL(0.08, 0.9, 0.62);
    hemi.intensity = 1.0 * dayK + 0.18;
    hemi.color.set(v > 0.5 ? '#3a4a7a' : '#8fb0ff');
    moon.intensity = 0.9 * v;
    sky.material.uniforms.uNight.value = v;
    scene.fog.color.set(new THREE.Color('#d8996a').lerp(new THREE.Color('#0b1222'), v));
    M.glass.emissiveIntensity = 0.2 + 2.2 * v;
    stage.grade.uniforms.uWarm.value = 0.6 * dayK;
    stage.grade.uniforms.uStreakColor.value.set(v > 0.5 ? '#7fb2ff' : '#5ab8ff');
    for (const c of crew) c.tagLight.intensity = 3 * v;
    for (const a of assets) if (a.g.userData.headlight) a.g.userData.headlight.intensity = 60 * v;
    buildCones();
    updateCoverage();
  }

  function update(dt, t) {
    // Sun low in the west-south-west: long shadows.
    sun.position.set(-160, 55, 90);
    sun.target.position.set(0, 0, 0);
    sky.material.uniforms.uSun.value.copy(sun.position).normalize();
    placeAnimal(sim.sheep, sheepBody, sheepHead, 0.62, [0.6, 0.75], [1.25, 0.95, 0.85]);
    placeAnimal(sim.cattle, cowBody, cowHead, 1.15, [1.3, 1.45], [1, 1, 1]);
    if (sim.dog) {
      dogMesh.visible = dogRing.visible = true;
      dogMesh.position.set(sim.dog.x, 0.4, sim.dog.z);
      dogMesh.rotation.y = -sim.dog.heading;
      dogRing.position.set(sim.dog.x, 0.15, sim.dog.z);
      dogRing.material.opacity = 0.5 + 0.5 * Math.sin(t * 8);
    } else dogMesh.visible = dogRing.visible = false;
    const visible = new Set(sim.visibleCrew().map((w) => w.id));
    for (const c of crew) {
      const on = visible.has(c.w.id);
      c.g.visible = on;
      c.label.visible = on && !cinema;
      c.g.position.set(c.w.x, 0, c.w.z);
      c.g.rotation.y = -c.w.heading;
      c.ring.scale.setScalar(1 + 0.25 * Math.sin(t * 4 + c.w.x));
      c.beam.material.opacity = 0.18 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3)) + night * 0.2;
      c.label.position.set(c.w.x, 4.2, c.w.z);
    }
    for (const a of assets) {
      a.g.position.set(a.a.x, 0, a.a.z);
      a.g.rotation.y = -a.a.heading;
      a.tag.rotation.y += dt * 2;
      a.zone.visible = a.a.machine && a.a.moving;
      a.zone.position.set(a.a.x, 0.12, a.a.z);
      a.zone.material.opacity = 0.35 + 0.35 * Math.sin(t * 5);
    }
    for (const m of coneGroup.children) m.material.uniforms.uTime.value = t + (m.position.x || 0);
    for (const g of objMeshes.values()) if (g.userData.lens) g.userData.lens.scale.setScalar(1 + 0.2 * Math.sin(t * 5));
    if (selRing.visible) selRing.material.opacity = 0.6 + 0.4 * Math.sin(t * 4);
    coneGroup.visible = !cinema;
    labelGroup.visible = !cinema;
    // Activity heat.
    heatT += dt;
    if (heatT > 0.5) {
      for (const s of sim.sheep) heat.add(s.x, s.z, 0.5, 3);
      for (const c of sim.cattle) heat.add(c.x, c.z, 0.5, 3);
      for (const w of sim.visibleCrew()) heat.add(w.x, w.z, 0.8, 2.5);
      heat.decay(heatT, 240);
      heatT = 0;
    }
    ovT += dt;
    if (ovT > 0.4) {
      writeOverlay(t);
      ovT = 0;
    }
    if (cinema) {
      cineT = (cineT + dt * 0.012) % 1;
      camera.position.copy(cinePath.getPointAt(cineT));
      camera.lookAt(cineLook.getPointAt(cineT));
    } else controls.update();
    stage.render(t, dt);
  }

  buildLayout();
  setNight(0);
  // Pre-warm the heat map with a few minutes of the day.
  for (let i = 0; i < 240; i++) {
    sim.step(0.5);
    if (i % 2 === 0) {
      for (const s of sim.sheep) heat.add(s.x, s.z, 0.5, 3);
      for (const c of sim.cattle) heat.add(c.x, c.z, 0.5, 3);
      for (const w of sim.visibleCrew()) heat.add(w.x, w.z, 0.8, 2.5);
    }
  }
  sim.events.length = 0;
  writeOverlay(0);

  return {
    stage,
    camera,
    controls,
    update,
    get selected() {
      return selected;
    },
    get coverage() {
      return coverage;
    },
    get tool() {
      return tool;
    },
    setTool(t) {
      if (tool === 'fence' && t !== 'fence') finishFence();
      tool = t;
      setGhost(TYPES[t] ? t : null);
      canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    },
    finishFence,
    cancelFence() {
      fenceDraft = null;
      updateFenceLine(null);
    },
    rotateSelected(d = Math.PI / 12) {
      const o = sim.layout.objects.find((x) => x.id === selected);
      if (!o) {
        if (ghost) {
          ghost.userData.rot = (ghost.userData.rot ?? 0) + d;
          ghost.rotation.y = -ghost.userData.rot;
        }
        return;
      }
      if (o.type === 'camera') o.yaw = (o.yaw ?? 0) + d;
      else o.rot = (o.rot ?? 0) + d;
      changed();
    },
    deleteSelected() {
      const i = sim.layout.objects.findIndex((x) => x.id === selected);
      if (i < 0) return;
      sim.layout.objects.splice(i, 1);
      selected = null;
      changed();
    },
    removeLastFence() {
      sim.layout.fences.pop();
      changed();
    },
    relayout() {
      selected = null;
      changed();
    },
    select,
    setOverlay(m) {
      overlay = m;
      writeOverlay(0);
    },
    setNight,
    setScenario(s) {
      scenario = { ...scenario, ...s };
      buildLayout();
    },
    setCinema(on) {
      cinema = on;
      controls.enabled = !on;
      if (!on) {
        camera.position.set(-95, 62, 95);
        controls.target.set(-5, 0, -5);
      }
    },
    focus(x, z) {
      controls.target.set(x, 0, z);
      const off = camera.position.clone().sub(controls.target).setLength(70);
      camera.position.copy(controls.target).add(off);
    },
  };
}

export { footprint };
