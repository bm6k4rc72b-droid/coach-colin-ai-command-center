/**
 * Everything the survey knows, kept on the device.
 *
 * A job walk happens in a house with someone else's name on the deed, often
 * before any agreement is signed. Uploading its room dimensions and photographs
 * to a server would be the wrong default, so there is no server: surveys live
 * in `localStorage` and leave only when the operator exports them.
 *
 * @module housewright/ledger
 */

const KEY = 'housewright.surveys.v1';

/**
 * Read every stored survey.
 *
 * @returns {Array<object>} Surveys, newest first, or an empty list when
 *   storage is unavailable or holds nothing legible.
 */
export function load() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Private browsing, a full quota, or a half-written record: an empty
    // ledger is a better outcome than a screen that will not open.
    return [];
  }
}

/**
 * Replace the stored ledger.
 *
 * @param {Array<object>} surveys The surveys to keep.
 * @returns {boolean} Whether the write succeeded.
 */
export function save(surveys) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(surveys));
    return true;
  } catch {
    return false;
  }
}

/**
 * A new, empty survey.
 *
 * @param {string} address What the property is called.
 * @returns {object} The survey record.
 */
export function createSurvey(address = 'Untitled property') {
  return {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    address,
    created: new Date().toISOString(),
    holdHeight: 1.45,
    tier: 'elevated',
    condition: 'dated',
    pricePerSqft: 0,
    ceilingPricePerSqft: 0,
    totalSqft: 0,
    hasGarage: true,
    rooms: [],
    stats: [],
  };
}

/**
 * Insert or update a survey in the ledger.
 *
 * @param {object} survey The survey to store.
 * @returns {Array<object>} The updated ledger.
 */
export function upsert(survey) {
  const all = load();
  const index = all.findIndex((s) => s.id === survey.id);
  const record = { ...survey, updated: new Date().toISOString() };
  if (index >= 0) all[index] = record;
  else all.unshift(record);
  save(all);
  return all;
}

/**
 * Remove a survey.
 *
 * @param {string} id Survey id.
 * @returns {Array<object>} The updated ledger.
 */
export function remove(id) {
  const all = load().filter((s) => s.id !== id);
  save(all);
  return all;
}

/**
 * Serialise a survey to JSON for export.
 *
 * Only the survey's own inputs travel — corners, heights, openings, the
 * measured statistics. No frames are kept, so an export can be mailed to a
 * builder without mailing photographs of someone's house.
 *
 * @param {object} survey The survey.
 * @returns {string} Pretty-printed JSON.
 */
export function toJson(survey) {
  return JSON.stringify({
    format: 'housewright.survey.v1',
    exported: new Date().toISOString(),
    survey: {
      address: survey.address,
      created: survey.created,
      holdHeight: survey.holdHeight,
      tier: survey.tier,
      condition: survey.condition,
      pricePerSqft: survey.pricePerSqft,
      ceilingPricePerSqft: survey.ceilingPricePerSqft,
      totalSqft: survey.totalSqft,
      rooms: (survey.rooms || []).map((r) => ({
        name: r.name,
        type: r.type,
        ceiling: r.ceiling,
        points: r.points,
        openings: r.openings,
      })),
    },
  }, null, 2);
}

/**
 * Offer a file to the operator.
 *
 * @param {string} filename Suggested name.
 * @param {string} content File body.
 * @param {string} [type='application/json'] MIME type.
 * @returns {boolean} Whether the download could be started.
 */
export function download(filename, content, type = 'application/json') {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}
