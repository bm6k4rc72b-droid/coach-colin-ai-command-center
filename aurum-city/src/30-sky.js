// ===== Clouds =====
const CLOUDS = [];
function buildSkyProps() {
  const c = makeCanvas(256), g = c.getContext('2d');
  for (let i = 0; i < 60; i++) { const x = 128 + rr(-80, 80), y = 140 + rr(-30, 24) - Math.abs(x - 128) * 0.25, r = rr(18, 46); const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  const tex = toTex(c, true, false);
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    const a = rand() * TAU, r = rr(500, 1700); s.position.set(Math.cos(a) * r, rr(300, 480), Math.sin(a) * r); s.scale.set(rr(260, 480), rr(110, 190), 1); scene.add(s); CLOUDS.push(s);
  }
}
const WIND = { t: { value: 0 }, player: { value: new THREE.Vector3() } };
