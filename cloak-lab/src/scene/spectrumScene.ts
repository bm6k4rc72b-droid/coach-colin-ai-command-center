/**
 * 3D view of the Spectrum Lab: a path past a sensor post, an actor whose look follows the
 * loadout, day/dusk/night lighting, and sensor beams that brighten with detection probability.
 */
import * as THREE from 'three';
import { SPECTRUM, type Light } from '../config/lab';
import { SENSORS, type Loadout, type SensorId } from '../core/spectrum';

const SENSOR_COLORS: Record<SensorId, number> = {
  visible: 0xf8fafc,
  thermal: 0xfb923c,
  radar: 0x4ade80,
  acoustic: 0x60a5fa,
  wifi: 0xc084fc,
};

export class SpectrumScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 600);
  private actor = new THREE.Group();
  private actorMats: THREE.MeshStandardMaterial[] = [];
  private beams: Record<SensorId, THREE.Line> = {} as Record<SensorId, THREE.Line>;
  private sensorPos: Record<SensorId, THREE.Vector3> = {} as Record<SensorId, THREE.Vector3>;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private yaw = 0.0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a2418, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.position.set(40, 80, 30);
    this.scene.add(this.hemi, this.sun);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3f5f37, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(SPECTRUM.pathHalf * 2 + 10, 3),
      new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1 }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.02;
    this.scene.add(path);
    for (let m = -SPECTRUM.pathHalf; m <= SPECTRUM.pathHalf; m += 10) {
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }));
      stake.position.set(m, 0.4, -1.8);
      this.scene.add(stake);
    }
    // Scatter some trees and rocks for context.
    const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3423 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f6b2f });
    for (let i = 0; i < 40; i++) {
      const x = ((i * 37) % 140) - 70;
      const z = -10 - ((i * 23) % 60);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), trunk);
      t.position.set(x, 1.5, z);
      const c = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 8), leaf);
      c.position.set(x, 5, z);
      this.scene.add(t, c);
    }
    // Sensor post at lateral distance.
    const postZ = SPECTRUM.lateral;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 6, 10), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.6 }));
    post.position.set(0, 3, postZ);
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3), new THREE.MeshStandardMaterial({ color: 0x55606b }));
    hut.position.set(0, 1.3, postZ + 3);
    this.scene.add(post, hut);
    SENSORS.forEach((s, i) => {
      const p = new THREE.Vector3(-1 + i * 0.5, 5.2 - (i % 2) * 0.5, postZ - 0.3);
      this.sensorPos[s] = p;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: SENSOR_COLORS[s], emissive: SENSOR_COLORS[s], emissiveIntensity: 0.4 }));
      box.position.copy(p);
      this.scene.add(box);
      const g = new THREE.BufferGeometry().setFromPoints([p, p.clone()]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: SENSOR_COLORS[s], transparent: true, opacity: 0 }));
      this.beams[s] = line;
      this.scene.add(line);
    });
    // Actor: capsule body, head, limbs.
    const mat = () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, transparent: true });
      this.actorMats.push(m);
      return m;
    };
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 10), mat());
    body.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat());
    head.position.y = 1.68;
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.7, 4, 8), mat());
    legL.position.set(-0.1, 0.45, 0);
    const legR = legL.clone();
    legR.position.x = 0.1;
    legL.name = 'legL';
    legR.name = 'legR';
    this.actor.add(body, head, legL, legR);
    this.scene.add(this.actor);
    this.setLight('day');
  }

  resize(): void {
    const w = this.canvas.clientWidth || 640;
    const h = this.canvas.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setLight(l: Light): void {
    const cfg = {
      day: { sky: 0x9cc9ee, hemi: 1.0, sun: 1.6, sunColor: 0xffffff, ground: 0x4c7a3f },
      dusk: { sky: 0xd08a5a, hemi: 0.5, sun: 0.7, sunColor: 0xffb070, ground: 0x3a4d2f },
      night: { sky: 0x101c36, hemi: 0.38, sun: 0.45, sunColor: 0x9fb4ff, ground: 0x24382a },
    }[l];
    this.scene.background = new THREE.Color(cfg.sky);
    this.scene.fog = new THREE.Fog(cfg.sky, 80, 260);
    this.hemi.intensity = cfg.hemi;
    this.sun.intensity = cfg.sun;
    this.sun.color.setHex(cfg.sunColor);
    (this.ground.material as THREE.MeshStandardMaterial).color.setHex(cfg.ground);
  }

  setLoadout(l: Loadout): void {
    for (const m of this.actorMats) {
      m.metalness = 0;
      m.emissive.setHex(0x000000);
      m.opacity = 1;
      m.color.setHex(0x334155);
      if (l.thermal === 'blanket') {
        m.color.setHex(0xc0c6cc);
        m.metalness = 0.9;
        m.roughness = 0.3;
      }
      if (l.radar === 'ram') m.color.multiplyScalar(0.5);
      if (l.visual === 'adaptive') m.color.setHex(0x5a6b3a);
      if (l.visual === 'display') {
        m.opacity = 0.18;
        m.emissive.setHex(0x0e7490);
        m.emissiveIntensity = 0.3;
      }
    }
  }

  /** Place the actor and set beam opacities from per-sensor probabilities. */
  update(x: number, t: number, speed: number, p: Record<SensorId, number> | null): void {
    this.actor.position.set(x, 0, 0);
    const swing = Math.sin(t * speed * 4) * 0.4 * Math.min(1, speed);
    this.actor.getObjectByName('legL')!.rotation.x = swing;
    this.actor.getObjectByName('legR')!.rotation.x = -swing;
    const target = new THREE.Vector3(x, 1.2, 0);
    for (const s of SENSORS) {
      const line = this.beams[s];
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(1, target.x, target.y, target.z);
      pos.needsUpdate = true;
      (line.material as THREE.LineBasicMaterial).opacity = p ? Math.min(1, p[s] * 1.2) : 0;
    }
    // Camera: behind and above the post, gently following the actor.
    this.yaw += (x * 0.004 - this.yaw) * 0.05;
    this.camera.position.set(x * 0.55 + Math.sin(this.yaw) * 6, 9, SPECTRUM.lateral + 12);
    this.camera.lookAt(x * 0.85, 1.2, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
