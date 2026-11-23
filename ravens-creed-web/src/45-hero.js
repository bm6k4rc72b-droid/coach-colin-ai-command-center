// ===== Bjorn Vargrsson, his Dane axe and wrist-seax =====
const HERO = { name: 'Bjorn' };
function ravenCloakTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#2b2622'); grd.addColorStop(1, '#1c1916'); g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  const n = g.getImageData(0, 0, 256, 512); for (let k = 0; k < n.data.length; k += 4) { const v = (Math.random() - 0.5) * 18; n.data[k] += v; n.data[k + 1] += v; n.data[k + 2] += v; } g.putImageData(n, 0, 0);
  // gold raven, wings spread
  g.save(); g.translate(128, 190); g.fillStyle = '#b8913f'; g.strokeStyle = '#7a5e24'; g.lineWidth = 2;
  const wing = (s) => { g.beginPath(); g.moveTo(0, 0); for (let i = 0; i <= 5; i++) { const x = s * (18 + i * 17), y = -40 + i * 9; g.lineTo(x, y); g.lineTo(x - s * 6, y + 14); } g.lineTo(s * 10, 22); g.closePath(); g.fill(); g.stroke(); };
  wing(1); wing(-1);
  g.beginPath(); g.ellipse(0, 10, 13, 32, 0, 0, TAU); g.fill(); g.beginPath(); g.arc(0, -28, 11, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(-6, -30); g.lineTo(0, -46); g.lineTo(6, -30); g.fill();
  g.beginPath(); g.moveTo(-14, 38); g.lineTo(0, 70); g.lineTo(14, 38); g.fill(); g.restore();
  g.fillStyle = 'rgba(184,145,63,0.85)'; g.fillRect(0, 0, 256, 10); g.fillRect(0, 498, 256, 14);
  // tattered hem
  g.globalCompositeOperation = 'destination-out'; for (let x = 0; x < 256; x += 12) { g.beginPath(); g.moveTo(x, 512); g.lineTo(x + 6, 512 - rr(10, 40)); g.lineTo(x + 12, 512); g.fill(); }
  return toTex(c, true, false);
}
function makeHero() {
  const leather = 0x2b211b, fur = 0x6e6a63, gold = 0xb8913f, steel = 0x5d6066, ink = 0x2a3440, hair = 0x3b2618;
  const ch = new Char({
    name: 'Bjorn', height: 1.9, skin: 0xc99a78, hair, hairStyle: 'short', eyes: 0x5a7a8a, top: leather, sleeve: 0x2e2620, trim: gold, cuffs: 0x5a4a30,
    belt: 0x3a2618, pants: 0x2a2a2c, boots: 0x241c16, gloves: 0x3a2a1e,
    parts(BK, mk, pg, G) {
      // short full beard, moustache
      BK.head.push(pg(G.sph, hair, 0, -0.025, 0.066, 0, 0, 0, 0.078, 0.064, 0.056), pg(G.sph, hair, 0, -0.055, 0.05, 0, 0, 0, 0.055, 0.045, 0.045));
      for (const s of [1, -1]) BK.head.push(pg(G.sph, hair, s * 0.068, 0.005, 0.04, 0, 0, 0, 0.036, 0.052, 0.048), pg(G.sph, hair, s * 0.022, 0.038, 0.108, 0, 0, s * 0.3, 0.026, 0.009, 0.011));
      // rune tattoos on brow and cheek
      for (const [x, y, z, rz] of [[0.025, 0.13, 0.101, 0.4], [-0.02, 0.135, 0.101, -0.3], [0.062, 0.07, 0.09, 1.2], [0.07, 0.05, 0.085, 0.2], [0.058, 0.035, 0.09, -0.5]]) BK.head.push(pg(G.box(0.004, 0.028, 0.004), ink, x, y, z, 0, 0.5, rz));
      // shaved sides: a braided crown ridge
      for (let i = 0; i < 6; i++) BK.head.push(pg(G.sph, i % 2 ? hair : 0x4a3020, 0, 0.19 - i * 0.012, -0.03 - i * 0.03, 0, 0, 0, 0.028, 0.022, 0.03));
      // wolf-fur mantle over the shoulders
      BK.chest.push(pg(G.sph, fur, 0, 0.25, -0.01, 0, 0, 0, 0.27, 0.1, 0.2), pg(G.sph, 0x585550, 0.12, 0.23, 0.02, 0, 0, 0, 0.13, 0.08, 0.15), pg(G.sph, 0x585550, -0.12, 0.23, 0.02, 0, 0, 0, 0.13, 0.08, 0.15));
      // crossed leather straps, gold brooch, riveted plates
      for (const s of [1, -1]) BK.chest.push(pg(G.box(0.05, 0.42, 0.016), 0x3a2618, s * 0.02, 0.08, 0.124, 0, 0, s * 0.55));
      BK.chest.push(pg(G.cyl(0.035, 0.035, 0.02, 12), gold, 0.1, 0.2, 0.13, Math.PI / 2));
      for (let i = 0; i < 3; i++) BK.chest.push(pg(G.box(0.26 - i * 0.02, 0.035, 0.02), steel, 0, 0.0 + i * 0.055, 0.121));
      // gold-tooled bracers
      for (const L of ['L', 'R']) BK['fa' + L].push(pg(G.cyl(0.054, 0.048, 0.16, 10), 0x4a3a28, 0, -0.17, 0), pg(G.box(0.012, 0.12, 0.004), gold, 0, -0.17, 0.052), pg(G.cyl(0.056, 0.056, 0.012, 10), gold, 0, -0.1, 0));
      // mail skirt and leather tassets
      BK.hips.push(pg(G.cyl(0.17, 0.25, 0.34, 16), steel, 0, -0.14, 0, 0, 0, 0, 1, 1, 0.85));
      for (const [x, z, ry] of [[0.08, 0.13, 0.2], [-0.08, 0.13, -0.2], [0.18, 0, 1.5], [-0.18, 0, -1.5]]) BK.hips.push(pg(G.box(0.13, 0.3, 0.02), leather, x, -0.18, z, 0.08, ry));
      // leg wraps
      for (const L of ['L', 'R']) for (let i = 0; i < 4; i++) BK['sh' + L].push(pg(G.cyl(0.067, 0.067, 0.018, 10), 0x6a5a48, 0, -0.08 - i * 0.05, 0, 0.25));
    },
  });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.5 });
  ch.braid = new Strand(6, 0.06, 0.03, 0.016, hairMat, scene);
  ch.cape = new Cape(0xffffff); ch.cape.w = 0.5; ch.cape.h = 1.05; ch.cape.mesh.material.map = ravenCloakTexture(); ch.cape.mesh.material.alphaTest = 0.5; ch.cape.mesh.material.needsUpdate = true;
  ch.capeZ = -0.15;
  ch.updateCloth = (dt, ground, windV) => {
    if (!ch._last) ch._last = ch.root.position.clone();
    if (ch._last.distanceTo(ch.root.position) > 2.5) { ch.braid.init = false; ch.cape.init = false; }
    ch._last.copy(ch.root.position);
    ch.root.updateMatrixWorld(true);
    const J = ch.J, hc = J.head.localToWorld(new THREE.Vector3(0, 0.07, 0)), cc = J.chest.localToWorld(new THREE.Vector3(0, 0.1, -0.03));
    ch.braid.update(dt, J.head.localToWorld(new THREE.Vector3(0, 0.07, -0.16)), [[hc, 0.13 * ch.k], [cc, 0.2 * ch.k]], 9.8, windV);
    ch.cape.update(dt, ch, ground, windV);
  };
  ch.extras = [...ch.braid.meshes, ch.cape.mesh];
  return ch;
}
// Ornate Dane axe: long haft, bearded head with gold knotwork, iron butt spike
function makeSword() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9adb3, metalness: 1, roughness: 0.32, map: TEX.rock });
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.35, 8), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.7, map: TEX.wood }));
  haft.position.y = 0.45; g.add(haft);
  for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), MAT.gold); w.position.y = -0.1 + i * 0.07; g.add(w); }
  const sh = new THREE.Shape(); sh.moveTo(0, -0.06); sh.lineTo(0.08, -0.05); sh.quadraticCurveTo(0.16, -0.2, 0.3, -0.24); sh.quadraticCurveTo(0.34, 0, 0.3, 0.2); sh.quadraticCurveTo(0.16, 0.14, 0.08, 0.06); sh.lineTo(0, 0.06); sh.lineTo(0, -0.06);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 1 }), steel);
  head.geometry.translate(0, 0, -0.009); head.position.set(0.02, 1.02, 0); g.add(head);
  const inlay = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0xb8913f, metalness: 1, roughness: 0.3, map: TEX.bark, side: THREE.DoubleSide }));
  inlay.position.set(0.17, 1.02, 0.019); g.add(inlay);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 6), MAT.metal); spike.position.y = -0.27; spike.rotation.x = Math.PI; g.add(spike);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.tip = new THREE.Vector3(0.33, 1.02, 0); g.userData.base = new THREE.Vector3(0.05, 0.9, 0);
  return g;
}
function makeSeax() {
  const g = new THREE.Group();
  const sh = new THREE.Shape([new THREE.Vector2(-0.015, 0), new THREE.Vector2(0.018, 0), new THREE.Vector2(0.018, 0.17), new THREE.Vector2(0, 0.24), new THREE.Vector2(-0.015, 0.2)]);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 1, roughness: 0.15 }));
  g.add(blade); g.visible = false; return g;
}
