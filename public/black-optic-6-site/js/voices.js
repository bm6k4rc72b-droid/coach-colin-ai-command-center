/**
 * The guides — a different voice for each act, and none of them lie.
 *
 * The brief asked for AI agents that explain each feature, each with its own
 * voice. Two things about that are worth saying plainly rather than burying.
 *
 * **What the voice is.** It is the browser's own speech synthesiser — the same
 * engine that reads a page aloud for someone who cannot see it. It is offline,
 * free, instant, and it works in a barn with no signal. It is not a cloned
 * celebrity and it is not a large model improvising; a synthesised voice that
 * improvises is a synthesised voice that eventually says something untrue about
 * a sensor you are relying on at two in the morning.
 *
 * **What it says.** Every line is composed from the console's capability ledger
 * at load time. A guide can describe a row, and it describes it wearing the
 * row's own state — so the thermal guide will happily tell you Ironbow is live
 * on your camera *and* that applying it to visible light is colouring
 * brightness rather than heat, because both sentences come from the same table.
 * There is no script file for anyone to sweeten later. If a claim is not in the
 * ledger, no voice on this page can say it.
 *
 * Distinctness is done properly rather than by randomising pitch: voices are
 * assigned so that no two guides share an installed voice while enough exist,
 * with each guide's preference honoured first and pitch and rate used only to
 * separate guides that ended up on the same voice.
 *
 * @module black-optic-6-site/voices
 */

import { resolve, scene, SCENES, RANGE_FRAMING } from './catalog.js';

/**
 * One guide per act.
 *
 * `prefer` are substrings matched against installed voice names, most wanted
 * first. They are hints, not requirements — voice inventories differ wildly
 * between a Mac, a Pixel and a locked-down Windows box, so nothing here breaks
 * when none of them are present.
 */
export const PERSONAS = Object.freeze([
  { scene: 'arrival', id: 'control', name: 'CONTROL', role: 'Dispatch',
    pitch: 0.85, rate: 0.94, prefer: ['Daniel', 'Google UK English Male', 'Alex', 'Microsoft Guy'],
    greeting: 'Black Optic Six. Sixty-five capabilities on the board. I will tell you which of them measure anything.' },
  { scene: 'optics', id: 'aperture', name: 'APERTURE', role: 'Optics',
    pitch: 1.12, rate: 1.02, prefer: ['Samantha', 'Google US English', 'Karen', 'Microsoft Zira'],
    greeting: 'Optics. Anything that becomes a stream becomes an instrument.' },
  { scene: 'thermal', id: 'ember', name: 'EMBER', role: 'Thermal',
    pitch: 0.95, rate: 0.92, prefer: ['Moira', 'Tessa', 'Google UK English Female', 'Fiona'],
    greeting: 'Thermal. Thirteen palettes, and one rule about what they are allowed to mean.' },
  { scene: 'satellite', id: 'apogee', name: 'APOGEE', role: 'Orbital',
    pitch: 1.0, rate: 0.9, prefer: ['Rishi', 'Veena', 'Google UK English Male', 'Oliver'],
    greeting: 'Orbital. Five spacecraft you can have for nothing, and four rungs of ladder you cannot.' },
  { scene: 'aerial', id: 'kite', name: 'KITE', role: 'Aerial',
    pitch: 1.2, rate: 1.06, prefer: ['Nicky', 'Ava', 'Google US English', 'Microsoft Aria'],
    greeting: 'Aerial. A contact is a bearing and a rate. It is not a model number.' },
  { scene: 'wearables', id: 'pulse', name: 'PULSE', role: 'Bio',
    pitch: 1.06, rate: 0.98, prefer: ['Zoe', 'Allison', 'Serena', 'Microsoft Jenny'],
    greeting: 'Bio. One sensor on you rather than around you.' },
  { scene: 'field', id: 'furrow', name: 'FURROW', role: 'Field',
    pitch: 0.9, rate: 0.96, prefer: ['Lee', 'Gordon', 'Ralph', 'Microsoft Mark'],
    greeting: 'Field. The block, the game in the fruit, and the bins coming off the row.' },
  { scene: 'range', id: 'mildot', name: 'MIL-DOT', role: 'Marksmanship',
    pitch: 0.88, rate: 0.9, prefer: ['Fred', 'Bruce', 'Aaron', 'Microsoft David'],
    greeting: 'Range. Drop, drift, lag time. Steel at known distance, and nothing else.' },
  { scene: 'demo', id: 'bench', name: 'BENCH', role: 'Demo',
    pitch: 1.04, rate: 1.05, prefer: ['Kathy', 'Susan', 'Google US English', 'Microsoft Michelle'],
    greeting: 'Demo. This is the product, not a film of it.' },
  { scene: 'world', id: 'meridian', name: 'MERIDIAN', role: 'World',
    pitch: 0.98, rate: 0.95, prefer: ['Rishi', 'Daniel', 'Google UK English Male', 'Microsoft Ryan'],
    greeting: 'World. Four feeds off the ranch, and only one of them needs nothing from you.' },
  { scene: 'ledger', id: 'auditor', name: 'AUDITOR', role: 'Ledger',
    pitch: 0.8, rate: 0.86, prefer: ['Ralph', 'Albert', 'Daniel', 'Microsoft George'],
    greeting: 'Ledger. Eleven rows that do not follow from any measurement, at any price.' },
  { scene: 'launch', id: 'control', name: 'CONTROL', role: 'Dispatch',
    pitch: 0.85, rate: 0.94, prefer: ['Daniel', 'Google UK English Male', 'Alex', 'Microsoft Guy'],
    greeting: 'Console open. Grant a camera and it starts measuring.' },
]);

/** The guide for an act. */
export function personaFor(sceneId) {
  return PERSONAS.find((p) => p.scene === sceneId) || PERSONAS[0];
}

/** Stable small hash, so voice assignment is the same on every load. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

/** How well an installed voice matches a guide's preferences. Higher is better. */
export function score(voice, persona) {
  const name = (voice?.name || '').toLowerCase();
  const lang = (voice?.lang || '').toLowerCase();
  if (!lang.startsWith('en')) return -1;
  let points = voice.localService ? 2 : 1;
  persona.prefer.forEach((hint, index) => {
    if (name.includes(hint.toLowerCase())) points += 100 - index * 5;
  });
  return points;
}

/**
 * Give every guide its own voice.
 *
 * Preference matches are allocated first, strongest match wins the voice, and
 * whoever is left takes an unused voice chosen by a stable hash of their id.
 * Only when there are genuinely fewer voices than guides does anyone share —
 * and then pitch and rate are what keep them apart.
 */
export function assignVoices(voices, personas = PERSONAS) {
  const usable = (voices || []).filter((voice) => (voice?.lang || '').toLowerCase().startsWith('en'));
  const pool = usable.length ? usable : (voices || []);
  const assignment = new Map();
  if (!pool.length) {
    for (const persona of personas) assignment.set(persona.id, null);
    return assignment;
  }

  const taken = new Set();
  const unique = [...new Map(personas.map((p) => [p.id, p])).values()];

  const bids = [];
  for (const persona of unique) {
    for (const voice of pool) {
      const points = score(voice, persona);
      if (points > 50) bids.push({ persona, voice, points });
    }
  }
  bids.sort((a, b) => b.points - a.points || a.persona.id.localeCompare(b.persona.id));
  for (const bid of bids) {
    if (assignment.has(bid.persona.id) || taken.has(bid.voice.name)) continue;
    assignment.set(bid.persona.id, bid.voice);
    taken.add(bid.voice.name);
  }

  const spare = pool.filter((voice) => !taken.has(voice.name));
  let cursor = 0;
  for (const persona of unique) {
    if (assignment.has(persona.id)) continue;
    if (spare.length) {
      const index = (hash(persona.id) + cursor) % spare.length;
      const [voice] = spare.splice(index, 1);
      cursor += 1;
      assignment.set(persona.id, voice);
      taken.add(voice.name);
    } else {
      assignment.set(persona.id, pool[hash(persona.id) % pool.length]);
    }
  }
  return assignment;
}

/**
 * One spoken sentence for a capability row.
 *
 * A trustworthy row is described. An untrustworthy one is *named as such
 * first* — "Blocked." then the reason — because a listener half-attending to a
 * voice needs the verdict before the explanation, not after it.
 */
export function lineFor(id) {
  const row = resolve(id);
  const verdict = row.verdict;
  if (row.trustworthy) {
    return { capability: id, state: row.state, text: `${row.name}. ${verdict}` };
  }
  const prefix = {
    BLOCKED: 'Blocked',
    HARDWARE: 'Needs hardware',
    UNSOUND: 'Unsound',
  }[row.state] || row.state;
  return { capability: id, state: row.state, text: `${row.name}. ${prefix}. ${verdict}` };
}

/**
 * The full script for an act: the guide's greeting, the act's own line, then
 * one sentence per capability it shows.
 */
export function scriptFor(sceneId) {
  const act = scene(sceneId);
  if (!act) return [];
  const persona = personaFor(sceneId);
  const lines = [
    { capability: null, state: null, text: persona.greeting },
    { capability: null, state: null, text: act.line },
  ];
  for (const id of act.shows) lines.push(lineFor(id));
  if (sceneId === 'range') {
    lines.splice(2, 0, { capability: null, state: null, text: RANGE_FRAMING.is });
    lines.splice(3, 0, { capability: null, state: null, text: RANGE_FRAMING.isNot });
  }
  return lines;
}

/** Every act's script, for the test that walks all of them. */
export function allScripts() {
  return SCENES.map((act) => ({ scene: act.id, lines: scriptFor(act.id) }));
}

/**
 * The speaking half.
 *
 * `speechSynthesis` is a famously uneven API: Chrome populates `getVoices()`
 * asynchronously, Safari sometimes stalls an utterance queue after a tab is
 * backgrounded, and every engine handles `cancel()` during `speaking`
 * differently. So this class keeps its own queue, re-reads the voice list on
 * `voiceschanged`, and treats a missing synthesiser as ordinary rather than
 * exceptional — the site is fully usable in text with the sound off, which is
 * how most people will read it anyway.
 */
export class Narrator {
  constructor(synth = (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null)) {
    this.synth = synth;
    this.available = Boolean(synth);
    this.voices = [];
    this.assignment = new Map();
    this.current = null;
    this.onstate = null;
    this.enabled = false;
    if (this.available) {
      this.refresh();
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', () => this.refresh());
      }
    }
  }

  refresh() {
    if (!this.available) return;
    try {
      this.voices = this.synth.getVoices() || [];
    } catch {
      this.voices = [];
    }
    this.assignment = assignVoices(this.voices);
  }

  voiceFor(persona) {
    if (!this.assignment.size) this.refresh();
    return this.assignment.get(persona.id) || null;
  }

  /** A short label for the UI: which actual voice this guide ended up with. */
  describe(persona) {
    const voice = this.voiceFor(persona);
    if (!this.available) return 'no speech engine on this device';
    if (!voice) return 'system default voice';
    return voice.name;
  }

  stop() {
    this.current = null;
    if (!this.available) return;
    try { this.synth.cancel(); } catch { /* engines differ; a failed cancel is not fatal */ }
    if (this.onstate) this.onstate({ speaking: false, persona: null, line: -1 });
  }

  /**
   * Speak an act.
   *
   * Lines are queued as separate utterances rather than one long string so the
   * page can highlight the sentence being read and so `cancel()` lands between
   * sentences instead of mid-word.
   */
  speak(sceneId) {
    if (!this.available) return false;
    const persona = personaFor(sceneId);
    const lines = scriptFor(sceneId);
    this.stop();
    this.current = { persona, lines, index: 0 };
    const voice = this.voiceFor(persona);

    lines.forEach((line, index) => {
      const utterance = new SpeechSynthesisUtterance(line.text);
      if (voice) utterance.voice = voice;
      utterance.pitch = persona.pitch;
      utterance.rate = persona.rate;
      utterance.onstart = () => {
        if (this.onstate) this.onstate({ speaking: true, persona, line: index, text: line.text });
      };
      utterance.onend = () => {
        if (index === lines.length - 1 && this.onstate) {
          this.onstate({ speaking: false, persona, line: -1 });
        }
      };
      try { this.synth.speak(utterance); } catch { /* nothing to do but stay quiet */ }
    });
    return true;
  }
}
