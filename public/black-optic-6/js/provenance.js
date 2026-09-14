/**
 * Where every number on this screen came from.
 *
 * A security console is read at two in the morning by somebody deciding whether
 * to walk outside. That is the whole reason this module exists and is imported
 * by every panel: a reading with no stated origin is worse than no reading,
 * because it is acted on with the same confidence as a measurement whether or
 * not anything measured it.
 *
 * So nothing renders here without a provenance. Six states, one colour each,
 * and they are the first thing drawn on any panel — before the value.
 *
 * - `LIVE` — a sensor on this device is producing this right now.
 * - `LINK` — a real external device is feeding it, and it is named.
 * - `MODEL` — computed from something measured, with its uncertainty attached.
 * - `BLOCKED` — the platform refuses the sensor. Nothing will change that here.
 * - `HARDWARE` — physically needs a sensor this device does not have.
 * - `UNSOUND` — the sensor could exist and the inference still would not hold.
 *
 * The last one is the one that matters most. A console can display anything;
 * the question is whether the thing displayed is supported by what was
 * measured. `UNSOUND` is how this app says "no" to its own feature list.
 *
 * @module black-optic-6/provenance
 */

/**
 * A provenance state.
 *
 * @typedef {object} Provenance
 * @property {string} id Stable identifier.
 * @property {string} label What appears on the badge.
 * @property {string} tone Palette token the badge is drawn in.
 * @property {boolean} trustworthy Whether a reading in this state may be acted on.
 * @property {string} meaning One line, shown on hover and in the ledger.
 */

/** Every provenance state, in descending order of trust. */
export const STATES = Object.freeze({
  LIVE: {
    id: 'LIVE',
    label: 'LIVE',
    tone: 'confirm',
    trustworthy: true,
    meaning: 'Measured by a sensor on this device, now.',
  },
  LINK: {
    id: 'LINK',
    label: 'LINKED',
    tone: 'primary',
    trustworthy: true,
    meaning: 'Measured by a named external device connected to this console.',
  },
  MODEL: {
    id: 'MODEL',
    label: 'MODELLED',
    tone: 'caution',
    trustworthy: true,
    meaning: 'Computed from a measurement. Carries its own error.',
  },
  BLOCKED: {
    id: 'BLOCKED',
    label: 'BLOCKED',
    tone: 'muted',
    trustworthy: false,
    meaning: 'The platform exposes no such sensor to any web application.',
  },
  HARDWARE: {
    id: 'HARDWARE',
    label: 'NEEDS KIT',
    tone: 'muted',
    trustworthy: false,
    meaning: 'Physically requires a sensor this device does not contain.',
  },
  UNSOUND: {
    id: 'UNSOUND',
    label: 'UNSOUND',
    tone: 'alert',
    trustworthy: false,
    meaning: 'Even with the sensor, the measurement does not support the claim.',
  },
});

/** The ordering used anywhere states are sorted. */
export const ORDER = Object.freeze(['LIVE', 'LINK', 'MODEL', 'HARDWARE', 'BLOCKED', 'UNSOUND']);

/**
 * Look up a state.
 *
 * An unknown id resolves to `UNSOUND` rather than to nothing. A panel that has
 * lost track of its own provenance is exactly the panel that must not be
 * believed, and failing closed is the only safe direction for that error.
 *
 * @param {string} id State identifier.
 * @returns {Provenance} The state.
 */
export function stateFor(id) {
  return STATES[id] ?? STATES.UNSOUND;
}

/**
 * A reading, with its origin attached.
 *
 * @typedef {object} Reading
 * @property {string} state Provenance id.
 * @property {*} value The reading itself, or null when there is none.
 * @property {string} [unit] Unit the value is in.
 * @property {number} [error] Plus-or-minus, in the same unit.
 * @property {string} [source] What produced it.
 * @property {number} [atMs] When it was taken.
 */

/**
 * Build a reading.
 *
 * @param {string} state Provenance id.
 * @param {*} value The value, or null.
 * @param {object} [detail] Unit, error, source, timestamp.
 * @returns {Reading} The reading.
 */
export function reading(state, value, detail = {}) {
  return {
    state: stateFor(state).id,
    value,
    unit: detail.unit ?? '',
    error: Number.isFinite(detail.error) ? detail.error : null,
    source: detail.source ?? '',
    atMs: Number.isFinite(detail.atMs) ? detail.atMs : null,
  };
}

/**
 * How a reading should be written out, error included.
 *
 * A modelled number without its error is a measured number as far as the reader
 * is concerned, so the error is part of the string rather than a tooltip.
 *
 * @param {Reading} value The reading.
 * @param {number} [digits=1] Decimal places for numeric values.
 * @returns {string} Display text.
 */
export function format(value, digits = 1) {
  if (!value || value.value === null || value.value === undefined) return '—';
  const body = typeof value.value === 'number' ? value.value.toFixed(digits) : String(value.value);
  const unit = value.unit ? ` ${value.unit}` : '';
  const error = value.error !== null && value.error !== undefined ? ` ±${value.error.toFixed(digits)}` : '';
  return `${body}${error}${unit}`;
}

/**
 * Whether a reading may drive an alert.
 *
 * Alerts wake people up and send them outside. Only states that measured
 * something are allowed to do that; everything else may be displayed but may
 * never raise the alarm.
 *
 * @param {Reading} value The reading.
 * @returns {boolean} True if it can be acted on.
 */
export function actionable(value) {
  if (!value || value.value === null || value.value === undefined) return false;
  return stateFor(value.state).trustworthy;
}

/**
 * How stale a reading is, in seconds.
 *
 * @param {Reading} value The reading.
 * @param {number} [nowMs=Date.now()] Clock.
 * @returns {number|null} Age in seconds, or null if it carries no timestamp.
 */
export function ageSeconds(value, nowMs = Date.now()) {
  if (!value?.atMs) return null;
  return Math.max(0, (nowMs - value.atMs) / 1000);
}
