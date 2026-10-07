// Camera controller. Every move interpolates; nothing snaps.
//
//  - flyTo: an eased tween (easeInOutCubic) of camera.position + controls.target.
//  - follow: a damped chase of a moving goal (used while the anatomy explodes,
//    so the camera pulls back in step with the pieces).
// Either is cancelled the moment the user grabs the controls.

import * as THREE from 'three';
import type { OrbitControls } from 'three-stdlib';
import { easeInOutCubic } from '../lib/easing';

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

interface Tween {
  from: Pose;
  to: Pose;
  t0: number;
  dur: number;
}

const tmpBox = new THREE.Box3();
const tmpSphere = new THREE.Sphere();

class CameraRig {
  camera: THREE.PerspectiveCamera | null = null;
  controls: OrbitControls | null = null;
  private tween: Tween | null = null;
  private follow: (() => Pose) | null = null;
  /** Horizontal screen space (px) covered by floating panels, for framing. */
  insetX = 0;
  insetTop = 0;
  insetBottom = 0;
  /** Screen space (px) covered by panels while a structure is focused. */
  focusInsets: () => { left: number; right: number; top: number; bottom: number } = () => ({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });

  attach(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    controls.addEventListener('start', this.cancel);
  }

  detach() {
    this.controls?.removeEventListener('start', this.cancel);
    this.camera = null;
    this.controls = null;
  }

  cancel = () => {
    this.tween = null;
    this.follow = null;
  };

  get busy() {
    return this.tween !== null;
  }

  current(): Pose {
    return { position: this.camera!.position.clone(), target: this.controls!.target.clone() };
  }

  flyTo(to: Pose, ms = 850) {
    if (!this.camera || !this.controls) return;
    this.follow = null;
    this.tween = { from: this.current(), to, t0: performance.now(), dur: ms };
  }

  setFollow(fn: (() => Pose) | null) {
    this.tween = null;
    this.follow = fn;
  }

  update(dt: number) {
    const cam = this.camera;
    const ctl = this.controls;
    if (!cam || !ctl) return;
    if (this.tween) {
      const { from, to, t0, dur } = this.tween;
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = easeInOutCubic(t);
      cam.position.lerpVectors(from.position, to.position, e);
      ctl.target.lerpVectors(from.target, to.target, e);
      if (t >= 1) this.tween = null;
    } else if (this.follow) {
      const goal = this.follow();
      const k = 1 - Math.exp(-dt * 4.5);
      cam.position.lerp(goal.position, k);
      ctl.target.lerp(goal.target, k);
    }
  }

  /** Distance at which a box of w × h fills the usable part of the viewport. */
  private fitDistance(w: number, h: number, margin: number) {
    const cam = this.camera!;
    const vw = Math.max(1, window.innerWidth - this.insetX);
    const vh = Math.max(1, window.innerHeight - this.insetTop - this.insetBottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (vh / window.innerHeight);
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (vw / window.innerHeight);
    return Math.max(h / 2 / tanV, w / 2 / tanH) * margin;
  }

  /** Front-facing pose that frames an axis-aligned box. */
  poseForBox(min: THREE.Vector3, max: THREE.Vector3, margin = 1.1, elevation = 0.06): Pose {
    const center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    const dist = this.fitDistance(size.x, size.y, margin) + size.z / 2;
    const dir = new THREE.Vector3(0, elevation, 1).normalize();
    // Centre the box in the space between the top and bottom panels, not the window.
    const fov = THREE.MathUtils.degToRad(this.camera!.fov);
    const worldPerPx = (2 * dist * Math.tan(fov / 2)) / window.innerHeight;
    const target = center.clone();
    target.y -= ((this.insetBottom - this.insetTop) / 2) * worldPerPx;
    return { target, position: target.clone().addScaledVector(dir, dist) };
  }

  /**
   * Frame a box from the current viewing direction, centred in the part of the
   * screen the floating panels leave free.
   */
  focusOnBox(box: THREE.Box3, ms = 850) {
    if (!this.camera || !this.controls) return;
    box.getBoundingSphere(tmpSphere);
    const radius = Math.max(tmpSphere.radius, 0.02);
    const H = window.innerHeight;
    const ins = this.focusInsets();
    const freeW = Math.max(120, window.innerWidth - ins.left - ins.right);
    const freeH = Math.max(120, H - ins.top - ins.bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const dist = Math.max((radius / (tanV * (Math.min(freeW, freeH) / H))) * 1.18, 0.12);

    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    // Avoid ending up looking straight down or up.
    if (Math.abs(dir.y) > 0.85) dir.set(dir.x, Math.sign(dir.y) * 0.85, dir.z).normalize();
    const forward = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const worldPerPx = (2 * dist * tanV) / H;
    const target = tmpSphere.center
      .clone()
      .addScaledVector(right, ((ins.right - ins.left) / 2) * worldPerPx)
      .addScaledVector(up, (-(ins.bottom - ins.top) / 2) * worldPerPx);
    this.flyTo({ target, position: target.clone().addScaledVector(dir, dist) }, ms);
  }

  /**
   * focusOnObject(mesh): compute the bounding box and centre, pick a viewing
   * distance that fits it, and tween camera.position + controls.target.
   */
  focusOnObject(object: THREE.Object3D, ms = 850) {
    tmpBox.setFromObject(object);
    if (!tmpBox.isEmpty()) this.focusOnBox(tmpBox.clone(), ms);
  }

  frontView(ms = 800) {
    if (!this.camera || !this.controls) return;
    const target = this.controls.target.clone();
    const dist = this.camera.position.distanceTo(target);
    this.flyTo({ target, position: target.clone().add(new THREE.Vector3(0, dist * 0.06, dist)) }, ms);
  }

  zoom(factor: number, ms = 420) {
    if (!this.camera || !this.controls) return;
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target).multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(offset.length(), this.controls.minDistance, this.controls.maxDistance);
    offset.setLength(len);
    this.flyTo({ target, position: target.clone().add(offset) }, ms);
  }
}

export const rig = new CameraRig();

export function focusOnObject(object: THREE.Object3D, ms?: number) {
  rig.focusOnObject(object, ms);
}
