/**
 * Home — this week, across every connected league.
 *
 * One card per team, and above them the concentration alerts, because the
 * thing a user cannot see anywhere else is how much of their Sunday rests on
 * one player.
 *
 * @module exposure/screens/home
 */

import { el, num } from '../dom.js';
import { opponentTeam, projectedFor, recordThrough, startersOf } from '../data/leagues.js';
import { concentrationAlerts } from '../engine/exposure.js';
import { startSit } from '../engine/startsit.js';
import { getState } from '../store.js';
import {
  confidenceMeter, emptyState, footer, injuryFlag, riskTag, sectionTitle, verdictPill,
} from '../ui/components.js';

/**
 * Render the home screen.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderHome(ctx) {
  const state = getState();
  const week = state.week;
  const view = el('section.screen');

  if (!state.leagues.length) {
    view.append(emptyState({
      title: 'No leagues connected',
      body: 'Connect a league and this screen fills with your teams, their matchups, and every player you are doubled up on.',
      actionLabel: 'Connect a league',
      onAction: () => ctx.go('onboarding', { step: 'connect' }),
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  const alerts = concentrationAlerts(state.leagues, state.leans);
  view.append(sectionTitle(`Week ${week}`, `${state.leagues.length} league${state.leagues.length === 1 ? '' : 's'}`));

  if (alerts.length) {
    view.append(el('div.alert-stack', {}, alerts.slice(0, 4).map((alert) => el('button.alert-card', {
      type: 'button',
      onclick: () => ctx.go('player', { id: alert.playerId }),
    }, [
      el('div.alert-top', {}, [
        el('span.alert-title', { text: alert.headline }),
        riskTag(alert.risk),
      ]),
      el('p.alert-detail', { text: alert.detail }),
    ]))));
  } else {
    view.append(el('p.muted-note', {
      text: 'No concentration flags this week — no player is carrying more than one of your results.',
    }));
  }

  for (const league of state.leagues) {
    view.append(leagueCard(league, week, ctx));
  }

  view.append(footer(ctx.onResponsible));
  return view;
}

/**
 * One league's week: record, projection against the opponent, and the players
 * carrying a designation or a note.
 *
 * @param {object} league The league.
 * @param {number} week Week number.
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The card.
 */
function leagueCard(league, week, ctx) {
  const record = recordThrough(league, week);
  const projected = projectedFor(league);
  const opponent = opponentTeam(league, week);
  const edge = Math.round((projected - opponent.projected) * 10) / 10;

  const flagged = startersOf(league)
    .filter((row) => row.player)
    .map((row) => ({ row, call: startSit(row.player, { week, scoring: league.scoring, slot: row.slot }) }))
    .filter(({ row, call }) => row.player.injury.status !== 'ACTIVE'
      || row.player.news.length
      || call.verdict !== 'START');

  return el('article.card.league-card', {}, [
    el('div.league-head', {}, [
      el('div.league-id', {}, [
        el('h3.league-team', { text: league.teamName }),
        el('span.league-name', { text: `${league.name} · ${league.scoring.toUpperCase()} · ${league.teams}-team` }),
      ]),
      el('span.league-record', { text: record.text, 'aria-label': `Record ${record.w} and ${record.l}` }),
    ]),
    el('div.matchup', {}, [
      el('div.matchup-side', {}, [
        el('span.matchup-label', { text: 'Projected' }),
        el('span.matchup-points', { text: num(projected) }),
      ]),
      el('div.matchup-vs', {}, [
        el('span.matchup-edge', {
          class: edge >= 0 ? 'up' : 'down',
          text: `${edge >= 0 ? '+' : ''}${num(edge)}`,
        }),
        el('span.matchup-label', { text: 'vs' }),
      ]),
      el('div.matchup-side.right', {}, [
        el('span.matchup-label', { text: opponent.name }),
        el('span.matchup-points', { text: num(opponent.projected) }),
      ]),
    ]),
    flagged.length
      ? el('ul.flag-list', {}, flagged.slice(0, 5).map(({ row, call }) => el('li.flag-row', {}, [
        el('button.flag-btn', {
          type: 'button',
          onclick: () => ctx.go('player', { id: row.player.id }),
        }, [
          el('span.flag-slot', { text: row.slot }),
          el('span.flag-name', {}, [row.player.name, injuryFlag(row.player)].filter(Boolean)),
          el('span.flag-right', {}, [verdictPill(call.verdict, { small: true }), confidenceMeter(call.confidence)]),
        ]),
        row.player.news.length
          ? el('p.flag-news', { text: `${row.player.news[0].tag}: ${row.player.news[0].text}` })
          : null,
      ].filter(Boolean))))
      : el('p.muted-note', { text: 'Every starter grades out as a start with no designation.' }),
    el('div.card-actions', {}, [
      el('button.btn.ghost', {
        type: 'button',
        text: 'Open lineup',
        onclick: () => ctx.go('lineup', { league: league.id }),
      }),
    ]),
  ]);
}
