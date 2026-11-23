// ===== Nature: pines and birches, grass, rocks, clouds and the mountains around the fjord =====
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
  const ok = (x, z, m = 3) => { const h = terrainH(x, z); if (h < 3 || h > 95) return false; const sl = Math.abs(terrainH(x + 2, z) - h) + Math.abs(terrainH(x, z + 2) - h); if (sl > 2.6) return false; if (inRect(PLATEAU, x, z, 6) || inRect(TERRACE, x, z, 4) || inRect(HARBOR, x, z, 4)) return false; if (STAIRS.some((s) => stairY(s, x, z) !== null)) return false; return freeSpot(x, z, m); };
  // dense pine and birch wood to the west and on the northern slopes
  for (let x = -295; x < 290; x += 7) for (let z = -295; z < 120; z += 7) {
    const px = x + rr(-3, 3), pz = z + rr(-3, 3); const wood = px < -150 || pz < -95; if (!wood && rand() > 0.12) continue; if (Math.hypot(px - CAMP.x, pz - CAMP.z) < 14) continue; if (!ok(px, pz)) continue;
    addTree(px, pz, rand() < 0.72 ? 3 : Math.floor(rand() * 3), rr(1.0, 1.9));
  }
  // a few wind-bent trees on the plateau edge
  for (const [x, z] of [[142, -60], [146, 40], [20, -80], [-2, 48]]) if (freeSpot(x, z, 2)) addTree(x, z, 3, 1.3);
  buildTreeMeshes();
}
// ---------- Grass tiles (built lazily around the player) ----------
const GRASS = { tiles: new Map(), size: 48, geo: null, flower: null, fern: null, mat: null, fmat: null };
function initGrass() {
  const g = new THREE.BufferGeometry(), pos = [], uv = [], col = [], idx = [];
  const segs = 3;
  for (let i = 0; i <= segs; i++) { const t = i / segs, w = 0.1 * (1 - t * 0.9), bend = t * t * 0.18; pos.push(-w, t, bend, w, t, bend); uv.push(0, t, 1, t); const c = mixc([0.16, 0.24, 0.12], [0.42, 0.5, 0.28], t).map(lin); col.push(...c, ...c); if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
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
const FLOWER_COLS = [0xe8d8a0, 0xf4f1ea, 0xb8a0d8, 0x9fb8e0].map((c) => new THREE.Color(c));
function buildGrassTile(tx, tz) {
  const S = GRASS.size, N = LITE ? 2500 : IS_TOUCH ? 3000 : 4600, mats = [], fl = [], fe = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const x = tx * S + rand() * S, z = tz * S + rand() * S, h = terrainH(x, z);
    if (h < 2.6 || h > 80 || pathMask(x, z) > 0.4 || inRect(HARBOR, x, z, 2)) continue;
    const sl = Math.abs(terrainH(x + 1, z) - h) + Math.abs(terrainH(x, z + 1) - h); if (sl > 0.9) continue;
    if (!freeSpot(x, z, 0.1)) continue;
    const forest = x < -150 || z < -100;
    q.setFromAxisAngle(up, rand() * TAU);
    const r = rand();
    if (forest && r < 0.05) { const s = rr(0.8, 1.6); fe.push(m.compose(new THREE.Vector3(x, h - 0.05, z), q, new THREE.Vector3(s, s, s)).clone()); continue; }
    if (!forest && r < 0.012) { const s = rr(0.8, 1.3); fl.push(m.compose(new THREE.Vector3(x, h - 0.02, z), q, new THREE.Vector3(s, s, s)).clone()); continue; }
    if (forest && r < 0.45) continue;
    const s = rr(0.26, 0.55) * (forest ? 0.8 : 1);
    mats.push(m.compose(new THREE.Vector3(x, h - 0.03, z), q, new THREE.Vector3(rr(0.8, 1.3), s, 1)).clone());
  }
  const group = new THREE.Group();
  const mk = (geo, mat, list, colorFn) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => { im.setMatrixAt(i, mm); if (colorFn) im.setColorAt(i, colorFn(i)); }); im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); };
  const tint = new THREE.Color();
  mk(GRASS.geo, GRASS.mat, mats, () => tint.setRGB(rr(0.8, 1.1), rr(0.82, 1.0), rr(0.7, 0.95)));
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

// ---------- rocks ----------
function placeRocks() {
  const geo = blob(1, 1, 0.45, 3); geo.scale(1, 0.7, 1); scaleUV(geo, 2, 2);
  const list = [];
  const put = (x, z, s) => { const y = terrainH(x, z); list.push(xform(x, y - s * 0.25, z, rand() * TAU, rr(-0.3, 0.3), 0, s * rr(0.8, 1.3), s, s * rr(0.8, 1.2))); if (s > 0.9) addCollider(x, z, s * 0.8, s * 0.8, 0, y - 1, y + s * 0.5); };
  for (let i = 0; i < 260; i++) { const x = rr(-290, 290), z = rr(-290, 150); if (inRect(PLATEAU, x, z, 3) || inRect(TERRACE, x, z, 3) || inRect(HARBOR, x, z, 2) || STAIRS.some((s) => stairY(s, x, z) !== null)) continue; if (freeSpot(x, z, 2)) put(x, z, terrainH(x, z) > 60 ? rr(1.5, 5) : rr(0.4, 1.8)); }
  for (let i = 0; i < 70; i++) { const x = rr(-280, 280), z = coastZ(x) + rr(-4, 14); put(x, z, rr(1, 3.5)); }
  const im = new THREE.InstancedMesh(geo, MAT.rock, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
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
  for (const [x, z, r, h] of [[-200, -620, 300, 520], [150, -700, 340, 600], [500, -480, 260, 420], [700, 300, 280, 460], [420, 700, 240, 380], [-300, 760, 300, 440], [-700, 420, 260, 400], [-760, -200, 300, 480], [80, 1100, 400, 520]]) { const m = new THREE.Mesh(pg, pm); m.position.set(x, h / 2 - 20, z); m.scale.set(r, h, r); m.rotation.y = rand() * TAU; scene.add(m); }
  
}
