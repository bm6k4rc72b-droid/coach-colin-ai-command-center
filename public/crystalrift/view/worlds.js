import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite, pointCloud } from './holo.js';
import { fbmish } from './noise.js';

// ─────────────────────────────────────────────────────────────────────────────
// CRYSTAL RIFT · five dioramas, one per world, all built at the origin; only the active one is shown.
//   ferrum   — a night reactor city: three Aether reactors venting green light over a plate of towers
//   academy  — a seaside academy ring in sunshine, with a card table on the lawn
//   mist     — golden mountains above a sea of mist, and an airship under its envelope
//   isles    — a tropical stadium at sunset with a floating sphere of water
//   rift     — a stone arena under a giant crystal, where the Wyrm waits
// ─────────────────────────────────────────────────────────────────────────────

const M = (o) => new THREE.MeshStandardMaterial(o), P = (o) => new THREE.MeshPhysicalMaterial(o);
const add = (p, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], sh = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = sh; m.receiveShadow = true; p.add(m); return m; };
const RB = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, r);

export const LOOK = {
  ferrum: { bg: '#05080a', fog: ['#0b1a14', 0.012], sun: ['#9fffc8', 0.6], hemi: ['#3a6a5a', '#05080a', 0.5] },
  academy: { bg: '#8fc8ff', fog: ['#bfe0ff', 0.006], sun: ['#fff4e0', 2.6], hemi: ['#cfe8ff', '#5a7a4a', 0.9] },
  mist: { bg: '#e8c89a', fog: ['#f0d8b0', 0.0035], sun: ['#ffd9a0', 2.4], hemi: ['#ffe6c0', '#7a6a5a', 0.8] },
  isles: { bg: '#ff9a6a', fog: ['#ffb08a', 0.004], sun: ['#ffc080', 2.4], hemi: ['#ffd0a0', '#2a4a6a', 0.8] },
  rift: { bg: '#0a0614', fog: ['#1a0e2e', 0.01], sun: ['#c8b0ff', 1.2], hemi: ['#8a6aff', '#120a20', 0.7] },
};

// ── Ferrum ──
function buildFerrum() {
  const g = new THREE.Group(), steel = M({ color: '#3a4046', roughness: 0.55, metalness: 0.7 }), dark = M({ color: '#1a1d21', roughness: 0.8 }), glow = new THREE.MeshBasicMaterial({ color: '#59ffa8' });
  add(g, new THREE.CylinderGeometry(70, 72, 2, 64), dark, [0, -1, 0]);
  const reactors = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5, x = Math.cos(a) * 34, z = Math.sin(a) * 34, r = new THREE.Group(); r.position.set(x, 0, z); g.add(r);
    add(r, new THREE.CylinderGeometry(6, 9, 26, 24), steel, [0, 13, 0]); add(r, new THREE.CylinderGeometry(8, 6, 6, 24), steel, [0, 29, 0]);
    for (let k = 0; k < 3; k++) add(r, new THREE.TorusGeometry(7.6 - k * 0.6, 0.35, 8, 40).rotateX(Math.PI / 2), glow, [0, 8 + k * 7, 0], [0, 0, 0], false);
    const plume = pointCloud(160, 3.2, '#59ffa8'); r.add(plume); reactors.push({ r, plume });
    add(r, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 4, 0), new THREE.Vector3(-x * 0.4, 8, -z * 0.4), new THREE.Vector3(-x * 0.85, 3, -z * 0.85)]), 30, 1.1, 10), steel); }
  // The plate city: blocks of towers lit by windows.
  const N = 260, towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M({ color: '#2a3036', roughness: 0.6, metalness: 0.4, emissive: '#18382a', emissiveIntensity: 0.6 }), N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let k = 0; for (let i = 0; i < 900 && k < N; i++) { const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 58; const x = Math.cos(a) * r, z = Math.sin(a) * r; if ([0, 1, 2].some((j) => Math.hypot(x - Math.cos((j / 3) * Math.PI * 2 + 0.5) * 34, z - Math.sin((j / 3) * Math.PI * 2 + 0.5) * 34) < 13)) continue; const h = 4 + Math.random() ** 2 * 22; towers.setMatrixAt(k++, m4.compose(v.set(x, 0, z), q.identity(), s.set(2 + Math.random() * 3, h, 2 + Math.random() * 3))); }
  towers.count = k; towers.castShadow = true; g.add(towers);
  const spire = add(g, new THREE.CylinderGeometry(2.5, 5, 48, 8), steel, [0, 24, 0]); add(g, new THREE.ConeGeometry(2.5, 8, 8), steel, [0, 52, 0]); void spire;
  // The Aether well: a crack of green light under the plate.
  const well = add(g, new THREE.RingGeometry(3, 9, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#59ffa8', transparent: true, opacity: 0.55, side: THREE.DoubleSide }), [0, 0.05, 18], [0, 0, 0], false);
  const wellGlow = glowSprite('#59ffa8', 40, 0.35); wellGlow.position.set(0, 2, 18); g.add(wellGlow);
  const light = new THREE.PointLight('#59ffa8', 800, 120, 1.6); light.position.set(0, 10, 18); g.add(light);
  g.userData = { reactors, well, wellGlow, light, heroAt: [0, 0, 26] }; return g;
}
// ── Academy ──
function buildAcademy() {
  const g = new THREE.Group(), white = M({ color: '#eef2f6', roughness: 0.4 }), blue = M({ color: '#3a6ad8', roughness: 0.35, metalness: 0.3 }), gold = M({ color: '#e0b850', roughness: 0.3, metalness: 0.8 });
  add(g, new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2), P({ color: '#2a7ab8', roughness: 0.08, metalness: 0.2 }), [0, -0.5, 0], [0, 0, 0], false);
  add(g, new THREE.CylinderGeometry(60, 64, 2, 64), M({ color: '#5aa04a', roughness: 0.9 }), [0, 0, 0]);
  const school = new THREE.Group(); school.position.set(0, 1, -28); g.add(school);
  add(school, new THREE.TorusGeometry(16, 3.2, 16, 80).rotateX(Math.PI / 2), white, [0, 6, 0]);
  add(school, new THREE.CylinderGeometry(12, 14, 6, 48), white, [0, 3, 0]); add(school, new THREE.SphereGeometry(10, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), blue, [0, 6, 0]);
  const halo = add(school, new THREE.TorusGeometry(19, 0.8, 8, 80).rotateX(Math.PI / 2), gold, [0, 15, 0]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(school, new THREE.CylinderGeometry(0.6, 0.6, 9, 12), white, [Math.cos(a) * 19, 10.5, Math.sin(a) * 19]); }
  // Card table on the lawn.
  const table = new THREE.Group(); table.position.set(0, 1, 6); g.add(table);
  add(table, new THREE.CylinderGeometry(2.2, 2.4, 0.15, 40), M({ color: '#6a3a22', roughness: 0.5 }), [0, 1.05, 0]); add(table, new THREE.CylinderGeometry(0.25, 0.4, 1, 16), M({ color: '#4a2a18' }), [0, 0.5, 0]);
  add(table, new THREE.BoxGeometry(2.6, 0.02, 2.6), M({ color: '#1f5a3a', roughness: 0.9 }), [0, 1.14, 0], [0, Math.PI / 4, 0], false);
  const slots = []; for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.03, 0.66, 2, 0.02), M({ color: '#ffffff' })); c.position.set(((i % 3) - 1) * 0.6, 1.17, (Math.floor(i / 3) - 1) * 0.76); c.visible = false; c.castShadow = true; table.add(c); slots.push(c); }
  g.userData = { halo, slots, heroAt: [0, 1, 9] }; return g;
}
// ── Mist continent ──
function buildMist() {
  const g = new THREE.Group(), rock = M({ color: '#8a7a68', roughness: 0.95, flatShading: true });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, r = 70 + Math.random() * 90, h = 50 + Math.random() * 90, geo = new THREE.ConeGeometry(18 + Math.random() * 20, h, 7, 4); const p = geo.attributes.position; for (let k = 0; k < p.count; k++) { const n = fbmish(p.getX(k) * 0.08, p.getY(k) * 0.08, p.getZ(k) * 0.08) - 0.5; p.setX(k, p.getX(k) * (1 + n * 0.5)); p.setZ(k, p.getZ(k) * (1 + n * 0.5)); } geo.computeVertexNormals(); add(g, geo, rock, [Math.cos(a) * r, h / 2 - 20, Math.sin(a) * r]); }
  // The 1,500 m ridge (drawn at 1 : 30) the ship must clear.
  const ridge = add(g, new THREE.ConeGeometry(34, 70, 6, 3), rock, [0, 15, -60]);
  const sea = add(g, new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fff4e4', transparent: true, opacity: 0.6, roughness: 1 }), [0, -2, 0], [0, 0, 0], false);
  const mist2 = add(g, new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff0d8', transparent: true, opacity: 0.16, depthWrite: false }), [0, 4, 0], [0, 0, 0], false);
  // The airship: envelope + ribs + wooden hull + propellers.
  const ship = new THREE.Group(); g.add(ship);
  const env = add(ship, new THREE.SphereGeometry(1, 40, 24), M({ color: '#d8c8a8', roughness: 0.8 }), [0, 0, 0]); env.scale.set(1, 0.32, 0.32);
  const ribs = []; for (let i = -4; i <= 4; i++) { const rr = Math.sqrt(1 - (i / 5) ** 2) * 0.325; const rib = add(ship, new THREE.TorusGeometry(rr, 0.006, 6, 32).rotateY(Math.PI / 2), M({ color: '#7a5a3a' }), [i / 5, 0, 0], [0, 0, 0], false); ribs.push(rib); }
  const hull = add(ship, new THREE.CapsuleGeometry(0.07, 0.6, 6, 14).rotateZ(Math.PI / 2), M({ color: '#7a4a2a', roughness: 0.7 }), [0.05, -0.4, 0]); hull.scale.set(1, 0.8, 1.4);
  for (const s of [-1, 1]) { const strut = add(ship, new THREE.CylinderGeometry(0.004, 0.004, 0.12), M({ color: '#5a3a22' }), [0.2, -0.33, s * 0.05]); void strut; }
  const props = []; for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(-0.55, -0.3, s * 0.18); ship.add(p); add(p, new THREE.BoxGeometry(0.01, 0.16, 0.02), M({ color: '#3a2a1a' })); add(p, new THREE.BoxGeometry(0.01, 0.02, 0.16), M({ color: '#3a2a1a' })); props.push(p); }
  const fin = add(ship, new THREE.BoxGeometry(0.18, 0.18, 0.01), M({ color: '#b8a888' }), [-0.92, 0.08, 0]);
  void fin;
  g.userData = { ship, env, props, ridge, sea, mist2, heroAt: [0, 0, 0] }; return g;
}
// ── The Isles ──
function buildIsles() {
  const g = new THREE.Group();
  add(g, new THREE.CircleGeometry(600, 64).rotateX(-Math.PI / 2), P({ color: '#1a5a7a', roughness: 0.05, metalness: 0.3 }), [0, -0.5, 0], [0, 0, 0], false);
  const stone = M({ color: '#e8dcc0', roughness: 0.8 }), coral = M({ color: '#e87a5a', roughness: 0.7 });
  for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(34 + i * 4, 36 + i * 4, 3, 64, 1, true), i % 2 ? coral : stone, [0, 1.5 + i * 3, 0]);
  add(g, new THREE.CylinderGeometry(30, 34, 1, 64), stone, [0, 0.2, 0]);
  const pool = add(g, new THREE.SphereGeometry(12, 64, 48), P({ color: '#5ad0ff', roughness: 0.04, metalness: 0, transmission: 0.85, thickness: 6, ior: 1.33, transparent: true, opacity: 0.55, depthWrite: false }), [0, 18, 0], [0, 0, 0], false);
  const shimmer = glowSprite('#bff4ff', 40, 0.25); shimmer.position.set(0, 18, 0); g.add(shimmer);
  const goal = add(g, new THREE.TorusGeometry(1.6, 0.12, 12, 40), M({ color: '#ffd27a', emissive: '#ffa020', emissiveIntensity: 0.6 }), [10.4, 18, 0], [0, Math.PI / 2, 0]);
  const ball = add(g, new THREE.SphereGeometry(0.33, 24, 16), M({ color: '#ffffff', emissive: '#ffd27a', emissiveIntensity: 0.3 }), [0, 18, 0]);
  const keeper = add(g, new THREE.CapsuleGeometry(0.35, 1.0, 4, 10), M({ color: '#3a3a8a' }), [9.4, 18, 0], [0, 0, Math.PI / 2]);
  const defenders = [0, 1].map((i) => add(g, new THREE.CapsuleGeometry(0.35, 1.0, 4, 10), M({ color: '#3a3a8a' }), [4 + i * 2.5, 18 + (i ? -2 : 2), 0], [0, 0, Math.PI / 2]));
  const path = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3)), new THREE.LineBasicMaterial({ color: '#ffd27a' })); path.frustumCulled = false; g.add(path);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, new THREE.CylinderGeometry(0.4, 0.6, 14, 8), M({ color: '#6a4a2a' }), [Math.cos(a) * 60, 7, Math.sin(a) * 60], [0.15 * Math.cos(a), 0, 0.15 * Math.sin(a)]); add(g, new THREE.ConeGeometry(5, 3, 7), M({ color: '#2a8a4a', flatShading: true }), [Math.cos(a) * 61, 14.5, Math.sin(a) * 61]); }
  g.userData = { pool, goal, ball, keeper, defenders, path, heroAt: [0, 1, 26] }; return g;
}
// ── The Rift ──
function buildRift() {
  const g = new THREE.Group(), stone = M({ color: '#5a5068', roughness: 0.85, flatShading: true });
  add(g, new THREE.CylinderGeometry(26, 20, 6, 24, 2), stone, [0, -3, 0]);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(g, new THREE.BoxGeometry(2, 4 + (i % 3) * 3, 2), stone, [Math.cos(a) * 24, 1.5, Math.sin(a) * 24], [0.1, a, 0.05]); }
  const crystal = add(g, new THREE.OctahedronGeometry(7, 0), P({ color: '#9a7aff', roughness: 0.05, transmission: 0.6, thickness: 4, emissive: '#5a3aff', emissiveIntensity: 0.6 }), [0, 30, -10], [0, 0, 0], false); crystal.scale.set(1, 1.8, 1);
  const cglow = glowSprite('#a88aff', 60, 0.5); cglow.position.copy(crystal.position); g.add(cglow);
  const motes = pointCloud(400, 0.4, '#c8b0ff'); g.add(motes); { const A = motes.geometry.attributes.position.array; for (let i = 0; i < 400; i++) A.set([(Math.random() - 0.5) * 80, Math.random() * 50, (Math.random() - 0.5) * 80], i * 3); }
  g.userData = { crystal, cglow, motes, heroAt: [0, 0, 6] }; return g;
}

// The Wyrm: a serpent of glowing segments with a horned head.
export function buildWyrm() {
  const root = new THREE.Group(), segs = [], body = P({ color: '#3a2a5a', roughness: 0.35, metalness: 0.3, clearcoat: 0.6, emissive: '#3a1a7a', emissiveIntensity: 0.4 }), spine = M({ color: '#c8b0ff', emissive: '#7a5aff', emissiveIntensity: 0.8 });
  for (let i = 0; i < 22; i++) { const r = 1.5 * (1 - i / 30); const s = add(root, new THREE.SphereGeometry(r, 20, 14), body); const sp = add(s, new THREE.ConeGeometry(r * 0.3, r * 0.9, 6), spine, [0, r * 0.9, 0]); void sp; segs.push(s); }
  const head = new THREE.Group(); root.add(head);
  add(head, new THREE.SphereGeometry(1.8, 24, 16), body).scale.set(1, 0.8, 1.4);
  add(head, new THREE.ConeGeometry(0.9, 2.2, 12).rotateX(Math.PI / 2), body, [0, -0.2, 2.2]);
  for (const s of [-1, 1]) { add(head, new THREE.ConeGeometry(0.3, 2.4, 8), spine, [s * 0.9, 1.4, -0.6], [-0.7, 0, s * 0.4]); const eye = glowSprite('#ffd27a', 1.2, 1); eye.position.set(s * 0.8, 0.4, 1.6); head.add(eye); }
  root.userData = { segs, head, flash: 0 }; return root;
}
export function poseWyrm(w, t, rear = 0) {
  const { segs, head } = w.userData;
  segs.forEach((s, i) => { const u = i * 0.42; s.position.set(Math.sin(t * 1.2 + u) * (1.5 + i * 0.08), 3 + Math.sin(t * 0.9 + u * 0.7) * 1.2 + (22 - i) * 0.32 * (1 + rear), -i * 1.25 + Math.cos(t * 0.6 + u) * 0.6); });
  const h0 = segs[0].position; head.position.set(h0.x, h0.y + 1.2, h0.z + 1.8); head.rotation.set(-0.2 - rear * 0.4 + Math.sin(t * 2) * 0.05, Math.sin(t * 1.2) * 0.3, 0);
}

// A hero rig shared by the four heroes: hair/clothes/weapon change per hero.
export const HEROES = {
  vey: { coat: '#2a2f3a', trim: '#7a8a9a', skin: '#e0b090', hair: '#e8d890', style: 'spike', weapon: 'broad', scarf: null },
  lio: { coat: '#1a1a22', trim: '#c8c8d0', skin: '#e2b494', hair: '#5a3a22', style: 'short', weapon: 'gunblade', scarf: '#d8d8d8' },
  pip: { coat: '#3a5aa8', trim: '#ffd27a', skin: '#f0c8a8', hair: '#e8862a', style: 'hood', weapon: 'lantern', scarf: null, small: true },
  mara: { coat: '#f0ece0', trim: '#4a8ad8', skin: '#e8bfa0', hair: '#1a1a24', style: 'long', weapon: 'staff', scarf: '#4a8ad8' },
};
export function buildHero(id) {
  const H = HEROES[id], root = new THREE.Group(), J = {};
  const coat = M({ color: H.coat, roughness: 0.7 }), trim = M({ color: H.trim, roughness: 0.5, metalness: 0.4 }), skin = M({ color: H.skin, roughness: 0.65 }), hair = M({ color: H.hair, roughness: 0.6 }), dark = M({ color: '#1c1c22', roughness: 0.7 });
  const joint = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
  const hips = joint('hips', root, 0, 0.95, 0), chest = joint('chest', hips, 0, 0.12, 0);
  add(hips, RB(0.34, 0.2, 0.22), dark); add(chest, RB(0.4, 0.46, 0.24, 0.07), coat, [0, 0.24, 0]); add(chest, RB(0.42, 0.06, 0.26, 0.02), trim, [0, 0.05, 0]);
  if (H.scarf) add(chest, new THREE.TorusGeometry(0.1, 0.035, 8, 20).rotateX(Math.PI / 2), M({ color: H.scarf }), [0, 0.5, 0]);
  const head = joint('head', chest, 0, 0.6, 0.01); add(head, new THREE.SphereGeometry(0.115, 24, 18), skin, [0, 0.03, 0.01]).scale.set(0.95, 1.08, 1);
  if (H.style === 'spike') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(head, new THREE.ConeGeometry(0.05, 0.26, 6), hair, [Math.sin(a) * 0.08, 0.1, Math.cos(a) * 0.05 - 0.04], [-0.9 - Math.cos(a) * 0.4, 0, Math.sin(a) * 0.8]); }
  if (H.style === 'short') add(head, new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, [0, 0.06, -0.01]);
  if (H.style === 'long') { add(head, new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, [0, 0.06, -0.01]); add(head, RB(0.22, 0.42, 0.06, 0.03), hair, [0, -0.15, -0.08]); }
  if (H.style === 'hood') { add(head, new THREE.SphereGeometry(0.15, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), coat, [0, 0.05, -0.02]); for (const s of [-1, 1]) add(head, new THREE.ConeGeometry(0.05, 0.16, 4), coat, [s * 0.09, 0.2, -0.02], [0, 0, -s * 0.3]); }
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L', sh = joint('sh' + k, chest, s * 0.24, 0.42, 0), el = joint('el' + k, sh, 0, -0.28, 0), wr = joint('wr' + k, el, 0, -0.26, 0);
    add(sh, new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), coat, [0, -0.14, 0]); add(el, new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), coat, [0, -0.13, 0]); add(wr, new THREE.SphereGeometry(0.05, 10, 8), skin, [0, -0.04, 0]);
    const hip = joint('hip' + k, hips, s * 0.1, -0.06, 0), kn = joint('kn' + k, hip, 0, -0.42, 0);
    add(hip, new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), dark, [0, -0.2, 0]); add(kn, new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), dark, [0, -0.19, 0]); add(kn, RB(0.14, 0.12, 0.28, 0.04), trim, [0, -0.42, 0.05]);
  }
  const wpn = new THREE.Group(); J.wrR.add(wpn); wpn.position.set(0, -0.06, 0.02); wpn.rotation.x = -Math.PI / 2; const metal = P({ color: '#c8d0dc', roughness: 0.2, metalness: 1, clearcoat: 1 });
  if (H.weapon === 'broad') { add(wpn, new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10).rotateX(Math.PI / 2), dark, [0, 0, 0]); add(wpn, RB(0.04, 0.22, 1.4, 0.01), metal, [0, 0.03, 0.85]); add(wpn, RB(0.06, 0.32, 0.06, 0.01), trim, [0, 0, 0.16]); }
  if (H.weapon === 'gunblade') { add(wpn, RB(0.06, 0.12, 0.3, 0.02), dark, [0, -0.02, 0.06]); add(wpn, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12).rotateZ(Math.PI / 2), trim, [0, 0.04, 0.18]); add(wpn, RB(0.025, 0.12, 0.95, 0.01), metal, [0, 0.03, 0.75]); }
  if (H.weapon === 'lantern') { add(wpn, new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8).rotateX(Math.PI / 2), M({ color: '#6a4a2a' }), [0, 0, 0.3]); const lamp = add(wpn, RB(0.12, 0.16, 0.12, 0.03), M({ color: '#ffd27a', emissive: '#ffa020', emissiveIntensity: 1.2 }), [0, 0, 0.84]); const gl = glowSprite('#ffd27a', 0.8, 0.9); gl.position.copy(lamp.position); wpn.add(gl); }
  if (H.weapon === 'staff') { add(wpn, new THREE.CylinderGeometry(0.018, 0.018, 1.5, 8).rotateX(Math.PI / 2), M({ color: '#e8e0c8' }), [0, 0, 0.4]); add(wpn, new THREE.TorusGeometry(0.1, 0.015, 8, 24), trim, [0, 0, 1.15]); const gl = glowSprite('#7fd4ff', 0.6, 0.9); gl.position.set(0, 0, 1.15); wpn.add(gl); }
  if (H.small) root.scale.setScalar(0.78);
  const aura = glowSprite(H.trim, 2.4, 0); aura.position.y = 1.0; root.add(aura);
  root.userData = { J, aura, id }; return root;
}
export function poseHero(h, mode, t, k = 0) {
  const J = h.userData.J; for (const s of ['L', 'R']) { J['sh' + s].rotation.set(0, 0, 0); J['el' + s].rotation.set(0, 0, 0); J['hip' + s].rotation.set(0, 0, 0); J['kn' + s].rotation.set(0, 0, 0); }
  J.hips.position.y = 0.95 + Math.sin(t * 2) * 0.01; J.chest.rotation.set(0, 0, 0);
  J.shR.rotation.x = -0.4; J.elR.rotation.x = -0.6; J.shL.rotation.z = -0.15; J.shR.rotation.z = 0.2;
  if (mode === 'ready') { J.hipL.rotation.x = -0.3; J.knL.rotation.x = 0.35; J.hipR.rotation.x = 0.25; J.hips.position.y = 0.9; J.shR.rotation.x = -0.9; }
  if (mode === 'attack') { const e = Math.sin(Math.min(1, k) * Math.PI); J.shR.rotation.x = -2.6 + e * 2.4; J.elR.rotation.x = -0.3; J.chest.rotation.y = -0.5 + e; J.hipL.rotation.x = -0.6; J.knL.rotation.x = 0.6; J.hips.position.y = 0.86; }
  if (mode === 'cast') { J.shR.rotation.x = -1.7; J.shL.rotation.x = -1.4; J.elL.rotation.x = -0.3; }
  if (mode === 'down') { h.rotation.x = -1.4; J.hips.position.y = 0.3; } else h.rotation.x = 0;
}

export function buildWorlds(scene) {
  const W = { ferrum: buildFerrum(), academy: buildAcademy(), mist: buildMist(), isles: buildIsles(), rift: buildRift() };
  for (const g of Object.values(W)) { g.visible = false; scene.add(g); }
  return W;
}
