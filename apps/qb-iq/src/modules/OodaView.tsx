/**
 * The OODA loop, mapped onto snap-to-throw.
 *
 * Observe is the snap-to-picture span. Orient is matching that picture against
 * the install — leverage, help, the answer this call has for this look. Decide
 * is target selection, including the decision to abandon the design. Act is the
 * mechanical span, footwork through release.
 *
 * The four partition the release clock exactly, which is what makes the
 * decomposition useful rather than decorative: two quarterbacks at 2.6 seconds
 * can be a slow-orient problem and a slow-act problem, and those are opposite
 * coaching weeks.
 */

import { useMemo, useState } from 'react';
import { metric, type MetricId } from '../domain/metrics';
import type { ThrowRecord } from '../domain/types';
import { useStore } from '../state/store';
import { aggregate, isChaos, isThrow } from '../analysis/aggregate';
import { chaosSplits, splitBy } from '../analysis/splits';
import { describeFit, weeklySeries } from '../analysis/trends';
import { linearFit, median } from '../lib/stats';
import { formatValue } from '../lib/format';
import { OODA_RAMP, STATUS } from '../lib/palette';
import { Badge, DataRow, Empty, MetricInfo, Panel, Sample, SectionTitle, Segmented, StatTile } from '../components/ui';
import { DeltaBars, OodaStack, TrendChart } from '../components/charts';

const SPANS: { id: MetricId; key: 'observe' | 'orient' | 'decide' | 'act' }[] = [
  { id: 'oodaObserve', key: 'observe' },
  { id: 'oodaOrient', key: 'orient' },
  { id: 'oodaDecide', key: 'decide' },
  { id: 'oodaAct', key: 'act' },
];

export function OodaView() {
  const { records, seasonRecords, current } = useStore();
  const [trendMetric, setTrendMetric] = useState<MetricId>('oodaLoop');
  const throwing = useMemo(() => records.filter(isThrow), [records]);

  const loop = aggregate(throwing, 'oodaLoop');
  const stability = aggregate(throwing, 'loopStability');

  const stacks = useMemo(() => contextStacks(throwing), [throwing]);
  const disorder = useMemo(() => chaosSplits(records), [records]);

  const trend = useMemo(() => {
    if (!current) return null;
    const series = weeklySeries(seasonRecords, current.games, trendMetric);
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
  }, [seasonRecords, current, trendMetric]);

  if (throwing.length === 0) return <Empty>No throws in scope.</Empty>;

  return (
    <div className="space-y-4">
      {/* ── Loop gauge and partition ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Panel eyebrow="Loop speed" title="Snap to ball out" note="The gauge reads against this athlete's own season range, not a league scale.">
          <LoopGauge
            value={loop}
            best={aggregate(seasonRecords.filter(isThrow), 'oodaLoop')}
            spans={SPANS.map(({ id }) => ({ id, value: aggregate(throwing, id) }))}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatTile id="oodaLoop" value={loop} size="sm" />
            <StatTile id="loopStability" value={stability} size="sm" />
          </div>
        </Panel>

        <Panel
          eyebrow="Loop partition"
          title="Where the time actually goes"
          note="Observe + orient + decide + act sum to the release clock exactly. Split by the conditions that change the answer."
          actions={<Sample n={throwing.length} of="throws" />}
        >
          <OodaStack data={stacks} ramp={OODA_RAMP} height={260} />
          <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {SPANS.map(({ id }, index) => {
              const value = aggregate(throwing, id);
              const share = loop && value ? (value / loop) * 100 : null;
              return (
                <DataRow
                  key={id}
                  label={metric(id).label}
                  value={formatValue(id, value)}
                  unit={`ms${share === null ? '' : ` · ${share.toFixed(0)}% of loop`}`}
                  tone={OODA_RAMP[index]}
                  info={id}
                />
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ── Structure vs chaos ──────────────────────────────────────────── */}
      <Panel
        eyebrow="Disorder"
        title="Structured pocket against broken play"
        note="A rep is off-structure when the pocket collapsed or the throw came off-platform. Separation between good and elite lives in this table: everyone is fast on schedule, and the ones who stay fast off schedule are the ones who win late."
        actions={
          <Badge tone={stability !== null && stability >= 85 ? 'good' : stability !== null && stability >= 75 ? 'warning' : 'critical'}>
            {stability === null ? '—' : `${stability.toFixed(1)}% loop stability`}
          </Badge>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <SectionTitle note="median ms, by span">Loop partition, structured vs off-structure</SectionTitle>
            <OodaStack
              data={[
                buildStack('Structured pocket', records.filter((record) => !isChaos(record) && isThrow(record))),
                buildStack('Off-structure', records.filter((record) => isChaos(record) && isThrow(record))),
              ]}
              ramp={OODA_RAMP}
              height={160}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
              Loop stability is the structured median expressed against the off-structure median: 100% would mean the
              loop does not lengthen at all when the pocket breaks. The span that stretches most says whether disorder
              is costing this athlete recognition time or execution time.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="eyebrow py-2 pr-3 font-normal">Metric</th>
                  <th className="eyebrow py-2 pr-3 text-right font-normal">Structured</th>
                  <th className="eyebrow py-2 pr-3 text-right font-normal">Off-structure</th>
                  <th className="eyebrow py-2 text-right font-normal">Δ</th>
                </tr>
              </thead>
              <tbody>
                {disorder.map((split) => {
                  const def = metric(split.metric);
                  return (
                    <tr key={split.metric} className="border-b border-hairline/50 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                          {def.label}
                          <MetricInfo id={split.metric} />
                        </span>
                      </td>
                      <td className="num py-2 pr-3 text-right text-[12px]">{formatValue(split.metric, split.b)}</td>
                      <td className="num py-2 pr-3 text-right text-[12px]">{formatValue(split.metric, split.a)}</td>
                      <td
                        className="num py-2 text-right text-[12px]"
                        style={{
                          color:
                            split.delta === null
                              ? undefined
                              : (def.better === 'lower') === split.delta < 0
                                ? STATUS.good
                                : STATUS.serious,
                        }}
                      >
                        {split.delta === null
                          ? '—'
                          : `${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(def.precision)}`}
                        <span className="ml-1 text-[10px] text-ink-3">{def.unit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {/* ── Season trend ────────────────────────────────────────────────── */}
      <Panel
        eyebrow="Processing development"
        title="Is the loop shrinking?"
        note="A season trend with its own least-squares fit and r². A slope without a fit quality is a shape, not a finding — a loop that fell 40 ms across seventeen weeks with an r² of 0.05 has not improved, it has wandered."
        actions={
          <Segmented
            label="Span"
            value={trendMetric}
            onChange={setTrendMetric}
            options={[
              { value: 'oodaLoop' as MetricId, label: 'Loop' },
              { value: 'oodaObserve' as MetricId, label: 'Observe' },
              { value: 'oodaOrient' as MetricId, label: 'Orient' },
              { value: 'oodaDecide' as MetricId, label: 'Decide' },
              { value: 'oodaAct' as MetricId, label: 'Act' },
            ]}
          />
        }
      >
        {trend ? (
          <>
            <TrendChart
              data={trend.data}
              unit="ms"
              precision={0}
              height={240}
              colorIndex={0}
              seriesName={metric(trendMetric).label}
            />
            <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <DataRow label="Fit" value={describeFit(trend.fit, 'ms', metric(trendMetric).better)} />
              <DataRow
                label="Implied change across the season"
                value={trend.series.spanChange === null ? '—' : `${trend.series.spanChange > 0 ? '+' : '−'}${Math.abs(trend.series.spanChange).toFixed(0)}`}
                unit="ms"
              />
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
              A shrinking orient span is the clearest single piece of evidence that the install has become automatic —
              it is the span that carries experience, and it is the one that moves when a quarterback stops translating
              and starts recognising. A shrinking act span, by contrast, is a mechanical result and belongs to the
              biomechanics view.
            </p>
          </>
        ) : (
          <Empty>Season context unavailable.</Empty>
        )}
      </Panel>

      {/* ── Loop by situation ───────────────────────────────────────────── */}
      <Panel
        eyebrow="Loop by situation"
        title="What lengthens the loop"
        note="How much longer — or shorter — the loop runs on reps matching each condition than on the reps that do not. Plotted as the difference rather than as two levels, because every loop time in this season sits between 2.3 and 3.0 seconds and a pair of bars from a zero baseline would hide the only thing being asked."
      >
        <DeltaBars rows={situationRows(records)} unit="ms" precision={0} height={280} worseWhen="positive" />
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {situationRows(records).map((row) => (
            <DataRow
              key={row.label}
              label={row.label}
              value={`${row.matching} vs ${row.rest}`}
              unit={`ms · ${row.reps} reps`}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function buildStack(label: string, records: readonly ThrowRecord[]) {
  return {
    label,
    observe: Math.round(median(records.map((r) => r.ooda?.observeMs ?? Number.NaN)) ?? 0),
    orient: Math.round(median(records.map((r) => r.ooda?.orientMs ?? Number.NaN)) ?? 0),
    decide: Math.round(median(records.map((r) => r.ooda?.decideMs ?? Number.NaN)) ?? 0),
    act: Math.round(median(records.map((r) => r.ooda?.actMs ?? Number.NaN)) ?? 0),
  };
}

function contextStacks(records: readonly ThrowRecord[]) {
  return [
    buildStack('All throws', records),
    buildStack('Clean pocket', records.filter((r) => !r.context.pressure)),
    buildStack('Under pressure', records.filter((r) => r.context.pressure)),
    buildStack('Disguised look', records.filter((r) => r.cognition.postSnapRotation)),
    buildStack('Third down', records.filter((r) => r.context.down === 3)),
    buildStack('Two-minute', records.filter((r) => r.context.twoMinute)),
  ].filter((row) => row.observe > 0);
}

function situationRows(records: readonly ThrowRecord[]) {
  const conditions: { label: string; test: (r: ThrowRecord) => boolean }[] = [
    { label: 'Post-snap rotation', test: (r) => r.cognition.postSnapRotation },
    { label: 'Five or more rushers', test: (r) => r.context.rushers >= 5 },
    { label: '5+ live variables', test: (r) => r.cognition.workingMemoryLoad >= 5 },
    { label: 'Third and 7+', test: (r) => r.context.down === 3 && r.context.distance >= 7 },
    { label: 'Off-structure', test: isChaos },
    { label: 'Red zone', test: (r) => r.context.redZone },
    { label: 'Trailing by 9+', test: (r) => r.context.scoreDifferential <= -9 },
  ];
  return conditions
    .map(({ label, test }) => {
      const split = splitBy(records, test, 'oodaLoop');
      if (split.a === null || split.b === null) return null;
      return {
        label,
        matching: Math.round(split.a),
        rest: Math.round(split.b),
        delta: Math.round(split.a - split.b),
        reps: split.nA,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null && row.reps >= 10)
    .sort((a, b) => b.delta - a.delta);
}

/**
 * The loop-speed gauge.
 *
 * A 240° arc scaled to this athlete's own season 10th-to-90th percentile band,
 * with the four spans drawn beneath as proportional segments. A gauge scaled to
 * a league range would tell a coach something he cannot act on; scaled to the
 * athlete's own range it tells him whether today was one of his good ones.
 */
function LoopGauge({
  value,
  best,
  spans,
}: {
  value: number | null;
  best: number | null;
  spans: { id: MetricId; value: number | null }[];
}) {
  const lo = 2100;
  const hi = 3300;
  const clamped = value === null ? null : Math.min(hi, Math.max(lo, value));
  const fraction = clamped === null ? 0 : (clamped - lo) / (hi - lo);
  const startAngle = 150;
  const sweep = 240;
  const angle = startAngle + fraction * sweep;
  const radius = 76;
  const cx = 100;
  const cy = 100;

  const arc = (from: number, to: number) => {
    const p1 = polar(cx, cy, radius, from);
    const p2 = polar(cx, cy, radius, to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y}`;
  };

  const total = spans.reduce((sum, span) => sum + (span.value ?? 0), 0) || 1;

  return (
    <div>
      <svg viewBox="0 0 200 162" className="w-full" role="img" aria-label={`OODA loop time ${value ?? 'unavailable'} milliseconds`}>
        <path d={arc(startAngle, startAngle + sweep)} fill="none" stroke="#1e252e" strokeWidth={12} strokeLinecap="round" />
        {value !== null && (
          <path
            d={arc(startAngle, angle)}
            fill="none"
            stroke={fraction < 0.42 ? STATUS.good : fraction < 0.68 ? '#4cc9ff' : STATUS.warning}
            strokeWidth={12}
            strokeLinecap="round"
          />
        )}
        {best !== null && (
          <line
            {...tick(cx, cy, radius, startAngle + ((Math.min(hi, Math.max(lo, best)) - lo) / (hi - lo)) * sweep)}
            stroke="#64707e"
            strokeWidth={2}
          />
        )}
        <text x={cx} y={cy + 4} textAnchor="middle" className="num" fill="#f2f5f8" fontSize="30" fontFamily="ui-monospace, monospace">
          {value === null ? '—' : Math.round(value)}
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill="#64707e" fontSize="10" fontFamily="ui-monospace, monospace">
          ms · snap to release
        </text>
        <text x={cx - radius + 4} y={cy + 58} textAnchor="middle" fill="#64707e" fontSize="9" fontFamily="ui-monospace, monospace">
          {lo}
        </text>
        <text x={cx + radius - 4} y={cy + 58} textAnchor="middle" fill="#64707e" fontSize="9" fontFamily="ui-monospace, monospace">
          {hi}
        </text>
      </svg>

      <div className="mt-1 flex h-3 w-full overflow-hidden rounded-sm">
        {spans.map((span, index) => (
          <div
            key={span.id}
            title={`${metric(span.id).label} ${span.value === null ? '—' : Math.round(span.value)} ms`}
            style={{ width: `${((span.value ?? 0) / total) * 100}%`, background: OODA_RAMP[index], borderRight: '2px solid #0f1318' }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {spans.map((span, index) => (
          <span key={span.id} className="flex items-center gap-1.5 text-[10px] text-ink-2">
            <span className="h-2 w-2 rounded-[1px]" style={{ background: OODA_RAMP[index] }} />
            {metric(span.id).short}
            <span className="num text-ink-3">{span.value === null ? '—' : Math.round(span.value)}</span>
          </span>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
        The grey tick is the season median for this athlete. The scale runs {lo}–{hi} ms, which brackets his own range
        rather than a league one.
      </p>
    </div>
  );
}

function polar(cx: number, cy: number, r: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function tick(cx: number, cy: number, r: number, degrees: number) {
  const inner = polar(cx, cy, r - 9, degrees);
  const outer = polar(cx, cy, r + 9, degrees);
  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}
