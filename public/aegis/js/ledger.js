/**
 * What happened, kept on this device.
 *
 * The ledger exists for a reason that has nothing to do with the alarm. A
 * person's falls are a medical signal — the frequency, the time of day, the
 * room, whether they got themselves up — and that pattern is exactly what a
 * doctor asks about and exactly what nobody can remember accurately. Six
 * months of "she went down twice in the night in February, both times getting
 * out of bed, and both times she got herself up" is worth more to a clinician
 * than any single alarm this app will ever raise.
 *
 * So every episode is written down, including — especially — the ones where
 * Aegis was wrong. A ledger that only records the alarms it stands by is a
 * ledger that cannot be used to judge it.
 *
 * It never leaves the device unless somebody exports it. There is no account,
 * no sync and no server, which is a deliberate limitation with a cost: clear
 * the browser's data and the history goes with it. The export button is the
 * answer to that and the interface says so.
 *
 * @module aegis/ledger
 */

const STORE = 'aegis.ledger.v1';

/** The most entries kept before the oldest are dropped. */
const CAP = 400;

/**
 * One recorded episode.
 *
 * @typedef {object} Entry
 * @property {number} at Unix milliseconds.
 * @property {string} kind One of `fall`, `found-down`, `checked`, `stood-down`, `rehearsal`, `note`.
 * @property {string} outcome What ended it: `got up`, `said fine`, `contacts raised`, `no answer`.
 * @property {number} belief Peak fused belief.
 * @property {string[]} channels Which channels agreed.
 * @property {number} downMs How long they were down, where known.
 * @property {boolean} watched Whether the descent itself was seen.
 * @property {string} note Free text.
 */

/**
 * Read the ledger, newest first.
 *
 * @returns {Entry[]} The entries.
 */
export function readLedger() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Append an entry.
 *
 * @param {Partial<Entry>} entry What to record.
 * @returns {Entry[]} The ledger, newest first.
 */
export function record(entry) {
  const entries = readLedger();
  entries.unshift({
    at: Date.now(),
    kind: 'note',
    outcome: '',
    belief: 0,
    channels: [],
    downMs: 0,
    watched: false,
    note: '',
    ...entry,
  });
  const trimmed = entries.slice(0, CAP);
  try {
    localStorage.setItem(STORE, JSON.stringify(trimmed));
  } catch {
    // Storage full or blocked. The session's entries are still in memory for
    // as long as the page is open, which is better than throwing.
  }
  return trimmed;
}

/** Empty the ledger. */
export function clearLedger() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    // Nothing to do; the caller re-reads and finds whatever is there.
  }
}

/**
 * Summarise the ledger the way somebody would want it read out.
 *
 * @param {Entry[]} [entries] The entries; read from storage when omitted.
 * @returns {{total: number, falls: number, gotUp: number, nights: number, text: string}}
 *   The summary and a sentence describing it.
 */
export function summarise(entries = readLedger()) {
  const falls = entries.filter((e) => e.kind === 'fall' || e.kind === 'found-down');
  const gotUp = falls.filter((e) => e.outcome === 'got up').length;
  const nights = falls.filter((e) => {
    const hour = new Date(e.at).getHours();
    return hour >= 22 || hour < 6;
  }).length;
  let text;
  if (!falls.length) text = entries.length ? 'Nothing has been recorded as a fall.' : 'The ledger is empty.';
  else {
    const parts = [`${falls.length} ${falls.length === 1 ? 'episode' : 'episodes'} recorded`];
    if (gotUp) parts.push(`${gotUp} where they got themselves up`);
    if (nights) parts.push(`${nights} between ten at night and six in the morning`);
    text = `${parts.join(', ')}.`;
  }
  return { total: entries.length, falls: falls.length, gotUp, nights, text };
}

/**
 * Render the ledger as CSV, for somebody's doctor.
 *
 * @param {Entry[]} [entries] The entries.
 * @returns {string} CSV, with a header row.
 */
export function toCsv(entries = readLedger()) {
  const header = 'when,kind,outcome,confidence,channels,seconds_down,descent_watched,note';
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = entries.map((e) => [
    new Date(e.at).toISOString(),
    e.kind,
    e.outcome,
    Math.round((e.belief || 0) * 100),
    (e.channels || []).join(' + '),
    Math.round((e.downMs || 0) / 1000),
    e.watched ? 'yes' : 'no',
    e.note,
  ].map(escape).join(','));
  return [header, ...rows].join('\n');
}
