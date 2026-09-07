/**
 * Trends and player development.
 *
 * Three questions, in order: what has moved inside this season, what has moved
 * across the career, and what does the whole picture say to somebody who has to
 * make a decision about this athlete.
 *
 * The comparison mode deliberately offers self-versus-self and self-versus-
 * archetype and nothing else. Comparison against a named professional would be a
 * sample of one measured on a rig nobody here controls; a pooled, de-identified
 * archetype is both defensible and more useful, because it gives an athlete a
 * direction rather than a person to imitate.
 */

import { useMemo, useState } from 'react';
import { ARCHETYPES, archetype } from '../domain/archetypes';
import { metric, type MetricId } from '../domain/metrics';
import type { ArchetypeId } from '../domain/types';
import { useStore } from '../state/store';
import { aggregate, isThrow } from '../analysis/aggregate';
import { composure, situationalScore, successRate } from '../analysis/splits';
import { careerSeries, describeFit, weeklySeries } from '../analysis/trends';
import { linearFit } from '../lib/stats';
import { formatValue } from '../lib/format';
import { seriesColor, STATUS } from '../lib/palette';
import { DataRow, Empty, MetricInfo, Panel, SectionTitle, Segmented } from '../components/ui';
import { GroupedBars, TrendChart } from '../components/charts';

const TRACKED: MetricId[] = [
  'oodaLoop',
  'oodaOrient',
  'decisionLatency',
  'timeToRelease',
  'anticipatoryRate',
  'onTargetRate',
  'releaseConsistency',
  'velocity',
  'sequenceOrder',
  'coverageIdAccuracy',
  'epaPerDropback',
  'armStress',
];

const THESIS: MetricId[] = [
  'oodaLoop',
  'decisionLatency',
  'anticipatoryRate',
  'onTargetRate',
  'loopStability',
  'epaPerDropback',
];

export function TrendsView() {
  const { allSeasons, current, seasonRecords, records, athlete } = useStore();
  const [tracked, setTracked] = useState<MetricId>('oodaLoop');
  const [mode, setMode] = useState<'season' | 'career' | 'archetype'>('season');
  const [compareTo, setCompareTo] = useState<ArchetypeId>('field-general');

  const seasonTrend = useMemo(() => {
    if (!current) return null;
    const series = weeklySeries(seasonRecords, current.games, tracked);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const point of series.points) {
      if (point.value === null) continue;
      xs.push(point.x);
      ys.push(point.value);
    }
    const fit = linearFit(xs, ys);
    return {
      series,
      fit,
      data: series.points.map((point) => ({
        label: point.label,
        value: point.value,
        fitted: fit ? fit.intercept + fit.slope * point.x : null,
        reps: point.reps,
      })),
    };
  }, [current, seasonRecords, tracked]);

  const career = useMemo(
    () =>
      careerSeries(
        allSeasons.map((entry) => ({
          id: entry.season.id,
          label: entry.season.label,
          year: entry.season.year,
          level: entry.season.level,
          records: entry.throws,
        })),
        tracked,
      ),
    [allSeasons, tracked],
  );

  const thesis = useMemo(() => buildThesis(records), [records]);

  if (!current || !athlete) return <Empty>Season data unavailable.</Empty>;

  const def = metric(tracked);
  const composureScore = composure(records);

  return (
    <div className="space-y-4">
      {/* ── Metric picker ───────────────────────────────────────────────── */}
      <Panel
        eyebrow="Development"
        title="Every core metric, over time"
        note="Pick a metric to trend. The dashed line is the least-squares fit and the caption carries its r² — a slope without a fit quality is a shape, not a finding."
        actions={
          <Segmented
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'season' as const, label: 'This season' },
              { value: 'career' as const, label: 'Career' },
              { value: 'archetype' as const, label: 'Archetype' },
            ]}
          />
        }
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TRACKED.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTracked(id)}
              className={`num rounded-sm border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em] transition-colors ${
                id === tracked
                  ? 'border-accent bg-accent text-void'
                  : 'border-hairline text-ink-3 hover:border-hairline-strong hover:text-ink'
              }`}
            >
              {metric(id).short}
            </button>
          ))}
        </div>

        {mode === 'season' && seasonTrend && (
          <>
            <TrendChart
              data={seasonTrend.data}
              unit={def.unit}
              precision={def.precision}
              band={def.band}
              height={280}
              colorIndex={0}
              seriesName={def.label}
            />
            <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <DataRow label="Fit" value={describeFit(seasonTrend.fit, def.unit, def.better)} />
              <DataRow
                label="Implied change across the season"
                value={
                  seasonTrend.series.spanChange === null
                    ? '—'
                    : `${seasonTrend.series.spanChange > 0 ? '+' : '−'}${Math.abs(seasonTrend.series.spanChange).toFixed(def.precision)}`
                }
                unit={def.unit}
              />
            </div>
          </>
        )}

        {mode === 'career' && (
          <>
            <GroupedBars
              data={career.map((point) => ({ label: point.label, value: point.value, reps: point.reps }))}
              keys={[{ key: 'value', name: def.label, colorIndex: 0 }]}
              unit={def.unit}
              precision={def.precision}
              height={240}
            />
            <div className="mt-3 space-y-0.5">
              {career.map((point) => (
                <DataRow
                  key={point.seasonId}
                  label={`${point.label} · ${point.level}`}
                  value={formatValue(tracked, point.value)}
                  unit={`${def.unit} · ${point.reps} dropbacks`}
                />
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
              Career comparison crosses a level change, and the app says so rather than smoothing over it: college reps
              and professional reps are not interchangeable, and a metric that improved between them may have improved
              because the athlete did or because the sample did.
            </p>
          </>
        )}

        {mode === 'archetype' && (
          <ArchetypeCompare
            records={records}
            compareTo={compareTo}
            onCompareTo={setCompareTo}
            ownArchetype={athlete.archetype}
          />
        )}
      </Panel>

      {/* ── Side-by-side season comparison ──────────────────────────────── */}
      <Panel
        eyebrow="Self against self"
        title="Season by season, on the metrics that describe the position"
        note="Same athlete, different points in the career. The right-hand column is the change from the earliest season on record to the current one."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="eyebrow py-2 pr-3 font-normal">Metric</th>
                {allSeasons.map((entry) => (
                  <th key={entry.season.id} className="eyebrow py-2 pr-3 text-right font-normal">
                    {entry.season.label}
                  </th>
                ))}
                <th className="eyebrow py-2 text-right font-normal">Career Δ</th>
              </tr>
            </thead>
            <tbody>
              {TRACKED.map((id) => {
                const values = allSeasons.map((entry) => aggregate(entry.throws, id));
                const first = values[0] ?? null;
                const last = values[values.length - 1] ?? null;
                const delta = first !== null && last !== null ? last - first : null;
                const metricDef = metric(id);
                const good =
                  delta === null || metricDef.better === 'band'
                    ? null
                    : metricDef.better === 'higher'
                      ? delta > 0
                      : delta < 0;
                return (
                  <tr key={id} className="border-b border-hairline/50 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                        {metricDef.label}
                        <MetricInfo id={id} />
                      </span>
                    </td>
                    {values.map((value, index) => (
                      <td key={index} className="num py-2 pr-3 text-right text-[12px]">
                        {formatValue(id, value)}
                      </td>
                    ))}
                    <td
                      className="num py-2 text-right text-[12px]"
                      style={{ color: good === null ? undefined : good ? STATUS.good : STATUS.serious }}
                    >
                      {delta === null ? '—' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(metricDef.precision)}`}
                      <span className="ml-1 text-[10px] text-ink-3">{metricDef.unit}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── The one-pager ───────────────────────────────────────────────── */}
      <Panel
        eyebrow="For the room"
        title="One-page summary"
        note="Six figures, each with the reason a staff or an agent would raise it, and the sample it rests on. Built for the ten minutes at the start of a meeting where nobody is going to open a dashboard."
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-sm border border-accent px-3 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent hover:text-void"
          >
            Print / save as PDF
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {thesis.map((entry) => (
            <div key={entry.id} className="print-surface rounded-sm border border-hairline bg-sunken p-4">
              <div className="flex items-center gap-1.5">
                <span className="eyebrow">{metric(entry.id).short}</span>
                <MetricInfo id={entry.id} />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="num print-ink text-[34px] font-medium leading-none text-ink">
                  {formatValue(entry.id, entry.value)}
                </span>
                <span className="num text-[11px] text-ink-3">{metric(entry.id).unit}</span>
              </div>
              <p className="print-ink-2 mt-2 text-[11px] leading-relaxed text-ink-2">{entry.line}</p>
              <div className="num mt-2 text-[10px] text-ink-3">{entry.sample}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="print-surface rounded-sm border border-hairline bg-sunken p-4">
            <SectionTitle>Profile</SectionTitle>
            <div className="space-y-0.5">
              <DataRow label="Athlete" value={`${athlete.name} · #${athlete.jersey} · ${athlete.org}`} />
              <DataRow
                label="Measurables"
                value={`${Math.floor(athlete.heightIn / 12)}′${athlete.heightIn % 12}″ · ${athlete.weightLb} lb · ${athlete.wingspanIn}″ span · ${athlete.handSizeIn}″ hand`}
              />
              <DataRow label="Age / experience" value={`${athlete.ageYears} · ${athlete.experienceYears} accrued seasons`} />
              <DataRow label="Closest archetype" value={archetype(athlete.archetype).label} />
              <DataRow label="Composure" value={composureScore.reliable ? `${composureScore.score}/100` : 'thin sample'} info="composure" />
              <DataRow label="Situational decision score" value={(situationalScore(records) ?? 0).toFixed(0)} info="situationalScore" />
              <DataRow label="Success rate" value={`${(successRate(records) ?? 0).toFixed(1)}%`} />
            </div>
          </div>

          <div className="print-surface rounded-sm border border-hairline bg-sunken p-4">
            <SectionTitle note={archetype(athlete.archetype).pooledFrom + ' pooled, de-identified passers'}>
              {archetype(athlete.archetype).label} — what the composite optimises for
            </SectionTitle>
            <p className="print-ink-2 text-[11px] leading-relaxed text-ink-2">{archetype(athlete.archetype).thesis}</p>
            <div className="mt-3 space-y-0.5">
              {THESIS.filter((id) => archetype(athlete.archetype).bands[id]).map((id) => {
                const band = archetype(athlete.archetype).bands[id];
                const value = aggregate(records, id);
                if (!band || value === null) return null;
                const inside = Math.abs(value - band.centre) <= band.spread;
                return (
                  <DataRow
                    key={id}
                    label={metric(id).label}
                    value={`${formatValue(id, value)} vs ${band.centre.toFixed(metric(id).precision)} ± ${band.spread}`}
                    unit={metric(id).unit}
                    tone={inside ? STATUS.good : undefined}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ── Archetype comparison ────────────────────────────────────────────────────

function ArchetypeCompare({
  records,
  compareTo,
  onCompareTo,
  ownArchetype,
}: {
  records: readonly import('../domain/types').ThrowRecord[];
  compareTo: ArchetypeId;
  onCompareTo: (id: ArchetypeId) => void;
  ownArchetype: ArchetypeId;
}) {
  const target = archetype(compareTo);
  const ids = Object.keys(target.bands) as MetricId[];

  const rows = ids
    .map((id) => {
      const band = target.bands[id];
      const value = aggregate(records.filter(isThrow), id) ?? aggregate(records, id);
      if (!band || value === null) return null;
      const def = metric(id);
      // Distance from the composite's centre in units of its own spread, so a
      // metric measured in milliseconds and one measured in percent are
      // comparable on one axis.
      const z = (value - band.centre) / (band.spread || 1);
      const good = def.better === 'band' ? null : def.better === 'higher' ? z > 0 : z < 0;
      return { id, value, band, z, good, def };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="eyebrow mr-1">Composite</span>
        {ARCHETYPES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onCompareTo(entry.id)}
            className={`rounded-sm border px-2.5 py-1.5 text-[10px] transition-colors ${
              entry.id === compareTo
                ? 'border-accent bg-accent text-void'
                : 'border-hairline text-ink-3 hover:border-hairline-strong hover:text-ink'
            }`}
          >
            {entry.label}
            {entry.id === ownArchetype && <span className="ml-1.5 opacity-70">· own</span>}
          </button>
        ))}
      </div>

      <p className="mb-4 max-w-[100ch] text-[11px] leading-relaxed text-ink-2">{target.thesis}</p>

      <div className="space-y-2">
        {rows.map((row) => {
          const offset = Math.max(-3, Math.min(3, row.z));
          const left = 50 + (offset / 3) * 46;
          return (
            <div key={row.id} className="rounded-sm border border-hairline bg-sunken p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                  {row.def.label}
                  <MetricInfo id={row.id} />
                </span>
                <span className="num text-[11px] text-ink">
                  {formatValue(row.id, row.value)}
                  <span className="mx-1.5 text-ink-3">vs</span>
                  {row.band.centre.toFixed(row.def.precision)} ± {row.band.spread}
                  <span className="ml-1 text-[10px] text-ink-3">{row.def.unit}</span>
                </span>
              </div>
              <div className="relative mt-2 h-6">
                <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-hairline" />
                <div className="absolute left-[27%] top-1/2 h-3 w-[46%] -translate-y-1/2 rounded-sm bg-accent/15" />
                <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-hairline-strong" />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border"
                  style={{
                    left: `${left}%`,
                    background: row.good === null ? seriesColor(0) : row.good ? STATUS.good : STATUS.serious,
                    borderColor: '#0f1318',
                  }}
                />
              </div>
              <div className="num flex justify-between text-[9px] text-ink-3">
                <span>−3 spreads</span>
                <span>composite centre</span>
                <span>+3 spreads</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
        Position is measured in the composite's own interquartile half-widths, so metrics in milliseconds, miles per
        hour and percent sit on one axis. The shaded band is inside one spread of the centre — which is the honest
        reading of "matches this archetype". These composites are pooled and de-identified by construction; no named
        athlete's proprietary tracking data is used anywhere in this app.
      </p>
    </div>
  );
}

// ── The investment thesis ───────────────────────────────────────────────────

interface ThesisEntry {
  id: MetricId;
  value: number | null;
  line: string;
  sample: string;
}

/**
 * Six figures and the sentence that goes with each. The sentences are assembled
 * from the numbers rather than written in advance, so a bad season produces a
 * card that says so.
 */
function buildThesis(records: readonly import('../domain/types').ThrowRecord[]): ThesisEntry[] {
  const throwing = records.filter(isThrow);
  const comp = composure(records);
  const entries: ThesisEntry[] = [];

  // `aggregate` already applies the right rep filter per metric — release
  // metrics drop sacks, on-target drops throwaways, EPA keeps everything — so
  // the card is fed the same record list as the rest of the app and cannot
  // disagree with the header strip.
  const push = (id: MetricId, line: string, sample: string) => {
    entries.push({ id, value: aggregate(records, id), line, sample });
  };

  const loop = aggregate(records, 'oodaLoop');
  push(
    'oodaLoop',
    loop === null
      ? 'Not enough throws in scope to state a loop time.'
      : `Snap to release, decomposed. ${loop < 2500 ? 'Operates ahead of the rush rather than reacting to it' : 'Holds the ball long enough that protection has to be schemed for it'} — which is the first thing a coordinator has to plan around.`,
    `${throwing.length} throws`,
  );

  const latency = aggregate(records, 'decisionLatency');
  push(
    'decisionLatency',
    latency === null
      ? 'Not enough reps to state a decision latency.'
      : `Read complete to first frame of the throwing motion, isolated from footwork and arm speed. ${latency < 300 ? 'Inside the practised-read range' : 'Above the practised-read range, which is the span coaching moves fastest'}.`,
    `benchmarked against his own rolling average`,
  );

  push(
    'anticipatoryRate',
    `Share of throws released before the receiver's break — the cleanest proxy available for pattern recognition, because throwing to where a route will be requires the picture to have been solved early.`,
    `${throwing.length} charted throws`,
  );

  push(
    'onTargetRate',
    `Ball placed where the route and the leverage required, whether or not it was caught. Drops and contested catches do not move it, so it survives a change of personnel.`,
    `throwaways excluded from the denominator`,
  );

  push(
    'loopStability',
    `Structured-pocket loop time expressed against off-structure loop time. This is where good separates from elite: everyone is fast on schedule.`,
    `${records.filter((record) => record.context.pocketState === 'collapsed' || record.context.pocketState === 'off-platform').length} off-structure reps`,
  );

  push(
    'epaPerDropback',
    `The common currency with every front-office model, included so the process metrics above can be checked against something a general manager already trusts. Composure ${comp.reliable ? `${comp.score}/100` : 'not yet reliable'}.`,
    `sacks and scrambles included`,
  );

  return entries;
}
