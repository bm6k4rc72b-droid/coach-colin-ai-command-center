/**
 * Fluoroscopy: a separate X-ray scene (soft tissue, heart shadow, spine, ribs, diaphragm, arm
 * bones, contrast-filled vessels, radiopaque devices), rendered through a virtual C-arm at a
 * pulsed 15 fps into a render target, post-processed (noise, blur, vignette, collimation) and
 * held as the last image when the pedal is released.
 */
import * as THREE from 'three';
import { ATTENUATION, FLUORO, THORAX, type Vec3 } from '../config/anatomy';
import type { HeartFrame } from '../anatomy/heart';
import { add, catmullRom, lerp3, rad } from '../anatomy/math';
import { sampleAt, type Anatomy } from '../anatomy/vessels';
import { buildHeartGeometry } from './heartMesh';
import { postMaterial, xrayMaterial } from './materials';
import { Tube } from './tube';

export function carmDirection(lao: number, cra: number): THREE.Vector3 {
  const a = rad(lao);
  const c = rad(cra);
  return new THREE.Vector3(Math.sin(a) * Math.cos(c), Math.sin(c), Math.cos(a) * Math.cos(c));
}

export class FluoroWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly heartGroup = new THREE.Group();
  readonly rt: THREE.WebGLRenderTarget;
  readonly display: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly target = new THREE.Vector3();
  private heartTarget: THREE.Vector3;
  private lastFrame = -1;
  private seed = 0;
  /** Has any image been acquired yet (for LIH)? */
  hasImage = false;
  frames = 0;

  constructor(anat: Anatomy, frame: HeartFrame) {
    this.scene.background = new THREE.Color(1, 1, 1);
    this.camera = new THREE.PerspectiveCamera(FLUORO.fov, 1, 100, 3000);
    const size = FLUORO.renderSize;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false });
    this.display = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false });
    this.post = postMaterial(this.rt.texture);
    this.post.uniforms.uNoise.value = FLUORO.noise;
    this.post.uniforms.uTexel.value.set(1 / size, 1 / size);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));

    const C = frame.centre;
    const cx = C[0] - 40;
    const cz = C[2] - 30;
    // Soft tissue (thorax) and mediastinum.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 560, 48, 1, true), xrayMaterial({ mu: ATTENUATION.softTissue, size: 125 }));
    body.scale.set(THORAX.bodyRadiusX, 1, THORAX.bodyRadiusZ);
    body.position.set(cx, C[1] + 20, cz);
    this.scene.add(body);
    const med = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 260, 32, 1, true), xrayMaterial({ mu: 0.0026, size: 40 }));
    med.scale.set(34, 1, 50);
    med.position.set(cx - 4, C[1] + 120, cz);
    this.scene.add(med);
    // Heart shadow (beats).
    const heart = new THREE.Mesh(buildHeartGeometry(frame), xrayMaterial({ mu: ATTENUATION.heart, size: 48 }));
    this.heartGroup.position.set(...C);
    this.heartGroup.add(heart);
    this.scene.add(this.heartGroup);
    // Atria and great-vessel pedicle widen the cardiac silhouette (fluoro shadow only).
    const R0 = anat.rootCentre;
    for (const [o, r] of [
      [[-30, -18, -6], [27, 34, 25]],
      [[16, -4, -34], [32, 22, 22]],
      [[2, 24, -10], [24, 26, 22]],
    ] as [Vec3, Vec3][]) {
      const a = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), xrayMaterial({ mu: ATTENUATION.heart, size: 25 }));
      a.scale.set(...r);
      a.position.set(...add(R0, o));
      this.scene.add(a);
    }
    // Diaphragm domes (liver under the right one).
    for (const [dx, dy, r] of [
      [-40, -182, 118],
      [80, -196, 112],
    ] as const) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), xrayMaterial({ mu: ATTENUATION.diaphragm, size: r * 0.8 }));
      d.position.set(cx + dx, C[1] + dy, cz);
      this.scene.add(d);
    }
    // Spine.
    const so = THORAX.spineOffset;
    const boneMat = xrayMaterial({ mu: ATTENUATION.bone, size: THORAX.vertebraRadius });
    const pedMat = xrayMaterial({ mu: ATTENUATION.bone * 2.2, size: 4 });
    for (let i = 0; i < THORAX.vertebrae + 6; i++) {
      const y = C[1] + 240 - i * (THORAX.vertebraHeight + 6);
      const v = new THREE.Mesh(new THREE.CylinderGeometry(THORAX.vertebraRadius, THORAX.vertebraRadius * 1.05, THORAX.vertebraHeight, 24), boneMat);
      v.scale.set(1.05, 1, 0.9);
      v.position.set(cx + so[0] + 14, y, C[2] + so[2]);
      this.scene.add(v);
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 9, 12), pedMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(cx + so[0] + 14 + side * 13, y + 2, C[2] + so[2] - 18);
        this.scene.add(p);
      }
    }
    // Ribs: elliptical arcs sloping down anteriorly.
    const ribMat = xrayMaterial({ mu: ATTENUATION.rib, size: 4.2 });
    const spineX = cx + so[0] + 14;
    for (let i = 0; i < THORAX.ribCount + 2; i++) {
      const y0 = C[1] + 190 - i * THORAX.ribSpacing;
      const span = 0.82 + 0.12 * Math.sin((i / (THORAX.ribCount + 2)) * Math.PI);
      for (const side of [-1, 1]) {
        const pts: Vec3[] = [];
        for (let k = 0; k <= 24; k++) {
          const a = rad(10 + (k / 24) * 150);
          const rx = THORAX.bodyRadiusX * span;
          const rz = THORAX.bodyRadiusZ * 0.92;
          pts.push([spineX + side * rx * Math.sin(a), y0 - 42 * (1 - Math.cos(a)) * 0.6, C[2] + so[2] + 10 + rz - rz * Math.cos(a) - 6]);
        }
        const t = new Tube({ radial: 10, capacity: pts.length });
        t.update(pts, 4.2);
        this.scene.add(new THREE.Mesh(t.geometry, ribMat));
      }
    }
    // Clavicles and arm bones (for the access path).
    const R = anat.rootCentre;
    const bone = (ctrl: Vec3[], r: number) => {
      const pts = catmullRom(ctrl.map((o) => add(R, o)), 8);
      const t = new Tube({ radial: 12, capacity: pts.length });
      t.update(pts, r);
      this.scene.add(new THREE.Mesh(t.geometry, xrayMaterial({ mu: ATTENUATION.bone * 1.6, size: r })));
    };
    bone([[12, 150, 44], [-60, 162, 30], [-150, 150, 8]], 6);
    bone([[34, 150, 44], [100, 162, 30], [180, 150, 8]], 6);
    bone([[-170, 128, -24], [-280, 70, 2], [-392, 6, 22]], 9);
    bone([[-405, 2, 24], [-490, -26, 40], [-575, -58, 48]], 6);
    bone([[-410, 14, 16], [-495, -14, 30], [-580, -44, 40]], 5);

    this.heartTarget = new THREE.Vector3(...lerp3(anat.leftOstium, sampleAt(anat.vessels.LAD, 45), 0.62));
    this.target.copy(this.heartTarget);
  }

  /** Point the C-arm. `tip` (optional) pans the table to follow a catheter in the arm/aorta. */
  aim(lao: number, cra: number, follow: THREE.Vector3 | null, dt: number): void {
    const desired = follow ?? this.heartTarget;
    // Pan the table smoothly; jump when the target is far away (e.g. after re-centring).
    if (this.target.distanceTo(desired) > 90) this.target.copy(desired);
    else this.target.lerp(desired, 1 - Math.exp(-dt / 0.3));
    const dir = carmDirection(lao, cra);
    this.camera.position.copy(this.target).addScaledVector(dir, FLUORO.distance);
    this.camera.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.98) this.camera.up.set(0, 0, -1);
    this.camera.lookAt(this.target);
  }

  setHeartScale(s: number): void {
    this.heartGroup.scale.setScalar(s);
  }

  /** Acquire a new pulsed frame if due. Returns true when a new frame was rendered. */
  acquire(renderer: THREE.WebGLRenderer, t: number, live: boolean): boolean {
    if (!live) return false;
    const due = this.lastFrame < 0 || t - this.lastFrame >= 1 / FLUORO.fps - 1e-4 || t < this.lastFrame;
    if (!due) return false;
    this.lastFrame = t;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.seed = (this.seed + 1) % 997;
    this.post.uniforms.uSeed.value = this.seed;
    renderer.setRenderTarget(this.display);
    renderer.render(this.quadScene, this.quadCam);
    renderer.setRenderTarget(null);
    this.hasImage = true;
    this.frames++;
    return true;
  }

  dispose(): void {
    this.rt.dispose();
    this.display.dispose();
  }
}

