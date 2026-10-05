import * as THREE from 'three';
import { glowSprite } from './holo.js';

// RUSTWING · the freighter. An original saucer-hulled tramp freighter: a weathered lathe-turned hull, a domed
// cockpit at the bow, two swept engine pods astern, a dorsal sensor mast and a ring of deck greebles.
// Hull radius ≈ 6 units; the bow points along −z.

function hullTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#8a8d92'; g.fillRect(0, 0, 1024, 1024);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { const x = r() * 1024, y = r() * 1024, w = 20 + r() * 90, h = 14 + r() * 60, v = 118 + r() * 40; g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(30,30,34,.35)'; g.strokeRect(x, y, w, h); }
  for (let i = 0; i < 160; i++) { const x = r() * 1024, y = r() * 1024, l = 30 + r() * 140; const gr = g.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, 'rgba(120,60,30,.45)'); gr.addColorStop(1, 'rgba(120,60,30,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 6, l); }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(20,20,24,${0.15 + r() * 0.3})`; g.beginPath(); g.arc(r() * 1024, r() * 1024, 6 + r() * 30, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(40,40,46,.6)'; g.lineWidth = 2; for (let i = 0; i < 1024; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export function buildShip() {
  const ship = new THREE.Group(), tex = hullTexture();
  const metal = new THREE.MeshStandardMaterial({ color: '#d8dade', map: tex, roughness: 0.62, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.5, metalness: 0.7 });
  // Saucer: a lathe profile (radius, height).
  const prof = [[0, 0.95], [1.6, 0.92], [3.2, 0.75], [4.8, 0.48], [5.8, 0.24], [6.1, 0.0], [5.8, -0.24], [4.8, -0.46], [3.2, -0.66], [1.6, -0.78], [0, -0.8]].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), metal); hull.castShadow = hull.receiveShadow = true; ship.add(hull);
  // Rim band and trench.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.0, 0.16, 10, 120), dark); rim.rotation.x = Math.PI / 2; ship.add(rim);
  const trench = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.12, 8, 100), dark); trench.rotation.x = Math.PI / 2; trench.position.y = 0.7; ship.add(trench);
  // Deck greebles around the dorsal ring.
  const grebe = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, 140), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) { const a = r() * Math.PI * 2, rad = 1.6 + r() * 3.6, h = 0.95 - (rad / 6) * 0.7, sx = 0.2 + r() * 0.6, sy = 0.08 + r() * 0.3, sz = 0.2 + r() * 0.5; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); m4.compose(new THREE.Vector3(Math.cos(a) * rad, h + sy / 2, Math.sin(a) * rad), q, new THREE.Vector3(sx, sy, sz)); grebe.setMatrixAt(i, m4); }
  ship.add(grebe);
  // Dorsal dome and sensor mast with a turning dish.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal); dome.position.y = 0.8; dome.scale.y = 0.55; ship.add(dome);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 8), dark); mast.position.set(0, 1.9, 0.6); ship.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })); dish.rotation.x = Math.PI; dish.position.set(0, 2.7, 0.6); ship.add(dish);
  // Cockpit: a domed bubble at the bow with glowing windows.
  const cpBody = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 1.1, 32), metal); cpBody.position.set(0, 0.55, -5.2); ship.add(cpBody);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#7fb8ff', metalness: 0.1, roughness: 0.05, transmission: 0.2, transparent: true, opacity: 0.75, emissive: '#2a5aa0', emissiveIntensity: 0.6 }));
  glass.position.set(0, 1.08, -5.2); glass.scale.y = 0.7; ship.add(glass);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 6, 40), dark); frame.rotation.x = Math.PI / 2; frame.position.set(0, 1.1, -5.2); ship.add(frame);
  // Engine pods astern, swept outward, each with a hot blue exhaust.
  const glows = [];
  for (const sx of [-1, 1]) {
    const pod = new THREE.Group(); pod.position.set(sx * 3.2, 0, 4.7); pod.rotation.y = sx * 0.12; ship.add(pod);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 3.6, 28), metal); body.rotation.x = Math.PI / 2; pod.add(body);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.2), dark); pylon.position.set(-sx * 0.9, 0, -0.4); pod.add(pylon);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.75, 0.6, 28, 1, true), dark); bell.rotation.x = Math.PI / 2; bell.position.z = 2.05; pod.add(bell);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28), new THREE.MeshBasicMaterial({ color: '#7fd0ff' })); core.position.z = 2.3; pod.add(core);
    const g1 = glowSprite('#5ab4ff', 5, 0.8); g1.position.z = 2.6; pod.add(g1);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.8, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    plume.rotation.x = -Math.PI / 2; plume.position.z = 5.3; plume.visible = false; pod.add(plume);
    glows.push({ core, g1, plume });
  }
  // Rear engine strip across the stern.
  const strip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 0.1), new THREE.MeshBasicMaterial({ color: '#8fd8ff' })); strip.position.set(0, 0.05, 6.02); ship.add(strip);
  // Navigation lights.
  const nav = [['#ff3a3a', -6.1], ['#3aff7a', 6.1]].map(([col, x]) => { const sp = glowSprite(col, 1.2, 0.9); sp.position.set(x, 0, 0); ship.add(sp); return sp; });
  ship.userData = { glows, dish, strip, nav };
  return ship;
}
export function setThrust(ship, k, t) {
  const U = ship.userData; for (const g of U.glows) { g.g1.material.opacity = 0.2 + 0.5 * k; g.g1.scale.setScalar(2 + 2.6 * k + Math.sin(t * 40) * 0.15 * k); g.plume.material.opacity = 0.04 + 0.16 * k; g.plume.scale.set(0.7, 0.3 + 0.6 * k, 0.7); g.plume.position.z = 2.3 + 3 * (0.3 + 0.6 * k); g.core.material.color.setRGB(0.4 + 0.6 * k, 0.75 + 0.25 * k, 1); }
  U.strip.material.color.setRGB(0.35 + 0.6 * k, 0.7 + 0.3 * k, 1); U.dish.rotation.y = t * 0.8; U.nav.forEach((n, i) => (n.material.opacity = Math.sin(t * 3 + i * Math.PI) > 0.6 ? 1 : 0.15));
}

// A gas giant for scale in the hangar and before a jump.
export function buildPlanet() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  for (let y = 0; y < 256; y++) { const v = Math.sin(y * 0.11) * 0.5 + Math.sin(y * 0.37 + 1) * 0.3 + Math.sin(y * 0.05) * 0.2; g.fillStyle = `rgb(${170 + v * 50},${120 + v * 40},${90 + v * 30})`; g.fillRect(0, y, 512, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.04, 48, 24), new THREE.MeshBasicMaterial({ color: '#ffb080', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.BackSide })); p.add(atm);
  return p;
}
