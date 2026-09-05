/**
 * Line shopping and lean maths.
 *
 * Two jobs: find the best number across the books for whichever side the user
 * is looking at, and say whether the desk's own expectation disagrees with
 * that number enough to be worth writing down. Nothing here places a wager —
 * the output is a note the user saves, and the only outbound action anywhere
 * in the app is a link to the book's own site.
 *
 * @module exposure/engine/market
 */

import { baselineFor } from '../data/market.js';

/** How far the model must sit from the number before the desk takes a side. */
export const YARDS_EDGE = 0.06;

/** How many probability points an anytime-TD price must give up before it is a lean. */
export const TD_EDGE = 0.05;

/**
 * Convert American odds to an implied probability, vig included.
 *
 * @param {number} odds American odds.
 * @returns {number} Implied probability in (0, 1).
 */
export function impliedProbability(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/**
 * The best available number for a side.
 *
 * For an over, the lowest line is the best number; for an under, the highest.
 * Prices break ties, since two books at the same line are not the same bet.
 * An anytime-TD market has no line, so the best price wins outright.
 *
 * @param {object} market Priced market from the odds provider.
 * @param {'OVER'|'UNDER'} [side] Side being shopped.
 * @returns {object|null} The winning quote, or null when the market is empty.
 */
export function bestQuote(market, side = 'OVER') {
  const quotes = market?.quotes || [];
  if (!quotes.length) return null;
  if (market.key === 'atd') {
    return quotes.reduce((best, q) => (q.over > best.over ? q : best));
  }
  const priceOf = (q) => (side === 'OVER' ? q.over : q.under);
  return quotes.reduce((best, q) => {
    if (q.line === best.line) return priceOf(q) > priceOf(best) ? q : best;
    if (side === 'OVER') return q.line < best.line ? q : best;
    return q.line > best.line ? q : best;
  });
}

/**
 * How much the best number is worth against the worst one, in the units a
 * user actually thinks in: yards of line, or cents of price.
 *
 * @param {object} market Priced market.
 * @param {'OVER'|'UNDER'} [side] Side being shopped.
 * @returns {{best: object, worst: object, lineGap: number, priceGap: number}|null} The spread across books.
 */
export function shopSpread(market, side = 'OVER') {
  const best = bestQuote(market, side);
  if (!best) return null;
  const quotes = market.quotes;
  if (market.key === 'atd') {
    const worst = quotes.reduce((low, q) => (q.over < low.over ? q : low));
    return { best, worst, lineGap: 0, priceGap: best.over - worst.over };
  }
  const worst = quotes.reduce((low, q) => {
    if (q.line === low.line) return q === best ? low : q;
    return side === 'OVER' ? (q.line > low.line ? q : low) : (q.line < low.line ? q : low);
  });
  return {
    best,
    worst,
    lineGap: Math.round(Math.abs(best.line - worst.line) * 10) / 10,
    priceGap: (side === 'OVER' ? best.over - worst.over : best.under - worst.under),
  };
}

/**
 * The desk's read on a market.
 *
 * @param {object} p Player record.
 * @param {object} market Priced market.
 * @returns {{
 *   side: 'OVER'|'UNDER'|'WATCH', verdict: string, model: number,
 *   number: number|null, edge: number, quote: object|null, note: string
 * }} A lean, or WATCH when the number is fair.
 */
export function leanFor(p, market) {
  const model = baselineFor(p, market.key);
  if (market.key === 'atd') {
    const quote = bestQuote(market, 'OVER');
    const implied = impliedProbability(quote.over);
    const edge = model - implied;
    const side = edge >= TD_EDGE ? 'OVER' : 'WATCH';
    return {
      side,
      verdict: side === 'OVER' ? 'LEAN OVER' : 'WATCH',
      model: Math.round(model * 1000) / 1000,
      number: null,
      edge: Math.round(edge * 1000) / 1000,
      quote,
      note: side === 'OVER'
        ? `The desk has him at ${Math.round(model * 100)}% to score; the best price implies ${Math.round(implied * 100)}%.`
        : `The desk has him at ${Math.round(model * 100)}% to score against an implied ${Math.round(implied * 100)}% — no edge worth writing down.`,
    };
  }

  // Shop the side the model actually wants before comparing, so the edge is
  // measured against the number the user could really take.
  const overQuote = bestQuote(market, 'OVER');
  const underQuote = bestQuote(market, 'UNDER');
  const overEdge = (model - overQuote.line) / overQuote.line;
  const underEdge = (underQuote.line - model) / underQuote.line;

  if (overEdge >= YARDS_EDGE && overEdge >= underEdge) {
    return {
      side: 'OVER',
      verdict: 'LEAN OVER',
      model: Math.round(model * 10) / 10,
      number: overQuote.line,
      edge: Math.round(overEdge * 1000) / 1000,
      quote: overQuote,
      note: `Opportunity says ${Math.round(model)} ${market.unit}; the best number to take is ${overQuote.line} at ${overQuote.bookName}.`,
    };
  }
  if (underEdge >= YARDS_EDGE) {
    return {
      side: 'UNDER',
      verdict: 'LEAN UNDER',
      model: Math.round(model * 10) / 10,
      number: underQuote.line,
      edge: Math.round(underEdge * 1000) / 1000,
      quote: underQuote,
      note: `Opportunity says ${Math.round(model)} ${market.unit}; the best number to take is ${underQuote.line} at ${underQuote.bookName}.`,
    };
  }
  return {
    side: 'WATCH',
    verdict: 'WATCH',
    model: Math.round(model * 10) / 10,
    number: overQuote.line,
    edge: Math.round(Math.max(overEdge, underEdge) * 1000) / 1000,
    quote: overQuote,
    note: `Opportunity says ${Math.round(model)} ${market.unit} against a ${overQuote.line} number — close enough to leave alone.`,
  };
}

/**
 * Best line across the books for a game market, from one side's point of view.
 *
 * @param {object[]} quotes Quotes from `gameBoard`.
 * @param {'spread'|'total'|'moneyline'} kind Market kind.
 * @param {'home'|'away'|'over'|'under'} side Side being shopped.
 * @returns {object|null} The winning quote.
 */
export function bestGameQuote(quotes, kind, side) {
  if (!quotes?.length) return null;
  if (kind === 'moneyline') {
    return quotes.reduce((best, q) => (q[side] > best[side] ? q : best));
  }
  if (kind === 'spread') {
    // The bigger number is the better one to take on either side.
    return quotes.reduce((best, q) => (q[side] > best[side] ? q : best));
  }
  return quotes.reduce((best, q) => {
    if (side === 'over') return q.line < best.line ? q : best;
    return q.line > best.line ? q : best;
  });
}
