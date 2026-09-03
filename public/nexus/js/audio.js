/**
 * Room tone and interface sound.
 *
 * Synthesised with Web Audio rather than shipped as files, so the console
 * stays small and the ambience never has a seam. Everything is gated behind
 * a user gesture, because browsers require it and because a page that makes
 * noise unasked is a page people close.
 *
 * @module nexus/audio
 */

/**
 * The console's sound.
 */
export class RoomTone {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
  }

  /**
   * Build the graph on first use — this must be called from a gesture.
   *
   * @returns {boolean} Whether audio is now running.
   */
  start() {
    if (this.context) {
      this.context.resume();
      this.enabled = true;
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.12;
    this.master.connect(this.context.destination);
    this.#buildDrone();
    this.enabled = true;
    return true;
  }

  /**
   * A slow two-oscillator drone through a low-pass filter, with a filtered
   * noise bed under it. Detuned by a few cents so it beats gently instead of
   * sitting still.
   */
  #buildDrone() {
    const ctx = this.context;
    const bus = ctx.createGain();
    bus.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    bus.connect(filter);
    filter.connect(this.master);

    for (const [freq, detune, gain] of [[55, 0, 0.5], [82.5, 7, 0.28], [110, -6, 0.18]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(bus);
      osc.start();
    }

    // Air: two seconds of noise, looped through a band-pass.
    const frames = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * 0.35;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.05;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start();

    this.droneFilter = filter;
  }

  /**
   * Mute or unmute the room.
   *
   * @param {boolean} value Muted.
   */
  setMuted(value) {
    this.enabled = !value;
    if (this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.12, this.context.currentTime, 0.2);
    }
  }

  /**
   * Play an interface tone.
   *
   * @param {'tap'|'confirm'|'deny'|'alert'|'arrive'} kind Which sound.
   */
  cue(kind = 'tap') {
    if (!this.context || !this.enabled) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const shapes = {
      tap: { freqs: [880], length: 0.07, type: 'triangle', gain: 0.10 },
      confirm: { freqs: [660, 990], length: 0.16, type: 'sine', gain: 0.12 },
      deny: { freqs: [220, 160], length: 0.22, type: 'sawtooth', gain: 0.09 },
      alert: { freqs: [440, 587, 440], length: 0.34, type: 'square', gain: 0.07 },
      arrive: { freqs: [523, 659, 784, 1046], length: 0.5, type: 'sine', gain: 0.10 },
    };
    const shape = shapes[kind] || shapes.tap;
    shape.freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = shape.type;
      osc.frequency.value = freq;
      const start = now + i * (shape.length / shape.freqs.length);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(shape.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + shape.length);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + shape.length + 0.05);
    });
  }

  /**
   * Open the drone's filter briefly, so the room "leans in" when something
   * significant lands.
   *
   * @param {number} [amount] 0 to 1.
   */
  swell(amount = 1) {
    if (!this.droneFilter || !this.enabled) return;
    const now = this.context.currentTime;
    this.droneFilter.frequency.cancelScheduledValues(now);
    this.droneFilter.frequency.setTargetAtTime(420 + 900 * amount, now, 0.15);
    this.droneFilter.frequency.setTargetAtTime(420, now + 1.2, 0.9);
  }
}
