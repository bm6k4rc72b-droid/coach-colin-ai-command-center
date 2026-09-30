import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fbm, glowSprite } from './holo.js';
import { ndvi, K as KMAX } from '../sim/pasture.js';

// ─────────────────────────────────────────────────────────────────────────────
// RANCH OPS · the ranch: terrain, paddocks, barn, trees, flock, dog, coyotes,
// drone — plus a thermal (LWIR) rendering mode with an ironbow palette.
// ─────────────────────────────────────────────────────────────────────────────

export const BARN = { x: -40, z: -115 };
export const PEN = { x0: -80, x1: -50, z0: -95, z1: -75 };        // night pen beside the barn
export const TANK = { x: 12, z: -92 };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Terrain height (m): a gentle south-facing slope, rolling swells, a timbered ridge to the
// north (where the coyotes live) and a flat yard around the barn.
export function heightAt(x, z) {
  let h = 0.03 * z + 7 * (fbm(x / 240 + 3.1, 0.7, z / 240 + 1.7, 4) - 0.5) + 22 * smooth(150, 360, z) + 30 * smooth(320, 520, Math.abs(x)) + 10 * smooth(-200, -420, z);
  const dy = Math.hypot(x - BARN.x, (z - BARN.z) * 0.8), flat = smooth(70, 30, dy);
  const hy = 0.03 * BARN.z + 7 * (fbm(BARN.x / 240 + 3.1, 0.7, BARN.z / 240 + 1.7, 4) - 0.5);
  return h * (1 - flat) + hy * flat;
}

// Ironbow thermal palette: black → indigo → magenta → orange → yellow → white.
const IRON = [[0, 0, 0], [0.12, 0.02, 0.35], [0.5, 0.02, 0.55], [0.85, 0.2, 0.25], [1, 0.55, 0.05], [1, 0.9, 0.25], [1, 1, 0.95]];
export function ironbow(u, out = new THREE.Color()) {
  u = Math.min(1, Math.max(0, u)) * (IRON.length - 1); const i = Math.min(IRON.length - 2, Math.floor(u)), f = u - i;
  return out.setRGB(IRON[i][0] + (IRON[i + 1][0] - IRON[i][0]) * f, IRON[i][1] + (IRON[i + 1][1] - IRON[i][1]) * f, IRON[i][2] + (IRON[i + 1][2] - IRON[i][2]) * f, THREE.SRGBColorSpace);
}

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; return t;
}

export function buildWorld(pads) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#b9c6d6', 0.0011);
  const thermal = []; let thermalOn = false, lastMode = 'natural';                                   // [mesh, thermal material]
  const addThermal = (mesh, T, k = 1) => { mesh.userData.T = T; thermal.push({ mesh, k }); };

  // ── Sky, sun, moon, stars ────────────────────────
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const su = sky.material.uniforms; su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.82;
  const sun = new THREE.DirectionalLight('#fff1d6', 3.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -120; sc.right = sc.top = 120; sc.near = 10; sc.far = 900; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#bcd4ff', '#5a4a2a', 0.9); scene.add(hemi);
  const starG = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 1800; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = 5000, y = Math.abs(u); sp.push(Math.cos(a) * Math.sqrt(1 - y * y) * r, y * r * 0.9 + 200, Math.sin(a) * Math.sqrt(1 - y * y) * r); }
  starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: '#dfe8ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: '#f4f1e6', fog: false })); moon.position.set(-1800, 1500, 3000); scene.add(moon);
  const moonGlow = glowSprite('#cfe0ff', 900, 0.35); moonGlow.material.fog = false; moonGlow.position.copy(moon.position); scene.add(moonGlow);

  // ── Terrain ──────────────────────────────────────
  const SIZE = 1400, SEG = 280;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3), base = new Float32Array(tp.count);
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i); tp.setY(i, heightAt(x, z)); base[i] = fbm(x / 18, 4.2, z / 18, 3); }
  tg.computeVertexNormals(); tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const detail = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) { const x = Math.random() * W, y = Math.random() * H, l = 110 + Math.random() * 120; g.strokeStyle = `rgba(${l},${l},${l},0.55)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5); g.stroke(); }
  }, 220);
  // Thermal ground texture: soil and grass patches differ by a few tenths of a kelvin.
  const thermalTex = canvasTex(256, 256, (g, W, H) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, H); for (let i = 0; i < 900; i++) { const l = 190 + Math.random() * 65, r = 3 + Math.random() * 14; g.fillStyle = `rgba(${l},${l},${l},0.5)`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, r, 0, 7); g.fill(); } }, 90);
  thermalTex.colorSpace = THREE.NoColorSpace;
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(tg, terrainMat); terrain.receiveShadow = true; scene.add(terrain); addThermal(terrain, 'ground');
  const inPad = (x, z) => pads.find((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
  const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
  function paintTerrain(mode = 'natural') {
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), y = tp.getY(i), n = base[i], p = inPad(x, z);
      if (mode === 'ndvi' && p) {
        const v = ndvi(p.B + (n - 0.5) * 700);                        // red (bare) → yellow → deep green (lush)
        cA.setHSL(0.34 * Math.max(0, Math.min(1, (v - 0.6) / 0.28)), 0.9, 0.34);
      } else if (p) {
        const f = Math.min(1, p.B / KMAX + (n - 0.5) * 0.25);            // grazed = short, pale; rested = tall, deep green
        cA.set('#a39a55').lerp(cB.set('#3f6f25'), smooth(0.2, 0.75, f)).lerp(cC.set('#2c5a1c'), smooth(0.75, 1, f));
      } else if (Math.hypot(x - BARN.x, (z - BARN.z) * 0.8) < 55) cA.set('#8a7a5c').lerp(cB.set('#6f6a48'), n);
      else {
        cA.set('#8e8a4a').lerp(cB.set('#5d6b2e'), n);                    // native range grass
        if (z > 170) cA.lerp(cB.set('#3b4a26'), smooth(170, 260, z));    // under the timber
        if (y > 30) cA.lerp(cB.set('#7c7564'), smooth(30, 60, y));       // rock at altitude
      }
      cols[i * 3] = cA.r; cols[i * 3 + 1] = cA.g; cols[i * 3 + 2] = cA.b;
    }
    tg.attributes.color.needsUpdate = true;
    if (typeof growTufts === 'function') { growTufts(); tufts.visible = mode !== 'ndvi' && !thermalOn; lastMode = mode; }
  }

  // ── Grass tufts inside the paddocks: height and colour follow each paddock's biomass ──
  const bladeG = (() => { const v = []; for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI, c = Math.cos(a) * 0.07, s2 = Math.sin(a) * 0.07; v.push(-c, 0, -s2, c, 0, s2, 0, 1, 0); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; })();
  const TUFTS = 60000, tufts = new THREE.InstancedMesh(bladeG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }), TUFTS);
  const tuftXZ = new Float32Array(TUFTS * 3);
  for (let i = 0; i < TUFTS; i++) { const p = pads[i % pads.length]; tuftXZ[i * 3] = p.x0 + 0.5 + Math.random() * (p.x1 - p.x0 - 1); tuftXZ[i * 3 + 1] = p.z0 + 0.5 + Math.random() * (p.z1 - p.z0 - 1); tuftXZ[i * 3 + 2] = Math.random(); }
  tufts.receiveShadow = true; scene.add(tufts);
  function growTufts() {
    const q0 = new THREE.Quaternion(), s0 = new THREE.Vector3(), p0 = new THREE.Vector3(), c0 = new THREE.Color(), m0 = new THREE.Matrix4(), yA = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < TUFTS; i++) {
      const x = tuftXZ[i * 3], z = tuftXZ[i * 3 + 1], r = tuftXZ[i * 3 + 2], p = pads[i % pads.length], f = Math.min(1, p.B / KMAX);
      const h = 0.04 + 0.34 * f * f * (0.6 + r * 0.8);                     // sward height ~ biomass
      q0.setFromAxisAngle(yA, r * 6.28); s0.set(1 + r, h, 1 + r); p0.set(x, heightAt(x, z) - 0.02, z); m0.compose(p0, q0, s0); tufts.setMatrixAt(i, m0);
      tufts.setColorAt(i, c0.set('#8f8a4c').lerp(new THREE.Color('#3e7a26'), Math.min(1, f * 1.4)).offsetHSL((r - 0.5) * 0.03, 0, (r - 0.5) * 0.08));
    }
    tufts.instanceMatrix.needsUpdate = true; tufts.instanceColor.needsUpdate = true;
  }

  paintTerrain();

  // ── Fences (posts + three wires) ─────────────────
  const postPts = [], wireSegs = [];
  const fenceLine = (x0, z0, x1, z1, gap) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 4));
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      if (gap && Math.hypot(x - gap.x, z - gap.z) < 2.2) continue;
      postPts.push([x, z]);
      if (i < n) { const u2 = (i + 1) / n, x2 = x0 + (x1 - x0) * u2, z2 = z0 + (z1 - z0) * u2; if (gap && (Math.hypot(x2 - gap.x, z2 - gap.z) < 2.2)) continue; for (const hh of [0.35, 0.75, 1.1]) wireSegs.push(x, heightAt(x, z) + hh, z, x2, heightAt(x2, z2) + hh, z2); }
    }
  };
  for (const p of pads) { fenceLine(p.x0, p.z0, p.x1, p.z0, p.gate); fenceLine(p.x1, p.z0, p.x1, p.z1); fenceLine(p.x1, p.z1, p.x0, p.z1); fenceLine(p.x0, p.z1, p.x0, p.z0); }
  fenceLine(PEN.x0, PEN.z0, PEN.x1, PEN.z0); fenceLine(PEN.x1, PEN.z0, PEN.x1, PEN.z1, { x: PEN.x1, z: (PEN.z0 + PEN.z1) / 2 }); fenceLine(PEN.x1, PEN.z1, PEN.x0, PEN.z1); fenceLine(PEN.x0, PEN.z1, PEN.x0, PEN.z0);
  const postM = new THREE.MeshStandardMaterial({ color: '#6b5238', roughness: 0.9 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6), postM, postPts.length);
  const m4 = new THREE.Matrix4();
  postPts.forEach(([x, z], i) => { m4.makeTranslation(x, heightAt(x, z) + 0.6, z); posts.setMatrixAt(i, m4); });
  posts.castShadow = true; scene.add(posts); addThermal(posts, 'wood');
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wireSegs, 3));
  const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#c9ccd0', transparent: true, opacity: 0.55 })); scene.add(wires);

  // ── Barn, silo, house, tank, troughs ─────────────
  const yard = new THREE.Group(); scene.add(yard);
  const by = heightAt(BARN.x, BARN.z);
  const red = new THREE.MeshStandardMaterial({ color: '#7d2a1f', roughness: 0.8 }), white = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.7 });
  const roofM = new THREE.MeshStandardMaterial({ color: '#3b3f45', roughness: 0.55, metalness: 0.6 });
  const barn = new THREE.Group(); barn.position.set(BARN.x, by, BARN.z); yard.add(barn);
  const body = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 16), red); body.position.y = 4.5; barn.add(body);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-8.8, 0); roofShape.lineTo(0, 6.5); roofShape.lineTo(8.8, 0); roofShape.lineTo(-8.8, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 27, bevelEnabled: false }), roofM); roof.rotation.y = Math.PI / 2; roof.position.set(-13.5, 9, 0); barn.add(roof);
  for (const s of [1, -1]) { const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 6.5), white); door.position.set(s * 13.01, 3.3, 0); door.rotation.y = s * Math.PI / 2; barn.add(door); const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.6, 0.25), white); x1.position.set(s * 13.1, 3.3, 0); x1.rotation.set(0, s * Math.PI / 2, 0.73); barn.add(x1); const x2 = x1.clone(); x2.rotation.z = -0.73; barn.add(x2); }
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 17, 24), new THREE.MeshStandardMaterial({ color: '#b8bcc2', roughness: 0.35, metalness: 0.8 })); silo.position.set(BARN.x + 18, by + 8.5, BARN.z - 4); yard.add(silo);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 12, 0, 6.283, 0, Math.PI / 2), silo.material); dome.position.set(BARN.x + 18, by + 17, BARN.z - 4); yard.add(dome);
  const house = new THREE.Group(); house.position.set(BARN.x - 45, heightAt(BARN.x - 45, BARN.z - 15), BARN.z - 15); yard.add(house);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 10), white); hb.position.y = 2.5; house.add(hb);
  const hs = new THREE.Shape(); hs.moveTo(-5.6, 0); hs.lineTo(0, 3.4); hs.lineTo(5.6, 0); hs.lineTo(-5.6, 0);
  const hr = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 15, bevelEnabled: false }), roofM); hr.rotation.y = Math.PI / 2; hr.position.set(-7.5, 5, 0); house.add(hr);
  const winM = new THREE.MeshStandardMaterial({ color: '#1a1a14', emissive: '#ffb65c', emissiveIntensity: 0 });
  for (let i = -1; i <= 1; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), winM); w.position.set(i * 4, 2.8, 5.02); house.add(w); }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 24), new THREE.MeshStandardMaterial({ color: '#2f4f5f', roughness: 0.4, metalness: 0.5 })); tank.position.set(TANK.x, heightAt(TANK.x, TANK.z) + 1.5, TANK.z); yard.add(tank);
  const troughM = new THREE.MeshStandardMaterial({ color: '#7f878d', metalness: 0.7, roughness: 0.35 }), waterM = new THREE.MeshStandardMaterial({ color: '#4f7c91', roughness: 0.05, metalness: 0.2 });
  const troughs = pads.map((p) => { const t = { x: (p.x0 + p.x1) / 2 + 30, z: p.z0 + 6 }; const g = new THREE.Group(); g.position.set(t.x, heightAt(t.x, t.z), t.z); const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 0.8), troughM); b.position.y = 0.3; g.add(b); const w = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), waterM); w.rotation.x = -Math.PI / 2; w.position.y = 0.5; g.add(w); scene.add(g); return t; });
  yard.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  addThermal(body, 'barn'); addThermal(roof, 'roof'); addThermal(hb, 'house'); addThermal(silo, 'metal'); addThermal(dome, 'metal'); addThermal(tank, 'water');
  const yardLight = new THREE.PointLight('#ffc27a', 0, 60, 2); yardLight.position.set(BARN.x + 13.5, by + 7.5, BARN.z + 9); scene.add(yardLight);
  const yardGlow = glowSprite('#ffc27a', 6, 0); yardGlow.position.copy(yardLight.position); scene.add(yardGlow);

  // ── Trees: timber on the ridge + scattered shade trees ──
  const treePos = [];
  for (let i = 0; i < 900; i++) { const x = (Math.random() - 0.5) * 1300, z = 170 + Math.random() * 520; if (fbm(x / 90, 2, z / 90, 2) > 0.42 || z > 250) treePos.push([x, z, 0.8 + Math.random() * 0.7]); }
  for (let i = 0; i < 60; i++) { const x = (Math.random() - 0.5) * 1200, z = -500 + Math.random() * 640; if (!inPad(x, z) && Math.hypot(x - BARN.x, z - BARN.z) > 60 && !(Math.abs(x) < 160 && z > -60 && z < 130)) treePos.push([x, z, 0.9 + Math.random() * 0.8]); }
  const coneG = new THREE.ConeGeometry(3.4, 13, 7); coneG.translate(0, 9, 0);
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 4, 6); trunkG.translate(0, 2, 0);
  const pines = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), treePos.length);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#4a3525', roughness: 1 }), treePos.length);
  const q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color();
  treePos.forEach(([x, z, s], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28); pv.set(x, heightAt(x, z) - 0.3, z); sv.set(s, s * (0.85 + Math.random() * 0.4), s); m4.compose(pv, q, sv); pines.setMatrixAt(i, m4); trunks.setMatrixAt(i, m4); pines.setColorAt(i, cc.setHSL(0.27 + Math.random() * 0.06, 0.35, 0.16 + Math.random() * 0.08)); });
  pines.castShadow = trunks.castShadow = true; pines.receiveShadow = true; scene.add(pines, trunks); addThermal(pines, 'tree'); addThermal(trunks, 'tree');
  const treeXZ = treePos;

  // ── Sheep (instanced: fleece, head, legs) ────────
  const woolG = new THREE.SphereGeometry(0.5, 18, 12); { const p = woolG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.08 * (fbm(x * 9, y * 9, z * 9, 2) - 0.5); p.setXYZ(i, x * n * 0.82, y * n * 0.78, z * n * 1.25); } woolG.computeVertexNormals(); }
  const headG = new THREE.SphereGeometry(0.16, 12, 10); headG.scale(0.8, 0.85, 1.35);
  const legG = (() => { const parts = []; for (const [x, z] of [[0.2, 0.36], [-0.2, 0.36], [0.2, -0.36], [-0.2, -0.36]]) { const g = new THREE.CylinderGeometry(0.045, 0.04, 0.52, 6); g.translate(x, 0.26, z); parts.push(g); } return mergeGeos(parts); })();
  const N = 140;
  const woolM = new THREE.MeshStandardMaterial({ color: '#b9b09c', roughness: 1 });   // fleece albedo ≈ 0.45 — greasy wool is not snow
  const wool = new THREE.InstancedMesh(woolG, woolM, N), heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: '#221c18', roughness: 0.7 }), N), legs = new THREE.InstancedMesh(legG, new THREE.MeshStandardMaterial({ color: '#1d1916', roughness: 0.8 }), N);
  for (const m of [wool, heads, legs]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  for (let i = 0; i < N; i++) { wool.setColorAt(i, cc.set('#ffffff').offsetHSL(0, 0, -Math.random() * 0.12)); heads.setColorAt(i, cc.set('#ffffff')); legs.setColorAt(i, cc.set('#ffffff')); }
  addThermal(wool, 'sheepWool'); addThermal(heads, 'sheepHead'); addThermal(legs, 'sheepLeg');

  // ── Guardian dog, coyotes ────────────────────────
  const quad = (fur, len, h, tail) => {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: fur, roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * h, len, 4, 10), m); b.rotation.x = Math.PI / 2; b.position.y = 0.55 * h; g.add(b);
    const hd = new THREE.Mesh(new THREE.ConeGeometry(0.15 * h, 0.4 * h, 8), m); hd.rotation.x = Math.PI / 2; hd.position.set(0, 0.72 * h, len / 2 + 0.28 * h); g.add(hd);
    for (const s of [1, -1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05 * h, 0.14 * h, 4), m); ear.position.set(s * 0.08 * h, 0.86 * h, len / 2 + 0.16 * h); g.add(ear); }
    const legsA = []; for (const [x, z] of [[0.12, len / 2], [-0.12, len / 2], [0.12, -len / 2], [-0.12, -len / 2]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * h, 0.035 * h, 0.5 * h, 6), m); l.position.set(x * h, 0.25 * h, z); g.add(l); legsA.push(l); }
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * h, 0.07 * h, tail, 6), m); t.position.set(0, 0.55 * h, -len / 2 - tail / 2); t.rotation.x = 1.1; g.add(t);
    const eyes = []; for (const s of [1, -1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025 * h, 6, 6), new THREE.MeshBasicMaterial({ color: '#0a0a0a' })); e.position.set(s * 0.07 * h, 0.8 * h, len / 2 + 0.3 * h); g.add(e); eyes.push(e); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; addThermal(o, 'fur'); } });
    g.userData.legs = legsA; g.userData.eyes = eyes; scene.add(g); return g;
  };
  const dog = quad('#efe9dc', 0.75, 1.25, 0.55);
  const coyotes = [quad('#8f7a5e', 0.6, 1.0, 0.45), quad('#7d6a52', 0.58, 0.95, 0.45)];
  for (const c of coyotes) c.visible = false;

  // ── Drone ────────────────────────────────────────
  const drone = new THREE.Group(); scene.add(drone);
  const carbon = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.35, metalness: 0.5 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.34), new THREE.MeshStandardMaterial({ color: '#d7dade', roughness: 0.35, metalness: 0.3 })); drone.add(shell);
  const rotors = [];
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.3), carbon); arm.position.set(x * 0.13, 0, z * 0.13); arm.rotation.y = Math.atan2(x, z); drone.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 10), carbon); motor.position.set(x * 0.24, 0.03, z * 0.24); drone.add(motor);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshBasicMaterial({ color: '#9aa4b0', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.set(x * 0.24, 0.06, z * 0.24); drone.add(disc);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.004, 0.02), carbon); blade.position.set(x * 0.24, 0.062, z * 0.24); drone.add(blade); rotors.push(blade);
  }
  const gimbal = new THREE.Group(); gimbal.position.set(0, -0.08, 0.14); drone.add(gimbal);
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06), carbon); gimbal.add(camBody);
  const navL = glowSprite('#ff2a2a', 0.5, 1), navR = glowSprite('#2aff6a', 0.5, 1), strobe = glowSprite('#ffffff', 1.8, 0);
  navL.position.set(-0.26, 0, 0.26); navR.position.set(0.26, 0, 0.26); strobe.position.set(0, 0.07, -0.1); drone.add(navL, navR, strobe);
  const spot = new THREE.SpotLight('#f4f7ff', 0, 160, 0.32, 0.5, 2); spot.position.set(0, -0.1, 0); drone.add(spot, spot.target); spot.target.position.set(0, -10, 6);
  const beamG = new THREE.ConeGeometry(12, 60, 24, 1, true); beamG.translate(0, -30, 0);
  const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0.022, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.visible = false; drone.add(beam);
  drone.traverse((o) => { if (o.isMesh && o.material.type !== 'MeshBasicMaterial') addThermal(o, 'drone'); });
  drone.scale.setScalar(2.2);                           // readable at ranch scale (the real one is ~0.35 m across)

  // Survey footprint & path overlays.
  const footprint = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3].map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.9, fog: false }));
  footprint.frustumCulled = false; scene.add(footprint);
  const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#ff4fd8', dashSize: 4, gapSize: 3, transparent: true, opacity: 0.8, fog: false })); path.frustumCulled = false; scene.add(path);
  const markers = new THREE.Group(); scene.add(markers);

  // ── Day / night / thermal ────────────────────────
  const W = { scene, sky, sun, hemi, stars, moon, moonGlow, terrain, paintTerrain, wool, heads, legs, dog, coyotes, drone, rotors, gimbal, spot, beam, navL, navR, strobe, footprint, path, markers, troughs, yardLight, yardGlow, winM, treeXZ, thermal, isThermal: false, night: false };
  W.setTime = (hour) => {
    // Sun elevation for a mid-latitude spring day: peaks ~55° at 13:00, sets ~19:30.
    const el = 55 * Math.sin(((hour - 6.5) / 13) * Math.PI), az = ((hour - 13) / 12) * Math.PI;
    const night = el < -4; W.night = night; W.hour = hour;
    const phi = THREE.MathUtils.degToRad(90 - el), dir = new THREE.Vector3().setFromSphericalCoords(1, phi, az + Math.PI);
    su.sunPosition.value.copy(dir);
    sun.position.copy(dir).multiplyScalar(600); sun.intensity = night ? 0.7 : 3.2 * smooth(-2, 12, el);
    sun.color.set(night ? '#8fa7d9' : el < 12 ? '#ffc58a' : '#fff1d6');
    if (night) sun.position.set(-360, 300, 600);
    hemi.intensity = night ? 0.12 : 0.25 + 0.75 * smooth(-4, 25, el);
    scene.environmentIntensity = night ? 0.015 : 0.08 + 0.22 * smooth(-4, 25, el);        // the IBL must dim with the sky hemi.color.set(night ? '#5a6fa0' : '#bcd4ff');
    sky.visible = !night; stars.visible = moon.visible = moonGlow.visible = night;
    scene.background = night ? new THREE.Color('#03050c') : null;
    scene.fog.color.set(night ? '#070a14' : el < 12 ? '#e0c3a3' : '#b9c6d6'); scene.fog.density = night ? 0.0016 : 0.0011;
    yardLight.intensity = night ? 900 : 0; yardGlow.material.opacity = night ? 0.9 : 0; winM.emissiveIntensity = night ? 2.2 : 0;
    for (const c of coyotes) for (const e of c.userData.eyes) e.material.color.set(night ? '#9dff9a' : '#0a0a0a');   // eyeshine (tapetum lucidum)
    return { el, night };
  };
  // Thermal: swap every registered mesh to an unlit ironbow colour for its surface temperature.
  const orig = new Map(), tmats = new Map();
  W.setThermal = (on, airC, sheep) => {
    W.isThermal = on; thermalOn = on; wires.visible = !on; tufts.visible = !on && lastMode !== 'ndvi'; scene.fog.density = on ? 0 : (W.night ? 0.0016 : 0.0011); sky.visible = !on && !W.night; stars.visible = moon.visible = moonGlow.visible = !on && W.night;
    if (on) scene.background = ironbow(0.04); else scene.background = W.night ? new THREE.Color('#03050c') : null;
    const lo = airC - (W.night ? 5 : 8), hi = airC + (W.night ? 20 : 24), u = (T) => (T - lo) / (hi - lo);
    const surfT = { ground: airC + (W.night ? 1 : 1), wood: airC + (W.night ? -1 : 4), barn: airC + (W.night ? 2 : 9), roof: airC + (W.night ? -3 : 14), house: airC + (W.night ? 5 : 8), metal: airC + (W.night ? -3 : 12), water: airC - 3, tree: airC + (W.night ? 0.5 : 1), fur: airC + (37.5 - airC) * 0.55, drone: airC + 18, sheepWool: airC + (39 - airC) * 0.25, sheepHead: airC + (39 - airC) * 0.7, sheepLeg: airC + (39 - airC) * 0.45 };
    for (const { mesh } of thermal) {
      if (!orig.has(mesh)) orig.set(mesh, mesh.material);
      if (on) {
        const T = surfT[mesh.userData.T] ?? airC; let m = tmats.get(mesh);
        if (!m) { m = new THREE.MeshBasicMaterial({ map: mesh === terrain ? thermalTex : null }); tmats.set(mesh, m); }   // grass texture keeps the ground from reading flat
        m.color.copy(ironbow(u(T))); if (mesh.isInstancedMesh && mesh.instanceColor) m.color.set('#ffffff');   // instance colours carry the palette
        mesh.material = m;
      } else mesh.material = orig.get(mesh);
    }
    // Per-sheep: fever shows as a hotter face and fleece (instance colours).
    for (let i = 0; i < N; i++) {
      const s = sheep[i];
      if (on && s) {
        const core = s.dead ? airC : s.core;
        wool.setColorAt(i, ironbow(u(airC + (core - airC) * 0.25))); heads.setColorAt(i, ironbow(u(airC + (core - airC) * 0.72))); legs.setColorAt(i, ironbow(u(airC + (core - airC) * 0.45)));
      } else if (!on) { wool.setColorAt(i, cc.set('#ffffff').offsetHSL(0, 0, -((i * 0.37) % 1) * 0.12)); heads.setColorAt(i, cc.set('#ffffff')); legs.setColorAt(i, cc.set('#ffffff')); }
    }
    for (const m of [wool, heads, legs]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Posts and pines keep their instance colours in visible light; in thermal they get the palette colour.
    if (on) { for (let i = 0; i < pines.count; i++) pines.setColorAt(i, ironbow(u(surfT.tree + (Math.random() - 0.5)))); pines.instanceColor.needsUpdate = true; }
    else { for (let i = 0; i < pines.count; i++) pines.setColorAt(i, cc.setHSL(0.27 + ((i * 0.13) % 1) * 0.06, 0.35, 0.16 + ((i * 0.29) % 1) * 0.08)); pines.instanceColor.needsUpdate = true; }
  };

  // Pose the flock from simulation state.
  const qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc3 = new THREE.Vector3(1, 1, 1), hp = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  W.poseFlock = (sheep) => {
    for (let i = 0; i < N; i++) {
      const s = sheep[i];
      if (!s || s.dead) { wool.setMatrixAt(i, zero); heads.setMatrixAt(i, zero); legs.setMatrixAt(i, zero); continue; }
      const y = heightAt(s.x, s.z), bob = Math.abs(Math.sin(s.phase * 2)) * Math.min(0.08, (s.speed || 0) * 0.05), sz = 0.85 + ((s.w - 50) / 40) * 0.3;
      qq.setFromAxisAngle(up, s.heading); sc3.setScalar(sz);
      pv.set(s.x, y + 0.72 * sz + bob, s.z); m4.compose(pv, qq, sc3); wool.setMatrixAt(i, m4);
      pv.set(s.x, y, s.z); m4.compose(pv, qq, sc3); legs.setMatrixAt(i, m4);
      const grazing = (s.speed || 0) < 0.2 && !s.lost && !(s.fear > 0.1), dip = grazing ? 0.45 + 0.08 * Math.sin(s.phase * 0.7) : 0;
      hp.set(0, 0.86 - dip, 0.72 - dip * 0.15).multiplyScalar(sz).applyQuaternion(qq); pv.set(s.x + hp.x, y + hp.y, s.z + hp.z);
      const hq = qq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dip * 1.4)); m4.compose(pv, hq, sc3); heads.setMatrixAt(i, m4);
    }
    wool.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = legs.instanceMatrix.needsUpdate = true;
  };
  W.poseAnimal = (g, a, t) => {
    g.visible = a.visible !== false; if (!g.visible) return;
    g.position.set(a.x, heightAt(a.x, a.z), a.z); g.rotation.y = a.heading;
    const sp = a.speed || 0; g.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (4 + sp * 2.5) + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(0.7, sp * 0.18); });
  };
  W.setPath = (pts) => { path.geometry.setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z))); path.computeLineDistances(); };
  W.setFootprint = (corners) => { const a = footprint.geometry.attributes.position; corners.forEach((c, i) => a.setXYZ(i, c.x, heightAt(c.x, c.z) + 0.6, c.z)); a.needsUpdate = true; };
  return W;
}

// Minimal geometry merge (positions + normals, non-indexed) to avoid pulling BufferGeometryUtils.
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g of list) { const ng = g.index ? g.toNonIndexed() : g; pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
