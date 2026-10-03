import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// STRIDE · the shoe. A procedural racing shoe lofted along its length: a midsole whose stack, drop
// and rocker follow the sliders, a carbon plate that spoons through the foam, rubber outsole pads,
// an engineered-knit upper with laces and a heel tab. Explode and x-ray views pull it apart.
// Units: metres. x = heel → toe, y = up, z = across.
// ─────────────────────────────────────────────────────────────────────────────

const L = 0.3, sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const halfW = (u) => (0.031 + 0.019 * sstep(0.05, 0.62, u) - 0.012 * sstep(0.78, 1, u)) * Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 12)), 0.5);
const centre = (u) => 0.005 * Math.sin(Math.PI * u) - 0.004 * sstep(0.6, 1, u);    // arch curvature (medial bias at the toe)

function loft(nu, nv, fn, { closeV = true, skip } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); uv.push(i / nu, j / nv); }
  const row = nv + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { if (!closeV && j === nv) continue; if (skip && skip((i + 0.5) / nu, (j + 0.5) / nv)) continue; const a = i * row + j, b = a + row; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// Superellipse cross-section point: θ ∈ [0, 1) around.
const se = (t, a, b, n = 4) => { const th = t * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); return [Math.sign(c) * Math.abs(c) ** (2 / n) * a, Math.sign(s) * Math.abs(s) ** (2 / n) * b]; };

function knitTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) for (let x = 0; x < 256; x += 6) { const o = (y / 6) % 2 ? 3 : 0; g.fillStyle = `rgb(${150 + Math.random() * 40},${150 + Math.random() * 40},${150 + Math.random() * 40})`; g.beginPath(); g.ellipse(x + o, y, 2.6, 1.6, 0.6, 0, Math.PI * 2); g.fill(); }
  for (let y = 10; y < 256; y += 22) for (let x = 10; x < 256; x += 22) { g.fillStyle = '#202020'; g.beginPath(); g.arc(x + ((y / 22) % 2) * 11, y, 2.2, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 4); return t;
}
function weaveTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#121214'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { const k = ((x + y) / 8) % 2; g.fillStyle = k ? '#2a2c31' : '#18191c'; g.fillRect(x, y, 8, 8); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y + (k ? 0 : 4), 8, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildShoe() {
  const root = new THREE.Group(), parts = {};
  const foamMat = new THREE.MeshPhysicalMaterial({ color: '#b9dd2e', roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.6, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const plateMat = new THREE.MeshPhysicalMaterial({ map: weaveTexture(), color: '#ffffff', roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1d1e22', roughness: 0.85 });
  const knit = knitTexture();
  const upperMat = new THREE.MeshPhysicalMaterial({ color: '#10141f', roughness: 0.75, sheen: 0.45, sheenColor: new THREE.Color('#5fb8d6'), sheenRoughness: 0.5, bumpMap: knit, bumpScale: 1.2, side: THREE.DoubleSide });
  const laceMat = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: '#dcff4a', roughness: 0.4, emissive: '#7a9a00', emissiveIntensity: 0.25 });
  const mk = (name, mat) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.castShadow = true; m.receiveShadow = true; m.name = name; root.add(m); parts[name] = m; return m; };
  mk('foam', foamMat); mk('plate', plateMat); mk('outsole', rubber); mk('upper', upperMat); mk('laces', laceMat); mk('tab', accent).visible = false;
  root.userData = { parts, foamMat, plateMat, upperMat, cfg: null, comp: 0, explode: 0 };
  return root;
}

// Rebuild the geometry for a configuration {stack (mm, heel), drop (mm), plate, foam colour, rocker}.
export function shapeShoe(shoe, { stack = 35, drop = 8, plate = 'plate', col = '#dcff4a', comp = 0, explode = 0, xray = false, worn = 0 }) {
  const P = shoe.userData.parts, Hh = stack / 1000, Hf = (stack - drop) / 1000;
  const squash = 1 - comp;
  const H = (u) => (Hh + (Hf - Hh) * sstep(0.25, 0.75, u)) * squash * (1 - 0.06 * worn * sstep(0.5, 0.75, u));
  const yb = (u) => 0.024 * sstep(0.6, 1, u) ** 2 + 0.006 * (1 - sstep(0, 0.14, u));
  const X = (u) => -L / 2 + u * L;
  // Midsole: superellipse sections, slightly flared at the base.
  P.foam.geometry.dispose();
  P.foam.geometry = loft(90, 40, (u, v) => { const w = halfW(u) * 1.04, h = H(u), [z, y] = se(v, w, h / 2, 5); const flare = 1 + 0.06 * (0.5 - y / h); return [X(u), yb(u) + h / 2 + y, centre(u) + z * flare]; });
  // Carbon plate: a thin spoon about 45 % up the stack, through the forefoot.
  P.plate.geometry.dispose(); P.plate.visible = plate !== 'none';
  const pw = plate === 'rods' ? 0.25 : 0.86;
  P.plate.geometry = loft(70, 24, (u, v) => { const uu = 0.06 + u * 0.9, w = halfW(uu) * pw, [z, y] = se(v, w, 0.0009, 6); return [X(uu), yb(uu) + H(uu) * (0.3 + 0.25 * sstep(0.2, 0.7, uu)) + y, centre(uu) + z]; });
  // Outsole rubber: forefoot and heel pads.
  P.outsole.geometry.dispose();
  const pad = (u0, u1) => loft(30, 24, (u, v) => { const uu = u0 + u * (u1 - u0), w = halfW(uu) * 0.92, [z, y] = se(v, w, 0.0016, 6); return [X(uu), yb(uu) - 0.0005 + y, centre(uu) + z]; });
  const g1 = pad(0.52, 0.97), g2 = pad(0.03, 0.24);
  P.outsole.geometry = mergeTwo(g1, g2);
  // Upper: an arch over the footbed from medial to lateral; a collar opening at the heel.
  P.upper.geometry.dispose();
  const hU = (u) => 0.03 + 0.05 * (1 - sstep(0.25, 0.95, u)) + 0.012 * (1 - sstep(0, 0.12, u));
  const top = (u) => yb(u) + H(u);
  P.upper.geometry = loft(90, 40, (u, v) => { const w = halfW(u) * 0.98, phi = v * Math.PI, s = Math.sin(phi); return [X(u) + (u < 0.06 ? 0.004 * s : 0), top(u) + hU(u) * Math.pow(s, 0.7) - 0.002, centre(u) - Math.cos(phi) * w * (1 - 0.18 * s * s)]; }, { closeV: false, skip: (u, v) => u > 0.07 && u < 0.36 && v > 0.22 && v < 0.78 });
  // Laces across the throat.
  P.laces.geometry.dispose();
  const laces = []; for (let k = 0; k < 6; k++) { const u = 0.4 + k * 0.05, at = (uu, phi) => { const w = halfW(uu) * 0.98, s = Math.sin(phi); return new THREE.Vector3(X(uu), top(uu) + hU(uu) * Math.pow(s, 0.7) + 0.003, centre(uu) - Math.cos(phi) * w * (1 - 0.18 * s * s)); }; const c = new THREE.CatmullRomCurve3([at(u, 1.05), at(u + 0.02, Math.PI / 2), at(u + 0.04, 2.09)]); laces.push(new THREE.TubeGeometry(c, 16, 0.0016, 6)); const c2 = new THREE.CatmullRomCurve3([at(u + 0.04, 1.05), at(u + 0.02, Math.PI / 2), at(u, 2.09)]); laces.push(new THREE.TubeGeometry(c2, 16, 0.0016, 6)); }
  P.laces.geometry = laces.reduce((a, b) => mergeTwo(a, b));
  P.tab.geometry.dispose(); P.tab.geometry = new THREE.BoxGeometry(0.004, 0.026, 0.02).translate(X(0.004) - 0.002, top(0.02) + hU(0.02) - 0.008, 0);
  // Explode: lift the parts apart.
  P.upper.position.y = P.laces.position.y = P.tab.position.y = explode * 0.07; P.plate.position.y = explode * 0.035; P.outsole.position.y = -explode * 0.02;
  shoe.userData.foamMat.color.set(col).lerp(new THREE.Color('#e6d9a0'), Math.min(0.6, worn * 0.6));
  shoe.userData.foamMat.opacity = xray ? 0.3 : 1; shoe.userData.foamMat.depthWrite = !xray; P.upper.material.opacity = xray ? 0.25 : 1; P.upper.material.transparent = xray;
}
function mergeTwo(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array, ua = a.attributes.uv?.array, ub = b.attributes.uv?.array, ia = a.index ? Array.from(a.index.array) : [...Array(pa.length / 3).keys()], ib = b.index ? Array.from(b.index.array) : [...Array(pb.length / 3).keys()];
  const g = new THREE.BufferGeometry(), n = pa.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3));
  if (ua && ub) g.setAttribute('uv', new THREE.Float32BufferAttribute([...ua, ...ub], 2));
  g.setIndex([...ia, ...ib.map((i) => i + n)]); g.computeVertexNormals(); return g;
}

// ── The stadium: a standard 400 m track drawn by a shader (lanes from a signed distance) ──
export const TRACK = { straight: 84.39, r: 36.5, lane: 1.22 };
export function buildTrack() {
  const g = new THREE.PlaneGeometry(400, 260, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({ uniforms: { uS: { value: TRACK.straight }, uR: { value: TRACK.r }, uL: { value: TRACK.lane } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uS, uR, uL; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 p = vW.xz; float cx = clamp(p.x, -uS*0.5, uS*0.5); float d = length(vec2(p.x - cx, p.y)) - uR;   // distance outward from the inner kerb
        vec3 grass = mix(vec3(0.16,0.36,0.14), vec3(0.2,0.43,0.17), step(0.5, fract(p.x/6.0)));
        vec3 rub = vec3(0.62,0.2,0.13) * (0.85 + 0.25*h(floor(p*40.0)));
        vec3 apron = vec3(0.22,0.23,0.26);
        vec3 c = d < 0.0 ? grass : d < 8.0*uL ? rub : mix(apron, vec3(0.08,0.09,0.11), smoothstep(10.0, 40.0, d));
        float fw = fwidth(d) * 1.2;
        if (d > -0.05 && d < 8.0*uL + 0.05) { float k = abs(fract(d/uL + 0.5) - 0.5) * uL; c = mix(vec3(0.95), c, smoothstep(0.03, 0.03 + fw, k)); }
        if (d > 0.0 && d < 8.0*uL && abs(p.x - uS*0.5) < 0.05 + fwidth(p.x) && p.y < 0.0) c = vec3(0.98);   // finish line
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; return mesh;
}
// Point on lane `k` (0-based) at distance s along the lap (anticlockwise, starting at the finish line).
export function trackPoint(s, k = 0) {
  const R = TRACK.r + 0.3 + k * TRACK.lane, S = TRACK.straight, lap = 2 * S + 2 * Math.PI * R; s = ((s % lap) + lap) % lap;
  if (s < S) return [S / 2 - s, -R, Math.PI];                              // home straight (z = −R), running −x
  s -= S; if (s < Math.PI * R) { const a = -Math.PI / 2 - s / R; return [-S / 2 + Math.cos(a) * R, Math.sin(a) * R, a - Math.PI / 2]; }
  s -= Math.PI * R; if (s < S) return [-S / 2 + s, R, 0];
  s -= S; const a = Math.PI / 2 - s / R; return [S / 2 + Math.cos(a) * R, Math.sin(a) * R, a - Math.PI / 2];
}
export const lapLength = (k = 0) => 2 * TRACK.straight + 2 * Math.PI * (TRACK.r + 0.3 + k * TRACK.lane);

// A stylised glowing runner (two of them race on the track).
export function buildRunner(color) {
  const root = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.2 }), J = {};
  const add = (p, geo, pos) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; p.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips); J.hips = hips;
  add(hips, new THREE.CapsuleGeometry(0.13, 0.42, 4, 10), [0, 0.38, 0]); add(hips, new THREE.SphereGeometry(0.11, 16, 12), [0, 0.86, 0.02]);
  for (const s of [-1, 1]) { const k = s < 0 ? 'R' : 'L'; const hip = new THREE.Group(); hip.position.set(s * 0.09, 0, 0); hips.add(hip); J['hip' + k] = hip; add(hip, new THREE.CapsuleGeometry(0.06, 0.36, 4, 8), [0, -0.23, 0]); const kn = new THREE.Group(); kn.position.y = -0.46; hip.add(kn); J['kn' + k] = kn; add(kn, new THREE.CapsuleGeometry(0.05, 0.36, 4, 8), [0, -0.22, 0]); add(kn, new THREE.BoxGeometry(0.08, 0.05, 0.22), [0, -0.46, 0.05]);
    const sh = new THREE.Group(); sh.position.set(s * 0.2, 0.62, 0); hips.add(sh); J['sh' + k] = sh; add(sh, new THREE.CapsuleGeometry(0.045, 0.5, 4, 8), [0, -0.27, 0]); }
  root.userData = { J }; return root;
}
export function poseRunner(r, ph) {
  const J = r.userData.J, s = Math.sin(ph);
  J.hipL.rotation.x = s * 0.7; J.hipR.rotation.x = -s * 0.7; J.knL.rotation.x = Math.max(0, -Math.sin(ph + 0.9)) * 1.3; J.knR.rotation.x = Math.max(0, Math.sin(ph + 0.9)) * 1.3;
  J.shL.rotation.x = -s * 0.8; J.shR.rotation.x = s * 0.8; J.hips.position.y = 0.95 + Math.abs(Math.cos(ph)) * 0.05; J.hips.rotation.x = 0.12;
}
