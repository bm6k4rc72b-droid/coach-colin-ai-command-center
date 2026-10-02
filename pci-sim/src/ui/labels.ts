/**
 * Anatomy labels in the 3D view (toggle L): projected DOM tags, dimmed when the heart is in
 * front of them, with tooltip descriptions on hover.
 */
import * as THREE from 'three';
import type { Vec3 } from '../config/anatomy';
import { beatDisplace, beatScale } from '../anatomy/heart';
import { lerp3 } from '../anatomy/math';
import { sampleAt, type Anatomy, type VesselId } from '../anatomy/vessels';
import type { Simulation } from '../procedure/sim';
import { $, esc } from './dom';

interface Anchor {
  /** 'fine' labels show only close up, 'far' labels only in overview. */
  scale: 'fine' | 'far' | 'any';
  name: string;
  info: string;
  p: Vec3;
  w: number;
  el: HTMLElement;
  lesion?: boolean;
}

export class Labels {
  private el = $('labels');
  private anchors: Anchor[] = [];
  private ray = new THREE.Raycaster();
  private frame = 0;
  private tip = $('tooltip');

  build(anat: Anatomy): void {
    this.el.innerHTML = '';
    this.anchors = [];
    const v = anat.vessels;
    const add = (name: string, info: string, p: Vec3, w = 0, lesion = false, scale: Anchor['scale'] = 'any') => {
      const el = document.createElement('div');
      el.className = `label3d${lesion ? ' lesion' : ''}`;
      el.textContent = name;
      el.addEventListener('pointerenter', () => {
        this.tip.innerHTML = `<strong>${esc(name)}</strong><div>${esc(info)}</div>`;
        this.tip.classList.remove('hidden');
        const r = el.getBoundingClientRect();
        this.tip.style.left = `${Math.min(window.innerWidth - 310, Math.max(6, r.left))}px`;
        this.tip.style.top = `${r.bottom + 6}px`;
      });
      el.addEventListener('pointerleave', () => this.tip.classList.add('hidden'));
      this.el.appendChild(el);
      this.anchors.push({ name, info, p, w, el, lesion, scale });
    };
    const at = (id: VesselId, s: number) => sampleAt(v[id], s);
    add('Aortic root', 'Root of the aorta with the three sinuses (cusps). The left coronary ostium sits in the left cusp.', anat.rootCentre, 1);
    add('Ascending aorta', v.aorta.info, at('aorta', 45));
    add('Aortic arch', 'The arch gives off the brachiocephalic trunk, left common carotid and left subclavian arteries.', at('aorta', 120));
    add('Descending aorta', 'Continues down behind the heart toward the abdomen.', at('aorta', 260), 0, false, 'far');
    for (const id of ['radial', 'brachial', 'axillary', 'subclavian', 'brachiocephalic'] as VesselId[]) {
      add(v[id].name.replace('Right ', ''), v[id].info, at(id, v[id].length * 0.5), 0, false, 'far');
    }
    add('Left main', v.LM.info, lerp3(v.LM.pts[0], v.LM.pts.at(-1)!, 0.5), 1, false, 'fine');
    add('LAD', v.LAD.info, at('LAD', 85), 1);
    add('LCx', v.LCx.info, at('LCx', 40), 1, false, 'fine');
    add('D1', v.D1.info, at('D1', 22), 1, false, 'fine');
    add('D2', v.D2.info, at('D2', 20), 1, false, 'fine');
    add('RCA', v.RCA.info, at('RCA', 60), 1);
    add('Lesion 90%', 'Focal 90% diameter stenosis, 14 mm long, between D1 and D2. Reference diameter ≈ 2.95 mm.', at('LAD', 38), 1, true);
  }

  update(sim: Simulation, camera: THREE.PerspectiveCamera, heart: THREE.Object3D, visible: boolean, W: number, H: number): void {
    this.el.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.frame++;
    const s = beatScale(sim.beatPhase);
    const C = sim.anat.frame.centre;
    const v = new THREE.Vector3();
    const checkOcclusion = this.frame % 6 === 0;
    const camDist = camera.position.distanceTo(new THREE.Vector3(...C));
    for (const a of this.anchors) {
      if ((a.scale === 'fine' && camDist > 520) || (a.scale === 'far' && camDist < 300)) {
        a.el.style.display = 'none';
        continue;
      }
      const p = beatDisplace(a.p, C, s, a.w);
      v.set(p[0], p[1], p[2]);
      const dist = camera.position.distanceTo(v);
      v.project(camera);
      const on = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      a.el.style.display = on ? '' : 'none';
      if (!on) continue;
      a.el.style.left = `${((v.x + 1) / 2) * W}px`;
      a.el.style.top = `${((1 - v.y) / 2) * H}px`;
      if (checkOcclusion) {
        const dir = new THREE.Vector3(p[0], p[1], p[2]).sub(camera.position).normalize();
        this.ray.set(camera.position, dir);
        this.ray.far = dist - 3;
        const hit = this.ray.intersectObject(heart, true).length > 0;
        a.el.classList.toggle('dim', hit);
      }
    }
  }
}
