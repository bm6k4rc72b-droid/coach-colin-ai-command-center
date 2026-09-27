import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HAZARDS, NIGHT_ROUTE } from './model.js';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN · THE HOME
// A single-storey home shown as a cut-away "dollhouse" at dusk. Every hazard has a
// "before" group and an "after" group; applying the fix swaps them in the scene.
// Plan (metres): bedroom (−6…−1, −4.5…0.5), hallway (−1…0), foyer with entry steps
// (−3…−1, 0.5…4.5), bathroom (−6…−3, 0.5…4.5), living (0…6, −4.5…1.5), kitchen (0…6, 1.5…4.5).
// ─────────────────────────────────────────────────────────────────────────────

const rb = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const WALL_H = 1.15;                                   // cut-away wall height

function canvasTex(draw, w = 256, h = 256, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 4; return t;
}
const woodTex = () => canvasTex((g, w, h) => {
  for (let y = 0; y < h; y += 32) { const base = 120 + Math.random() * 40; for (let x = 0; x < w; x++) { const v = base + 18 * Math.sin(x * 0.05 + y) + Math.random() * 10; g.fillStyle = `rgb(${v * 0.9},${v * 0.62},${v * 0.4})`; g.fillRect(x, y, 1, 31); } g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 31, w, 1); }
}, 256, 256, [3, 3]);
const tileTex = (a = '#d8dde2', b = '#c3c9cf') => canvasTex((g, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 32, j * 32, 31, 31); } }, 256, 256, [2, 2]);
const rugTex = () => canvasTex((g, w, h) => { g.fillStyle = '#7a2e3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e0b872'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28); for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w / 2, h / 2, 20 + i * 16, 0, Math.PI * 2); g.strokeStyle = i % 2 ? '#e0b872' : '#3a5a7a'; g.lineWidth = 5; g.stroke(); } });

export function buildHome() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060b');
  scene.fog = new THREE.Fog('#05060b', 26, 60);
  const root = new THREE.Group(); scene.add(root);
  const M = {
    wood: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.55 }),
    tile: new THREE.MeshPhysicalMaterial({ map: tileTex(), roughness: 0.12, clearcoat: 0.8 }),
    kitchenTile: new THREE.MeshStandardMaterial({ map: tileTex('#e9e4da', '#d6cfc2'), roughness: 0.4 }),
    stone: new THREE.MeshStandardMaterial({ color: '#6e6a66', roughness: 0.8 }),
    wall: new THREE.MeshStandardMaterial({ color: '#b9b0a3', roughness: 0.92 }),
    wallTop: new THREE.MeshBasicMaterial({ color: '#3ff3ff' }),
    fabric: new THREE.MeshStandardMaterial({ color: '#4c5a6e', roughness: 0.95 }),
    linen: new THREE.MeshStandardMaterial({ color: '#d6d0c5', roughness: 0.95 }),
    woodDark: new THREE.MeshStandardMaterial({ color: '#4a3324', roughness: 0.5 }),
    white: new THREE.MeshPhysicalMaterial({ color: '#d9d9d6', roughness: 0.25, clearcoat: 0.5, envMapIntensity: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 1, roughness: 0.2 }),
    black: new THREE.MeshStandardMaterial({ color: '#1a1b20', roughness: 0.6 }),
    glowWarm: new THREE.MeshBasicMaterial({ color: '#ffcf8a' }),
    glowCyan: new THREE.MeshBasicMaterial({ color: '#8ff6ff' }),
    window: new THREE.MeshBasicMaterial({ color: '#3a4f88' }),
    rug: new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1, side: THREE.DoubleSide }),
    mat: new THREE.MeshStandardMaterial({ color: '#3f8a7a', roughness: 1 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5, emissive: '#6b5200', emissiveIntensity: 0.4 }),
    cord: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }),
    shoe: new THREE.MeshStandardMaterial({ color: '#6b3b2a', roughness: 0.7 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#b7c6d6', roughness: 0.3 }),
  };
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => add(rb(w, h, d, 0.03), mat, x, y, z, parent);

  // ── Floors ────────────────────────────────────
  const floor = (x0, x1, z0, z1, mat, y = 0) => { const m = add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat, (x0 + x1) / 2, y, (z0 + z1) / 2); m.rotation.x = -Math.PI / 2; return m; };
  floor(-6, -1, -4.5, 0.5, M.wood); floor(-1, 0, -4.5, 4.5, M.wood); floor(0, 6, -4.5, 1.5, M.wood);
  floor(-6, -3, 0.5, 4.5, M.tile); floor(0, 6, 1.5, 4.5, M.kitchenTile); floor(-3, -1, 0.5, 3.0, M.stone);
  // Ground and garden plane outside.
  const ground = add(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: '#0d1410', roughness: 1 }), 0, -0.62, 0); ground.rotation.x = -Math.PI / 2;
  const plinth = box(12.4, 0.6, 9.4, new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.9 }), 0, -0.31, 0);

  // ── Walls (cut away at WALL_H with a glowing cap) ──
  const wall = (x0, z0, x1, z1, t = 0.12) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const w = add(new THREE.BoxGeometry(len, WALL_H, t), M.wall, (x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2); w.rotation.y = -ang;
    const cap = add(new THREE.BoxGeometry(len, 0.012, t + 0.004), M.wallTop, (x0 + x1) / 2, WALL_H + 0.006, (z0 + z1) / 2); cap.rotation.y = -ang;
  };
  // Exterior.
  wall(-6, -4.5, 6, -4.5); wall(-6, 4.5, -2.3, 4.5); wall(-1.1, 4.5, 6, 4.5); wall(-6, -4.5, -6, 4.5); wall(6, -4.5, 6, 4.5);
  // Bedroom: to hall (door −1.6…−0.8) and to bath/foyer.
  wall(-1, -4.5, -1, -1.7); wall(-1, -0.7, -1, 0.5); wall(-6, 0.5, -1, 0.5);
  // Bathroom east wall with door (z 1.2…2.0) to the foyer.
  wall(-3, 0.5, -3, 1.2); wall(-3, 2.05, -3, 4.5);
  // Living/hall partial wall and kitchen divider (half-height feel via gaps).
  wall(0, -4.5, 0, -2.8); wall(0, -1.2, 0, 1.0); wall(0, 3.2, 0, 4.5); wall(3.8, 1.5, 6, 1.5);
  // Windows glowing with the dusk sky.
  for (const [x, z, ry] of [[-3.5, -4.56, 0], [3, -4.56, 0], [6.06, -1.5, Math.PI / 2], [6.06, 3, Math.PI / 2], [-6.06, 2.6, Math.PI / 2]]) {
    const win = add(new THREE.PlaneGeometry(1.6, 0.7), M.window, x, 0.75, z); win.rotation.y = ry;
  }
  // Front door.
  const door = box(1.1, 1.14, 0.08, M.woodDark, -1.7, 0.57 - 0.45, 4.52); void door;

  // ── Furniture ────────────────────────────────
  // Bedroom.
  const bedLow = new THREE.Group(); root.add(bedLow);
  box(1.7, 0.22, 2.1, M.woodDark, -3.9, 0.11, -3.25, bedLow); box(1.6, 0.18, 2.0, M.linen, -3.9, 0.3, -3.25, bedLow);
  box(1.7, 0.7, 0.1, M.woodDark, -3.9, 0.4, -4.3, bedLow);
  const bedHigh = new THREE.Group(); root.add(bedHigh); bedHigh.visible = false;
  box(1.7, 0.36, 2.1, M.woodDark, -3.9, 0.18, -3.25, bedHigh); box(1.6, 0.2, 2.0, M.linen, -3.9, 0.46, -3.25, bedHigh);
  box(1.7, 0.85, 0.1, M.woodDark, -3.9, 0.45, -4.3, bedHigh);
  box(1.0, 0.06, 1.95, new THREE.MeshStandardMaterial({ color: '#6a88a8', roughness: 1 }), -3.9, 0.44, -2.8, bedLow);
  box(0.45, 0.5, 0.45, M.woodDark, -5.35, 0.25, -3.9);
  box(1.4, 1.1, 0.55, M.woodDark, -5.6, 0.55, -1.2).rotation.y = Math.PI / 2;
  // Living room.
  box(2.4, 0.42, 0.9, M.fabric, 3.4, 0.21, -3.9); box(2.4, 0.4, 0.2, M.fabric, 3.4, 0.55, -4.25);
  box(1.1, 0.32, 0.6, M.woodDark, 3.4, 0.16, -2.6);
  box(0.4, 0.5, 1.8, M.black, 5.75, 0.25, -2.3); box(0.06, 0.6, 1.3, new THREE.MeshPhysicalMaterial({ color: '#05060a', roughness: 0.05, emissive: '#223a66', emissiveIntensity: 0.8 }), 5.72, 0.85, -2.3);
  box(0.9, 0.42, 0.9, M.fabric, 1.3, 0.21, -3.6);
  const floorLamp = add(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), M.chrome, 5.5, 0.55, -4.1); void floorLamp;
  add(new THREE.SphereGeometry(0.12, 16, 12), M.glowWarm, 5.5, 1.12, -4.1);
  // Kitchen.
  box(3.4, 0.9, 0.6, M.white, 4.2, 0.45, 4.15); box(0.6, 0.9, 2.6, M.white, 5.7, 0.45, 2.9);
  box(3.4, 0.04, 0.62, M.stone, 4.2, 0.92, 4.15);
  box(1.2, 0.05, 0.8, M.woodDark, 2.0, 0.75, 3.0); for (const [x, z] of [[1.5, 3.0], [2.5, 3.0]]) box(0.42, 0.45, 0.42, M.woodDark, x, 0.23, z + 0.62);
  // Bathroom.
  box(2.1, 0.55, 1.0, M.white, -4.6, 0.28, 1.1);
  box(0.45, 0.42, 0.6, M.white, -5.45, 0.21, 3.7); box(0.45, 0.35, 0.18, M.white, -5.65, 0.55, 3.7);
  box(0.6, 0.85, 0.45, M.white, -3.6, 0.43, 4.2);
  // Foyer steps (three risers of 0.15 m down to the door landing).
  const steps = new THREE.Group(); root.add(steps);
  for (let i = 0; i < 3; i++) box(2.0, 0.15, 0.45, M.stone, -2.0, -0.075 - i * 0.15, 3.2 + i * 0.45, steps);
  box(2.0, 0.05, 0.6, M.stone, -2.0, -0.47, 4.45, steps);

  // ── Hazard "before" / "after" dressing ────────
  const H = {};
  const pair = (id) => { const b = new THREE.Group(), a = new THREE.Group(); root.add(b, a); a.visible = false; H[id] = { before: b, after: a }; return H[id]; };
  { const p = pair('rug'); const rug = add(new THREE.PlaneGeometry(0.85, 1.4, 12, 12), M.rug, -0.5, 0.02, -1.6, p.before); rug.rotation.x = -Math.PI / 2; const pos = rug.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); if (y > 0.45 && x > 0.1) pos.setZ(i, (y - 0.45) * 0.35); } rug.geometry.computeVertexNormals(); const flat = add(new THREE.PlaneGeometry(0.85, 1.4), M.rug, -0.5, 0.005, -1.6, p.after); flat.rotation.x = -Math.PI / 2; const edge = add(new THREE.RingGeometry(0.9, 0.93, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: '#5dffa8' }), -0.5, 0.01, -1.6, p.after); edge.rotation.x = -Math.PI / 2; edge.scale.set(0.6, 1, 1); }
  { const p = pair('dimHall'); for (const z of [-3.5, -1.8, -0.2, 1.4, 3.0]) { add(new THREE.BoxGeometry(0.12, 0.05, 0.02), M.glowWarm, -0.06, 0.18, z, p.after); } const nl = new THREE.PointLight('#ffcf8a', 0, 5, 2); nl.position.set(-0.5, 0.3, 0); p.after.add(nl); H.dimHall.light = nl; }
  { const p = pair('bathFloor'); const mat = box(1.4, 0.02, 0.6, M.mat, -4.4, 0.012, 2.2, p.after); void mat; const puddle = add(new THREE.CircleGeometry(0.35, 24), new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', roughness: 0, transparent: true, opacity: 0.45, clearcoat: 1 }), -4.3, 0.008, 2.4, p.before); puddle.rotation.x = -Math.PI / 2; }
  { const p = pair('grab'); const bar = (x, y, z, len, ry = 0) => { const b = add(new THREE.CylinderGeometry(0.02, 0.02, len, 12), M.chrome, x, y, z, p.after); b.rotation.z = Math.PI / 2; b.rotation.y = ry; }; bar(-5.9, 0.75, 3.7, 0.6, Math.PI / 2); bar(-4.6, 0.8, 0.6, 1.2); bar(-5.2, 0.75, 4.42, 0.5); }
  { const p = pair('stairs'); for (const s of [-1, 1]) { const rail = add(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 12), M.chrome, -2.0 + s * 0.98, 0.55, 3.75, p.after); rail.rotation.x = Math.PI / 2 - 0.3; for (const k of [0, 1]) add(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 8), M.chrome, -2.0 + s * 0.98, 0.1 - k * 0.3, 3.2 + k * 1.1, p.after); } for (let i = 0; i < 3; i++) box(2.0, 0.02, 0.05, M.yellow, -2.0, 0.005 - i * 0.15, 3.0 + i * 0.45, p.after); const sl = new THREE.PointLight('#ffe6b0', 0, 4, 2); sl.position.set(-2, 0.9, 3.6); p.after.add(sl); H.stairs.light = sl; }
  { const p = pair('cords'); for (let i = 0; i < 2; i++) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(5.7, 0.02, -1.4 + i * 0.2), new THREE.Vector3(3.8, 0.02, -0.4 + i * 0.3), new THREE.Vector3(2.4, 0.02, -1.0 + i * 0.1), new THREE.Vector3(1.0, 0.02, -0.2)]); add(new THREE.TubeGeometry(c, 40, 0.012, 6), M.cord, 0, 0, 0, p.before); } const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(5.7, 0.02, -1.4), new THREE.Vector3(5.9, 0.02, -0.4), new THREE.Vector3(5.9, 0.02, 1.2)]); add(new THREE.TubeGeometry(c2, 20, 0.012, 6), M.cord, 0, 0, 0, p.after); }
  { const p = pair('clutter'); for (let i = 0; i < 6; i++) { const s = box(0.26, 0.1, 0.11, M.shoe, -3.3 + (Math.random() - 0.5) * 0.9, 0.05, -1.3 + (Math.random() - 0.5) * 0.7, p.before); s.rotation.y = Math.random() * Math.PI; } box(0.9, 0.35, 0.3, M.woodDark, -5.7, 0.18, -0.2, p.after); }
  { const p = pair('bedLight'); const lamp = add(new THREE.SphereGeometry(0.1, 16, 12), M.glowWarm, -5.35, 0.62, -3.9, p.after); void lamp; const bl = new THREE.PointLight('#ffcf8a', 0, 3.5, 2); bl.position.set(-5.3, 0.8, -3.8); p.after.add(bl); H.bedLight.light = bl; add(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 12), M.chrome, -5.35, 0.6, -3.9, p.after); }
  { const p = pair('shelf'); box(1.6, 0.04, 0.35, M.woodDark, 5.1, 1.9, 4.3); for (let i = 0; i < 4; i++) box(0.16, 0.24, 0.16, M.ceramic, 4.5 + i * 0.35, 2.04, 4.3, p.before); for (let i = 0; i < 4; i++) box(0.16, 0.24, 0.16, M.ceramic, 3.2 + i * 0.35, 1.06, 4.2, p.after); }
  { const p = pair('pet'); add(new THREE.CylinderGeometry(0.14, 0.11, 0.07, 20), new THREE.MeshStandardMaterial({ color: '#d04a4a', roughness: 0.4 }), 2.4, 0.035, 2.2, p.before); add(new THREE.CylinderGeometry(0.14, 0.11, 0.07, 20), new THREE.MeshStandardMaterial({ color: '#d04a4a', roughness: 0.4 }), 0.35, 0.035, 4.1, p.after); }
  { const p = pair('bedHeight'); p.before.add(bedLow); p.after.add(bedHigh); bedHigh.visible = true; }

  // ── Hazard markers (clickable) ────────────────
  const markers = [];
  for (const h of HAZARDS) {
    const g = new THREE.Group(); g.position.set(h.x, 0.02, h.z); root.add(g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 48), new THREE.MeshBasicMaterial({ color: '#ff4466', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ff4466', transparent: true, opacity: 0.5, depthWrite: false }));
    beam.position.y = 0.7; g.add(beam);
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ff4466' })); head.position.y = 1.5; g.add(head);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.7, 12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.85; hit.userData.hazard = h.id; g.add(hit);
    markers.push({ id: h.id, g, ring, beam, head, hit });
  }

  // ── Night route and the resident (a holographic figure) ──
  const routePts = NIGHT_ROUTE.map(([x, z]) => new THREE.Vector3(x, 0.03, z));
  const routeCurve = new THREE.CatmullRomCurve3(routePts, false, 'catmullrom', 0.3);
  const routeGeo = new THREE.BufferGeometry().setFromPoints(routeCurve.getPoints(160));
  routeGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(161 * 3).fill(1), 3));
  const route = new THREE.Line(routeGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
  root.add(route);
  const holo = new THREE.MeshStandardMaterial({ color: '#8ff6ff', emissive: '#3ff3ff', emissiveIntensity: 0.9, transparent: true, opacity: 0.75, roughness: 0.3 });
  const person = new THREE.Group(); root.add(person);
  const torso = add(new THREE.CapsuleGeometry(0.16, 0.5, 6, 16), holo, 0, 1.0, 0, person);
  add(new THREE.SphereGeometry(0.12, 20, 14), holo, 0, 1.5, 0.02, person);
  const legs = [add(new THREE.CapsuleGeometry(0.06, 0.55, 4, 10), holo, -0.08, 0.4, 0, person), add(new THREE.CapsuleGeometry(0.06, 0.55, 4, 10), holo, 0.08, 0.4, 0, person)];
  const cane = add(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 8), M.chrome, 0.24, 0.43, 0.12, person);
  void torso; void cane;
  const personLight = new THREE.PointLight('#3ff3ff', 0.6, 2.5, 2); personLight.position.y = 1.2; person.add(personLight);

  // ── Lighting: dusk ambience + room lamps (dimmed for the night view) ──
  const hemi = new THREE.HemisphereLight('#9fb3ff', '#2a1a10', 0.3); scene.add(hemi);
  const moon = new THREE.DirectionalLight('#9fb8ff', 0.45); moon.position.set(-8, 12, -6); scene.add(moon);
  const warm = [];
  for (const [x, z] of [[-3.8, -2.2], [3.2, -2.4], [3.0, 3.0], [-4.4, 2.6], [-2.0, 2.0]]) { const l = new THREE.PointLight('#ffc98a', 0.9, 7, 2); l.position.set(x, 2.2, z); scene.add(l); warm.push(l); }
  const rim = new THREE.SpotLight('#ff4fd8', 60, 40, 0.5, 0.7, 1.5); rim.position.set(12, 8, 10); scene.add(rim, rim.target);

  return { scene, root, H, markers, route, routeCurve, person, legs, warm, hemi, moon, M };
}
