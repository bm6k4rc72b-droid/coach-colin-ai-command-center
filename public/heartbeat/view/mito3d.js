import * as THREE from 'three';
import { holoMaterial, glowSprite, pointCloud } from './holo.js';

// A mitochondrion, magnified. Outer membrane, inner membrane folded into
// cristae, respiratory complexes and rotating ATP synthases on the cristae,
// and particle streams for protons (H⁺), ATP, Ca²⁺, reactive oxygen species
// and cytochrome c. Everything is driven by the Neuron model's state.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LEN = 2.6, RAD = 0.95;            // capsule half-length (straight part) and radius

export function buildMito() {
  const g = new THREE.Group(); g.name = 'mito';
  const body = new THREE.Group(); g.add(body);
  const outer = new THREE.Mesh(new THREE.CapsuleGeometry(RAD, LEN * 2, 24, 64), holoMaterial({ color: '#ff6fb8', rim: '#ffd0f0', base: 0.05 }));
  outer.rotation.z = Math.PI / 2; body.add(outer);
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(RAD * 0.86, LEN * 2 * 0.97, 24, 64), holoMaterial({ color: '#ffae3b', rim: '#ff4fd8', base: 0.03 }));
  inner.rotation.z = Math.PI / 2; body.add(inner);
  // Matrix glow.
  const matrix = new THREE.Mesh(new THREE.CapsuleGeometry(RAD * 0.8, LEN * 2 * 0.95, 12, 32), new THREE.MeshBasicMaterial({ color: '#3a1030', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  matrix.rotation.z = Math.PI / 2; body.add(matrix);

  // Cristae: lamellar folds alternating from the top and bottom walls.
  const cristaMat = holoMaterial({ color: '#ffb347', rim: '#ff4fd8', base: 0.035, side: THREE.DoubleSide, opacity: 0.6 });
  const cristae = [], synthases = [], complexes = [];
  const NC = 11;
  for (let i = 0; i < NC; i++) {
    const x = -LEN * 0.95 + (i + 0.5) * (2 * LEN * 0.95) / NC;
    const up = i % 2 === 0 ? 1 : -1, reach = 1.05 + 0.25 * Math.sin(i * 1.7);
    const shape = new THREE.Shape();
    const h = RAD * 0.82, w = 0.12;
    // Profile in the x–y plane: rooted on the wall at y = −h, reaching into the matrix; extruded across z.
    shape.moveTo(-w, -h); shape.bezierCurveTo(-w, -h + reach, -w * 0.4, -h + reach * 1.35, 0, -h + reach * 1.4); shape.bezierCurveTo(w * 0.4, -h + reach * 1.35, w, -h + reach, w, -h); shape.lineTo(-w, -h);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.35, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16 });
    geo.translate(0, 0, -0.675);
    const m = new THREE.Mesh(geo, cristaMat); m.position.x = x; if (up < 0) m.rotation.x = Math.PI;
    m.rotation.y = 0.12 * Math.sin(i * 2.3);
    body.add(m); cristae.push(m);
    // Complexes I/III/IV (glowing beads) and ATP synthases (stalk + rotating head) along each fold.
    for (let k = 0; k < 4; k++) {
      const z = -0.5 + k * 0.33, yy = (-h + reach * (0.35 + 0.25 * (k % 2))) * up;
      const cx = glowSprite(['#3ff3ff', '#8b5cff', '#5dffa8'][k % 3], 0.16, 0.9);
      cx.position.set(x + 0.14, yy, z); body.add(cx); complexes.push(cx);
      const s = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), new THREE.MeshBasicMaterial({ color: '#ffd36b' }));
      stalk.position.y = 0.05; s.add(stalk);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), new THREE.MeshBasicMaterial({ color: '#ffe08a', wireframe: true }));
      head.position.y = 0.12; s.add(head);
      s.position.set(x - 0.13, yy + 0.08 * up, z + 0.12); s.rotation.z = Math.PI / 2 * (1) ; s.userData.head = head;
      body.add(s); synthases.push(s);
    }
  }
  // Particle systems.
  const NH = 360, NA = 140, NR = 160, NCa = 140, NCy = 90;
  const H = pointCloud(NH, 0.05, '#7ff6ff'), A = pointCloud(NA, 0.1, '#ffd36b'), Ro = pointCloud(NR, 0.08, '#ff5a3a'), Ca = pointCloud(NCa, 0.06, '#7dff9a'), Cy = pointCloud(NCy, 0.09, '#c08bff');
  g.add(H, A, Ro, Ca, Cy);
  const rnd = (() => { let s = 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const hS = Array.from({ length: NH }, () => ({ x: (rnd() * 2 - 1) * LEN, a: rnd() * Math.PI * 2, r: rnd(), ph: rnd() }));
  const aS = Array.from({ length: NA }, () => ({ u: rnd(), x: (rnd() * 2 - 1) * LEN, a: rnd() * Math.PI * 2 }));
  const rS = Array.from({ length: NR }, () => ({ x: (rnd() * 2 - 1) * LEN * 0.95, a: rnd() * Math.PI * 2, r: rnd() * 0.7, ph: rnd() * 6 }));
  const cS = Array.from({ length: NCa }, () => ({ x: (rnd() * 2 - 1) * LEN * 0.9, a: rnd() * Math.PI * 2, r: rnd() * 0.65, ph: rnd() * 6 }));
  const yS = Array.from({ length: NCy }, () => ({ u: rnd(), x: (rnd() * 2 - 1) * LEN, a: rnd() * Math.PI * 2 }));
  const setP = (cloud, i, x, y, z, vis) => { const P = cloud.geometry.attributes.position.array; P[i * 3] = x; P[i * 3 + 1] = vis ? y : 999; P[i * 3 + 2] = z; };

  // Background: a neuron's axon with smaller mitochondria riding along microtubules.
  const axon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 80, 48, 1, true), holoMaterial({ color: '#3a6cff', rim: '#3ff3ff', base: 0.01, side: THREE.BackSide, scan: 0.6, opacity: 0.4 }));
  axon.rotation.z = Math.PI / 2; g.add(axon);
  const minis = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 6, 16), holoMaterial({ color: '#ff6fb8', rim: '#ffd0f0', base: 0.08 }));
    m.rotation.z = Math.PI / 2; m.userData = { x: -10 + i * 1.8, y: (rnd() * 2 - 1) * 1.5, z: -1.3 - rnd() * 0.6, v: 0.15 + rnd() * 0.25 * (i % 2 ? 1 : -1) };
    g.add(m); minis.push(m);
  }

  const M = {
    group: g, body, outer,
    update(n, dt, t) {
      const s = n ? n.s : { psi: 176, atp: 2.5, ros: 0.05, cam: 0.1, cytc: 0, ptp: 0, o: 1 };
      const d = n ? n.derived() : { drive: 14 };
      for (const m of [outer.material, inner.material, cristaMat, axon.material]) m.uniforms.uTime.value = t;
      for (const m of minis) { const u = m.userData; u.x += u.v * dt; if (u.x > 11) u.x = -11; if (u.x < -11) u.x = 11; m.position.set(u.x, u.y, u.z); m.material.uniforms.uTime.value = t; }
      // Swelling when the permeability transition pore opens.
      const sw = 1 + 0.28 * s.ptp;
      body.scale.set(1 + 0.08 * s.ptp, sw, sw);
      outer.material.uniforms.uPulse.value = s.ptp > 0.2 ? 0.5 * Math.abs(Math.sin(t * 13)) * s.ptp : 0;
      const psiN = Math.min(1, s.psi / 176);
      inner.material.uniforms.uOpacity.value = 0.35 + 0.65 * psiN;
      cristaMat.uniforms.uOpacity.value = 0.2 + 0.4 * psiN;
      cristaMat.uniforms.uColor.value.setRGB(1, 0.35 + 0.35 * psiN, 0.2 + 0.1 * psiN);
      for (const c of complexes) c.material.opacity = 0.15 + 0.85 * s.o * (1 - 0.8 * s.ptp);
      // ATP synthase heads spin at a rate set by flux; backwards in reverse mode.
      const flux = Math.max(-1, Math.min(1, d.drive / 14));
      for (const sy of synthases) sy.userData.head.rotation.y += dt * 14 * flux;
      // Protons: pumped out across the inner membrane and streaming back through synthases.
      const k = s.o * psiN * (1 - s.ptp);
      for (let i = 0; i < NH; i++) {
        const p = hS[i]; p.ph += dt * (0.3 + 1.4 * k);
        const r = RAD * (0.8 + 0.12 * Math.sin(p.ph * 2 + p.r * 6));
        const vis = p.r < 0.25 + 0.75 * psiN;
        setP(H, i, p.x + 0.05 * Math.sin(p.ph * 3), Math.cos(p.a + p.ph * 0.2) * r * body.scale.y, Math.sin(p.a + p.ph * 0.2) * r * body.scale.z, vis);
      }
      // ATP: out of the mitochondrion when made; drawn in (and red-shifted) when consumed.
      const AC = A.geometry.attributes.color.array;
      for (let i = 0; i < NA; i++) {
        const p = aS[i]; p.u = (p.u + dt * 0.25 * Math.abs(flux) * (flux >= 0 ? 1 : -1) + 1) % 1;
        const r = RAD * (0.4 + 1.9 * p.u);
        const vis = i < NA * Math.min(1, s.atp / 2.5 + 0.05);
        setP(A, i, p.x, Math.cos(p.a) * r, Math.sin(p.a) * r, vis);
        AC[i * 3] = 1; AC[i * 3 + 1] = flux >= 0 ? 0.85 : 0.3; AC[i * 3 + 2] = flux >= 0 ? 0.3 : 0.25;
      }
      A.geometry.attributes.color.needsUpdate = true;
      // ROS sparks, matrix Ca²⁺, cytochrome c leaking out.
      const nR = Math.min(NR, Math.floor(NR * Math.min(1, s.ros / 1.2)));
      for (let i = 0; i < NR; i++) { const p = rS[i]; p.ph += dt * 3; setP(Ro, i, p.x + 0.1 * Math.sin(p.ph), Math.cos(p.a + p.ph) * p.r * body.scale.y, Math.sin(p.a + p.ph) * p.r * body.scale.z, i < nR && Math.sin(p.ph * 5) > -0.3); }
      const nC = Math.min(NCa, Math.floor(NCa * Math.min(1, s.cam / 4)));
      for (let i = 0; i < NCa; i++) { const p = cS[i]; p.ph += dt; setP(Ca, i, p.x + 0.03 * Math.sin(p.ph * 2), Math.cos(p.a + p.ph * 0.3) * p.r, Math.sin(p.a + p.ph * 0.3) * p.r, i < nC); }
      const nY = Math.floor(NCy * Math.min(1, s.cytc * 1.3));
      for (let i = 0; i < NCy; i++) { const p = yS[i]; p.u = (p.u + dt * 0.12) % 1; const r = RAD * (0.9 + 1.8 * p.u); setP(Cy, i, p.x, Math.cos(p.a) * r, Math.sin(p.a) * r, i < nY); }
      for (const c of [H, A, Ro, Ca, Cy]) c.geometry.attributes.position.needsUpdate = true;
    },
  };
  return M;
}
