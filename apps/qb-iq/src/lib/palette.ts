/**
 * Chart colours, as roles rather than hexes.
 *
 * The categorical order is fixed and never cycled: a chart that gains a series
 * takes the next slot, and a filter that removes one does not repaint the
 * survivors. Beyond six series the answer is to fold into "other" or facet, not
 * to invent a seventh hue.
 *
 * Status colours are a separate, reserved set. They are only ever used for
 * state — a risk flag, a degradation, a band breach — and always with a label
 * beside them, so colour is never the only channel carrying the meaning.
 */

export const SURFACE = '#0f1318';
export const GRID = '#1a2029';
export const AXIS = '#2b3440';
export const INK = '#f2f5f8';
export const INK_2 = '#9aa6b4';
export const INK_3 = '#64707e';
export const ACCENT = '#4cc9ff';

/** Fixed categorical order, validated for the dark surface above. */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'] as const;

/** The first three slots are the set that validates across all pairs — use these for scatter and small multiples. */
export const SERIES_ALL_PAIRS = SERIES.slice(0, 3);

/** Ordinal ramp for the four OODA spans: one hue, monotone lightness, visible steps. */
export const OODA_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'] as const;

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export type StatusKey = keyof typeof STATUS;

export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length] as string;
}

/** Severity → reserved status colour. Never used for a data series. */
export function severityColor(severity: 'watch' | 'elevated' | 'high'): string {
  return severity === 'high' ? STATUS.critical : severity === 'elevated' ? STATUS.serious : STATUS.warning;
}
