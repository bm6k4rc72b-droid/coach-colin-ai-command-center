import * as THREE from 'three';
import { glowSprite } from './holo.js';
import { actorAt, speakingAt, BLOCKING, EYE, CAM_IDS } from '../sim/blocking.js';

// The set: a rain-wet rooftop at night above a neon city. Two actors, a
// light plot (key, fill, back, practicals) and three camera rigs.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

function neonSign(text, color, w, h, font) {
  const tex = canvasTex(1024, Math.round(1024 * h / w), (g, W, H) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, W, H);
    g.font = font.replace('{s}', Math.round(H * 0.72)); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 38; g.strokeStyle = color; g.lineWidth = 10; g.strokeText(text, W / 2, H / 2 + 4);
    g.shadowBlur = 12; g.fillStyle = '#fff'; g.fillText(text, W / 2, H / 2 + 4);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  return m;
}

// A mannequin-style actor with a walk cycle.
function actor(coat, trim, hat) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.62, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c79c80', roughness: 0.5 });
  const trimM = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.4, metalness: 0.2 });
  const hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.46, 6, 16), cloth); torso.position.y = 0.36; torso.scale.set(1.12, 1, 0.78); hips.add(torso);
  const coatSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.62, 18, 1, true), cloth); coatSkirt.position.y = -0.18; hips.add(coatSkirt);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), trimM); collar.rotation.x = Math.PI / 2; collar.position.y = 0.66; hips.add(collar);
  const neck = new THREE.Group(); neck.position.y = 0.7; hips.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), skin); head.position.y = 0.15; head.scale.set(0.92, 1.08, 0.98); neck.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), dark); hair.position.y = 0.17; hair.rotation.x = -0.25; neck.add(hair);
  // A minimal face (the actor's front is local +z) so eyelines read on camera.
  const eyeM = new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.15, metalness: 0.1 });
  for (const s of [1, -1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeM); eye.position.set(s * 0.038, 0.165, 0.1); neck.add(eye); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.045, 8), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.135, 0.118); neck.add(nose);
  if (hat) { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24), dark); brim.position.y = 0.25; neck.add(brim); const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.12, 20), dark); crown.position.y = 0.31; neck.add(crown); }
  const limbs = {};
  for (const s of [1, -1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.1, 0, 0); hips.add(leg);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.38, 4, 10), dark); thigh.position.y = -0.24; leg.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.47; leg.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.36, 4, 10), dark); shin.position.y = -0.21; knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.3, metalness: 0.3 })); shoe.position.set(0, -0.44, 0.05); knee.add(shoe);
    const arm = new THREE.Group(); arm.position.set(s * 0.27, 0.6, 0); hips.add(arm);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.28, 4, 10), cloth); upper.position.y = -0.17; arm.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.34; arm.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 10), cloth); fore.position.y = -0.15; elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin); hand.position.y = -0.32; elbow.add(hand);
    limbs[s > 0 ? 'L' : 'R'] = { leg, knee, arm, elbow, hand };
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(EYE / 1.815);                       // model eyes (0.95 + 0.7 + 0.165 m) → the blocking eye height
  return { g, hips, neck, head, limbs, phase: 0 };
}

export function buildSet() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04050b');
  scene.fog = new THREE.FogExp2('#0a0c18', 0.012);
  scene.environmentIntensity = 0.35;
  // Wet concrete floor with puddles in the roughness.
  const rough = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { const x = Math.random() * W, y = Math.random() * H, r = 20 + Math.random() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,10,10,.95)'); gr.addColorStop(1, 'rgba(10,10,10,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    const id = g.getImageData(0, 0, W, H); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 40; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
  });
  rough.colorSpace = THREE.NoColorSpace; rough.wrapS = rough.wrapT = THREE.RepeatWrapping; rough.repeat.set(3, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 22), new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 1, roughnessMap: rough, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const concrete = new THREE.MeshStandardMaterial({ color: '#3a3c42', roughness: 0.85 });
  for (const [x, z, w, d] of [[0, -11, 32, 0.4], [0, 11, 32, 0.4], [-16, 0, 0.4, 22], [16, 0, 0.4, 22]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), concrete); m.position.set(x, 0.55, z); m.receiveShadow = m.castShadow = true; scene.add(m); }
  // Stair housing with a door and a caged lamp.
  const house = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 3), concrete); house.position.set(-12, 1.5, -7.5); house.castShadow = house.receiveShadow = true; scene.add(house);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.1), new THREE.MeshStandardMaterial({ color: '#1a1c22', roughness: 0.5, metalness: 0.6 })); door.position.set(-12, 1.05, -5.99); scene.add(door);
  const lamp = glowSprite('#ffc27a', 1.3, 0.9); lamp.position.set(-12, 2.5, -5.8); scene.add(lamp);
  const lampL = new THREE.PointLight('#ffb867', 6, 9, 2); lampL.position.set(-12, 2.45, -5.6); scene.add(lampL);
  // Water tank on legs, AC units, pipes.
  const metal = new THREE.MeshStandardMaterial({ color: '#4a3f38', roughness: 0.7, metalness: 0.4 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 28), new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.8 })); tank.position.set(8.8, 3.3, -6.2); tank.castShadow = true; scene.add(tank);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 28), metal); roof.position.set(8.8, 5, -6.2); scene.add(roof);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2, 8), metal); l.position.set(8.8 + dx, 1, -6.2 + dz); scene.add(l); }
  for (const [x, z] of [[12, 3], [12, 6.2], [-8, 7.5]]) { const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: '#6b6e74', roughness: 0.5, metalness: 0.5 })); ac.position.set(x, 0.55, z); ac.castShadow = ac.receiveShadow = true; scene.add(ac); }
  // Neon signs and their light.
  const hotel = neonSign('HOTEL', '#ff2d6f', 7, 1.8, '700 {s}px "Space Grotesk", sans-serif'); hotel.position.set(1.5, 4.2, -10.8); scene.add(hotel);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.2, 0.15), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6, metalness: 0.6 })); frame.position.set(1.5, 4.2, -10.9); scene.add(frame);
  for (const x of [-1.5, 4.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12), metal); p.position.set(x, 1.6, -10.9); scene.add(p); }
  const ramen = neonSign('ラーメン', '#2df5ff', 5, 1.4, '700 {s}px "Noto Sans JP", sans-serif'); ramen.rotation.y = -Math.PI / 2; ramen.position.set(15.7, 3.2, 2); scene.add(ramen);
  const neonPink = new THREE.PointLight('#ff2d6f', 12, 16, 1.6); neonPink.position.set(1.5, 4, -9.5); scene.add(neonPink);
  const neonTeal = new THREE.PointLight('#2df5ff', 9, 14, 1.6); neonTeal.position.set(14.5, 3, 2); scene.add(neonTeal);
  // String lights across the roof.
  const bulbs = new THREE.Group(); scene.add(bulbs);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
  for (const [a, b] of [[V(-15, 3.2, -10.5), V(15, 3.2, 10.5)], [V(-15, 3.4, 8), V(15, 3.4, -9)]]) {
    for (let i = 0; i <= 26; i++) { const u = i / 26, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 0.9; const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat); s.position.copy(p); bulbs.add(s); }
  }
  // City skyline: instanced towers with lit windows.
  const winTex = canvasTex(256, 512, (g, W, H) => { g.fillStyle = '#06070c'; g.fillRect(0, 0, W, H); for (let y = 8; y < H; y += 16) for (let x = 6; x < W; x += 14) { if (Math.random() < 0.38) { const k = Math.random(); g.fillStyle = k < 0.7 ? `rgba(255,${190 + Math.random() * 50},${120 + Math.random() * 60},${0.5 + Math.random() * 0.5})` : `rgba(140,200,255,${0.4 + Math.random() * 0.5})`; g.fillRect(x, y, 8, 9); } } });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const towerMat = new THREE.MeshStandardMaterial({ color: '#0c0e16', emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.9, roughness: 0.7, metalness: 0.3 });
  const N = 170, towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), towerMat, N), m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 190, h = 20 + Math.random() ** 2 * 140, w = 8 + Math.random() * 16;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
    m4.compose(V(x, h / 2 - 30, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.random()), V(w, h, w)); towers.setMatrixAt(i, m4);
  }
  scene.add(towers);
  const moon = glowSprite('#cfe0ff', 24, 0.65); moon.position.set(-60, 70, 140); scene.add(moon);
  // Rain.
  const RN = 2600, rg = new THREE.BufferGeometry(), rp = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 40, y = Math.random() * 14, z = (Math.random() - 0.5) * 30; rp.set([x, y, z, x + 0.03, y - 0.35, z], i * 6); }
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#9fb8e0', transparent: true, opacity: 0.35 })); rain.frustumCulled = false; scene.add(rain);
  // Moonlight / sky fill and the light plot.
  const hemi = new THREE.HemisphereLight('#3a4a78', '#0b0c10', 0.35); scene.add(hemi);
  const mkSpot = (color) => { const s = new THREE.SpotLight(color, 60, 0, 0.45, 0.6, 2); s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; scene.add(s, s.target); return s; };
  const lights = { key: mkSpot('#ffd6a8'), fill: mkSpot('#a8c4ff'), back: mkSpot('#ffffff') };
  lights.fill.castShadow = false; lights.back.castShadow = false;
  const fixtures = {};
  for (const k of Object.keys(lights)) {
    const f = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.6, roughness: 0.4 })); f.add(stand);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: '#191a1e', metalness: 0.5, roughness: 0.5 })); f.add(head);
    const lens = glowSprite('#fff', 0.5, 0.9); f.add(lens);
    scene.add(f); fixtures[k] = { f, stand, head, lens };
  }
  // Actors.
  const iris = actor('#7a5a3c', '#3a2b1e', true), kane = actor('#284952', '#101b20', false);
  scene.add(iris.g, kane.g);
  const envelope = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.15), new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.8 })); scene.add(envelope);
  // Floor marks (tape T-marks) at each blocking stop.
  const markMat = new THREE.MeshBasicMaterial({ color: '#ffd24a' }), marks = new THREE.Group(); scene.add(marks);
  for (const [who, col] of [['iris', '#ffd24a'], ['kane', '#5dd6ff']]) for (const k of BLOCKING[who]) { const m = new THREE.Group(); const a = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), new THREE.MeshBasicMaterial({ color: col })), b = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.3), new THREE.MeshBasicMaterial({ color: col })); a.rotation.x = b.rotation.x = -Math.PI / 2; b.position.z = 0.15; m.add(a, b); m.position.set(k[1], 0.012, k[2]); marks.add(m); }
  void markMat;
  // Line of action between the actors, and the "safe side" wash.
  const loaGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(1, 0, 0)]);
  const loa = new THREE.Line(loaGeo, new THREE.LineDashedMaterial({ color: '#ff4fd8', dashSize: 0.3, gapSize: 0.2 })); scene.add(loa);
  // Camera rigs with frustum lines.
  const rigs = {}, rigCol = { A: '#3ff3ff', B: '#ffb86b', C: '#5dffa8' };
  for (const id of CAM_IDS) {
    const g = new THREE.Group(), col = rigCol[id];
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.36), new THREE.MeshStandardMaterial({ color: '#1b1d22', metalness: 0.6, roughness: 0.35 })); g.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 18), new THREE.MeshStandardMaterial({ color: '#0e0f12', metalness: 0.8, roughness: 0.25 })); lens.rotation.x = Math.PI / 2; lens.position.z = -0.28; g.add(lens);
    const tally = glowSprite(col, 0.22, 1); tally.position.set(0, 0.2, 0.1); g.add(tally);
    const legs = new THREE.Group(); scene.add(legs);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), new THREE.MeshStandardMaterial({ color: '#2a2b30', metalness: 0.5 })); legs.add(l); }
    const fr = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
    fr.frustumCulled = false; scene.add(fr);
    const label = labelSprite(id, col); label.position.y = 0.55; g.add(label);
    scene.add(g); rigs[id] = { g, legs, fr, lens, tally, label };
  }
  return { scene, lights, fixtures, iris, kane, envelope, rain, loa, rigs, marks, neonPink, neonTeal, lampL, hemi, bulbs, towers };
}

function labelSprite(txt, col) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = col; g.font = '700 44px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 32, 34);
  const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.setScalar(0.45); return s;
}

// Pose an actor at time t: position, heading, walk cycle, head turn, talking nods.
export function poseActor(A, who, t, dt) {
  const s = actorAt(who, t);
  A.g.position.set(s.x, 0, s.z);
  // Smoothly turn the body toward the heading.
  let d = s.heading - A.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); A.g.rotation.y += d * Math.min(1, dt * 6 + (A.snap ? 1 : 0));
  A.snap = false;
  A.phase += s.v * dt * 3.6;
  const sw = s.walking ? Math.sin(A.phase) : 0, L = A.limbs.L, R = A.limbs.R;
  L.leg.rotation.x = 0.55 * sw; R.leg.rotation.x = -0.55 * sw;
  L.knee.rotation.x = s.walking ? Math.max(0, -Math.cos(A.phase)) * 0.7 : 0; R.knee.rotation.x = s.walking ? Math.max(0, Math.cos(A.phase)) * 0.7 : 0;
  L.arm.rotation.x = -0.4 * sw; R.arm.rotation.x = 0.4 * sw;
  L.elbow.rotation.x = -0.25; R.elbow.rotation.x = -0.25;
  A.hips.position.y = 0.95 + (s.walking ? Math.abs(Math.cos(A.phase)) * 0.035 : Math.sin(t * 1.7) * 0.006);
  const sp = speakingAt(t), talking = sp && sp.who === who;
  A.neck.rotation.x = talking ? Math.sin(t * 7) * 0.05 : 0;
  A.neck.rotation.y = talking ? Math.sin(t * 2.3) * 0.08 : 0;
  // Gesture: raise the right forearm when talking.
  R.arm.rotation.x += talking ? -0.35 : 0; R.elbow.rotation.x = talking ? -0.9 + Math.sin(t * 5) * 0.15 : R.elbow.rotation.x;
  return s;
}
export const EYE_H = EYE;
