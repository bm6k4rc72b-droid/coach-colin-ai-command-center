import * as THREE from 'three';
import { ARACHNOID } from '../config/anatomy.js';
import { Materials } from './materials.js';
import { noise3 } from './noise.js';

// The arachnoid is a thin, translucent membrane that bridges the fissure between
// the frontal and temporal lobes. To open the fissure it is cut sharply with
// micro scissors rather than torn. Each strip here is one cuttable segment.
// Arachnoid is a web of collagen strands (trabeculae) rather than a smooth film.
// A canvas texture of faint crossing fibres drives both the colour and the alpha.
let fibers = null;
function fiberTexture() {
  if (fibers) return fibers;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6a6a6a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * Math.PI;
    const len = 60 + Math.random() * 220;
    g.strokeStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.22})`;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (Math.random() - 0.5) * 40, y + Math.sin(a) * len * 0.5 + (Math.random() - 0.5) * 40,
      x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  fibers = new THREE.CanvasTexture(c);
  fibers.wrapS = fibers.wrapT = THREE.RepeatWrapping;
  fibers.repeat.set(0.35, 0.8);
  return fibers;
}

function sheet({ segments, xRange, yHalf, z, sag, opacity }, layer, depthIndex) {
  const out = [];
  const w = (xRange[1] - xRange[0]) / segments;
  for (let s = 0; s < segments; s++) {
    const geo = new THREE.PlaneGeometry(w * 1.02, yHalf * 2, 8, 24);
    const pos = geo.attributes.position;
    const cx = xRange[0] + w * (s + 0.5);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const bow = 1 - (y / yHalf) ** 2;
      const wrinkle = noise3((cx + x) * 0.35, y * 0.35, depthIndex * 9.1) * 0.35;
      pos.setZ(i, -sag * bow + wrinkle);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, Materials.arachnoid(opacity, fiberTexture()));
    mesh.position.set(cx, 0, z);
    mesh.renderOrder = 2;

    mesh.userData = { part: 'arachnoid', kind: 'arachnoid', layer, index: s, cut: false };
    out.push(mesh);
  }
  return out;
}

export function buildArachnoid() {
  return [
    ...sheet(ARACHNOID.superficial, 'superficial', 0),
    ...sheet(ARACHNOID.deep, 'deep', 1),
  ];
}
