// ===== Rion Vale: the hero, and his greatsword =====
const HERO = { name: 'Rion Vale' };
function makeHero() {
  const coat = 0x1f2a44, steel = 0x9aa1aa, leather = 0x3a2618, gold = 0xc9a24a;
  const ch = new Char({
    name: HERO.name, height: 1.86, skin: 0xd9a682, hair: 0x3b2418, hairStyle: 'short', eyes: 0x3b5a7a, top: coat, sleeve: coat, trim: gold, cuffs: gold,
    belt: leather, pants: 0x2b2f36, boots: 0x1a1410, gloves: 0x2a2420,
    parts(BK, mk, pg, G) {
      // high collar, crossed leather straps with a gold clasp
      BK.chest.push(pg(G.cyl(0.085, 0.12, 0.1, 14), coat, 0, 0.29, -0.01));
      for (const s of [1, -1]) BK.chest.push(pg(G.box(0.05, 0.44, 0.018), leather, s * 0.02, 0.1, 0.122, 0, 0, s * 0.55), pg(G.box(0.05, 0.44, 0.018), leather, s * 0.02, 0.1, -0.122, 0, 0, s * 0.55));
      BK.chest.push(pg(G.cyl(0.035, 0.035, 0.02, 12), gold, 0, 0.1, 0.133, Math.PI / 2));
      // steel pauldron on the left shoulder, gauntlets on both arms
      BK.uaL.push(pg(G.sph, steel, 0.03, 0.02, 0, 0, 0, 0.3, 0.12, 0.075, 0.115), pg(G.sph, 0x7d848d, 0.05, -0.03, 0, 0, 0, 0.45, 0.1, 0.05, 0.1));
      for (const L of ['L', 'R']) BK['fa' + L].push(pg(G.cyl(0.056, 0.05, 0.14, 10), steel, 0, -0.17, 0), pg(G.box(0.03, 0.1, 0.008), gold, 0, -0.17, 0.053));
      // split coat tails hanging from the belt
      for (const [x, z, ry] of [[0.09, -0.12, 0.25], [-0.09, -0.12, -0.25], [0.15, 0.02, 1.4], [-0.15, 0.02, -1.4]]) BK.hips.push(pg(G.box(0.16, 0.5, 0.018), coat, x, -0.24, z, 0.12, ry));
      // belt pouches and a hip sheath strap
      for (const x of [-0.1, 0.1]) BK.spine.push(pg(G.box(0.06, 0.06, 0.04), leather, x, -0.02, 0.13));
      // eyebrows a little heavier, light stubble
      BK.head.push(pg(G.sph, 0x5a3e2c, 0, 0.0, 0.07, 0, 0, 0, 0.075, 0.06, 0.05));
    },
  });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.5 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0x2aa39c, roughness: 0.8, map: TEX.fabric });
  ch.tail = new Strand(5, 0.05, 0.03, 0.015, hairMat, scene);
  ch.scarf = [new Strand(10, 0.075, 0.035, 0.025, scarfMat, scene), new Strand(8, 0.075, 0.035, 0.025, scarfMat, scene)];
  ch.scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.032, 8, 18), scarfMat); ch.scarfRing.castShadow = true; scene.add(ch.scarfRing);
  ch.updateCloth = (dt, ground, windV) => {
    if (!ch._last) ch._last = ch.root.position.clone();
    if (ch._last.distanceTo(ch.root.position) > 2.5) { ch.tail.init = false; ch.scarf.forEach((s) => (s.init = false)); }
    ch._last.copy(ch.root.position);
    ch.root.updateMatrixWorld(true);
    const J = ch.J, hc = J.head.localToWorld(new THREE.Vector3(0, 0.07, 0)), cc = J.chest.localToWorld(new THREE.Vector3(0, 0.1, -0.03)), sc = J.spine.localToWorld(new THREE.Vector3(0, 0.03, 0));
    const cols = [[hc, 0.13 * ch.k], [cc, 0.19 * ch.k], [sc, 0.17 * ch.k]], w = windV.clone().multiplyScalar(1.4);
    ch.tail.update(dt, J.head.localToWorld(new THREE.Vector3(0, 0.08, -0.12)), [[hc, 0.13 * ch.k]], 9.8, w);
    ch.scarf[0].update(dt, J.neck.localToWorld(new THREE.Vector3(0.03, 0.06, -0.08)), cols, 9.8, w);
    ch.scarf[1].update(dt, J.neck.localToWorld(new THREE.Vector3(-0.04, 0.05, -0.08)), cols, 9.8, w.clone().set(w.x * 0.7, 0, w.z * 1.3));
    ch.scarfRing.position.copy(J.neck.localToWorld(new THREE.Vector3(0, 0.04, 0))); ch.scarfRing.quaternion.copy(J.neck.getWorldQuaternion(_q)); ch.scarfRing.rotateX(Math.PI / 2);
    ch.scarfRing.scale.setScalar(ch.k);
  };
  return ch;
}
// Circuit Edge: a long single-edged greatsword with a glowing inlay
function makeSword() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9d0d8, metalness: 1, roughness: 0.18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.8, roughness: 0.35 });
  const shape = new THREE.Shape([new THREE.Vector2(-0.12, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.13, 1.2), new THREE.Vector2(0.06, 1.52), new THREE.Vector2(-0.1, 1.38), new THREE.Vector2(-0.1, 0)]);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 1 }), steel);
  blade.geometry.translate(0, 0, -0.012); blade.position.y = 0.16; g.add(blade);
  for (const z of [0.022, -0.022]) { const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.08, 0.004), MAT.neonCyan); inlay.position.set(-0.01, 0.16 + 0.62, z); g.add(inlay); }
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.36, 0.04), dark); spine.position.set(-0.1, 0.16 + 0.68, 0); g.add(spine);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.1), MAT.goldBright); guard.position.y = 0.14; g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.3, 10), dark); grip.position.y = -0.02; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), MAT.goldBright); pommel.position.y = -0.19; g.add(pommel);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.tip = new THREE.Vector3(0.02, 1.62, 0); g.userData.base = new THREE.Vector3(0, 0.3, 0);
  return g;
}
