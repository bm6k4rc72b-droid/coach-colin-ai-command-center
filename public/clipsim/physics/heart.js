import { HEART } from '../config/anatomy.js';
import { pulseUniform } from '../anatomy/materials.js';

// Minimal cardiac clock. It advances the phase at the current heart rate and
// turns it into an arterial pressure waveform: a fast systolic upstroke, then a
// dicrotic notch (aortic valve closure), then diastolic run-off. Tissue
// pulsation, the ECG trace and Doppler all read this one clock.
export class Heart {
  constructor() {
    this.hr = HEART.baseHR;
    this.phase = 0;      // 0..1 within the current beat
    this.beats = 0;
    this.onBeat = null;
  }
  static waveform(ph) {
    if (ph < 0.14) return Math.sin((ph / 0.14) * Math.PI / 2);
    const t = ph - 0.14;
    const decay = Math.exp(-t * 3.2);
    const notch = 0.12 * Math.exp(-((t - 0.2) ** 2) / 0.002);
    return Math.max(0, decay * 0.95 + notch - 0.05);
  }
  update(dt) {
    this.phase += dt * (this.hr / 60);
    if (this.phase >= 1) { this.phase -= 1; this.beats++; this.onBeat?.(); }
    this.pressure = Heart.waveform(this.phase);
    pulseUniform.value = this.pressure;
  }
}
