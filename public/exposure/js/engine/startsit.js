/**
 * The Start/Sit engine.
 *
 * Four inputs, weighted and summed into a single case number: how far the
 * projection clears the startable line for the slot, how the matchup grades,
 * what the opportunity profile says about volume, and what the market implies
 * about the game environment. Injury designations are applied last because
 * they cap certainty rather than change the argument.
 *
 * The engine is intentionally legible. A verdict nobody can argue with is a
 * verdict nobody can check, so every call ships with the drivers that produced
 * it and a two-sentence reason written from those drivers.
 *
 * @module exposure/engine/startsit
 */

import { impliedTotal } from '../data/games.js';
import { matchupFor, projFor } from '../data/players.js';

/**
 * Points a player must project for to be a defensible start at each position,
 * by scoring format. These are 12-team replacement levels, not thresholds
 * borrowed from anyone's rankings.
 */
export const BASELINES = {
  QB: { ppr: 17.5, half: 17.5, std: 17.5 },
  RB: { ppr: 12.5, half: 11.5, std: 10.5 },
  WR: { ppr: 12.5, half: 11.0, std: 9.5 },
  TE: { ppr: 9.0, half: 8.0, std: 7.0 },
};

/** How much each injury designation costs the case, and what it caps confidence at. */
const INJURY = {
  ACTIVE: { penalty: 0, cap: 5 },
  PROBABLE: { penalty: -1, cap: 5 },
  QUESTIONABLE: { penalty: -6, cap: 3 },
  DOUBTFUL: { penalty: -18, cap: 4 },
  OUT: { penalty: -100, cap: 5 },
};

/** Clamp a number into a range. */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** One decimal, without a trailing `.0` that would read like a typo in prose. */
const one = (value) => (Math.round(value * 10) / 10).toString();

/** Percentage, as a whole number. */
const pct = (value) => `${Math.round(value * 100)}%`;

/**
 * Grade a matchup rank into a signed contribution.
 *
 * @param {number} rank Defensive rank against the position, 1 = toughest.
 * @returns {number} Contribution in roughly [-8, 8].
 */
export function matchupScore(rank) {
  return clamp(((rank - 16.5) / 15.5) * 8, -8, 8);
}

/**
 * Grade an opportunity profile into a signed contribution.
 *
 * Volume is the most stable thing about a football player, so this is the
 * driver the engine trusts most after the projection itself.
 *
 * @param {object} p Player record.
 * @returns {number} Contribution in roughly [-8, 8].
 */
export function opportunityScore(p) {
  const o = p.opportunity || {};
  if (p.pos === 'QB') {
    return clamp(((o.passAttempts || 0) - 31) * 0.6 + ((o.rushAttempts || 0) - 3.5) * 0.7, -8, 8);
  }
  if (p.pos === 'RB') {
    return clamp(((o.rushShare || 0) - 0.55) * 26 + ((o.targetShare || 0) - 0.10) * 34
      + ((o.rzTouches || 0) - 2.2) * 1.5, -8, 8);
  }
  return clamp(((o.targetShare || 0) - 0.19) * 46 + ((o.routes || 0) - 27) * 0.22
    + ((o.rzTouches || 0) - 1.2) * 1.4, -8, 8);
}

/**
 * Grade the game environment from the implied team total.
 *
 * @param {string} teamAbbr Team abbreviation.
 * @param {number} week Week number.
 * @returns {number} Contribution in roughly [-6, 6].
 */
export function environmentScore(teamAbbr, week) {
  return clamp((impliedTotal(teamAbbr, week) - 22) * 1.1, -6, 6);
}

/**
 * The startable line for a player in a slot.
 *
 * @param {object} p Player record.
 * @param {string} slot Slot name; `FLEX` uses the harder of RB and WR.
 * @param {'ppr'|'half'|'std'} scoring Scoring format.
 * @returns {number} Baseline points.
 */
export function baselineFor(p, slot, scoring) {
  if (slot === 'FLEX') {
    const rb = BASELINES.RB[scoring];
    const wr = BASELINES.WR[scoring];
    const te = BASELINES.TE[scoring];
    // A flex has to beat the best bench alternative, so hold it to the higher line.
    return Math.max(rb, wr, p.pos === 'TE' ? te : 0);
  }
  return (BASELINES[p.pos] || BASELINES.WR)[scoring];
}

/**
 * Produce a verdict for one player.
 *
 * @param {object} p Player record.
 * @param {object} [context] Context.
 * @param {number} [context.week] Week number.
 * @param {'ppr'|'half'|'std'} [context.scoring] Scoring format.
 * @param {string} [context.slot] Slot the player would occupy.
 * @returns {{
 *   verdict: 'START'|'SIT'|'WATCH', confidence: number, score: number,
 *   reason: string, drivers: Array<{label: string, value: number, note: string}>
 * }} The call, its confidence in 1-5, and the drivers behind it.
 */
export function startSit(p, context = {}) {
  const week = context.week || 1;
  const scoring = context.scoring || 'ppr';
  const slot = context.slot || p.pos;

  const projection = projFor(p, scoring);
  const baseline = baselineFor(p, slot, scoring);
  const projectionEdge = clamp((projection - baseline) * 1.35, -14, 14);
  const matchup = matchupFor(p, week);
  const matchupEdge = matchup ? matchupScore(matchup.rank) : 0;
  const opportunityEdge = opportunityScore(p);
  const environmentEdge = environmentScore(p.team, week);
  const status = (p.injury && p.injury.status) || 'ACTIVE';
  const injury = INJURY[status] || INJURY.ACTIVE;

  const score = projectionEdge + matchupEdge + opportunityEdge + environmentEdge + injury.penalty;

  const drivers = [
    {
      label: 'Projection vs slot',
      value: projectionEdge,
      note: `${one(projection)} projected against a ${one(baseline)} line for ${slot}.`,
    },
    {
      label: 'Matchup',
      value: matchupEdge,
      note: matchup
        ? `Opponent ranks ${matchup.rank} of 32 against ${p.pos}s.`
        : 'No game on the slate this week.',
    },
    {
      label: 'Opportunity',
      value: opportunityEdge,
      note: p.pos === 'RB'
        ? `${pct(p.opportunity.rushShare || 0)} rush share and ${one(p.opportunity.rzTouches || 0)} red-zone touches.`
        : (p.pos === 'QB'
          ? `${one(p.opportunity.passAttempts || 0)} attempts and ${one(p.opportunity.rushAttempts || 0)} carries a game.`
          : `${pct(p.opportunity.targetShare || 0)} target share on ${one(p.opportunity.routes || 0)} routes.`),
    },
    {
      label: 'Environment',
      value: environmentEdge,
      note: `${one(impliedTotal(p.team, week))} implied team total.`,
    },
    {
      label: 'Availability',
      value: injury.penalty,
      note: status === 'ACTIVE'
        ? 'No designation on the injury report.'
        : `listed ${status.toLowerCase()}${p.injury.note ? ` (${trimStop(p.injury.note)})` : ''}.`,
    },
  ];

  let verdict = 'WATCH';
  if (status === 'OUT' || status === 'DOUBTFUL') verdict = 'SIT';
  else if (score >= 6) verdict = 'START';
  else if (score <= -6) verdict = 'SIT';

  const magnitude = Math.abs(score);
  let confidence = magnitude >= 18 ? 5 : magnitude >= 12 ? 4 : magnitude >= 6 ? 3 : magnitude >= 2.5 ? 2 : 1;
  if (status === 'OUT') confidence = 5;
  confidence = Math.min(confidence, injury.cap);

  return { verdict, confidence, score: Math.round(score * 10) / 10, reason: reasonFor(p, verdict, drivers, status), drivers };
}

/**
 * Write the two-sentence reason.
 *
 * The first sentence carries the strongest argument for the call; the second
 * carries the strongest thing arguing against it, or what to watch when
 * nothing does. Exactly two sentences, every time — a verdict a user has to
 * read a paragraph to understand is a verdict they will skip.
 *
 * @param {object} p Player record.
 * @param {string} verdict The call.
 * @param {Array<{label: string, value: number, note: string}>} drivers Scored drivers.
 * @param {string} status Injury designation.
 * @returns {string} Two sentences.
 */
export function reasonFor(p, verdict, drivers, status) {
  if (status === 'OUT') {
    return `${p.name} is ruled out, so the slot needs a body rather than a debate. `
      + 'Move the best available bench player into it before kickoff.';
  }
  const ranked = [...drivers].sort((a, b) => b.value - a.value);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const lead = { START: 'Start him', SIT: 'Sit him', WATCH: 'This is a coin flip' }[verdict];

  const first = `${lead}: ${lowerFirst(trimStop(best.note))}`;
  const second = worst.value < -0.5
    ? `The case against is ${worst.label.toLowerCase()} — ${lowerFirst(trimStop(worst.note))}`
    : {
      START: 'Nothing in the profile argues the other way, so the only real risk is game script',
      SIT: 'Even the parts of the profile that help him are not enough to clear the slot',
      WATCH: 'No single driver is decisive, so this comes down to how strong the bench alternative is',
    }[verdict];
  return `${first}. ${second}.`;
}

/** Drop a single trailing sentence stop, so appended punctuation cannot double up. */
function trimStop(text) {
  return String(text).replace(/[.!?]+$/, '');
}

/** Lowercase the first letter, leaving acronyms and numbers alone. */
function lowerFirst(text) {
  const value = String(text);
  return /^[A-Z][a-z]/.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/**
 * Compare two players for the same slot.
 *
 * @param {object} a First player.
 * @param {object} b Second player.
 * @param {object} [context] Same context as {@link startSit}.
 * @returns {{winner: object, loser: object, margin: number, calls: object[], summary: string}}
 *   Which player the engine prefers, by how much, and why.
 */
export function comparePlayers(a, b, context = {}) {
  const callA = startSit(a, context);
  const callB = startSit(b, context);
  const aWins = callA.score >= callB.score;
  const winner = aWins ? a : b;
  const loser = aWins ? b : a;
  const margin = Math.round(Math.abs(callA.score - callB.score) * 10) / 10;
  const summary = margin < 2
    ? `${winner.name} by a hair — close enough that either start is defensible.`
    : `${winner.name} by ${margin} points of case, mostly on ${
      (aWins ? callA : callB).drivers.slice().sort((x, y) => y.value - x.value)[0].label.toLowerCase()}.`;
  return { winner, loser, margin, calls: aWins ? [callA, callB] : [callB, callA], summary };
}
