/**
 * Roster — starters, bench, and a verdict on every slot.
 *
 * The compare drawer is the part that earns its place: two players, the same
 * context, the drivers side by side, and — when one of them is on the bench —
 * a way to act on the answer without leaving for the provider's app.
 *
 * @module exposure/screens/lineup
 */

import { el, num } from '../dom.js';
import { benchOf, startersOf } from '../data/leagues.js';
import { comparePlayers, startSit } from '../engine/startsit.js';
import {
  activeLeague, getState, setActiveLeague, slotAccepts, swapIntoLineup,
} from '../store.js';
import {
  avatar, confidenceMeter, emptyState, footer, injuryFlag, kv, openSheet, playerRow,
  sectionTitle, verdictPill,
} from '../ui/components.js';

/** The player currently held for comparison, if any. */
let compareHold = null;

/**
 * Render the lineup screen.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderLineup(ctx) {
  const state = getState();
  const view = el('section.screen');

  if (!state.leagues.length) {
    view.append(emptyState({
      title: 'No lineup to show',
      body: 'Connect a league to see your starters, your bench, and a start/sit call with the reasoning behind it.',
      actionLabel: 'Connect a league',
      onAction: () => ctx.go('onboarding', { step: 'connect' }),
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  if (ctx.params?.league && ctx.params.league !== state.activeLeagueId) {
    setActiveLeague(ctx.params.league);
  }
  const league = activeLeague();
  const week = state.week;
  const scoring = league.scoring;

  view.append(sectionTitle(league.teamName, `${league.name} · ${scoring.toUpperCase()}`));

  const starters = startersOf(league);
  const bench = benchOf(league);

  view.append(el('div.list-head', {}, [
    el('span.list-head-label', { text: 'Starters' }),
    el('span.list-head-note', { text: `Week ${week}` }),
  ]));

  view.append(el('div.list', {}, starters.map((row) => {
    if (!row.player) {
      return el('div.row.row-empty', {}, [
        el('span.row-lead', { text: row.slot }),
        el('span.row-body', { text: 'Empty slot' }),
      ]);
    }
    const call = startSit(row.player, { week, scoring, slot: row.slot });
    return el('div.slot-block', {}, [
      playerRow({
        player: row.player,
        week,
        lead: row.slot,
        right: [verdictPill(call.verdict, { small: true }), confidenceMeter(call.confidence)],
        onClick: () => ctx.go('player', { id: row.player.id }),
      }),
      el('p.slot-reason', { text: call.reason }),
      el('div.slot-actions', {}, [
        el('button.btn.tiny', {
          type: 'button',
          text: compareHold && compareHold.id !== row.player.id ? `Compare with ${compareHold.name}` : 'Compare',
          onclick: () => holdOrCompare(row.player, ctx, { week, scoring, slot: row.slot, league, slotIndex: row.index }),
        }),
        el('button.btn.tiny.ghost', {
          type: 'button',
          text: 'Player card',
          onclick: () => ctx.go('player', { id: row.player.id }),
        }),
      ]),
    ]);
  })));

  view.append(el('div.list-head', {}, [
    el('span.list-head-label', { text: 'Bench' }),
    el('span.list-head-note', { text: `${bench.length} players` }),
  ]));

  view.append(el('div.list', {}, bench.map(({ player: p }) => {
    if (!p) return null;
    const call = startSit(p, { week, scoring, slot: p.pos });
    return el('div.slot-block', {}, [
      playerRow({
        player: p,
        week,
        lead: 'BN',
        right: [verdictPill(call.verdict, { small: true }), confidenceMeter(call.confidence)],
        onClick: () => ctx.go('player', { id: p.id }),
      }),
      el('div.slot-actions', {}, [
        el('button.btn.tiny', {
          type: 'button',
          text: compareHold && compareHold.id !== p.id ? `Compare with ${compareHold.name}` : 'Compare',
          onclick: () => holdOrCompare(p, ctx, { week, scoring, slot: p.pos, league, slotIndex: -1 }),
        }),
      ]),
    ]);
  }).filter(Boolean)));

  view.append(footer(ctx.onResponsible));
  return view;
}

/**
 * Hold the first player, then open the drawer when a second is picked.
 *
 * @param {object} p Player record.
 * @param {object} ctx Screen context.
 * @param {object} context Slot context.
 */
function holdOrCompare(p, ctx, context) {
  if (!compareHold) {
    compareHold = p;
    ctx.toast(`Holding ${p.name}. Pick a second player to compare.`);
    ctx.refresh();
    return;
  }
  if (compareHold.id === p.id) {
    compareHold = null;
    ctx.toast('Comparison cleared.');
    ctx.refresh();
    return;
  }
  const first = compareHold;
  compareHold = null;
  openCompare(first, p, ctx, context);
  ctx.refresh();
}

/**
 * The compare drawer.
 *
 * @param {object} a First player.
 * @param {object} b Second player.
 * @param {object} ctx Screen context.
 * @param {object} context Slot context: week, scoring, league and slot index.
 */
export function openCompare(a, b, ctx, context) {
  const { week, scoring, league } = context;
  const result = comparePlayers(a, b, { week, scoring, slot: context.slot });
  const [callA, callB] = a.id === result.winner.id ? result.calls : [result.calls[1], result.calls[0]];

  const column = (p, call) => el('div.compare-col', {}, [
    el('div.compare-head', {}, [avatar(p, 'sm'), el('span.compare-name', {}, [p.name, injuryFlag(p)].filter(Boolean))]),
    el('div.compare-verdict', {}, [verdictPill(call.verdict, { small: true }), confidenceMeter(call.confidence)]),
    ...call.drivers.map((driver) => el('div.compare-driver', {}, [
      el('span.compare-driver-label', { text: driver.label }),
      el('span.compare-driver-value', {
        class: driver.value > 0.5 ? 'up' : (driver.value < -0.5 ? 'down' : ''),
        text: `${driver.value >= 0 ? '+' : ''}${num(driver.value)}`,
      }),
    ])),
  ]);

  // Only offer the swap when it is legal: a bench player, into a slot that
  // accepts the position. Anything else would be a button that lies.
  const swappable = league && context.slotIndex >= 0
    && league.bench.includes(b.id) && slotAccepts(context.slot, b.pos);

  openSheet({
    title: 'Compare',
    content: [
      el('p.compare-summary', { text: result.summary }),
      el('div.compare-grid', {}, [column(a, callA), column(b, callB)]),
      kv('Slot', context.slot),
      kv('Scoring', scoring.toUpperCase()),
      el('p.compare-reason', { text: callA.reason }),
      el('p.compare-reason', { text: callB.reason }),
      swappable
        ? el('button.btn.primary.wide', {
          type: 'button',
          text: `Move ${b.name} into ${context.slot}`,
          onclick: () => {
            swapIntoLineup(league.id, context.slotIndex, b.id);
            ctx.toast(`${b.name} is now starting at ${context.slot}.`);
            ctx.refresh();
            document.querySelector('.scrim')?.remove();
          },
        })
        : null,
    ].filter(Boolean),
  });
}

/**
 * Clear any held comparison. Called by the shell on navigation so a hold does
 * not survive a trip to another screen.
 */
export function clearCompareHold() {
  compareHold = null;
}
