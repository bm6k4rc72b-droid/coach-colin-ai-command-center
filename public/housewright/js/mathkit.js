/**
 * Small scalar and vector helpers shared by the survey, the plan and the
 * massing renderer.
 *
 * Everything here is pure and allocation-light. The survey runs these at
 * frame rate on a phone that is also decoding 1080p video, so the geometry
 * layer is written to be boring and cheap rather than general.
 *
 * @module housewright/mathkit
 */

/** Degrees to radians. */
export const D2R = Math.PI / 180;

/** Radians to degrees. */
export const R2D = 180 / Math.PI;

/** Metres in one international foot. */
export const FOOT = 0.3048;

/** Square metres in one square foot. */
export const SQFT = FOOT * FOOT;

/**
 * Clamp a number into a range.
 *
 * @param {number} value Input.
 * @param {number} low Lower bound.
 * @param {number} high Upper bound.
 * @returns {number} `value`, bounded.
 */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * Linear interpolation.
 *
 * @param {number} a Value at `t = 0`.
 * @param {number} b Value at `t = 1`.
 * @param {number} t Position.
 * @returns {number} The blended value.
 */
export function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another, clamped at both ends.
 *
 * @param {number} value Input.
 * @param {number} inLow Input range start.
 * @param {number} inHigh Input range end.
 * @param {number} outLow Output range start.
 * @param {number} outHigh Output range end.
 * @returns {number} The remapped value.
 */
export function remap(value, inLow, inHigh, outLow, outHigh) {
  if (inHigh === inLow) return outLow;
  return mix(outLow, outHigh, clamp((value - inLow) / (inHigh - inLow), 0, 1));
}

/**
 * Wrap an angle in degrees into (-180, 180].
 *
 * Compass headings are the reason this exists: the difference between 359°
 * and 1° is two degrees, not three hundred and fifty-eight.
 *
 * @param {number} degrees Any angle.
 * @returns {number} The same angle, wrapped.
 */
export function wrapDegrees(degrees) {
  let value = (degrees + 180) % 360;
  if (value <= 0) value += 360;
  return value - 180;
}

/**
 * Wrap an angle into [0, 90) — the symmetry a rectangular room has.
 *
 * @param {number} degrees Any angle.
 * @returns {number} The angle modulo a quarter turn.
 */
export function wrapQuarter(degrees) {
  return ((degrees % 90) + 90) % 90;
}

/**
 * Normalise a 3-vector in place-free style.
 *
 * @param {{x: number, y: number, z: number}} v Input vector.
 * @returns {{x: number, y: number, z: number}} Unit vector, or the input when
 *   it has no length to speak of.
 */
export function normalise(v) {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Distance between two points on the floor plane.
 *
 * @param {{x: number, y: number}} a First point.
 * @param {{x: number, y: number}} b Second point.
 * @returns {number} Separation in metres.
 */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Compass-style bearing of the segment `a → b`, in degrees.
 *
 * Zero points along +Y (the survey's reference heading) and increases
 * clockwise, which is what a floor plan's north arrow implies.
 *
 * @param {{x: number, y: number}} a Start.
 * @param {{x: number, y: number}} b End.
 * @returns {number} Bearing in [0, 360).
 */
export function bearing(a, b) {
  const angle = Math.atan2(b.x - a.x, b.y - a.y) * R2D;
  return (angle + 360) % 360;
}

/**
 * Convert metres to feet-and-inches, the unit an American contractor bids in.
 *
 * @param {number} metres Length.
 * @param {number} [precision=2] Inch denominator exponent: 1 gives halves,
 *   2 quarters, 3 eighths.
 * @returns {string} For example `12' 4 1/2"`.
 */
export function feetInches(metres, precision = 2) {
  const denominator = 2 ** precision;
  const totalInches = Math.abs(metres) / FOOT * 12;
  let ticks = Math.round(totalInches * denominator);
  let feet = Math.floor(ticks / (12 * denominator));
  ticks -= feet * 12 * denominator;
  let inches = Math.floor(ticks / denominator);
  let fraction = ticks - inches * denominator;
  // Reduce the fraction so 4/8 prints as 1/2 rather than as arithmetic.
  let numerator = fraction;
  let bottom = denominator;
  while (numerator > 0 && numerator % 2 === 0 && bottom % 2 === 0) {
    numerator /= 2;
    bottom /= 2;
  }
  const sign = metres < 0 ? '-' : '';
  const inchText = numerator > 0 ? `${inches} ${numerator}/${bottom}"` : `${inches}"`;
  return `${sign}${feet}' ${inchText}`;
}

/**
 * Format a length in metres with a sensible number of decimals.
 *
 * @param {number} metres Length.
 * @returns {string} For example `3.76 m`.
 */
export function metres(metres_) {
  return `${metres_.toFixed(2)} m`;
}

/**
 * Format money in whole dollars with thousands separators.
 *
 * @param {number} amount Dollars.
 * @returns {string} For example `$48,200`.
 */
export function money(amount) {
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString('en-US')}`;
}

/**
 * Round a dollar figure to a band that does not pretend to be precise.
 *
 * A renovation estimate that reads `$47,318` claims an accuracy no heuristic
 * has. Rounding to a visible step is the honest presentation.
 *
 * @param {number} amount Dollars.
 * @returns {number} The rounded figure.
 */
export function roundMoney(amount) {
  const magnitude = Math.abs(amount);
  const step = magnitude >= 100000 ? 5000 : magnitude >= 20000 ? 1000 : magnitude >= 2000 ? 500 : 100;
  return Math.round(amount / step) * step;
}
