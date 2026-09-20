/**
 * The arithmetic the city runs on.
 *
 * Every motion on this page — a skyline sliding, a wanted star lighting, a
 * shockwave crossing the screen — is a pure function of one number: how far
 * the page has been scrolled. That is a deliberate constraint. It makes the
 * whole production reversible (scrub back up and the explosion un-explodes),
 * frame-rate independent (a phone dropping frames sees a coarser version of
 * the same film, never a different one), and testable without a browser.
 *
 * Nothing in this module touches the DOM.
 *
 * @module vice/mathkit
 */

/**
 * Clamp a number into a range.
 *
 * @param {number} value Input.
 * @param {number} [min] Lower bound.
 * @param {number} [max] Upper bound.
 * @returns {number} Clamped value.
 */
export function clamp(value, min = 0, max = 1) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation.
 *
 * @param {number} a Start.
 * @param {number} b End.
 * @param {number} t Position, normally 0–1.
 * @returns {number} Interpolated value.
 */
export function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a value out of one range and into 0–1, clamped.
 *
 * The workhorse of scroll-linked animation: "how far through this window are
 * we" answered in one call.
 *
 * @param {number} value Input.
 * @param {number} from Start of the input range.
 * @param {number} to End of the input range.
 * @returns {number} Normalised position, 0–1.
 */
export function progress(value, from, to) {
  if (to === from) return value >= to ? 1 : 0;
  return clamp((value - from) / (to - from), 0, 1);
}

/**
 * A window that rises, holds, and falls.
 *
 * Set pieces need this shape constantly: the cop chase is not "on after 25%",
 * it fades up, holds while you read it, and fades out before the next act
 * takes the screen. Returns 0 outside `[from, to]`, 1 across the middle, and
 * a smooth ramp over `fade` at each edge.
 *
 * @param {number} value Input, normally document progress.
 * @param {number} from Start of the window.
 * @param {number} to End of the window.
 * @param {number} [fade] Width of each ramp, in the same units.
 * @returns {number} Envelope, 0–1.
 */
export function envelope(value, from, to, fade = 0.04) {
  if (fade <= 0) return value >= from && value <= to ? 1 : 0;
  const rise = progress(value, from, from + fade);
  const fall = 1 - progress(value, to - fade, to);
  return clamp(Math.min(rise, fall), 0, 1);
}

/**
 * Smoothstep, the gentle S-curve.
 *
 * @param {number} edge0 Lower edge.
 * @param {number} edge1 Upper edge.
 * @param {number} x Input.
 * @returns {number} Eased 0–1.
 */
export function smoothstep(edge0, edge1, x) {
  const t = progress(x, edge0, edge1);
  return t * t * (3 - 2 * t);
}

/** Named easing curves, all mapping 0–1 to 0–1. */
export const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  /** Overshoots and settles — the right curve for a car snapping into frame. */
  back: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * ((t - 1) ** 3) + c * ((t - 1) ** 2);
  },
  /** Fast out of the gate, long tail — an explosion's brightness over time. */
  blast: (t) => 1 - (1 - t) ** 5,
  /** A hard snap, for a star lighting up or a shield locking into place. */
  snap: (t) => (t < 0.7 ? EASE.out(t / 0.7) * 1.06 : 1.06 - 0.06 * ((t - 0.7) / 0.3)),
};

/**
 * Frame-rate independent approach towards a target.
 *
 * Used for anything that should feel like it has weight — the camera drifting
 * after the car, the HUD needles settling — without the classic `x += (t - x) *
 * 0.1` bug where the speed depends on how fast the machine happens to be.
 *
 * @param {number} current Where the value is.
 * @param {number} target Where it wants to be.
 * @param {number} rate Approach rate, per second.
 * @param {number} dt Seconds since the last frame.
 * @returns {number} The new value.
 */
export function approach(current, target, rate, dt) {
  const k = 1 - Math.exp(-rate * Math.max(dt, 0));
  return current + (target - current) * k;
}

/**
 * A deterministic pseudo-random generator.
 *
 * The skyline is generated, not drawn by hand, and it has to be the *same*
 * skyline on every frame and every reload — otherwise the city flickers as
 * buildings are re-rolled. Seeded, so the tests can assert on the city too.
 *
 * @param {number} [seed] Any integer.
 * @returns {() => number} A function returning 0–1.
 */
export function rng(seed = 1) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * Wrap a value into `[0, span)`.
 *
 * Parallax layers repeat: a building that leaves the left edge comes back on
 * the right rather than the city running out.
 *
 * @param {number} value Input.
 * @param {number} span Period, must be positive.
 * @returns {number} Wrapped value.
 */
export function wrap(value, span) {
  if (!(span > 0)) return 0;
  return ((value % span) + span) % span;
}

/**
 * Interpolate between two `[r, g, b]` triples.
 *
 * The sky is a scroll-linked colour ramp — sunset, dusk, night, firelight,
 * dawn — so mixing colours is a first-class operation here.
 *
 * @param {number[]} a Start colour.
 * @param {number[]} b End colour.
 * @param {number} t Position, 0–1.
 * @returns {number[]} The mixed colour.
 */
export function mixRgb(a, b, t) {
  const k = clamp(t, 0, 1);
  return [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
}

/**
 * Format an `[r, g, b]` triple as a CSS colour.
 *
 * @param {number[]} rgb Colour.
 * @param {number} [alpha] Opacity, 0–1.
 * @returns {string} A `rgb()` / `rgba()` string.
 */
export function css(rgb, alpha = 1) {
  const r = Math.round(clamp(rgb[0], 0, 255));
  const g = Math.round(clamp(rgb[1], 0, 255));
  const b = Math.round(clamp(rgb[2], 0, 255));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${clamp(alpha, 0, 1).toFixed(3)})`;
}

/**
 * Pick a colour out of a stop list by position.
 *
 * @param {Array<{ at: number, rgb: number[] }>} stops Ordered by `at`.
 * @param {number} t Position, 0–1.
 * @returns {number[]} The interpolated colour.
 */
export function ramp(stops, t) {
  if (!stops.length) return [0, 0, 0];
  if (t <= stops[0].at) return stops[0].rgb.slice();
  const last = stops[stops.length - 1];
  if (t >= last.at) return last.rgb.slice();
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1];
    const b = stops[i];
    if (t <= b.at) return mixRgb(a.rgb, b.rgb, progress(t, a.at, b.at));
  }
  return last.rgb.slice();
}
