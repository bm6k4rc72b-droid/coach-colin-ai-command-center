import * as THREE from 'three';
import { fbm, weld, glowSprite, glowTexture } from './holo.js';

// MINDSCAPE · a glass brain you can take apart. Cortex vertices carry a region id (lobes and named areas);
// deep structures are separate meshes; neuromodulator pathways carry travelling light.
// Axes: +x = the left hemisphere (facing the viewer in the default lateral view), +y up, +z anterior.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const S = 2.2;                                                   // brain units → scene units
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const COLORS = {
  frontal: '#3fd6c6', dlpfc: '#5ff0a8', ofc: '#2fb0d8', motor: '#7ad0ff', broca: '#ffd166', parietal: '#a98bff', somato: '#c79bff',
  temporal: '#ffb36b', auditory: '#ffcf8a', wernicke: '#ff9a5a', occipital: '#5f8bff', acc: '#ff6fae', pcc: '#e88cff', insula: '#ff8a8a',
  hippocampus: '#ffe066', amygdala: '#ff5a6a', thalamus: '#8fe3ff', hypothalamus: '#ff9ad5', pituitary: '#ffc0e0', pineal: '#d0ffb0',
  caudate: '#6affc8', putamen: '#4ad0a0', pallidus: '#9affd8', nacc: '#ffd23a', sn: '#3a3a52', vta: '#ffb020', callosum: '#e8eef8',
  midbrain: '#ffcf9a', pons: '#f0b884', lc: '#5ab4ff', medulla: '#e0a070', cerebellum: '#ff7ad9',
};
const CORTEX = ['frontal', 'dlpfc', 'ofc', 'motor', 'broca', 'parietal', 'somato', 'temporal', 'auditory', 'wernicke', 'occipital', 'acc', 'pcc'];

// Which named area a cortex point belongs to. q = local position (brain units, hemisphere-centred), lat = outward-ness.
function classify(q, lat, side) {
  const { y, z } = q, ys = -0.09 - 0.22 * z, zc = -0.05 - 0.2 * y, left = side > 0;
  if (lat < -0.2) { if (y > -0.02 && y < 0.36 && z > -0.55 && z < 0.55) return z > 0.08 ? 'acc' : z < -0.12 ? 'pcc' : y > 0.22 ? 'motor' : 'acc'; }
  if (z < -0.62 + 0.08 * y) return 'occipital';
  if (lat > -0.2 && y < ys && z < 0.45 && z > -0.66) {
    if (lat > 0.3 && y > ys - 0.11 && z > -0.25 && z < 0.08) return 'auditory';
    if (left && lat > 0.25 && y > ys - 0.14 && z <= -0.25 && z > -0.52) return 'wernicke';
    return 'temporal';
  }
  if (z > zc) {
    if (z < zc + 0.13 && y > ys + 0.04) return 'motor';
    if (y < -0.04 && z > 0.42) return 'ofc';
    if (left && lat > 0.3 && y > ys && y < ys + 0.2 && z > 0.22 && z < 0.5) return 'broca';
    if (lat > 0.25 && y > 0.1 && y < 0.46 && z > 0.3 && z < 0.78) return 'dlpfc';
    return 'frontal';
  }
  if (z > zc - 0.13 && y > ys + 0.04) return 'somato';
  return 'parietal';
}

function hemisphere(side) {
  const geo = weld(new THREE.IcosahedronGeometry(1, 40)), pos = geo.attributes.position, n = pos.count, d = V(0, 0, 0);
  const region = new Uint8Array(n), C = V(side * 0.15, 0.04, 0);
  for (let i = 0; i < n; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let x = d.x * 0.6, y = d.y * 0.66, z = d.z * 0.95;
    if (x * side < 0) x *= 0.2;                                        // flat medial face
    if (y < -0.18) y = -0.18 + (y + 0.18) * 0.6;
    const temporal = smooth(0.15, 0.8, d.x * side) * smooth(-0.05, -0.6, d.y) * smooth(-0.6, 0.15, d.z);
    x += side * 0.06 * temporal; y -= 0.12 * temporal; z += 0.04 * temporal;
    if (d.z < -0.5) { y *= 1 - 0.12 * smooth(-0.5, -1, d.z); }                // narrower occipital pole
    const q = V(x, y, z), lat = d.x * side, id = classify(q, lat, side);
    region[i] = CORTEX.indexOf(id);
    // Gyri: ridged noise, plus the lateral (Sylvian) fissure and the central sulcus.
    const f = fbm(d.x * 2.3 + (side > 0 ? 0 : 13), d.y * 2.3, d.z * 2.3, 4);
    let depth = 0.075 * (1 - Math.abs(Math.sin(f * 30))) ** 2.2;
    if (lat > 0.2) depth += 0.07 * Math.exp(-(((y - (-0.09 - 0.22 * z)) / 0.025) ** 2)) * smooth(-0.66, -0.3, z) * smooth(0.5, 0.3, z);
    if (y > -0.05 && lat > -0.2) depth += 0.04 * Math.exp(-(((z - (-0.05 - 0.2 * y)) / 0.02) ** 2));
    q.multiplyScalar(1 - depth);
    const p = q.add(C).multiplyScalar(S); pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, transparent: true, opacity: 1, emissive: '#ffffff', emissiveIntensity: 0.0 });
  const mesh = new THREE.Mesh(geo, mat); mesh.userData = { region, side, cortex: true }; return mesh;
}

function ellipsoid(r, seg = 28) { const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(r[0] * S, r[1] * S, r[2] * S); return g; }
const at = (p) => (p.isVector3 ? p.clone().multiplyScalar(S) : V(p[0] * S, p[1] * S, p[2] * S));
function tube(pts, r, seg = 40) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(at)), seg, r * S, 10, false); }

export function buildBrain(scene) {
  const B = { group: new THREE.Group(), parts: {}, pick: [], cortex: [], paths: {} }; scene.add(B.group);
  for (const side of [1, -1]) { const h = hemisphere(side); B.group.add(h); B.cortex.push(h); B.pick.push(h); }
  const deepMat = (id) => new THREE.MeshStandardMaterial({ color: COLORS[id], emissive: COLORS[id], emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 1 });
  const add = (id, geo, pos, sides = [0]) => { for (const s of sides) { const m = new THREE.Mesh(geo, deepMat(id)); m.position.copy(at([pos[0] * (s || 1), pos[1], pos[2]])); if (s < 0) m.scale.x = -1; m.userData = { id }; B.group.add(m); B.pick.push(m); (B.parts[id] = B.parts[id] || []).push(m); } };
  const both = [1, -1];
  // Corpus callosum: a broad arch of white matter joining the hemispheres.
  { const g = tube([V(0, 0.08, 0.36), V(0, 0.2, 0.22), V(0, 0.23, 0), V(0, 0.2, -0.22), V(0, 0.08, -0.34), V(0, 0.02, -0.28)], 0.035, 60); g.scale(3.2, 1, 1); add('callosum', g, [0, 0, 0]); }
  add('thalamus', ellipsoid([0.065, 0.06, 0.11]), [0.075, 0.0, -0.06], both);
  add('hypothalamus', ellipsoid([0.05, 0.04, 0.06]), [0, -0.12, 0.07]);
  { const g = ellipsoid([0.032, 0.026, 0.034]); add('pituitary', g, [0, -0.27, 0.12]); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * S, 0.008 * S, 0.12 * S, 8), deepMat('pituitary')); st.position.copy(at([0, -0.2, 0.1])); st.userData = { id: 'pituitary' }; B.group.add(st); B.parts.pituitary.push(st); B.pick.push(st); }
  add('pineal', ellipsoid([0.022, 0.02, 0.03]), [0, 0.03, -0.2]);
  for (const s of both) { const g = tube([V(0.11 * s, 0.06, 0.28), V(0.13 * s, 0.15, 0.16), V(0.15 * s, 0.18, -0.02), V(0.19 * s, 0.13, -0.2), V(0.23 * s, 0.0, -0.26), V(0.25 * s, -0.12, -0.14)], 0.032, 50); const m = new THREE.Mesh(g, deepMat('caudate')); m.userData = { id: 'caudate' }; B.group.add(m); B.pick.push(m); (B.parts.caudate = B.parts.caudate || []).push(m);
    const head = new THREE.Mesh(ellipsoid([0.045, 0.06, 0.07]), deepMat('caudate')); head.position.copy(at([0.11 * s, 0.05, 0.27])); head.userData = { id: 'caudate' }; B.group.add(head); B.pick.push(head); B.parts.caudate.push(head); }
  add('putamen', ellipsoid([0.05, 0.085, 0.14]), [0.215, -0.02, 0.08], both);
  add('pallidus', ellipsoid([0.032, 0.06, 0.085]), [0.155, -0.035, 0.05], both);
  add('nacc', ellipsoid([0.038, 0.035, 0.042]), [0.085, -0.1, 0.24], both);
  for (const s of both) { const g = tube([V(0.235 * s, -0.22, 0.04), V(0.25 * s, -0.19, -0.08), V(0.23 * s, -0.13, -0.2), V(0.18 * s, -0.06, -0.3), V(0.12 * s, 0.0, -0.3)], 0.034, 40); const m = new THREE.Mesh(g, deepMat('hippocampus')); m.userData = { id: 'hippocampus' }; B.group.add(m); B.pick.push(m); (B.parts.hippocampus = B.parts.hippocampus || []).push(m); }
  add('amygdala', ellipsoid([0.045, 0.042, 0.05]), [0.235, -0.22, 0.11], both);
  add('insula', ellipsoid([0.018, 0.11, 0.16]), [0.29, -0.03, 0.04], both);
  // Brainstem and cerebellum.
  { const g = new THREE.CylinderGeometry(0.095 * S, 0.085 * S, 0.14 * S, 24); add('midbrain', g, [0, -0.19, -0.1]); }
  add('sn', ellipsoid([0.04, 0.018, 0.05]), [0.05, -0.2, -0.06], both);
  add('vta', ellipsoid([0.026, 0.02, 0.028]), [0, -0.22, -0.04]);
  add('pons', ellipsoid([0.12, 0.095, 0.11]), [0, -0.35, -0.1]);
  add('lc', ellipsoid([0.014, 0.022, 0.014]), [0.03, -0.3, -0.19], both);
  { const g = new THREE.CylinderGeometry(0.075 * S, 0.055 * S, 0.24 * S, 24); add('medulla', g, [0, -0.55, -0.15]); }
  { const g = new THREE.SphereGeometry(1, 64, 48), p = g.attributes.position, d = V(0, 0, 0);
    for (let i = 0; i < p.count; i++) { d.set(p.getX(i), p.getY(i), p.getZ(i)); const fol = 1 - 0.035 * Math.abs(Math.sin(d.y * 26 + d.z * 6)), mid = 1 - 0.18 * Math.exp(-((d.x / 0.12) ** 2)) * (d.z < 0 ? 1 : 0.4); p.setXYZ(i, d.x * 0.34 * S * fol * mid, d.y * 0.15 * S * fol, d.z * 0.21 * S * fol); }
    g.computeVertexNormals(); add('cerebellum', g, [0, -0.36, -0.56]); }
  // Neuromodulator pathways (travelling light). Each is a set of curves; particles ride them.
  const P = (pts) => new THREE.CatmullRomCurve3(pts.map(at));
  B.paths.mesolimbic = [1, -1].map((s) => P([V(0, -0.22, -0.04), V(0.04 * s, -0.17, 0.08), V(0.085 * s, -0.1, 0.24)]));
  B.paths.mesocortical = [1, -1].flatMap((s) => [P([V(0, -0.22, -0.04), V(0.06 * s, -0.12, 0.16), V(0.16 * s, 0.1, 0.42), V(0.28 * s, 0.3, 0.6)]), P([V(0, -0.22, -0.04), V(0.03 * s, -0.08, 0.2), V(0.05 * s, 0.14, 0.4), V(0.08 * s, 0.2, 0.25)])]);
  B.paths.nigrostriatal = [1, -1].flatMap((s) => [P([V(0.05 * s, -0.2, -0.06), V(0.12 * s, -0.1, 0.0), V(0.21 * s, -0.02, 0.08)]), P([V(0.05 * s, -0.2, -0.06), V(0.09 * s, -0.05, 0.1), V(0.12 * s, 0.07, 0.25)])]);
  B.paths.noradrenergic = [1, -1].flatMap((s) => [[0.3, 0.45, 0.5], [0.42, 0.4, -0.1], [0.3, 0.1, -0.7], [0.15, -0.35, -0.55], [0.3, -0.25, 0.25]].map(([x, y, z]) => P([V(0.03 * s, -0.3, -0.19), V(0.05 * s, -0.18, -0.2), V(x * 0.5 * s, (y - 0.1) * 0.6, z * 0.6), V(x * s, y, z)])));
  B.flow = {};
  for (const [k, curves] of Object.entries(B.paths)) {
    const n = curves.length * 70, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = { mesolimbic: '#ffd23a', mesocortical: '#ffb020', nigrostriatal: '#ff8a3a', noradrenergic: '#5ab4ff' }[k];
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 0.07, map: glowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    pts.renderOrder = 5; B.group.add(pts); B.flow[k] = { pts, curves, seeds: [...Array(n)].map((_, i) => ({ c: i % curves.length, t: Math.random(), v: 0.25 + Math.random() * 0.3 })), level: 0 };
    const lineG = new THREE.BufferGeometry().setFromPoints(curves.flatMap((c) => { const a = c.getPoints(30); const out = []; for (let i = 0; i < a.length - 1; i++) out.push(a[i], a[i + 1]); return out; }));
    const line = new THREE.LineSegments(lineG, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); line.renderOrder = 4; B.group.add(line); B.flow[k].line = line;
  }
  // Network links used by the suggestion tab (DLPFC↔insula strengthens, DLPFC↔PCC weakens in hypnosis).
  B.links = {}; const link = (a, b, col) => { const c = P([V(...a), V((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.25, (a[2] + b[2]) / 2), V(...b)]), g = new THREE.TubeGeometry(c, 40, 0.012 * S, 8, false), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); m.renderOrder = 6; B.group.add(m); return m; };
  B.links.dlpfcInsula = link([0.5, 0.3, 0.5], [0.29, -0.03, 0.04], '#7cffb0'); B.links.dlpfcPcc = link([0.5, 0.3, 0.5], [0.06, 0.22, -0.32], '#ff6a8a');
  // Glow markers for tiny nuclei so they can be found.
  B.markers = {}; for (const id of ['vta', 'lc', 'sn', 'nacc', 'amygdala', 'pineal']) { const s = glowSprite(COLORS[id], 0.35, 0); s.position.copy(B.parts[id][0].position); s.renderOrder = 7; s.material.depthTest = false; B.group.add(s); B.markers[id] = s; }
  // Dust of neurons around the brain.
  { const n = 1400, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const r = 3 + Math.random() * 9, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1); p.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b) * 0.7, r * Math.sin(b) * Math.sin(a)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); B.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: '#9fb8ff', size: 0.03, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(B.dust); }
  return B;
}

// Paint the cortex: each region its own colour, lifted when highlighted (h[id] 0…1), dimmed otherwise.
export function paintCortex(B, h = {}, focus = false) {
  const col = new THREE.Color(), base = CORTEX.map((id) => new THREE.Color(COLORS[id]));
  for (const m of B.cortex) {
    const c = m.geometry.attributes.color, reg = m.userData.region;
    for (let i = 0; i < reg.length; i++) { const id = CORTEX[reg[i]], k = h[id] || 0; col.copy(base[reg[i]]).multiplyScalar(focus ? 0.28 + 0.72 * k : 0.5 + 0.5 * k); c.setXYZ(i, col.r, col.g, col.b); }
    c.needsUpdate = true;
  }
}
export function regionOfHit(hit) { const m = hit.object; if (m.userData.cortex) return CORTEX[m.userData.region[hit.face.a]]; return m.userData.id; }
export const CORTEX_IDS = CORTEX;
