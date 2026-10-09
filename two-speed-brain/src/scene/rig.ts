// Minimal camera tween: every move eases (easeInOutCubic); user input cancels it.
import * as THREE from 'three';
import type { OrbitControls } from 'three-stdlib';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const HOME = {
  position: new THREE.Vector3(0.25, 0.07, 0.39),
  target: new THREE.Vector3(0, -0.016, 0),
};

class Rig {
  camera: THREE.PerspectiveCamera | null = null;
  controls: OrbitControls | null = null;
  private tw: null | { p0: THREE.Vector3; p1: THREE.Vector3; t0v: THREE.Vector3; t1v: THREE.Vector3; start: number; dur: number } = null;

  attach(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    controls.addEventListener('start', () => (this.tw = null));
  }

  flyTo(position: THREE.Vector3, target: THREE.Vector3, dur = 900) {
    if (!this.camera || !this.controls) return;
    this.tw = { p0: this.camera.position.clone(), p1: position, t0v: this.controls.target.clone(), t1v: target, start: performance.now(), dur };
  }

  home(dur = 1000) {
    this.flyTo(HOME.position.clone(), HOME.target.clone(), dur);
  }

  zoom(f: number) {
    if (!this.camera || !this.controls) return;
    const t = this.controls.target.clone();
    const off = this.camera.position.clone().sub(t).multiplyScalar(f);
    off.setLength(THREE.MathUtils.clamp(off.length(), this.controls.minDistance, this.controls.maxDistance));
    this.flyTo(t.clone().add(off), t, 420);
  }

  update() {
    if (!this.tw || !this.camera || !this.controls) return;
    const k = Math.min(1, (performance.now() - this.tw.start) / this.tw.dur);
    const e = ease(k);
    this.camera.position.lerpVectors(this.tw.p0, this.tw.p1, e);
    this.controls.target.lerpVectors(this.tw.t0v, this.tw.t1v, e);
    if (k >= 1) this.tw = null;
  }
}

export const rig = new Rig();
