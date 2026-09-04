/**
 * Settings — scoring, connected leagues, the betting switch, and the door out.
 *
 * @module exposure/screens/settings
 */

import { el } from '../dom.js';
import { SCORING } from '../data/leagues.js';
import { allTeams, teamName } from '../data/teams.js';
import {
  getState, removeLeague, reset, setAge, setFavoriteTeam, setHideBetting, setLeagueScoring,
} from '../store.js';
import { footer, kv, openSheet, sectionTitle } from '../ui/components.js';

/**
 * Render the settings screen.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderSettings(ctx) {
  const state = getState();
  const view = el('section.screen');
  view.append(sectionTitle('Settings'));

  view.append(el('div.card', {}, [
    sectionTitle('Account'),
    kv('Signed in as', state.account?.email || 'Not signed in'),
    kv('Favourite club', state.account?.favoriteTeam ? teamName(state.account.favoriteTeam) : 'None'),
    el('label.field-label', { for: 'settings-team', text: 'Change club (text only)' }),
    el('select.field', {
      id: 'settings-team',
      'aria-label': 'Favourite club',
      onchange: (event) => {
        setFavoriteTeam(event.target.value);
        ctx.toast(event.target.value ? `Following ${teamName(event.target.value)}.` : 'Favourite club cleared.');
      },
    }, [
      el('option', { value: '', text: 'No favourite', selected: !state.account?.favoriteTeam }),
      ...allTeams().map((t) => el('option', {
        value: t.abbr,
        text: `${t.city} ${t.mascot}`,
        selected: state.account?.favoriteTeam === t.abbr,
      })),
    ]),
  ]));

  view.append(el('div.card', {}, [
    sectionTitle('Connected leagues', `${state.leagues.length} connected`),
    ...(state.leagues.length
      ? state.leagues.map((league) => el('div.settings-league', {}, [
        el('div.settings-league-head', {}, [
          el('span.settings-league-name', { text: league.name }),
          el('span.settings-league-meta', { text: `${league.provider.toUpperCase()} · ${league.teamName} · ${league.teams}-team` }),
        ]),
        el('div.scoring-row', { role: 'group', 'aria-label': `Scoring for ${league.name}` },
          SCORING.map((option) => el('button.chip', {
            type: 'button',
            'aria-pressed': league.scoring === option.id ? 'true' : 'false',
            class: league.scoring === option.id ? 'on' : '',
            text: option.name,
            title: option.note,
            onclick: () => {
              setLeagueScoring(league.id, option.id);
              ctx.toast(`${league.name} is now ${option.name}.`);
              ctx.refresh();
            },
          }))),
        el('button.btn.tiny.ghost', {
          type: 'button',
          text: 'Disconnect',
          onclick: () => {
            removeLeague(league.id);
            ctx.toast(`${league.name} disconnected.`);
            ctx.refresh();
          },
        }),
      ]))
      : [el('p.muted-note', { text: 'No leagues connected yet.' })]),
    el('div.card-actions', {}, [
      el('button.btn.ghost', {
        type: 'button',
        text: 'Connect another league',
        onclick: () => ctx.go('onboarding', { step: 'connect' }),
      }),
    ]),
  ]));

  const hidden = state.settings.hideBetting;
  view.append(el('div.card', {}, [
    sectionTitle('Betting information'),
    kv('Age check', state.age === 'verified' ? 'Confirmed 21 or older' : (state.age === 'declined' ? 'Under 21 — odds hidden' : 'Not answered')),
    el('button.toggle', {
      type: 'button',
      role: 'switch',
      'aria-checked': hidden ? 'true' : 'false',
      class: hidden ? 'on' : '',
      onclick: () => {
        if (state.age !== 'verified' && hidden) {
          ctx.toast('Confirm you are 21 or older before turning the market back on.');
          return;
        }
        setHideBetting(!hidden);
        ctx.toast(!hidden ? 'Market tab hidden.' : 'Market tab shown.');
        ctx.refresh();
      },
    }, [
      el('span.toggle-track', { 'aria-hidden': 'true' }, [el('span.toggle-thumb')]),
      el('span.toggle-label', { text: 'Hide the betting tab' }),
    ]),
    state.age !== 'verified'
      ? el('button.btn.tiny', {
        type: 'button',
        text: 'I am 21 or older',
        onclick: () => {
          setAge(true);
          setHideBetting(false);
          ctx.toast('Market unlocked.');
          ctx.refresh();
        },
      })
      : null,
    el('p.card-note', {
      text: 'Hiding the tab removes every odds surface, including the market tab on a player card and prop leans in the exposure table.',
    }),
    el('a.btn.ghost.wide', {
      href: 'https://www.1800gambler.net/',
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'Responsible gaming — 1-800-GAMBLER',
    }),
  ].filter(Boolean)));

  view.append(el('div.card', {}, [
    sectionTitle('Your data'),
    el('p.card-note', {
      text: 'Everything lives in this browser: leagues, leans and settings. Deleting the account erases all of it from this device immediately.',
    }),
    el('button.btn.danger.wide', {
      type: 'button',
      text: 'Delete account and all data',
      onclick: () => confirmDelete(ctx),
    }),
  ]));

  // The disclosures live in the footer below, which every screen carries.
  view.append(footer(ctx.onResponsible));
  return view;
}

/**
 * Confirm deletion. Irreversible actions get a sentence and a second tap.
 *
 * @param {object} ctx Screen context.
 */
function confirmDelete(ctx) {
  const close = openSheet({
    title: 'Delete everything?',
    content: [
      el('p.sheet-copy', {
        text: 'This removes your account, connected leagues, saved leans and settings from this device. There is no copy on a server, so it cannot be undone.',
      }),
      el('button.btn.danger.wide', {
        type: 'button',
        text: 'Delete it all',
        onclick: () => {
          reset();
          close();
          ctx.toast('Deleted. The desk is empty.');
          ctx.go('onboarding');
        },
      }),
      el('button.btn.ghost.wide', { type: 'button', text: 'Keep my data', onclick: () => close() }),
    ],
  });
}
