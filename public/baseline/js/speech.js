/**
 * The coach's voice, and its ears.
 *
 * Both are the platform's own: `speechSynthesis` for output, and the webkit
 * speech recognition prefix for input where it exists. Neither is a dependency
 * and neither is required — the app is fully usable in silence, which matters
 * because the recognizer is absent on iOS in a web page and unreliable
 * everywhere without a network.
 *
 * @module baseline/speech
 */

/** Speaks the coach's lines, one clause at a time. */
export class Voice {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.primed = false;
  }

  /** @returns {boolean} Whether this browser can speak at all. */
  static supported() {
    return typeof globalThis.speechSynthesis !== 'undefined'
      && typeof globalThis.SpeechSynthesisUtterance === 'function';
  }

  /**
   * Choose the best installed voice.
   *
   * Voice lists arrive asynchronously on most browsers and synchronously on
   * some, so this is safe to call repeatedly and cheap when it has already run.
   *
   * @returns {SpeechSynthesisVoice|null} The chosen voice.
   */
  pickVoice() {
    if (!Voice.supported()) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    // Prefer the higher-quality local voices the platforms ship under known
    // names, then any local English voice, then whatever is left.
    const preferred = [
      /Samantha/i, /Ava/i, /Serena/i, /Daniel/i, /Google UK English/i,
      /Google US English/i, /Microsoft (Aria|Guy|Libby)/i,
    ];
    for (const pattern of preferred) {
      const hit = voices.find((voice) => pattern.test(voice.name) && /^en/i.test(voice.lang));
      if (hit) {
        this.voice = hit;
        return hit;
      }
    }
    this.voice = voices.find((voice) => voice.localService && /^en/i.test(voice.lang))
      || voices.find((voice) => /^en/i.test(voice.lang))
      || voices[0];
    return this.voice;
  }

  /**
   * Speak a line.
   *
   * The text is split on sentence boundaries and queued as separate
   * utterances, which gives the delivery a contour instead of a single flat
   * run-on, and lets `stop` interrupt between clauses rather than mid-word.
   *
   * @param {string} text What to say.
   * @param {object} [options] Delivery options.
   * @param {number} [options.rate=1] Speaking rate.
   * @returns {boolean} Whether anything was queued.
   */
  say(text, options = {}) {
    if (!this.enabled || !Voice.supported() || !text) return false;
    this.stop();
    if (!this.voice) this.pickVoice();
    const clauses = String(text)
      .split(/(?<=[.!?])\s+/)
      .map((clause) => clause.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      const utterance = new SpeechSynthesisUtterance(clause);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = options.rate ?? 1;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    }
    return true;
  }

  /** Stop speaking immediately. */
  stop() {
    if (Voice.supported()) speechSynthesis.cancel();
  }
}

/** Listens for a spoken question, where the platform allows it. */
export class Ears {
  constructor() {
    this.recognition = null;
    this.listening = false;
  }

  /** @returns {boolean} Whether speech recognition exists here. */
  static supported() {
    return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  }

  /**
   * Listen for one question.
   *
   * @param {object} handlers Callbacks.
   * @param {(text: string) => void} handlers.onResult Final transcript.
   * @param {(text: string) => void} [handlers.onPartial] Interim transcript.
   * @param {(error: string) => void} [handlers.onError] Failure reason.
   * @param {() => void} [handlers.onEnd] Called when listening stops.
   * @returns {boolean} Whether listening started.
   */
  listen(handlers) {
    if (!Ears.supported() || this.listening) return false;
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript.trim();
      if (result.isFinal) handlers.onResult?.(text);
      else handlers.onPartial?.(text);
    };
    recognition.onerror = (event) => handlers.onError?.(event.error || 'unknown');
    recognition.onend = () => {
      this.listening = false;
      this.recognition = null;
      handlers.onEnd?.();
    };

    try {
      recognition.start();
    } catch {
      return false;
    }
    this.recognition = recognition;
    this.listening = true;
    return true;
  }

  /** Stop listening. */
  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* Already stopped; the end handler has run or is about to. */
      }
    }
    this.listening = false;
  }
}
