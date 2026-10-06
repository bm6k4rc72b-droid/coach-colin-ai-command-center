import * as THREE from 'three';
import { glowSprite } from './holo.js';
import { vcirc } from '../sim/cosmos.js';

// VOIDFRAME · five stations, each its own group: a spiral galaxy, a box of gas and the layered atmosphere,
// a world shaped by its own gravity, the inner ear, and a ball the brain tries to catch.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o });

export function buildStations(scene) {
  const S = {};
  // Deep-sky backdrop shared by all stations.
  { const n = 2500, p = new Float32Array(n * 3), c = new Float32Array(n * 3), r = rng(5); for (let i = 0; i < n; i++) { const R = 700 + r() * 500, a = r() * Math.PI * 2, b = Math.acos(2 * r() - 1); p.set([R * Math.sin(b) * Math.cos(a), R * Math.cos(b), R * Math.sin(b) * Math.sin(a)], i * 3); const w = 0.6 + r() * 0.4; c.set([w, w, 0.8 + r() * 0.2], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); S.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, fog: false })); scene.add(S.stars); }

  // ── Galaxy: 40,000 stars on logarithmic spiral arms, a bulge and a halo of dark matter ──
  { const G = new THREE.Group(); scene.add(G); S.galaxy = G; const n = 40000, r = rng(11), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), meta = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let R, th, z; const k = r();
      if (k < 0.18) { R = Math.abs(r() + r() + r() - 1.5) * 2.2; th = r() * Math.PI * 2; z = (r() - 0.5) * 1.6 * Math.exp(-R / 2); }
      else { const arm = Math.floor(r() * 4), base = (arm / 4) * Math.PI * 2; R = 1.5 + Math.pow(r(), 0.8) * 22; th = base + Math.log(R / 1.5) / 0.22 + (r() - 0.5) * (0.5 + 2.2 / R); z = (r() - 0.5) * 0.5; }
      meta.set([R, th, z], i * 3);
      const hot = Math.exp(-R / 5); col.set([0.65 + 0.35 * hot, 0.7 + 0.2 * hot, 1 - 0.45 * hot], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    S.galPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); G.add(S.galPts); S.galMeta = meta; S.galTheta = new Float32Array(n);
    for (let i = 0; i < n; i++) S.galTheta[i] = meta[i * 3 + 1];
    const core = glowSprite('#ffe2b0', 9, 0.45); G.add(core);
    S.halo = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: '#6a4aff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })); G.add(S.halo);
    S.sun = glowSprite('#ffd27a', 1.6, 1); G.add(S.sun); S.sunRing = new THREE.Mesh(new THREE.RingGeometry(8.1, 8.3, 128), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.35, side: THREE.DoubleSide })); S.sunRing.rotation.x = -Math.PI / 2; G.add(S.sunRing); }

  // ── Vacuum: Earth with its atmosphere layers, an altitude marker, and a box of molecules ──
  { const G = new THREE.Group(); G.position.set(0, 0, -2000); scene.add(G); S.vacuum = G;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(20, 64, 32), std('#2a5cb0', { emissive: '#0a1a3a', emissiveIntensity: 0.4, roughness: 0.7 })); earth.position.set(-26, 0, 0); G.add(earth); S.earth = earth;
    const land = new THREE.Mesh(new THREE.SphereGeometry(20.05, 64, 32), new THREE.MeshStandardMaterial({ color: '#3a7a40', transparent: true, opacity: 0.0 })); earth.add(land);
    S.layers = [[0.6, '#7fb8ff', 0.22], [1.6, '#9fc8ff', 0.12], [3.2, '#c0a0ff', 0.06], [6, '#ff9a6a', 0.04]].map(([h, c, o]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(20 + h, 64, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })); earth.add(m); return m; });
    S.alt = glowSprite('#ffd27a', 2.2, 1); G.add(S.alt);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(18, 18, 18)), new THREE.LineBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.6 })); box.position.set(20, 0, 0); G.add(box); S.box = box;
    const n = 2500, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); S.mol = new THREE.Points(g, new THREE.PointsMaterial({ color: '#bfe6ff', size: 0.35, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); S.mol.position.copy(box.position); G.add(S.mol);
    const r = rng(3); S.molV = [...Array(n)].map(() => ({ p: V((r() - 0.5) * 17, (r() - 0.5) * 17, (r() - 0.5) * 17), v: V(r() - 0.5, r() - 0.5, r() - 0.5).normalize() })); }

  // ── Gravity: a small world whose shape depends on its size and material ──
  { const G = new THREE.Group(); G.position.set(0, 0, -4000); scene.add(G); S.gravity = G;
    const geo = new THREE.IcosahedronGeometry(10, 6); S.bodyBase = geo.attributes.position.array.slice(); S.bodyNoise = new Float32Array(geo.attributes.position.count);
    const r = rng(9); const lumps = [...Array(9)].map(() => [V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.4 + r() * 0.8, 0.5 + r()]);
    for (let i = 0; i < S.bodyNoise.length; i++) { const d = V(S.bodyBase[i * 3], S.bodyBase[i * 3 + 1], S.bodyBase[i * 3 + 2]).normalize(); let s = 0; for (const [c, a, w] of lumps) s += a * Math.exp(-(1 - d.dot(c)) * 3 * w); s += 0.15 * Math.sin(d.x * 9) * Math.cos(d.y * 7); S.bodyNoise[i] = s - 1.0; }
    S.body = new THREE.Mesh(geo, std('#9a8a7a', { roughness: 0.95, flatShading: true })); G.add(S.body);
    S.bodySun = new THREE.PointLight('#fff4e0', 260, 200, 1.6); S.bodySun.position.set(40, 25, 30); G.add(S.bodySun); }

  // ── Body: the inner ear — three semicircular canals and the otolith organ with its hair-cell carpet ──
  { const G = new THREE.Group(); G.position.set(0, 0, -6000); scene.add(G); S.ear = G;
    const canalM = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, transparent: true, opacity: 0.7, roughness: 0.4 });
    S.canals = [['#ff7ad9', [0, 0, 0]], ['#7fd0ff', [Math.PI / 2, 0, 0]], ['#7cff9e', [0, Math.PI / 2, 0]]].map(([c, rot]) => { const m = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 16, 64), canalM(c)); m.rotation.set(...rot); m.position.set(0, 6, 0); G.add(m); return m; });
    const sac = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 16), new THREE.MeshStandardMaterial({ color: '#ffd27a', transparent: true, opacity: 0.12, roughness: 0.5, depthWrite: false })); sac.scale.y = 0.55; sac.position.set(0, -3, 0); G.add(sac);
    const hairs = new THREE.Group(); hairs.position.set(0, -4.6, 0); G.add(hairs); S.hairs = [];
    for (let x = -3; x <= 3; x += 0.75) for (let z = -2.2; z <= 2.2; z += 0.75) { if (x * x / 9 + z * z / 4.84 > 1) continue; const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#ffe6a8', emissive: '#ffb347', emissiveIntensity: 0.1 })); h.geometry.translate(0, 0.8, 0); h.position.set(x, 0, z); hairs.add(h); S.hairs.push(h); }
    S.otoconia = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 4.6), new THREE.MeshStandardMaterial({ color: '#9a9aa8', roughness: 0.8 })); S.otoconia.position.set(0, -2.9, 0); G.add(S.otoconia);
    const arrow = (c) => new THREE.ArrowHelper(V(0, -1, 0), V(0, 0, 0), 8, c, 1.6, 0.9); S.gArrow = arrow('#7cff9e'); S.gArrow.position.set(-11, 2, 0); G.add(S.gArrow); S.fArrow = arrow('#ffd27a'); S.fArrow.position.set(-11, 2, 0); G.add(S.fArrow); S.aArrow = arrow('#ff6a7a'); S.aArrow.position.set(-11, 2, 0); G.add(S.aArrow);
    S.horizon = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.15), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.6 })); S.horizon.position.set(14, 2, 0); G.add(S.horizon);
    S.trueH = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.08), new THREE.MeshBasicMaterial({ color: '#7cff9e', transparent: true, opacity: 0.5 })); S.trueH.position.set(14, 2, 0); G.add(S.trueH); }

  // ── Perception: a hand, a falling ball, the brain's predicted ball, and a wall of shaded discs ──
  { const G = new THREE.Group(); G.position.set(0, 0, -8000); scene.add(G); S.perc = G;
    const hand = new THREE.Group(); hand.position.set(0, -6, 0); G.add(hand); S.hand = hand; const skin = std('#e0b090', { roughness: 0.8 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 2.2), skin); hand.add(palm); S.fingers = [];
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 1.6), skin); f.geometry.translate(0, 0, 0.8); f.position.set(-0.95 + i * 0.63, 0.15, 1.05); hand.add(f); S.fingers.push(f); }
    S.ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 16), std('#ff6a3a', { roughness: 0.4 })); G.add(S.ball);
    S.ghost = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 16), new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.35, wireframe: true })); G.add(S.ghost);
    const disc = (top) => new THREE.ShaderMaterial({ uniforms: { uTop: { value: top } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform float uTop; varying vec2 vU; void main(){ float d = length(vU - 0.5); if (d > 0.5) discard; float s = mix(vU.y, 1.0 - vU.y, uTop); gl_FragColor = vec4(vec3(0.15 + 0.75 * s), 1.0); }' });
    S.discs = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const flip = (i + j) % 2 === 0 ? 0 : 1, m = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), disc(flip)); m.position.set(12 + i * 3, 4 - j * 3, -2); m.userData.flip = flip; G.add(m); S.discs.push(m); }
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(17, 14), new THREE.MeshBasicMaterial({ color: '#7f7f7f' })); wall.position.set(18, -0.5, -2.05); G.add(wall); S.wall = wall; }
  return S;
}

// Rotate the galaxy differentially: each star moves at v(r)/r; without dark matter the outskirts lag.
export function spinGalaxy(S, dt, f) {
  const n = S.galTheta.length, P = S.galPts.geometry.attributes.position, M = S.galMeta;
  if (S.omegaF !== f) { S.omegaF = f; S.omega = new Float32Array(n); for (let i = 0; i < n; i++) { const R = M[i * 3]; S.omega[i] = vcirc(R + 0.05, f).v / (R + 0.3) / 2200; } }
  for (let i = 0; i < n; i++) { S.galTheta[i] += dt * S.omega[i]; const th = S.galTheta[i], R = M[i * 3]; P.setXYZ(i, R * Math.cos(th), M[i * 3 + 2], R * Math.sin(th)); }
  P.needsUpdate = true;
}
