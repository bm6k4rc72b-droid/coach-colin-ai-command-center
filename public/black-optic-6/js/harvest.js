/**
 * Tracking a harvest while it is happening, rather than reconstructing it after.
 *
 * The question a picking day actually turns on is not how much came off the
 * property — the weighbridge answers that in the evening — but whether this
 * block will be finished before the crew runs out of light, and which blocks are
 * yielding differently from the rest. Both are answerable at eleven in the
 * morning from bins already logged, and both change what you do that afternoon.
 *
 * Two pieces of honesty run through the module.
 *
 * **A rate measured over twenty minutes is not a day's rate.** Picking slows
 * through the afternoon, speeds up in a light block, and stops entirely while a
 * bin is swapped. So {@link pickRate} reports the spread alongside the mean and
 * says how much of the day it was measured over, and {@link estimateFinish}
 * returns a window rather than a time.
 *
 * **Yield per hectare means nothing until you know what fraction was picked.**
 * Half a block picked at forty rows an hour is not "half the yield" — the fruit
 * is not evenly spread. Every yield figure here is either from a finished block
 * or explicitly marked as extrapolated from a fraction.
 *
 * @module black-optic-6/harvest
 */

/** Below this fraction picked, extrapolating a block's yield is guesswork. */
export const EXTRAPOLATION_FLOOR = 0.25;

/** Rates measured over less than this are reported as provisional. */
export const SETTLED_MINUTES = 45;

/**
 * A block of the property.
 *
 * @typedef {object} Block
 * @property {string} id Identifier.
 * @property {string} name What the crew calls it.
 * @property {number} hectares Area.
 * @property {number} rows Row count.
 * @property {string} [variety] What is planted.
 */

/**
 * A logged pick — a bin, a load, a lug.
 *
 * @typedef {object} Pick
 * @property {string} blockId Which block it came from.
 * @property {number} atMs When it was logged.
 * @property {number} kg Weight.
 * @property {number} [rows] Rows completed since the last log.
 */

/**
 * Everything logged against one block.
 *
 * @param {string} blockId The block.
 * @param {Pick[]} picks All picks.
 * @returns {Pick[]} That block's picks, oldest first.
 */
export function picksFor(blockId, picks) {
  return picks.filter((pick) => pick.blockId === blockId).sort((a, b) => a.atMs - b.atMs);
}

/**
 * How far through a block the crew is.
 *
 * @param {Block} block The block.
 * @param {Pick[]} picks All picks.
 * @returns {{kg: number, rows: number, fraction: number, complete: boolean,
 *   kgPerHa: number|null, extrapolated: boolean, note: string}} Progress.
 */
export function blockProgress(block, picks) {
  const mine = picksFor(block.id, picks);
  const kg = mine.reduce((sum, pick) => sum + (pick.kg ?? 0), 0);
  const rows = mine.reduce((sum, pick) => sum + (pick.rows ?? 0), 0);
  const fraction = block.rows > 0 ? Math.min(1, rows / block.rows) : 0;
  const complete = fraction >= 0.999;

  if (!kg || !(block.hectares > 0)) {
    return {
      kg, rows, fraction, complete, kgPerHa: null, extrapolated: false,
      note: kg ? 'No area recorded for this block, so there is no yield per hectare to give.' : 'Nothing logged yet.',
    };
  }

  if (complete) {
    return {
      kg, rows, fraction, complete, kgPerHa: kg / block.hectares, extrapolated: false,
      note: 'Block finished — this is the measured yield.',
    };
  }

  if (fraction < EXTRAPOLATION_FLOOR) {
    return {
      kg, rows, fraction, complete, kgPerHa: null, extrapolated: false,
      note: `Only ${(fraction * 100).toFixed(0)}% picked. Too little to extrapolate a yield from — fruit is not spread evenly enough.`,
    };
  }

  return {
    kg, rows, fraction, complete, kgPerHa: (kg / fraction) / block.hectares, extrapolated: true,
    note: `Extrapolated from ${(fraction * 100).toFixed(0)}% picked. Treat as an indication, not a figure.`,
  };
}

/**
 * The rate the crew is working at, and how steady it has been.
 *
 * @param {Pick[]} picks Picks to measure, any blocks.
 * @param {object} [options] Window.
 * @param {number} [options.windowMs] Only consider picks this recent.
 * @param {number} [options.nowMs=Date.now()] Clock.
 * @returns {{kgPerHour: number|null, rowsPerHour: number|null, spreadKgPerHour: number|null,
 *   spanMinutes: number, settled: boolean, samples: number, note: string}} The rate.
 */
export function pickRate(picks, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const from = options.windowMs ? nowMs - options.windowMs : -Infinity;
  const window = picks.filter((pick) => pick.atMs >= from).sort((a, b) => a.atMs - b.atMs);

  if (window.length < 2) {
    return {
      kgPerHour: null, rowsPerHour: null, spreadKgPerHour: null, spanMinutes: 0,
      settled: false, samples: window.length,
      note: 'Two logged picks are needed before there is a rate at all.',
    };
  }

  const spanMs = window[window.length - 1].atMs - window[0].atMs;
  const spanMinutes = spanMs / 60000;
  if (spanMs <= 0) {
    return {
      kgPerHour: null, rowsPerHour: null, spreadKgPerHour: null, spanMinutes: 0,
      settled: false, samples: window.length, note: 'Every pick carries the same timestamp.',
    };
  }

  // The first pick's weight is excluded: it was picked before the window opened,
  // so counting it against this window's elapsed time inflates the rate.
  const kg = window.slice(1).reduce((sum, pick) => sum + (pick.kg ?? 0), 0);
  const rows = window.slice(1).reduce((sum, pick) => sum + (pick.rows ?? 0), 0);
  const hours = spanMs / 3600000;

  // Spread across the gaps between picks, which is what tells you whether the
  // mean is a rate or an average of a stop and a sprint.
  const rates = [];
  for (let i = 1; i < window.length; i += 1) {
    const gapHours = (window[i].atMs - window[i - 1].atMs) / 3600000;
    if (gapHours > 1e-6) rates.push((window[i].kg ?? 0) / gapHours);
  }
  const mean = rates.reduce((sum, value) => sum + value, 0) / Math.max(1, rates.length);
  const variance = rates.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, rates.length);
  const settled = spanMinutes >= SETTLED_MINUTES;

  return {
    kgPerHour: kg / hours,
    rowsPerHour: rows > 0 ? rows / hours : null,
    spreadKgPerHour: Math.sqrt(variance),
    spanMinutes,
    settled,
    samples: window.length,
    note: settled
      ? `Measured over ${spanMinutes.toFixed(0)} minutes.`
      : `Only ${spanMinutes.toFixed(0)} minutes of picking. Provisional — the rate has not settled yet.`,
  };
}

/**
 * When a block will be finished, as a window rather than a time.
 *
 * The window comes from the observed spread in the rate. A single predicted
 * finishing time reads as a promise, and the first time it is wrong the crew
 * stops believing the console.
 *
 * @param {Block} block The block.
 * @param {Pick[]} picks All picks.
 * @param {object} [options] Clock.
 * @param {number} [options.nowMs=Date.now()] Now.
 * @returns {{rowsLeft: number, hoursMin: number|null, hoursMax: number|null,
 *   finishMinMs: number|null, finishMaxMs: number|null, note: string}} The estimate.
 */
export function estimateFinish(block, picks, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const mine = picksFor(block.id, picks);
  const progress = blockProgress(block, picks);
  const rowsLeft = Math.max(0, block.rows - progress.rows);

  if (progress.complete) {
    return { rowsLeft: 0, hoursMin: 0, hoursMax: 0, finishMinMs: nowMs, finishMaxMs: nowMs, note: 'Finished.' };
  }

  const rate = pickRate(mine, { nowMs });
  if (!rate.rowsPerHour || rate.rowsPerHour <= 0) {
    return {
      rowsLeft, hoursMin: null, hoursMax: null, finishMinMs: null, finishMaxMs: null,
      note: 'No row rate yet — log rows against a pick and an estimate becomes possible.',
    };
  }

  // The window widens when the rate is unsettled, which is the honest shape: an
  // estimate from twenty minutes deserves to be vaguer than one from all morning.
  const slack = rate.settled ? 0.2 : 0.45;
  const fast = rate.rowsPerHour * (1 + slack);
  const slow = rate.rowsPerHour * (1 - slack);
  const hoursMin = rowsLeft / fast;
  const hoursMax = rowsLeft / slow;

  return {
    rowsLeft,
    hoursMin,
    hoursMax,
    finishMinMs: nowMs + hoursMin * 3600000,
    finishMaxMs: nowMs + hoursMax * 3600000,
    note: rate.settled
      ? `${rowsLeft} rows left at ${rate.rowsPerHour.toFixed(0)} rows an hour.`
      : `${rowsLeft} rows left, on a rate that has not settled. The window is wide on purpose.`,
  };
}

/**
 * Blocks ranked by yield, with the uncertain ones marked.
 *
 * @param {Block[]} blocks Every block.
 * @param {Pick[]} picks All picks.
 * @returns {Array<object>} Blocks with their progress, best yield first.
 */
export function yieldRanking(blocks, picks) {
  return blocks
    .map((block) => ({ block, ...blockProgress(block, picks) }))
    .filter((row) => row.kgPerHa !== null)
    .sort((a, b) => b.kgPerHa - a.kgPerHa);
}

/**
 * The whole day, in the three numbers worth saying out loud.
 *
 * @param {Block[]} blocks Every block.
 * @param {Pick[]} picks All picks.
 * @param {object} [options] Clock.
 * @returns {{kg: number, blocksComplete: number, blocksStarted: number,
 *   rate: object, note: string}} The summary.
 */
export function daySummary(blocks, picks, options = {}) {
  const kg = picks.reduce((sum, pick) => sum + (pick.kg ?? 0), 0);
  const started = new Set(picks.map((pick) => pick.blockId));
  const complete = blocks.filter((block) => blockProgress(block, picks).complete);
  const rate = pickRate(picks, options);

  return {
    kg,
    blocksComplete: complete.length,
    blocksStarted: started.size,
    rate,
    note: picks.length
      ? `${picks.length} loads logged across ${started.size} block${started.size === 1 ? '' : 's'}.`
      : 'Nothing logged yet today.',
  };
}
