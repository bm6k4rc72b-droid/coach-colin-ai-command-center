/**
 * Tab 3 — Spectrum Lab: choose a cloak loadout, run the crossing, watch five sensors.
 */
import { GAIT_SPEED, SPECTRUM, type Light } from '../config/lab';
import {
  actorAt,
  lessons,
  runScenario,
  SENSOR_INFO,
  SENSORS,
  sensorProbabilities,
  thermalDelta,
  visualResidual,
  type Loadout,
  type ScenarioResult,
  type SensorId,
} from '../core/spectrum';
import { state } from '../core/store';
import { SpectrumScene } from '../scene/spectrumScene';
import { $, esc, pct } from './dom';

const CHOICES: { key: keyof Loadout; label: string; opts: [string, string][] }[] = [
  { key: 'visual', label: 'Optical', opts: [['none', 'None'], ['adaptive', 'Adaptive camo'], ['display', 'Display skin (clean plate)']] },
  { key: 'thermal', label: 'Thermal', opts: [['none', 'None'], ['blanket', 'Thermal blanket'], ['cooling', 'Active cooling']] },
  { key: 'radar', label: 'Radar', opts: [['none', 'None'], ['ram', 'Radar-absorbent layer']] },
  { key: 'acoustic', label: 'Acoustic', opts: [['none', 'None'], ['quiet', 'Quiet boots']] },
  { key: 'gait', label: 'Movement', opts: [['walk', 'Walk 1.4 m/s'], ['creep', 'Creep 0.45 m/s'], ['sprint', 'Sprint 4.5 m/s']] },
];

const LINE_COLORS: Record<SensorId, string> = { visible: '#f8fafc', thermal: '#fb923c', radar: '#4ade80', acoustic: '#60a5fa', wifi: '#c084fc' };

export class SpectrumView {
  private scene!: SpectrumScene;
  private feeds: Record<SensorId, CanvasRenderingContext2D> = {} as Record<SensorId, CanvasRenderingContext2D>;
  private result: ScenarioResult | null = null;
  /** Playback clock (scenario seconds); null when idle. */
  private playT: number | null = null;
  private speedUp = 8;
  active = false;

  constructor(private root: HTMLElement) {
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <h2>Spectrum Lab: can you be invisible to everything?</h2>
      <p class="lede">A guard post ${SPECTRUM.lateral} m from a ${SPECTRUM.pathHalf * 2} m path watches with five sensors. Choose your
        countermeasures and cross. Each sensor uses a simple, real physical model: pixels-on-target and contrast
        (Johnson criteria) for cameras, the radar equation with Doppler filtering, sound spreading loss, and Wi-Fi
        motion sensing.</p>
      <div class="grid cols-2">
        <div class="card">
          <canvas id="spectrum-3d"></canvas>
          <div class="feeds">${SENSORS.map(
            (s) => `<figure style="margin:0"><canvas width="160" height="120" data-feed="${s}"></canvas><figcaption>${esc(SENSOR_INFO[s].name)} · ${esc(SENSOR_INFO[s].band)}</figcaption></figure>`,
          ).join('')}</div>
          <canvas id="timeline" width="800" height="120" aria-label="Detection probability over the crossing"></canvas>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><h3>Loadout</h3>
            <div class="chooser">${CHOICES.map(
              (c) => `<span>${c.label}</span><select data-key="${c.key}">${c.opts.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select>`,
            ).join('')}
              <span>Light</span><select data-light><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option></select>
            </div>
            <div class="row" style="margin-top:10px"><button id="run-btn" class="primary">▶ Run crossing</button><span id="cost" class="muted mono"></span></div>
          </div>
          <div class="card" id="results"><h3>Detection by the end of the crossing</h3><div id="res-body" class="muted">Run a crossing.</div></div>
          <div class="card"><h3>Sensors</h3>${SENSORS.map((s) => `<p style="margin:4px 0"><strong>${esc(SENSOR_INFO[s].name)}:</strong> <span class="muted">${esc(SENSOR_INFO[s].info)}</span></p>`).join('')}</div>
        </div>
      </div>`;
    this.scene = new SpectrumScene($('#spectrum-3d', this.root));
    this.root.querySelectorAll<HTMLCanvasElement>('[data-feed]').forEach((c) => (this.feeds[c.dataset.feed as SensorId] = c.getContext('2d')!));
    this.root.querySelectorAll<HTMLSelectElement>('select[data-key]').forEach((sel) =>
      sel.addEventListener('change', () => {
        this.setLoadout({ [sel.dataset.key!]: sel.value } as Partial<Loadout>);
        this.run();
      }),
    );
    $('select[data-light]', this.root).addEventListener('change', (e) => {
      this.setLight((e.target as HTMLSelectElement).value as Light);
      this.run();
    });
    $('#run-btn', this.root).addEventListener('click', () => this.run());
    this.sync();
  }

  private sync(): void {
    this.root.querySelectorAll<HTMLSelectElement>('select[data-key]').forEach((sel) => (sel.value = String(state.loadout[sel.dataset.key as keyof Loadout])));
    ($('select[data-light]', this.root) as HTMLSelectElement).value = state.light;
    this.scene.setLoadout(state.loadout);
    this.scene.setLight(state.light);
  }

  setLoadout(l: Partial<Loadout>): void {
    state.loadout = { ...state.loadout, ...l };
    this.sync();
  }

  setLight(l: Light): void {
    state.light = l;
    this.sync();
  }

  run(): void {
    this.result = runScenario(state.loadout, { light: state.light });
    this.playT = 0;
    this.speedUp = state.loadout.gait === 'creep' ? 14 : state.loadout.gait === 'sprint' ? 4 : 8;
    this.drawResults();
    this.drawTimeline();
  }

  private drawResults(): void {
    const r = this.result!;
    $('#cost', this.root).textContent = `${r.weightKg.toFixed(1)} kg · ${r.powerW} W`;
    $('#res-body', this.root).className = '';
    $('#res-body', this.root).innerHTML = `
      ${SENSORS.map(
        (s) => `<div class="sensor-row"><span>${esc(SENSOR_INFO[s].name)}</span><div class="bar"><i style="width:${pct(r.cumulative[s])}"></i></div><span class="mono">${pct(r.cumulative[s])}</span></div>`,
      ).join('')}
      <div class="sensor-row" style="margin-top:8px"><strong>Any sensor</strong><div class="bar"><i style="width:${pct(r.overall)}"></i></div><strong class="mono">${pct(r.overall)}</strong></div>
      <p class="muted">Crossing time ${r.duration.toFixed(0)} s · carrying ${r.weightKg.toFixed(1)} kg and ${r.powerW} W of countermeasures.</p>
      <ul class="lessons">${lessons(state.loadout, r).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }

  private drawTimeline(): void {
    const c = $('#timeline', this.root) as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const r = this.result!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#0a1018';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (i * c.height) / 4);
      g.lineTo(c.width, (i * c.height) / 4);
      g.stroke();
    }
    for (const s of SENSORS) {
      g.strokeStyle = LINE_COLORS[s];
      g.lineWidth = 2;
      g.beginPath();
      r.timeline.forEach((p, i) => {
        const x = ((p.x + SPECTRUM.pathHalf) / (2 * SPECTRUM.pathHalf)) * c.width;
        const y = c.height - 6 - p.p[s] * (c.height - 12);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
    g.fillStyle = '#86a0b4';
    g.font = '11px sans-serif';
    g.fillText('per-look detection probability along the path (centre = closest to the post)', 8, 14);
  }

  private drawFeeds(p: Record<SensorId, number>, a: ReturnType<typeof actorAt>): void {
    const l = state.loadout;
    const W = 160;
    const H = 120;
    const ax = W / 2 + (a.x / SPECTRUM.pathHalf) * (W * 0.45);
    const size = Math.max(4, 60 * (SPECTRUM.lateral / a.range));
    // Visible
    {
      const g = this.feeds.visible;
      const bright = state.light === 'day' ? 150 : state.light === 'dusk' ? 90 : 35;
      g.fillStyle = `rgb(${bright * 0.7},${bright * 0.85},${bright})`;
      g.fillRect(0, 0, W, H);
      g.fillStyle = `rgb(${bright * 0.4},${bright * 0.6},${bright * 0.3})`;
      g.fillRect(0, H * 0.6, W, H * 0.4);
      const res = visualResidual(l, a);
      g.fillStyle = `rgba(20,24,30,${Math.min(1, res * 1.1)})`;
      g.fillRect(ax - size * 0.15, H * 0.62 - size, size * 0.3, size);
      this.label(g, p.visible);
    }
    // Thermal (inferno-ish)
    {
      const g = this.feeds.thermal;
      g.fillStyle = '#1b0c2e';
      g.fillRect(0, 0, W, H);
      const dT = thermalDelta(l, { light: state.light }, a.t);
      const k = Math.min(1, dT / 10);
      const grd = g.createRadialGradient(ax, H * 0.62 - size / 2, 1, ax, H * 0.62 - size / 2, size * 0.6);
      grd.addColorStop(0, `rgba(255,${200 * k + 40},${60 * k},${0.15 + 0.85 * k})`);
      grd.addColorStop(1, 'rgba(120,20,80,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      this.label(g, p.thermal);
    }
    // Radar range-Doppler
    {
      const g = this.feeds.radar;
      g.fillStyle = '#021a0e';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(74,222,128,0.2)';
      g.beginPath();
      g.moveTo(W / 2, 0);
      g.lineTo(W / 2, H);
      g.stroke();
      const radial = a.speed * Math.sin(Math.atan2(a.x, SPECTRUM.lateral));
      const bx = W / 2 + radial * 14;
      const by = H - (a.range / 80) * H;
      g.fillStyle = `rgba(74,222,128,${0.1 + 0.9 * p.radar})`;
      g.beginPath();
      g.arc(bx, by, 3 + 5 * p.radar, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(74,222,128,0.15)';
        g.fillRect(W / 2 - 2 + Math.random() * 4, Math.random() * H, 1, 1);
      }
      this.label(g, p.radar);
    }
    // Acoustic waveform
    {
      const g = this.feeds.acoustic;
      g.fillStyle = '#04101e';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#60a5fa';
      g.beginPath();
      for (let x = 0; x < W; x++) {
        const step = Math.max(0, Math.sin((x / W) * 20 + a.t * GAIT_SPEED[l.gait] * 6)) ** 12;
        const y = H / 2 + (Math.random() - 0.5) * 8 + step * (Math.random() - 0.5) * 100 * p.acoustic;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      this.label(g, p.acoustic);
    }
    // Wi-Fi CSI
    {
      const g = this.feeds.wifi;
      g.fillStyle = '#14082a';
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = `rgba(192,132,252,${0.4 + k * 0.15})`;
        g.beginPath();
        for (let x = 0; x < W; x++) {
          const y = H * (0.25 + k * 0.17) + Math.sin(x * 0.12 + k) * 3 + Math.sin(x * 0.05 + a.t * 3 + k) * 22 * p.wifi;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      this.label(g, p.wifi);
    }
  }

  private label(g: CanvasRenderingContext2D, p: number): void {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, 160, 18);
    g.fillStyle = p > 0.5 ? '#f87171' : p > 0.15 ? '#fbbf24' : '#4ade80';
    g.font = 'bold 12px ui-monospace, monospace';
    g.fillText(`P(look) ${pct(p)}`, 6, 13);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.scene.resize();
    const l = state.loadout;
    let t: number;
    if (this.playT !== null && this.result) {
      this.playT += dt * this.speedUp;
      if (this.playT > this.result.duration) this.playT = this.result.duration;
      t = this.playT;
    } else t = (performance.now() / 1000) % 10;
    const a = this.playT !== null ? actorAt(t, l.gait) : { ...actorAt(0, l.gait), x: -SPECTRUM.pathHalf, t };
    const p = sensorProbabilities(l, { light: state.light }, a);
    this.scene.update(a.x, t, GAIT_SPEED[l.gait], this.playT !== null ? p : null);
    this.drawFeeds(p, a);
  }
}
