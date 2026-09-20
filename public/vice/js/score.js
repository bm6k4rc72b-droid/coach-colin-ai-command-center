/**
 * The score.
 *
 * Five cues and a small bank of effects, synthesised in Web Audio rather than
 * streamed as files.
 *
 * **On the songs that were asked for.** The brief for this page named two
 * commercial recordings. Neither is here, and neither can be: shipping a
 * copyrighted master on a public marketing site is the owner's liability, not
 * a technical problem, and no amount of clever loading changes that. What is
 * here instead is original music written to do the same job — a Miami synth
 * drift for the arrival, a hard 128bpm chase cue, a minor-key cue for the
 * gunships, a riser and sub-drop for the detonation, and a bright brass-and-
 * bajo finale in 4/4 for the rescue. If the operation licenses the real
 * tracks, {@link Score#useTrack} takes an audio URL per cue and plays that
 * instead of the synth, with no other change to the page.
 *
 * Everything is behind a gesture. Browsers require it, and a site that starts
 * shouting the moment it loads is a site people close before the first act.
 *
 * @module vice/score
 */

import { clamp } from './mathkit.js';

/** Equal temperament, A4 = 440. */
const A4 = 440;

/**
 * A note name to a frequency.
 *
 * @param {string} name Scientific pitch, e.g. `F#3`.
 * @returns {number} Frequency in Hz.
 */
export function note(name) {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!match) return 0;
  const base = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[match[1]];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]);
  return A4 * 2 ** ((base + accidental + (octave - 4) * 12) / 12);
}

/**
 * The cues.
 *
 * Each is a bar-length pattern the scheduler walks: a chord per bar, a bass
 * figure in sixteenths, a drum map, and an optional lead. Simple enough to
 * read, dense enough to not sound like a placeholder.
 */
export const CUES = Object.freeze({
  drift: {
    bpm: 84, swing: 0,
    chords: [['F2', 'C3', 'F3', 'A3', 'C4'], ['D2', 'A2', 'D3', 'F3', 'A3'],
      ['Bb1', 'F2', 'Bb2', 'D3', 'F3'], ['C2', 'G2', 'C3', 'E3', 'G3']],
    bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    lead: 'arp', leadGain: 0.14, pad: 0.5,
  },
  chase: {
    bpm: 128, swing: 0,
    chords: [['A1', 'E2', 'A2', 'C3', 'E3'], ['F1', 'C2', 'F2', 'A2', 'C3'],
      ['G1', 'D2', 'G2', 'B2', 'D3'], ['E1', 'B1', 'E2', 'G2', 'B2']],
    bass: [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    lead: 'stab', leadGain: 0.2, pad: 0.28,
  },
  cavalry: {
    bpm: 132, swing: 0,
    chords: [['D1', 'A1', 'D2', 'F2', 'A2'], ['D1', 'A1', 'D2', 'F2', 'C3'],
      ['Bb1', 'F2', 'Bb2', 'D3', 'F3'], ['A1', 'E2', 'A2', 'C3', 'E3']],
    bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    lead: 'brass', leadGain: 0.24, pad: 0.34,
  },
  blast: {
    bpm: 128, swing: 0,
    chords: [['C1', 'G1', 'C2', 'Eb2', 'G2']],
    bass: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lead: 'riser', leadGain: 0.3, pad: 0.7,
  },
  finale: {
    bpm: 118, swing: 0.08,
    chords: [['F2', 'C3', 'F3', 'A3'], ['C2', 'G2', 'C3', 'E3'],
      ['Bb1', 'F2', 'Bb2', 'D3'], ['C2', 'G2', 'C3', 'E3']],
    // Off-beat bass and a hat on every upbeat: the feel of a cumbia without
    // borrowing a bar of one.
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    lead: 'brass', leadGain: 0.26, pad: 0.4,
  },
});

/** Sixteenths per bar. */
const STEPS = 16;

/**
 * The house sound.
 */
export class Score {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.running = false;
    this.cue = null;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.level = 0.34;
    this.tracks = new Map();
    this.element = null;
  }

  /**
   * Whether the platform has Web Audio at all.
   *
   * @returns {boolean} Support flag.
   */
  static get supported() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  /**
   * Register a licensed audio file to play in place of a synthesised cue.
   *
   * This is the hook for the real soundtrack. Give it a cue name and a URL to
   * a file the operation has the right to publish, and the synth for that cue
   * stands down.
   *
   * @param {string} cue A key of {@link CUES}.
   * @param {string} url An audio URL.
   */
  useTrack(cue, url) {
    this.tracks.set(cue, url);
  }

  /**
   * Start the engine. Must be called from a user gesture.
   *
   * @returns {boolean} Whether audio is now running.
   */
  start() {
    if (this.running) return true;
    if (this.context) {
      this.context.resume();
      this.running = true;
      this.#fade(this.level, 1.2);
      this.#tick();
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    this.context = new Ctor();

    this.master = this.context.createGain();
    this.master.gain.value = 0;
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    this.master.connect(limiter);
    limiter.connect(this.context.destination);

    this.musicBus = this.context.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);

    this.sfxBus = this.context.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.reverb = this.context.createConvolver();
    this.reverb.buffer = this.#impulse(1.8, 2.4);
    this.wet = this.context.createGain();
    this.wet.gain.value = 0.3;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);

    this.noise = this.#noiseBuffer();

    this.running = true;
    this.nextStepTime = this.context.currentTime + 0.06;
    this.#fade(this.level, 2);
    this.#tick();
    return true;
  }

  /** Stop, keeping the graph so restarting is instant. */
  stop() {
    if (!this.context) return;
    this.running = false;
    this.#fade(0, 0.6);
    clearTimeout(this.timer);
    this.timer = null;
    if (this.element) this.element.pause();
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
   * Switch cue.
   *
   * The bar is allowed to finish: cutting mid-bar is what makes scroll-linked
   * music sound like a broken jukebox rather than a film.
   *
   * @param {string} name A key of {@link CUES}.
   */
  setCue(name) {
    if (!CUES[name] || this.cue === name) return;
    this.cue = name;
    this.pending = true;
    const track = this.tracks.get(name);
    if (track) this.#playTrack(track);
    else if (this.element) { this.element.pause(); this.element = null; }
  }

  /**
   * Duck the music, for a moment when something else needs the room.
   *
   * @param {number} amount 0–1, where 1 is fully out of the way.
   * @param {number} [seconds] How long to stay down.
   */
  duck(amount, seconds = 0.6) {
    if (!this.musicBus) return;
    const now = this.context.currentTime;
    const gain = this.musicBus.gain;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(1 - clamp(amount, 0, 1), now, 0.05);
    gain.setTargetAtTime(1, now + seconds, 0.3);
  }

  /**
   * Fire a one-shot effect.
   *
   * @param {'siren'|'skid'|'rotor'|'boom'|'shield'|'star'|'engine'} name Effect.
   * @param {object} [options] `{ gain }`.
   */
  sfx(name, options = {}) {
    if (!this.running || !this.context) return;
    const gain = clamp(options.gain ?? 1, 0, 1);
    const now = this.context.currentTime;
    switch (name) {
      case 'siren': this.#siren(now, gain); break;
      case 'skid': this.#skid(now, gain); break;
      case 'rotor': this.#rotor(now, gain); break;
      case 'boom': this.#boom(now, gain); break;
      case 'shield': this.#shieldRing(now, gain); break;
      case 'star': this.#star(now, gain); break;
      default: break;
    }
  }

  /* --- the scheduler ---------------------------------------------------- */

  /**
   * Schedule ahead on a timer rather than on `setInterval` alone.
   *
   * Web Audio's clock and the page's clock drift apart, badly, whenever the
   * main thread is busy — which, on a page with a canvas film running, it
   * always is. So the timer only decides *when to think*; every note is
   * scheduled against `context.currentTime` and lands on the sample it was
   * asked for.
   */
  #tick() {
    if (!this.running) return;
    const lookahead = 0.12;
    while (this.nextStepTime < this.context.currentTime + lookahead) {
      this.#scheduleStep(this.step, this.nextStepTime);
      const cue = CUES[this.cue] || CUES.drift;
      const stepSeconds = 60 / cue.bpm / 4;
      const swing = this.step % 2 === 1 ? stepSeconds * (cue.swing || 0) : 0;
      this.nextStepTime += stepSeconds + swing;
      this.step = (this.step + 1) % (STEPS * 4);
      if (this.step === 0 && this.pending) this.pending = false;
    }
    this.timer = setTimeout(() => this.#tick(), 25);
  }

  /** One sixteenth of one cue. */
  #scheduleStep(step, when) {
    const cue = CUES[this.cue] || CUES.drift;
    if (this.element) return; // A licensed track is playing; the synth stays quiet.
    const inBar = step % STEPS;
    const bar = Math.floor(step / STEPS) % cue.chords.length;
    const chord = cue.chords[bar];

    if (inBar === 0) this.#pad(chord, when, (60 / cue.bpm) * 4, cue.pad);
    if (cue.bass[inBar]) this.#bass(note(chord[0]), when, 60 / cue.bpm / 4 * 1.6);
    if (cue.kick[inBar]) this.#kick(when);
    if (cue.snare[inBar]) this.#snare(when);
    if (cue.hat[inBar]) this.#hat(when, inBar % 4 === 0 ? 0.5 : 0.28);

    if (cue.lead === 'arp' && inBar % 2 === 0) {
      const pitch = note(chord[2 + ((step / 2) % 3)]) * 2;
      this.#pluck(pitch, when, 0.5, cue.leadGain);
    }
    if (cue.lead === 'stab' && (inBar === 0 || inBar === 6 || inBar === 10)) {
      this.#stab(chord, when, cue.leadGain);
    }
    if (cue.lead === 'brass' && (inBar === 0 || inBar === 3 || inBar === 8 || inBar === 11)) {
      this.#brass(note(chord[2]), when, 0.34, cue.leadGain);
    }
    if (cue.lead === 'riser' && inBar === 0) this.#riser(when, (60 / cue.bpm) * 4);
  }

  /* --- voices ----------------------------------------------------------- */

  /** A wide detuned pad, the bed everything else sits on. */
  #pad(chord, when, seconds, level = 0.4) {
    for (const name of chord.slice(1)) {
      const f = note(name);
      for (const detune of [-7, 7]) {
        const osc = this.context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, when);
        filter.frequency.linearRampToValueAtTime(1500, when + seconds * 0.4);
        filter.Q.value = 4;
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(0.045 * level, when + seconds * 0.25);
        gain.gain.linearRampToValueAtTime(0, when + seconds);
        osc.connect(filter); filter.connect(gain);
        gain.connect(this.musicBus); gain.connect(this.reverb);
        osc.start(when); osc.stop(when + seconds + 0.05);
      }
    }
  }

  /** The bass: a square through a resonant filter. */
  #bass(f, when, seconds) {
    const osc = this.context.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;
    const sub = this.context.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f / 2;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, when);
    filter.frequency.exponentialRampToValueAtTime(280, when + seconds);
    filter.Q.value = 7;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.22, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(filter); sub.connect(filter); filter.connect(gain);
    gain.connect(this.musicBus);
    osc.start(when); osc.stop(when + seconds);
    sub.start(when); sub.stop(when + seconds);
  }

  /** A short plucked note for the arpeggio. */
  #pluck(f, when, seconds, level) {
    const osc = this.context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(level, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(gain);
    gain.connect(this.musicBus); gain.connect(this.reverb);
    osc.start(when); osc.stop(when + seconds);
  }

  /** A hard chord stab, the sound of the chase. */
  #stab(chord, when, level) {
    for (const name of chord.slice(2)) {
      const osc = this.context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = note(name);
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2600, when);
      filter.frequency.exponentialRampToValueAtTime(700, when + 0.2);
      filter.Q.value = 3;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level * 0.4, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
      osc.connect(filter); filter.connect(gain);
      gain.connect(this.musicBus); gain.connect(this.reverb);
      osc.start(when); osc.stop(when + 0.26);
    }
  }

  /** A brass-ish voice: a saw with a fast filter sweep and a slow vibrato. */
  #brass(f, when, seconds, level) {
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    const vibrato = this.context.createOscillator();
    vibrato.frequency.value = 5.4;
    const depth = this.context.createGain();
    depth.gain.value = 4;
    vibrato.connect(depth); depth.connect(osc.detune);
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, when);
    filter.frequency.linearRampToValueAtTime(3600, when + 0.06);
    filter.frequency.linearRampToValueAtTime(1400, when + seconds);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(level, when + 0.03);
    gain.gain.setValueAtTime(level, when + seconds * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(filter); filter.connect(gain);
    gain.connect(this.musicBus); gain.connect(this.reverb);
    osc.start(when); vibrato.start(when);
    osc.stop(when + seconds); vibrato.stop(when + seconds);
  }

  /** The riser under the detonation. */
  #riser(when, seconds) {
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, when);
    osc.frequency.exponentialRampToValueAtTime(1800, when + seconds);
    const noise = this.context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const nf = this.context.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(400, when);
    nf.frequency.exponentialRampToValueAtTime(7000, when + seconds);
    nf.Q.value = 1.6;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.2, when + seconds * 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(gain); noise.connect(nf); nf.connect(gain);
    gain.connect(this.musicBus);
    osc.start(when); noise.start(when);
    osc.stop(when + seconds); noise.stop(when + seconds);
  }

  /* --- drums ------------------------------------------------------------ */

  #kick(when) {
    const osc = this.context.createOscillator();
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.11);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.55, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
    osc.connect(gain); gain.connect(this.musicBus);
    osc.start(when); osc.stop(when + 0.26);
  }

  #snare(when) {
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1400;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.3, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    src.connect(filter); filter.connect(gain);
    gain.connect(this.musicBus); gain.connect(this.reverb);
    src.start(when); src.stop(when + 0.18);
  }

  #hat(when, level) {
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7200;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.09 * level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(filter); filter.connect(gain); gain.connect(this.musicBus);
    src.start(when); src.stop(when + 0.06);
  }

  /* --- effects ---------------------------------------------------------- */

  /** A two-tone wail, the way an American police siren actually alternates. */
  #siren(when, level) {
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    const seconds = 1.6;
    for (let i = 0; i <= 6; i += 1) {
      osc.frequency.setValueAtTime(i % 2 ? 700 : 980, when + i * (seconds / 6));
    }
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 3;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.08 * level, when + 0.1);
    gain.gain.setValueAtTime(0.08 * level, when + seconds * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, when + seconds);
    osc.connect(filter); filter.connect(gain);
    gain.connect(this.sfxBus); gain.connect(this.reverb);
    osc.start(when); osc.stop(when + seconds);
  }

  /** Tyres letting go. */
  #skid(when, level) {
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, when);
    filter.frequency.exponentialRampToValueAtTime(600, when + 0.7);
    filter.Q.value = 6;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.13 * level, when + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.8);
    src.connect(filter); filter.connect(gain); gain.connect(this.sfxBus);
    src.start(when); src.stop(when + 0.85);
  }

  /** Rotor thump: a low pulse train, not a hum. */
  #rotor(when, level) {
    const seconds = 1.4;
    for (let i = 0; i < 22; i += 1) {
      const at = when + i * (seconds / 22);
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(64, at);
      osc.frequency.exponentialRampToValueAtTime(38, at + 0.05);
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.16 * level, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
      osc.connect(gain); gain.connect(this.sfxBus);
      osc.start(at); osc.stop(at + 0.06);
    }
  }

  /** The detonation: a sub drop under a long filtered noise tail. */
  #boom(when, level) {
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, when);
    osc.frequency.exponentialRampToValueAtTime(24, when + 1.6);
    const og = this.context.createGain();
    og.gain.setValueAtTime(0.9 * level, when);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 2.2);
    osc.connect(og); og.connect(this.sfxBus);
    osc.start(when); osc.stop(when + 2.3);

    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(6000, when);
    filter.frequency.exponentialRampToValueAtTime(180, when + 2.4);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.6 * level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
    src.connect(filter); filter.connect(gain);
    gain.connect(this.sfxBus); gain.connect(this.reverb);
    src.start(when); src.stop(when + 2.7);
  }

  /** Vibranium, or whatever the lab called it. */
  #shieldRing(when, level) {
    for (const [f, decay] of [[880, 2.4], [1320, 1.8], [1978, 1.2], [2640, 0.9]]) {
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.1 * level, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      osc.connect(gain); gain.connect(this.sfxBus); gain.connect(this.reverb);
      osc.start(when); osc.stop(when + decay);
    }
  }

  /** The blip a felony star makes when it lights. */
  #star(when, level) {
    const osc = this.context.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, when);
    osc.frequency.setValueAtTime(1320, when + 0.06);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.09 * level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(gain); gain.connect(this.sfxBus);
    osc.start(when); osc.stop(when + 0.18);
  }

  /* --- plumbing --------------------------------------------------------- */

  /** Play a licensed file for the current cue. */
  #playTrack(url) {
    if (!this.element) {
      this.element = new Audio();
      this.element.loop = true;
      this.element.crossOrigin = 'anonymous';
      const source = this.context.createMediaElementSource(this.element);
      source.connect(this.musicBus);
    }
    if (this.element.src !== url) this.element.src = url;
    this.element.play().catch(() => { this.element = null; });
  }

  #fade(to, seconds) {
    if (!this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  /** White noise, one second, reused by every percussive voice. */
  #noiseBuffer() {
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, rate, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** A decaying-noise impulse response, which is a cheap convincing room. */
  #impulse(seconds, decay) {
    const rate = this.context.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
      }
    }
    return buffer;
  }
}
