/**
 * hud-kit tokens.
 *
 * Guardian is looked at in the dark, usually half-awake, usually for about two
 * seconds. So: one accent, one number that matters, and no decorative chrome.
 * The palette descends from the Command Center skin — near-black ground, a
 * single cyan that is the only bright thing on screen — with semantic colours
 * kept deliberately separate from the accent so "armed" never reads as "alert".
 */

export const color = {
  ground: '#03060b',
  surface: '#0a1018',
  surfaceRaised: '#111a25',
  hairline: 'rgba(223, 234, 242, 0.10)',
  hairlineStrong: 'rgba(223, 234, 242, 0.20)',

  accent: '#38f0ff',
  accentDim: 'rgba(56, 240, 255, 0.12)',
  accentGlow: 'rgba(56, 240, 255, 0.55)',

  text: '#dfeaf2',
  textMuted: 'rgba(223, 234, 242, 0.58)',
  textFaint: 'rgba(223, 234, 242, 0.32)',

  // Semantic — never reused as accent.
  armed: '#4ade80',
  alert: '#ff5a4d',
  alertDim: 'rgba(255, 90, 77, 0.16)',
  caution: '#f5b942',
  suppressed: 'rgba(223, 234, 242, 0.28)',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const radius = {
  sm: 3,
  md: 4,
  pill: 999,
} as const;

/**
 * Type scale. Readings use tabular figures so digits do not jitter as they
 * update — a number that reflows while you read it feels broken even when the
 * value is right.
 */
export const type = {
  reading: { fontSize: 56, fontWeight: '300' as const, letterSpacing: -1.5, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.4 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  mono: { fontSize: 12, fontWeight: '500' as const, fontVariant: ['tabular-nums' as const] },
} as const;

/**
 * Motion. Overlays settle rather than snap — a reticle that eases into place
 * reads as an instrument, one that teleports reads as a toy.
 */
export const motion = {
  settle: 220,
  fade: 160,
  /** Overlay boxes lerp toward the model output at this rate per frame. */
  boxLerp: 0.35,
} as const;
