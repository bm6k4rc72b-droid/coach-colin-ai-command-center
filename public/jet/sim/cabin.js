import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FUSELAGE } from './aircraft.js';

// ─────────────────────────────────────────────────────────────────────────────
// JET ATELIER · CABIN INTERIOR
// A "dollhouse" interior that sits inside the fuselage. The roof is removed with a
// clipping plane in the cabin view. Zones are laid out along the cabin from the
// forward galley to the aft lavatory; each zone module builds its own furniture.
// ─────────────────────────────────────────────────────────────────────────────

const { L, RF } = FUSELAGE;
const FLOOR = -0.55;                                         // floor height (m) in the reference fuselage
const X_FWD = L * 0.86 - L / 2, X_AFT = L * 0.34 - L / 2;    // usable cabin, nose side → tail side
const halfWidthAt = (y) => Math.sqrt(Math.max(0, RF * RF - y * y));

export function createCabinMaterials() {
  const carpetTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#888'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) { const v = 110 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 3); return t;
  })();
  const grainTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    for (let y = 0; y < 64; y++) { const v = 150 + 60 * Math.sin(y * 0.9 + Math.sin(y * 0.13) * 4) + Math.random() * 20; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, 256, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  return {
    leather: new THREE.MeshPhysicalMaterial({ color: '#cfc5b2', roughness: 0.6, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 0.5 }),
    veneer: new THREE.MeshPhysicalMaterial({ color: '#5a3a24', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, map: grainTex }),
    metal: new THREE.MeshPhysicalMaterial({ color: '#d4a94f', metalness: 1, roughness: 0.2 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#3a3432', roughness: 1, map: carpetTex }),
    lining: new THREE.MeshStandardMaterial({ color: '#b9b0a2', roughness: 0.9, side: THREE.BackSide }),
    linen: new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.95, envMapIntensity: 0.4 }),
    screen: new THREE.MeshPhysicalMaterial({ color: '#05060a', roughness: 0.05, clearcoat: 1, emissive: '#2a3a66', emissiveIntensity: 0.6 }),
    cove: new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
  };
}

const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

function seat(M, x, z, facing = 1) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(rbox(0.66, 0.24, 0.66, 0.05), M.leather); base.position.y = 0.34; g.add(base);
  const plinth = new THREE.Mesh(rbox(0.5, 0.22, 0.5, 0.03), M.veneer); plinth.position.y = 0.11; g.add(plinth);
  const back = new THREE.Mesh(rbox(0.14, 0.72, 0.66, 0.06), M.leather); back.position.set(-0.3, 0.76, 0); g.add(back);
  const head = new THREE.Mesh(rbox(0.12, 0.18, 0.46, 0.05), M.leather); head.position.set(-0.28, 1.18, 0); g.add(head);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(rbox(0.56, 0.12, 0.1, 0.04), M.leather); arm.position.set(0, 0.54, s * 0.33); g.add(arm); const tr = new THREE.Mesh(rbox(0.5, 0.02, 0.1, 0.008), M.metal); tr.position.set(0, 0.61, s * 0.33); g.add(tr); }
  g.position.set(x, FLOOR, z); g.rotation.y = facing > 0 ? 0 : Math.PI;
  return g;
}
function table(M, x, z, lx, lz, y = 0.72) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(rbox(lx, 0.05, lz, 0.02), M.veneer); top.position.y = y; g.add(top);
  const edge = new THREE.Mesh(rbox(lx + 0.02, 0.012, lz + 0.02, 0.006), M.metal); edge.position.y = y - 0.03; g.add(edge);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, y, 16), M.metal); post.position.y = y / 2; g.add(post);
  g.position.set(x, FLOOR, z); return g;
}
function divan(M, x, z, len, side) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(rbox(len, 0.42, 0.7, 0.05), M.leather); base.position.y = 0.21; g.add(base);
  const back = new THREE.Mesh(rbox(len, 0.52, 0.16, 0.06), M.leather); back.position.set(0, 0.62, side * 0.3); g.add(back);
  const plinth = new THREE.Mesh(rbox(len + 0.02, 0.06, 0.72, 0.02), M.veneer); plinth.position.y = 0.03; g.add(plinth);
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(rbox(0.38, 0.3, 0.12, 0.05), M.linen); p.position.set(-len / 2 + 0.4 + i * (len - 0.8) / 2, 0.6, side * 0.18); p.rotation.x = side * 0.25; g.add(p); }
  g.position.set(x, FLOOR, z); return g;
}
function bed(M, x, z) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(rbox(2.0, 0.34, 1.45, 0.04), M.veneer); frame.position.y = 0.17; g.add(frame);
  const mat = new THREE.Mesh(rbox(1.94, 0.2, 1.4, 0.08), M.linen); mat.position.y = 0.44; g.add(mat);
  const throwB = new THREE.Mesh(rbox(0.7, 0.03, 1.46, 0.015), M.leather); throwB.position.set(-0.55, 0.555, 0); g.add(throwB);
  const head = new THREE.Mesh(rbox(0.12, 0.8, 1.5, 0.05), M.leather); head.position.set(1.02, 0.6, 0); g.add(head);
  for (const s of [-0.36, 0.36]) { const p = new THREE.Mesh(rbox(0.3, 0.14, 0.5, 0.06), M.linen); p.position.set(0.78, 0.62, s); g.add(p); }
  g.position.set(x, FLOOR, z); return g;
}
function bulkhead(M, x, doorZ = -0.55, withScreen = false) {
  const g = new THREE.Group();
  const H = RF - FLOOR - 0.05, yMid = FLOOR + H / 2;
  const hw = halfWidthAt(yMid) - 0.05;
  // Two panels leaving a doorway at doorZ.
  const door = 0.75;
  const left = hw - (doorZ + door / 2), right = (doorZ - door / 2) + hw;
  if (left > 0.05) { const p = new THREE.Mesh(rbox(0.08, H, left, 0.02), M.veneer); p.position.set(0, yMid, doorZ + door / 2 + left / 2); g.add(p); }
  if (right > 0.05) { const p = new THREE.Mesh(rbox(0.08, H, right, 0.02), M.veneer); p.position.set(0, yMid, doorZ - door / 2 - right / 2); g.add(p); }
  const lintel = new THREE.Mesh(rbox(0.08, 0.1, hw * 2, 0.02), M.metal); lintel.position.set(0, FLOOR + H - 0.05, 0); g.add(lintel);
  if (withScreen) { const s = new THREE.Mesh(rbox(0.03, 0.62, 1.05, 0.01), M.screen); s.position.set(-0.06, FLOOR + 1.05, 0.5); g.add(s); }
  g.position.x = x; return g;
}
function galley(M, x0, x1) {
  const g = new THREE.Group();
  const len = x0 - x1;
  const counter = new THREE.Mesh(rbox(len * 0.8, 0.95, 0.6, 0.02), M.veneer); counter.position.set((x0 + x1) / 2, FLOOR + 0.475, 0.85); g.add(counter);
  const top = new THREE.Mesh(rbox(len * 0.8, 0.03, 0.62, 0.01), M.metal); top.position.set((x0 + x1) / 2, FLOOR + 0.96, 0.85); g.add(top);
  const upper = new THREE.Mesh(rbox(len * 0.8, 0.45, 0.4, 0.02), M.veneer); upper.position.set((x0 + x1) / 2, FLOOR + 1.55, 0.92); g.add(upper);
  return g;
}

// Zone builders: x0 = forward edge, x1 = aft edge of the zone.
const BUILD = {
  club(M, x0, x1) { const c = (x0 + x1) / 2, g = new THREE.Group(); for (const z of [0.72, -0.72]) { g.add(seat(M, c + 0.62, z, -1), seat(M, c - 0.62, z, 1)); } g.add(table(M, c, 0.95, 0.35, 0.4, 0.62), table(M, c, -0.95, 0.35, 0.4, 0.62)); return g; },
  dining(M, x0, x1) { const c = (x0 + x1) / 2, g = new THREE.Group(); for (const z of [0.7, -0.7]) { g.add(table(M, c, z, 0.9, 0.62)); g.add(seat(M, c + 0.92, z, -1), seat(M, c - 0.92, z, 1)); } return g; },
  divan(M, x0, x1) { const c = (x0 + x1) / 2, g = new THREE.Group(); g.add(divan(M, c, 0.78, Math.min(2.3, x0 - x1 - 0.4), 1)); g.add(seat(M, c + 0.62, -0.72, -1), seat(M, c - 0.62, -0.72, 1)); return g; },
  media(M, x0, x1) { const c = (x0 + x1) / 2, g = new THREE.Group(); g.add(divan(M, c - 0.2, 0.78, Math.min(1.9, x0 - x1 - 0.6), 1)); g.add(seat(M, c - 0.4, -0.72, 1), seat(M, c + 0.6, -0.72, 1)); g.add(table(M, c + 0.1, 0.1, 0.5, 0.4, 0.45)); return g; },
  suite(M, x0, x1) { const c = (x0 + x1) / 2, g = new THREE.Group(); g.add(bed(M, c, 0.35)); g.add(seat(M, c - 0.3, -0.85, 1)); const ns = new THREE.Mesh(rbox(0.4, 0.5, 0.4, 0.03), M.veneer); ns.position.set(c + 0.8, FLOOR + 0.25, -0.75); g.add(ns); return g; },
  office(M, x0, x1) { const c = (x0 + x1) / 2, g = new THREE.Group(); const desk = table(M, c, 0.82, 1.4, 0.6, 0.74); g.add(desk, seat(M, c - 0.2, 0.25, 1)); const sc = new THREE.Mesh(rbox(0.04, 0.34, 0.55, 0.01), M.screen); sc.position.set(c + 0.3, FLOOR + 0.98, 0.9); sc.rotation.y = -0.2; g.add(sc); g.add(seat(M, c + 0.62, -0.72, -1), seat(M, c - 0.62, -0.72, 1)); return g; },
};

// Build the full interior for a layout (array of zone ids, forward → aft).
export function buildCabin(M, layout) {
  const g = new THREE.Group();
  const hwFloor = halfWidthAt(FLOOR);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X_FWD - X_AFT + 1.2, hwFloor * 2), M.carpet); floor.rotation.x = -Math.PI / 2; floor.position.set((X_FWD + X_AFT) / 2, FLOOR + 0.002, 0); g.add(floor);
  // Sidewall lining (inside of the pressure shell) and veneer ledges with cove lighting.
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(RF - 0.06, RF - 0.06, X_FWD - X_AFT + 1.2, 48, 1, true, 0, Math.PI * 2), M.lining);
  lining.rotation.z = Math.PI / 2; lining.position.x = (X_FWD + X_AFT) / 2; g.add(lining);
  for (const s of [1, -1]) {
    const ledge = new THREE.Mesh(rbox(X_FWD - X_AFT, 0.08, 0.26, 0.02), M.veneer); ledge.position.set((X_FWD + X_AFT) / 2, FLOOR + 0.68, s * (halfWidthAt(FLOOR + 0.68) - 0.2)); g.add(ledge);
    const cove = new THREE.Mesh(new THREE.BoxGeometry(X_FWD - X_AFT, 0.02, 0.03), M.cove); cove.position.set((X_FWD + X_AFT) / 2, FLOOR + 0.73, s * (halfWidthAt(FLOOR + 0.73) - 0.08)); g.add(cove);
    const cove2 = cove.clone(); cove2.position.y = FLOOR + 1.55; cove2.position.z = s * (halfWidthAt(FLOOR + 1.55) - 0.05); g.add(cove2);
  }
  // Forward galley, zones, aft lavatory bulkhead.
  const galleyLen = 1.6, lavLen = 1.3;
  g.add(galley(M, X_FWD, X_FWD - galleyLen), bulkhead(M, X_FWD - galleyLen));
  const zoneLen = (X_FWD - galleyLen - (X_AFT + lavLen)) / layout.length;
  const zones = [];
  layout.forEach((id, i) => {
    const x0 = X_FWD - galleyLen - i * zoneLen, x1 = x0 - zoneLen;
    const z = BUILD[id](M, x0, x1); z.userData.zone = i; g.add(z);
    zones.push({ id, x0, x1, group: z });
    if (i < layout.length - 1) g.add(bulkhead(M, x1, i % 2 ? 0.5 : -0.5, layout[i + 1] === 'media'));
  });
  g.add(bulkhead(M, X_AFT + lavLen, 0));
  const lav = new THREE.Mesh(rbox(0.6, 0.85, 0.5, 0.03), M.veneer); lav.position.set(X_AFT + 0.5, FLOOR + 0.43, 0.7); g.add(lav);
  // Cabin lights (their colour temperature is set by the lighting section).
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const pl = new THREE.PointLight('#ffd9a0', 0.8, 4.5, 2);
    pl.position.set(X_FWD - 0.8 - i * ((X_FWD - X_AFT - 1.6) / 4), RF - 0.2, 0); g.add(pl); lights.push(pl);
  }
  g.userData = { zones, lights, zoneLen, floorY: FLOOR };
  return g;
}

export const CABIN = { FLOOR, X_FWD, X_AFT };
