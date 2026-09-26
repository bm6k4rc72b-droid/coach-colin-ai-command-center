import * as THREE from 'three';
import { SPATULAS } from '../config/anatomy.js';
import { Materials } from './materials.js';

// Brain spatulas: thin, malleable metal blades on a self-retaining arm. They
// hold the frontal and temporal lobes apart with as little pressure as possible,
// because sustained retraction can injure the cortex.
export function buildSpatulas() {
  return SPATULAS.map((cfg) => {
    const tip = new THREE.Vector3(...cfg.tip), handle = new THREE.Vector3(...cfg.handle);
    const fwd = handle.clone().sub(tip);
    const len = fwd.length();
    fwd.normalize();
    // The flat face points toward the lobe it retracts: +Y for frontal, −Y for temporal.
    const toward = new THREE.Vector3(0, Math.sign(cfg.tip[1]), 0);
    const thick = toward.clone().addScaledVector(fwd, -toward.dot(fwd)).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, thick).normalize();

    const geo = new THREE.BoxGeometry(cfg.width, cfg.thickness, len, 6, 1, 40);
    // Rounded tip, with a slight taper toward the handle end.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const t = THREE.MathUtils.clamp(z / len + 0.5, 0, 1); // 0 = tip, 1 = handle
      const taper = 1 - 0.25 * t;
      const round = t < 0.06 ? Math.sqrt(1 - ((0.06 - t) / 0.06) ** 2) : 1;
      pos.setX(i, x * taper * (0.35 + 0.65 * round));
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, Materials.metal());
    const basis = new THREE.Matrix4().makeBasis(side, thick, fwd);
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(tip).addScaledVector(fwd, len / 2);
    mesh.userData = { part: 'spatula', kind: 'instrument', id: cfg.id, tip, fwd, thick };
    return mesh;
  });
}
