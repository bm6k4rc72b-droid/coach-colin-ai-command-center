import * as THREE from 'three';
import { i18n } from './i18n.js';

// Floating anatomy labels (toggle with L). Each is anchored to a point on the
// structure and projected into screen space every frame.
export class Labels {
  constructor(camera, anatomy) {
    this.camera = camera;
    this.visible = false;
    this.layer = document.getElementById('labels');
    const P = anatomy.parts;
    const at = (id, t) => P[id].userData.curve.getPointAt(t);
    const g = anatomy.aneurysm.geometry;
    this.anchors = [
      ['ICA', at('ICA', 0.62)], ['M1', at('M1', 0.55)], ['M2s', at('M2s', 0.6)], ['M2i', at('M2i', 0.6)],
      ['A1', at('A1', 0.62)], ['PCom', at('PCom', 0.45)], ['AChA', at('AChA', 0.5)],
      ['optic', at('optic', 0.45)], ['oculomotor', at('oculomotor', 0.55)],
      ['aneurysm', g.domeCenter], ['bleb', g.blebWorld], ['SSV', at('SSV', 0.25)],
    ].map(([id, p]) => {
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = `<i></i><span></span>`;
      this.layer.appendChild(el);
      return { id, p: p.clone(), el };
    });
    this.refresh();
    i18n.onChange(() => this.refresh());
  }
  refresh() { this.anchors.forEach((a) => { a.el.querySelector('span').textContent = i18n.t('part.' + a.id); }); }
  toggle(v = !this.visible) { this.visible = v; this.layer.classList.toggle('on', v); }
  update() {
    if (!this.visible) return;
    const w = window.innerWidth, h = window.innerHeight, v = new THREE.Vector3();
    for (const a of this.anchors) {
      v.copy(a.p).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      a.el.style.transform = `translate(${x}px, ${y}px)`;
      // Only label what is inside the eyepiece's circular field.
      const inField = Math.hypot(x - w / 2, y - h / 2) < h * 0.45;
      a.el.style.opacity = v.z < 1 && inField ? 1 : 0;
    }
  }
}
