import * as THREE from 'three';
import { VESSELS, PERFORATORS, NERVES, HEART } from '../config/anatomy.js';
import { Materials } from './materials.js';

const v3 = (a) => new THREE.Vector3(...a);

// Builds a tube along a Catmull-Rom spline. `flatten` squashes the cross-section
// along world Z, which turns the optic nerve into the flat band it is in life.
export function tubeAlong(points, radius, { radial = 22, flatten = 1, perMm = 2.4 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(v3), false, 'catmullrom', 0.5);
  const tubular = Math.max(16, Math.ceil(curve.getLength() * perMm));
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  if (flatten !== 1) {
    const pos = geo.attributes.position, c = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      curve.getPointAt(i / tubular, c);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        p.fromBufferAttribute(pos, k).sub(c);
        p.z *= flatten;
        pos.setXYZ(k, c.x + p.x, c.y + p.y, c.z + p.z);
      }
    }
    geo.computeVertexNormals();
  }
  return { curve, geo };
}

// Rounded end cap (a sphere), so vessel ends and branch points look continuous.
function cap(point, radius, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material);
  m.position.copy(point);
  return m;
}

export function buildVessels() {
  const parts = {};
  for (const [id, cfg] of Object.entries(VESSELS)) {
    const { curve, geo } = tubeAlong(cfg.points, cfg.radius);
    const mat = cfg.vein ? Materials.vein() : Materials.artery(HEART.pulse.artery * (cfg.radius / 2));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { part: id, kind: cfg.vein ? 'vein' : 'artery', curve, radius: cfg.radius };
    parts[id] = mesh;
  }
  // Smooth the ICA bifurcation (the "T" into M1 and A1) and the MCA division.
  parts.ICA.add(cap(parts.ICA.userData.curve.getPointAt(1), VESSELS.ICA.radius * 1.02, parts.ICA.material));
  parts.M1.add(cap(parts.M1.userData.curve.getPointAt(1), VESSELS.M1.radius * 0.95, parts.M1.material));

  // Lenticulostriate perforators: fine branches from the superior surface of M1
  // that climb into the anterior perforated substance, toward the frontal lobe base.
  const perf = new THREE.Group();
  perf.userData = { part: 'perforator', kind: 'artery' };
  const m1 = parts.M1.userData.curve;
  const [t0, t1] = PERFORATORS.fromParam;
  const perfMat = Materials.artery(0.01);
  for (let i = 0; i < PERFORATORS.count; i++) {
    const t = t0 + (t1 - t0) * (i / Math.max(1, PERFORATORS.count - 1));
    const s = m1.getPointAt(t);
    const L = PERFORATORS.length;
    const pts = [
      [s.x, s.y + 0.8, s.z - 0.2],
      [s.x + (i % 2 ? 0.8 : -0.8), s.y + L * 0.45, s.z - L * 0.25],
      [s.x + (i % 2 ? 0.3 : -1.2), s.y + L, s.z - L * 0.35],
    ];
    const { curve, geo } = tubeAlong(pts, PERFORATORS.radius, { radial: 8, perMm: 4 });
    const mesh = new THREE.Mesh(geo, perfMat);
    mesh.userData = { part: 'perforator', kind: 'artery', curve, radius: PERFORATORS.radius };
    perf.add(mesh);
  }
  parts.perforator = perf;
  return parts;
}

export function buildNerves() {
  const parts = {};
  for (const [id, cfg] of Object.entries(NERVES)) {
    const { curve, geo } = tubeAlong(cfg.points, cfg.radius, { flatten: cfg.flatten, radial: 26 });
    const mesh = new THREE.Mesh(geo, Materials.nerve());
    mesh.userData = { part: id, kind: 'nerve', curve, radius: cfg.radius };
    parts[id] = mesh;
  }
  return parts;
}
