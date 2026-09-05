/**
 * More — the overflow menu that keeps the bottom bar down to five targets.
 *
 * @module exposure/screens/more
 */

import { el } from '../dom.js';
import { bettingVisible, getState } from '../store.js';
import { footer, legalBlock, sectionTitle } from '../ui/components.js';

/**
 * Render the more screen.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderMore(ctx) {
  const state = getState();
  const view = el('section.screen');
  view.append(sectionTitle('More'));

  const items = [
    ['Command Center', 'Your Sunday board, live states and alerts.', () => ctx.go('command')],
    bettingVisible() ? ['Market Desk', 'The week’s board across three books.', () => ctx.go('market')] : null,
    ['Connect a league', 'Add another ESPN, Sleeper or Yahoo league.', () => ctx.go('onboarding', { step: 'connect' })],
    ['Settings', 'Scoring, leagues, betting visibility, your data.', () => ctx.go('settings')],
  ].filter(Boolean);

  view.append(el('div.list', {}, items.map(([title, note, onClick]) => el('button.row.menu-row', {
    type: 'button',
    onclick: onClick,
  }, [
    el('span.row-body', {}, [
      el('span.row-name', { text: title }),
      el('span.row-sub', { text: note }),
    ]),
    el('span.row-right', {}, [el('span.chev', { 'aria-hidden': 'true', text: '›' })]),
  ]))));

  view.append(el('div.card', {}, [
    sectionTitle('About this desk'),
    el('p.card-note', {
      text: 'EXPOSURE is an independent research tool. It reads your leagues, grades your lineup, and compares publicly quoted numbers across books. It hosts no video, uses no club marks, and takes no wagers.',
    }),
    el('p.card-note', {
      text: `Demo slate, week ${state.week}. Every player, line and stat here is sample data seeded into the app.`,
    }),
    legalBlock(),
  ]));

  view.append(footer(ctx.onResponsible));
  return view;
}
