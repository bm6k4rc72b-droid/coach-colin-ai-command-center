/**
 * Market Desk — the week's board and a prop search.
 *
 * Rows, not a bet slip. There is no wallet, no stake field, no parlay builder
 * and no cash-out: the only action available anywhere on this screen is a link
 * out to a book's own site.
 *
 * @module exposure/screens/market
 */

import { el, num, signed } from '../dom.js';
import { allPlayers } from '../data/players.js';
import { bookLink, formatOdds, lineMoveNote, searchPlayers } from '../data/market.js';
import { teamName } from '../data/teams.js';
import { oddsProvider } from '../providers.js';
import { bestGameQuote, leanFor } from '../engine/market.js';
import { bettingVisible, getState } from '../store.js';
import {
  avatar, emptyState, footer, sectionTitle, verdictPill,
} from '../ui/components.js';

/** Search text, kept across re-renders within a session. */
let query = '';

/**
 * Render the market desk.
 *
 * @param {object} ctx Screen context.
 * @returns {HTMLElement} The screen.
 */
export function renderMarket(ctx) {
  const state = getState();
  const view = el('section.screen');

  if (!bettingVisible()) {
    view.append(emptyState({
      title: 'Market is hidden',
      body: state.age === 'declined'
        ? 'You told the desk you are under 21, so every odds surface stays off. You can change that in Settings.'
        : 'Betting surfaces are switched off in Settings. Turn them back on to compare numbers across books.',
      actionLabel: 'Open settings',
      onAction: () => ctx.go('settings'),
    }));
    view.append(footer(ctx.onResponsible));
    return view;
  }

  const week = state.week;
  view.append(sectionTitle(`Market · week ${week}`, oddsProvider.source.name, { demo: true }));
  view.append(el('p.card-note.market-note', {
    text: 'Demo numbers from invented books. We are not a sportsbook, we do not accept wagers, and nothing here can be staked.',
  }));

  view.append(propSearch(ctx, week));

  view.append(el('div.list-head', {}, [
    el('span.list-head-label', { text: 'Games' }),
    el('span.list-head-note', { text: 'Spread · total · moneyline' }),
  ]));

  for (const { game, board } of oddsProvider.games(week)) {
    view.append(gameRow(game, board));
  }

  view.append(footer(ctx.onResponsible));
  return view;
}

/**
 * One game, priced across the three books.
 *
 * @param {object} game Game record.
 * @param {object} board Priced board.
 * @returns {HTMLElement} The row.
 */
function gameRow(game, board) {
  const bestSpread = bestGameQuote(board.spread, 'spread', 'away');
  const bestTotal = bestGameQuote(board.total, 'total', 'over');
  const bestHome = bestGameQuote(board.moneyline, 'moneyline', 'home');
  const bestAway = bestGameQuote(board.moneyline, 'moneyline', 'away');

  const header = el('div.game-head', {}, [
    el('div.game-teams', {}, [
      el('span.game-team', { text: `${game.away} at ${game.home}` }),
      el('span.game-sub', { text: `${teamName(game.away)} at ${teamName(game.home)}` }),
    ]),
    el('span.game-state', { class: `state-${game.state.toLowerCase()}`, text: game.state === 'UPCOMING' ? game.kickoff : `${game.state} ${game.quarter}` }),
  ]);

  const table = el('div.book-table', { role: 'table', 'aria-label': `${game.away} at ${game.home} board` }, [
    el('div.game-book-row.book-head', { role: 'row' }, [
      el('span', { text: 'Book' }),
      el('span', { text: 'Spread' }),
      el('span', { text: 'Total' }),
      el('span', { text: 'Moneyline' }),
      el('span', { text: '' }),
    ]),
    ...board.spread.map((quote, index) => {
      const total = board.total[index];
      const moneyline = board.moneyline[index];
      return el('div.game-book-row', { role: 'row' }, [
        el('span.book-name', { text: quote.bookName }),
        el('span', {
          class: quote.book === bestSpread.book ? 'best-cell' : '',
          text: `${game.home} ${signed(quote.home)}`,
        }),
        el('span', {
          class: total.book === bestTotal.book ? 'best-cell' : '',
          text: num(total.line),
        }),
        el('span', {
          class: (moneyline.book === bestHome.book || moneyline.book === bestAway.book) ? 'best-cell' : '',
          text: `${formatOdds(moneyline.away)} / ${formatOdds(moneyline.home)}`,
        }),
        el('a.book-open', {
          href: bookLink(quote.book, game.id),
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
          text: 'Open',
          'aria-label': `Open ${game.away} at ${game.home} at ${quote.bookName} — opens an external site`,
        }),
      ]);
    }),
  ]);

  return el('article.card.game-card', {}, [
    header,
    table,
    el('div.line-move', {}, [
      el('span.line-move-label', { text: 'Line move' }),
      el('span.line-move-note', { text: lineMoveNote(game.id) }),
    ]),
  ]);
}

/**
 * Player prop search.
 *
 * @param {object} ctx Screen context.
 * @param {number} week Week number.
 * @returns {HTMLElement} The search block.
 */
function propSearch(ctx, week) {
  const results = el('div.search-results');
  const input = el('input.field', {
    type: 'search',
    id: 'prop-search',
    placeholder: 'Search a player, club or position',
    'aria-label': 'Search player props',
    value: query,
  });

  const paint = () => {
    const matches = searchPlayers(query, allPlayers()).slice(0, 8);
    if (!query.trim()) {
      results.replaceChildren(el('p.muted-note', {
        text: 'Search a name to compare that player’s numbers across all three books.',
      }));
      return;
    }
    if (!matches.length) {
      results.replaceChildren(el('p.muted-note', { text: `No player matches “${query}”.` }));
      return;
    }
    results.replaceChildren(...matches.map((p) => {
      const markets = oddsProvider.props(p.id, week);
      const lean = markets.length ? leanFor(p, markets[0]) : null;
      return el('button.search-row', {
        type: 'button',
        onclick: () => ctx.go('player', { id: p.id, tab: 'market' }),
      }, [
        avatar(p, 'sm'),
        el('span.search-body', {}, [
          el('span.search-name', { text: p.name }),
          el('span.search-meta', { text: `${p.team} · ${p.pos} · ${markets.map((m) => m.label).join(', ')}` }),
        ]),
        lean ? verdictPill(lean.verdict, { small: true }) : null,
      ].filter(Boolean));
    }));
  };

  input.addEventListener('input', () => {
    query = input.value;
    paint();
  });
  paint();

  return el('div.card', {}, [
    sectionTitle('Player props'),
    el('label.field-label', { for: 'prop-search', text: 'Search' }),
    input,
    results,
  ]);
}
