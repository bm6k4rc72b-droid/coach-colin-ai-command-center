import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// CHROMA FORCE · a hero. An original glossy team suit on a jointed rig: colour body with white
// chevron chest bands, gloves, boots and belt with a morpher buckle; a rounded helmet with a dark
// visor whose shape is unique to each colour. morph ∈ [0, 1] blends from street clothes to the
// suit, scales the helmet on and flashes the visor.
// ─────────────────────────────────────────────────────────────────────────────

function lathe(prof, sz = 1, seg = 36) { if (prof[0][1] > prof[prof.length - 1][1]) prof = [...prof].reverse(); const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.scale(1, 1, sz); g.computeVertexNormals(); return g; }
function shapeGeo(pts, depth = 0.012) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }); g.translate(0, 0, -depth / 2); return g; }
// Visor shapes (x, y in metres on the helmet front).
const VISORS = {
  red: [[-0.075, 0.02], [0.075, 0.02], [0.075, -0.005], [0.018, -0.005], [0.012, -0.08], [-0.012, -0.08], [-0.018, -0.005], [-0.075, -0.005]],
  blue: [[-0.08, 0.025], [0.08, 0.025], [0.07, -0.02], [-0.07, -0.02]],
  gold: [[0, 0.035], [0.08, 0.0], [0, -0.05], [-0.08, 0.0]],
  green: [[-0.085, 0.03], [-0.02, 0.0], [0.02, 0.0], [0.085, 0.03], [0.06, -0.02], [0, -0.035], [-0.06, -0.02]],
  pink: [[0, -0.05], [0.07, 0.0], [0.05, 0.03], [0.0, 0.012], [-0.05, 0.03], [-0.07, 0.0]],
};

export function buildRanger(c) {
  const root = new THREE.Group(), J = {};
  const suit = new THREE.MeshPhysicalMaterial({ color: '#2b2d33', roughness: 0.35, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.5 });
  const white = new THREE.MeshPhysicalMaterial({ color: '#f2f2f4', roughness: 0.3, clearcoat: 0.6, envMapIntensity: 0.5 });
  const visor = new THREE.MeshPhysicalMaterial({ color: '#07080b', roughness: 0.05, metalness: 0.6, clearcoat: 1, envMapIntensity: 1.2 });
  const civ = new THREE.MeshStandardMaterial({ color: '#c99a7c', roughness: 0.7 });
  const silver = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 1, roughness: 0.2, envMapIntensity: 0.8 });
  const joint = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
  const add = (p, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };
  const pelvis = joint('pelvis', root, 0, 0.98, 0), spine = joint('spine', pelvis, 0, 0.12, 0), chest = joint('chest', spine, 0, 0.24, 0), neck = joint('neck', chest, 0, 0.2, 0), head = joint('head', neck, 0, 0.1, 0);
  const suitOnly = [];
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.205, 0.12, 0), el = joint('el' + k, sh, 0, -0.29, 0), wr = joint('wr' + k, el, 0, -0.26, 0.01);
    const hip = joint('hip' + k, pelvis, s * 0.095, -0.05, 0), kn = joint('kn' + k, hip, 0, -0.43, 0), an = joint('an' + k, kn, 0, -0.42, 0);
    add(sh, new THREE.CapsuleGeometry(0.052, 0.22, 6, 14), suit, [0, -0.14, 0]); add(sh, new THREE.SphereGeometry(0.062, 18, 12), suit);
    add(el, new THREE.CapsuleGeometry(0.045, 0.19, 6, 14), suit, [0, -0.12, 0]);
    suitOnly.push(add(el, lathe([[0.05, -0.12], [0.056, -0.19], [0.05, -0.23]]), white));                 // glove cuff
    add(wr, new RoundedBoxGeometry(0.048, 0.09, 0.09, 3, 0.02), white, [0, -0.045, 0]);
    for (let f = 0; f < 4; f++) add(wr, new THREE.CapsuleGeometry(0.011, 0.05, 4, 8), white, [0, -0.12, 0.031 - f * 0.021]);
    add(hip, new THREE.CapsuleGeometry(0.072, 0.32, 6, 14), suit, [0, -0.21, 0]);
    add(kn, new THREE.CapsuleGeometry(0.058, 0.31, 6, 14), suit, [0, -0.2, 0]);
    suitOnly.push(add(kn, lathe([[0.062, -0.24], [0.068, -0.32], [0.064, -0.42]]), white));                // boot shaft
    add(an, new RoundedBoxGeometry(0.1, 0.09, 0.25, 3, 0.03), white, [0, -0.04, 0.04]);
  }
  add(pelvis, lathe([[0.14, 0.06], [0.15, 0.0], [0.14, -0.08], [0.095, -0.12]], 0.75), suit);
  add(spine, lathe([[0.14, 0.2], [0.142, 0.1], [0.138, 0.0]], 0.72), suit);
  add(chest, lathe([[0.1, 0.22], [0.18, 0.18], [0.205, 0.09], [0.19, -0.02], [0.155, -0.09]], 0.7), suit);
  // White chevron chest bands, shoulder yoke, belt and morpher buckle.
  for (let i = 0; i < 2; i++) suitOnly.push(add(chest, shapeGeo([[-0.16, 0.0], [0, -0.09], [0.16, 0.0], [0.16, 0.03], [0, -0.06], [-0.16, 0.03]], 0.01), white, [0, 0.16 - i * 0.075, 0.13 - i * 0.004], [-0.08, 0, 0]));
  const belt = add(pelvis, new THREE.TorusGeometry(0.145, 0.018, 6, 40).rotateX(Math.PI / 2).scale(1, 1, 0.76), white, [0, 0.03, 0]); suitOnly.push(belt);
  const buckle = add(pelvis, new RoundedBoxGeometry(0.1, 0.07, 0.03, 2, 0.01), silver, [0, 0.03, 0.115]);
  const gem = add(pelvis, new THREE.CylinderGeometry(0.018, 0.018, 0.012, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: c.hex }), [0, 0.03, 0.132]);
  // Civilian head (shown before the morph) and the helmet.
  const face = add(neck, new THREE.SphereGeometry(0.105, 24, 18), civ, [0, 0.13, 0.0]); face.scale.set(0.92, 1.1, 1);
  add(neck, new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), suit);
  const helmet = new THREE.Group(); head.add(helmet); J.helmet = helmet;
  const hp = [[0.001, 0.17], [0.075, 0.162], [0.112, 0.128], [0.124, 0.07], [0.122, 0.0], [0.11, -0.06], [0.085, -0.1], [0.04, -0.118], [0.001, -0.12]];
  const shell = add(helmet, lathe(hp, 1.1, 48), suit, [0, 0.04, -0.005]);
  const vis = add(helmet, shapeGeo(VISORS[c.id], 0.018), visor, [0, 0.07, 0.128], [-0.08, 0, 0]);
  add(helmet, new RoundedBoxGeometry(0.11, 0.05, 0.03, 2, 0.012), silver, [0, -0.045, 0.118], [0.15, 0, 0]);   // mouthplate
  for (const s of [-1, 1]) add(helmet, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20).rotateZ(Math.PI / 2), silver, [s * 0.125, 0.03, 0]);
  const flash = glowSprite(c.hex, 0.9, 0); flash.position.set(0, 0.07, 0.17); helmet.add(flash);
  const aura = glowSprite(c.hex, 2.4, 0); aura.position.y = 1.1; root.add(aura);
  void shell; void vis; void buckle;
  root.userData = { J, suit, suitOnly, helmet, face, flash, aura, gem, c, colour: new THREE.Color(c.hex), civ: new THREE.Color('#2b2d33') };
  morphTo(root, 0);
  return root;
}

// Morph state u: 0 = street clothes, 1 = suited.
export function morphTo(r, u) {
  const U = r.userData, k = Math.max(0, Math.min(1, u)), e = k * k * (3 - 2 * k);
  U.suit.color.copy(U.civ).lerp(U.colour, e); U.suit.emissive.copy(U.colour).multiplyScalar(Math.sin(Math.PI * k) * 0.6);
  U.suitOnly.forEach((m) => { m.visible = k > 0.35; m.scale.setScalar(k > 0.35 ? Math.min(1, (k - 0.35) / 0.3) : 0.001); });
  U.helmet.scale.setScalar(Math.max(0.001, Math.min(1, (k - 0.55) / 0.3))); U.helmet.visible = k > 0.55; U.face.visible = k < 0.75;
  U.flash.material.opacity = k > 0.8 && k < 1 ? Math.sin(((k - 0.8) / 0.2) * Math.PI) : 0; U.aura.material.opacity = Math.sin(Math.PI * k) * 0.9;
}

// Poses: idle ⇄ a battle stance; a strike for the physics lab.
export function poseRanger(r, t, { stance = 0, strike = 0, jump = 0, idx = 0 }) {
  const J = r.userData.J, b = Math.sin(t * 1.4 + idx) * 0.01, s = stance;
  J.pelvis.position.y = 0.98 - s * 0.12 + jump; J.chest.rotation.y = s * (idx % 2 ? 0.3 : -0.3); J.chest.rotation.x = b;
  for (const [k, sd] of [['L', 1], ['R', -1]]) {
    J['hip' + k].rotation.x = -s * (sd > 0 ? 0.5 : -0.2); J['hip' + k].rotation.z = sd * s * 0.18; J['kn' + k].rotation.x = s * (sd > 0 ? 0.7 : 0.3);
    J['sh' + k].rotation.x = -s * (sd > 0 ? 1.1 : 0.4) - (sd > 0 ? strike * 0.4 : 0); J['sh' + k].rotation.z = sd * (0.12 + s * 0.15);
    J['el' + k].rotation.x = -s * (sd > 0 ? 1.4 : 1.9) * (sd > 0 ? 1 - strike : 1);
  }
}
