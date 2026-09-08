/**
 * The look: one palette, one type ramp, one set of colour rules.
 *
 * A briefing reel is watched at arm's length on a phone, in a feed, at speed.
 * That constrains the palette more than taste does — the ground has to stay
 * near-black so the panel reads as lit rather than printed, and no more than
 * one hue may carry meaning in any single frame. Colour here is a signal:
 * `accent` is the thing being explained, `alert` is the failure state, `good`
 * is the hardened state. Anything decorative is drawn in `line` or `dim` and
 * never in a meaning colour, because a viewer who has learned that red means
 * "this is the attack" should not meet a red divider.
 *
 * Everything is a plain object of strings so the same theme drives the canvas
 * renderer, the editor chrome and the tests without a DOM anywhere.
 *
 * @module carrier/theme
 */

/**
 * A rendering palette and type ramp.
 *
 * @typedef {object} Theme
 * @property {string} name Identifier used in a script's `theme` field.
 * @property {string} ink Page ground.
 * @property {string} inkSoft Slightly lifted ground, for panel interiors.
 * @property {string} panel Panel fill, drawn over the ground.
 * @property {string} line Hairlines and inactive borders.
 * @property {string} lineStrong Borders that should be seen.
 * @property {string} text Primary type.
 * @property {string} dim Secondary type.
 * @property {string} faint Background matrix, tick marks, watermarks.
 * @property {string} accent The thing being explained.
 * @property {string} accentDeep A darker accent, for fills under type.
 * @property {string} alert The failure state.
 * @property {string} good The hardened state.
 * @property {string} warn Caution, mid states.
 * @property {string} mono Canvas font stack, monospace.
 * @property {string} display Canvas font stack for titles.
 */

/** The house theme, taken from the reference frames: deep violet ground, cyan signal, red threat. */
export const NIGHTOWL = {
  name: 'nightowl',
  ink: '#0a0416',
  inkSoft: '#140a28',
  panel: '#0d0620',
  line: 'rgba(160, 107, 255, 0.28)',
  lineStrong: 'rgba(160, 107, 255, 0.62)',
  text: '#ece4ff',
  dim: '#a894d6',
  faint: 'rgba(150, 110, 220, 0.16)',
  accent: '#45e0ff',
  accentDeep: '#0b5f7d',
  alert: '#ff4d5e',
  good: '#3ff59a',
  warn: '#ffb545',
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
  display: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
};

/** A cooler variant for material that is advisory rather than adversarial. */
export const DAYWATCH = {
  ...NIGHTOWL,
  name: 'daywatch',
  ink: '#04090f',
  inkSoft: '#071320',
  panel: '#061019',
  line: 'rgba(90, 190, 255, 0.24)',
  lineStrong: 'rgba(90, 190, 255, 0.55)',
  text: '#e4f2ff',
  dim: '#8fb0cc',
  faint: 'rgba(90, 170, 230, 0.14)',
  accent: '#5fd8ff',
  accentDeep: '#0e4a80',
};

/** Every theme by name. */
export const THEMES = { nightowl: NIGHTOWL, daywatch: DAYWATCH };

/**
 * Look up a theme, falling back to the house one.
 *
 * An unknown name is not an error: a script written against a theme that has
 * since been renamed should still render, in the wrong colours rather than not
 * at all, because a reel that renders wrong can be seen and fixed.
 *
 * @param {string} [name] Theme name.
 * @returns {Theme} The theme.
 */
export function themeFor(name) {
  return THEMES[name] ?? NIGHTOWL;
}

/**
 * The colour a meaning-name resolves to inside a theme.
 *
 * @param {Theme} theme Palette in use.
 * @param {string} tone One of `plain`, `accent`, `alert`, `good`, `warn`, `dim`.
 * @returns {string} A CSS colour.
 */
export function toneColour(theme, tone) {
  switch (tone) {
    case 'accent': return theme.accent;
    case 'alert': return theme.alert;
    case 'good': return theme.good;
    case 'warn': return theme.warn;
    case 'dim': return theme.dim;
    default: return theme.text;
  }
}

/**
 * An `rgba()` string for a hex colour at a given opacity.
 *
 * Accepts `#rgb`, `#rrggbb`, and passes an existing `rgba()`/`rgb()` string
 * through unchanged when it cannot be parsed, so callers never have to know
 * which form a theme field is written in.
 *
 * @param {string} colour Hex colour.
 * @param {number} alpha 0..1.
 * @returns {string} A CSS colour.
 */
export function withAlpha(colour, alpha) {
  const rgb = hexToRgb(colour);
  if (!rgb) return colour;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a.toFixed(3)})`;
}

/**
 * Parse a hex colour into channels.
 *
 * @param {string} colour Hex colour, `#rgb` or `#rrggbb`.
 * @returns {{r: number, g: number, b: number}|null} Channels, or null if not hex.
 */
export function hexToRgb(colour) {
  if (typeof colour !== 'string') return null;
  const hex = colour.trim();
  if (!hex.startsWith('#')) return null;
  const body = hex.slice(1);
  if (body.length === 3) {
    return {
      r: parseInt(body[0] + body[0], 16),
      g: parseInt(body[1] + body[1], 16),
      b: parseInt(body[2] + body[2], 16),
    };
  }
  if (body.length === 6) {
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }
  return null;
}

/**
 * Blend two colours.
 *
 * @param {string} from Hex colour at `mix = 0`.
 * @param {string} to Hex colour at `mix = 1`.
 * @param {number} mix 0..1.
 * @returns {string} An `rgb()` string, or `from` if either end is unparseable.
 */
export function mixColour(from, to, mix) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (!a || !b) return from;
  const k = Math.max(0, Math.min(1, mix));
  const ch = (x, y) => Math.round(x + (y - x) * k);
  return `rgb(${ch(a.r, b.r)}, ${ch(a.g, b.g)}, ${ch(a.b, b.b)})`;
}

/**
 * Signal strength as a colour, on the scale printed under the heatmap panel.
 *
 * The stops are the ones a wireless engineer already reads: below −82 dBm is at
 * or under a typical noise floor and drawn as dead ground; −30 dBm is a hotspot
 * you are standing next to. Everything between walks blue → green → amber →
 * red, so "hot" means "loud", which is the opposite of the usual thermal
 * reading of a floor plan and therefore labelled on every frame that uses it.
 *
 * @param {number} dbm Received signal strength.
 * @returns {string} A CSS colour.
 */
export function dbmColour(dbm) {
  const stops = [
    { at: -95, colour: '#0b0f1c' },
    { at: -82, colour: '#1c2b6b' },
    { at: -70, colour: '#1f8f7a' },
    { at: -60, colour: '#5ad24a' },
    { at: -50, colour: '#e8d94a' },
    { at: -40, colour: '#f2843a' },
    { at: -30, colour: '#ff3b30' },
  ];
  const v = Math.max(-95, Math.min(-30, dbm));
  for (let i = 1; i < stops.length; i += 1) {
    if (v <= stops[i].at) {
      const lo = stops[i - 1];
      const hi = stops[i];
      return mixColour(lo.colour, hi.colour, (v - lo.at) / (hi.at - lo.at));
    }
  }
  return stops[stops.length - 1].colour;
}
