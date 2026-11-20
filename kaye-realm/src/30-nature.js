// ===== Nature: trees, grass, flowers, ferns, rocks, god rays, clouds, backdrop peaks =====
const WIND = { t: { value: 0 }, player: { value: new THREE.Vector3() } };
function windify(mat, strength, mode) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.t; sh.uniforms.uPlayer = WIND.player;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uPlayer;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float ph = ip.x*0.21 + ip.z*0.17;
      ${mode === 'grass'
        ? `float k = uv.y*uv.y; vec3 wp = ip + transformed;
           transformed.x += (sin(uTime*1.7 + ph + wp.z*0.25)*0.18 + sin(uTime*3.1+ph*2.)*0.05) * k * ${strength.toFixed(2)};
           transformed.z += cos(uTime*1.3 + ph*1.3 + wp.x*0.2)*0.12*k*${strength.toFixed(2)};
           vec2 away = wp.xz - uPlayer.xz; float dd = length(away);
           if (dd < 1.4) { vec2 dir = away/(dd+0.001); transformed.xz += dir*(1.4-dd)*0.55*k; transformed.y -= (1.4-dd)*0.25*k; }`
        : `float k = max(transformed.y - 2.5, 0.0) * 0.06; transformed.x += sin(uTime*1.1 + ph + transformed.y*0.4)*k*${strength.toFixed(2)}; transformed.z += cos(uTime*0.9 + ph*1.7)*k*0.6*${strength.toFixed(2)};`}
      `);
  };
  return mat;
}

function noFlip(mat) { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);'); }; mat.customProgramCacheKey = () => 'noflip'; return mat; }
const lin = (v) => Math.pow(v, 2.2);
function colorize(geo, fn) { const p = geo.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const col = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = lin(col[0]); c[i * 3 + 1] = lin(col[1]); c[i * 3 + 2] = lin(col[2]); } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; }
function blob(r, detail, amp, seed) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); const n = fbm(_v.x * 0.9 + seed, _v.y * 0.9 + _v.z * 0.7, 3); _v.multiplyScalar(1 + n * amp); p.setXYZ(i, _v.x, _v.y, _v.z); }
  g.computeVertexNormals(); return g;
}
function canopyGeo(seed, kind) {
  const parts = [];
  if (kind === 'pine') {
    for (let i = 0; i < 5; i++) { const g = new THREE.ConeGeometry(2.9 - i * 0.5, 3.2, 8, 1); g.translate(0, 3.2 + i * 1.6, 0); parts.push(normGeo(g)); }
  } else {
    const n = 5 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) { const a = i / n * TAU + rand(), rad = i === 0 ? 0 : rr(1.2, 2.2); const g = blob(rr(1.9, 2.7), 1, 0.3, seed + i * 3); g.scale(1, 0.82, 1); g.translate(Math.cos(a) * rad, 7 + rr(-0.6, 1.4) + (i === 0 ? 1.2 : 0), Math.sin(a) * rad); parts.push(normGeo(g)); }
  }
  const m = mergeGeometries(parts);
  const isPine = kind === 'pine';
  return colorize(m, (x, y, z) => { const t = clamp((y - (isPine ? 2.5 : 5)) / (isPine ? 8 : 5), 0, 1), n = fbm(x * 0.6 + seed, z * 0.6 + y * 0.3, 2) * 0.5 + 0.5; const base = isPine ? [0.16, 0.3, 0.2] : [0.32, 0.46, 0.2], tip = isPine ? [0.36, 0.52, 0.32] : [0.86, 0.95, 0.5]; return mixc(base, tip, t * 0.7 + n * 0.3).map((v) => v * 1.0); });
}
function trunkGeo(kind) {
  const parts = [];
  const t = new THREE.CylinderGeometry(kind === 'pine' ? 0.18 : 0.3, kind === 'pine' ? 0.38 : 0.5, kind === 'pine' ? 5 : 7, 7, 3); t.translate(0, kind === 'pine' ? 2.5 : 3.5, 0);
  const p = t.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 0.5) * 0.12); }
  scaleUV(t, 2, 3); parts.push(normGeo(t));
  if (kind !== 'pine') for (let i = 0; i < 3; i++) { const br = new THREE.CylinderGeometry(0.08, 0.18, 2.6, 6); br.translate(0, 1.3, 0); br.rotateZ(rr(0.6, 1.0)); br.rotateY(i / 3 * TAU + rand()); br.translate(0, 4.6 + i * 0.6, 0); parts.push(normGeo(br)); }
  const root = new THREE.CylinderGeometry(0.5, 0.9, 0.8, 9); root.translate(0, 0.2, 0); parts.push(normGeo(root));
  return mergeGeometries(parts);
}
const TREE_KINDS = [];
function initTreeKinds() {
  const canopyMat = windify(new THREE.MeshStandardMaterial({ map: TEX.leaves, vertexColors: true, roughness: 0.85 }), 1, 'tree');
  canopyMat.map.repeat.set(2, 2);
  for (let i = 0; i < 3; i++) TREE_KINDS.push({ trunk: trunkGeo('broad'), canopy: canopyGeo(i * 17.3, 'broad'), cm: canopyMat });
  TREE_KINDS.push({ trunk: trunkGeo('pine'), canopy: canopyGeo(5, 'pine'), cm: canopyMat, pine: true });
}
const TREE_CHUNKS = new Map();
function addTree(x, z, kind, s, collide = true) {
  const y = terrainH(x, z) - 0.15, key = Math.floor(x / 160) + ',' + Math.floor(z / 160);
  if (!TREE_CHUNKS.has(key)) TREE_CHUNKS.set(key, TREE_KINDS.map(() => []));
  TREE_CHUNKS.get(key)[kind].push(xform(x, y, z, rand() * TAU, rr(-0.04, 0.04), rr(-0.04, 0.04), s, s * rr(0.9, 1.15), s));
  if (collide) addCollider(x, z, 0.42 * s, 0.42 * s, 0.6, y, y + 9 * s, 1);
}
function buildTreeMeshes() {
  const barkMat = MAT.bark;
  for (const lists of TREE_CHUNKS.values()) lists.forEach((mats, k) => {
    if (!mats.length) return;
    const kind = TREE_KINDS[k];
    for (const [geo, mat] of [[kind.trunk, barkMat], [kind.canopy, kind.cm]]) {
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
    }
  });
}
function freeSpot(x, z, m) {
  for (const c of cellAt(x, z)) if (c.y1 - c.y0 > 0.3 && insideXZ(c, x, z, m)) return false;
  return true;
}
function placeTrees() {
  initTreeKinds();
  // forest
  for (let x = 196; x < 478; x += 6.5) for (let z = -330; z < 330; z += 6.5) {
    const px = x + rr(-2.8, 2.8), pz = z + rr(-2.8, 2.8);
    if (roadMask(px, pz) > 0.02 || Math.abs(pz) < 9 || Math.abs(px - riverX(pz)) < 24) continue;
    if (Math.hypot(px - ELVES.x, pz - ELVES.z) < ELVES.r - 6 || Math.hypot(px - PUB.x, pz - PUB.z) < 22) continue;
    if (rand() < 0.22 || !freeSpot(px, pz, 2.5)) continue;
    const kind = px > 440 && rand() < 0.6 ? 3 : Math.floor(rand() * 3);
    addTree(px, pz, kind, rr(1.0, 1.7));
  }
  // giant elven trees
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.5 + Math.PI / 5, x = ELVES.x + Math.cos(a) * 44, z = ELVES.z + Math.sin(a) * 44; addTree(x, z, i % 3, rr(3.0, 3.6)); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU, x = PUB.x + Math.cos(a) * 26, z = PUB.z + 6 + Math.sin(a) * 20; if (z > PUB.z + 4) addTree(x, z, i % 3, 2.4); }
  // meadows
  for (let i = 0; i < 1300; i++) {
    const x = rr(WORLD.minX + 20, 520), z = rr(WORLD.minZ + 20, WORLD.maxZ - 20);
    if (x > 190 && x < 480) continue;
    const td = Math.hypot(x, z); if (td < 118) continue;
    if (x > CASTLE.x0 - 14 && x < CASTLE.x1 + 14 && z > CASTLE.z0 - 14 && z < CASTLE.z1 + 14) continue;
    if (roadMask(x, z) > 0.02 || Math.abs(z) < 12 || Math.abs(x - riverX(z)) < 22) continue;
    const edge = smooth(250, 400, Math.abs(z)) + smooth(-560, -700, x);
    if (rand() > 0.32 + edge * 0.6) continue;
    addTree(x, z, edge > 0.5 && rand() < 0.5 ? 3 : Math.floor(rand() * 3), rr(0.9, 1.6));
  }
  // town greenery and castle garden trees
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + 0.13, r = rr(104, 116), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(z) > 10 && freeSpot(x, z, 3)) addTree(x, z, i % 3, rr(1.0, 1.4)); }
  for (const [x, z] of [[-428, 40], [-428, -40], [-334, 40], [-334, -40], [-428, 112], [-428, -112], [-334, 112], [-334, -112]]) addTree(x, z, 0, 1.3);
  // mountain pines
  for (let i = 0; i < 900; i++) {
    const x = rr(470, 760), z = rr(-420, 420), h = terrainH(x, z);
    if (h > 44 || Math.abs(z) < 26 && x < 700 || Math.hypot(x - LAIR.x, z - LAIR.z) < 62) continue;
    const s = (terrainH(x + 2, z) - terrainH(x - 2, z)) ** 2 + (terrainH(x, z + 2) - terrainH(x, z - 2)) ** 2; if (s > 6) continue;
    addTree(x, z, 3, rr(1.0, 1.8));
  }
  buildTreeMeshes();
}

// ---------- Grass tiles (built lazily around the player) ----------
const GRASS = { tiles: new Map(), size: 48, geo: null, flower: null, fern: null, mat: null, fmat: null };
function initGrass() {
  const g = new THREE.BufferGeometry(), pos = [], uv = [], col = [], idx = [];
  const segs = 3;
  for (let i = 0; i <= segs; i++) { const t = i / segs, w = 0.1 * (1 - t * 0.9), bend = t * t * 0.18; pos.push(-w, t, bend, w, t, bend); uv.push(0, t, 1, t); const c = mixc([0.22, 0.4, 0.13], [0.62, 0.8, 0.3], t).map(lin); col.push(...c, ...c); if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3)); g.setIndex(idx);
  GRASS.geo = g;
  GRASS.mat = noFlip(windify(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), 1, 'grass'));
  const f = new THREE.IcosahedronGeometry(0.09, 0); f.translate(0, 0.55, 0); const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 3); stem.translate(0, 0.27, 0);
  GRASS.flower = mergeGeometries([normGeo(f), normGeo(stem)]);
  const fu = GRASS.flower.attributes.position; const uvs = new Float32Array(fu.count * 2); for (let i = 0; i < fu.count; i++) uvs[i * 2 + 1] = clamp(fu.getY(i) / 0.6, 0, 1); GRASS.flower.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  GRASS.fmat = windify(new THREE.MeshStandardMaterial({ roughness: 0.7 }), 0.6, 'grass');
  // fern: radiating fronds
  const fp = [], fi = [], fuv = [], fc = [];
  for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, b = fp.length / 3; for (let j = 0; j <= 4; j++) { const t = j / 4, r = t * 0.9, y = Math.sin(t * 2.2) * 0.45, w = 0.14 * Math.sin(t * Math.PI); const cx = Math.cos(a) * r, cz = Math.sin(a) * r, px = -Math.sin(a) * w, pz = Math.cos(a) * w; fp.push(cx - px, y, cz - pz, cx + px, y, cz + pz); fuv.push(0, t, 1, t); const c = mixc([0.14, 0.3, 0.1], [0.42, 0.62, 0.22], t).map(lin); fc.push(...c, ...c); if (j < 4) { const q = b + j * 2; fi.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } } }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2)); fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3)); fg.setIndex(fi); fg.computeVertexNormals();
  GRASS.fern = fg;
}
const FLOWER_COLS = [0xf2d24b, 0xf4f1ea, 0xd8414f, 0xa36bd8, 0x6fa8e8, 0xf29fc0].map((c) => new THREE.Color(c));
function buildGrassTile(tx, tz) {
  const S = GRASS.size, N = LITE ? 2500 : IS_TOUCH ? 3000 : 4600, mats = [], fl = [], fe = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const x = tx * S + rand() * S, z = tz * S + rand() * S, h = terrainH(x, z);
    if (h < 0.7 || h > 44 || roadMask(x, z) > 0.35 || cobbleMask(x, z) > 0.3) continue;
    const sl = Math.abs(terrainH(x + 1, z) - h) + Math.abs(terrainH(x, z + 1) - h); if (sl > 0.9) continue;
    if (!freeSpot(x, z, 0.1)) continue;
    const forest = x > 200 && x < 470 && Math.hypot(x - ELVES.x, z - ELVES.z) > ELVES.r;
    q.setFromAxisAngle(up, rand() * TAU);
    const r = rand();
    if (forest && r < 0.05) { const s = rr(0.8, 1.6); fe.push(m.compose(new THREE.Vector3(x, h - 0.05, z), q, new THREE.Vector3(s, s, s)).clone()); continue; }
    if (!forest && r < 0.025) { const s = rr(0.8, 1.3); fl.push(m.compose(new THREE.Vector3(x, h - 0.02, z), q, new THREE.Vector3(s, s, s)).clone()); continue; }
    if (forest && r < 0.45) continue;
    const s = rr(0.38, 0.8) * (forest ? 0.8 : 1);
    mats.push(m.compose(new THREE.Vector3(x, h - 0.03, z), q, new THREE.Vector3(rr(0.8, 1.3), s, 1)).clone());
  }
  const group = new THREE.Group();
  const mk = (geo, mat, list, colorFn) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => { im.setMatrixAt(i, mm); if (colorFn) im.setColorAt(i, colorFn(i)); }); im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); };
  const tint = new THREE.Color();
  mk(GRASS.geo, GRASS.mat, mats, () => tint.setRGB(rr(0.75, 1.05), rr(0.85, 1.08), rr(0.7, 1.0)));
  mk(GRASS.flower, GRASS.fmat, fl, () => pick(FLOWER_COLS));
  mk(GRASS.fern, GRASS.mat, fe, null);
  scene.add(group);
  return group;
}
function updateGrass(px, pz) {
  const S = GRASS.size, R = LITE || IS_TOUCH ? 70 : 95, ctx = Math.floor(px / S), ctz = Math.floor(pz / S), n = Math.ceil(R / S);
  let built = 0;
  for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
    const tx = ctx + dx, tz = ctz + dz, key = tx + ',' + tz, d = Math.hypot((tx + 0.5) * S - px, (tz + 0.5) * S - pz);
    if (d < R && !GRASS.tiles.has(key) && built < 1) { GRASS.tiles.set(key, buildGrassTile(tx, tz)); built++; }
  }
  for (const [key, g] of GRASS.tiles) { const [tx, tz] = key.split(',').map(Number); const d = Math.hypot((tx + 0.5) * S - px, (tz + 0.5) * S - pz); g.visible = d < R + 20; }
}

// ---------- Rocks ----------
function placeRocks() {
  const geo = blob(1, 1, 0.45, 3); geo.scale(1, 0.7, 1); scaleUV(geo, 2, 2);
  const list = [];
  const put = (x, z, s) => { const y = terrainH(x, z); list.push(xform(x, y - s * 0.25, z, rand() * TAU, rr(-0.3, 0.3), 0, s * rr(0.8, 1.3), s, s * rr(0.8, 1.2))); if (s > 0.9) addCollider(x, z, s * 0.8, s * 0.8, 0, y - 1, y + s * 0.5); };
  for (let i = 0; i < 160; i++) { const z = rr(-480, 480), x = riverX(z) + pick([-1, 1]) * rr(10, 18); if (Math.abs(z) > 8) put(x, z, rr(0.3, 1.3)); }
  for (let i = 0; i < 260; i++) { const x = rr(-700, 760), z = rr(-470, 470); if (Math.hypot(x, z) < 120 || roadMask(x, z) > 0.05 || Math.abs(z) < 8 || (x > CASTLE.x0 - 10 && x < CASTLE.x1 + 10 && Math.abs(z) < 140)) continue; if (freeSpot(x, z, 2)) put(x, z, x > 480 ? rr(1, 4) : rr(0.4, 1.8)); }
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, x = LAIR.x + Math.cos(a) * rr(44, 58), z = LAIR.z + Math.sin(a) * rr(44, 58); put(x, z, rr(2.5, 6)); }
  const im = new THREE.InstancedMesh(geo, MAT.rock, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
}

// ---------- Forest light shafts + dust ----------
const RAYS = { mat: null, list: [] };
function buildRays() {
  RAYS.mat = new THREE.MeshBasicMaterial({ map: TEX.ray, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const g1 = new THREE.PlaneGeometry(3.5, 34), g2 = g1.clone().rotateY(Math.PI / 2);
  const g = mergeGeometries([g1, g2]);
  for (let i = 0; i < 70; i++) {
    let x, z; do { x = rr(205, 470); z = rr(-300, 300); } while (Math.abs(z) < 12 || Math.abs(x - riverX(z)) < 20);
    const m = new THREE.Mesh(g, RAYS.mat); m.position.set(x, terrainH(x, z) + 12, z); m.scale.setScalar(rr(0.7, 1.5)); scene.add(m); RAYS.list.push(m);
  }
  const pts = new Float32Array(600 * 3); for (let i = 0; i < 600; i++) { pts[i * 3] = rr(-25, 25); pts[i * 3 + 1] = rr(0, 10); pts[i * 3 + 2] = rr(-25, 25); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  RAYS.dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: TEX.glow, size: 0.18, color: 0xfff2c0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  RAYS.dust.frustumCulled = false; scene.add(RAYS.dust);
}
function updateRays(sunDir, daylight, rain, px, pz, t) {
  const inForest = smooth(180, 215, px) * smooth(490, 460, px);
  RAYS.mat.opacity = 0.16 * daylight * (1 - rain) * clamp(sunDir.y * 2.2, 0, 1);
  const ang = Math.atan2(Math.hypot(sunDir.x, sunDir.z), sunDir.y), yaw = Math.atan2(sunDir.x, sunDir.z);
  for (const m of RAYS.list) { m.rotation.set(0, 0, 0); m.rotateY(yaw); m.rotateX(ang); }
  RAYS.dust.position.set(px, terrainH(px, pz), pz); RAYS.dust.material.opacity = 0.7 * inForest * (0.3 + daylight * 0.7);
  RAYS.dust.rotation.y = t * 0.02;
}

// ---------- Clouds + distant peaks ----------
const CLOUDS = [];
function buildSkyProps() {
  const c = makeCanvas(256), g = c.getContext('2d');
  for (let i = 0; i < 60; i++) { const x = 128 + rr(-80, 80), y = 140 + rr(-30, 24) - Math.abs(x - 128) * 0.25, r = rr(18, 46); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  const tex = toTex(c, true, false);
  for (let i = 0; i < 34; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
    const s = new THREE.Sprite(m); const a = rand() * TAU, r = rr(500, 1700);
    s.position.set(Math.cos(a) * r, rr(260, 420), Math.sin(a) * r); s.scale.set(rr(260, 480), rr(120, 200), 1); scene.add(s); CLOUDS.push(s);
  }
  // distant snowy peaks beyond the eastern edge
  const pg = new THREE.ConeGeometry(1, 1, 18, 8); const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) { _v.fromBufferAttribute(pp, i); const n = fbm(_v.x * 3, _v.z * 3 + _v.y * 2, 3) * 0.12; pp.setXYZ(i, _v.x * (1 + n), _v.y, _v.z * (1 + n)); }
  pg.computeVertexNormals(); colorize(pg, (x, y) => (y > 0.05 ? [0.95, 0.97, 1.0] : y > -0.2 ? [0.62, 0.64, 0.7] : [0.36, 0.4, 0.42]));
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  for (const [x, z, r, h] of [[1000, -60, 260, 420], [1080, 220, 230, 360], [960, 330, 200, 300], [1040, -320, 240, 380], [1250, 40, 340, 560], [880, -480, 160, 240], [900, 480, 160, 250]]) { const m = new THREE.Mesh(pg, pm); m.position.set(x, h / 2 - 20, z); m.scale.set(r, h, r); m.rotation.y = rand() * TAU; scene.add(m); }
  for (const [x, z, r, h] of [[-950, -200, 300, 200], [-1000, 200, 300, 220], [-200, -760, 400, 180], [200, -800, 400, 200], [-200, 760, 400, 170], [300, 800, 420, 210]]) { const m = new THREE.Mesh(pg, pm); m.position.set(x, h / 2 - 30, z); m.scale.set(r, h, r); scene.add(m); }
}
