// ===== World layout, terrain, collisions, water =====
const WORLD = { minX: -760, maxX: 840, minZ: -500, maxZ: 500 };
const TOWN = { x: 0, z: 0, r: 125, y: 2 };
const CASTLE = { x0: -620, x1: -320, z0: -130, z1: 130, y: 6 };
const KEEP = { x0: -580, x1: -440, z0: -46, z1: 46 };
const TOWER = { x: -510, z: -92, r: 7, h: 70 };
const PUB = { x: 300, z: 34 };
const ELVES = { x: 335, z: 125, r: 58 };
const LAIR = { x: 650, z: 0 };
const WATER_Y = 0.15;
const riverX = (z) => 165 + 18 * Math.sin(z / 70) + 6 * Math.sin(z / 23);
const rampH = (x) => 4 + (x - 470) * 0.34;
const LAIR_Y = rampH(610);

function roadMask(x, z) { // 0..1 dirt road
  let m = 0;
  // main road from castle gate to mountains along z ~ 0 with gentle wiggle
  const zc = 3 * Math.sin(x / 47);
  if (x > -330 && x < 640) m = Math.max(m, smooth(5.5, 3.2, Math.abs(z - zc)));
  // town ring roads and spokes
  const d = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (d < 110) {
    m = Math.max(m, smooth(4, 2.5, Math.abs(d - 30)), smooth(4.5, 3, Math.abs(d - 66)));
    const a = Math.atan2(z, x), k = Math.round(a / (Math.PI / 5)) * (Math.PI / 5);
    if (d > 30 && d < 100) m = Math.max(m, smooth(3.5, 2, Math.abs(Math.sin(a - k) * d)));
  }
  // forest lane to elven village
  if (x > 300 && x < 345 && z > 0 && z < 100) { const lx = 322 + 10 * Math.sin(z / 18); m = Math.max(m, smooth(3, 1.8, Math.abs(x - lx))); }
  if (Math.hypot(x - ELVES.x, z - ELVES.z) < 22) m = Math.max(m, 0.55 * smooth(22, 12, Math.hypot(x - ELVES.x, z - ELVES.z)));
  // castle courtyard paths
  if (x > CASTLE.x0 && x < CASTLE.x1 && z > CASTLE.z0 && z < CASTLE.z1) m = Math.max(m, 0.0);
  return m;
}
function cobbleMask(x, z) {
  const d = Math.hypot(x - TOWN.x, z - TOWN.z);
  let m = smooth(26, 23, d);
  if (x > CASTLE.x0 + 4 && x < CASTLE.x1 - 2 && z > CASTLE.z0 + 4 && z < CASTLE.z1 - 4) {
    m = Math.max(m, smooth(5, 3.5, Math.abs(z)) * (x > -440 ? 1 : 0), smooth(12, 10, Math.hypot(x + 380, z)), x < -425 ? 1 : 0);
    if (Math.abs(x + TOWER.x * 0 - TOWER.x) < 12 && Math.abs(z - TOWER.z) < 12) m = 1;
  }
  return m;
}

function heightRaw(x, z) {
  let h = Math.max(1.4, fbm(x * 0.0035, z * 0.0035, 4) * 16 + fbm(x * 0.018 + 40, z * 0.018, 3) * 2.2 + 6);
  // edge hills enclose the world
  h += smooth(330, 490, Math.abs(z)) * 30 + smooth(-560, -740, x) * 28;
  // castle hill plateau
  const cx = Math.max(CASTLE.x0 - x, 0, x - CASTLE.x1), cz = Math.max(CASTLE.z0 - z, 0, z - CASTLE.z1), cd = Math.hypot(cx, cz);
  h = lerp(h, CASTLE.y, smooth(70, 6, cd));
  // town flat
  const td = Math.hypot(x - TOWN.x, z - TOWN.z);
  h = lerp(h, TOWN.y + fbm(x * 0.02, z * 0.02, 2) * 0.4, smooth(175, 120, td));
  // road smoothing
  const zc = 3 * Math.sin(x / 47);
  if (x > -330 && x < 480) h = lerp(h, lerp(CASTLE.y, 3, smooth(-330, -120, x)) + fbm(x * 0.006, 1, 2) * 2, smooth(26, 6, Math.abs(z - zc)) * 0.85);
  // elven clearing + pub flatten
  h = lerp(h, 4, smooth(70, 40, Math.hypot(x - ELVES.x, z - ELVES.z)));
  h = lerp(h, 3.4, smooth(30, 18, Math.hypot(x - PUB.x, z - PUB.z)));
  // mountains in the east
  const mt = smooth(470, 560, x);
  if (mt > 0) {
    const ridge = 1 - Math.abs(fbm(x * 0.006 + 11, z * 0.006, 5));
    let mh = rampH(x) + Math.pow(ridge, 2.2) * 170 + (x - 470) * 0.35 + Math.abs(z) * 0.18;
    const corridor = smooth(48, 16, Math.abs(z)) * smooth(700, 640, x);
    mh = lerp(mh, rampH(x) + fbm(x * 0.03, z * 0.03, 2) * 1.5, corridor);
    const ld = Math.hypot(x - LAIR.x, z - LAIR.z);
    mh = lerp(mh, LAIR_Y + fbm(x * 0.05, z * 0.05, 2) * 0.8, smooth(62, 40, ld));
    h = lerp(h, Math.max(h, mh), mt);
  }
  // river channel
  const rd = Math.abs(x - riverX(z));
  if (rd < 34) h = lerp(h, -1.1 + rd * 0.02, smooth(30, 9, rd));
  // elven pond
  const pd = Math.hypot(x - (ELVES.x + 4), z - (ELVES.z + 4));
  if (pd < 16) h = lerp(h, 2.2, smooth(16, 9, pd));
  return h;
}

// ---------- Terrain mesh + exact height sampling ----------
const TER = { w: WORLD.maxX - WORLD.minX, d: WORLD.maxZ - WORLD.minZ, sx: 400, sz: 250 };
TER.cx = (WORLD.minX + WORLD.maxX) / 2; TER.cz = (WORLD.minZ + WORLD.maxZ) / 2;
TER.cellX = TER.w / TER.sx; TER.cellZ = TER.d / TER.sz;
const TH = new Float32Array((TER.sx + 1) * (TER.sz + 1));
for (let iz = 0; iz <= TER.sz; iz++) for (let ix = 0; ix <= TER.sx; ix++) TH[iz * (TER.sx + 1) + ix] = heightRaw(WORLD.minX + ix * TER.cellX, WORLD.minZ + iz * TER.cellZ);
function terrainH(x, z) {
  const gx = clamp((x - WORLD.minX) / TER.cellX, 0, TER.sx - 0.0001), gz = clamp((z - WORLD.minZ) / TER.cellZ, 0, TER.sz - 0.0001);
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, W = TER.sx + 1;
  const ha = TH[iz * W + ix], hb = TH[(iz + 1) * W + ix], hc = TH[(iz + 1) * W + ix + 1], hd = TH[iz * W + ix + 1];
  return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(TER.w, TER.d, TER.sx, TER.sz);
  geo.rotateX(-Math.PI / 2); geo.translate(TER.cx, 0, TER.cz);
  const pos = geo.attributes.position, mask = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainH(x, z));
    mask[i * 2] = roadMask(x, z); mask[i * 2 + 1] = cobbleMask(x, z);
  }
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 2));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, map: TEX.grass });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: TEX.grass }; sh.uniforms.tDirt = { value: TEX.dirt }; sh.uniforms.tRock = { value: TEX.rock }; sh.uniforms.tSnow = { value: TEX.snow }; sh.uniforms.tCobble = { value: TEX.cobble };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMask; varying vec2 vMask; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask; vWP = (modelMatrix*vec4(position,1.)).xyz; vWN = normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tGrass, tDirt, tRock, tSnow, tCobble; varying vec2 vMask; varying vec3 vWP; varying vec3 vWN;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      vec3 tri(sampler2D t, float s){ vec3 b = pow(abs(vWN), vec3(4.)); b/= (b.x+b.y+b.z); return texture2D(t, vWP.zy*s).rgb*b.x + texture2D(t, vWP.xz*s).rgb*b.y + texture2D(t, vWP.xy*s).rgb*b.z; }`)
      .replace('#include <map_fragment>', `
      vec2 uv1 = vWP.xz*0.16, uv2 = vWP.xz*0.043;
      float n = vn(vWP.xz*0.05)*0.6 + vn(vWP.xz*0.21)*0.4;
      vec3 g = mix(texture2D(tGrass, uv1).rgb, texture2D(tGrass, uv2).rgb, 0.45);
      g *= mix(vec3(0.82,0.9,0.72), vec3(1.12,1.06,0.92), n);
      vec3 d = texture2D(tDirt, uv1*1.2).rgb;
      vec3 r = tri(tRock, 0.07);
      vec3 s = texture2D(tSnow, uv1*0.6).rgb;
      vec3 c = texture2D(tCobble, vWP.xz*0.22).rgb;
      float slope = 1.0 - vWN.y;
      vec3 col = g;
      float sand = smoothstep(1.6, 0.4, vWP.y) * (1.0 - smoothstep(0.0, 0.3, vMask.y));
      col = mix(col, d*vec3(1.08,1.02,0.9), sand*0.85);
      col = mix(col, d, smoothstep(0.25, 0.75, vMask.x + (n-0.5)*0.3));
      col = mix(col, c, smoothstep(0.35, 0.65, vMask.y));
      col = mix(col, r, smoothstep(0.32, 0.55, slope + (n-0.5)*0.15));
      float snowLine = 40.0 + (n-0.5)*10.0;
      col = mix(col, s, smoothstep(snowLine, snowLine+6.0, vWP.y) * (1.0 - smoothstep(0.55,0.8,slope)));
      diffuseColor.rgb *= col;`);
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  scene.add(mesh); return mesh;
}

// ---------- Collision world (oriented boxes in XZ with Y range) ----------
const COLL = [], GRID = new Map(), CELL = 8;
const ckey = (ix, iz) => (ix + 1000) * 4000 + (iz + 1000);
function addCollider(cx, cz, hx, hz, rot, y0, y1, tag = 0) {
  const c = { cx, cz, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, tag, on: true };
  const ex = Math.abs(c.cos) * hx + Math.abs(c.sin) * hz + 1, ez = Math.abs(c.sin) * hx + Math.abs(c.cos) * hz + 1;
  for (let ix = Math.floor((cx - ex) / CELL); ix <= Math.floor((cx + ex) / CELL); ix++)
    for (let iz = Math.floor((cz - ez) / CELL); iz <= Math.floor((cz + ez) / CELL); iz++) {
      const k = ckey(ix, iz); let l = GRID.get(k); if (!l) GRID.set(k, (l = [])); l.push(c);
    }
  COLL.push(c); return c;
}
const EMPTY = [];
const cellAt = (x, z) => GRID.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;
function toLocal(c, x, z) { const dx = x - c.cx, dz = z - c.cz; return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos]; }
function insideXZ(c, x, z, m = 0) { const [lx, lz] = toLocal(c, x, z); return Math.abs(lx) <= c.hx + m && Math.abs(lz) <= c.hz + m; }
const STEP = 0.55;
function groundAt(x, z, feet) {
  let h = terrainH(x, z);
  for (const c of cellAt(x, z)) if (c.on && c.y1 <= feet + STEP && c.y1 > h && insideXZ(c, x, z, 0.12)) h = c.y1;
  return h;
}
// push a vertical capsule (center x,z radius R, feet..feet+H) out of walls; returns [x,z,hitCeil]
function collideCircle(p, R, H, vy) {
  let ceil = Infinity;
  for (let it = 0; it < 2; it++) {
    for (const c of cellAt(p.x, p.z)) {
      if (!c.on || c.y1 <= p.y + STEP || c.y0 >= p.y + H) continue;
      const [lx, lz] = toLocal(c, p.x, p.z);
      if (Math.abs(lx) > c.hx + R || Math.abs(lz) > c.hz + R) continue;
      if (c.y0 > p.y + H * 0.55 && Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) { ceil = Math.min(ceil, c.y0); continue; }
      const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz);
      let dx = lx - qx, dz = lz - qz, d = Math.hypot(dx, dz), px, pz;
      if (d > 1e-6) { if (d >= R) continue; px = dx / d * (R - d); pz = dz / d * (R - d); }
      else { const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz); if (ox < oz) { px = Math.sign(lx || 1) * (ox + R); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + R); } }
      // local -> world (inverse rotation)
      p.x += px * c.cos + pz * c.sin; p.z += -px * c.sin + pz * c.cos;
    }
  }
  return ceil;
}
function pointBlocked(x, y, z) {
  if (y < terrainH(x, z) + 0.25) return true;
  for (const c of cellAt(x, z)) if (c.on && y > c.y0 - 0.2 && y < c.y1 + 0.2 && insideXZ(c, x, z, 0.2)) return true;
  return false;
}

// ---------- Water ----------
const WATERS = [];
function makeWaterMat(color, flowDir) {
  const nm = TEX.waterN.clone(); nm.needsUpdate = true; nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.86, envMapIntensity: 0.8 });
  WATERS.push({ m, nm, flow: flowDir });
  return m;
}
function buildWater() {
  // river strip following the curve
  const segs = 160, z0 = WORLD.minZ, z1 = WORLD.maxZ, half = 24;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const z = lerp(z0, z1, i / segs), x = riverX(z);
    pos.push(x - half, WATER_Y, z, x + half, WATER_Y, z); uv.push(0, i * 1.2, 3, i * 1.2);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const river = new THREE.Mesh(g, makeWaterMat(0x3f7f8a, [0, -0.25])); river.receiveShadow = true; scene.add(river);
  // elven pond
  const pg = new THREE.CircleGeometry(14, 40); pg.rotateX(-Math.PI / 2); scaleUV(pg, 3, 3);
  const pond = new THREE.Mesh(pg, makeWaterMat(0x3a7a6e, [0.01, 0.02])); pond.position.set(ELVES.x + 4, 3.25, ELVES.z + 4); scene.add(pond);
}
