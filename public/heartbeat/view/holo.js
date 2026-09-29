import * as THREE from 'three';

// Holographic surface: Fresnel rim, soft scan lines, per-vertex colour and a
// pulse. Additive, so overlapping anatomy reads as layered light.
export function holoMaterial({ color = '#3ff3ff', rim = '#ff4fd8', opacity = 0.9, base = 0.06, scan = 0.25, vertexColors = false, side = THREE.FrontSide, depthWrite = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uTime: { value: 0 },
      uOpacity: { value: opacity }, uBase: { value: base }, uScan: { value: scan }, uPulse: { value: 0 },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vC;
      ${vertexColors ? 'attribute vec3 color;' : ''}
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        vC = ${vertexColors ? 'color' : 'vec3(1.0)'};
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uRim; uniform float uTime, uOpacity, uBase, uScan, uPulse;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vC;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float s = 0.5 + 0.5 * sin(vW.y * 90.0 - uTime * 3.0);
        vec3 body = uColor * vC;
        vec3 c = body * (uBase + 0.55 * f) + uRim * f * f * 0.9;
        c *= 1.0 + uScan * (s - 0.5) + 0.6 * uPulse;
        float a = clamp((uBase + f) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(c * a, 1.0);   // additive: alpha already folded into colour
      }`,
    transparent: true, depthWrite, blending: THREE.AdditiveBlending, side,
  });
}

// Soft round glow sprite texture, generated once.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color, size = 0.3, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}

// A cloud of points that the caller moves each frame (positions + per-point colour).
export function pointCloud(n, size = 0.05, color = '#ffffff') {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const m = new THREE.PointsMaterial({ size, map: glowTexture(), color, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

// Small deterministic 3D value noise + fbm (for gyri and organic shapes).
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const fade = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), xf), L(c(0, 1, 0), c(1, 1, 0), xf), yf), L(L(c(0, 0, 1), c(1, 0, 1), xf), L(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
}
export function fbm(x, y, z, oct = 4) { let a = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { a += amp * noise3(x * f, y * f, z * f); f *= 2.03; amp *= 0.5; } return a; }

// Merge duplicate vertices of a non-indexed geometry (three's polyhedra are non-indexed).
export function weld(geo, eps = 1e-5) {
  const pos = geo.attributes.position, map = new Map(), verts = [], index = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(x, y, z); }
    index.push(id);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(index); g.computeVertexNormals();
  return g;
}
