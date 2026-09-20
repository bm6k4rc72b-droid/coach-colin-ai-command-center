/**
 * A mariachi ensemble, synthesised.
 *
 * No recording is shipped here, because shipping somebody's recording of a
 * mariachi band is shipping their copyright. What this does instead is play the
 * thing: a *son jalisciense* — the brisk 6/8 that mariachi is built on — with
 * the four voices that make the sound recognisable.
 *
 * - **Guitarrón**, the big round-backed bass. Root and fifth, plucked, one
 *   octave apart. It does not strum; it walks.
 * - **Vihuela**, the small high-strung guitar. The *mánico*: short bright chops
 *   on the offbeats, which is what makes the rhythm push rather than sit.
 * - **Trumpets**, two of them, in parallel thirds. This is the single most
 *   identifiable thing about the genre and it is why the melody here is written
 *   as one line and harmonised a diatonic third below rather than as two parts.
 * - **Violins**, sustained underneath, filling the harmony the trumpets leave.
 *
 * The rhythmic signature is the hemiola: the bar alternates between being felt
 * as two groups of three and three groups of two. Play it straight and it stops
 * being a son and becomes a waltz, so {@link barAccents} alternates it.
 *
 * Scheduling uses the look-ahead pattern — a timer that runs often and queues
 * notes a little way into the future against the audio clock, never the wall
 * clock. Timing driven by `setTimeout` alone audibly stumbles the moment the
 * page does anything else, and this console is doing computer vision.
 *
 * @module black-optic-6/mariachi
 */

/** Seconds of music queued ahead of the playhead. */
export const LOOKAHEAD_SEC = 0.25;

/** How often the scheduler wakes, in milliseconds. */
export const TICK_MS = 25;

/** Eighth notes per bar. Six, because this is 6/8. */
export const BEATS_PER_BAR = 6;

/** Seconds per eighth note. Brisk, as the style is played. */
export const BEAT_SEC = 0.17;

/** Semitone offsets of the major scale, used for diatonic harmony. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/**
 * Concert pitch of a MIDI note.
 *
 * @param {number} midi MIDI note number.
 * @returns {number} Frequency in hertz.
 */
export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Move a note by steps of the scale rather than by semitones.
 *
 * Harmonising a trumpet line a fixed three semitones below turns every major
 * third into a minor one and the tune goes sour halfway through the bar. Thirds
 * in this music are diatonic, so the interval has to be counted in scale
 * degrees.
 *
 * @param {number} midi The note.
 * @param {number} steps Scale degrees to move; negative goes down.
 * @param {number} tonic Pitch class of the key, 0–11.
 * @returns {number} The moved note.
 */
export function scaleStep(midi, steps, tonic) {
  const relative = ((midi - tonic) % 12 + 12) % 12;
  const octave = Math.floor((midi - tonic) / 12);
  let degree = MAJOR.indexOf(relative);
  // A note outside the key is harmonised from the degree below it.
  if (degree === -1) degree = MAJOR.filter((value) => value <= relative).length - 1;
  const moved = degree + steps;
  const wrapped = ((moved % 7) + 7) % 7;
  const octaveShift = Math.floor(moved / 7);
  return tonic + (octave + octaveShift) * 12 + MAJOR[wrapped];
}

/** The key. D major sits well for trumpets and keeps the guitarrón off the floor. */
export const TONIC = 2;

/**
 * The chords, one per bar. A plain ranchera turn: tonic, dominant, subdominant.
 */
export const PROGRESSION = Object.freeze([
  { name: 'D', root: 50, tones: [50, 54, 57] },
  { name: 'A', root: 45, tones: [45, 49, 52] },
  { name: 'A', root: 45, tones: [45, 49, 52] },
  { name: 'D', root: 50, tones: [50, 54, 57] },
  { name: 'G', root: 43, tones: [43, 47, 50] },
  { name: 'D', root: 50, tones: [50, 54, 57] },
  { name: 'A', root: 45, tones: [45, 49, 52] },
  { name: 'D', root: 50, tones: [50, 54, 57] },
]);

/**
 * The trumpet melody, as [bar, beat, midi, beats].
 *
 * Two four-bar phrases: one that climbs the tonic triad and sits on the fifth,
 * one that answers it over the dominant and falls home. Bars three and seven are
 * left empty on purpose — mariachi trumpets breathe, and a line that never stops
 * stops sounding like trumpets.
 */
export const MELODY = Object.freeze([
  [0, 0, 69, 1], [0, 1, 74, 1], [0, 2, 78, 1], [0, 3, 81, 3],
  [1, 0, 78, 1], [1, 1, 76, 1], [1, 2, 74, 2], [1, 4, 73, 2],
  [2, 0, 76, 1], [2, 1, 73, 1], [2, 2, 69, 3],
  [4, 0, 71, 1], [4, 1, 74, 1], [4, 2, 79, 3],
  [5, 0, 78, 1], [5, 1, 74, 1], [5, 2, 71, 2], [5, 4, 74, 2],
  [6, 0, 73, 1], [6, 1, 76, 1], [6, 2, 73, 1], [6, 3, 69, 3],
  [7, 0, 74, 4],
]);

/**
 * Which eighths carry the accent in a bar.
 *
 * The hemiola: odd bars are felt as two groups of three, even bars as three
 * groups of two. Alternating them is the difference between a son and a waltz.
 *
 * @param {number} bar Bar number from the top of the tune.
 * @returns {number[]} Accented eighths, zero-indexed.
 */
export function barAccents(bar) {
  return bar % 2 === 0 ? [0, 3] : [0, 2, 4];
}

/**
 * Everything that sounds in one bar.
 *
 * Pure, so the arrangement can be checked without an audio device: every event
 * is a voice, a time in beats, a pitch and a length.
 *
 * @param {number} bar Bar number from the top of the tune.
 * @returns {Array<{voice: string, beat: number, midi: number, beats: number, gain: number}>}
 *   The bar's events, in time order.
 */
export function barPlan(bar) {
  const chord = PROGRESSION[bar % PROGRESSION.length];
  const accents = barAccents(bar);
  const events = [];

  // Guitarrón: root and fifth an octave apart, on the accents.
  accents.forEach((beat, i) => {
    const midi = i % 2 === 0 ? chord.root : chord.tones[2];
    events.push({ voice: 'guitarron', beat, midi: midi - 12, beats: 1, gain: 1 });
    events.push({ voice: 'guitarron', beat, midi, beats: 1, gain: 0.5 });
  });

  // Vihuela: the mánico, on the beats the guitarrón leaves alone.
  for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
    if (accents.includes(beat)) continue;
    for (const tone of chord.tones) {
      events.push({ voice: 'vihuela', beat, midi: tone + 24, beats: 0.5, gain: 0.55 });
    }
  }

  // Violins: the chord, held under everything.
  for (const tone of chord.tones) {
    events.push({ voice: 'violin', beat: 0, midi: tone + 12, beats: BEATS_PER_BAR, gain: 0.32 });
  }

  // Trumpets: the melody, and the same melody a diatonic third below it.
  for (const [melodyBar, beat, midi, beats] of MELODY) {
    if (melodyBar !== bar % PROGRESSION.length) continue;
    events.push({ voice: 'trumpet', beat, midi, beats, gain: 1 });
    events.push({ voice: 'trumpet', beat, midi: scaleStep(midi, -2, TONIC), beats, gain: 0.7 });
  }

  return events.sort((a, b) => a.beat - b.beat);
}

/**
 * The ensemble.
 *
 * Owns the audio graph and the scheduler. Everything it plays is generated at
 * the moment it sounds — there is no audio file anywhere in this console.
 */
export class Mariachi {
  /**
   * @param {object} [options] Settings.
   * @param {number} [options.volume=0.5] Overall level, 0..1.
   */
  constructor(options = {}) {
    this.volume = options.volume ?? 0.5;
    this.context = null;
    this.master = null;
    this.timer = null;
    this.bar = 0;
    this.nextNoteTime = 0;
    this.playing = false;
  }

  /** @returns {boolean} Whether this browser can synthesise anything. */
  static supported() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext ?? window.webkitAudioContext);
  }

  /**
   * Start playing.
   *
   * Must be called from a user gesture — browsers will not let a page make noise
   * on its own, which is a rule worth having.
   *
   * @returns {Promise<void>} Resolves once sound is flowing.
   */
  async start() {
    if (this.playing || !Mariachi.supported()) return;
    // Set synchronously, before the first await. Callers read this immediately
    // after calling — a flag set only after `resume()` resolves leaves the
    // interface showing "off" while the band is already playing, and lets a
    // second click start a second ensemble on top of the first.
    this.playing = true;
    const context = new (window.AudioContext ?? window.webkitAudioContext)();
    this.context = context;
    await context.resume();
    if (!this.playing || this.context !== context) {
      // Stopped, or restarted, while this context was still opening. The local
      // reference is what gets closed — `this.context` may already belong to
      // someone else, and closing that would silence the wrong ensemble.
      await context.close().catch(() => {});
      if (this.context === context) this.context = null;
      return;
    }

    this.master = this.context.createGain();
    this.master.gain.value = 0;
    // A gentle roll-off: raw synthesised brass is harsh at the top and this is
    // meant to sit behind a console, not in front of it.
    const shelf = this.context.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4200;
    shelf.gain.value = -8;
    this.master.connect(shelf).connect(this.context.destination);
    this.master.gain.linearRampToValueAtTime(this.volume * 0.5, this.context.currentTime + 1.2);

    this.bar = 0;
    this.nextNoteTime = this.context.currentTime + 0.1;
    this.timer = setInterval(() => this.#schedule(), TICK_MS);
  }

  /**
   * Stop playing, fading out rather than cutting.
   *
   * @returns {void}
   */
  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    const master = this.master;
    if (master && context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(master.gain.value, context.currentTime);
      master.gain.linearRampToValueAtTime(0, context.currentTime + 0.4);
      setTimeout(() => context.close().catch(() => {}), 600);
    }
    this.context = null;
    this.master = null;
  }

  /**
   * Set the level.
   *
   * @param {number} volume 0..1.
   * @returns {void}
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context) {
      this.master.gain.linearRampToValueAtTime(this.volume * 0.5, this.context.currentTime + 0.15);
    }
  }

  /**
   * Queue whatever falls inside the look-ahead window.
   *
   * @returns {void}
   */
  #schedule() {
    if (!this.playing || !this.context) return;
    while (this.nextNoteTime < this.context.currentTime + LOOKAHEAD_SEC) {
      const barStart = this.nextNoteTime;
      for (const event of barPlan(this.bar)) {
        this.#play(event, barStart + event.beat * BEAT_SEC);
      }
      this.nextNoteTime += BEATS_PER_BAR * BEAT_SEC;
      this.bar += 1;
    }
  }

  /**
   * Sound one event.
   *
   * @param {object} event The event from {@link barPlan}.
   * @param {number} at Audio-clock time to start it.
   * @returns {void}
   */
  #play(event, at) {
    const ctx = this.context;
    if (!ctx) return;
    const seconds = event.beats * BEAT_SEC;
    const hz = midiToHz(event.midi);
    const gain = ctx.createGain();
    gain.connect(this.master);

    if (event.voice === 'trumpet') {
      // Brass: a sawtooth opened by a filter sweep, which is what gives the
      // attack its bite, plus vibrato once the note has settled.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 6;
      filter.frequency.setValueAtTime(hz * 1.4, at);
      filter.frequency.linearRampToValueAtTime(hz * 5, at + 0.05);
      filter.frequency.linearRampToValueAtTime(hz * 3, at + seconds);

      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5.5;
      const vibratoDepth = ctx.createGain();
      vibratoDepth.gain.setValueAtTime(0, at);
      vibratoDepth.gain.linearRampToValueAtTime(hz * 0.008, at + Math.min(0.25, seconds));
      vibrato.connect(vibratoDepth).connect(osc.frequency);

      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.22 * event.gain, at + 0.03);
      gain.gain.setValueAtTime(0.22 * event.gain, at + seconds * 0.8);
      gain.gain.linearRampToValueAtTime(0, at + seconds);
      osc.connect(filter).connect(gain);
      osc.start(at);
      osc.stop(at + seconds + 0.05);
      vibrato.start(at);
      vibrato.stop(at + seconds + 0.05);
      return;
    }

    if (event.voice === 'guitarron') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz * 1.01, at);
      osc.frequency.exponentialRampToValueAtTime(hz, at + 0.04);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.5 * event.gain, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(filter).connect(gain);
      osc.start(at);
      osc.stop(at + 0.5);
      return;
    }

    if (event.voice === 'vihuela') {
      // The chop: a very short filtered burst, bright and immediately gone.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = hz * 2.2;
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.1 * event.gain, at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(filter).connect(gain);
      osc.start(at);
      osc.stop(at + 0.16);
      return;
    }

    // Violins: a small detuned stack, bowed in rather than struck.
    for (const detune of [-6, 0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      osc.connect(filter).connect(gain);
      osc.start(at);
      osc.stop(at + seconds + 0.1);
    }
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.05 * event.gain, at + 0.18);
    gain.gain.setValueAtTime(0.05 * event.gain, at + seconds * 0.7);
    gain.gain.linearRampToValueAtTime(0, at + seconds);
  }
}
