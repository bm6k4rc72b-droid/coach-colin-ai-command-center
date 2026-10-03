import * as THREE from 'three';
import { glowSprite, pointCloud } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// SILENT VECTOR · the compound: a rain-soaked night facility with containers, buildings, a fence,
// sodium lamps, a searchlight tower, gravel / grating / grass zones (they change footstep noise),
// patrolling guards with ground-projected vision cones, a data terminal and an extraction point.
// Obstacles are axis-aligned boxes used for collisions and line-of-sight.
// ─────────────────────────────────────────────────────────────────────────────

function canvasTex(w, h, draw, rx = 1, ry = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }

export const ZONES = [   // surface patches [x0, z0, x1, z1, surface]
  { b: [-30, -8, -12, 14], s: 'gravel', c: '#3a3836' }, { b: [-2, -26, 2, 26], s: 'grating', c: '#2b3036' }, { b: [12, -30, 30, -12], s: 'grass', c: '#1c2418' },
];
export const START = new THREE.Vector3(0, 0, 27), GOAL = new THREE.Vector3(-4, 0, -24);

export function buildWorld() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#05070b'); scene.fog = new THREE.FogExp2('#070a10', 0.03);
  const hemi = new THREE.HemisphereLight('#4a6a8c', '#050505', 0.22); scene.add(hemi);
  const moon = new THREE.DirectionalLight('#9fb8d8', 0.55); moon.position.set(-20, 30, 10); moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, far: 90 }); moon.shadow.bias = -0.0004; scene.add(moon);
  // Wet concrete.
  const conc = canvasTex(512, 512, (g, W) => { g.fillStyle = '#2a2c30'; g.fillRect(0, 0, W, W); for (let i = 0; i < 4000; i++) { const l = 30 + Math.random() * 30; g.fillStyle = `rgba(${l},${l},${l + 4},.5)`; g.fillRect(Math.random() * W, Math.random() * W, 2, 2); } g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; for (let x = 0; x <= W; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, W); g.moveTo(0, x); g.lineTo(W, x); g.stroke(); } }, 16, 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: conc, roughness: 0.22, metalness: 0.35, color: '#a8adb6' })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  for (const z of ZONES) { const w = z.b[2] - z.b[0], d = z.b[3] - z.b[1]; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: z.c, roughness: z.s === 'grating' ? 0.35 : 0.9, metalness: z.s === 'grating' ? 0.7 : 0.05 })); m.rotation.x = -Math.PI / 2; m.position.set((z.b[0] + z.b[2]) / 2, 0.01, (z.b[1] + z.b[3]) / 2); m.receiveShadow = true; scene.add(m); }
  // Obstacles.
  const obstacles = [], boxes = new THREE.Group(); scene.add(boxes);
  const corr = canvasTex(64, 64, (g, W) => { for (let x = 0; x < W; x += 8) { g.fillStyle = x % 16 ? '#9a9a9a' : '#6a6a6a'; g.fillRect(x, 0, 8, W); } }, 6, 1);
  const box = (x, z, w, d, h, color, tex = false) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.4, map: tex ? corr : null })); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; boxes.add(m); obstacles.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, h]); return m; };
  // Containers.
  for (const [x, z, rot, c] of [[-8, 16, 0, '#6b2a22'], [-8, 13.4, 0, '#2c4a5e'], [8, 18, 0, '#41502c'], [10, 6, 1, '#6b2a22'], [-10, 2, 1, '#2c4a5e'], [6, -6, 0, '#5a4a2a'], [-7, -9, 0, '#41502c'], [9, -16, 1, '#2c4a5e'], [-14, -18, 0, '#6b2a22'], [15, 12, 0, '#5a4a2a']]) box(x, z, rot ? 2.4 : 6, rot ? 6 : 2.4, 2.6, c, true);
  // Buildings.
  box(-20, 22, 10, 8, 6, '#33363b'); box(20, 22, 10, 8, 7, '#2e3135'); box(-22, -24, 12, 8, 8, '#33363b'); box(14, -26, 14, 6, 6, '#2e3135');
  // Crates.
  for (const [x, z] of [[3, 10], [-3, 4], [4, -12], [-4, -15], [2.5, 20], [-16, 8], [17, -4]]) box(x, z, 1.2, 1.2, 1.1, '#5a4a32');
  // Perimeter fence (chain-link).
  const chain = canvasTex(64, 64, (g, W) => { g.clearRect(0, 0, W, W); g.strokeStyle = 'rgba(170,180,195,.8)'; g.lineWidth = 2; for (let i = -W; i < W * 2; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + W, W); g.moveTo(i, W); g.lineTo(i + W, 0); g.stroke(); } }, 40, 2);
  const fenceM = new THREE.MeshStandardMaterial({ map: chain, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4 });
  for (const [x, z, ry] of [[0, -32, 0], [0, 32, 0], [-32, 0, Math.PI / 2], [32, 0, Math.PI / 2]]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(64, 3.2), fenceM); f.position.set(x, 1.6, z); f.rotation.y = ry; scene.add(f); }
  // Sodium lamps: post, glowing head, light pool, cone.
  const lamps = [];
  for (const [x, z] of [[-6, 22], [6, 10], [-12, -2], [10, -2], [-2, -10], [8, -20], [-12, -14], [-4, -24]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), new THREE.MeshStandardMaterial({ color: '#2a2d32', metalness: 0.8, roughness: 0.4 })); post.position.set(x, 2.5, z); scene.add(post);
    const head = glowSprite('#ffb05a', 1.6, 0.95); head.position.set(x, 5, z); scene.add(head);
    const L = new THREE.PointLight('#ffad5c', 26, 13, 1.6); L.position.set(x, 4.8, z); scene.add(L);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 4.8, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb05a', transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); cone.position.set(x, 2.45, z); scene.add(cone);
    lamps.push({ x, z, I: 1, r: 7.5 });
  }
  // Searchlight tower.
  const tower = new THREE.Group(); tower.position.set(18, 0, 0); scene.add(tower);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#2a2d32', metalness: 0.8 })); leg.position.set(dx, 4, dz); tower.add(leg); }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), new THREE.MeshStandardMaterial({ color: '#30343a', metalness: 0.5, roughness: 0.6 })); cab.position.y = 8.6; tower.add(cab); obstacles.push([17, -1, 19, 1, 9]);
  const search = new THREE.SpotLight('#e8f0ff', 120, 40, 0.16, 0.4, 1.2); search.position.set(18, 9.2, 0); search.target.position.set(0, 0, 0); scene.add(search, search.target);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 3.2, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); scene.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; scene.add(pool);
  // Objective terminal and extraction pad.
  const term = new THREE.Group(); term.position.copy(GOAL); scene.add(term);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.5), new THREE.MeshStandardMaterial({ color: '#23262b', metalness: 0.6 })); tb.position.y = 0.7; term.add(tb);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: '#3dffb0' })); scr.position.set(0, 1.05, 0.26); term.add(scr);
  const tg = glowSprite('#3dffb0', 2.2, 0.6); tg.position.y = 1.2; term.add(tg);
  const ringT = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.4, 48), new THREE.MeshBasicMaterial({ color: '#3dffb0', transparent: true, opacity: 0.6, side: THREE.DoubleSide })); ringT.rotation.x = -Math.PI / 2; ringT.position.y = 0.03; term.add(ringT);
  const exfil = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 48), new THREE.MeshBasicMaterial({ color: '#5aa9ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide })); exfil.rotation.x = -Math.PI / 2; exfil.position.set(START.x, 0.03, START.z); scene.add(exfil);
  // Noise ring around the operative and transmit pulses.
  const noise = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); noise.rotation.x = -Math.PI / 2; noise.position.y = 0.05; scene.add(noise);
  const pulses = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; scene.add(m); return m; });
  // Rain.
  const rain = pointCloud(4000, 0.09, '#ffffff'); scene.add(rain);
  { const A = rain.geometry.attributes.position.array, C = rain.geometry.attributes.color.array; for (let i = 0; i < 4000; i++) { A.set([(Math.random() - 0.5) * 70, Math.random() * 25, (Math.random() - 0.5) * 70], i * 3); C.set([0.35, 0.42, 0.5], i * 3); } }
  return { scene, ground, obstacles, lamps, search, beam, pool, term, scr, exfil, noise, pulses, rain, moon, hemi };
}

// Guards: helmeted patrol figures with a flashlight and a ground vision cone.
export function buildGuard() {
  const g = new THREE.Group(), olive = new THREE.MeshStandardMaterial({ color: '#3b4230', roughness: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: '#1d2018', roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 6, 12), olive); torso.position.y = 1.25; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: '#7a5c48', roughness: 0.7 })); head.position.y = 1.75; g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark); helm.position.y = 1.78; g.add(helm);
  const legs = []; for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(s * 0.1, 0.9, 0); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.7, 4, 8), dark); m.position.y = -0.45; m.castShadow = true; l.add(m); g.add(l); legs.push(l); }
  const torch = glowSprite('#fff1c8', 0.5, 0.9); torch.position.set(0.18, 1.3, -0.3); g.add(torch);
  const coneMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(new THREE.CircleGeometry(1, 40, Math.PI / 2 - 0.87, 1.74), coneMat); cone.rotation.x = -Math.PI / 2; cone.position.y = 0.04; g.add(cone);
  const mark = glowSprite('#ffd166', 0.8, 0); mark.position.y = 2.3; g.add(mark);
  g.userData = { legs, cone, mark, torch }; return g;
}

// 2-D segment vs axis-aligned box (slab test) for line of sight.
export function segHitsBox(ax, az, bx, bz, b) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, b[0], b[2]], [az, dz, b[1], b[3]]]) { if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; } else { let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; } }
  return true;
}
