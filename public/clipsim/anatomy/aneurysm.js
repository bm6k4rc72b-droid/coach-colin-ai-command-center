import * as THREE from 'three';
import { ANEURYSM, VESSELS, HEART } from '../config/anatomy.js';
import { Materials } from './materials.js';
import { noise3 } from './noise.js';

// The IC-PC aneurysm: a saccular outpouching of the POSTERIOR wall of the ICA,
// right at the origin of the posterior communicating artery. The model is a
// lathe profile: a short neck that swells into a near-spherical dome, then
// rotated to point along ANEURYSM.direction.
//
// Returns the mesh group plus the geometry that clip evaluation needs later:
// the neck centre, the axis and the neck radius.
export function buildAneurysm(icaCurve) {
  const rd = ANEURYSM.domeDiameter / 2;
  const rn = ANEURYSM.neckDiameter / 2;
  const axis = new THREE.Vector3(...ANEURYSM.direction).normalize();

  // The neck starts inside the ICA wall so the two surfaces blend.
  const hNeck = 1.8;
  const hc = hNeck + Math.sqrt(rd * rd - rn * rn); // height of the dome centre along the axis
  const profile = [
    new THREE.Vector2(rn * 1.08, 0),
    new THREE.Vector2(rn * 1.0, 0.6),
    new THREE.Vector2(rn * 0.98, hNeck - 0.4),
  ];
  const a0 = -Math.acos(rn / rd);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (Math.PI / 2 - a0) * (i / steps);
    profile.push(new THREE.Vector2(Math.max(0.0001, rd * Math.cos(a)), hc + rd * Math.sin(a)));
  }
  const geo = new THREE.LatheGeometry(profile, 64);

  // Gentle lobulation: real aneurysm domes are rarely perfect spheres.
  const pos = geo.attributes.position, p = new THREE.Vector3(), n = new THREE.Vector3();
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.y < hNeck) continue;
    n.fromBufferAttribute(nor, i);
    const w = THREE.MathUtils.smoothstep(p.y, hNeck, hNeck + 1.5);
    const d = noise3(p.x * 0.55, p.y * 0.55, p.z * 0.55) * 0.35 * w;
    pos.setXYZ(i, p.x + n.x * d, p.y + n.y * d, p.z + n.z * d);
  }
  geo.computeVertexNormals();

  const group = new THREE.Group();
  const dome = new THREE.Mesh(geo, Materials.aneurysm(HEART.pulse.aneurysm));
  dome.userData = { part: 'aneurysm', kind: 'aneurysm' };
  group.add(dome);

  // Bleb (daughter sac): a small secondary bulge on the dome. It marks the
  // thinnest, most fragile point of the wall.
  const { radius: br, polar, azimuth } = ANEURYSM.bleb;
  const dir = new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth));
  const bleb = new THREE.Mesh(new THREE.SphereGeometry(br, 28, 20), Materials.bleb(HEART.pulse.bleb));
  bleb.position.set(0, hc, 0).addScaledVector(dir, rd - br * 0.35);
  bleb.userData = { part: 'bleb', kind: 'aneurysm' };
  group.add(bleb);

  // Place the group on the ICA wall at the PCom origin.
  const base = icaCurve.getPointAt(ANEURYSM.neckParam);
  const neckCenter = base.clone().addScaledVector(axis, VESSELS.ICA.radius * 0.6);
  group.position.copy(neckCenter);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  group.updateMatrixWorld(true);

  const domeCenter = neckCenter.clone().addScaledVector(axis, hc);
  const neckPlaneCenter = neckCenter.clone().addScaledVector(axis, hNeck);

  // The neck as the surgeon clips it: a footprint on the ICA wall. The clip
  // blades should lie just above the wall surface, parallel to it. Because the
  // sac leaves the wall obliquely, the footprint is an ellipse elongated along
  // the ICA, which is why the blades go parallel to the parent artery.
  const t = icaCurve.getTangentAt(ANEURYSM.neckParam).normalize();
  const wn = axis.clone().addScaledVector(t, -axis.dot(t)).normalize();  // outward wall normal at the neck
  const cosA = axis.dot(wn);
  const u1 = axis.clone().addScaledVector(wn, -cosA).normalize();         // long axis, along the ICA
  const u2 = new THREE.Vector3().crossVectors(wn, u1).normalize();        // short axis, around the ICA
  const wallPoint = base.clone().addScaledVector(wn, VESSELS.ICA.radius);
  const wall = {
    n: wn, u1, u2, point: wallPoint, cosA,
    A: rn / cosA, B: rn,
    // Centre of the neck footprint on a plane h mm above the wall surface.
    center(h) {
      const s = wallPoint.clone().addScaledVector(wn, h).sub(neckCenter).dot(wn) / cosA;
      return neckCenter.clone().addScaledVector(axis, s);
    },
  };
  return {
    group, dome, bleb,
    geometry: {
      axis, neckRadius: rn, domeRadius: rd,
      neckBase: neckCenter,          // inside the ICA wall
      neckPlane: neckPlaneCenter,    // where the blades should close
      domeCenter,
      wall,
      blebWorld: bleb.getWorldPosition(new THREE.Vector3()),
    },
  };
}
