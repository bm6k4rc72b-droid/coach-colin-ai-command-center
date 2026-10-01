import * as THREE from 'three';
import { fbm, weld } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// NEUROLENS · a pearl-glass holographic brain for a white interface. Cortex
// vertices tint pink where their region is active; deep nuclei glow as nodes;
// dopamine, noradrenaline and visual pathways carry travelling pulses.
// +x = left hemisphere, +y superior, +z anterior.
// ─────────────────────────────────────────────────────────────────────────────

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = 1.35;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function shell(d, side) {
  let x = d.x * 0.6, y = d.y * 0.7, z = d.z * 1.0;
  if (x * side < 0) x *= 0.22;
  if (y < -0.2) y = -0.2 + (y + 0.2) * 0.55;
  const temporal = smooth(0.2, 0.8, d.x * side) * smooth(-0.1, -0.6, d.y) * smooth(-0.55, 0.1, d.z);
  x += side * 0.08 * temporal; y -= 0.1 * temporal;
  z *= 1 - 0.08 * smooth(0.2, 1, d.y);
  return V(x * S + side * 0.34, y * S + 0.05, z * S);
}
function hemisphere(side, mat) {
  const geo = weld(new THREE.IcosahedronGeometry(1, 36));
  const pos = geo.attributes.position, n = pos.count, d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const p = shell(d, side);
    const f = fbm(d.x * 2.1 + (side > 0 ? 0 : 17), d.y * 2.1, d.z * 2.1, 4);
    let depth = 0.055 * (1 - Math.abs(Math.sin(f * 26))) ** 4;
    const lat = d.x * side;
    if (lat > 0.25 && d.z > -0.45) depth += 0.09 * Math.exp(-(((d.y - (-0.12 + 0.3 * d.z)) / 0.06) ** 2)) * smooth(0.25, 0.6, lat);
    if (d.y > -0.05) depth += 0.05 * Math.exp(-(((d.z - (0.05 - 0.25 * d.y)) / 0.045) ** 2));
    p.addScaledVector(p.clone().sub(V(side * 0.34, 0.05, 0)).normalize(), -depth * S);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0), 3));
  return { mesh: new THREE.Mesh(geo, mat), n };
}

// Pearl glass: Fresnel rim in pink, translucent body, per-vertex activity tint. Normal blending
// (additive light disappears on a white background).
export function pearlMaterial({ rim = '#ff4fa3', base = 0.32, tint = '#ff2f8e', opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uRim: { value: new THREE.Color(rim) }, uTint: { value: new THREE.Color(tint) }, uBase: { value: base }, uTime: { value: 0 }, uOpacity: { value: opacity } },
    vertexShader: `attribute vec3 color; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); vC = color; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uRim, uTint; uniform float uBase, uTime, uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vW;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float act = clamp(vC.r, 0.0, 1.0);
        float scan = 0.5 + 0.5 * sin(vW.y * 70.0 - uTime * 2.0);
        // Soft key light from the upper left reveals the gyri; the body stays pearl-white.
        float lit = 0.72 + 0.28 * max(0.0, dot(normalize(vN), normalize(vec3(-0.4, 0.8, 0.5))));
        vec3 pearl = vec3(1.0, 0.965, 0.985) * lit;
        vec3 c = mix(pearl, uRim, f * 0.8);
        c = mix(c, uTint, act * 0.85);
        c += vec3(0.05, 0.0, 0.04) * scan * f;
        float a = clamp(uBase + f * 0.85 + act * 0.55, 0.0, 0.96) * uOpacity;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false,               // the shader declares its own colour attribute
  });
}

// Regions: position (left hemisphere; mirrored when bilateral), colour, cortical (tints the surface) or deep (node).
export const REGION_DEF = {
  vta: { p: [0, -0.62, -0.18], bi: false, deep: true, sys: 'reward' },
  nacc: { p: [0.17, -0.2, 0.55], bi: true, deep: true, sys: 'reward' },
  vmpfc: { p: [0.12, -0.05, 1.22], bi: true, deep: false, sys: 'reward' },
  ofc: { p: [0.42, -0.25, 1.05], bi: true, deep: false, sys: 'reward' },
  amyg: { p: [0.55, -0.48, 0.28], bi: true, deep: true, sys: 'salience' },
  insula: { p: [0.86, 0.02, 0.3], bi: true, deep: false, sys: 'salience' },
  acc: { p: [0.1, 0.38, 0.62], bi: true, deep: false, sys: 'salience' },
  lc: { p: [0.05, -0.95, -0.48], bi: false, deep: true, sys: 'salience' },
  dlpfc: { p: [0.72, 0.6, 0.85], bi: true, deep: false, sys: 'control' },
  sc: { p: [0, -0.45, -0.5], bi: false, deep: true, sys: 'control' },
  hipp: { p: [0.55, -0.36, -0.22], bi: true, deep: true, sys: 'memory' },
  v1: { p: [0.15, 0.08, -1.32], bi: true, deep: false, sys: 'visual' },
  v4: { p: [0.5, -0.32, -0.98], bi: true, deep: false, sys: 'visual' },
  mt: { p: [1.0, -0.02, -0.66], bi: true, deep: false, sys: 'visual' },
  ffa: { p: [0.6, -0.5, -0.66], bi: true, deep: false, sys: 'visual' },
  dmn: { p: [0.1, 0.62, -0.62], bi: true, deep: false, sys: 'dmn', extra: [[0.1, 0.5, 1.0], [0.95, 0.45, -0.62]] },
};
export const SYS_COL = { reward: '#ff2f8e', salience: '#ff7a59', control: '#b05cff', memory: '#ff9ad1', visual: '#e04bd6', dmn: '#7d6bff' };
const PATHS = [
  { k: 'meso', col: '#ff2f8e', pts: [[0, -0.62, -0.18], [0.1, -0.45, 0.2], [0.17, -0.2, 0.55]], src: 'vta' },          // mesolimbic
  { k: 'meso', col: '#ff2f8e', pts: [[0, -0.62, -0.18], [0.1, -0.2, 0.4], [0.12, 0.1, 0.95], [0.12, -0.05, 1.22]], src: 'vta' },   // mesocortical
  { k: 'meso', col: '#ff2f8e', pts: [[0, -0.62, -0.18], [0.3, 0.0, 0.3], [0.6, 0.45, 0.7], [0.72, 0.6, 0.85]], src: 'vta' },
  { k: 'ne', col: '#ff8a3d', pts: [[0.05, -0.95, -0.48], [0.1, -0.4, -0.7], [0.15, 0.4, -0.9], [0.15, 0.08, -1.32]], src: 'lc' },  // LC → cortex
  { k: 'ne', col: '#ff8a3d', pts: [[0.05, -0.95, -0.48], [0.2, -0.3, 0.0], [0.4, 0.6, 0.4], [0.72, 0.6, 0.85]], src: 'lc' },
  { k: 'ne', col: '#ff8a3d', pts: [[0.05, -0.95, -0.48], [0.05, -0.2, 0.1], [0.1, 0.38, 0.62]], src: 'lc' },
  { k: 'vis', col: '#d24bff', pts: [[0.15, 0.08, -1.32], [0.35, -0.2, -1.15], [0.5, -0.32, -0.98], [0.6, -0.5, -0.66]], src: 'v1' },  // ventral "what"
  { k: 'vis', col: '#d24bff', pts: [[0.15, 0.08, -1.32], [0.6, 0.1, -1.0], [1.0, -0.02, -0.66]], src: 'v1' },                      // dorsal "where/motion"
  { k: 'sal', col: '#ff7a59', pts: [[0.55, -0.48, 0.28], [0.5, -0.4, 0.7], [0.42, -0.25, 1.05]], src: 'amyg' },                    // amygdala → OFC
  { k: 'sal', col: '#b05cff', pts: [[0, -0.45, -0.5], [0.15, -0.1, -0.3], [0.55, -0.48, 0.28]], src: 'sc' },                       // colliculus → pulvinar → amygdala
];

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildBrain() {
  const g = new THREE.Group();
  const matL = pearlMaterial({ rim: '#ff6fb5' }), matR = pearlMaterial({ rim: '#c58bff' });
  const L = hemisphere(+1, matL), R = hemisphere(-1, matR); g.add(L.mesh, R.mesh);
  const deepMat = pearlMaterial({ rim: '#e7b8ff', base: 0.18 });
  const cb = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), deepMat); cb.scale.set(0.95, 0.42, 0.55); cb.position.set(0, -0.72, -0.98); cb.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cb.geometry.attributes.position.count * 3), 3)); g.add(cb);
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 1.3, 24, 1, true), deepMat); bs.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bs.geometry.attributes.position.count * 3), 3)); bs.position.set(0, -1.15, -0.45); bs.rotation.x = 0.25; g.add(bs);
  // Surface weights: for cortical regions, which vertices they tint.
  const tex = glowTex(), nodes = {}, weights = [];
  for (const [k, def] of Object.entries(REGION_DEF)) {
    const centres = [def.p, ...(def.extra || [])].flatMap((p) => (def.bi ? [p, [-p[0], p[1], p[2]]] : [p]));
    nodes[k] = centres.map((p) => {
      const col = new THREE.Color(SYS_COL[def.sys]);
      const core = new THREE.Mesh(new THREE.SphereGeometry(def.deep ? 0.07 : 0.045, 20, 14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }));
      core.position.set(...p); halo.position.set(...p); core.renderOrder = halo.renderOrder = 5; g.add(core, halo);
      return { core, halo, p: V(...p) };
    });
    if (!def.deep) for (const H of [L, R]) {
      const pos = H.mesh.geometry.attributes.position, list = [];
      for (let i = 0; i < H.n; i++) { let best = 0; for (const c of centres) { const d2 = (pos.getX(i) - c[0]) ** 2 + (pos.getY(i) - c[1]) ** 2 + (pos.getZ(i) - c[2]) ** 2; best = Math.max(best, Math.exp(-d2 / 0.06)); } if (best > 0.05) list.push(i, best); }
      weights.push({ k, H, list });
    }
  }
  // Pathways with travelling pulses.
  const paths = PATHS.map((P) => {
    const curve = new THREE.CatmullRomCurve3(P.pts.map((p) => V(...p)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.012, 8, false), new THREE.MeshBasicMaterial({ color: P.col, transparent: true, opacity: 0.35, depthTest: false })); tube.renderOrder = 4; g.add(tube);
    const mirror = P.pts[P.pts.length - 1][0] !== 0 ? (() => { const c2 = new THREE.CatmullRomCurve3(P.pts.map((p) => V(-p[0], p[1], p[2]))); const t2 = new THREE.Mesh(new THREE.TubeGeometry(c2, 60, 0.012, 8, false), tube.material); t2.renderOrder = 4; g.add(t2); return c2; })() : null;
    const pulses = [0, 0.33, 0.66].map((o) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: P.col, transparent: true, opacity: 0, depthTest: false, depthWrite: false })); s.scale.setScalar(0.16); s.renderOrder = 6; g.add(s); return { s, o, mirror: false }; });
    if (mirror) for (const o of [0.16, 0.5, 0.83]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: P.col, transparent: true, opacity: 0, depthTest: false, depthWrite: false })); s.scale.setScalar(0.16); s.renderOrder = 6; g.add(s); pulses.push({ s, o, mirror: true }); }
    return { ...P, curve, mirror, tube, pulses, u: 0 };
  });
  // Neural dust inside.
  const dustG = new THREE.BufferGeometry(), dp = [];
  for (let i = 0; i < 1600; i++) { const d = V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); if (d.length() > 1) { i--; continue; } const side = d.x >= 0 ? 1 : -1; const s = shell(d.clone().normalize(), side), c = V(side * 0.34, 0.05, 0); const p = c.clone().add(s.sub(c).multiplyScalar(d.length() * 0.92)); dp.push(p.x, p.y, p.z); }
  dustG.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ color: '#ff8cc6', size: 0.018, transparent: true, opacity: 0.55, depthWrite: false })); g.add(dust);

  const B = {
    group: g, nodes, focus: null,
    // act: { region: 0..1 }; t seconds.
    update(dt, t, act, { dim = 1 } = {}) {
      for (const m of [matL, matR, deepMat]) { m.uniforms.uTime.value = t; m.uniforms.uOpacity.value = dim; }
      for (const H of [L, R]) H.mesh.geometry.attributes.color.array.fill(0);
      for (const { k, H, list } of weights) { const a = Math.max(0, (act[k] ?? 0) - 0.12) * 1.3 * (B.focus && B.focus !== k ? 0.35 : 1) + (B.focus === k ? 0.5 : 0); if (a <= 0.01) continue; const col = H.mesh.geometry.attributes.color.array; for (let j = 0; j < list.length; j += 2) { const i = list[j]; col[i * 3] = Math.max(col[i * 3], a * list[j + 1]); } }
      L.mesh.geometry.attributes.color.needsUpdate = R.mesh.geometry.attributes.color.needsUpdate = true;
      for (const [k, arr] of Object.entries(nodes)) {
        const a = act[k] ?? 0.1, sel = B.focus === k, dimmed = B.focus && !sel;
        for (const n of arr) { n.core.scale.setScalar(0.7 + a * 1.1 + (sel ? 0.5 : 0)); n.halo.scale.setScalar(0.18 + a * 0.55 + (sel ? 0.3 : 0)); n.halo.material.opacity = (0.25 + a * 0.6) * (dimmed ? 0.3 : 1) * dim; n.core.material.opacity = (dimmed ? 0.35 : 0.95) * dim; }
      }
      for (const P of paths) {
        const a = act[P.src] ?? 0.2; P.u = (P.u + dt * (0.25 + a * 0.9)) % 1;
        P.tube.material.opacity = (0.12 + a * 0.45) * dim;
        for (const q of P.pulses) { const u = (P.u + q.o) % 1, c = q.mirror ? P.mirror : P.curve; q.s.position.copy(c.getPointAt(u)); q.s.material.opacity = Math.sin(u * Math.PI) * (0.25 + a * 0.75) * dim; q.s.scale.setScalar(0.08 + a * 0.16); }
      }
      dust.material.opacity = 0.35 * dim;
    },
  };
  return B;
}
