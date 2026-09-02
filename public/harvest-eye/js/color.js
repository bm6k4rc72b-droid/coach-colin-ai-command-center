/**
 * Colour primitives for HarvestEye.
 *
 * Everything downstream — maturity scoring, calibration, decay detection —
 * works in HSV with hue expressed in degrees on a circle, so the helpers here
 * are deliberately allocation-free and safe to call once per pixel per frame.
 *
 * @module harvest-eye/color
 */

/**
 * Convert 8-bit sRGB to HSV.
 *
 * @param {number} r Red, 0–255.
 * @param {number} g Green, 0–255.
 * @param {number} b Blue, 0–255.
 * @param {{h:number,s:number,v:number}} [out] Optional target to fill in place.
 * @returns {{h:number,s:number,v:number}} Hue in degrees [0,360), saturation and
 *   value in [0,1].
 */
export function rgbToHsv(r, g, b, out = { h: 0, s: 0, v: 0 }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = rn > gn ? (rn > bn ? rn : bn) : (gn > bn ? gn : bn);
  const min = rn < gn ? (rn < bn ? rn : bn) : (gn < bn ? gn : bn);
  const delta = max - min;

  let h = 0;
  if (delta > 1e-6) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
    if (h < 0) h += 360;
  }

  out.h = h;
  out.s = max <= 1e-6 ? 0 : delta / max;
  out.v = max;
  return out;
}

/**
 * Shortest signed angular distance from `a` to `b` on the hue circle.
 *
 * @param {number} a Start hue in degrees.
 * @param {number} b End hue in degrees.
 * @returns {number} Signed delta in (-180, 180].
 */
export function hueDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Absolute angular distance between two hues.
 *
 * @param {number} a First hue in degrees.
 * @param {number} b Second hue in degrees.
 * @returns {number} Distance in [0, 180].
 */
export function hueDistance(a, b) {
  return Math.abs(hueDelta(a, b));
}

/**
 * Normalize a hue into [0, 360).
 *
 * @param {number} h Hue in degrees, any magnitude or sign.
 * @returns {number} Equivalent hue in [0, 360).
 */
export function wrapHue(h) {
  const w = h % 360;
  return w < 0 ? w + 360 : w;
}

/**
 * Circular mean of a hue sample set, weighted by sample count.
 *
 * A plain arithmetic mean is wrong near the red wrap-around (`350°` and `10°`
 * average to `180°` — cyan — instead of `0°`), which matters because red is
 * exactly where most ripe fruit lives.
 *
 * @param {ArrayLike<number>} hues Hues in degrees.
 * @param {ArrayLike<number>} [weights] Optional per-sample weights.
 * @returns {number} Mean hue in degrees, or 0 when the samples cancel out.
 */
export function circularMeanHue(hues, weights = null) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < hues.length; i += 1) {
    const w = weights ? weights[i] : 1;
    const rad = (hues[i] * Math.PI) / 180;
    x += Math.cos(rad) * w;
    y += Math.sin(rad) * w;
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return 0;
  return wrapHue((Math.atan2(y, x) * 180) / Math.PI);
}

/**
 * Derive per-channel white-balance gains from a neutral reference patch.
 *
 * Colour-based maturity scoring is only as trustworthy as the light it was
 * measured under: the same tomato reads orange at golden hour and pink under
 * greenhouse sodium lamps. Pointing the camera at anything known to be neutral
 * (a grey card, a white bucket lid, a sheet of paper) yields gains that pull
 * that patch back to grey, and every later frame is corrected by them.
 *
 * @param {{r:number,g:number,b:number}} patch Mean sRGB of the reference patch.
 * @returns {{r:number,g:number,b:number}} Multiplicative gains, clamped to a
 *   sane range so a mis-aimed calibration cannot destroy the image.
 */
export function whiteBalanceGains(patch) {
  const mean = (patch.r + patch.g + patch.b) / 3;
  if (mean < 8) return { r: 1, g: 1, b: 1 };
  const clamp = (value) => Math.min(2.5, Math.max(0.4, value));
  return {
    r: clamp(mean / Math.max(1, patch.r)),
    g: clamp(mean / Math.max(1, patch.g)),
    b: clamp(mean / Math.max(1, patch.b)),
  };
}

/** Identity gains, used whenever the operator has not calibrated. */
export const NEUTRAL_GAINS = Object.freeze({ r: 1, g: 1, b: 1 });
