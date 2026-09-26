import * as THREE from 'three';
import { BODY } from './biomech.js';

// The 3D lifter: a holographic body built from limb segments (cylinders with
// sphere joints) and translucent muscle groups that glow with activation.
// The lifter faces +x; the side camera looks from +z.

const SKIN = new THREE.MeshPhysicalMaterial({ color: '#1b3c52', emissive: '#3ff3ff', emissiveIntensity: 0.18, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 });
const JOINT = new THREE.MeshStandardMaterial({ color: '#dff9ff', emissive: '#3ff3ff', emissiveIntensity: 0.45 });
const UP = new THREE.Vector3(0, 1, 0);

function limb(radius) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, 1, 14), SKIN);
  return m;
}
function place(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length() || 1e-3;
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.scale.set(1, len, 1);
}

// Muscle groups: glowing ellipsoids placed along their segment each frame.
const MUSCLE_COLOR = { quads: '#ff4fd8', hams: '#8b5cff', glutes: '#ff6b9a', erectors: '#ffb86b', pecs: '#ff4fd8', delts: '#3ff3ff', triceps: '#8b5cff', lats: '#5dffa8' };

export function buildLifter() {
  const g = new THREE.Group();
  const seg = {};
  for (const side of ['L', 'R']) {
    seg['shank' + side] = limb(0.055); seg['thigh' + side] = limb(0.075);
    seg['upper' + side] = limb(0.045); seg['fore' + side] = limb(0.037);
    seg['foot' + side] = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.1), SKIN);
  }
  seg.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 1, 18), SKIN);
  seg.pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), SKIN);
  seg.head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), SKIN);
  Object.values(seg).forEach((m) => g.add(m));
  const joints = {};
  for (const j of ['ankleL', 'ankleR', 'kneeL', 'kneeR', 'hipL', 'hipR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR']) {
    joints[j] = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), JOINT); g.add(joints[j]);
  }
  const muscles = {};
  const mk = (id, r, sy) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), new THREE.MeshBasicMaterial({ color: MUSCLE_COLOR[id], transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.sy = sy; g.add(m); return m;
  };
  for (const side of ['L', 'R']) {
    muscles['quads' + side] = mk('quads', 0.07, 2.6); muscles['hams' + side] = mk('hams', 0.06, 2.6);
    muscles['glutes' + side] = mk('glutes', 0.085, 1.2); muscles['delts' + side] = mk('delts', 0.06, 1.1);
    muscles['triceps' + side] = mk('triceps', 0.042, 2.8); muscles['pecs' + side] = mk('pecs', 0.07, 1.1);
    muscles['lats' + side] = mk('lats', 0.06, 2.4);
  }
  muscles.erectors = mk('erectors', 0.06, 3.2);
  return { group: g, seg, joints, muscles };
}

// Pose the 3D lifter from the 2D solution. `L` = stance half-width, `grip` = hand half-width.
export function poseLifter(L, pose, lift, opts) {
  const { stanceHalf, gripHalf, valgus, activation } = opts;
  const P = (p, z) => new THREE.Vector3(p.x, p.y, z);
  const s = L.seg, j = L.joints;
  let ankle, knee, hip, shoulder, elbow = {}, hand = {};
  if (!pose.lying) {
    ankle = pose.ankle; knee = pose.knee; hip = pose.hip; shoulder = pose.shoulder;
    for (const [side, z] of [['L', stanceHalf], ['R', -stanceHalf]]) {
      const kz = z * (1 - Math.min(0.9, valgus / Math.max(0.05, stanceHalf)));   // valgus: knees cave in
      const A = P(ankle, z), K = P(knee, kz), H = P(hip, z * 0.55);
      place(s['shank' + side], A, K); place(s['thigh' + side], K, H);
      s['foot' + side].position.set(0.07, 0.03, z); s['foot' + side].quaternion.identity();
      j['ankle' + side].position.copy(A); j['knee' + side].position.copy(K); j['hip' + side].position.copy(H);
    }
    const hipC = P(hip, 0), shC = P(shoulder, 0);
    // Lumbar flexion: bend the lower torso a little (visual), from the "wink" angle.
    place(s.torso, hipC, shC);
    s.pelvis.position.copy(hipC);
    const upDir = new THREE.Vector3().subVectors(shC, hipC).normalize();
    s.head.position.copy(shC).addScaledVector(upDir, 0.2).add(new THREE.Vector3(0.03, 0, 0));
    // Arms.
    for (const [side, z] of [['L', 1], ['R', -1]]) {
      const S = shC.clone().add(new THREE.Vector3(0, -0.02, z * 0.19));
      let H;
      if (lift === 'squat') H = new THREE.Vector3(pose.bar.x, pose.bar.y, z * gripHalf);
      else H = new THREE.Vector3(pose.bar.x, pose.bar.y, z * gripHalf);
      const mid = S.clone().lerp(H, 0.5);
      const armLen = BODY.upperArm + BODY.forearm;
      const reach = S.distanceTo(H);
      const bend = Math.sqrt(Math.max(0, (armLen / 2) ** 2 - (reach / 2) ** 2));
      const E = mid.clone().add(new THREE.Vector3(lift === 'squat' ? -bend : -bend * 0.2, lift === 'squat' ? -bend * 0.6 : 0, 0));
      place(s['upper' + side], S, E); place(s['fore' + side], E, H);
      j['shoulder' + side].position.copy(S); j['elbow' + side].position.copy(E);
      elbow[side] = E; hand[side] = H;
    }
  } else {
    // Bench: lying on the bench. Torso along +x from the shoulders to the hips.
    const shY = pose.shoulder.y;
    const shC = new THREE.Vector3(0, shY, 0), hipC = new THREE.Vector3(0.52, shY - 0.02, 0);
    place(s.torso, hipC, shC);
    s.pelvis.position.copy(hipC);
    s.head.position.set(-0.2, shY + 0.02, 0);
    for (const [side, z] of [['L', 0.16], ['R', -0.16]]) {
      const H = new THREE.Vector3(0.52, shY - 0.02, z * 0.8), K = new THREE.Vector3(0.95, shY + 0.02, z * 1.4), A = new THREE.Vector3(1.05, 0.1, z * 1.6);
      place(s['thigh' + side], H, K); place(s['shank' + side], K, A);
      s['foot' + side].position.set(1.13, 0.03, z * 1.6);
      j['hip' + side].position.copy(H); j['knee' + side].position.copy(K); j['ankle' + side].position.copy(A);
    }
    for (const [side, z] of [['L', 1], ['R', -1]]) {
      const S = new THREE.Vector3(0, shY, z * 0.2);
      const Hd = new THREE.Vector3(pose.bar.x, pose.bar.y, z * gripHalf);
      const mid = S.clone().lerp(Hd, 0.5);
      const armLen = BODY.upperArm + BODY.forearm;
      const bend = Math.sqrt(Math.max(0, (armLen / 2) ** 2 - (S.distanceTo(Hd) / 2) ** 2));
      const fl = pose.flare * Math.PI / 180;
      const E = mid.clone().add(new THREE.Vector3(Math.cos(fl) * bend * 0.6, -bend * 0.7, z * Math.sin(fl) * bend * 0.6));
      place(s['upper' + side], S, E); place(s['fore' + side], E, Hd);
      j['shoulder' + side].position.copy(S); j['elbow' + side].position.copy(E);
      elbow[side] = E; hand[side] = Hd;
    }
  }
  // Muscles follow their segments; brightness and size follow activation.
  const setM = (m, pos, dir, a) => {
    m.position.copy(pos);
    if (dir) m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    m.scale.set(1 + a * 0.35, m.userData.sy * (1 + a * 0.2), 1 + a * 0.35);
    m.material.opacity = 0.06 + a * 0.42;
  };
  const A = activation;
  for (const side of ['L', 'R']) {
    const K = j['knee' + side].position, H = j['hip' + side].position, S = j['shoulder' + side].position, E = j['elbow' + side].position;
    const thighDir = new THREE.Vector3().subVectors(H, K);
    const fwd = new THREE.Vector3(1, 0, 0);
    setM(L.muscles['quads' + side], K.clone().lerp(H, 0.5).addScaledVector(fwd, pose.lying ? 0 : 0.04), thighDir, A.quads);
    setM(L.muscles['hams' + side], K.clone().lerp(H, 0.55).addScaledVector(fwd, pose.lying ? 0 : -0.05), thighDir, A.hams);
    setM(L.muscles['glutes' + side], H.clone().add(new THREE.Vector3(pose.lying ? 0 : -0.08, pose.lying ? -0.08 : 0, 0)), null, A.glutes);
    setM(L.muscles['delts' + side], S, null, A.delts);
    setM(L.muscles['triceps' + side], S.clone().lerp(E, 0.5), new THREE.Vector3().subVectors(E, S), A.triceps);
    const chest = s.torso.position.clone().lerp(S, 0.45);
    setM(L.muscles['pecs' + side], chest.add(new THREE.Vector3(pose.lying ? 0 : 0.1, pose.lying ? 0.1 : 0, S.z * 0.5)), null, A.pecs);
    setM(L.muscles['lats' + side], s.torso.position.clone().add(new THREE.Vector3(0, 0, S.z * 0.75)), UP.clone().applyQuaternion(s.torso.quaternion), A.lats);
  }
  const lower = s.pelvis.position.clone().lerp(s.torso.position, 0.6).add(new THREE.Vector3(pose.lying ? 0 : -0.11, pose.lying ? -0.12 : 0, 0));
  setM(L.muscles.erectors, lower, UP.clone().applyQuaternion(s.torso.quaternion), A.erectors);
  return { hand, elbow };
}

// Barbell with Olympic-colour plates for the load.
const PLATES = [[25, '#e02d3c', 0.225, 0.045], [20, '#2f6fe8', 0.225, 0.04], [15, '#f2c230', 0.2, 0.035], [10, '#2fbf5b', 0.165, 0.03], [5, '#eef2f6', 0.115, 0.025], [2.5, '#1b1f27', 0.1, 0.02], [1.25, '#9aa3b0', 0.08, 0.015]];
export function buildBarbell() {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhysicalMaterial({ color: '#cfd6e2', metalness: 0.9, roughness: 0.25, envMapIntensity: 2 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.2, 14), steel);
  bar.rotation.x = Math.PI / 2;
  g.add(bar);
  for (const z of [-0.8, 0.8]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 14), steel); sl.rotation.x = Math.PI / 2; sl.position.z = z + Math.sign(z) * 0.1; g.add(sl); }
  const plates = new THREE.Group(); g.add(plates);
  g.userData.setLoad = (kg) => {
    plates.clear();
    let side = Math.max(0, (kg - 20) / 2);
    let off = 0.66;
    for (const [w, col, r, t] of PLATES) {
      while (side >= w - 1e-6) {
        side -= w;
        for (const sgn of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 36), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.4, clearcoat: 0.6, emissive: col, emissiveIntensity: 0.15 }));
          p.rotation.x = Math.PI / 2; p.position.z = sgn * (off + t / 2);
          plates.add(p);
        }
        off += t + 0.004;
      }
    }
  };
  return g;
}

// A holographic gym platform with a rack and a bench.
export function buildGym(scene) {
  scene.background = new THREE.Color('#04050a');
  scene.fog = new THREE.Fog('#04050a', 8, 22);
  const grid = new THREE.GridHelper(20, 40, '#3ff3ff', '#1a2a4a');
  grid.material.transparent = true; grid.material.opacity = 0.35;
  scene.add(grid);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 2.6), new THREE.MeshPhysicalMaterial({ color: '#15101f', roughness: 0.7, clearcoat: 0.4 }));
  platform.position.y = -0.02; scene.add(platform);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.6, 0.04, 2.6)), new THREE.LineBasicMaterial({ color: '#ff4fd8' }));
  edge.position.y = -0.02; scene.add(edge);
  const rackMat = new THREE.MeshStandardMaterial({ color: '#2a3446', metalness: 0.7, roughness: 0.35, emissive: '#3ff3ff', emissiveIntensity: 0.06 });
  const rack = new THREE.Group();
  for (const x of [-0.45, 0.45]) for (const z of [-0.62, 0.62]) { const u = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.07), rackMat); u.position.set(x - 0.1, 1.15, z); rack.add(u); }
  for (const z of [-0.62, 0.62]) { const top = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.07, 0.07), rackMat); top.position.set(-0.1, 2.3, z); rack.add(top); const saf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: '#ffb86b', emissive: '#ffb86b', emissiveIntensity: 0.4 })); saf.position.set(-0.1, 0.72, z); rack.add(saf); }
  scene.add(rack);
  const bench = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), new THREE.MeshPhysicalMaterial({ color: '#1e1430', roughness: 0.5, clearcoat: 0.6 }));
  pad.position.set(0.35, 0.42, 0); bench.add(pad);
  for (const x of [-0.15, 0.85]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.26), rackMat); leg.position.set(x, 0.2, 0); bench.add(leg); }
  scene.add(bench);
  scene.add(new THREE.HemisphereLight('#7fe9ff', '#2a0a2a', 0.8));
  const key = new THREE.DirectionalLight('#fff0dc', 1.8); key.position.set(2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#c07bff', 1.2); rim.position.set(-3, 2, -2); scene.add(rim);
  const spot = new THREE.PointLight('#3ff3ff', 6, 6, 1.5); spot.position.set(0.5, 2.6, 1.5); scene.add(spot);
  return { rack, bench };
}
