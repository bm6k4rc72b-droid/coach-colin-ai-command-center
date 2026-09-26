import * as THREE from 'three';
import { i18n } from './i18n.js';

// Hover inspector: raycasts the field under the cursor and shows the name of the
// structure plus a one-line teaching note. The same hit also drives autofocus.
export class Inspector {
  constructor(camera, dom, pickables) {
    this.camera = camera;
    this.pickables = pickables;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(0, 0);
    this.inside = false;
    this.hit = null;
    this.enabled = true;
    this.el = document.getElementById('inspector');
    this.px = { x: 0, y: 0 };
    dom.addEventListener('pointermove', (e) => {
      this.px.x = e.clientX; this.px.y = e.clientY;
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.inside = true;
    });
    dom.addEventListener('pointerleave', () => { this.inside = false; });
  }

  // Returns the nearest visible hit under the cursor (or at screen centre).
  pick(ndc = this.ndc) {
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.pickables, false);
    return hits.find((h) => h.object.visible && h.object.userData.pickPart && !h.object.userData.cut) || null;
  }

  update() {
    this.hit = this.inside ? this.pick() : null;
    const part = this.hit?.object.userData.pickPart;
    if (!this.enabled || !part) { this.el.classList.remove('on'); return; }
    this.el.querySelector('.name').textContent = i18n.t('part.' + part);
    this.el.querySelector('.note').textContent = i18n.t('note.' + part);
    this.el.style.transform = `translate(${this.px.x + 18}px, ${this.px.y + 14}px)`;
    this.el.classList.add('on');
  }
}
