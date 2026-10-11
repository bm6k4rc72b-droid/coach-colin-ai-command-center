/**
 * The classified station's pedestal: a vault door in black steel and gold,
 * oozing goo, that unlocks when the visitor's clearance does.
 *
 * Bolts retract, the wheel spins, and the door swings on its hinge as the
 * card's unlock sequence plays; drops of goo fall from the frame in free
 * fall, y = y₀ − ½gt².
 *
 * @module astra/showcase/holograms4
 */

import * as THREE from 'three';
import { DOT, GOLD, glow, hot, label } from './kit.js';

const RED = new THREE.Color('#ff3b3b');
const G = 9.81;

function vaultHologram(envMap) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.95, roughness: 0.32, envMap, envMapIntensity: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 1, roughness: 0.2, envMap, envMapIntensity: 1.3, emissive: 0x3a2405, emissiveIntensity: 0.5 });
  const goo = new THREE.MeshPhysicalMaterial({ color: 0x020203, metalness: 0.1, roughness: 0.08, clearcoat: 1, envMap, envMapIntensity: 0.25 });

  // The frame stays put; the door swings from a hinge at its left edge.
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.08, 16, 96), gold);
  group.add(frame);
  const hinge = new THREE.Group();
  hinge.position.x = -0.9;
  group.add(hinge);
  const door = new THREE.Group();
  door.position.x = 0.9;
  hinge.add(door);
  const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 96), steel);
  leaf.rotation.x = Math.PI / 2;
  door.add(leaf);
  for (const r of [0.78, 0.6]) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 96), gold);
    groove.position.z = 0.085;
    door.add(groove);
  }
  const bolts = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 16), gold);
    bolt.rotation.z = a + Math.PI / 2;
    door.add(bolt);
    return { bolt, a };
  });
  const wheel = new THREE.Group();
  wheel.position.z = 0.12;
  door.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 12, 64), gold));
  for (let k = 0; k < 3; k += 1) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.64, 10), gold);
    spoke.rotation.z = (k * Math.PI) / 3;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 32), gold);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  const tag = label('CLASSIFIED · EX-039', { size: 34, width: 640, color: '#ff6b6b' });
  tag.position.set(0, 1.22, 0);
  tag.scale.multiplyScalar(0.85);
  group.add(tag);
  // Light behind the door, seen only once it opens.
  const light = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64), glow(hot(GOLD, 2.6), 0));
  light.position.z = -0.1;
  group.add(light);
  // A red warning ring that pulses while locked.
  const warn = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.11, 96), glow(hot(RED, 2), 0.5));
  group.add(warn);
  // Goo along the top of the frame, and drops falling from it.
  const lumps = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI * (0.25 + (0.5 * i) / 8);
    const lump = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 3) * 0.012, 16, 12), goo);
    lump.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.98 - 0.03, 0.06);
    lump.scale.y = 1.6;
    group.add(lump);
    return lump;
  });
  const drops = lumps.map((lump, i) => ({ mesh: new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), goo), from: lump, t: -i * 0.37, y0: 0 }));
  for (const d of drops) group.add(d.mesh);
  const motes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60 * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.05, color: hot(GOLD, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(motes);
  let open = 0;
  let retract = 0;
  let spin = 0;
  group.scale.setScalar(0.85);
  return {
    group,
    update(t, s) {
      const v = s.vault || {};
      const unlocking = v.phase === 'unlocking';
      const opened = v.phase === 'open' || v.granted;
      group.rotation.y = Math.sin(t * 0.3) * 0.2 + s.lookX * 0.35;
      // Bolts retract, the wheel spins, then the door swings ~100°.
      retract += ((unlocking || opened ? 1 : 0) - retract) * 0.06;
      spin += (unlocking ? 4 : 0.15) * 0.016;
      open += ((opened ? 1 : 0) - open) * 0.03;
      bolts.forEach(({ bolt, a }) => {
        const r = 0.9 - retract * 0.16;
        bolt.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      });
      wheel.rotation.z = spin;
      hinge.rotation.y = -open * 1.75;
      light.material.opacity = open * 0.9;
      warn.material.opacity = opened ? 0.15 : 0.35 + 0.35 * Math.sin(t * 4);
      warn.material.color.copy(opened ? GOLD : RED).multiplyScalar(2);
      tag.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.3);
      // Drops: hang, then fall freely to the pedestal (~1.3 m below).
      for (const d of drops) {
        d.t += 0.016;
        const base = d.from.position;
        if (d.t < 0) { d.mesh.visible = false; continue; }
        d.mesh.visible = true;
        if (d.t < 1.2) {
          d.mesh.position.set(base.x, base.y - 0.08 - d.t * 0.03, base.z);
          d.mesh.scale.setScalar(0.4 + d.t * 0.5);
        } else {
          const ft = d.t - 1.2;
          const y = base.y - 0.12 - 0.5 * G * ft * ft;
          d.mesh.position.y = y;
          d.mesh.scale.set(0.9, 1.2 + ft * 3, 0.9);
          if (y < -1.3) d.t = -Math.random() * 1.5;
        }
      }
      const arr = motes.geometry.attributes.position.array;
      for (let i = 0; i < 60; i += 1) {
        const life = (t * 0.25 + i / 60) % 1;
        const a = i * 2.39996;
        arr[i * 3] = Math.cos(a) * 0.5 * open;
        arr[i * 3 + 1] = -1 + life * 2.2;
        arr[i * 3 + 2] = -0.2 + Math.sin(a) * 0.3;
      }
      motes.geometry.attributes.position.needsUpdate = true;
      motes.material.opacity = open;
    },
  };
}

export const VAULT_HOLOGRAMS = { classified: vaultHologram };
