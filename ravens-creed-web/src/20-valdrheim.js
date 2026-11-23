// ===== Valdrheim: stave hall, watchtower, oath-stone, longhouses, harbour, boathouse, longships =====
const TORCHES = [], SEATS = [], INTERACT = [], TOWN_POINTS = [], HARBOR_POINTS = [], PERCHES = [];
const BATCH = { hall: new Batch('hall'), town: new Batch('town'), harbor: new Batch('harbor'), misc: new Batch('misc') };
function B(b, mat, cx, y0, cz, sx, sy, sz, rot = 0, col = true, ts = 2) { b.add(mat, boxGeo(sx, sy, sz, ts), xform(cx, y0 + sy / 2, cz, rot)); if (col) return addCollider(cx, cz, sx / 2, sz / 2, rot, y0, y0 + sy); }
function solidCyl(x, z, r, y0, y1) { for (let k = 0; k < 6; k++) addCollider(x, z, r, r * 0.27, k * Math.PI / 6, y0, y1); }
function cyl(b, mat, x, y0, z, r0, r1, h, seg = 12, col = false) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); scaleUV(g, Math.max(1, Math.round(TAU * Math.max(r0, r1) / 2)), Math.max(1, h / 2)); b.add(mat, g, xform(x, y0 + h / 2, z)); if (col) solidCyl(x, z, Math.max(r0, r1), y0, y0 + h); }
function frame(cx, cz, rot) { const c = Math.cos(rot), s = Math.sin(rot); return (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]; }
function addSeat(x, y, z, rot, kind = 'bench') { const s = { p: new THREE.Vector3(x, y, z), rot, kind, taken: null }; SEATS.push(s); return s; }
function torch(b, x, y, z, rot, interior = false) {
  const fx = Math.sin(rot) * 0.25, fz = Math.cos(rot) * 0.25;
  b.add(MAT.darkWood, new THREE.CylinderGeometry(0.05, 0.04, 0.6, 6), xform(x + fx, y - 0.1, z + fz, rot, 0.35));
  b.add(MAT.flame, new THREE.ConeGeometry(0.1, 0.32, 7), xform(x + fx * 1.25, y + 0.3, z + fz * 1.25));
  TORCHES.push({ p: new THREE.Vector3(x + fx * 1.3, y + 0.32, z + fz * 1.3), interior });
}
function postTorch(b, x, z, y) { const gy = y ?? groundAt(x, z, 99); cyl(b, MAT.darkWood, x, gy, z, 0.09, 0.07, 2.4, 6, true); b.add(MAT.metal, new THREE.CylinderGeometry(0.16, 0.08, 0.2, 8), xform(x, gy + 2.45, z)); b.add(MAT.flame, new THREE.ConeGeometry(0.14, 0.45, 7), xform(x, gy + 2.75, z)); TORCHES.push({ p: new THREE.Vector3(x, gy + 2.8, z) }); }
const MATS = {};
function initMats() {
  MATS.plank = std(TEX.wood, 0x6b4a32, 0.85);
  MATS.oldWood = std(TEX.wood, 0x4a3524, 0.9);
  MATS.shingle = std(TEX.roof, 0x4a3a2e, 0.85);
  MATS.thatch = std(TEX.thatch, 0x9a8460, 0.95);
  MATS.stone = std(TEX.rock, 0x8d8a84, 0.9);
  MATS.carve = std(TEX.bark, 0x3a2a1e, 0.8);
  const c = makeCanvas(256), g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e9dcc0' : '#9e2430'; g.fillRect(i * 32, 0, 32, 256); }
  const n = g.getImageData(0, 0, 256, 256); for (let k = 0; k < n.data.length; k += 4) { const v = (Math.random() - 0.5) * 30; n.data[k] += v; n.data[k + 1] += v; n.data[k + 2] += v; } g.putImageData(n, 0, 0);
  MATS.sail = new THREE.MeshStandardMaterial({ map: toTex(c, true, false), side: THREE.DoubleSide, roughness: 0.9 });
  const r = makeCanvas(256), rg = r.getContext('2d'); rg.fillStyle = '#7f7b75'; rg.fillRect(0, 0, 256, 256);
  const n2 = rg.getImageData(0, 0, 256, 256); for (let k = 0; k < n2.data.length; k += 4) { const v = (Math.random() - 0.5) * 40; n2.data[k] += v; n2.data[k + 1] += v; n2.data[k + 2] += v; } rg.putImageData(n2, 0, 0);
  rg.strokeStyle = '#2b2622'; rg.lineWidth = 6; rg.lineCap = 'round';
  rg.beginPath(); rg.moveTo(128, 20); rg.bezierCurveTo(40, 60, 40, 200, 128, 236); rg.bezierCurveTo(216, 200, 216, 60, 128, 20); rg.stroke();
  for (let i = 0; i < 14; i++) { const y = 40 + i * 14; rg.beginPath(); rg.moveTo(110, y); rg.lineTo(118, y + 8); rg.lineTo(126, y); rg.stroke(); rg.beginPath(); rg.moveTo(132, y); rg.lineTo(140, y + 10); rg.stroke(); }
  rg.fillStyle = '#b8913f'; rg.beginPath(); rg.arc(128, 120, 16, 0, TAU); rg.fill();
  MATS.runes = std(toTex(r, true, false), 0xffffff, 0.85);
}
function gable(b, mat, L, x, y, z, rot, w, rise, depth) { // triangular gable wall, depth along local x
  const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); scaleUV(g, 0.5, 0.5); b.add(mat, g, xform(x, y, z, rot + Math.PI / 2));
}
function dragonHead(b, x, y, z, rot) {
  const L = frame(x, z, rot);
  const curl = new THREE.TorusGeometry(0.9, 0.14, 6, 14, Math.PI * 1.3); b.add(MATS.carve, curl, xform(x, y + 0.9, z, rot + Math.PI / 2, 0, 0.6));
  const [hx, hz] = L(0, 0.9); b.add(MATS.carve, new THREE.ConeGeometry(0.22, 0.8, 6), xform(hx, y + 1.7, hz, rot, -1.2));
}
function roofSlabs(b, mat, cx, cz, rot, length, depth, baseY, rise, over = 0.8) {
  const L = frame(cx, cz, rot), hd = depth / 2 + over, pitch = Math.atan2(rise, hd), slab = Math.hypot(hd, rise);
  for (const s of [-1, 1]) { const [px, pz] = L(0, s * hd / 2); b.add(mat, boxGeo(length + over * 2, 0.3, slab + 0.15, 2.2), xform(px, baseY + rise / 2 + 0.15, pz, rot, s * pitch)); }
  return { hd, rise };
}
// ---------- longhouse ----------
function longhouse(b, x, z, rot, w, d, opts = {}) {
  const L = frame(x, z, rot), g0 = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => terrainH(...L(a * w / 2, c * d / 2)))), g = g0 + 0.25, H = opts.wallH || 2.6, t = 0.3, door = 1.4;
  b.__floor = g;
  B(b, MATS.stone, x, g0 - 1.5, z, w + 0.4, 1.75, d + 0.4, rot, false); addCollider(x, z, w / 2 + 0.2, d / 2 + 0.2, rot, g0 - 1.5, g);
  B(b, MATS.plank, x, g, z, w - 0.2, 0.04, d - 0.2, rot, false);
  const wall = (lx, lz, sx, sz, h = H, y0 = g) => { const [px, pz] = L(lx, lz); B(b, MATS.plank, px, y0, pz, sx, h, sz, rot); };
  wall(0, -d / 2 + t / 2, w, t); wall(-w / 2 + t / 2, 0, t, d - 2 * t); wall(w / 2 - t / 2, 0, t, d - 2 * t);
  const side = (w - door) / 2; wall(-w / 2 + side / 2, d / 2 - t / 2, side, t); wall(w / 2 - side / 2, d / 2 - t / 2, side, t);
  { const [px, pz] = L(0, d / 2 - t / 2); B(b, MATS.plank, px, g + 2.1, pz, door, H - 2.1, t, rot); }
  for (const lx of [-w / 2, -w / 4, 0, w / 4, w / 2]) for (const s of [-1, 1]) { if (s > 0 && Math.abs(lx) < 1) continue; const [px, pz] = L(lx, s * (d / 2 + 0.06)); B(b, MATS.oldWood, px, g, pz, 0.22, H, 0.12, rot, false); }
  B(b, MATS.oldWood, x, g + H, z, w, 0.18, d, rot);
  const { rise } = roofSlabs(b, opts.roof || MATS.thatch, x, z, rot, w, d, g + H, d * 0.75, 0.9);
  for (const s of [-1, 1]) { const [px, pz] = L(s * (w / 2) - (s > 0 ? 0.3 : 0), 0); gable(b, MATS.plank, L, px, g + H, pz, rot, d, rise * (d / 2) / (d / 2 + 0.9), 0.3); }
  for (const s of [-1, 1]) { const [px, pz] = L(s * (w / 2 + 0.4), 0); b.add(MATS.carve, new THREE.BoxGeometry(0.12, 1.6, 0.12), xform(px, g + H + rise + 0.4, pz, rot, 0, s * 0.5)); PERCHES.push(new THREE.Vector3(px, g + H + rise + 1.2, pz)); }
  // interior: long hearth, sleeping benches, chest, lamp
  const [hx, hz] = L(0, -0.3); B(b, MATS.stone, hx, g, hz, w * 0.45, 0.25, 1.1, rot, false); b.add(MAT.ember, new THREE.BoxGeometry(w * 0.3, 0.1, 0.6), xform(hx, g + 0.28, hz, rot)); b.add(MAT.flame, new THREE.ConeGeometry(0.25, 0.6, 7), xform(hx, g + 0.55, hz));
  TORCHES.push({ p: new THREE.Vector3(hx, g + 0.8, hz), interior: true, hearth: true });
  for (const s of [-1, 1]) { const [bx, bz] = L(0, s * (d / 2 - 1.0)); if (s > 0) continue; B(b, MATS.oldWood, bx, g, bz, w - 1.2, 0.5, 1.1, rot); for (let k = -1; k <= 1; k++) { const [sx, sz] = L(k * w * 0.25, -d / 2 + 1.1); addSeat(sx, g + 0.55, sz, rot); } }
  for (const s of [-1, 1]) { const [bx, bz] = L(s * (w / 2 - 1.2), 1.2); B(b, MAT.wood, bx, g, bz, 1.0, 0.6, 0.6, rot); }
  const doorOut = new THREE.Vector3(...L(0, d / 2 + 1.6).flatMap((v, i) => (i === 0 ? [v, g0] : [v])));
  return { x, z, rot, g, doorOut, L };
}
// ---------- the stave hall ----------
function staveHall() {
  const b = BATCH.hall, { x, z, w, d } = HALL, rot = 0, L = frame(x, z, rot), g = PLATEAU.y + 0.35, H = 5.5, t = 0.45, door = 3;
  b.__floor = g;
  B(b, MATS.stone, x, PLATEAU.y - 1, z, w + 1, 1.35, d + 1, 0, false); addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5, 0, PLATEAU.y - 1, g);
  B(b, MATS.plank, x, g, z, w, 0.04, d, 0, false);
  B(b, MATS.oldWood, x, g, z - d / 2 + t / 2, w, H, t); B(b, MATS.oldWood, x - w / 2 + t / 2, g, z, t, H, d - 2 * t); B(b, MATS.oldWood, x + w / 2 - t / 2, g, z, t, H, d - 2 * t);
  const side = (w - door) / 2; B(b, MATS.oldWood, x - w / 2 + side / 2, g, z + d / 2 - t / 2, side, H, t); B(b, MATS.oldWood, x + w / 2 - side / 2, g, z + d / 2 - t / 2, side, H, t); B(b, MATS.oldWood, x, g + 3.4, z + d / 2 - t / 2, door, H - 3.4, t);
  // carved door frame and porch
  for (const s of [-1, 1]) B(b, MATS.carve, x + s * (door / 2 + 0.25), g, z + d / 2 + 0.1, 0.4, 3.6, 0.5, 0, false);
  B(b, MATS.carve, x, g + 3.4, z + d / 2 + 0.1, door + 1, 0.5, 0.5, 0, false);
  B(b, MATS.plank, x, PLATEAU.y, z + d / 2 + 1.6, 7, 0.35, 3, 0, true);
  // galleries (lower roof skirt) and the tall upper roof
  roofSlabs(b, MATS.shingle, x, z, 0, w + 2, d + 3, g + H - 1.4, 1.4, 0.4);
  B(b, MATS.oldWood, x, g + H, z, w - 2, 3.2, d - 4, 0, false);
  const up = roofSlabs(b, MATS.shingle, x, z, 0, w - 2, d - 4, g + H + 3.2, 6.5, 1.0);
  for (const s of [-1, 1]) { gable(b, MATS.oldWood, L, x + s * ((w - 2) / 2) - (s > 0 ? 0.3 : 0), g + H + 3.2, z, 0, d - 4, up.rise * ((d - 4) / 2) / up.hd, 0.3); dragonHead(b, x + s * ((w - 2) / 2 + 0.6), g + H + 3.2 + up.rise, z, s > 0 ? Math.PI / 2 : -Math.PI / 2); }
  b.add(MATS.shingle, new THREE.ConeGeometry(1.4, 4, 4), xform(x, g + H + 3.2 + up.rise + 1.6, z, Math.PI / 4));
  addCollider(x, z, w / 2, d / 2, 0, g + H, g + H + 0.4);
  // pillars, torches, shields on the walls
  for (let px = x - w / 2 + 5; px <= x + w / 2 - 5; px += 6) for (const s of [-1, 1]) {
    cyl(b, MATS.carve, px, g, z + s * 3.6, 0.32, 0.28, H, 10, true);
    torch(b, px, g + 2.4, z + s * 3.6 - s * 0.32, s > 0 ? Math.PI : 0, true);
    b.add(MAT.red, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), xform(px + 3, g + 2.2, z + s * (d / 2 - t - 0.05), 0, Math.PI / 2 - 0, 0, 1, 1, 1));
  }
  for (let px = x - w / 2 + 3; px < x + w / 2 - 2; px += 4) for (const s of [-1, 1]) { const sh = new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16); sh.rotateX(Math.PI / 2); b.add(pick([MAT.red, MAT.blue, MAT.green, MAT.cream]), sh, xform(px, g + 2.3, z + s * (d / 2 - t / 2 - 0.25))); b.add(MAT.metal, new THREE.SphereGeometry(0.1, 8, 6), xform(px, g + 2.3, z + s * (d / 2 - t / 2 - 0.3))); }
  // long hearth down the middle, benches along the walls
  B(b, MATS.stone, x + 2, g, z, w * 0.55, 0.3, 1.4, 0, false); b.add(MAT.ember, new THREE.BoxGeometry(w * 0.45, 0.12, 0.8), xform(x + 2, g + 0.36, z));
  for (const dx of [-6, 0, 6]) { b.add(MAT.flame, new THREE.ConeGeometry(0.4, 1.1, 7), xform(x + 2 + dx, g + 0.9, z)); TORCHES.push({ p: new THREE.Vector3(x + 2 + dx, g + 1.2, z), interior: true, hearth: true }); }
  for (const s of [-1, 1]) {
    B(b, MATS.plank, x + 2, g, z + s * (d / 2 - 1.6), w - 8, 0.5, 1.2, 0, true);
    B(b, MAT.wood, x + 2, g + 0.75, z + s * 2.0, w - 12, 0.1, 1.2, 0, false); addCollider(x + 2, z + s * 2.0, (w - 12) / 2, 0.6, 0, g, g + 0.85);
    for (let px = x - w / 2 + 6; px < x + w / 2 - 4; px += 2.5) addSeat(px, g + 0.55, z + s * (d / 2 - 1.6), s > 0 ? Math.PI : 0, 'bench');
  }
  // high seat (west end) with its pillars, horn table beside it
  const hsx = x - w / 2 + 2.2; B(b, MATS.carve, hsx, g, z, 1.6, 0.6, 1.8, 0, true); B(b, MATS.carve, hsx - 0.7, g, z, 0.25, 2.6, 1.9, 0, false);
  for (const s of [-1, 1]) { cyl(b, MATS.carve, hsx + 0.4, g, z + s * 1.4, 0.22, 0.2, 3.6, 8, true); b.add(MAT.gold, new THREE.SphereGeometry(0.22, 10, 8), xform(hsx + 0.4, g + 3.7, z + s * 1.4)); }
  HALL.highSeat = addSeat(hsx + 0.2, g + 0.62, z, Math.PI / 2, 'throne');
  const tx = hsx + 3.2, tz = z - 3.0; B(b, MAT.darkWood, tx, g, tz, 1.4, 0.85, 0.9, 0, true);
  const horn = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 16, Math.PI * 1.1), MAT.gold); horn.position.set(tx, g + 1.05, tz); horn.rotation.set(0, 0.3, 0.4); horn.castShadow = true; scene.add(horn);
  HALL.horn = horn; HALL.hornPos = new THREE.Vector3(tx, g + 0.9, tz);
  HALL.floor = g; HALL.thingSpot = new THREE.Vector3(x - 4, g, z + 1.5);
  // tapestries
  for (const s of [-1, 1]) { const tap = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), MATS.sail); tap.position.set(x + s * 8, g + 3.6, z - d / 2 + t + 0.03); scene.add(tap); }
}
// ---------- watchtower with a spiral stair and an iron brazier ----------
function watchtower() {
  const b = BATCH.misc, { x, z, r, h } = TOWER, G = PLATEAU.y, rin = r - 0.4, doorA = -Math.PI / 2; // door faces north, toward the hall
  B(b, MATS.stone, x, G - 1, z, r * 2 + 1, 1.4, r * 2 + 1, 0, false);
  const segs = 18;
  for (let k = 0; k < segs; k++) {
    const a = (k + 0.5) / segs * TAU, wx = x + Math.cos(a) * (r - 0.2), wz = z + Math.sin(a) * (r - 0.2), rot = -a + Math.PI / 2, len = TAU * r / segs * 1.1;
    if (Math.abs(angDiff(a, doorA)) < 0.3) { B(b, MATS.plank, wx, G + 2.6, wz, len, h - 2.6, 0.4, rot); continue; }
    B(b, k % 2 ? MATS.plank : MATS.oldWood, wx, G, wz, len, h, 0.4, rot);
  }
  cyl(b, MATS.oldWood, x, G, z, 0.5, 0.5, h, 8, true);
  const N = Math.round(h / 0.34), da = 0.42, a0 = doorA + 0.9, rc = (0.5 + rin) / 2, rh = (rin - 0.5) / 2;
  TOWER.lastA = a0 + (N - 1) * da;
  for (let i = 0; i < N; i++) { const a = a0 + i * da, top = G + 0.34 * (i + 1), sx = x + Math.cos(a) * rc, sz = z + Math.sin(a) * rc, rot = -a + Math.PI / 2; b.add(MATS.plank, boxGeo(1.1, 0.3, rh * 2, 1), xform(sx, top - 0.15, sz, rot)); addCollider(sx, sz, 0.55, rh, rot, top - 0.3, top); }
  const PT = G + h;
  for (let k = 0; k < 16; k++) { const a = (k + 0.5) / 16 * TAU; if (Math.abs(angDiff(a, TOWER.lastA - 0.6)) < 0.9) continue; const rc2 = (0.5 + r + 0.6) / 2; B(b, MATS.plank, x + Math.cos(a) * rc2, PT - 0.3, z + Math.sin(a) * rc2, (r + 0.6) * TAU / 16 * 0.75 + 0.3, 0.3, r + 0.1, -a + Math.PI / 2, true, 2); }
  for (let k = 0; k < 20; k++) { const a = (k + 0.5) / 20 * TAU; B(b, MATS.oldWood, x + Math.cos(a) * (r + 0.5), PT, z + Math.sin(a) * (r + 0.5), TAU * (r + 0.5) / 20 * 1.05, 1.1, 0.2, -a + Math.PI / 2, true); }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cyl(b, MATS.oldWood, x + sx * r * 0.6, PT, z + sz * r * 0.6, 0.12, 0.12, 3, 6, false);
  b.add(MATS.shingle, new THREE.ConeGeometry(r + 1.2, 2.2, 8), xform(x, PT + 4.1, z, Math.PI / 8));
  // iron brazier: tall and conductive, so lightning loves it
  b.add(MAT.metal, new THREE.CylinderGeometry(0.6, 0.3, 0.6, 10), xform(x, PT + 1.6, z)); b.add(MAT.metal, new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), xform(x, PT + 0.65, z));
  b.add(MAT.flame, new THREE.ConeGeometry(0.45, 1.0, 7), xform(x, PT + 2.3, z));
  TORCHES.push({ p: new THREE.Vector3(x, PT + 2.3, z), hearth: true });
  TOWER.top = new THREE.Vector3(x, PT + 3.2, z);
  for (let i = 0; i < 6; i++) torch(b, x + Math.cos(a0 + i * 2.6) * (rin - 0.05), G + 2.5 + i * 2.6, z + Math.sin(a0 + i * 2.6) * (rin - 0.05), -(a0 + i * 2.6) + Math.PI / 2 + Math.PI, true);
}
// ---------- oath-stone, palisade, plateau ----------
function plateauProps() {
  const b = BATCH.misc, G = PLATEAU.y;
  const stone = new THREE.BoxGeometry(1.6, 3.6, 0.6, 1, 4, 1); const sp = stone.attributes.position; for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); sp.setX(i, sp.getX(i) * (1 - (y + 1.8) * 0.12)); } stone.computeVertexNormals();
  const stoneY = terrainH(STONE.x, STONE.z);
  const sm = new THREE.Mesh(stone, MATS.runes); sm.position.set(STONE.x, stoneY + 1.7, STONE.z); sm.castShadow = true; scene.add(sm); STONE.mesh = sm; STONE.top = new THREE.Vector3(STONE.x, stoneY + 3.6, STONE.z);
  addCollider(STONE.x, STONE.z, 0.85, 0.35, 0, stoneY, stoneY + 3.6);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; B(b, MATS.stone, STONE.x + Math.cos(a) * 6, stoneY - 0.3, STONE.z + Math.sin(a) * 6, 0.8, 0.9, 0.8, a, true); }
  for (const [sx, sz] of [[-1, 1], [1, 1]]) postTorch(b, STONE.x + sx * 3.5, STONE.z + sz * 3.5);
  INTERACT.push({ id: 'offering', pos: new THREE.Vector3(STONE.x, stoneY, STONE.z + 1), r: 3, label: 'Make an offering at the oath-stone' });
  // palisade along the plateau's west edge with a gate at the stair head
  for (let z = PLATEAU.z0 + 4; z < PLATEAU.z1 - 2; z += 1.1) { if (Math.abs(z - 12) < 3) continue; const x = PLATEAU.x0 + 2, y = terrainH(x, z); B(b, MATS.oldWood, x, y - 0.5, z, 0.45, 3.4 + rand() * 0.6, 0.45, 0, true); }
  for (const s of [-1, 1]) postTorch(b, PLATEAU.x0 + 3.5, 12 + s * 2.6);
  for (const [x, z] of [[60, -12], [86, -12], [50, 20], [100, 10], [118, -20], [40, -50]]) postTorch(b, x, z);
  // Sigrid's tents (guests from the north)
  for (const [x, z] of [[104, -8], [110, 2], [96, 12]]) { const y = terrainH(x, z); b.add(MAT.cream, new THREE.ConeGeometry(2.6, 3.4, 8, 1, true), xform(x, y + 1.7, z)); addCollider(x, z, 1.8, 1.8, 0, y, y + 2.5); }
  for (let i = 0; i < 18; i++) TOWN_POINTS.push({ p: new THREE.Vector3(rr(40, 120), 0, rr(-15, 30)), zone: 'plateau' });
}
// ---------- terrace town ----------
function terraceTown() {
  const b = BATCH.town;
  const spots = [[-130, -16, 0], [-112, -18, 0], [-94, -17, 0], [-76, -18, 0], [-124, 16, Math.PI], [-104, 18, Math.PI], [-84, 17, Math.PI], [-60, 26, Math.PI], [-48, -18, 0]];
  for (const [x, z, rot] of spots) { const h = longhouse(b, x, z, rot, rr(11, 15), rr(6.5, 8), { roof: rand() < 0.75 ? MATS.thatch : MATS.shingle }); TOWN_POINTS.push({ p: h.doorOut.clone(), zone: 'terrace' }); }
  for (let x = -140; x <= -30; x += 6) for (const zz of [-5, 4]) TOWN_POINTS.push({ p: new THREE.Vector3(x + rr(-1.5, 1.5), 0, zz + rr(-1.5, 1.5)), zone: 'terrace' });
  // fish racks, wood piles, a well
  for (const [x, z] of [[-118, 2], [-70, 4]]) { const y = terrainH(x, z); for (const s of [-1, 1]) cyl(b, MATS.oldWood, x + s * 1.5, y, z, 0.07, 0.07, 2, 6, true); b.add(MATS.oldWood, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), xform(x, y + 1.9, z, 0, 0, Math.PI / 2)); for (let k = 0; k < 6; k++) b.add(MAT.metal, new THREE.BoxGeometry(0.08, 0.5, 0.18), xform(x - 1.2 + k * 0.5, y + 1.6, z)); }
  { const x = -96, z = 3, y = terrainH(x, z); cyl(b, MATS.stone, x, y, z, 1.1, 1.1, 0.9, 12, true); }
  for (let x = -136; x <= -36; x += 20) for (const s of [-1, 1]) postTorch(b, x, s * 8.5);
  for (let i = 0; i < 9; i++) { const x = rr(-140, -40), z = rr(-25, 40); if (Math.abs(z) < 9) continue; const y = terrainH(x, z); b.add(MAT.wood, new THREE.CylinderGeometry(0.38, 0.38, 1, 10), xform(x, y + 0.5, z)); addCollider(x, z, 0.36, 0.36, 0, y, y + 1); }
}
// ---------- stairways ----------
function stairways() {
  const b = BATCH.misc;
  for (const [x0, z0, y0, x1, z1, y1, w] of STAIRS) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil((y1 - y0) / 0.36), rot = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t), top = lerp(y0, y1, (i + 1) / n);
      B(b, MATS.plank, x, top - 0.3, z, w, 0.3, len / n + 0.06, rot, true, 1);
      if (i % 4 === 0) for (const s of [-1, 1]) { const [px, pz] = frame(x, z, rot)(s * (w / 2 + 0.1), 0); B(b, MATS.oldWood, px, top - 6, pz, 0.2, 7.1, 0.2, rot, false); }
    }
    for (const s of [-1, 1]) for (let i = 0; i < n; i += 2) { const t = (i + 0.5) / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t), top = lerp(y0, y1, (i + 1) / n); const [px, pz] = frame(x, z, rot)(s * (w / 2 + 0.05), 0); B(b, MATS.oldWood, px, top, pz, 0.1, 1.0, len / n * 2.1, rot, true); }
    for (const t of [0.02, 0.98]) for (const s of [-1, 1]) { const [px, pz] = frame(lerp(x0, x1, t), lerp(z0, z1, t), rot)(s * (w / 2 + 0.6), 0); postTorch(b, px, pz, lerp(y0, y1, t)); }
  }
}
// ---------- harbour, boathouse, piers, longships ----------
function harbor() {
  const b = BATCH.harbor, G = HARBOR.y;
  // boathouse: open to the water on the south side
  const { x, z, w, d } = BOATHOUSE, g = terrainH(x, z) + 0.2;
  B(b, MATS.plank, x, g - 0.2, z, w, 0.25, d, 0, false);
  B(b, MATS.oldWood, x, g, z - d / 2 + 0.2, w, 3.2, 0.35); B(b, MATS.oldWood, x - w / 2 + 0.2, g, z, 0.35, 3.2, d); B(b, MATS.oldWood, x + w / 2 - 0.2, g, z, 0.35, 3.2, d);
  B(b, MATS.oldWood, x - 4.5, g + 2.3, z - d / 2 + 0.2, 3, 0.9, 0.36, 0, true);
  roofSlabs(b, MATS.thatch, x, z, 0, w, d, g + 3.2, 4.2, 0.8);
  BOATHOUSE.g = g; BOATHOUSE.inside = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  for (const [cx, cz] of [[x - 5, z - 2], [x - 4, z + 1], [x + 5, z - 3], [x + 6, z + 2], [x + 1.5, z - 3.5]]) B(b, MAT.lightWood, cx, g, cz, 1.1, 1.1 + rand() * 0.5, 1.1, rand(), true);
  { const lx = x + 2, lz = z; b.add(MAT.lantern, new THREE.CylinderGeometry(0.13, 0.11, 0.3, 8), xform(lx, g + 2.8, lz)); TORCHES.push({ p: new THREE.Vector3(lx, g + 2.8, lz), interior: true }); }
  BOATHOUSE.meet = new THREE.Vector3(x + 1, g, z + 1); BOATHOUSE.merchant = new THREE.Vector3(x + 3, g, z + 1.5); BOATHOUSE.listen = new THREE.Vector3(x - 4.5, g, z - 2);
  // piers
  for (const px of [-132, -60]) { for (let pz = 110; pz < 150; pz += 2.2) { B(b, MATS.plank, px, SEA_Y + 1.1, pz, 3.2, 0.25, 2.3, 0, true); if (pz % 4.4 < 2.2) for (const s of [-1, 1]) cyl(b, MATS.oldWood, px + s * 1.6, SEA_Y - 3, pz, 0.15, 0.15, 4.4, 6, false); } postTorch(b, px + 1.4, 148, SEA_Y + 1.35); }
  for (let i = 0; i < 12; i++) { const hx = rr(HARBOR.x0 + 8, HARBOR.x1 - 8), hz = rr(HARBOR.z0 + 6, HARBOR.z1 - 10); if (Math.hypot(hx - x, hz - z) < 12) continue; HARBOR_POINTS.push(new THREE.Vector3(hx, terrainH(hx, hz), hz)); }
  for (const [hx, hz] of [[-150, 84], [-30, 86], [-130, 80]]) longhouse(b, hx, hz, 0, rr(8, 10), 6, { wallH: 2.3 });
  for (let i = 0; i < 14; i++) { const cx = rr(HARBOR.x0 + 6, HARBOR.x1 - 6), cz = rr(HARBOR.z0 + 6, HARBOR.z1 - 6); if (Math.hypot(cx - x, cz - z) < 11) continue; if (rand() < 0.5) { const y = terrainH(cx, cz); b.add(MAT.wood, new THREE.CylinderGeometry(0.38, 0.38, 1, 10), xform(cx, y + 0.5, cz)); addCollider(cx, cz, 0.36, 0.36, 0, y, y + 1); } else B(b, MAT.lightWood, cx, terrainH(cx, cz), cz, 0.9, 0.9, 0.9, rand(), true); }
  for (const hx of [-150, -110, -70, -40]) postTorch(b, hx, 104);
  // longships
  for (const [sx, sz, ry] of [[-146, 132, 0.05], [-96, 140, -0.1], [-46, 128, 0.12], [40, 190, 0.6], [-260, 230, -0.4]]) longship(sx, sz, ry);
}
const SHIPS = [];
function longship(x, z, ry) {
  const g = new THREE.Group(), Lh = 22, W = 4.6, D = 1.8, NU = 28, NV = 9, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) { const u = i / NU * 2 - 1, hw = W / 2 * Math.sqrt(Math.max(0.02, 1 - u * u)), sheer = 1.6 * Math.pow(Math.abs(u), 5); for (let j = 0; j <= NV; j++) { const a = j / NV * Math.PI, depth = D * Math.pow(1 - u * u, 0.35); pos.push(u * Lh / 2, -Math.sin(a) * depth + sheer, Math.cos(a) * hw); if (i < NU && j < NV) { const k = i * (NV + 1) + j; idx.push(k, k + NV + 1, k + 1, k + 1, k + NV + 1, k + NV + 2); } } }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setIndex(idx); hg.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2); for (let k = 0; k < pos.length / 3; k++) { uv[k * 2] = pos[k * 3] / 3; uv[k * 2 + 1] = pos[k * 3 + 2] / 3 + pos[k * 3 + 1] / 3; } hg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const hull = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ map: TEX.wood, color: 0x4a3324, roughness: 0.8, side: THREE.DoubleSide })); hull.castShadow = true; g.add(hull);
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.13, 6, 12, Math.PI * 1.2), MATS.carve); post.position.set(s * (Lh / 2 + 0.1), 1.9, 0); post.rotation.set(0, s > 0 ? 0 : Math.PI, 0.4); g.add(post); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 10, 8), MATS.oldWood); mast.position.y = 5; g.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), MATS.oldWood); yard.rotation.x = Math.PI / 2; yard.position.y = 8.8; g.add(yard);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 5, 6, 5), MATS.sail); sail.position.set(0.3, 6.3, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
  for (let k = -4; k <= 4; k++) for (const s of [-1, 1]) { const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), pick([MAT.red, MAT.cream, MAT.blue, MAT.green])); sh.position.set(k * 2, 0.95, s * (W / 2 * Math.sqrt(1 - Math.pow(k * 2 / (Lh / 2), 2)) + 0.03)); sh.rotation.y = s > 0 ? 0 : Math.PI; g.add(sh); }
  g.position.set(x, SEA_Y + 0.35, z); g.rotation.y = ry; scene.add(g);
  SHIPS.push({ g, sail, base: sail.geometry.attributes.position.array.slice(), ph: rand() * 10, y: SEA_Y + 0.35 });
  if (Math.abs(z) < 160) addCollider(x, z, Lh / 2, W / 2, ry, SEA_Y - 2, SEA_Y + 1.4);
}
function updateShips(t, wind) {
  for (const s of SHIPS) {
    s.g.position.y = s.y + Math.sin(t * 0.9 + s.ph) * 0.18; s.g.rotation.z = Math.sin(t * 0.7 + s.ph) * 0.03; s.g.rotation.x = Math.sin(t * 0.5 + s.ph) * 0.02;
    const p = s.sail.geometry.attributes.position, base = s.base; for (let i = 0; i < p.count; i++) { const y = base[i * 3 + 1], x = base[i * 3]; p.setZ(i, (1 - Math.abs(x) / 3.3) * (0.4 + 0.25 * Math.sin(t * 3 + y + s.ph)) * Math.min(1.2, wind.length() / 6) * (0.5 - y / 10)); }
    p.needsUpdate = true;
  }
}
// ---------- wolf-head camp in the west wood ----------
function wolfCamp() {
  const b = BATCH.misc, { x, z } = CAMP, y = terrainH(x, z);
  B(b, MATS.stone, x, y - 0.1, z, 1.6, 0.35, 1.6, 0, false); b.add(MAT.ember, new THREE.ConeGeometry(0.6, 0.4, 8), xform(x, y + 0.4, z)); b.add(MAT.flame, new THREE.ConeGeometry(0.45, 1.1, 7), xform(x, y + 0.9, z)); TORCHES.push({ p: new THREE.Vector3(x, y + 1, z), hearth: true });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4, tx = x + Math.cos(a) * 7, tz = z + Math.sin(a) * 7, ty = terrainH(tx, tz); b.add(MAT.rug, new THREE.ConeGeometry(1.8, 2.4, 6, 1, true), xform(tx, ty + 1.2, tz)); addCollider(tx, tz, 1.2, 1.2, 0, ty, ty + 2); }
  for (let i = 0; i < 6; i++) { const cx = x + rr(-9, 9), cz = z + rr(-9, 9); B(b, MAT.lightWood, cx, terrainH(cx, cz), cz, 0.9, 0.9, 0.9, rand(), true); }
  INTERACT.push({ id: 'camploot', pos: new THREE.Vector3(x + 3, y, z - 3), r: 2.5, label: 'Search the wolf-heads\' plunder' });
}
