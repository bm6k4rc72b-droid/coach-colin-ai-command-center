import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite } from './holo.js';
import { fbmish } from './noise.js';

// ─────────────────────────────────────────────────────────────────────────────
// KEYLIGHT · the hero (an original design: a cropped navy jacket, a long red scarf, chunky boots,
// spiky chestnut hair) and the Lumen Key (a silver-blue blade with a gold hilt ring and crystal teeth),
// plus the Hollows: smoky violet creatures with a single teal eye.
// ─────────────────────────────────────────────────────────────────────────────

export function buildHero() {
  const root = new THREE.Group(), J = {};
  const jacket = new THREE.MeshStandardMaterial({ color: '#1f2d5a', roughness: 0.7 }), shirt = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.8 }), skin = new THREE.MeshStandardMaterial({ color: '#e2b394', roughness: 0.65 });
  const hair = new THREE.MeshStandardMaterial({ color: '#6a3f24', roughness: 0.6 }), scarfM = new THREE.MeshStandardMaterial({ color: '#c8323e', roughness: 0.7, side: THREE.DoubleSide });
  const boot = new THREE.MeshStandardMaterial({ color: '#e0b43a', roughness: 0.5 }), sole = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.9 });
  const add = (p, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; p.add(m); return m; };
  const joint = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
  const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, r);
  const hips = joint('hips', root, 0, 0.92, 0), chest = joint('chest', hips, 0, 0.12, 0);
  add(hips, RB(0.32, 0.18, 0.2), pants);
  add(chest, RB(0.3, 0.42, 0.19, 0.06), shirt, [0, 0.22, 0]);
  add(chest, RB(0.36, 0.3, 0.22, 0.06), jacket, [0, 0.3, 0]); for (const s of [-1, 1]) add(chest, RB(0.08, 0.36, 0.215, 0.03), jacket, [s * 0.13, 0.22, 0.005]);
  const neck = joint('neck', chest, 0, 0.47, 0); add(neck, new THREE.CylinderGeometry(0.05, 0.055, 0.08, 12), skin);
  // Scarf: a wrap and two long tails that flutter.
  add(neck, new THREE.TorusGeometry(0.08, 0.035, 8, 20).rotateX(Math.PI / 2), scarfM, [0, -0.01, 0]);
  const tails = []; for (const s of [-1, 1]) { const t = joint('tail' + s, neck, s * 0.04, -0.02, -0.08); const seg = add(t, new THREE.PlaneGeometry(0.09, 0.5, 1, 6).translate(0, -0.25, 0), scarfM); tails.push({ t, seg, s }); }
  const head = joint('head', neck, 0, 0.12, 0.01);
  const face = add(head, new THREE.SphereGeometry(0.115, 24, 18), skin, [0, 0.03, 0.01]); face.scale.set(0.95, 1.08, 1.0);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#2a5fbf' }), [s * 0.04, 0.045, 0.108]);
  // Spiky hair: a cap plus swept cones.
  add(head, new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, [0, 0.06, -0.01]);
  for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2, up = 0.3 + (i % 3) * 0.15; add(head, new THREE.ConeGeometry(0.045, 0.2, 6), hair, [Math.sin(a) * 0.08, 0.12 + Math.cos(a) * 0.02, Math.cos(a) * 0.06 - 0.03], [-Math.cos(a) * (1.1 - up) - 0.4, 0, Math.sin(a) * (1.2 - up)]); }
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.2, 0.4, 0), el = joint('el' + k, sh, 0, -0.27, 0), wr = joint('wr' + k, el, 0, -0.25, 0);
    add(sh, new THREE.CapsuleGeometry(0.055, 0.2, 4, 10), jacket, [0, -0.13, 0]); add(el, new THREE.CapsuleGeometry(0.045, 0.19, 4, 10), jacket, [0, -0.12, 0]);
    add(wr, new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.6 }), [0, -0.04, 0]);
    const hip = joint('hip' + k, hips, s * 0.09, -0.06, 0), kn = joint('kn' + k, hip, 0, -0.41, 0);
    add(hip, new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), pants, [0, -0.2, 0]); add(kn, new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), pants, [0, -0.19, 0]);
    add(kn, RB(0.15, 0.13, 0.3, 0.05), boot, [0, -0.4, 0.05]); add(kn, RB(0.16, 0.04, 0.32, 0.015), sole, [0, -0.47, 0.05]);
  }
  // The Lumen Key, held in the right hand.
  const keyG = new THREE.Group(); J.wrR.add(keyG); keyG.position.set(0, -0.06, 0.02); keyG.rotation.x = -Math.PI / 2;
  const blade = new THREE.MeshPhysicalMaterial({ color: '#cfe6ff', roughness: 0.15, metalness: 0.9, clearcoat: 1, emissive: '#3a6aff', emissiveIntensity: 0.15 });
  const goldM = new THREE.MeshStandardMaterial({ color: '#e6c25a', roughness: 0.25, metalness: 1 });
  add(keyG, new THREE.CylinderGeometry(0.022, 0.022, 0.18, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a2a40' }), [0, 0, 0]);
  add(keyG, new THREE.TorusGeometry(0.11, 0.018, 10, 32), goldM, [0, 0, 0.12], [0, 0, 0]);
  add(keyG, new THREE.CylinderGeometry(0.022, 0.03, 0.85, 12).rotateX(Math.PI / 2), blade, [0, 0, 0.55]);
  const teeth = new THREE.Group(); teeth.position.set(0, 0, 0.95); keyG.add(teeth);
  add(teeth, new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshPhysicalMaterial({ color: '#9fe8ff', roughness: 0.05, transmission: 0.6, thickness: 0.3, emissive: '#3aa0ff', emissiveIntensity: 0.5 }), [0, 0.06, 0]);
  add(teeth, RB(0.04, 0.14, 0.06, 0.01), blade, [0, 0.1, -0.06]); add(teeth, RB(0.04, 0.1, 0.05, 0.01), blade, [0, 0.08, 0.04]);
  const charm = add(keyG, new THREE.OctahedronGeometry(0.035, 0), goldM, [0, -0.12, -0.08]);
  const tipGlow = glowSprite('#9fe8ff', 0.45, 0.9); tipGlow.position.set(0, 0.06, 0.95); keyG.add(tipGlow);
  // Swing trail: a ribbon sprite we fade in on swings.
  const trail = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.25, 40, 1, -0.9, 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); trail.position.y = 1.1; root.add(trail);
  root.userData = { J, tails, trail, tipGlow, charm };
  return root;
}
// mode: 'idle' | 'run' | 'swing' (with phase 0..1 and step) | 'cast' | 'roll' | 'down'
export function poseHero(h, mode, t, { spd = 0, ph = 0, step = 0 } = {}) {
  const { J, tails, trail } = h.userData;
  for (const k of ['L', 'R']) { J['sh' + k].rotation.set(0, 0, 0); J['el' + k].rotation.set(0, 0, 0); J['hip' + k].rotation.set(0, 0, 0); J['kn' + k].rotation.set(0, 0, 0); }
  J.hips.position.y = 0.92; J.chest.rotation.set(0, 0, 0); J.head.rotation.set(0, 0, 0); h.rotation.x = 0; h.rotation.z = 0;
  const run = t * (2.4 + spd * 1.3), a = Math.min(1, spd / 5) * 0.8;
  J.hipL.rotation.x = Math.sin(run) * a; J.hipR.rotation.x = -Math.sin(run) * a; J.knL.rotation.x = Math.max(0, -Math.sin(run + 0.6)) * a * 1.4; J.knR.rotation.x = Math.max(0, Math.sin(run + 0.6)) * a * 1.4;
  J.shL.rotation.x = -Math.sin(run) * a * 0.8; J.hips.position.y = 0.92 - Math.abs(Math.sin(run)) * 0.04 * a; J.chest.rotation.x = a * 0.15;
  // Key held ready: right arm forward-low.
  J.shR.rotation.x = -0.5; J.elR.rotation.x = -0.6; J.shR.rotation.z = 0.15;
  trail.material.opacity = Math.max(0, trail.material.opacity - 0.08);
  if (mode === 'swing') {
    // Horizontal arcs alternating direction; the finisher is a full spin.
    const dir = step % 2 ? -1 : 1, e = Math.sin(Math.min(1, ph) * Math.PI / 2);
    J.chest.rotation.y = dir * (1.2 - 2.4 * e); J.shR.rotation.x = -1.4; J.shR.rotation.z = 0.2 + 0.6 * (1 - e); J.elR.rotation.x = -0.25;
    if (step === 3) h.rotation.y += 0; trail.rotation.y = J.chest.rotation.y; trail.material.opacity = ph > 0.2 && ph < 0.75 ? 0.55 : trail.material.opacity;
    J.hipL.rotation.x = -0.4; J.knL.rotation.x = 0.5; J.hipR.rotation.x = 0.3; J.hips.position.y = 0.86;
  } else if (mode === 'cast') { J.shL.rotation.x = -1.6; J.elL.rotation.x = -0.1; J.shR.rotation.x = -1.2; }
  else if (mode === 'roll') { h.rotation.x = ph * Math.PI * 2; J.hips.position.y = 0.5; J.hipL.rotation.x = J.hipR.rotation.x = -1.6; J.knL.rotation.x = J.knR.rotation.x = 2.2; }
  else if (mode === 'down') { h.rotation.x = -1.45; J.hips.position.y = 0.25; }
  for (const { t: tl, s } of tails) { tl.rotation.x = 0.5 + Math.sin(t * 6 + s) * 0.18 + a * 0.6; tl.rotation.z = s * 0.15 + Math.sin(t * 4 + s * 2) * 0.1; }
}

// A Hollow: a lumpy smoke body, tendril limbs, one glowing eye. rise ∈ [0, 1] emerges it from the floor.
export function buildHollow() {
  const root = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.42, 32, 24), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbmish(v.x * 4, v.y * 4, v.z * 4); v.multiplyScalar(1 + (n - 0.5) * 0.5); v.y *= 1.3; p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals();
  const smoke = new THREE.MeshStandardMaterial({ color: '#2a1a3e', roughness: 0.9, emissive: '#3a1a5a', emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(geo, smoke); body.position.y = 0.6; body.castShadow = true; root.add(body);
  const limbs = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 6), smoke); const a = (i / 4) * Math.PI * 2 + 0.4; l.position.set(Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); root.add(l); limbs.push(l); }
  const eye = glowSprite('#4ff0d8', 0.55, 1); eye.position.set(0, 0.85, 0.36); root.add(eye);
  const eyeCore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#b8fff2' })); eyeCore.position.set(0, 0.85, 0.34); root.add(eyeCore);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.7, depthWrite: false })); puddle.position.y = 0.03; root.add(puddle);
  root.userData = { body, limbs, eye, puddle };
  return root;
}
