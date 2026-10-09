/**
 * The interactive half of each station's card: chips, sliders, selectors and
 * readouts. Every control writes to the shared state the holograms and wall
 * screens read, so a choice here moves the room.
 *
 * The tools are ASTRA's own engines — compare, the reviewer panel, the claim
 * analyser, the study simulator, the paper decoder and the content studio —
 * not re-implementations, so the chamber and the main platform always agree.
 *
 * @module astra/showcase/cards
 */

import { PEPTIDES, SYSTEMS, findAny, pubmedUrl } from '../js/data/peptides.js';
import { compare } from '../js/compare.js';
import { REVIEWERS, SIM_CONTROLS, convene, simulate } from '../js/reviewers.js';
import { analyseClaim } from '../js/claims.js';
import { decode } from '../js/decoder.js';
import { generatePackage, toMarkdown } from '../js/studio.js';
import { TIERS } from '../js/evidence.js';
import { entryReading } from '../js/engine.js';
import {
  AGONISTS, CHAINS, MYTHS, READINGS, SITES, STUDIES, SUBJECTS,
  requiredEfficiency, sppsYield, studyAbstract,
} from './sections.js';

/* -------------------------------------------------------------- helpers */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

/** A row of chips with one selected; returns the row with `select(id)`. */
export function chipRow(items, current, onPick) {
  const row = el('div', { class: 'chips', role: 'group' });
  const buttons = items.map((item) => el('button', {
    class: `chip${item.id === current ? ' on' : ''}`, type: 'button', 'aria-pressed': String(item.id === current), text: item.name || item.label,
    onclick: () => { row.select(item.id); onPick(item); },
  }));
  row.append(...buttons);
  row.select = (id) => {
    buttons.forEach((b, i) => {
      const on = items[i].id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  return row;
}

/** A labelled select box. */
function picker(label, options, value, onChange) {
  const select = el('select', { 'aria-label': label, onchange: () => onChange(select.value) }, options.map((o) => el('option', { value: o.id, text: o.name })));
  select.value = value;
  return { node: el('label', { class: 'field' }, [el('span', { text: label }), select]), select };
}

const fill = (node, children) => { node.replaceChildren(...[].concat(children).filter(Boolean)); };

/* ------------------------------------------------------------ the cards */

/**
 * Build every station's interactive extras.
 *
 * @param {object} state Shared state.
 * @param {{ go: Function, say: Function, now: Function, index: Function }} hooks Room hooks.
 * @returns {Record<string, Function>} Builders keyed by station id, plus `api` for Colin.
 */
export function buildCards(state, hooks) {
  const api = {};

  const cards = {
    map() {
      const readout = el('div', { class: 'readout' }, [el('span', { text: 'Pick a compound to light its threads.' })]);
      const show = (id) => {
        const peptide = PEPTIDES.find((p) => p.id === id);
        if (!peptide) return;
        state.mapSelected = id;
        const reading = READINGS.find((r) => r.id === id);
        fill(readout, [
          el('b', { text: `${peptide.name} · ${Math.round(reading.score * 100)}% ${reading.band.label}` }),
          el('br'),
          document.createTextNode(`Systems: ${peptide.systems.map((s) => SYSTEMS.find((x) => x.id === s)?.label || s).join(', ')}. `),
          document.createTextNode(`Related: ${(peptide.related || []).map((r) => findAny(r)?.name || r).join(', ') || 'none'}.`),
          el('div', { class: 'row-actions' }, [
            el('button', { class: 'chip', type: 'button', text: 'Debate it →', onclick: () => api.debate(id) }),
            el('button', { class: 'chip', type: 'button', text: 'Its studies →', onclick: () => api.studies({ peptide: id }) }),
          ]),
        ]);
      };
      const row = chipRow(PEPTIDES.map((p) => ({ id: p.id, name: p.name })), null, (p) => show(p.id));
      api.map = (id) => { row.select(id); show(id); hooks.go(hooks.index('map')); };
      return [row, readout];
    },

    analysis() {
      const readout = el('div', { class: 'readout' });
      const show = (r) => {
        state.compound = r.id;
        state.highlight.set(r.band.accent);
        fill(readout, [el('b', { text: `${r.name} · ${Math.round(r.score * 100)}%` }), document.createTextNode(` ${r.band.label}. ${r.klass}.`)]);
      };
      show(READINGS[0]);
      return [chipRow(READINGS, state.compound, show), readout];
    },

    compare() {
      const verdict = el('div', { class: 'readout' });
      const table = el('div', { class: 'axes' });
      let left = 'bpc-157';
      let right = 'semaglutide';
      const run = () => {
        if (left === right) { fill(verdict, [el('b', { text: 'Pick two different compounds.' })]); return; }
        const result = compare(left, right);
        if (!result) return;
        state.compareResult = result;
        const side = (col) => ({ name: col.entry.name, score: col.reading.score, accent: col.reading.band.accent });
        state.compare = { left: side(result.left), right: side(result.right) };
        fill(verdict, [el('b', { text: result.verdict.headline }), el('br'), document.createTextNode(result.verdict.body)]);
        fill(table, result.axes.filter((a) => ['quality', 'population', 'regulatory'].includes(a.id)).map((axis) => el('div', { class: 'axis' }, [
          el('span', { class: 'axis-label', text: axis.label }),
          el('p', { text: `${result.left.entry.name}: ${axis.left}` }),
          el('p', { text: `${result.right.entry.name}: ${axis.right}` }),
        ])));
      };
      const a = picker('Left pan', SUBJECTS, left, (v) => { left = v; run(); });
      const b = picker('Right pan', SUBJECTS, right, (v) => { right = v; run(); });
      const swap = el('button', { class: 'chip', type: 'button', text: '⇄ Swap', onclick: () => { [left, right] = [right, left]; a.select.value = left; b.select.value = right; run(); } });
      run();
      api.compare = (l, r) => { left = l; right = r; a.select.value = l; b.select.value = r; run(); hooks.go(hooks.index('compare')); };
      return [el('div', { class: 'pair' }, [a.node, b.node, swap]), verdict, table];
    },

    debate() {
      const view = el('div', { class: 'debate' });
      const speakers = el('div', { class: 'chips' });
      let subject = 'bpc-157';
      let reading = false;
      const render = () => {
        const result = state.debateResult;
        const i = state.debate.speaker;
        const opinion = result.opinions[i];
        fill(speakers, REVIEWERS.map((reviewer, k) => el('button', {
          class: `chip${k === i ? ' on' : ''}`, type: 'button', text: reviewer.name.replace(' Reviewer', ''),
          style: `--chip: ${reviewer.accent}`, onclick: () => { state.debate.speaker = k; render(); },
        })));
        fill(view, [
          el('p', { class: 'speaker', text: `${opinion.reviewer.name} · ${opinion.position}` }),
          el('blockquote', { text: opinion.body }),
          el('p', { class: 'verdict', text: result.consensus.verdict }),
          el('details', {}, [
            el('summary', { text: 'Agreed and disputed' }),
            el('ul', { class: 'facts' }, [...result.consensus.agreed.map((x) => el('li', { text: `Agreed: ${x}` })), ...result.consensus.disputed.map((x) => el('li', { text: `Disputed: ${x}` }))]),
          ]),
        ]);
      };
      const run = (id) => {
        subject = id;
        const result = convene(id);
        if (!result) return;
        state.debateResult = result;
        state.debate = { speaker: 0, accent: entryReading(result.entry).band.accent };
        render();
      };
      const pick = picker('Subject', SUBJECTS, subject, run);
      const aloud = el('button', {
        class: 'chip', type: 'button', text: '🔊 Colin reads the debate',
        onclick: async () => {
          if (reading) { reading = false; hooks.stop(); aloud.textContent = '🔊 Colin reads the debate'; return; }
          reading = true;
          aloud.textContent = '■ Stop reading';
          for (let k = 0; k < REVIEWERS.length && reading; k += 1) {
            state.debate.speaker = k;
            render();
            const o = state.debateResult.opinions[k];
            await hooks.say(`${o.reviewer.name}. ${o.body}`);
          }
          if (reading) await hooks.say(`And the verdict. ${state.debateResult.consensus.verdict} Lively lot, aren’t they.`);
          reading = false;
          aloud.textContent = '🔊 Colin reads the debate';
        },
      });
      run(subject);
      api.debate = (id) => { pick.select.value = id; run(id); hooks.go(hooks.index('debate')); };
      return [el('div', { class: 'pair' }, [pick.node, aloud]), speakers, view];
    },

    myth() {
      const input = el('textarea', { rows: '3', placeholder: 'Paste a claim, caption or ad line…', 'aria-label': 'Claim to check' });
      const out = el('div', { class: 'readout' });
      const run = (text) => {
        if (text !== undefined) input.value = text;
        const result = analyseClaim(input.value);
        state.mythResult = result;
        if (!result.ok) { fill(out, [document.createTextNode(result.reason)]); state.myth = { level: 'idle', at: hooks.now() }; return null; }
        state.myth = { level: result.verdict.level, at: hooks.now() };
        fill(out, [
          el('b', { class: `level level-${result.verdict.level}`, text: result.verdict.level.toUpperCase() }),
          document.createTextNode(` ${result.verdict.headline}`),
          el('br'),
          document.createTextNode(result.verdict.body),
          el('p', { class: 'meta', text: `${result.subject ? result.subject.name : 'No compound recognised'} · best tier ${result.tierInfo.label} · ${result.supporting.length} supporting, ${result.contradicting.length} contradicting · wording ${result.compliance.severity}` }),
        ]);
        return result;
      };
      const check = el('button', { class: 'btn-small', type: 'button', text: 'Check it', onclick: () => {
        const result = run();
        if (result) hooks.say(mythQuip(result));
      } });
      const samples = el('div', { class: 'chips' }, MYTHS.map((m) => el('button', { class: 'chip', type: 'button', text: m, onclick: () => { const r = run(m); if (r) hooks.say(mythQuip(r)); } })));
      api.myth = (text) => { hooks.go(hooks.index('myth')); const r = run(text); return r; };
      return [input, el('div', { class: 'pair' }, [check]), samples, out];
    },

    simulator() {
      const settings = Object.fromEntries(SIM_CONTROLS.map((c) => [c.id, c.value]));
      const out = el('div', { class: 'readout' });
      const run = () => {
        const r = simulate(settings);
        state.simResult = r;
        state.sim = { fpr: r.falsePositiveRisk, power: r.power, at: hooks.now() };
        fill(out, [
          el('b', { text: `Power ${Math.round(r.power * 100)}% · false-positive risk ${Math.round(r.falsePositiveRisk * 100)}% · detectable d ≈ ${r.detectable.toFixed(2)}` }),
          el('br'),
          document.createTextNode(r.verdict.text),
          r.notes.length ? el('ul', { class: 'facts' }, r.notes.slice(0, 3).map((n) => el('li', { text: n }))) : null,
        ]);
      };
      const controls = SIM_CONTROLS.map((control) => {
        if (control.kind === 'toggle') {
          const box = el('input', { type: 'checkbox', onchange: () => { settings[control.id] = box.checked; run(); } });
          box.checked = control.value;
          return el('label', { class: 'toggle' }, [box, el('span', { text: control.label })]);
        }
        const value = el('b', { text: String(control.value) });
        const range = el('input', { type: 'range', min: String(control.min), max: String(control.max), step: String(control.step), value: String(control.value), 'aria-label': control.label,
          oninput: () => { settings[control.id] = Number(range.value); value.textContent = range.value; run(); } });
        return el('label', { class: 'slider' }, [el('span', {}, [`${control.label} = `, value]), range]);
      });
      run();
      return [el('div', { class: 'controls' }, controls), out];
    },

    studies() {
      const list = el('div', { class: 'study-list' });
      const count = el('p', { class: 'meta' });
      let tierFilter = null;
      let peptideFilter = null;
      const render = () => {
        state.studyTier = tierFilter;
        state.studyPeptide = peptideFilter;
        const shown = STUDIES.filter((s) => (!tierFilter || s.tier === tierFilter) && (!peptideFilter || s.peptide === peptideFilter));
        count.textContent = `${shown.length} of ${STUDIES.length} studies`;
        fill(list, shown.map((study) => {
          const tierInfo = TIERS.find((t) => t.id === study.tier);
          return el('article', { class: `study${state.studyPicked === study.id ? ' on' : ''}`, tabindex: '0', onclick: () => { state.studyPicked = study.id; render(); } }, [
            el('p', { class: 'study-tier', style: `color:${tierInfo?.accent}`, text: `${tierInfo?.label || study.tier} · ${study.peptideName}` }),
            el('h3', { text: study.title }),
            el('p', { class: 'meta', text: `${study.journal} · ${study.year}${study.n ? ` · n=${study.n}` : ''} · ${study.design}` }),
            state.studyPicked === study.id ? el('p', { text: study.finding }) : null,
            state.studyPicked === study.id ? el('p', { class: 'meta', text: `Catch: ${study.limitation}` }) : null,
            el('a', { href: pubmedUrl(study), target: '_blank', rel: 'noopener', text: 'Search PubMed ↗', onclick: (e) => e.stopPropagation() }),
          ]);
        }));
      };
      const tiers = TIERS.filter((t) => STUDIES.some((s) => s.tier === t.id));
      const tierRow = chipRow([{ id: 'all', name: 'All tiers' }, ...tiers.map((t) => ({ id: t.id, name: t.label }))], 'all', (t) => { tierFilter = t.id === 'all' ? null : t.id; render(); });
      const pick = picker('Compound', [{ id: 'all', name: 'All compounds' }, ...PEPTIDES.map((p) => ({ id: p.id, name: p.name }))], 'all', (v) => { peptideFilter = v === 'all' ? null : v; render(); });
      render();
      api.studies = ({ peptide } = {}) => { peptideFilter = peptide || null; pick.select.value = peptide || 'all'; render(); hooks.go(hooks.index('studies')); };
      return [tierRow, pick.node, count, list];
    },

    studio() {
      const viewer = el('div', { class: 'asset' });
      const nav = el('div', { class: 'pair' });
      let peptideId = 'retatrutide';
      let studyId = null;
      const studyPick = picker('Study', [], '', (v) => { studyId = v; });
      const fillStudies = () => {
        const peptide = PEPTIDES.find((p) => p.id === peptideId);
        fill(studyPick.select, peptide.studies.map((s) => el('option', { value: s.id, text: `${s.year} · ${s.title}` })));
        studyId = peptide.studies[0]?.id;
        studyPick.select.value = studyId;
      };
      const show = () => {
        const { pack, index } = state.studio;
        const asset = pack.assets[index];
        state.studio.asset = { ...asset, blocked: asset.compliance.severity === 'block' };
        fill(viewer, [
          el('p', { class: 'meta', text: `${index + 1} / ${pack.assets.length} · ${asset.label}` }),
          el('h3', { text: asset.title || asset.label }),
          el('pre', { text: asset.body || '' }),
          el('p', { class: `guard guard-${asset.compliance.severity}`, text: asset.compliance.severity === 'clear' ? '✓ Clear to publish with the disclosure' : asset.compliance.severity === 'warn' ? '⚠ Publish with edits' : '✕ Blocked by the guardian' }),
          el('p', { class: 'meta', text: asset.disclosure }),
        ]);
      };
      const generate = () => {
        const peptide = PEPTIDES.find((p) => p.id === peptideId);
        const study = peptide.studies.find((s) => s.id === studyId) || peptide.studies[0];
        const report = decode(studyAbstract(study));
        const pack = generatePackage({ report, peptide });
        state.studio = { pack, index: 0, peptideName: peptide.name, studyTitle: study.title };
        show();
        fill(nav, [
          el('button', { class: 'chip', type: 'button', text: '‹ Prev', onclick: () => { state.studio.index = (state.studio.index - 1 + pack.assets.length) % pack.assets.length; show(); } }),
          el('button', { class: 'chip', type: 'button', text: 'Next ›', onclick: () => { state.studio.index = (state.studio.index + 1) % pack.assets.length; show(); } }),
          el('button', { class: 'chip', type: 'button', text: 'Copy asset', onclick: () => copy(`${state.studio.asset.title}\n\n${state.studio.asset.body}\n\n${state.studio.asset.disclosure}`) }),
          el('button', { class: 'chip', type: 'button', text: 'Copy whole pack', onclick: () => copy(toMarkdown(pack)) }),
        ]);
      };
      const peptidePick = picker('Compound', PEPTIDES.map((p) => ({ id: p.id, name: p.name })), peptideId, (v) => { peptideId = v; fillStudies(); generate(); });
      studyPick.select.addEventListener('change', generate);
      fillStudies();
      generate();
      api.studio = (id) => { peptideId = id; peptidePick.select.value = id; fillStudies(); generate(); hooks.go(hooks.index('studio')); };
      return [peptidePick.node, studyPick.node, nav, viewer];
    },

    agonists() {
      const readout = el('div', { class: 'readout' });
      const show = (a) => {
        fill(readout, [
          el('b', { text: `${a.name} → ${a.targets.join(' + ')}` }),
          el('br'),
          document.createTextNode(`${a.trial}, ${a.dose}, ${a.weeks} weeks: −${a.drug}% vs −${a.placebo}% placebo, so Δ = ${a.drug} − ${a.placebo} = ${a.delta} points. Half-life ${a.halfLife}; ${a.residues} residues. ${a.status}.`),
        ]);
      };
      show(state.agonist);
      const row = chipRow(AGONISTS, state.agonist.id, (a) => { state.agonist = a; state.agonistPinned = true; show(a); });
      api.agonistsSync = (a) => { row.select(a.id); show(a); };
      return [row, readout];
    },

    synthesis() {
      const readout = el('div', { class: 'readout' });
      const pLabel = el('b');
      const lLabel = el('b');
      const pInput = el('input', { type: 'range', min: '0.970', max: '0.999', step: '0.001', value: String(state.p), 'aria-label': 'Per-step efficiency p' });
      const lInput = el('input', { type: 'range', min: '2', max: '60', step: '1', value: String(state.length), 'aria-label': 'Chain length L' });
      const update = () => {
        state.p = Number(pInput.value);
        state.length = Number(lInput.value);
        const { yield: Y, reactions, failed } = sppsYield(state.p, state.length);
        state.yield = Y;
        pLabel.textContent = `${(state.p * 100).toFixed(1)}%`;
        lLabel.textContent = String(state.length);
        const need = requiredEfficiency(0.87, state.length);
        fill(readout, [
          el('span', { class: 'mono', text: `Y = ${state.p.toFixed(3)}^(2·(${state.length}−1)) = ${state.p.toFixed(3)}^${reactions}` }),
          el('br'),
          el('b', { text: `${(Y * 100).toFixed(1)}% full length` }),
          document.createTextNode(` · ${(failed * 100).toFixed(1)}% truncated or missing a residue. Reaching 87% at this length needs p ≥ ${(need * 100).toFixed(2)}% per step.`),
        ]);
      };
      const presets = chipRow(CHAINS, 'reta', (c) => { lInput.value = String(c.length); update(); });
      pInput.addEventListener('input', update);
      lInput.addEventListener('input', () => { update(); presets.select(null); });
      update();
      return [
        presets,
        el('label', { class: 'slider' }, [el('span', {}, ['Per-step efficiency p = ', pLabel]), pInput]),
        el('label', { class: 'slider' }, [el('span', {}, ['Chain length L = ', lLabel, ' residues']), lInput]),
        readout,
      ];
    },

    telemetry() {
      const readout = el('div', { class: 'readout' });
      const show = (site) => { state.site = site.id; fill(readout, [el('b', { text: site.label }), el('br'), document.createTextNode(site.text)]); };
      show(SITES[0]);
      return [chipRow(SITES, state.site, show), readout];
    },
  };

  return { cards, api };
}

/** Colin's one-liner on a myth verdict, followed by the substance. */
function mythQuip(result) {
  const lead = {
    contradicted: 'Shattered, I’m afraid.',
    unsupported: 'Afraid that one doesn’t survive contact with the library.',
    overstated: 'Ooh. Bit of a stretch, that one.',
    mixed: 'Mixed bag, this one.',
    supported: 'Well, I never. That one actually holds up.',
    unknown: 'I don’t recognise the compound, so I can’t check it.',
  }[result.verdict.level] || 'Checked.';
  return `${lead} ${result.verdict.headline}`;
}

/** Copy text, quietly. */
function copy(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

