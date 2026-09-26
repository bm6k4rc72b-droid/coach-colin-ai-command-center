import * as THREE from 'three';

// Aneurysm clip (Yasargil/Sugita-style), built in its own frame:
//   origin = where the blades leave the clip head (the "heel" of the blades)
//   +Z     = along the blades toward their tips
//   ±X     = the direction the jaws open and close
//   −Z     = the spring coil and head, where the applier grips it
// A straight clip has straight blades; a curved clip bends them along +Y.
export const CLIP_SPECS = {
  straight: { length: 7, curve: 0, color: '#cfd6e2' },
  curved:   { length: 7, curve: 1.8, color: '#cfd6e2' },
  temporary:{ length: 5, curve: 0, color: '#d6a73e' },   // temporary clips are gold: lower closing force
};

function bladeGeometry(length, curve) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector3(0, curve * Math.sin(t * Math.PI / 2) ** 2, t * length));
  }
  const path = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(path, 32, 0.32, 8, false);
  // Flatten into a blade: wide along Y, thin along X.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * 0.55);
  geo.computeVertexNormals();
  return { geo, path };
}

export function buildClip(type = 'straight') {
  const spec = CLIP_SPECS[type];
  const mat = new THREE.MeshPhysicalMaterial({ color: spec.color, metalness: 0.85, roughness: 0.2, clearcoat: 0.8, envMapIntensity: 8 });
  const g = new THREE.Group();
  const { geo, path } = bladeGeometry(spec.length, spec.curve);
  const blades = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const blade = new THREE.Mesh(geo, mat);
    pivot.add(blade);
    pivot.userData.side = side;
    g.add(pivot);
    return pivot;
  });
  const tipCap = new THREE.SphereGeometry(0.3, 10, 8);
  blades.forEach((p) => { const c = new THREE.Mesh(tipCap, mat); c.position.copy(path.getPointAt(1)); c.scale.set(0.55, 1, 1); p.add(c); });

  // Head and spring coil.
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 2.4), mat);
  head.position.z = -1.3;
  g.add(head);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.28, 10, 28), mat);
  coil.rotation.y = Math.PI / 2;
  coil.position.z = -3.4;
  g.add(coil);

  // Jaw opening in mm (tip separation). 0 = closed.
  g.userData = { type, spec, path, blades, opening: 0 };
  g.userData.setOpening = (mm) => {
    g.userData.opening = mm;
    const a = Math.atan2(mm / 2, spec.length);
    blades.forEach((p) => { p.rotation.y = p.userData.side * a; p.position.x = p.userData.side * 0.34; });
  };
  g.userData.setOpening(0);
  return g;
}

// A slim bayonet applier holding the clip head. Built like the other
// instruments (grip at the origin, shaft up +Y); the tool aims it toward the
// surgeon's right hand so it never blocks the view down the clip.
export function buildApplier() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#c3cad6', metalness: 0.75, roughness: 0.25, clearcoat: 0.6, envMapIntensity: 8 });
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.3), mat);
  g.add(jaw);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 70, 14), mat);
  shaft.position.y = 35.5;
  g.add(shaft);
  return g;
}
