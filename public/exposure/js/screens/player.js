/**
 * The Player Card — the screen the rest of the app links into.
 *
 * Four tabs: who he is, what his usage says, what the books say, and what to
 * actually watch for. The Receipts tab carries written notes rather than
 * video: this app hosts no footage, embeds no broadcast, and links to no clip.
 *
 * @module exposure/screens/player
 */

import { el, num, percent } from '../dom.js';
import { gameFor } from '../data/games.js';
import { matchupFor, player as findPlayer, projFor } from '../data/players.js';
import { bookLink, formatOdds } from '../data/market.js';
import { team, teamName } from '../data/teams.js';
import { oddsProvider } from '../providers.js';
import { bestQuote, leanFor, shopSpread } from '../engine/market.js';
import { startSit } from '../engine/startsit.js';
import { buildExposure } from '../engine/exposure.js';
import {
  bettingVisible, findLean, getState, removeLean, saveLean,
} from '../store.js';
import {
  avatar, confidenceMeter, emptyState, footer, injuryFlag, kv, riskTag,
  sectionTitle, statBar, verdictPill,
} from '../ui/components.js';

/** Tab last opened, so returning to a card keeps your place. */
let activeTab = 'overview';

/**
 * Render the player card.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderPlayer(ctx) {
  const state = getState();
  const p = findPlayer(ctx.params?.id);
  const view = el('section.screen.player-screen');

  if (!p) {
    view.append(emptyState({
      title: 'Player not found',
      body: 'That card is not in the demo pool. Head back to your lineup and pick a player from a roster.',
      actionLabel: 'Back to lineup',
      onAction: () => ctx.go('lineup'),
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  const week = state.week;
  const scoring = state.leagues.find((l) => l.id === state.activeLeagueId)?.scoring || state.settings.defaultScoring;
  const call = startSit(p, { week, scoring, slot: p.pos });
  const exposureRow = buildExposure(state.leagues, state.leans).find((row) => row.playerId === p.id);
  const tabs = ['overview', 'opportunity', bettingVisible() ? 'market' : null, 'receipts'].filter(Boolean);
  if (!tabs.includes(activeTab)) activeTab = 'overview';
  if (ctx.params?.tab && tabs.includes(ctx.params.tab)) activeTab = ctx.params.tab;

  view.append(el('header.player-head', {}, [
    avatar(p, 'lg'),
    el('div.player-id', {}, [
      el('h1.player-name', {}, [p.name, injuryFlag(p)].filter(Boolean)),
      el('p.player-meta', { text: `${team(p.team).city} · ${p.team} · ${p.pos}` }),
      el('p.player-meta.dim', {
        text: matchupFor(p, week) ? `Week ${week} ${matchupFor(p, week).label} · ${teamName(matchupFor(p, week).opp)}` : 'On a bye this week',
      }),
    ]),
    el('div.player-call', {}, [
      verdictPill(call.verdict),
      confidenceMeter(call.confidence),
      exposureRow && exposureRow.risk !== 'OK' ? riskTag(exposureRow.risk) : null,
    ].filter(Boolean)),
  ]));

  const panel = el('div.tab-panel', { id: 'player-tab-panel', role: 'tabpanel' });
  const tabBar = el('div.tabs', { role: 'tablist', 'aria-label': 'Player card sections' },
    tabs.map((tab) => el('button.tab', {
      type: 'button',
      role: 'tab',
      id: `tab-${tab}`,
      'aria-selected': tab === activeTab ? 'true' : 'false',
      'aria-controls': 'player-tab-panel',
      class: tab === activeTab ? 'active' : '',
      text: { overview: 'Overview', opportunity: 'Opportunity', market: 'Market', receipts: 'Receipts' }[tab],
      onclick: () => {
        activeTab = tab;
        ctx.refresh();
      },
    })));

  view.append(tabBar, panel);
  panel.setAttribute('aria-labelledby', `tab-${activeTab}`);

  if (activeTab === 'overview') panel.append(overviewTab(p, call, exposureRow, week, scoring, ctx));
  else if (activeTab === 'opportunity') panel.append(opportunityTab(p, week));
  else if (activeTab === 'market') panel.append(marketTab(p, week, ctx));
  else panel.append(receiptsTab(p, week, ctx));

  view.append(footer(ctx.onResponsible));
  return view;
}

/**
 * Overview: identity, the verdict and its drivers, news, and where he sits in
 * the user's portfolio.
 *
 * @param {object} p Player record.
 * @param {object} call Start/sit call.
 * @param {object|null} exposureRow Exposure row.
 * @param {number} week Week number.
 * @param {string} scoring Scoring format.
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The tab.
 */
function overviewTab(p, call, exposureRow, week, scoring, ctx) {
  const game = gameFor(p.team, week);
  const wrap = el('div.tab-body');

  wrap.append(el('div.card', {}, [
    sectionTitle('The call', `${scoring.toUpperCase()} scoring`),
    el('p.verdict-reason', { text: call.reason }),
    el('div.driver-list', {}, call.drivers.map((driver) => el('div.driver', {}, [
      el('span.driver-label', { text: driver.label }),
      el('span.driver-note', { text: driver.note }),
      el('span.driver-value', {
        class: driver.value > 0.5 ? 'up' : (driver.value < -0.5 ? 'down' : ''),
        text: `${driver.value >= 0 ? '+' : ''}${num(driver.value)}`,
      }),
    ]))),
  ]));

  wrap.append(el('div.card', {}, [
    sectionTitle('This week'),
    kv('Club', `${team(p.team).city} ${team(p.team).mascot}`),
    kv('Position', p.pos),
    kv('Opponent', matchupFor(p, week)?.label || 'Bye'),
    kv('Game', game ? `${game.away} at ${game.home} · ${game.kickoff}` : 'Not on the slate'),
    kv('Status', `${p.injury.status}${p.injury.note ? ` — ${p.injury.note}` : ''}`),
    kv('Projection', `${num(projFor(p, scoring))} pts`),
  ]));

  if (p.news.length) {
    wrap.append(el('div.card', {}, [
      sectionTitle('Notes'),
      ...p.news.map((item) => el('p.news-line', {}, [
        el('span.news-tag', { text: item.tag }),
        el('span.news-text', { text: item.text }),
      ])),
    ]));
  }

  if (exposureRow && (exposureRow.started || exposureRow.benched || exposureRow.lean)) {
    wrap.append(el('div.card', {}, [
      sectionTitle('Your exposure'),
      kv('Started in', exposureRow.startedNames.join(', ') || 'None'),
      kv('Benched in', exposureRow.benchedNames.join(', ') || 'None'),
      kv('Prop lean', exposureRow.lean ? `${exposureRow.lean.side} ${exposureRow.lean.marketLabel}` : 'None saved'),
      el('div.card-actions', {}, [
        el('button.btn.ghost', { type: 'button', text: 'Open exposure table', onclick: () => ctx.go('exposure') }),
      ]),
    ]));
  }

  return wrap;
}

/**
 * Opportunity: the volume metrics, which are the most stable thing about a
 * football player and therefore the ones worth a whole tab.
 *
 * @param {object} p Player record.
 * @param {number} week Week number.
 * @returns {HTMLElement} The tab.
 */
function opportunityTab(p, week) {
  const o = p.opportunity;
  const wrap = el('div.tab-body');
  const stats = [];

  stats.push(statBar('Snap share', o.snapShare ?? 0, { max: 1, asPercent: true }));
  if (p.pos === 'QB') {
    stats.push(statBar('Pass attempts', o.passAttempts ?? 0, { max: 45 }));
    stats.push(statBar('Rush attempts', o.rushAttempts ?? 0, { max: 10 }));
    stats.push(statBar('Red-zone dropbacks', o.rzDropbacks ?? 0, { max: 8 }));
    stats.push(statBar('Play-action rate', o.playAction ?? 0, { max: 0.5, asPercent: true }));
    stats.push(statBar('Depth of target', o.adot ?? 0, { max: 14, suffix: ' yds' }));
  } else {
    stats.push(statBar('Routes run', o.routes ?? 0, { max: 40 }));
    stats.push(statBar('Targets', o.targets ?? 0, { max: 12 }));
    stats.push(statBar('Target share', o.targetShare ?? 0, { max: 0.35, asPercent: true }));
    if (p.pos === 'RB') {
      stats.push(statBar('Rush share', o.rushShare ?? 0, { max: 0.85, asPercent: true }));
      stats.push(statBar('Carries', o.carries ?? 0, { max: 22 }));
      stats.push(statBar('Yards before contact', o.yardsBeforeContact ?? 0, { max: 3.5, suffix: ' yds' }));
    } else {
      stats.push(statBar('Depth of target', o.adot ?? 0, { max: 16, suffix: ' yds' }));
      stats.push(statBar('Yards per route run', o.yprr ?? 0, { max: 3 }));
    }
  }
  stats.push(statBar('Red-zone touches', o.rzTouches ?? 0, { max: 5 }));

  wrap.append(el('div.card', {}, [
    sectionTitle('Opportunity', `Per game · week ${week}`),
    el('p.card-note', {
      text: 'Demo sample data. Volume is what carries from week to week; efficiency is what does not.',
    }),
    el('div.stat-grid', {}, stats),
  ]));

  const matchup = matchupFor(p, week);
  if (matchup) {
    wrap.append(el('div.card', {}, [
      sectionTitle('Matchup'),
      kv('Opponent', teamName(matchup.opp)),
      kv(`Defence vs ${p.pos}`, `${matchup.rank} of 32 (1 = toughest)`),
      kv('Site', matchup.home ? 'Home' : 'Road'),
    ]));
  }
  return wrap;
}

/**
 * Market: the same number from three books, the best one marked, and a way to
 * write down a lean. There is no bet slip here and never will be.
 *
 * @param {object} p Player record.
 * @param {number} week Week number.
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The tab.
 */
function marketTab(p, week, ctx) {
  const wrap = el('div.tab-body');
  const markets = oddsProvider.props(p.id, week);
  const game = gameFor(p.team, week);
  const eventKey = game ? game.id : `w${week}-${p.team}`;

  wrap.append(el('p.card-note.market-note', {
    text: 'Demo numbers from invented books, for comparison only. This app is not a sportsbook and does not accept wagers.',
  }));

  for (const market of markets) {
    const lean = leanFor(p, market);
    const side = lean.side === 'UNDER' ? 'UNDER' : 'OVER';
    const best = bestQuote(market, side);
    const spread = shopSpread(market, side);
    const saved = findLean(p.id, market.key);

    const rows = market.quotes.map((quote) => {
      const isBest = quote.book === best.book;
      return el(`div.book-row${isBest ? '.best' : ''}`, {}, [
        el('span.book-name', {}, [
          quote.bookName,
          isBest ? el('span.best-badge', { text: 'BEST', title: `Best ${side.toLowerCase()} number` }) : null,
        ].filter(Boolean)),
        el('span.book-line', { text: market.key === 'atd' ? '—' : num(quote.line) }),
        el('span.book-price', { text: formatOdds(market.key === 'atd' ? quote.over : quote[side.toLowerCase()]) }),
        el('a.book-open', {
          href: bookLink(quote.book, `${eventKey}:${p.id}:${market.key}`),
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
          text: 'Open at sportsbook',
          'aria-label': `Open ${p.name} ${market.label} at ${quote.bookName} — opens an external site`,
        }),
      ]);
    });

    wrap.append(el('div.card.market-card', {}, [
      el('div.market-head', {}, [
        el('h3.market-title', { text: market.label }),
        verdictPill(lean.verdict, { small: true }),
      ]),
      el('p.market-read', { text: lean.note }),
      el('div.book-table', { role: 'table', 'aria-label': `${market.label} across books` }, [
        el('div.book-row.book-head', { role: 'row' }, [
          el('span.book-name', { text: 'Book' }),
          el('span.book-line', { text: 'Line' }),
          el('span.book-price', { text: 'Price' }),
          el('span', { text: '' }),
        ]),
        ...rows,
      ]),
      spread && spread.lineGap > 0
        ? el('p.market-shop', { text: `Shopping is worth ${num(spread.lineGap)} ${market.unit || 'points'} here: ${spread.best.bookName} against ${spread.worst.bookName}.` })
        : null,
      el('div.card-actions', {}, [
        saved
          ? el('button.btn.ghost', {
            type: 'button',
            text: `Remove ${saved.side} lean`,
            onclick: () => {
              removeLean(p.id, market.key);
              ctx.toast('Lean removed.');
              ctx.refresh();
            },
          })
          : el('button.btn', {
            type: 'button',
            text: lean.side === 'WATCH' ? 'Save as a watch' : `Save ${lean.verdict}`,
            onclick: () => {
              saveLean({
                playerId: p.id,
                playerName: p.name,
                marketKey: market.key,
                marketLabel: market.label,
                side: lean.side === 'WATCH' ? 'WATCH' : lean.side,
                line: best.line,
                price: market.key === 'atd' ? best.over : best[side.toLowerCase()],
                book: best.book,
                bookName: best.bookName,
                week,
              });
              ctx.toast('Lean saved to your exposure table.');
              ctx.refresh();
            },
          }),
      ]),
    ].filter(Boolean)));
  }

  return wrap;
}

/**
 * Receipts: what to watch for, written down.
 *
 * Deliberately not video. The app hosts no footage, embeds no broadcast and
 * links to no clip; if the user wants to watch the game, they already have an
 * app for that, and this is a reminder rather than a player.
 *
 * @param {object} p Player record.
 * @param {number} week Week number.
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The tab.
 */
function receiptsTab(p, week, ctx) {
  const game = gameFor(p.team, week);
  return el('div.tab-body', {}, [
    el('div.card', {}, [
      sectionTitle('Watch fors', `${p.receipts.length} notes`),
      el('p.card-note', { text: 'Scheme and usage notes, written out. No video is hosted, embedded or linked here.' }),
      el('ol.receipts', {}, p.receipts.map((note, index) => el('li.receipt', {}, [
        el('span.receipt-index', { 'aria-hidden': 'true', text: String(index + 1).padStart(2, '0') }),
        el('span.receipt-text', { text: note }),
      ]))),
    ]),
    el('div.card', {}, [
      sectionTitle('Watch the game'),
      el('p.card-note', {
        text: game
          ? `${game.away} at ${game.home}, ${game.kickoff}. Open your own broadcast or streaming app when it kicks off — the desk does not carry video.`
          : 'No game on the slate for this club this week.',
      }),
      el('button.btn.ghost', {
        type: 'button',
        text: 'Remind me at kickoff',
        onclick: () => ctx.toast(game
          ? `Noted: ${game.away} at ${game.home}, ${game.kickoff}. Watch it in your own broadcast app.`
          : 'No game to remind you about this week.'),
      }),
    ]),
  ]);
}

/**
 * Reset the remembered tab. The shell calls this when the user opens a
 * different player from a link that names a tab.
 */
export function resetPlayerTab() {
  activeTab = 'overview';
}
