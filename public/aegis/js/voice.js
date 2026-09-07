/**
 * Vera's voice, and being honest about what a browser can and cannot do.
 *
 * The brief was to make her sound like a particular woman. It is worth saying
 * plainly what is achievable, because the alternative is a product that
 * quietly disappoints:
 *
 * - **A browser cannot clone a voice.** `speechSynthesis` offers whatever the
 *   operating system installed. No parameter in it will turn Apple's Samantha
 *   into somebody else, and any claim otherwise is marketing.
 * - **What it can do is get the register and the cadence right**, and that is
 *   most of what people actually hear. The two things that make synthetic
 *   speech sound like a satnav are both fixable here: the default voice on
 *   every platform is the flattest one installed, and a long sentence spoken
 *   as a single utterance has no contour at all. So this module ranks the
 *   installed voices and picks the best rather than the default, and speaks in
 *   clauses with the pitch drifting down across a sentence, lifting on a
 *   question, and slowing and dropping when the news is bad.
 * - **For an exact match there is a bridge.** Paste an ElevenLabs or
 *   OpenAI-compatible key and a voice id into the voice panel and Vera speaks
 *   through that instead, with the synthesised audio played through an
 *   analyser so the hologram's energy is driven by the real waveform rather
 *   than an estimate. That path leaves the device, and the panel says so in
 *   those words. It is off unless somebody turns it on.
 *
 * The prosody is the part worth reading. A line is split at the places a
 * person would breathe, and each clause is given its own rate and pitch from a
 * contour: a declarative sentence falls, a question rises on its last clause,
 * an urgent line is *slower and lower* rather than faster and higher — which
 * is the opposite of the intuition and the reason emergency announcements are
 * intelligible. Between clauses there is a pause proportional to the
 * punctuation. None of this is expensive; all of it is the difference between
 * a voice somebody trusts at three in the morning and one they turn off.
 *
 * @module aegis/voice
 */

import { clamp } from './mathkit.js';

/** Where the operator's voice settings live. */
const STORE = 'aegis.voice.v1';

/**
 * Installed voices worth having, best first, matched against `voice.name`.
 *
 * Ordered for the register the brief asked for: an unhurried, warm, mid-low
 * American woman. The neural and premium voices lead because they are the only
 * ones that carry a contour at all; the compact and eSpeak variants are
 * actively penalised because they are what a caller hears as "a robot".
 */
export const PREFERRED = Object.freeze([
  'samantha', 'ava (premium)', 'ava (enhanced)', 'ava', 'allison', 'joanna',
  'microsoft aria', 'microsoft jenny', 'microsoft michelle', 'google us english',
  'zoe', 'susan', 'nicky', 'serena', 'kendra', 'salli', 'microsoft libby',
  'microsoft sonia', 'google uk english female', 'karen', 'moira', 'tessa',
  'fiona', 'female',
]);

/** The tones a line can be spoken in, and how each bends the contour. */
export const TONES = Object.freeze({
  warm: { rate: 0.96, pitch: 1.02, fall: 0.06, gap: 1.0 },
  calm: { rate: 1.0, pitch: 1.0, fall: 0.05, gap: 0.95 },
  bright: { rate: 1.05, pitch: 1.05, fall: 0.03, gap: 0.85 },
  concerned: { rate: 0.93, pitch: 0.97, fall: 0.07, gap: 1.15 },
  // Slower and lower, not faster and higher. Urgency in a voice that speeds up
  // reads as panic and stops being understood, which is exactly the wrong
  // outcome for the one line in this product that has to land.
  urgent: { rate: 0.88, pitch: 0.94, fall: 0.09, gap: 1.3 },
});

/** The default profile: unhurried, warm, slightly below the platform default. */
export const DEFAULT_PROFILE = Object.freeze({
  voiceURI: '',
  pitch: 0.97,
  rate: 0.94,
  warmth: 0.55,
  pace: 1.0,
  cloud: { provider: '', key: '', voice: '', model: '' },
});

/**
 * Score one installed voice; higher is better.
 *
 * @param {SpeechSynthesisVoice} voice A platform voice.
 * @returns {number} The score, or −1 when it is not English.
 */
export function scoreVoice(voice) {
  const name = (voice.name || '').toLowerCase();
  const lang = (voice.lang || '').toLowerCase();
  if (!lang.startsWith('en')) return -1;
  let score = 0;
  const rank = PREFERRED.findIndex((candidate) => name.includes(candidate));
  if (rank >= 0) score += (PREFERRED.length - rank) * 10;
  if (/premium|enhanced|neural|natural|siri/.test(name)) score += 60;
  if (/compact|eloquence|espeak|novelty|whisper|bells|organ/.test(name)) score -= 120;
  if (lang === 'en-us') score += 12;
  else if (lang === 'en-gb') score += 8;
  if (voice.localService) score += 4;
  return score;
}

/**
 * Rank the installed voices, best first.
 *
 * @param {SpeechSynthesisVoice[]} voices The platform's list.
 * @returns {{voice: SpeechSynthesisVoice, score: number}[]} Ranked, English only.
 */
export function rankVoices(voices) {
  return (voices || [])
    .map((voice) => ({ voice, score: scoreVoice(voice) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Pick the best available voice.
 *
 * @param {SpeechSynthesisVoice[]} voices The platform's list.
 * @returns {SpeechSynthesisVoice|null} The pick, or null when there is none.
 */
export function pickVoice(voices) {
  const ranked = rankVoices(voices);
  return ranked.length ? ranked[0].voice : null;
}

/**
 * Split a line into speakable clauses.
 *
 * The split points are where a person would take breath. Splitting on
 * sentences alone leaves clauses too long to shape; splitting on every comma
 * leaves them too short to sound like anything but a list.
 *
 * @param {string} text The line.
 * @returns {{text: string, end: string}[]} Clauses with the punctuation that
 *   ended each, in order.
 */
export function clauses(text) {
  const source = String(text || '').trim();
  if (!source) return [];
  const out = [];
  const pattern = /[^.!?;:,—]+[.!?;:,—]*/g;
  let buffer = '';
  let ending = '';
  for (const piece of source.match(pattern) || []) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const end = (trimmed.match(/[.!?;:,—]+$/) || [''])[0].slice(-1);
    buffer = buffer ? `${buffer} ${trimmed}` : trimmed;
    ending = end;
    // Short fragments are glued to the next one rather than spoken alone,
    // which is what stops a line with three commas in it sounding like a
    // shopping list.
    if (buffer.replace(/[^\w]/g, '').length < 14 && !/[.!?]/.test(end)) continue;
    out.push({ text: buffer.replace(/[,;:—]+$/, ''), end: ending });
    buffer = '';
    ending = '';
  }
  if (buffer) out.push({ text: buffer.replace(/[,;:—]+$/, ''), end: ending });
  return out;
}

/**
 * Give each clause of a line its own rate, pitch and following pause.
 *
 * @param {string} text The line.
 * @param {string} [tone] One of {@link TONES}.
 * @param {object} [profile] The operator's voice profile.
 * @returns {{text: string, rate: number, pitch: number, pauseMs: number}[]}
 *   The clauses, ready to be spoken in order.
 */
export function contour(text, tone = 'calm', profile = DEFAULT_PROFILE) {
  const shape = TONES[tone] || TONES.calm;
  const parts = clauses(text);
  const warmth = clamp(profile.warmth ?? DEFAULT_PROFILE.warmth, 0, 1);
  const pace = clamp(profile.pace ?? 1, 0.5, 2);
  const question = /\?\s*$/.test(String(text || ''));
  return parts.map((clause, index) => {
    const progress = parts.length > 1 ? index / (parts.length - 1) : 0;
    // Pitch drifts down across a sentence — declination, which every language
    // does and no default speech synthesiser does.
    let pitch = shape.pitch - shape.fall * progress * (0.4 + warmth);
    // …except on the last clause of a question, which lifts.
    if (question && index === parts.length - 1) pitch += 0.10 + 0.06 * warmth;
    // A little variation between clauses, or every sentence has the same tune.
    pitch += (index % 2 ? -1 : 1) * 0.018 * warmth;
    const rate = shape.rate * (1 - 0.05 * warmth * progress);
    const heavy = /[.!?]/.test(clause.end);
    const pauseMs = (heavy ? 300 : 150) * shape.gap * pace;
    return {
      text: clause.text,
      rate: clamp(rate * (profile.rate ?? 1), 0.5, 2),
      pitch: clamp(pitch * (profile.pitch ?? 1), 0.4, 2),
      pauseMs,
    };
  });
}

/**
 * Estimate how long a clause will take to say.
 *
 * Used to drive the hologram when the platform gives no boundary events, which
 * is most of them. Roughly fourteen characters a second at rate 1, which is
 * close enough that a mouth stops moving when a voice does.
 *
 * @param {string} text The clause.
 * @param {number} rate The rate it will be spoken at.
 * @returns {number} Milliseconds.
 */
export function estimateMs(text, rate = 1) {
  return (String(text).length / (14 * clamp(rate, 0.4, 2))) * 1000;
}

/** Cloud voices Vera can be pointed at for an exact match. */
export const CLOUD_PROVIDERS = Object.freeze([
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    hint: 'An ElevenLabs key and the voice id you want. This is the path to an exact match with a specific person’s voice — including one you have cloned yourself, with their permission.',
    model: 'eleven_turbo_v2_5',
  },
  {
    id: 'openai',
    label: 'OpenAI-compatible',
    hint: 'Any OpenAI-compatible speech endpoint. Voice names are the provider’s own — “nova” and “shimmer” are the warm ones.',
    model: 'gpt-4o-mini-tts',
  },
]);

/**
 * Read the stored voice profile.
 *
 * @returns {object} The profile, merged over the defaults.
 */
export function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { ...DEFAULT_PROFILE, ...raw, cloud: { ...DEFAULT_PROFILE.cloud, ...(raw.cloud || {}) } };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

/**
 * Persist a voice profile.
 *
 * @param {object} profile The profile to store.
 * @returns {object} What was stored.
 */
export function saveProfile(profile) {
  const merged = { ...loadProfile(), ...profile };
  try {
    localStorage.setItem(STORE, JSON.stringify(merged));
  } catch {
    // Private browsing. The profile lasts the session and no longer, which is
    // a smaller problem than refusing to speak.
  }
  return merged;
}

/**
 * Build the request for a cloud voice.
 *
 * Separated from the fetch so the shape of the call can be asserted in a test
 * without a key and without a network.
 *
 * @param {object} cloud The cloud settings.
 * @param {string} text What to say.
 * @returns {{url: string, init: RequestInit}|null} The request, or null when
 *   the bridge is not configured.
 */
export function buildCloudRequest(cloud, text) {
  if (!cloud?.provider || !cloud.key || !cloud.voice) return null;
  if (cloud.provider === 'elevenlabs') {
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cloud.voice)}`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': cloud.key },
        body: JSON.stringify({
          text,
          model_id: cloud.model || 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.25 },
        }),
      },
    };
  }
  return {
    url: cloud.endpoint || 'https://api.openai.com/v1/audio/speech',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cloud.key}` },
      body: JSON.stringify({
        model: cloud.model || 'gpt-4o-mini-tts',
        voice: cloud.voice,
        input: text,
        response_format: 'mp3',
      }),
    },
  };
}

/**
 * Vera's mouth.
 *
 * Speaks a line clause by clause with the contour applied, and publishes an
 * energy envelope the hologram uses. Where a cloud voice is configured the
 * envelope comes from an analyser on the real audio; otherwise it is estimated
 * from the clause timings, which is enough for a mouth to stop when a voice
 * stops.
 */
export class Speaker {
  constructor() {
    this.profile = loadProfile();
    this.voice = null;
    this.muted = false;
    this.speaking = false;
    this.amplitude = 0;
    /** @type {((amplitude: number) => void)|null} */
    this.onAmplitude = null;
    /** @type {((text: string) => void)|null} */
    this.onLine = null;
    this.queue = [];
    this.audio = null;
    this.context = null;
    this.analyser = null;
    this.scratch = null;
    this.raf = 0;
    this.envelope = null;
  }

  /** @returns {boolean} Whether this browser can speak at all. */
  static supported() {
    return typeof globalThis.speechSynthesis !== 'undefined';
  }

  /**
   * Choose the voice, from the profile or by ranking.
   *
   * @returns {SpeechSynthesisVoice|null} The chosen voice.
   */
  resolveVoice() {
    if (!Speaker.supported()) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    if (this.profile.voiceURI) {
      const chosen = voices.find((v) => v.voiceURI === this.profile.voiceURI);
      if (chosen) return chosen;
    }
    return pickVoice(voices);
  }

  /**
   * Apply a new profile and keep it.
   *
   * @param {object} patch Fields to change.
   * @returns {object} The stored profile.
   */
  configure(patch) {
    this.profile = saveProfile(patch);
    this.voice = this.resolveVoice();
    return this.profile;
  }

  /**
   * Say something.
   *
   * @param {string} text The line.
   * @param {object} [options] Options.
   * @param {string} [options.tone] One of {@link TONES}.
   * @param {boolean} [options.interrupt] Cut off whatever is being said.
   * @returns {Promise<void>} Resolves when the line has been spoken.
   */
  async say(text, options = {}) {
    const line = String(text || '').trim();
    if (!line || this.muted) return;
    if (options.interrupt) this.stop();
    if (this.onLine) this.onLine(line);
    const cloud = buildCloudRequest(this.profile.cloud, line);
    if (cloud) {
      const ok = await this.sayCloud(cloud);
      if (ok) return;
      // A refused key or a dead network must not leave her mute — the whole
      // point of the local path is that it always works.
    }
    await this.sayLocal(line, options.tone || 'calm');
  }

  /**
   * Speak through the platform's own synthesiser.
   *
   * @param {string} line The line.
   * @param {string} tone The tone.
   * @returns {Promise<void>} Resolves when finished.
   */
  async sayLocal(line, tone) {
    if (!Speaker.supported()) return;
    if (!this.voice) this.voice = this.resolveVoice();
    const parts = contour(line, tone, this.profile);
    this.speaking = true;
    for (const part of parts) {
      if (!this.speaking) break;
      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(part.text);
        if (this.voice) utterance.voice = this.voice;
        utterance.rate = part.rate;
        utterance.pitch = part.pitch;
        utterance.volume = 1;
        const duration = estimateMs(part.text, part.rate);
        this.driveEnvelope(duration);
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        utterance.onend = finish;
        utterance.onerror = finish;
        // Safari drops `onend` if the tab loses focus mid-utterance, and a
        // queue that waits forever for it goes silent for the rest of the
        // session. The estimate is the backstop.
        setTimeout(finish, duration + 2500);
        speechSynthesis.speak(utterance);
      });
      if (part.pauseMs) await new Promise((r) => { setTimeout(r, part.pauseMs); });
    }
    this.speaking = false;
    this.setAmplitude(0);
  }

  /**
   * Speak through a configured cloud voice.
   *
   * @param {{url: string, init: RequestInit}} request The prepared request.
   * @returns {Promise<boolean>} Whether it worked.
   */
  async sayCloud(request) {
    try {
      const response = await fetch(request.url, request.init);
      if (!response.ok) return false;
      const buffer = await response.arrayBuffer();
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!this.context) this.context = new Ctx();
      if (this.context.state === 'suspended') await this.context.resume();
      const decoded = await this.context.decodeAudioData(buffer.slice(0));
      const source = this.context.createBufferSource();
      source.buffer = decoded;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.scratch = new Uint8Array(this.analyser.frequencyBinCount);
      source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.speaking = true;
      this.watchAnalyser();
      await new Promise((resolve) => {
        source.onended = resolve;
        source.start();
        this.audio = source;
      });
      this.speaking = false;
      this.audio = null;
      this.setAmplitude(0);
      return true;
    } catch {
      return false;
    }
  }

  /** Follow the real waveform, for the hologram. */
  watchAnalyser() {
    const step = () => {
      if (!this.speaking || !this.analyser) return;
      this.analyser.getByteTimeDomainData(this.scratch);
      let sum = 0;
      for (const value of this.scratch) {
        const centred = (value - 128) / 128;
        sum += centred * centred;
      }
      this.setAmplitude(clamp(Math.sqrt(sum / this.scratch.length) * 3.2, 0, 1));
      this.raf = requestAnimationFrame(step);
    };
    step();
  }

  /**
   * Fake an energy envelope for the length of a clause.
   *
   * The platform synthesiser hands back no audio, so there is nothing to
   * measure. A syllabic oscillation at four hertz under a smooth attack and
   * release is what speech energy actually looks like, and it is enough to
   * make a hologram look like it is talking rather than flashing.
   *
   * @param {number} durationMs How long the clause will take.
   */
  driveEnvelope(durationMs) {
    if (this.envelope) clearInterval(this.envelope);
    const started = Date.now();
    this.envelope = setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed > durationMs || !this.speaking) {
        clearInterval(this.envelope);
        this.envelope = null;
        this.setAmplitude(0);
        return;
      }
      const progress = elapsed / Math.max(1, durationMs);
      const shell = Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 8 + 0.2);
      const syllables = 0.55 + 0.45 * Math.abs(Math.sin(elapsed / 1000 * Math.PI * 4.2));
      this.setAmplitude(clamp(shell * syllables, 0, 1));
    }, 40);
  }

  /**
   * Publish an amplitude.
   *
   * @param {number} value The amplitude, 0–1.
   */
  setAmplitude(value) {
    this.amplitude = value;
    if (this.onAmplitude) this.onAmplitude(value);
  }

  /** Stop talking immediately. */
  stop() {
    this.speaking = false;
    this.queue = [];
    if (Speaker.supported()) speechSynthesis.cancel();
    if (this.audio) { try { this.audio.stop(); } catch { /* already ended */ } this.audio = null; }
    if (this.envelope) { clearInterval(this.envelope); this.envelope = null; }
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.setAmplitude(0);
  }

  /**
   * Mute or unmute.
   *
   * @param {boolean} muted Whether to be silent.
   */
  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) this.stop();
  }
}

/**
 * Vera's ears.
 *
 * Platform speech recognition, which exists in Safari and Chrome and not in
 * Firefox. The typed box beside the microphone is therefore a first-class
 * path, never a fallback — and in this app it matters twice over, because the
 * one utterance that must always get through is "I'm fine", and a person on a
 * floor cannot be asked to install a different browser.
 */
export class Ears {
  constructor() {
    this.recognition = null;
    this.listening = false;
    this.continuous = false;
    /** @type {((text: string, final: boolean) => void)|null} */
    this.onHeard = null;
    /** @type {((reason: string) => void)|null} */
    this.onStop = null;
  }

  /** @returns {boolean} Whether this browser can listen. */
  static supported() {
    return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  }

  /**
   * Begin listening.
   *
   * @param {object} [options] Options.
   * @param {boolean} [options.continuous] Keep listening between utterances.
   * @returns {boolean} Whether listening started.
   */
  start(options = {}) {
    if (!Ears.supported() || this.listening) return false;
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    this.recognition = new Recognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.continuous = Boolean(options.continuous);
    this.recognition.continuous = this.continuous;
    this.recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (this.onHeard) this.onHeard(result[0].transcript, result.isFinal);
    };
    this.recognition.onerror = (event) => {
      this.listening = false;
      if (this.onStop) this.onStop(event.error || 'error');
    };
    this.recognition.onend = () => {
      this.listening = false;
      // Continuous recognition stops itself on silence on every platform that
      // implements it. Restarting is the only way to keep an ear open, which
      // matters while somebody is being asked whether they are all right.
      if (this.continuous) { try { this.start({ continuous: true }); return; } catch { /* gone */ } }
      if (this.onStop) this.onStop('ended');
    };
    try {
      this.recognition.start();
      this.listening = true;
      return true;
    } catch {
      this.listening = false;
      return false;
    }
  }

  /** Stop listening. */
  stop() {
    this.continuous = false;
    if (this.recognition) { try { this.recognition.stop(); } catch { /* not started */ } }
    this.listening = false;
  }
}
