import { bus } from '../procedure/bus.js';

// Hidden rupture-risk accumulator (0 … 1). Rough handling of the dome, touching
// the bleb, fast dissector strokes and suction close to the dome all add to it.
// It decays very slowly when you stop. From M4 on, crossing a randomised
// threshold near the top ruptures the aneurysm.
export class RuptureRisk {
  constructor() {
    this.value = 0;
    this.peak = 0;
    this.events = [];          // [{t, amount, reason}] for the debrief
    this.lastWarn = {};
  }
  add(amount, reason, t = performance.now() / 1000) {
    if (amount <= 0) return;
    this.value = Math.min(1, this.value + amount);
    this.peak = Math.max(this.peak, this.value);
    const last = this.events[this.events.length - 1];
    if (last && last.reason === reason && t - last.t < 1) last.amount += amount;
    else this.events.push({ t, amount, reason });
    // Throttled warning, so the feed isn't spammed while a tool is held.
    if (!this.lastWarn[reason] || t - this.lastWarn[reason] > 2.5) {
      this.lastWarn[reason] = t;
      bus.emit('risk:warn', { reason, value: this.value });
    }
  }
  update(dt) { this.value = Math.max(0, this.value - dt * 0.002); }
}
