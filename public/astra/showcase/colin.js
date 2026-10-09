/**
 * Colin — the chamber's holographic receptionist.
 *
 * He speaks with the device's British English male voice where one exists
 * (Daniel and Arthur on Apple devices, "Google UK English Male" in Chrome,
 * Ryan, George or Thomas on Windows) and listens through the browser's speech
 * recognition where it is offered. Everything runs on the device: no audio,
 * transcript or question leaves the browser.
 *
 * His manner is dry, polite and a little self-deprecating. His content is
 * not: answers come from ASTRA's graded corpus through the same local
 * concierge the main platform uses, and he will not discuss doses, protocols
 * or what anyone personally should take.
 *
 * @module astra/showcase/colin
 */

import { composeLocalAnswer } from '../js/astra.js';
import { STATIONS, SUBJECTS } from './sections.js';

/* ------------------------------------------------------------------ voice */

const MALE_GB = /daniel|arthur|oliver|george|ryan|thomas|harry|brian|uk english male|male/i;
const FEMALE = /female|kate|serena|stephanie|martha|libby|sonia|susan|hazel|emily|fiona|moira|tessa|karen|samantha/i;

/**
 * Rank the device's voices for "British, male": en-GB with a known male name
 * first, then any en-GB voice not known to be female, then any English voice.
 *
 * @param {SpeechSynthesisVoice[]} voices Available voices.
 * @returns {SpeechSynthesisVoice[]} Candidates, best first.
 */
export function rankVoices(voices) {
  const score = (v) => {
    const gb = /en[-_]GB/i.test(v.lang);
    const en = /^en/i.test(v.lang);
    const male = MALE_GB.test(v.name);
    const female = FEMALE.test(v.name);
    return (gb ? 100 : en ? 20 : 0) + (male ? 50 : 0) - (female ? 60 : 0) + (v.localService ? 2 : 0);
  };
  return voices.filter((v) => /^en/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}

/** Text-to-speech with a level signal for the hologram's voice rings. */
export class Voice {
  constructor({ onLevel } = {}) {
    this.synth = window.speechSynthesis || null;
    this.enabled = Boolean(this.synth);
    this.voice = null;
    this.voices = [];
    this.onLevel = onLevel || (() => {});
    this.level = 0;
    this.speaking = false;
    if (this.synth) {
      const load = () => {
        this.voices = rankVoices(this.synth.getVoices());
        if (!this.voice || !this.voices.includes(this.voice)) this.voice = this.voices[0] || null;
      };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  /** Whether the chosen voice is known to be male, so pitch can be left alone. */
  get knownMale() {
    return Boolean(this.voice && MALE_GB.test(this.voice.name) && !FEMALE.test(this.voice.name));
  }

  /**
   * Speak, cancelling anything already queued.
   *
   * @param {string} text What to say.
   * @returns {Promise<void>} Resolves when he stops.
   */
  say(text) {
    if (!this.synth || !this.enabled || !text) return Promise.resolve();
    this.synth.cancel();
    const token = (this.token = (this.token || 0) + 1);
    // Speak sentence-sized chunks: long utterances stall in some engines
    // (Chrome cuts off after roughly fifteen seconds), short ones never do.
    const sentences = String(text).replace(/[“”]/g, '"').replace(/·/g, ',').match(/[^.!?]+[.!?]*\s*/g) || [String(text)];
    const chunks = [];
    for (const sentence of sentences) {
      if (chunks.length && (chunks[chunks.length - 1] + sentence).length < 180) chunks[chunks.length - 1] += sentence;
      else chunks.push(sentence);
    }
    return new Promise((resolve) => {
      let remaining = chunks.length;
      const finish = () => { if (this.token === token) this.speaking = false; resolve(); };
      // A safety net, so a silent or stalled engine never hangs the tour.
      const timer = setTimeout(finish, 1500 + String(text).length * 75);
      for (const chunk of chunks) {
        const utterance = new SpeechSynthesisUtterance(chunk.trim());
        if (this.voice) utterance.voice = this.voice;
        utterance.lang = this.voice?.lang || 'en-GB';
        // An unknown-gender British voice is nudged lower; a known male one is left alone.
        utterance.pitch = this.knownMale ? 0.95 : 0.78;
        utterance.rate = 0.98;
        utterance.onstart = () => { this.speaking = true; this.level = 0.8; };
        utterance.onboundary = () => { this.level = 1; };
        const done = () => {
          remaining -= 1;
          if (remaining <= 0) { clearTimeout(timer); finish(); }
        };
        utterance.onend = done;
        utterance.onerror = done;
        this.synth.speak(utterance);
      }
    });
  }

  stop() {
    this.token = (this.token || 0) + 1;
    this.synth?.cancel();
    this.speaking = false;
  }

  /** Per-frame: decay the level and report it (word boundaries spike it). */
  tick(dt) {
    const floor = this.speaking ? 0.35 + 0.15 * Math.sin(performance.now() / 90) : 0;
    this.level = Math.max(floor, this.level - dt * 3.5);
    this.onLevel(this.level);
  }
}

/** Speech-to-text, where the browser offers it. */
export class Ears {
  constructor() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    this.Recognition = Recognition;
    this.active = null;
  }

  /**
   * Listen for one utterance.
   *
   * @returns {Promise<string>} The transcript ('' if nothing was heard).
   */
  listen() {
    if (!this.supported) return Promise.resolve('');
    this.stop();
    return new Promise((resolve) => {
      const rec = new this.Recognition();
      rec.lang = 'en-GB';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let heard = '';
      rec.onresult = (event) => { heard = event.results[0]?.[0]?.transcript || ''; };
      rec.onerror = () => resolve('');
      rec.onend = () => { this.active = null; resolve(heard); };
      this.active = rec;
      try { rec.start(); } catch (error) { resolve(''); }
    });
  }

  stop() {
    try { this.active?.stop(); } catch (error) { /* already stopped */ }
    this.active = null;
  }
}

/* -------------------------------------------------------------- manners */

/** Openers and sign-offs, picked in rotation so he never repeats himself twice running. */
const ASIDES = {
  thinking: ['Right then.', 'Let me have a look.', 'Splendid question.', 'Ah. Good one.', 'One moment, I’m consulting the archive. It’s very dusty.'],
  closing: ['Do mind the hologram on your way out.', 'Tea’s not included, I’m afraid.', 'Any other questions, I’m right here. I can’t really leave.', 'Hope that helps. If not, the archive is to your left.'],
  unknown: [
    'I’m afraid that’s beyond my pay grade, and I’m paid in electricity.',
    'Not one for me, sadly. Try asking about a compound, a claim, or a station.',
  ],
};

const counters = new Map();
function pick(kind) {
  const list = ASIDES[kind];
  const i = (counters.get(kind) || 0) % list.length;
  counters.set(kind, i + 1);
  return list[i];
}

/** Questions he answers himself, before the corpus is consulted. */
const PERSONAL = [
  {
    match: /\b(who|what) are you\b|\byour name\b|\bintroduce yourself\b/i,
    reply: 'I’m Colin, receptionist at COLIN Biomedical Technologies. Holographic, British, and entirely powered by your browser, so nothing you say to me leaves this device. I can walk you round the stations, answer questions from the graded library, read the debate room aloud, or check a claim you’ve seen online.',
  },
  {
    match: /\b(should i (take|use|try)|what should i take|is it safe for me|how much (should|do) i|what dose|dosage|dose for me|my protocol|prescribe|inject|stack for me)\b/i,
    reply: 'I’m afraid I don’t do doses, protocols or personal advice. I’m a hologram receptionist, not your GP, and frankly I can’t even hold a pen. What I can do is show you exactly what has been studied, in whom, and how strong it is — so the conversation with your clinician is a much better one.',
  },
  {
    match: /\b(joke|funny|make me laugh)\b/i,
    reply: 'A peptide walks into a bar. The barman says, we don’t serve your type here. The peptide says, that’s fine, I’m only here for the bonds. I’ll see myself out. Well. I would, but I’m bolted to the pedestal.',
  },
  {
    match: /\b(how are you|you all right|you ok)\b/i,
    reply: 'Mustn’t grumble. Bit flickery round the edges, but that’s the scanlines. Thanks for asking. Where shall we go?',
  },
  {
    match: /\b(thank you|thanks|cheers|ta)\b/i,
    reply: 'My pleasure. Genuinely. It’s quite lonely on this pedestal.',
  },
];

/** Words that point at each station. */
const PLACES = [
  ['chamber', /\b(reception|lobby|home|start|beginning|front desk)\b/],
  ['map', /\b(map|graph|network|showcase map)\b/],
  ['analysis', /\b(analysis|tiers?|ceilings?|grading|scores?)\b/],
  ['compare', /\b(compar\w*|versus|vs\.?|balance)\b/],
  ['debate', /\b(debate|reviewers?|panel|argue)\b/],
  ['myth', /\b(myths?|fact.?check\w*|claims? checker|shatter)\b/],
  ['simulator', /\b(simulat\w*|study design|false positives?|power)\b/],
  ['studies', /\b(studies|archive|library|citations?|cited|references|sources)\b/],
  ['studio', /\b(studio|content|creators?|influencers?|posts?|captions?|carousel|reel)\b/],
  ['receptor', /\b(receptor|gpcr|lock and key)\b/],
  ['agonists', /\b(agonists?|glp-?1 drugs|incretins?|weight loss trials?)\b/],
  ['synthesis', /\b(synthesis|spps|resin|yield|manufactur\w*)\b/],
  ['telemetry', /\b(telemetry|body map|heart|organs?|where .* act)\b/],
  ['genome', /\b(gene|genome|dna|sequence|codons?)\b/],
];

/** Find compounds named in a sentence, in the order they are mentioned. */
export function namedSubjects(text) {
  const lower = text.toLowerCase();
  return SUBJECTS
    .map((s) => ({ s, at: Math.min(...[s.name, s.id, s.name.replace(/-/g, ' ')].map((n) => { const i = lower.indexOf(n.toLowerCase()); return i < 0 ? Infinity : i; })) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.s);
}

/**
 * Work out what a visitor wants.
 *
 * @param {string} said What they typed or said.
 * @returns {{ kind: string, station?: string, subjects?: object[], claim?: string, reply?: string }} The intent.
 */
export function understand(said) {
  const text = String(said || '').trim();
  if (!text) return { kind: 'nothing' };
  if (/\b(tour|show me around|walk me|guide me|give me the tour)\b/i.test(text)) return { kind: 'tour' };
  if (/\b(stop|quiet|shush|be quiet|that'?s enough)\b/i.test(text)) return { kind: 'stop' };
  if (/^(next|onward|carry on|go on)\b/i.test(text)) return { kind: 'step', by: 1 };
  if (/^(back|previous|go back)\b/i.test(text)) return { kind: 'step', by: -1 };
  for (const rule of PERSONAL) if (rule.match.test(text)) return { kind: 'reply', reply: rule.reply };

  // "Is it true that…", "check this claim: …" → the myth checker.
  const claim = text.match(/^(?:check|is it true that|myth|fact.?check|true or false)[:,]?\s*(?:this\s*(?:claim)?[:,]?\s*)?(.{8,})$/i);
  if (claim) return { kind: 'myth', claim: claim[1] };

  const subjects = namedSubjects(text);
  if (/\bcompar\w*|\bvs\.?\b|\bversus\b|\bbetter evidence\b/i.test(text) && subjects.length >= 2) return { kind: 'compare', subjects: subjects.slice(0, 2) };
  if (/\bdebate\b|\breviewers?\b|\bpanel\b/i.test(text) && subjects.length) return { kind: 'debate', subjects: subjects.slice(0, 1) };
  if (/\bstudio\b|\bcontent\b|\bpost\b|\bcaption\b/i.test(text) && subjects.length) return { kind: 'studio', subjects: subjects.slice(0, 1) };

  const go = /\b(take me|go|show me|open|navigate|bring up|let'?s see|where is|visit)\b/i.test(text);
  if (go || text.split(/\s+/).length <= 3) {
    for (const [station, pattern] of PLACES) if (pattern.test(text.toLowerCase())) return { kind: 'go', station, subjects };
  }
  return { kind: 'ask', subjects };
}

/**
 * Shorten a corpus answer for speaking: the first few sentences, without
 * bullet lists or markdown.
 *
 * @param {string} text Full answer.
 * @param {number} [sentences] How many sentences to keep.
 * @returns {string} Speakable text.
 */
export function speakable(text, sentences = 3) {
  const clean = String(text || '').replace(/\n+•[^\n]*/g, '').replace(/[*_#>]/g, '').replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  return parts.slice(0, sentences).join(' ').trim();
}

/**
 * Answer a question from the corpus, in Colin's manner.
 *
 * @param {string} question The question.
 * @returns {{ spoken: string, full: string, sources: object[] }} His answer.
 */
export function answer(question) {
  const local = composeLocalAnswer(question);
  if (!local || !local.text) return { spoken: pick('unknown'), full: pick('unknown'), sources: [] };
  // The concierge introduces itself as Astra; in here, Colin is on the desk.
  const body = local.text.replace(/\bI am Astra\b/g, 'I’m Colin').replace(/\bAstra\b/g, 'the library');
  const plain = body.replace(/\*\*(.+?)\*\*/g, '$1');
  const opener = pick('thinking');
  return {
    spoken: `${opener} ${speakable(plain, 3)} ${pick('closing')}`,
    full: `${opener} ${plain}`,
    sources: local.sources || [],
  };
}

/** What he says when arriving at a station. */
export function arrivalLine(index) {
  return STATIONS[index]?.colin || '';
}
