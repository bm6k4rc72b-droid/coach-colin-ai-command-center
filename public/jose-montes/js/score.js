/**
 * The score.
 *
 * Luxury background music, synthesised with Web Audio rather than shipped as
 * a file: nothing to download, nothing to licence, no loop seam to notice on
 * a long visit, and it works with the signal off.
 *
 * It is a slow four-chord progression on a warm pad, a felt-piano voice that
 * places notes from the chord at unhurried intervals, and a filtered noise
 * bed standing in for surf. Everything is gated behind a user gesture,
 * because browsers require it and because a page that makes noise unasked is
 * a page people close.
 *
 * @module jose-montes/score
 */

/** Cmaj9 → Am9 → Fmaj7 → Gsus. Slow, unresolved, expensive-sounding. */
const PROGRESSION = [
  [130.81, 164.81, 196.00, 246.94, 293.66],
  [110.00, 130.81, 164.81, 196.00, 246.94],
  [87.31, 130.81, 174.61, 220.00, 261.63],
  [98.00, 146.83, 196.00, 246.94, 293.66],
];

/** The melody voice picks from these, two octaves up. */
const SPARKLE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

/**
 * The house sound.
 */
export class Score {
  constructor() {
    this.context = null;
    this.master = null;
    this.pad = null;
    this.running = false;
    this.chord = 0;
    this.timer = null;
    this.level = 0.16;
  }

  /**
   * Whether the platform has Web Audio at all.
   *
   * @returns {boolean} Support flag.
   */
  static get supported() {
    return Boolean(window.AudioContext || window.webkitAudioContext);
  }

  /**
   * Build the graph and start playing. Must be called from a gesture.
   *
   * @returns {boolean} Whether audio is now running.
   */
  start() {
    if (this.running) return true;
    if (this.context) {
      this.context.resume();
      this.running = true;
      this.#fade(this.level, 1.5);
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    this.context = new Ctor();

    this.master = this.context.createGain();
    this.master.gain.value = 0;
    // A gentle limiter, so a chord change never spikes into the voice.
    const shaper = this.context.createDynamicsCompressor();
    shaper.threshold.value = -22;
    shaper.ratio.value = 6;
    shaper.attack.value = 0.02;
    shaper.release.value = 0.4;
    this.master.connect(shaper);
    shaper.connect(this.context.destination);

    // A long reverb tail, built as decaying noise. Two seconds is enough to
    // sound like a room with stone in it and cheap enough for a phone.
    this.reverb = this.context.createConvolver();
    this.reverb.buffer = this.#impulse(2.4, 2.6);
    const wet = this.context.createGain();
    wet.gain.value = 0.42;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.#buildPad();
    this.#buildSurf();
    this.#schedule();

    this.running = true;
    this.#fade(this.level, 3);
    return true;
  }

  /**
   * Stop, keeping the graph so restarting is instant.
   */
  stop() {
    if (!this.context) return;
    this.running = false;
    this.#fade(0, 0.8);
    clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Toggle and report the new state.
   *
   * @returns {boolean} Whether the score is now playing.
   */
  toggle() {
    if (this.running) { this.stop(); return false; }
    return this.start();
  }

  /**
   * Duck under speech, then come back.
   *
   * @param {boolean} down Whether to duck.
   */
  duck(down) {
    if (!this.context || !this.running) return;
    this.#fade(down ? this.level * 0.28 : this.level, down ? 0.25 : 1.2);
  }

  /**
   * A short interface tone, for confirmations.
   *
   * @param {number} [freq] Frequency in hertz.
   */
  chime(freq = 880) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.reverb || this.master);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  /**
   * Ramp the master gain.
   *
   * @param {number} value Target gain.
   * @param {number} seconds Ramp time.
   */
  #fade(value, seconds) {
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  /**
   * Synthesise a reverb impulse response.
   *
   * @param {number} seconds Tail length.
   * @param {number} decay Decay exponent.
   * @returns {AudioBuffer} The impulse.
   */
  #impulse(seconds, decay) {
    const rate = this.context.sampleRate;
    const frames = Math.floor(rate * seconds);
    const buffer = this.context.createBuffer(2, frames, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < frames; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** decay;
      }
    }
    return buffer;
  }

  /**
   * The pad: five detuned voices per chord tone, through a slow filter.
   */
  #buildPad() {
    const ctx = this.context;
    this.pad = ctx.createGain();
    this.pad.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    this.pad.connect(filter);
    filter.connect(this.master);
    filter.connect(this.reverb);

    // A very slow LFO opening and closing the filter keeps the pad moving
    // without anything as obvious as a tremolo.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 380;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.voices = PROGRESSION[0].map(() => {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      sub.type = 'sine';
      sub.detune.value = -6;
      gain.gain.value = 0.06;
      osc.connect(gain);
      sub.connect(gain);
      gain.connect(this.pad);
      osc.start();
      sub.start();
      return { osc, sub, gain };
    });
    this.#setChord(0, 0.01);
  }

  /**
   * The surf bed: looping noise through a band-pass that drifts.
   */
  #buildSurf() {
    const ctx = this.context;
    const frames = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const swell = ctx.createOscillator();
    const swellGain = ctx.createGain();
    swell.frequency.value = 0.07;
    swellGain.gain.value = 0.028;
    swell.connect(swellGain);
    swellGain.connect(gain.gain);
    swell.start();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
  }

  /**
   * Move the pad to a chord.
   *
   * @param {number} index Chord index.
   * @param {number} glide Portamento time in seconds.
   */
  #setChord(index, glide = 2.2) {
    const chord = PROGRESSION[index % PROGRESSION.length];
    const now = this.context.currentTime;
    this.voices.forEach((voice, i) => {
      const freq = chord[i % chord.length];
      voice.osc.frequency.setTargetAtTime(freq, now, glide);
      voice.sub.frequency.setTargetAtTime(freq / 2, now, glide);
    });
  }

  /**
   * Advance the progression and place a melody note now and then.
   */
  #schedule() {
    const step = () => {
      if (!this.running) return;
      this.chord = (this.chord + 1) % PROGRESSION.length;
      this.#setChord(this.chord);
      // Roughly two bars in three carry a note, so the melody never settles
      // into a pattern the ear can predict.
      if (Math.random() < 0.66) {
        const chord = PROGRESSION[this.chord];
        const note = Math.random() < 0.5
          ? SPARKLE[Math.floor(Math.random() * SPARKLE.length)]
          : chord[Math.floor(Math.random() * chord.length)] * 4;
        this.#pluck(note, 0.6 + Math.random() * 2.4);
      }
      this.timer = setTimeout(step, 7200 + Math.random() * 2400);
    };
    this.timer = setTimeout(step, 5200);
  }

  /**
   * A felt-piano note: a soft sine with a fast attack and a long tail.
   *
   * @param {number} freq Frequency.
   * @param {number} delay Seconds from now.
   */
  #pluck(freq, delay) {
    const ctx = this.context;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const body = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    body.type = 'triangle';
    osc.frequency.value = freq;
    body.frequency.value = freq / 2;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.075, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 4.5);
    osc.connect(gain);
    body.connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    osc.start(at);
    body.start(at);
    osc.stop(at + 4.8);
    body.stop(at + 4.8);
  }
}
