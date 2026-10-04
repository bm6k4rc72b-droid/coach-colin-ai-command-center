import * as THREE from 'three';
import { glowSprite } from './holo.js';

// HYPERSCALE · the campus. One world, five camera stations: the data hall (racks, trays, hot aisles), the
// network fabric hologram above it, the cooling yard, the substation with its battery and solar field.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...o });
export const ROWS = 10, PER = 40;                                       // racks per half-row
export const rowZ = (r) => -23 + r * 5.1;

function ledTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#0a0d14'; g.fillRect(0, 0, 64, 256);
  for (let y = 10; y < 246; y += 12) {
    g.fillStyle = '#141a26'; g.fillRect(4, y, 56, 10);
    for (let x = 8; x < 58; x += 6) { const r = Math.random(); g.fillStyle = r < 0.55 ? '#58e0ff' : r < 0.75 ? '#7cff9e' : r < 0.82 ? '#ffb347' : '#0d1018'; g.fillRect(x, y + 4, 2, 2); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
function label(text, color = '#9fe8ff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.font = '600 44px "Space Grotesk", sans-serif'; g.textAlign = 'center'; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 16; g.fillText(text, 256, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.9 })); s.scale.set(26, 4.9, 1); return s;
}

export function buildCampus(scene) {
  const U = {};
  // ── Ground, distant ridges and stars ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), std('#2a2620', { roughness: 0.95, metalness: 0 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), std('#1c1d22', { roughness: 0.8 })); pad.rotation.x = -Math.PI / 2; pad.position.set(-5, 0.02, 0); pad.receiveShadow = true; scene.add(pad);
  const ridge = new THREE.Group(); for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7) * 0.1, r = 800 + (i % 3) * 120, h = 60 + ((i * 37) % 70); const m = new THREE.Mesh(new THREE.ConeGeometry(160 + (i % 4) * 40, h, 5), std('#15141a', { roughness: 1, flatShading: true })); m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r); m.rotation.y = i; ridge.add(m); } scene.add(ridge);
  { const n = 1600, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.45 + 0.05, th = u * Math.PI * 2, ph = Math.acos(1 - v); p.set([Math.sin(ph) * Math.cos(th) * 1500, Math.cos(ph) * 1500, Math.sin(ph) * Math.sin(th) * 1500], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); U.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe0ff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false })); scene.add(U.stars); }

  // ── Data hall ──
  const hall = new THREE.Group(); scene.add(hall); U.hall = hall;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(124, 0.4, 62), std('#2c3038', { roughness: 0.55, metalness: 0.4 })); slab.position.y = 0.2; slab.receiveShadow = true; hall.add(slab);
  const wallM = std('#20232b', { roughness: 0.7 }), glassM = new THREE.MeshStandardMaterial({ color: '#5a7a9a', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.9, depthWrite: false });
  for (const [w, d, x, z, glass] of [[124, 0.5, 0, -31, false], [124, 0.5, 0, 31, true], [0.5, 62, -62, 0, false], [0.5, 62, 62, 0, false]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), glass ? glassM : wallM); m.position.set(x, 4.9, z); if (!glass) { m.castShadow = true; m.receiveShadow = true; } hall.add(m); }
  // Roof trusses only (cut-away), so the cameras look in.
  for (let x = -60; x <= 60; x += 10) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 62), wallM); b.position.set(x, 9.4, 0); hall.add(b); }
  // Racks: instanced, each face its own material so only the fronts carry the LED field.
  const led = ledTexture(), body = std('#11141b', { roughness: 0.45, metalness: 0.7 });
  const front = new THREE.MeshStandardMaterial({ color: '#1a1e28', map: led, emissiveMap: led, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.5 });
  U.rackFront = front;
  const rackG = new THREE.BoxGeometry(1.1, 2.4, 1.3), mats = [body, body, body, body, front, front];
  const count = ROWS * PER * 2, racks = new THREE.InstancedMesh(rackG, mats, count); racks.castShadow = true; racks.receiveShadow = true;
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 2.1, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1); let k = 0; U.rackPos = [];
  for (let r = 0; r < ROWS; r++) for (let side = 0; side < 2; side++) for (let i = 0; i < PER; i++) {
    const x = (side ? 6 : -54) + i * 1.2, z = rowZ(r), face = r % 2 ? Math.PI : 0;
    q.setFromAxisAngle(V(0, 1, 0), face); m4.compose(V(x, 1.6, z), q, one); racks.setMatrixAt(k, m4);
    m4.compose(V(x + 0.5, 1.6, z + (r % 2 ? -0.67 : 0.67)), q, one); strips.setMatrixAt(k, m4); strips.setColorAt(k, new THREE.Color('#58e0ff'));
    U.rackPos.push([x, z, r]); k++;
  }
  hall.add(racks, strips); U.racks = racks; U.strips = strips;
  // Hot aisles (between rows 0–1, 2–3 …: the backs face each other) glow with heat; cold aisles get a blue floor wash.
  U.hot = []; const hotM = new THREE.MeshBasicMaterial({ color: '#ff7a3a', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let r = 0; r < ROWS; r += 2) for (const xc of [-30.6, 29.4]) { const m = new THREE.Mesh(new THREE.BoxGeometry(48, 2.8, 2.6), hotM); m.position.set(xc, 1.8, (rowZ(r) + rowZ(r + 1)) / 2); hall.add(m); U.hot.push(m); }
  U.hotM = hotM;
  const coldM = new THREE.MeshBasicMaterial({ color: '#2a8cff', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let r = 1; r < ROWS - 1; r += 2) { const m = new THREE.Mesh(new THREE.PlaneGeometry(108, 2.2), coldM); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.42, (rowZ(r) + rowZ(r + 1)) / 2); hall.add(m); }
  // Overhead trays with fibre, and the supply/return water mains over each row.
  const trayM = std('#4a505c', { metalness: 0.8, roughness: 0.35 }), fibreM = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  U.supplyM = new THREE.MeshStandardMaterial({ color: '#1f6dff', emissive: '#1f6dff', emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 });
  U.returnM = new THREE.MeshStandardMaterial({ color: '#ff6a3a', emissive: '#ff6a3a', emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 });
  for (let r = 0; r < ROWS; r++) for (const xc of [-30.6, 29.4]) {
    const z = rowZ(r), tray = new THREE.Mesh(new THREE.BoxGeometry(48, 0.12, 0.7), trayM); tray.position.set(xc, 3.4, z); hall.add(tray);
    const f = new THREE.Mesh(new THREE.BoxGeometry(48, 0.05, 0.08), fibreM); f.position.set(xc, 3.5, z); hall.add(f);
    const back = r % 2 ? -1 : 1;
    for (const [m, dz] of [[U.supplyM, 0.25], [U.returnM, 0.55]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 48, 10), m); p.rotation.z = Math.PI / 2; p.position.set(xc, 3.0, z - back * dz); hall.add(p); }
  }
  // Ceiling light bars.
  const barM = new THREE.MeshBasicMaterial({ color: '#7f95ad' });
  for (let z = -27; z <= 27; z += 9) { const b = new THREE.Mesh(new THREE.BoxGeometry(112, 0.08, 0.25), barM); b.position.set(0, 8.6, z); hall.add(b); }
  U.hallLights = [];
  for (const [x, z] of [[-30, -12], [30, -12], [-30, 12], [30, 12]]) { const l = new THREE.PointLight('#bcd8ff', 60, 50, 1.8); l.position.set(x, 7.5, z); hall.add(l); U.hallLights.push(l); }
  // Glow from every rack front, as a soft floor light.
  { const l = new THREE.PointLight('#58e0ff', 25, 60, 1.6); l.position.set(0, 5, 0); hall.add(l); U.rackGlow = l; }

  // ── Network fabric hologram (shown scaled down: 20 leaves, 8 spines, 4 cores) ──
  const fab = new THREE.Group(); fab.position.y = 0; scene.add(fab); U.fabric = fab;
  const nodeM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95 });
  const leaves = [], spines = [], cores = [];
  for (let r = 0; r < ROWS; r++) for (const xc of [-30.6, 29.4]) { const n = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.2), nodeM('#58e0ff')); n.position.set(xc, 12, rowZ(r)); fab.add(n); leaves.push(n.position); }
  for (let i = 0; i < 8; i++) { const n = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 1.6), nodeM('#b48cff')); n.position.set(-42 + i * 12, 20, 0); fab.add(n); spines.push(n.position); }
  for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 2), nodeM('#ff9ad5')); n.position.set(-27 + i * 18, 28, 0); fab.add(n); cores.push(n.position); }
  const edges = []; for (const a of leaves) for (const b of spines) edges.push([a, b]); for (const a of spines) for (const b of cores) edges.push([a, b]);
  { const p = new Float32Array(edges.length * 6); edges.forEach(([a, b], i) => p.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    U.links = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#58e0ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); fab.add(U.links); }
  // Leaf drops to their rows.
  { const p = []; for (const a of leaves) p.push(a.x, a.y, a.z, a.x, 3.5, a.z); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); fab.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }))); }
  { const n = 900, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    U.packets = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); fab.add(U.packets);
    U.pk = [...Array(n)].map(() => ({ e: Math.floor(Math.random() * edges.length), t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, v: 0.4 + Math.random() * 0.8 })); U.edges = edges; }
  U.fabLabel = label('LEAF · SPINE · CORE', '#b48cff'); U.fabLabel.position.set(0, 33, 0); fab.add(U.fabLabel);

  // ── Cooling yard (east) ──
  const yard = new THREE.Group(); scene.add(yard); U.yard = yard; U.fans = [];
  const unitM = std('#9aa3b2', { metalness: 0.7, roughness: 0.35 }), fanM = std('#2a2f38', { metalness: 0.5 }), ringM = std('#5a6270', { metalness: 0.7 });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    const u = new THREE.Group(); u.position.set(80 + j * 12, 0, -25 + i * 10); yard.add(u);
    const box = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 4), unitM); box.position.y = 3.2; box.castShadow = true; u.add(box);
    for (const lx of [-3, 3]) for (const lz of [-1.6, 1.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.2), ringM); leg.position.set(lx, 0.9, lz); u.add(leg); }
    for (const fx of [-3, 0, 3]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20), ringM); ring.rotation.x = Math.PI / 2; ring.position.set(fx, 4.75, 0); u.add(ring);
      const fan = new THREE.Group(); for (let b = 0; b < 5; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.32), fanM); bl.position.x = 0.55; bl.rotation.x = 0.35; const piv = new THREE.Group(); piv.rotation.y = (b / 5) * Math.PI * 2; piv.add(bl); fan.add(piv); }
      fan.position.set(fx, 4.7, 0); u.add(fan); U.fans.push(fan); }
  }
  // Evaporative cells with plumes (used when the tower option is chosen).
  U.towers = new THREE.Group(); yard.add(U.towers); U.plumes = [];
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 8), std('#7d8796', { roughness: 0.7 })); c.position.set(110, 3.5, -16 + i * 16); c.castShadow = true; U.towers.add(c);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.2, 2.4, 20, 1, true), std('#5a6270', { side: THREE.DoubleSide })); st.position.set(110, 8.2, -16 + i * 16); U.towers.add(st);
    const fan = new THREE.Group(); for (let b = 0; b < 6; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.5), fanM); bl.position.x = 1.2; const piv = new THREE.Group(); piv.rotation.y = (b / 6) * Math.PI * 2; piv.add(bl); fan.add(piv); } fan.position.set(110, 8.6, -16 + i * 16); U.towers.add(fan); U.fans.push(fan);
    const pl = [...Array(14)].map(() => { const s = glowSprite('#e8f0ff', 6, 0.0); s.material.blending = THREE.NormalBlending; U.towers.add(s); return s; }); U.plumes.push({ at: V(110, 9, -16 + i * 16), pl }); }
  // Chiller skid.
  U.chiller = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 5), std('#3a72c8', { metalness: 0.5 })); U.chiller.position.set(78, 1.5, 36); yard.add(U.chiller);
  U.chillGlow = glowSprite('#58a8ff', 9, 0); U.chillGlow.position.set(78, 4.5, 36); yard.add(U.chillGlow);
  // Mains from the hall to the yard: out through the east wall, then headers running north–south.
  for (const [m, y, x] of [[U.supplyM, 1.4, 72], [U.returnM, 2.6, 73.6]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, x - 62, 16), m); p.rotation.z = Math.PI / 2; p.position.set((62 + x) / 2, y, 0); yard.add(p);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 58, 16), m); p2.rotation.x = Math.PI / 2; p2.position.set(x, y, 0); yard.add(p2);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 86 - x + (y > 2 ? 12 : 0), 8), m); b.rotation.z = Math.PI / 2; b.position.set((x + 80 + (y > 2 ? 12 : 0)) / 2, y > 2 ? 0.5 : 0.35, -25 + i * 10 + (y > 2 ? 0.8 : -0.8)); yard.add(b); } }
  // Floodlights so the yard and substation read at night.
  for (const [x, z, c] of [[88, 20, '#cfe6ff'], [-92, 10, '#ffd9a0'], [-92, -30, '#ffd9a0']]) { const l = new THREE.PointLight(c, 900, 90, 1.7); l.position.set(x, 18, z); scene.add(l); }
  U.yardLabel = label('COOLING YARD', '#9fe8ff'); U.yardLabel.position.set(92, 22, -6); yard.add(U.yardLabel);

  // ── Substation, battery, transmission (west) ──
  const sub = new THREE.Group(); scene.add(sub); U.sub = sub;
  const trM = std('#5d6b5a', { roughness: 0.6, metalness: 0.4 }), finM = std('#4a5648'), insM = std('#c9b28a', { roughness: 0.4 });
  for (let i = 0; i < 4; i++) { const t = new THREE.Group(); t.position.set(-92, 0, -24 + i * 16); sub.add(t);
    const b = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 5), trM); b.position.y = 2.5; b.castShadow = true; t.add(b);
    for (let f = 0; f < 6; f++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 2), finM); fin.position.set(-3.3, 2.5, -2 + f * 0.8); t.add(fin); }
    for (let p = 0; p < 3; p++) { const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8), insM); ins.position.set(-1.5 + p * 1.5, 6.1, 0); t.add(ins); } }
  // Lattice towers marching off to the west, with sagging conductors (catenary y = a·cosh(x/a)).
  const towerM = std('#8a919c', { metalness: 0.8, roughness: 0.4 }), tops = [];
  for (let i = 0; i < 7; i++) { const x = -120 - i * 90, tw = new THREE.Group(); tw.position.set(x, 0, 0); sub.add(tw);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 34, 4), towerM); l.position.set(dx * 0.6, 17, dz * 0.6); l.rotation.z = -dx * 0.03; l.rotation.x = dz * 0.03; tw.add(l); }
    for (let h = 6; h < 34; h += 6) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.2), towerM); c.position.set(0, h, 0); tw.add(c); const c2 = c.clone(); c2.rotation.y = Math.PI / 2; tw.add(c2); }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 16), towerM); arm.position.set(0, 30, 0); tw.add(arm); tops.push(x); }
  { const p = []; const a = 260; for (const z of [-7, 0, 7]) { for (let i = 0; i < tops.length - 1; i++) { const x0 = tops[i], x1 = tops[i + 1], xm = (x0 + x1) / 2; for (let s = 0; s < 20; s++) { const xa = x0 + ((x1 - x0) * s) / 20, xb = x0 + ((x1 - x0) * (s + 1)) / 20; const y = (x) => 29.6 - (a * Math.cosh((x0 - xm) / a) - a * Math.cosh((x - xm) / a)); p.push(xa, y(xa), z, xb, y(xb), z); } }
      p.push(tops[0], 29.6, z, -96, 7, z * 2.5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); sub.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d0dc', transparent: true, opacity: 0.6 }))); }
  // Battery containers.
  U.batt = []; const bM = std('#e8ecef', { roughness: 0.5 });
  for (let i = 0; i < 10; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(12, 2.9, 2.4), bM); c.position.set(-112 + (i % 5) * 14, 1.45, -46 - Math.floor(i / 5) * 6); c.castShadow = true; sub.add(c);
    const s = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#7cff9e' })); s.position.set(c.position.x, 2.4, c.position.z + 1.23); sub.add(s); U.batt.push(s); }
  U.subLabel = label('SUBSTATION', '#ffd27a'); U.subLabel.position.set(-95, 18, 0); sub.add(U.subLabel);
  // Solar field (south): instanced tilted panels.
  { const n = 30 * 14, panel = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 0.12, 2.8), new THREE.MeshStandardMaterial({ color: '#16264a', metalness: 0.9, roughness: 0.15, emissive: '#0a1a3a', emissiveIntensity: 0.4 }), n); let i = 0;
    for (let a = 0; a < 30; a++) for (let b = 0; b < 14; b++) { q.setFromEuler(new THREE.Euler(-0.5, 0, 0)); m4.compose(V(-120 + a * 7, 1.6, 60 + b * 5.5), q, one); panel.setMatrixAt(i++, m4); }
    panel.receiveShadow = true; scene.add(panel); U.solar = panel; }
  // Perimeter lamps.
  U.lamps = []; for (let i = 0; i < 18; i++) { const x = -130 + i * 15.5, z = i % 2 ? -66 : 66; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 6), towerM); post.position.set(x, 4, z); scene.add(post); const s = glowSprite('#ffd9a0', 5, 0.8); s.position.set(x, 8.2, z); scene.add(s); U.lamps.push(s); }
  // Hall label.
  U.hallLabel = label('DATA HALL A', '#58e0ff'); U.hallLabel.position.set(0, 16, 32); scene.add(U.hallLabel);
  return U;
}

// Temperature to colour: 20 °C blue → 60 °C cyan/green → 85 °C amber → 95 °C red.
export function tempColor(T, out = new THREE.Color()) {
  const k = Math.min(1, Math.max(0, (T - 20) / 75));
  const stops = [[0, '#2a6cff'], [0.45, '#58e0ff'], [0.7, '#7cff9e'], [0.87, '#ffb347'], [1, '#ff3a4a']];
  for (let i = 1; i < stops.length; i++) if (k <= stops[i][0]) { const a = new THREE.Color(stops[i - 1][1]), b = new THREE.Color(stops[i][1]); return out.copy(a).lerp(b, (k - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])); }
  return out.set('#ff3a4a');
}
