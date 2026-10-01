import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// VANGUARD · the suit. An original articulated powered-armour model (2.05 m), built from lathe
// shells, rounded plates and emissive seams on a jointed rig (pelvis → spine → chest → head,
// shoulder → elbow → wrist, hip → knee → ankle). Every armour piece remembers its locked
// position and a fly-in offset, so the suit can assemble itself plate by plate around the pilot.
// ─────────────────────────────────────────────────────────────────────────────

const M = {
  paint: new THREE.MeshPhysicalMaterial({ color: '#2a2e36', metalness: 0.85, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.28 }),
  crimson: new THREE.MeshPhysicalMaterial({ color: '#7a0c18', metalness: 0.65, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.25 }),
  gold: new THREE.MeshPhysicalMaterial({ color: '#b8862f', metalness: 1, roughness: 0.3, envMapIntensity: 0.4 }),
  under: new THREE.MeshStandardMaterial({ color: '#0d0e12', metalness: 0.4, roughness: 0.7, envMapIntensity: 0.3 }),
  seam: new THREE.MeshBasicMaterial({ color: '#ffb347' }),
  core: new THREE.MeshBasicMaterial({ color: '#7ff6ff' }),
  eye: new THREE.MeshBasicMaterial({ color: '#d8fbff' }),
};
export const SUIT_MATS = M;

// A lathe shell from a list of [radius, y] (top → bottom), squashed front-to-back by sz.
function lathe(prof, sz = 1, seg = 40, phi0 = 0, phiL = Math.PI * 2) {
  // Profiles are written top → bottom; LatheGeometry wants bottom → top for outward-facing normals.
  if (prof[0][1] > prof[prof.length - 1][1]) prof = [...prof].reverse();
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiL); g.scale(1, 1, sz); g.computeVertexNormals(); return g;
}
const ring = (r, t = 0.008, sz = 1) => { const g = new THREE.TorusGeometry(r, t, 6, 48); g.rotateX(Math.PI / 2); g.scale(1, 1, sz); return g; };

export function buildSuit() {
  const root = new THREE.Group(), parts = [], J = {};
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  // Armour piece: mesh + fly-in offset (in the parent's space) + assembly order.
  const piece = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], order = 0, armour = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (armour) { const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(1.6 + Math.random() * 1.6); parts.push({ m, base: m.position.clone(), rot: m.rotation.clone(), off: d, spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3), order }); }
    return m;
  };

  // ── Rig ──────────────────────────────────────────
  const pelvis = joint('pelvis', root, 0, 1.02, 0), spine = joint('spine', pelvis, 0, 0.12, 0), chest = joint('chest', spine, 0, 0.26, 0), neck = joint('neck', chest, 0, 0.22, 0), head = joint('head', neck, 0, 0.1, 0);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.26, 0.13, -0.01), el = joint('el' + k, sh, 0, -0.33, 0), wr = joint('wr' + k, el, 0, -0.3, 0.01);
    const hip = joint('hip' + k, pelvis, s * 0.115, -0.06, 0), kn = joint('kn' + k, hip, 0, -0.45, 0), an = joint('an' + k, kn, 0, -0.44, 0);
    // Undersuit (not part of the assembly — it is the pilot's flight suit).
    piece(sh, new THREE.CapsuleGeometry(0.058, 0.24, 6, 14), M.under, [0, -0.16, 0], [0, 0, 0], 0, false);
    piece(el, new THREE.CapsuleGeometry(0.05, 0.22, 6, 14), M.under, [0, -0.15, 0], [0, 0, 0], 0, false);
    piece(hip, new THREE.CapsuleGeometry(0.075, 0.34, 6, 14), M.under, [0, -0.22, 0], [0, 0, 0], 0, false);
    piece(kn, new THREE.CapsuleGeometry(0.06, 0.34, 6, 14), M.under, [0, -0.22, 0], [0, 0, 0], 0, false);

    // Boots (order 0): sole, toe cap, ankle cuff, thruster.
    const boot = piece(an, new RoundedBoxGeometry(0.13, 0.09, 0.27, 3, 0.03), M.paint, [0, -0.04, 0.045], [0, 0, 0], 0);
    piece(an, new RoundedBoxGeometry(0.135, 0.05, 0.1, 3, 0.02), M.crimson, [0, -0.005, 0.14], [0.25, 0, 0], 0.05);
    piece(an, lathe([[0.072, 0.07], [0.08, 0.02], [0.075, -0.03]], 1.05), M.paint, [0, 0, -0.01], [0, 0, 0], 0.1);
    piece(an, ring(0.079, 0.006), M.seam, [0, 0.07, -0.01], [0, 0, 0], 0.12);
    const sole = piece(an, new THREE.CircleGeometry(0.045, 24), M.core, [0, -0.086, 0.0], [Math.PI / 2, 0, 0], 0.15); sole.material = sole.material.clone();
    void boot;
    // Greaves (order 1): shin shell, crimson front plate, knee cap.
    piece(kn, lathe([[0.072, -0.02], [0.082, -0.12], [0.074, -0.3], [0.066, -0.4]], 1.1), M.paint, [0, 0, 0], [0, 0, 0], 1);
    piece(kn, lathe([[0.086, -0.06], [0.094, -0.15], [0.084, -0.3]], 1.1, 20, -Math.PI / 3, (Math.PI * 2) / 3), M.crimson, [0, 0, 0.006], [0, 0, 0], 1.05);
    piece(kn, new THREE.SphereGeometry(0.07, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, [0, 0.0, 0.05], [Math.PI / 2.2, 0, 0], 1.1);
    piece(kn, ring(0.075, 0.006, 1.1), M.seam, [0, -0.4, 0], [0, 0, 0], 1.12);
    // Thighs (order 2).
    piece(hip, lathe([[0.1, -0.02], [0.108, -0.14], [0.094, -0.32], [0.08, -0.42]], 1.05), M.paint, [0, 0, 0], [0, 0, 0], 2);
    piece(hip, lathe([[0.112, -0.08], [0.116, -0.2], [0.1, -0.33]], 1.08, 20, Math.PI / 2 - (s < 0 ? 0 : 0) - 0.9, 1.8), M.crimson, [0, 0, 0], [0, s < 0 ? Math.PI : 0, 0], 2.05);
    piece(hip, ring(0.096, 0.006, 1.05), M.seam, [0, -0.3, 0], [0, 0, 0], 2.1);
    // Upper arms + pauldron (order 5), gauntlets (order 6), hands (order 7).
    piece(sh, lathe([[0.068, -0.04], [0.074, -0.14], [0.064, -0.28]], 1), M.paint, [0, 0, 0], [0, 0, 0], 5);
    piece(sh, new THREE.SphereGeometry(0.11, 28, 18, 0, Math.PI * 2, 0, Math.PI / 1.9), M.crimson, [s * 0.015, 0.02, 0], [0, 0, s * -0.35], 5.2);
    piece(sh, new THREE.SphereGeometry(0.114, 28, 6, 0, Math.PI * 2, Math.PI / 2.2, 0.12), M.gold, [s * 0.015, 0.02, 0], [0, 0, s * -0.35], 5.25);
    piece(el, lathe([[0.058, 0.0], [0.07, -0.1], [0.066, -0.22], [0.056, -0.28]], 1.05), M.crimson, [0, 0, 0], [0, 0, 0], 6);
    piece(el, lathe([[0.072, -0.05], [0.075, -0.17]], 1.05, 30, Math.PI / 2 + (s < 0 ? Math.PI : 0) - 0.7, 1.4), M.paint, [0, 0, 0], [0, 0, 0], 6.05);
    piece(el, ring(0.068, 0.006, 1.05), M.seam, [0, -0.06, 0], [0, 0, 0], 6.1);
    piece(el, ring(0.06, 0.006, 1.05), M.seam, [0, -0.27, 0], [0, 0, 0], 6.12);
    piece(wr, new RoundedBoxGeometry(0.05, 0.1, 0.1, 3, 0.018), M.paint, [0, -0.05, 0.0], [0, 0, 0], 7);
    for (let f = 0; f < 4; f++) piece(wr, new THREE.CapsuleGeometry(0.0125, 0.055, 4, 8), M.paint, [0, -0.13, 0.036 - f * 0.024], [0, 0, 0], 7.05);
    piece(wr, new THREE.CapsuleGeometry(0.013, 0.04, 4, 8), M.paint, [s * -0.02, -0.07, 0.055], [0.6, 0, s * 0.4], 7.05);
    const palm = piece(wr, new THREE.CircleGeometry(0.026, 24), M.core, [s * -0.0265, -0.055, 0], [0, s * -Math.PI / 2, 0], 7.1); palm.material = palm.material.clone();
    J['palm' + k] = palm; J['sole' + k] = sole;
  }
  // ── Torso (order 3–4) ────────────────────────────
  piece(pelvis, lathe([[0.15, 0.06], [0.17, 0.0], [0.155, -0.08], [0.11, -0.12]], 0.72), M.paint, [0, 0, 0], [0, 0, 0], 3);
  piece(pelvis, new RoundedBoxGeometry(0.12, 0.12, 0.03, 3, 0.012), M.crimson, [0, -0.04, 0.12], [0.15, 0, 0], 3.05);
  for (let i = 0; i < 3; i++) piece(spine, lathe([[0.15 + i * 0.012, 0.03], [0.158 + i * 0.012, 0.0], [0.15 + i * 0.012, -0.03]], 0.7), i === 1 ? M.crimson : M.paint, [0, 0.04 + i * 0.075, 0], [0, 0, 0], 3.2 + i * 0.05);
  piece(chest, lathe([[0.12, 0.24], [0.2, 0.2], [0.24, 0.1], [0.22, -0.02], [0.18, -0.08]], 0.66), M.crimson, [0, 0, 0], [0, 0, 0], 4);
  piece(chest, lathe([[0.15, 0.21], [0.21, 0.18], [0.248, 0.09], [0.228, -0.01], [0.19, -0.07]], 0.68, 30, -0.85, 1.7), M.paint, [0, 0, 0.004], [0, 0, 0], 4.1);
  piece(chest, new RoundedBoxGeometry(0.34, 0.22, 0.12, 3, 0.04), M.paint, [0, 0.07, -0.13], [0, 0, 0], 4.15);                   // backpack
  for (const s of [-1, 1]) {
    piece(chest, new THREE.CylinderGeometry(0.035, 0.05, 0.08, 20, 1, true), M.gold, [s * 0.09, -0.05, -0.17], [0, 0, 0], 4.2);
    const jet = piece(chest, new THREE.CircleGeometry(0.034, 20), M.core, [s * 0.09, -0.09, -0.17], [Math.PI / 2, 0, 0], 4.25); jet.material = jet.material.clone(); J['jet' + (s < 0 ? 'R' : 'L')] = jet;
  }
  piece(chest, ring(0.2, 0.007, 0.68), M.seam, [0, -0.02, 0], [0, 0, 0], 4.3);
  piece(chest, ring(0.15, 0.006, 0.7), M.seam, [0, 0.21, 0], [0, 0, 0], 4.3);
  // The core: hexagonal cell with a gold bezel, set into the sternum.
  const coreGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.02, 6); coreGeo.rotateX(Math.PI / 2);
  const core = piece(chest, coreGeo, M.core, [0, 0.1, 0.176], [0, 0, Math.PI / 6], 4.4); core.material = M.core.clone();
  const bezel = new THREE.TorusGeometry(0.062, 0.009, 6, 6); piece(chest, bezel, M.gold, [0, 0.1, 0.174], [0, 0, Math.PI / 6], 4.42);
  // ── Helmet (order 8) ─────────────────────────────
  piece(neck, new THREE.CylinderGeometry(0.06, 0.07, 0.08, 20), M.under, [0, 0.0, 0], [0, 0, 0], 0, false);
  const hp = [[0.001, 0.175], [0.07, 0.168], [0.112, 0.138], [0.13, 0.08], [0.13, 0.02], [0.12, -0.04], [0.098, -0.09], [0.06, -0.115], [0.001, -0.12]];
  piece(head, lathe(hp, 1.12, 48), M.paint, [0, 0.04, -0.012], [0, 0, 0], 8);
  piece(head, lathe(hp.slice(1, 8).map(([r, y]) => [r * 1.035, y]), 1.12, 32, -0.95, 1.9), M.crimson, [0, 0.04, -0.008], [0, 0, 0], 8.3);           // faceplate
  piece(head, new RoundedBoxGeometry(0.15, 0.022, 0.05, 2, 0.008), M.paint, [0, 0.105, 0.112], [0.35, 0, 0], 8.32);                              // brow ridge
  piece(head, new RoundedBoxGeometry(0.1, 0.03, 0.04, 2, 0.01), M.gold, [0, -0.05, 0.128], [0.2, 0, 0], 8.35);                                     // jaw
  for (let i = 0; i < 3; i++) piece(head, new THREE.BoxGeometry(0.05 - i * 0.01, 0.004, 0.01), M.under, [0, -0.012 - i * 0.012, 0.145], [0.1, 0, 0], 8.36); // mouth vents
  piece(head, new RoundedBoxGeometry(0.02, 0.07, 0.2, 2, 0.008), M.crimson, [0, 0.19, -0.01], [0.12, 0, 0], 8.4);                                  // crest
  for (const s of [-1, 1]) { piece(head, new THREE.CylinderGeometry(0.045, 0.05, 0.03, 24), M.gold, [s * 0.132, 0.05, -0.01], [0, 0, Math.PI / 2], 8.42); piece(head, ring(0.035, 0.004), M.seam, [s * 0.15, 0.05, -0.01], [0, 0, Math.PI / 2], 8.44); }
  const eyes = [];
  for (const s of [-1, 1]) { const e = piece(head, new RoundedBoxGeometry(0.05, 0.011, 0.012, 2, 0.005), M.eye, [s * 0.037, 0.07, 0.142], [0.1, s * 0.38, s * -0.14], 8.5); e.material = M.eye.clone(); eyes.push(e); }

  // Glow sprites (core, eyes, palms, soles, jets).
  const glows = {};
  const glow = (name, parent, color, size, pos) => { const g = glowSprite(color, size, 0.9); g.position.set(...pos); parent.add(g); glows[name] = g; return g; };
  glow('core', chest, '#5ff3ff', 0.26, [0, 0.1, 0.2]);
  glow('eyes', head, '#bff8ff', 0.13, [0, 0.07, 0.16]);
  for (const k of ['L', 'R']) { glow('palm' + k, J['wr' + k], '#7ff6ff', 0.2, [(k === 'R' ? 1 : -1) * 0.04, -0.055, 0]); glow('sole' + k, J['an' + k], '#7ff6ff', 0.28, [0, -0.1, 0]); glow('jet' + k, chest, '#ffc070', 0.24, [(k === 'R' ? -1 : 1) * 0.09, -0.12, -0.17]); }
  const coreLight = new THREE.PointLight('#5ff3ff', 1, 2, 2); coreLight.position.set(0, 0.1, 0.28); chest.add(coreLight);

  // Bulk: thicker limb armour and a broader torso (scale meshes, keep joints).
  const bulk = (g, sx, sy, moveToo) => g.children.forEach((c) => { if (c.isMesh || c.isSprite) { if (c.isMesh) { c.scale.x *= sx; c.scale.z *= sx; c.scale.y *= sy; } if (moveToo) { c.position.x *= sx; c.position.z *= sx; } } });
  for (const k of ['L', 'R']) { bulk(J['sh' + k], 1.25, 1, true); bulk(J['el' + k], 1.2, 1, true); bulk(J['hip' + k], 1.18, 1, true); bulk(J['kn' + k], 1.15, 1, true); bulk(J['an' + k], 1.1, 1, true); J['sh' + k].position.x *= 1.1; }
  bulk(chest, 1.14, 1.06, true); bulk(spine, 1.1, 1, true); bulk(pelvis, 1.08, 1, true);
  parts.forEach((p) => p.base.copy(p.m.position));
  parts.sort((a, b) => a.order - b.order);
  root.userData = { parts, J, glows, eyes, core, coreLight };
  return root;
}

// Assembly: u ∈ [0, 1]. Plates fly in from their offsets, spinning, ordered feet → helmet.
const ease = (x) => 1 - Math.pow(1 - x, 4);
export function assemble(suit, u) {
  const P = suit.userData.parts, maxO = 8.5, lock = [];
  for (const p of P) {
    const start = (p.order / maxO) * 0.72, e = Math.max(0, Math.min(1, (u - start) / 0.22)), k = ease(e);
    p.m.position.copy(p.base).addScaledVector(p.off, 1 - k);
    p.m.rotation.set(p.rot.x + p.spin.x * (1 - k), p.rot.y + p.spin.y * (1 - k), p.rot.z + p.spin.z * (1 - k));
    p.m.visible = u > 0.001 || e > 0;
    if (e >= 1 && !p.locked) lock.push(p); p.locked = e >= 1;
  }
  return lock;   // pieces that locked this frame (for sparks)
}

// Poses: blend of idle (breathing) and hover (legs trailing, palms down, thrusters lit).
export function pose(suit, t, { hover = 0, power = 1, look = 0 }) {
  const J = suit.userData.J, b = Math.sin(t * 1.3) * 0.012;
  J.chest.rotation.x = -b - hover * 0.05; J.spine.rotation.x = hover * 0.08; J.head.rotation.y = look; J.head.rotation.x = b * 2 - hover * 0.08;
  for (const [k, s] of [['L', 1], ['R', -1]]) {
    J['sh' + k].rotation.z = s * (0.12 + hover * 0.42) + s * b; J['sh' + k].rotation.x = -hover * 0.25;
    J['el' + k].rotation.x = -0.18 - hover * 0.2; J['wr' + k].rotation.z = s * hover * 0.9; J['wr' + k].rotation.x = hover * 0.2;
    J['hip' + k].rotation.x = hover * 0.12; J['hip' + k].rotation.z = s * (0.03 + hover * 0.05); J['kn' + k].rotation.x = hover * 0.35; J['an' + k].rotation.x = hover * 0.55;
  }
  const G = suit.userData.glows, flick = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 23);
  G.core.material.opacity = power * (0.75 + 0.25 * Math.sin(t * 2.2)); G.core.scale.setScalar(0.26 * (0.9 + 0.1 * Math.sin(t * 2.2)));
  G.eyes.material.opacity = power;
  for (const k of ['L', 'R']) { G['palm' + k].material.opacity = power * (0.25 + hover * 0.75 * flick); G['palm' + k].scale.setScalar(0.12 + hover * 0.35 * flick); G['sole' + k].material.opacity = power * (0.2 + hover * 0.8 * flick); G['sole' + k].scale.setScalar(0.15 + hover * 0.6 * flick); G['jet' + k].material.opacity = power * hover * flick; G['jet' + k].scale.setScalar(0.1 + hover * 0.3 * flick); }
  suit.userData.core.material.color.setRGB(0.5 * power + 0.1, 0.96 * power + 0.04, power + 0.05);
  suit.userData.eyes.forEach((e) => e.material.color.setRGB(0.85 * power + 0.05, power, power));
  suit.userData.coreLight.intensity = 1 * power;
}
