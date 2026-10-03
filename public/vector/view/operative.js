import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ─────────────────────────────────────────────────────────────────────────────
// SILENT VECTOR · the operative. An original stealth infiltrator on a jointed rig: a close-fitting
// sneaking suit whose panels carry an adaptive camouflage texture, a low-profile vest, knee and
// elbow pads, a balaclava with a long headband (animated tails) and flip-down night-vision
// goggles. Poses: stand, crouch, crawl, with a walk/run gait cycle.
// ─────────────────────────────────────────────────────────────────────────────

// Procedural camo: three-colour blotches (domain-warped noise) painted to a canvas texture.
export function camoTexture(pal, seed = 7) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = pal[0]; g.fillRect(0, 0, 256, 256);
  for (const [col, n, sz] of [[pal[1], 70, 34], [pal[2], 55, 26], [pal[0], 25, 18]]) { g.fillStyle = col; for (let i = 0; i < n; i++) { const x = r() * 256, y = r() * 256; g.beginPath(); for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = sz * (0.45 + r() * 0.75); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); for (const [dx, dy] of [[256, 0], [-256, 0], [0, 256], [0, -256]]) { g.save(); g.translate(dx, dy); g.fill(); g.restore(); } } }
  // Fine hex weave over the top (the chromatophore panels).
  g.globalAlpha = 0.12; g.strokeStyle = '#000'; for (let y = 0; y < 256; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < 256; x += 6) { g.strokeRect(x, y, 5, 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const M = {
  suit: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0.05, sheen: 0.6, sheenColor: new THREE.Color('#8fa2b8'), envMapIntensity: 0.3 }),
  gear: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.75, metalness: 0.15, envMapIntensity: 0.3 }),
  pad: new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.55, metalness: 0.2, envMapIntensity: 0.3 }),
  metal: new THREE.MeshStandardMaterial({ color: '#4b5058', roughness: 0.35, metalness: 0.85, envMapIntensity: 0.5 }),
  band: new THREE.MeshStandardMaterial({ color: '#1b1e24', roughness: 0.8, side: THREE.DoubleSide }),
  lens: new THREE.MeshBasicMaterial({ color: '#7dff9e' }),
};

function lathe(prof, sz = 1, seg = 36) { if (prof[0][1] > prof[prof.length - 1][1]) prof = [...prof].reverse(); const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.scale(1, 1, sz); g.computeVertexNormals(); return g; }

export function buildOperative() {
  const root = new THREE.Group(), J = {};
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const add = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const pelvis = joint('pelvis', root, 0, 0.98, 0), spine = joint('spine', pelvis, 0, 0.12, 0), chest = joint('chest', spine, 0, 0.24, 0), neck = joint('neck', chest, 0, 0.2, 0), head = joint('head', neck, 0, 0.1, 0);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'R' : 'L';
    const sh = joint('sh' + k, chest, s * 0.215, 0.12, -0.01), el = joint('el' + k, sh, 0, -0.3, 0), wr = joint('wr' + k, el, 0, -0.27, 0.01);
    const hip = joint('hip' + k, pelvis, s * 0.1, -0.05, 0), kn = joint('kn' + k, hip, 0, -0.43, 0), an = joint('an' + k, kn, 0, -0.42, 0);
    add(sh, new THREE.CapsuleGeometry(0.058, 0.22, 6, 14), M.suit, [0, -0.15, 0]);
    add(sh, new THREE.SphereGeometry(0.07, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.suit, [0, 0, 0]);
    add(el, new THREE.CapsuleGeometry(0.05, 0.2, 6, 14), M.suit, [0, -0.13, 0]);
    add(el, new RoundedBoxGeometry(0.075, 0.08, 0.06, 2, 0.02), M.pad, [0, 0.0, -0.035]);
    add(wr, new RoundedBoxGeometry(0.05, 0.095, 0.095, 3, 0.02), M.gear, [0, -0.05, 0]);
    for (let f = 0; f < 4; f++) add(wr, new THREE.CapsuleGeometry(0.012, 0.05, 4, 8), M.gear, [0, -0.125, 0.033 - f * 0.022]);
    add(hip, new THREE.CapsuleGeometry(0.078, 0.32, 6, 14), M.suit, [0, -0.21, 0]);
    add(hip, new RoundedBoxGeometry(0.06, 0.12, 0.08, 2, 0.02), M.gear, [s * 0.075, -0.2, 0.0]);   // thigh pouch
    add(kn, new THREE.CapsuleGeometry(0.062, 0.31, 6, 14), M.suit, [0, -0.2, 0]);
    add(kn, new RoundedBoxGeometry(0.1, 0.11, 0.05, 2, 0.022), M.pad, [0, 0.0, 0.055], [-0.1, 0, 0]);
    add(an, new RoundedBoxGeometry(0.11, 0.1, 0.26, 3, 0.03), M.gear, [0, -0.04, 0.04]);
    add(an, lathe([[0.072, 0.11], [0.076, 0.03], [0.07, -0.02]]), M.gear, [0, 0, -0.01]);
  }
  // Torso: suit, low-profile vest with pouches, belt.
  add(pelvis, lathe([[0.15, 0.06], [0.16, 0.0], [0.15, -0.08], [0.1, -0.12]], 0.75), M.suit);
  add(spine, lathe([[0.15, 0.2], [0.152, 0.1], [0.148, 0.0]], 0.72), M.suit);
  add(chest, lathe([[0.11, 0.22], [0.19, 0.18], [0.22, 0.09], [0.205, -0.02], [0.17, -0.09]], 0.7), M.suit);
  add(chest, new RoundedBoxGeometry(0.3, 0.26, 0.05, 3, 0.02), M.gear, [0, 0.05, 0.13]);
  for (let i = 0; i < 3; i++) add(chest, new RoundedBoxGeometry(0.075, 0.09, 0.04, 2, 0.012), M.pad, [-0.09 + i * 0.09, -0.02, 0.165]);
  add(chest, new RoundedBoxGeometry(0.28, 0.24, 0.05, 3, 0.02), M.gear, [0, 0.05, -0.135]);
  add(chest, new RoundedBoxGeometry(0.08, 0.1, 0.03, 2, 0.01), M.metal, [0.08, 0.13, 0.165]);   // radio
  add(pelvis, new THREE.TorusGeometry(0.155, 0.018, 6, 40).rotateX(Math.PI / 2).scale(1, 1, 0.76), M.gear, [0, 0.03, 0]);
  for (const a of [-1, -0.5, 0.5, 1]) add(pelvis, new RoundedBoxGeometry(0.06, 0.07, 0.04, 2, 0.01), M.pad, [Math.sin(a) * 0.16, 0.0, Math.cos(a) * 0.12], [0, a, 0]);
  // Head: balaclava, headband with tails, NVG mount.
  add(neck, new THREE.CylinderGeometry(0.055, 0.065, 0.08, 18), M.suit);
  const hp = [[0.001, 0.165], [0.075, 0.155], [0.105, 0.12], [0.113, 0.06], [0.11, 0.0], [0.1, -0.05], [0.08, -0.09], [0.045, -0.11], [0.001, -0.112]];
  add(head, lathe(hp, 1.1, 40), M.gear, [0, 0.04, -0.005]);
  add(head, new THREE.TorusGeometry(0.112, 0.016, 8, 40).rotateX(Math.PI / 2).scale(1, 1, 1.1), M.band, [0, 0.12, -0.005]);
  const tails = [];
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.035, 0.6, 1, 12); geo.translate(0, -0.3, 0);
    const tail = add(head, geo, M.band, [s * 0.02, 0.12, -0.12], [0.2, 0, 0]); tail.userData.base = geo.attributes.position.array.slice(); tail.userData.s = s; tails.push(tail);
  }
  const nvg = new THREE.Group(); nvg.position.set(0, 0.14, 0.09); head.add(nvg); J.nvg = nvg;
  add(nvg, new RoundedBoxGeometry(0.05, 0.03, 0.04, 2, 0.01), M.metal, [0, 0, 0]);
  for (const s of [-1, 1]) { add(nvg, new THREE.CylinderGeometry(0.018, 0.02, 0.06, 16).rotateX(Math.PI / 2), M.metal, [s * 0.032, -0.04, 0.035]); add(nvg, new THREE.CircleGeometry(0.016, 16), M.lens, [s * 0.032, -0.04, 0.066]); }
  root.userData = { J, tails };
  return root;
}

export function setCamo(op, pal) { if (M.suit.map) M.suit.map.dispose(); M.suit.map = camoTexture(pal); M.suit.needsUpdate = true; }

// Pose: stance ('stand' | 'crouch' | 'crawl'), gait phase/speed for the walk cycle, NVG down (0/1).
export function poseOp(op, t, { stance = 'stand', speed = 0, phase = 0, nvg = 0, wind = 0.5 }) {
  const J = op.userData.J, cr = stance === 'crouch' ? 1 : 0, pr = stance === 'crawl' ? 1 : 0, sw = Math.min(1, speed / 1.4), a = Math.sin(phase), b = Math.sin(phase + Math.PI);
  J.pelvis.position.y = 0.98 - cr * 0.36 - pr * 0.8; J.pelvis.rotation.x = cr * 0.2 + pr * 1.45;
  J.chest.rotation.x = cr * 0.35 + sw * 0.1 * (1 - pr); J.head.rotation.x = -cr * 0.25 - pr * 1.2;
  for (const [k, s, ph] of [['L', 1, a], ['R', -1, b]]) {
    J['hip' + k].rotation.x = -cr * 1.25 + ph * 0.55 * sw * (1 - pr) - pr * 0.05 + pr * ph * 0.2 * sw;
    J['kn' + k].rotation.x = cr * 1.9 + Math.max(0, -ph) * 0.9 * sw * (1 - pr) + pr * 0.2;
    J['an' + k].rotation.x = -cr * 0.6 + pr * 0.6;
    J['sh' + k].rotation.x = -ph * 0.5 * sw * (1 - pr) - cr * 0.4 - pr * 2.6 + pr * ph * 0.3 * sw; J['sh' + k].rotation.z = s * (0.08 + pr * 0.25);
    J['el' + k].rotation.x = -0.3 - cr * 0.7 - Math.max(0, ph) * 0.4 * sw - pr * 0.9;
  }
  J.nvg.rotation.x = nvg ? 0 : -1.2; J.nvg.position.y = nvg ? 0.07 : 0.15;
  // Headband tails: a travelling sine wave, stronger with wind and speed.
  for (const tl of op.userData.tails) { const P = tl.geometry.attributes.position.array, B = tl.userData.base; for (let i = 0; i < P.length; i += 3) { const v = -B[i + 1] / 0.6; P[i + 2] = B[i + 2] - v * (0.15 + speed * 0.08) * wind - Math.sin(t * 7 + v * 6 + tl.userData.s) * 0.04 * v * (0.5 + wind); P[i] = B[i] + Math.sin(t * 5 + v * 4) * 0.02 * v * tl.userData.s; } tl.geometry.attributes.position.needsUpdate = true; tl.geometry.computeVertexNormals(); }
}
