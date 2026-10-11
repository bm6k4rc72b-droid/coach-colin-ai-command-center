/**
 * Cards for the International Translation Hub and Courtroom Sector 7.
 *
 * @module astra/showcase/cards3
 */

import { MYTHS, STATIONS } from './sections.js';
import { el, fill, picker } from './cards.js';
import {
  GLOSSARY, HUB_LANGS, PHRASES, SAFETY, detect, engines, langById, pairStatus, translate,
} from './hub.js';
import {
  JURY_SIZE, OBJECTIONS, ROUNDS, SIDES, argue, callWitness, deliberate, object, openCase, transcript, vote,
} from './court.js';
import { getLang, line } from './colin.js';

/** The judge's delivery: slower and lower than the receptionist's. */
const JUDGE = { pitch: 0.8, rate: 0.9 };

/* ------------------------------------------------------------- the gavel */

let audio = null;

/**
 * A gavel strike, synthesised: a band-passed burst of noise for the wood and
 * a falling sine for the block's body, timed to land when the hologram's
 * gavel does (0.24 s after it starts to lift).
 */
export function gavelSound(delay = 0.24) {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audio ||= new Context();
    if (audio.state === 'suspended') audio.resume();
    const at = audio.currentTime + delay;
    const length = Math.floor(audio.sampleRate * 0.25);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.02));
    const noise = audio.createBufferSource();
    noise.buffer = buffer;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1700;
    band.Q.value = 1.1;
    const knock = audio.createGain();
    knock.gain.setValueAtTime(0.9, at);
    knock.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    noise.connect(band).connect(knock).connect(audio.destination);
    const body = audio.createOscillator();
    body.frequency.setValueAtTime(190, at);
    body.frequency.exponentialRampToValueAtTime(55, at + 0.16);
    const thump = audio.createGain();
    thump.gain.setValueAtTime(0.7, at);
    thump.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    body.connect(thump).connect(audio.destination);
    noise.start(at);
    body.start(at);
    body.stop(at + 0.25);
  } catch (error) { /* audio is a nicety */ }
}

/**
 * Translate English for the current language, but only on the device's AI
 * translator: Colin never reads out a phrasebook guess as if it were a
 * finding.
 */
async function localise(text) {
  const lang = getLang();
  if (lang === 'en' || !engines().translator) return text;
  const out = await translate(text, 'en', lang, { quick: true });
  return out.engine === 'on-device AI' && out.text ? out.text : text;
}

const STATUS_TEXT = {
  available: 'ready on this device',
  downloadable: 'model downloads on first use',
  downloading: 'model downloading',
  unavailable: 'pair not supported',
  phrasebook: 'phrasebook only',
};

/**
 * Build the hub and courtroom cards.
 *
 * @param {object} state Shared state.
 * @param {{ go: Function, say: Function, stop: Function, now: Function, index: Function, listen: Function, api: object }} hooks Room hooks.
 * @returns {Record<string, Function>} Builders keyed by station id.
 */
export function buildCourtCards(state, hooks) {
  const api = hooks.api;
  const langOptions = HUB_LANGS.map((l) => ({ id: l.id, name: `${l.name} · ${l.english}` }));

  return {
    translate() {
      const hub = state.hub;
      const status = el('div', { class: 'hub-status' });
      const refreshStatus = async () => {
        const e = engines();
        const pair = hub.from === 'auto' ? null : await pairStatus(hub.from, hub.to);
        fill(status, [
          el('span', { class: `pill ${e.translator ? 'ok' : 'off'}`, text: e.translator ? '● On-device AI translator' : '○ No built-in translator' }),
          el('span', { class: `pill ${e.detector ? 'ok' : 'off'}`, text: e.detector ? '● Language detector' : '○ Script-based detection' }),
          pair ? el('span', { class: 'pill', text: `${hub.from.toUpperCase()} → ${hub.to.toUpperCase()}: ${STATUS_TEXT[pair] || pair}` }) : null,
        ]);
      };

      const input = el('textarea', { rows: '3', dir: 'auto', placeholder: 'Type or paste anything — a caption, a study sentence, a question…', 'aria-label': 'Text to translate' });
      const from = picker('From', [{ id: 'auto', name: 'Auto-detect' }, ...langOptions], hub.from, (v) => { hub.from = v; refreshStatus(); });
      const to = picker('To', langOptions, hub.to, (v) => { hub.to = v; refreshStatus(); });
      const swap = el('button', { class: 'chip', type: 'button', text: '⇄', title: 'Swap languages', onclick: () => {
        if (hub.from === 'auto') return;
        [hub.from, hub.to] = [hub.to, hub.from];
        from.select.value = hub.from;
        to.select.value = hub.to;
        if (out.textContent) { input.value = out.textContent; fill(out, []); }
        refreshStatus();
      } });
      const out = el('div', { class: 'hub-out', dir: 'auto', 'aria-live': 'polite' });
      const meta = el('p', { class: 'meta' });
      const progress = el('p', { class: 'meta' });

      /** Run one translation and record it for the screen and hologram. */
      const run = async (text = input.value) => {
        const source = String(text || '').trim();
        if (!source) return null;
        let src = hub.from;
        let detected = null;
        if (src === 'auto') {
          detected = await detect(source);
          src = HUB_LANGS.some((l) => l.id === detected.lang) ? detected.lang : 'en';
        }
        hub.source = source;
        const result = await translate(source, src, hub.to, { onProgress: (f) => { progress.textContent = `Downloading the ${langById(hub.to).english} model… ${Math.round(f * 100)}%`; } });
        progress.textContent = '';
        hub.at = hooks.now();
        hub.last = { from: src, to: hub.to, source, text: result.text, ms: result.ms, engine: result.engine, detected };
        hub.history = [...(hub.history || []), { lang: hub.to, ms: result.ms, engine: result.engine }].slice(-12);
        hub.pairFrom = src;
        out.setAttribute('lang', hub.to);
        out.textContent = result.text || '';
        meta.textContent = [
          `Engine: ${result.engine}`,
          result.engine === 'none' ? '' : `${result.ms.toFixed(result.ms < 10 ? 1 : 0)} ms measured`,
          detected ? `detected ${langById(src).english} (${detected.engine}, ${Math.round(detected.confidence * 100)}%)` : '',
          result.note || '',
        ].filter(Boolean).join(' · ');
        return result;
      };

      const speakOut = () => out.textContent && hooks.say(out.textContent, { lang: hub.to });
      const go = el('button', { class: 'btn-small', type: 'button', text: 'Translate', onclick: () => run() });
      const speak = el('button', { class: 'chip', type: 'button', text: '🔊 Speak it', onclick: speakOut });
      const mic = el('button', { class: 'chip', type: 'button', text: '🎙 Interpret', title: 'Speak in the From language; Colin answers in the To language', onclick: async () => {
        const listenIn = hub.from === 'auto' ? getLang() : hub.from;
        mic.classList.add('live');
        await hooks.say(line('hubListen', langById(listenIn).name));
        const heard = await hooks.listen(listenIn);
        mic.classList.remove('live');
        if (!heard) { meta.textContent = 'Nothing heard — or this browser has no speech recognition.'; return; }
        input.value = heard;
        const r = await run(heard);
        if (r && r.text) speakOut();
        else if (r) hooks.say(line('hubNoEngine'));
      } });
      if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) mic.hidden = true;

      // Broadcast: one line into six languages, each timed.
      const castList = el('ul', { class: 'facts hub-cast' });
      const cast = el('button', { class: 'chip', type: 'button', text: '📡 Broadcast to 6 languages', onclick: async () => {
        const source = input.value.trim() || SAFETY.en;
        if (!input.value.trim()) input.value = source;
        let src = hub.from === 'auto' ? (await detect(source)).lang : hub.from;
        if (!HUB_LANGS.some((l) => l.id === src)) src = 'en';
        const targets = ['es', 'fr', 'de', 'zh', 'ja', 'ar', 'ru'].filter((l) => l !== src).slice(0, 6);
        fill(castList, []);
        for (const target of targets) {
          const r = await translate(source, src, target, { quick: true });
          hub.at = hooks.now();
          hub.last = { from: src, to: target, source, text: r.text, ms: r.ms, engine: r.engine };
          hub.history = [...(hub.history || []), { lang: target, ms: r.ms, engine: r.engine }].slice(-12);
          hub.pairFrom = src;
          hub.to = target;
          castList.append(el('li', {}, [
            el('b', { text: `${langById(target).flag} ` }),
            el('span', { dir: 'auto', lang: target, text: r.text || '—' }),
            el('span', { class: 'meta', text: ` · ${r.engine}${r.engine === 'none' ? '' : ` · ${r.ms.toFixed(r.ms < 10 ? 1 : 0)} ms`}` }),
          ]));
        }
        to.select.value = hub.to;
        refreshStatus();
      } });

      // Translate a station card.
      const stationPick = picker('Station', STATIONS.map((s) => ({ id: s.id, name: s.kicker })), 'arena', () => {});
      const stationOut = el('div', { class: 'hub-out', dir: 'auto' });
      const stationGo = el('button', { class: 'chip', type: 'button', text: 'Translate this station →', onclick: async () => {
        const station = STATIONS.find((s) => s.id === stationPick.select.value);
        const [title, body] = await Promise.all([translate(station.title, 'en', hub.to), translate(station.body, 'en', hub.to)]);
        stationOut.setAttribute('lang', hub.to);
        if (!body.text) {
          fill(stationOut, [el('p', { class: 'meta', text: body.note || 'No translator for this pair on this device.' })]);
          hooks.say(line('hubNoEngine'));
          return;
        }
        hub.at = hooks.now();
        hub.pairFrom = 'en';
        fill(stationOut, [el('b', { text: title.text }), el('p', { text: body.text }), el('p', { class: 'meta', text: `${body.engine} · ${(title.ms + body.ms).toFixed(0)} ms · ${langById(hub.to).english}` })]);
      } });

      // Glossary: pick a language, tap a term to hear it.
      const glossLang = picker('Glossary language', langOptions.filter((l) => l.id !== 'en'), hub.glossary || 'ja', (v) => { hub.glossary = v; renderGlossary(); });
      const gloss = el('div', { class: 'gloss' });
      const renderGlossary = () => {
        const target = hub.glossary || 'ja';
        const spec = langById(target);
        fill(gloss, GLOSSARY.map((term) => el('button', {
          class: 'gloss-term', type: 'button', title: `Hear it in ${spec.english}`,
          onclick: () => { hub.to = target; hub.pairFrom = 'en'; hub.at = hooks.now(); to.select.value = target; hooks.say(term[target], { lang: target }); },
        }, [el('span', { class: 'en', text: term.en }), el('span', { class: 'tr', dir: spec.dir, lang: target, text: term[target] })])));
      };
      renderGlossary();

      // Questions to start from.
      const phrases = el('div', { class: 'chips' }, PHRASES.map((p) => el('button', { class: 'chip', type: 'button', text: p.en, onclick: () => { input.value = p.en; hub.from = 'en'; from.select.value = 'en'; run(); } })));

      // Writing systems: the safety line in all twelve, right-to-left where it should be.
      const scripts = el('ul', { class: 'scripts' }, HUB_LANGS.map((l) => el('li', {
        dir: l.dir, lang: l.id, tabindex: '0', title: `${l.english} · ${l.script}${l.dir === 'rtl' ? ' · right to left' : ''} — tap to hear`,
        onclick: () => hooks.say(SAFETY[l.id], { lang: l.id }),
      }, [el('span', { class: 'script-tag', text: `${l.flag} · ${l.script}${l.dir === 'rtl' ? ' · RTL' : ''}` }), el('span', { text: SAFETY[l.id] })])));

      api.translate = (text, target) => {
        hooks.go(hooks.index('translate'));
        if (target) { hub.to = target; to.select.value = target; }
        if (text) { input.value = text; run(); }
      };
      refreshStatus();
      return [
        status,
        input,
        el('div', { class: 'pair' }, [from.node, swap, to.node]),
        el('div', { class: 'pair' }, [go, speak, mic, cast]),
        progress, out, meta, castList,
        phrases,
        el('details', { class: 'hub-more' }, [el('summary', { text: 'Translate a station card' }), stationPick.node, stationGo, stationOut]),
        el('details', { class: 'hub-more', open: '' }, [el('summary', { text: 'Peptide glossary · 14 terms × 12 languages · tap to hear' }), glossLang.node, gloss]),
        el('details', { class: 'hub-more' }, [el('summary', { text: 'Twelve writing systems · the safety line' }), scripts]),
      ];
    },

    arena() {
      const motionPick = picker('Motion', MYTHS.map((m) => ({ id: m, name: m })), MYTHS[0], () => {});
      const custom = el('input', { type: 'text', placeholder: 'e.g. Retatrutide is safe for everyone', 'aria-label': 'Custom motion' });
      const nameA = el('input', { type: 'text', value: 'Defence', 'aria-label': 'Defence counsel (for)' });
      const nameB = el('input', { type: 'text', value: 'Prosecution', 'aria-label': 'Prosecution counsel (against)' });
      const header = el('div', { class: 'court-head' });
      const exhibitsBox = el('div', { class: 'exhibits' });
      const turnLabel = el('p', { class: 'speaker' });
      const box = el('textarea', { rows: '3', placeholder: 'Your argument… cite “Exhibit A”, name the design, weigh a limitation.', 'aria-label': 'Argument' });
      const objectionRow = el('div', { class: 'chips objections' });
      const juryRow = el('div', { class: 'jury' });
      const verdictBox = el('div', { class: 'readout' });
      const record = el('pre', { class: 'court-record' });
      const cited = new Set();

      const say = (text) => hooks.say(text, JUDGE);
      const strike = () => {
        if (state.court) state.court.gavelAt = hooks.now();
        gavelSound();
      };

      const sync = () => {
        const k = state.court;
        if (!k) {
          fill(header, [el('p', { class: 'meta', text: 'No case before the court. Pick a motion, name counsel, and open the case.' })]);
          fill(exhibitsBox, []);
          turnLabel.textContent = '';
          fill(objectionRow, []);
          fill(juryRow, []);
          return;
        }
        fill(header, [
          el('p', { class: 'case-no', text: `Case No. ${k.number}` }),
          el('p', { class: 'motion', text: `“${k.motion}”` }),
          el('p', { class: 'meta', text: `Defence (FOR): ${k.names.a} · ${k.totals.a} pts — Prosecution (AGAINST): ${k.names.b} · ${k.totals.b} pts` }),
        ]);
        fill(exhibitsBox, k.exhibits.length ? k.exhibits.map((e) => el('div', { class: `exhibit${cited.has(e.letter) ? ' on' : ''}${e.direction < 0 ? ' neg' : ''}` }, [
          el('span', { class: 'ex-letter', text: e.letter }),
          el('span', { class: 'ex-body' }, [
            el('b', { text: e.title }),
            el('span', { class: 'meta', text: ` ${e.year} · ${e.tierLabel} · ceiling ${Math.round(e.ceiling * 100)}%${e.direction < 0 ? ' · points against' : ''}` }),
          ]),
          el('button', { class: 'chip', type: 'button', 'aria-pressed': String(cited.has(e.letter)), text: cited.has(e.letter) ? '✓ Cited' : 'Cite', onclick: () => { if (cited.has(e.letter)) cited.delete(e.letter); else cited.add(e.letter); sync(); } }),
          el('button', { class: 'chip', type: 'button', text: 'Witness', title: 'Call this exhibit to the stand', onclick: () => witness(e.letter) }),
        ])) : [el('p', { class: 'meta', text: 'No exhibits: the library has no studies for this motion’s compound. Argue from first principles — carefully.' })]);
        turnLabel.textContent = k.done
          ? 'The court has risen.'
          : k.closed
            ? 'Closing arguments heard — the jury may retire. Call the verdict.'
            : `Round ${k.round} of ${ROUNDS} — ${SIDES[k.turn].role} (${k.names[k.turn]}, ${SIDES[k.turn].stance}) has the floor`;
        const canObject = k.last && !k.last.objected && !k.done;
        fill(objectionRow, OBJECTIONS.map((o) => el('button', {
          class: 'chip', type: 'button', disabled: canObject ? null : '', title: o.gloss,
          text: `Objection! ${o.label}`, onclick: () => raise(o.id),
        })));
        const seats = k.jury.map((v) => el('span', { class: `seat${v ? ` s-${v}` : ''}`, title: v ? SIDES[v].role : 'Empty seat' }));
        fill(juryRow, [
          el('button', { class: 'chip', type: 'button', disabled: k.done ? '' : null, text: `Juror for the Defence · ${k.audience.a}`, onclick: () => { vote(k, 'a'); sync(); } }),
          el('span', { class: 'seats', 'aria-label': `Jury: ${k.audience.a} for the Defence, ${k.audience.b} for the Prosecution` }, seats),
          el('button', { class: 'chip', type: 'button', disabled: k.done ? '' : null, text: `Juror for the Prosecution · ${k.audience.b}`, onclick: () => { vote(k, 'b'); sync(); } }),
        ]);
        record.textContent = transcript(k);
      };

      const open = () => {
        const motion = custom.value.trim() || motionPick.select.value;
        cited.clear();
        state.court = openCase({ motion, names: { a: nameA.value.trim(), b: nameB.value.trim() }, at: hooks.now() });
        fill(verdictBox, []);
        sync();
        strike();
        say(line('courtOpen', state.court.number.replace(/-/g, ' '), state.court.names.a, state.court.names.b));
      };

      const submit = () => {
        const k = state.court;
        if (!k) return;
        const result = argue(k, box.value, { cited: [...cited], at: hooks.now() });
        if (!result) return;
        box.value = '';
        cited.clear();
        const fallacies = line('courtFallacies') || {};
        const bench = result.autoObjections.map((f) => fallacies[f] || f);
        sync();
        say([line('courtScore', k.names[result.side], result.points), bench.length ? line('courtBench', bench.join(', ')) : ''].filter(Boolean).join(' '));
        if (bench.length) strike();
      };

      const raise = (kind) => {
        const k = state.court;
        if (!k) return;
        const ruling = object(k, kind, { at: hooks.now() });
        if (!ruling.ok) return;
        strike();
        sync();
        const label = (line('courtObjections') || {})[kind] || ruling.objection.label;
        say(ruling.sustained ? line('courtSustained', label) : line('courtOverruled', label));
      };

      const witness = async (letter) => {
        const k = state.court;
        if (!k) return;
        const e = callWitness(k, letter, { at: hooks.now() });
        if (!e) return;
        sync();
        fill(verdictBox, [el('b', { text: `Exhibit ${e.letter} on the stand` }), el('p', { text: `Direct: ${e.finding}` }), el('p', { text: `Cross: ${e.limitation}` }), el('p', { class: 'meta', text: `${e.title} · ${e.journal || ''} ${e.year} · ${e.design}${e.n ? ` · n = ${e.n}` : ''}` })]);
        const [finding, limitation] = await Promise.all([localise(e.finding), localise(e.limitation)]);
        await say(`${line('courtWitness', e.letter)} ${finding}`);
        await say(`${line('courtCross')} ${limitation}`);
      };

      const verdict = () => {
        const k = state.court;
        if (!k || k.done) return;
        const v = deliberate(k, { at: hooks.now() });
        gavelSound();
        setTimeout(() => { if (state.court === k) { k.gavelAt = hooks.now(); gavelSound(); } }, 700);
        sync();
        const sentence = (line('courtSentence') || {})[k.level] || '';
        fill(verdictBox, [
          el('b', { class: 'verdict', text: v.winner ? `Verdict for the ${SIDES[v.winner].role} (${k.names[v.winner]}) · ${Math.round(v.score[v.winner] * 100)}–${Math.round(v.score[v.winner === 'a' ? 'b' : 'a'] * 100)}` : 'No majority — a draw' }),
          el('p', { class: 'meta', text: `Judge’s scorecard 70% · jury ${v.jury.a}–${v.jury.b} (30%). The room’s votes sat first; empty seats followed the scorecard.` }),
          el('p', { text: `The library on the motion: ${k.lean}` }),
          el('p', { class: 'sentence', text: `Sentence: ${sentence}` }),
        ]);
        const spokenName = v.winner ? k.names[v.winner] : '';
        say([v.winner ? line('courtVerdict', spokenName, Math.max(v.jury.a, v.jury.b), Math.min(v.jury.a, v.jury.b)) : line('courtDraw', v.jury.a, v.jury.b), sentence].join(' '));
      };

      const download = () => {
        if (!state.court) return;
        const blob = new Blob([transcript(state.court)], { type: 'text/plain;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `${state.court.number}.txt` });
        document.body.append(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      };

      api.arena = (motion) => {
        hooks.go(hooks.index('arena'));
        if (motion) { custom.value = motion; open(); }
      };
      sync();
      return [
        motionPick.node, el('label', { class: 'field' }, [el('span', { text: 'Or put your own claim on trial' }), custom]),
        el('div', { class: 'pair' }, [el('label', { class: 'field' }, [el('span', { text: 'Defence · FOR' }), nameA]), el('label', { class: 'field' }, [el('span', { text: 'Prosecution · AGAINST' }), nameB])]),
        el('div', { class: 'pair' }, [
          el('button', { class: 'btn-small', type: 'button', text: '⚖ Open the case', onclick: open }),
          el('button', { class: 'chip', type: 'button', text: '🔨 Order!', onclick: () => { strike(); say(line('courtOrder')); } }),
        ]),
        header, exhibitsBox, turnLabel, box,
        el('div', { class: 'pair' }, [
          el('button', { class: 'chip', type: 'button', text: 'Submit argument', onclick: submit }),
          el('button', { class: 'chip', type: 'button', text: 'Call the verdict', onclick: verdict }),
        ]),
        objectionRow, juryRow, verdictBox,
        el('details', { class: 'hub-more' }, [
          el('summary', { text: `Court record · ${JURY_SIZE} jurors · timestamped` }),
          record,
          el('button', { class: 'chip', type: 'button', text: '⬇ Download transcript (.txt)', onclick: download }),
        ]),
      ];
    },
  };
}
