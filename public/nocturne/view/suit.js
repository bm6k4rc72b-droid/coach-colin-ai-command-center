import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ─────────────────────────────────────────────────────────────────────────────
// NOCTURNE · the suit. An original matte tactical armour (≈1.95 m) on a jointed rig: aramid
// weave undersuit, layered armour plates, a segmented utility belt, finned gauntlets and a
// finned cowl with white lenses. The cape is a real cloth simulation (Verlet particles with
// distance constraints and body collisions) that can stiffen into a gliding wing.
// ─────────────────────────────────────────────────────────────────────────────

function weaveTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { const odd = ((x + y) / 8) % 2; g.fillStyle = odd ? '#9a9a9a' : '#5c5c5c'; g.fillRect(x + 1, y + 1, odd ? 6 : 6, odd ? 3 : 6); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t;
}
const weave = weaveTexture();
export const M = {
  shell: new THREE.MeshPhysicalMaterial({ color: '#17191e', metalness: 0.35, roughness: 0.52, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.35 }),
  plate: new THREE.MeshPhysicalMaterial({ color: '#23272e', metalness: 0.6, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.4 }),
  under: new THREE.MeshStandardMaterial({ color: '#0e0f13', metalness: 0.2, roughness: 0.8, bumpMap: weave, bumpScale: 0.6, envMapIntensity: 0.25 }),
  trim: new THREE.MeshStandardMaterial({ color: '#4a505a', metalness: 0.9, roughness: 0.32, envMapIntensity: 0.5 }),
  seam: new THREE.MeshBasicMaterial({ color: '#2f78c0' }),
  lens: new THREE.MeshBasicMaterial({ color: '#eef6ff' }),
  cape: new THREE.MeshPhysicalMaterial({ color: '#0a0b0f', roughness: 0.62, metalness: 0.1, sheen: 1, sheenColor: new THREE.Color('#40506e'), sheenRoughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.3 }),
};

function lathe(prof, sz = 1, seg = 40, phi0 = 0, phiL = Math.PI * 2) {
  if (prof[0][1] > prof[prof.length - 1][1]) prof = [...prof].reverse();   // bottom → top for outward normals
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiL); g.scale(1, 1, sz); g.computeVertexNormals(); return g;
}
const ring = (r, t = 0.006, sz = 1) => { const g = new THREE.TorusGeometry(r, t, 6, 48); g.rotateX(Math.PI / 2); g.scale(1, 1, sz); return g; };
function blade(len, h, depth = 0.008) { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(len, h * 0.25); s.lineTo(len * 0.2, h); s.lineTo(0, 0); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }); g.translate(0, 0, -depth / 2); return g; }
// The chest emblem: an abstract chevron of two swept wings.
function emblem() {
  const s = new THREE.Shape(); s.moveTo(0, -0.03); s.lineTo(0.03, 0.0); s.lineTo(0.11, 0.018); s.lineTo(0.06, -0.005); s.lineTo(0.09, -0.035); s.lineTo(0.03, -0.022); s.lineTo(0, -0.06); s.lineTo(-0.03, -0.022); s.lineTo(-0.09, -0.035); s.lineTo(-0.06, -0.005); s.lineTo(-0.11, 0.018); s.lineTo(-0.03, 0); s.lineTo(0, -0.03);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 }); return g;
}

export function buildSuit() {
  const root = new THREE.Group(), parts = [], J = {};
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const piece = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], order = 0, armour = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (armour) { const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.4 + Math.random() * 1.4); parts.push({ m, base: m.position.clone(), rot: m.rotation.clone(), off: d, spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3), order }); }
    return m;
  };
  const pelvis = joint('pelvis', root, 0, 1.0, 0), spine = joint('spine', pelvis, 0, 0.12, 0), chest = joint('chest', spine, 0, 0.25, 0), neck = joint('neck', chest, 0, 0.22, 0), head = joint('head', neck, 0, 0.1, 0);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.28, 0.12, -0.01), el = joint('el' + k, sh, 0, -0.32, 0), wr = joint('wr' + k, el, 0, -0.29, 0.01);
    const hip = joint('hip' + k, pelvis, s * 0.115, -0.06, 0), kn = joint('kn' + k, hip, 0, -0.44, 0), an = joint('an' + k, kn, 0, -0.43, 0);
    piece(sh, new THREE.CapsuleGeometry(0.068, 0.22, 6, 14), M.under, [0, -0.15, 0], [0, 0, 0], 0, false);
    piece(el, new THREE.CapsuleGeometry(0.058, 0.2, 6, 14), M.under, [0, -0.14, 0], [0, 0, 0], 0, false);
    piece(hip, new THREE.CapsuleGeometry(0.088, 0.32, 6, 14), M.under, [0, -0.21, 0], [0, 0, 0], 0, false);
    piece(kn, new THREE.CapsuleGeometry(0.07, 0.32, 6, 14), M.under, [0, -0.21, 0], [0, 0, 0], 0, false);
    // Boots.
    piece(an, new RoundedBoxGeometry(0.135, 0.1, 0.28, 3, 0.03), M.shell, [0, -0.04, 0.045], [0, 0, 0], 0);
    piece(an, new RoundedBoxGeometry(0.14, 0.035, 0.29, 2, 0.012), M.trim, [0, -0.09, 0.045], [0, 0, 0], 0.05);
    piece(an, lathe([[0.08, 0.12], [0.085, 0.04], [0.08, -0.02]], 1.05), M.shell, [0, 0, -0.01], [0, 0, 0], 0.1);
    // Shin guard + knee armour.
    piece(kn, lathe([[0.092, -0.05], [0.1, -0.16], [0.09, -0.32]], 1.12, 20, -0.95, 1.9), M.plate, [0, 0, 0.004], [0, 0, 0], 1);
    piece(kn, new RoundedBoxGeometry(0.11, 0.1, 0.05, 3, 0.02), M.plate, [0, 0.0, 0.07], [-0.15, 0, 0], 1.1);
    piece(kn, ring(0.082, 0.004, 1.1), M.seam, [0, -0.33, 0], [0, 0, 0], 1.12);
    // Thigh plates.
    piece(hip, lathe([[0.104, -0.06], [0.11, -0.18], [0.1, -0.32]], 1.1, 20, -0.8, 1.6), M.plate, [0, 0, 0.003], [0, 0, 0], 2);
    piece(hip, lathe([[0.106, -0.04], [0.112, -0.16]], 1.1, 16, Math.PI / 2 - 0.5 + (s < 0 ? Math.PI : 0), 1.0), M.shell, [0, 0, 0], [0, 0, 0], 2.05);
    // Shoulder plates (layered), gauntlets with fins, gloves.
    piece(sh, new THREE.SphereGeometry(0.105, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2.1), M.plate, [s * 0.01, 0.02, 0], [0, 0, s * -0.3], 5);
    piece(sh, new THREE.SphereGeometry(0.098, 28, 10, 0, Math.PI * 2, Math.PI / 2.4, 0.35), M.shell, [s * 0.012, -0.03, 0], [0, 0, s * -0.3], 5.1);
    piece(el, lathe([[0.064, -0.02], [0.074, -0.1], [0.07, -0.21], [0.06, -0.27]], 1.05), M.shell, [0, 0, 0], [0, 0, 0], 6);
    piece(el, ring(0.072, 0.004, 1.05), M.seam, [0, -0.04, 0], [0, 0, 0], 6.05);
    for (let f = 0; f < 3; f++) piece(el, blade(0.07, 0.045), M.trim, [s * 0.07, -0.08 - f * 0.055, -0.01], [0, s > 0 ? 0 : Math.PI, -Math.PI / 2 - 0.35], 6.1);
    piece(wr, new RoundedBoxGeometry(0.055, 0.1, 0.1, 3, 0.02), M.shell, [0, -0.05, 0], [0, 0, 0], 7);
    for (let f = 0; f < 4; f++) piece(wr, new THREE.CapsuleGeometry(0.0135, 0.055, 4, 8), M.shell, [0, -0.13, 0.036 - f * 0.024], [0, 0, 0], 7.05);
    piece(wr, new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), M.shell, [s * -0.02, -0.07, 0.055], [0.6, 0, s * 0.4], 7.05);
  }
  // Torso: weave core, layered chest plates, segmented abdomen, emblem, utility belt.
  piece(pelvis, lathe([[0.16, 0.06], [0.175, 0.0], [0.16, -0.08], [0.115, -0.13]], 0.75), M.under, [0, 0, 0], [0, 0, 0], 3);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) piece(spine, new RoundedBoxGeometry(0.1, 0.06, 0.04, 2, 0.014), M.plate, [s * 0.055, 0.03 + i * 0.07, 0.115 - i * 0.004], [0, s * 0.18, 0], 3.2 + i * 0.05);
  piece(spine, lathe([[0.16, 0.2], [0.165, 0.1], [0.16, 0.0]], 0.72), M.under, [0, 0, 0], [0, 0, 0], 3.1);
  piece(chest, lathe([[0.13, 0.24], [0.21, 0.2], [0.255, 0.1], [0.235, -0.02], [0.19, -0.09]], 0.68), M.under, [0, 0, 0], [0, 0, 0], 4);
  for (const s of [-1, 1]) piece(chest, lathe([[0.18, 0.19], [0.24, 0.13], [0.262, 0.07], [0.24, 0.0]], 0.7, 16, s > 0 ? 0.05 : -0.85, 0.8), M.plate, [0, 0, 0.004], [0, 0, 0], 4.1);
  const emb = piece(chest, emblem(), M.trim, [0, 0.12, 0.178], [-0.12, 0, 0], 4.3);
  piece(chest, emblem(), M.seam, [0, 0.12, 0.172], [-0.12, 0, 0], 4.29).scale.setScalar(1.08);
  void emb;
  piece(chest, ring(0.2, 0.004, 0.7), M.seam, [0, -0.03, 0], [0, 0, 0], 4.35);
  const belt = new THREE.Group(); belt.position.y = 0.03; pelvis.add(belt);
  piece(belt, ring(0.172, 0.018, 0.76), M.trim, [0, 0, 0], [0, 0, 0], 3.5);
  for (let i = 0; i < 10; i++) { const a = -1.25 + (i / 9) * 2.5; if (Math.abs(a) < 0.25) continue; piece(belt, new RoundedBoxGeometry(0.05, 0.06, 0.035, 2, 0.008), M.shell, [Math.sin(a) * 0.175, -0.01, Math.cos(a) * 0.135], [0, a, 0], 3.55); }
  piece(belt, new RoundedBoxGeometry(0.07, 0.05, 0.02, 2, 0.006), M.trim, [0, 0, 0.135], [0, 0, 0], 3.6);
  // Cowl: shell, brow, cheek guards, two swept fins, white lenses.
  piece(neck, new THREE.CylinderGeometry(0.065, 0.075, 0.08, 20), M.under, [0, 0, 0], [0, 0, 0], 0, false);
  const hp = [[0.001, 0.17], [0.075, 0.162], [0.112, 0.13], [0.125, 0.07], [0.124, 0.01], [0.112, -0.05], [0.09, -0.095], [0.05, -0.115], [0.001, -0.118]];
  piece(head, lathe(hp, 1.12, 48), M.shell, [0, 0.04, -0.01], [0, 0, 0], 8);
  piece(head, lathe(hp.slice(1, 6).map(([r, y]) => [r * 1.03, y]), 1.12, 28, -0.9, 1.8), M.plate, [0, 0.04, -0.006], [0, 0, 0], 8.2);
  piece(head, new RoundedBoxGeometry(0.16, 0.024, 0.05, 2, 0.008), M.shell, [0, 0.1, 0.11], [0.45, 0, 0], 8.3);
  for (const s of [-1, 1]) {
    piece(head, new RoundedBoxGeometry(0.02, 0.09, 0.09, 2, 0.008), M.plate, [s * 0.112, 0.0, 0.06], [0, s * 0.35, 0], 8.32);
    piece(head, blade(0.16, 0.11, 0.012), M.shell, [s * 0.07, 0.15, -0.02], [0, s > 0 ? -Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25, -0.15], 8.4);
  }
  const lenses = [];
  for (const s of [-1, 1]) { const e = piece(head, new RoundedBoxGeometry(0.048, 0.014, 0.01, 2, 0.005), M.lens, [s * 0.036, 0.066, 0.138], [0.15, s * 0.36, s * -0.2], 8.5); e.material = M.lens.clone(); lenses.push(e); }
  // Mouth: a dark jaw guard.
  piece(head, new RoundedBoxGeometry(0.085, 0.045, 0.04, 2, 0.012), M.plate, [0, -0.045, 0.115], [0.25, 0, 0], 8.45);

  const bulk = (g, sx) => g.children.forEach((c) => { if (c.isMesh) { c.scale.x *= sx; c.scale.z *= sx; c.position.x *= sx; c.position.z *= sx; } });
  for (const k of ['L', 'R']) { bulk(J['sh' + k], 1.18); bulk(J['el' + k], 1.15); bulk(J['hip' + k], 1.12); bulk(J['kn' + k], 1.1); }
  bulk(chest, 1.1); bulk(spine, 1.06);
  parts.forEach((p) => p.base.copy(p.m.position));
  parts.sort((a, b) => a.order - b.order);
  const cape = buildCape(); root.add(cape.mesh);
  root.userData = { parts, J, lenses, cape };
  return root;
}

const ease = (x) => 1 - Math.pow(1 - x, 4);
export function assemble(suit, u) {
  const P = suit.userData.parts, maxO = 8.5, lock = [];
  for (const p of P) {
    const start = (p.order / maxO) * 0.72, e = Math.max(0, Math.min(1, (u - start) / 0.22)), k = ease(e);
    p.m.position.copy(p.base).addScaledVector(p.off, 1 - k);
    p.m.rotation.set(p.rot.x + p.spin.x * (1 - k), p.rot.y + p.spin.y * (1 - k), p.rot.z + p.spin.z * (1 - k));
    if (e >= 1 && !p.locked) lock.push(p); p.locked = e >= 1;
  }
  return lock;
}

// Poses: stand ⇄ glide (pitched forward, arms and legs spread) ⇄ perch (crouched, cape wrapped).
export function pose(suit, t, { glide = 0, perch = 0, lens = 1 }) {
  const J = suit.userData.J, b = Math.sin(t * 1.2) * 0.01;
  J.pelvis.position.y = 1.0 - perch * 0.42; J.pelvis.rotation.x = glide * 1.25 + perch * 0.15;
  J.chest.rotation.x = -b + perch * 0.45 - glide * 0.1; J.spine.rotation.x = perch * 0.25; J.head.rotation.x = b * 2 - glide * 0.9 - perch * 0.3;
  for (const [k, s] of [['L', 1], ['R', -1]]) {
    J['sh' + k].rotation.z = s * (0.1 + glide * 1.05 + perch * 0.15) + s * b; J['sh' + k].rotation.x = -glide * 0.15 - perch * 0.6;
    J['el' + k].rotation.x = -0.15 - perch * 0.9 + glide * 0.1; J['wr' + k].rotation.z = 0;
    J['hip' + k].rotation.x = -perch * 1.5 + glide * 0.05; J['hip' + k].rotation.z = s * (0.03 + glide * 0.16 + perch * 0.18); J['kn' + k].rotation.x = perch * 2.1 + glide * 0.05; J['an' + k].rotation.x = -perch * 0.6 + glide * 0.6;
  }
  suit.userData.lenses.forEach((e) => e.material.color.setRGB(0.6 + 0.4 * lens, 0.7 + 0.3 * lens, 0.75 + 0.25 * lens));
}

// ── Cape: Verlet cloth ─────────────────────────────────────────────────────────
const CW = 15, CH = 22, LEN = 1.38;
function buildCape() {
  const n = CW * CH, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  const rest = [];
  for (let r = 0; r < CH; r++) { const v = r / (CH - 1), w = 0.46 + (1.55 - 0.46) * Math.pow(v, 0.8); for (let c = 0; c < CW; c++) { const u = c / (CW - 1); rest.push(new THREE.Vector3((u - 0.5) * w, -v * LEN, 0)); uv.set([u, v], (r * CW + c) * 2); } }
  for (let r = 0; r < CH - 1; r++) for (let c = 0; c < CW - 1; c++) { const a = r * CW + c, b2 = a + 1, d = a + CW, e = d + 1; idx.push(a, d, b2, b2, d, e); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, M.cape); mesh.castShadow = true; mesh.frustumCulled = false;
  const cons = [], add = (i, j) => cons.push([i, j, rest[i].distanceTo(rest[j])]);
  for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) { const i = r * CW + c; if (c < CW - 1) add(i, i + 1); if (r < CH - 1) add(i, i + CW); if (c < CW - 1 && r < CH - 1) { add(i, i + CW + 1); add(i + 1, i + CW); } if (r < CH - 2) add(i, i + 2 * CW); if (c < CW - 2) add(i, i + 2); }
  return { mesh, p: null, prev: null, rest, cons, n };
}
// Step the cloth: pins follow the shoulders (and the wrists/ankles in glide), gravity + wind,
// constraint relaxation, sphere collisions against the body.
export function stepCape(suit, dt, { glide = 0, wind = new THREE.Vector3(), time = 0 }) {
  const C = suit.userData.cape, J = suit.userData.J, n = C.n; suit.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(suit.matrixWorld).invert(), loc = (o, v = new THREE.Vector3()) => o.getWorldPosition(v).applyMatrix4(inv);
  const chestM = new THREE.Matrix4().multiplyMatrices(inv, J.chest.matrixWorld);
  const pin = (c) => new THREE.Vector3((c / (CW - 1) - 0.5) * 0.46, 0.18 - Math.abs(c / (CW - 1) - 0.5) * 0.04, -0.2).applyMatrix4(chestM);
  if (!C.p) { C.p = C.rest.map((v, i) => pin(i % CW).add(new THREE.Vector3(v.x * 0.0, v.y, -0.05 - (i / CW) * 0.01))); C.prev = C.p.map((v) => v.clone()); }
  const h = Math.min(dt, 1 / 30), sub = 2, hs = h / sub, gvec = new THREE.Vector3(0, -9.8, 0).applyMatrix4(new THREE.Matrix4().extractRotation(inv));
  const wristL = loc(J.wrL), wristR = loc(J.wrR), ankL = loc(J.anL), ankR = loc(J.anR);
  const bodies = [[loc(J.chest).add(new THREE.Vector3(0, 0.08, 0)), 0.27], [loc(J.spine), 0.22], [loc(J.pelvis), 0.23]];
  for (const k of ['L', 'R']) { bodies.push([loc(J['kn' + k]), 0.13]); bodies.push([loc(J['hip' + k]).add(new THREE.Vector3(0, -0.22, 0)), 0.15]); bodies.push([loc(J['an' + k]), 0.12]); }
  for (let s = 0; s < sub; s++) {
    for (let i = CW; i < n; i++) {
      const p = C.p[i], q = C.prev[i], v = p.clone().sub(q).multiplyScalar(0.985);
      const flutter = Math.sin(time * 3.1 + i * 0.37) * 0.4 + Math.sin(time * 5.3 + i * 0.11) * 0.25;
      const a = gvec.clone().add(wind.clone().multiplyScalar(1 + 0.3 * flutter));
      q.copy(p); p.add(v).addScaledVector(a, hs * hs);
    }
    for (let it = 0; it < 6; it++) {
      for (const [i, j, L] of C.cons) { const a = C.p[i], b = C.p[j], d = b.clone().sub(a), dl = d.length() || 1e-6, diff = (dl - L) / dl; const wi = i < CW ? 0 : 1, wj = j < CW ? 0 : 1, wsum = wi + wj; if (!wsum) continue; d.multiplyScalar(diff / wsum); a.addScaledVector(d, wi); b.addScaledVector(d, -wj); }
      for (let c = 0; c < CW; c++) C.p[c].copy(pin(c));
      if (glide > 0.05) {   // the cape's edges lock to the wrists and ankles: a wing membrane
        const lerpPin = (i, target) => C.p[i].lerp(target, glide);
        lerpPin(7 * CW, wristR); lerpPin(7 * CW + CW - 1, wristL); lerpPin((CH - 1) * CW, ankR); lerpPin((CH - 1) * CW + CW - 1, ankL);
      }
      for (let i = CW; i < n; i++) for (const [c, r] of bodies) { const d = C.p[i].clone().sub(c), l = d.length(); if (l < r + 0.025) C.p[i].copy(c).addScaledVector(d.normalize(), r + 0.025); }
    }
  }
  const A = C.mesh.geometry.attributes.position.array; C.p.forEach((v, i) => A.set([v.x, v.y, v.z], i * 3));
  C.mesh.geometry.attributes.position.needsUpdate = true; C.mesh.geometry.computeVertexNormals();
}
