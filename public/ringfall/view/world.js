import * as THREE from 'three';
import { glowSprite } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// RINGFALL · the world. You stand on the inside of a spinning ring. The floor curves up on both sides
// into an arch that crosses the sky; retaining walls rise along the rims; a banded gas giant hangs
// beyond. A local patch of hills, a lake and angular "Builder" structures is the arena. A small spin
// station floats outside the ring for the Coriolis range.
// Visual scale: the ring is drawn with radius RV units (the physics uses the real radius).
// ─────────────────────────────────────────────────────────────────────────────

export const RV = 40000, BAND = 2600, GAP = 0.065;      // visual ring radius, width, and the angular gap the local terrain fills
export const SUN = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
export const STATION_AT = new THREE.Vector3(14000, 26000, -30000);
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, f = (t) => t * t * (3 - 2 * t); const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * f(u) + (c - a) * f(v) + (a - b - c + d) * f(u) * f(v); };
export const fbm = (x, z, o = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; };
// Floor height on the local patch: the ring's curvature plus hills, a lake and a flat arena in the middle.
export const curveY = (z) => RV - Math.sqrt(RV * RV - z * z);
export function hillY(x, z) {
  const d = Math.hypot(x, z), flat = Math.min(1, Math.max(0, (d - 70) / 160));
  let h = (fbm(x * 0.0022 + 3, z * 0.0022, 5) - 0.42) * 160 * flat + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 2;
  const lake = Math.hypot(x - 380, z + 520); if (lake < 260) h = Math.min(h, -6 + lake * 0.02);
  h += Math.max(0, Math.abs(x) - 900) * 0.35;                       // rising toward the rim walls
  const ez = Math.min(1, Math.max(0, (Math.abs(z) - 1900) / 650));   // flatten to meet the far ring at the patch ends
  return h * (1 - ez * ez * (3 - 2 * ez));
}
export const groundY = (x, z) => curveY(z) + Math.max(hillY(x, z), -6);

function bandTexture() {
  const W = 4096, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = i / W * 60, y = j / H * 4, n = fbm(x, y, 6), m = fbm(x * 3 + 9, y * 3, 4), edge = Math.min(j, H - 1 - j) / H;
    let r, gg, b;
    if (n < 0.43) { r = 40; gg = 92; b = 140; } else if (n < 0.46) { r = 196; gg = 186; b = 140; } else { r = 70 + m * 60; gg = 112 + m * 50; b = 52 + m * 20; if (m > 0.62) { r = 150; gg = 140; b = 120; } }
    const cloud = fbm(x * 1.7 + 50, y * 1.7, 5); const cl = Math.max(0, (cloud - 0.55) * 3.2);
    r = r + (240 - r) * cl; gg = gg + (244 - gg) * cl; b = b + (250 - b) * cl;
    if (edge < 0.04) { r = 130; gg = 136; b = 146; }
    const k = (j * W + i) * 4; img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); t.anisotropy = 8; return t;
}
function giantTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  for (let y = 0; y < 512; y++) { const v = y / 512, b = Math.sin(v * 38 + Math.sin(v * 9) * 2) * 0.5 + 0.5, n = fbm(1, v * 30, 3); g.fillStyle = `rgb(${Math.round(150 + 80 * b + 20 * n)},${Math.round(110 + 60 * b)},${Math.round(80 + 50 * b - 20 * n)})`; g.fillRect(0, y, 1024, 1); }
  for (let k = 0; k < 900; k++) { const x = Math.random() * 1024, y = 256 + (Math.random() - 0.5) * 420; g.fillStyle = `rgba(255,240,220,${Math.random() * 0.06})`; g.fillRect(x, y, 30 + Math.random() * 80, 1.5); }
  g.fillStyle = 'rgba(190,90,60,.7)'; g.beginPath(); g.ellipse(640, 330, 46, 20, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wallTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#8c939c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; g.fillRect(0, Math.random() * 512, 512, 2 + Math.random() * 6); }
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(120,230,255,${0.25 + Math.random() * 0.3})`; g.fillRect(0, i * 32 + 14, 512, 1.5); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(200, 3); return t;
}

export function buildWorld() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#02040a'); scene.environmentIntensity = 0.5;
  // Sky: a blue dome near the ground fading to space — drawn first, behind everything.
  const skyMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, side: THREE.BackSide, transparent: true, uniforms: { uSun: { value: SUN }, uAir: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uSun; uniform float uAir; varying vec3 vD; void main(){ float h = max(vD.y, 0.0); vec3 hor = vec3(0.42,0.56,0.74), zen = vec3(0.07,0.2,0.46); vec3 c = mix(hor, zen, pow(h, 0.5)); float s = max(dot(vD, uSun), 0.); c += vec3(1.0,0.95,0.85) * pow(s, 600.) * 6.0 + vec3(1.0,0.85,0.6) * pow(s, 12.) * 0.25; float a = uAir * (vD.y > -0.05 ? 0.7 - 0.35 * h : 0.0); gl_FragColor = vec4(c, a); }' });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  // Stars and the gas giant with its moon.
  const sp = new Float32Array(4000 * 3); for (let i = 0; i < 4000; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 300000; sp.set([Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(a) * r], i * 3); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)), new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.4, sizeAttenuation: false, fog: false })); stars.renderOrder = -11; scene.add(stars);
  const giant = new THREE.Mesh(new THREE.SphereGeometry(60000, 96, 48), new THREE.MeshStandardMaterial({ map: giantTexture(), roughness: 1, fog: false })); giant.position.set(-90000, 52000, -210000); giant.rotation.z = 0.35; scene.add(giant);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), new THREE.MeshStandardMaterial({ color: '#b9b4ac', roughness: 1, fog: false })); moon.position.set(30000, 70000, -170000); scene.add(moon);
  const sun = new THREE.DirectionalLight('#fff3e0', 2.8); sun.position.copy(SUN).multiplyScalar(2000); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 5000 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5; scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#a8c8ff', '#4a5a3a', 0.8));
  // The ring band (inner face) with a gap at the bottom where the local terrain sits.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(RV, RV, BAND, 720, 1, true, Math.PI * 1.5 + GAP, Math.PI * 2 - 2 * GAP).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: bandTexture(), roughness: 0.9, side: THREE.BackSide, fog: false }));
  band.position.set(0, RV, 0); scene.add(band);
  // Retaining walls along both rims: annuli in the ring plane, inner faces lit, with glowing seams.
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide, fog: false });
  const walls = new THREE.Group(); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.RingGeometry(RV - 1300, RV + 40, 720, 1), wallMat); w.rotation.y = Math.PI / 2; w.position.set(s * BAND / 2, RV, 0); walls.add(w); } scene.add(walls);
  // Outer hull: a darker cylinder just outside the band (seen from space).
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(RV + 60, RV + 60, BAND + 80, 360, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5a6068', roughness: 0.6, metalness: 0.7, side: THREE.FrontSide, fog: false })); hull.position.copy(band.position); scene.add(hull);
  // Local terrain patch: curved with the ring.
  const tg = new THREE.PlaneGeometry(BAND, 2 * RV * Math.sin(GAP) + 40, 200, 420).rotateX(-Math.PI / 2), tp = tg.attributes.position, cols = new Float32Array(tp.count * 3), col = new THREE.Color();
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), h = hillY(x, z), y = curveY(z) + Math.max(h, -6); tp.setY(i, y); const n = fbm(x * 0.01, z * 0.01, 3);
    if (h < -2) col.set('#3b5a4a'); else if (h < 0.5 && Math.hypot(x - 380, z + 520) < 280) col.set('#b8ad86'); else { col.set('#4f7a34').lerp(new THREE.Color('#7f9a45'), n); if (h > 70) col.lerp(new THREE.Color('#8a8d85'), Math.min(1, (h - 70) / 60)); }
    if (Math.abs(x) > BAND / 2 - 40) col.set('#7d848c'); cols.set([col.r, col.g, col.b], i * 3); }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); terrain.receiveShadow = true; scene.add(terrain);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(250, 64).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#2d6a86', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 })); lake.position.set(380, curveY(-520) - 1.2, -520); scene.add(lake);
  // Trees (instanced).
  const N = 900, crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: '#2f5a2a', roughness: 0.9, flatShading: true }), N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let k = 0; for (let i = 0; i < 4000 && k < N; i++) { const x = (Math.random() - 0.5) * 2200, z = (Math.random() - 0.5) * 4800, h = hillY(x, z); if (Math.hypot(x, z) < 160 || h < 1 || fbm(x * 0.006, z * 0.006, 2) < 0.48) continue; const sc = 6 + Math.random() * 10; crown.setMatrixAt(k++, m4.compose(v.set(x, curveY(z) + h + sc * 0.5, z), q.identity(), s.set(sc * 0.3, sc, sc * 0.3))); }
  crown.count = k; crown.castShadow = true; scene.add(crown);
  // Builder structures: angular pylons with glowing seams, and a great arch gate.
  const metal = new THREE.MeshStandardMaterial({ color: '#7c8796', roughness: 0.35, metalness: 0.85 }), glow = new THREE.MeshBasicMaterial({ color: '#7fe8ff' });
  const builder = new THREE.Group(); scene.add(builder);
  const pylon = (x, z, h, rot) => { const g = new THREE.Group(), y = groundY(x, z); g.position.set(x, y - 1, z); g.rotation.y = rot; builder.add(g);
    const shape = new THREE.Shape([new THREE.Vector2(-3, 0), new THREE.Vector2(3, 0), new THREE.Vector2(1.2, h), new THREE.Vector2(-1.8, h * 0.92)]);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2, bevelSegments: 1 }).translate(0, 0, -1.2), metal); m.castShadow = m.receiveShadow = true; g.add(m);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.15, h * 0.8, 2.6), glow); seam.position.set(0.1, h * 0.45, 0); g.add(seam); return g; };
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.3; pylon(Math.cos(a) * 120, Math.sin(a) * 120, 18 + (i % 3) * 8, -a); }
  { const g = new THREE.Group(), y = groundY(0, -230); g.position.set(0, y - 2, -230); builder.add(g);
    for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(8, 70, 8), metal); leg.position.set(sx * 34, 35, 0); leg.rotation.z = -sx * 0.12; leg.castShadow = true; g.add(leg); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(84, 8, 9), metal); top.position.y = 72; top.castShadow = true; g.add(top); const line = new THREE.Mesh(new THREE.BoxGeometry(70, 0.6, 9.4), glow); line.position.y = 66; g.add(line);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3000, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#9ff0ff', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = 1576; g.add(beam); }
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(60, 64, 1.2, 64), new THREE.MeshStandardMaterial({ color: '#5f6874', roughness: 0.8, metalness: 0.3 })); plate.position.set(0, 0.2, 0); plate.receiveShadow = true; scene.add(plate);
  const ringGlow = new THREE.Mesh(new THREE.RingGeometry(57, 58.2, 128).rotateX(-Math.PI / 2), glow); ringGlow.position.y = 0.85; scene.add(ringGlow);
  // Spin station (Coriolis range): torus + spokes + hub, radius 200 m, axis along x.
  const station = new THREE.Group(); station.position.copy(STATION_AT); scene.add(station);
  const spinner = new THREE.Group(); station.add(spinner);
  const tor = new THREE.Mesh(new THREE.TorusGeometry(194, 14, 24, 160).rotateY(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#c9ced6', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false })); spinner.add(tor);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(200.05, 200.05, 16, 360, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3d444d', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide, fog: false })); spinner.add(floor);
  for (let i = 0; i < 6; i++) { const sp2 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 190, 12), new THREE.MeshStandardMaterial({ color: '#8f97a2', metalness: 0.7, roughness: 0.4, fog: false })); sp2.position.set(0, Math.cos((i / 6) * Math.PI * 2) * 95, Math.sin((i / 6) * Math.PI * 2) * 95); sp2.rotation.x = (i / 6) * Math.PI * 2; spinner.add(sp2); }
  spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 60, 32).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 0.5, roughness: 0.3, fog: false })));
  for (let i = 0; i < 24; i++) { const l = glowSprite('#ffd27a', 10, 0.9); const a = (i / 24) * Math.PI * 2; l.position.set(9, Math.cos(a) * 214, Math.sin(a) * 214); spinner.add(l); }
  // Everything that belongs to the ring hangs from a pivot at its centre so the whole world can spin.
  const pivot = new THREE.Group(); pivot.position.set(0, RV, 0); scene.add(pivot);
  for (const o of [...scene.children]) if (![sky, stars, giant, moon, sun, sun.target, station, pivot].includes(o) && !o.isHemisphereLight) pivot.attach(o);
  return { scene, sky, skyMat, stars, giant, moon, sun, band, walls, hull, terrain, lake, builder, station, spinner, pivot };
}
