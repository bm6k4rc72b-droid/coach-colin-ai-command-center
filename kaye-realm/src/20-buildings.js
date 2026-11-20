// ===== Buildings: town houses, plaza, bridge, pub, elven homes, castle =====
const TORCHES = [], SEATS = [], PERCHES = [], CAT_SPOTS = [], HOUSES = [], TOWN_POINTS = [], ELF_POINTS = [], INTERACT = [];
const BATCH = { town: new Batch('town'), castle: new Batch('castle'), keep: new Batch('keep'), forest: new Batch('forest'), misc: new Batch('misc') };

function B(b, mat, cx, y0, cz, sx, sy, sz, rot = 0, col = true, ts = 2) {
  b.add(mat, boxGeo(sx, sy, sz, ts), xform(cx, y0 + sy / 2, cz, rot));
  if (col) return addCollider(cx, cz, sx / 2, sz / 2, rot, y0, y0 + sy);
}
function solidCyl(x, z, r, y0, y1) { for (let k = 0; k < 6; k++) addCollider(x, z, r, r * 0.27, k * Math.PI / 6, y0, y1); }
function cyl(b, mat, x, y0, z, r0, r1, h, seg = 16, col = false, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open); scaleUV(g, Math.max(1, Math.round(TAU * Math.max(r0, r1) / 2.5)), Math.max(1, h / 2.5));
  b.add(mat, g, xform(x, y0 + h / 2, z)); if (col) solidCyl(x, z, Math.max(r0, r1), y0, y0 + h);
}
// frame helper: local coords in a rotated frame
function frame(cx, cz, rot) { const c = Math.cos(rot), s = Math.sin(rot); return (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]; }
function torch(b, x, y, z, rot, interior = false) { // wall sconce facing direction rot
  const fx = Math.sin(rot) * 0.25, fz = Math.cos(rot) * 0.25;
  B(b, MAT.metal, x, y - 0.5, z, 0.12, 0.3, 0.12, rot, false);
  b.add(MAT.darkWood, new THREE.CylinderGeometry(0.05, 0.04, 0.55, 6), xform(x + fx, y - 0.1, z + fz, rot, 0.35));
  b.add(MAT.flame, new THREE.ConeGeometry(0.09, 0.28, 7), xform(x + fx * 1.25, y + 0.28, z + fz * 1.25));
  TORCHES.push({ p: new THREE.Vector3(x + fx * 1.3, y + 0.3, z + fz * 1.3), interior });
}
function lantern(b, x, y, z) {
  B(b, MAT.metal, x, y + 0.36, z, 0.32, 0.05, 0.32, 0, false);
  b.add(MAT.lantern, new THREE.CylinderGeometry(0.13, 0.11, 0.34, 8), xform(x, y + 0.17, z));
  TORCHES.push({ p: new THREE.Vector3(x, y + 0.15, z), lantern: true });
}
function addSeat(x, y, z, rot, kind = 'chair') { const s = { p: new THREE.Vector3(x, y, z), rot, kind, taken: null }; SEATS.push(s); return s; }
function window2(b, L, rot, lx, lz, y, w = 1, h = 1.2, out = 1, shutters = null) { // decal window on a wall at local (lx,lz), facing local out (+1/-1 along normal) — both sides
  const [x, z] = L(lx, lz);
  B(b, MAT.timber, x, y - 0.08, z, w + 0.24, h + 0.16, 0.42, rot, false);
  for (const sgn of [1, -1]) { const [gx, gz] = L(lx, lz + sgn * 0.215); b.add(MAT.window, new THREE.PlaneGeometry(w, h), xform(gx, y + h / 2, gz, rot + (sgn > 0 ? 0 : Math.PI))); }
  if (shutters) for (const sx of [-1, 1]) { const [sx2, sz2] = L(lx + sx * (w / 2 + 0.32), lz + out * 0.22); B(b, shutters, sx2, y, sz2, 0.55, h, 0.06, rot, false); }
}
// side-wall windows (normal along local x)

// ---------- Furniture (each piece builds in its own frame: local +z = facing) ----------
function bed(b, L, rot, lx, lz, colorMat) {
  const [x, z] = L(lx, lz), F = frame(x, z, rot), g = b.__floor;
  B(b, MAT.darkWood, x, g, z, 1.5, 0.45, 2.2, rot);
  B(b, MAT.cream, x, g + 0.45, z, 1.4, 0.18, 2.1, rot, false);
  B(b, MAT.white, ...F(0, -0.8).flatMap((v, k) => (k === 0 ? [v, g + 0.63] : [v])), 1.1, 0.14, 0.4, rot, false);
  B(b, colorMat, ...F(0, 0.25).flatMap((v, k) => (k === 0 ? [v, g + 0.6] : [v])), 1.46, 0.06, 1.5, rot, false);
  B(b, MAT.darkWood, ...F(0, -1.08).flatMap((v, k) => (k === 0 ? [v, g] : [v])), 1.6, 1.1, 0.12, rot, false);
}
function table(b, L, rot, lx, lz, w = 1.4, d = 0.9, chairs = 2) {
  const [x, z] = L(lx, lz), F = frame(x, z, rot), g = b.__floor;
  B(b, MAT.wood, x, g + 0.72, z, w, 0.08, d, rot, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [lx2, lz2] = F(sx * (w / 2 - 0.08), sz * (d / 2 - 0.08)); B(b, MAT.darkWood, lx2, g, lz2, 0.08, 0.72, 0.08, rot, false); }
  addCollider(x, z, w / 2, d / 2, rot, g, g + 0.8);
  const seats = [];
  for (let i = 0; i < chairs; i++) {
    const side = i % 2 ? 1 : -1, clz = side * (d / 2 + 0.45), [cx, cz] = F(0, clz);
    B(b, MAT.wood, cx, g + 0.42, cz, 0.45, 0.06, 0.45, rot, false);
    for (const a of [-1, 1]) for (const c of [-1, 1]) { const [qx, qz] = F(a * 0.19, clz + c * 0.19); B(b, MAT.darkWood, qx, g, qz, 0.05, 0.42, 0.05, rot, false); }
    const [bx, bz] = F(0, clz + side * 0.2); B(b, MAT.wood, bx, g + 0.45, bz, 0.45, 0.55, 0.05, rot, false);
    seats.push(addSeat(cx, g + 0.48, cz, rot + (side > 0 ? Math.PI : 0)));
  }
  const [mx, mz] = F(0.2, 0); b.add(MAT.cream, new THREE.CylinderGeometry(0.12, 0.1, 0.03, 10), xform(mx, g + 0.81, mz));
  const [cx2, cz2] = F(-0.3, 0.1); b.add(MAT.lantern, new THREE.CylinderGeometry(0.035, 0.035, 0.18, 6), xform(cx2, g + 0.89, cz2));
  return seats;
}
function shelf(b, L, rot, lx, lz, w = 1.6) {
  const [x, z] = L(lx, lz), F = frame(x, z, rot), g = b.__floor;
  B(b, MAT.darkWood, x, g, z, w, 1.9, 0.4, rot);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
    const [bx, bz] = F(-w / 2 + 0.18 + i * (w - 0.3) / 5, 0.12), m = pick([MAT.red, MAT.blue, MAT.green, MAT.cream, MAT.glassBottle, MAT.glassAmber, MAT.purple]);
    if (rand() < 0.75) B(b, m, bx, g + 0.12 + r * 0.46, bz, 0.1 + rand() * 0.08, 0.26 + rand() * 0.1, 0.22, rot + rr(-0.1, 0.1), false);
  }
}
function fireplace(b, L, rot, lx, lz) {
  const [x, z] = L(lx, lz), F = frame(x, z, rot), g = b.__floor;
  B(b, MAT.stone, x, g, z, 1.9, 1.3, 0.7, rot);
  const [ix, iz] = F(0, 0.2); B(b, MAT.black, ix, g + 0.15, iz, 1.1, 0.8, 0.45, rot, false);
  const [ex, ez] = F(0, 0.3); b.add(MAT.ember, new THREE.BoxGeometry(0.7, 0.12, 0.25), xform(ex, g + 0.2, ez, rot));
  b.add(MAT.flame, new THREE.ConeGeometry(0.18, 0.45, 7), xform(ex, g + 0.45, ez));
  const [mx, mz] = F(0, -0.05); B(b, MAT.stone, mx, g + 1.3, mz, 1.2, 2.3, 0.5, rot, false);
  TORCHES.push({ p: new THREE.Vector3(ex, g + 0.6, ez), interior: true, hearth: true });
}
function rug(b, L, rot, lx, lz, w, d, m) { const [x, z] = L(lx, lz); B(b, m, x, b.__floor, z, w, 0.02, d, rot, false); }
function chest(b, L, rot, lx, lz) { const [x, z] = L(lx, lz), g = b.__floor; B(b, MAT.wood, x, g, z, 0.9, 0.55, 0.55, rot); B(b, MAT.gold, x, g + 0.4, z, 0.92, 0.06, 0.57, rot, false); }
function barrel(b, x, g, z, s = 1) { b.add(MAT.wood, new THREE.CylinderGeometry(0.38 * s, 0.38 * s, 1.0 * s, 12), xform(x, g + 0.5 * s, z)); b.add(MAT.metal, new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.06, 12, 1, true), xform(x, g + 0.25 * s, z)); b.add(MAT.metal, new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.06, 12, 1, true), xform(x, g + 0.75 * s, z)); addCollider(x, z, 0.36 * s, 0.36 * s, 0, g, g + s); }
function crate(b, x, g, z, s = 0.8, rot = 0) { B(b, MAT.lightWood, x, g, z, s, s, s, rot); }
function plant(b, x, g, z) { b.add(MAT.cobble, new THREE.CylinderGeometry(0.28, 0.2, 0.45, 10), xform(x, g + 0.22, z)); b.add(MAT.leaves, new THREE.IcosahedronGeometry(0.42, 1), xform(x, g + 0.75, z, 0, 0, 0, 1, 1.2, 1)); }

// ---------- Town house ----------
const WALLMATS = ['plasterCream', 'plasterWhite', 'plasterOchre', 'plasterRose', 'plasterSky'];
const ROOFMATS = ['roofRed', 'roofSlate', 'roofMoss', 'roofBrown', 'thatch', 'roofRed'];
function buildHouse(b, o) {
  const { x, z, rot, w, d } = o, L = frame(x, z, rot), t = 0.3, H = 3.6, door = 1.5, doorH = 2.5;
  let g0 = Infinity; for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { const [px, pz] = L(a * w / 2, c * d / 2); g0 = Math.min(g0, terrainH(px, pz)); }
  const g = g0 + 0.3; b.__floor = g + 0.02;
  const wall = MAT[o.wall], roof = MAT[o.roof];
  // foundation & floor
  B(b, MAT.stone, x, g0 - 1.2, z, w + 0.5, 1.5, d + 0.5, rot, false);
  addCollider(x, z, w / 2 + 0.25, d / 2 + 0.25, rot, g0 - 1.2, g);
  B(b, MAT.wood, x, g, z, w - 0.2, 0.02, d - 0.2, rot, false);
  const [sx0, sz0] = L(0, d / 2 + 0.75); B(b, MAT.stone, sx0, g0 - 0.6, sz0, 2.2, 0.75, 0.9, rot); // doorstep
  // walls
  const wy = g, top = g + H;
  const stoneBase = o.timber ? 0.9 : 0;
  const wallPiece = (lx, lz, sx, sz, y0, h) => { const [px, pz] = L(lx, lz); if (stoneBase && y0 === wy) { B(b, MAT.stone, px, y0, pz, sx + 0.02, stoneBase, sz + 0.02, rot, false); } B(b, wall, px, y0, pz, sx, h, sz, rot); };
  wallPiece(0, -d / 2 + t / 2, w, t, wy, H);
  wallPiece(-w / 2 + t / 2, 0, t, d - 2 * t, wy, H);
  wallPiece(w / 2 - t / 2, 0, t, d - 2 * t, wy, H);
  const sideW = (w - door) / 2;
  wallPiece(-w / 2 + sideW / 2, d / 2 - t / 2, sideW, t, wy, H);
  wallPiece(w / 2 - sideW / 2, d / 2 - t / 2, sideW, t, wy, H);
  { const [px, pz] = L(0, d / 2 - t / 2); B(b, wall, px, wy + doorH, pz, door, H - doorH, t, rot); }
  // door frame + open door
  { const [px, pz] = L(0, d / 2 + 0.02); B(b, MAT.timber, px, wy + doorH, pz, door + 0.3, 0.2, t + 0.1, rot, false); for (const s of [-1, 1]) { const [qx, qz] = L(s * (door / 2 + 0.08), d / 2); B(b, MAT.timber, qx, wy, qz, 0.16, doorH, t + 0.1, rot, false); } }
  { const [px, pz] = L(-door / 2 + 0.08, d / 2 - t - 0.6); B(b, MAT.darkWood, px, wy, pz, 0.08, doorH - 0.05, door - 0.1, rot, false); }
  // ceiling
  { B(b, MAT.wood, x, top, z, w, 0.22, d, rot); }
  // upper storey
  let roofBase = top + 0.22;
  if (o.floors === 2) {
    const ow = w + 0.4, od = d + 0.4, H2 = 3;
    B(b, MAT.timber, x, top, z, ow + 0.1, 0.25, od + 0.1, rot, false);
    B(b, wall, x, top + 0.25, z, ow, H2, od, rot, true);
    for (const s of [-1, 1]) for (const k of [-0.3, 0.3]) window2(b, L, rot, k * w, s * (od / 2 - 0.15), top + 1.1, 0.9, 1.1, s, null);
    roofBase = top + 0.25 + H2;
  }
  // timber framing on outside faces
  if (o.timber) {
    const hh = roofBase - wy, ww = o.floors === 2 ? w + 0.4 : w, dd = o.floors === 2 ? d + 0.4 : d;
    for (const s of [-1, 1]) {
      for (const lx of [-w / 2, -w / 4, w / 4, w / 2]) { if (Math.abs(lx) < door && s > 0 && Math.abs(lx) < 1) continue; const [px, pz] = L(lx, s * (d / 2 + 0.03)); B(b, MAT.timber, px, wy + stoneBase, pz, 0.18, H - stoneBase, 0.1, rot, false); }
      for (const y of [wy + stoneBase, wy + H - 0.2]) { const [px, pz] = L(0, s * (d / 2 + 0.03)); B(b, MAT.timber, px, y, pz, w, 0.18, 0.1, rot, false); }
      for (const lx of (s < 0 ? [-3 * w / 8, 3 * w / 8] : [])) { const [px, pz] = L(lx, s * (d / 2 + 0.04)); b.add(MAT.timber, boxGeo(0.16, Math.hypot(w / 4, H - stoneBase - 0.2), 0.1), xform(px, wy + stoneBase + (H - stoneBase) / 2, pz, rot, 0, (lx > 0 ? 1 : -1) * Math.atan2(w / 4, H - stoneBase - 0.2))); }
      // side faces
      const [qx, qz] = L(s * (w / 2 + 0.03), 0); B(b, MAT.timber, qx, wy + H - 0.2, qz, 0.1, 0.18, d, rot, false);
      for (const lz of [-d / 2, 0, d / 2]) { const [px, pz] = L(s * (w / 2 + 0.03), lz); B(b, MAT.timber, px, wy + stoneBase, pz, 0.1, H - stoneBase, 0.18, rot, false); }
      if (o.floors === 2) { const [px, pz] = L(0, s * (dd / 2 + 0.03)); B(b, MAT.timber, px, roofBase - 0.2, pz, ww, 0.2, 0.1, rot, false); for (const lx of [-ww / 2, -ww / 6, ww / 6, ww / 2]) { const [ax, az] = L(lx, s * (dd / 2 + 0.03)); B(b, MAT.timber, ax, top + 0.25, az, 0.18, 3, 0.1, rot, false); } }
    }
  }
  // windows (front + back + sides)
  const shut = pick([MAT.green, MAT.blue, MAT.red, MAT.darkWood]);
  for (const lx of [-w * 0.3, w * 0.3]) window2(b, L, rot, lx, d / 2 - t / 2, wy + 1.0, 1.0, 1.2, 1, shut);
  window2(b, L, rot, w * 0.18, -d / 2 + t / 2, wy + 1.0, 1.0, 1.2, -1, shut);
  for (const s of [-1, 1]) { const LL = frame(...L(s * (w / 2 - t / 2), 0), rot + Math.PI / 2); window2(b, LL, rot + Math.PI / 2, 0, 0, wy + 1.0, 0.9, 1.1, s, null); }
  // flower boxes under front windows
  for (const lx of [-w * 0.3, w * 0.3]) { const [px, pz] = L(lx, d / 2 + 0.25); B(b, MAT.wood, px, wy + 0.72, pz, 1.1, 0.25, 0.3, rot, false); for (let i = 0; i < 5; i++) { const [fx, fz] = L(lx - 0.4 + i * 0.2, d / 2 + 0.25); b.add(pick([MAT.flowerR, MAT.flowerY, MAT.flowerP, MAT.flowerW]), new THREE.IcosahedronGeometry(0.11, 0), xform(fx, wy + 1.05, fz)); } }
  // roof (gable along local x)
  const ow = (o.floors === 2 ? w + 0.4 : w) + 0.9, hd = (o.floors === 2 ? d + 0.4 : d) / 2 + 0.55, rise = hd * 0.95, pitch = Math.atan2(rise, hd), slab = Math.hypot(hd, rise);
  for (const s of [-1, 1]) { const [px, pz] = L(0, s * hd / 2); b.add(roof, boxGeo(ow, 0.24, slab + 0.1, 2.2), xform(px, roofBase + rise / 2 + 0.12, pz, rot, s * pitch)); }
  const gableD = (o.floors === 2 ? d + 0.4 : d);
  const shape = new THREE.Shape([new THREE.Vector2(-gableD / 2, 0), new THREE.Vector2(gableD / 2, 0), new THREE.Vector2(0, rise * (gableD / 2) / hd)]);
  const gg = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }); scaleUV(gg, 0.5, 0.5);
  for (const s of [-1, 1]) { const lx = s * ((o.floors === 2 ? w + 0.4 : w) / 2) - (s > 0 ? 0.3 : 0); const [px, pz] = L(lx, 0); b.add(wall, gg, xform(px, roofBase, pz, rot + Math.PI / 2)); }
  b.add(MAT.timber, boxGeo(ow + 0.1, 0.25, 0.3), xform(x, roofBase + rise + 0.12, z, rot));
  // chimney
  { const [px, pz] = L(w * 0.3, -hd * 0.45); B(b, MAT.stone, px, roofBase, pz, 0.8, rise + 1.4, 0.8, rot, false); }
  // perches for pigeons along the ridge
  for (const lx of [-ow * 0.32, 0, ow * 0.3]) { const [px, pz] = L(lx, 0); PERCHES.push(new THREE.Vector3(px, roofBase + rise + 0.25, pz)); }
  { const [px, pz] = L(w * 0.3, -hd * 0.45); PERCHES.push(new THREE.Vector3(px, roofBase + rise + 1.4, pz)); }
  if (o.pub) { const house = { x, z, rot, w, d, g, L }; return house; }
  // interior
  const bedM = pick([MAT.red, MAT.blue, MAT.green, MAT.purple]);
  bed(b, L, rot, -w / 2 + 1.1, -d / 2 + 1.5, bedM);
  chest(b, L, rot, -w / 2 + 1.1, -d / 2 + 3.1);
  const seats = table(b, L, rot + Math.PI / 2, w * 0.12, -0.2, 1.4, 0.9, 2);
  fireplace(b, L, rot - Math.PI / 2, w / 2 - t - 0.35, -d * 0.18);
  shelf(b, L, rot, w * 0.22, -d / 2 + t + 0.22, 1.6);
  rug(b, L, rot, 0, 0.6, w * 0.45, d * 0.35, pick([MAT.rug, MAT.rugBlue, MAT.carpet]));
  { const [px, pz] = L(0, 0.2); lanternHang(b, px, top - 0.05, pz); }
  barrel(b, ...L(w / 2 - 0.8, d / 2 - 0.9).flatMap((v, i) => i === 0 ? [v, g] : [v]), 0.8);
  // outside props
  if (rand() < 0.6) { const [px, pz] = L(w / 2 + 0.7, d / 2 - 0.5); barrel(b, px, terrainH(px, pz), pz, 0.9); }
  if (rand() < 0.5) { const [px, pz] = L(-w / 2 - 0.8, d / 2 - 1.2); crate(b, px, terrainH(px, pz), pz, 0.8, rot + 0.3); }
  { const [px, pz] = L(-door / 2 - 0.5, d / 2 + 0.25); lantern(b, px, wy + 2.3, pz); }
  // bench outside the front for townsfolk
  if (o.bench) { const [px, pz] = L(w * 0.3, d / 2 + 1.6), gy = terrainH(px, pz); B(b, MAT.wood, px, gy + 0.42, pz, 1.6, 0.08, 0.45, rot, false); B(b, MAT.darkWood, px, gy, pz, 1.4, 0.42, 0.3, rot); addSeat(px, gy + 0.5, pz, rot, 'bench'); }
  for (const s of [-1, 1]) { const [px, pz] = L(s * (w / 2 + 0.9), rr(-1, 1)); CAT_SPOTS.push(new THREE.Vector3(px, terrainH(px, pz), pz)); }
  const doorOut = new THREE.Vector3(...[L(0, d / 2 + 2.4)].map(([a, c]) => [a, g0, c])[0]);
  const doorIn = new THREE.Vector3(...[L(0, d / 2 - 1.2)].map(([a, c]) => [a, g, c])[0]);
  const house = { x, z, rot, w, d, g, seat: seats[0], doorOut, doorIn, name: o.name, L };
  HOUSES.push(house); return house;
}
function lanternHang(b, x, y, z) { b.add(MAT.metal, new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), xform(x, y - 0.25, z)); lantern(b, x, y - 0.95, z); }

// ---------- Town ----------
const RESIDENT_NAMES = [
  ['Mira Thornwick', 'baker'], ['Oswin Hale', 'blacksmith'], ['Bettany Reed', 'weaver'], ['Corwin Ashby', 'farmer'], ['Elsie Marsh', 'herbalist'], ['Gareth Penn', 'carpenter'],
  ['Hollis Grey', 'fisherman'], ['Ida Fennimore', 'seamstress'], ['Jasper Coil', 'cooper'], ['Kit Larkspur', 'shepherd'], ['Lottie Brambles', 'beekeeper'], ['Merrick Vane', 'scribe'],
  ['Nell Haverly', 'milkmaid'], ['Orrin Pike', 'potter'], ['Posy Wren', 'florist'], ['Quill Ambrose', 'cartographer'], ['Rosalyn Dew', 'midwife'], ['Silas Crump', 'miller'],
  ['Tilda Moss', 'innkeeper\'s sister'], ['Ulric Stone', 'mason'], ['Violet Ashdown', 'chandler'], ['Wendel Brook', 'tanner'], ['Yara Hollow', 'healer'], ['Abel Marchbank', 'fletcher'],
  ['Bree Tumble', 'juggler'], ['Cedric Lowe', 'tailor'], ['Delphine Oak', 'glassblower'], ['Edmund Rook', 'bell-ringer'], ['Fern Willoughby', 'gardener'], ['Gideon Flint', 'retired knight'],
];
function buildTown() {
  const b = BATCH.town;
  let k = 0;
  const ring = (n, r, off) => {
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * TAU + off, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const w = rr(8, 11.5), d = rr(7, 9.2);
      buildHouse(b, { x, z, rot: Math.atan2(-x, -z), w, d, floors: rand() < 0.45 ? 2 : 1, wall: pick(WALLMATS), roof: pick(ROOFMATS), timber: rand() < 0.65, bench: rand() < 0.5, name: RESIDENT_NAMES[k++][0] });
    }
  };
  ring(10, 43, 0); ring(20, 86, 0.0);
  // plaza fountain
  const gy = terrainH(0, 0);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; b.add(MAT.stone, boxGeo(1.75, 0.8, 0.6), xform(Math.cos(a) * 6.6, gy + 0.4, Math.sin(a) * 6.6, -a + Math.PI / 2)); addCollider(Math.cos(a) * 6.6, Math.sin(a) * 6.6, 0.9, 0.3, -a + Math.PI / 2, gy, gy + 0.8); }
  cyl(b, MAT.stone, 0, gy, 0, 0.8, 0.6, 3.2, 14, true); cyl(b, MAT.stone, 0, gy + 1.9, 0, 2.2, 1.6, 0.3, 20); cyl(b, MAT.stone, 0, gy + 3.2, 0, 1.0, 0.7, 0.25, 16);
  b.add(MAT.gold, new THREE.IcosahedronGeometry(0.35, 1), xform(0, gy + 3.7, 0));
  const fg = new THREE.CircleGeometry(6.3, 32); fg.rotateX(-Math.PI / 2); scaleUV(fg, 2, 2);
  const fw = new THREE.Mesh(fg, makeWaterMat(0x4f8f9a, [0.03, 0.01])); fw.position.set(0, gy + 0.6, 0); scene.add(fw);
  const fw2 = new THREE.Mesh(new THREE.CircleGeometry(2.0, 24).rotateX(-Math.PI / 2), fw.material); fw2.position.set(0, gy + 2.21, 0); scene.add(fw2);
  // benches around the fountain
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * TAU, x = Math.cos(a) * 11.5, z = Math.sin(a) * 11.5, rot = Math.atan2(-x, -z) + Math.PI;
    B(b, MAT.wood, x, gy + 0.42, z, 2.2, 0.08, 0.5, rot, false); B(b, MAT.darkWood, x, gy, z, 2.0, 0.42, 0.3, rot);
    const [bx, bz] = frame(x, z, rot)(0, 0.28); B(b, MAT.wood, bx, gy + 0.45, bz, 2.2, 0.5, 0.06, rot, false);
    for (const s of [-0.5, 0.5]) { const [sx, sz] = frame(x, z, rot)(s, -0.05); addSeat(sx, gy + 0.5, sz, rot + Math.PI, 'bench'); }
  }
  // market stalls
  const stallCols = [MAT.red, MAT.blue, MAT.green, MAT.purple, MAT.cream];
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) / 6 * TAU + 0.3, x = Math.cos(a) * 19, z = Math.sin(a) * 19, rot = Math.atan2(-x, -z), L = frame(x, z, rot);
    B(b, MAT.wood, x, gy, z, 3.2, 0.95, 1.2, rot);
    for (const sx of [-1.5, 1.5]) for (const sz of [-0.55, 0.55]) { const [px, pz] = L(sx, sz); B(b, MAT.darkWood, px, gy, pz, 0.12, 2.6, 0.12, rot, false); }
    const awn = stallCols[i % 5];
    const [ax, az] = L(0, 0.25); b.add(awn, boxGeo(3.6, 0.08, 2.0), xform(ax, gy + 2.6, az, rot, 0.28));
    for (let j = 0; j < 7; j++) { const [px, pz] = L(-1.3 + j * 0.43, -0.2 + rr(-0.2, 0.2)); b.add(pick([MAT.flowerR, MAT.flowerY, MAT.green, MAT.glassAmber]), new THREE.IcosahedronGeometry(0.13, 1), xform(px, gy + 1.05, pz)); }
    crate(b, ...L(1.9, 0.2).flatMap((v, k2) => (k2 === 0 ? [v, gy] : [v])), 0.6, rot);
    TOWN_POINTS.push(new THREE.Vector3(...L(0, 1.8).flatMap((v, k2) => (k2 === 0 ? [v, gy] : [v]))));
  }
  // lamp posts along the roads
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + 0.1, r = i % 2 ? 66 : 30, x = Math.cos(a) * (r + 3.4), z = Math.sin(a) * (r + 3.4), y = terrainH(x, z);
    cyl(b, MAT.darkWood, x, y, z, 0.12, 0.09, 3.4, 8, true); B(b, MAT.metal, x, y + 3.3, z, 0.5, 0.06, 0.06, 0, false); lantern(b, x, y + 2.75, z);
  }
  // well
  { const x = 30, z = -14, y = terrainH(x, z); cyl(b, MAT.stone, x, y, z, 1.3, 1.3, 0.9, 16, true); for (const s of [-1, 1]) B(b, MAT.darkWood, x + s * 1.1, y + 0.9, z, 0.15, 1.6, 0.15, 0, false); B(b, MAT.roofRed, x, y + 2.5, z, 2.8, 0.15, 1.6, 0, false); }
  // town walking points: plaza ring, roads
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 26 : 15; TOWN_POINTS.push(new THREE.Vector3(Math.cos(a) * r, gy, Math.sin(a) * r)); }
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, r = i % 2 ? 66 : 30; const x = Math.cos(a) * r, z = Math.sin(a) * r; TOWN_POINTS.push(new THREE.Vector3(x, terrainH(x, z), z)); }
  // signpost to the castle and the mountains
  { const x = 112, z = 9, y = terrainH(x, z); B(b, MAT.darkWood, x, y, z, 0.18, 2.6, 0.18); B(b, MAT.wood, x - 0.6, y + 2.1, z, 1.2, 0.3, 0.06, 0, false); B(b, MAT.wood, x + 0.6, y + 1.7, z, 1.2, 0.3, 0.06, 0, false); }
}

// ---------- Bridge ----------
function buildBridge() {
  const b = BATCH.misc, x0 = 133, x1 = 199, zc = -1.2, n = 33;
  const y0 = terrainH(x0, zc) + 0.15, y1 = terrainH(x1, zc) + 0.15;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t) + 2.6 * Math.sin(Math.PI * t), len = (x1 - x0) / n + 0.05;
    B(b, MAT.cobble, x, y - 0.9, zc, len, 0.9, 6, 0, true, 2);
    for (const s of [-1, 1]) B(b, MAT.stone, x, y, zc + s * 3.2, len, 1.0, 0.5, 0, true);
  }
  // arches & piers
  for (const t of [0.3, 0.5, 0.7]) { const x = lerp(x0, x1, t), y = lerp(y0, y1, t) + 2.6 * Math.sin(Math.PI * t); B(b, MAT.stone, x, -2, zc, 2.6, y - 2 + 1.1, 6.8, 0, true); }
  for (const t of [0.05, 0.95]) { const x = lerp(x0, x1, t), y = lerp(y0, y1, t); for (const s of [-1, 1]) { cyl(b, MAT.stone, x, y, zc + s * 3.2, 0.45, 0.4, 1.6, 10, true); lantern(b, x, y + 1.6, zc + s * 3.2); } }
}

// ---------- The Gilded Acorn pub ----------
function buildPub() {
  const b = BATCH.forest, x = PUB.x, z = PUB.z, rot = Math.PI, w = 18, d = 14;
  const h = buildHouse(b, { x, z, rot, w, d, floors: 2, wall: 'plasterCream', roof: 'roofMoss', timber: true, bench: false, pub: true, name: 'The Gilded Acorn' });
  const L = frame(x, z, rot), g = h.g + 0.02; b.__floor = g;
  // bar counter along the back with shelves of bottles
  const [cx, cz] = L(-1, -d / 2 + 3.2); B(b, MAT.darkWood, cx, g, cz, 9, 1.1, 0.8, rot); B(b, MAT.wood, cx, g + 1.1, cz, 9.3, 0.08, 1.0, rot, false);
  for (let i = 0; i < 5; i++) { const [sx, sz] = L(-4.5 + i * 2, -d / 2 + 4.3); cyl(b, MAT.darkWood, sx, g, sz, 0.22, 0.22, 0.75, 10); addSeat(sx, g + 0.78, sz, rot + Math.PI, 'stool'); }
  for (let r = 0; r < 3; r++) { const [sx, sz] = L(-1, -d / 2 + 0.55); B(b, MAT.darkWood, sx, g + 1.3 + r * 0.6, sz, 8, 0.06, 0.4, rot, false); for (let i = 0; i < 18; i++) { const [bx, bz] = L(-4.8 + i * 0.45, -d / 2 + 0.55); b.add(pick([MAT.glassBottle, MAT.glassAmber, MAT.glassBlue]), new THREE.CylinderGeometry(0.06, 0.08, 0.32, 8), xform(bx, g + 1.52 + r * 0.6, bz)); } }
  for (let i = 0; i < 4; i++) { const [bx, bz] = L(4.6 + (i % 2) * 0.9, -d / 2 + 1 + Math.floor(i / 2) * 0.9); barrel(b, bx, g, bz, 0.9); }
  // round tables with stools
  const tables = [[-5, 1.2], [-1, 2.8], [3.5, 1], [-4.6, 4.6], [1.6, 5]];
  for (const [lx, lz] of tables) {
    const [tx, tz] = L(lx, lz); cyl(b, MAT.wood, tx, g + 0.75, tz, 0.75, 0.75, 0.08, 18); cyl(b, MAT.darkWood, tx, g, tz, 0.12, 0.12, 0.75, 8); addCollider(tx, tz, 0.6, 0.6, 0, g, g + 0.83);
    b.add(MAT.lantern, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), xform(tx, g + 0.89, tz));
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4, sx = tx + Math.cos(a) * 1.15, sz = tz + Math.sin(a) * 1.15; cyl(b, MAT.wood, sx, g, sz, 0.22, 0.2, 0.46, 10); addSeat(sx, g + 0.48, sz, Math.atan2(tx - sx, tz - sz), 'stool'); }
  }
  // chandeliers, plants, paintings, rugs
  for (const lx of [-4, 3]) { const [px, pz] = L(lx, 2.5); cyl(b, MAT.darkWood, px, g + 2.9, pz, 0.9, 0.9, 0.1, 16, false, true); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; b.add(MAT.lantern, new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), xform(px + Math.cos(a) * 0.9, g + 3.08, pz + Math.sin(a) * 0.9)); } TORCHES.push({ p: new THREE.Vector3(px, g + 2.9, pz), interior: true }); }
  for (const [lx, lz] of [[-8, 5.5], [8, 5.5], [-8, -2], [7.8, 2.5]]) plant(b, ...L(lx, lz).flatMap((v, k) => (k === 0 ? [v, g] : [v])));
  for (const lx of [-6, -2, 2]) { const [px, pz] = L(lx, -d / 2 + 0.32); B(b, MAT.gold, px, g + 2.2, pz, 1.2, 0.9, 0.05, rot, false); B(b, pick([MAT.blue, MAT.green, MAT.red]), px, g + 2.3, pz - 0.0, 1.0, 0.7, 0.07, rot, false); }
  rug(b, L, rot, -2, 3, 6, 3, MAT.carpet);
  // sign + porch lanterns + outdoor tables
  const [sx, sz] = L(0, d / 2 + 0.4); b.add(MAT.sign, new THREE.PlaneGeometry(4, 1.5), xform(sx, h.g + 4.6, sz, rot)); b.add(MAT.sign, new THREE.PlaneGeometry(4, 1.5), xform(sx, h.g + 4.6, sz + 0.02 * Math.cos(rot), rot + Math.PI));
  for (const lx of [-5, 5]) { const [px, pz] = L(lx, d / 2 + 3.5); const gy = terrainH(px, pz); cyl(b, MAT.wood, px, gy + 0.75, pz, 0.7, 0.7, 0.07, 16); cyl(b, MAT.darkWood, px, gy, pz, 0.1, 0.1, 0.75, 8); addCollider(px, pz, 0.55, 0.55, 0, gy, gy + 0.82); }
  const [bx, bz] = L(0, -d / 2 + 2.2);
  PUB.bartenderSpot = new THREE.Vector3(bx, g, bz); PUB.rot = rot;
}

// ---------- Elven homes ----------
function buildElvenHomes() {
  const b = BATCH.forest;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.5, x = ELVES.x + Math.cos(a) * 34, z = ELVES.z + Math.sin(a) * 34, r = 4.6, gy = terrainH(x, z) + 0.25, doorA = Math.atan2(ELVES.z - z, ELVES.x - x);
    B(b, MAT.stone, x, gy - 1, z, r * 2 + 0.6, 1.0, r * 2 + 0.6, 0, false); cyl(b, MAT.wood, x, gy - 0.02, z, r, r, 0.04, 24);
    addCollider(x, z, r, r, 0, gy - 1, gy);
    const segs = 22;
    for (let k = 0; k < segs; k++) {
      const sa = (k + 0.5) / segs * TAU, wx = x + Math.cos(sa) * r, wz = z + Math.sin(sa) * r, rot = -sa + Math.PI / 2, len = TAU * r / segs * 1.04;
      const isDoor = Math.abs(angDiff(sa, doorA)) < 0.3;
      if (isDoor) { B(b, MAT.lightWood, wx, gy + 2.3, wz, len, 0.9, 0.35, rot); continue; }
      B(b, MAT.lightWood, wx, gy, wz, len, 3.2, 0.35, rot);
      if (k % 4 === 1) { for (const sgn of [1, -1]) b.add(MAT.window, new THREE.CircleGeometry(0.45, 16), xform(x + Math.cos(sa) * (r + sgn * 0.19), gy + 1.7, z + Math.sin(sa) * (r + sgn * 0.19), rot + (sgn > 0 ? 0 : Math.PI))); }
    }
    // living-tree pillars and leafy curled roof
    for (let k = 0; k < 6; k++) { const sa = k / 6 * TAU + 0.2; if (Math.abs(angDiff(sa, doorA)) < 0.4) continue; b.add(MAT.bark, new THREE.CylinderGeometry(0.22, 0.32, 3.4, 8), xform(x + Math.cos(sa) * (r + 0.3), gy + 1.7, z + Math.sin(sa) * (r + 0.3))); }
    b.add(MAT.elfRoof, new THREE.ConeGeometry(r + 1.6, 4.2, 24, 3), xform(x, gy + 5.1, z));
    b.add(MAT.elfRoof, new THREE.ConeGeometry(1.2, 2.6, 12), xform(x + 0.3, gy + 7.8, z, 0, 0.25));
    b.add(MAT.gold, new THREE.IcosahedronGeometry(0.18, 1), xform(x + 0.6, gy + 9.0, z));
    addCollider(x, z, r, r, 0, gy + 3.2, gy + 3.4);
    // interior
    b.__floor = gy;
    const L = frame(x, z, Math.atan2(ELVES.x - x, ELVES.z - z));
    bed(b, L, Math.atan2(ELVES.x - x, ELVES.z - z), -2.0, -1.4, MAT.green);
    shelf(b, L, Math.atan2(ELVES.x - x, ELVES.z - z), 1.4, -3.4, 1.4);
    rug(b, L, 0, 0.3, 0.5, 2.6, 2.6, MAT.rugBlue);
    plant(b, ...L(2.6, 1.2).flatMap((v, k2) => (k2 === 0 ? [v, gy] : [v])));
    lanternHang(b, x, gy + 3.1, z);
    // lantern post outside
    const px = x + Math.cos(doorA) * (r + 2.2) + Math.cos(doorA + 1.57) * 1.6, pz = z + Math.sin(doorA) * (r + 2.2) + Math.sin(doorA + 1.57) * 1.6, py = terrainH(px, pz);
    cyl(b, MAT.bark, px, py, pz, 0.1, 0.08, 2.6, 8, true); lantern(b, px + 0.3, py + 2.0, pz);
    ELF_POINTS.push(new THREE.Vector3(x + Math.cos(doorA) * (r + 3), 0, z + Math.sin(doorA) * (r + 3)));
  }
  // logs to sit on around a fire in the clearing
  const fx = ELVES.x - 10, fz = ELVES.z - 8, fy = terrainH(fx, fz);
  cyl(b, MAT.stone, fx, fy, fz, 1.1, 1.1, 0.3, 12); b.add(MAT.ember, new THREE.ConeGeometry(0.6, 0.5, 8), xform(fx, fy + 0.4, fz)); b.add(MAT.flame, new THREE.ConeGeometry(0.4, 1.0, 7), xform(fx, fy + 0.9, fz)); TORCHES.push({ p: new THREE.Vector3(fx, fy + 1, fz), hearth: true });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.3, lx = fx + Math.cos(a) * 3.4, lz = fz + Math.sin(a) * 3.4; b.add(MAT.bark, new THREE.CylinderGeometry(0.3, 0.3, 2.4, 10), xform(lx, fy + 0.3, lz, -a, 0, Math.PI / 2)); addCollider(lx, lz, 0.3, 1.2, -a + Math.PI / 2, fy, fy + 0.45); addSeat(lx, fy + 0.6, lz, Math.atan2(fx - lx, fz - lz), 'log'); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ELF_POINTS.push(new THREE.Vector3(ELVES.x + Math.cos(a) * 18, 0, ELVES.z + Math.sin(a) * 18)); }
  for (const p of ELF_POINTS) p.y = terrainH(p.x, p.z);
}

// ---------- Castle Aurelion ----------
const CASTLE_PTS = { guard: [], garden: [], servant: [] };
function buildCastle() {
  const b = BATCH.castle, G = CASTLE.y, WH = 16, T = 4;
  const { x0, x1, z0, z1 } = CASTLE;
  const wallRun = (ax, az, bx, bz, skip) => { // straight curtain wall with merlons, optional gap [s0,s1] along t
    const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az) + Math.PI / 2, ux = (bx - ax) / len, uz = (bz - az) / len;
    const pieces = skip ? [[0, skip[0]], [skip[1], len]] : [[0, len]];
    for (const [s0, s1] of pieces) { const cx = ax + ux * (s0 + s1) / 2, cz = az + uz * (s0 + s1) / 2; B(b, MAT.castle, cx, G - 2, cz, s1 - s0, WH + 2, T, rot, true, 3); }
    if (skip) { const cx = ax + ux * (skip[0] + skip[1]) / 2, cz = az + uz * (skip[0] + skip[1]) / 2; B(b, MAT.castle, cx, G + 10, cz, skip[1] - skip[0], WH - 10, T, rot, true, 3); }
    for (let s = 1.5; s < len - 1; s += 3) for (const side of [-1, 1]) { const cx = ax + ux * s - uz * side * (T / 2 - 0.4), cz = az + uz * s + ux * side * (T / 2 - 0.4); b.add(MAT.castle, boxGeo(1.6, 1.4, 0.8), xform(cx, G + WH + 0.7, cz, rot)); }
  };
  wallRun(x0, z0, x1, z0); wallRun(x0, z1, x1, z1); wallRun(x0, z0, x0, z1); wallRun(x1, z0, x1, z1, [124, 136]);
  // corner towers
  const roundTower = (x, z, r, h, roofMat = MAT.roofSlate) => {
    cyl(b, MAT.castle, x, G - 2, z, r, r, h + 2, 28, true);
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; b.add(MAT.castle, boxGeo(1.5, 1.5, 1), xform(x + Math.cos(a) * (r + 0.2), G + h + 0.75, z + Math.sin(a) * (r + 0.2), -a + Math.PI / 2)); }
    b.add(roofMat, new THREE.ConeGeometry(r + 1.2, r * 1.8, 28), xform(x, G + h + 1.5 + r * 0.9, z));
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; window2(b, frame(x + Math.cos(a) * (r - 0.15), z + Math.sin(a) * (r - 0.15), -a + Math.PI / 2), -a + Math.PI / 2, 0, 0, G + h * 0.6, 0.8, 1.6); }
    BANNER_POLES.push(new THREE.Vector3(x, G + h + 1.5 + r * 1.8, z));
  };
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) roundTower(x, z, 10, 24);
  for (const s of [-1, 1]) roundTower(x1, s * 13.5, 6, 22);
  // portcullis (raised) and open gate doors
  B(b, MAT.metal, x1, G + 9.2, 0, 1, 1.2, 12, 0, false);
  for (const s of [-1, 1]) B(b, MAT.darkWood, x1 - 3.2, G, s * 6.6, 6, 9, 0.4, Math.PI / 2 * 0 + s * 0.15, false);
  // banners on the curtain wall facing the road and courtyard
  for (const s of [-1, 1]) for (const zz of [22, 50, 90]) { addBanner(b, x1 + T / 2 + 0.05, G + 13, s * zz, Math.PI / 2); addBanner(b, x1 - T / 2 - 0.05, G + 13, s * zz, -Math.PI / 2); }
  // torches by the gate
  for (const s of [-1, 1]) { torch(b, x1 + T / 2 + 0.05, G + 4, s * 8, Math.PI / 2); torch(b, x1 - T / 2 - 0.05, G + 4, s * 8, -Math.PI / 2); }
  // courtyard gardens
  for (const s of [-1, 1]) {
    for (let x = -428; x < -332; x += 12) { if (Math.abs(x + 380) < 12) continue; B(b, MAT.hedge, x + 4.5, G, s * 6.5, 9, 1.3, 1.1, 0, true, 1.5); }
    for (const bx of [-410, -350]) for (const bz of [26, 60, 95]) {
      const cz = s * bz; B(b, MAT.stone, bx, G, cz, 22, 0.45, 14, 0, false); B(b, MAT.hedge, bx, G, cz, 22.4, 0.7, 0.6, 0, false);
      for (let k = 0; k < 90; k++) b.add(pick([MAT.flowerR, MAT.flowerY, MAT.flowerW, MAT.flowerP]), new THREE.IcosahedronGeometry(rr(0.14, 0.24), 0), xform(bx + rr(-10, 10), G + 0.55, cz + rr(-6.3, 6.3)));
      for (let k = 0; k < 14; k++) b.add(MAT.hedge, new THREE.IcosahedronGeometry(rr(0.4, 0.7), 1), xform(bx + rr(-10, 10), G + 0.6, cz + rr(-6, 6)));
      CASTLE_PTS.garden.push(new THREE.Vector3(bx + rr(-6, 6), G, cz - s * 7.6));
    }
  }
  // courtyard fountain
  for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; b.add(MAT.castle, boxGeo(1.7, 0.8, 0.7), xform(-380 + Math.cos(a) * 7.5, G + 0.4, Math.sin(a) * 7.5, -a + Math.PI / 2)); addCollider(-380 + Math.cos(a) * 7.5, Math.sin(a) * 7.5, 0.85, 0.35, -a + Math.PI / 2, G, G + 0.8); }
  cyl(b, MAT.castle, -380, G, 0, 1, 0.8, 4, 16, true); cyl(b, MAT.castle, -380, G + 2.4, 0, 2.6, 2, 0.35, 22); b.add(MAT.gold, new THREE.ConeGeometry(0.5, 1.4, 12), xform(-380, G + 4.7, 0));
  const fw = new THREE.Mesh(new THREE.CircleGeometry(7.1, 32).rotateX(-Math.PI / 2), makeWaterMat(0x4f8f9a, [0.02, 0.02])); fw.position.set(-380, G + 0.6, 0); scene.add(fw);
  for (const s of [-1, 1]) for (const xx of [-400, -360]) { const x = xx, z = s * 11; B(b, MAT.wood, x, G + 0.42, z, 2.2, 0.08, 0.5, 0, false); B(b, MAT.darkWood, x, G, z, 2, 0.42, 0.3, 0); for (const o of [-0.5, 0.5]) addSeat(x + o, G + 0.5, z, s > 0 ? Math.PI : 0, 'bench'); }
  for (const s of [-1, 1]) for (const xx of [-430, -405, -355, -335]) CASTLE_PTS.guard.push(new THREE.Vector3(xx, G, s * 3));
  buildKeep(); buildTower();
}
const BANNER_POLES = [], BANNERS = [];
function addBanner(b, x, y, z, rot, w = 2.2, h = 4.4) {
  const g = new THREE.PlaneGeometry(w, h, 1, 6); const m = new THREE.Mesh(g, MAT.banner);
  m.position.set(x + Math.sin(rot) * 0.06, y - h / 2, z + Math.cos(rot) * 0.06); m.rotation.y = rot; m.castShadow = true; scene.add(m);
  BANNERS.push({ m, base: g.attributes.position.array.slice(), ph: rand() * 10 });
  b.add(MAT.gold, new THREE.CylinderGeometry(0.06, 0.06, w + 0.4, 6), xform(x + Math.sin(rot) * 0.1, y, z + Math.cos(rot) * 0.1, rot, 0, Math.PI / 2));
}
function buildKeep() {
  const b = BATCH.keep, G = CASTLE.y, { x0, x1, z0, z1 } = KEEP, T = 1.5, FH = 8, H = 16;
  // outer walls
  B(b, MAT.castle, x0 + T / 2, G - 1, 0, T, H + 1, z1 - z0, 0, true, 3);
  B(b, MAT.castle, (x0 + x1) / 2, G - 1, z1 - T / 2, x1 - x0, H + 1, T, 0, true, 3);
  B(b, MAT.castle, (x0 + x1) / 2, G - 1, z0 + T / 2, x1 - x0, H + 1, T, 0, true, 3);
  B(b, MAT.castle, x1 - T / 2, G - 1, (z0 - 4) / 2, T, H + 1, -4 - z0, 0, true, 3);
  B(b, MAT.castle, x1 - T / 2, G - 1, (z1 + 4) / 2, T, H + 1, z1 - 4, 0, true, 3);
  B(b, MAT.castle, x1 - T / 2, G + 7, 0, T, H - 7, 8, 0, true, 3);
  B(b, MAT.castleDark, x1 + 0.2, G + 7, 0, 0.6, 0.6, 9, 0, false);
  // floor of the keep
  B(b, MAT.cobble, (x0 + x1) / 2, G - 0.5, 0, x1 - x0 - 2, 0.52, z1 - z0 - 2, 0, false, 3);
  // crenellated roof + turrets
  B(b, MAT.castleDark, (x0 + x1) / 2, G + H - 0.4, 0, x1 - x0, 0.6, z1 - z0, 0, true, 4);
  for (let x = x0 + 1.5; x < x1; x += 3) for (const s of [-1, 1]) b.add(MAT.castle, boxGeo(1.5, 1.4, 1), xform(x, G + H + 0.9, s * (z1 - 0.5)));
  for (let z = z0 + 1.5; z < z1; z += 3) for (const xx of [x0 + 0.5, x1 - 0.5]) b.add(MAT.castle, boxGeo(1, 1.4, 1.5), xform(xx, G + H + 0.9, z));
  for (const xx of [x0, x1]) for (const zz of [z0, z1]) { cyl(b, MAT.castle, xx, G, zz, 4, 4, H + 6, 20); b.add(MAT.roofSlate, new THREE.ConeGeometry(5, 9, 20), xform(xx, G + H + 10.5, zz)); BANNER_POLES.push(new THREE.Vector3(xx, G + H + 15, zz)); }
  // great hall raised roof
  for (const s of [-1, 1]) b.add(MAT.roofSlate, boxGeo(x1 - x0 - 6, 0.5, 18.4, 3), xform((x0 + x1) / 2, G + H + 3.6, s * 7.6, 0, s * 0.42));
  for (const xx of [x0 + 3.2, x1 - 3.2]) { const sh = new THREE.Shape([new THREE.Vector2(-15, 0), new THREE.Vector2(15, 0), new THREE.Vector2(0, 7.2)]); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }); scaleUV(g, 0.33, 0.33); b.add(MAT.castle, g, xform(xx, G + H, 0, Math.PI / 2)); }
  // exterior windows
  for (const fl of [0, 1]) {
    for (let x = x0 + 8; x < x1 - 4; x += 10) for (const s of [-1, 1]) window2(b, frame(x, s * (z1 - T / 2), 0), 0, 0, 0, G + 2.5 + fl * FH, 1.2, 2.6);
    for (let z = z0 + 8; z < z1 - 4; z += 10) window2(b, frame(x0 + T / 2, z, Math.PI / 2), Math.PI / 2, 0, 0, G + 2.5 + fl * FH, 1.2, 2.6);
  }
  for (const s of [-1, 1]) addBanner(b, x1 + 0.1, G + 13, s * 9, Math.PI / 2, 3, 6);
  for (const s of [-1, 1]) { torch(b, x1 + 0.05, G + 4, s * 5.5, Math.PI / 2); }
  // great hall inner walls at z = ±14 with doorways
  const doors1 = [-460, -490, -520, -550];
  const wallX = (z, y0, h, th, doors, dw, dh, mat = MAT.castle) => { // wall along x from x0+T to x1-T at z
    let cur = x0 + T; const ds = [...doors].sort((a, c) => a - c);
    for (const dx of ds) { const a = dx - dw / 2; if (a > cur) B(b, mat, (cur + a) / 2, y0, z, a - cur, h, th, 0, true, 3); B(b, mat, dx, y0 + dh, z, dw, h - dh, th, 0, true, 3); cur = dx + dw / 2; }
    if (x1 - T > cur) B(b, mat, (cur + x1 - T) / 2, y0, z, x1 - T - cur, h, th, 0, true, 3);
  };
  const wallZ = (x, za, zb, y0, h, th, mat = MAT.castle) => B(b, mat, x, y0, (za + zb) / 2, th, h, Math.abs(zb - za), 0, true, 3);
  for (const s of [-1, 1]) {
    wallX(s * 14, G, H - 0.4, 1, doors1, 3, 4.5);
    for (const fl of [0, 1]) {
      const y0 = G + fl * FH, hh = FH - 0.5;
      wallX(s * 20, y0, hh, 0.8, [-463, -485, -515, -545, -569], 2.2, 3.1, MAT.castleDark);
      for (const px of [-470, -500, -530, -560]) wallZ(px, s * 20.4, s * (z1 - T), y0, hh, 0.8, MAT.castleDark);
    }
    // second floor slab with stairwell hole
    const ys = G + FH - 0.5;
    B(b, MAT.wood, (x0 + T + x1 - T) / 2, ys, s * (20 + (z1 - T - 20) / 2), x1 - x0 - 2 * T, 0.5, z1 - T - 20, 0, true, 3);
    B(b, MAT.wood, (x0 + T - 456.3) / 2, ys, s * 17, -456.3 - (x0 + T), 0.5, 6, 0, true, 3);
    B(b, MAT.wood, (-456.3 + x1 - T) / 2, ys, s * 15.75, x1 - T + 456.3, 0.5, 2.5, 0, true, 3);
    // stairs: walkway z in [14.5,17] at ground, stairs z in [17,19.6] rising westward
    for (let i = 0; i < 20; i++) { const top = G + 0.4 * (i + 1), x = -444.6 - i * 0.6; B(b, MAT.castleDark, x, G, s * 18.3, 0.62, top - G, 2.6, 0, true, 1); }
    // corridor torches & carpets
    for (const fl of [0, 1]) {
      for (let x = -465; x > x0; x -= 15) torch(b, x, G + fl * FH + 3.2, s * 19.55, s > 0 ? Math.PI : 0, true);
      B(b, MAT.carpet, (x0 + x1) / 2 - 8, G + fl * FH + 0.01, s * 17.3, 110, 0.02, 2.2, 0, false);
    }
    // furnished rooms
    const roomXs = [[-441.5, -470], [-470, -500], [-500, -530], [-530, -560], [-560, -578.5]];
    const kinds = s > 0 ? [['bed', 'bed'], ['library', 'study'], ['kitchen', 'bed'], ['armory', 'bed'], ['store', 'library']] : [['bed', 'bed'], ['study', 'library'], ['bed', 'kitchen'], ['armory', 'study'], ['store', 'bed']];
    roomXs.forEach(([ra, rb], ri) => {
      for (const fl of [0, 1]) {
        const cx = (ra + rb) / 2, cz = s * ((20.4 + z1 - T) / 2), y = G + fl * FH, kind = kinds[ri][fl];
        b.__floor = y + 0.01;
        const L = frame(cx, cz, s > 0 ? Math.PI : 0), rot = s > 0 ? Math.PI : 0;
        furnishRoom(b, L, rot, kind, Math.abs(rb - ra), 23);
        torch(b, cx, y + 3.2, s * (z1 - T - 0.05), s > 0 ? Math.PI : 0, true);
        if (fl === 0) CASTLE_PTS.servant.push(new THREE.Vector3(cx, y, s * 17));
      }
    });
  }
  // pillars, banners and torches in the great hall
  for (let x = -455; x > -566; x -= 15) for (const s of [-1, 1]) {
    cyl(b, MAT.castle, x, G, s * 9, 1.0, 0.9, H - 0.4, 16, true); cyl(b, MAT.castleDark, x, G, s * 9, 1.3, 1.3, 0.6, 16); cyl(b, MAT.castleDark, x, G + H - 1.2, s * 9, 1.2, 1.2, 0.8, 16);
    torch(b, x, G + 3.6, s * 9 - s * 1.0, s > 0 ? Math.PI : 0, true);
    addBanner(b, x - 7.5, G + 12.5, s * 13.45, s > 0 ? Math.PI : 0, 2.4, 5.5);
  }
  // red carpet runner, banquet tables, chandeliers
  B(b, MAT.carpet, -505, G + 0.01, 0, 124, 0.02, 4.4, 0, false);
  for (const s of [-1, 1]) {
    b.__floor = G + 0.01;
    const L = frame(-505, s * 5.2, 0);
    B(b, MAT.wood, -505, G + 0.75, s * 5.2, 60, 0.1, 1.6, 0, false); addCollider(-505, s * 5.2, 30, 0.8, 0, G, G + 0.85);
    for (let x = -533; x <= -477; x += 8) B(b, MAT.darkWood, x, G, s * 5.2, 0.3, 0.75, 1.2, 0, false);
    for (let x = -532; x <= -478; x += 3) { b.add(MAT.gold, new THREE.CylinderGeometry(0.16, 0.12, 0.05, 10), xform(x, G + 0.87, s * 5.2 + 0.4)); b.add(MAT.gold, new THREE.CylinderGeometry(0.16, 0.12, 0.05, 10), xform(x, G + 0.87, s * 5.2 - 0.4)); if (x % 9 === 0) b.add(MAT.lantern, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), xform(x, G + 1.0, s * 5.2)); }
    for (const side of [-1, 1]) { B(b, MAT.darkWood, -505, G, s * 5.2 + side * 1.35, 58, 0.45, 0.45, 0, true); for (let x = -530; x <= -480; x += 5) addSeat(x, G + 0.5, s * 5.2 + side * 1.35, side > 0 ? Math.PI : 0, 'bench'); }
  }
  for (const x of [-470, -505, -540]) { cyl(b, MAT.metal, x, G + 10, 0, 2.2, 2.2, 0.15, 24, false, true); b.add(MAT.metal, new THREE.CylinderGeometry(0.03, 0.03, 5.6, 4), xform(x, G + 12.9, 0)); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; b.add(MAT.lantern, new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), xform(x + Math.cos(a) * 2.2, G + 10.25, Math.sin(a) * 2.2)); } TORCHES.push({ p: new THREE.Vector3(x, G + 9.5, 0), interior: true }); }
  // dais and throne
  B(b, MAT.castleDark, -572.5, G, 0, 11, 0.4, 14, 0, true); B(b, MAT.castleDark, -573.5, G + 0.4, 0, 9, 0.4, 10, 0, true);
  B(b, MAT.carpet, -573.5, G + 0.8, 0, 8.5, 0.02, 9, 0, false);
  const tx = -575, ty = G + 0.8;
  B(b, MAT.gold, tx, ty, 0, 1.4, 0.55, 1.5, 0, true);
  B(b, MAT.red, tx + 0.05, ty + 0.55, 0, 1.2, 0.12, 1.3, 0, false);
  B(b, MAT.gold, tx - 0.7, ty, 0, 0.25, 3.4, 1.7, 0, false);
  B(b, MAT.red, tx - 0.55, ty + 0.65, 0, 0.08, 2.3, 1.2, 0, false);
  for (const s of [-1, 1]) { B(b, MAT.gold, tx, ty + 0.55, s * 0.78, 1.4, 0.55, 0.16, 0, false); b.add(MAT.gold, new THREE.IcosahedronGeometry(0.16, 1), xform(tx - 0.7, ty + 3.5, s * 0.75)); }
  b.add(MAT.gold, new THREE.ConeGeometry(0.35, 0.8, 8), xform(tx - 0.7, ty + 3.75, 0));
  THRONE.seat = addSeat(tx + 0.25, ty + 0.62, 0, Math.PI / 2, 'throne');
  for (const s of [-1, 1]) { addBanner(b, x0 + T + 0.05, G + 12, s * 6, Math.PI / 2, 3, 7); torch(b, x0 + T + 0.05, G + 4.5, s * 3.5, Math.PI / 2, true); }
  for (const s of [-1, 1]) CASTLE_PTS.servant.push(new THREE.Vector3(-470, G, s * 11), new THREE.Vector3(-540, G, s * 11), new THREE.Vector3(-560, G, s * 3));
}
const THRONE = {};
function furnishRoom(b, L, rot, kind, w, d) {
  const g = b.__floor;
  if (kind === 'bed') { bed(b, L, rot, -w / 2 + 2, d / 2 - 2.5, pick([MAT.red, MAT.blue, MAT.purple])); chest(b, L, rot, -w / 2 + 2, d / 2 - 4.6); table(b, L, rot, w / 4, 0, 1.6, 1, 2); rug(b, L, rot, 0, 2, w * 0.5, 6, MAT.rugBlue); fireplace(b, L, rot, 0, -d / 2 + 0.75); }
  else if (kind === 'library') { for (let i = 0; i < 4; i++) shelf(b, L, rot + Math.PI, -w / 2 + 2 + i * (w - 4) / 3, -d / 2 + 0.65 + 0.0, 2.2); for (let i = 0; i < 3; i++) shelf(b, L, rot, -w / 2 + 3 + i * (w - 6) / 2, d / 2 - 2.0, 2.2); table(b, L, rot, 0, 2, 2.4, 1.2, 2); rug(b, L, rot, 0, 2, w * 0.6, 5, MAT.carpet); }
  else if (kind === 'study') { table(b, L, rot, 0, 0, 2, 1.1, 2); shelf(b, L, rot + Math.PI, -w / 4, -d / 2 + 0.65, 2.4); plant(b, ...L(w / 2 - 1.5, d / 2 - 1.5).flatMap((v, k) => (k === 0 ? [v, g] : [v]))); chest(b, L, rot, w / 2 - 1.5, -2); rug(b, L, rot, 0, 0, 5, 5, MAT.rug); }
  else if (kind === 'kitchen') { fireplace(b, L, rot, -w / 4, -d / 2 + 0.75); fireplace(b, L, rot, w / 4, -d / 2 + 0.75); table(b, L, rot, 0, 1, 3, 1.2, 2); for (let i = 0; i < 5; i++) barrel(b, ...L(-w / 2 + 1.2, d / 2 - 1.5 - i * 1.0).flatMap((v, k) => (k === 0 ? [v, g] : [v])), 0.85); for (let i = 0; i < 6; i++) { const [px, pz] = L(rr(-1.2, 1.2), 1 + rr(-0.4, 0.4)); b.add(MAT.metal, new THREE.CylinderGeometry(0.15, 0.12, 0.2, 10), xform(px, g + 0.9, pz)); } }
  else if (kind === 'armory') { for (let i = 0; i < 5; i++) { const [px, pz] = L(-w / 2 + 2 + i * 2.2, -d / 2 + 1); B(b, MAT.darkWood, px, g, pz, 1.6, 2.2, 0.3, rot); for (let k = 0; k < 3; k++) { const [sx, sz] = L(-w / 2 + 1.5 + i * 2.2 + k * 0.5, -d / 2 + 1.25); b.add(MAT.metal, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), xform(sx, g + 1.1, sz)); } } for (let i = 0; i < 3; i++) { const [px, pz] = L(-w / 4 + i * 3, d / 4); b.add(MAT.metal, new THREE.SphereGeometry(0.4, 10, 8), xform(px, g + 1.6, pz)); B(b, MAT.darkWood, px, g, pz, 0.15, 1.3, 0.15, rot); } }
  else { for (let i = 0; i < 12; i++) { const [px, pz] = L(rr(-w / 2 + 1, w / 2 - 1), rr(-d / 2 + 1, d / 2 - 1)); if (i % 2) barrel(b, px, g, pz, 0.9); else crate(b, px, g, pz, rr(0.7, 1), rr(0, 1)); } }
}
function buildTower() {
  const b = BATCH.castle, G = CASTLE.y, { x, z, r, h } = TOWER, rin = r - 1.2, doorA = Math.PI / 2;
  const segs = 30;
  for (let k = 0; k < segs; k++) {
    const a = (k + 0.5) / segs * TAU, wx = x + Math.cos(a) * (r - 0.6), wz = z + Math.sin(a) * (r - 0.6), rot = -a + Math.PI / 2, len = TAU * r / segs * 1.08;
    if (Math.abs(angDiff(a, doorA)) < 0.22) { B(b, MAT.castle, wx, G + 3.4, wz, len, h - 3.4, 1.2, rot, true, 3); continue; }
    B(b, MAT.castle, wx, G - 1, wz, len, h + 1, 1.2, rot, true, 3);
    if (k % 5 === 2) for (let y = G + 8; y < G + h - 4; y += 9) b.add(MAT.black, new THREE.PlaneGeometry(0.4, 1.6), xform(x + Math.cos(a) * (r + 0.02), y, z + Math.sin(a) * (r + 0.02), rot));
  }
  // pillar
  cyl(b, MAT.castleDark, x, G - 1, z, 1.1, 1.1, h + 1, 16, true);
  // spiral steps
  const N = Math.round(h / 0.35), a0 = doorA + 0.9, da = 0.3, rc = (1.1 + rin) / 2, rh = (rin - 1.1) / 2;
  TOWER.lastA = a0 + (N - 1) * da;
  for (let i = 0; i < N; i++) {
    const a = a0 + i * da, top = G + 0.35 * (i + 1), sx = x + Math.cos(a) * rc, sz = z + Math.sin(a) * rc, rot = -a + Math.PI / 2;
    // box local x is tangential, z radial
    b.add(MAT.castleDark, boxGeo(1.25, 0.4, rh * 2, 1), xform(sx, top - 0.2, sz, rot));
    addCollider(sx, sz, 0.62, rh, rot, top - 0.4, top);
    if (i % 18 === 9) torch(b, x + Math.cos(a + 0.8) * (rin - 0.02), top + 2.2, z + Math.sin(a + 0.8) * (rin - 0.02), -(a + 0.8) - Math.PI / 2 + Math.PI, true);
  }
  // top platform with stair hole over the last steps
  const PT = G + h, pr = r + 0.6;
  for (let k = 0; k < 28; k++) {
    const a = (k + 0.5) / 28 * TAU, inHole = Math.abs(angDiff(a, TOWER.lastA - 0.8)) < 1.0;
    const rc2 = (1.1 + pr) / 2, rh2 = (pr - 1.1) / 2, rot = -a + Math.PI / 2;
    if (inHole) { const rc3 = (rin + pr) / 2; B(b, MAT.castle, x + Math.cos(a) * rc3, PT - 0.5, z + Math.sin(a) * rc3, 1.0, 0.5, pr - rin, rot, true, 2); continue; }
    B(b, MAT.castle, x + Math.cos(a) * rc2, PT - 0.5, z + Math.sin(a) * rc2, pr * TAU / 28 * 1.1 * (rc2 / pr) + 0.4, 0.5, rh2 * 2, rot, true, 2);
  }
  B(b, MAT.castleDark, x, PT - 0.5, z, 2.4, 0.5, 2.4, 0, false);
  for (let k = 0; k < 32; k++) { const a = (k + 0.5) / 32 * TAU, rot = -a + Math.PI / 2; B(b, MAT.castle, x + Math.cos(a) * pr, PT, z + Math.sin(a) * pr, TAU * pr / 32 * 1.05, k % 2 ? 1.1 : 1.7, 0.7, rot, true, 2); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; b.add(MAT.castle, boxGeo(1, 1, 1.4), xform(x + Math.cos(a) * (r + 0.2), PT - 1.4, z + Math.sin(a) * (r + 0.2), -a + Math.PI / 2)); }
  cyl(b, MAT.darkWood, x, PT, z, 0.09, 0.07, 9, 6, false); BANNER_POLES.push(new THREE.Vector3(x, PT + 9, z));
  for (const s of [-1, 1]) torch(b, x + Math.cos(doorA) * (r + 0.02) + s * 1.6, G + 3.4, z + Math.sin(doorA) * (r + 0.02), 0);
  TORCHES.push({ p: new THREE.Vector3(x, PT + 1.5, z) });
}
