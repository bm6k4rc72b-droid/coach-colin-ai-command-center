/**
 * Neuroscience & cognitive performance.
 *
 * The processing side of the position, measured the same way the mechanics are:
 * how fast the picture resolves, how long the decision takes once it has, how
 * many things the call asked the athlete to hold at once and what that cost,
 * whether the ball goes before the break, and what the eyes did while all of it
 * happened.
 *
 * Every latency here is benchmarked against this athlete's own rolling average,
 * never a league mean — a 290 ms decision is fast or slow depending entirely on
 * what 290 ms is for him.
 */

import { useMemo, useState } from 'react';
import { metric, type MetricId } from '../domain/metrics';
import type { CoverageShell, ThrowRecord } from '../domain/types';
import { useStore } from '../state/store';
import { aggregate, isChartedThrow, isPressured, isThrow, repValues } from '../analysis/aggregate';
import { loadCurve, splitBy } from '../analysis/splits';
import { repSeries, weeklySeries } from '../analysis/trends';
import { ewma, median, rate } from '../lib/stats';
import { formatPct, formatValue } from '../lib/format';
import { STATUS } from '../lib/palette';
import { Badge, DataRow, Empty, MetricInfo, Panel, Sample, SectionTitle, Segmented, StatTile } from '../components/ui';
import { GroupedBars, MiniLine, RollingArea, TrendChart } from '../components/charts';

const LATENCY_METRICS: MetricId[] = ['coverageIdTime', 'decisionLatency', 'progressionSpeed', 'gazeDwell'];

export function CognitionView() {
  const { records, seasonRecords, current } = useStore();
  const [latency, setLatency] = useState<MetricId>('decisionLatency');
  const [rollingWindow, setRollingWindow] = useState<'25' | '50' | '100'>('50');

  const charted = useMemo(() => records.filter(isChartedThrow), [records]);
  const load = useMemo(() => loadCurve(records), [records]);
  const shells = useMemo(() => byShell(records), [records]);
  const rolling = useMemo(
    () => repSeries(records, latency, Number(rollingWindow)),
    [records, latency, rollingWindow],
  );

  const baselineAverage = useMemo(() => {
    const values = repValues(seasonRecords, latency);
    const smoothed = ewma(values, 0.06);
    return smoothed.length > 0 ? (smoothed[smoothed.length - 1] as number) : null;
  }, [seasonRecords, latency]);

  if (records.length === 0) return <Empty>No reps in scope.</Empty>;

  const def = metric(latency);
  const anticipation = aggregate(charted, 'anticipatoryRate');
  const rotationReps = records.filter((record) => record.cognition.postSnapRotation);

  return (
    <div className="space-y-4">
      {/* ── Pre-snap and read speed ─────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Panel
          eyebrow="Read speed"
          title="From the call to the ball"
          note="Four spans, each timed to its own event. Pre-snap time is measured from the huddle break or the no-huddle call; everything else is measured from the snap."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LATENCY_METRICS.map((id) => (
              <StatTile
                key={id}
                id={id}
                value={aggregate(records, id)}
                active={id === latency}
                onClick={() => setLatency(id)}
                spark={
                  current ? weeklySeries(seasonRecords, current.games, id).points.map((point) => point.value) : undefined
                }
              />
            ))}
          </div>

          <div className="mt-4 rounded-sm border border-hairline bg-sunken p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle note={`rolling median over ${rollingWindow} reps, against this athlete's own exponential average`}>
                {def.label}, rep by rep
              </SectionTitle>
              <Segmented
                label="Window"
                value={rollingWindow}
                onChange={setRollingWindow}
                options={[
                  { value: '25', label: '25' },
                  { value: '50', label: '50' },
                  { value: '100', label: '100' },
                ]}
              />
            </div>
            <RollingArea
              data={rolling.map((point) => ({ label: String(point.x), value: point.value }))}
              unit={def.unit}
              precision={def.precision}
              name={def.label}
              colorIndex={0}
              height={170}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
              Own rolling benchmark:{' '}
              <span className="num text-ink-2">
                {baselineAverage === null ? '—' : `${baselineAverage.toFixed(def.precision)} ${def.unit}`}
              </span>{' '}
              — an exponentially weighted season average that forgets slowly, so a single fast game does not become the
              standard. {def.why}
            </p>
          </div>
        </Panel>

        <Panel
          eyebrow="Coverage identification"
          title="Speed against accuracy"
          note="The pair is the metric. A quick declaration that is wrong is worse than a slow one that is right, so neither number is shown without the other."
        >
          <div className="grid grid-cols-2 gap-2">
            <StatTile id="coverageIdTime" value={aggregate(records, 'coverageIdTime')} />
            <StatTile id="coverageIdAccuracy" value={aggregate(records, 'coverageIdAccuracy')} />
          </div>

          <div className="mt-4">
            <SectionTitle note="reps where the shell shown before the snap was not the shell played">
              Disguise and rotation
            </SectionTitle>
            <div className="space-y-0.5">
              <DataRow
                label="Reps facing a post-snap rotation"
                value={`${rotationReps.length}`}
                unit={`of ${records.length} · ${formatPct((rotationReps.length / records.length) * 100)}`}
              />
              <DataRow
                label="Coverage ID accuracy, static picture"
                value={formatValue('coverageIdAccuracy', aggregate(records.filter((r) => !r.cognition.postSnapRotation), 'coverageIdAccuracy'))}
                unit="%"
              />
              <DataRow
                label="Coverage ID accuracy, rotated picture"
                value={formatValue('coverageIdAccuracy', aggregate(rotationReps, 'coverageIdAccuracy'))}
                unit="%"
                tone={STATUS.warning}
              />
              <DataRow
                label="Extra observe time when rotated"
                value={formatValue('oodaObserve', splitBy(records, (r) => r.cognition.postSnapRotation, 'oodaObserve').delta)}
                unit="ms"
              />
            </div>
          </div>

          <div className="mt-4">
            <SectionTitle note="median identification time by the shell actually played">By coverage shell</SectionTitle>
            <GroupedBars
              data={shells}
              keys={[{ key: 'idMs', name: 'Coverage ID time', colorIndex: 0 }]}
              unit="ms"
              precision={0}
              layout="vertical"
              height={190}
            />
          </div>
        </Panel>
      </div>

      {/* ── Working memory ──────────────────────────────────────────────── */}
      <Panel
        eyebrow="Cognitive load"
        title="Performance against the number of live variables in the call"
        note="Live variables are counted per rep from the call sheet: protection identification, hot conversions, sight adjustments, alerts, tempo checks. The curve is where a coordinator finds out which part of the install to trim."
        actions={<Sample n={records.length} of="dropbacks" />}
      >
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <GroupedBars
            data={load.map((bucket) => ({
              label: `${bucket.load} var${bucket.load === 1 ? '' : 's'}`,
              onTarget: bucket.onTargetPct,
              reps: bucket.reps,
            }))}
            keys={[{ key: 'onTarget', name: 'On-target rate', colorIndex: 0 }]}
            unit="%"
            precision={1}
            height={220}
          />
          <div>
            <div className="grid grid-cols-2 gap-2">
              <StatTile id="workingMemoryLoad" value={aggregate(records, 'workingMemoryLoad')} size="sm" />
              <StatTile
                id="onTargetRate"
                value={aggregate(records.filter((r) => r.cognition.workingMemoryLoad >= 5), 'onTargetRate')}
                size="sm"
                sub="5+ live variables"
              />
              <StatTile
                id="onTargetRate"
                value={aggregate(records.filter((r) => r.cognition.workingMemoryLoad <= 3), 'onTargetRate')}
                size="sm"
                sub="≤3 live variables"
              />
              <StatTile
                id="decisionLatency"
                value={aggregate(records.filter((r) => r.cognition.workingMemoryLoad >= 5), 'decisionLatency')}
                size="sm"
                sub="5+ live variables"
              />
            </div>
            <div className="mt-3 rounded-sm border border-hairline bg-sunken p-3">
              <div className="eyebrow mb-2">Reps per load level</div>
              <div className="space-y-0.5">
                {load.map((bucket) => (
                  <DataRow
                    key={bucket.load}
                    label={`${bucket.load} live variable${bucket.load === 1 ? '' : 's'}`}
                    value={`${bucket.reps}`}
                    unit={bucket.onTargetPct === null ? 'reps · below floor' : `reps · ${bucket.onTargetPct.toFixed(1)}% on target`}
                  />
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
                Buckets below eight reps are counted but not scored. Working memory holds roughly four chunks at a time;
                what expertise changes is the size of a chunk, not the count — which is why the useful coaching question
                is whether a given call can be re-taught as fewer, larger pieces.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Anticipation and eyes ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Anticipation"
          title="Throws released before the break"
          note="Timed from the tracking clock: release timestamp against the receiver's break timestamp. Throwing to where a route will be requires the picture to have been solved early, which is why this is the cleanest available proxy for pattern recognition."
        >
          <div className="grid grid-cols-2 gap-2">
            <StatTile id="anticipatoryRate" value={anticipation} />
            <StatTile
              id="anticipatoryRate"
              value={aggregate(records.filter(isPressured).filter(isChartedThrow), 'anticipatoryRate')}
              sub="under pressure"
            />
          </div>
          <div className="mt-3 space-y-0.5">
            <DataRow
              label="On-target rate, anticipatory throws"
              value={formatValue('onTargetRate', aggregate(charted.filter((r) => r.cognition.anticipatory), 'onTargetRate'))}
              unit="%"
              info="onTargetRate"
            />
            <DataRow
              label="On-target rate, reactive throws"
              value={formatValue('onTargetRate', aggregate(charted.filter((r) => !r.cognition.anticipatory), 'onTargetRate'))}
              unit="%"
            />
            <DataRow
              label="Receiver separation, anticipatory"
              value={(median(charted.filter((r) => r.cognition.anticipatory).map((r) => r.outcome.targetSeparationYd)) ?? 0).toFixed(1)}
              unit="yd"
            />
            <DataRow
              label="Receiver separation, reactive"
              value={(median(charted.filter((r) => !r.cognition.anticipatory).map((r) => r.outcome.targetSeparationYd)) ?? 0).toFixed(1)}
              unit="yd"
            />
          </div>
          {current && (
            <div className="mt-4">
              <div className="eyebrow mb-2">Anticipatory rate by week</div>
              <MiniLine
                data={weeklySeries(seasonRecords, current.games, 'anticipatoryRate').points.map((point) => ({
                  label: point.label,
                  value: point.value,
                }))}
                unit="%"
                precision={1}
                colorIndex={2}
                name="Anticipatory rate"
                height={140}
              />
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Eye discipline"
          title="Where the gaze went, and what it moved"
          note="Gaze dwell comes from eye tracking where a session has it and from charted film where it does not; the provenance strip in the header says which is in play. Safety displacement is charted from the deep defender's position two yards either side of the throwing lane."
        >
          <div className="grid grid-cols-2 gap-2">
            <StatTile id="gazeDwell" value={aggregate(records, 'gazeDwell')} />
            <StatTile id="lookOffRate" value={aggregate(records, 'lookOffRate')} />
          </div>
          <div className="mt-3 space-y-0.5">
            <DataRow
              label="Dwell on primary, clean pocket"
              value={formatValue('gazeDwell', aggregate(records.filter((r) => !isPressured(r)), 'gazeDwell'))}
              unit="ms"
            />
            <DataRow
              label="Dwell on primary, under pressure"
              value={formatValue('gazeDwell', aggregate(records.filter(isPressured), 'gazeDwell'))}
              unit="ms"
            />
            <DataRow
              label="Interception rate with a safety displaced"
              value={formatPct(intRate(records.filter((r) => r.cognition.safetyLookOff)))}
            />
            <DataRow
              label="Interception rate without"
              value={formatPct(intRate(records.filter((r) => !r.cognition.safetyLookOff)))}
              tone={STATUS.warning}
            />
            <DataRow
              label="Progressions reached per dropback"
              value={(median(records.map((r) => r.cognition.progressionDepth)) ?? 0).toFixed(1)}
              unit="reads"
            />
          </div>
          <div className="mt-4">
            <div className="eyebrow mb-2">Dwell against decision latency, by rep</div>
            <TrendChart
              data={dwellVsLatency(records)}
              unit="ms"
              precision={0}
              height={170}
              colorIndex={3}
              seriesName="Decision latency"
            />
            <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
              Binned by dwell on the primary read. A latency that keeps climbing as dwell climbs is a QB stuck on his
              first read; a flat line means he is reading deep into the progression on purpose. Those are opposite
              coaching weeks and they look identical in a box score.
            </p>
          </div>
        </Panel>
      </div>

      {/* ── Pressure response ───────────────────────────────────────────── */}
      <Panel
        eyebrow="Pressure response"
        title="What changes when a rusher is home inside 2.5 seconds"
        note="Pressure is charted from the tracking data, not inferred from the outcome — a rep is pressured because a rusher beat his block, whether or not the throw suffered."
      >
        <PressureTable records={records} />
      </Panel>
    </div>
  );
}

function intRate(records: readonly ThrowRecord[]): number | null {
  const share = rate(records.filter(isThrow), (record) => record.outcome.result === 'interception');
  return share === null ? null : share * 100;
}

function byShell(records: readonly ThrowRecord[]) {
  const groups = new Map<CoverageShell, number[]>();
  for (const record of records) {
    const list = groups.get(record.context.coveragePlayed) ?? [];
    list.push(record.cognition.coverageIdMs);
    groups.set(record.context.coveragePlayed, list);
  }
  return [...groups.entries()]
    .filter(([, values]) => values.length >= 8)
    .map(([shell, values]) => ({ label: shell, idMs: Math.round(median(values) ?? 0), reps: values.length }))
    .sort((a, b) => a.idMs - b.idMs);
}

function dwellVsLatency(records: readonly ThrowRecord[]) {
  const bins = [
    { label: '<350', test: (ms: number) => ms < 350 },
    { label: '350–500', test: (ms: number) => ms >= 350 && ms < 500 },
    { label: '500–650', test: (ms: number) => ms >= 500 && ms < 650 },
    { label: '650–800', test: (ms: number) => ms >= 650 && ms < 800 },
    { label: '800+', test: (ms: number) => ms >= 800 },
  ];
  const rows = bins.map((bin) => {
    const subset = records.filter((record) => bin.test(record.cognition.gazeDwellPrimaryMs));
    return {
      label: bin.label,
      value: subset.length >= 8 ? (median(subset.map((r) => r.cognition.decisionLatencyMs)) ?? null) : null,
      reps: subset.length,
    };
  });
  return rows;
}

const PRESSURE_ROWS: MetricId[] = [
  'onTargetRate',
  'timeToRelease',
  'decisionLatency',
  'coverageIdTime',
  'anticipatoryRate',
  'releaseConsistency',
  'hipShoulderSeparation',
  'strideLength',
  'epaPerDropback',
];

function PressureTable({ records }: { records: readonly ThrowRecord[] }) {
  const rows = PRESSURE_ROWS.map((id) => ({ id, split: splitBy(records, isPressured, id) }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th className="eyebrow py-2 pr-3 font-normal">Metric</th>
            <th className="eyebrow py-2 pr-3 text-right font-normal">Clean pocket</th>
            <th className="eyebrow py-2 pr-3 text-right font-normal">Pressure ≤2.5 s</th>
            <th className="eyebrow py-2 pr-3 text-right font-normal">Δ</th>
            <th className="eyebrow py-2 pr-3 text-right font-normal">Effect size</th>
            <th className="eyebrow py-2 text-right font-normal">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, split }) => {
            const def = metric(id);
            const good =
              split.delta === null || def.better === 'band'
                ? null
                : def.better === 'higher'
                  ? split.delta > 0
                  : split.delta < 0;
            return (
              <tr key={id} className="border-b border-hairline/50 last:border-0">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                    {def.label}
                    <MetricInfo id={id} />
                  </span>
                </td>
                <td className="num py-2 pr-3 text-right text-[12px]">{formatValue(id, split.b)}</td>
                <td className="num py-2 pr-3 text-right text-[12px]">{formatValue(id, split.a)}</td>
                <td
                  className="num py-2 pr-3 text-right text-[12px]"
                  style={{ color: good === null ? undefined : good ? STATUS.good : STATUS.serious }}
                >
                  {split.delta === null ? '—' : `${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(def.precision)}`}
                  <span className="ml-1 text-[10px] text-ink-3">{def.unit}</span>
                </td>
                <td className="num py-2 pr-3 text-right text-[11px] text-ink-3">
                  {split.effect === null ? <span title="Rates and scatter measures have no per-rep distribution to pool">—</span> : `d ${split.effect.toFixed(2)}`}
                </td>
                <td className="num py-2 text-right text-[11px] text-ink-3">
                  {split.nA}/{split.nB}
                  {!split.reliable && (
                    <span className="ml-2">
                      <Badge tone="warning">thin</Badge>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
