/**
 * Exposure — every player the user owns, across every league, plus leans.
 *
 * This is the screen that does not exist inside any single league's app,
 * because no single league can see the others.
 *
 * @module exposure/screens/exposure
 */

import { el, num } from '../dom.js';
import { buildExposure, exposureSummary } from '../engine/exposure.js';
import { startSit } from '../engine/startsit.js';
import { bettingVisible, getState, removeLean } from '../store.js';
import {
  avatar, emptyState, footer, injuryFlag, riskTag, sectionTitle, verdictPill,
} from '../ui/components.js';

/** Whether the table is filtered to overloaded rows only. */
let overloadedOnly = false;

/**
 * Render the exposure screen.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderExposure(ctx) {
  const state = getState();
  const view = el('section.screen');

  if (!state.leagues.length && !state.leans.length) {
    view.append(emptyState({
      title: 'Nothing to be exposed to yet',
      body: 'Connect two or more leagues and this table shows every player you are doubled up on — and what a single injury would cost you.',
      actionLabel: 'Connect a league',
      onAction: () => ctx.go('onboarding', { step: 'connect' }),
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  const rows = buildExposure(state.leagues, bettingVisible() ? state.leans : []);
  const summary = exposureSummary(rows);
  const shown = overloadedOnly ? rows.filter((row) => row.risk === 'OVERLOADED') : rows;

  view.append(sectionTitle('Exposure', `${summary.players} players`));

  view.append(el('div.summary-strip', {}, [
    ['Overloaded', summary.overloaded, 'overloaded'],
    ['Stacked', summary.stacked, 'stacked'],
    ['Leans', summary.leans, 'lean'],
  ].map(([label, value, kind]) => el(`div.summary-cell.summary-${kind}`, {}, [
    el('span.summary-value', { text: String(value) }),
    el('span.summary-label', { text: label }),
  ]))));

  const toggle = el('button.btn.tiny.filter-toggle', {
    type: 'button',
    'aria-pressed': overloadedOnly ? 'true' : 'false',
    text: overloadedOnly ? 'Showing overloaded only' : 'Show only overloaded',
    onclick: () => {
      overloadedOnly = !overloadedOnly;
      ctx.refresh();
    },
  });
  view.append(el('div.filter-bar', {}, [toggle]));

  if (!shown.length) {
    view.append(el('p.muted-note', {
      text: 'No overloaded players. Nothing you own is carrying more than two of your results.',
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  const head = el('div.exp-row.exp-head', { role: 'row' }, [
    el('span.exp-player', { text: 'Player' }),
    el('span.exp-count', { text: 'Started', title: 'Leagues started in' }),
    el('span.exp-count', { text: 'Bench', title: 'Leagues benched in' }),
    el('span.exp-lean', { text: 'Prop lean' }),
    el('span.exp-risk', { text: 'Risk' }),
  ]);

  const body = shown.map((row) => {
    const p = row.player;
    if (!p) return null;
    const call = startSit(p, { week: state.week, scoring: state.settings.defaultScoring, slot: p.pos });
    return el('div.exp-block', {}, [
      el('div.exp-row', { role: 'row' }, [
        el('button.exp-player', {
          type: 'button',
          onclick: () => ctx.go('player', { id: p.id }),
        }, [
          avatar(p, 'sm'),
          el('span.exp-name-block', {}, [
            el('span.exp-name', {}, [p.name, injuryFlag(p)].filter(Boolean)),
            el('span.exp-meta', { text: `${p.team} · ${p.pos}` }),
          ]),
        ]),
        el('span.exp-count', { text: String(row.started) }),
        el('span.exp-count.dim', { text: String(row.benched) }),
        el('span.exp-lean', {}, row.lean
          // The column is narrow, so it carries the side alone; the detail
          // line under the row spells the whole lean out.
          ? [verdictPill(row.lean.side, { small: true })]
          : [el('span.dim', { text: '—' })]),
        el('span.exp-risk', {}, [riskTag(row.risk)]),
      ]),
      el('p.exp-detail', {
        text: [
          row.startedIn.length ? `Started: ${row.startedNames.join(', ')}` : null,
          row.benchedIn.length ? `Bench: ${row.benchedNames.join(', ')}` : null,
          row.lean ? `Lean: ${row.lean.side} ${row.lean.marketLabel}${row.lean.line !== null && row.lean.line !== undefined ? ` ${num(row.lean.line)}` : ''} at ${row.lean.bookName}` : null,
          `Call: ${call.verdict}`,
        ].filter(Boolean).join(' · '),
      }),
      row.lean
        ? el('button.btn.tiny.ghost', {
          type: 'button',
          text: 'Clear lean',
          onclick: () => {
            removeLean(row.lean.playerId, row.lean.marketKey);
            ctx.toast('Lean cleared.');
            ctx.refresh();
          },
        })
        : null,
    ].filter(Boolean));
  }).filter(Boolean);

  view.append(el('div.exp-table', { role: 'table', 'aria-label': 'Exposure by player' }, [head, ...body]));
  view.append(footer(ctx.onResponsible));
  return view;
}
