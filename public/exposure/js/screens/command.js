/**
 * Command Center — the Sunday board.
 *
 * Every player the user is starting anywhere, grouped by game state, with a
 * stat line that moves and an alert rail that says what just happened. The
 * ticks come from the local simulator in `engine/live.js`; there is no live
 * feed in the demo and the screen says so rather than implying one.
 *
 * @module exposure/screens/command
 */

import { el, num } from '../dom.js';
import { createLiveDesk } from '../engine/live.js';
import { getState, subscribe } from '../store.js';
import {
  avatar, emptyState, footer, injuryFlag, sectionTitle,
} from '../ui/components.js';

/** Milliseconds between simulated ticks. */
export const TICK_MS = 2200;

/** The running desk, so navigating away and back does not reset Sunday. */
let desk = null;
let deskKey = '';
let timer = null;

/** Stop the ticker. The shell calls this when the screen unmounts. */
export function stopLiveDesk() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Render the Command Center.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderCommand(ctx) {
  const state = getState();
  const view = el('section.screen');

  if (!state.leagues.length) {
    view.append(emptyState({
      title: 'No Sunday to run',
      body: 'Connect a league and the Command Center tracks every player you are starting, in one board, as the games move.',
      actionLabel: 'Connect a league',
      onAction: () => ctx.go('onboarding', { step: 'connect' }),
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  const week = state.week;
  const playerIds = [...new Set(state.leagues.flatMap((league) => league.starters))];
  const key = `${week}:${playerIds.join(',')}:${state.leagues.map((l) => l.scoring).join(',')}`;
  if (!desk || deskKey !== key) {
    desk = createLiveDesk({
      playerIds,
      week,
      scoring: state.leagues[0]?.scoring || 'ppr',
      leagues: state.leagues,
      // The week 1 demo games are mid-second-half, so open the board there.
      prime: 18,
    });
    deskKey = key;
  }

  view.append(sectionTitle(`Command Center · week ${week}`, 'Demo Sunday', { demo: true }));
  view.append(el('p.card-note', {
    text: 'Simulated ticks, not a live feed. The board replays a demo Sunday so the alerts can be seen without waiting for one.',
  }));

  const alertRail = el('div.alert-rail', { 'aria-live': 'polite', 'aria-label': 'Live alerts' });
  const boardWrap = el('div.live-board');
  view.append(alertRail, boardWrap);

  const paint = () => {
    const rows = desk.rows();
    const groups = [
      ['LIVE', rows.filter((r) => r.state === 'LIVE')],
      ['UPCOMING', rows.filter((r) => r.state === 'UPCOMING')],
      ['FINAL', rows.filter((r) => r.state === 'FINAL')],
    ];
    boardWrap.replaceChildren(...groups.filter(([, list]) => list.length).map(([label, list]) => el('div.live-group', {}, [
      el('div.list-head', {}, [
        el('span.list-head-label', { text: label }),
        el('span.list-head-note', { text: `${list.length} player${list.length === 1 ? '' : 's'}` }),
      ]),
      el('div.list', {}, list.map((row) => liveRow(row, ctx))),
    ])));

    const alerts = desk.alerts().slice(0, 6);
    alertRail.replaceChildren(...(alerts.length
      ? alerts.map((alert) => el(`div.live-alert.alert-${alert.kind.toLowerCase()}`, {}, [
        el('span.live-alert-kind', { text: alert.kind.replace('_', ' ') }),
        el('span.live-alert-text', { text: alert.text }),
      ]))
      : [el('p.muted-note', { text: 'No alerts yet. The board flags droughts, goal-line work, scores and your opponents.' })]));
  };

  paint();
  stopLiveDesk();
  timer = setInterval(() => {
    desk.tick();
    // Only paint while the board is still on screen; a detached node would
    // keep the interval alive for a screen nobody is looking at.
    if (!boardWrap.isConnected) {
      stopLiveDesk();
      return;
    }
    paint();
  }, TICK_MS);

  view.append(footer(ctx.onResponsible));
  return view;
}

/**
 * One live row: who, where, and the stat line so far.
 *
 * @param {object} row Live desk row.
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The row.
 */
function liveRow(row, ctx) {
  const p = row.player;
  const s = row.stats;
  const line = p.pos === 'QB'
    ? `${s.passYds} pass yds · ${s.passTD} TD · ${s.carries} car, ${s.rushYds} yds`
    : `${s.carries} car, ${s.rushYds} yds · ${s.rec}/${s.targets} for ${s.recYds} · ${s.td} TD`;
  const game = row.game;

  return el('button.row.live-row', {
    type: 'button',
    onclick: () => ctx.go('player', { id: p.id }),
    'aria-label': `${p.name}, ${num(row.points)} points`,
  }, [
    avatar(p),
    el('span.row-body', {}, [
      el('span.row-name', {}, [p.name, injuryFlag(p)].filter(Boolean)),
      el('span.row-sub', { text: line }),
      el('span.row-sub.dim', {
        text: game
          ? `${game.away} at ${game.home}${game.state === 'UPCOMING' ? ` · ${game.kickoff}` : ` · ${game.quarter} · ${game.score.away}-${game.score.home}`}`
          : 'No game',
      }),
    ]),
    el('span.row-right', {}, [
      el('span.live-points', { text: num(row.points) }),
      el('span.live-state', { class: `state-${row.state.toLowerCase()}`, text: row.state }),
    ]),
  ]);
}

/** Keep the board in step with lineup changes made elsewhere. */
subscribe(() => {
  const state = getState();
  if (!state.leagues.length) {
    stopLiveDesk();
    desk = null;
    deskKey = '';
  }
});
