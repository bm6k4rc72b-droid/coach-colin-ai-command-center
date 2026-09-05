/**
 * Local storage of sessions, and getting them back out again.
 *
 * Everything this app measures stays in this browser. That is not a privacy
 * flourish — resting heart rate and variability are health data, the app has no
 * server to send them to, and the correct amount of that to put on someone
 * else's machine is none. The cost is that the data is exactly as durable as
 * the browser profile, so export exists and is not buried.
 *
 * @module baseline/ledger
 */

const KEY_SESSIONS = 'baseline.sessions.v1';
const KEY_PROFILE = 'baseline.profile.v1';
const KEY_SETTINGS = 'baseline.settings.v1';

/**
 * Read and parse a stored value.
 *
 * @param {string} key Storage key.
 * @param {*} fallback Value to return when absent or corrupt.
 * @returns {*} Stored value or the fallback.
 */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a value, tolerating a full or disabled store.
 *
 * @param {string} key Storage key.
 * @param {*} value Value to store.
 * @returns {boolean} Whether the write succeeded.
 */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Default athlete profile. */
export const DEFAULT_PROFILE = Object.freeze({
  age: 35,
  goal: 'general',
  maxHr: null,
});

/** Default app settings. */
export const DEFAULT_SETTINGS = Object.freeze({
  scanSeconds: 40,
  speak: true,
  haptics: true,
  showWaveform: true,
  protocol: 'coherent',
  breathMinutes: 3,
});

/** @returns {object} The stored athlete profile. */
export function loadProfile() {
  return { ...DEFAULT_PROFILE, ...read(KEY_PROFILE, {}) };
}

/**
 * Persist the athlete profile.
 *
 * @param {object} profile Profile fields.
 * @returns {object} The stored profile.
 */
export function saveProfile(profile) {
  const merged = { ...loadProfile(), ...profile };
  write(KEY_PROFILE, merged);
  return merged;
}

/** @returns {object} The stored settings. */
export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
}

/**
 * Persist settings.
 *
 * @param {object} settings Settings fields.
 * @returns {object} The stored settings.
 */
export function saveSettings(settings) {
  const merged = { ...loadSettings(), ...settings };
  write(KEY_SETTINGS, merged);
  return merged;
}

/** @returns {Array<object>} All stored sessions, newest first. */
export function loadSessions() {
  const rows = read(KEY_SESSIONS, []);
  return Array.isArray(rows) ? rows.filter((row) => row && Number.isFinite(row.at)) : [];
}

/**
 * Build the stored form of a session from a reading and its context.
 *
 * The stored row is deliberately flat and small: the waveform and spectrum are
 * dropped, because a year of scans should be tens of kilobytes, not tens of
 * megabytes, and nothing downstream reads them.
 *
 * @param {object} input Session input.
 * @param {object} input.reading Scan reading.
 * @param {string} input.kind `resting`, `post-session` or `breathing`.
 * @param {object} [input.context] Subjective inputs.
 * @param {object} [input.readiness] Readiness result.
 * @param {object} [input.plan] Coach plan.
 * @param {object} [input.response] Breathing response, when applicable.
 * @param {number} [input.at] Timestamp.
 * @returns {object} A storable session row.
 */
export function sessionRow(input) {
  const { reading, kind, context = {}, readiness = null, plan = null, response = null } = input;
  return {
    at: input.at ?? Date.now(),
    kind,
    bpm: Number(reading.bpm?.toFixed?.(1) ?? reading.bpm ?? 0),
    rmssd: Number((reading.hrv?.rmssd ?? reading.rmssd ?? 0).toFixed(1)),
    sdnn: Number((reading.hrv?.sdnn ?? reading.sdnn ?? 0).toFixed(1)),
    hrvReliable: Boolean(reading.hrv?.reliable ?? reading.hrvReliable),
    breathsPerMin: Number((reading.breathsPerMin ?? 0).toFixed(1)),
    confidence: Number((reading.confidence ?? 0).toFixed(3)),
    grade: reading.grade ?? 'unusable',
    snrDb: Number((reading.snrDb ?? 0).toFixed(1)),
    beats: reading.hrv?.beats ?? 0,
    durationSec: Number((reading.durationSec ?? 0).toFixed(1)),
    method: reading.method ?? null,
    readiness: readiness?.score ?? null,
    band: readiness?.band?.id ?? null,
    tier: plan?.tier ?? null,
    session: plan?.session?.title ?? null,
    sleepHours: context.sleepHours ?? null,
    sleepQuality: context.sleepQuality ?? null,
    soreness: context.soreness ?? null,
    stress: context.stress ?? null,
    alcoholUnits: context.alcoholUnits ?? null,
    breathProtocol: response?.protocolId ?? null,
    breathSwingBpm: response ? Number(response.swingBpm.toFixed(1)) : null,
    breathCoherence: response ? Number(response.coherence.toFixed(3)) : null,
  };
}

/**
 * Append a session.
 *
 * @param {object} row A row from {@link sessionRow}.
 * @returns {Array<object>} All sessions after the append.
 */
export function addSession(row) {
  const rows = loadSessions();
  rows.push(row);
  // Two years of three scans a day, capped so a long-running profile cannot
  // grow without bound in a store that has no quota warning.
  const trimmed = rows.sort((a, b) => a.at - b.at).slice(-2200);
  write(KEY_SESSIONS, trimmed);
  return trimmed;
}

/**
 * Delete one session by timestamp.
 *
 * @param {number} at Session timestamp.
 * @returns {Array<object>} Remaining sessions.
 */
export function removeSession(at) {
  const rows = loadSessions().filter((row) => row.at !== at);
  write(KEY_SESSIONS, rows);
  return rows;
}

/** Delete every stored session, profile and setting. */
export function clearAll() {
  for (const key of [KEY_SESSIONS, KEY_PROFILE, KEY_SETTINGS]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* A store that refuses to delete is a store that stored nothing. */
    }
  }
}

/** Columns exported to CSV, in order. */
export const CSV_COLUMNS = Object.freeze([
  'at', 'iso', 'kind', 'bpm', 'rmssd', 'sdnn', 'hrvReliable', 'breathsPerMin',
  'confidence', 'grade', 'snrDb', 'beats', 'durationSec', 'method', 'readiness',
  'band', 'tier', 'session', 'sleepHours', 'sleepQuality', 'soreness', 'stress',
  'alcoholUnits', 'breathProtocol', 'breathSwingBpm', 'breathCoherence',
]);

/**
 * Render sessions as CSV.
 *
 * @param {Array<object>} rows Sessions.
 * @returns {string} CSV text with a header row.
 */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows.slice().sort((a, b) => a.at - b.at)) {
    const record = { ...row, iso: new Date(row.at).toISOString() };
    lines.push(CSV_COLUMNS.map((column) => {
      const value = record[column];
      if (value === null || value === undefined) return '';
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Render everything as a JSON export.
 *
 * @param {Array<object>} rows Sessions.
 * @param {object} profile Athlete profile.
 * @returns {string} Pretty-printed JSON.
 */
export function toJson(rows, profile) {
  return `${JSON.stringify({
    app: 'baseline',
    schema: 1,
    exportedAt: new Date().toISOString(),
    profile,
    sessions: rows.slice().sort((a, b) => a.at - b.at),
  }, null, 2)}\n`;
}
