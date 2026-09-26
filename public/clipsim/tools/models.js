import * as THREE from 'three';

// Instrument cursor models. Each is built with its TIP at the origin and the
// shaft running up +Y toward the surgeon's hand. The tool manager aims +Y back
// toward the microscope, offset to the side the instrument enters from.

const steel = () => new THREE.MeshPhysicalMaterial({ color: '#d7dde8', metalness: 0.75, roughness: 0.22, clearcoat: 0.6, envMapIntensity: 8 });
const darkSteel = () => new THREE.MeshPhysicalMaterial({ color: '#7d8594', metalness: 0.8, roughness: 0.35, envMapIntensity: 8 });
const insulation = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 1, envMapIntensity: 1.5 });

function cyl(r0, r1, len, mat, y0 = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
  m.position.y = y0 + len / 2;
  return m;
}

export function suctionModel() {
  // Frazier-style suction tube: a straight cannula with a bevelled, blunt tip.
  const g = new THREE.Group();
  const s = steel();
  g.add(cyl(0.95, 1.0, 90, s, 0.4));
  const tip = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.18, 8, 24), darkSteel());
  tip.rotation.x = Math.PI / 2;
  tip.position.y = 0.4;
  g.add(tip);
  const lumen = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: '#050203' }));
  lumen.rotation.x = Math.PI / 2;
  lumen.position.y = 0.35;
  g.add(lumen);
  return g;
}

export function scissorsModel() {
  // Micro scissors: a slim shaft with two short blades that open and close.
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.6, 90, steel(), 4.2));
  const bladeGeo = new THREE.BoxGeometry(0.28, 4.4, 0.55);
  bladeGeo.translate(0, 2.2, 0);
  const bl = new THREE.Mesh(bladeGeo, steel()), br = new THREE.Mesh(bladeGeo, steel());
  const pivot = new THREE.Group();
  pivot.position.y = 4.2;
  bl.rotation.z = Math.PI; br.rotation.z = Math.PI;
  pivot.add(bl, br);
  g.add(pivot);
  g.userData.setOpen = (a) => { bl.rotation.z = Math.PI + a; br.rotation.z = Math.PI - a; };
  g.userData.setOpen(0.18);
  return g;
}

export function bipolarModel() {
  // Bipolar forceps: two insulated tines with bare tips about 1 mm apart.
  // Current passes between the tips, sealing only the tissue grasped there.
  const g = new THREE.Group();
  const tips = [];
  for (const side of [-1, 1]) {
    const tine = new THREE.Group();
    const bare = cyl(0.18, 0.3, 6, steel(), 0);
    const ins = cyl(0.32, 0.55, 80, insulation('#2c6bff'), 6);
    tine.add(bare, ins);
    tine.position.x = side * 0.55;
    tine.rotation.z = side * -0.012;
    g.add(tine);
    tips.push(bare);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0, depthWrite: false }));
  glow.position.y = 0.3;
  g.add(glow);
  g.userData.setGlow = (v) => { glow.material.opacity = v * 0.8; glow.scale.setScalar(0.6 + v * 0.8 + Math.random() * 0.2 * v); };
  return g;
}

export function dissectorModel() {
  // Microdissector: a fine shaft ending in a small angled, blunt tip.
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.5, 90, steel(), 2.5));
  const bend = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 2.8, 12), steel());
  bend.position.set(0.55, 1.3, 0);
  bend.rotation.z = 0.45;
  g.add(bend);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), steel());
  ball.position.set(1.1, 0.05, 0);
  g.add(ball);
  return g;
}

export function spatulaCursorModel() {
  // A small hand-shaped marker: the spatula tool adjusts the existing retractors.
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: '#3ff3ff' }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

export function dopplerModel() {
  // Micro Doppler probe: a thin wand with a 1 mm transducer tip, and its cable.
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.6, 90, insulation('#eaeef5'), 0.5));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshPhysicalMaterial({ color: '#3ff3ff', emissive: '#0b7f8a', roughness: 0.2, clearcoat: 1 }));
  tip.position.y = 0.4;
  g.add(tip);
  return g;
}

export function endoscopeModel() {
  // 2.7 mm rigid endoscope with a 30° lens and a ring light.
  const g = new THREE.Group();
  g.add(cyl(1.35, 1.35, 100, steel(), 0));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshPhysicalMaterial({ color: '#0a1830', roughness: 0.02, clearcoat: 1, emissive: '#1a4cff', emissiveIntensity: 0.6 }));
  lens.rotation.x = Math.PI / 2 + 0.52;
  lens.position.y = 0.05;
  g.add(lens);
  return g;
}

export function reticleModel(color = '#3ff3ff') {
  // A floating holographic reticle, used for the ICG camera trigger.
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.08, 6, 48), mat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1), mat);
    const a = (i / 4) * Math.PI * 2;
    tick.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
    tick.lookAt(0, 0, 0);
    g.add(tick);
  }
  g.renderOrder = 10;
  return g;
}
