/**
 * Top HUD, stage checklist, feedback messages and the fluoro monitor overlay text.
 */
import { FLUORO } from '../config/anatomy';
import type { Rect } from '../scene/renderer';
import { projectionName, type Simulation } from '../procedure/sim';
import { STAGES } from '../procedure/stages';
import { $, esc, mmss, setHTML, setText } from './dom';

export interface HudActions {
  toggleView: () => void;
  help: () => void;
  pause: () => void;
  endCase: () => void;
}

export class Hud {
  private el = $('hud');
  private view!: HTMLButtonElement;
  private xray!: HTMLElement;
  private ftime!: HTMLElement;
  private contrast!: HTMLElement;
  private proj!: HTMLElement;
  private demo!: HTMLElement;

  constructor(a: HudActions) {
    this.el.innerHTML = `
      <span class="brand">PCI Sim<small>mid-LAD · right radial · educational</small></span>
      <span class="demo-badge hidden" id="hud-demo">DEMO</span>
      <button id="hud-view" title="Switch view (Tab)">3D</button>
      <span class="stat" id="hud-xray"><b>X-ray</b>OFF</span>
      <span class="stat" id="hud-ftime"><b>Fluoro</b>0:00</span>
      <span class="stat" id="hud-contrast"><b>Contrast</b>0 ml</span>
      <span class="stat wide" id="hud-proj"><b>C-arm</b>—</span>
      <span class="spacer"></span>
      <button id="hud-help" title="Controls (H)">Keys</button>
      <button id="hud-pause" title="Pause (Esc)">Pause</button>
      <button id="hud-end" title="Finish and open the debrief">End case</button>`;
    this.view = $('hud-view') as HTMLButtonElement;
    this.xray = $('hud-xray');
    this.ftime = $('hud-ftime');
    this.contrast = $('hud-contrast');
    this.proj = $('hud-proj');
    this.demo = $('hud-demo');
    this.view.addEventListener('click', a.toggleView);
    $('hud-help').addEventListener('click', a.help);
    $('hud-pause').addEventListener('click', a.pause);
    $('hud-end').addEventListener('click', a.endCase);
  }

  update(sim: Simulation): void {
    setText(this.view, sim.view === '3d' ? 'View: 3D' : 'View: X-ray');
    const acq = sim.acquisition;
    setHTML(this.xray, `<b>X-ray</b>${acq === 'cine' ? 'CINE' : acq === 'fluoro' ? 'FLUORO' : 'OFF'}`);
    this.xray.classList.toggle('xray-on', acq !== 'off');
    setHTML(this.ftime, `<b>Fluoro</b>${mmss(sim.fluoroTime)}`);
    setHTML(this.contrast, `<b>Contrast</b>${Math.round(sim.contrastMl)} ml`);
    setHTML(this.proj, `<b>C-arm</b>${esc(projectionName(sim.carm))}`);
    this.demo.classList.toggle('hidden', !sim.demo);
    document.documentElement.style.setProperty('--hud-h', `${this.el.offsetHeight + 6}px`);
  }

  get height(): number {
    return this.el.offsetHeight;
  }
}

export class Checklist {
  private el = $('checklist');
  private rows: HTMLElement[] = [];
  private flashed = new Set<number>();

  constructor() {
    this.el.innerHTML =
      '<h3>Procedure</h3>' +
      STAGES.map(
        (s, i) => `<div class="stage" data-i="${i}"><span class="num">${s.id}</span><span>${esc(s.title)}</span><span class="time"></span></div>`,
      ).join('');
    this.rows = Array.from(this.el.querySelectorAll<HTMLElement>('.stage'));
  }

  reset(): void {
    this.flashed.clear();
  }

  update(sim: Simulation): void {
    const p = sim.progress;
    this.rows.forEach((r, i) => {
      const done = p.completedAt[i] !== null;
      r.classList.toggle('done', done);
      r.classList.toggle('current', i === p.current);
      setText(r.querySelector('.time')!, done ? mmss(p.completedAt[i]!) : '');
      if (done && !this.flashed.has(i)) {
        this.flashed.add(i);
        r.classList.remove('flash');
        void r.offsetWidth;
        r.classList.add('flash');
      }
    });
  }
}

export class Messages {
  private el = $('messages');
  private lastId = 0;
  private shown: { id: number; el: HTMLElement; at: number }[] = [];

  reset(): void {
    this.lastId = 0;
    this.el.innerHTML = '';
    this.shown = [];
  }

  update(sim: Simulation, now: number): void {
    for (const m of sim.messages) {
      if (m.id <= this.lastId) continue;
      this.lastId = m.id;
      const d = document.createElement('div');
      d.className = `msg ${m.level}`;
      d.textContent = m.text;
      this.el.prepend(d);
      this.shown.unshift({ id: m.id, el: d, at: now });
    }
    while (this.shown.length > 3) this.shown.pop()!.el.remove();
    for (const s of this.shown) {
      const age = now - s.at;
      s.el.classList.toggle('old', age > 4);
      if (age > 9) s.el.style.opacity = '0';
      if (age > 10) {
        s.el.remove();
        this.shown = this.shown.filter((x) => x !== s);
      }
    }
  }
}

export class MonitorOverlay {
  private el = $('monitor-overlay');
  private pip = $('pip-label');

  update(sim: Simulation, monitor: Rect | null, pip: Rect | null, hasImage: boolean): void {
    if (pip) {
      this.pip.classList.remove('hidden');
      Object.assign(this.pip.style, { left: `${pip.x}px`, top: `${pip.y}px` });
      setText(this.pip, sim.acquisition === 'off' ? 'LIH · X-ray (Tab)' : sim.acquisition === 'cine' ? '● CINE' : '● FLUORO');
    } else this.pip.classList.add('hidden');
    if (!monitor) {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    Object.assign(this.el.style, {
      left: `${monitor.x}px`,
      top: `${monitor.y}px`,
      width: `${monitor.w}px`,
      height: `${monitor.h}px`,
    });
    const acq = sim.acquisition;
    const mode =
      acq === 'cine'
        ? `<span class="mode-cine">● CINE ${FLUORO.fps} fps</span>`
        : acq === 'fluoro'
          ? `<span class="mode-fluoro">● FLUORO ${FLUORO.fps} p/s</span>`
          : '<span>LIH</span>';
    const html = hasImage
      ? `<div class="tl">${esc(projectionName(sim.carm))}<br>FOV 17 cm</div>
         <div class="tr">${mode}</div>
         <div class="bl">Fluoro ${mmss(sim.fluoroTime)} · ${Math.round(sim.contrastMl)} ml</div>
         <div class="br">PCI · LAD</div>`
      : `<div class="empty">No image yet.<br>Hold Space (fluoro) or inject contrast (5) to acquire.</div>`;
    setHTML(this.el, html);
  }
}
