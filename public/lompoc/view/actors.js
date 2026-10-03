import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// DROPZONE: LOMPOC · actors: an operator (jointed, with a running cycle, a parachute and a ram-air
// canopy), the cargo plane that carries everyone over the map, and marker sprites.
// ─────────────────────────────────────────────────────────────────────────────

export function buildOperator(color = '#55603f', accent = '#ff8a2a') {
  const root = new THREE.Group(), J = {};
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), gear = new THREE.MeshStandardMaterial({ color: '#2d2f2a', roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b08468', roughness: 0.7 }), acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, emissive: accent, emissiveIntensity: 0.15 });
  const metal = new THREE.MeshStandardMaterial({ color: '#25272b', metalness: 0.7, roughness: 0.4 });
  const add = (p, geo, mat, pos = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; p.add(m); return m; };
  const joint = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
  const hips = joint('hips', root, 0, 0.95, 0), chest = joint('chest', hips, 0, 0.18, 0);
  add(hips, new RoundedBoxGeometry(0.34, 0.2, 0.22, 2, 0.06), cloth);
  add(chest, new RoundedBoxGeometry(0.42, 0.5, 0.26, 2, 0.08), cloth, [0, 0.22, 0]);
  add(chest, new RoundedBoxGeometry(0.44, 0.36, 0.3, 2, 0.05), gear, [0, 0.24, 0.02]);     // plate carrier
  add(chest, new RoundedBoxGeometry(0.32, 0.42, 0.18, 2, 0.05), gear, [0, 0.24, -0.22]);  // pack
  add(chest, new THREE.BoxGeometry(0.12, 0.05, 0.31), acc, [0.17, 0.42, 0]);             // arm band
  const head = joint('head', chest, 0, 0.55, 0);
  add(head, new THREE.SphereGeometry(0.11, 16, 12), skin, [0, 0.08, 0.01]);
  const helm = add(head, new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth, [0, 0.1, 0]); helm.scale.set(1, 0.9, 1.08);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.27, 0.42, 0), el = joint('el' + k, sh, 0, -0.28, 0);
    add(sh, new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), cloth, [0, -0.14, 0]); add(el, new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), cloth, [0, -0.13, 0]);
    add(el, new THREE.SphereGeometry(0.05, 8, 6), gear, [0, -0.28, 0]);
    const hip = joint('hip' + k, hips, s * 0.1, -0.06, 0), kn = joint('kn' + k, hip, 0, -0.42, 0);
    add(hip, new THREE.CapsuleGeometry(0.08, 0.28, 4, 8), cloth, [0, -0.2, 0]); add(kn, new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), cloth, [0, -0.2, 0]);
    add(kn, new RoundedBoxGeometry(0.12, 0.1, 0.26, 2, 0.03), gear, [0, -0.42, 0.04]);
  }
  // Rifle held across the chest.
  const gun = joint('gun', chest, 0.05, 0.25, 0.25); add(gun, new THREE.BoxGeometry(0.06, 0.1, 0.8), metal, [0, 0, 0.1]); add(gun, new THREE.BoxGeometry(0.05, 0.14, 0.08), metal, [0, -0.1, -0.05]); gun.rotation.set(0.1, -0.5, 0);
  // Ram-air canopy (7 cells on an arc) with suspension lines.
  const canopy = new THREE.Group(); canopy.position.y = 7.2; root.add(canopy);
  const cm = [new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#2e3a2c', roughness: 0.7, side: THREE.DoubleSide })];
  for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.17, c = add(canopy, new THREE.BoxGeometry(1.25, 0.32, 3.1), cm[i % 2], [Math.sin(a) * 4.4, Math.cos(a) * 4.4 - 4.4, 0]); c.rotation.z = -a; }
  const lines = []; for (let i = 0; i < 7; i += 2) { const a = (i - 3) * 0.17; lines.push(new THREE.Vector3(Math.sin(a) * 4.4, Math.cos(a) * 4.4 - 4.4 - 0.15, 0.8), new THREE.Vector3(0, -5.4, 0), new THREE.Vector3(Math.sin(a) * 4.4, Math.cos(a) * 4.4 - 4.4 - 0.15, -0.8), new THREE.Vector3(0, -5.4, 0)); }
  canopy.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#d8d8d8', transparent: true, opacity: 0.6 })));
  canopy.visible = false;
  const mark = glowSprite('#ff3b3b', 3, 0); mark.position.y = 3; root.add(mark);
  root.userData = { J, canopy, mark, phase: 0 };
  return root;
}

// Pose: mode 'stand' | 'run' | 'fall' | 'track' | 'canopy' | 'dead' | 'aim'; t = time; spd = run speed.
export function poseOperator(o, mode, t, spd = 0) {
  const { J, canopy } = o.userData; canopy.visible = mode === 'canopy';
  o.rotation.x = 0; o.rotation.z = 0; J.hips.position.y = 0.95; J.chest.rotation.set(0, 0, 0); J.head.rotation.set(0, 0, 0);
  for (const k of ['L', 'R']) { J['sh' + k].rotation.set(0, 0, 0); J['el' + k].rotation.set(0, 0, 0); J['hip' + k].rotation.set(0, 0, 0); J['kn' + k].rotation.set(0, 0, 0); }
  if (mode === 'run' || mode === 'stand' || mode === 'aim') {
    const f = spd > 5 ? 1.6 : 1.1, ph = t * (2.2 + spd * 0.9), a = Math.min(1, spd / 4) * f * 0.6;
    J.hipL.rotation.x = Math.sin(ph) * a; J.hipR.rotation.x = -Math.sin(ph) * a; J.knL.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * a * 1.4; J.knR.rotation.x = Math.max(0, Math.sin(ph + 0.6)) * a * 1.4;
    J.hips.position.y = 0.95 - Math.abs(Math.sin(ph)) * 0.04 * a; J.chest.rotation.x = 0.08 * a + (mode === 'aim' ? 0.05 : 0);
    J.shL.rotation.x = -0.9; J.elL.rotation.x = -0.9; J.shR.rotation.x = -0.6; J.elR.rotation.x = -1.1;
    if (mode === 'aim') { J.shL.rotation.x = -1.35; J.shR.rotation.x = -1.2; J.elR.rotation.x = -0.6; }
  } else if (mode === 'fall' || mode === 'track') {
    // Belly-to-earth arch, or a track with arms swept back.
    o.rotation.x = mode === 'track' ? 1.25 : 1.5; J.chest.rotation.x = -0.25; J.head.rotation.x = -0.5;
    for (const [k, s] of [['L', 1], ['R', -1]]) { J['sh' + k].rotation.z = s * (mode === 'track' ? 0.3 : 1.6); J['el' + k].rotation.z = s * (mode === 'track' ? 0 : 0.6); J['hip' + k].rotation.z = s * (mode === 'track' ? 0.08 : 0.35); J['kn' + k].rotation.x = mode === 'track' ? 0.1 : 0.9; }
  } else if (mode === 'canopy') {
    J.shL.rotation.z = 2.7; J.shR.rotation.z = -2.7; J.hipL.rotation.x = -0.3; J.knL.rotation.x = 0.5; J.hipR.rotation.x = -0.2; J.knR.rotation.x = 0.4;
    canopy.rotation.z = Math.sin(t * 0.8) * 0.05;
  } else if (mode === 'dead') { o.rotation.x = -1.5; J.hips.position.y = 0.2; }
}

export function buildPlane() {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: '#6f7768', roughness: 0.6, metalness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.5 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(2.3, 2.3, 26, 20).rotateX(Math.PI / 2), body, 0, 0, 0);
  add(new THREE.SphereGeometry(2.3, 20, 12), body, 0, 0, -13).scale.set(1, 0.95, 1.6);
  add(new THREE.CylinderGeometry(2.3, 0.6, 10, 20).rotateX(-Math.PI / 2), body, 0, 0.9, 18).rotation.x = Math.PI / 2 + 0.12;
  add(new THREE.BoxGeometry(40, 0.6, 4.5), body, 0, 1.9, -2);
  add(new THREE.BoxGeometry(14, 0.4, 3), body, 0, 2.2, 21);
  add(new THREE.BoxGeometry(0.5, 7, 4), body, 0, 5.2, 21.5);
  for (const x of [-13, -7, 7, 13]) { add(new THREE.CylinderGeometry(0.75, 0.75, 4.5, 12).rotateX(Math.PI / 2), dark, x, 1.3, -3.5); add(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.25 }), x, 1.3, -5.9); }
  add(new THREE.BoxGeometry(2.6, 0.9, 1.4), new THREE.MeshStandardMaterial({ color: '#0d1b24', metalness: 0.8, roughness: 0.1 }), 0, 0.9, -15.6);
  const nav = glowSprite('#ff3b3b', 2.5, 0.9); nav.position.set(-20, 1.9, -2); g.add(nav); const nav2 = glowSprite('#3bff7a', 2.5, 0.9); nav2.position.set(20, 1.9, -2); g.add(nav2);
  return g;
}
