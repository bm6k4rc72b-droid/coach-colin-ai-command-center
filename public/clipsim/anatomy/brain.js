import * as THREE from 'three';
import { BRAIN, COLORS, HEART } from '../config/anatomy.js';
import { Materials } from './materials.js';
import { gyral, fbm, noise3 } from './noise.js';

const cortex = new THREE.Color(COLORS.cortex);
const sulcus = new THREE.Color(COLORS.sulcus);
const pialVessel = new THREE.Color('#a3172b');

// A lobe is a superellipsoid, |x/a|^n + |y/b|^n + |z/c|^n = 1, with ridged
// noise on top: the crests are gyri and the grooves are sulci. Sulci are
// shaded darker because they sit in shadow and carry small pial vessels.
function buildLobe({ center, radii, exponent: n }, seed) {
  const geo = new THREE.SphereGeometry(1, 260, 160);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const [a, b, c] = radii;
  const d = new THREE.Vector3(), p = new THREE.Vector3(), nrm = new THREE.Vector3(), col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const s = Math.pow(Math.abs(d.x / a) ** n + Math.abs(d.y / b) ** n + Math.abs(d.z / c) ** n, -1 / n);
    p.copy(d).multiplyScalar(s);
    // Surface normal of the superellipsoid, taken from the gradient of its implicit function.
    nrm.set(
      Math.sign(p.x) * Math.abs(p.x / a) ** (n - 1) / a,
      Math.sign(p.y) * Math.abs(p.y / b) ** (n - 1) / b,
      Math.sign(p.z) * Math.abs(p.z / c) ** (n - 1) / c,
    ).normalize();
    const wx = p.x + center[0], wy = p.y + center[1], wz = p.z + center[2];
    const k = BRAIN.gyralScale;
    const g = gyral(wx * k + seed, wy * k * 1.3, wz * k);
    const disp = (g - 0.55) * BRAIN.gyralDepth * 2;
    p.addScaledVector(nrm, disp);
    pos.setXYZ(i, p.x, p.y, p.z);

    const mottling = fbm(wx * 0.4, wy * 0.4, wz * 0.4, 3) * 0.12;
    col.copy(sulcus).lerp(cortex, THREE.MathUtils.smoothstep(g, 0.18, 0.62));
    col.offsetHSL(0, 0, mottling);
    // Pial vessels: thin, branching arteries and veins on the cortical surface,
    // drawn where a noise field crosses zero.
    const pv = Math.abs(noise3(wx * 0.16 + seed, wy * 0.16, wz * 0.16));
    const pv2 = Math.abs(noise3(wx * 0.33, wy * 0.33 + seed, wz * 0.33));
    const pial = Math.max(1 - THREE.MathUtils.smoothstep(pv, 0.0, 0.03), 0.6 * (1 - THREE.MathUtils.smoothstep(pv2, 0.0, 0.022)));
    col.lerp(pialVessel, pial * 0.75);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, Materials.cortex(HEART.pulse.brain));
  mesh.position.set(...center);
  return mesh;
}

// The deepest visible layer: an arachnoid-lined floor standing in for the
// basal cisterns and the tentorial edge, seen past the neurovascular structures.
function buildFloor() {
  const { z, size } = BRAIN.floor;
  const geo = new THREE.PlaneGeometry(size, size, 140, 140);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(COLORS.floor), hi = new THREE.Color('#8a3a3e'), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const h = fbm(x * 0.08, y * 0.08, 3.1, 4);
    pos.setZ(i, h * 3.5);
    col.copy(base).lerp(hi, THREE.MathUtils.clamp(h + 0.5, 0, 1));
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, Materials.floor());
  mesh.position.set(0, -6, z);
  return mesh;
}

export function buildBrain() {
  const frontal = buildLobe(BRAIN.frontal, 0);
  frontal.userData.part = 'frontal';
  const temporal = buildLobe(BRAIN.temporal, 17.3);
  temporal.userData.part = 'temporal';
  const floor = buildFloor();
  floor.userData.part = 'floor';
  return { frontal, temporal, floor };
}
