/**
 * The facility's score.
 *
 * Synthesised with Web Audio rather than shipped as files, so the platform
 * stays small and the music never has a seam. A slow chord bed on detuned
 * sawtooth pads through a lowpass, a sub drone under it, and sparse bell
 * figures on a pentatonic scale above — through a convolution reverb built
 * from generated noise, which is what makes it sound like a large room rather
 * than a browser tab.
 *
 * Each deck has its own chord and filter colour, so moving through the facility
 * changes the harmony. That is the "travelling between sections" feeling doing
 * real work: the ear notices the room change before the eye finishes the
 * transition.
 *
 * Everything is gated behind a user gesture, because browsers require it and
 * because a page that makes noise unasked is a page people close.
 *
 * @module astra/audio
 */

/** Chord voicings per deck, in semitones from the root. */
const MOODS = {
  intro: { root: 55, chord: [0, 7, 12, 16, 19], cutoff: 620, bells: [0, 3, 7, 10, 14], tempo: 5.2 },
  engine: { root: 55, chord: [0, 7, 14, 17], cutoff: 700, bells: [0, 2, 7, 9, 14], tempo: 4.6 },
  graph: { root: 49, chord: [0, 5, 12, 15, 19], cutoff: 560, bells: [0, 3, 5, 10, 12], tempo: 6.4 },
  decoder: { root: 58, chord: [0, 4, 11, 14], cutoff: 820, bells: [0, 4, 7, 11, 14], tempo: 4.0 },
  compare: { root: 53, chord: [0, 7, 11, 16], cutoff: 740, bells: [0, 2, 5, 9, 12], tempo: 4.4 },
  verify: { root: 46, chord: [0, 6, 10, 15], cutoff: 480, bells: [0, 3, 6, 10, 13], tempo: 7.0 },
  studio: { root: 57, chord: [0, 5, 9, 14, 16], cutoff: 880, bells: [0, 2, 4, 9, 11], tempo: 3.8 },
  command: { root: 51, chord: [0, 7, 12, 19], cutoff: 640, bells: [0, 5, 7, 12, 17], tempo: 5.6 },
};

/**
 * Convert a MIDI note number to frequency.
 *
 * @param {number} note MIDI note.
 * @returns {number} Frequency in hertz.
 */
function hz(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

/**
 * The score.
 */
export class Score {
  constructor() {
    this.context = null;
    this.master = null;
    this.bus = null;
    this.pads = [];
    this.filter = null;
    this.enabled = false;
    this.mood = MOODS.intro;
    this.bellTimer = null;
    this.volume = 0.16;
  }

  /**
   * Build the graph on first use. Must be called from a gesture.
   *
   * @returns {boolean} Whether audio is now running.
   */
  start() {
    if (this.context) {
      this.context.resume();
      this.enabled = true;
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.6);
      return true;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return false;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);

    // A generated impulse response: exponentially decaying stereo noise. Cheap,
    // and far more convincing than a delay line pretending to be a hall.
    const reverb = this.context.createConvolver();
    const length = Math.floor(this.context.sampleRate * 3.4);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * ((1 - i / length) ** 2.6);
      }
    }
    reverb.buffer = impulse;

    const wet = this.context.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet);
    wet.connect(this.master);

    this.bus = this.context.createGain();
    this.bus.gain.value = 0.8;
    this.filter = this.context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = this.mood.cutoff;
    this.filter.Q.value = 0.9;
    this.bus.connect(this.filter);
    this.filter.connect(this.master);
    this.filter.connect(reverb);

    this.#buildPads();
    this.#buildSub();
    this.#scheduleBells();

    this.enabled = true;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 1.4);
    return true;
  }

  /**
   * Five detuned sawtooth voices holding the chord, each with its own slow
   * amplitude drift so the pad never sits still.
   */
  #buildPads() {
    const ctx = this.context;
    for (let voice = 0; voice < 5; voice += 1) {
      const osc = ctx.createOscillator();
      osc.type = voice % 2 ? 'sawtooth' : 'triangle';
      osc.detune.value = (voice - 2) * 4.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;

      // Slow tremolo per voice, at prime-ish rates so they never phase-lock.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.037 + voice * 0.013;
      const depth = ctx.createGain();
      depth.gain.value = 0.045;
      lfo.connect(depth);
      depth.connect(gain.gain);
      lfo.start();

      osc.connect(gain);
      gain.connect(this.bus);
      osc.start();
      this.pads.push({ osc, gain, voice });
    }
    this.setMood('intro', 0);
  }

  /** A sine sub, felt more than heard, that anchors the whole score. */
  #buildSub() {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz(this.mood.root - 24);
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.sub = { osc, gain };
  }

  /**
   * Sparse bell figures on a variable schedule, so the music never resolves
   * into a loop the ear can predict and start ignoring.
   */
  #scheduleBells() {
    const next = () => {
      if (!this.context) return;
      if (this.enabled) this.#bell();
      const wait = (this.mood.tempo * 1000) * (0.55 + Math.random() * 0.9);
      this.bellTimer = setTimeout(next, wait);
    };
    this.bellTimer = setTimeout(next, 2600);
  }

  /** One bell: a struck sine with a long exponential tail. */
  #bell() {
    const ctx = this.context;
    const now = ctx.currentTime;
    const degree = this.mood.bells[Math.floor(Math.random() * this.mood.bells.length)];
    const octave = 24 + (Math.random() < 0.34 ? 12 : 0);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz(this.mood.root + degree + octave);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 3.8);
  }

  /**
   * Move to a deck's harmony.
   *
   * @param {string} deck Deck id.
   * @param {number} [glide] Seconds to take.
   */
  setMood(deck, glide = 3.2) {
    const mood = MOODS[deck] || MOODS.engine;
    this.mood = mood;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.pads.forEach((pad, index) => {
      const degree = mood.chord[index % mood.chord.length];
      pad.osc.frequency.setTargetAtTime(hz(mood.root + degree), now, Math.max(0.05, glide / 3));
      pad.gain.gain.setTargetAtTime(0.055 - index * 0.006, now, Math.max(0.05, glide / 2));
    });
    this.sub?.osc.frequency.setTargetAtTime(hz(mood.root - 24), now, Math.max(0.05, glide / 2));
    this.filter?.frequency.setTargetAtTime(mood.cutoff, now, Math.max(0.05, glide / 2));
  }

  /**
   * An interface cue.
   *
   * @param {'move'|'open'|'unlock'|'alert'|'reward'} kind What happened.
   */
  cue(kind) {
    if (!this.context || !this.enabled) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const specs = {
      move: [[880, 0.05, 0.16], [1320, 0.04, 0.1]],
      open: [[523, 0.06, 0.22], [784, 0.05, 0.2]],
      unlock: [[523, 0.07, 0.3], [659, 0.07, 0.3], [1046, 0.08, 0.5]],
      reward: [[784, 0.06, 0.24], [1046, 0.06, 0.24], [1568, 0.05, 0.4]],
      alert: [[220, 0.08, 0.3], [180, 0.07, 0.34]],
    };
    (specs[kind] || specs.move).forEach(([freq, gainValue, duration], index) => {
      const osc = ctx.createOscillator();
      osc.type = kind === 'alert' ? 'square' : 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const at = now + index * 0.075;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(gainValue, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + duration + 0.05);
    });
  }

  /**
   * Mute or unmute.
   *
   * @param {boolean} muted Whether to mute.
   */
  setMuted(muted) {
    this.enabled = !muted;
    if (!this.context) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.5);
  }

  /** Stop everything and release the context. */
  stop() {
    clearTimeout(this.bellTimer);
    this.enabled = false;
    if (!this.context) return;
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
    setTimeout(() => this.context?.suspend(), 600);
  }
}

/** Deck ids the score knows a mood for, for the settings panel. */
export const MOOD_DECKS = Object.keys(MOODS);
