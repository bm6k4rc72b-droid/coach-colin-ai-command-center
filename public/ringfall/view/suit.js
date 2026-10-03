import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite, holoMaterial } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// RINGFALL · the Ranger power armour (an original design: sage-steel plates over a black weave
// undersuit, an amber wraparound visor, a back-mounted power pack), its shield shell, the rifle, and
// the hostile "Warden" drones.
// ─────────────────────────────────────────────────────────────────────────────

export function buildRanger() {
  const root = new THREE.Group(), J = {};
  const plate = new THREE.MeshPhysicalMaterial({ color: '#6f7d63', roughness: 0.42, metalness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  const under = new THREE.MeshStandardMaterial({ color: '#1c1e21', roughness: 0.75, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.5, metalness: 0.7 });
  const visor = new THREE.MeshPhysicalMaterial({ color: '#d9892a', roughness: 0.05, metalness: 0.9, clearcoat: 1, iridescence: 0.6, emissive: '#5a2a00', emissiveIntensity: 0.25 });
  const glowM = new THREE.MeshBasicMaterial({ color: '#8fe9ff' });
  const add = (p, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };
  const joint = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
  const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, r);
  const hips = joint('hips', root, 0, 1.05, 0), chest = joint('chest', hips, 0, 0.16, 0);
  add(hips, RB(0.4, 0.2, 0.26), under); add(hips, RB(0.44, 0.08, 0.3, 0.02), trim, [0, 0.06, 0]);
  add(chest, RB(0.4, 0.42, 0.26), under, [0, 0.24, 0]);
  add(chest, RB(0.56, 0.36, 0.36, 0.06), plate, [0, 0.36, 0.02]);                // chest plate
  add(chest, RB(0.36, 0.14, 0.32, 0.04), plate, [0, 0.12, 0.02]);                // abdomen
  add(chest, RB(0.42, 0.46, 0.2, 0.05), trim, [0, 0.33, -0.25]);                 // power pack
  for (let i = 0; i < 3; i++) add(chest, new THREE.BoxGeometry(0.3, 0.012, 0.012), glowM, [0, 0.22 + i * 0.1, -0.355]);
  add(chest, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20).rotateX(Math.PI / 2), glowM, [0.12, 0.42, 0.21]);
  const neck = joint('neck', chest, 0, 0.58, 0); add(neck, new THREE.CylinderGeometry(0.075, 0.09, 0.1, 16), under);
  const head = joint('head', neck, 0, 0.1, 0.01);
  const helm = add(head, new THREE.SphereGeometry(0.17, 32, 24), plate, [0, 0.08, 0]); helm.scale.set(0.95, 1.08, 1.1);
  const vis = add(head, new THREE.SphereGeometry(0.168, 32, 16, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.22), visor, [0, 0.07, 0.025]); vis.scale.set(1.0, 1.05, 1.13);
  add(head, RB(0.2, 0.08, 0.1, 0.03), plate, [0, -0.04, 0.1]);                    // jaw guard
  for (const s of [-1, 1]) add(head, RB(0.05, 0.12, 0.12, 0.02), trim, [s * 0.16, 0.07, -0.02]);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.33, 0.48, 0), el = joint('el' + k, sh, 0, -0.32, 0), wr = joint('wr' + k, el, 0, -0.3, 0);
    add(sh, RB(0.26, 0.2, 0.3, 0.06), plate, [s * 0.04, 0.03, 0], [0, 0, s * -0.25]);  // pauldron
    add(sh, new THREE.CapsuleGeometry(0.075, 0.22, 4, 10), under, [0, -0.17, 0]); add(sh, RB(0.16, 0.18, 0.17, 0.04), plate, [0, -0.17, 0]);
    add(el, new THREE.CapsuleGeometry(0.07, 0.22, 4, 10), under, [0, -0.14, 0]); add(el, RB(0.17, 0.22, 0.18, 0.04), plate, [0, -0.15, 0.01]);
    add(wr, RB(0.1, 0.12, 0.12, 0.03), under, [0, -0.06, 0]);
    const hip = joint('hip' + k, hips, s * 0.12, -0.06, 0), kn = joint('kn' + k, hip, 0, -0.46, 0);
    add(hip, new THREE.CapsuleGeometry(0.1, 0.32, 4, 10), under, [0, -0.22, 0]); add(hip, RB(0.2, 0.32, 0.22, 0.05), plate, [0, -0.22, 0.02]);
    add(kn, new THREE.CapsuleGeometry(0.085, 0.34, 4, 10), under, [0, -0.22, 0]); add(kn, RB(0.18, 0.3, 0.2, 0.05), plate, [0, -0.2, 0.03]); add(kn, RB(0.14, 0.12, 0.12, 0.04), trim, [0, 0.02, 0.09]);
    add(kn, RB(0.16, 0.12, 0.32, 0.04), plate, [0, -0.47, 0.05]);
  }
  // Rifle (held by the right hand, pointing forward).
  const gun = new THREE.Group(); J.wrR.add(gun); gun.position.set(0, -0.1, 0.05); gun.rotation.x = -Math.PI / 2;
  add(gun, RB(0.08, 0.14, 0.62, 0.02), trim, [0, 0, 0.12]); add(gun, new THREE.CylinderGeometry(0.02, 0.02, 0.28, 10).rotateX(Math.PI / 2), under, [0, 0.02, 0.56]); add(gun, RB(0.06, 0.16, 0.08, 0.02), under, [0, -0.11, 0.18]); add(gun, new THREE.BoxGeometry(0.084, 0.012, 0.3), glowM, [0, 0.074, 0.1]);
  const muzzle = glowSprite('#ffd38a', 0.6, 0); muzzle.position.set(0, 0.02, 0.74); gun.add(muzzle);
  // Shield shell: a gold Fresnel flash on hits.
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.25, 8, 24), holoMaterial({ color: '#ffcf6a', rim: '#ffe9b0', opacity: 0, base: 0.02, scan: 0.6 })); shell.position.y = 1.0; root.add(shell);
  root.userData = { J, shell, muzzle, gun };
  return root;
}
// Poses: 'stand' | 'run' | 'aim' | 'down'.
export function poseRanger(r, mode, t, spd = 0) {
  const J = r.userData.J; for (const k of ['L', 'R']) { J['sh' + k].rotation.set(0, 0, 0); J['el' + k].rotation.set(0, 0, 0); J['hip' + k].rotation.set(0, 0, 0); J['kn' + k].rotation.set(0, 0, 0); }
  J.hips.position.y = 1.05; J.chest.rotation.set(0, 0, 0); r.rotation.x = 0;
  const ph = t * (2 + spd * 1.1), a = Math.min(1, spd / 5) * 0.75;
  J.hipL.rotation.x = Math.sin(ph) * a; J.hipR.rotation.x = -Math.sin(ph) * a; J.knL.rotation.x = Math.max(0, -Math.sin(ph + 0.6)) * a * 1.3; J.knR.rotation.x = Math.max(0, Math.sin(ph + 0.6)) * a * 1.3;
  J.hips.position.y = 1.05 - Math.abs(Math.sin(ph)) * 0.04 * a;
  // Rifle up: right hand forward at shoulder height, left hand on the fore-grip.
  J.shR.rotation.x = mode === 'aim' ? -1.45 : -0.9; J.elR.rotation.x = mode === 'aim' ? -0.15 : -0.7; J.shR.rotation.z = 0.1;
  J.shL.rotation.x = mode === 'aim' ? -1.35 : -0.85; J.elL.rotation.x = mode === 'aim' ? -0.55 : -1.0; J.shL.rotation.z = -0.45; J.shL.rotation.y = 0.4;
  J.chest.rotation.y = mode === 'aim' ? -0.15 : 0;
  if (mode === 'down') { r.rotation.x = -1.4; J.hips.position.y = 0.3; }
}

// A Warden drone: an armoured octahedral core with a red eye, spinning vanes and a blue shield bubble.
export function buildWarden(big = false) {
  const root = new THREE.Group(), s = big ? 2.2 : 1;
  const hullM = new THREE.MeshStandardMaterial({ color: '#4a4f58', roughness: 0.35, metalness: 0.85 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 * s, 0), hullM); core.scale.set(1, 0.7, 1.3); core.castShadow = true; root.add(core);
  const vanes = new THREE.Group(); root.add(vanes);
  for (let i = 0; i < 3; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(2.4 * s, 0.06 * s, 0.32 * s), hullM); v.rotation.y = (i / 3) * Math.PI; v.castShadow = true; vanes.add(v); }
  const eye = glowSprite('#ff3b2f', 1.1 * s, 1); eye.position.set(0, 0, 1.05 * s); root.add(eye);
  const eyeCore = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 16, 12), new THREE.MeshBasicMaterial({ color: '#ff6a4a' })); eyeCore.position.z = 0.95 * s; root.add(eyeCore);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.6 * s, 32, 20), holoMaterial({ color: '#6fd4ff', rim: '#bff0ff', opacity: 0.25, base: 0.02, scan: 0.4 })); root.add(bubble);
  root.userData = { vanes, bubble, eye, s };
  return root;
}
