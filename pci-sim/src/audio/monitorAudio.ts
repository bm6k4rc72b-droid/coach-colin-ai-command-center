/**
 * Monitor sounds via Web Audio: QRS beep with pitch tracking SpO2, and a two-tone alarm.
 * The context is created (unlocked) by a user gesture — the start button.
 */
export class MonitorAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private lastAlarm = 0;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, start: number, dur: number, gain = 1, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  /** Pulse-oximeter style beep: lower pitch as saturation falls. */
  beep(spo2: number): void {
    if (!this.enabled || !this.ctx) return;
    const f = 520 + Math.max(0, Math.min(100, spo2) - 80) * 18;
    this.tone(f, this.ctx.currentTime, 0.09, 0.9, 'triangle');
  }

  /** High-priority two-tone alarm, rate-limited. */
  alarm(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAlarm < 1.2) return;
    this.lastAlarm = now;
    for (let i = 0; i < 2; i++) {
      this.tone(960, now + i * 0.36, 0.16, 0.7, 'square');
      this.tone(720, now + i * 0.36 + 0.18, 0.16, 0.7, 'square');
    }
  }
}
