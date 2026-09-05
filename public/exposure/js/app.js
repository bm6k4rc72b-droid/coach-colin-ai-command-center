/**
 * The shell: age gate, top bar, router, bottom navigation, toasts.
 *
 * EXPOSURE is an independent fantasy and betting-research desk. It reads the
 * user's own leagues, grades their lineup, and compares publicly quoted
 * numbers across books. It hosts no video, renders no club marks, accepts no
 * wagers, and keeps every byte of user data in this browser.
 *
 * @module exposure/app
 */

import { el } from './dom.js';
import { SLATE_TEAMS, WEEKS } from './data/games.js';
import { applyRosterIdentities, resetRosterIdentities } from './data/players.js';
import { describeSource, indexRoster, loadRoster } from './data/rosterFeed.js';
import { concentrationAlerts } from './engine/exposure.js';
import {
  activeLeague, bettingVisible, getState, markAlertsRead, setActiveLeague, setAge, setWeek, subscribe,
} from './store.js';
import { legalBlock, openSheet, riskTag } from './ui/components.js';
import { renderOnboarding, stepFor } from './screens/onboarding.js';
import { renderHome } from './screens/home.js';
import { clearCompareHold, renderLineup } from './screens/lineup.js';
import { renderPlayer, resetPlayerTab } from './screens/player.js';
import { renderExposure } from './screens/exposure.js';
import { renderMarket } from './screens/market.js';
import { renderCommand, stopLiveDesk } from './screens/command.js';
import { renderSettings } from './screens/settings.js';
import { renderMore } from './screens/more.js';

/** Screen renderers by route. */
const ROUTES = {
  onboarding: renderOnboarding,
  home: renderHome,
  lineup: renderLineup,
  player: renderPlayer,
  exposure: renderExposure,
  market: renderMarket,
  command: renderCommand,
  settings: renderSettings,
  more: renderMore,
};

/** Routes that require at least one connected league to be worth showing. */
const NEEDS_SETUP = new Set(['home', 'lineup', 'player', 'exposure', 'market', 'command']);

let route = 'home';
let params = {};

/**
 * Where the names on screen came from. `DEMO` until the feed answers, and the
 * strip under the top bar says so the whole time.
 *
 * @type {{source: string, fetchedAt: number|null, error: string, matched: number}}
 */
let rosterState = { source: 'DEMO', fetchedAt: null, error: '', matched: 0 };

/** @returns {object} The current roster provenance. */
export function getRosterState() {
  return rosterState;
}

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const feedstrip = document.getElementById('feedstrip');
const tabbar = document.getElementById('tabbar');
const toastNode = document.getElementById('toast');

/**
 * Show a transient message.
 *
 * @param {string} message Message text.
 */
export function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove('show'), 2600);
}

/**
 * Navigate.
 *
 * @param {string} next Route name.
 * @param {object} [nextParams] Route parameters.
 */
export function go(next, nextParams = {}) {
  if (!ROUTES[next]) return;
  if (next !== route) {
    clearCompareHold();
    if (route === 'command') stopLiveDesk();
  }
  if (next === 'player' && nextParams.id !== params.id) resetPlayerTab();
  route = next;
  params = nextParams;
  try {
    window.location.hash = buildHash(next, nextParams);
  } catch {
    // Some embedded contexts refuse a hash write; the route still changed,
    // so the desk navigates and only the shareable URL is lost.
  }
  render();
  view.scrollTo({ top: 0 });
  document.getElementById('view')?.focus?.();
}

/** Build a shareable hash for the current route. */
function buildHash(name, values) {
  const query = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `#/${name}${query ? `?${query}` : ''}`;
}

/** Read the route out of the URL hash. */
function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return null;
  const [name, query = ''] = raw.split('?');
  if (!ROUTES[name]) return null;
  const values = {};
  for (const pair of query.split('&').filter(Boolean)) {
    const [key, value = ''] = pair.split('=');
    values[key] = decodeURIComponent(value);
  }
  return { name, values };
}

/** The screen context handed to every renderer. */
function context() {
  return {
    go,
    toast,
    refresh: render,
    params,
    route,
    roster: getRosterState,
    refreshRoster,
    onResponsible: null,
  };
}

/**
 * Render the whole shell for the current state.
 */
export function render() {
  const state = getState();

  // Setup is not optional: without a league, every other screen is an empty
  // state, so send the user to the step they have not finished.
  let active = route;
  if (NEEDS_SETUP.has(active) && !state.account && !state.leagues.length) active = 'onboarding';
  if (active === 'onboarding' && !params.step) params = { ...params, step: stepFor(state) };
  if (active === 'market' && !bettingVisible() && route === 'market') active = 'market';

  renderTopBar(state);
  renderFeedStrip();
  renderTabs(state, active);

  const screen = ROUTES[active] || renderHome;
  const node = screen(context());
  view.replaceChildren(node);
}

/**
 * Pull roster identities and repaint.
 *
 * Deliberately fire-and-forget: the desk renders immediately on the seed and
 * the real names arrive when they arrive. A feed that never answers changes
 * nothing except the line under the top bar.
 *
 * @param {object} [options] Options.
 * @param {boolean} [options.force] Ignore a fresh cache.
 * @returns {Promise<object>} The new roster state.
 */
export async function refreshRoster(options = {}) {
  const result = await loadRoster({ teams: SLATE_TEAMS, force: Boolean(options.force) });
  const applied = result.roster.length
    ? applyRosterIdentities(indexRoster(result.roster))
    : (resetRosterIdentities(), { matched: 0 });
  rosterState = {
    source: result.roster.length ? result.source : 'DEMO',
    fetchedAt: result.fetchedAt,
    error: result.error,
    matched: applied.matched || 0,
  };
  render();
  return rosterState;
}

/**
 * The line under the top bar naming the roster's provenance.
 */
function renderFeedStrip() {
  const live = rosterState.source !== 'DEMO';
  feedstrip.replaceChildren(
    el(`span.feed-dot.feed-${rosterState.source.toLowerCase()}`, { 'aria-hidden': 'true' }),
    el('span.feed-text', { text: describeSource(rosterState) }),
    el('span.feed-note', {
      text: live
        ? `${rosterState.matched} of the demo roles filled from the feed \u00b7 projections and prices stay modelled`
        : 'Names are placeholders; projections and prices are modelled',
    }),
  );
}

/**
 * The top bar: week picker, league switcher, alerts bell.
 *
 * @param {object} state Application state.
 */
function renderTopBar(state) {
  const brand = el('button.brand', {
    type: 'button',
    'aria-label': 'EXPOSURE home',
    onclick: () => go('home'),
  }, [
    el('span.brand-mark', { 'aria-hidden': 'true' }),
    el('span.brand-text', { text: 'EXPOSURE' }),
  ]);

  const weekPicker = el('label.top-field', {}, [
    el('span.top-field-label', { text: 'WK' }),
    el('select.top-select', {
      'aria-label': 'Week',
      onchange: (event) => {
        setWeek(Number(event.target.value));
        render();
      },
    }, WEEKS.map((week) => el('option', {
      value: String(week),
      text: `Week ${week}`,
      selected: state.week === week,
    }))),
  ]);

  const leaguePicker = state.leagues.length
    ? el('label.top-field.wide', {}, [
      el('span.top-field-label', { text: 'LG' }),
      el('select.top-select', {
        'aria-label': 'League',
        onchange: (event) => {
          setActiveLeague(event.target.value);
          render();
        },
      }, state.leagues.map((league) => el('option', {
        value: league.id,
        text: league.teamName,
        selected: (activeLeague()?.id || '') === league.id,
      }))),
    ])
    : null;

  const alerts = concentrationAlerts(state.leagues, bettingVisible() ? state.leans : []);
  const unread = alerts.filter((alert) => !state.readAlerts.includes(alert.playerId));
  const bell = el('button.icon-btn.bell', {
    type: 'button',
    'aria-label': `Alerts, ${unread.length} unread`,
    onclick: () => openAlerts(alerts),
  }, [
    el('span.bell-glyph', { 'aria-hidden': 'true', text: '◉' }),
    unread.length ? el('span.bell-count', { text: String(unread.length) }) : null,
  ].filter(Boolean));

  topbar.replaceChildren(el('div.top-inner', {}, [
    brand,
    el('div.top-controls', {}, [weekPicker, leaguePicker, bell].filter(Boolean)),
  ]));
}

/**
 * The alerts sheet.
 *
 * @param {object[]} alerts Concentration alerts.
 */
function openAlerts(alerts) {
  markAlertsRead(alerts.map((alert) => alert.playerId));
  openSheet({
    title: 'Alerts',
    content: alerts.length
      ? alerts.map((alert) => el('button.alert-card', {
        type: 'button',
        onclick: () => {
          document.querySelector('.scrim')?.remove();
          go('player', { id: alert.playerId });
        },
      }, [
        el('div.alert-top', {}, [el('span.alert-title', { text: alert.headline }), riskTag(alert.risk)]),
        el('p.alert-detail', { text: alert.detail }),
      ]))
      : [el('p.muted-note', { text: 'Nothing flagged. No player is carrying more than one of your results this week.' })],
  });
  render();
}

/**
 * Bottom navigation. Five targets, 44px minimum, and the fourth swaps between
 * Market and the Command Center depending on whether odds are visible.
 *
 * @param {object} state Application state.
 * @param {string} active Active route.
 */
function renderTabs(state, active) {
  const betting = bettingVisible();
  const items = [
    { route: 'home', label: 'Home', glyph: '▤' },
    { route: 'lineup', label: 'Lineup', glyph: '◫' },
    { route: 'exposure', label: 'Exposure', glyph: '◈' },
    betting
      ? { route: 'market', label: 'Market', glyph: '⌸' }
      : { route: 'command', label: 'Live', glyph: '◉' },
    { route: 'more', label: 'More', glyph: '≡' },
  ];
  tabbar.replaceChildren(...items.map((item) => el('button.tabbar-btn', {
    type: 'button',
    class: active === item.route ? 'active' : '',
    'aria-current': active === item.route ? 'page' : 'false',
    onclick: () => go(item.route),
  }, [
    el('span.tabbar-glyph', { 'aria-hidden': 'true', text: item.glyph }),
    el('span.tabbar-label', { text: item.label }),
  ])));
  tabbar.hidden = active === 'onboarding';
}

/**
 * The first-run modal: both disclosures, then the 21+ question.
 *
 * Nothing behind it renders an odds surface until it is answered, and
 * answering "under 21" is a supported outcome rather than a wall.
 */
function firstRun() {
  const gate = document.getElementById('gate');
  const state = getState();
  if (state.seenDisclosure) {
    gate.classList.add('gone');
    return;
  }
  gate.replaceChildren(el('div.gate-inner', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Before you start' }, [
    el('div.wordmark', {}, [el('span.wordmark-text', { text: 'EXPOSURE' })]),
    el('p.gate-sub', { text: 'Independent fantasy and betting research. Your leagues, your exposure, other people’s numbers.' }),
    legalBlock(),
    el('div.gate-actions', {}, [
      el('button.btn.primary.wide', {
        type: 'button',
        text: 'I am 21 or older',
        onclick: () => {
          setAge(true);
          gate.classList.add('gone');
          render();
        },
      }),
      el('button.btn.ghost.wide', {
        type: 'button',
        text: 'I am under 21 — hide betting',
        onclick: () => {
          setAge(false);
          gate.classList.add('gone');
          toast('Betting surfaces are hidden. The fantasy desk still works.');
          render();
        },
      }),
    ]),
    el('p.gate-fine', {
      text: 'Answer this once. It decides whether any odds surface renders at all, and you can change it later in Settings.',
    }),
  ]));
  gate.classList.remove('gone');
}

/** Wire the shell up and paint the first screen. */
function boot() {
  const state = getState();
  const fromHash = readHash();
  if (fromHash) {
    route = fromHash.name;
    params = fromHash.values;
  } else if (!state.leagues.length) {
    route = 'onboarding';
  }

  firstRun();
  render();

  // Names come from the feed when it is reachable; the desk is already usable
  // by the time it answers, or does not.
  refreshRoster().catch(() => {});

  window.addEventListener('hashchange', () => {
    const next = readHash();
    if (next && (next.name !== route || JSON.stringify(next.values) !== JSON.stringify(params))) {
      route = next.name;
      params = next.values;
      render();
    }
  });

  subscribe(() => {
    // Keep the top bar's counts honest without re-entering render() from
    // inside a render; the screens ask for a refresh themselves when needed.
    renderTopBar(getState());
  });

  if ('serviceWorker' in navigator) {
    // Registration failing (file protocol, private mode) must not take the app
    // down; the desk works perfectly well without an offline cache.
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // A small surface for the end-to-end suite, and for anyone who wants to
  // drive the desk from the console.
  window.__exposure = {
    go,
    render,
    toast,
    getState,
    refreshRoster,
    roster: () => rosterState,
    route: () => route,
    params: () => params,
  };
}

boot();
