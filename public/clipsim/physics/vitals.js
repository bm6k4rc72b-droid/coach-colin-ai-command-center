import { bus } from '../procedure/bus.js';

// Physiology under general anaesthesia, simplified for teaching.
//
//  - Every value drifts gently: a smoothed random walk that is pulled back to its target.
//  - Blood loss lowers the mean arterial pressure (MAP). The baroreflex raises the
//    heart rate to compensate: tachycardia plus hypotension means you are losing volume.
//  - Motor evoked potentials (MEP, % of baseline amplitude) watch the motor pathway.
//    They fall when the anterior choroidal artery or the perforators lose flow, when a
//    temporary occlusion runs long, when a parent artery is narrowed, or under heavy,
//    prolonged retraction. A >50 % drop is the usual warning criterion. They recover
//    (partly) once the cause is removed.

const BASE = { hr: 72, map: 85, pulse: 44, spo2: 99 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Drift {
  // Ornstein–Uhlenbeck noise: random, but always pulled back toward zero.
  constructor(sigma, theta = 0.25) { this.v = 0; this.sigma = sigma; this.theta = theta; }
  step(dt) { this.v += -this.theta * this.v * dt + this.sigma * Math.sqrt(dt) * (Math.random() * 2 - 1) * 1.7; return this.v; }
}

export class Vitals {
  constructor(ctx) {
    this.ctx = ctx;
    this.hr = BASE.hr; this.map = BASE.map; this.spo2 = BASE.spo2; this.mep = 100;
    // Underlying ("true") values. The displayed values add a small drift on top.
    this.core = { hr: BASE.hr, map: BASE.map, spo2: BASE.spo2, mep: 100 };
    this.sys = 0; this.dia = 0;
    this.lossRate = 0;                 // ml/min, smoothed
    this.lastLoss = 0;
    this.retractionHeavyT = 0;
    this.noise = { hr: new Drift(0.9), map: new Drift(1.1), spo2: new Drift(0.18), mep: new Drift(1.6, 0.4) };
    this.mepCause = null;
    this.record = { minMap: BASE.map, maxHr: BASE.hr, minMep: 100, minSpo2: BASE.spo2, mepAlerts: 0, hypotension: 0 };
    this.alarm = { level: 0, reason: null };
  }

  // The MEP level the pathway is heading toward, and the main reason for it.
  mepTarget(dt) {
    const c = this.ctx, f = c.flow, s = c.state;
    let target = 100, cause = null;
    const lower = (v, why) => { if (v < target) { target = v; cause = why; } };

    if (f.at('AChA') < 0.2) lower(32, 'AChA');
    if (f.at('perforator') < 0.2) lower(58, 'perforator');
    if (!f.tempClip && f.patency.ICA < 0.7) lower(62, 'ica');
    if (!f.tempClip && f.at('M1') < 0.5) lower(45, 'm1');
    if (s.tempClipOn) {
      // Ischaemic tolerance: little change for the first few minutes, then a steady fall.
      const occl = s.time - s.tempClipStart;
      if (occl > 180) lower(100 - (occl - 180) * 0.28, 'temp');
    }
    const r = s.retraction || {};
    if (Math.max(r.spatulaFrontal || 0, r.spatulaTemporal || 0) > 0.85) this.retractionHeavyT += dt; else this.retractionHeavyT = Math.max(0, this.retractionHeavyT - dt * 2);
    if (this.retractionHeavyT > 45) lower(100 - Math.min(22, (this.retractionHeavyT - 45) * 0.25), 'retraction');
    if (this.map < 60) lower(100 - (60 - this.map) * 2.2, 'hypotension');
    return { target: clamp(target, 8, 100), cause };
  }

  update(dt) {
    const c = this.ctx;
    if (!c.state.started || dt <= 0) return;
    const b = c.bleeding;

    // Blood loss rate in ml/min, smoothed over a few seconds.
    const inst = (b.totalLoss - this.lastLoss) / dt * 60;
    this.lastLoss = b.totalLoss;
    this.lossRate += (inst - this.lossRate) * Math.min(1, dt * 0.8);

    // Haemodynamics: cumulative loss beyond ~250 ml and fast active loss both lower MAP.
    const k = this.core;
    const volumeDeficit = Math.max(0, b.totalLoss - 250);
    const mapTarget = BASE.map - volumeDeficit * 0.03 - Math.min(28, this.lossRate * 0.05);
    k.map += (mapTarget - k.map) * Math.min(1, dt * 0.35);
    // Baroreflex: HR rises as MAP falls.
    const hrTarget = BASE.hr + Math.max(0, BASE.map - k.map) * 1.1 + Math.min(12, this.lossRate * 0.02);
    k.hr += (hrTarget - k.hr) * Math.min(1, dt * 0.5);
    const spo2Target = BASE.spo2 - (b.totalLoss > 1500 ? (b.totalLoss - 1500) * 0.004 : 0);
    k.spo2 += (spo2Target - k.spo2) * Math.min(1, dt * 0.2);

    const { target, cause } = this.mepTarget(dt);
    const rate = target < k.mep ? 0.12 : 0.03;          // falls faster than it recovers
    k.mep += (target - k.mep) * Math.min(1, dt * rate);
    if (cause !== this.mepCause) { this.mepCause = cause; if (cause) bus.emit('mep:cause', { cause }); }

    // Displayed values: the underlying value plus a gentle, bounded drift.
    this.map = k.map + this.noise.map.step(dt);
    this.hr = k.hr + this.noise.hr.step(dt);
    this.spo2 = clamp(k.spo2 + this.noise.spo2.step(dt), 82, 100);
    this.mep = clamp(k.mep + this.noise.mep.step(dt), 5, 104);
    const pulseP = BASE.pulse * clamp(this.map / BASE.map, 0.6, 1.1);
    this.sys = this.map + pulseP * 2 / 3;
    this.dia = this.map - pulseP / 3;

    // Feed the rest of the simulation.
    c.heart.hr = this.hr;
    b.pressure = clamp(this.map / BASE.map, 0.3, 1.2);
    b.arterialFlow = c.flow.at('aneurysm');

    const rec = this.record;
    rec.minMap = Math.min(rec.minMap, this.map);
    rec.maxHr = Math.max(rec.maxHr, this.hr);
    rec.minMep = Math.min(rec.minMep, this.mep);
    rec.minSpo2 = Math.min(rec.minSpo2, this.spo2);
    if (this.map < 65) rec.hypotension += dt;
    this.#alarms();
  }

  #alarms() {
    if (this.mep > 70) this.mepLatched = false;   // a new MEP event counts only after recovery
    let level = 0, reason = null;
    const raise = (l, r) => { if (l > level) { level = l; reason = r; } };
    if (this.ctx.state.ruptured && this.ctx.bleeding.activeSources.some((s) => s.kind === 'arterial')) raise(3, 'rupture');
    // Hysteresis: an alarm, once raised, clears only a few points past its threshold,
    // so drift around the line doesn't make it flicker.
    const was = this.alarm.reason;
    if (this.mep < (was === 'mep' ? 55 : 50)) raise(2, 'mep');
    if (this.map < (was === 'hypotension' ? 63 : 60)) raise(2, 'hypotension');
    if (this.hr > (was === 'tachycardia' ? 115 : 120)) raise(2, 'tachycardia');
    if (this.ctx.state.tempClipOn && this.ctx.state.time - this.ctx.state.tempClipStart > 300) raise(1, 'temp');
    if (this.map < (was === 'lowmap' ? 72 : 70)) raise(1, 'lowmap');
    if (level !== this.alarm.level || reason !== this.alarm.reason) {
      if (reason === 'mep' && !this.mepLatched) { this.record.mepAlerts++; this.mepLatched = true; }
      this.alarm = { level, reason };
      bus.emit('alarm', this.alarm);
    }
  }
}
