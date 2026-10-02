/**
 * Night-city test ground: garage turntable, drag strip, hairpin, canal jump and crash barrier,
 * with an animation player for each test.
 */
import * as THREE from 'three';
import { G, MISSION } from '../config/parts';
import type { Build, TestSuite } from '../core/vehicle';
import { ms } from '../core/vehicle';
import { CarModel } from './car';

export type TestId = 'garage' | 'drag' | 'hairpin' | 'jump' | 'crash';

interface Anim {
  test: TestId;
  t: number;
  suite: TestSuite | null;
}

const JUMP_X = 0;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 2000);
  readonly car = new CarModel();
  private anim: Anim = { test: 'garage', t: 0, suite: null };
  private stages = new THREE.Group();
  private canalZ = 200;
  private splash: THREE.Mesh;
  private sparks: THREE.Points;
  private orbit = 0;
  private carLight: THREE.PointLight;
  /** Status line for the HUD overlay. */
  status = '';
  done = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.Fog(0x05070c, 60, 420);
    this.scene.add(new THREE.HemisphereLight(0x7a8cb0, 0x15151c, 0.9));
    const moon = new THREE.DirectionalLight(0xb8c8ff, 1.1);
    moon.position.set(-60, 120, 40);
    this.scene.add(moon);
    const key = new THREE.SpotLight(0xffe2b0, 60, 40, 0.6, 0.5, 1.5);
    key.position.set(6, 10, 6);
    this.scene.add(key);

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.75, metalness: 0.2 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.buildCity();
    this.buildStages();
    this.scene.add(this.stages);
    this.car.group.rotation.order = 'YXZ';
    this.scene.add(this.car.group);
    // A light that travels with the car so the matte-black body reads at night.
    this.carLight = new THREE.PointLight(0xdfe8ff, 40, 30, 1.6);
    this.scene.add(this.carLight);

    this.splash = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0 }));
    this.scene.add(this.splash);
    const sp = new THREE.BufferGeometry();
    sp.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(300), 3));
    this.sparks = new THREE.Points(sp, new THREE.PointsMaterial({ color: 0xffb340, size: 0.15, transparent: true, opacity: 0 }));
    this.scene.add(this.sparks);
  }

  private buildCity(): void {
    const winTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#0b0d12';
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 10)
        for (let x = 4; x < 64; x += 10) {
          g.fillStyle = Math.random() < 0.35 ? (Math.random() < 0.5 ? '#f7d38a' : '#9ec9ff') : '#141820';
          g.fillRect(x, y, 6, 6);
        }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const mat = new THREE.MeshStandardMaterial({ color: 0x20242c, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9, map: winTex });
    for (let i = 0; i < 90; i++) {
      const h = 30 + ((i * 53) % 90);
      const w = 14 + ((i * 7) % 12);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      const ang = (i / 90) * Math.PI * 2;
      const r = 300 + ((i * 37) % 120);
      b.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
      this.scene.add(b);
    }
    // street lights along the drag strip
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343b });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    for (let x = -40; x <= 440; x += 40) {
      for (const z of [-9, 9]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 8), poleMat);
        p.position.set(x, 4, z);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lampMat);
        l.position.set(x, 8, z);
        this.scene.add(p, l);
      }
    }
  }

  private buildStages(): void {
    const line = new THREE.MeshBasicMaterial({ color: 0xd9d9d9 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(480, 12), new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.6 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(200, 0.01, 0);
    this.stages.add(road);
    for (let x = 0; x <= 402; x += 100.6) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 12), line);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, 0);
      this.stages.add(m);
    }
    // Hairpin skid pad (centre at z = -80)
    const pad = new THREE.Mesh(new THREE.RingGeometry(MISSION.hairpinRadius - 5, MISSION.hairpinRadius + 5, 64), new THREE.MeshStandardMaterial({ color: 0x23262c }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.02, -80);
    this.stages.add(pad);
    // Canal jump (along +z at x = JUMP_X, from z = canalZ)
    const z0 = this.canalZ;
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.7 });
    const th = (MISSION.jumpAngleDeg * Math.PI) / 180;
    const rampLen = 8;
    for (const [z, dir] of [
      [z0, 1],
      [z0 + MISSION.jumpGap, -1],
    ] as const) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, rampLen), rampMat);
      ramp.position.set(JUMP_X, (rampLen / 2) * Math.sin(th), z - (dir * rampLen * Math.cos(th)) / 2);
      ramp.rotation.x = -dir * th;
      this.stages.add(ramp);
    }
    const canal = new THREE.Mesh(new THREE.PlaneGeometry(40, MISSION.jumpGap), new THREE.MeshStandardMaterial({ color: 0x0b2a3d, metalness: 0.6, roughness: 0.15 }));
    canal.rotation.x = -Math.PI / 2;
    canal.position.set(JUMP_X, -0.5, z0 + MISSION.jumpGap / 2);
    this.stages.add(canal);
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(10, 160), new THREE.MeshStandardMaterial({ color: 0x1d1f24 }));
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(JUMP_X, 0.015, z0 - 85);
    this.stages.add(approach);
    // Floodlights over each test site.
    for (const [x, y, z] of [
      [0, 18, -80],
      [8, 14, this.canalZ + MISSION.jumpGap / 2],
      [-52, 10, 40],
      [6, 10, 6],
    ] as const) {
      const fl = new THREE.PointLight(0xfff1d6, 260, 70, 1.4);
      fl.position.set(x, y, z);
      this.stages.add(fl);
    }
    // Crash barrier at x = -60
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 6), new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 }));
    barrier.position.set(-60, 1, 40);
    this.stages.add(barrier);
  }

  setBuild(b: Build): void {
    this.car.build(b);
  }

  play(test: TestId, suite: TestSuite | null): void {
    this.anim = { test, t: 0, suite };
    this.done = test === 'garage';
    this.car.body.scale.set(1, 1, 1);
    this.car.body.position.set(0, 0, 0);
    this.car.group.rotation.set(0, 0, 0);
    (this.splash.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.sparks.material as THREE.PointsMaterial).opacity = 0;
  }

  resize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 450;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private place(x: number, y: number, z: number, yaw: number): void {
    this.car.group.position.set(x, y, z);
    this.car.group.rotation.y = yaw;
  }

  update(dt: number, time: number): void {
    this.resize();
    const a = this.anim;
    a.t += dt;
    const cam = this.camera;
    switch (a.test) {
      case 'garage': {
        this.orbit += dt * 0.3;
        this.place(0, 0, 0, this.orbit);
        this.car.animate(0, time, 0.2);
        cam.position.set(9, 3.2, 9);
        cam.lookAt(0, 0.9, 0);
        this.status = 'Garage — configure the car, then run a test.';
        break;
      }
      case 'drag': {
        const tr = a.suite!.accel.trace;
        const t = Math.min(a.t, tr.at(-1)!.t);
        let x = 0;
        let v = 0;
        for (let i = 1; i < tr.length && tr[i].t <= t; i++) {
          x += ((tr[i].v + tr[i - 1].v) / 2) * (tr[i].t - tr[i - 1].t);
          v = tr[i].v;
        }
        this.place(Math.min(x, 470), 0, 0, 0);
        this.car.animate(x, time, v > 0 ? 1 : 0);
        cam.position.set(Math.min(x, 470) - 6, 3, 14);
        cam.lookAt(Math.min(x, 470) + 4, 1, 0);
        this.status = `Drag strip · ${(v * 3.6).toFixed(0)} km/h · ${x.toFixed(0)} m · ${t.toFixed(1)} s`;
        if (a.t > Math.min(15, (a.suite!.accel.quarterMile || 15) + 1.5)) this.done = true;
        break;
      }
      case 'hairpin': {
        const s = a.suite!.hairpin;
        const R = MISSION.hairpinRadius;
        const target = ms(MISSION.hairpinKmh);
        const vMax = ms(s.maxKmh);
        const v = Math.min(target, vMax + 0.01);
        const fails = s.maxKmh < MISSION.hairpinKmh;
        const ang = (a.t * v) / R;
        const failAt = 2.5;
        let r = R;
        let roll = 0;
        if (fails && a.t > failAt) {
          const k = Math.min(1, (a.t - failAt) / 1.2);
          if (s.limitedBy === 'rollover') roll = k * Math.PI * 0.5;
          else r = R + k * k * 18;
        }
        const theta = fails && a.t > failAt ? (failAt * v) / R + (a.t - failAt) * (v / R) * 0.5 : ang;
        const x = Math.cos(theta) * r;
        const z = -80 + Math.sin(theta) * r;
        this.place(x, 0, z, -(theta + Math.PI / 2));
        this.car.group.rotation.x = roll;
        this.car.animate(theta * r, time, 0.6);
        // Chase camera outside the circle, trailing the car.
        const back = theta - 0.35;
        cam.position.set(Math.cos(back) * (R + 16), 7, -80 + Math.sin(back) * (R + 16));
        cam.lookAt(x, 0.8, z);
        this.status = fails
          ? s.limitedBy === 'rollover'
            ? `Hairpin at ${MISSION.hairpinKmh} km/h — ROLLOVER (tips at ${s.rolloverKmh.toFixed(0)} km/h)`
            : `Hairpin at ${MISSION.hairpinKmh} km/h — SLIDES WIDE (grip limit ${s.gripKmh.toFixed(0)} km/h)`
          : `Hairpin at ${MISSION.hairpinKmh} km/h — holds the line · ${s.lateralG.toFixed(2)} g lateral at the limit`;
        if (a.t > 5) this.done = true;
        break;
      }
      case 'jump': {
        const j = a.suite!.jump;
        const v = ms(MISSION.jumpApproachKmh);
        const th = (MISSION.jumpAngleDeg * Math.PI) / 180;
        const runup = 2.2;
        let z: number;
        let y = 0;
        let pitch = 0;
        if (a.t < runup) {
          z = this.canalZ - v * (runup - a.t);
        } else {
          const tf = a.t - runup;
          const vx = v * Math.cos(th);
          const vy = v * Math.sin(th);
          z = this.canalZ + vx * tf;
          y = vy * tf - 0.5 * G * tf * tf;
          pitch = -Math.atan2(vy - G * tf, vx) * 0.7;
          if (y < 0) {
            if (!j.clears) {
              y = Math.max(-3, y);
              (this.splash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - (tf - j.flightTime) * 0.5);
              this.splash.position.set(JUMP_X, 0, z);
              this.splash.scale.setScalar(1 + (tf - j.flightTime) * 2);
            } else {
              const since = tf - j.flightTime;
              y = 0;
              pitch = 0;
              z = this.canalZ + vx * j.flightTime + Math.max(0, since) * vx * 0.6;
              const squash = Math.max(0, 1 - since * 3);
              this.car.body.position.y = -squash * (j.bottomedOut ? 0.45 : 0.25);
              if (j.bottomedOut && since < 0.6) {
                const sm = this.sparks.material as THREE.PointsMaterial;
                sm.opacity = 1 - since / 0.6;
                const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
                for (let i = 0; i < 100; i++) pos.setXYZ(i, JUMP_X + (Math.random() - 0.5) * 3, Math.random() * since * 3, z + (Math.random() - 0.5) * 4);
                pos.needsUpdate = true;
              }
            }
          }
        }
        this.place(JUMP_X, Math.max(y, -3) + (a.t < runup ? 0 : 0), z, -Math.PI / 2);
        this.car.group.rotation.z = pitch;
        this.car.animate(z, time, 1);
        cam.position.set(JUMP_X + 17, 6, this.canalZ + MISSION.jumpGap / 2 - 4);
        cam.lookAt(JUMP_X, 2, z);
        this.status = j.clears
          ? `Canal jump · flew ${j.range.toFixed(1)} m · landing ${j.occupantG.toFixed(1)} g${j.bottomedOut ? ' · BOTTOMED OUT' : ''}`
          : `Canal jump · fell short (${j.range.toFixed(1)} m of ${MISSION.jumpGap} m)`;
        if (a.t > runup + j.flightTime + 2) this.done = true;
        break;
      }
      case 'crash': {
        const cr = a.suite!.crash;
        const v = ms(MISSION.crashKmh);
        const contactX = -60 + 0.75 + 2.5;
        const run = 2;
        let x: number;
        if (a.t < run) x = contactX + v * (run - a.t);
        else {
          const tc = a.t - run;
          const crushT = (2 * cr.crumple) / v;
          const k = Math.min(1, tc / crushT);
          x = contactX - cr.crumple * (1 - (1 - k) * (1 - k));
          this.car.body.scale.x = 1 - (cr.crumple / 5) * k;
          this.car.body.position.x = -(cr.crumple / 2) * k;
        }
        this.place(x, 0, 40, Math.PI);
        this.car.animate(x, time, a.t < run ? 1 : 0);
        cam.position.set(-52, 4, 52);
        cam.lookAt(-58, 1, 40);
        this.status = `Barrier crash at ${MISSION.crashKmh} km/h · ${cr.energyKJ.toFixed(0)} kJ · occupants ${cr.occupantG.toFixed(1)} g over ${cr.crumple.toFixed(2)} m of crumple`;
        if (a.t > run + 2) this.done = true;
        break;
      }
    }
    const cp = this.car.group.position;
    this.carLight.position.set(cp.x + 3, cp.y + 5, cp.z + 3);
    this.renderer.render(this.scene, cam);
  }
}
