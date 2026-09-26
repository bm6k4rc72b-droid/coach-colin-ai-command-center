import * as THREE from 'three';
import { MICROSCOPE } from '../config/anatomy.js';

const DEG = Math.PI / 180;

// Operating microscope head. It orbits a focal target inside a limited cone
// around the vertical axis (+Z), the way a real scope head tilts on its
// balanced arm. It never flips around the field.
//
//   Right-drag (or Alt + left-drag)     tilt / rotate the scope
//   Middle-drag (or Shift + right-drag) pan across the field
//   Wheel                                zoom (working distance)
//   F                                    centre on what the cursor is over
//   R                                    reset the view
export class MicroscopeControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;
    this.wheelEnabled = true;       // tools such as the clip take over the wheel
    this.home = {
      target: new THREE.Vector3(...MICROSCOPE.target),
      yaw: MICROSCOPE.startYawDeg * DEG,
      tilt: MICROSCOPE.startTiltDeg * DEG,
      distance: MICROSCOPE.distance,
    };
    this.target = this.home.target.clone();
    this.goal = { target: this.target.clone(), yaw: this.home.yaw, tilt: this.home.tilt, distance: this.home.distance };
    this.cur = { yaw: this.home.yaw, tilt: this.home.tilt, distance: this.home.distance };
    this.drag = null;

    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => this.#down(e));
    window.addEventListener('pointermove', (e) => this.#move(e));
    window.addEventListener('pointerup', () => { this.drag = null; });
    dom.addEventListener('wheel', (e) => this.#wheel(e), { passive: false });
    this.update(1);
  }

  #down(e) {
    if (!this.enabled) return;
    const orbit = e.button === 2 && !e.shiftKey || (e.button === 0 && e.altKey);
    const pan = e.button === 1 || (e.button === 2 && e.shiftKey);
    if (!orbit && !pan) return;
    e.preventDefault();
    this.drag = { mode: orbit ? 'orbit' : 'pan', x: e.clientX, y: e.clientY };
  }

  #move(e) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX; this.drag.y = e.clientY;
    if (this.drag.mode === 'orbit') {
      this.goal.yaw -= dx * 0.006;
      this.goal.tilt = THREE.MathUtils.clamp(this.goal.tilt + dy * 0.004, 0, MICROSCOPE.tiltLimitDeg * DEG);
    } else {
      const s = this.cur.distance * 0.0018;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.goal.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      this.#clampTarget();
    }
  }

  #wheel(e) {
    if (!this.enabled || !this.wheelEnabled) return;
    e.preventDefault();
    const [lo, hi] = MICROSCOPE.distanceRange;
    this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * Math.exp(e.deltaY * 0.0011), lo, hi);
  }

  #clampTarget() {
    const L = MICROSCOPE.panLimit;
    const t = this.goal.target;
    t.x = THREE.MathUtils.clamp(t.x, -L, L);
    t.y = THREE.MathUtils.clamp(t.y, -L, L);
    t.z = THREE.MathUtils.clamp(t.z, -44, 0);
  }

  focusOn(point) {
    this.goal.target.copy(point);
    this.#clampTarget();
  }

  reset() {
    this.goal.target.copy(this.home.target);
    this.goal.yaw = this.home.yaw;
    this.goal.tilt = this.home.tilt;
    this.goal.distance = this.home.distance;
  }

  // For demo mode and scripted camera moves.
  set({ target, yaw, tilt, distance }) {
    if (target) this.goal.target.copy(target);
    if (yaw !== undefined) this.goal.yaw = yaw;
    if (tilt !== undefined) this.goal.tilt = tilt;
    if (distance !== undefined) this.goal.distance = distance;
  }

  update(dt) {
    // Critically damped easing, which feels like a balanced scope arm.
    const k = 1 - Math.exp(-dt * 9);
    this.target.lerp(this.goal.target, k);
    this.cur.yaw += (this.goal.yaw - this.cur.yaw) * k;
    this.cur.tilt += (this.goal.tilt - this.cur.tilt) * k;
    this.cur.distance += (this.goal.distance - this.cur.distance) * k;

    const { yaw, tilt, distance } = this.cur;
    const off = new THREE.Vector3(Math.sin(tilt) * Math.sin(yaw), -Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt)).multiplyScalar(distance);
    this.camera.position.copy(this.target).add(off);
    // Keep the frontal lobe at the top of the screen.
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }
}
