import * as THREE from 'three';
import { buildEarth, starfield } from './earthtex.js';
import { glowSprite } from './holo.js';
import { RE, OMEGA_E } from '../sim/atmos.js';

// Orbit view: 1 unit = 1000 km. Inertial frame with Earth's axis along +y
// (sim z → three y, sim y → three −z). Earth spins at the sidereal rate.

const K = 1e-6;                                            // metres → scene units
export const toThree = (r) => new THREE.Vector3(r[0] * K, r[2] * K, -r[1] * K);

function line(color, n, dashed = false, opacity = 0.9) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const l = new THREE.Line(g, m); l.frustumCulled = false; return l;
}
function setLine(l, pts) {
  const a = l.geometry.attributes.position.array, n = a.length / 3;
  for (let i = 0; i < n; i++) { const p = pts[Math.min(pts.length - 1, i)] || new THREE.Vector3(); a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; }
  l.geometry.attributes.position.needsUpdate = true; l.geometry.setDrawRange(0, Math.min(n, pts.length));
  if (l.computeLineDistances && l.material.isLineDashedMaterial) l.computeLineDistances();
}

export function buildOrbitScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#010207'); scene.environmentIntensity = 0.15;
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 5000);
  const sunDir = new THREE.Vector3(1, 0.25, 0.4).normalize();
  const sun = new THREE.DirectionalLight('#fff6e8', 3.2); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun);
  scene.add(new THREE.AmbientLight('#335', 0.25));
  const E = buildEarth(RE * K, { sun: sunDir }); scene.add(E.group);
  scene.add(starfield(6000, 1500));
  const sunSprite = glowSprite('#fff2d0', 60, 0.9); sunSprite.position.copy(sunDir).multiplyScalar(1200); scene.add(sunSprite);
  // Equator and GEO reference ring.
  const ring = (r, color, dashed) => { const pts = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } const l = line(color, 257, dashed, 0.5); setLine(l, pts); return l; };
  scene.add(ring(42.164, '#ffb86b', true), ring(RE * K * 1.002, '#3ff3ff', false));
  const orbitLine = line('#5dffa8', 361), targetLine = line('#ff4fd8', 361, true, 0.85), track = line('#ffd36b', 600, false, 0.8), hist = line('#3ff3ff', 600, false, 0.5);
  scene.add(orbitLine, targetLine, hist); E.surf.add(track);             // the ground track spins with the Earth
  const craft = glowSprite('#ffffff', 0.5, 1); scene.add(craft);
  const craftCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: '#ffffff' })); scene.add(craftCore);
  const burnMark = glowSprite('#ff4fd8', 0.7, 0); scene.add(burnMark);
  const trail = [], ground = [];
  const cam0 = { yaw: 0.8, pitch: 0.45, r: 30, drag: null, last: 0, follow: false };
  return {
    scene, cam, cam0,
    setTarget(pts) { setLine(targetLine, pts); targetLine.visible = pts.length > 0; },
    update(C, dt, t) {
      // Earth rotation (GMST advances at ω⊕).
      E.surf.rotation.y = OMEGA_E * C.t; E.clouds.rotation.y = OMEGA_E * C.t * 1.03;
      const p = toThree(C.r); craft.position.copy(p); craftCore.position.copy(p); craftCore.rotation.y += dt * 2;
      craft.material.opacity = 0.8 + 0.2 * Math.sin(t * 6);
      if (this.pathDirty || !this.pathT || t - this.pathT > 0.5) { setLine(orbitLine, C.path(360).map(toThree)); this.pathT = t; this.pathDirty = false; }
      trail.push(p.clone()); if (trail.length > 600) trail.shift(); setLine(hist, trail);
      // Ground track just above the (rotating) surface.
      const gp = C.ground(), lat = (gp.lat * Math.PI) / 180, lon = (gp.lon * Math.PI) / 180;   // Earth-fixed
      const R = RE * K * 1.004;
      ground.push(new THREE.Vector3(R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), -R * Math.cos(lat) * Math.sin(lon)));
      if (ground.length > 600) ground.shift();
      setLine(track, ground);
      burnMark.material.opacity = Math.max(0, burnMark.material.opacity - dt * 0.8);
      const c = cam0; if (!c.drag && performance.now() - c.last > 4000) c.yaw += dt * 0.03;
      const tgt = c.follow ? p : new THREE.Vector3();
      cam.position.set(tgt.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.r, tgt.y + Math.sin(c.pitch) * c.r, tgt.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.r);
      cam.lookAt(tgt);
    },
    flashBurn(C) { burnMark.position.copy(toThree(C.r)); burnMark.material.opacity = 1; this.pathDirty = true; },
    reset() { trail.length = 0; ground.length = 0; this.pathDirty = true; },
  };
}
