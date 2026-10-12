/**
 * The dermal station's pedestal: a cylinder of facial skin in layers —
 * a thin pink epidermis over a deep dermis threaded with collagen — with
 * gold peptide helices drifting down and lighting up where they bind. It
 * pulses cyan while the face scanner runs and glows gold once a visitor
 * is through the door.
 *
 * @module astra/showcase/holograms5
 */

import * as THREE from 'three';
import { DOT, GOLD, glow, hot, label } from './kit.js';

const PINK = new THREE.Color('#ff5fa8');
const CYAN = new THREE.Color('#38e1ff');
const PEACH = new THREE.Color('#ffb59a');

function skinHologram() {
  const group = new THREE.Group();
  const R = 0.82;
  // Layers, top down: stratum corneum (a film), epidermis, dermis, fat.
  const layers = [
    { h: 0.04, color: hot(PEACH, 1.6), opacity: 0.55 },
    { h: 0.16, color: hot(PINK, 1.4), opacity: 0.32 },
    { h: 0.5, color: hot(PEACH, 0.9), opacity: 0.18 },
    { h: 0.22, color: hot(new THREE.Color('#ffd27a'), 0.7), opacity: 0.12 },
  ];
  let top = 0.45;
  const slabs = layers.map((l) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, l.h, 72, 1, true), glow(l.color, l.opacity));
    mesh.material.side = THREE.DoubleSide;
    mesh.position.y = top - l.h / 2;
    const rim = new THREE.Mesh(new THREE.RingGeometry(R - 0.005, R + 0.012, 72), glow(l.color, 0.7));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = top;
    group.add(mesh, rim);
    top -= l.h;
    return mesh;
  });
  // A wavy surface on top: the skin's micro-relief.
  const surface = new THREE.Mesh(new THREE.CircleGeometry(R, 72), glow(hot(PINK, 1.2), 0.22));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.45;
  group.add(surface);
  // Collagen fibres: cyan sine tubes running through the dermis.
  const fibres = [];
  for (let k = 0; k < 10; k += 1) {
    const y = 0.2 - k * 0.045;
    const a = k * 0.9;
    const pts = [];
    for (let i = 0; i <= 40; i += 1) {
      const s = -1 + (2 * i) / 40;
      const x = s * R * 0.92;
      const z = Math.sin(s * 5 + a) * 0.25 * Math.sqrt(1 - s * s) * R;
      pts.push(new THREE.Vector3(x * Math.cos(a) - z * Math.sin(a), y + Math.sin(s * 9 + a) * 0.015, x * Math.sin(a) + z * Math.cos(a)));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.006, 5), glow(hot(k % 3 ? CYAN : PINK, 1.8), 0.6));
    group.add(tube);
    fibres.push(tube);
  }
  // Peptide helices: gold springs that sink into the skin and flash on binding.
  const helixGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 60; i += 1) {
      const a = (i / 60) * Math.PI * 6;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.05, i / 60 * 0.22, Math.sin(a) * 0.05));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.008, 6);
  })();
  const helices = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(helixGeo, glow(hot(GOLD, 2.2), 0.95));
    const a = (i / 7) * Math.PI * 2;
    const r = 0.25 + (i % 3) * 0.17;
    group.add(mesh);
    return { mesh, x: Math.cos(a) * r, z: Math.sin(a) * r, phase: i / 7 };
  });
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(7 * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.22, color: hot(GOLD, 2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(sparks);
  // The scanner's ring: sweeps up and down while a scan runs.
  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.01, 8, 96), glow(hot(CYAN, 2.4), 0));
  scanRing.rotation.x = Math.PI / 2;
  group.add(scanRing);
  const tag = label('COLIN DERMAL TECHNOLOGIES', { size: 30, width: 720, color: '#ffc4e1' });
  tag.position.set(0, 1.05, 0);
  tag.scale.multiplyScalar(0.8);
  group.add(tag);
  group.scale.setScalar(0.95);
  let lit = 0;
  return {
    group,
    update(t, s) {
      const d = s.derm || {};
      group.rotation.y = t * 0.18 + s.lookX * 0.3;
      lit += ((d.entered ? 1 : 0) - lit) * 0.04;
      const arr = sparks.geometry.attributes.position.array;
      helices.forEach((h, i) => {
        // Fall from above, slow down in the barrier, rest in the dermis.
        const life = (t * 0.12 + h.phase) % 1;
        const y = life < 0.55 ? 1.0 - (life / 0.55) * 0.55 : 0.45 - ((life - 0.55) / 0.45) * 0.35;
        h.mesh.position.set(h.x, y, h.z);
        h.mesh.rotation.y = t * 1.5 + i;
        const bound = life > 0.85;
        arr[i * 3] = h.x;
        arr[i * 3 + 1] = bound ? y : -10;
        arr[i * 3 + 2] = h.z;
      });
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = 0.6 + 0.4 * Math.sin(t * 6);
      fibres.forEach((f, k) => { f.material.opacity = 0.35 + 0.3 * Math.sin(t * 1.4 + k) + lit * 0.2; });
      slabs[1].material.opacity = 0.3 + 0.08 * Math.sin(t * 2) + s.speak * 0.1;
      const scanning = d.scanning;
      scanRing.material.opacity = scanning ? 0.9 : lit * 0.35;
      scanRing.position.y = scanning ? 0.45 - (0.5 + 0.5 * Math.sin(t * 2.4)) * 0.9 : 0.47;
      tag.material.opacity = 0.75 + 0.25 * Math.sin(t * 1.9);
    },
  };
}

export const DERM_HOLOGRAMS = { dermal: skinHologram };
