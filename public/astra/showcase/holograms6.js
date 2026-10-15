/**
 * The Hollywood Secret's pedestal: a golden film reel turning under a
 * spotlight, a clapperboard that snaps when the visitor rolls camera, and
 * a strip of film unspooling into the light.
 *
 * @module astra/showcase/holograms6
 */

import * as THREE from 'three';
import { DOT, GOLD, glow, hot, label } from './kit.js';

const RED = new THREE.Color('#d8323f');
const WARM = new THREE.Color('#ffe7a8');

function hollywoodHologram(envMap) {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.3, emissive: 0x3a2405, emissiveIntensity: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.6, roughness: 0.35, envMap, envMapIntensity: 0.6 });

  // The reel: a rim, a hub, and five spoke windows.
  const reel = new THREE.Group();
  reel.position.set(0, 0.25, 0);
  reel.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 16, 96), gold));
  reel.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 10, 80), gold));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 32), gold);
  hub.rotation.x = Math.PI / 2;
  reel.add(hub);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.04), gold);
    spoke.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    spoke.rotation.z = a - Math.PI / 2;
    reel.add(spoke);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), glow(hot(WARM, 1.6), 0.25));
    hole.position.set(Math.cos(a + Math.PI / 5) * 0.32, Math.sin(a + Math.PI / 5) * 0.32, 0.01);
    reel.add(hole);
  }
  group.add(reel);

  // Film strip spooling off the reel, frames lit from behind.
  const frames = [];
  for (let i = 0; i < 9; i += 1) {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), glow(hot(i % 3 ? WARM : RED, 1.4), 0.5));
    group.add(frame);
    frames.push(frame);
  }

  // The clapperboard, beside the reel.
  const clap = new THREE.Group();
  clap.position.set(0.82, -0.38, 0.1);
  clap.rotation.y = -0.5;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.03), black);
  clap.add(board);
  const stickHinge = new THREE.Group();
  stickHinge.position.set(-0.23, 0.19, 0);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.03), black);
  stick.position.x = 0.23;
  stickHinge.add(stick);
  for (let i = 0; i < 5; i += 1) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.075), glow(hot(GOLD, 1.8), 0.9));
    stripe.position.set(0.04 + i * 0.09, 0, 0.017);
    stripe.rotation.z = 0.5;
    stickHinge.add(stripe);
  }
  clap.add(stickHinge);
  const slate = label('72H · TAKE 1', { size: 30, width: 320, color: '#ffe7a8' });
  slate.scale.multiplyScalar(0.36);
  slate.position.set(0, -0.02, 0.03);
  clap.add(slate);
  group.add(clap);

  // The spotlight: a soft cone from above and a pool of light on the floor.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.4, 48, 1, true), glow(hot(WARM, 1.2), 0.07));
  cone.position.y = 0.7;
  cone.material.side = THREE.DoubleSide;
  group.add(cone);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 64), glow(hot(WARM, 1.4), 0.12));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -0.62;
  group.add(pool);

  const tag = label('THE HOLLYWOOD SECRET', { size: 34, width: 720, color: '#ffd998' });
  tag.position.set(0, 1.15, 0);
  tag.scale.multiplyScalar(0.8);
  group.add(tag);
  const stamp = label('CLASSIFIED · 72-HOUR DEFLATE', { size: 24, width: 640, color: '#ff6b6b' });
  stamp.position.set(0, 0.96, 0);
  stamp.scale.multiplyScalar(0.6);
  group.add(stamp);

  const motes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(70 * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.05, color: hot(WARM, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(motes);

  let snap = 0;
  let lastEntered = false;
  group.scale.setScalar(0.92);
  return {
    group,
    update(t, s) {
      const h = s.holly || {};
      group.rotation.y = Math.sin(t * 0.25) * 0.35 + s.lookX * 0.3;
      reel.rotation.z = -t * (h.open ? 1.6 : 0.6);
      // The clapper snaps once each time the visitor rolls camera.
      if (h.entered && !lastEntered) snap = 1;
      lastEntered = Boolean(h.entered);
      snap = Math.max(0, snap - 0.03);
      const open = 0.55 + 0.25 * Math.sin(t * 1.3);
      stickHinge.rotation.z = snap > 0 ? snap * 0.6 : open * (h.entered ? 0.2 : 1);
      frames.forEach((f, i) => {
        const u = ((t * 0.12 + i / frames.length) % 1);
        const a = -Math.PI / 2 + u * 1.2;
        f.position.set(Math.cos(a) * 0.62 + u * 0.6, 0.25 + Math.sin(a) * 0.62 - u * 0.4, 0.02);
        f.rotation.z = a + Math.PI / 2;
        f.material.opacity = 0.5 * (1 - u);
      });
      cone.material.opacity = 0.05 + 0.03 * Math.sin(t * 2.1) + (h.entered ? 0.04 : 0);
      tag.material.opacity = 0.8 + 0.2 * Math.sin(t * 1.7);
      stamp.material.opacity = 0.55 + 0.45 * (Math.sin(t * 3) > 0 ? 1 : 0.4);
      const arr = motes.geometry.attributes.position.array;
      for (let i = 0; i < 70; i += 1) {
        const life = (t * 0.08 + i / 70) % 1;
        const a = i * 2.39996;
        const r = 0.15 + 0.7 * ((i * 0.618) % 1) * (1 - life * 0.4);
        arr[i * 3] = Math.cos(a) * r;
        arr[i * 3 + 1] = 1.6 - life * 2.2;
        arr[i * 3 + 2] = Math.sin(a) * r;
      }
      motes.geometry.attributes.position.needsUpdate = true;
    },
  };
}

export const HOLLY_HOLOGRAMS = { hollywood: hollywoodHologram };
