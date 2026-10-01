import * as THREE from 'three';
import { glowSprite } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// GENOME ATHLETE · a B-DNA double helix to scale in shape: 10.5 base pairs per turn, rise 0.34 nm
// per pair (here 0.11 units), the two backbones offset by ~140° so the major and minor grooves
// show. Base pairs are coloured (A green · T rose · C blue · G gold). SNP loci are marked by
// rings, beacons and labels; the selected locus glows.
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_COLOR = { A: '#3dffb4', T: '#ff5c8a', C: '#4aa8ff', G: '#ffd166' };
const PAIR = { A: 'T', T: 'A', C: 'G', G: 'C' };

export function textSprite(text, { color = '#e8fff6', size = 0.5, font = '600 44px "Space Grotesk", sans-serif', bg = 'rgba(4,10,20,.55)' } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 36; c.width = w; c.height = 64;
  g.font = font; g.fillStyle = bg; g.beginPath(); g.roundRect(0, 4, w, 56, 12); g.fill();
  g.strokeStyle = color; g.globalAlpha = 0.5; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 18, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((size * w) / 64, size, 1); return s;
}

export function buildHelix({ bp = 180, rise = 0.11, radius = 1, loci = [], seed = 7, labels = true } = {}) {
  const group = new THREE.Group(), twist = (2 * Math.PI) / 10.5, off = (140 * Math.PI) / 180, H = bp * rise;
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const seq = Array.from({ length: bp }, () => 'ATCG'[Math.floor(r() * 4)]);
  const y0 = -H / 2, at = (i, strand) => { const th = i * twist + (strand ? off : 0); return new THREE.Vector3(Math.cos(th) * radius, y0 + i * rise, Math.sin(th) * radius); };
  // Backbones: smooth tubes.
  const bbMat = [new THREE.MeshStandardMaterial({ color: '#1aa9c4', emissive: '#0a7f9a', emissiveIntensity: 0.35, metalness: 0.45, roughness: 0.28, envMapIntensity: 0.5 }), new THREE.MeshStandardMaterial({ color: '#6a45d8', emissive: '#4a2aa8', emissiveIntensity: 0.35, metalness: 0.45, roughness: 0.28, envMapIntensity: 0.5 })];
  for (const k of [0, 1]) {
    const pts = []; for (let i = 0; i < bp; i += 0.5) pts.push(at(i, k));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), bp * 4, 0.075, 8, false), bbMat[k]));
  }
  // Phosphate beads and base-pair rungs (two half-rungs per pair, coloured by base).
  const bead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: '#7fd8e8', emissive: '#0b6f86', emissiveIntensity: 0.2, metalness: 0.3, roughness: 0.3, envMapIntensity: 0.4 }), bp * 2);
  const rung = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.1, envMapIntensity: 0.35 }), bp * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (let i = 0; i < bp; i++) {
    const A = at(i, 0), B = at(i, 1), mid = A.clone().add(B).multiplyScalar(0.5), len = A.distanceTo(B) / 2 - 0.08;
    bead.setMatrixAt(2 * i, m4.makeTranslation(A.x, A.y, A.z)); bead.setMatrixAt(2 * i + 1, m4.makeTranslation(B.x, B.y, B.z));
    for (const [k, P, base] of [[0, A, seq[i]], [1, B, PAIR[seq[i]]]]) {
      const dir = mid.clone().sub(P).normalize(), c = P.clone().addScaledVector(dir, len / 2 + 0.04);
      q.setFromUnitVectors(up, dir); m4.compose(c, q, new THREE.Vector3(1, len, 1)); rung.setMatrixAt(2 * i + k, m4); rung.setColorAt(2 * i + k, col.set(BASE_COLOR[base]));
    }
  }
  group.add(bead, rung);
  // Loci: evenly spaced along the helix.
  const lociOut = loci.map((L, n) => {
    const i = Math.round(((n + 0.5) / loci.length) * (bp - 1)), y = y0 + i * rise, th = i * twist + off / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.55, 0.02, 6, 72), new THREE.MeshBasicMaterial({ color: '#3dffb4', transparent: true, opacity: 0.35 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = y; group.add(ring);
    const beacon = glowSprite('#3dffb4', 0.9, 0.55); beacon.position.set(Math.cos(th) * radius * 0.2, y, Math.sin(th) * radius * 0.2); group.add(beacon);
    let label = null; if (labels) { label = textSprite(L.label, { size: 0.3 }); label.position.set(radius * 2.1, y, 0); label.center.set(0, 0.5); group.add(label); }
    return { id: L.id, i, y, ring, beacon, label };
  });
  group.userData = { loci: lociOut, rung, bead, H, seq, sel: null };
  return group;
}

// Highlight the selected locus; colour its two half-rungs by the genotype's allele bases.
export function updateHelix(h, t, sel) {
  for (const L of h.userData.loci) {
    const on = L.id === sel, pulse = 0.5 + 0.5 * Math.sin(t * 4);
    L.ring.material.opacity = on ? 0.75 + 0.25 * pulse : 0.22;
    L.ring.material.color.set(on ? '#ffd166' : '#3dffb4');
    L.ring.scale.setScalar(on ? 1 + 0.08 * pulse : 1);
    L.beacon.material.color.set(on ? '#ffd166' : '#3dffb4'); L.beacon.scale.setScalar(on ? 1.6 + 0.4 * pulse : 0.7);
    if (L.label) { L.label.material.opacity = on ? 1 : 0.55; }
  }
}
