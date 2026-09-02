/**
 * Harvest-window forecasting.
 *
 * Two ways to answer "how many days until this block is ready":
 *
 *   - **Nominal.** The crop profile's own cycle length, warped by temperature.
 *     Always available; only as good as the profile.
 *   - **Measured.** A regression through this plot's own scan history. Once a
 *     block has been scanned twice, the app knows how fast *that* block is
 *     actually ripening — cultivar, aspect, irrigation and shade already baked
 *     in — and stops guessing.
 *
 * The measured path is the reason repeat scans are worth the operator's time,
 * so the forecast always reports which basis it used.
 *
 * @module harvest-eye/forecast
 */

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/**
 * Temperature multiplier on ripening rate.
 *
 * A Q10 of 2 — rate doubling per 10 °C — is the standard first-order
 * approximation for fruit development, clamped at both ends because neither
 * frost nor heat stress actually accelerates anything.
 *
 * @param {number} tempC Field temperature in Celsius.
 * @param {number} refTempC Temperature the crop's nominal cycle was measured at.
 * @returns {number} Rate multiplier, clamped to [0.25, 2.5].
 */
export function temperatureFactor(tempC, refTempC) {
  if (!Number.isFinite(tempC)) return 1;
  const bounded = Math.min(38, Math.max(4, tempC));
  const factor = 2 ** ((bounded - refTempC) / 10);
  return Math.min(2.5, Math.max(0.25, factor));
}

/**
 * Least-squares ripening velocity from a plot's scan history.
 *
 * @param {Array<{ts:number, meanMaturity:number}>} scans Scans of one plot and
 *   crop, in any order. Fewer than two, or all on the same day, yields null.
 * @returns {{velocity:number, spanDays:number, samples:number, r2:number}|null}
 *   Maturity units per day, or null when the history cannot support a slope.
 */
export function ripeningVelocity(scans) {
  const points = scans
    .filter((scan) => Number.isFinite(scan.ts) && Number.isFinite(scan.meanMaturity))
    .sort((a, b) => a.ts - b.ts);
  if (points.length < 2) return null;

  const t0 = points[0].ts;
  const xs = points.map((p) => (p.ts - t0) / DAY_MS);
  const ys = points.map((p) => p.meanMaturity);
  const spanDays = xs[xs.length - 1];
  if (spanDays < 0.4) return null;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx < 1e-9) return null;
  const velocity = sxy / sxx;
  const r2 = syy < 1e-9 ? 0 : (sxy * sxy) / (sxx * syy);
  return { velocity, spanDays, samples: n, r2 };
}

/**
 * Forecast the harvest window for a maturity reading.
 *
 * @param {import('./crops.js').CropProfile} profile Active crop.
 * @param {number} maturity Current mean maturity in [0,1].
 * @param {object} [options] Forecast inputs.
 * @param {number} [options.tempC] Field temperature in Celsius.
 * @param {{velocity:number,r2:number,samples:number}} [options.measured] Result
 *   of {@link ripeningVelocity} for this plot.
 * @param {number} [options.now=Date.now()] Clock override, for tests.
 * @returns {{
 *   daysToHarvest:number, daysToOverripe:number, basis:'measured'|'nominal',
 *   ratePerDay:number, harvestDate:number, windowDays:number,
 *   status:'immature'|'approaching'|'ready'|'closing'|'peak',
 *   confidence:number
 * }} Forecast summary. Days are clamped at zero once the window has opened.
 */
export function forecastHarvest(profile, maturity, options = {}) {
  const now = options.now ?? Date.now();
  const nominalRate = (1 / profile.cycleDays)
    * temperatureFactor(options.tempC, profile.refTempC);

  const measured = options.measured;
  // A measured slope only wins when it is positive, well-fit and built on more
  // than a single pair of scans — otherwise noise would masquerade as evidence.
  const useMeasured = Boolean(
    measured
    && measured.velocity > 0.002
    && measured.r2 >= 0.4
    && measured.samples >= 2,
  );
  const ratePerDay = useMeasured ? measured.velocity : nominalRate;
  const basis = useMeasured ? 'measured' : 'nominal';

  const toHarvest = Math.max(0, (profile.harvestAt - maturity) / ratePerDay);
  const toOverripe = Math.max(0, (profile.overripeAt - maturity) / ratePerDay);
  const windowDays = (profile.overripeAt - profile.harvestAt) / ratePerDay;

  // `peak` means colouring is finished, which is the end of the *forecastable*
  // window — whether the fruit has actually gone over is a spoilage question,
  // answered by the decay share the detector measures, not by hue.
  let status;
  if (maturity >= profile.overripeAt) status = 'peak';
  else if (maturity >= profile.harvestAt) status = toOverripe <= 2 ? 'closing' : 'ready';
  else if (toHarvest <= 5) status = 'approaching';
  else status = 'immature';

  const confidence = useMeasured
    ? Math.min(0.95, 0.55 + measured.r2 * 0.3 + Math.min(0.1, measured.samples * 0.02))
    : 0.45;

  return {
    daysToHarvest: toHarvest,
    daysToOverripe: toOverripe,
    basis,
    ratePerDay,
    harvestDate: now + toHarvest * DAY_MS,
    windowDays,
    status,
    confidence,
  };
}

/**
 * Format a day count the way a grower would say it.
 *
 * @param {number} days Days until an event.
 * @returns {string} Human phrasing.
 */
export function formatDays(days) {
  if (!Number.isFinite(days)) return '—';
  if (days <= 0.5) return 'today';
  if (days < 1.5) return 'tomorrow';
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/**
 * Estimate what a delay costs, in fruit.
 *
 * Once a block is inside its window, every day of waiting converts some of the
 * ripe fraction into over-ripe. This is the number that decides whether a crew
 * is worth pulling off another block today.
 *
 * @param {import('./crops.js').CropProfile} profile Active crop.
 * @param {number} maturity Current mean maturity.
 * @param {number} ratePerDay Ripening rate in maturity units per day.
 * @param {number} fruitEstimate Fruit counted in view (or per plot).
 * @returns {{lossPerDay:number, daysLeft:number}} Fruit lost per day of delay,
 *   and days of window remaining.
 */
export function spoilageRisk(profile, maturity, ratePerDay, fruitEstimate) {
  const window = Math.max(1e-6, profile.overripeAt - profile.harvestAt);
  const daysLeft = Math.max(0, (profile.overripeAt - maturity) / ratePerDay);
  const fractionPerDay = Math.min(1, ratePerDay / window);
  return {
    lossPerDay: maturity < profile.harvestAt ? 0 : fruitEstimate * fractionPerDay,
    daysLeft,
  };
}
