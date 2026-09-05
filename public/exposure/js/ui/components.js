/**
 * Shared interface pieces.
 *
 * The desk is dense by design, so these are the few primitives every screen
 * reuses: an initials avatar (there are no player photographs anywhere in the
 * app), verdict pills, the confidence meter, the risk tag, the modal sheet,
 * and the legal block that has to appear identically wherever it appears.
 *
 * @module exposure/ui/components
 */

import { el, num, percent } from '../dom.js';
import { team } from '../data/teams.js';
import { matchupFor } from '../data/players.js';

/**
 * The two disclosures, verbatim. Both are rendered in the first-run modal and
 * in the footer of every screen; keeping the strings here means they cannot
 * drift apart.
 */
export const LEGAL = {
  affiliation: 'Independent analysis tool. Not affiliated with, endorsed by, or sponsored by the National Football League, its member clubs, or NFL Properties. Team names are used only to identify publicly reported games and players.',
  gambling: '21+. Betting information is for adults where legal. We are not a sportsbook and do not accept wagers. If you or someone you know has a gambling problem, call 1-800-GAMBLER.',
};

/**
 * Initials avatar. No headshots: the app has no licence to anyone's likeness
 * and does not need one to identify a player in a row.
 *
 * @param {object} p Player record.
 * @param {string} [size] `sm`, `md` or `lg`.
 * @returns {HTMLElement} The avatar.
 */
export function avatar(p, size = 'md') {
  return el(`span.avatar.avatar-${size}`, {
    'aria-hidden': 'true',
    style: { '--tint': team(p.team).tint },
  }, [el('span.avatar-initials', { text: p.initials })]);
}

/**
 * A verdict pill.
 *
 * @param {string} verdict One of START, SIT, WATCH, LEAN OVER, LEAN UNDER.
 * @param {object} [options] Options.
 * @param {boolean} [options.small] Render the compact size.
 * @returns {HTMLElement} The pill.
 */
export function verdictPill(verdict, options = {}) {
  const key = String(verdict).toLowerCase().replace(/\s+/g, '-');
  return el(`span.pill.pill-${key}${options.small ? '.pill-sm' : ''}`, { text: verdict });
}

/**
 * The 1-5 confidence meter.
 *
 * @param {number} level Confidence, 1-5.
 * @returns {HTMLElement} The meter, labelled for screen readers.
 */
export function confidenceMeter(level) {
  const dots = [];
  for (let i = 1; i <= 5; i += 1) {
    dots.push(el(`i.dot${i <= level ? '.on' : ''}`, { 'aria-hidden': 'true' }));
  }
  return el('span.confidence', {
    role: 'img',
    'aria-label': `Confidence ${level} of 5`,
    title: `Confidence ${level} of 5`,
  }, dots);
}

/**
 * A risk tag from the exposure engine.
 *
 * @param {string} risk `OK`, `STACKED` or `OVERLOADED`.
 * @returns {HTMLElement} The tag.
 */
export function riskTag(risk) {
  return el(`span.tag.tag-${String(risk).toLowerCase()}`, { text: risk });
}

/**
 * An injury designation flag, or nothing when the player is clean.
 *
 * @param {object} p Player record.
 * @returns {HTMLElement|null} The flag.
 */
export function injuryFlag(p) {
  const status = p?.injury?.status || 'ACTIVE';
  if (status === 'ACTIVE') return null;
  const short = { QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'OUT', PROBABLE: 'P' }[status] || status;
  return el(`span.flag.flag-${status.toLowerCase()}`, {
    title: `${status}${p.injury.note ? ` — ${p.injury.note}` : ''}`,
    'aria-label': `Injury status ${status}`,
    text: short,
  });
}

/**
 * The identity line under a player's name: club as text, position, opponent.
 *
 * A dense row on a phone cannot hold the city as well as everything else
 * without truncating mid-word, so rows take the compact form and the player
 * card — where there is room, and where the brief asks for it — takes the full
 * one. Screen readers always get the full line.
 *
 * @param {object} p Player record.
 * @param {number} week Week number.
 * @param {object} [options] Options.
 * @param {boolean} [options.compact] Drop the city.
 * @returns {string} e.g. `Kansas City · KC · WR · vs LAC`.
 */
export function identityLine(p, week, options = {}) {
  const t = team(p.team);
  const matchup = matchupFor(p, week);
  const parts = options.compact ? [t.abbr, p.pos] : [t.city, t.abbr, p.pos];
  return [...parts, matchup ? matchup.label : 'Bye'].join(' · ');
}

/**
 * A player row: avatar, name, identity line, and whatever the screen wants on
 * the right. Rows are buttons, sized to the 44px tap target.
 *
 * @param {object} options Options.
 * @param {object} options.player Player record.
 * @param {number} options.week Week number.
 * @param {Array<Node|string>} [options.right] Right-hand content.
 * @param {string} [options.lead] Optional leading label, such as a slot name.
 * @param {Function} [options.onClick] Click handler.
 * @returns {HTMLElement} The row.
 */
export function playerRow({ player: p, week, right = [], lead = '', onClick }) {
  const name = el('span.row-name', {}, [p.name, injuryFlag(p)].filter(Boolean));
  const body = el('span.row-body', {}, [
    name,
    el('span.row-sub', { text: identityLine(p, week, { compact: true }) }),
  ]);
  const children = [
    lead ? el('span.row-lead', { text: lead }) : null,
    avatar(p),
    body,
    el('span.row-right', {}, right),
  ].filter(Boolean);
  return el('button.row', {
    type: 'button',
    onclick: onClick,
    'aria-label': `${p.name}, ${identityLine(p, week)}`,
  }, children);
}

/**
 * An empty state. Every one of them says what to do next, because an empty
 * screen with no instruction is how a user decides an app is broken.
 *
 * @param {object} options Options.
 * @param {string} options.title Headline.
 * @param {string} options.body Explanation.
 * @param {string} [options.actionLabel] Button label.
 * @param {Function} [options.onAction] Button handler.
 * @returns {HTMLElement} The empty state.
 */
export function emptyState({ title, body, actionLabel, onAction }) {
  return el('div.empty', {}, [
    el('div.empty-mark', { 'aria-hidden': 'true', text: '◫' }),
    el('h3.empty-title', { text: title }),
    el('p.empty-body', { text: body }),
    actionLabel ? el('button.btn.primary', { type: 'button', onclick: onAction, text: actionLabel }) : null,
  ].filter(Boolean));
}

/**
 * A labelled statistic with a bar, for the opportunity tab.
 *
 * @param {string} label Statistic name.
 * @param {number} value Raw value.
 * @param {object} [options] Options.
 * @param {number} [options.max] Value that fills the bar.
 * @param {boolean} [options.asPercent] Render the value as a percentage.
 * @param {string} [options.suffix] Unit suffix.
 * @returns {HTMLElement} The stat block.
 */
export function statBar(label, value, options = {}) {
  const { max = 1, asPercent = false, suffix = '' } = options;
  const filled = Math.max(0, Math.min(1, (value || 0) / max));
  return el('div.stat', {}, [
    el('div.stat-head', {}, [
      el('span.stat-label', { text: label }),
      el('span.stat-value', { text: asPercent ? percent(value) : `${num(value)}${suffix}` }),
    ]),
    el('div.stat-track', { 'aria-hidden': 'true' }, [
      el('div.stat-fill', { style: { width: `${(filled * 100).toFixed(1)}%` } }),
    ]),
  ]);
}

/**
 * A badge for anything the desk modelled rather than measured.
 *
 * Names and injury designations can come from a real feed; projections,
 * opportunity figures, prop numbers and verdicts are the desk's own work on
 * sample data, and every surface that shows one says so.
 *
 * @param {string} [label] Badge text.
 * @returns {HTMLElement} The badge.
 */
export function demoBadge(label = 'DEMO') {
  return el('span.demo-badge', {
    text: label,
    title: 'Modelled from the demo seed, not measured or reported.',
  });
}

/**
 * A section heading with an optional right-hand note.
 *
 * @param {string} title Heading text.
 * @param {string} [note] Right-hand note.
 * @param {object} [options] Options.
 * @param {boolean} [options.demo] Mark the section's numbers as modelled.
 * @returns {HTMLElement} The heading.
 */
export function sectionTitle(title, note = '', options = {}) {
  return el('div.section-head', {}, [
    el('h2.section-title', { text: title }),
    el('span.section-right', {}, [
      note ? el('span.section-note', { text: note }) : null,
      options.demo ? demoBadge() : null,
    ].filter(Boolean)),
  ]);
}

/**
 * The legal block. Rendered identically in the footer and the first-run modal.
 *
 * @returns {HTMLElement} The disclosures.
 */
export function legalBlock() {
  return el('div.legal', {}, [
    el('p.legal-line', { text: LEGAL.affiliation }),
    el('p.legal-line', { text: LEGAL.gambling }),
  ]);
}

/**
 * The page footer.
 *
 * @param {Function} [onResponsible] Handler for the responsible-gaming link.
 * @returns {HTMLElement} The footer.
 */
export function footer(onResponsible) {
  return el('footer.page-footer', {}, [
    legalBlock(),
    el('p.legal-links', {}, [
      el('a.legal-link', {
        href: 'https://www.1800gambler.net/',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Responsible gaming resources',
        onclick: onResponsible,
      }),
      el('span.legal-dot', { 'aria-hidden': 'true', text: '·' }),
      el('span.legal-muted', { text: 'Demo data. No live feed, no wagering.' }),
    ]),
  ]);
}

/**
 * Open a modal sheet. Returns a closer so callers can dismiss it themselves.
 *
 * @param {object} options Options.
 * @param {string} options.title Sheet title.
 * @param {Node|Node[]} options.content Sheet body.
 * @param {Function} [options.onClose] Called after the sheet closes.
 * @returns {() => void} Close the sheet.
 */
export function openSheet({ title, content, onClose }) {
  const previous = document.activeElement;
  const closeButton = el('button.icon-btn.sheet-close', {
    type: 'button', 'aria-label': 'Close', text: '✕',
  });
  const panel = el('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('div.sheet-head', {}, [el('h2.sheet-title', { text: title }), closeButton]),
    el('div.sheet-body', {}, [].concat(content)),
  ]);
  const scrim = el('div.scrim', {}, [panel]);

  const close = () => {
    scrim.remove();
    document.removeEventListener('keydown', onKey);
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };
  function onKey(event) {
    if (event.key === 'Escape') close();
  }
  closeButton.addEventListener('click', close);
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(scrim);
  closeButton.focus();
  return close;
}

/**
 * A key/value line, the densest way to state a fact.
 *
 * @param {string} label Label.
 * @param {string|Node} value Value.
 * @returns {HTMLElement} The line.
 */
export function kv(label, value) {
  return el('div.kv', {}, [
    el('span.kv-label', { text: label }),
    value instanceof Node ? value : el('span.kv-value', { text: String(value) }),
  ]);
}
