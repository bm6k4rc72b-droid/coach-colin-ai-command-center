import * as THREE from 'three';
import { glowSprite, pointCloud } from './holo.js';
import { buildHelix, textSprite } from './helix.js';
import { SNPS } from '../sim/genes.js';
import { HER, CAL } from '../sim/train.js';

// ─────────────────────────────────────────────────────────────────────────────
// GENOME ATHLETE · the stage: a bioluminescent lab void with drifting dust, the main helix
// (genome / plan tabs), three helices with an allele stream (inheritance), and a 3D cohort cloud
// of HERITAGE-style responders (trainability).
// ─────────────────────────────────────────────────────────────────────────────

export function buildWorld(cohort) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02060f'); scene.fog = new THREE.FogExp2('#02060f', 0.018);
  scene.add(new THREE.HemisphereLight('#7ff7ff', '#120a2a', 0.35));
  const key = new THREE.DirectionalLight('#ffffff', 1.0); key.position.set(4, 8, 6); scene.add(key);
  const rim = new THREE.PointLight('#8b5cff', 30, 30, 1.5); rim.position.set(-5, 2, -4); scene.add(rim);
  const rim2 = new THREE.PointLight('#3dffb4', 25, 30, 1.5); rim2.position.set(5, -3, 3); scene.add(rim2);
  // Dust: slow bioluminescent motes.
  const dust = pointCloud(900, 0.09, '#ffffff'); scene.add(dust);
  { const P = dust.geometry.attributes.position.array, C = dust.geometry.attributes.color.array, pal = ['#3dffb4', '#4aa8ff', '#8b5cff', '#ffd166', '#ff5c8a'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 900; i++) { const r = 4 + Math.random() * 26, th = Math.random() * 7, y = (Math.random() - 0.5) * 30; P.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3); const c = pal[i % 5]; C.set([c.r * 0.6, c.g * 0.6, c.b * 0.6], i * 3); } }
  // Holographic floor rings.
  const floor = new THREE.Group(); floor.position.y = -11; scene.add(floor);
  for (let i = 1; i <= 6; i++) { const ring = new THREE.Mesh(new THREE.RingGeometry(i * 1.6, i * 1.6 + 0.03, 128), new THREE.MeshBasicMaterial({ color: i % 2 ? '#3dffb4' : '#8b5cff', transparent: true, opacity: 0.3 / Math.sqrt(i), side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; floor.add(ring); }

  // Main helix with every SNP as a locus.
  const helix = buildHelix({ bp: 190, loci: SNPS.map((s) => ({ id: s.id, label: `${s.gene} · ${s.name}` })) });
  scene.add(helix);

  // Inheritance: two parent helices and a child, with an allele stream between them.
  const inherit = new THREE.Group(); scene.add(inherit);
  const pA = buildHelix({ bp: 110, seed: 11, labels: false, loci: [{ id: 'x', label: '' }] }), pB = buildHelix({ bp: 110, seed: 23, labels: false, loci: [{ id: 'x', label: '' }] }), child = buildHelix({ bp: 130, seed: 37, labels: false, loci: [{ id: 'x', label: '' }] });
  pA.position.set(-4.6, 0, -2); pB.position.set(4.6, 0, -2); child.position.set(0, 0, 1.5); pA.scale.setScalar(0.7); pB.scale.setScalar(0.7);
  inherit.add(pA, pB, child);
  const tags = [textSprite('PARENT A', { size: 0.5, color: '#4aa8ff' }), textSprite('PARENT B', { size: 0.5, color: '#ff5c8a' }), textSprite('CHILD', { size: 0.55, color: '#ffd166' })];
  tags[0].position.set(-4.6, 5.2, -2); tags[1].position.set(4.6, 5.2, -2); tags[2].position.set(0, 8.4, 1.5); inherit.add(...tags);
  const stream = pointCloud(600, 0.22, '#ffffff'); inherit.add(stream);
  const seeds = Array.from({ length: 600 }, (_, i) => ({ side: i % 2, u: Math.random(), sp: 0.15 + Math.random() * 0.25, y: (Math.random() - 0.5) * 9, ph: Math.random() * 7 }));
  inherit.userData = { pA, pB, child, stream, seeds };

  // Trainability: the cohort cloud. x = favourable alleles, y = VO₂max gain, z = jitter.
  const cloud = new THREE.Group(); scene.add(cloud);
  const XK = (k) => (k - CAL.meanK) * 0.32, YD = (d) => (d - HER.mu) / 110;
  const pts = pointCloud(cohort.length, 0.16, '#ffffff'); cloud.add(pts);
  { const P = pts.geometry.attributes.position.array, C = pts.geometry.attributes.color.array, lo = new THREE.Color('#8b5cff'), mid = new THREE.Color('#4aa8ff'), hi = new THREE.Color('#3dffb4'), c = new THREE.Color();
    cohort.forEach((p, i) => { const z = Math.sin(i * 12.9898) * 43758.5453 % 1; P.set([XK(p.k + (Math.random() - 0.5) * 0.8), YD(p.d), z * 2.4], i * 3); const u = Math.max(0, Math.min(1, (p.d + 100) / 900)); c.copy(u < 0.5 ? lo.clone().lerp(mid, u * 2) : mid.clone().lerp(hi, (u - 0.5) * 2)); C.set([c.r, c.g, c.b], i * 3); }); }
  // Axes and the regression line.
  const axM = new THREE.LineBasicMaterial({ color: '#5a6a88', transparent: true, opacity: 0.7 });
  const line = (a, b, m = axM) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), m);
  cloud.add(line(new THREE.Vector3(XK(0), YD(-300), 0), new THREE.Vector3(XK(30), YD(-300), 0)), line(new THREE.Vector3(XK(0), YD(-300), 0), new THREE.Vector3(XK(0), YD(1200), 0)));
  for (const d of [0, 400, 800, 1200]) { const tk = textSprite(`+${d} mL/min`, { size: 0.32, color: '#9fb3d9', bg: 'rgba(0,0,0,0)' }); tk.position.set(XK(0) - 0.3, YD(d), 0); tk.center.set(1, 0.5); cloud.add(tk); cloud.add(line(new THREE.Vector3(XK(0), YD(d), 0), new THREE.Vector3(XK(30), YD(d), 0), new THREE.LineBasicMaterial({ color: '#24314a', transparent: true, opacity: 0.6 }))); }
  for (const k of [5, 10, 15, 20, 25]) { const tk = textSprite(String(k), { size: 0.32, color: '#9fb3d9', bg: 'rgba(0,0,0,0)' }); tk.position.set(XK(k), YD(-300) - 0.45, 0); cloud.add(tk); }
  const xl = textSprite('FAVOURABLE ALLELES (21 SNPs)', { size: 0.36, color: '#3dffb4', bg: 'rgba(0,0,0,0)' }); xl.position.set(XK(15), YD(-300) - 1.1, 0); cloud.add(xl);
  const reg = line(new THREE.Vector3(XK(3), YD(HER.mu + CAL.beta * (3 - CAL.meanK)), 0.01), new THREE.Vector3(XK(26), YD(HER.mu + CAL.beta * (26 - CAL.meanK)), 0.01), new THREE.LineBasicMaterial({ color: '#ffd166' })); cloud.add(reg);
  const you = glowSprite('#ffd166', 1.4, 1); cloud.add(you);
  const youLine = line(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), new THREE.LineBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.6 })); cloud.add(youLine);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })); cloud.add(band);
  cloud.userData = { XK, YD, you, youLine, band };
  cloud.position.set(0, -1, 0);

  return { scene, helix, inherit, cloud, dust, floor };
}
