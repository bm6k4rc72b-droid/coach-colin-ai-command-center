// ===== Characters: procedural rig, blended animation, hair & cloth, cat, pigeons, dragon =====
const CHAR_MAT = new THREE.MeshStandardMaterial({ map: TEX.fabric, vertexColors: true, roughness: 0.8 });
const C = { hipY: 0, hipX: 1, hipYaw: 2, hipRoll: 3, spX: 4, chX: 5, chYaw: 6, nkX: 7, hdX: 8, hdY: 9, sLX: 10, sLZ: 11, eLX: 12, sRX: 13, sRZ: 14, eRX: 15, tLX: 16, tLZ: 17, kLX: 18, fLX: 19, tRX: 20, tRZ: 21, kRX: 22, fRX: 23, hat: 24, smile: 25, sLY: 26, sRY: 27 };
const NCH = 28;
const col3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

function partGeo(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = normGeo(geo.clone()); g.applyMatrix4(xform(x, y, z, ry, rx, rz, sx, sy, sz));
  const c = col3(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const G_ = {
  sph: new THREE.SphereGeometry(1, 10, 7), sphHi: new THREE.SphereGeometry(1, 18, 14), sphL: new THREE.SphereGeometry(1, 8, 6), cap: (r, l) => new THREE.CapsuleGeometry(r, l, 3, 10), cyl: (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s), cone: (r, h, s = 12) => new THREE.ConeGeometry(r, h, s), box: (a, b, c) => new THREE.BoxGeometry(a, b, c),
  hairCap: new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI * 0.56), torus: new THREE.TorusGeometry(1, 0.22, 6, 12, Math.PI),
};

class Char {
  constructor(o) {
    this.o = o; this.name = o.name || '';
    const k = (o.height || 1.72) / 1.75; this.k = k;
    this.root = new THREE.Group(); this.root.scale.setScalar(k);
    const J = (this.J = {}), BK = {}, bones = [], holder = new THREE.Group();
    const mk = (name, parent, x, y, z) => { const j = new THREE.Bone(); j.position.set(x, y, z); (parent ? J[parent] : holder).add(j); J[name] = j; BK[name] = []; bones.push(j); return j; };
    mk('hips', null, 0, 0.92, 0); mk('spine', 'hips', 0, 0.1, 0); mk('chest', 'spine', 0, 0.2, 0); mk('neck', 'chest', 0, 0.27, 0); mk('head', 'neck', 0, 0.08, 0);
    for (const s of [1, -1]) { const L = s > 0 ? 'L' : 'R'; mk('ua' + L, 'chest', s * 0.2, 0.21, 0); mk('fa' + L, 'ua' + L, 0, -0.29, 0); mk('th' + L, 'hips', s * 0.1, -0.05, 0); mk('sh' + L, 'th' + L, 0, -0.45, 0); mk('ft' + L, 'sh' + L, 0, -0.44, 0); }
    mk('mouth', 'head', 0, 0.03, 0.104);
    const skin = o.skin, top = o.top, pants = o.pants || 0x4b3a2c, boots = o.boots || 0x3e2a1c, hair = o.hair, sleeve = o.sleeve || top, slim = o.slim ? 0.9 : 1;
    // body
    BK.hips.push(partGeo(G_.sph, pants, 0, 0, 0, 0, 0, 0, 0.16 * slim, 0.12, 0.12));
    BK.spine.push(partGeo(G_.cap(0.13, 0.1), top, 0, 0.08, 0, 0, 0, 0, 1.05 * slim, 1, 0.8));
    BK.spine.push(partGeo(G_.cyl(0.142, 0.142, 0.055, 16), o.belt || 0x5b3a22, 0, 0.0, 0, 0, 0, 0, slim, 1, 0.82));
    BK.spine.push(partGeo(G_.box(0.05, 0.045, 0.02), 0xd9a640, 0, 0.0, 0.118));
    BK.chest.push(partGeo(G_.cap(0.15, 0.13), top, 0, 0.12, 0, 0, 0, 0, 1.2 * slim, 1, 0.78));
    BK.chest.push(partGeo(G_.cyl(0.07, 0.11, 0.06, 12), o.trim || top, 0, 0.27, 0, 0, 0, 0, 1, 1, 0.9));
    if (o.tabard) { BK.chest.push(partGeo(G_.box(0.26, 0.42, 0.02), o.tabard, 0, 0.06, 0.122)); BK.chest.push(partGeo(G_.box(0.08, 0.08, 0.01), 0xd9a640, 0, 0.12, 0.135)); }
    if (o.apron) BK.chest.push(partGeo(G_.box(0.24, 0.3, 0.015), o.apron, 0, -0.02, 0.122));
    BK.neck.push(partGeo(G_.cyl(0.05, 0.055, 0.12, 10), skin, 0, 0.03, 0));
    const H = BK.head;
    H.push(partGeo(G_.sphHi, skin, 0, 0.07, 0, 0, 0, 0, 0.106, 0.122, 0.112));
    H.push(partGeo(G_.sph, skin, 0, 0.055, 0.108, 0, 0, 0, 0.018, 0.022, 0.02));
    for (const s of [1, -1]) {
      H.push(partGeo(G_.sph, 0xffffff, s * 0.04, 0.086, 0.094, 0, 0, 0, 0.022, 0.02, 0.012));
      H.push(partGeo(G_.sph, o.eyes || 0x2a1a10, s * 0.04, 0.085, 0.104, 0, 0, 0, 0.012, 0.014, 0.006));
      H.push(partGeo(G_.sph, 0xffffff, s * 0.037, 0.09, 0.109, 0, 0, 0, 0.003, 0.003, 0.002));
      H.push(partGeo(G_.box(0.045, 0.01, 0.012), hair || 0x3a2a1a, s * 0.041, 0.118, 0.103, 0, 0, s * -0.12));
      H.push(partGeo(G_.sph, 0xe8a0a0, s * 0.062, 0.045, 0.088, 0, 0, 0, 0.018, 0.01, 0.006));
      if (o.elf) H.push(partGeo(G_.cone(0.026, 0.13, 8), skin, s * 0.122, 0.1, -0.01, 0, 0, s * -1.1));
      else H.push(partGeo(G_.sph, skin, s * 0.106, 0.07, -0.005, 0, 0, 0, 0.02, 0.032, 0.022));
    }
    if (hair) {
      H.push(partGeo(G_.hairCap, hair, 0, 0.082, -0.012, -0.18, 0, 0, 0.118, 0.13, 0.126));
      if (o.hairStyle === 'long') H.push(partGeo(G_.cap(0.1, 0.24), hair, 0, -0.04, -0.07, 0.1, 0, 0, 1.15, 1, 0.55));
      if (o.hairStyle === 'bun') H.push(partGeo(G_.sph, hair, 0, 0.16, -0.1, 0, 0, 0, 0.065, 0.06, 0.065));
      if (o.hairStyle === 'kaye') {
        for (let i = 0; i < 7; i++) { const a = -0.75 + i * 0.25; H.push(partGeo(G_.sph, i % 2 ? hair : o.hairHi || hair, Math.sin(a) * 0.09, 0.15 - Math.abs(a) * 0.03, 0.075 + Math.cos(a) * 0.02, 0.5, a, 0, 0.034, 0.05, 0.024)); }
        H.push(partGeo(G_.cap(0.085, 0.12), hair, 0, 0.03, -0.075, 0.25, 0, 0, 1.25, 1, 0.6));
      }
    }
    if (o.beard) H.push(partGeo(G_.sph, o.beard, 0, 0.0, 0.07, 0, 0, 0, 0.085, 0.07, 0.06));
    BK.mouth.push(partGeo(G_.torus, 0x7a2a2a, 0, 0, 0, 0, 0, Math.PI, 0.022, 0.012, 0.01));
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      BK['ua' + L].push(partGeo(G_.sph, sleeve, 0, -0.01, 0, 0, 0, 0, 0.068, 0.068, 0.068));
      BK['ua' + L].push(partGeo(G_.cap(0.054, 0.2), sleeve, 0, -0.145, 0, 0, 0, 0, o.puff ? 1.15 : 1, 1, o.puff ? 1.15 : 1));
      BK['fa' + L].push(partGeo(G_.cap(0.044, 0.18), o.bareArms ? skin : sleeve, 0, -0.12, 0));
      if (o.cuffs) BK['fa' + L].push(partGeo(G_.cyl(0.052, 0.052, 0.05, 10), o.cuffs, 0, -0.2, 0));
      BK['fa' + L].push(partGeo(G_.sph, skin, 0, -0.275, 0.005, 0, 0, 0, 0.04, 0.055, 0.028));
      BK['th' + L].push(partGeo(G_.cap(0.075, 0.3), pants, 0, -0.22, 0));
      BK['sh' + L].push(partGeo(G_.cap(0.058, 0.3), pants, 0, -0.2, 0));
      BK['sh' + L].push(partGeo(G_.cyl(0.07, 0.064, 0.24, 12), boots, 0, -0.32, 0));
      BK['ft' + L].push(partGeo(G_.box(0.095, 0.075, 0.22), boots, 0, -0.005, 0.05));
    }
    if (o.dress) { const len = o.dressLen || 0.55; BK.hips.push(partGeo(G_.cyl(0.165, o.dressFlare || 0.3, len, 18), o.dress, 0, 0.03 - len / 2, 0, 0, 0, 0, slim, 1, 0.9)); }
    if (o.hat) {
      this.hatRest = new THREE.Vector3(0, o.hat === 'helmet' ? 0.1 : 0.165, -0.005); mk('hat', 'head', this.hatRest.x, this.hatRest.y, this.hatRest.z); const hl = BK.hat;
      if (o.hat === 'elf') { hl.push(partGeo(G_.cyl(0.19, 0.19, 0.015, 20), o.hatCol, 0, 0, 0)); hl.push(partGeo(G_.cone(0.11, 0.32, 14), o.hatCol, 0, 0.16, -0.03, -0.25)); hl.push(partGeo(G_.cyl(0.115, 0.115, 0.03, 16), o.hatBand || 0xd9a640, 0, 0.02, 0)); hl.push(partGeo(G_.cone(0.02, 0.16, 5), 0x3d7a3a, 0.09, 0.07, 0.04, 0, 0, -0.9)); }
      else if (o.hat === 'cap') { hl.push(partGeo(G_.cyl(0.13, 0.13, 0.05, 16), o.hatCol, 0, 0.02, 0, 0, 0, 0, 1.05, 1, 1.05)); hl.push(partGeo(G_.sph, o.hatCol, 0.03, 0.05, 0, 0, 0, 0, 0.14, 0.05, 0.13)); }
      else if (o.hat === 'straw') { hl.push(partGeo(G_.cyl(0.24, 0.24, 0.015, 20), 0xd8b96a, 0, 0, 0)); hl.push(partGeo(G_.cyl(0.1, 0.12, 0.1, 14), 0xd8b96a, 0, 0.05, 0)); hl.push(partGeo(G_.cyl(0.122, 0.122, 0.025, 14), o.hatCol || 0x9e2430, 0, 0.02, 0)); }
      else if (o.hat === 'helmet') { hl.push(partGeo(G_.hairCap, 0xa8acb2, 0, -0.02, 0, 0, 0, 0, 0.135, 0.15, 0.14)); hl.push(partGeo(G_.box(0.02, 0.09, 0.02), 0xa8acb2, 0, -0.04, 0.135)); hl.push(partGeo(G_.cone(0.02, 0.1, 6), 0x9e2430, 0, 0.16, 0)); }
      this.hat = J.hat;
    }
    if (o.spear) { mk('spear', 'faR', 0, -0.27, 0.02); BK.spear.push(partGeo(G_.cyl(0.018, 0.018, 2.1, 6), 0x5b3d26, 0, 0.55, 0), partGeo(G_.cone(0.04, 0.22, 6), 0xc0c4ca, 0, 1.7, 0)); }
    if (o.tray) { mk('tray', 'chest', -0.2, 0.34, 0.25); BK.tray.push(partGeo(G_.cyl(0.2, 0.2, 0.02, 16), 0xc9a14a, 0, 0, 0), partGeo(G_.cyl(0.035, 0.03, 0.12, 8), 0xeeeeee, 0.06, 0.06, 0.02), partGeo(G_.sph, 0xd8414f, -0.07, 0.04, 0, 0, 0, 0, 0.04, 0.04, 0.04)); }
    // bake every part into one skinned mesh (one draw call per character)
    holder.updateMatrixWorld(true);
    const all = [];
    for (const [name, list] of Object.entries(BK)) {
      const bi = bones.indexOf(J[name]);
      for (const g of list) {
        g.applyMatrix4(J[name].matrixWorld);
        const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        all.push(g);
      }
    }
    const mesh = new THREE.SkinnedMesh(mergeGeometries(all), CHAR_MAT);
    mesh.add(J.hips); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.9);
    this.root.add(mesh); this.mesh = mesh;
    // animation state
    this.v = new Float32Array(NCH); this.tmp = new Float32Array(NCH); this.base = new Float32Array(NCH);
    this.w = { idle: 1 }; this.target = 'idle'; this.phase = 0; this.speed = 0; this.t = rand() * 100; this.action = null; this.look = 0; this.lookW = 0; this.sitH = 0.6;
  }
  play(name, dur) { this.action = { name, t: 0, dur }; }
  pose(state, o) {
    const t = this.t, ph = this.phase, v = o;
    v.fill(0); v[C.hipY] = 0.92; v[C.sLZ] = 0.12; v[C.sRZ] = -0.12; v[C.eLX] = -0.15; v[C.eRX] = -0.15;
    switch (state) {
      case 'idle': v[C.chX] = 0.02 * Math.sin(t * 1.7); v[C.hdY] = 0.18 * Math.sin(t * 0.31) * Math.sin(t * 0.17); v[C.sLZ] += 0.02 * Math.sin(t * 1.7); v[C.sRZ] -= 0.02 * Math.sin(t * 1.7); v[C.hipRoll] = 0.02 * Math.sin(t * 0.4); v[C.tLZ] = 0.03; v[C.tRZ] = -0.06; v[C.hipY] = 0.915 + 0.004 * Math.sin(t * 1.7); break;
      case 'walk': {
        const s = Math.sin(ph), c = Math.cos(ph);
        v[C.tLX] = -0.5 * s; v[C.tRX] = 0.5 * s; v[C.kLX] = 0.12 + 0.7 * Math.max(0, Math.sin(ph - 1.6)); v[C.kRX] = 0.12 + 0.7 * Math.max(0, Math.sin(ph + Math.PI - 1.6));
        v[C.fLX] = 0.2 * Math.max(0, s); v[C.fRX] = 0.2 * Math.max(0, -s);
        v[C.sLX] = 0.42 * s; v[C.sRX] = -0.42 * s; v[C.eLX] = -0.25 - 0.15 * Math.max(0, -s); v[C.eRX] = -0.25 - 0.15 * Math.max(0, s);
        v[C.hipY] = 0.9 + 0.025 * Math.cos(2 * ph); v[C.hipYaw] = 0.1 * s; v[C.chYaw] = -0.14 * s; v[C.spX] = 0.04; v[C.hipRoll] = 0.03 * c; break;
      }
      case 'run': {
        const s = Math.sin(ph);
        v[C.tLX] = -0.85 * s - 0.15; v[C.tRX] = 0.85 * s - 0.15; v[C.kLX] = 0.3 + 1.3 * Math.max(0, Math.sin(ph - 1.2)); v[C.kRX] = 0.3 + 1.3 * Math.max(0, Math.sin(ph + Math.PI - 1.2));
        v[C.fLX] = 0.3 * Math.max(0, s); v[C.fRX] = 0.3 * Math.max(0, -s);
        v[C.sLX] = 0.85 * s; v[C.sRX] = -0.85 * s; v[C.eLX] = -1.3; v[C.eRX] = -1.3; v[C.sLZ] = 0.2; v[C.sRZ] = -0.2;
        v[C.hipY] = 0.86 + 0.06 * Math.abs(Math.cos(ph)); v[C.hipYaw] = 0.16 * s; v[C.chYaw] = -0.22 * s; v[C.spX] = 0.2; v[C.nkX] = -0.12; break;
      }
      case 'crouch': v[C.hipY] = 0.58; v[C.tLX] = v[C.tRX] = -1.15; v[C.kLX] = v[C.kRX] = 1.95; v[C.fLX] = v[C.fRX] = -0.75; v[C.tLZ] = 0.15; v[C.tRZ] = -0.15; v[C.spX] = 0.45; v[C.chX] = 0.1; v[C.nkX] = -0.35; v[C.hdX] = -0.1; v[C.sLX] = v[C.sRX] = -0.5; v[C.eLX] = v[C.eRX] = -0.8; v[C.chX] += 0.02 * Math.sin(t * 1.5); break;
      case 'crouchWalk': { const s = Math.sin(ph); v[C.hipY] = 0.6 + 0.02 * Math.cos(2 * ph); v[C.tLX] = -1.0 - 0.35 * s; v[C.tRX] = -1.0 + 0.35 * s; v[C.kLX] = 1.7 + 0.3 * Math.max(0, Math.sin(ph - 1.4)); v[C.kRX] = 1.7 + 0.3 * Math.max(0, Math.sin(ph + Math.PI - 1.4)); v[C.fLX] = v[C.fRX] = -0.65; v[C.spX] = 0.5; v[C.nkX] = -0.4; v[C.sLX] = -0.4 + 0.25 * s; v[C.sRX] = -0.4 - 0.25 * s; v[C.eLX] = v[C.eRX] = -0.9; break; }
      case 'jump': v[C.hipY] = 0.92; v[C.tLX] = -0.75; v[C.kLX] = 1.1; v[C.tRX] = 0.15; v[C.kRX] = 0.55; v[C.sLX] = -0.6; v[C.sRX] = 0.3; v[C.sLZ] = 0.6; v[C.sRZ] = -0.7; v[C.eLX] = -0.6; v[C.eRX] = -0.3; v[C.spX] = 0.05; break;
      case 'fall': v[C.hipY] = 0.92; v[C.tLX] = -0.3; v[C.kLX] = 0.5; v[C.tRX] = -0.1; v[C.kRX] = 0.3; v[C.sLZ] = 0.9 + 0.1 * Math.sin(t * 9); v[C.sRZ] = -0.9 - 0.1 * Math.sin(t * 9); v[C.eLX] = v[C.eRX] = -0.4; break;
      case 'sit': v[C.hipY] = this.sitH; v[C.tLX] = v[C.tRX] = -1.45; v[C.kLX] = v[C.kRX] = 1.3; v[C.fLX] = v[C.fRX] = 0.1; v[C.tLZ] = 0.06; v[C.tRZ] = -0.06; v[C.sLX] = v[C.sRX] = -0.55; v[C.eLX] = v[C.eRX] = -0.75; v[C.sLZ] = 0.15; v[C.sRZ] = -0.15; v[C.spX] = -0.05; v[C.chX] = 0.015 * Math.sin(t * 1.6); v[C.hdY] = 0.2 * Math.sin(t * 0.25); break;
      case 'throne': v[C.hipY] = this.sitH; v[C.tLX] = v[C.tRX] = -1.45; v[C.kLX] = v[C.kRX] = 1.25; v[C.tLZ] = 0.12; v[C.tRZ] = -0.12; v[C.sLX] = v[C.sRX] = -0.35; v[C.sLZ] = 0.45; v[C.sRZ] = -0.45; v[C.eLX] = v[C.eRX] = -1.2; v[C.spX] = -0.12; v[C.nkX] = 0.05; v[C.chX] = 0.015 * Math.sin(t * 1.4); break;
      case 'lie': v[C.hipY] = 0.13; v[C.hipX] = -Math.PI / 2; v[C.tLZ] = 0.08; v[C.tRZ] = -0.12; v[C.kRX] = 0.5; v[C.tRX] = -0.4; v[C.sLZ] = 0.5; v[C.sRZ] = -2.6; v[C.eRX] = -1.6; v[C.sLX] = 0; v[C.eLX] = -0.3; v[C.nkX] = -0.15; v[C.hdY] = 0.3; v[C.chX] = 0.03 * Math.sin(t * 1.2); break;
      case 'work': { const s = Math.sin(t * 4); v[C.hipY] = 0.58; v[C.tLX] = v[C.tRX] = -1.15; v[C.kLX] = v[C.kRX] = 1.95; v[C.fLX] = v[C.fRX] = -0.75; v[C.spX] = 0.7; v[C.nkX] = 0.1; v[C.sLX] = -0.9 + 0.3 * s; v[C.sRX] = -0.9 - 0.3 * s; v[C.eLX] = v[C.eRX] = -0.4; break; }
      case 'tend': { v[C.spX] = 0.1; v[C.sLX] = -0.6; v[C.sRX] = -0.6 + 0.15 * Math.sin(t * 3); v[C.eLX] = -1.1; v[C.eRX] = -1.0; v[C.sLZ] = -0.1; v[C.sRZ] = 0.1; v[C.hdX] = 0.25; break; }
    }
    if (this.o.tray && state !== 'sit') { v[C.sLX] = -0.5; v[C.eLX] = -1.45; v[C.sLZ] = 0.1; }
    if (this.o.spear && state !== 'sit') { v[C.sRX] = -0.2; v[C.eRX] = -1.2; v[C.sRZ] = -0.05; }
  }
  actionPose(name, t, v) {
    switch (name) {
      case 'bow': { const k = Math.sin(clamp(t / 1.6, 0, 1) * Math.PI); v[C.spX] += 0.55 * k; v[C.chX] += 0.25 * k; v[C.nkX] += 0.25 * k; v[C.sRX] = -0.75; v[C.eRX] = -1.75; v[C.sRZ] = 0.35; v[C.sLX] = 0.35 * k; v[C.eLX] = -0.5; v[C.tRX] += 0.15 * k; v[C.kRX] += 0.2 * k; break; }
      case 'wave': { v[C.sRZ] = -2.5; v[C.sRX] = -0.2; v[C.eRX] = -0.5 + 0.35 * Math.sin(t * 9); v[C.sRY] = 0.0; v[C.smile] = 1; v[C.hdX] = -0.08; v[C.chYaw] += 0.1; v[C.hdY] += 0.1 * Math.sin(t * 2); break; }
      case 'doff': { const up = smooth(0, 0.45, t) * (1 - smooth(1.6, 2.2, t)); v[C.sRX] = -2.6 * up - 0.2; v[C.eRX] = -1.3 * up; v[C.sRZ] = 0.25 * up - 0.1; v[C.hat] = smooth(0.35, 0.7, t) * (1 - smooth(1.6, 2.1, t)); v[C.spX] += 0.3 * smooth(0.5, 1, t) * (1 - smooth(1.4, 2, t)); v[C.nkX] += 0.2 * v[C.hat]; v[C.smile] = 1; break; }
      case 'gesture': { v[C.sLX] = -0.9 + 0.2 * Math.sin(t * 3); v[C.eLX] = -0.9; v[C.sLZ] = 0.5; v[C.sRX] = -0.7 + 0.2 * Math.sin(t * 3 + 1.4); v[C.eRX] = -0.9; v[C.sRZ] = -0.5; v[C.smile] = 1; v[C.hdX] = 0.08 * Math.sin(t * 2.4); break; }
      case 'pet': { const s = Math.sin(t * 5); v[C.spX] += 0.35; v[C.sRX] = -1.25 + 0.15 * s; v[C.eRX] = -0.25; v[C.sRZ] = -0.1 + 0.1 * Math.cos(t * 5); v[C.sLX] = -0.3; v[C.eLX] = -0.6; v[C.smile] = 1; v[C.hdX] += 0.2; break; }
      case 'petLow': { const s = Math.sin(t * 5); v[C.hipY] = 0.58; v[C.tLX] = v[C.tRX] = -1.15; v[C.kLX] = v[C.kRX] = 1.95; v[C.fLX] = v[C.fRX] = -0.75; v[C.spX] = 0.6; v[C.sRX] = -0.9 + 0.2 * s; v[C.eRX] = -0.2; v[C.smile] = 1; v[C.nkX] = 0.2; break; }
      case 'talk': { v[C.sRX] = -0.5 + 0.15 * Math.sin(t * 3.3); v[C.eRX] = -0.9 + 0.2 * Math.sin(t * 4.1); v[C.sRZ] = -0.3; v[C.hdX] = 0.05 * Math.sin(t * 2.7); v[C.smile] = 0.6; break; }
    }
  }
  setState(s) { this.target = s; if (!(s in this.w)) this.w[s] = 0; }
  animate(dt) {
    this.t += dt;
    const rate = Math.min(1, dt * 9);
    let sum = 0;
    for (const s in this.w) { this.w[s] += ((s === this.target ? 1 : 0) - this.w[s]) * rate; if (this.w[s] < 0.001 && s !== this.target) delete this.w[s]; else sum += this.w[s]; }
    const v = this.v; v.fill(0);
    for (const s in this.w) { this.pose(s, this.tmp); const wgt = this.w[s] / sum; for (let i = 0; i < NCH; i++) v[i] += this.tmp[i] * wgt; }
    if (this.action) {
      const a = this.action; a.t += dt;
      const aw = smooth(0, 0.22, a.t) * (1 - smooth(a.dur - 0.3, a.dur, a.t));
      this.base.set(v); this.actionPose(a.name, a.t, this.base);
      for (let i = 0; i < NCH; i++) v[i] = lerp(v[i], this.base[i], aw);
      if (a.t >= a.dur) this.action = null;
    }
    // head look toward a target (radians relative to body)
    this.lookW += ((this.lookOn ? 1 : 0) - this.lookW) * Math.min(1, dt * 5);
    v[C.hdY] += clamp(this.look, -1.1, 1.1) * this.lookW * 0.65; v[C.chYaw] += clamp(this.look, -1.1, 1.1) * this.lookW * 0.25;
    const J = this.J;
    J.hips.position.y = v[C.hipY]; J.hips.rotation.set(v[C.hipX], v[C.hipYaw], v[C.hipRoll], 'YXZ');
    J.spine.rotation.x = v[C.spX]; J.chest.rotation.set(v[C.chX], v[C.chYaw], 0);
    J.neck.rotation.x = v[C.nkX]; J.head.rotation.set(v[C.hdX], v[C.hdY], 0, 'YXZ');
    J.uaL.rotation.set(v[C.sLX], v[C.sLY], v[C.sLZ]); J.faL.rotation.x = v[C.eLX];
    J.uaR.rotation.set(v[C.sRX], v[C.sRY], v[C.sRZ]); J.faR.rotation.x = v[C.eRX];
    J.thL.rotation.set(v[C.tLX], 0, v[C.tLZ]); J.shL.rotation.x = v[C.kLX]; J.ftL.rotation.x = v[C.fLX];
    J.thR.rotation.set(v[C.tRX], 0, v[C.tRZ]); J.shR.rotation.x = v[C.kRX]; J.ftR.rotation.x = v[C.fRX];
    const sm = clamp(v[C.smile] + (this.o.cheerful ? 0.35 : 0), 0, 1); J.mouth.scale.set(0.9 + sm * 0.6, 0.65 + sm * 0.9, 1);
    if (this.hat) { const h = v[C.hat]; this.hat.position.set(this.hatRest.x - h * 0.12, this.hatRest.y + h * 0.16, this.hatRest.z + h * 0.16); this.hat.rotation.set(-h * 1.1, 0, h * 0.5); }
  }
}

// ---------- Kaye's flowing hair, cape and skirt ----------
class Strand {
  constructor(n, seg, r0, r1, mat, parentScene) {
    this.n = n; this.seg = seg; this.p = []; this.o = []; this.meshes = [];
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    for (let i = 0; i < n - 1; i++) { const r = lerp(r0, r1, i / (n - 1)); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, seg, 3, 8), mat); m.castShadow = true; parentScene.add(m); this.meshes.push(m); }
    this.init = false;
  }
  update(dt, anchor, colliders, gravity, wind) {
    const p = this.p, o = this.o;
    if (!this.init) { for (let i = 0; i < this.n; i++) { p[i].copy(anchor).y -= i * this.seg; o[i].copy(p[i]); } this.init = true; }
    p[0].copy(anchor); o[0].copy(anchor);
    const d2 = dt * dt;
    for (let i = 1; i < this.n; i++) { const tx = p[i].x, ty = p[i].y, tz = p[i].z; p[i].x += (p[i].x - o[i].x) * 0.93 + wind.x * d2; p[i].y += (p[i].y - o[i].y) * 0.93 - gravity * d2; p[i].z += (p[i].z - o[i].z) * 0.93 + wind.z * d2; o[i].set(tx, ty, tz); }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) { _v.subVectors(p[i], p[i - 1]); const l = _v.length() || 1e-5; _v.multiplyScalar((l - this.seg) / l); if (i === 1) p[i].sub(_v); else { p[i].addScaledVector(_v, -0.5); p[i - 1].addScaledVector(_v, 0.5); } }
      for (const [c, r] of colliders) for (let i = 1; i < this.n; i++) { _v.subVectors(p[i], c); const l = _v.length(); if (l < r) p[i].addScaledVector(_v, (r - l) / (l || 1e-5)); }
      p[0].copy(anchor);
    }
    for (let i = 0; i < this.n - 1; i++) { const m = this.meshes[i]; m.position.addVectors(p[i], p[i + 1]).multiplyScalar(0.5); _v.subVectors(p[i + 1], p[i]).normalize(); m.quaternion.setFromUnitVectors(UPV, _v); }
  }
}
const UPV = new THREE.Vector3(0, 1, 0);
class Cape {
  constructor(color) {
    this.cols = 7; this.rows = 10; this.w = 0.36; this.h = 0.72;
    this.geo = new THREE.PlaneGeometry(1, 1, this.cols - 1, this.rows - 1);
    const mat = new THREE.MeshStandardMaterial({ color, map: TEX.fabric, side: THREE.DoubleSide, roughness: 0.85 });
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.castShadow = true; this.mesh.frustumCulled = false; scene.add(this.mesh);
    const N = this.cols * this.rows; this.p = []; this.o = []; for (let i = 0; i < N; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    this.init = false; this.inv = new THREE.Matrix4();
  }
  update(dt, ch, ground, wind) {
    const { cols, rows, p, o } = this; const chest = ch.J.chest, root = ch.root;
    root.updateMatrixWorld(true);
    const pins = []; for (let i = 0; i < cols; i++) { const lx = lerp(-0.17, 0.17, i / (cols - 1)); pins.push(chest.localToWorld(new THREE.Vector3(lx, 0.22 - Math.abs(lx) * 0.25, -0.115 - (1 - Math.abs(lx) / 0.17) * 0.01))); }
    const dx = this.w / (cols - 1), dy = this.h / (rows - 1);
    if (!this.init) { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { p[r * cols + c].copy(pins[c]).y -= r * dy; o[r * cols + c].copy(p[r * cols + c]); } this.init = true; }
    const d2 = dt * dt;
    for (let i = cols; i < p.length; i++) { const tx = p[i].x, ty = p[i].y, tz = p[i].z; p[i].x += (p[i].x - o[i].x) * 0.95 + wind.x * d2; p[i].y += (p[i].y - o[i].y) * 0.95 - 9 * d2; p[i].z += (p[i].z - o[i].z) * 0.95 + wind.z * d2; o[i].set(tx, ty, tz); }
    this.inv.copy(root.matrixWorld).invert();
    const lim = (a, b, rest) => { _v.subVectors(p[b], p[a]); const l = _v.length() || 1e-5; const k = (l - rest) / l * 0.5; if (a < cols) { p[b].addScaledVector(_v, -k * 2); } else { p[a].addScaledVector(_v, k); p[b].addScaledVector(_v, -k); } };
    for (let it = 0; it < 5; it++) {
      for (let c = 0; c < cols; c++) p[c].copy(pins[c]);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (c < cols - 1) lim(i, i + 1, dx); if (r < rows - 1) lim(i, i + cols, dy); if (r < rows - 1 && c < cols - 1) lim(i, i + cols + 1, Math.hypot(dx, dy)); }
      for (let i = cols; i < p.length; i++) { // keep behind the body (root-local z)
        _s.copy(p[i]).applyMatrix4(this.inv); const r = Math.floor(i / cols);
        const zmax = ch.capeZ - (r > rows * 0.55 ? 0.05 : 0);
        if (_s.z > zmax) { _s.z = zmax; p[i].copy(_s).applyMatrix4(root.matrixWorld); }
        if (p[i].y < ground + 0.03) p[i].y = ground + 0.03;
      }
    }
    const pos = this.geo.attributes.position;
    for (let i = 0; i < p.length; i++) pos.setXYZ(i, p[i].x, p[i].y, p[i].z);
    pos.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
}
function makeKaye() {
  const ch = new Char({ name: 'Kaye', height: 1.7, skin: 0xb9805a, hair: 0x24160f, hairHi: 0x4a2a1a, hairStyle: 'kaye', eyes: 0x3b2414, top: 0x2f7d5b, sleeve: 0xefe3c8, puff: true, trim: 0xd9a640, cuffs: 0xd9a640, belt: 0x6b4226, pants: 0xe6d8bd, boots: 0x5b3a22, cheerful: true });
  ch.capeZ = -0.14;
  // skirt that follows the legs
  const sg = new THREE.CylinderGeometry(0.17, 0.33, 0.5, 20, 5, true); sg.translate(0, -0.22, 0);
  const sk = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x2f7d5b, map: TEX.fabric, side: THREE.DoubleSide, roughness: 0.85 }));
  sk.castShadow = true; ch.J.hips.add(sk);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 4, 24), MAT.gold); hem.rotation.x = Math.PI / 2; hem.position.y = -0.47; sk.add(hem);
  ch.skirt = { mesh: sk, base: sg.attributes.position.array.slice(), hem };
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.45, metalness: 0.05 });
  ch.braid = new Strand(10, 0.058, 0.05, 0.022, hairMat, scene);
  ch.locks = [new Strand(5, 0.05, 0.022, 0.012, hairMat, scene), new Strand(5, 0.05, 0.022, 0.012, hairMat, scene)];
  ch.tie = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), MAT.gold); scene.add(ch.tie);
  ch.cape = new Cape(0xa3283a);
  return ch;
}
function updateKayeCloth(ch, dt, ground, windV) {
  if (!ch._last) ch._last = ch.root.position.clone();
  if (ch._last.distanceTo(ch.root.position) > 2.5) { ch.cape.init = false; ch.braid.init = false; ch.locks.forEach((l) => (l.init = false)); }
  ch._last.copy(ch.root.position);
  const J = ch.J, sk = ch.skirt, pos = sk.mesh.geometry.attributes.position, b = sk.base;
  const tl = J.thL.rotation.x, tr = J.thR.rotation.x, lie = smooth(-0.5, -1.4, J.hips.rotation.x);
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2], t = clamp((-y) / 0.47, 0, 1), wl = smooth(-0.12, 0.12, x), wr = 1 - wl;
    const fw = z > 0 ? 1 : 0.35, swing = (-Math.sin(tl) * wl - Math.sin(tr) * wr), lift = ((1 - Math.cos(tl)) * wl + (1 - Math.cos(tr)) * wr);
    pos.setXYZ(i, x * (1 + t * 0.05 * Math.sin(ch.t * 3 + z * 9)), y + t * lift * 0.28 * fw, z + t * swing * 0.42 * fw + t * lift * 0.12 * (z > 0 ? 1 : -0.4));
  }
  pos.needsUpdate = true;
  sk.mesh.visible = true;
  ch.root.updateMatrixWorld(true);
  const head = J.head, chest = J.chest;
  const hc = head.localToWorld(new THREE.Vector3(0, 0.07, 0)), cc = chest.localToWorld(new THREE.Vector3(0, 0.1, -0.02)), sc = J.spine.localToWorld(new THREE.Vector3(0, 0.05, 0));
  const cols = [[hc, 0.135 * ch.k], [cc, 0.18 * ch.k], [sc, 0.16 * ch.k]];
  const g = 9.8;
  ch.braid.update(dt, head.localToWorld(new THREE.Vector3(0, 0.1, -0.13)), cols, g, windV);
  ch.tie.position.copy(ch.braid.p[1]); ch.tie.quaternion.copy(ch.braid.meshes[0].quaternion); ch.tie.rotateX(Math.PI / 2);
  ch.locks[0].update(dt, head.localToWorld(new THREE.Vector3(0.085, 0.07, 0.06)), [[hc, 0.122 * ch.k]], g, windV);
  ch.locks[1].update(dt, head.localToWorld(new THREE.Vector3(-0.085, 0.07, 0.06)), [[hc, 0.122 * ch.k]], g, windV);
  ch.cape.update(dt, ch, ground, windV);
  void lie;
}

// ---------- Bob the cat ----------
class Cat {
  constructor() {
    this.root = new THREE.Group(); const B2 = [];
    const orange = 0xd9853b, dark = 0xa65a22, white = 0xf6efe4;
    this.body = new THREE.Group(); this.root.add(this.body); this.body.position.y = 0.2;
    const bodyG = partGeo(G_.cap(0.1, 0.28), orange, 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 1.0);
    { const p = bodyG.attributes.position, c = bodyG.attributes.color; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); const stripe = Math.sin(z * 42) > 0.35 && y > -0.02; const belly = y < -0.05; const col = belly ? col3(white) : stripe ? col3(dark) : col3(orange); c.setXYZ(i, ...col); } }
    B2.push(bodyG);
    this.body.add(new THREE.Mesh(mergeGeometries(B2), CHAR_MAT));
    this.head = new THREE.Group(); this.head.position.set(0, 0.07, 0.2); this.body.add(this.head);
    const hg = [partGeo(G_.sph, orange, 0, 0, 0, 0, 0, 0, 0.085, 0.075, 0.08), partGeo(G_.sph, white, 0, -0.025, 0.055, 0, 0, 0, 0.045, 0.03, 0.035), partGeo(G_.sph, 0xe98a95, 0, -0.005, 0.083, 0, 0, 0, 0.012, 0.009, 0.008)];
    for (const s of [1, -1]) { hg.push(partGeo(G_.cone(0.035, 0.07, 4), orange, s * 0.05, 0.075, -0.005, 0, 0, s * -0.3)); hg.push(partGeo(G_.sph, 0x8cbf3f, s * 0.033, 0.018, 0.07, 0, 0, 0, 0.016, 0.018, 0.01)); hg.push(partGeo(G_.sph, 0x111111, s * 0.033, 0.018, 0.078, 0, 0, 0, 0.006, 0.014, 0.004)); }
    this.headMesh = new THREE.Mesh(mergeGeometries(hg), CHAR_MAT); this.head.add(this.headMesh);
    this.legs = [];
    for (const [x, z] of [[0.06, 0.13], [-0.06, 0.13], [0.06, -0.13], [-0.06, -0.13]]) { const l = new THREE.Group(); l.position.set(x, -0.03, z); const m = new THREE.Mesh(mergeGeometries([partGeo(G_.cap(0.025, 0.13), orange, 0, -0.08, 0), partGeo(G_.sph, white, 0, -0.165, 0.01, 0, 0, 0, 0.03, 0.02, 0.035)]), CHAR_MAT); l.add(m); this.body.add(l); this.legs.push(l); }
    this.tail = []; let parent = this.body;
    for (let i = 0; i < 5; i++) { const t = new THREE.Group(); t.position.set(0, i === 0 ? 0.05 : 0.07, i === 0 ? -0.22 : 0); const m = new THREE.Mesh(partGeo(G_.cap(0.022 - i * 0.002, 0.06), i === 4 ? dark : i % 2 ? dark : orange, 0, 0.035, 0), CHAR_MAT); t.add(m); parent.add(t); parent = t; this.tail.push(t); }
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.root);
    this.pos = new THREE.Vector3(10, 0, 22); this.yaw = 0; this.mode = 'rest'; this.timer = 4; this.target = null; this.phase = 0; this.w = { rest: 1, walk: 0, sit: 0 }; this.purr = 0; this.lookAt = null;
    this.name = 'Bob the Cat';
  }
  pickTarget() { const near = CAT_SPOTS.filter((p) => p.distanceTo(this.pos) < 60 && Math.hypot(p.x, p.z) < 100); this.target = (near.length ? pick(near) : pick(CAT_SPOTS)).clone(); this.mode = 'walk'; }
  update(dt, t) {
    this.timer -= dt;
    if (this.purr > 0) { this.purr -= dt; this.mode = this.mode === 'walk' ? 'sit' : this.mode; }
    else if (this.mode === 'walk') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.4 || this.timer < -40) { this.mode = rand() < 0.75 ? 'rest' : 'sit'; this.timer = rr(15, 40); }
      else { const ty = Math.atan2(dx, dz); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 4); const sp = 0.85; this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt; collideCircle(this.pos, 0.25, 0.4, 0); this.phase += dt * sp / 0.08; }
    } else if (this.timer < 0) { this.pickTarget(); this.timer = 0; }
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
    for (const k in this.w) this.w[k] += ((k === this.mode ? 1 : 0) - this.w[k]) * Math.min(1, dt * 4);
    const { rest, walk, sit } = this.w;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.body.position.y = 0.2 * walk + 0.075 * rest + 0.17 * sit; this.body.rotation.x = -0.45 * sit;
    const s = Math.sin(this.phase);
    this.legs.forEach((l, i) => { const ph = i === 0 || i === 3 ? s : -s; l.rotation.x = ph * 0.6 * walk + (i < 2 ? 0.45 * sit : -1.4 * sit) + (i < 2 ? -1.3 : 1.3) * rest; l.scale.y = 1 - rest * 0.5; });
    const breath = 1 + Math.sin(t * 2.2) * 0.02 * rest; this.body.scale.set(breath, breath, 1);
    this.tail.forEach((tg, i) => { tg.rotation.x = (i === 0 ? -0.6 : 0.35) * walk + (i === 0 ? -1.5 : -0.05) * sit + (i === 0 ? -1.6 : 0) * rest; tg.rotation.z = Math.sin(t * (this.purr > 0 ? 4 : 1.6) + i * 0.7) * (0.25 + rest * 0.25) + rest * 0.45; });
    let hy = 0, hx = rest * 0.3;
    if (this.lookAt) { const ang = angDiff(this.yaw, Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z)); hy = clamp(ang, -1.2, 1.2); hx = -0.2; }
    this.head.rotation.y += (hy - this.head.rotation.y) * Math.min(1, dt * 5); this.head.rotation.x += (hx - this.head.rotation.x) * Math.min(1, dt * 5);
    this.head.position.y = 0.07 - rest * 0.05;
  }
}

// ---------- Pigeons ----------
class Pigeon {
  constructor(perch) {
    this.root = new THREE.Group(); scene.add(this.root);
    const grey = 0x8b919c, dark = 0x5a606b;
    this.root.add(new THREE.Mesh(mergeGeometries([partGeo(G_.sphL, grey, 0, 0.07, 0, 0, 0, 0, 0.06, 0.055, 0.09), partGeo(G_.box(0.06, 0.012, 0.07), dark, 0, 0.07, -0.1, 0.3), partGeo(G_.cyl(0.006, 0.006, 0.05, 4), 0xd06a6a, 0.02, 0.025, 0), partGeo(G_.cyl(0.006, 0.006, 0.05, 4), 0xd06a6a, -0.02, 0.025, 0)]), CHAR_MAT));
    this.head = new THREE.Group(); this.head.position.set(0, 0.11, 0.06); this.root.add(this.head);
    this.head.add(new THREE.Mesh(mergeGeometries([partGeo(G_.sphL, 0x6d7d86, 0, 0.0, 0.0, 0, 0, 0, 0.032, 0.034, 0.034), partGeo(G_.sphL, 0x5c8a6e, 0, -0.03, -0.01, 0, 0, 0, 0.036, 0.025, 0.034), partGeo(G_.cone(0.008, 0.03, 4), 0x333333, 0, -0.004, 0.04, Math.PI / 2), partGeo(G_.sphL, 0xf08a2a, 0.022, 0.01, 0.02, 0, 0, 0, 0.006, 0.006, 0.006), partGeo(G_.sphL, 0xf08a2a, -0.022, 0.01, 0.02, 0, 0, 0, 0.006, 0.006, 0.006)]), CHAR_MAT));
    this.wings = [];
    for (const s of [1, -1]) { const w = new THREE.Group(); w.position.set(s * 0.045, 0.085, 0); const m = new THREE.Mesh(partGeo(G_.sphL, dark, s * 0.05, 0, -0.02, 0, 0, 0, 0.06, 0.012, 0.075), CHAR_MAT); w.add(m); this.root.add(w); this.wings.push(w); }
    this.perch = perch; this.pos = perch.clone(); this.yaw = rand() * TAU; this.state = 'perch'; this.t = rand() * 10; this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.f = 0;
  }
  update(dt, player) {
    this.t += dt;
    if (this.state === 'perch') {
      const d = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
      if (d < 3.2 && Math.abs(player.y - this.pos.y) < 3 || rand() < dt * 0.004) { this.state = 'fly'; this.from.copy(this.pos); this.perch = pick(PERCHES.filter((p) => p.distanceTo(this.pos) < 70 && p.distanceTo(this.pos) > 8)) || pick(PERCHES); this.to.copy(this.perch); this.f = 0; this.dur = this.from.distanceTo(this.to) / 9 + 0.5; }
      this.head.position.z = 0.06 + Math.max(0, Math.sin(this.t * 2.3)) ** 6 * 0.03; this.head.rotation.x = Math.sin(this.t * 0.7) > 0.9 ? 0.6 : 0;
      this.wings.forEach((w, i) => (w.rotation.z = 0));
      if (rand() < dt * 0.3) this.yaw += rr(-1, 1);
    } else {
      this.f += dt / this.dur; const f = clamp(this.f, 0, 1);
      this.pos.lerpVectors(this.from, this.to, f); this.pos.y += Math.sin(f * Math.PI) * (6 + this.dur);
      this.yaw = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      this.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.sin(this.t * 28) * 0.9));
      if (f >= 1) this.state = 'perch';
    }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
}

// ---------- Snowmane the white dragon ----------
const DRAGON = { obj: null, pts: [], breathe: 0, purr: 0 };
function loadDragon(onDone) {
  const bin = Uint8Array.from(atob(DRAGON_GLB), (c) => c.charCodeAt(0)).buffer;
  new GLTFLoader().parse(bin, '', (gltf) => {
    const obj = gltf.scene, s = 1.7;
    const scales = TEX.roof.clone(); scales.needsUpdate = true; scales.repeat.set(9, 9);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xdfe7fb, roughness: 0.38, metalness: 0.05, sheen: 1.0, sheenColor: new THREE.Color(0x9fc2ff), sheenRoughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3, map: scales, envMapIntensity: 0.9 });
    obj.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.receiveShadow = true; } });
    // closed eyelids
    for (const z of [-0.05, -1.15]) { const lid = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b7a9a })); lid.rotation.z = Math.PI / 2; lid.position.set(5.95, 1.28, z); obj.add(lid); }
    const y = LAIR_Y - 0.25;
    obj.scale.setScalar(s); obj.position.set(LAIR.x, y, LAIR.z); obj.rotation.y = Math.PI;
    scene.add(obj); DRAGON.obj = obj; DRAGON.y = y; DRAGON.s = s;
    obj.updateMatrixWorld(true);
    const W = (x, yy, z) => new THREE.Vector3(x, yy, z).applyMatrix4(obj.matrixWorld);
    // colliders (local boxes transformed)
    for (const [x0, x1, z0, z1, h] of [[-5.2, 4.4, -2.8, 2.6, 4.6], [4.4, 7.4, -1.8, 0.5, 2.2], [-5.8, 3.5, -5.8, -2.8, 1.5]]) { const c = W((x0 + x1) / 2, 0, (z0 + z1) / 2); addCollider(c.x, c.z, (x1 - x0) / 2 * s, (z1 - z0) / 2 * s, Math.PI, y, y + h * s); }
    DRAGON.snout = W(7.1, 0.9, -1.1); DRAGON.head = W(5.6, 1.2, -0.6);
    DRAGON.pts = [W(7.6, 0.5, -0.4), W(1.5, 0.5, 3.2), W(0, 0.5, -3.4), W(-6.2, 0.5, 0)];
    onDone && onDone();
  }, (e) => console.error('dragon load failed', e));
}
