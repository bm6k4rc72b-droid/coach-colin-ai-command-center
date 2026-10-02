/**
 * Heart BufferGeometry from the parametric surface, with epicardial-fat vertex colours in the
 * AV and interventricular grooves. Geometry is built relative to the heart centre so the group
 * can be scaled about it for the heartbeat.
 */
import * as THREE from 'three';
import { HEART } from '../config/anatomy';
import { grooveWeight, heartNormal, heartSurface, type HeartFrame } from '../anatomy/heart';
import { smoothstep } from '../anatomy/math';

export function buildHeartGeometry(f: HeartFrame): THREE.BufferGeometry {
  const rows = HEART.meshSegmentsLong;
  const cols = HEART.meshSegmentsAround;
  const vMin = -HEART.baseLength;
  const vMax = HEART.apexLength;
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const muscle = new THREE.Color(0.52, 0.14, 0.13);
  const muscleDark = new THREE.Color(0.38, 0.09, 0.09);
  const fat = new THREE.Color(0.86, 0.72, 0.42);
  const tmp = new THREE.Color();
  const c = f.centre;
  for (let i = 0; i <= rows; i++) {
    // denser sampling near the ends
    const u = i / rows;
    const v = vMin + (vMax - vMin) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    for (let j = 0; j <= cols; j++) {
      const phi = (j / cols) * 360;
      const p = heartSurface(f, v, phi);
      const n = heartNormal(f, Math.max(vMin + 0.5, Math.min(vMax - 0.5, v)), phi);
      pos.push(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      nrm.push(n[0], n[1], n[2]);
      const gw = grooveWeight(v, phi, 1.5);
      const baseFat = smoothstep(-34, -44, v) * 0.5;
      const mottle = 0.5 + 0.5 * Math.sin(phi * 0.21 + v * 0.17) * Math.cos(phi * 0.13 - v * 0.31);
      tmp.copy(muscle).lerp(muscleDark, mottle * 0.5);
      tmp.lerp(fat, Math.min(0.92, gw * 0.9 + baseFat));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
