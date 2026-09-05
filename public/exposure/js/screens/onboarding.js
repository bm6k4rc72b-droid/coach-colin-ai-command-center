/**
 * Onboarding: account, leagues, favourite club.
 *
 * The 21+ gate runs before this screen ever mounts — it is a first-run modal
 * owned by the shell, because no odds surface may render until it is answered.
 * What is left here is the part that makes the desk useful: an account stub, at
 * least one connected league, and an optional favourite club stored as text.
 *
 * @module exposure/screens/onboarding
 */

import { el } from '../dom.js';
import { allTeams, teamName } from '../data/teams.js';
import { PROVIDERS, connectProvider } from '../providers.js';
import { addLeagues, getState, setFavoriteTeam, signIn } from '../store.js';
import { footer, legalBlock, sectionTitle } from '../ui/components.js';

/** Human-readable text for each mock handshake step. */
const STEP_TEXT = {
  redirect: 'Opening the provider…',
  consent: 'Waiting for you to approve access…',
  exchange: 'Exchanging the token…',
  fetch: 'Reading your leagues…',
};

/**
 * Which onboarding step the user is on, derived from state so a reload never
 * drops them back to the beginning.
 *
 * @param {object} state Application state.
 * @returns {'account'|'connect'|'team'} The step.
 */
export function stepFor(state) {
  if (!state.account) return 'account';
  if (!state.leagues.length) return 'connect';
  return 'team';
}

/**
 * Render the onboarding flow.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderOnboarding(ctx) {
  const state = getState();
  const step = ctx.params?.step || stepFor(state);
  const view = el('section.screen.onboarding');

  view.append(el('div.onboard-head', {}, [
    el('div.wordmark', {}, [el('span.wordmark-text', { text: 'EXPOSURE' })]),
    el('p.onboard-tagline', {
      text: 'A private desk for your fantasy leagues and the numbers around them.',
    }),
    el('ol.onboard-steps', { 'aria-label': 'Setup progress' }, [
      ['account', 'Account'], ['connect', 'Leagues'], ['team', 'Club'],
    ].map(([id, label]) => el(`li.onboard-step${id === step ? '.current' : ''}${
      stepOrder(id) < stepOrder(step) ? '.done' : ''}`, { text: label }))),
  ]));

  if (step === 'account') view.append(accountStep(ctx));
  else if (step === 'connect') view.append(connectStep(ctx));
  else view.append(teamStep(ctx));

  view.append(footer(ctx.onResponsible));
  return view;
}

/** Order steps so completed ones can be marked. */
function stepOrder(step) {
  return { account: 0, connect: 1, team: 2 }[step] ?? 0;
}

/**
 * Step one: an email, and a magic link that is a local ceremony rather than a
 * mail send. Nothing leaves the device.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The card.
 */
function accountStep(ctx) {
  const input = el('input.field', {
    type: 'email',
    id: 'onboard-email',
    placeholder: 'you@example.com',
    autocomplete: 'email',
    'aria-label': 'Email address',
  });
  const error = el('p.form-error', { role: 'alert' });
  const submit = el('button.btn.primary.wide', { type: 'submit', text: 'Send magic link' });

  const form = el('form.card.card-form', {
    onsubmit: (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        error.textContent = 'Enter an email address so the desk has something to call you.';
        input.focus();
        return;
      }
      signIn(value);
      ctx.toast('Signed in on this device.');
      ctx.go('onboarding', { step: 'connect' });
    },
  }, [
    sectionTitle('Create your account'),
    el('p.card-note', {
      text: 'The link is local: no email is sent, no password is stored, and the address never leaves this device.',
    }),
    el('label.field-label', { for: 'onboard-email', text: 'Email' }),
    input,
    error,
    submit,
  ]);
  return form;
}

/**
 * Step two: connect leagues through the mock provider handshake.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The card.
 */
function connectStep(ctx) {
  const status = el('p.connect-status', { role: 'status', 'aria-live': 'polite' });
  const connected = el('div.connected-list');

  const paint = () => {
    const leagues = getState().leagues;
    connected.replaceChildren(...leagues.map((league) => el('div.connected-row', {}, [
      el('span.connected-name', { text: league.name }),
      el('span.connected-meta', {
        text: `${league.teamName} · ${league.teams}-team · ${league.scoring.toUpperCase()}`,
      }),
    ])));
  };
  paint();

  const buttons = PROVIDERS.map((provider) => el('button.provider', {
    type: 'button',
    onclick: async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.classList.add('busy');
      try {
        const result = await connectProvider(provider.id, {
          onStep: (name) => { status.textContent = `${provider.name}: ${STEP_TEXT[name]}`; },
        });
        addLeagues(result.leagues);
        status.textContent = `${provider.name}: connected ${result.leagues.length} league${result.leagues.length === 1 ? '' : 's'}.`;
        paint();
        ctx.refresh();
      } catch (failure) {
        status.textContent = `${provider.name}: ${failure.message}`;
        button.disabled = false;
      } finally {
        button.classList.remove('busy');
      }
    },
  }, [
    el('span.provider-mark', { 'aria-hidden': 'true', text: provider.mark }),
    el('span.provider-body', {}, [
      el('span.provider-name', { text: provider.name }),
      el('span.provider-blurb', { text: provider.blurb }),
    ]),
    el('span.provider-action', { text: 'Connect' }),
  ]));

  return el('div.card', {}, [
    sectionTitle('Connect your leagues'),
    el('p.card-note', {
      text: 'Read-only. The desk reads rosters and scoring settings; it cannot set a lineup, make a trade, or post in your league.',
    }),
    el('div.provider-list', {}, buttons),
    status,
    connected,
    el('div.card-actions', {}, [
      el('button.btn.primary.wide', {
        type: 'button',
        text: 'Continue',
        onclick: () => {
          if (!getState().leagues.length) {
            status.textContent = 'Connect at least one league — every screen here is built on your rosters.';
            return;
          }
          ctx.go('onboarding', { step: 'team' });
        },
      }),
    ]),
  ]);
}

/**
 * Step three: a favourite club, stored as the city and mascot words only.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The card.
 */
function teamStep(ctx) {
  const select = el('select.field', { id: 'onboard-team', 'aria-label': 'Favourite club' }, [
    el('option', { value: '', text: 'No favourite' }),
    ...allTeams().map((t) => el('option', { value: t.abbr, text: `${t.city} ${t.mascot}` })),
  ]);
  const current = getState().account?.favoriteTeam;
  if (current) select.value = current;

  return el('div.card', {}, [
    sectionTitle('Favourite club', 'Optional'),
    el('p.card-note', {
      text: 'Text only. The desk shows city and mascot words to identify games; it displays no marks, helmets or wordmarks.',
    }),
    el('label.field-label', { for: 'onboard-team', text: 'Club' }),
    select,
    legalBlock(),
    el('div.card-actions', {}, [
      el('button.btn.primary.wide', {
        type: 'button',
        text: 'Open the desk',
        onclick: () => {
          setFavoriteTeam(select.value);
          if (select.value) ctx.toast(`Following ${teamName(select.value)} as text.`);
          ctx.go('home');
        },
      }),
    ]),
  ]);
}
