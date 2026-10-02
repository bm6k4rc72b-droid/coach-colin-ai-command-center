/** Procedural armoured car built from the current Build (body profile, armour, wheels, wing, glow). */
import * as THREE from 'three';
import { CHASSIS } from '../config/parts';
import type { Build } from '../core/vehicle';

const ARMOUR_COLOR = { none: 0x000000, composite: 0x2a2f36, ceramic: 0x5d564a, steel: 0x3c4148 };

/** Side profile (x forward, y up) per chassis, in metres. */
const PROFILE: Record<string, [number, number][]> = {
  interceptor: [[-2.3, 0.25], [2.4, 0.25], [2.5, 0.42], [1.4, 0.62], [0.2, 0.95], [-0.9, 1.0], [-2.1, 0.8], [-2.35, 0.55]],
  tumbler: [[-2.1, 0.55], [2.0, 0.55], [2.45, 0.85], [1.2, 1.15], [0.1, 1.55], [-1.3, 1.6], [-2.2, 1.3], [-2.25, 0.85]],
  tank: [[-2.6, 0.5], [2.6, 0.5], [2.8, 0.9], [2.0, 1.5], [-0.5, 1.95], [-2.4, 1.9], [-2.7, 1.3]],
};

const WIDTH = { interceptor: 1.95, tumbler: 2.3, tank: 2.5 };

export class CarModel {
  readonly group = new THREE.Group();
  /** Sprung body (moves with suspension and crash crush). */
  readonly body = new THREE.Group();
  readonly wheels: THREE.Group[] = [];
  private flame: THREE.Mesh | null = null;
  private key = '';

  constructor() {
    this.group.add(this.body);
  }

  build(b: Build): void {
    const key = JSON.stringify([b.chassis, b.engine, b.armour, b.tyres, Math.round(b.wing * 10), Math.round(b.rideOffset * 100)]);
    if (key === this.key) return;
    this.key = key;
    this.body.clear();
    for (const w of this.wheels) this.group.remove(w);
    this.wheels.length = 0;
    const c = CHASSIS[b.chassis];
    const width = WIDTH[b.chassis];
    const rideY = c.wheelRadius * 0.6 + b.rideOffset;

    // Body: extruded side profile.
    const shape = new THREE.Shape(PROFILE[b.chassis].map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    geo.translate(0, 0, -width / 2);
    const paint = new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.6, roughness: 0.38 });
    const shell = new THREE.Mesh(geo, paint);
    shell.position.y = rideY - 0.25;
    this.body.add(shell);

    // Canopy
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.28, width * 0.62),
      new THREE.MeshStandardMaterial({ color: 0x0a1622, metalness: 0.9, roughness: 0.08 }),
    );
    const top = Math.max(...PROFILE[b.chassis].map((p) => p[1]));
    canopy.position.set(-0.3, rideY - 0.25 + top - 0.05, 0);
    this.body.add(canopy);

    // Armour plates: angled side skirts and a front glacis.
    if (b.armour !== 'none') {
      const mat = new THREE.MeshStandardMaterial({ color: ARMOUR_COLOR[b.armour], metalness: b.armour === 'steel' ? 0.8 : 0.3, roughness: 0.6 });
      const thick = b.armour === 'steel' ? 0.09 : b.armour === 'ceramic' ? 0.07 : 0.05;
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, thick), mat);
        plate.position.set(0, rideY + 0.2, side * (width / 2 + 0.08));
        plate.rotation.x = side * 0.18;
        this.body.add(plate);
      }
      const glacis = new THREE.Mesh(new THREE.BoxGeometry(thick, 0.5, width * 0.9), mat);
      glacis.position.set(2.15, rideY + 0.25, 0);
      glacis.rotation.z = -0.5;
      this.body.add(glacis);
    }

    // Wing
    if (b.wing > 0.02) {
      const wmat = new THREE.MeshStandardMaterial({ color: 0x1d2026, metalness: 0.5, roughness: 0.4 });
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, width * (0.7 + 0.25 * b.wing)), wmat);
      const wy = rideY - 0.25 + top + 0.15 * b.wing;
      wing.position.set(-2.05, wy, 0);
      wing.rotation.z = 0.1 + 0.25 * b.wing;
      this.body.add(wing);
      for (const side of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.05), wmat);
        strut.position.set(-2.0, wy - 0.17, side * width * 0.25);
        this.body.add(strut);
      }
    }

    // Amber running-light strips and underglow (signature look; also readable at night).
    const amber = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 0.02), amber);
      strip.position.set(0, rideY + 0.05, side * (width / 2 + 0.1));
      this.body.add(strip);
    }
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, width + 1.2),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    this.body.add(glow);

    // Lights and propulsion glow
    const head = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.35), head);
      l.position.set(PROFILE[b.chassis][2][0] - 0.05, rideY + 0.12, side * width * 0.32);
      this.body.add(l);
    }
    this.flame = null;
    if (b.engine === 'turbine') {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
      flame.rotation.z = Math.PI / 2;
      flame.position.set(-2.95, rideY + 0.35, 0);
      this.body.add(flame);
      this.flame = flame;
    } else if (b.engine === 'electric') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, width * 0.9), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      strip.position.set(-2.3, rideY + 0.35, 0);
      this.body.add(strip);
    } else {
      for (const side of [-1, 1]) {
        const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 12), new THREE.MeshBasicMaterial({ color: 0xff3b1f }));
        ex.rotation.z = Math.PI / 2;
        ex.position.set(-2.35, rideY + 0.05, side * 0.35);
        this.body.add(ex);
      }
    }

    // Wheels
    const tyreW = b.chassis === 'interceptor' ? 0.32 : 0.48;
    const tread = b.tyres === 'allterrain' ? 0x151515 : 0x0d0d0d;
    const tyreMat = new THREE.MeshStandardMaterial({ color: tread, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: b.tyres === 'runflat' ? 0xb45309 : 0x6b7280, metalness: 0.8, roughness: 0.3 });
    for (const [x, z] of [
      [c.wheelbase / 2, 1],
      [c.wheelbase / 2, -1],
      [-c.wheelbase / 2, 1],
      [-c.wheelbase / 2, -1],
    ]) {
      const w = new THREE.Group();
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(c.wheelRadius, c.wheelRadius, tyreW, 28), tyreMat);
      tyre.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(c.wheelRadius * 0.55, c.wheelRadius * 0.55, tyreW + 0.02, 6), rimMat);
      rim.rotation.x = Math.PI / 2;
      w.add(tyre, rim);
      w.position.set(x, c.wheelRadius, z * (c.track / 2));
      this.group.add(w);
      this.wheels.push(w);
    }
  }

  /** Spin wheels by distance travelled, flicker the flame. */
  animate(distance: number, time: number, throttle: number): void {
    const r = this.wheels[0] ? (this.wheels[0].children[0] as THREE.Mesh).geometry.boundingSphere?.radius ?? 0.4 : 0.4;
    for (const w of this.wheels) w.rotation.z = -distance / Math.max(0.3, r * 0.7);
    if (this.flame) {
      this.flame.scale.set(1, 0.4 + throttle * (0.8 + 0.3 * Math.sin(time * 40)), 1);
      (this.flame.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.6 * throttle;
    }
  }
}
