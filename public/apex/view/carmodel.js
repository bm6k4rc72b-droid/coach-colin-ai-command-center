import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// APEX · the car (to scale: 5.6 m long, 2.0 m wide). Carbon monocoque, sidepods,
// halo, multi-element wings with endplates, pushrod suspension, wheels with the
// compound's sidewall stripe, a pulsing rain light. Each part carries an explode
// offset for the exploded view. +z is forward.
// ─────────────────────────────────────────────────────────────────────────────

export function buildCar() {
  const g = new THREE.Group(), parts = [];
  const carbon = new THREE.MeshStandardMaterial({ color: '#16171b', metalness: 0.55, roughness: 0.32 });
  const gloss = new THREE.MeshStandardMaterial({ color: '#0b0b0d', metalness: 0.7, roughness: 0.18 });
  const red = new THREE.MeshStandardMaterial({ color: '#d4122e', metalness: 0.4, roughness: 0.28 });
  const cyan = new THREE.MeshStandardMaterial({ color: '#0ff0ff', emissive: '#0ad8ff', emissiveIntensity: 1.4, roughness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.85 });
  const rimM = new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 0.9, roughness: 0.25 });
  const add = (mesh, ex, name) => { mesh.castShadow = true; g.add(mesh); parts.push({ mesh, base: mesh.position.clone(), ex: new THREE.Vector3(...ex), name }); return mesh; };
  // Monocoque & nose (lofted profile).
  const tub = new THREE.Shape(); tub.moveTo(-0.38, 0); tub.lineTo(0.38, 0); tub.quadraticCurveTo(0.45, 0.35, 0.3, 0.62); tub.lineTo(-0.3, 0.62); tub.quadraticCurveTo(-0.45, 0.35, -0.38, 0);
  const tubG = new THREE.ExtrudeGeometry(tub, { depth: 2.6, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 }); tubG.translate(0, 0.08, -1.0);
  add(new THREE.Mesh(tubG, carbon), [0, 0.9, 0], 'tub');
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 1.9, 24, 1), carbon); nose.rotation.x = Math.PI / 2; nose.scale.set(1.4, 1, 0.55); nose.position.set(0, 0.32, 2.5); add(nose, [0, 0.4, 1.6], 'nose');
  const noseStripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1.7), red); noseStripe.position.set(0, 0.47, 2.45); add(noseStripe, [0, 0.4, 1.6], 'nose');
  // Front wing: three elements + endplates.
  const fw = new THREE.Group(); fw.position.set(0, 0.12, 3.35);
  for (let i = 0; i < 3; i++) { const el = new THREE.Mesh(new THREE.BoxGeometry(1.95 - i * 0.12, 0.025, 0.22), i === 2 ? red : carbon); el.position.set(0, i * 0.07, -i * 0.14); el.rotation.x = -0.12 - i * 0.12; fw.add(el); }
  for (const s of [-1, 1]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.6), carbon); ep.position.set(s * 0.98, 0.1, -0.12); fw.add(ep); }
  add(fw, [0, 0, 2.2], 'frontWing'); fw.userData.flaps = fw.children.slice(0, 3);
  // Sidepods with cyan inlets.
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 1.9), carbon); pod.position.set(s * 0.62, 0.35, -0.35); pod.geometry.translate(0, 0, 0); add(pod, [s * 1.4, 0.2, 0], 'sidepod');
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.03), cyan); inlet.position.set(s * 0.62, 0.52, 0.61); add(inlet, [s * 1.4, 0.2, 0], 'sidepod');
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 1.7), red); stripe.position.set(s * 0.875, 0.38, -0.35); add(stripe, [s * 1.4, 0.2, 0], 'sidepod');
  }
  // Floor (ground effect) and diffuser.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 3.6), gloss); floor.position.set(0, 0.05, -0.2); add(floor, [0, -0.9, 0], 'floor');
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.6), carbon); diff.position.set(0, 0.16, -2.2); diff.rotation.x = 0.35; add(diff, [0, -0.9, -0.6], 'floor');
  // Engine cover, airbox, shark fin.
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.34, 1.9, 20), carbon); cover.rotation.x = -Math.PI / 2; cover.scale.set(1, 1, 1.4); cover.position.set(0, 0.62, -0.95); add(cover, [0, 1.4, -0.4], 'engine');
  const airbox = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 10, 20), carbon); airbox.position.set(0, 0.98, 0.0); add(airbox, [0, 1.4, -0.4], 'engine');
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 1.3), red); fin.position.set(0, 0.92, -1.25); add(fin, [0, 1.4, -0.4], 'engine');
  // Halo.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 40, Math.PI), new THREE.MeshStandardMaterial({ color: '#9aa0aa', metalness: 1, roughness: 0.2 })); halo.rotation.set(-Math.PI / 2, 0, 0); halo.position.set(0, 0.88, 0.45); add(halo, [0, 1.1, 0.3], 'halo');
  const haloPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8), halo.material); haloPost.position.set(0, 0.74, 0.88); add(haloPost, [0, 1.1, 0.3], 'halo');
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), new THREE.MeshStandardMaterial({ color: '#f2f2f2', metalness: 0.3, roughness: 0.2 })); helmet.position.set(0, 0.82, 0.2); add(helmet, [0, 1.6, 0], 'driver');
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), cyan); visor.position.set(0, 0.84, 0.34); add(visor, [0, 1.6, 0], 'driver');
  // Rear wing + beam wing + endplates.
  const rw = new THREE.Group(); rw.position.set(0, 0.95, -2.55);
  const main = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.03, 0.34), carbon); rw.add(main);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.025, 0.2), red); flap.position.set(0, 0.12, -0.18); rw.add(flap);
  for (const s of [-1, 1]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.72), carbon); ep.position.set(s * 0.54, -0.12, -0.05); rw.add(ep); const led = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.5, 0.02), cyan); led.position.set(s * 0.555, -0.12, 0.3); rw.add(led); }
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.12), carbon); pylon.position.set(0, -0.3, 0.1); rw.add(pylon);
  add(rw, [0, 1.2, -1.8], 'rearWing'); rw.userData.main = main; rw.userData.flap = flap;
  const rain = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: '#ff1030' })); rain.position.set(0, 0.32, -2.62); add(rain, [0, 0.6, -2.6], 'rearWing');
  // Wheels & suspension.
  const wheels = [];
  for (const [x, z, w, name] of [[0.82, 1.75, 0.36, 'FL'], [-0.82, 1.75, 0.36, 'FR'], [0.8, -1.85, 0.42, 'RL'], [-0.8, -1.85, 0.42, 'RR']]) {
    const wg = new THREE.Group(); wg.position.set(x, 0.36, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, w, 36), rubber); tyre.rotation.z = Math.PI / 2; wg.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, w + 0.01, 24), rimM); rim.rotation.z = Math.PI / 2; wg.add(rim);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f' })); band.rotation.y = Math.PI / 2; band.position.x = Math.sign(x) * (w / 2 + 0.002); wg.add(band);
    const spokes = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.4, 0.04), rimM); wg.add(spokes);
    add(wg, [Math.sign(x) * 1.3, 0, Math.sign(z) * 0.5], 'wheel'); wheels.push({ g: wg, band, spokes, name });
    for (const dy of [0.08, -0.08]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, Math.abs(x) - 0.3, 6), carbon); arm.rotation.z = Math.PI / 2; arm.position.set(x / 2 + Math.sign(x) * 0.12, 0.36 + dy, z); add(arm, [Math.sign(x) * 0.7, 0, Math.sign(z) * 0.25], 'suspension'); }
  }
  g.userData = { parts, wheels, fw, rw, rain };
  return g;
}

// Explode (0 = assembled, 1 = fully exploded).
export function explode(car, u) { for (const p of car.userData.parts) p.mesh.position.copy(p.base).addScaledVector(p.ex, u); }
