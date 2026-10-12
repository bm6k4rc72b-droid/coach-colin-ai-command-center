/**
 * Colin — the chamber's holographic receptionist.
 *
 * In English his scripted lines play from studio recordings of the owner's
 * custom voice (voicebank.js); everything else, and every other language,
 * is spoken with the device's male voice for the chosen language where one
 * exists (Daniel or Arthur, "Google UK English Male", Ryan or George in
 * English; Otoya or Keita in Japanese; Jorge or Pablo in Spanish; Thomas in
 * French; Markus in German; Yunxi in Chinese; Maged in Arabic) and listens
 * through the browser's speech recognition where it is offered. As the
 * hub's interpreter he can also speak any of its twelve languages. Everything
 * runs on the device: no audio, transcript or question leaves the browser
 * (the recordings are only downloaded, never anything sent).
 *
 * His manner is dry, polite and a little self-deprecating, in every language.
 * His content is not: answers come from ASTRA's graded corpus through the
 * same local concierge the main platform uses, and he will not discuss doses,
 * protocols or what anyone personally should take.
 *
 * @module astra/showcase/colin
 */

import { composeLocalAnswer } from '../js/astra.js';
import { STATIONS, SUBJECTS } from './sections.js';
import { COMMANDS, LANGS, PLACE_WORDS, T } from './i18n.js';
import { HUB_LANGS } from './hub.js';
import { studioClip } from './voicebank.js';

/* --------------------------------------------------------------- language */

let lang = 'en';

export function setLang(id) {
  if (T[id]) lang = id;
}

export function getLang() {
  return lang;
}

/** The current language's copy for a key (function keys are called with args). */
export function line(key, ...args) {
  const value = T[lang][key] ?? T.en[key];
  return typeof value === 'function' ? value(...args) : value;
}

/* ------------------------------------------------------------------ voice */

/**
 * Rank the device's voices for "male, in this language": the right language
 * (British English for English) with a known male name first, then any voice
 * in the language not known to be female.
 *
 * @param {SpeechSynthesisVoice[]} voices Available voices.
 * @param {string} [langId] Language id.
 * @returns {SpeechSynthesisVoice[]} Candidates, best first.
 */
export function rankVoices(voices, langId = lang) {
  const spec = voiceSpec(langId);
  const base = spec.speech.slice(0, 2);
  const score = (v) => {
    const exact = v.lang.replace('_', '-').toLowerCase() === spec.speech.toLowerCase();
    const male = spec.male.test(v.name);
    const female = spec.female.test(v.name);
    return (exact ? 100 : 20) + (male ? 50 : 0) - (female ? 60 : 0) + (v.localService ? 2 : 0);
  };
  return voices.filter((v) => v.lang.toLowerCase().startsWith(base)).sort((a, b) => score(b) - score(a));
}

/** Voice preferences for a language: Colin's own seven, or any hub language. */
function voiceSpec(langId) {
  const own = LANGS.find((l) => l.id === langId);
  if (own) return own;
  const hub = HUB_LANGS.find((l) => l.id === langId);
  if (hub) return { id: hub.id, speech: hub.speech, male: /male|man|homem|uomo|남|पुरुष|муж/i, female: /female|woman|mulher|donna|여|महिला|жен/i };
  return LANGS[0];
}

/* ----------------------------------------------------------- studio voice */

/** A quiet instant of WAV, to wake an iPhone's audio element inside a tap. */
const SILENCE = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

function studioAudio() {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  return audio;
}

/**
 * iPhones only let a page play sound from an element that has already
 * played inside a tap, so the first tap plays a moment of silence on the
 * one element every recording will use.
 */
function unlockOnGesture(getAudio) {
  if (typeof window === 'undefined') return;
  const types = ['pointerdown', 'touchend', 'click', 'keydown'];
  const unlock = () => {
    const audio = getAudio();
    if (!audio.paused || audio.dataset.unlocked) return;
    audio.dataset.unlocked = '1';
    audio.src = SILENCE;
    audio.play()?.then?.(() => {
      audio.pause();
      for (const type of types) window.removeEventListener(type, unlock, true);
    }).catch?.(() => { delete audio.dataset.unlocked; });
  };
  for (const type of types) window.addEventListener(type, unlock, { capture: true, passive: true });
}

/**
 * Cut a line into recorded and unrecorded parts: the whole line if he
 * recorded it, otherwise the longest recorded runs of sentences (openers,
 * sign-offs, verdicts), with the rest left for the device voice.
 *
 * @param {string} text What he is to say.
 * @returns {{ text: string, clip?: string }[]} The parts, in order.
 */
export function studioParts(text) {
  const whole = studioClip(text);
  if (whole) return [{ text, clip: whole }];
  const sentences = text.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [text];
  const parts = [];
  for (let i = 0; i < sentences.length;) {
    let j = sentences.length;
    let clip = null;
    for (; j > i; j -= 1) if ((clip = studioClip(sentences.slice(i, j).join('')))) break;
    if (clip) { parts.push({ text: sentences.slice(i, j).join('').trim(), clip }); i = j; continue; }
    const last = parts[parts.length - 1];
    if (last && !last.clip) last.text += ` ${sentences[i].trim()}`;
    else parts.push({ text: sentences[i].trim() });
    i += 1;
  }
  return parts.filter((p) => p.text);
}

/** Text-to-speech with a level signal for the hologram's voice rings. */
export class Voice {
  constructor({ onLevel } = {}) {
    this.synth = window.speechSynthesis || null;
    // His recorded voice plays wherever audio does; the device voice is the understudy.
    this.studio = typeof Audio !== 'undefined';
    this.enabled = Boolean(this.synth || this.studio);
    this.voice = null;
    this.voices = [];
    this.onLevel = onLevel || (() => {});
    this.level = 0;
    this.speaking = false;
    this.listeners = [];
    if (this.studio) unlockOnGesture(() => (this.audio || (this.audio = studioAudio())));
    if (this.synth) {
      this.load();
      this.synth.addEventListener?.('voiceschanged', () => this.load());
    }
  }

  /** Re-rank voices for the current language. */
  load() {
    if (!this.synth) return;
    this.voices = rankVoices(this.synth.getVoices(), lang);
    if (!this.voice || !this.voices.includes(this.voice)) this.voice = this.voices[0] || null;
    for (const fn of this.listeners) fn();
  }

  /** Whether the chosen voice is known to be male, so pitch can be left alone. */
  get knownMale() {
    const spec = LANGS.find((l) => l.id === lang) || LANGS[0];
    return Boolean(this.voice && spec.male.test(this.voice.name) && !spec.female.test(this.voice.name));
  }

  /**
   * Speak, cancelling anything already queued. In English, every scripted
   * line he has is played from his recorded studio voice; whatever is
   * composed on the spot (a claim, a score, an answer from the library) is
   * spoken by the device, sentence by sentence, between the recordings.
   *
   * @param {string} text What to say.
   * @param {{ pitch?: number, rate?: number, lang?: string, studio?: boolean }} [style] A delivery, for performances; `lang` speaks in another language (the interpreter); `studio: false` uses the device voice only.
   * @returns {Promise<void>} Resolves when he stops.
   */
  async say(text, style = {}) {
    if (!this.enabled || !text) return;
    const token = (this.token = (this.token || 0) + 1);
    this.halt();
    const english = (style.lang || lang) === 'en';
    const parts = english && this.studio && style.studio !== false ? studioParts(String(text)) : [{ text: String(text) }];
    this.speaking = true;
    for (const part of parts) {
      if (this.token !== token) return;
      const played = part.clip ? await this.playClip(part.clip, token) : false;
      if (!played && this.token === token) await this.tts(part.text, style, token);
    }
    if (this.token === token) this.speaking = false;
  }

  /** Play one recorded line; false if it could not be played. */
  playClip(src, token) {
    const audio = this.audio || (this.audio = studioAudio());
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        audio.onended = audio.onerror = audio.onpause = null;
        clearInterval(this.pulse);
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.onpause = () => { if (this.token !== token) done(true); };
      audio.src = src;
      audio.play().then(() => {
        if (this.token !== token) { audio.pause(); done(true); return; }
        // No word boundaries from a recording, so the rings follow a
        // syllable-rate flutter instead (about four a second).
        clearInterval(this.pulse);
        this.pulse = setInterval(() => { this.level = 0.7 + 0.3 * Math.random(); }, 240);
      }).catch(() => done(false));
    });
  }

  /** The device's own speech, for anything not recorded. */
  tts(text, style, token) {
    if (!this.synth || !text) return Promise.resolve();
    // Speak sentence-sized chunks: long utterances stall in some engines
    // (Chrome cuts off after roughly fifteen seconds), short ones never do.
    const sentences = String(text).replace(/[“”]/g, '"').replace(/·/g, ',').match(/[^.!?。！？؟।]+[.!?。！？؟।]*\s*/g) || [String(text)];
    const chunks = [];
    for (const sentence of sentences) {
      if (chunks.length && (chunks[chunks.length - 1] + sentence).length < 180) chunks[chunks.length - 1] += sentence;
      else chunks.push(sentence);
    }
    const speakLang = style.lang || lang;
    const spec = voiceSpec(speakLang);
    const chosen = style.lang && style.lang !== lang ? (rankVoices(this.synth.getVoices(), style.lang)[0] || null) : this.voice;
    const male = Boolean(chosen && spec.male.test(chosen.name) && !spec.female.test(chosen.name));
    // Characters per second vary by script: a kanji or hanzi carries a syllable or more.
    const perChar = /^(ja|zh|ko)$/.test(speakLang) ? 160 : 75;
    return new Promise((resolve) => {
      let remaining = chunks.length;
      // A safety net, so a silent or stalled engine never hangs the tour.
      const timer = setTimeout(resolve, 1500 + String(text).length * perChar);
      for (const chunk of chunks) {
        const utterance = new SpeechSynthesisUtterance(chunk.trim());
        if (chosen) utterance.voice = chosen;
        utterance.lang = chosen?.lang || spec.speech;
        // An unknown-gender voice is nudged lower; a known male one is left alone.
        utterance.pitch = style.pitch ?? (male ? 0.95 : 0.78);
        utterance.rate = style.rate ?? 0.98;
        utterance.onstart = () => { if (this.token === token) this.level = 0.8; };
        utterance.onboundary = () => { if (this.token === token) this.level = 1; };
        const done = () => {
          remaining -= 1;
          if (remaining <= 0) { clearTimeout(timer); resolve(); }
        };
        utterance.onend = done;
        utterance.onerror = done;
        this.synth.speak(utterance);
      }
    });
  }

  /** Silence whatever is playing, without ending the current turn's bookkeeping. */
  halt() {
    this.synth?.cancel();
    clearInterval(this.pulse);
    if (this.audio && !this.audio.paused) this.audio.pause();
  }

  stop() {
    this.token = (this.token || 0) + 1;
    this.halt();
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
   * Listen for one utterance in the current language, or in another.
   *
   * @param {string} [langId] A language id (Colin's or the hub's).
   * @returns {Promise<string>} The transcript ('' if nothing was heard).
   */
  listen(langId = lang) {
    if (!this.supported) return Promise.resolve('');
    this.stop();
    return new Promise((resolve) => {
      const rec = new this.Recognition();
      rec.lang = voiceSpec(langId).speech;
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

const counters = new Map();
function pick(kind) {
  const list = line(kind);
  const i = (counters.get(kind) || 0) % list.length;
  counters.set(kind, i + 1);
  return list[i];
}

/** English station words, matched alongside the other languages' ones. */
const PLACES = [
  ['chamber', /\b(reception|lobby|home|start|beginning|front desk)\b/],
  ['translate', /\b(translat\w*|interpret\w*|languages?|hub|glossary)\b/],
  ['map', /\b(map|graph|network|showcase map)\b/],
  ['scan', /\b(scan|holo.?scan|organs?|body scan)\b/],
  ['analysis', /\b(analysis|tiers?|ceilings?|grading|scores?)\b/],
  ['compare', /\b(compar\w*|versus|vs\.?|balance)\b/],
  ['arena', /\b(arena|court|courtroom|trial|judge|jury|multiplayer|two players?|versus mode)\b/],
  ['debate', /\b(debate|reviewers?|panel|argue)\b/],
  ['roast', /\b(influencers?|roast|caption check)\b/],
  ['myth', /\b(myths?|fact.?check\w*|claims? checker|shatter)\b/],
  ['simulator', /\b(simulat\w*|study design|false positives?|power)\b/],
  ['studies', /\b(studies|archive|library|citations?|cited|references|sources)\b/],
  ['studio', /\b(studio|content|creators?|posts?|carousel|reel)\b/],
  ['pk', /\b(half.?life|pharmacokinetic\w*|pk|accumulation|dosing interval)\b/],
  ['receptor', /\b(receptor|gpcr|lock and key)\b/],
  ['agonists', /\b(agonists?|glp-?1 drugs|incretins?|weight loss trials?)\b/],
  ['synthesis', /\b(synthesis|spps|resin|yield|manufactur\w*)\b/],
  ['telemetry', /\b(telemetry|heart ?beat|where .* act)\b/],
  ['genome', /\b(gene|genome|dna|sequence|codons?)\b/],
  ['globe', /\b(globe|regulat\w*|legal|countries|wada|banned)\b/],
  ['dermal', /\b(skin|skincare|skin care|dermal|derm\w*|wrinkles?|collagen|face scan|anti-?ag(e)?ing|ghk(-cu)?|copper peptide|matrixyl|argireline|snap-?8|leuphasyl)\b/],
  ['classified', /\b(classified|vault|top secret|secret|exenatide|ex-?039|black lab|gila)\b/],
  ['future', /\b(future|pipeline|next generation|orforglipron|cagrisema|survodutide|maritide|amycretin)\b/],
];

/** Find compounds named in a sentence, in the order they are mentioned. */
export function namedSubjects(text) {
  // Accents off and a stem, so sémaglutide, Semaglutid and semaglutida all count.
  const fold = (v) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const lower = fold(text);
  const forms = (s) => {
    const names = [s.name, s.id, s.name.replace(/-/g, ' ')].map(fold);
    return [...names, ...names.filter((n) => n.length > 7 && /[ae]$/.test(n)).map((n) => n.slice(0, -1))];
  };
  return SUBJECTS
    .map((s) => ({ s, at: Math.min(...forms(s).map((n) => { const i = lower.indexOf(n); return i < 0 ? Infinity : i; })) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.s);
}

/**
 * Work out what a visitor wants, in any of Colin's seven languages.
 *
 * @param {string} said What they typed or said.
 * @returns {{ kind: string, station?: string, subjects?: object[], claim?: string, reply?: string, by?: number }} The intent.
 */
export function understand(said) {
  const text = String(said || '').trim();
  if (!text) return { kind: 'nothing' };
  const C = COMMANDS;
  if (C.tour.test(text)) return { kind: 'tour' };
  if (C.stop.test(text) && text.length < 24) return { kind: 'stop' };
  if (C.next.test(text)) return { kind: 'step', by: 1 };
  if (C.back.test(text)) return { kind: 'step', by: -1 };
  if (C.dose.test(text)) return { kind: 'reply', reply: line('dose') };
  if (C.who.test(text)) return { kind: 'reply', reply: line('who') };
  if (C.joke.test(text)) return { kind: 'reply', reply: line('joke') };
  if (C.howAreYou.test(text)) return { kind: 'reply', reply: line('howAreYou') };
  if (C.thanks.test(text) && text.length < 30) return { kind: 'reply', reply: line('thanks') };
  if (C.briefing.test(text)) return { kind: 'briefing' };
  if (C.ar.test(text)) return { kind: 'ar' };

  // "Is it true that…", "check this claim: …" → the myth checker.
  const claim = text.match(/^(?:check|is it true that|myth|fact.?check|true or false|チェック|verifica|vérifie|prüfe|核查|تحقق)[:：,]?\s*(?:this\s*(?:claim)?[:,]?\s*)?(.{8,})$/i);
  if (claim) return { kind: 'myth', claim: claim[1] };
  if (/^(roast|influencer)[:：,]\s*(.{8,})$/i.test(text)) return { kind: 'roast', caption: text.replace(/^(roast|influencer)[:：,]\s*/i, '') };

  // "Translate into French: …" → the hub, with the text and the target.
  const tr = text.match(/^(?:translate|traduce|traduis|traduz|übersetze|翻译|翻訳|ترجم)(?:\s+(?:this\s+)?(?:into|to|en|in|auf|al|a|para)\s+([\p{L}]+))?\s*[:：]\s*(.{2,})$/iu);
  if (tr) return { kind: 'translate', text: tr[2], target: hubLanguage(tr[1]) };
  // "Trial: …" or "put this on trial: …" → the courtroom opens a case on it.
  const trial = text.match(/^(?:trial|put (?:this |it )?on trial|court|juicio|procès|prozess|审判|裁判|محاكمة)[:：]\s*(.{8,})$/i);
  if (trial) return { kind: 'trial', claim: trial[1] };

  const subjects = namedSubjects(text);
  if (/\bcompar\w*|\bvs\.?\b|\bversus\b|\bbetter evidence\b|比較|比较|compara|vergleich|قارن|مقارنة/i.test(text) && subjects.length >= 2) return { kind: 'compare', subjects: subjects.slice(0, 2) };
  if (/\bdebate\b|\breviewers?\b|\bpanel\b|ディベート|débat|debatte|辩论|مناظرة/i.test(text) && subjects.length) return { kind: 'debate', subjects: subjects.slice(0, 1) };
  if (/\bstudio\b|\bcontent\b|\bpost\b|\bcaption\b|スタジオ|contenido/i.test(text) && subjects.length) return { kind: 'studio', subjects: subjects.slice(0, 1) };
  if (/\b(legal|approved|banned|wada|regulat\w*)\b|規制|承認|legal|aprobad|approuvé|zugelassen|获批|监管|معتمد/i.test(text) && subjects.length) return { kind: 'globe', subjects: subjects.slice(0, 1) };

  const go = /\b(take me|go|show me|open|navigate|bring up|let'?s see|where is|visit)\b|連れて|見せて|行きたい|開いて|llévame|muéstrame|abre|ir a|vamos|emmène|montre|allons|ouvre|bring mich|zeig|öffne|gehe|带我去|打开|去|خذني|افتح|اذهب/i.test(text);
  if (go || text.split(/\s+/).length <= 3) {
    for (const [station, pattern] of Object.entries(PLACE_WORDS)) if (pattern.test(text)) return { kind: 'go', station, subjects };
    for (const [station, pattern] of PLACES) if (pattern.test(text.toLowerCase())) return { kind: 'go', station, subjects };
  }
  return { kind: 'ask', subjects };
}

/** A language named in any form ("French", "français", "fr", "法语") → hub id. */
export function hubLanguage(name) {
  if (!name) return undefined;
  const n = name.toLowerCase();
  const extra = { 法语: 'fr', 德语: 'de', 西班牙语: 'es', 日语: 'ja', 中文: 'zh', 英语: 'en', 阿拉伯语: 'ar', francés: 'fr', alemán: 'de', inglés: 'en', japonés: 'ja', chino: 'zh', árabe: 'ar', français: 'fr', allemand: 'de', anglais: 'en', espagnol: 'es', japonais: 'ja', chinois: 'zh', arabe: 'ar', französisch: 'fr', deutsch: 'de', englisch: 'en', spanisch: 'es', japanisch: 'ja', chinesisch: 'zh', arabisch: 'ar' };
  const hit = HUB_LANGS.find((l) => l.id === n || l.english.toLowerCase() === n || l.name.toLowerCase() === n);
  return hit ? hit.id : extra[n];
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
  const parts = clean.match(/[^.!?。！？؟]+[.!?。！？؟]+/g) || [clean];
  return parts.slice(0, sentences).join(' ').trim();
}

/**
 * Answer a question from the corpus, in Colin's manner. The library is in
 * English; in other languages he says so and shows the English (`english`
 * carries the plain answer, so the desk can translate it on the device).
 *
 * @param {string} question The question.
 * @returns {{ spoken: string, full: string, english: string, opener: string, sources: object[] }} His answer.
 */
export function answer(question) {
  const local = composeLocalAnswer(question);
  if (!local || !local.text) { const u = pick('unknown'); return { spoken: u, full: u, english: '', opener: '', sources: [] }; }
  // The concierge introduces itself as Astra; in here, Colin is on the desk.
  const body = local.text.replace(/\bI am Astra\b/g, 'I’m Colin').replace(/\bAstra\b/g, 'the library');
  const plain = body.replace(/\*\*(.+?)\*\*/g, '$1');
  const opener = pick('thinking');
  if (lang !== 'en') {
    return { spoken: `${opener} ${line('corpusNote')} ${pick('closing')}`, full: `${opener} ${line('corpusNote')}\n\n${plain}`, english: plain, opener, sources: local.sources || [] };
  }
  return {
    spoken: `${opener} ${speakable(plain, 3)} ${pick('closing')}`,
    full: `${opener} ${plain}`,
    english: plain,
    opener,
    sources: local.sources || [],
  };
}

/** What he says when arriving at a station. */
export function arrivalLine(index) {
  const station = STATIONS[index];
  if (!station) return '';
  return lang === 'en' ? station.colin : (T[lang].stations[station.id] || station.colin);
}
