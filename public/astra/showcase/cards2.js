/**
 * Cards for the new wing: half-life bench, holo-scan, regulatory globe,
 * Colin vs the influencer and the future wing. (The debate arena became
 * the courtroom; its card is in cards3.js.)
 *
 * @module astra/showcase/cards2
 */

import { PEPTIDES } from '../js/data/peptides.js';
import { chipRow, el, fill, picker } from './cards.js';
import {
  CAPTIONS, FUTURE, PK, REGIONS, REGULATORY, STAGES, STATUS, SYSTEM_LABEL, ZONES,
  compoundsFor, roast, simulatePK, wadaStatus,
} from './wing.js';
import { line } from './colin.js';

/**
 * Build the new wing's cards.
 *
 * @param {object} state Shared state.
 * @param {{ go: Function, say: Function, stop: Function, now: Function, index: Function, api: object }} hooks Room hooks.
 * @returns {Record<string, Function>} Builders keyed by station id.
 */
export function buildWingCards(state, hooks) {
  const api = hooks.api;

  return {
    pk() {
      const out = el('div', { class: 'readout' });
      const intervalLabel = el('b');
      const interval = el('input', { type: 'range', min: '1', max: '14', step: '1', value: '7', 'aria-label': 'Dosing interval in days' });
      const miss = el('input', { type: 'checkbox' });
      const run = () => {
        const drug = PK.find((d) => d.id === state.pk.drug);
        state.pk.interval = Number(interval.value) * 24;
        state.pk.miss = miss.checked;
        intervalLabel.textContent = `${interval.value} day${interval.value === '1' ? '' : 's'}`;
        const native = drug.halfLife < 1;
        if (native) {
          fill(out, [el('b', { text: 'Native GLP-1: t½ ≈ 2 minutes.' }), el('br'), document.createTextNode(`After ten half-lives — about 20 minutes — 0.5¹⁰ ≈ 0.1% is left. ${drug.note}`)]);
          return;
        }
        const sim = simulatePK(drug, { interval: state.pk.interval, miss: state.pk.miss ? 2 : null });
        fill(out, [
          el('span', { class: 'mono', text: `kₑ = ln2 / ${drug.halfLife} h = ${sim.ke.toFixed(4)} /h · R = 1/(1 − e^(−kₑ·${state.pk.interval})) = ${sim.accumulation.toFixed(2)}` }),
          el('br'),
          el('b', { text: `Builds to about ${sim.accumulation.toFixed(1)}× a single dose` }),
          document.createTextNode(`, reaching 90% of steady state in about ${(sim.toSteady90 / 24).toFixed(0)} days; peak-to-trough ${sim.fluctuation.toFixed(2)}. ${state.pk.miss ? 'The missed dose at week 2 shows as a dip that takes several weeks to fully recover. ' : ''}${drug.note}`),
          el('p', { class: 'meta', text: `Source: ${drug.source}. Relative units — not a dosing tool.` }),
        ]);
      };
      const drugs = chipRow(PK.map((d) => ({ id: d.id, name: d.name })), state.pk.drug, (d) => {
        state.pk.drug = d.id;
        interval.value = String(PK.find((x) => x.id === d.id).interval / 24);
        run();
      });
      interval.addEventListener('input', run);
      miss.addEventListener('change', run);
      run();
      return [
        drugs,
        el('label', { class: 'slider' }, [el('span', {}, ['Dosing interval τ = ', intervalLabel]), interval]),
        el('label', { class: 'toggle' }, [miss, el('span', { text: 'Miss the week-2 dose' })]),
        out,
      ];
    },

    scan() {
      const out = el('div', { class: 'readout' }, [document.createTextNode('Tap a glowing zone on the hologram, or pick a system.')]);
      const show = (id) => {
        state.scanSystem = id;
        row.select(id);
        const list = compoundsFor(id);
        fill(out, [
          el('b', { text: SYSTEM_LABEL[id] || id }),
          el('br'),
          list.length
            ? el('ul', { class: 'facts' }, list.map((r) => el('li', { text: `${r.name} — ${Math.round(r.score * 100)}% (${r.band.label})` })))
            : document.createTextNode('No compound in the library targets this system.'),
          list.length ? el('div', { class: 'row-actions' }, [
            el('button', { class: 'chip', type: 'button', text: `Map ${list[0].name} →`, onclick: () => api.map?.(list[0].id) }),
            el('button', { class: 'chip', type: 'button', text: 'Its studies →', onclick: () => api.studies?.({ peptide: list[0].id }) }),
          ]) : null,
        ]);
      };
      const row = chipRow(ZONES.map((z) => ({ id: z.id, name: SYSTEM_LABEL[z.id] || z.id })), null, (z) => show(z.id));
      api.scan = (id) => { hooks.go(hooks.index('scan')); show(id); };
      return [row, out];
    },

    globe() {
      const out = el('div', { class: 'readout' });
      const show = (id) => {
        const peptide = PEPTIDES.find((p) => p.id === id);
        const table = REGULATORY[id] || {};
        const wada = wadaStatus(peptide);
        state.globeCompound = id;
        state.globeBanned = wada.banned;
        fill(out, [
          el('b', { text: peptide.name }),
          el('ul', { class: 'facts' }, REGIONS.map((r) => {
            const status = STATUS[table[r.id] || 'untracked'];
            return el('li', { style: `--dot:${status.color}`, text: `${r.label} (${r.agency}): ${status.label}` });
          })),
          el('p', { text: table.note || '' }),
          el('p', { class: 'meta', text: `Sport (WADA): ${wada.text}` }),
        ]);
      };
      const pick = picker('Compound', PEPTIDES.map((p) => ({ id: p.id, name: p.name })), 'semaglutide', show);
      show('semaglutide');
      api.globe = (id) => { pick.select.value = id; show(id); hooks.go(hooks.index('globe')); };
      return [pick.node, out];
    },

    roast() {
      const input = el('textarea', { rows: '3', placeholder: 'Paste an influencer caption…', 'aria-label': 'Caption to fact-check' });
      const out = el('div', { class: 'roast-out' });
      let performing = false;
      const render = (r) => {
        fill(out, [
          el('p', { class: 'roast-score', text: `Honesty score ${r.score}/100` }),
          ...r.lines.map((l, i) => el('div', { class: `roast-line v-${l.verdict}${state.roastLine === i ? ' on' : ''}` }, [
            el('p', { class: 'said', text: `“${l.line}”` }),
            el('p', { class: 'meta', text: [
              { holds: '✓ Holds up', fails: '✕ Fails the library', hype: '⚠ Hype', neutral: '· Neutral' }[l.verdict],
              l.headline,
              l.hype.length ? `Hype: ${l.hype.join(', ')}` : '',
              l.compliance.findings.length ? `Ad rules: ${l.compliance.findings.map((f) => f.label).join(', ')}` : '',
            ].filter(Boolean).join(' · ') }),
          ])),
          el('details', {}, [el('summary', { text: 'What it could honestly have said' }), el('pre', { text: r.rewrite })]),
        ]);
      };
      const perform = async (text) => {
        if (text !== undefined) input.value = text;
        const r = roast(input.value);
        state.roast = r;
        state.roastLine = -1;
        render(r);
        if (!r.lines.length) return;
        performing = true;
        // The performance: read it straight, with feeling, then go line by line.
        await hooks.say(line('roastIntro'));
        if (!performing) return;
        await hooks.say(input.value.replace(/[^\p{L}\p{N}\s.,!?'’%-]/gu, ''), { pitch: 1.18, rate: 1.06 });
        for (let i = 0; i < r.lines.length && performing; i += 1) {
          state.roastLine = i;
          render(r);
          const l = r.lines[i];
          await hooks.say(`${line('roastVerdict')[l.verdict]}${l.headline ? ` ${l.headline}` : ''}`);
        }
        if (performing) await hooks.say(line('roastScore', r.score));
        state.roastLine = -1;
        render(r);
        performing = false;
      };
      const go = el('button', { class: 'btn-small', type: 'button', text: '🎭 Colin, read it', onclick: () => perform() });
      const stop = el('button', { class: 'chip', type: 'button', text: '■ Stop', onclick: () => { performing = false; hooks.stop(); } });
      const samples = el('div', { class: 'chips' }, CAPTIONS.map((c, i) => el('button', { class: 'chip', type: 'button', text: `Example ${i + 1}`, title: c, onclick: () => perform(c) })));
      api.roast = (caption) => { hooks.go(hooks.index('roast')); perform(caption); };
      return [input, el('div', { class: 'pair' }, [go, stop]), samples, out];
    },

    future() {
      const out = el('div', { class: 'readout' });
      const list = el('div', { class: 'study-list' });
      let stage = null;
      const show = (item) => {
        state.futurePicked = item.id;
        fill(out, [
          el('b', { text: item.name }), el('br'),
          document.createTextNode(item.what), el('br'),
          el('span', { class: 'mono', text: item.result }),
          el('p', { class: 'meta', text: `${item.status} · Source: ${item.source}` }),
        ]);
        render();
      };
      const render = () => {
        const items = FUTURE.filter((f) => !stage || f.stage === stage);
        fill(list, items.map((f) => el('article', { class: `study${state.futurePicked === f.id ? ' on' : ''}`, tabindex: '0', onclick: () => show(f) }, [
          el('p', { class: 'study-tier', text: STAGES.find((s) => s.id === f.stage).label }),
          el('h3', { text: f.name }),
          el('p', { text: f.what }),
        ])));
      };
      const row = chipRow([{ id: 'all', name: 'All' }, ...STAGES.map((s) => ({ id: s.id, name: s.label }))], 'all', (s) => { stage = s.id === 'all' ? null : s.id; render(); });
      show(FUTURE[0]);
      return [row, out, list];
    },
  };
}
