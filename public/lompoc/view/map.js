import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOUNDS, heightAt, landUse, coastX, RIVER, ROADS, RAIL, POI, fbm2, polyDist, rng } from '../sim/geo.js';

// ─────────────────────────────────────────────────────────────────────────────
// DROPZONE: LOMPOC · the world. Golden-hour Lompoc Valley: Old Town's grid on the valley floor,
// striped flower-seed fields and eucalyptus windrows, the Santa Ynez River, Vandenberg Village on
// Burton Mesa, the base and its airfield, two coastal launch complexes with a rocket on the pad,
// Surf Beach, and the Pacific with the sun going down into it.
// ─────────────────────────────────────────────────────────────────────────────

export const SUN_DIR = new THREE.Vector3(-0.86, 0.13, 0.26).normalize();
const C = (h) => new THREE.Color(h);
const LAND = { beach: C('#d8c49a'), water: C('#3d5a63'), riparian: C('#56743a'), city: C('#8c8478'), village: C('#8f8a73'), base: C('#8a8574'), grass: C('#b0954f'), chaparral: C('#4f5c2e'), sea: C('#2c4a5a') };
const FIELD = ['#7b52c4', '#f0c92e', '#d8463c', '#ee8fc0', '#5e8f33', '#f2f0e6'].map(C);

function ribbon(pts, w, yOff, mat, step = 12) {
  // Resample a polyline every `step` m and extrude a terrain-hugging strip.
  const P = []; for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) P.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); }
  P.push(pts[pts.length - 1]);
  const pos = [], idx = [], uv = [];
  P.forEach(([x, z], i) => { const [px, pz] = P[Math.max(0, i - 1)], [nx, nz] = P[Math.min(P.length - 1, i + 1)], dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz) || 1, ox = (-dz / L) * w / 2, oz = (dx / L) * w / 2;
    for (const s of [-1, 1]) { const X = x + s * ox, Z = z + s * oz; pos.push(X, heightAt(X, Z) + yOff, Z); uv.push(s < 0 ? 0 : 1, i * step / w); }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}

export function buildWorld() {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#c9a688', 0.000075); scene.environmentIntensity = 0.35;
  // ── Sky: golden hour, sun low over the Pacific ──
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: 'uniform vec3 uSun; varying vec3 vD; void main(){ float h = vD.y; vec3 top = vec3(0.16,0.28,0.55), mid = vec3(0.86,0.62,0.48), low = vec3(1.0,0.78,0.52); vec3 c = h > 0.06 ? mix(mid, top, smoothstep(0.06, 0.55, h)) : mix(low, mid, smoothstep(-0.05, 0.06, h)); float s = max(dot(vD, uSun), 0.); c += vec3(1.0,0.82,0.55) * pow(s, 400.) * 3.0 + vec3(1.0,0.6,0.32) * pow(s, 8.) * 0.45; c = mix(c, vec3(0.72,0.6,0.55), smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.); }' }));
  sky.frustumCulled = false; scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffcf9a', 2.6); sun.position.copy(SUN_DIR).multiplyScalar(1500); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 10, far: 4000 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#a9c2ff', '#7a5a3a', 0.75));

  // ── Terrain ──
  const W = BOUNDS.x1 - BOUNDS.x0, D = BOUNDS.z1 - BOUNDS.z0, nx = 305, nz = 280;
  const tg = new THREE.PlaneGeometry(W, D, nx, nz); tg.rotateX(-Math.PI / 2); tg.translate((BOUNDS.x0 + BOUNDS.x1) / 2, 0, (BOUNDS.z0 + BOUNDS.z1) / 2);
  const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3), col = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = heightAt(x, z); tp.setY(i, h);
    const lu = landUse(x, z), n = fbm2(x * 0.01, z * 0.01, 3);
    if (lu === 'field') { const sec = Math.floor((x + 2000) / 260), row = Math.floor((z + 1000 + (sec % 2) * 17) / 34); col.copy(FIELD[(row + sec * 2) % FIELD.length]); col.lerp(LAND.grass, 0.08); }
    else col.copy(LAND[lu] || LAND.grass);
    if (lu === 'grass' || lu === 'chaparral') { col.lerp(LAND.chaparral, Math.max(0, (n - 0.5) * 1.6)); col.lerp(C('#d6b878'), Math.max(0, (0.45 - n)) * 0.9); }
    col.multiplyScalar(0.86 + n * 0.28); cols.set([col.r, col.g, col.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })); terrain.receiveShadow = true; scene.add(terrain);

  // ── Pacific ──
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ fog: true, transparent: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR }, ...THREE.UniformsLib.fog },
    vertexShader: '#include <fog_pars_vertex>\nvarying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: '#include <fog_pars_fragment>\nuniform float uTime; uniform vec3 uSun; varying vec3 vW; float hs(vec2 p){ return sin(p.x*0.021+uTime*0.7)*0.5+sin(p.y*0.017-uTime*0.5)*0.5+sin((p.x+p.y)*0.05+uTime*1.3)*0.25+sin((p.x-p.y)*0.11-uTime*1.9)*0.12; } void main(){ vec2 p = vW.xz; float e = 1.5; vec3 n = normalize(vec3(-(hs(p+vec2(e,0.))-hs(p))/e*1.2, 1., -(hs(p+vec2(0.,e))-hs(p))/e*1.2)); vec3 v = normalize(cameraPosition - vW); float f = pow(1. - max(dot(n, v), 0.), 4.); vec3 deep = vec3(0.06,0.17,0.24), skyc = vec3(0.95,0.72,0.55); vec3 c = mix(deep, skyc, 0.15 + 0.75*f); vec3 r = reflect(-v, n); c += vec3(1.0,0.8,0.5) * pow(max(dot(r, uSun), 0.), 260.) * 4.0; gl_FragColor = vec4(c, 1.);\n#include <fog_fragment>\n}' }));
  sea.position.y = 0.0; scene.add(sea);
  // River (a water ribbon along the channel), roads, the coast railway.
  const water = new THREE.MeshStandardMaterial({ color: '#5d8796', roughness: 0.15, metalness: 0.3, envMapIntensity: 1.2 });
  scene.add(ribbon(RIVER, 34, 1.4, water, 15));
  const asphalt = new THREE.MeshStandardMaterial({ color: '#3a3a3d', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const r of ROADS) scene.add(ribbon(r.pts, r.w, 0.8, asphalt));
  scene.add(ribbon(RAIL, 7, 0.9, new THREE.MeshStandardMaterial({ color: '#5a4c40', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })));
  // City street grid (between blocks).
  const blocks = [];
  for (let bx = -5; bx <= 5; bx++) for (let bz = -6; bz <= 6; bz++) { const x = bx * 95, z = bz * 90; if (landUse(x, z) !== 'city') continue; blocks.push([x, z, Math.abs(bx) <= 1 && Math.abs(bz) <= 2]); }
  const streetM = new THREE.MeshStandardMaterial({ color: '#4a4846', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
  for (let bx = -5; bx <= 5; bx++) scene.add(ribbon([[bx * 95 + 47.5, -560], [bx * 95 + 47.5, 560]], 14, 0.6, streetM, 30));
  for (let bz = -6; bz <= 6; bz++) scene.add(ribbon([[-520, bz * 90 + 45], [520, bz * 90 + 45]], 14, 0.6, streetM, 30));

  // ── Buildings (instanced) ──
  const R = rng(1997), boxes = [], roofs = [];
  const house = (x, z, w, d, h, rot, color, roofC = '#8d4a35', roof = true) => { const y = heightAt(x, z); boxes.push({ x, y, z, w, d, h, rot, color }); if (roof) roofs.push({ x, y: y + h, z, w: w * 1.08, d: d * 1.1, h: Math.min(w, d) * 0.38, rot, color: roofC }); };
  const stucco = ['#e8dcc4', '#efe6d2', '#d9c7a6', '#f0d9b8', '#cfd4cf', '#e6cfc0'], tile = ['#9a4b34', '#7d4532', '#5d5550', '#a7643f'];
  for (const [x, z, core] of blocks) {
    if (core) { for (let i = 0; i < 6; i++) { const side = i < 3 ? -1 : 1, k = (i % 3) - 1; house(x + k * 24, z + side * 24, 22, 20, 8 + R() * 6, 0, stucco[(R() * 6) | 0], '#000', false); } continue; }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) if (R() > 0.08) house(x - 26 + i * 26, z - 18 + j * 36, 12 + R() * 3, 10 + R() * 2, 3.4 + R() * 1.6, (R() - 0.5) * 0.06, stucco[(R() * 6) | 0], tile[(R() * 4) | 0]);
  }
  // Vandenberg Village: curving streets on the mesa.
  for (let r = 70; r <= 340; r += 42) for (let a = 0; a < Math.PI * 2; a += 24 / r) { if (R() < 0.18) continue; const x = -150 + Math.cos(a) * r, z = -1925 + Math.sin(a) * r; house(x, z, 13, 10, 3.6 + R(), -a, stucco[(R() * 6) | 0], tile[(R() * 4) | 0]); }
  // Base: offices, barracks, hangars (flat roofs), a water tower.
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { if (R() < 0.15) continue; const x = -2650 + i * 90, z = -2560 + j * 85, big = R() < 0.3; house(x, z, big ? 60 : 42, big ? 34 : 16, big ? 14 : 9, 0, big ? '#c9c4b5' : '#d8d0bd', '#000', false); }
  // Lompoc Airport and the base airfield: runways + hangars.
  const pad = new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
  scene.add(ribbon([[-470, -590], [150, -590]], 24, 0.9, asphalt, 40));
  scene.add(ribbon([[-2900, -3150], [-2900, -1850]], 60, 0.9, asphalt, 40), ribbon([[-2800, -3000], [-2800, -2000]], 22, 0.85, pad, 40));
  for (let i = 0; i < 4; i++) house(-2700, -2900 + i * 230, 70, 50, 18, 0, '#bdb8ab', '#000', false);
  for (let i = 0; i < 3; i++) house(-300 + i * 45, -545, 26, 20, 7, 0, '#cfcabe', '#000', false);
  // La Purísima Mission: long white adobe with a red tile roof and a bell wall.
  house(925, -800, 110, 13, 6.5, 0.15, '#f1ebdc', '#9a4b34'); house(890, -760, 13, 40, 6, 0.15, '#efe7d6', '#9a4b34'); house(990, -812, 8, 3, 13, 0.15, '#f1ebdc', '#000', false);
  // Surf station shelter.
  house(-3150, -1250, 12, 6, 3.2, 0, '#c4bfb5', '#5d5550');
  const boxI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), boxes.length);
  const roofG = new THREE.ConeGeometry(0.7072, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const roofI = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), roofs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  boxes.forEach((b, i) => { boxI.setMatrixAt(i, m4.compose(v3.set(b.x, b.y - 0.5, b.z), q.setFromEuler(e.set(0, b.rot, 0)), s3.set(b.w, b.h + 0.5, b.d))); boxI.setColorAt(i, C(b.color)); });
  roofs.forEach((b, i) => { roofI.setMatrixAt(i, m4.compose(v3.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.rot, 0)), s3.set(b.w, b.h, b.d))); roofI.setColorAt(i, C(b.color)); });
  boxI.castShadow = boxI.receiveShadow = roofI.castShadow = true; scene.add(boxI, roofI);

  // ── Trees: eucalyptus windrows, valley oaks, riverside willows, street trees ──
  const trees = [];
  for (let zr = -420; zr <= 330; zr += 250) for (let x = -2000; x <= -620; x += 9) if (R() > 0.12) trees.push([x + R() * 3, zr + R() * 3, 'euc']);
  for (let i = 0; i < 1600; i++) { const x = BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + R() * (BOUNDS.z1 - BOUNDS.z0), lu = landUse(x, z); if ((lu === 'grass' && fbm2(x * 0.003, z * 0.003, 2) > 0.5) || lu === 'chaparral') trees.push([x, z, lu === 'chaparral' ? 'shrub' : 'oak']); }
  for (let i = 0; i < 700; i++) { const k = R(), seg = Math.min(RIVER.length - 2, Math.floor(k * (RIVER.length - 1))), f = k * (RIVER.length - 1) - seg, [ax, az] = RIVER[seg], [bx, bz] = RIVER[seg + 1], off = (R() - 0.5) * 140; const x = ax + (bx - ax) * f + off * 0.3, z = az + (bz - az) * f + off; if (polyDist(RIVER, x, z)[0] > 24) trees.push([x, z, 'willow']); }
  for (const [x, z, core] of blocks) if (!core) for (let i = 0; i < 3; i++) trees.push([x + (R() - 0.5) * 70, z + (R() - 0.5) * 60, 'street']);
  const TT = { euc: [24, 4.5, '#7d8f78', 0.6], oak: [8, 6, '#4c5a2a', 0.5], shrub: [2.2, 2.4, '#4d5530', 0.3], willow: [10, 5, '#5f7f3a', 0.5], street: [8, 4, '#56703a', 0.4] };
  const crownI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees.length);
  const trunkI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#6a5642', roughness: 1 }), trees.length);
  trees.forEach(([x, z, k], i) => { const [h, r, c, tr] = TT[k], s = 0.75 + R() * 0.5, y = heightAt(x, z); crownI.setMatrixAt(i, m4.compose(v3.set(x, y + h * s * 0.62, z), q.identity(), s3.set(r * s, (k === 'euc' ? h * 0.42 : r * 0.85) * s, r * s))); crownI.setColorAt(i, C(c).multiplyScalar(0.8 + R() * 0.4)); trunkI.setMatrixAt(i, m4.compose(v3.set(x, y - 0.3, z), q.identity(), s3.set(tr, h * s * 0.55, tr))); });
  crownI.castShadow = trunkI.castShadow = true; scene.add(crownI, trunkI);

  // ── Launch complexes ──
  const white = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.35, metalness: 0.1 }), black = new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.5 }), steelM = new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.5, metalness: 0.6 }), concrete = new THREE.MeshStandardMaterial({ color: '#a39f97', roughness: 0.95 });
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const lattice = (parent, x, z, w, h, mat) => { const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, new THREE.BoxGeometry(0.4, h, 0.4), mat, (a * w) / 2, h / 2, (b * w) / 2); for (let y = 4; y < h; y += 5) { add(g, new THREE.BoxGeometry(w, 0.3, 0.3), mat, 0, y, -w / 2); add(g, new THREE.BoxGeometry(w, 0.3, 0.3), mat, 0, y, w / 2); add(g, new THREE.BoxGeometry(0.3, 0.3, w), mat, -w / 2, y, 0); add(g, new THREE.BoxGeometry(0.3, 0.3, w), mat, w / 2, y, 0); } return g; };
  const slc4 = new THREE.Group(); slc4.position.set(POI.slc4.x, heightAt(POI.slc4.x, POI.slc4.z), POI.slc4.z); scene.add(slc4);
  add(slc4, new THREE.BoxGeometry(150, 1.2, 100), concrete, 0, 0.2, 0);
  const rocket = new THREE.Group(); slc4.add(rocket);
  add(rocket, new THREE.CylinderGeometry(1.83, 1.83, 42, 32), white, 0, 21, 0);
  for (let i = 0; i < 9; i++) add(rocket, new THREE.CylinderGeometry(0.35, 0.5, 1.6, 10), black, Math.cos(i * 0.7) * (i ? 1.1 : 0), -0.6, Math.sin(i * 0.7) * (i ? 1.1 : 0));
  for (let i = 0; i < 4; i++) { const leg = add(rocket, new THREE.BoxGeometry(0.5, 9, 0.3), black, Math.cos(i * Math.PI / 2 + 0.78) * 1.95, 5, Math.sin(i * Math.PI / 2 + 0.78) * 1.95); leg.rotation.y = -(i * Math.PI / 2 + 0.78); }
  add(rocket, new THREE.CylinderGeometry(1.83, 1.83, 6, 32), black, 0, 45, 0);
  add(rocket, new THREE.CylinderGeometry(1.83, 1.83, 9, 32), white, 0, 52.5, 0);
  const fair = [[2.6, 0], [2.6, 7], [2.4, 9.5], [1.9, 11.5], [1.1, 12.8], [0.2, 13.4]].map(([r, y]) => new THREE.Vector2(r, y));
  add(rocket, new THREE.LatheGeometry(fair, 32), white, 0, 57, 0); add(rocket, new THREE.CylinderGeometry(1.83, 2.6, 1.5, 32), white, 0, 56.5, 0);
  lattice(slc4, 5.2, 0, 3.2, 66, black);
  for (const [a, b] of [[-55, -40], [55, -40], [-55, 40], [55, 40]]) add(slc4, new THREE.CylinderGeometry(0.4, 0.9, 92, 8), steelM, a, 46, b);
  add(slc4, new THREE.BoxGeometry(60, 26, 38), new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.7 }), 0, 13, 120);
  const plume = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false })); plume.scale.set(3, 6, 3); plume.position.set(0, 2, 0); slc4.add(plume);
  const slc6 = new THREE.Group(); slc6.position.set(POI.slc6.x, heightAt(POI.slc6.x, POI.slc6.z), POI.slc6.z); scene.add(slc6);
  add(slc6, new THREE.BoxGeometry(170, 1.2, 120), concrete, 0, 0.2, 0);
  add(slc6, new THREE.BoxGeometry(30, 78, 30), new THREE.MeshStandardMaterial({ color: '#c7c3b8', roughness: 0.7 }), -30, 39, 0);
  for (let y = 8; y < 78; y += 10) add(slc6, new THREE.BoxGeometry(30.4, 1, 30.4), new THREE.MeshStandardMaterial({ color: '#c2552d', roughness: 0.7 }), -30, y, 0);
  lattice(slc6, 18, 0, 8, 70, steelM);
  add(slc6, new THREE.BoxGeometry(24, 8, 50), concrete, 30, 4, 20);
  // Water towers / beacons for orientation.
  for (const p of [[260, 310], [-2380, -2200], [-60, -2060]]) { const y = heightAt(p[0], p[1]); add(scene, new THREE.CylinderGeometry(0.6, 0.6, 22, 8), steelM, p[0], y + 11, p[1]); add(scene, new THREE.SphereGeometry(6, 18, 12), new THREE.MeshStandardMaterial({ color: '#e8e4da', roughness: 0.5 }), p[0], y + 26, p[1]); }

  return { scene, sky, sun, terrain, sea, rocket, plume, slc4 };
}

// ── The circle: a translucent orange wall + the next circle as a white ring on the ground ──
export function buildZone(scene) {
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 160, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; varying vec3 vW; void main(){ float y = vUv.y; float band = 0.5 + 0.5*sin(vW.y*0.05 - uTime*2.0 + vUv.x*60.0); float a = (0.22 + 0.18*band) * smoothstep(1.0, 0.55, y) * (0.6 + 0.4*smoothstep(0.0, 0.05, y)); gl_FragColor = vec4(vec3(1.0, 0.45, 0.12)*(1.2+band*0.6), a); }' }));
  wall.renderOrder = 5; wall.frustumCulled = false; scene.add(wall);
  const N = 256, ring = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
  ring.frustumCulled = false; scene.add(ring);
  return {
    wall, ring,
    set(c, r, H = 2400) { wall.position.set(c[0], -60, c[1]); wall.scale.set(Math.max(1, r), H, Math.max(1, r)); },
    setNext(c, r) { const p = ring.geometry.attributes.position; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r; p.setXYZ(i, x, Math.max(1, heightAt(x, z)) + 3, z); } p.needsUpdate = true; ring.visible = r > 1; },
  };
}
void coastX;
