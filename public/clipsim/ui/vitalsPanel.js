import { i18n } from './i18n.js';
import { bus } from '../procedure/bus.js';
import { pulseBeep, alarmSound, monitorAudio } from '../audio/engine.js';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const g = (x, mu, w) => Math.exp(-((x - mu) ** 2) / (2 * w * w));

// ECG lead II shape across one cardiac cycle. The QRS sits at the end of the
// previous cycle, so the arterial upstroke (at phase 0) follows it, as it does
// in life (electrical, then mechanical).
function ecg(ph) {
  const p = ph < 0.5 ? ph + 1 : ph;             // unwrap so the T wave follows the QRS
  return 0.12 * g(p, 0.78, 0.025) - 0.12 * g(p, 0.885, 0.007) + 1.0 * g(p, 0.9, 0.008)
       - 0.28 * g(p, 0.915, 0.009) + 0.3 * g(p, 1.14, 0.045);
}

// A sweeping trace, like an OR monitor: new samples are written over the old
// ones, left to right, with a small erase gap ahead of the pen.
class Sweep {
  constructor(canvas, color, speed = 70) {
    this.c = canvas; this.x2d = canvas.getContext('2d'); this.color = color; this.speed = speed;
    this.x = 0; this.lastY = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(10, r.width * dpr); canvas.height = Math.max(10, r.height * dpr);
    this.dpr = dpr;
  }
  push(v, dt) {
    const { x2d: c, c: cv } = this;
    const w = cv.width, h = cv.height;
    const nx = this.x + this.speed * dt * this.dpr;
    const y = h * (0.88 - 0.76 * v);
    c.clearRect(this.x + 1, 0, Math.min(14 * this.dpr, w - this.x), h);
    if (this.lastY !== null && nx < w) {
      c.strokeStyle = this.color; c.lineWidth = 1.6 * this.dpr; c.lineJoin = 'round';
      c.shadowColor = this.color; c.shadowBlur = 6 * this.dpr;
      c.beginPath(); c.moveTo(this.x, this.lastY); c.lineTo(nx, y); c.stroke();
    }
    this.lastY = y;
    this.x = nx;
    if (this.x >= w) { this.x = 0; this.lastY = null; c.clearRect(0, 0, 16 * this.dpr, h); }
  }
}

export class VitalsPanel {
  constructor(el, ctx, vitals) {
    this.el = el; this.ctx = ctx; this.v = vitals;
    this.q = (id) => el.querySelector('#' + id);
    this.ecg = null; this.art = null;
    this.alarmClock = 0;
    ctx.heart.onBeat = () => { if (ctx.state.started) pulseBeep(vitals.spo2); };
    this.q('v-mute').onclick = () => { const m = monitorAudio.toggle(); this.q('v-mute').classList.toggle('muted', m); };
    bus.on('alarm', (a) => this.#alarm(a));
    i18n.onChange(() => this.#alarm(this.v.alarm));
  }

  #alarm({ level, reason }) {
    const tag = this.q('v-alarm');
    tag.textContent = reason ? i18n.t('alarm.' + reason) : '';
    this.el.dataset.alarm = String(level);
    if (level >= 3) alarmSound.high(); else if (level === 2) alarmSound.medium(); else if (level === 1) alarmSound.low();
    this.alarmClock = 0;
  }

  update(dt, slow) {
    const { v, ctx } = this;
    if (!this.ecg) {                 // canvases are sized once the panel is visible
      this.ecg = new Sweep(this.q('ecg'), '#5dffa8');
      this.art = new Sweep(this.q('art'), '#ff4466');
    }
    const ph = ctx.heart.phase;
    this.ecg.push(0.25 + 0.6 * ecg(ph), dt);
    const pmmHg = v.dia + (v.sys - v.dia) * ctx.heart.pressure;
    this.art.push((pmmHg - 30) / 150, dt);

    // Repeat active alarms at a rate matched to their priority.
    const a = v.alarm;
    if (a.level) {
      this.alarmClock += dt;
      const every = a.level >= 3 ? 4 : a.level === 2 ? 8 : 15;
      if (this.alarmClock > every) { this.alarmClock = 0; (a.level >= 3 ? alarmSound.high : a.level === 2 ? alarmSound.medium : alarmSound.low)(); }
    }

    if (!slow) return;
    const s = ctx.state, set = (id, txt, bad) => { const e = this.q(id); e.textContent = txt; e.classList.toggle('alert', !!bad); };
    set('v-hr', Math.round(v.hr), v.hr > 110 || v.hr < 45);
    set('v-art', `${Math.round(v.sys)}/${Math.round(v.dia)}`, v.map < 65);
    this.q('v-map').textContent = `(${Math.round(v.map)})`;
    set('v-spo2', Math.round(v.spo2), v.spo2 < 94);
    set('v-mep', Math.round(v.mep), v.mep < 50);
    const bar = this.q('v-mepbar');
    bar.style.width = `${Math.min(100, v.mep)}%`;
    bar.classList.toggle('low', v.mep < 50);
    set('v-op', fmt(s.time - (s.startTime || 0)));
    const occl = s.tempClipOn ? s.time - s.tempClipStart : 0;
    set('v-occl', s.tempClipOn ? fmt(occl) : '--:--', occl > 300);
    this.q('v-occl').classList.toggle('running', !!s.tempClipOn);
    set('v-ebl', Math.round(ctx.bleeding.totalLoss), ctx.bleeding.totalLoss > 500);
    set('v-pool', ctx.bleeding.volume.toFixed(1), ctx.bleeding.volume > 3);
  }
}
