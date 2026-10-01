import * as THREE from 'three';
import { glowSprite, pointCloud } from './holo.js';

// ─────────────────────────────────────────────────────────────────────────────
// VANGUARD · the hangar: a dark bay with a glossy floor and glowing grid, the suit-up platform
// under a ring light and a volumetric cone, two gantry arms, holographic panels, a skin-scan
// beam, a ring of gauge pillars (labs / fitness gates), sparks and thruster exhaust.
// ─────────────────────────────────────────────────────────────────────────────

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
export function textPlane(lines, { w = 1.6, h = 0.9, color = '#7ff6ff' } = {}) {
  const tex = canvasTex(512, 288, (g, W, H) => {
    g.fillStyle = 'rgba(6,18,28,.55)'; g.fillRect(0, 0, W, H); g.strokeStyle = color; g.globalAlpha = 0.8; g.lineWidth = 3; g.strokeRect(6, 6, W - 12, H - 12); g.globalAlpha = 1;
    g.fillStyle = color; lines.forEach((l, i) => { g.font = i ? '500 26px "JetBrains Mono", monospace' : '700 38px "Space Grotesk", sans-serif'; g.fillText(l, 26, 56 + i * 44); });
    for (let i = 0; i < 18; i++) { g.globalAlpha = 0.5; g.fillRect(26 + i * 25, H - 40 - Math.random() * 40, 14, 4); }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.FrontSide, depthWrite: false, blending: THREE.AdditiveBlending }));
}

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#03050a'); scene.fog = new THREE.FogExp2('#03050a', 0.045);
  scene.add(new THREE.HemisphereLight('#6fa8c8', '#140806', 0.25));
  const key = new THREE.SpotLight('#ffffff', 42, 14, 0.42, 0.6, 1.4); key.position.set(0, 7.5, 1.2); key.target.position.set(0, 1, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key, key.target);
  const rimC = new THREE.SpotLight('#3fe0ff', 48, 12, 0.6, 0.6, 1.4); rimC.position.set(-3.5, 3.2, -3); rimC.target.position.set(0, 1.2, 0); scene.add(rimC, rimC.target);
  const rimA = new THREE.SpotLight('#ff8a3a', 42, 12, 0.6, 0.6, 1.4); rimA.position.set(3.6, 2.6, -2.5); rimA.target.position.set(0, 1.2, 0); scene.add(rimA, rimA.target);
  const fill = new THREE.PointLight('#9fc8ff', 3, 8, 2); fill.position.set(0.6, 1.6, 3.2); scene.add(fill);

  // Floor: glossy dark panels with an emissive grid.
  const grid = canvasTex(512, 512, (g, W) => { g.fillStyle = '#07090d'; g.fillRect(0, 0, W, W); g.strokeStyle = 'rgba(70,170,200,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, W, W); g.strokeStyle = 'rgba(70,170,200,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, W); g.moveTo(0, W / 2); g.lineTo(W, W / 2); g.stroke(); }, 30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: grid, emissiveMap: grid, emissive: '#ffffff', emissiveIntensity: 0.35, metalness: 0.7, roughness: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // Platform.
  const plat = new THREE.Group(); scene.add(plat);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.1, 96), new THREE.MeshPhysicalMaterial({ color: '#15181e', metalness: 0.9, roughness: 0.18, clearcoat: 1 })); deck.position.y = 0.05; deck.receiveShadow = true; plat.add(deck);
  const rings = [];
  for (const [r, c, w] of [[1.58, '#ffb347', 0.012], [1.2, '#3fe0ff', 0.008], [0.8, '#3fe0ff', 0.006]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 128), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 })); m.rotation.x = Math.PI / 2; m.position.y = 0.105; plat.add(m); rings.push(m); }
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.16), new THREE.MeshBasicMaterial({ color: i % 6 ? '#3fe0ff' : '#ffb347' })); d.position.set(Math.sin(a) * 1.38, 0.106, Math.cos(a) * 1.38); d.rotation.y = a; plat.add(d); }
  // Ring light and volumetric cone.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.035, 10, 128), new THREE.MeshBasicMaterial({ color: '#e8fbff' })); halo.rotation.x = Math.PI / 2; halo.position.y = 4.4; scene.add(halo);
  const coneMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color('#9fe8ff') } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uT; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)),1.5); float a = (1.0-vUv.y)*0.0+vUv.y; float n = 0.75+0.25*sin(vUv.x*60.0+uT*0.7)*sin(vUv.y*9.0-uT); gl_FragColor = vec4(uC, 0.07*f*a*n); }' });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 4.3, 64, 1, true), coneMat); cone.position.y = 2.25; scene.add(cone);
  // Gantry arms either side.
  const steel = new THREE.MeshStandardMaterial({ color: '#2a2e36', metalness: 0.85, roughness: 0.35 }), arms = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 2.3, 0, -1.5); scene.add(g); arms.push(g);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), steel); col.position.y = 2.1; col.castShadow = true; g.add(col);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 3.8, 0.02), new THREE.MeshBasicMaterial({ color: '#3fe0ff' })); strip.position.set(-s * 0.115, 2.1, 0.08); g.add(strip);
    const boom = new THREE.Group(); boom.position.y = 3.2; g.add(boom); g.userData.boom = boom;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.14), steel); b.position.x = -s * 0.6; b.castShadow = true; boom.add(b);
    const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#c8963a', metalness: 1, roughness: 0.25 })); tool.position.set(-s * 1.2, -0.18, 0); boom.add(tool);
    const tip = glowSprite('#ffb347', 0.25, 0.9); tip.position.set(-s * 1.2, -0.36, 0); boom.add(tip); g.userData.tip = tip;
  }
  // Back wall: tall light slats and a holographic logo.
  for (let i = -6; i <= 6; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.5, 0.06), new THREE.MeshBasicMaterial({ color: i % 3 ? '#14313d' : '#3fa8c8' })); sl.position.set(i * 0.9, 2.75, -6); scene.add(sl); }
  const panels = [textPlane(['VANGUARD MK-I', 'CORE 120 kWh · 4 REPULSORS', 'MASS 228 kg · FM 0.72']), textPlane(['PILOT CLEARANCE', 'WELLNESS · LABS · FITNESS', 'NEURO · BRIEFING'], { color: '#ffb347' })];
  panels[0].position.set(-2.9, 2.6, -1.6); panels[0].rotation.y = 0.45; panels[1].position.set(2.9, 2.6, -1.6); panels[1].rotation.y = -0.45; scene.add(...panels);
  // Skin-scan beam: a glowing horizontal ring + sheet that sweeps the suit.
  const scan = new THREE.Group(); scene.add(scan); scan.visible = false;
  const sRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.008, 6, 96), new THREE.MeshBasicMaterial({ color: '#7ff6ff' })); sRing.rotation.x = Math.PI / 2; scan.add(sRing);
  const sheet = new THREE.Mesh(new THREE.CircleGeometry(0.55, 64), new THREE.MeshBasicMaterial({ color: '#3fe0ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); sheet.rotation.x = -Math.PI / 2; scan.add(sheet);
  // Gauge pillars (labs groups / fitness gates).
  const pillars = new THREE.Group(); scene.add(pillars); pillars.visible = false;
  const mkPillar = () => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#3fe0ff', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    shell.position.y = 0.8; g.add(shell);
    const fillM = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 32), new THREE.MeshBasicMaterial({ color: '#5dffa8', transparent: true, opacity: 0.8 })); g.add(fillM);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffb347' })); cap.rotation.x = Math.PI / 2; cap.position.y = 1.6; g.add(cap);
    const top = glowSprite('#5dffa8', 0.5, 0.7); g.add(top);
    g.userData = { fillM, top, shell }; return g;
  };
  // Sparks and exhaust.
  const sparks = pointCloud(500, 0.05, '#ffffff'); scene.add(sparks);
  const sparkState = Array.from({ length: 500 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() }));
  const dust = pointCloud(600, 0.03, '#ffffff'); scene.add(dust);
  { const P = dust.geometry.attributes.position.array, C = dust.geometry.attributes.color.array; for (let i = 0; i < 600; i++) { P.set([(Math.random() - 0.5) * 12, Math.random() * 5, (Math.random() - 0.5) * 12], i * 3); const k = 0.15 + Math.random() * 0.25; C.set([k * 0.8, k, k * 1.1], i * 3); } }
  return { scene, plat, rings, halo, cone, arms, panels, scan, pillars, mkPillar, sparks, sparkState, dust, key };
}

// Emit n sparks at a world position (assembly welds, landings).
export function emitSparks(W, pos, n = 20, color = '#ffb347') {
  let k = 0;
  for (const s of W.sparkState) { if (s.life > 0) continue; s.life = 0.4 + Math.random() * 0.5; s.p.copy(pos); s.v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3); s.c.set(color); if (++k >= n) break; }
}
export function updateSparks(W, dt) {
  const P = W.sparks.geometry.attributes.position.array, C = W.sparks.geometry.attributes.color.array;
  W.sparkState.forEach((s, i) => { if (s.life > 0) { s.life -= dt; s.v.y -= 6 * dt; s.p.addScaledVector(s.v, dt); if (s.p.y < 0.1) { s.p.y = 0.1; s.v.y *= -0.3; } } const a = Math.max(0, Math.min(1, s.life * 2)); P.set([s.p.x, s.p.y, s.p.z], i * 3); C.set([s.c.r * a, s.c.g * a, s.c.b * a], i * 3); });
  W.sparks.geometry.attributes.position.needsUpdate = true; W.sparks.geometry.attributes.color.needsUpdate = true;
}
