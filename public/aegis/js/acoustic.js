/**
 * The microphone as a vibration sensor, never as a microphone.
 *
 * A body hitting a floor is a distinctive sound and it happens in rooms a
 * camera has no business being in. So the third channel listens — but the
 * design constraint that shaped every line of this module is that a household
 * will not, and should not, accept an always-on microphone in a bedroom.
 *
 * So it is not one. Audio is reduced, in the same tick it arrives, to four
 * numbers: energy below 500 Hz, energy from 500 Hz to 2 kHz, energy above
 * that, and where the middle of the spectrum sits. The waveform is never
 * copied out of the analyser's own scratch buffer, never concatenated, never
 * written anywhere. There is no code path in this file or any that calls it
 * by which a sound can be stored, replayed or transmitted, and the interface
 * says so in the same words. What survives a frame of audio is a chord of four
 * scalars from which no speech could be recovered by anybody.
 *
 * What those four numbers can tell you is a surprising amount:
 *
 * - **A body impact is dull and sudden.** Sharp onset, energy piled below
 *   500 Hz, decaying in a couple of hundred milliseconds. That is a soft
 *   heavy mass on a hard surface, and almost nothing else in a house does it.
 * - **A dropped object is bright.** A mug, a plate, keys, a walking stick —
 *   the spectral centroid is high and it rings. Loudness does not distinguish
 *   these; the centroid does, easily.
 * - **A television is continuous.** Speech and music hold the mid band up for
 *   seconds at a time, so the onset test — which measures the frame against
 *   the half-second before it — never fires. This is why the detector is
 *   built on contrast rather than on level, and why turning the volume up
 *   does not produce alarms.
 *
 * This channel is never allowed to raise an alarm alone, and the fusion stage
 * enforces that rather than trusting anyone to remember it. A thump is a
 * reason to look at the other two channels, not a reason to telephone a
 * daughter at midnight.
 *
 * @module aegis/acoustic
 */

import { Ring, clamp, ramp } from './mathkit.js';

/** Upper edge of the band a body impact lives in, Hz. */
export const LOW_HZ = 500;

/** Upper edge of the speech band, Hz. */
export const MID_HZ = 2000;

/** How much louder than the recent background an onset must be. */
export const ONSET_RATIO = 7;

/** Spectral centroid above which an impact is something hard, Hz. */
export const BRIGHT_HZ = 1800;

/** The most this channel may ever claim on its own. */
export const SOLO_CEILING = 0.58;

/** Milliseconds of history the detector reasons over. */
const WINDOW_MS = 2500;

/**
 * Reduce a magnitude spectrum to the four numbers this module keeps.
 *
 * @param {Float32Array|Uint8Array|number[]} spectrum Magnitudes per bin.
 * @param {number} sampleRate The audio sample rate, Hz.
 * @returns {{low: number, mid: number, high: number, total: number, centroidHz: number}}
 *   Band energies and the spectral centroid.
 */
export function bands(spectrum, sampleRate) {
  const n = spectrum.length;
  if (!n) return { low: 0, mid: 0, high: 0, total: 0, centroidHz: 0 };
  const nyquist = sampleRate / 2;
  const perBin = nyquist / n;
  let low = 0;
  let mid = 0;
  let high = 0;
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    // Analyser nodes hand back decibels or bytes depending on the call; both
    // are converted to a linear power here so the ratios below mean something.
    const raw = spectrum[i];
    const magnitude = raw < 0 ? 10 ** (raw / 20) : raw / 255;
    const power = magnitude * magnitude;
    const hz = (i + 0.5) * perBin;
    if (hz < LOW_HZ) low += power;
    else if (hz < MID_HZ) mid += power;
    else high += power;
    weighted += power * hz;
    total += power;
  }
  return {
    low,
    mid,
    high,
    total,
    centroidHz: total > 1e-12 ? weighted / total : 0,
  };
}

/**
 * A reading of the acoustic channel.
 *
 * @typedef {object} Acoustic
 * @property {boolean} available Whether there was enough data to say anything.
 * @property {number} likelihood Belief that a body hit the floor, 0–1.
 * @property {boolean} onset Whether a transient was found at all.
 * @property {number} ratio How many times the background the transient was.
 * @property {number} centroidHz Where its energy sat.
 * @property {number} decayMs How long it took to fall back.
 * @property {number} atMs When it happened.
 * @property {boolean} speechLike Whether the room is carrying continuous sound.
 * @property {number} against Positive evidence that the transient was not a
 *   body, 0–1.
 * @property {string[]} reasons Plain-language grounds.
 */

/**
 * Find and score an impact in a window of band readings.
 *
 * @param {{t: number, low: number, mid: number, high: number, total: number, centroidHz: number}[]} frames
 *   Ordered oldest first.
 * @param {object} [options] Options.
 * @param {number} [options.nowMs] Treat this as the present.
 * @returns {Acoustic} The reading.
 */
export function analyseAcoustic(frames, options = {}) {
  const idle = {
    available: false,
    likelihood: 0,
    onset: false,
    ratio: 0,
    centroidHz: 0,
    decayMs: 0,
    atMs: 0,
    speechLike: false,
    against: 0,
    reasons: ['not listening'],
  };
  if (!frames || frames.length < 16) return idle;

  const nowMs = options.nowMs ?? frames[frames.length - 1].t;
  const recent = frames.filter((f) => nowMs - f.t <= WINDOW_MS);
  if (recent.length < 16) return idle;

  // Continuous sound is measured as how often the low band is meaningfully
  // above the window's own floor. A television keeps it up most of the time; a
  // quiet room, almost never.
  const lows = recent.map((f) => f.low);
  const sorted = lows.slice().sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(sorted.length * 0.2)], 1e-9);
  const busy = lows.filter((v) => v > floor * 3).length / lows.length;
  const speechLike = busy > 0.45;

  // The onset: the frame whose low band most exceeds the half second before it.
  let best = null;
  for (let i = 8; i < recent.length; i += 1) {
    const frame = recent[i];
    const priorWindow = recent.filter((f) => f.t < frame.t - 60 && f.t >= frame.t - 560);
    if (priorWindow.length < 4) continue;
    const prior = priorWindow.reduce((a, f) => a + f.low, 0) / priorWindow.length;
    const ratio = frame.low / Math.max(prior, 1e-9);
    if (!best || ratio > best.ratio) best = { index: i, frame, ratio };
  }
  if (!best || best.ratio < ONSET_RATIO) {
    return {
      ...idle,
      available: true,
      speechLike,
      ratio: best ? best.ratio : 0,
      reasons: [speechLike ? 'room carrying continuous sound; no transient' : 'nothing but room tone'],
    };
  }

  // How long it took to come back down to a quarter of the peak.
  const peakLow = best.frame.low;
  let decayMs = 0;
  for (let i = best.index + 1; i < recent.length; i += 1) {
    if (recent[i].low <= peakLow * 0.25) { decayMs = recent[i].t - best.frame.t; break; }
    decayMs = recent[i].t - best.frame.t;
  }

  const reasons = [];
  let against = 0;
  let likelihood = 0.20 + 0.22 * ramp(best.ratio, ONSET_RATIO, 40);
  reasons.push(`transient ${best.ratio.toFixed(0)}× the room, ${Math.round(best.frame.centroidHz)} Hz centroid`);

  if (best.frame.centroidHz < 700) {
    likelihood += 0.26;
    reasons.push('dull and low — consistent with a body, not an object');
  } else if (best.frame.centroidHz > BRIGHT_HZ) {
    likelihood -= 0.24;
    against = 0.3;
    reasons.push('bright and ringing — consistent with something dropped');
  }

  // A body impact is over quickly. A very long tail is a door or a slam
  // travelling through the structure; a very short one is a click.
  if (decayMs >= 90 && decayMs <= 520) {
    likelihood += 0.14;
    reasons.push(`decayed in ${decayMs} ms`);
  } else if (decayMs > 900) {
    likelihood -= 0.14;
    reasons.push(`rang for ${decayMs} ms — structural, not soft`);
  }

  if (speechLike) {
    likelihood -= 0.18;
    reasons.push('room already carrying continuous sound — a transient here is weak evidence');
  }

  const ageSeconds = (nowMs - best.frame.t) / 1000;
  if (ageSeconds > 20) {
    likelihood *= clamp(1 - (ageSeconds - 20) / 40, 0, 1);
    reasons.push(`heard ${ageSeconds.toFixed(0)} s ago`);
  }

  return {
    available: true,
    // Capped hard, and capped *below the level at which the receptionist
    // speaks*. This channel is corroboration, not testimony. It cannot tell a
    // body landing on a floor from a body landing on a sofa — both are dull,
    // low and sudden against a quiet room — so on its own it is allowed to
    // make the system pay attention and nothing more.
    likelihood: clamp(likelihood, 0, SOLO_CEILING),
    onset: true,
    ratio: best.ratio,
    centroidHz: best.frame.centroidHz,
    decayMs,
    atMs: best.frame.t,
    speechLike,
    against,
    reasons,
  };
}

/**
 * Live microphone plumbing.
 *
 * Holds an `AnalyserNode` and a ring of band readings. The only buffer that
 * ever holds audio is the analyser's own scratch array, which is overwritten
 * on every read and never leaves this object.
 */
export class RoomEar {
  /** @param {number} [seconds] How much history to keep. */
  constructor(seconds = 4) {
    this.frames = new Ring(seconds * 30);
    this.context = null;
    this.analyser = null;
    this.stream = null;
    this.scratch = null;
    this.timer = 0;
  }

  /** @returns {boolean} Whether a microphone can be opened at all. */
  static supported() {
    return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia)
      && Boolean(globalThis.AudioContext || globalThis.webkitAudioContext);
  }

  /**
   * Open the microphone and start reducing it to numbers.
   *
   * @returns {Promise<{ok: boolean, reason: string}>} What happened.
   */
  async start() {
    if (!RoomEar.supported()) {
      return { ok: false, reason: 'This browser cannot open a microphone.' };
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Every one of these would fight the detector: gain control moves
          // the floor a transient is measured against, and noise suppression
          // is specifically trained to remove sounds like the one being
          // listened for.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (error) {
      return { ok: false, reason: `The microphone was not available: ${error?.name || 'refused'}.` };
    }
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.context = new Ctx();
    if (this.context.state === 'suspended') await this.context.resume();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);
    this.scratch = new Float32Array(this.analyser.frequencyBinCount);
    this.timer = setInterval(() => this.sample(), 33);
    return { ok: true, reason: 'Listening for impacts. No audio is kept.' };
  }

  /** Take one reading. */
  sample() {
    if (!this.analyser) return;
    this.analyser.getFloatFrequencyData(this.scratch);
    const reading = bands(this.scratch, this.context.sampleRate);
    this.frames.push({ t: performance.now(), ...reading });
  }

  /** Close the microphone and release the stream. */
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.stream) { for (const track of this.stream.getTracks()) track.stop(); this.stream = null; }
    if (this.context) { this.context.close().catch(() => {}); this.context = null; }
    this.analyser = null;
    this.scratch = null;
  }

  /**
   * Analyse everything held.
   *
   * @param {number} [nowMs] Treat this as the present.
   * @returns {Acoustic} The reading.
   */
  read(nowMs) {
    return analyseAcoustic(this.frames.toArray(), { nowMs });
  }
}
