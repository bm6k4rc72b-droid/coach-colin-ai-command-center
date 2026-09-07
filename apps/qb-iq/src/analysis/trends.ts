/**
 * Time series: within a season by week, and across seasons by year.
 *
 * A trend line in this app always carries its fit. A slope with an r² of 0.04 is
 * drawn the same as a slope with an r² of 0.6 unless the app says otherwise, and
 * saying otherwise is the difference between an analytics product and a
 * decorative one.
 */

import type { MetricId } from '../domain/metrics';
import type { GameSummary, ThrowRecord } from '../domain/types';
import { linearFit, type LinearFit } from '../lib/stats';
import { aggregate } from './aggregate';

export interface SeriesPoint {
  /** Week number within the season, or season year for a career series. */
  x: number;
  label: string;
  value: number | null;
  reps: number;
}

export interface MetricSeries {
  metric: MetricId;
  points: SeriesPoint[];
  fit: LinearFit | null;
  /** Change implied by the fit across the whole span, in the metric's unit. */
  spanChange: number | null;
}

/** One metric, week by week, across the games given. */
export function weeklySeries(
  records: readonly ThrowRecord[],
  games: readonly GameSummary[],
  id: MetricId,
): MetricSeries {
  const byGame = new Map<string, ThrowRecord[]>();
  for (const record of records) {
    const list = byGame.get(record.context.gameId) ?? [];
    list.push(record);
    byGame.set(record.context.gameId, list);
  }

  const points: SeriesPoint[] = [...games]
    .sort((a, b) => a.week - b.week)
    .map((game) => {
      const list = byGame.get(game.id) ?? [];
      return { x: game.week, label: `W${game.week}`, value: aggregate(list, id), reps: list.length };
    });

  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points) {
    if (point.value === null) continue;
    xs.push(point.x);
    ys.push(point.value);
  }
  const fit = linearFit(xs, ys);
  const span = xs.length >= 2 ? (xs[xs.length - 1] as number) - (xs[0] as number) : 0;
  return { metric: id, points, fit, spanChange: fit ? fit.slope * span : null };
}

/** A rolling view over reps in chronological order — the fine-grained trend. */
export function repSeries(records: readonly ThrowRecord[], id: MetricId, window: number): SeriesPoint[] {
  const ordered = [...records].sort((a, b) => a.snapAt.localeCompare(b.snapAt));
  const points: SeriesPoint[] = [];
  for (let i = window - 1; i < ordered.length; i += 1) {
    const slice = ordered.slice(i - window + 1, i + 1);
    points.push({ x: i + 1, label: `rep ${i + 1}`, value: aggregate(slice, id), reps: slice.length });
  }
  return points;
}

export interface SeasonPoint {
  seasonId: string;
  label: string;
  year: number;
  level: string;
  value: number | null;
  reps: number;
}

/** The career view: one point per season for a metric. */
export function careerSeries(
  seasons: readonly { id: string; label: string; year: number; level: string; records: readonly ThrowRecord[] }[],
  id: MetricId,
): SeasonPoint[] {
  return seasons.map((season) => ({
    seasonId: season.id,
    label: season.label,
    year: season.year,
    level: season.level,
    value: aggregate(season.records, id),
    reps: season.records.length,
  }));
}

/** How to say a fit out loud. Direction is expressed in the metric's own terms. */
export function describeFit(fit: LinearFit | null, unit: string, better: 'higher' | 'lower' | 'band'): string {
  if (!fit) return 'not enough weeks to fit a trend';
  const perWeek = fit.slope;
  const direction = perWeek > 0 ? 'rising' : 'falling';
  const quality = fit.r2 >= 0.5 ? 'a clear trend' : fit.r2 >= 0.25 ? 'a weak trend' : 'noise, not a trend';
  const goodness =
    better === 'band'
      ? ''
      : (better === 'lower' && perWeek < 0) || (better === 'higher' && perWeek > 0)
        ? ' in the right direction'
        : ' in the wrong direction';
  return `${direction}${goodness} at ${Math.abs(perWeek).toFixed(2)} ${unit}/week · r² ${fit.r2.toFixed(2)} — ${quality}`;
}
