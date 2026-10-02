/**
 * Patient monitor: sweeping synthetic V2 ECG, HR, arterial BP, SpO2, ST, ACT, and the
 * Heparin (G) / Sound (N) buttons.
 */
import { PHYSIOLOGY } from '../config/anatomy';
import { ecgSample } from '../physics/physiology';
import type { Simulation } from '../procedure/sim';
import { $, setHTML, setText } from './dom';

const SWEEP_SECONDS = 4;
const DELAY = 0.3;

export class Vitals {
  private el = $('vitals');
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private buf: Float32Array = new Float32Array(1);
  private lastT = -1;
  private hr!: HTMLElement;
  private bp!: HTMLElement;
  private spo2!: HTMLElement;
  private st!: HTMLElement;
  private act!: HTMLElement;
  private hep!: HTMLButtonElement;
  private snd!: HTMLButtonElement;

  constructor(onHeparin: () => void, onSound: () => void) {
    this.el.innerHTML = `<canvas id="ecg" aria-label="ECG lead V2"></canvas>
      <div class="vrow">
        <div class="vital hr"><small>HR /min</small><span id="v-hr">--</span></div>
        <div class="vital bp"><small>ART mmHg</small><span id="v-bp">--</span></div>
        <div class="vital spo2"><small>SpO₂ %</small><span id="v-spo2">--</span></div>
        <div class="vital st"><small>ST V2 mm</small><span id="v-st">0.0</span></div>
        <div class="vital act"><small>ACT s</small><span id="v-act">--</span></div>
        <div class="vital"><small>V2 · 25 mm/s</small><span style="font-size:11px;color:var(--muted)">10 mm/mV</span></div>
      </div>
      <div class="vbtns"><button id="v-hep" title="Give heparin (G)">Heparin (G)</button><button id="v-snd" title="Toggle sound (N)">Sound (N)</button></div>`;
    this.canvas = $('ecg') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.hr = $('v-hr');
    this.bp = $('v-bp');
    this.spo2 = $('v-spo2');
    this.st = $('v-st');
    this.act = $('v-act');
    this.hep = $('v-hep') as HTMLButtonElement;
    this.snd = $('v-snd') as HTMLButtonElement;
    this.hep.addEventListener('click', onHeparin);
    this.snd.addEventListener('click', onSound);
  }

  reset(): void {
    this.buf.fill(NaN);
    this.lastT = -1;
  }

  private ensureSize(): void {
    const w = Math.max(100, Math.round(this.canvas.clientWidth * (window.devicePixelRatio || 1)));
    const h = Math.max(40, Math.round(this.canvas.clientHeight * (window.devicePixelRatio || 1)));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.buf = new Float32Array(w).fill(NaN);
      this.lastT = -1;
    }
  }

  /** ECG value (mV) at time t from the beats around it. */
  private sampleAt(sim: Simulation, t: number): number {
    let v = 0;
    for (const b of sim.beats) {
      const tau = t - b.t;
      if (tau < -0.3 || tau > 1.2) continue;
      v += ecgSample(tau, b.rr, b.st, b.pvc);
    }
    return v;
  }

  update(sim: Simulation, sound: boolean, frame: boolean): void {
    this.ensureSize();
    const W = this.canvas.width;
    const H = this.canvas.height;
    const tNow = sim.t - DELAY;
    if (this.lastT < 0) this.lastT = tNow;
    if (tNow > this.lastT) {
      const pxPerS = W / SWEEP_SECONDS;
      const x0 = Math.floor(this.lastT * pxPerS);
      const x1 = Math.floor(tNow * pxPerS);
      for (let x = x0 + 1; x <= x1 && x - x0 <= W; x++) {
        const t = x / pxPerS;
        this.buf[((x % W) + W) % W] = this.sampleAt(sim, t);
      }
      this.lastT = tNow;
    }
    const g = this.ctx;
    g.fillStyle = '#020604';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(77,255,154,0.08)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += W / 20) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    const cursor = Math.floor((tNow * W) / SWEEP_SECONDS) % W;
    const base = H * 0.62;
    const scale = H * 0.42;
    g.strokeStyle = sim.physio.unstable ? '#ff6b6b' : '#4dff9a';
    g.lineWidth = Math.max(1.4, H / 50);
    g.beginPath();
    let pen = false;
    for (let x = 0; x < W; x++) {
      const gap = (x - cursor + W) % W;
      const v = this.buf[x];
      if (gap < W * 0.03 || Number.isNaN(v)) {
        pen = false;
        continue;
      }
      const y = base - v * scale;
      if (!pen) g.moveTo(x, y);
      else g.lineTo(x, y);
      pen = true;
    }
    g.stroke();

    if (!frame) return;
    const p = sim.physio;
    setText(this.hr, String(Math.round(p.hr)));
    setText(this.bp, `${Math.round(p.sys)}/${Math.round(p.dia)}`);
    setText(this.spo2, String(Math.round(p.spo2)));
    setText(this.st, (p.st >= 0.05 ? '+' : '') + p.st.toFixed(1));
    setText(this.act, String(Math.round(p.act)));
    this.bp.parentElement!.classList.toggle('alarm', p.unstable);
    this.hr.parentElement!.classList.toggle('alarm', p.unstable);
    this.st.parentElement!.classList.toggle('alarm', p.st > 2.5);
    this.act.parentElement!.style.opacity = p.heparinAt !== null && p.act < PHYSIOLOGY.actTarget ? '0.7' : '1';
    this.hep.disabled = p.heparinAt !== null;
    setHTML(this.hep, p.heparinAt !== null ? 'Heparin ✓' : 'Heparin (G)');
    setText(this.snd, sound ? 'Sound on (N)' : 'Sound off (N)');
  }
}
