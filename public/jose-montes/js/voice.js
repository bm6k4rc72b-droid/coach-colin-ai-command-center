/**
 * The receptionist's voice and ears.
 *
 * Platform speech synthesis for the concierge's voice and platform speech
 * recognition for the microphone — no cloud service, no key, nothing
 * recorded or uploaded, and on most devices it keeps working offline.
 *
 * Two things make a synthesised voice sound like a person rather than a
 * satnav, and both are done here: choosing the best installed voice instead
 * of the default (which on every platform is the flattest one), and speaking
 * in clauses with the rate and pitch varied slightly per clause, so the line
 * has a contour.
 *
 * Recognition support is uneven — Safari and Chrome yes, Firefox no — so the
 * typed field beside the microphone is a first-class path, never a fallback.
 *
 * @module jose-montes/voice
 */

/**
 * Voices worth using, best first, matched against `voice.name`.
 *
 * The premium and neural voices come first because they are the ones that
 * carry a contour at all; the platform defaults are at the back.
 */
const PREFERRED = [
  'samantha', 'ava (premium)', 'ava', 'allison', 'susan', 'zoe', 'nicky',
  'google us english', 'google uk english female', 'microsoft aria',
  'microsoft jenny', 'microsoft libby', 'microsoft sonia', 'karen', 'moira',
  'tessa', 'serena', 'fiona', 'joanna', 'salli', 'kendra', 'female',
];

/**
 * Score one voice; higher is better.
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
  // Apple marks its best voices; "enhanced" and "premium" are worth having.
  if (/premium|enhanced|neural|natural/.test(name)) score += 60;
  if (/compact|eloquence|espeak/.test(name)) score -= 40;
  if (lang === 'en-us' || lang === 'en-gb') score += 8;
  if (voice.localService) score += 4;
  return score;
}

/**
 * Pick the best available voice.
 *
 * @param {SpeechSynthesisVoice[]} voices The platform's list.
 * @returns {SpeechSynthesisVoice|null} The pick, or null when there is none.
 */
export function pickVoice(voices) {
  let best = null;
  let bestScore = -Infinity;
  for (const voice of voices || []) {
    const score = scoreVoice(voice);
    if (score > bestScore) { best = voice; bestScore = score; }
  }
  return bestScore >= 0 ? best : null;
}

/**
 * Split a line into speakable clauses.
 *
 * Speaking a long sentence as one utterance flattens it; speaking it clause
 * by clause, each with its own slight rate and pitch, gives it a shape. The
 * split points are the ones a person would breathe at.
 *
 * @param {string} text The line.
 * @returns {string[]} Clauses, in order.
 */
export function clauses(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|(?<=[,;:—])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The concierge's voice.
 */
export class Voice {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.enabled = true;
    this.speaking = false;
    this.onStart = null;
    this.onEnd = null;
    if (this.synth) {
      const load = () => { this.voice = pickVoice(this.synth.getVoices()); };
      load();
      // Chrome populates the list asynchronously, and only once.
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  /**
   * Whether this browser can speak.
   *
   * @returns {boolean} Support flag.
   */
  static get supported() {
    return Boolean(window.speechSynthesis);
  }

  /**
   * Speak a line, clause by clause.
   *
   * @param {string} text What to say.
   */
  speak(text) {
    if (!this.synth || !this.enabled || !text) return;
    this.cancel();
    const parts = clauses(text);
    if (!parts.length) return;
    this.speaking = true;
    this.onStart?.();
    parts.forEach((part, i) => {
      const utterance = new SpeechSynthesisUtterance(part);
      if (this.voice) utterance.voice = this.voice;
      // A shallow arc: slightly slower and lower as a line resolves, which is
      // what a person does and what a default utterance never does.
      const position = parts.length === 1 ? 0.5 : i / (parts.length - 1);
      utterance.rate = 0.99 - position * 0.07;
      utterance.pitch = 1.04 - position * 0.09;
      utterance.volume = 1;
      if (i === parts.length - 1) {
        utterance.onend = () => { this.speaking = false; this.onEnd?.(); };
        utterance.onerror = utterance.onend;
      }
      this.synth.speak(utterance);
    });
  }

  /**
   * Stop mid-sentence.
   */
  cancel() {
    if (!this.synth) return;
    this.synth.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.onEnd?.();
    }
  }
}

/**
 * The microphone.
 *
 * Wraps the vendor-prefixed recognition API in something with one event and
 * an honest `supported` flag.
 */
export class Ears {
  /**
   * @param {(text: string, final: boolean) => void} onResult Called with each
   *   transcript, interim ones flagged.
   */
  constructor(onResult) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    this.listening = false;
    this.onResult = onResult;
    this.onState = null;
    if (!this.supported) return;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      this.onResult?.(result[0].transcript, result.isFinal);
    };
    recognition.onend = () => { this.listening = false; this.onState?.(false); };
    recognition.onerror = () => { this.listening = false; this.onState?.(false); };
    this.recognition = recognition;
  }

  /**
   * Start listening. Safe to call twice.
   *
   * @returns {boolean} Whether the microphone is now open.
   */
  start() {
    if (!this.supported || this.listening) return this.listening;
    try {
      this.recognition.start();
      this.listening = true;
      this.onState?.(true);
    } catch {
      this.listening = false;
    }
    return this.listening;
  }

  /**
   * Stop listening.
   */
  stop() {
    if (!this.supported || !this.listening) return;
    try { this.recognition.stop(); } catch { /* already stopped */ }
    this.listening = false;
    this.onState?.(false);
  }

  /**
   * Toggle, and report the new state.
   *
   * @returns {boolean} Whether the microphone is open.
   */
  toggle() {
    if (this.listening) { this.stop(); return false; }
    return this.start();
  }
}
