// ===== The Gilded Circuit: layout, ground, collision world, canal =====
const WORLD = { minX: -400, maxX: 400, minZ: -95, maxZ: 95 };
const CANAL = { x0: -400, x1: 300, half: 14, floor: -1.6 };
const BRIDGES = [-150, 150], BRIDGE_GAPS = [[-157, -143], [143, 157]];
const PROM_Y = 1.2, WATER_Y = 0.0, FACADE_Z = 42;
const BREACH = { x: 345, z: 0 }, DOCKS = { x: -340, z: 0 };
const riverX = (z) => player.pos.x + Math.abs(Math.abs(z) - 7); // audio: distance to the canal
const inCanal = (x, z) => x > CANAL.x0 && x < CANAL.x1 && Math.abs(z) < CANAL.half;
function terrainH(x, z) { return inCanal(x, z) ? CANAL.floor : PROM_Y; }

// ---------- city textures ----------
function cityTextures() {
  { // glowing circuit board under the canal water
    const S = 1024, c = makeCanvas(S), g = c.getContext('2d');
    g.fillStyle = '#05181f'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,${70 + rand() * 50},${90 + rand() * 50},0.35)`; g.fillRect(rand() * S, rand() * S, rr(40, 180), rr(30, 120)); }
    const trace = (glow) => {
      let x = Math.round(rand() * 32) * 32, y = Math.round(rand() * 32) * 32; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6 + rand() * 8; k++) { const d = Math.floor(rand() * 4), L = 32 * (1 + Math.floor(rand() * 4)); if (d === 0) x += L; else if (d === 1) y += L; else if (d === 2) { x += L * 0.7; y += L * 0.7; } else { x -= L * 0.7; y += L * 0.7; } g.lineTo(x, y); }
      g.stroke(); g.beginPath(); g.arc(x, y, glow ? 5 : 3, 0, TAU); g.fill();
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(40,170,200,0.55)'; g.fillStyle = 'rgba(80,220,240,0.8)'; g.lineWidth = 3; for (let i = 0; i < 160; i++) trace(false);
    g.strokeStyle = 'rgba(140,250,255,0.95)'; g.fillStyle = '#e8ffff'; g.lineWidth = 4; for (let i = 0; i < 60; i++) trace(true);
    for (let i = 0; i < 26; i++) { const x = rand() * S, y = rand() * S, w = rr(40, 110), h = rr(30, 70); g.fillStyle = '#0b2a33'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(120,240,255,0.9)'; g.lineWidth = 2; g.strokeRect(x, y, w, h); for (let p = 0; p < w; p += 10) { g.fillStyle = 'rgba(160,250,255,0.8)'; g.fillRect(x + p + 3, y - 6, 3, 6); g.fillRect(x + p + 3, y + h, 3, 6); } }
    TEX.circuit = toTex(c);
  }
  { // polished marble tiles
    const S = 512, c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 6, v * 6, 5, 6), vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2 + n * 2.2) * Math.PI)), 12); const base = mixc([232, 226, 214], [246, 242, 232], n * 0.5 + 0.5); return mixc(base, [178, 160, 128], vein * 0.6); });
    g.strokeStyle = 'rgba(150,128,90,0.55)'; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * S / 2, 0); g.lineTo(i * S / 2, S); g.stroke(); g.beginPath(); g.moveTo(0, i * S / 2); g.lineTo(S, i * S / 2); g.stroke(); }
    TEX.marble = toTex(c);
  }
  { // warm golden arcade interior (emissive)
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 512, 0, 0); grd.addColorStop(0, '#ffcf6a'); grd.addColorStop(0.5, '#f0a83a'); grd.addColorStop(1, '#7a4a14'); g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
    for (let x = 6; x < 256; x += 14) { g.fillStyle = `rgba(255,${220 + rand() * 35},150,${0.55 + rand() * 0.4})`; g.fillRect(x, 0, 4, 512); }
    for (let y = 30; y < 512; y += 60) { g.fillStyle = 'rgba(90,50,10,0.55)'; g.fillRect(0, y, 256, 5); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,245,210,0.9)'; g.beginPath(); g.arc(rand() * 256, rand() * 300, rr(2, 5), 0, TAU); g.fill(); }
    TEX.arcade = toTex(c, true, false);
  }
  { // night-lit skyscraper windows
    const S = 256, c = makeCanvas(S), g = c.getContext('2d'); g.fillStyle = '#0d1520'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 6) { const on = rand(); g.fillStyle = on > 0.55 ? `rgba(255,${200 + rand() * 50},${130 + rand() * 60},${0.5 + rand() * 0.5})` : on > 0.4 ? 'rgba(120,200,255,0.5)' : 'rgba(40,60,80,0.6)'; g.fillRect(x + 1, y + 1, 4, 5); }
    TEX.tower = toTex(c);
  }
}
cityTextures();
MAT.marble = std(TEX.marble, 0xcfc3ab, 0.32, { metalness: 0.0 });
MAT.stoneCream = std(TEX.plaster, 0xe0c99a, 0.6);
MAT.goldBright = new THREE.MeshStandardMaterial({ color: 0xe8b956, metalness: 1, roughness: 0.22 });
MAT.goldDark = new THREE.MeshStandardMaterial({ color: 0xa47a2c, metalness: 1, roughness: 0.35 });
MAT.arcade = new THREE.MeshStandardMaterial({ map: TEX.arcade, emissiveMap: TEX.arcade, emissive: 0xffc070, emissiveIntensity: 1.3, roughness: 0.5 });
MAT.towerGlass = new THREE.MeshStandardMaterial({ color: 0x8aa0b8, map: TEX.tower, emissiveMap: TEX.tower, emissive: 0xffffff, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.15 });
MAT.circuit = new THREE.MeshStandardMaterial({ map: TEX.circuit, emissiveMap: TEX.circuit, emissive: 0x7ff6ff, emissiveIntensity: 1.6, roughness: 0.4 });
MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, metalness: 1, roughness: 0.12 });
MAT.carWhite = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
MAT.carRed = new THREE.MeshPhysicalMaterial({ color: 0xb3202c, metalness: 0.4, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
MAT.carBlack = new THREE.MeshPhysicalMaterial({ color: 0x15181c, metalness: 0.5, roughness: 0.2, clearcoat: 1 });
MAT.neonCyan = new THREE.MeshBasicMaterial({ color: 0x6ff4ff });
MAT.neonRed = new THREE.MeshBasicMaterial({ color: 0xff3a4a });
MAT.orb = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd890, emissiveIntensity: 2.2, roughness: 0.3 });

// ---------- collision world (oriented boxes) ----------
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
    const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz); let dx = lx - qx, dz = lz - qz; const d = Math.hypot(dx, dz); let px, pz;
    if (d > 1e-6) { if (d >= R) continue; px = dx / d * (R - d); pz = dz / d * (R - d); }
    else { const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz); if (ox < oz) { px = Math.sign(lx || 1) * (ox + R); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + R); } }
    p.x += px * c.cos + pz * c.sin; p.z += -px * c.sin + pz * c.cos;
  }
  return ceil;
}
function pointBlocked(x, y, z) { if (y < terrainH(x, z) + 0.25) return true; for (const c of cellAt(x, z)) if (c.on && y > c.y0 - 0.2 && y < c.y1 + 0.2 && insideXZ(c, x, z, 0.2)) return true; return false; }

// ---------- ground, canal, water ----------
const WATERS = [];
function buildGround() {
  const b = BATCH.ground;
  for (const s of [1, -1]) {
    // promenade slabs (marble) between the canal and the facades
    const zc = s * (CANAL.half + FACADE_Z) / 2;
    b.add(MAT.marble, boxGeo(CANAL.x1 - CANAL.x0, 1.0, FACADE_Z - CANAL.half, 4), xform((CANAL.x0 + CANAL.x1) / 2, PROM_Y - 0.5, zc));
    // canal edge coping, gold trim and a low rail
    B(b, MAT.stoneCream, (CANAL.x0 + CANAL.x1) / 2, PROM_Y - 3, s * (CANAL.half + 0.6), CANAL.x1 - CANAL.x0, 3.1, 1.2, 0, false, 3);
    b.add(MAT.goldBright, boxGeo(CANAL.x1 - CANAL.x0, 0.08, 0.1), xform((CANAL.x0 + CANAL.x1) / 2, PROM_Y + 0.02, s * (CANAL.half + 0.02)));
    for (let x = CANAL.x0 + 2; x < CANAL.x1; x += 2.5) { if (BRIDGE_GAPS.some(([g0, g1]) => x > g0 && x < g1)) continue; b.add(MAT.goldDark, new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), xform(x, PROM_Y + 0.45, s * (CANAL.half + 0.35))); }
    for (let x0 = CANAL.x0; x0 < CANAL.x1; x0 += 20) {
      let parts = [[x0, Math.min(x0 + 20, CANAL.x1)]];
      for (const [g0, g1] of BRIDGE_GAPS) parts = parts.flatMap(([u, w]) => (w <= g0 || u >= g1 ? [[u, w]] : [[u, g0], [g1, w]].filter(([m, n]) => n - m > 0.1)));
      for (const [p, q] of parts) { addCollider((p + q) / 2, s * (CANAL.half + 0.35), (q - p) / 2, 0.15, 0, PROM_Y - 4, PROM_Y + 1.0); b.add(MAT.goldBright, boxGeo(q - p, 0.06, 0.12), xform((p + q) / 2, PROM_Y + 0.92, s * (CANAL.half + 0.35))); }
    }
  }
  // canal bed: glowing circuitry
  const bed = new THREE.PlaneGeometry(CANAL.x1 - CANAL.x0, CANAL.half * 2, 1, 1); bed.rotateX(-Math.PI / 2); scaleUV(bed, (CANAL.x1 - CANAL.x0) / 28, 1);
  const bm = new THREE.Mesh(bed, MAT.circuit); bm.position.set((CANAL.x0 + CANAL.x1) / 2, CANAL.floor, 0); bm.receiveShadow = true; scene.add(bm);
  // water surface
  const nm = TEX.waterN.clone(); nm.needsUpdate = true; nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(60, 3);
  const wm = new THREE.MeshPhysicalMaterial({ color: 0x06323c, roughness: 0.06, metalness: 0, transmission: 0, transparent: true, opacity: 0.42, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 });
  WATERS.push({ m: wm, nm, flow: [0.02, 0.005], keep: true });
  const wg = new THREE.PlaneGeometry(CANAL.x1 - CANAL.x0, CANAL.half * 2); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, wm); water.position.set((CANAL.x0 + CANAL.x1) / 2, WATER_Y, 0); water.receiveShadow = true; scene.add(water);
  // canal end: a waterfall wall into the breach plaza
  B(b, MAT.stoneCream, CANAL.x1 + 0.6, CANAL.floor, 0, 1.2, PROM_Y - CANAL.floor, CANAL.half * 2 + 2.4, 0, true, 2);
  // east breach plaza and west docks floor
  b.add(MAT.marble, boxGeo(100, 1.0, FACADE_Z * 2, 4), xform(CANAL.x1 + 50, PROM_Y - 0.5, 0));
  // world edge walls
  for (const [x, z, hx, hz] of [[WORLD.minX, 0, 1, 100], [WORLD.maxX, 0, 1, 100]]) addCollider(x, z, hx, hz, 0, -5, 40);
}
