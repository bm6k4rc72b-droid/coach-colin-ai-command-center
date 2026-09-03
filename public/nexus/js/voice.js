/**
 * The voice receptionist.
 *
 * Speech synthesis for Aether's voice, speech recognition for hands-free
 * control, and a small command grammar in between. Everything uses the
 * platform APIs — no cloud speech service, no key, nothing recorded — which
 * means it also works offline on most devices.
 *
 * Recognition support is uneven (Safari and Chrome yes, Firefox no), so the
 * console always keeps the typed input as an equal path rather than a
 * fallback.
 *
 * @module nexus/voice
 */

/** Voice names that are female in the major platform voice sets. */
const FEMALE_HINTS = [
  'samantha', 'karen', 'moira', 'tessa', 'fiona', 'serena', 'ava', 'allison',
  'susan', 'zira', 'hazel', 'linda', 'catherine', 'joanna', 'salli', 'kendra',
  'google uk english female', 'google us english', 'female', 'aria', 'jenny',
  'sonia', 'libby', 'natasha', 'clara', 'amelie', 'nora', 'siri female',
];

/**
 * Parse a spoken or typed utterance into a console command.
 *
 * Kept pure and separate from the speech plumbing so the grammar can be
 * tested without a browser.
 *
 * @param {string} utterance What the visitor said.
 * @returns {{ intent: string, arg?: string, raw: string }} The parsed command.
 */
export function parseCommand(utterance) {
  const raw = String(utterance || '').trim();
  const text = raw.toLowerCase().replace(/[.,!?]+$/, '');
  if (!text) return { intent: 'none', raw };

  const wake = /^(aether|either|ether|nexus|hey aether|ok aether)[\s,]*/i;
  const body = text.replace(wake, '').trim() || text;

  // Ranges are addressed by name. A bare mention ("what is phishing?") is a
  // question, so a range only opens when the utterance also carries an action
  // verb or the word range/lab/drill.
  const ACTION = /^(open|run|start|show(?: me)?|go to|take me to|begin|launch|enter|load|do|scan|check|analy[sz]e|use)\b/;
  const LAB_KEYS = [
    [/phish|quish/, 'phishing'],
    [/password|passphrase|forge|credential/, 'passwords'],
    [/crypto|cipher|hash|encrypt|caesar|vigen/, 'crypto'],
    [/injection|inject|jailbreak/, 'injection'],
    [/loop builder|agent loop|build.*loop/, 'agentloop'],
    [/scanner|qr|barcode|scan a code|scan this/, 'scanner'],
  ];
  if (ACTION.test(body) || /\b(labs?|ranges?|drills?|triage|exercises?)\b/.test(body)) {
    for (const [pattern, id] of LAB_KEYS) {
      if (pattern.test(body)) return { intent: 'lab', arg: id, raw };
    }
  }

  const rules = [
    [/^(stop|quiet|silence|shut up|be quiet|cancel)$/, () => ({ intent: 'stop' })],
    [/^(repeat|say (that )?again|what did you say)/, () => ({ intent: 'repeat' })],
    [/\b(mute|unmute)\b/, (m) => ({ intent: 'mute', arg: m[1] })],
    [/\b(show|display|switch to)\b.*\b(earth|globe|planet|world map)\b|\bglobe mode\b/, () => ({ intent: 'view', arg: 'globe' })],
    [/\b(show|display|switch to|come back)\b.*\b(yourself|hologram|avatar|receptionist)\b/, () => ({ intent: 'view', arg: 'avatar' })],
    [/\b(open|show|go to|take me to|return to)\b.*\b(home|lobby|reception|atrium)\b/, () => ({ intent: 'deck', arg: 'atrium' })],
    [/\b(open|show|go to|start|begin|resume)\b.*\b(academy|lessons?|courses?|curriculum|syllabus|class(es)?|studies)\b/, () => ({ intent: 'deck', arg: 'academy' })],
    [/\b(open|show|go to|run|start|launch)\b.*\b(labs?|drills?|exercises?|ranges?|practice|training)\b/, () => ({ intent: 'deck', arg: 'labs' })],
    [/\b(open|show|go to|check)\b.*\b(feeds?|trackers?|live|operations|ops|globe|maps?|world)\b/, () => ({ intent: 'deck', arg: 'ops' })],
    [/\b(open|show|start|activate|turn on)\b.*\b(camera|lens|scanner|vision)\b/, () => ({ intent: 'deck', arg: 'lens' })],
    [/\b(open|show|go to|run|start|launch)\b.*\b(agents?|swarm|orchestrat)/, () => ({ intent: 'deck', arg: 'swarm' })],
    [/\b(open|show|go to)\b.*\b(settings?|preferences|options|config)\b/, () => ({ intent: 'deck', arg: 'settings' })],
    [/\b(open|show|go to|teach me|start)\b.*\b(cyber|cybersecurity|security|defence|defense|hacking)\b/, () => ({ intent: 'track', arg: 'cyber' })],
    [/\b(open|show|go to|teach me|start)\b.*\b(agents?)\b/, () => ({ intent: 'track', arg: 'agents' })],
    [/\b(open|show|go to|teach me|start)\b.*\b(apps?|building|build|products?|craft)\b/, () => ({ intent: 'track', arg: 'appcraft' })],
    [/\b(next|continue|carry on|go on)\b/, () => ({ intent: 'next' })],
    [/\b(back|previous|go back)\b/, () => ({ intent: 'back' })],
    [/\b(refresh|update|reload)\b.*\b(feed|data|tracker)\b/, () => ({ intent: 'refresh' })],
    [/\b(status|report|sitrep|situation|brief me|briefing)\b/, () => ({ intent: 'status' })],
    [/\b(my )?(progress|rank|score|clearance|xp)\b/, () => ({ intent: 'progress' })],
    [/\b(what can you do|help|options|commands)\b/, () => ({ intent: 'help' })],
  ];

  for (const [pattern, build] of rules) {
    const match = body.match(pattern);
    if (match) return { ...build(match), raw };
  }
  return { intent: 'ask', arg: raw, raw };
}

/**
 * Speech synthesis and recognition for the receptionist.
 */
export class Receptionist {
  /**
   * @param {{ onAmplitude?: (n: number) => void, onTranscript?: (text: string, final: boolean) => void,
   *   onStateChange?: (state: object) => void }} handlers Callbacks.
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.muted = false;
    this.listening = false;
    this.lastSpoken = '';
    this.queue = [];
    this.speaking = false;
    this.recognition = this.#createRecognition();
    this.#pickVoice();
    if (this.synth) this.synth.addEventListener?.('voiceschanged', () => this.#pickVoice());
  }

  /**
   * Whether the platform can synthesise speech.
   *
   * @returns {boolean} Support flag.
   */
  get canSpeak() {
    return Boolean(this.synth);
  }

  /**
   * Whether the platform can recognise speech.
   *
   * @returns {boolean} Support flag.
   */
  get canListen() {
    return Boolean(this.recognition);
  }

  /**
   * Choose the most convincing available female voice for the interface
   * language, falling back to the platform default.
   */
  #pickVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices.length) return;
    const lang = (navigator.language || 'en-GB').toLowerCase();
    const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    const pool = langMatches.length ? langMatches : voices;
    const scored = pool.map((v) => {
      const name = v.name.toLowerCase();
      let score = 0;
      for (const hint of FEMALE_HINTS) if (name.includes(hint)) score += 10;
      if (v.lang.toLowerCase() === lang) score += 4;
      if (name.includes('premium') || name.includes('enhanced') || name.includes('natural')) score += 6;
      if (name.includes('compact') || name.includes('eloquence')) score -= 4;
      return { voice: v, score };
    }).sort((a, b) => b.score - a.score);
    this.voice = scored[0]?.voice || pool[0];
    this.handlers.onStateChange?.({ voice: this.voice?.name });
  }

  /**
   * List the available voices, best first, so the operator can override.
   *
   * @returns {SpeechSynthesisVoice[]} Voices.
   */
  voices() {
    return this.synth ? this.synth.getVoices() : [];
  }

  /**
   * Force a specific voice by name.
   *
   * @param {string} name Voice name.
   */
  setVoice(name) {
    const found = this.voices().find((v) => v.name === name);
    if (found) this.voice = found;
  }

  /**
   * Speak a line. Long answers are split at sentence boundaries so the
   * hologram's mouth-level animation tracks, and so `stop` is responsive.
   *
   * @param {string} text What to say.
   * @param {{ interrupt?: boolean }} [options] Behaviour.
   */
  speak(text, options = {}) {
    this.lastSpoken = text;
    if (!this.synth || this.muted) return;
    if (options.interrupt !== false) this.synth.cancel();
    // Strip the markup and list bullets that read badly aloud.
    const spoken = String(text)
      .replace(/```[\s\S]*?```/g, ' — see the code on screen — ')
      .replace(/[•*_`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!spoken) return;
    const chunks = spoken.match(/[^.!?]+[.!?]*/g) || [spoken];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const utterance = new SpeechSynthesisUtterance(chunk.trim());
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 0.99;
      utterance.pitch = 1.06;
      utterance.volume = 1;
      utterance.onstart = () => {
        this.speaking = true;
        this.handlers.onStateChange?.({ speaking: true });
      };
      // Word boundaries are the only signal the platform gives about
      // progress, so the hologram's energy is driven from them.
      utterance.onboundary = () => this.handlers.onAmplitude?.(0.55 + Math.random() * 0.45);
      utterance.onend = () => {
        this.speaking = this.synth.speaking;
        if (!this.synth.pending && !this.synth.speaking) {
          this.handlers.onStateChange?.({ speaking: false });
        }
      };
      this.synth.speak(utterance);
    }
  }

  /** Stop speaking immediately. */
  stop() {
    this.synth?.cancel();
    this.speaking = false;
    this.handlers.onStateChange?.({ speaking: false });
  }

  /** Repeat the last line. */
  repeat() {
    if (this.lastSpoken) this.speak(this.lastSpoken);
  }

  /**
   * Toggle or set mute.
   *
   * @param {boolean} [value] Explicit value.
   * @returns {boolean} The new mute state.
   */
  setMuted(value) {
    this.muted = value === undefined ? !this.muted : Boolean(value);
    if (this.muted) this.stop();
    this.handlers.onStateChange?.({ muted: this.muted });
    return this.muted;
  }

  /**
   * Build a recognition object if the platform has one.
   *
   * @returns {SpeechRecognition|null} Recogniser.
   */
  #createRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-GB';
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) this.handlers.onTranscript?.(interim, false);
      if (final) this.handlers.onTranscript?.(final.trim(), true);
    };
    recognition.onerror = (event) => {
      this.listening = false;
      this.handlers.onStateChange?.({ listening: false, error: event.error });
    };
    recognition.onend = () => {
      this.listening = false;
      this.handlers.onStateChange?.({ listening: false });
    };
    return recognition;
  }

  /**
   * Start listening for one utterance. Speech output is cancelled first so
   * the microphone does not hear the hologram.
   *
   * @returns {Promise<boolean>} Whether listening started.
   */
  async listen() {
    if (!this.recognition || this.listening) return false;
    this.stop();
    try {
      this.recognition.start();
      this.listening = true;
      this.handlers.onStateChange?.({ listening: true });
      await this.#startMeter();
      return true;
    } catch {
      this.listening = false;
      return false;
    }
  }

  /** Stop listening. */
  stopListening() {
    if (this.recognition && this.listening) {
      try { this.recognition.stop(); } catch { /* already stopping */ }
    }
    this.listening = false;
    this.#stopMeter();
  }

  /**
   * Drive the hologram from the real microphone level while listening, so
   * the figure reacts to the visitor as well as to itself.
   *
   * @returns {Promise<void>} Resolves once metering is running or refused.
   */
  async #startMeter() {
    if (this.meter || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.meter) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / data.length) / 40;
        this.handlers.onAmplitude?.(Math.min(1, rms));
        requestAnimationFrame(tick);
      };
      this.meter = { stream, context };
      tick();
    } catch {
      // Microphone refused: recognition may still work on some platforms,
      // and the hologram simply will not react to input level.
    }
  }

  /** Tear down the microphone meter. */
  #stopMeter() {
    if (!this.meter) return;
    for (const track of this.meter.stream.getTracks()) track.stop();
    this.meter.context.close().catch(() => {});
    this.meter = null;
  }
}
