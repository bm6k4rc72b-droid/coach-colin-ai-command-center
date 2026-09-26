import * as THREE from 'three';
import { suction } from './suction.js';
import { scissors } from './scissors.js';
import { bipolar } from './bipolar.js';
import { dissector } from './dissector.js';
import { spatula } from './spatula.js';
import { clip } from './clip.js';
import { icg } from './icg.js';
import { doppler } from './doppler.js';
import { endoscope } from './endoscope.js';
import { tempClip } from './tempClip.js';
import { sfx } from '../audio/engine.js';

// Hover highlight: tints the emissive channel of the part under the cursor.
// Base values are restored when the highlight moves on.
class Highlighter {
  constructor() { this.root = null; this.saved = new Map(); this.color = new THREE.Color(); }
  set(root, color) {
    if (root === this.root && this.color.getHexString() === new THREE.Color(color).getHexString()) return;
    this.clear();
    if (!root) return;
    this.root = root;
    this.color.set(color);
    root.traverse((o) => {
      const m = o.material;
      if (!o.isMesh || !m || !m.emissive || this.saved.has(m)) return;
      this.saved.set(m, { c: m.emissive.clone(), i: m.emissiveIntensity });
    });
  }
  pulse(t) {
    const k = 0.35 + 0.25 * Math.sin(t * 6);
    for (const m of this.saved.keys()) { m.emissive.copy(this.color); m.emissiveIntensity = k; }
  }
  clear() {
    for (const [m, s] of this.saved) { m.emissive.copy(s.c); m.emissiveIntensity = s.i; }
    this.saved.clear();
    this.root = null;
  }
}

const STATE_COLOR = { ok: '#3ff3ff', warn: '#ffb86b', bad: '#ff4466', idle: '#8d97b3' };

// Owns the ten tools, routes pointer, wheel and key input to the active one,
// and places its instrument model at the point under the cursor, aimed back
// toward the surgeon's hand.
export class ToolManager {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.tools = this;
    this.list = [suction, scissors, bipolar, dissector, spatula, clip, icg, doppler, endoscope, tempClip].map((f) => f(ctx));
    this.byId = Object.fromEntries(this.list.map((t) => [t.id, t]));
    this.active = null;
    this.down = false;
    this.hit = null;
    this.prevPoint = null;
    this.speed = 0;
    this.pointer = { x: 0, y: 0, dx: 0, dy: 0 };
    this.highlighter = new Highlighter();
    this.listeners = new Set();
    this.enabled = true;

    const { canvas } = ctx;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || !this.active || e.button !== 0 || e.altKey) return;
      this.down = true;
      this.prevPoint = null;
      this.active.onDown?.(this.hit, e);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.down) return;
      this.down = false;
      this.active?.onUp?.(this.hit);
    });
    window.addEventListener('pointermove', (e) => {
      this.pointer.dx += e.clientX - this.pointer.x;
      this.pointer.dy += e.clientY - this.pointer.y;
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      if (this.enabled && this.active?.onWheel?.(e)) e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT' || e.repeat) return;
      const idx = '1234567890'.indexOf(e.key);
      if (idx >= 0) { this.select(this.list[idx].id); return; }
      if (e.key === 'Escape' && !this.active?.onKey?.(e)) { this.select(null); return; }
      this.active?.onKey?.(e);
    });

    this.reticle = document.getElementById('reticle');
  }

  onChange(fn) { this.listeners.add(fn); }

  select(id) {
    const next = id ? this.byId[id] : null;
    if (next === this.active) return;
    if (this.down) { this.active?.onUp?.(this.hit); this.down = false; }
    this.active?.deactivate?.();
    if (this.active?.model) this.active.model.visible = false;
    this.active?.extraModels?.forEach((m) => { m.visible = false; });
    this.active = next;
    this.highlighter.clear();
    this.ctx.controls.wheelEnabled = !next?.usesWheel;
    this.ctx.canvas.style.cursor = next ? 'none' : '';
    if (next) {
      if (next.model && !next.model.parent) this.ctx.scene.add(next.model);
      next.activate?.();
      sfx.select();
    }
    this.listeners.forEach((fn) => fn(next));
  }

  // Aim an instrument model: tip at `point`, shaft back toward the microscope,
  // entering from the left (side −1) or right (side +1) of the field.
  aim(model, point, side = 1, lift = 0) {
    const cam = this.ctx.camera;
    const toCam = cam.position.clone().sub(point);
    const dist = toCam.length();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const dir = toCam.normalize().multiplyScalar(dist)
      .addScaledVector(right, side * dist * 0.55).addScaledVector(up, -dist * 0.35).normalize();
    model.position.copy(point).addScaledVector(dir, lift);
    model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return dir;
  }

  update(dt, t) {
    const tool = this.active;
    const ih = this.ctx.inspector.hit;
    this.hit = ih ? {
      point: ih.point.clone(),
      object: ih.object,
      part: ih.object.userData.pickPart,
      distance: ih.distance,
      normal: ih.face ? ih.face.normal.clone().transformDirection(ih.object.matrixWorld) : new THREE.Vector3(0, 0, 1),
    } : null;

    if (this.hit && this.down && this.prevPoint) this.speed = this.hit.point.distanceTo(this.prevPoint) / Math.max(dt, 1e-3);
    else this.speed = 0;
    this.prevPoint = this.hit ? this.hit.point.clone() : null;

    for (const t2 of this.list) t2.background?.(dt, t);
    if (!tool || !this.enabled) { this.reticle.classList.remove('on'); this.pointer.dx = this.pointer.dy = 0; return; }

    const v = tool.validate?.(this.hit) ?? { state: this.hit ? 'ok' : 'idle' };
    if (!this.ctx.state.icg && v.highlight) { this.highlighter.set(v.highlight, STATE_COLOR[v.state] || STATE_COLOR.ok); this.highlighter.pulse(t); }
    else this.highlighter.clear();

    if (tool.model) {
      tool.model.visible = !!this.hit && !tool.hideModel;
      if (this.hit && !tool.placesOwnModel) this.aim(tool.model, this.hit.point, tool.side ?? 1, this.down ? 0.05 : 0.6);
    }
    if (this.down) tool.onHold?.(this.hit, dt, this.speed, this.pointer);
    tool.update?.(dt, this.hit, t);
    this.#reticle(v, tool);
    this.pointer.dx = this.pointer.dy = 0;
  }

  #reticle(v, tool) {
    const r = this.reticle;
    r.classList.add('on');
    r.dataset.state = v.state || 'idle';
    r.style.transform = `translate(${this.pointer.x}px, ${this.pointer.y}px)`;
    const label = v.action ? this.ctx.i18n.t(v.action) : '';
    const el = r.querySelector('.act');
    if (el.textContent !== label) el.textContent = label;
    const p = tool.progress ?? 0;
    r.querySelector('.prog').style.strokeDashoffset = String(113 * (1 - p));
    r.classList.toggle('busy', p > 0);
  }
}

// The root object to highlight for a hit: the highest ancestor carrying the same part id.
export function partRoot(obj) {
  if (!obj) return null;
  let o = obj;
  const part = obj.userData.pickPart || obj.userData.part;
  while (o.parent && o.parent.userData.part === part) o = o.parent;
  return o;
}
