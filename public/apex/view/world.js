import * as THREE from 'three';
import { glowSprite } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// APEX · Neon Bay at night: asphalt ribbon, kerbs, neon-lit barriers, light
// towers, a harbour, a skyline, the start gantry and a pit garage.
// ─────────────────────────────────────────────────────────────────────────────

const HALF = 6.5;                      // half track width (m)
function canvasTex(w, h, draw, rx = 1, ry = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }
function ribbon(pts, offA, offB, yA, yB, close = true) {
  const n = pts.length, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], nx = -Math.sin(p.psi), nz = Math.cos(p.psi);
    pos.push(p.x + nx * offA, p.y + yA, p.z + nz * offA, p.x + nx * offB, p.y + yB, p.z + nz * offB);
    uv.push(0, (i * 2) / 10, 1, (i * 2) / 10);
    if (i < n || close) if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function buildWorld(track) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060d'); scene.fog = new THREE.FogExp2('#0a0b18', 0.0011);
  const { pts } = track;
  // Ground and harbour.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#0d0e12', roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; ground.receiveShadow = true; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1400), new THREE.MeshStandardMaterial({ color: '#06121f', roughness: 0.08, metalness: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(600, -0.3, 1700); scene.add(water);
  // Asphalt with rubbered racing line and white edge lines.
  const asphalt = canvasTex(256, 1024, (g, W, H) => {
    g.fillStyle = '#26272c'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { const l = 30 + Math.random() * 40; g.fillStyle = `rgba(${l},${l},${l + 4},.6)`; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.35)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8e8e8'; g.fillRect(4, 0, 6, H); g.fillRect(W - 10, 0, 6, H);
  }, 1, 1);
  const road = new THREE.Mesh(ribbon(pts, -HALF, HALF, 0.02, 0.02), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.55, metalness: 0.15, color: '#ffffff' }));
  road.receiveShadow = true; scene.add(road);
  // Strategy overview: a glowing neon outline of the whole lap (hidden elsewhere).
  const trackGlow = new THREE.Group();
  const glowRib = new THREE.Mesh(ribbon(pts, -18, 18, 3, 3), new THREE.MeshBasicMaterial({ color: '#ff3a58', transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
  const glowCore = new THREE.Mesh(ribbon(pts, -6, 6, 3.2, 3.2), new THREE.MeshBasicMaterial({ color: '#ffd9df', depthTest: false, side: THREE.DoubleSide }));
  glowRib.renderOrder = 5; glowCore.renderOrder = 6; trackGlow.add(glowRib, glowCore); trackGlow.visible = false; scene.add(trackGlow);
  // Kerbs in corners (red/white instanced blocks on both edges).
  const kerbPos = [];
  for (let i = 0; i < pts.length; i += 1) if (Math.abs(pts[i].k) > 1 / 140) for (const side of [-1, 1]) kerbPos.push([i, side]);
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.08, 2.1), new THREE.MeshStandardMaterial({ roughness: 0.5 }), kerbPos.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  kerbPos.forEach(([i, side], k) => { const p = pts[i], nx = -Math.sin(p.psi), nz = Math.cos(p.psi); q.setFromAxisAngle(up, -p.psi + Math.PI / 2); m4.compose(new THREE.Vector3(p.x + nx * (HALF + 0.8) * side, p.y + 0.06, p.z + nz * (HALF + 0.8) * side), q, new THREE.Vector3(1, 1, 1)); kerbs.setMatrixAt(k, m4); kerbs.setColorAt(k, c.set(Math.floor(p.s / 4) % 2 ? '#e8e8e8' : '#d0102a')); });
  scene.add(kerbs);
  // Barriers with neon strips (cyan outside, magenta inside).
  const wallMat = new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.6, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const off = side * (HALF + 5);
    scene.add(new THREE.Mesh(ribbon(pts, off, off, 0, 1.1), wallMat));
    const neon = new THREE.Mesh(ribbon(pts, off - side * 0.05, off - side * 0.05, 1.0, 1.12), new THREE.MeshBasicMaterial({ color: side > 0 ? '#22e6ff' : '#ff2fb0', side: THREE.DoubleSide }));
    scene.add(neon);
  }
  // Light towers every ~90 m, alternating sides: a pole and a glowing head.
  const towers = new THREE.Group(); scene.add(towers);
  const poleG = new THREE.CylinderGeometry(0.18, 0.25, 18, 6), poleM = new THREE.MeshStandardMaterial({ color: '#30333b', metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < pts.length; i += 45) {
    const p = pts[i], side = (i / 45) % 2 ? 1 : -1, nx = -Math.sin(p.psi), nz = Math.cos(p.psi), x = p.x + nx * (HALF + 8) * side, z = p.z + nz * (HALF + 8) * side;
    const pole = new THREE.Mesh(poleG, poleM); pole.position.set(x, p.y + 9, z); towers.add(pole);
    const head = glowSprite('#fff3dc', 9, 0.9); head.position.set(x, p.y + 18.4, z); towers.add(head);
  }
  // Floodlight wash: hemisphere + a few strong lights over the circuit.
  scene.add(new THREE.HemisphereLight('#8aa2ff', '#140a18', 0.55));
  const moon = new THREE.DirectionalLight('#c9d6ff', 0.9); moon.position.set(-400, 600, 300); scene.add(moon);
  // Skyline: instanced towers with lit windows.
  const win = canvasTex(64, 128, (g, W, H) => { g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H); for (let y = 3; y < H; y += 6) for (let x = 3; x < W; x += 6) if (Math.random() < 0.38) { g.fillStyle = Math.random() < 0.2 ? '#ff4fb0' : Math.random() < 0.3 ? '#7fe8ff' : '#ffd9a0'; g.fillRect(x, y, 3, 3); } });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#0c0d12', emissive: '#ffffff', emissiveMap: win, emissiveIntensity: 1.1, roughness: 0.6 }), 240);
  let k = 0, sd = 9; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  while (k < 240) {
    const x = -900 + rnd() * 3000, z = -1000 + rnd() * 2400; if (z > 1050) continue;
    let near = false; for (let i = 0; i < pts.length; i += 10) if (Math.hypot(pts[i].x - x, pts[i].z - z) < 70) { near = true; break; } if (near) continue;
    const h = 30 + rnd() ** 2 * 260, w = 25 + rnd() * 45; m4.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w * (0.7 + rnd() * 0.6))); city.setMatrixAt(k++, m4);
  }
  scene.add(city);
  // Start/finish gantry with red lights.
  const p0 = pts[0], gantry = new THREE.Group(); gantry.position.set(p0.x + 40, p0.y, p0.z); scene.add(gantry);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 2 * HALF + 4), new THREE.MeshStandardMaterial({ color: '#15161c', metalness: 0.7 })); beam.position.y = 7.5; gantry.add(beam);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), beam.material); leg.position.set(0, 4, s * (HALF + 2)); gantry.add(leg); }
  const lights = []; for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color: '#2a0006' })); l.position.set(-0.55, 7.5, -2.4 + i * 1.2); gantry.add(l); lights.push(l); }
  const banner = canvasTex(512, 64, (g, W, H) => { g.fillStyle = '#0b0c12'; g.fillRect(0, 0, W, H); g.fillStyle = '#ff2f4e'; g.font = '700 40px Space Grotesk, sans-serif'; g.textAlign = 'center'; g.fillText('NEON BAY  ·  APEX', W / 2, 46); });
  const bn = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshBasicMaterial({ map: banner })); bn.position.set(-0.55, 9, 0); bn.rotation.y = -Math.PI / 2; gantry.add(bn);
  // Harbour bridge arches over the back straight.
  const bridge = new THREE.Group(); scene.add(bridge);
  const peak = pts.reduce((a, b) => (b.y > a.y ? b : a));
  for (const s of [-1, 1]) {
    const nx = -Math.sin(peak.psi), nz = Math.cos(peak.psi), ax = Math.cos(peak.psi), az = Math.sin(peak.psi), pp = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40 - 0.5; pp.push(new THREE.Vector3(peak.x + ax * u * 260 + nx * s * (HALF + 6), peak.y + 32 * (1 - 4 * u * u), peak.z + az * u * 260 + nz * s * (HALF + 6))); }
    bridge.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pp), 60, 0.7, 8), new THREE.MeshStandardMaterial({ color: '#2b2f3a', emissive: '#22e6ff', emissiveIntensity: 0.25, metalness: 0.8, roughness: 0.4 })));
  }
  // Pit garage (setup and tyre tabs): glossy floor, light strips, back wall, turntable.
  const garage = new THREE.Group(); garage.position.set(500, 0, -70); scene.add(garage);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.3, metalness: 0.5, envMapIntensity: 0.12 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; garage.add(floor);
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.08, 64), new THREE.MeshStandardMaterial({ color: '#1a1b21', metalness: 0.8, roughness: 0.3, envMapIntensity: 0.2 })); turntable.position.y = 0.05; garage.add(turntable);
  const ringG = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.035, 8, 128), new THREE.MeshBasicMaterial({ color: '#ff2f4e' })); ringG.rotation.x = Math.PI / 2; ringG.position.y = 0.1; garage.add(ringG);
  for (let i = 0; i < 6; i++) { const strip = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: '#e8f2ff' })); strip.position.set(0, 7, -6 + i * 2.4); garage.add(strip); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 12), new THREE.MeshStandardMaterial({ color: '#0e0f14', roughness: 0.7 })); wall.position.set(0, 6, -12); garage.add(wall);
  const logo = canvasTex(1024, 128, (g, W, H) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, H); g.fillStyle = '#ff2f4e'; g.font = '700 92px Space Grotesk, sans-serif'; g.textAlign = 'center'; g.fillText('A P E X', W / 2, 100); });
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshBasicMaterial({ map: logo, transparent: true })); lg.position.set(0, 8.2, -11.9); garage.add(lg);
  const keyL = new THREE.SpotLight('#ffffff', 160, 40, 0.6, 0.6, 1.5); keyL.position.set(4, 10, 6); keyL.target.position.set(0, 0, 0); garage.add(keyL, keyL.target);
  const rimL = new THREE.SpotLight('#ff2f4e', 140, 40, 0.7, 0.7, 1.5); rimL.position.set(-6, 5, -8); rimL.target.position.set(0, 0.5, 0); garage.add(rimL, rimL.target);
  const cyanL = new THREE.SpotLight('#22e6ff', 120, 40, 0.7, 0.7, 1.5); cyanL.position.set(7, 4, -6); cyanL.target.position.set(0, 0.5, 0); garage.add(cyanL, cyanL.target);
  return { scene, garage, turntable, lights, gantry, trackGlow };
}
