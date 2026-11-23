// ===== Valdrheim: terrain, stairways, collision world, the fjord =====
const WORLD = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
const SEA_Y = 0;
const WATER_Y = SEA_Y;
const PLATEAU = { x0: -10, x1: 150, z0: -90, z1: 55, y: 32 };
const TERRACE = { x0: -150, x1: -22, z0: -30, z1: 48, y: 18 };
const HARBOR = { x0: -175, x1: -20, z0: 68, z1: 118, y: 2 };
const HALL = { x: 72, z: -34, w: 34, d: 15 };
const TOWER = { x: 128, z: 30, r: 3.6, h: 17 };
const STONE = { x: 70, z: 0 };
const BOATHOUSE = { x: -96, z: 100, w: 16, d: 10 };
const CAMP = { x: -225, z: -40 };
// timber stairways: [x0, z0, y0, x1, z1, y1, width]
const STAIRS = [
  [-58, 66, HARBOR.y, -58, 44, TERRACE.y, 3.2],     // harbour up to the terrace town
  [-26, 12, TERRACE.y, 4, 12, PLATEAU.y, 3.2],      // terrace town up to the hall plateau
];
const riverX = () => 99999; // engine audio hook (no river here)

const coastZ = (x) => (x > -20 ? 70 + 10 * Math.sin(x / 47) + 5 * Math.sin(x / 13) : x > -185 ? HARBOR.z1 + 4 * Math.sin(x / 9) : 95 + 15 * Math.sin(x / 40));
function inRect(r, x, z, pad = 0) { return x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad; }
function rectDist(r, x, z) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); return Math.hypot(dx, dz); }
function stairY(s, x, z) { // height of the stair ramp at (x,z) if inside its footprint, else null
  const [x0, z0, y0, x1, z1, y1, w] = s, dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
  const t = ((x - x0) * dx + (z - z0) * dz) / L2; if (t < -0.08 || t > 1.08) return null;
  const px = x0 + dx * t, pz = z0 + dz * t; if (Math.hypot(x - px, z - pz) > w / 2 + 1.4) return null;
  return lerp(y0, y1, clamp(t, 0, 1));
}

function heightRaw(x, z) {
  // rolling upland with mountains to the north and west
  let h = 34 + fbm(x * 0.008, z * 0.008, 4) * 12 + fbm(x * 0.03 + 7, z * 0.03, 3) * 2;
  h += smooth(-120, -260, z) * (90 + fbm(x * 0.01, z * 0.01, 4) * 70);
  h += smooth(-200, -290, x) * 50;
  // the western wood dips a little
  h = lerp(h, 30 + fbm(x * 0.02, z * 0.02, 3) * 4, smooth(70, 30, Math.hypot(x - CAMP.x, z - CAMP.z)) * 0.6);
  // flat shelves: plateau, terrace, harbour (steep edges make cliffs)
  h = lerp(h, PLATEAU.y + fbm(x * 0.05, z * 0.05, 2) * 0.3, smooth(10, 1, rectDist(PLATEAU, x, z)));
  h = lerp(h, TERRACE.y + fbm(x * 0.05, z * 0.05, 2) * 0.3, smooth(5, 0.5, rectDist(TERRACE, x, z)));
  h = lerp(h, HARBOR.y + fbm(x * 0.05, z * 0.05, 2) * 0.2, smooth(4, 0.5, rectDist(HARBOR, x, z)));
  // cliff band stepping down from the terrace town to the harbour
  const band = { x0: HARBOR.x0, x1: HARBOR.x1, z0: TERRACE.z1 - 2, z1: HARBOR.z0 + 2 };
  h = lerp(h, lerp(TERRACE.y, HARBOR.y, smooth(52, 64, z)) + fbm(x * 0.08, z * 0.08, 2) * 1.5, smooth(8, 0, rectDist(band, x, z)));
  // sea cliffs: drop to the sea floor beyond the coast line
  const cz = coastZ(x);
  h = lerp(h, -9, smooth(cz - 3, cz + 7, z));
  // carve under the stairways so they stay walkable
  for (const s of STAIRS) { const y = stairY(s, x, z); if (y !== null) h = Math.min(h, y - 0.7); }
  return h;
}

// ---------- terrain grid (exact sampling matches the mesh) ----------
const TER = { w: WORLD.maxX - WORLD.minX, d: WORLD.maxZ - WORLD.minZ, sx: 300, sz: 300 };
TER.cellX = TER.w / TER.sx; TER.cellZ = TER.d / TER.sz;
const TH = new Float32Array((TER.sx + 1) * (TER.sz + 1));
for (let iz = 0; iz <= TER.sz; iz++) for (let ix = 0; ix <= TER.sx; ix++) TH[iz * (TER.sx + 1) + ix] = heightRaw(WORLD.minX + ix * TER.cellX, WORLD.minZ + iz * TER.cellZ);
function terrainH(x, z) {
  const gx = clamp((x - WORLD.minX) / TER.cellX, 0, TER.sx - 0.0001), gz = clamp((z - WORLD.minZ) / TER.cellZ, 0, TER.sz - 0.0001);
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, W = TER.sx + 1;
  const ha = TH[iz * W + ix], hb = TH[(iz + 1) * W + ix], hc = TH[(iz + 1) * W + ix + 1], hd = TH[iz * W + ix + 1];
  return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}
function pathMask(x, z) { // muddy paths
  let m = 0;
  m = Math.max(m, smooth(3, 1.5, Math.abs(z - (-2 + 3 * Math.sin(x / 20)))) * (x > -150 && x < -20 ? 1 : 0));
  m = Math.max(m, smooth(4, 2, Math.hypot(x - STONE.x, z - STONE.z) - 9) * 0.9);
  m = Math.max(m, smooth(2.5, 1.2, Math.abs(x - 70)) * (z > -18 && z < 0 ? 1 : 0));
  m = Math.max(m, inRect(HARBOR, x, z) ? 0.75 : 0);
  return m;
}
function buildTerrain() {
  const geo = new THREE.PlaneGeometry(TER.w, TER.d, TER.sx, TER.sz);
  geo.rotateX(-Math.PI / 2); geo.translate((WORLD.minX + WORLD.maxX) / 2, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  const pos = geo.attributes.position, mask = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, terrainH(x, z)); mask[i * 2] = pathMask(x, z); mask[i * 2 + 1] = 0; }
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 2)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, map: TEX.grass });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: TEX.grass }; sh.uniforms.tDirt = { value: TEX.dirt }; sh.uniforms.tRock = { value: TEX.rock }; sh.uniforms.tSnow = { value: TEX.snow }; sh.uniforms.uWet = WETU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMask; varying vec2 vMask; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask; vWP = (modelMatrix*vec4(position,1.)).xyz; vWN = normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tGrass, tDirt, tRock, tSnow; uniform float uWet; varying vec2 vMask; varying vec3 vWP; varying vec3 vWN;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      vec3 tri(sampler2D t, float s){ vec3 b = pow(abs(vWN), vec3(4.)); b/= (b.x+b.y+b.z); return texture2D(t, vWP.zy*s).rgb*b.x + texture2D(t, vWP.xz*s).rgb*b.y + texture2D(t, vWP.xy*s).rgb*b.z; }`)
      .replace('#include <map_fragment>', `
      float n = vn(vWP.xz*0.05)*0.6 + vn(vWP.xz*0.21)*0.4;
      vec3 g = mix(texture2D(tGrass, vWP.xz*0.16).rgb, texture2D(tGrass, vWP.xz*0.043).rgb, 0.45) * mix(vec3(0.62,0.72,0.55), vec3(0.85,0.88,0.7), n);
      vec3 d = texture2D(tDirt, vWP.xz*0.19).rgb * vec3(0.78,0.72,0.66);
      vec3 r = tri(tRock, 0.07) * vec3(0.72,0.74,0.78);
      vec3 s = texture2D(tSnow, vWP.xz*0.1).rgb;
      float slope = 1.0 - vWN.y;
      vec3 col = g;
      col = mix(col, d, smoothstep(0.3, 0.7, vMask.x + (n-0.5)*0.3));
      col = mix(col, d*0.8, smoothstep(3.0, 0.5, vWP.y));
      col = mix(col, r, smoothstep(0.28, 0.5, slope + (n-0.5)*0.15));
      float snowLine = 85.0 + (n-0.5)*20.0;
      col = mix(col, s, smoothstep(snowLine, snowLine+10.0, vWP.y) * (1.0 - smoothstep(0.6,0.85,slope)));
      col *= mix(1.0, 0.62, uWet * (1.0 - smoothstep(0.4, 0.8, slope)));
      diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.35, uWet);');
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; scene.add(mesh);
}
const WETU = { value: 0 };

// ---------- collision world ----------
const COLL = [], GRID = new Map(), CELL = 8;
const ckey = (ix, iz) => (ix + 1000) * 4000 + (iz + 1000);
function addCollider(cx, cz, hx, hz, rot, y0, y1, tag = 0) {
  const c = { cx, cz, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, tag, on: true };
  const ex = Math.abs(c.cos) * hx + Math.abs(c.sin) * hz + 1, ez = Math.abs(c.sin) * hx + Math.abs(c.cos) * hz + 1;
  for (let ix = Math.floor((cx - ex) / CELL); ix <= Math.floor((cx + ex) / CELL); ix++)
    for (let iz = Math.floor((cz - ez) / CELL); iz <= Math.floor((cz + ez) / CELL); iz++) { const k = ckey(ix, iz); let l = GRID.get(k); if (!l) GRID.set(k, (l = [])); l.push(c); }
  COLL.push(c); return c;
}
const EMPTY = [];
const cellAt = (x, z) => GRID.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;
function toLocal(c, x, z) { const dx = x - c.cx, dz = z - c.cz; return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos]; }
function insideXZ(c, x, z, m = 0) { const [lx, lz] = toLocal(c, x, z); return Math.abs(lx) <= c.hx + m && Math.abs(lz) <= c.hz + m; }
const STEP = 0.55;
function groundAt(x, z, feet) { let h = terrainH(x, z); for (const c of cellAt(x, z)) if (c.on && c.y1 <= feet + STEP && c.y1 > h && insideXZ(c, x, z, 0.12)) h = c.y1; return h; }
function collideCircle(p, R, H) {
  let ceil = Infinity;
  for (let it = 0; it < 2; it++) for (const c of cellAt(p.x, p.z)) {
    if (!c.on || c.y1 <= p.y + STEP || c.y0 >= p.y + H) continue;
    const [lx, lz] = toLocal(c, p.x, p.z);
    if (Math.abs(lx) > c.hx + R || Math.abs(lz) > c.hz + R) continue;
    if (c.y0 > p.y + H * 0.55 && Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) { ceil = Math.min(ceil, c.y0); continue; }
    const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz); const dx = lx - qx, dz = lz - qz, d = Math.hypot(dx, dz); let px, pz;
    if (d > 1e-6) { if (d >= R) continue; px = dx / d * (R - d); pz = dz / d * (R - d); }
    else { const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz); if (ox < oz) { px = Math.sign(lx || 1) * (ox + R); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + R); } }
    p.x += px * c.cos + pz * c.sin; p.z += -px * c.sin + pz * c.cos;
  }
  return ceil;
}
function pointBlocked(x, y, z) { if (y < terrainH(x, z) + 0.25) return true; for (const c of cellAt(x, z)) if (c.on && y > c.y0 - 0.2 && y < c.y1 + 0.2 && insideXZ(c, x, z, 0.2)) return true; return false; }
function lineOfSight(a, b) { const d = a.distanceTo(b), n = Math.ceil(d / 0.8); for (let i = 1; i < n; i++) { const t = i / n; if (pointBlocked(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t))) return false; } return true; }

// ---------- the fjord ----------
const WATERS = [];
function buildSea() {
  const nm = TEX.waterN.clone(); nm.needsUpdate = true; nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(70, 70);
  const m = new THREE.MeshStandardMaterial({ color: 0x0c2a33, roughness: 0.08, metalness: 0.1, normalMap: nm, normalScale: new THREE.Vector2(0.7, 0.7), transparent: true, opacity: 0.92, envMapIntensity: 1.0 });
  WATERS.push({ m, nm, flow: [0.012, 0.02], keep: true });
  const g = new THREE.PlaneGeometry(2400, 2400); g.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(g, m); sea.position.set(0, SEA_Y, 700); sea.receiveShadow = true; scene.add(sea);
}
