/**
 * The field ledger — durable, offline scan history.
 *
 * Every saved scan is a dated, geotagged maturity reading for a named plot.
 * That history is what turns a novelty camera filter into an agronomy tool: it
 * feeds the measured ripening velocity in `forecast.js`, it survives closing
 * the app, and it exports to CSV or GeoJSON so a farm can put it in whatever
 * system it already runs.
 *
 * Storage is `localStorage` on purpose — synchronous, universally available in
 * a home-screen web app on both iOS and Android, and trivially exportable.
 *
 * @module harvest-eye/ledger
 */

const SCANS_KEY = 'harvesteye.scans.v1';
const SETTINGS_KEY = 'harvesteye.settings.v1';
const PROFILES_KEY = 'harvesteye.profiles.v1';

/** Oldest scans are dropped past this count to stay inside storage quota. */
export const MAX_SCANS = 800;

/**
 * @typedef {object} Scan
 * @property {string} id Unique record id.
 * @property {number} ts Epoch milliseconds of capture.
 * @property {string} cropId Crop profile id.
 * @property {string} plot Operator-supplied block name.
 * @property {number|null} lat Latitude, when location was granted.
 * @property {number|null} lon Longitude, when location was granted.
 * @property {number|null} accuracy GPS accuracy in metres.
 * @property {number} meanMaturity Frame mean maturity in [0,1].
 * @property {number} readyShare Fraction of detected fruit at or past harvest.
 * @property {number} decayShare Fraction of frame pixels reading as senescent.
 * @property {number} clusters Cluster count.
 * @property {number} fruitEstimate Estimated fruit in view.
 * @property {number} confidence Mean detection confidence.
 * @property {number} tempC Temperature used for the nominal forecast.
 * @property {string} note Free-text operator note.
 */

/** Reads and writes the scan history and operator settings. */
export class Ledger {
  /**
   * @param {Storage} [storage] Storage backend; defaults to `localStorage`.
   */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  /**
   * Read a JSON key, tolerating absent or corrupted values.
   *
   * @param {string} key Storage key.
   * @param {*} fallback Value to return when the key is missing or unparsable.
   * @returns {*} Parsed value or the fallback.
   */
  read(key, fallback) {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Write a JSON key, swallowing quota failures.
   *
   * @param {string} key Storage key.
   * @param {*} value Value to serialize.
   * @returns {boolean} Whether the write landed.
   */
  write(key, value) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * All scans, newest first.
   *
   * @returns {Scan[]} Stored scans.
   */
  scans() {
    const rows = this.read(SCANS_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Append a scan to the ledger.
   *
   * @param {Partial<Scan>} scan Scan to store; `id` and `ts` are filled in.
   * @returns {Scan} The stored record.
   */
  add(scan) {
    const record = {
      id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...scan,
    };
    const rows = [record, ...this.scans()].slice(0, MAX_SCANS);
    this.write(SCANS_KEY, rows);
    return record;
  }

  /**
   * Scans for one plot and crop, oldest first — the shape the forecaster wants.
   *
   * @param {string} plot Plot name.
   * @param {string} cropId Crop id.
   * @returns {Scan[]} Matching scans in chronological order.
   */
  history(plot, cropId) {
    return this.scans()
      .filter((scan) => scan.plot === plot && scan.cropId === cropId)
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * Distinct plot names in the ledger, most recently scanned first.
   *
   * @returns {string[]} Plot names.
   */
  plots() {
    const seen = new Map();
    for (const scan of this.scans()) {
      if (scan.plot && !seen.has(scan.plot)) seen.set(scan.plot, scan.ts);
    }
    return [...seen.keys()];
  }

  /**
   * Delete one scan.
   *
   * @param {string} id Scan id.
   */
  remove(id) {
    this.write(SCANS_KEY, this.scans().filter((scan) => scan.id !== id));
  }

  /** Delete every scan. */
  clear() {
    this.write(SCANS_KEY, []);
  }

  /**
   * Operator settings (plot name, temperature, calibration gains, toggles).
   *
   * @returns {Record<string, *>} Stored settings.
   */
  settings() {
    return this.read(SETTINGS_KEY, {});
  }

  /**
   * Merge a patch into the stored settings.
   *
   * @param {Record<string, *>} patch Fields to update.
   * @returns {Record<string, *>} The merged settings.
   */
  saveSettings(patch) {
    const next = { ...this.settings(), ...patch };
    this.write(SETTINGS_KEY, next);
    return next;
  }

  /**
   * Crop-profile overrides written by teach mode.
   *
   * @returns {Record<string, object>} Overrides keyed by crop id.
   */
  profileOverrides() {
    return this.read(PROFILES_KEY, {});
  }

  /**
   * Store one crop's learned profile.
   *
   * @param {string} cropId Crop id.
   * @param {object} override Partial profile to overlay on the default.
   */
  saveProfileOverride(cropId, override) {
    this.write(PROFILES_KEY, { ...this.profileOverrides(), [cropId]: override });
  }

  /**
   * Discard learned profiles and return to the shipped defaults.
   */
  resetProfiles() {
    this.write(PROFILES_KEY, {});
  }
}

/** Columns emitted by {@link toCsv}, in order. */
const CSV_COLUMNS = [
  'id', 'timestamp', 'plot', 'crop', 'lat', 'lon', 'accuracy_m',
  'mean_maturity', 'ready_share', 'decay_share', 'clusters',
  'fruit_estimate', 'confidence', 'temp_c', 'note',
];

/**
 * Escape one CSV field.
 *
 * @param {*} value Field value.
 * @returns {string} Quoted field.
 */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Render scans as CSV.
 *
 * @param {Scan[]} scans Scans to export.
 * @returns {string} CSV document including the header row.
 */
export function toCsv(scans) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const scan of scans) {
    lines.push([
      scan.id,
      new Date(scan.ts).toISOString(),
      scan.plot,
      scan.cropId,
      scan.lat ?? '',
      scan.lon ?? '',
      scan.accuracy ?? '',
      scan.meanMaturity?.toFixed(4) ?? '',
      scan.readyShare?.toFixed(4) ?? '',
      scan.decayShare?.toFixed(4) ?? '',
      scan.clusters ?? '',
      scan.fruitEstimate ?? '',
      scan.confidence?.toFixed(3) ?? '',
      scan.tempC ?? '',
      scan.note ?? '',
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Render geotagged scans as a GeoJSON FeatureCollection.
 *
 * Scans without a fix are omitted — a point at (0, 0) off the coast of Ghana is
 * worse than no point at all.
 *
 * @param {Scan[]} scans Scans to export.
 * @returns {object} GeoJSON FeatureCollection.
 */
export function toGeoJson(scans) {
  return {
    type: 'FeatureCollection',
    features: scans
      .filter((scan) => Number.isFinite(scan.lat) && Number.isFinite(scan.lon))
      .map((scan) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [scan.lon, scan.lat] },
        properties: {
          id: scan.id,
          timestamp: new Date(scan.ts).toISOString(),
          plot: scan.plot,
          crop: scan.cropId,
          meanMaturity: scan.meanMaturity,
          readyShare: scan.readyShare,
          decayShare: scan.decayShare,
          fruitEstimate: scan.fruitEstimate,
          confidence: scan.confidence,
          note: scan.note ?? '',
        },
      })),
  };
}
