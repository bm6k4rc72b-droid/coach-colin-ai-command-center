/* Shared live-drill chrome: canvas, HUD, phase ladder, loop dial,
   the rAF pump, and a clean teardown. Every drill builds on this. */
import { el, $ } from '../ui/ui.js';
import { FieldRenderer } from '../render/field.js';
import { LoopDial } from '../render/dial.js';
import { PHASES, PHASE_META } from '../engine/ooda.js';
import { motion } from '../sensors/motion.js';
import { audio } from '../core/audio.js';
import { state } from '../core/state.js';

export class Stage {
  constructor(root, { field = true, dial = true, phases = true, reps = 0, title = '', cam = null } = {}){
    this.root = root;
    root.innerHTML = '';
    this.alive = true;
    this.repIndex = 0;
    this.totalReps = reps;
    this.heat = 0;

    if(field){
      this.canvas = el('canvas', { class:'field-canvas' });
      root.append(this.canvas);
      this.field = new FieldRenderer(this.canvas, cam);
    }

    this.hud = el('div', { class:'stage-hud' });
    this.quitBtn = el('button', { class:'hud-quit' }, 'ABORT');
    this.repEl = el('div', { class:'hud-rep' }, el('b', { text:'1' }), el('span', { text:title || 'REP' }));
    this.heatEl = el('div', { class:'hud-heat' }, el('b', { text:'0' }), 'HEAT');
    if(!reps) this.repEl.style.visibility = 'hidden';
    this.hud.append(el('div', { class:'hud-top' }, this.quitBtn, this.repEl, this.heatEl));

    if(phases){
      this.rail = el('div', { class:'phase-rail' });
      this.pips = {};
      PHASES.forEach(p => {
        const pip = el('div', { class:'phase-pip' }, el('i'), PHASE_META[p].label, el('em', { text:'' }));
        this.pips[p] = pip;
        this.rail.append(pip);
      });
      this.hud.append(this.rail);
    }

    if(dial){
      this.dialCanvas = el('canvas', { class:'loop-dial' });
      this.hud.append(this.dialCanvas);
    }
    root.append(this.hud);
    if(dial) this.dial = new LoopDial(this.dialCanvas);

    this._pointerPan();
    this._pump();
  }

  /* thumb fallback for yaw when motion is unavailable or declined */
  _pointerPan(){
    if(!this.canvas) return;
    let down = null;
    this.canvas.addEventListener('pointerdown', e => { down = { x:e.clientX, yaw:this.field.yaw }; });
    this.canvas.addEventListener('pointermove', e => {
      if(!down || motion.live) return;
      this.field.setYaw(down.yaw + (down.x - e.clientX) * 0.22);
    });
    const up = () => { down = null; };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  _pump(){
    let last = performance.now();
    const frame = now => {
      if(!this.alive) return;
      this._raf = requestAnimationFrame(frame);
      const dt = now - last; last = now;
      if(this.field){
        if(motion.live && state.s.settings.motion){
          this.field.setYaw(motion.yaw);
          this.field.setPitch(-motion.pitch * 0.35);
        }
        this.field.draw(dt);
      }
      if(this.dial) this.dial.draw();
      if(this.onFrame) this.onFrame(now, dt);
    };
    this._raf = requestAnimationFrame(frame);
  }

  setRep(i, total){
    this.repIndex = i;
    this.repEl.querySelector('b').textContent = `${i}/${total}`;
  }

  setHeat(h){
    this.heat = h;
    this.heatEl.querySelector('b').textContent = `${h}`;
    this.heatEl.classList.toggle('is-hot', h >= 3);
  }

  phase(name, ms){
    if(!this.pips) return;
    const idx = PHASES.indexOf(name);
    PHASES.forEach((p, i) => {
      const pip = this.pips[p];
      pip.classList.toggle('is-on', i === idx);
      pip.classList.toggle('is-done', i < idx);
    });
    if(ms != null && this.pips[name]) this.pips[name].querySelector('em').textContent = ` ${Math.round(ms)}`;
  }
  stampPhase(name, ms){
    if(this.pips?.[name]) this.pips[name].querySelector('em').textContent = ` ${Math.round(ms)}`;
  }
  clearPhases(){
    if(!this.pips) return;
    PHASES.forEach(p => {
      this.pips[p].classList.remove('is-on','is-done');
      this.pips[p].querySelector('em').textContent = '';
    });
  }

  overlay(node){ this.root.append(node); return node; }

  destroy(){
    this.alive = false;
    cancelAnimationFrame(this._raf);
    this.field?.destroy();
    audio.crowd(0);
    motion.disarmThrow();
    this.root.innerHTML = '';
  }
}
