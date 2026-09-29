import * as THREE from 'three';
import { holoMaterial, glowSprite, pointCloud, fbm, weld } from './holo.js';
import { PENUMBRA_CBF } from '../sim/stroke.js';

// Holographic brain. +x is the patient's LEFT (anterior view), +z anterior,
// +y superior. Each hemisphere is an icosphere shaped into a hemisphere with
// gyri and sulci from folded noise, a Sylvian fissure and a central sulcus.
// Left-hemisphere vertices double as the "voxels" of the stroke model.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = 1.35;                                           // overall scale (~17 cm → 2.7 units)
export const CM = 2.7 / 17;                               // world units per cm
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Smooth hemisphere surface (no gyri) for a unit direction in hemisphere-local space.
function shell(d, side) {
  let x = d.x * 0.6, y = d.y * 0.7, z = d.z * 1.0;
  if (x * side < 0) x *= 0.22;                                         // flat medial wall
  if (y < -0.2) y = -0.2 + (y + 0.2) * 0.55;                             // flatter base
  const temporal = smooth(0.2, 0.8, d.x * side) * smooth(-0.1, -0.6, d.y) * smooth(-0.55, 0.1, d.z);
  x += side * 0.08 * temporal; y -= 0.1 * temporal;
  z *= 1 - 0.08 * smooth(0.2, 1, d.y);                                   // rounder crown
  return V(x * S + side * 0.34, y * S + 0.05, z * S);
}

function hemisphere(side, mat) {
  const geo = weld(new THREE.IcosahedronGeometry(1, 44));
  const pos = geo.attributes.position, n = pos.count;
  const dirs = new Float32Array(n * 3), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    dirs[i * 3] = d.x; dirs[i * 3 + 1] = d.y; dirs[i * 3 + 2] = d.z;
    const p = shell(d, side);
    // Gyri: narrow sulci carved where folded noise crosses its bands.
    const f = fbm(d.x * 2.1 + (side > 0 ? 0 : 17), d.y * 2.1, d.z * 2.1, 4);
    const band = Math.abs(Math.sin(f * 26));
    let depth = 0.055 * (1 - band) ** 4;
    // Sylvian fissure (lateral) and central sulcus (top, running down the side).
    const lat = d.x * side;
    if (lat > 0.25) { const syl = d.y - (-0.12 + 0.3 * d.z); if (d.z > -0.45) depth += 0.09 * Math.exp(-((syl / 0.06) ** 2)) * smooth(0.25, 0.6, lat); }
    const cen = d.z - (0.05 - 0.25 * d.y);
    if (d.y > -0.05) depth += 0.05 * Math.exp(-((cen / 0.045) ** 2));
    const nrm = p.clone().sub(V(side * 0.34, 0.05, 0)).normalize();
    p.addScaledVector(nrm, -depth * S);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, dirs, n };
}

// A path over the (gyri-free) surface between directions, lifted slightly.
function surfacePath(dirs, side, lift = 1.03) {
  const pts = [];
  for (let i = 0; i < dirs.length - 1; i++) {
    const a = dirs[i].clone().normalize(), b = dirs[i + 1].clone().normalize();
    for (let k = 0; k < 8; k++) {
      const q = a.clone().lerp(b, k / 8).normalize();
      const p = shell(q, side), c = V(side * 0.34, 0.05, 0);
      pts.push(c.clone().add(p.sub(c).multiplyScalar(lift)));
    }
  }
  const last = shell(dirs[dirs.length - 1].clone().normalize(), side), c = V(side * 0.34, 0.05, 0);
  pts.push(c.clone().add(last.sub(c).multiplyScalar(lift)));
  return new THREE.CatmullRomCurve3(pts);
}

export function buildBrain() {
  const g = new THREE.Group(); g.name = 'brain';
  const matL = holoMaterial({ color: '#ffffff', rim: '#ff4fd8', base: 0.26, vertexColors: true, scan: 0.18 });
  const matR = holoMaterial({ color: '#ffffff', rim: '#8b5cff', base: 0.14, vertexColors: true, scan: 0.18 });
  const L = hemisphere(+1, matL), R = hemisphere(-1, matR);
  g.add(L.mesh, R.mesh);
  // Cerebellum and brainstem.
  const cb = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), holoMaterial({ color: '#7fe8ff', rim: '#8b5cff', base: 0.08, scan: 0.9 }));
  cb.scale.set(0.95, 0.42, 0.55); cb.position.set(0, -0.72, -0.98); g.add(cb);
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.3, 24, 1, true), holoMaterial({ color: '#7fe8ff', rim: '#3ff3ff', base: 0.08 }));
  bs.position.set(0, -1.15, -0.45); bs.rotation.x = 0.25; g.add(bs);

  // MCA territory weights for the left hemisphere (lateral convexity).
  const w = new Float32Array(L.n), cM = V(1, 0.08, 0.08).normalize();
  for (let i = 0; i < L.n; i++) {
    const d = V(L.dirs[i * 3], L.dirs[i * 3 + 1], L.dirs[i * 3 + 2]);
    const c = d.dot(cM);
    let ww = smooth(0.15, 1.0, c) ** 0.8;
    ww *= smooth(-0.92, -0.6, d.z) * smooth(0.95, 0.7, d.y);          // spare occipital pole and vertex (PCA/ACA)
    w[i] = ww < 0.02 ? 0 : ww;
  }
  let terr = 0; for (let i = 0; i < L.n; i++) if (w[i] > 0) terr++;
  const mlPerVoxel = 250 / terr;                                        // whole MCA territory ≈ 250 mL

  // Arteries: internal carotids, circle of Willis, basilar, MCA/ACA/PCA.
  const mArt = holoMaterial({ color: '#ff4466', rim: '#ffd0a0', base: 0.16, opacity: 0.75 });
  const art = [];
  const add = (c, r, tag) => { const m = new THREE.Mesh(new THREE.TubeGeometry(c, 64, r, 10, false), mArt); g.add(m); art.push({ c, tag, m }); return c; };
  for (const s of [1, -1]) add(new THREE.CatmullRomCurve3([V(s * 0.3, -2.1, 0.25), V(s * 0.28, -1.3, 0.35), V(s * 0.2, -0.72, 0.28)]), 0.035, s > 0 ? 'icaL' : 'icaR');
  add(new THREE.CatmullRomCurve3([V(0, -2.1, -0.3), V(0, -1.3, -0.2), V(0, -0.78, -0.08)]), 0.035, 'basilar');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 10, 48), mArt); ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.74, 0.1); g.add(ring);
  const mcaBranches = { 1: [], [-1]: [] };
  for (const s of [1, -1]) {
    const m1 = new THREE.CatmullRomCurve3([V(s * 0.2, -0.72, 0.28), V(s * 0.45, -0.62, 0.3), V(s * 0.78, -0.42, 0.22)]);
    add(m1, 0.03, s > 0 ? 'm1L' : 'm1R');
    const syl = V(s * 1, -0.18, 0.2);
    for (const tgt of [V(s * 0.7, 0.75, 0.35), V(s * 0.85, 0.55, -0.15), V(s * 0.75, 0.45, -0.6), V(s * 0.9, -0.2, -0.75), V(s * 0.8, 0.35, 0.8), V(s * 0.95, -0.45, -0.25)]) {
      const mid = syl.clone().lerp(tgt, 0.5).add(V(s * 0.2, 0, 0));
      const c = surfacePath([syl, mid, tgt], s);
      add(c, 0.013, s > 0 ? 'mcaL' : 'mcaR'); mcaBranches[s].push(c);
    }
    add(surfacePath([V(s * 0.05, -0.2, 1), V(s * 0.1, 0.6, 0.8), V(s * 0.1, 1, 0), V(s * 0.1, 0.6, -0.8)], s, 1.0), 0.015, 'aca');
    add(surfacePath([V(s * 0.3, -0.7, -0.2), V(s * 0.4, -0.5, -0.8), V(s * 0.2, 0.1, -1)], s), 0.015, 'pca');
  }
  // Blood particles along all arteries.
  const NP = 600, flow = pointCloud(NP, 0.04); g.add(flow);
  const fu = new Float32Array(NP), fk = new Uint16Array(NP);
  for (let i = 0; i < NP; i++) { fu[i] = Math.random(); fk[i] = i % art.length; }
  // The clot in the left M1 segment.
  const clotPos = art.find((a) => a.tag === 'm1L').c.getPointAt(0.55);
  const clot = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.12, 6, 12), new THREE.MeshStandardMaterial({ color: '#400010', emissive: '#ff0030', emissiveIntensity: 1.2 }));
  clot.position.copy(clotPos); clot.rotation.z = Math.PI / 2.4; g.add(clot);
  const clotGlow = glowSprite('#ff2050', 0.5, 0.9); clotGlow.position.copy(clotPos); g.add(clotGlow);
  // Hematoma (hemorrhagic scenario), left basal ganglia.
  const hem = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshStandardMaterial({ color: '#6a0010', emissive: '#ff1a3a', emissiveIntensity: 0.7, roughness: 0.4, transparent: true, opacity: 0.92 }));
  hem.position.set(0.42, -0.08, 0.12); g.add(hem);
  const hemGlow = glowSprite('#ff2a4a', 1, 0.7); hemGlow.position.copy(hem.position); g.add(hemGlow);
  // Corticospinal tract from the left motor cortex to the brainstem (then it crosses).
  const cst = new THREE.CatmullRomCurve3([shell(V(0.45, 0.85, -0.05).normalize(), 1), V(0.42, 0.3, -0.02), V(0.28, -0.25, -0.05), V(0.1, -0.85, -0.3), V(0.02, -1.4, -0.45), V(-0.08, -2.0, -0.5)]);
  const cstMat = holoMaterial({ color: '#ffc46b', rim: '#fff0c0', base: 0.35, opacity: 1 });
  const cstMesh = new THREE.Mesh(new THREE.TubeGeometry(cst, 100, 0.035, 10, false), cstMat); g.add(cstMesh);
  // Plasticity: new connections around the lesion and across the corpus callosum.
  const arcs = [];
  const arcMat = new THREE.LineBasicMaterial({ color: '#7dffc8', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const P = L.mesh.geometry.attributes.position;
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ring1 = [], far = [];
  for (let i = 0; i < L.n; i += 7) { if (w[i] > 0.15 && w[i] < 0.5) ring1.push(i); else if (w[i] === 0) far.push(i); }
  for (let k = 0; k < 70; k++) {
    const a = ring1[Math.floor(rnd() * ring1.length)];
    const pa = V(P.getX(a), P.getY(a), P.getZ(a));
    let pb;
    if (k % 4 === 0) { const b = Math.floor(rnd() * R.n); const RP = R.mesh.geometry.attributes.position; pb = V(RP.getX(b), RP.getY(b), RP.getZ(b)); }
    else { const b = far[Math.floor(rnd() * far.length)] ?? a; pb = V(P.getX(b), P.getY(b), P.getZ(b)); }
    const mid = pa.clone().add(pb).multiplyScalar(0.5); mid.multiplyScalar(k % 4 === 0 ? 0.35 : 0.8);
    const c = new THREE.QuadraticBezierCurve3(pa, mid, pb), pts = c.getPoints(40);
    const geo = new THREE.BufferGeometry().setFromPoints(pts); geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, arcMat); g.add(line); arcs.push({ line, delay: rnd() });
  }

  const cBase = new THREE.Color('#2bd9ff'), cPen = new THREE.Color('#ffae3b'), cCore = new THREE.Color('#ff1f5a'), cSave = new THREE.Color('#5dffa8'), cScar = new THREE.Color('#5a4a7a'), cPeri = new THREE.Color('#7dffc8');
  const B = {
    group: g, left: L, right: R, weights: w, mlPerVoxel, clot, hem, hemGlow, cst, cstMesh, arcs, mode: 'stroke',
    update(dt, t, { sc, mode = 'stroke', rec = 0, lesion = null } = {}) {
      for (const m of [matL, matR, cb.material, bs.material, mArt, cstMat]) m.uniforms.uTime.value = t;
      const col = L.mesh.geometry.attributes.color.array;
      const tmp = new THREE.Color();
      const ich = sc?.type === 'ich';
      for (let i = 0; i < L.n; i++) {
        tmp.copy(cBase).multiplyScalar(0.42);
        if (mode === 'stroke' && sc && !ich && w[i] > 0) {
          if (sc.dead[i]) tmp.copy(cCore).multiplyScalar(2.2);
          else if (sc.cbf[i] < PENUMBRA_CBF) tmp.copy(cPen).multiplyScalar(1.3 + 0.5 * Math.sin(t * 4 + i * 0.01));
          else if (sc.r > 0.1 && w[i] > 0.3) tmp.copy(cSave).multiplyScalar(1.1);
        } else if (mode === 'recovery' && lesion && lesion[i]) {
          tmp.copy(cScar).multiplyScalar(1.4);
        } else if (mode === 'recovery' && lesion && w[i] > 0.12 && w[i] < 0.55) {
          tmp.lerp(cPeri, 0.25 + 0.5 * rec * (0.6 + 0.4 * Math.sin(t * 2 + i * 0.02)));
        }
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      L.mesh.geometry.attributes.color.needsUpdate = true;
      const colR = R.mesh.geometry.attributes.color.array;
      if (!R.painted) { for (let i = 0; i < R.n; i++) { colR[i * 3] = cBase.r * 0.55; colR[i * 3 + 1] = cBase.g * 0.55; colR[i * 3 + 2] = cBase.b * 0.55; } R.mesh.geometry.attributes.color.needsUpdate = true; R.painted = true; }
      // Clot, hematoma, tract and arcs.
      const occluded = mode === 'stroke' && sc && !ich && sc.r < 0.9;
      clot.visible = clotGlow.visible = occluded;
      clotGlow.material.opacity = 0.6 + 0.4 * Math.sin(t * 5);
      hem.visible = hemGlow.visible = mode === 'stroke' && ich;
      if (ich) { const [a, b, c] = sc.ichAxes(); hem.scale.set((a / 2) * CM, (c / 2) * CM, (b / 2) * CM); hemGlow.scale.setScalar(a * CM * 1.6); }
      cstMesh.visible = mode === 'recovery';
      cstMat.uniforms.uPulse.value = 0.3 + 0.5 * rec;
      for (const a of arcs) {
        a.line.visible = mode === 'recovery';
        const f = Math.min(1, Math.max(0, (rec - a.delay * 0.6) / 0.4));
        a.line.geometry.setDrawRange(0, Math.floor(41 * f));
      }
      arcMat.opacity = 0.35 + 0.35 * Math.sin(t * 2.2) ** 2;
      // Flow particles: left MCA runs dry beyond the clot until reperfusion.
      const Pp = flow.geometry.attributes.position.array, Cc = flow.geometry.attributes.color.array;
      const leftFlow = mode === 'stroke' && sc && !ich ? sc.r : 1;
      for (let i = 0; i < NP; i++) {
        const a = art[fk[i]];
        const dry = (a.tag === 'mcaL') && leftFlow < 0.5;
        const stuck = a.tag === 'm1L' && leftFlow < 0.5;
        fu[i] = (fu[i] + dt * (dry ? 0.02 * leftFlow : 0.28)) % 1;
        let u = fu[i]; if (stuck) u = Math.min(u, 0.52);
        const p = a.c.getPointAt(u);
        Pp[i * 3] = p.x; Pp[i * 3 + 1] = p.y; Pp[i * 3 + 2] = p.z;
        const k = dry ? 0.15 : 1;
        Cc[i * 3] = 1 * k; Cc[i * 3 + 1] = 0.35 * k; Cc[i * 3 + 2] = 0.45 * k;
      }
      flow.geometry.attributes.position.needsUpdate = flow.geometry.attributes.color.needsUpdate = true;
    },
  };
  hem.visible = hemGlow.visible = false; cstMesh.visible = false;
  return B;
}
