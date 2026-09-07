/**
 * Display formatting.
 *
 * Two rules. Nothing is printed without its unit, and a missing value is printed
 * as an em dash rather than a zero — an empty cell that reads as "0.0 mph" is
 * worse than no cell at all in a room full of people making decisions.
 */

import { metric, type MetricId } from '../domain/metrics';

export const DASH = '—';

export function formatValue(id: MetricId, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value.toFixed(metric(id).precision);
}

/** Value with its unit appended, for prose and tooltips. */
export function formatWithUnit(id: MetricId, value: number | null | undefined): string {
  const text = formatValue(id, value);
  if (text === DASH) return DASH;
  const unit = metric(id).unit;
  return unit ? `${text} ${unit}` : text;
}

/** A signed delta, for "against baseline" readouts. */
export function formatDelta(id: MetricId, delta: number | null | undefined): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return DASH;
  const def = metric(id);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta).toFixed(def.precision)}`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  return `${Math.round(ms)}`;
}

export function formatPct(value: number | null | undefined, precision = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(precision)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value.toLocaleString('en-US');
}

/**
 * Whether a delta is movement in the good direction for this metric. Banded
 * metrics have no good direction, so they answer null and the UI stays neutral.
 */
export function deltaIsGood(id: MetricId, delta: number | null): boolean | null {
  if (delta === null || !Number.isFinite(delta) || delta === 0) return null;
  const better = metric(id).better;
  if (better === 'band') return null;
  return better === 'higher' ? delta > 0 : delta < 0;
}

/** Whether a value sits inside a banded metric's target window. Null for unbanded metrics. */
export function inBand(id: MetricId, value: number | null): boolean | null {
  const def = metric(id);
  if (def.better !== 'band' || !def.band || value === null || !Number.isFinite(value)) return null;
  const [lo, hi] = def.band;
  return value >= lo && value <= hi;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "3rd & 7" — the way a down and distance is actually said. */
export function formatDownDistance(down: number, distance: number): string {
  const suffix = down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th';
  return `${down}${suffix} & ${distance}`;
}
