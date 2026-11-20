// ===== The city: golden arcades, bridges, cafés, skyline, breach portal, hover cars, saucers =====
const TORCHES = [], SEATS = [], BANNERS = [], CIT_POINTS = [], INTERACT = [];
const BATCH = { ground: new Batch('ground'), north: new Batch('north'), south: new Batch('south'), props: new Batch('props'), sky: new Batch('sky') };
function B(b, mat, cx, y0, cz, sx, sy, sz, rot = 0, col = true, ts = 2) { b.add(mat, boxGeo(sx, sy, sz, ts), xform(cx, y0 + sy / 2, cz, rot)); if (col) return addCollider(cx, cz, sx / 2, sz / 2, rot, y0, y0 + sy); }
function solidCyl(x, z, r, y0, y1) { for (let k = 0; k < 6; k++) addCollider(x, z, r, r * 0.27, k * Math.PI / 6, y0, y1); }
function cyl(b, mat, x, y0, z, r0, r1, h, seg = 16, col = false) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); scaleUV(g, Math.max(1, Math.round(TAU * Math.max(r0, r1) / 2.5)), Math.max(1, h / 2.5)); b.add(mat, g, xform(x, y0 + h / 2, z)); if (col) solidCyl(x, z, Math.max(r0, r1), y0, y0 + h); }
function addSeat(x, y, z, rot, kind = 'chair') { const s = { p: new THREE.Vector3(x, y, z), rot, kind, taken: null }; SEATS.push(s); return s; }

// facade front with an arched opening, extruded toward the building
function archPanel(w, h, aw, ah) {
  const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
  const hole = new THREE.Path(); const r = aw / 2, spring = ah - r;
  hole.moveTo(-r, 0); hole.lineTo(-r, spring); hole.absarc(0, spring, r, Math.PI, 0, true); hole.lineTo(r, 0); hole.lineTo(-r, 0);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false, curveSegments: 14 }); scaleUV(g, 0.25, 0.25); return g;
}
function buildFacades() {
  const BAY = 14, ARCH_W = 9.4, ARCH_H = 15, GF = 18;
  const panel = archPanel(BAY, GF, ARCH_W, ARCH_H);
  const arch = new THREE.TorusGeometry(ARCH_W / 2 + 0.25, 0.22, 8, 24, Math.PI);
  for (const s of [1, -1]) {
    const b = s > 0 ? BATCH.north : BATCH.south, fz = s * FACADE_Z, back = s * (FACADE_Z + 30);
    let groupH = 0;
    for (let i = 0; i < 57; i++) {
      const bx = -392 + i * BAY;
      if (i % 4 === 0) groupH = pick([34, 40, 46, 52, 58]);
      // arcade front (faces the canal)
      b.add(MAT.stoneCream, panel, xform(bx, PROM_Y, s > 0 ? fz : fz - 1.6));
      b.add(MAT.goldBright, arch, xform(bx, PROM_Y + ARCH_H - ARCH_W / 2, fz - s * 0.05));
      for (const px of [-BAY / 2 + 0.5, BAY / 2 - 0.5]) { cyl(b, MAT.stoneCream, bx + px, PROM_Y, fz - s * 0.4, 0.7, 0.6, GF - 1, 14); b.add(MAT.goldBright, new THREE.CylinderGeometry(0.85, 0.75, 0.6, 14), xform(bx + px, PROM_Y + GF - 1.2, fz - s * 0.4)); b.add(MAT.goldBright, new THREE.CylinderGeometry(0.8, 0.9, 0.5, 14), xform(bx + px, PROM_Y + 0.25, fz - s * 0.4)); }
      // pillars between arches + alcove
      for (const sx of [-1, 1]) addCollider(bx + sx * (BAY / 2 - (BAY - ARCH_W) / 4), fz + s * 2.6, (BAY - ARCH_W) / 4, 3.2, 0, PROM_Y - 1, PROM_Y + 40);
      for (const px of [-BAY / 2 + 0.5, BAY / 2 - 0.5]) solidCyl(bx + px, fz - s * 0.4, 0.75, PROM_Y - 1, PROM_Y + GF);
      const depth = 5;
      b.add(MAT.arcade, new THREE.PlaneGeometry(ARCH_W, ARCH_H + 2), xform(bx, PROM_Y + (ARCH_H + 2) / 2, fz + s * depth, s > 0 ? Math.PI : 0));
      addCollider(bx, fz + s * (depth + 0.2), ARCH_W / 2, 0.2, 0, PROM_Y - 1, PROM_Y + GF);
      b.add(MAT.marble, boxGeo(ARCH_W + 0.4, 0.2, depth + 1.6, 3), xform(bx, PROM_Y - 0.1, fz + s * depth / 2));
      b.add(MAT.goldDark, boxGeo(ARCH_W + 0.4, 0.3, depth + 1.6), xform(bx, PROM_Y + ARCH_H + 1.8, fz + s * depth / 2));
      for (const sx of [-1, 1]) b.add(MAT.goldDark, boxGeo(0.3, ARCH_H + 2, depth), xform(bx + sx * ARCH_W / 2, PROM_Y + (ARCH_H + 2) / 2, fz + s * depth / 2));
      // a little shop furniture in some alcoves
      if (i % 3 === 1) { B(b, MAT.goldDark, bx, PROM_Y, fz + s * (depth - 1.2), 5, 1.1, 0.8); b.add(MAT.orb, new THREE.SphereGeometry(0.18, 10, 8), xform(bx - 1.5, PROM_Y + 1.35, fz + s * (depth - 1.2))); }
      if (bx > -260 && bx < 260) CIT_POINTS.push({ p: new THREE.Vector3(bx, PROM_Y, fz + s * 2.5), side: s, alcove: true });
      // upper floors
      const H = groupH, up0 = PROM_Y + GF;
      B(b, MAT.stoneCream, bx, up0, fz + s * 0.8, BAY, H - GF, 1.6, 0, false, 4);
      b.add(MAT.stoneCream, boxGeo(BAY, H + 2, 26, 6), xform(bx, PROM_Y + (H + 2) / 2 - 1, s * (FACADE_Z + 5.4 + 13)));
      for (let y = up0 + 1.5; y < PROM_Y + H - 3; y += 6.5) {
        b.add(MAT.goldBright, boxGeo(BAY + 0.2, 0.35, 0.5), xform(bx, y - 0.9, fz - s * 0.1));
        for (const wx of [-4.2, 0, 4.2]) { const wy = y + 0.6; b.add(MAT.goldDark, boxGeo(2.3, 3.6, 0.3), xform(bx + wx, wy + 1.6, fz - s * 0.12)); b.add(MAT.window, new THREE.PlaneGeometry(1.8, 3.1), xform(bx + wx, wy + 1.6, fz - s * 0.3, s > 0 ? Math.PI : 0)); }
      }
      b.add(MAT.goldBright, boxGeo(BAY + 0.6, 0.8, 1.4), xform(bx, PROM_Y + H - 0.4, fz + s * 0.3));
      for (let k = 0; k < 7; k++) b.add(MAT.stoneCream, new THREE.CylinderGeometry(0.12, 0.15, 1.1, 6), xform(bx - 6 + k * 2, PROM_Y + H + 0.55, fz + s * 0.3));
      if (i % 4 === 2) { const dg = new THREE.SphereGeometry(5.5, 24, 12, 0, TAU, 0, Math.PI / 2); b.add(MAT.goldBright, dg, xform(bx, PROM_Y + H + 1, fz + s * 10)); b.add(MAT.goldBright, new THREE.ConeGeometry(0.6, 9, 10), xform(bx, PROM_Y + H + 10, fz + s * 10)); }
      if (i % 4 === 0) b.add(MAT.goldDark, new THREE.ConeGeometry(1.6, 12, 4), xform(bx + 6, PROM_Y + H + 6, fz + s * 3, Math.PI / 4));
    }
  }
}
// ---------- bridges ----------
function buildBridges() {
  const b = BATCH.props;
  for (const bx of BRIDGES) {
    const n = 30, rise = 3.6;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, z = lerp(-CANAL.half - 1.2, CANAL.half + 1.2, t), y = PROM_Y + rise * Math.sin(Math.PI * t), len = (CANAL.half * 2 + 2.4) / n + 0.04;
      B(b, MAT.marble, bx, y - 0.6, z, 12, 0.6, len, 0, true, 3);
      for (const sx of [-1, 1]) { b.add(MAT.goldBright, boxGeo(0.12, 0.08, len), xform(bx + sx * 5.9, y + 1.05, z)); addCollider(bx + sx * 5.9, z, 0.15, len / 2, 0, y, y + 1.1); }
      if (i % 3 === 0) for (const sx of [-1, 1]) b.add(MAT.goldDark, new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6), xform(bx + sx * 5.9, y + 0.5, z));
    }
    const ag = new THREE.TorusGeometry(CANAL.half + 1.2, 0.6, 8, 40, Math.PI); ag.scale(1, rise / (CANAL.half + 1.2), 1);
    for (const sx of [-1, 1]) b.add(MAT.goldBright, ag, xform(bx + sx * 6.05, PROM_Y - 0.6, 0, Math.PI / 2));
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) lampPost(b, bx + sx * 6.6, sz * (CANAL.half + 1.8));
  }
}
function lampPost(b, x, z) {
  cyl(b, MAT.goldDark, x, PROM_Y, z, 0.14, 0.08, 5.2, 8, true);
  b.add(MAT.goldBright, new THREE.TorusGeometry(0.42, 0.05, 6, 16), xform(x, PROM_Y + 5.4, z, 0, Math.PI / 2));
  b.add(MAT.orb, new THREE.SphereGeometry(0.32, 14, 10), xform(x, PROM_Y + 5.4, z));
  TORCHES.push({ p: new THREE.Vector3(x, PROM_Y + 5.4, z), lantern: true });
}
// ---------- promenade dressing ----------
function buildPromenades() {
  const b = BATCH.props;
  for (const s of [1, -1]) {
    for (let x = -384; x < 296; x += 16) { if (BRIDGE_GAPS.some(([g0, g1]) => x > g0 - 4 && x < g1 + 4)) continue; lampPost(b, x, s * (CANAL.half + 1.8)); }
    for (let x = -370; x < 290; x += 32) {
      if (BRIDGE_GAPS.some(([g0, g1]) => x > g0 - 8 && x < g1 + 8)) continue;
      const z = s * (CANAL.half + 7.5);
      B(b, MAT.marble, x, PROM_Y, z, 3.2, 0.9, 3.2, 0, true, 2); b.add(MAT.goldBright, boxGeo(3.3, 0.1, 3.3), xform(x, PROM_Y + 0.9, z));
      b.add(MAT.bark, new THREE.CylinderGeometry(0.12, 0.22, 3.4, 7), xform(x, PROM_Y + 2.4, z));
      for (let k = 0; k < 4; k++) b.add(MAT.hedge, new THREE.IcosahedronGeometry(rr(0.9, 1.3), 1), xform(x + rr(-0.6, 0.6), PROM_Y + rr(3.8, 4.8), z + rr(-0.6, 0.6)));
      for (const sx of [-1, 1]) { const bz = z + s * 0, bxx = x + sx * 4.2; B(b, MAT.goldDark, bxx, PROM_Y, bz, 0.5, 0.42, 2.0, 0, true); b.add(MAT.marble, boxGeo(0.6, 0.08, 2.1), xform(bxx, PROM_Y + 0.46, bz)); addSeat(bxx, PROM_Y + 0.5, bz - 0.5, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 'bench'); addSeat(bxx, PROM_Y + 0.5, bz + 0.5, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 'bench'); }
    }
  }
  // cafés on the south promenade
  for (let x = -110; x <= 110; x += 11) {
    const z = -(FACADE_Z - 7) + (x % 22 === 0 ? 0 : 2.5);
    cyl(b, MAT.marble, x, PROM_Y + 0.74, z, 0.55, 0.55, 0.06, 18); cyl(b, MAT.goldDark, x, PROM_Y, z, 0.06, 0.06, 0.74, 8); addCollider(x, z, 0.5, 0.5, 0, PROM_Y, PROM_Y + 0.8);
    cyl(b, MAT.goldDark, x, PROM_Y, z, 0.03, 0.03, 2.6, 6);
    b.add(MAT.white, new THREE.ConeGeometry(1.9, 0.7, 16, 1, true), xform(x, PROM_Y + 2.75, z));
    b.add(MAT.orb, new THREE.SphereGeometry(0.06, 8, 6), xform(x, PROM_Y + 0.83, z));
    for (let k = 0; k < 2; k++) { const a = k * Math.PI + 0.5, cx = x + Math.cos(a) * 0.95, cz = z + Math.sin(a) * 0.95; cyl(b, MAT.goldDark, cx, PROM_Y, cz, 0.22, 0.2, 0.46, 10); addSeat(cx, PROM_Y + 0.48, cz, Math.atan2(x - cx, z - cz), 'cafe'); }
  }
  // walking points along both promenades
  for (const s of [1, -1]) for (let x = -250; x <= 250; x += 12.5) for (const zz of [CANAL.half + 4.5, CANAL.half + 12, FACADE_Z - 4]) CIT_POINTS.push({ p: new THREE.Vector3(x + rr(-3, 3), PROM_Y, s * zz), side: s });
}
// ---------- skyline ----------
function buildSkyline() {
  const b = BATCH.sky;
  for (let i = 0; i < 70; i++) {
    const s = i % 2 ? 1 : -1, x = rr(-620, 620), z = s * rr(115, 380), w = rr(18, 40), d = rr(18, 40), h = rr(70, 260);
    const g = boxGeo(w, h, d, 1); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.012, uv.getY(k) * 0.012);
    b.add(MAT.towerGlass, g, xform(x, PROM_Y + h / 2 - 2, z, rr(0, 0.6)));
    if (rand() < 0.5) b.add(MAT.goldBright, boxGeo(w + 1, 2, d + 1), xform(x, PROM_Y + h * rr(0.3, 0.9), z, 0));
    if (rand() < 0.45) b.add(MAT.goldDark, new THREE.ConeGeometry(w * 0.3, rr(20, 60), 4), xform(x, PROM_Y + h + 15, z, Math.PI / 4));
  }
  for (const [x, z, h] of [[560, 0, 380], [-560, 30, 320], [480, -160, 260], [-480, -150, 240]]) {
    const g = new THREE.CylinderGeometry(16, 34, h, 8); scaleUV(g, 6, h / 12); b.add(MAT.towerGlass, g, xform(x, h / 2, z));
    b.add(MAT.goldBright, new THREE.ConeGeometry(16, 70, 8), xform(x, h + 35, z));
  }
}
// ---------- breach plaza and docks ----------
const PORTAL = { ring: null, core: null };
function buildBreachAndDocks() {
  const b = BATCH.props;
  // portal ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.9, 16, 64), MAT.neonRed); ring.position.set(388, PROM_Y + 11, 0); ring.rotation.y = Math.PI / 2; scene.add(ring);
  const c = makeCanvas(256), g = c.getContext('2d'); const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128); grd.addColorStop(0, 'rgba(255,240,240,1)'); grd.addColorStop(0.25, 'rgba(255,60,80,0.9)'); grd.addColorStop(0.7, 'rgba(90,0,30,0.85)'); grd.addColorStop(1, 'rgba(20,0,10,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(255,120,140,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 20 + i * 11, i, i + 2.5); g.stroke(); }
  const core = new THREE.Mesh(new THREE.CircleGeometry(8.6, 48), new THREE.MeshBasicMaterial({ map: toTex(c, true, false), transparent: true, side: THREE.DoubleSide, depthWrite: false })); core.position.copy(ring.position); core.rotation.y = Math.PI / 2; scene.add(core);
  PORTAL.ring = ring; PORTAL.core = core;
  B(b, MAT.goldDark, 388, PROM_Y, 0, 4, 2, 22, 0, true);
  // barricades and debris
  for (let i = 0; i < 16; i++) { const x = rr(310, 375), z = rr(-34, 34); if (Math.abs(z) < 6 && x > 360) continue; B(b, pick([MAT.goldDark, MAT.carBlack, MAT.stoneCream]), x, PROM_Y, z, rr(1.2, 3), rr(0.8, 1.6), rr(1, 2.2), rand() * 3, true); }
  // docks: cargo crates and moored cars
  for (let i = 0; i < 22; i++) { const s = pick([1, -1]), x = rr(-392, -300), z = s * rr(CANAL.half + 4, FACADE_Z - 4); const h = pick([1.2, 2.4]); B(b, pick([MAT.carRed, MAT.carBlack, MAT.goldDark, MAT.towerGlass]), x, PROM_Y, z, rr(2.4, 5), h, rr(2.2, 2.6), pick([0, Math.PI / 2]), true); }
}
// ---------- hover cars & saucers ----------
const CARS = [], SAUCERS = [];
function makeCar(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), mat); body.scale.set(2.3, 0.5, 1.0); g.add(body);
  const can = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x0a1218, metalness: 0.6, roughness: 0.05, clearcoat: 1 })); can.scale.set(1.2, 0.45, 0.72); can.position.set(-0.2, 0.22, 0); g.add(can);
  for (const sz of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.35), MAT.chrome); fin.position.set(-0.8, 0.05, sz * 0.95); g.add(fin); }
  const glow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), MAT.neonCyan); glow.scale.set(2.0, 0.85, 1); glow.rotation.x = Math.PI / 2; glow.position.y = -0.38; g.add(glow);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 1.4), MAT.neonRed); tail.position.set(-2.28, 0.08, 0); g.add(tail);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeSaucer(r) {
  const pts = [[0, -0.1], [0.35, -0.18], [0.8, -0.12], [1, 0], [0.8, 0.1], [0.45, 0.16], [0.3, 0.32], [0, 0.38]].map(([x, y]) => new THREE.Vector2(x * r, y * r));
  const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), MAT.chrome); g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, r * 0.03, 8, 48), MAT.neonCyan); ring.rotation.x = Math.PI / 2; ring.position.y = -0.16 * r; g.add(ring);
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, l = new THREE.Mesh(new THREE.SphereGeometry(r * 0.025, 8, 6), MAT.orb); l.position.set(Math.cos(a) * r * 0.92, 0, Math.sin(a) * r * 0.92); g.add(l); }
  body.castShadow = true; return g;
}
function buildVehicles() {
  const lanes = [[-4.5, 1], [-9.5, 1], [4.5, -1], [9.5, -1]];
  for (let i = 0; i < 12; i++) { const [z, dir] = lanes[i % 4]; const c = makeCar(pick([MAT.carWhite, MAT.carWhite, MAT.carRed, MAT.carBlack])); c.position.set(rr(-380, 290), 0.6, z); c.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(c); CARS.push({ g: c, dir, v: rr(8, 17), ph: rand() * 10 }); }
  for (let i = 0; i < 5; i++) { const x = rr(-340, -300), s = pick([1, -1]); const c = makeCar(pick([MAT.carWhite, MAT.carRed])); c.position.set(x, 0.5, s * rr(5, 11)); scene.add(c); }
  for (const [r, y, z, v] of [[16, 62, -20, 4], [11, 48, 40, -6], [22, 85, 10, 2.5], [7, 38, -60, 9], [6, 70, 90, -7]]) { const s = makeSaucer(r); s.position.set(rr(-400, 400), y, z); scene.add(s); SAUCERS.push({ g: s, v, y }); }
}
function updateVehicles(dt, t) {
  for (const c of CARS) { c.g.position.x += c.dir * c.v * dt; if (c.g.position.x > 292) c.g.position.x = -385; if (c.g.position.x < -385) c.g.position.x = 292; c.g.position.y = 0.6 + Math.sin(t * 2 + c.ph) * 0.06; c.g.rotation.z = Math.sin(t * 1.3 + c.ph) * 0.02; }
  for (const s of SAUCERS) { s.g.position.x += s.v * dt; if (s.g.position.x > 700) s.g.position.x = -700; if (s.g.position.x < -700) s.g.position.x = 700; s.g.position.y = s.y + Math.sin(t * 0.4 + s.v) * 1.5; s.g.rotation.y += dt * 0.15; }
  if (PORTAL.core) { PORTAL.core.rotation.z = 0; PORTAL.core.material.map.rotation = t * 0.6; PORTAL.core.material.map.center.set(0.5, 0.5); PORTAL.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.02); }
}
