import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowSprite, pointCloud, fbm } from './holo.js';
import { TEAM } from '../sim/hero.js';

// ─────────────────────────────────────────────────────────────────────────────
// CHROMA FORCE · the world: a sunset canyon with mesas, the plateau where the team stands, five
// vehicle-machines that fly in formation and then combine into a 40-metre mech (the same
// geometry lying flat is a vehicle, standing up is a limb), and a monster that grows to giant size.
// ─────────────────────────────────────────────────────────────────────────────

export const MECH_AT = new THREE.Vector3(0, -8, -150), MONSTER_AT = new THREE.Vector3(55, -8, -175);
const rock = new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.95, flatShading: true });

export function buildWorld() {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#b8604a', 0.0022); scene.environmentIntensity = 0.3;
  // Sky dome: sunset gradient with a hot horizon band.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: new THREE.Vector3(-0.35, 0.08, -1).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uSun; varying vec3 vD; void main(){ float h = vD.y; vec3 top = vec3(0.10,0.12,0.32), mid = vec3(0.78,0.32,0.38), low = vec3(1.0,0.62,0.32); vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.7, h)) : mix(low, mid, smoothstep(-0.02, 0.18, h)); float s = max(dot(vD, uSun), 0.); c += vec3(1.0,0.75,0.45) * pow(s, 60.) * 1.2 + vec3(1.0,0.55,0.3) * pow(s, 6.) * 0.35; gl_FragColor = vec4(c, 1.); }' }));
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffc48a', 2.4); sun.position.set(-260, 70, -700); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 1200 }); sun.shadow.bias = -0.0005; scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#7f8fe0', '#4a2414', 0.55));
  const key = new THREE.DirectionalLight('#ffd9b0', 1.3); key.position.set(-6, 9, 12); scene.add(key);
  const rimL = new THREE.DirectionalLight('#7fa8ff', 0.9); rimL.position.set(120, 60, 200); scene.add(rimL);
  // Canyon floor with mesas.
  const fg = new THREE.PlaneGeometry(1600, 1600, 160, 160); fg.rotateX(-Math.PI / 2);
  { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x - MECH_AT.x, z - MECH_AT.z); p.setY(i, (fbm(x * 0.006, 0, z * 0.006, 5) - 0.5) * 40 * Math.min(1, Math.max(0, (r - 90) / 120)) - 8); } fg.computeVertexNormals(); }
  const floor = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: '#a8673f', roughness: 0.95, flatShading: true })); floor.receiveShadow = true; scene.add(floor);
  const mesaG = new THREE.CylinderGeometry(1, 1.25, 1, 9, 4); { const p = mesaG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = fbm(x * 2, y * 3, z * 2, 3) - 0.5; p.setXYZ(i, x * (1 + n * 0.4), y, z * (1 + n * 0.4)); } mesaG.computeVertexNormals(); }
  const mesas = new THREE.InstancedMesh(mesaG, rock, 26), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, r = 330 + Math.random() * 600, w = 40 + Math.random() * 90, h = 60 + Math.random() * 160; mesas.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 10, Math.sin(a) * r - 200), q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)), new THREE.Vector3(w, h, w * (0.7 + Math.random() * 0.6)))); }
  mesas.castShadow = mesas.receiveShadow = true; scene.add(mesas);
  // The plateau (team stands here, at the origin, looking out over the canyon toward −z).
  const platG = new THREE.CylinderGeometry(9, 14, 30, 14, 3); { const p = platG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > 14) continue; const n = fbm(x * 0.3, y * 0.2, z * 0.3, 3) - 0.5; p.setXYZ(i, x * (1 + n * 0.5), y, z * (1 + n * 0.5)); } platG.computeVertexNormals(); }
  const plat = new THREE.Mesh(platG, rock); plat.position.set(0, -15, 0); plat.receiveShadow = plat.castShadow = true; scene.add(plat);
  const pad = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.9, 64), new THREE.MeshBasicMaterial({ color: '#ffe0a8', transparent: true, opacity: 0.5, side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; scene.add(pad);
  const dust = pointCloud(1200, 0.5, '#ffffff'); scene.add(dust);
  { const A = dust.geometry.attributes.position.array, Cc = dust.geometry.attributes.color.array; for (let i = 0; i < 1200; i++) { A.set([(Math.random() - 0.5) * 400, Math.random() * 80, -Math.random() * 400 + 50], i * 3); const k = 0.2 + Math.random() * 0.25; Cc.set([k, k * 0.75, k * 0.55], i * 3); } }

  // ── Zords: one geometry, two poses (vehicle ⇄ limb) ──
  const zords = [], mech = new THREE.Group(); mech.position.copy(MECH_AT); scene.add(mech);
  const mat = (hex) => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.55, roughness: 0.3, clearcoat: 0.8, envMapIntensity: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: '#22252b', metalness: 0.5, roughness: 0.5 });
  const bx = (g, w, h, d, m, x, y, z, r = 0.6) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const make = (c, build, vehicle, limb) => { const g = new THREE.Group(); build(g, mat(c.hex)); mech.add(g); const z = { g, c, vehicle, limb, glow: glowSprite(c.hex, 14, 0.0) }; z.glow.position.set(0, 0, 0); g.add(z.glow); zords.push(z); return z; };
  // Legs (blue, gold): long bodies with a foot / nose; vehicle mode = lying flat like a ground crawler.
  const leg = (s) => (g, m) => { bx(g, 5.5, 19, 6, m, 0, 9.5, 0, 1.2); bx(g, 6.4, 3, 9.5, dark, 0, 0.9, 1.6, 1); bx(g, 6, 4.5, 6.6, steel, 0, 9, 0.6, 1); bx(g, 4.6, 2.4, 1, dark, 0, 15, 3.1, 0.5); bx(g, 2, 6, 1.2, steel, s * 2.4, 13, 0, 0.5); };
  // Arms (green, pink): fliers with wings; limb mode = arm with a fist.
  const arm = (g, m) => { bx(g, 4.2, 15, 4.2, m, 0, -7.5, 0, 1); bx(g, 5, 4, 5, steel, 0, -16.5, 0, 1.2); bx(g, 1, 9, 9, m, 0, -6, 0, 0.4); bx(g, 5.4, 5.4, 5.4, dark, 0, 0, 0, 1.5); };
  // Torso (red): chest + shoulders + cockpit + head.
  const torso = (g, m) => { bx(g, 17, 14, 9, m, 0, 7, 0, 2); bx(g, 9, 6, 2, steel, 0, 9, 4.6, 1); bx(g, 7, 3, 1.4, new THREE.MeshBasicMaterial({ color: '#ffe9a8' }), 0, 9.5, 5.4, 0.6); bx(g, 19, 5, 8, dark, 0, 13.2, 0, 1.6); const h = bx(g, 6, 6.5, 6, steel, 0, 18.5, 0, 1.6); bx(g, 6.2, 1.4, 1, new THREE.MeshBasicMaterial({ color: '#6ff3ff' }), 0, 19.2, 3.1, 0.4); bx(g, 1.2, 4, 3, m, 0, 22.6, -0.5, 0.5); void h; };
  const T = (x, y, z, rx = 0, ry = 0, rz = 0) => ({ p: new THREE.Vector3(x, y, z), r: new THREE.Euler(rx, ry, rz) });
  make(TEAM[0], torso, T(0, 26, -40, 0, 0, 0), T(0, 21, 0));
  make(TEAM[1], leg(1), T(-34, 14, -10, Math.PI / 2, 0, 0), T(-4.6, 0, 0));
  make(TEAM[2], leg(-1), T(34, 14, -10, Math.PI / 2, 0, 0), T(4.6, 0, 0));
  make(TEAM[3], arm, T(-52, 38, -30, 0, 0, Math.PI / 2), T(-11.5, 33, 0, 0, 0, 0.12));
  make(TEAM[4], arm, T(52, 38, -30, 0, 0, -Math.PI / 2), T(11.5, 33, 0, 0, 0, -0.12));
  const eyes = glowSprite('#6ff3ff', 9, 0); eyes.position.set(0, 40.2, 3.4); mech.add(eyes);
  const sword = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 30, 3), new THREE.MeshStandardMaterial({ color: '#e8f2ff', metalness: 1, roughness: 0.12, emissive: '#5a7aff', emissiveIntensity: 0.4 })); blade.position.y = 17; sword.add(blade); const hilt = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), dark); sword.add(hilt); sword.visible = false; zords[4].g.add(sword); sword.position.set(0, -17, 2); sword.rotation.x = Math.PI / 2;

  // ── Monster ──
  const monster = new THREE.Group(); monster.position.copy(MONSTER_AT); scene.add(monster);
  const bodyG = new THREE.SphereGeometry(1, 64, 48); { const p = bodyG.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbm(v.x * 2.2, v.y * 2.2, v.z * 2.2, 4) - 0.5; v.multiplyScalar(1 + n * 0.45); p.setXYZ(i, v.x, v.y, v.z); } bodyG.computeVertexNormals(); }
  const mMat = new THREE.MeshPhysicalMaterial({ color: '#5a2a7a', roughness: 0.45, clearcoat: 0.6, sheen: 1, sheenColor: new THREE.Color('#c86bff') });
  const body = new THREE.Mesh(bodyG, mMat); body.scale.set(0.55, 0.75, 0.5); body.position.y = 0.95; body.castShadow = true; monster.add(body);
  for (let i = 0; i < 14; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 6), new THREE.MeshStandardMaterial({ color: '#f2e6c9', roughness: 0.5 })); const a = (i / 14) * Math.PI * 1.4 - 0.2; sp.position.set(0, 1.2 + Math.sin(a) * 0.5, -0.3 - Math.cos(a) * 0.2); sp.rotation.x = -0.6 - a * 0.4; monster.add(sp); }
  for (const s of [-1, 1]) { const legM = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 6, 10), mMat); legM.position.set(s * 0.22, 0.32, 0); legM.castShadow = true; monster.add(legM); const armM = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 6, 10), mMat); armM.position.set(s * 0.52, 1.0, 0.1); armM.rotation.z = s * 0.6; monster.add(armM); }
  const mEyes = glowSprite('#ff3a3a', 0.5, 1); mEyes.position.set(0, 1.45, 0.38); monster.add(mEyes);
  const hit = glowSprite('#ffffff', 30, 0); scene.add(hit);
  return { scene, sky, sun, floor, plat, pad, dust, mech, zords, eyes, sword, monster, mEyes, hit };
}

// Combine: u ∈ [0, 1] — 0 = flying formation, 1 = assembled mech. Each zord follows an arc.
const ease = (x) => x * x * (3 - 2 * x);
export function combine(W, u, t) {
  W.zords.forEach((z, i) => {
    const k = ease(Math.max(0, Math.min(1, (u - i * 0.08) / 0.6))), A = z.vehicle, B = z.limb;
    const hover = (1 - k) * Math.sin(t * 1.3 + i) * 1.5;
    z.g.position.lerpVectors(A.p, B.p, k); z.g.position.y += Math.sin(Math.PI * k) * 18 + hover;
    z.g.rotation.set(A.r.x + (B.r.x - A.r.x) * k, A.r.y + (B.r.y - A.r.y) * k + (1 - k) * Math.sin(t * 0.4 + i) * 0.1, A.r.z + (B.r.z - A.r.z) * k);
    z.glow.material.opacity = Math.sin(Math.PI * k) * 0.9;
  });
  W.eyes.material.opacity = u > 0.98 ? 0.6 + 0.4 * Math.sin(t * 3) : 0; W.sword.visible = u > 0.98;
}
