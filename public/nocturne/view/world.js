import * as THREE from 'three';
import { glowSprite, pointCloud, fbm } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// NOCTURNE · the worlds. The cave: a limestone cavern with stalactites, a waterfall and pool,
// a steel platform, a curved wall of screens, a bat swarm, a ballistic test rig and hidden
// supply caches for the sonar. The city: a rain-soaked night skyline for gliding and grappling.
// ─────────────────────────────────────────────────────────────────────────────

function canvasTex(w, h, draw, rx = 1, ry = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }
const rockMat = new THREE.MeshStandardMaterial({ color: '#1b1e22', roughness: 0.95, metalness: 0.05, flatShading: true });
function displace(geo, amp, freq, inward = false) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbm(v.x * freq, v.y * freq, v.z * freq, 4) - 0.5, d = v.clone().normalize(); v.addScaledVector(d, (inward ? -1 : 1) * n * amp); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
}

export function buildWorld() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#020306'); scene.fog = new THREE.FogExp2('#05080d', 0.035);
  const hemi = new THREE.HemisphereLight('#5a7aa0', '#06070a', 0.12); scene.add(hemi);

  // ═══ CAVE ═══
  const cave = new THREE.Group(); scene.add(cave);
  const dome = new THREE.Mesh(displace(new THREE.SphereGeometry(26, 96, 64, 0, Math.PI * 2, 0, Math.PI * 0.62), 5, 0.12), rockMat.clone()); dome.material.side = THREE.BackSide; dome.material.color.set('#14171b'); dome.scale.set(1.3, 0.55, 1); dome.position.y = -2; dome.receiveShadow = true; cave.add(dome);
  const floorG = new THREE.PlaneGeometry(70, 70, 120, 120); floorG.rotateX(-Math.PI / 2);
  { const p = floorG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, (fbm(x * 0.15, 0, z * 0.15, 4) - 0.5) * 1.6 * Math.min(1, Math.max(0, (r - 5) / 6)) - (r > 26 ? (r - 26) * 0.2 : 0)); } floorG.computeVertexNormals(); }
  const floor = new THREE.Mesh(floorG, rockMat.clone()); floor.material.color.set('#16191d'); floor.receiveShadow = true; cave.add(floor);
  // Stalactites and stalagmites.
  const coneG = new THREE.ConeGeometry(0.35, 3, 7, 3); displace(coneG, 0.25, 2.2);
  const stal = new THREE.InstancedMesh(coneG, rockMat, 160); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i < 160; i++) {
    const up = i < 110, a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 24, s = 0.4 + Math.random() * 1.6;
    P.set(Math.cos(a) * r, up ? 11 - r * 0.25 + Math.random() : 0.6 * s, Math.sin(a) * r * 0.8); q.setFromEuler(new THREE.Euler(up ? Math.PI : 0, Math.random() * 6, 0)); S.set(s, s * (0.6 + Math.random()), s);
    if (!up && r < 9) P.x += 9; stal.setMatrixAt(i, m4.compose(P, q, S));
  }
  stal.castShadow = true; cave.add(stal);
  // Waterfall + pool.
  const fallMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uT; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9,78.2)))*43758.5); } void main(){ vec2 p = vec2(vUv.x*24., vUv.y*6. + uT*3.); float s = h(floor(p)) * smoothstep(0.,1.,fract(p.y)); float edge = smoothstep(0.,0.2,vUv.x)*smoothstep(1.,0.8,vUv.x); gl_FragColor = vec4(vec3(0.62,0.78,0.95), (0.25 + 0.5*s) * edge * smoothstep(0.,0.1,vUv.y)); }' });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 10, 1, 1), fallMat); fall.position.set(-11, 5, -12); fall.rotation.y = 0.6; cave.add(fall);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.MeshPhysicalMaterial({ color: '#06121c', roughness: 0.05, metalness: 0.2, transmission: 0, clearcoat: 1, envMapIntensity: 0.6 })); pool.rotation.x = -Math.PI / 2; pool.position.set(-10, 0.05, -10); cave.add(pool);
  const spray = pointCloud(500, 0.08, '#cfe6ff'); cave.add(spray);
  const sprayS = Array.from({ length: 500 }, () => ({ p: new THREE.Vector3(-11, 0.3, -11.5), v: new THREE.Vector3(), life: Math.random() }));
  // Platform.
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 6), new THREE.MeshPhysicalMaterial({ color: '#1a1d22', metalness: 0.85, roughness: 0.3, clearcoat: 0.6 })); plat.position.y = 0.15; plat.receiveShadow = true; cave.add(plat);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.02, 4, 6), new THREE.MeshBasicMaterial({ color: '#3d8cff' })); edge.rotation.x = Math.PI / 2; edge.rotation.z = Math.PI / 6; edge.position.y = 0.31; cave.add(edge);
  // Screen wall.
  const screens = new THREE.Group(); screens.position.set(0, 0, -7.5); cave.add(screens); const scrTex = [];
  for (let i = 0; i < 7; i++) {
    const tex = new THREE.CanvasTexture(document.createElement('canvas')); tex.image.width = 512; tex.image.height = 300; tex.colorSpace = THREE.SRGBColorSpace; scrTex.push(tex);
    const a = (i - 3) * 0.2, sc = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 }));
    sc.position.set(Math.sin(a) * 9, 2.6 + (i % 2) * 1.45, -Math.cos(a) * 9 + 9); sc.rotation.y = -a; screens.add(sc);
  }
  const deskLight = new THREE.PointLight('#3d8cff', 5, 12, 2); deskLight.position.set(0, 3, -6); cave.add(deskLight);
  const amber = new THREE.PointLight('#ffae55', 5, 10, 2); amber.position.set(5, 2.5, -3); cave.add(amber);
  const key = new THREE.SpotLight('#cfe0ff', 34, 22, 0.3, 0.75, 1.4); key.position.set(1.5, 11, 3); key.target.position.set(0, 1, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; cave.add(key, key.target);
  const rim = new THREE.SpotLight('#3d8cff', 40, 14, 0.5, 0.6, 1.4); rim.position.set(-3, 4, -4); rim.target.position.set(0, 1.3, 0); cave.add(rim, rim.target);
  // Light shaft from a crack in the ceiling.
  const shaftMat = new THREE.MeshBasicMaterial({ color: '#7fa8d8', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.6, 12, 32, 1, true), shaftMat); shaft.position.set(1.2, 5.6, 0.8); shaft.rotation.z = 0.12; cave.add(shaft);
  // Bat swarm: instanced two-triangle wings.
  const batG = new THREE.BufferGeometry(); batG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, -0.25, 0, -0.05, 0, 0, -0.08, 0, 0, 0.06, 0.25, 0, -0.05, 0, 0, -0.08], 3)); batG.computeVertexNormals();
  const bats = new THREE.InstancedMesh(batG, new THREE.MeshBasicMaterial({ color: '#05060a', side: THREE.DoubleSide }), 140); cave.add(bats);
  const batS = Array.from({ length: 140 }, () => ({ c: new THREE.Vector3((Math.random() - 0.5) * 20, 5 + Math.random() * 4, (Math.random() - 0.5) * 16), r: 2 + Math.random() * 5, w: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6), ph: Math.random() * 7, fl: 14 + Math.random() * 8 }));
  const mist = pointCloud(700, 0.5, '#ffffff'); cave.add(mist);
  { const A = mist.geometry.attributes.position.array, C = mist.geometry.attributes.color.array; for (let i = 0; i < 700; i++) { A.set([(Math.random() - 0.5) * 40, Math.random() * 1.2, (Math.random() - 0.5) * 34], i * 3); const k = 0.03 + Math.random() * 0.03; C.set([k, k * 1.1, k * 1.4], i * 3); } }
  // Ballistic test rig: layered plate on a stand, projectile, impact flash.
  const rig = new THREE.Group(); rig.position.set(4.2, 0.3, 0.5); rig.rotation.y = -0.9; cave.add(rig);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: '#2a2e36', metalness: 0.8, roughness: 0.4 })); stand.position.y = 0.7; rig.add(stand);
  const layers = new THREE.Group(); layers.position.set(0, 1.45, 0); rig.add(layers);
  const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), new THREE.MeshStandardMaterial({ color: '#c8963a', metalness: 1, roughness: 0.3 })); proj.rotation.x = Math.PI / 2; rig.add(proj);
  const flash = glowSprite('#ffd27a', 0.8, 0); flash.position.set(0, 1.45, 0.06); rig.add(flash);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 4), new THREE.MeshBasicMaterial({ color: '#3d8cff' })); rail.position.set(0, 1.0, 2); rig.add(rail);
  // Sonar: hidden caches + the point cloud the pings build.
  const caches = [];
  for (const [x, z] of [[-14, 6], [12, -9], [-6, -16], [17, 9], [-18, -6]]) { const b = new THREE.Mesh(new RoundBox(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: '#2a2418', roughness: 0.8 })); b.position.set(x, 0.3 + Math.max(0, (fbm(x * 0.15, 0, z * 0.15, 4) - 0.5) * 1.6), z); b.userData.cache = true; cave.add(b); caches.push(b); }
  const sonarPts = pointCloud(9000, 0.42, '#ffffff'); sonarPts.geometry.setDrawRange(0, 0); scene.add(sonarPts);

  // ═══ CITY ═══
  const city = new THREE.Group(); city.visible = false; scene.add(city);
  const win = canvasTex(64, 128, (g, W, H) => { g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H); for (let y = 4; y < H; y += 8) for (let x = 3; x < W; x += 8) if (Math.random() < 0.3) { const c = Math.random(); g.fillStyle = c < 0.6 ? '#ffcf8a' : c < 0.85 ? '#9fc8ff' : '#ffffff'; g.globalAlpha = 0.35 + Math.random() * 0.65; g.fillRect(x, y, 4, 4); } g.globalAlpha = 1; });
  const bMat = new THREE.MeshStandardMaterial({ color: '#0c0e12', emissive: '#ffffff', emissiveMap: win, emissiveIntensity: 0.9, map: win, roughness: 0.8, metalness: 0.3 });
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bMat, 420);
  for (let i = 0; i < 420; i++) { const x = (Math.random() - 0.5) * 900, z = -40 - Math.random() * 700, w = 14 + Math.random() * 26, h = 30 + Math.random() * Math.random() * 220; if (Math.abs(x) < 40 && z > -360) { i--; continue; } towers.setMatrixAt(i, m4.compose(new THREE.Vector3(x, h / 2, z), q.identity(), new THREE.Vector3(w, h, w))); }
  city.add(towers);
  // The launch tower (glide start / grapnel anchor) with a gargoyle ledge, and a street canyon.
  const launch = new THREE.Mesh(new THREE.BoxGeometry(24, 120, 24), bMat); launch.position.set(0, 60, 10); city.add(launch);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.9 })); ledge.position.set(0, 120.5, -2.5); city.add(ledge);
  const anchorT = new THREE.Mesh(new THREE.BoxGeometry(22, 150, 22), bMat); anchorT.position.set(-26, 75, -70); city.add(anchorT);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: '#07090c', roughness: 0.35, metalness: 0.6 })); street.rotation.x = -Math.PI / 2; city.add(street);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb46a' }), 120);
  for (let i = 0; i < 120; i++) lamps.setMatrixAt(i, m4.compose(new THREE.Vector3((i % 2 ? 1 : -1) * 18, 8, -i * 12 + 20), q.identity(), new THREE.Vector3(1, 1, 1))); city.add(lamps);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.MeshBasicMaterial({ color: '#0a1220', side: THREE.BackSide, fog: false })); city.add(sky);
  const moon = glowSprite('#dfe9ff', 160, 0.9); moon.position.set(-500, 600, -1200); moon.material.fog = false; city.add(moon);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2, 40, 900, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#bcd4ff', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.set(260, 450, -420); beam.rotation.z = -0.35; city.add(beam);
  const rain = pointCloud(3000, 0.25, '#ffffff'); city.add(rain);
  { const A = rain.geometry.attributes.position.array, C = rain.geometry.attributes.color.array; for (let i = 0; i < 3000; i++) { A.set([(Math.random() - 0.5) * 200, Math.random() * 200, (Math.random() - 0.5) * 300 - 60], i * 3); C.set([0.35, 0.42, 0.55], i * 3); } }
  const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: '#3d8cff', transparent: true, opacity: 0.8 })); city.add(trail);
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: '#cfd8e6' })); rope.visible = false; city.add(rope);
  const chuteM = new THREE.Mesh(new THREE.SphereGeometry(2.65, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: '#111318', side: THREE.DoubleSide, roughness: 0.8 })); chuteM.visible = false; city.add(chuteM);

  const lights = [[key, key.intensity], [rim, rim.intensity], [deskLight, deskLight.intensity], [amber, amber.intensity], [hemi, hemi.intensity]];
  return { lights, scene, cave, city, screens: scrTex, fallMat, spray, sprayS, bats, batS, rig, layers, proj, flash, caches, sonarPts, rain, trail, rope, chuteM, launch, ledge, anchorT, key, dome, floor, stal, plat };
}
// Rounded crate geometry helper.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
function RoundBox(w, h, d) { return new RoundedBoxGeometry(w, h, d, 2, 0.05); }

export function animateWorld(W, dt, time) {
  W.fallMat.uniforms.uT.value = time;
  // Spray from the waterfall foot.
  const A = W.spray.geometry.attributes.position.array, C = W.spray.geometry.attributes.color.array;
  W.sprayS.forEach((s, i) => { s.life -= dt * 0.8; if (s.life <= 0) { s.life = 1; s.p.set(-11 + (Math.random() - 0.5) * 2.4, 0.2, -11.4 + (Math.random() - 0.5) * 1); s.v.set((Math.random() - 0.5) * 1.5, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.5); } s.v.y -= 2.5 * dt; s.p.addScaledVector(s.v, dt); A.set([s.p.x, s.p.y, s.p.z], i * 3); const k = s.life * 0.35; C.set([k * 0.8, k * 0.9, k], i * 3); });
  W.spray.geometry.attributes.position.needsUpdate = true; W.spray.geometry.attributes.color.needsUpdate = true;
  // Bats: orbiting swirls with flapping wings.
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  W.batS.forEach((b, i) => { const a = time * b.w + b.ph, x = b.c.x + Math.cos(a) * b.r, z = b.c.z + Math.sin(a) * b.r, y = b.c.y + Math.sin(a * 2.3) * 0.8, fl = Math.sin(time * b.fl + b.ph); e.set(fl * 0.2, -a + (b.w > 0 ? 0 : Math.PI), fl * 0.6); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1 + fl * 0.3, 1)); W.bats.setMatrixAt(i, m4); });
  W.bats.instanceMatrix.needsUpdate = true;
  // Rain.
  if (W.city.visible) { const R = W.rain.geometry.attributes.position.array; for (let i = 1; i < R.length; i += 3) { R[i] -= dt * 60; if (R[i] < 0) R[i] += 200; } W.rain.geometry.attributes.position.needsUpdate = true; }
}

// Live screen content (cheap: redrawn a few times a second).
export function drawScreens(W, time, lines) {
  W.screens.forEach((tex, i) => {
    const c = tex.image, g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = 'rgba(4,10,20,.92)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(61,140,255,.6)'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#7fb6ff'; g.font = '700 26px "JetBrains Mono", monospace'; g.fillText((lines[i] || '').toUpperCase(), 20, 40);
    g.strokeStyle = i % 2 ? '#ffae55' : '#3d8cff'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < w - 40; x += 4) { const y = h * 0.6 + Math.sin(x * 0.03 + time * (1 + i * 0.3)) * 30 * Math.sin(time * 0.4 + i) + Math.sin(x * 0.11 + time * 3) * 8; x ? g.lineTo(20 + x, y) : g.moveTo(20, y); }
    g.stroke(); g.fillStyle = 'rgba(127,182,255,.6)'; g.font = '16px "JetBrains Mono", monospace'; for (let k = 0; k < 4; k++) g.fillText(((time * 37 + k * 113 + i * 7) % 1000).toFixed(1).padStart(7, ' ') + '  ' + ['ALT', 'VEL', 'HR', 'PING'][k], 20, 80 + k * 22);
    tex.needsUpdate = true;
  });
}
