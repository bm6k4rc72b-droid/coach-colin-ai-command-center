import * as THREE from 'three';
import { holoMaterial, glowSprite, pointCloud } from './holo.js';

// Holographic heart. Anterior view: the patient's left is +x, apex points
// left-anterior-inferior. Chambers are soft ellipsoids driven by the
// haemodynamic model; vessels are tubes with blood particles whose speed
// follows the aortic flow.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

function chamber(r, pos, dir, mat) {
  const g = new THREE.SphereGeometry(1, 64, 48);
  // Taper towards the "apex" end so ventricles look like cones, not eggs.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y < 0 ? 1 - 0.38 * (-y) ** 1.6 : 1;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.scale.set(r[0], r[1], r[2]); m.position.copy(pos);
  m.quaternion.setFromUnitVectors(V(0, -1, 0), dir.clone().normalize());
  m.userData.base = m.scale.clone();
  return m;
}
function tube(c, r, mat, seg = 120) { return new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 20, false), mat); }

export function buildHeart() {
  const g = new THREE.Group(); g.name = 'heart';
  const apex = V(0.5, -1, 0.32);
  const mLV = holoMaterial({ color: '#ff3d6e', rim: '#ffb0c8', base: 0.05 });
  const mRV = holoMaterial({ color: '#8b5cff', rim: '#3ff3ff', base: 0.04 });
  const mAt = holoMaterial({ color: '#c85cff', rim: '#ff9ce6', base: 0.05 });
  const mAo = holoMaterial({ color: '#ff4466', rim: '#ffd0a0', base: 0.06 });
  const mPa = holoMaterial({ color: '#3f8bff', rim: '#9ff3ff', base: 0.06 });
  const mVn = holoMaterial({ color: '#3a6cff', rim: '#8fd8ff', base: 0.05 });
  const mCor = holoMaterial({ color: '#ff7a3d', rim: '#ffe0a0', base: 0.35, opacity: 1 });

  const LV = chamber([0.64, 1.02, 0.64], V(0.24, -0.22, -0.05), apex, mLV);
  const RV = chamber([0.56, 0.86, 0.46], V(-0.24, -0.2, 0.3), V(0.35, -1, 0.25), mRV);
  const LA = chamber([0.44, 0.38, 0.42], V(0.25, 0.64, -0.45), V(0, -1, 0.2), mAt);
  const RA = chamber([0.46, 0.44, 0.44], V(-0.58, 0.42, 0.0), V(0.1, -1, 0), mAt);
  const LAA = chamber([0.12, 0.22, 0.1], V(0.62, 0.62, -0.12), V(-0.6, 0.2, -0.6), mAt);
  g.add(LV, RV, LA, RA, LAA);

  // Blood inside the LV: a warm core whose size tracks the ventricular volume.
  const blood = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ color: '#ff2050', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  blood.position.copy(LV.position); blood.quaternion.copy(LV.quaternion); g.add(blood);

  // Great vessels.
  const aorta = curve([V(0.05, 0.35, 0.02), V(0.02, 0.95, 0.1), V(0.08, 1.45, -0.12), V(0.35, 1.6, -0.45), V(0.5, 1.3, -0.75), V(0.52, 0.4, -0.85), V(0.5, -1.6, -0.8)]);
  const carotid = curve([V(0.24, 1.6, -0.36), V(0.26, 2.1, -0.38), V(0.3, 2.9, -0.4), V(0.32, 3.8, -0.42)]);
  const brachio = curve([V(0.05, 1.52, -0.2), V(-0.12, 2.05, -0.2), V(-0.2, 2.5, -0.18)]);
  const subcl = curve([V(0.45, 1.5, -0.62), V(0.62, 1.95, -0.62), V(0.95, 2.1, -0.6)]);
  const pulm = curve([V(-0.12, 0.35, 0.42), V(0.02, 0.95, 0.38), V(0.2, 1.15, 0.12)]);
  const pulmL = curve([V(0.2, 1.15, 0.12), V(0.55, 1.12, -0.12), V(1.05, 1.0, -0.3)]);
  const pulmR = curve([V(0.2, 1.15, 0.12), V(-0.2, 1.08, -0.25), V(-0.95, 0.98, -0.35)]);
  const svc = curve([V(-0.62, 1.75, -0.12), V(-0.6, 1.1, -0.05), V(-0.58, 0.72, 0.0)]);
  const ivc = curve([V(-0.48, -1.5, -0.3), V(-0.5, -0.5, -0.2), V(-0.55, 0.1, -0.05)]);
  const pv = [curve([V(1.05, 0.72, -0.6), V(0.6, 0.66, -0.5)]), curve([V(-0.45, 0.7, -0.7), V(0.0, 0.66, -0.55)])];
  g.add(tube(aorta, 0.15, mAo, 200), tube(carotid, 0.065, mAo), tube(brachio, 0.08, mAo), tube(subcl, 0.07, mAo));
  g.add(tube(pulm, 0.14, mPa), tube(pulmL, 0.1, mPa), tube(pulmR, 0.1, mPa), tube(svc, 0.12, mVn), tube(ivc, 0.13, mVn));
  for (const c of pv) g.add(tube(c, 0.06, mAt, 40));

  // Coronary arteries (LAD, circumflex, RCA) run on the surface.
  const lad = curve([V(0.02, 0.4, 0.52), V(0.12, 0.0, 0.66), V(0.3, -0.5, 0.6), V(0.5, -1.02, 0.36)]);
  const lcx = curve([V(0.1, 0.42, 0.3), V(0.6, 0.3, 0.1), V(0.82, 0.05, -0.3), V(0.6, -0.2, -0.65)]);
  const rca = curve([V(-0.1, 0.32, 0.52), V(-0.62, 0.12, 0.46), V(-0.82, -0.3, 0.05), V(-0.5, -0.6, -0.45)]);
  for (const c of [lad, lcx, rca]) g.add(tube(c, 0.028, mCor, 90));

  // Blood particles: systemic (aorta → carotid/descending) and pulmonary.
  const flow = pointCloud(420, 0.07, '#ffffff');
  const fp = new Float32Array(420); for (let i = 0; i < 420; i++) fp[i] = Math.random();
  g.add(flow);

  // Conduction: a travelling spark (SA → AV → septum → apex) plus AF micro-sparks.
  const spark = glowSprite('#fff4c0', 0.42); g.add(spark);
  const saNode = V(-0.55, 0.86, 0.18), avNode = V(-0.08, 0.12, 0.12), apexPt = V(0.44, -1.0, 0.36);
  const afSparks = []; for (let i = 0; i < 14; i++) { const s = glowSprite('#ffd36b', 0.18, 0); g.add(s); afSparks.push(s); }

  // Left-atrial appendage clot (grows with stasis in AF) and the embolus.
  const clot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshStandardMaterial({ color: '#5a0010', emissive: '#ff1030', emissiveIntensity: 0.9, roughness: 0.6 }));
  clot.position.copy(LAA.position).add(V(0.02, 0.02, 0.02)); clot.scale.setScalar(0.001); g.add(clot);
  const embPath = curve([LAA.position.clone(), V(0.3, 0.6, -0.35), V(0.25, 0.0, -0.05), V(0.05, 0.3, 0.02), V(0.02, 0.95, 0.1), V(0.1, 1.45, -0.15), V(0.24, 1.62, -0.36), V(0.26, 2.1, -0.38), V(0.3, 2.9, -0.4), V(0.32, 3.8, -0.42)]);
  const emb = glowSprite('#ff2040', 0.5, 0); g.add(emb);
  const embTrail = pointCloud(40, 0.09, '#ff5070'); g.add(embTrail);

  const H = {
    group: g, LV, RV, LA, RA, LAA, blood, clot, emb, embState: null,
    update(heart, dt, t) {
      const sq = heart.squeeze, now = heart.now, af = heart.p.af, rr = heart.rr, tb = heart.tb;
      // Ventricles shorten and thicken; volume ∝ scale³ tracks the LV volume.
      const k = 1 - 0.13 * sq;
      for (const [m, kk] of [[LV, k], [RV, 1 - 0.11 * sq]]) m.scale.set(m.userData.base.x * kk, m.userData.base.y * (1 - 0.06 * sq), m.userData.base.z * kk);
      // Atria contract just before the QRS (the "kick"); in AF they only quiver.
      const u = (tb - (rr - 0.16)) / 0.1, at = !af && u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
      const quiver = af ? 0.015 * Math.sin(t * 38) : 0;
      for (const m of [LA, RA, LAA]) { const b = m.userData.base, s = 1 - 0.1 * at + quiver; m.scale.set(b.x * s, b.y * s, b.z * s); }
      const vol = Math.max(0.2, (heart.V - 10) / 140);
      blood.scale.set(0.5 * Math.cbrt(vol), 0.82 * Math.cbrt(vol), 0.5 * Math.cbrt(vol));
      const pulse = Math.exp(-((tb - 0.12) ** 2) / 0.006);
      for (const m of [LV, RV]) m.material.uniforms.uPulse.value = 0.7 * pulse;
      for (const m of g.children) if (m.material?.uniforms?.uTime) m.material.uniforms.uTime.value = t;
      // Blood particles: 70 % systemic, 30 % pulmonary. Speed follows aortic flow.
      const q = now ? now.Qav : 0, spd = 0.04 + q / 900;
      const P = flow.geometry.attributes.position.array, C = flow.geometry.attributes.color.array;
      for (let i = 0; i < 420; i++) {
        fp[i] = (fp[i] + dt * spd * (0.8 + 0.4 * ((i * 7919) % 13) / 13)) % 1;
        let p, c;
        if (i < 250) { const branch = i % 5 === 0; p = branch ? carotid.getPointAt(fp[i]) : aorta.getPointAt(fp[i]); c = [1, 0.25 + 0.2 * (1 - fp[i]), 0.35]; }
        else { const cv = i % 2 ? pulmL : pulmR; p = fp[i] < 0.35 ? pulm.getPointAt(fp[i] / 0.35) : cv.getPointAt((fp[i] - 0.35) / 0.65); c = [0.35, 0.55, 1]; }
        const j = (i * 12.9898) % 1;
        P[i * 3] = p.x + (j - 0.5) * 0.08; P[i * 3 + 1] = p.y + (((i * 78.233) % 1) - 0.5) * 0.08; P[i * 3 + 2] = p.z + (((i * 37.719) % 1) - 0.5) * 0.08;
        C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2];
      }
      flow.geometry.attributes.position.needsUpdate = flow.geometry.attributes.color.needsUpdate = true;
      // Conduction spark.
      const s = spark;
      if (!af && tb > rr - 0.16 && tb < rr - 0.07) { s.visible = true; s.position.lerpVectors(saNode, avNode, (tb - (rr - 0.16)) / 0.09); }
      else if (tb < 0.07) { s.visible = true; s.position.lerpVectors(avNode, apexPt, tb / 0.07); }
      else s.visible = false;
      for (let i = 0; i < afSparks.length; i++) {
        const a = afSparks[i];
        if (!af) { a.material.opacity = 0; continue; }
        const ph = t * (9 + i) + i * 1.7;
        const base = i % 2 ? LA.position : RA.position;
        a.position.set(base.x + 0.32 * Math.sin(ph * 1.3), base.y + 0.25 * Math.cos(ph * 0.9), base.z + 0.3 * Math.sin(ph * 0.7 + i));
        a.material.opacity = 0.5 + 0.5 * Math.sin(ph * 3);
      }
      // Clot grows with left-atrial stasis.
      const cs = this.embState ? 0.001 : 0.02 + 0.11 * heart.stasis;
      clot.scale.setScalar(heart.stasis > 0.02 ? cs : 0.001);
      // Embolus flight.
      const E = this.embState;
      if (E) {
        E.t += dt / 2.6;
        const e = Math.min(1, E.t), pt = embPath.getPointAt(e);
        emb.position.copy(pt); emb.material.opacity = e < 1 ? 1 : 0; emb.scale.setScalar(0.45 + 0.1 * Math.sin(t * 20));
        const TP = embTrail.geometry.attributes.position.array;
        for (let i = 0; i < 40; i++) { const pp = embPath.getPointAt(Math.max(0, e - i * 0.006)); TP[i * 3] = pp.x; TP[i * 3 + 1] = pp.y; TP[i * 3 + 2] = pp.z; }
        embTrail.geometry.attributes.position.needsUpdate = true; embTrail.visible = e < 1;
        if (E.t >= 1 && !E.done) { E.done = true; E.cb?.(); }
      } else { emb.material.opacity = 0; embTrail.visible = false; }
    },
    launch(cb) { this.embState = { t: 0, cb }; },
    clearEmbolus() { this.embState = null; },
  };
  embTrail.visible = false;
  return H;
}
