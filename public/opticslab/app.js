// Optics Lab — the plane of focus, made visible.
//
// World layout, along the X axis (1 unit = 20 cm of subject distance):
//   x ≈ -5   image plane (sensor screen)
//   x -3.4…0.5   the lens: rear mount, glass groups, iris, focusing ring
//   x 1.6…7.2   a low-poly diorama — pines, a cabin, mountains, sky
// The plane of focus is a world plane x = focusX. A post pass reconstructs
// every pixel's world position from depth and blurs it by its distance from
// that plane, so the blur is physically where the plane says it is.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- optics
const LENS_Y = 0.8;
const F_MM = 50; // focal length
const COC_MM = 0.03; // circle of confusion, full frame
const cmToX = (cm) => 1.8 + (cm - 20) / 20;
const xToCm = (x) => (x - 1.8) * 20 + 20;
/** Total depth of field in cm for a subject distance (cm) and f-number. */
function sharpZoneCm(cm, N) {
  const d = cm * 10;
  return (2 * N * COC_MM * d * d) / (F_MM * F_MM) / 10;
}

const S = {
  focusCm: 38, focusTarget: 38,
  fstop: 2, fstopShown: 2,
  explode: 0, explodeTarget: 0,
  labels: true, rays: true, peaking: true,
};

// ---------------------------------------------------------------- renderer
const canvas = $("#gl");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
} catch (e) {
  $("#boot p").textContent = "WebGL is unavailable in this browser.";
  throw e;
}
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080c);
scene.fog = new THREE.Fog(0x07080c, 22, 48);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 80);
camera.position.set(-1, 4.4, 11);
camera.layers.enable(1);
const camTarget = new THREE.Vector3(0.5, 0.8, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.495;
controls.enabled = false;

// Layer 1 = overlays drawn after the depth-of-field pass (plane, rays).
const HELPER = 1;
const helper = (o) => { o.traverse((c) => c.layers.set(HELPER)); return o; };

// Shared uniforms for the focus-peaking band baked into diorama materials.
const U = { focusX: { value: cmToX(38) }, zone: { value: 0.04 }, band: { value: 1 } };

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const knurlTex = canvasTex(1024, 64, (g, w, h) => {
  g.fillStyle = "#101114"; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { g.fillStyle = "#26282e"; g.fillRect(x, 0, 4, h); g.fillStyle = "#050507"; g.fillRect(x + 4, 0, 1, h); }
});
const scaleTex = canvasTex(2048, 96, (g, w, h) => {
  g.fillStyle = "#0b0c0f"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#e0ad55"; g.font = "600 34px JetBrains Mono, monospace"; g.textAlign = "center";
  const marks = ["0.2", "0.3", "0.4", "0.5", "0.7", "1", "1.5", "3", "∞"];
  marks.forEach((m, i) => { const x = 120 + i * 90; g.fillText(m, x, 62); g.fillRect(x - 1, 70, 2, 20); });
  for (let x = 110; x < 900; x += 18) g.fillRect(x, 80, 1, 10);
  g.fillStyle = "#7fd8ff"; g.fillText("m", 960, 62);
});
const railTex = canvasTex(2048, 32, (g, w, h) => {
  g.fillStyle = "#1a1c22"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#6d7384";
  for (let i = 0; i <= 256; i++) { const x = (i / 256) * w; g.fillRect(x, 0, 1.5, i % 8 === 0 ? 22 : i % 4 === 0 ? 14 : 8); }
});
const skyTex = canvasTex(1024, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, "#4f7fb4"); gr.addColorStop(0.55, "#9fc0de"); gr.addColorStop(1, "#e7eef4");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.55)";
  const blob = (x, y, s) => { for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(x + (i - 3) * s * 0.6, y + Math.sin(i * 1.7) * s * 0.18, s * 0.55, s * 0.32, 0, 0, Math.PI * 2); g.fill(); } };
  blob(220, 150, 70); blob(700, 110, 90); blob(520, 240, 50); blob(900, 260, 60);
});
const gridTex = canvasTex(512, 448, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "rgba(190,235,255,.55)"; g.lineWidth = 1.2;
  for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = "rgba(230,248,255,.95)"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
});
function platePanel(blur, label) {
  return canvasTex(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#111a2a"); gr.addColorStop(1, "#070b12");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.filter = `blur(${blur}px)`;
    g.fillStyle = "#e8f3ff";
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(150, 70 + i * 55); g.lineTo(90 - i * 10, 170 + i * 60); g.lineTo(210 + i * 10, 170 + i * 60); g.closePath(); g.fill(); }
    g.fillRect(140, 285, 20, 40);
    g.filter = "none";
    g.strokeStyle = "rgba(127,216,255,.7)"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(360, 200, 16, 70, 0, 0, Math.PI * 2); g.stroke();
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(240, 200 + i * 38); g.lineTo(360, 200 + i * 12); g.lineTo(470, 200); g.stroke(); }
    g.fillStyle = "#9fb3cc"; g.font = "500 22px JetBrains Mono, monospace"; g.fillText(label, 28, 360);
  });
}

// ---------------------------------------------------------------- materials
const M = {
  bench: new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.55, metalness: 0.3 }),
  benchTop: new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.35, metalness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.35, metalness: 0.85 }),
  metalLight: new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.3, metalness: 0.9 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc8943e, roughness: 0.28, metalness: 1 }),
  knurl: new THREE.MeshStandardMaterial({ map: knurlTex, roughness: 0.6, metalness: 0.4 }),
  scale: new THREE.MeshStandardMaterial({ map: scaleTex, roughness: 0.5, metalness: 0.3 }),
  rail: new THREE.MeshStandardMaterial({ map: railTex, roughness: 0.4, metalness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.25, ior: 1.52, envMapIntensity: 1.4, specularIntensity: 1, attenuationColor: new THREE.Color(0xbfefff), attenuationDistance: 2.5 }),
  edge: new THREE.MeshBasicMaterial({ color: 0x8fe3ff }),
  glow: new THREE.MeshBasicMaterial({ color: 0x5fd0ff }),
  pinkGlow: new THREE.MeshBasicMaterial({ color: 0xff5fb4 }),
  iris: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide }),
  wall: new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.9, metalness: 0.1 }),
};
Object.values(M).forEach((m) => { if (m.isMeshStandardMaterial && m !== M.glass) m.envMapIntensity = 0.5; });

function bandify(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFocusX = U.focusX; sh.uniforms.uZone = U.zone; sh.uniforms.uBand = U.band;
    sh.vertexShader = "varying vec3 vWPos;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "uniform float uFocusX; uniform float uZone; uniform float uBand; varying vec3 vWPos;\n" +
      sh.fragmentShader.replace("#include <dithering_fragment>", `#include <dithering_fragment>
  float bd = abs(vWPos.x - uFocusX);
  float hw = max(uZone * 0.5, 0.012);
  float core = 1.0 - smoothstep(hw, hw + 0.035, bd);
  gl_FragColor.rgb += vec3(0.45, 0.85, 1.0) * core * uBand * 0.9;`);
  };
  mat.customProgramCacheKey = () => "band";
  return mat;
}
const D = {
  wood: bandify(new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 })),
  grass: bandify(new THREE.MeshStandardMaterial({ color: 0x5f9a45, roughness: 0.9, flatShading: true })),
  pine: bandify(new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: 0.85, flatShading: true })),
  pineDark: bandify(new THREE.MeshStandardMaterial({ color: 0x2f6e3c, roughness: 0.85, flatShading: true })),
  trunk: bandify(new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9 })),
  cabin: bandify(new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.8, flatShading: true })),
  roof: bandify(new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.8, flatShading: true })),
  window: bandify(new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xffa040, emissiveIntensity: 1.1 })),
  rock: bandify(new THREE.MeshStandardMaterial({ color: 0x8e96a3, roughness: 0.9, flatShading: true })),
  snow: bandify(new THREE.MeshStandardMaterial({ color: 0xf1f4f8, roughness: 0.7, flatShading: true })),
  sky: new THREE.MeshBasicMaterial({ map: skyTex }),
};

function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
const alongX = (g) => g.rotateZ(-Math.PI / 2); // cylinder/lathe axis y → x
const ringX = (g) => g.rotateY(Math.PI / 2); // torus/ring axis z → x

// ---------------------------------------------------------------- room
{
  const floor = mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x08090d, roughness: 0.6, metalness: 0.2 }), false, true);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; scene.add(floor);
  const back = mesh(new THREE.PlaneGeometry(40, 14), M.wall, false, true);
  back.position.set(0, 4, -6); scene.add(back);

  // Wall plates: the same tree at three apertures.
  [["f/2 · soft", 9], ["f/5.6", 4], ["f/16 · sharp", 0]].forEach(([label, blur], i) => {
    const frame = mesh(new THREE.BoxGeometry(2.3, 1.75, 0.08), M.metal, false, false);
    frame.position.set(-4 + i * 2.9, 4.6, -5.9);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.575), new THREE.MeshBasicMaterial({ map: platePanel(blur, label) }));
    face.position.z = 0.045; frame.add(face);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.02, 0.02), M.glow);
    strip.position.set(0, -0.9, 0.05); frame.add(strip);
    scene.add(frame);
  });

  // CinematicX neon rings + light
  [[7.6, 4.2, 0.9], [9.6, 4.0, 0.7], [11.2, 3.9, 0.55]].forEach(([x, y, r]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 12, 64), M.pinkGlow);
    ring.position.set(x, y, -5.85); scene.add(ring);
  });
  const pink = new THREE.PointLight(0xff5fb4, 18, 14, 1.6); pink.position.set(9, 4, -4.5); scene.add(pink);

  // Floating crystal shards (CinematicX motif)
  const shardMat = new THREE.MeshPhysicalMaterial({ color: 0xffd6ec, roughness: 0.08, metalness: 0.1, transmission: 0.6, thickness: 0.4, ior: 1.6, emissive: 0x3a0a22, envMapIntensity: 1.2 });
  window.__shards = [];
  for (let i = 0; i < 9; i++) {
    const s = mesh(new THREE.OctahedronGeometry(0.22, 0), shardMat, false, false);
    s.scale.set(0.6, 1.8 + Math.random(), 0.6);
    const a = (i / 9) * Math.PI * 2;
    s.position.set(Math.cos(a) * 10 + 1, 2.2 + Math.sin(i * 2.3) * 1.6, -4.5 + Math.sin(a) * 1.2);
    s.userData.spin = 0.2 + Math.random() * 0.4; s.userData.y = s.position.y; s.userData.p = Math.random() * 6;
    scene.add(s); window.__shards.push(s);
  }
}

// ---------------------------------------------------------------- bench + rail
{
  const bench = mesh(new THREE.BoxGeometry(17, 1.6, 4.2), M.bench);
  bench.position.set(0.5, -0.8, 0); scene.add(bench);
  const top = mesh(new THREE.BoxGeometry(17, 0.04, 4.2), M.benchTop);
  top.position.set(0.5, 0.0, 0); scene.add(top);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.025, 0.025), M.glow);
  strip.position.set(0.5, -0.12, 2.11); scene.add(strip);
  const rail = mesh(new THREE.BoxGeometry(13.2, 0.08, 0.36), M.rail);
  rail.geometry.rotateY(0); rail.position.set(-0.7, 0.06, 0); scene.add(rail);
  const railSide = mesh(new THREE.BoxGeometry(13.2, 0.06, 0.02), M.brass);
  railSide.position.set(-0.7, 0.06, 0.19); scene.add(railSide);
  // Control dial on the bench (decorative, CinematicX style)
  const dial = mesh(alongX(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 48)).rotateZ(Math.PI / 2), M.metalLight);
  dial.position.set(-5.8, 0.06, 1.35); scene.add(dial);
  const dialRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.015, 8, 64).rotateX(Math.PI / 2), M.pinkGlow);
  dialRing.position.set(-5.8, 0.13, 1.35); scene.add(dialRing);
}

// ---------------------------------------------------------------- sensor / image plane
const sensor = new THREE.Group();
sensor.position.set(-5.1, 0, 0);
sensor.rotation.y = -0.5;
scene.add(sensor);
const SENSOR_W = 1.6, SENSOR_H = 0.9;
let sensorScreen;
{
  const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16), M.metalLight); post.position.y = 0.25; sensor.add(post);
  const base = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), M.metal); base.position.y = 0.1; sensor.add(base);
  const frame = mesh(new THREE.BoxGeometry(0.08, SENSOR_H + 0.12, SENSOR_W + 0.12), M.metal); frame.position.y = LENS_Y; sensor.add(frame);
  sensorScreen = new THREE.Mesh(new THREE.PlaneGeometry(SENSOR_W, SENSOR_H).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  sensorScreen.position.set(0.045, LENS_Y, 0); sensor.add(sensorScreen);
}
const sensorCenter = new THREE.Vector3();
sensorScreen.getWorldPosition(sensorCenter);

// ---------------------------------------------------------------- lens
const lens = new THREE.Group();
scene.add(lens);
const elements = []; // { group, base, focus }
let focusRing, gearRing, irisMesh, irisX = -1.55;
{
  const barrel = (x0, x1, r, mat) => {
    const g = alongX(new THREE.CylinderGeometry(r, r, x1 - x0, 64, 1, false));
    const m = mesh(g, mat); m.position.set((x0 + x1) / 2, LENS_Y, 0); lens.add(m); return m;
  };
  const collar = (x, r, t = 0.03, mat = M.brass) => {
    const m = mesh(ringX(new THREE.TorusGeometry(r, t, 12, 72)), mat, false, false);
    m.position.set(x, LENS_Y, 0); lens.add(m); return m;
  };

  // Rear mount + bayonet
  barrel(-3.55, -3.2, 0.5, M.metal);
  collar(-3.55, 0.47, 0.035);
  barrel(-3.2, -3.05, 0.58, M.metalLight);
  // Open cage rods (cutaway barrel)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rod = mesh(alongX(new THREE.CylinderGeometry(0.025, 0.025, 2.75, 10)), M.brass);
    rod.position.set(-1.7, LENS_Y + Math.cos(a) * 0.66, Math.sin(a) * 0.66); lens.add(rod);
  }
  // Front section: focusing ring, scale, gear, hood
  barrel(-0.35, -0.15, 0.7, M.scale).rotation.x = Math.PI;
  focusRing = barrel(-0.15, 0.3, 0.76, M.knurl);
  gearRing = new THREE.Group(); gearRing.position.set(0.42, LENS_Y, 0); lens.add(gearRing);
  gearRing.add(mesh(alongX(new THREE.CylinderGeometry(0.8, 0.8, 0.14, 72)), M.brass));
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const tooth = mesh(new THREE.BoxGeometry(0.13, 0.06, 0.035), M.brass, false, false);
    tooth.position.set(0, Math.cos(a) * 0.83, Math.sin(a) * 0.83); tooth.rotation.x = -a; gearRing.add(tooth);
  }
  barrel(0.5, 0.95, 0.72, M.metal);
  collar(0.95, 0.72, 0.03);
  collar(-0.35, 0.7, 0.02);

  // Glass: lathe profiles, axis along x.
  function element(R, thick, c1, c2) {
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) { const r = (R * i) / n; pts.push(new THREE.Vector2(r, thick / 2 + c1 * (1 - (r / R) ** 2))); }
    for (let i = n; i >= 0; i--) { const r = (R * i) / n; pts.push(new THREE.Vector2(r, -thick / 2 - c2 * (1 - (r / R) ** 2))); }
    const g = new THREE.Group();
    const glass = mesh(alongX(new THREE.LatheGeometry(pts, 64)), M.glass, false, false);
    g.add(glass);
    const rim = new THREE.Mesh(ringX(new THREE.TorusGeometry(R, 0.012, 8, 72)), M.edge); g.add(rim);
    const cell = mesh(ringX(new THREE.TorusGeometry(R + 0.03, 0.03, 10, 72)), M.metalLight, false, false); g.add(cell);
    return g;
  }
  const spec = [
    // x,    R,    thick, c1,   c2,   focus-group?
    [-2.85, 0.42, 0.06, 0.07, 0.07, false],
    [-2.45, 0.46, 0.05, 0.1, -0.03, false],
    [-2.05, 0.5, 0.08, 0.06, 0.09, false],
    [-1.05, 0.54, 0.05, -0.02, 0.1, false],
    [-0.75, 0.58, 0.07, 0.11, 0.05, true],
    [-0.5, 0.6, 0.05, 0.05, 0.12, true],
    [0.72, 0.66, 0.08, 0.14, 0.02, false],
  ];
  spec.forEach(([x, R, t, c1, c2, f], i) => {
    const g = element(R, t, c1, c2);
    g.position.set(x, LENS_Y, 0);
    lens.add(g);
    elements.push({ group: g, base: x, focus: f, i });
  });

  // Iris
  const housing = mesh(ringX(new THREE.TorusGeometry(0.6, 0.05, 12, 72)), M.brass, false, false);
  housing.position.set(irisX, LENS_Y, 0); lens.add(housing);
  irisMesh = mesh(new THREE.BufferGeometry(), M.iris, false, false);
  irisMesh.position.set(irisX, LENS_Y, 0); lens.add(irisMesh);

  // Stands
  [-2.6, -0.1].forEach((x) => {
    const post = mesh(new THREE.BoxGeometry(0.16, LENS_Y - 0.6 + 0.02, 0.16), M.metalLight);
    post.position.set(x, 0.1 + (LENS_Y - 0.6) / 2, 0); lens.add(post);
    const foot = mesh(new THREE.BoxGeometry(0.4, 0.08, 0.5), M.metal); foot.position.set(x, 0.12, 0); lens.add(foot);
    const clamp_ = mesh(ringX(new THREE.TorusGeometry(x > -1 ? 0.78 : 0.6, 0.04, 10, 48, Math.PI)).rotateX(Math.PI), M.brass, false, false);
    clamp_.position.set(x, LENS_Y, 0); lens.add(clamp_);
  });
}
function setIris(N) {
  const inner = clamp(0.5 * (2 / N) ** 0.75, 0.05, 0.5);
  irisMesh.geometry.dispose();
  irisMesh.geometry = ringX(new THREE.RingGeometry(inner, 0.6, 9, 1)); // 9-sided — nine blades
}
setIris(2);

// ---------------------------------------------------------------- diorama
const objects = []; // named subjects with x extents, for the story + CX
{
  const base = mesh(new THREE.BoxGeometry(5.6, 0.25, 3.2), D.wood);
  base.position.set(4.4, 0.125, 0); scene.add(base);
  // Terrain: displaced plane
  const tg = new THREE.PlaneGeometry(5.6, 3.2, 28, 16).rotateX(-Math.PI / 2);
  const p = tg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const edge = Math.min(2.8 - Math.abs(x), 1.6 - Math.abs(z));
    const h = edge < 0.05 ? 0 : 0.06 * Math.sin(x * 2.1 + z * 1.3) + 0.05 * Math.cos(z * 3.1) + Math.max(0, x - 1.2) * 0.12;
    p.setY(i, Math.max(0, h));
  }
  tg.computeVertexNormals();
  const terrain = mesh(tg, D.grass, false, true);
  terrain.position.set(4.4, 0.25, 0); scene.add(terrain);

  const pine = (x, z, s, dark) => {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.2 * s, 6), D.trunk); trunk.position.y = 0.1 * s; g.add(trunk);
    for (let k = 0; k < 3; k++) {
      const c = mesh(new THREE.ConeGeometry((0.3 - k * 0.07) * s, 0.42 * s, 7), dark ? D.pineDark : D.pine);
      c.position.y = (0.34 + k * 0.22) * s; c.rotation.y = k; g.add(c);
    }
    g.position.set(x, 0.27, z); scene.add(g);
    return g;
  };
  // foreground (24–40 cm)
  [[2.15, 0.9, 1.25], [2.4, -0.6, 1.0], [2.7, 0.35, 0.85], [2.3, -1.25, 0.9]].forEach(([x, z, s], i) => pine(x, z, s, i % 2));
  objects.push({ name: "the front pines", x0: 1.95, x1: 2.95 });
  // cabin (≈ 60 cm)
  {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.5, 0.34, 0.62), D.cabin); body.position.y = 0.17; g.add(body);
    const roofG = new THREE.CylinderGeometry(0.001, 0.42, 0.28, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 2 * 0);
    const roof = mesh(new THREE.ConeGeometry(0.46, 0.3, 4).rotateY(Math.PI / 4), D.roof); roof.scale.set(1.05, 1, 1.35); roof.position.y = 0.49; g.add(roof);
    roofG.dispose();
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.1), D.window);
    win.rotation.y = -Math.PI / 2; win.position.set(-0.251, 0.19, 0.12); g.add(win);
    const win2 = win.clone(); win2.position.z = -0.14; g.add(win2);
    const chim = mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), D.rock); chim.position.set(0.1, 0.58, -0.18); g.add(chim);
    g.position.set(3.8, 0.29, 0.15); g.rotation.y = 0.25; scene.add(g);
    const warm = new THREE.PointLight(0xffa24a, 3.2, 2.2, 1.8); warm.position.set(3.45, 0.5, 0.2); scene.add(warm);
    objects.push({ name: "the cabin", x0: 3.52, x1: 4.08, anchor: new THREE.Vector3(3.8, 0.6, 0.15) });
  }
  // midground pines (45–80 cm)
  [[3.3, -0.9, 0.9], [3.5, 1.1, 1.0], [4.3, -0.5, 1.1], [4.6, 0.9, 0.9], [4.9, -1.2, 1.2], [3.2, 0.6, 0.7]].forEach(([x, z, s], i) => pine(x, z, s, i % 2));
  objects.push({ name: "the valley pines", x0: 3.1, x1: 5.05 });
  // mountains
  const mountain = (x, z, r, h) => {
    const rock = mesh(new THREE.ConeGeometry(r, h, 6, 2), D.rock); rock.position.set(x, 0.25 + h / 2, z); rock.rotation.y = x;
    // jitter
    const pp = rock.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) if (pp.getY(i) < h / 2 - 0.01) { pp.setX(i, pp.getX(i) * (0.85 + ((i * 37) % 10) / 30)); }
    rock.geometry.computeVertexNormals();
    scene.add(rock);
    const cap = mesh(new THREE.ConeGeometry(r * 0.36, h * 0.36, 6), D.snow); cap.position.set(x, 0.25 + h - h * 0.18 + 0.005, z); cap.rotation.y = x; scene.add(cap);
  };
  mountain(5.9, -0.3, 1.0, 2.5);
  mountain(6.3, 0.9, 0.8, 1.8);
  mountain(5.5, 1.3, 0.55, 1.1);
  mountain(6.5, -1.2, 0.75, 1.6);
  objects.push({ name: "the peak", x0: 5.35, x1: 6.7, anchor: new THREE.Vector3(5.9, 2.7, -0.3) });
  // sky backdrop
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.6).rotateY(-Math.PI / 2), D.sky);
  sky.position.set(7.4, 2.5, 0); scene.add(sky);
  const skyFrame = mesh(new THREE.BoxGeometry(0.06, 4.7, 9.1), M.metal); skyFrame.position.set(7.44, 2.5, 0); scene.add(skyFrame);
}

// ---------------------------------------------------------------- lights
{
  scene.add(new THREE.HemisphereLight(0x9fb8d8, 0x101014, 0.35));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(3, 9, 6); key.target.position.set(2, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 6, bottom: -6, near: 1, far: 25 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x7fc8ff, 1.2); rim.position.set(-6, 4, -6); scene.add(rim);
  const lensLight = new THREE.SpotLight(0xffffff, 30, 12, 0.5, 0.6, 1.5);
  lensLight.position.set(-2, 5, 4); lensLight.target.position.set(-1.5, 0.8, 0); scene.add(lensLight, lensLight.target);
}

// ---------------------------------------------------------------- overlays (layer 1)
const focusPlane = new THREE.Group();
{
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.8).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  plane.position.y = 1.65; focusPlane.add(plane);
  const zone = new THREE.Mesh(new THREE.BoxGeometry(1, 2.8, 3.2),
    new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
  zone.position.y = 1.65; zone.name = "zone"; focusPlane.add(zone);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 3.2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  stem.position.y = 1.6; focusPlane.add(stem);
  scene.add(helper(focusPlane));
}
const RAY_SRC = [[0.55, -0.55], [1.15, 0.35], [1.9, -0.1]]; // (y, z) on the plane
const RAY_FAN = 4;
const rayGeo = new THREE.BufferGeometry();
rayGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAY_SRC.length * RAY_FAN * 3 * 2 * 3), 3));
const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
rays.frustumCulled = false;
scene.add(helper(rays));
const sensorDots = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAY_SRC.length * 3), 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sensorDots.frustumCulled = false;
scene.add(helper(sensorDots));

function updateRays() {
  const pos = rayGeo.attributes.position.array;
  const fx = U.focusX.value;
  const a = clamp(0.5 * (2 / S.fstopShown) ** 0.75, 0.05, 0.5);
  const q = new THREE.Quaternion().setFromEuler(sensor.rotation);
  const dots = sensorDots.geometry.attributes.position.array;
  let k = 0;
  RAY_SRC.forEach(([y, z], si) => {
    // inverted, scaled image point on the (rotated) sensor screen
    const local = new THREE.Vector3(0.05, -(y - LENS_Y) * 0.32, z * 0.32).applyQuaternion(q);
    const img = local.add(sensor.position).setY(LENS_Y - (y - LENS_Y) * 0.32);
    dots[si * 3] = img.x; dots[si * 3 + 1] = img.y; dots[si * 3 + 2] = img.z;
    for (let r = 0; r < RAY_FAN; r++) {
      const th = (r / RAY_FAN) * Math.PI * 2 + 0.4;
      const oy = Math.cos(th) * a, oz = Math.sin(th) * a;
      const front = [0.95, LENS_Y + oy, oz];
      const rear = [-3.55, LENS_Y + oy * 0.7, oz * 0.7];
      const seg = [[fx, y, z], front, front, rear, rear, [img.x, img.y, img.z]];
      for (const v of seg) { pos[k++] = v[0]; pos[k++] = v[1]; pos[k++] = v[2]; }
    }
  });
  rayGeo.attributes.position.needsUpdate = true;
  sensorDots.geometry.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- depth of field pass
function makeRT(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  rt.depthTexture = new THREE.DepthTexture(w, h);
  return rt;
}
const DOF_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOF_FS = `
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 projInv; uniform mat4 viewInv;
uniform float focusX, halfZone, blurK, maxR, maskStart;
uniform vec2 texel; uniform vec3 camPos; uniform float refDist;
varying vec2 vUv;
vec3 worldAt(vec2 uv, float d){ vec4 v = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; return (viewInv * v).xyz; }
float cocAt(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  if (d >= 1.0) return maxR;
  vec3 w = worldAt(uv, d);
  float mask = smoothstep(maskStart - 0.25, maskStart + 0.25, w.x);
  float persp = clamp(refDist / max(distance(w, camPos), 0.3), 0.25, 2.5);
  return min(max(abs(w.x - focusX) - halfZone, 0.0) * blurK * mask * persp, maxR);
}
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  float c0 = cocAt(vUv);
  vec4 base = texture2D(tColor, vUv);
  vec3 acc = base.rgb; float wsum = 1.0;
  if (c0 > 0.6) {
    const int N = 48;
    for (int i = 1; i < N; i++) {
      float fi = float(i);
      float r = sqrt(fi / float(N));
      float th = fi * 2.39996323;
      vec2 off = vec2(cos(th), sin(th)) * r * c0;
      vec2 uv = vUv + off * texel;
      float cs = cocAt(uv);
      float w = smoothstep(r * c0 - 1.5, r * c0 + 0.5, cs);
      vec3 s = texture2D(tColor, uv).rgb;
      float lum = dot(s, vec3(0.299, 0.587, 0.114));
      w *= 1.0 + lum * lum * 1.6; // bokeh highlights bloom
      acc += s * w; wsum += w;
    }
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
  gl_FragDepth = d0;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function dofMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null },
      projInv: { value: new THREE.Matrix4() }, viewInv: { value: new THREE.Matrix4() },
      focusX: U.focusX, halfZone: { value: 0.02 }, blurK: { value: 30 }, maxR: { value: 22 }, maskStart: { value: 1.4 },
      texel: { value: new THREE.Vector2() }, camPos: { value: new THREE.Vector3() }, refDist: { value: 4 },
    },
    vertexShader: DOF_VS, fragmentShader: DOF_FS,
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
  });
}
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function makeQuad(mat) {
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  q.frustumCulled = false;
  const s = new THREE.Scene(); s.add(q); return s;
}
const dofMain = dofMaterial();
const dofLens = dofMaterial();
const quadMain = makeQuad(dofMain);
const quadLens = makeQuad(dofLens);
let rtMain;
function sizeMain() {
  const w = Math.floor(innerWidth * DPR), h = Math.floor(innerHeight * DPR);
  if (rtMain) { rtMain.depthTexture.dispose(); rtMain.dispose(); }
  rtMain = makeRT(w, h);
  dofMain.uniforms.texel.value.set(1 / w, 1 / h);
}
sizeMain();
const LW = 768, LH = 432;
const rtLens = makeRT(LW, LH);
const rtLensOut = new THREE.WebGLRenderTarget(LW, LH, { type: THREE.HalfFloatType });
dofLens.uniforms.texel.value.set(1 / LW, 1 / LH);
sensorScreen.material.map = rtLensOut.texture;
sensorScreen.material.needsUpdate = true;
const lensCam = new THREE.PerspectiveCamera(30, LW / LH, 0.05, 30);
lensCam.position.set(1.0, LENS_Y + 0.05, 0);
lensCam.lookAt(7, 1.1, 0);

function blurScale(N, h) { return (38 / N) * (h / 900); }

function renderFrame() {
  const N = S.fstopShown;
  const halfZone = (sharpZoneCm(S.focusCm, N) / 20) / 2;
  U.zone.value = halfZone * 2;

  // Lens camera → sensor screen (no peaking in the "photo")
  U.band.value = 0;
  renderer.setRenderTarget(rtLens);
  renderer.render(scene, lensCam);
  dofLens.uniforms.tColor.value = rtLens.texture;
  dofLens.uniforms.tDepth.value = rtLens.depthTexture;
  dofLens.uniforms.projInv.value.copy(lensCam.projectionMatrixInverse);
  dofLens.uniforms.viewInv.value.copy(lensCam.matrixWorld);
  dofLens.uniforms.halfZone.value = halfZone;
  dofLens.uniforms.camPos.value.copy(lensCam.position);
  dofLens.uniforms.refDist.value = 4;
  dofLens.uniforms.blurK.value = blurScale(N, LH) * 1.2;
  dofLens.uniforms.maxR.value = 16;
  dofLens.uniforms.maskStart.value = 1.2;
  renderer.setRenderTarget(rtLensOut);
  renderer.render(quadLens, quadCam);

  // Main view
  U.band.value = S.peaking ? 1 : 0;
  camera.layers.set(0);
  renderer.setRenderTarget(rtMain);
  renderer.render(scene, camera);
  const u = dofMain.uniforms;
  u.tColor.value = rtMain.texture; u.tDepth.value = rtMain.depthTexture;
  u.projInv.value.copy(camera.projectionMatrixInverse);
  u.viewInv.value.copy(camera.matrixWorld);
  u.halfZone.value = halfZone;
  u.camPos.value.copy(camera.position);
  u.refDist.value = 4.5;
  const h = rtMain.height;
  u.blurK.value = blurScale(N, h) * (viewfinderOn ? 1.25 : 1);
  u.maxR.value = Math.min(26, 26 * (h / 900) + 6);
  u.maskStart.value = viewfinderOn ? 1.0 : 1.4;
  renderer.setRenderTarget(null);
  renderer.render(quadMain, quadCam);
  // Overlays, depth-tested against the scene depth written by the DOF pass
  // (a Color background force-clears even with autoClear off, so drop it here)
  camera.layers.set(HELPER);
  const bg = scene.background;
  scene.background = null;
  renderer.autoClear = false;
  renderer.render(scene, camera);
  renderer.autoClear = true;
  scene.background = bg;
  camera.layers.enableAll();
}

// ---------------------------------------------------------------- labels
const labelsEl = $("#labels");
const tags = [];
function tag(text, getPos, hot = false, below = false) {
  const el = document.createElement("div");
  el.className = "tag" + (hot ? " hot" : "") + (below ? " below" : "");
  el.textContent = text;
  labelsEl.appendChild(el);
  const t = { el, getPos, text, below };
  tags.push(t); return t;
}
const tFocusRing = tag("Focusing ring · drag me", () => new THREE.Vector3(0.05, LENS_Y + 0.85, 0.2), true);
const tPlane = tag("Plane of focus", () => new THREE.Vector3(U.focusX.value, 3.05, 0));
const tZone = tag("Sharp zone", () => new THREE.Vector3(U.focusX.value, 0.3, 1.6));
tag("Image plane", () => sensorCenter.clone().add(new THREE.Vector3(0, 0.6, 0)));
const tIris = tag("Iris", () => new THREE.Vector3(irisX, LENS_Y + 0.7, 0));
tag("Moving group", () => elements[4].group.position.clone().add(new THREE.Vector3(0, -0.66, 0)), false, true);
const tCabin = tag("Cabin · 60 cm", () => new THREE.Vector3(3.8, 1.05, 0.15));
const _v = new THREE.Vector3();
function updateLabels() {
  if (!S.labels || viewfinderOn) { labelsEl.classList.add("off"); return; }
  labelsEl.classList.remove("off");
  const w = innerWidth, h = innerHeight;
  for (const t of tags) {
    _v.copy(t.getPos()).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    t.el.style.opacity = vis ? 1 : 0;
    if (vis) t.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, ${t.below ? "30%" : "-130%"})`;
  }
}

// ---------------------------------------------------------------- lens state
function applyLens(dt) {
  const k = 1 - Math.exp(-dt * 7);
  S.focusCm = lerp(S.focusCm, S.focusTarget, k);
  S.fstopShown = lerp(S.fstopShown, S.fstop, k);
  S.explode = lerp(S.explode, S.explodeTarget, 1 - Math.exp(-dt * 3.5));
  U.focusX.value = cmToX(S.focusCm);

  // Thin lens: the focus group travels f²/(d−f) — more as the subject gets close.
  const shift = (25 / (S.focusCm - 5)) * 0.28;
  elements.forEach((e) => {
    const spread = (e.i - 3) * 0.32 * S.explode;
    e.group.position.x = e.base + spread + (e.focus ? shift : 0);
    e.group.position.y = LENS_Y + Math.sin(e.i * 1.3) * 0.08 * S.explode;
  });
  const ringAngle = ((S.focusCm - 20) / 100) * Math.PI * 1.1;
  focusRing.rotation.x = ringAngle;
  gearRing.rotation.x = -ringAngle * 0.94;
  const irisTarget = Math.round(S.fstopShown * 10) / 10;
  if (irisTarget !== applyLens.lastIris) { setIris(irisTarget); applyLens.lastIris = irisTarget; }

  focusPlane.position.x = U.focusX.value;
  const zoneMesh = focusPlane.getObjectByName("zone");
  zoneMesh.scale.x = Math.max(U.zone.value, 0.01);
  rays.visible = sensorDots.visible = S.rays && !viewfinderOn;
  focusPlane.visible = !viewfinderOn;
  if (S.rays) updateRays();
}

function subjectInFocus() {
  const fx = U.focusX.value, hz = U.zone.value / 2 + 0.03;
  const hits = objects.filter((o) => fx + hz >= o.x0 && fx - hz <= o.x1);
  // Prefer the most specific (narrowest) hit — the cabin over the valley.
  hits.sort((a, b) => (a.x1 - a.x0) - (b.x1 - b.x0));
  return hits[0] || null;
}

const fmtCm = (cm) => (cm >= 10 ? cm.toFixed(0) : cm.toFixed(1)) + " cm";
const fmtN = (n) => "f/" + (Math.abs(n - 5.6) < 0.05 ? "5.6" : String(Math.round(n * 10) / 10));
let lastStory = "";
function updateReadouts() {
  const zone = sharpZoneCm(S.focusCm, S.fstop);
  const zoneTxt = zone < 10 ? zone.toFixed(1) + " cm" : zone.toFixed(0) + " cm";
  $("#r-focus").textContent = fmtCm(S.focusTarget);
  $("#r-fstop").textContent = fmtN(S.fstop);
  $("#r-zone").textContent = zoneTxt;
  $("#focus-val").textContent = fmtCm(S.focusTarget);
  const slider = $("#focus");
  if (document.activeElement !== slider) slider.value = S.focusTarget;
  tPlane.el.textContent = `Plane of focus · ${fmtCm(S.focusCm)}`;
  tZone.el.textContent = `Sharp zone · ${zoneTxt}`;
  tIris.el.textContent = `Iris · ${fmtN(S.fstopShown)}`;
  $("#vf-read").textContent = `${fmtN(S.fstop)} · ${fmtCm(S.focusTarget)} · ${S.peaking ? "peaking on" : "peaking off"}`;

  const sub = subjectInFocus();
  let story;
  if (!sub) {
    story = `Focused on <b>${fmtCm(S.focusCm)}</b> of empty air. Nothing in the valley sits on the plane, so everything lands on the glass as a disc: <b>all soft</b>.`;
  } else {
    const others = objects.filter((o) => o !== sub && !(sub.name === "the cabin" && o.name === "the valley pines")).map((o) => o.name.replace("the ", ""));
    story = `Only <b>${sub.name}</b> sits on the plane. Its rays meet in one point on the glass. The ${others.slice(0, 2).join(" and the ")} land as discs, so they blur. Sharp zone: <b>${zoneTxt}</b>.`;
  }
  if (story !== lastStory) { $("#story").innerHTML = story; lastStory = story; }
  tCabin.el.classList.toggle("hot", sub && sub.name === "the cabin");
}

// ---------------------------------------------------------------- director
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const path = (a, b, ta, tb, fovA = 38, fovB = fovA) => (t) => {
  const e = ease(t);
  return { pos: a.clone().lerp(b, e), tgt: ta.clone().lerp(tb, e), fov: lerp(fovA, fovB, e) };
};
const orbit = (c, r0, r1, a0, a1, y0, y1, fov = 38) => (t) => {
  const e = ease(t), a = lerp(a0, a1, e), r = lerp(r0, r1, e);
  return { pos: V(c.x + Math.cos(a) * r, lerp(y0, y1, e), c.z + Math.sin(a) * r), tgt: c.clone(), fov };
};
const SHOTS = [
  { name: "Establishing", sub: "Wide · three-quarter", dur: 7,
    cam: path(V(-2.5, 4.6, 11.5), V(0.8, 3.6, 9.8), V(0.3, 0.9, 0), V(0.8, 0.9, 0)),
    lens: (t) => ({ focus: 38, fstop: 2, explode: 0 }) },
  { name: "Exploded view", sub: "Orbit · lens", dur: 7,
    cam: orbit(V(-1.4, 0.8, 0), 5.2, 3.6, 1.1, 0.35, 2.6, 1.6, 40),
    lens: (t) => ({ focus: 38, fstop: 2, explode: t > 0.15 ? 1 : 0 }) },
  { name: "Glass macro", sub: "Dolly · elements", dur: 7,
    cam: path(V(-4.6, 2.1, 3.4), V(0.4, 1.8, 3.6), V(-3.0, 0.7, 0), V(0.0, 0.7, 0), 36, 32),
    lens: (t) => ({ focus: lerp(30, 90, ease(t)), fstop: 2, explode: 1 }) },
  { name: "Plan view", sub: "Top-down · rays", dur: 7,
    cam: path(V(0.6, 11.5, 2.2), V(1.4, 10.5, 0.6), V(0.6, 0, 0), V(1.4, 0, 0), 42),
    lens: (t) => ({ focus: lerp(25, 110, ease(t)), fstop: 2, explode: 0.4 }) },
  { name: "Through the plane", sub: "Fly-through · diorama", dur: 8,
    cam: path(V(1.4, 2.1, 4.0), V(5.0, 2.3, 3.8), V(3.0, 0.9, 0), V(5.8, 1.2, 0), 40),
    lens: (t) => ({ focus: lerp(28, 95, ease(t)), fstop: 2, explode: 0 }) },
  { name: "Rack focus", sub: "Locked-off · pull", dur: 8,
    cam: path(V(3.7, 1.9, 5.3), V(3.95, 1.8, 5.1), V(3.9, 0.85, 0), V(4.0, 0.9, 0), 42),
    lens: (t) => ({ focus: t < 0.33 ? 30 : t < 0.66 ? 60 : 100, fstop: 2, explode: 0 }) },
  { name: "Viewfinder", sub: "Sensor POV · peaking", dur: 8, viewfinder: true,
    cam: path(V(1.0, 1.35, 0), V(1.1, 1.35, 0), V(7, 1.05, 0), V(7, 1.05, 0), 38),
    lens: (t) => ({ focus: t < 0.5 ? 60 : 100, fstop: t < 0.75 ? 2 : 16, explode: 0 }) },
  { name: "Crane out", sub: "Pull back · assemble", dur: 7,
    cam: path(V(-3.5, 2.2, 5.5), V(-5.5, 7.5, 13.5), V(-1.2, 0.8, 0), V(0.8, 0.8, 0), 40),
    lens: (t) => ({ focus: 38, fstop: t < 0.3 ? 16 : 2, explode: 0 }) },
];
const TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);
SHOTS.forEach((s, i) => { s.start = SHOTS.slice(0, i).reduce((a, x) => a + x.dur, 0); });

const director = { playing: !REDUCED, idx: 0, t: 0 };
let viewfinderOn = false;
const prevCamPos = new THREE.Vector3().copy(camera.position);

function poseCamera(shot, t) {
  const p = shot.cam(clamp(t, 0, 1));
  camera.position.copy(p.pos);
  camTarget.copy(p.tgt);
  camera.lookAt(camTarget);
  const fov = p.fov * (camera.aspect < 0.9 ? 1.5 : 1); // portrait phones: keep the shot's width
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
function applyShotLens(shot, t, snap = false) {
  const l = shot.lens(clamp(t, 0, 1));
  S.focusTarget = l.focus; S.fstop = l.fstop; S.explodeTarget = l.explode;
  if (snap) { S.focusCm = l.focus; S.fstopShown = l.fstop; S.explode = l.explode; }
  syncButtons();
}
function cutTo(i, { keepPlaying = true } = {}) {
  director.idx = (i + SHOTS.length) % SHOTS.length;
  director.t = 0;
  const cut = $("#cut");
  cut.classList.add("on"); requestAnimationFrame(() => requestAnimationFrame(() => cut.classList.remove("on")));
  CX.onCut();
  const shot = SHOTS[director.idx];
  if (!director.playing && !keepPlaying) {
    poseCamera(shot, 0.5);
    applyShotLens(shot, 0.5);
    controls.target.copy(camTarget);
  }
  updateFilm();
}
function setPlaying(p) {
  director.playing = p;
  controls.enabled = !p;
  if (!p) { controls.target.copy(camTarget); controls.update(); }
  const b = $("#play");
  b.textContent = p ? "❚❚" : "▶";
  b.classList.toggle("paused", !p);
  b.setAttribute("aria-label", p ? "Pause director" : "Play director");
  $("#cx-mode").textContent = p ? "Director" : "Free cam";
  canvas.classList.toggle("grab", !p);
}
function userTookOver() { if (director.playing) setPlaying(false); }

// ---------------------------------------------------------------- filmstrip
const film = $("#film");
const shotEls = SHOTS.map((s, i) => {
  const b = document.createElement("button");
  b.className = "shot";
  b.setAttribute("aria-label", `Shot ${i + 1}: ${s.name}`);
  b.innerHTML = `<canvas width="192" height="108"></canvas><span class="prog"></span><span class="score"></span><span class="meta"><b>${String(i + 1).padStart(2, "0")}</b>${s.name}</span>`;
  b.addEventListener("click", () => { cutTo(i, { keepPlaying: false }); if (!director.playing) { poseCamera(s, 0.5); applyShotLens(s, 0.5); controls.target.copy(camTarget); } });
  film.appendChild(b);
  return b;
});
const scrub = $("#cx-scrub");
SHOTS.forEach((s) => { const m = document.createElement("i"); m.style.left = (s.start / TOTAL) * 100 + "%"; scrub.appendChild(m); });
scrub.addEventListener("click", (e) => {
  const r = scrub.getBoundingClientRect();
  const t = clamp((e.clientX - r.left) / r.width, 0, 0.999) * TOTAL;
  const i = SHOTS.findIndex((s) => t >= s.start && t < s.start + s.dur);
  cutTo(i); director.t = t - SHOTS[i].start;
  if (!director.playing) setPlaying(true);
});
function updateFilm() {
  shotEls.forEach((el, i) => {
    el.setAttribute("aria-current", i === director.idx ? "true" : "false");
    el.querySelector(".prog").style.width = i === director.idx ? (director.t / SHOTS[i].dur) * 100 + "%" : "0";
  });
  const cur = shotEls[director.idx];
  const tr = film.getBoundingClientRect(), cr = cur.getBoundingClientRect();
  if (cr.left < tr.left || cr.right > tr.right) film.scrollLeft += cr.left - tr.left - tr.width / 2 + cr.width / 2;
}
function renderThumbs() {
  const saved = { pos: camera.position.clone(), fov: camera.fov, tgt: camTarget.clone(), f: S.focusCm, ft: S.focusTarget, n: S.fstop, ns: S.fstopShown, e: S.explode, et: S.explodeTarget };
  SHOTS.forEach((s, i) => {
    poseCamera(s, 0.5);
    applyShotLens(s, 0.5, true);
    viewfinderOn = !!s.viewfinder;
    applyLens(0);
    const lbl = S.labels; S.labels = false;
    renderFrame();
    S.labels = lbl;
    const c = shotEls[i].querySelector("canvas");
    const g = c.getContext("2d");
    const src = renderer.domElement;
    const sw = src.width, sh = src.height, want = sw / sh > 16 / 9 ? [sh * 16 / 9, sh] : [sw, sw * 9 / 16];
    g.drawImage(src, (sw - want[0]) / 2, (sh - want[1]) / 2, want[0], want[1], 0, 0, c.width, c.height);
  });
  viewfinderOn = false;
  camera.position.copy(saved.pos); camTarget.copy(saved.tgt); camera.fov = saved.fov; camera.updateProjectionMatrix(); camera.lookAt(camTarget);
  Object.assign(S, { focusCm: saved.f, focusTarget: saved.ft, fstop: saved.n, fstopShown: saved.ns, explode: saved.e, explodeTarget: saved.et });
  syncButtons();
}

// ---------------------------------------------------------------- CinematicX
const METRICS = [
  { key: "attention", name: "Attention" },
  { key: "emotion", name: "Emotion" },
  { key: "reward", name: "Reward" },
  { key: "memory", name: "Memory" },
  { key: "effort", name: "Effort" },
  { key: "purchase", name: "Purchase intent" },
];
const CX = (() => {
  const grid = $("#cx-grid");
  const tiles = {};
  METRICS.forEach((m) => {
    const el = document.createElement("div");
    el.className = "cx-tile";
    el.innerHTML = `<h3>${m.name}</h3><div class="v"><span>0</span><small>/100</small></div><div class="bar"><i></i></div><div class="d"><span class="pct">0%</span><span class="delta">vs avg —</span></div>`;
    grid.appendChild(el);
    tiles[m.key] = { v: el.querySelector(".v span"), bar: el.querySelector(".bar i"), pct: el.querySelector(".pct"), delta: el.querySelector(".delta") };
  });
  const session = "CX-" + String(Math.floor(10000 + Math.random() * 89999));
  $("#cx-session").textContent = session;
  const BIN = 0.5, BINS = Math.ceil(TOTAL / BIN);
  let heat = new Array(BINS).fill(null);
  let samples = []; // current take
  let lastTake = null;
  const val = Object.fromEntries(METRICS.map((m) => [m.key, 50]));
  const sums = Object.fromEntries(METRICS.map((m) => [m.key, 0]));
  let nSum = 0;
  let novelty = 1, lockPulse = 0, lastSubject = null, acc = 0, lastBin = -1;
  const shotScores = SHOTS.map(() => ({ n: 0, a: 0 }));
  const hc = $("#cx-heat"), hg = hc.getContext("2d");
  const proj = new THREE.Vector3();
  const lensC = new THREE.Vector3(-1.4, LENS_Y, 0), cabinC = new THREE.Vector3(3.8, 0.55, 0.15);
  function onScreen(p) {
    proj.copy(p).project(camera);
    return proj.z < 1 && Math.abs(proj.x) < 0.95 && Math.abs(proj.y) < 0.95 ? 1 - Math.max(Math.abs(proj.x), Math.abs(proj.y)) * 0.5 : 0;
  }
  function tick(dt, speed) {
    novelty *= Math.exp(-dt / 2.5);
    lockPulse *= Math.exp(-dt / 1.5);
    const sub = subjectInFocus();
    if (sub && sub !== lastSubject) lockPulse = 1;
    lastSubject = sub;
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    const motion = clamp(speed / 2.5, 0, 1);
    const has = sub ? 1 : 0;
    const wide = 2 / S.fstopShown; // 1 at f/2
    const cabin = onScreen(cabinC) * (sub && sub.name === "the cabin" ? 1.4 : 0.8);
    const lensVis = onScreen(lensC) * clamp(8 / camera.position.distanceTo(lensC), 0, 1.2);
    const bokeh = has * wide;
    const n = () => (Math.random() - 0.5) * 3;
    const raw = {
      attention: 38 + 26 * motion + 24 * novelty + 10 * has + n(),
      emotion: 34 + 26 * cabin + 22 * bokeh + (viewfinderOn ? 8 : 0) + n(),
      reward: 28 + 44 * lockPulse + 14 * has + 6 * S.explode + n(),
      memory: 30 + 18 * novelty + 16 * has + 14 * S.explode + (viewfinderOn ? 10 : 0) + n(),
      effort: 18 + 42 * (1 - has) * wide + 18 * motion + n(),
      purchase: 18 + 38 * lensVis + 14 * lockPulse + 8 * S.explode + n(),
    };
    for (const m of METRICS) val[m.key] = clamp(lerp(val[m.key], raw[m.key], 0.18), 0, 100);
    for (const m of METRICS) sums[m.key] += val[m.key];
    nSum++;
    draw();
    if (!director.playing) return;
    const gt = SHOTS[director.idx].start + director.t;
    const bin = Math.floor(gt / BIN);
    if (bin < lastBin - 2) newTake();
    if (bin !== lastBin && bin < BINS) {
      heat[bin] = { ...val };
      samples.push({ t: +(bin * BIN).toFixed(1), shot: SHOTS[director.idx].name, ...Object.fromEntries(METRICS.map((m) => [m.key, +val[m.key].toFixed(1)])) });
      lastBin = bin;
      const sc = shotScores[director.idx];
      sc.n++; sc.a += (val.attention + val.emotion + val.reward + val.memory + val.purchase - val.effort * 0.5) / 4.5;
      const scoreEl = shotEls[director.idx].querySelector(".score");
      scoreEl.textContent = "CX " + Math.round(sc.a / sc.n);
      scoreEl.classList.add("on");
      drawHeat(gt);
    }
  }
  function newTake() {
    if (samples.length) lastTake = samples;
    samples = []; heat = new Array(BINS).fill(null); lastBin = -1;
    shotScores.forEach((s) => { s.n = 0; s.a = 0; });
  }
  function draw() {
    for (const m of METRICS) {
      const t = tiles[m.key], v = val[m.key];
      t.v.textContent = Math.round(v);
      t.bar.style.width = v + "%";
      t.pct.textContent = Math.round(v) + "%";
      const avg = sums[m.key] / Math.max(1, nSum);
      const d = ((v - avg) / Math.max(1, avg)) * 100;
      t.delta.textContent = `${d >= 0 ? "↗ +" : "↘ "}${d.toFixed(1)}%`;
      t.delta.className = "delta " + (d >= 0 ? "up" : "down");
    }
  }
  function drawHeat(gt = 0) {
    const W = hc.width, H = hc.height, left = 118, top = 6, bottom = 22;
    const rowH = (H - top - bottom) / METRICS.length;
    hg.clearRect(0, 0, W, H);
    hg.font = "600 15px JetBrains Mono, monospace"; hg.textBaseline = "middle";
    METRICS.forEach((m, r) => {
      hg.fillStyle = "#f4cfe2";
      hg.fillText("• " + (m.key === "purchase" ? "INTENT" : m.name.toUpperCase()), 0, top + rowH * r + rowH / 2);
      hg.fillStyle = "rgba(255,255,255,.04)";
      hg.fillRect(left, top + rowH * r + 2, W - left, rowH - 4);
    });
    const bw = (W - left) / BINS;
    heat.forEach((h, b) => {
      if (!h) return;
      METRICS.forEach((m, r) => {
        const v = h[m.key] / 100;
        hg.fillStyle = `rgba(255, ${Math.round(95 + v * 120)}, ${Math.round(180 + v * 40)}, ${0.15 + v * v * 0.95})`;
        hg.fillRect(left + b * bw, top + rowH * r + 3, Math.max(1, bw - 0.6), rowH - 6);
      });
    });
    // shot boundaries + playhead + axis
    hg.fillStyle = "rgba(255,255,255,.18)";
    SHOTS.forEach((s) => hg.fillRect(left + (s.start / TOTAL) * (W - left), top, 1, H - top - bottom));
    hg.fillStyle = "#ffffff";
    hg.fillRect(left + (gt / TOTAL) * (W - left), top, 2, H - top - bottom);
    hg.fillStyle = "#b7a3b0"; hg.font = "500 13px JetBrains Mono, monospace"; hg.textAlign = "center";
    for (let s = 0; s <= TOTAL; s += 9) hg.fillText(s + "s", left + (s / TOTAL) * (W - left - 14) + 7, H - 9);
    hg.textAlign = "left";
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function take() { return samples.length >= (lastTake ? lastTake.length : 0) ? samples : lastTake; }
  $("#cx-csv").addEventListener("click", () => {
    const rows = take() || [];
    const head = ["time_s", "shot", ...METRICS.map((m) => m.key)];
    const csv = [head.join(","), ...rows.map((r) => [r.t, `"${r.shot}"`, ...METRICS.map((m) => r[m.key])].join(","))].join("\n");
    download(`${session}-optics-lab.csv`, csv, "text/csv");
  });
  $("#cx-report").addEventListener("click", () => {
    const rows = take() || [];
    const byShot = SHOTS.map((s) => {
      const r = rows.filter((x) => x.shot === s.name);
      const avg = Object.fromEntries(METRICS.map((m) => [m.key, r.length ? r.reduce((a, x) => a + x[m.key], 0) / r.length : NaN]));
      return { s, avg, n: r.length };
    });
    const best = (k, dir = 1) => byShot.filter((b) => b.n).sort((a, b) => dir * (b.avg[k] - a.avg[k]))[0];
    let md = `# CinematicX report — Optics Lab\n\nSession ${session} · Model v2.1 · ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n\n`;
    md += `Signals are simulated from what is on screen (camera motion, cuts, what the plane of focus is holding, aperture, product visibility). They are not biometric measurements.\n\n`;
    md += `| Shot | ${METRICS.map((m) => m.name).join(" | ")} |\n|---|${METRICS.map(() => "---:").join("|")}|\n`;
    byShot.forEach(({ s, avg, n }) => { md += `| ${s.name} | ${METRICS.map((m) => (n ? avg[m.key].toFixed(0) : "–")).join(" | ")} |\n`; });
    const lines = [["attention", "Most attention"], ["emotion", "Most emotion"], ["purchase", "Highest purchase intent"]].map(([k, l]) => { const b = best(k); return b ? `- ${l}: **${b.s.name}** (${b.avg[k].toFixed(0)})` : null; }).filter(Boolean);
    const e = best("effort", -1);
    if (e) lines.push(`- Lowest viewer effort: **${e.s.name}** (${e.avg.effort.toFixed(0)})`);
    md += `\n## Highlights\n\n${lines.join("\n") || "- Play the director tour to collect a take."}\n`;
    download(`${session}-optics-lab-report.md`, md, "text/markdown");
  });
  drawHeat();
  return { tick, onCut: () => { novelty = 1; }, drawHeat };
})();

// ---------------------------------------------------------------- UI wiring
function syncButtons() {
  document.querySelectorAll("[data-fstop]").forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.fstop - S.fstop) < 0.01)));
  document.querySelectorAll("[data-explode]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.explode === Math.round(S.explodeTarget))));
  document.querySelectorAll("[data-focus]").forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.focus - S.focusTarget) < 0.5)));
}
$("#focus").addEventListener("input", (e) => { userTookOver(); S.focusTarget = +e.target.value; syncButtons(); });
document.querySelectorAll("[data-focus]").forEach((b) => b.addEventListener("click", () => { userTookOver(); S.focusTarget = +b.dataset.focus; syncButtons(); }));
document.querySelectorAll("[data-fstop]").forEach((b) => b.addEventListener("click", () => { userTookOver(); S.fstop = +b.dataset.fstop; syncButtons(); }));
document.querySelectorAll("[data-explode]").forEach((b) => b.addEventListener("click", () => { userTookOver(); S.explodeTarget = +b.dataset.explode; syncButtons(); }));
$("#t-labels").addEventListener("change", (e) => { S.labels = e.target.checked; });
$("#t-rays").addEventListener("change", (e) => { S.rays = e.target.checked; });
$("#t-peak").addEventListener("change", (e) => { S.peaking = e.target.checked; });
$("#play").addEventListener("click", () => setPlaying(!director.playing));
$("#prev").addEventListener("click", () => cutTo(director.idx - 1, { keepPlaying: false }));
$("#next").addEventListener("click", () => cutTo(director.idx + 1, { keepPlaying: false }));
const toggle = (btn, panel) => $(btn).addEventListener("click", () => {
  const open = !$(panel).classList.contains("open");
  $(panel).classList.toggle("open", open);
  $(btn).setAttribute("aria-expanded", String(open));
});
toggle("#cx-toggle", "#cx");
$("#cx-toggle").addEventListener("click", () => setTimeout(frameGap, 320));
const setCinema = (on) => {
  document.body.classList.toggle("cinema", on);
  $("#cinema").setAttribute("aria-pressed", String(on));
  $("#cinema").textContent = on ? "Show HUD" : "Hide HUD";
  frameGap();
};
$("#cinema").addEventListener("click", () => setCinema(!document.body.classList.contains("cinema")));
toggle("#ctl-toggle", "#controls");

addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.key === " ") { e.preventDefault(); setPlaying(!director.playing); }
  else if (e.key === "ArrowRight") cutTo(director.idx + 1, { keepPlaying: false });
  else if (e.key === "ArrowLeft") cutTo(director.idx - 1, { keepPlaying: false });
  else if (e.key === "1" || e.key === "2" || e.key === "3") { userTookOver(); S.focusTarget = [30, 60, 100][+e.key - 1]; syncButtons(); }
  else if (e.key.toLowerCase() === "e") { userTookOver(); S.explodeTarget = S.explodeTarget > 0.5 ? 0 : 1; syncButtons(); }
  else if (e.key.toLowerCase() === "h") setCinema(!document.body.classList.contains("cinema"));
  else if (e.key.toLowerCase() === "f") { userTookOver(); S.fstop = S.fstop === 2 ? 5.6 : S.fstop === 5.6 ? 16 : 2; syncButtons(); }
});

// Drag the focusing ring
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let ringDrag = null;
canvas.addEventListener("pointerdown", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.layers.set(0);
  const hit = ray.intersectObjects([focusRing, gearRing], true)[0];
  if (hit) {
    userTookOver();
    ringDrag = { x: e.clientX, y: e.clientY, f: S.focusTarget };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("grabbing");
    e.stopPropagation();
  } else if (director.playing) {
    userTookOver();
  }
}, { capture: true });
canvas.addEventListener("pointermove", (e) => {
  if (!ringDrag) {
    if (!director.playing && e.buttons === 0) {
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      canvas.style.cursor = ray.intersectObjects([focusRing, gearRing], true).length ? "ew-resize" : "";
    }
    return;
  }
  const d = (e.clientX - ringDrag.x) - (e.clientY - ringDrag.y);
  S.focusTarget = clamp(ringDrag.f + d * 0.25, 20, 120);
  syncButtons();
});
const endDrag = () => { if (ringDrag) { ringDrag = null; controls.enabled = !director.playing; canvas.classList.remove("grabbing"); } };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// Seedance dialog
const dlg = $("#seedance");
$("#seedance-btn").addEventListener("click", () => {
  userTookOver();
  const v = $("#seedance-video");
  const last = v.querySelector("source:last-of-type");
  last.onerror = () => { $("#seedance-note").textContent = "Couldn't load the Seedance clip. Drop it in at media/seedance-optics-lab.mp4."; };
  dlg.showModal(); v.play().catch(() => {});
});
$("#seedance-close").addEventListener("click", () => dlg.close());
dlg.addEventListener("close", () => $("#seedance-video").pause());

// Centre the 3D image in the clear gap between the HUD panels.
function frameGap() {
  const W = innerWidth, H = innerHeight;
  const cinema = document.body.classList.contains("cinema");
  const left = $(".col-left"), cx = $("#cx");
  let l = 0, r = W;
  if (!cinema && W > 760) {
    l = left.getBoundingClientRect().right;
    const cr = cx.getBoundingClientRect();
    if (cr.left < W - 4 && cr.left > W / 2) r = cr.left;
  }
  const shift = Math.round((l + r) / 2 - W / 2);
  if (shift) camera.setViewOffset(W, H, -shift, 0, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  document.documentElement.style.setProperty("--gap-l", l + "px");
  document.documentElement.style.setProperty("--gap-r", W - r + "px");
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; frameGap();
  renderer.setSize(innerWidth, innerHeight);
  sizeMain();
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (director.playing) {
    director.t += dt;
    const cur = SHOTS[director.idx];
    if (director.t >= cur.dur) { cutTo(director.idx + 1); }
    const shot = SHOTS[director.idx];
    const u = director.t / shot.dur;
    poseCamera(shot, u);
    applyShotLens(shot, u);
    viewfinderOn = !!shot.viewfinder;
  } else {
    controls.update();
    camTarget.copy(controls.target);
    viewfinderOn = false;
  }
  const speed = camera.position.distanceTo(prevCamPos) / Math.max(dt, 1e-3);
  prevCamPos.copy(camera.position);

  applyLens(dt);
  const time = clock.elapsedTime;
  for (const s of window.__shards) { s.rotation.y += dt * s.userData.spin; s.position.y = s.userData.y + Math.sin(time * 0.6 + s.userData.p) * 0.15; }

  renderFrame();
  updateLabels();
  updateReadouts();
  CX.tick(dt, speed);

  $("#viewfinder").classList.toggle("on", viewfinderOn);
  const gt = SHOTS[director.idx].start + Math.min(director.t, SHOTS[director.idx].dur);
  $("#cx-time").textContent = `${gt.toFixed(1)}s / ${TOTAL.toFixed(1)}s`;
  $("#cx-scrub-fill").style.width = (gt / TOTAL) * 100 + "%";
  $("#cx-shot").textContent = `${String(director.idx + 1).padStart(2, "0")} · ${SHOTS[director.idx].name}`;
  shotEls[director.idx].querySelector(".prog").style.width = (director.t / SHOTS[director.idx].dur) * 100 + "%";
  requestAnimationFrame(frame);
}

// Boot: compile, draw the filmstrip thumbnails, then start the tour.
frameGap();
applyShotLens(SHOTS[0], 0, true);
poseCamera(SHOTS[0], 0);
applyLens(0);
renderer.compile(scene, camera);
// ?still=<seconds> renders one frame of the tour at that time and stops
// (used for screenshots on machines without a GPU).
const STILL = new URLSearchParams(location.search).get("still");
if (STILL !== null) {
  const gt = clamp(+STILL || 0, 0, TOTAL - 0.01);
  director.idx = SHOTS.findIndex((s) => gt >= s.start && gt < s.start + s.dur);
  director.t = gt - SHOTS[director.idx].start;
  const shot = SHOTS[director.idx], u = director.t / shot.dur;
  poseCamera(shot, u); applyShotLens(shot, u, true);
  viewfinderOn = !!shot.viewfinder;
  applyLens(0); renderFrame(); updateLabels(); updateReadouts();
  for (let i = 0; i < 30; i++) CX.tick(0.1, 0.5);
  $("#viewfinder").classList.toggle("on", viewfinderOn);
  $("#cx-shot").textContent = `${String(director.idx + 1).padStart(2, "0")} · ${shot.name}`;
  $("#cx-time").textContent = `${gt.toFixed(1)}s / ${TOTAL.toFixed(1)}s`;
  $("#cx-scrub-fill").style.width = (gt / TOTAL) * 100 + "%";
  updateFilm();
  $("#boot").classList.add("done");
  window.__lab = { renderer, scene, camera, rtMain, rtLensOut, THREE };
  window.__still = true;
} else requestAnimationFrame(() => {
  renderThumbs();
  poseCamera(SHOTS[0], 0);
  applyShotLens(SHOTS[0], 0, true);
  setPlaying(director.playing);
  updateFilm();
  $("#boot").classList.add("done");
  clock.getDelta();
  requestAnimationFrame(frame);
});
