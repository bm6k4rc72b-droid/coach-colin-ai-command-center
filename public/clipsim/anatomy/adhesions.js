import * as THREE from 'three';
import { VESSELS, NERVES } from '../config/anatomy.js';

// Arachnoid adhesions around the aneurysm. The neck is wrapped in a fibrous
// collar, and fine strands tether the dome to the anterior choroidal artery,
// the oculomotor nerve and the medial temporal lobe. The dissector frees the
// neck by releasing these, so that the clip blades can pass cleanly around it.
// Dissection progress (0 → 1) thins the collar and releases the strands one by one.
export function buildAdhesions(aneurysm, vessels) {
  const g = aneurysm.geometry;
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#f2ece4', transparent: true, opacity: 0.78, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.2,
    sheen: 1, sheenColor: new THREE.Color('#ffffff'), depthWrite: false,
  });

  // Collar: a lumpy torus hugging the neck, perpendicular to the aneurysm axis.
  const collarGeo = new THREE.TorusGeometry(g.neckRadius + 0.35, 0.55, 12, 48);
  const pos = collarGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.25 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 4.1);
    pos.setXYZ(i, x, y, z * k);
  }
  collarGeo.computeVertexNormals();
  const collar = new THREE.Mesh(collarGeo, mat);
  collar.position.copy(g.neckPlane).addScaledVector(g.axis, -0.2);
  collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.axis);
  collar.userData = { part: 'adhesion', kind: 'adhesion' };
  group.add(collar);

  // Strands from points on the dome to neighbouring structures.
  const up = Math.abs(g.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const s1 = new THREE.Vector3().crossVectors(g.axis, up).normalize();
  const s2 = new THREE.Vector3().crossVectors(g.axis, s1).normalize();
  const domePt = (a, h) => g.domeCenter.clone()
    .addScaledVector(s1, Math.cos(a) * g.domeRadius * 0.95)
    .addScaledVector(s2, Math.sin(a) * g.domeRadius * 0.95)
    .addScaledVector(g.axis, h);
  const achA = vessels.AChA.userData.curve, pcom = vessels.PCom.userData.curve;
  const cn3 = new THREE.CatmullRomCurve3(NERVES.oculomotor.points.map((p) => new THREE.Vector3(...p)));
  const targets = [
    [domePt(0.3, -1.2), achA.getPointAt(0.3)],
    [domePt(1.1, -0.6), achA.getPointAt(0.45)],
    [domePt(2.2, -1.5), pcom.getPointAt(0.35)],
    [domePt(3.0, 0.4), cn3.getPointAt(0.55)],
    [domePt(3.8, -0.4), cn3.getPointAt(0.45)],
    [domePt(4.6, 0.8), new THREE.Vector3(g.domeCenter.x + 2, -14.2, g.domeCenter.z - 1)],
    [domePt(5.4, -0.9), new THREE.Vector3(g.domeCenter.x - 1, -14.4, g.domeCenter.z + 1.5)],
  ];
  const strands = targets.map(([a, b], i) => {
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0, -0.6));
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.14 + (i % 3) * 0.05, 6, false), mat);
    m.userData = { part: 'adhesion', kind: 'adhesion' };
    group.add(m);
    return m;
  });

  let progress = 0;
  return {
    group, collar, strands,
    get progress() { return progress; },
    setProgress(p) {
      progress = THREE.MathUtils.clamp(p, 0, 1);
      collar.scale.setScalar(1 - progress * 0.1);
      collar.material.opacity = 0.78 * (1 - progress) + 0.02;
      collar.visible = progress < 0.999;
      strands.forEach((s, i) => { s.visible = progress < (i + 1) / (strands.length + 1); });
    },
  };
}
