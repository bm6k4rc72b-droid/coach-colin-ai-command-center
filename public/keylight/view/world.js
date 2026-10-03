import * as THREE from 'three';
import { glowSprite, pointCloud } from './holo.js';
import { WORLDS } from '../sim/key.js';

// ─────────────────────────────────────────────────────────────────────────────
// KEYLIGHT · the world. A stained-glass platform floats in a starry void on a pillar that falls
// forever; light pours down on it and motes drift up. Spell targets stand on the glass. Far away, the
// Lumen system: five island worlds circling a heart of light, linked by the Prism ship's routes.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAT_R = 12, SYSTEM_AT = new THREE.Vector3(0, 0, -4000), AU = 120;
export const PALETTES = {
  dawn: ['#ffd27a', '#ff7a6a', '#7fd4ff', '#b48cff', '#7ff0b0', '#ffffff'],
  sea: ['#5fd0ff', '#2f6fdc', '#9ff0ff', '#ffe08a', '#1c3d8a', '#d6f6ff'],
  dusk: ['#ff7a4a', '#c8406a', '#ffd27a', '#5a2a8a', '#ff9ad5', '#2a1440'],
};

// Paint a rose window: n identical wedges (rotational symmetry); with mirror on, each wedge is symmetric
// about its bisector too (dihedral symmetry). Lead lines between the glass pieces; a glowing centre.
export function paintWindow(canvas, { n = 12, k = 3, mirror = true, palette = 'dawn', seed = 1 }) {
  const S = canvas.width, g = canvas.getContext('2d'), c = S / 2, R = S * 0.49, cols = PALETTES[palette].slice(0, Math.max(2, k));
  let a = seed * 9301 + 49297; const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#05040a'; g.fillRect(0, 0, S, S);
  const rings = [0.18, 0.34, 0.52, 0.7, 0.86, 1.0], sub = [1, 2, 2, 3, 2, 4], pick = rings.map((_, i) => [...Array(sub[i])].map(() => cols[Math.floor(rnd() * cols.length)]));
  const w = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) for (let r = 0; r < rings.length; r++) {
    const r0 = (r ? rings[r - 1] : 0.08) * R, r1 = rings[r] * R, m = sub[r];
    for (let j = 0; j < m; j++) {
      // Mirror: piece j and piece (m − 1 − j) share a colour, so each wedge reads the same flipped.
      const jj = mirror ? Math.min(j, m - 1 - j) : j, col = pick[r][jj];
      const a0 = -Math.PI / 2 + i * w + (j / m) * w, a1 = a0 + w / m;
      g.beginPath(); g.arc(c, c, r1, a0, a1); g.arc(c, c, r0, a1, a0, true); g.closePath();
      const grd = g.createRadialGradient(c, c, r0, c, c, r1); grd.addColorStop(0, col); grd.addColorStop(1, shade(col, 0.6));
      g.fillStyle = grd; g.fill(); g.lineWidth = S * 0.006; g.strokeStyle = '#0a0812'; g.stroke();
    }
    // Decorative circles inside a ring, placed symmetrically.
    if (r === 3) { const ra = (r0 + r1) / 2, rr = (r1 - r0) * 0.3, aa = -Math.PI / 2 + i * w + w / 2; g.beginPath(); g.arc(c + Math.cos(aa) * ra, c + Math.sin(aa) * ra, rr, 0, Math.PI * 2); g.fillStyle = shade(pick[1][0], 1.25); g.fill(); g.stroke(); }
  }
  // Centre medallion: a key-and-star emblem.
  const cr = 0.08 * R * 1.0; g.beginPath(); g.arc(c, c, cr * 1.0 + S * 0.004, 0, Math.PI * 2); g.fillStyle = '#fff6d8'; g.fill(); g.stroke();
  g.fillStyle = '#ffd27a'; g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? cr * 0.4 : cr * 0.9, aa = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(c + Math.cos(aa) * rr, c + Math.sin(aa) * rr); } g.closePath(); g.fill();
  // Outer rim.
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.lineWidth = S * 0.016; g.strokeStyle = '#d8c48a'; g.stroke();
}
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }

export function buildWorld() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#04030a'); scene.environmentIntensity = 0.4;
  // Void: a nebula dome + stars.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: 'varying vec3 vD; float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); } float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); } void main(){ vec3 d = vD; float a = n(d*3.)*0.5 + n(d*6.)*0.25 + n(d*12.)*0.125; vec3 c = vec3(0.02,0.015,0.05) + vec3(0.18,0.08,0.32) * pow(a, 3.0) * 1.6 + vec3(0.05,0.12,0.25) * pow(n(d*4.+7.), 4.0); c += vec3(0.25,0.2,0.35) * smoothstep(0.2, 1.0, d.y) * 0.15; gl_FragColor = vec4(c, 1.); }' }));
  dome.frustumCulled = false; scene.add(dome);
  const sp = new Float32Array(3000 * 3); for (let i = 0; i < 3000; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 8000; sp.set([Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(a) * r], i * 3); }
  scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)), new THREE.PointsMaterial({ color: '#e8e0ff', size: 1.6, sizeAttenuation: false })));
  // Light from above.
  const key = new THREE.SpotLight('#fff3dc', 420, 120, 0.55, 0.6, 1.6); key.position.set(4, 40, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight('#b9a8ff', '#1a1030', 0.6));
  const rim = new THREE.DirectionalLight('#7fd4ff', 0.8); rim.position.set(-20, 10, -30); scene.add(rim);
  // The platform: stained-glass top, gold rim, a pillar falling into darkness.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024; paintWindow(cv, {});
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const glass = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.12, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a65a', roughness: 0.3, metalness: 0.9 });
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R, PLAT_R, 0.6, 128), [gold, glass, gold]); plat.position.y = -0.3; plat.receiveShadow = true; scene.add(plat);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(PLAT_R, 0.12, 12, 160).rotateX(Math.PI / 2), gold); lip.position.y = 0.02; scene.add(lip);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R * 0.85, PLAT_R * 0.55, 400, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#2a2440', roughness: 0.6, metalness: 0.3, emissive: '#1a1030', side: THREE.DoubleSide })); pillar.position.y = -200.6; scene.add(pillar);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R * 0.9, PLAT_R * 1.1, 80, 64, 1, true), new THREE.MeshBasicMaterial({ color: '#fff1c8', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); shaft.position.y = 40; scene.add(shaft);
  const motes = pointCloud(500, 0.12, '#fff1c8'); scene.add(motes);
  { const A = motes.geometry.attributes.position.array, C = motes.geometry.attributes.color.array; for (let i = 0; i < 500; i++) { const r = Math.random() * 18, a = Math.random() * Math.PI * 2; A.set([Math.cos(a) * r, Math.random() * 20 - 4, Math.sin(a) * r], i * 3); const k = 0.4 + Math.random() * 0.6; C.set([k, k * 0.92, k * 0.75], i * 3); } }
  // Spell targets: a wooden totem, a water orb on a pedestal, a lightning rod.
  const targets = new THREE.Group(); scene.add(targets);
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.85 }), stone = new THREE.MeshStandardMaterial({ color: '#8f8aa8', roughness: 0.6 });
  const totem = new THREE.Group(); totem.position.set(-3.6, 0, -4.6); targets.add(totem);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35 - i * 0.04, 0.4 - i * 0.04, 0.7, 10), wood); b.position.y = 0.35 + i * 0.7; b.castShadow = true; totem.add(b); }
  const fire = new THREE.Group(); fire.position.y = 2.2; totem.add(fire); for (let i = 0; i < 6; i++) { const f = glowSprite(i % 2 ? '#ff7a2a' : '#ffd27a', 1.2, 0); fire.add(f); }
  const orbStand = new THREE.Group(); orbStand.position.set(0, 0, -6.2); targets.add(orbStand);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 16), stone); ped.position.y = 0.55; ped.castShadow = true; orbStand.add(ped);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#5fb8ff', roughness: 0.05, transmission: 0.6, thickness: 0.6, transparent: true, opacity: 0.85, ior: 1.33 })); orb.position.y = 1.6; orbStand.add(orb);
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshPhysicalMaterial({ color: '#dff6ff', roughness: 0.15, transmission: 0.5, thickness: 0.8, flatShading: true, transparent: true, opacity: 0.9 })); ice.position.y = 1.6; ice.scale.setScalar(0.01); orbStand.add(ice);
  const rod = new THREE.Group(); rod.position.set(3.6, 0, -4.6); targets.add(rod);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.2, 10), new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 1, roughness: 0.25 })); pole.position.y = 1.6; pole.castShadow = true; rod.add(pole);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 10), pole.material); tip.position.y = 3.35; rod.add(tip);
  const bolt = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)), new THREE.LineBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0 })); bolt.frustumCulled = false; scene.add(bolt);
  const flash = glowSprite('#bfe0ff', 6, 0); scene.add(flash);
  // The Lumen system.
  const system = new THREE.Group(); system.position.copy(SYSTEM_AT); scene.add(system);
  const lumen = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 24), new THREE.MeshBasicMaterial({ color: '#fff3c8' })); system.add(lumen);
  const lglow = glowSprite('#ffd27a', 260, 0.9); system.add(lglow); const lglow2 = glowSprite('#ff9ad5', 520, 0.25); system.add(lglow2);
  const sysLight = new THREE.PointLight('#fff1d0', 3, 0, 0); system.add(sysLight);
  const worlds = WORLDS.map((w) => {
    const g = new THREE.Group(); system.add(g);
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(10 + w.r * 2, 1), new THREE.MeshStandardMaterial({ color: w.col, roughness: 0.6, flatShading: true, emissive: w.col, emissiveIntensity: 0.12 })); g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9 + w.r * 2, 2, 8, 9), new THREE.MeshStandardMaterial({ color: '#3a2a4a', roughness: 0.9, flatShading: true })); cap.position.y = -9 - w.r; g.add(cap);
    const halo = glowSprite(w.col, 60 + w.r * 6, 0.35); g.add(halo);
    const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(160)].map((_, i) => new THREE.Vector3(Math.cos((i / 160) * Math.PI * 2) * w.r * AU, 0, Math.sin((i / 160) * Math.PI * 2) * w.r * AU))), new THREE.LineBasicMaterial({ color: w.col, transparent: true, opacity: 0.35 })); system.add(orbit);
    return { ...w, g };
  });
  const transfer = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3)), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 8, gapSize: 6, transparent: true, opacity: 0.85 })); transfer.frustumCulled = false; system.add(transfer);
  // The Prism ship: a faceted hull with bright wings.
  const ship = new THREE.Group(); system.add(ship);
  const hull = new THREE.Mesh(new THREE.OctahedronGeometry(5, 0), new THREE.MeshStandardMaterial({ color: '#ff5a7a', roughness: 0.4, metalness: 0.3, flatShading: true })); hull.scale.set(0.8, 0.6, 1.8); ship.add(hull);
  for (const s of [-1, 1]) { const wg = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 3), new THREE.MeshStandardMaterial({ color: s < 0 ? '#5fd0ff' : '#ffd27a', roughness: 0.4, flatShading: true })); wg.position.set(s * 5, 0, 1); wg.rotation.z = s * 0.2; ship.add(wg); }
  const trail = glowSprite('#ffd27a', 14, 0.9); trail.position.z = 9; ship.add(trail);
  return { scene, dome, key, plat, glass, tex, cv, motes, shaft, targets, totem, fire, orb, ice, rod, bolt, flash, system, worlds, transfer, ship, lumen };
}
