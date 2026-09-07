/**
 * Biomechanics.
 *
 * The throw taken apart: phases, joint angles at the events that matter, the
 * kinetic chain in sequence, where the ball leaves the hand and how repeatably,
 * what the ball does afterwards, what the feet did first, and — last, because it
 * is the conclusion rather than the input — what has moved away from this
 * athlete's own established pattern.
 */

import { useMemo, useState } from 'react';
import { metric, type MetricId } from '../domain/metrics';
import { KINETIC_SEGMENTS, THROW_PHASES, type ThrowPhase, type ThrowRecord } from '../domain/types';
import { useStore } from '../state/store';
import { aggregate, isPressured, isSequenced, isThrow, repValues, sequenceBreakAt, transferLagMs } from '../analysis/aggregate';
import { detectFlags, splitByRecentWeeks, MIN_BASELINE_REPS } from '../analysis/baseline';
import { medianOf, splitBy } from '../analysis/splits';
import { weeklySeries } from '../analysis/trends';
import { mean, median, rmsAbout, summarize } from '../lib/stats';
import { formatValue, formatWithUnit } from '../lib/format';
import { severityColor, SERIES, seriesColor, STATUS } from '../lib/palette';
import { Badge, DataRow, Empty, MetricInfo, Panel, Sample, StatTile } from '../components/ui';
import { ChainPeaks, ChainTiming, DotPlot, GroupedBars, Histogram, MiniLine, ReleaseScatter, ScatterWithFit } from '../components/charts';

const PHASE_LABEL: Record<ThrowPhase, string> = {
  stance: 'Stance / setup',
  load: 'Load',
  stride: 'Stride',
  'trunk-rotation': 'Trunk rotation',
  'arm-cocking': 'Arm cocking',
  acceleration: 'Acceleration',
  release: 'Release',
  'follow-through': 'Follow-through',
};

const SEGMENT_LABEL: Record<(typeof KINETIC_SEGMENTS)[number], string> = {
  pelvis: 'Pelvis',
  trunk: 'Trunk',
  'shoulder-ir': 'Shoulder IR',
  'elbow-ext': 'Elbow ext.',
  wrist: 'Wrist',
};

const JOINT_METRICS: MetricId[] = [
  'shoulderEr',
  'elbowFlexionRelease',
  'hipShoulderSeparation',
  'frontKneeFlexion',
  'trunkTilt',
  'armSlot',
];

export function BiomechanicsView() {
  const { records, seasonRecords, current } = useStore();
  const [joint, setJoint] = useState<MetricId>('hipShoulderSeparation');
  const throwing = useMemo(() => records.filter(isThrow), [records]);

  const phases = useMemo(() => meanPhases(throwing), [throwing]);
  const chain = useMemo(() => chainSummary(throwing), [throwing]);
  const releaseCloud = useMemo(() => releasePoints(throwing), [throwing]);
  const drop = useMemo(() => dropByPlayType(records), [records]);
  const flags = useMemo(() => {
    if (!current) return [];
    const weekOf = (record: ThrowRecord) =>
      current.games.find((game) => game.id === record.context.gameId)?.week ?? 0;
    const { baseline, recent } = splitByRecentWeeks(seasonRecords, weekOf, 5);
    return detectFlags(recent, baseline);
  }, [seasonRecords, current]);

  if (throwing.length === 0) {
    return <Empty>No reps clear the current capture-quality floor. Lower the solve threshold in the header.</Empty>;
  }

  const sequenced = throwing.filter((record) => isSequenced(record));
  const breaks = new Map<string, number>();
  for (const record of throwing) {
    const where = sequenceBreakAt(record);
    if (where) breaks.set(where, (breaks.get(where) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      {/* ── Phase breakdown ─────────────────────────────────────────────── */}
      <Panel
        eyebrow="Throw motion"
        title="Phase breakdown, snap to follow-through"
        note={`Mean phase boundaries across ${throwing.length} throws, event-detected from the kinematic solve rather than divided by time. Front-foot plant is the origin every downstream timing is measured from.`}
      >
        <PhaseTimeline phases={phases} plantMs={median(throwing.map((r) => r.footwork.frontFootPlantMs)) ?? 0} />
        <div className="mt-5">
          <div className="eyebrow mb-2">
            Zoomed: front-foot plant to follow-through — the throw itself, at 10× the scale above
          </div>
          <PhaseTimeline phases={phases.slice(3)} plantMs={phases[3]?.startMs ?? 0} zoomed />
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
          {phases.map((phase, index) => (
            <DataRow
              key={phase.phase}
              label={PHASE_LABEL[phase.phase]}
              value={`${Math.round(phase.durationMs)}`}
              unit="ms"
              tone={seriesColor(index % SERIES.length)}
            />
          ))}
        </div>
      </Panel>

      {/* ── Joint angles ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Panel
          eyebrow="Joint kinematics"
          title="Angles at the event that defines them"
          note="Each row is measured at a named instant — peak external rotation, front-foot plant, ball release — not averaged across the throw. The shaded band on the chart is the metric's target window."
        >
          <div className="space-y-0.5">
            {JOINT_METRICS.map((id) => {
              const value = aggregate(throwing, id);
              const def = metric(id);
              const band = def.band;
              const out = band && value !== null ? value < band[0] || value > band[1] : false;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setJoint(id)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-sm border-b border-hairline/60 px-2 py-2 text-left transition-colors last:border-0 ${
                    joint === id ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                    {def.label}
                    <MetricInfo id={id} />
                  </span>
                  <span className="flex items-baseline gap-3">
                    {band && (
                      <span className="num text-[10px] text-ink-3">
                        target {band[0]}–{band[1]}
                      </span>
                    )}
                    <span className="num w-16 text-right text-[13px]" style={{ color: out ? STATUS.warning : undefined }}>
                      {formatValue(id, value)}
                      <span className="ml-1 text-[10px] text-ink-3">{def.unit}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          eyebrow="Distribution"
          title={metric(joint).label}
          note={`Every qualifying rep, binned. The band is the target window; bars outside it are drawn in neutral ink so the shape of the miss is visible rather than colour-coded away.`}
          actions={<Sample n={repValues(throwing, joint).length} of="reps" />}
        >
          <Histogram
            bins={histogram(repValues(throwing, joint), 16, metric(joint).band)}
            unit={metric(joint).unit}
            band={metric(joint).band}
            height={200}
          />
          <DistributionFooter records={throwing} id={joint} />
        </Panel>
      </div>

      {/* ── Kinetic chain ───────────────────────────────────────────────── */}
      <Panel
        eyebrow="Kinetic chain"
        title="Proximal-to-distal sequencing"
        note="Peak angular velocity and the time each segment reaches it, with front-foot plant as t = 0. Magnitude and timing are on separate charts because they are different scales — a second y-axis would make the comparison look like something it is not."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={chain.compliance >= 88 ? 'good' : chain.compliance >= 78 ? 'warning' : 'critical'}>
              {chain.compliance.toFixed(0)}% sequenced
            </Badge>
            <Sample n={throwing.length} of="throws" />
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <ChainPeaks data={chain.points} />
            <ChainTiming data={chain.points} />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-2">
              <StatTile id="sequenceOrder" value={chain.compliance} size="sm" />
              <StatTile id="transferLag" value={aggregate(throwing, 'transferLag')} size="sm" />
              <StatTile id="pelvisPeak" value={aggregate(throwing, 'pelvisPeak')} size="sm" />
              <StatTile id="trunkPeak" value={aggregate(throwing, 'trunkPeak')} size="sm" />
              <StatTile id="shoulderIrPeak" value={aggregate(throwing, 'shoulderIrPeak')} size="sm" />
              <StatTile id="elbowVarus" value={aggregate(throwing, 'elbowVarus')} size="sm" />
            </div>

            <div className="mt-4 rounded-sm border border-hairline bg-sunken p-3">
              <div className="eyebrow mb-2">Where the chain breaks</div>
              {breaks.size === 0 ? (
                <p className="text-[11px] text-ink-3">Every rep in view sequenced cleanly.</p>
              ) : (
                <div className="space-y-1">
                  {[...breaks.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([where, count]) => (
                      <DataRow
                        key={where}
                        label={where}
                        value={`${count}`}
                        unit={`reps · ${((count / throwing.length) * 100).toFixed(1)}%`}
                      />
                    ))}
                </div>
              )}
              <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
                Segments are ordered anatomically, pelvis through wrist. In high-effort throwing the two distal peaks
                are close enough to swap on a healthy rep — peak elbow extension can lead peak shoulder internal
                rotation by a few milliseconds — so a distal pair inside a 12&nbsp;ms tolerance is scored as compliant
                rather than as a violation. {sequenced.length} of {throwing.length} throws cleared it.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Release ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel
          eyebrow="Ball release"
          title="Release point and repeatability"
          note="Every release in the frontal plane, split by whether a rusher was home. Rings are the 1σ and 2σ radii about this athlete's own mean release point — the scatter figure is that radius, not a comparison with anyone else."
        >
          <ReleaseScatter points={releaseCloud.points} centre={releaseCloud.centre} sigma={releaseCloud.sigma} />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile id="releaseHeight" value={aggregate(throwing, 'releaseHeight')} size="sm" />
            <StatTile id="releaseConsistency" value={aggregate(throwing, 'releaseConsistency')} size="sm" />
            <StatTile id="timeToRelease" value={aggregate(throwing, 'timeToRelease')} size="sm" />
            <StatTile id="armSlot" value={aggregate(throwing, 'armSlot')} size="sm" />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
            Pressured release scatter{' '}
            <span className="num text-ink-2">
              {formatWithUnit('releaseConsistency', aggregate(records.filter(isPressured), 'releaseConsistency'))}
            </span>{' '}
            against{' '}
            <span className="num text-ink-2">
              {formatWithUnit('releaseConsistency', aggregate(records.filter((r) => !isPressured(r)), 'releaseConsistency'))}
            </span>{' '}
            clean — the gap between those two is what a rusher actually costs the throwing motion.
          </p>
        </Panel>

        <Panel
          eyebrow="Ball flight"
          title="Velocity, spin and spiral quality"
          note="Wobble is plotted against spiral efficiency because they are two views of the same thing: the share of spin that is not about the ball's long axis is the cone the nose traces in flight."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile id="velocity" value={aggregate(throwing, 'velocity')} size="sm" />
            <StatTile id="spinRate" value={aggregate(throwing, 'spinRate')} size="sm" />
            <StatTile id="spiralEfficiency" value={aggregate(throwing, 'spiralEfficiency')} size="sm" />
            <StatTile id="wobble" value={aggregate(throwing, 'wobble')} size="sm" />
          </div>
          <div className="mt-3">
            <ScatterWithFit
              points={throwing
                .filter((record) => record.flight)
                .slice(0, 420)
                .map((record) => ({ x: record.flight?.spiralEfficiencyPct ?? 0, y: record.flight?.wobbleDeg ?? 0 }))}
              xName="Spiral efficiency"
              yName="Wobble"
              xUnit="%"
              yUnit="°"
              height={190}
              colorIndex={2}
            />
          </div>
          <div className="mt-3">
            <VelocityByDepth records={throwing} />
          </div>
        </Panel>
      </div>

      {/* ── Footwork ────────────────────────────────────────────────────── */}
      <Panel
        eyebrow="Footwork"
        title="Drop time by play type, base and stride"
        note="Drop time is split by play type because a five-step and an RPO are different tasks and pooling them produces a number that describes neither."
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <GroupedBars
            data={drop}
            keys={[{ key: 'dropMs', name: 'Median drop time', colorIndex: 0 }]}
            unit="ms"
            precision={0}
            layout="vertical"
            height={230}
          />
          <div className="grid grid-cols-2 gap-2 self-start">
            <StatTile id="dropTime" value={aggregate(records, 'dropTime')} size="sm" sub="all play types" />
            <StatTile id="baseWidth" value={aggregate(records, 'baseWidth')} size="sm" />
            <StatTile id="strideLength" value={aggregate(throwing, 'strideLength')} size="sm" />
            <StatTile
              id="strideLength"
              value={medianOf(records.filter(isPressured), 'strideLength')}
              size="sm"
              sub="under pressure"
            />
          </div>
        </div>
      </Panel>

      {/* ── Asymmetry and risk ──────────────────────────────────────────── */}
      <Panel
        eyebrow="Asymmetry & load"
        title="Departures from this athlete's own baseline"
        note={`Nothing here is compared with a population norm. The recent window is scored against the same athlete's earlier reps in this season using a median and a scaled median absolute deviation, so a handful of off-platform throws cannot redefine what normal is. A metric needs ${MIN_BASELINE_REPS}+ baseline reps before it can be flagged at all.`}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-2">
            {flags.length === 0 ? (
              <div className="rounded-sm border border-hairline bg-sunken p-4 text-[11px] leading-relaxed text-ink-3">
                Nothing in the recent window sits far enough from this athlete's established range to flag. That is a
                result, not an absence of one — it means loading, slot, stride and sequencing have all held.
              </div>
            ) : (
              flags.map((flag) => {
                const def = metric(flag.metric);
                return (
                  <div key={flag.metric} className="rounded-sm border border-hairline bg-sunken p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: severityColor(flag.severity) }}
                        />
                        <div>
                          <div className="text-[12px] font-medium text-ink">{def.label}</div>
                          <div className="num mt-0.5 text-[10px] text-ink-3">
                            recent {flag.recentMedian.toFixed(def.precision)} {def.unit} · baseline{' '}
                            {flag.baselineMedian.toFixed(def.precision)} {def.unit} · n {flag.recentN}/{flag.baselineN}
                          </div>
                        </div>
                      </div>
                      <Badge tone={flag.severity === 'high' ? 'critical' : flag.severity === 'elevated' ? 'serious' : 'warning'}>
                        {Math.abs(flag.z).toFixed(1)} robust SD
                      </Badge>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-2">{flag.note}.</p>
                  </div>
                );
              })
            )}
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2">
              <StatTile id="leadLegBraking" value={aggregate(throwing, 'leadLegBraking')} size="sm" />
              <StatTile id="trailLegDrive" value={aggregate(throwing, 'trailLegDrive')} size="sm" />
              <StatTile id="pelvisAsymmetry" value={aggregate(throwing, 'pelvisAsymmetry')} size="sm" />
              <StatTile id="armStress" value={aggregate(throwing, 'armStress')} size="sm" />
            </div>
            {current && (
              <div className="mt-3 rounded-sm border border-hairline bg-sunken p-3">
                <div className="eyebrow mb-2">Arm stress index, week by week</div>
                <MiniLine
                  data={weeklySeries(seasonRecords, current.games, 'armStress').points.map((point) => ({
                    label: point.label,
                    value: point.value,
                  }))}
                  unit="N·m/mph"
                  precision={2}
                  colorIndex={1}
                  name="Arm stress"
                  height={140}
                />
                <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                  Elbow varus torque per mile per hour of ball speed. Read it against velocity: a rising ratio with flat
                  velocity means the same throw is costing more arm than it used to, which is the pattern that shows up
                  before a complaint does.
                </p>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

interface PhaseBand {
  phase: ThrowPhase;
  startMs: number;
  endMs: number;
  durationMs: number;
}

function meanPhases(records: readonly ThrowRecord[]): PhaseBand[] {
  return THROW_PHASES.map((phase) => {
    const starts: number[] = [];
    const ends: number[] = [];
    for (const record of records) {
      const window = record.phases?.find((entry) => entry.phase === phase);
      if (!window) continue;
      starts.push(window.startMs);
      ends.push(window.endMs);
    }
    const startMs = median(starts) ?? 0;
    const endMs = median(ends) ?? 0;
    return { phase, startMs, endMs, durationMs: Math.max(0, endMs - startMs) };
  });
}

/**
 * The phase strip. A hand-built timeline rather than a chart, because it is a
 * timeline and not a plot.
 *
 * It gets drawn twice: once across the whole rep, where the setup phase honestly
 * dominates because that is where the time goes, and once zoomed to the throwing
 * motion, where the phases that actually move the ball are only tens of
 * milliseconds long and would otherwise be slivers.
 */
function PhaseTimeline({ phases, plantMs, zoomed = false }: { phases: PhaseBand[]; plantMs: number; zoomed?: boolean }) {
  const origin = zoomed ? (phases[0]?.startMs ?? 0) : 0;
  const total = (phases[phases.length - 1]?.endMs ?? 1) - origin || 1;
  const releaseStart = phases.find((phase) => phase.phase === 'release')?.startMs ?? 0;
  const indexOffset = zoomed ? 3 : 0;
  return (
    <div>
      <div className="flex h-12 w-full overflow-hidden rounded-sm border border-hairline">
        {phases.map((phase, i) => {
          const index = i + indexOffset;
          const width = (phase.durationMs / total) * 100;
          return (
            <div
              key={phase.phase}
              title={`${PHASE_LABEL[phase.phase]} · ${Math.round(phase.startMs)}–${Math.round(phase.endMs)} ms`}
              className="relative grid place-items-center border-r border-void/70 last:border-0"
              style={{ width: `${width}%`, background: seriesColor(index % SERIES.length), opacity: 0.85 }}
            >
              {width > 7 && (
                <span className="num px-1 text-center text-[9px] font-medium leading-tight text-void">
                  {Math.round(phase.durationMs)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Markers sit on two rows so a plant and a release 150 ms apart do not
          print on top of each other at this scale. */}
      <div className="relative mt-1 h-11">
        <Marker label={zoomed ? 'front-foot plant' : 'snap'} ms={origin} total={total} origin={origin} />
        {!zoomed && <Marker label="front-foot plant" ms={plantMs} total={total} origin={origin} row={1} />}
        <Marker label="release" ms={releaseStart} total={total} origin={origin} />
        <Marker
          label={`+${Math.round(total)} ms`}
          ms={origin + total}
          total={total}
          origin={origin}
          align="right"
          row={1}
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {phases.map((phase, i) => (
          <span key={phase.phase} className="flex items-center gap-1.5 text-[10px] text-ink-2">
            <span className="h-2 w-2 rounded-[1px]" style={{ background: seriesColor((i + indexOffset) % SERIES.length) }} />
            {PHASE_LABEL[phase.phase]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Marker({
  label,
  ms,
  total,
  origin,
  align = 'left',
  row = 0,
}: {
  label: string;
  ms: number;
  total: number;
  origin: number;
  align?: 'left' | 'right';
  row?: 0 | 1;
}) {
  const left = Math.min(100, Math.max(0, ((ms - origin) / total) * 100));
  return (
    <div
      className="absolute top-0"
      style={{ left: `${left}%`, transform: align === 'right' ? 'translateX(-100%)' : undefined }}
    >
      <div className="w-px bg-hairline-strong" style={{ height: row === 0 ? 8 : 20 }} />
      <div className="num mt-0.5 whitespace-nowrap text-[9px] text-ink-3">{label}</div>
    </div>
  );
}

function chainSummary(records: readonly ThrowRecord[]) {
  const points = KINETIC_SEGMENTS.map((segment) => {
    const peaks = records
      .map((record) => record.kinetics.find((k) => k.segment === segment))
      .filter((k): k is NonNullable<typeof k> => Boolean(k));
    return {
      segment: SEGMENT_LABEL[segment],
      peak: Math.round(median(peaks.map((k) => k.peakAngularVelocityDegPerSec)) ?? 0),
      timing: Math.round((median(peaks.map((k) => k.timeToPeakMs)) ?? 0) * 10) / 10,
      gap: null as number | null,
    };
  });
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous && current) current.gap = Math.round((current.timing - previous.timing) * 10) / 10;
  }
  const compliance = aggregate(records, 'sequenceOrder') ?? 0;
  const lag = mean(records.map((record) => transferLagMs(record)).filter((v): v is number => v !== null));
  return { points, compliance, lag };
}

function releasePoints(records: readonly ThrowRecord[]) {
  const points = records
    .filter((record) => record.release !== null)
    .slice(0, 460)
    .map((record) => ({
      lateral: (record.release as NonNullable<typeof record.release>).releaseLateralIn,
      height: (record.release as NonNullable<typeof record.release>).releaseHeightIn,
      pressure: record.context.pressure,
    }));
  const lateralMean = mean(points.map((p) => p.lateral)) ?? 0;
  const heightMean = mean(points.map((p) => p.height)) ?? 0;
  const lateralRms = rmsAbout(points.map((p) => p.lateral), lateralMean) ?? 0;
  const heightRms = rmsAbout(points.map((p) => p.height), heightMean) ?? 0;
  return {
    points,
    centre: { lateral: lateralMean, height: heightMean },
    sigma: Math.max(0.4, (lateralRms + heightRms) / 2),
  };
}

const PLAY_LABEL: Record<string, string> = {
  'under-center-3': 'UC · 3-step',
  'under-center-5': 'UC · 5-step',
  'under-center-7': 'UC · 7-step',
  'shotgun-quick': 'Gun · quick',
  'shotgun-5': 'Gun · 5-step',
  'play-action': 'Play-action',
  rpo: 'RPO',
  screen: 'Screen',
};

function dropByPlayType(records: readonly ThrowRecord[]) {
  const groups = new Map<string, number[]>();
  for (const record of records) {
    const list = groups.get(record.context.playType) ?? [];
    list.push(record.footwork.dropTimeMs);
    groups.set(record.context.playType, list);
  }
  return [...groups.entries()]
    .filter(([, values]) => values.length >= 6)
    .map(([playType, values]) => ({
      label: PLAY_LABEL[playType] ?? playType,
      dropMs: Math.round(median(values) ?? 0),
      reps: values.length,
    }))
    .sort((a, b) => a.dropMs - b.dropMs);
}

function histogram(values: number[], binCount: number, band?: [number, number]) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width;
    return {
      label: start.toFixed(1),
      bin: Math.round((start + width / 2) * 10) / 10,
      count: 0,
      inBand: band ? start + width / 2 >= band[0] && start + width / 2 <= band[1] : true,
    };
  });
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / width)));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }
  return bins;
}

function DistributionFooter({ records, id }: { records: readonly ThrowRecord[]; id: MetricId }) {
  const stats = summarize(repValues(records, id));
  const split = splitBy(records, isPressured, id);
  const def = metric(id);
  if (!stats) return null;
  return (
    <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
      <DataRow label="Median" value={stats.median.toFixed(def.precision)} unit={def.unit} />
      <DataRow label="10th–90th percentile" value={`${stats.p10.toFixed(def.precision)}–${stats.p90.toFixed(def.precision)}`} unit={def.unit} />
      <DataRow label="Spread (SD)" value={stats.sd === null ? '—' : stats.sd.toFixed(def.precision)} unit={def.unit} />
      <DataRow
        label="Pressured vs clean"
        value={split.delta === null ? '—' : `${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(def.precision)}`}
        unit={`${def.unit}${split.effect !== null ? ` · d ${split.effect.toFixed(2)}` : ''}`}
        tone={split.reliable ? undefined : 'var(--color-ink-3)'}
      />
    </div>
  );
}

/** Velocity against throw depth — the covariate that makes a raw velocity figure meaningful. */
function VelocityByDepth({ records }: { records: readonly ThrowRecord[] }) {
  const buckets = [
    { label: 'Behind LOS', test: (y: number) => y < 0 },
    { label: '0–9 yd', test: (y: number) => y >= 0 && y < 10 },
    { label: '10–19 yd', test: (y: number) => y >= 10 && y < 20 },
    { label: '20+ yd', test: (y: number) => y >= 20 },
  ];
  const data = buckets
    .map((bucket) => {
      const values = records
        .filter((record) => record.flight && bucket.test(record.flight.airYards))
        .map((record) => record.flight?.velocityMph ?? 0);
      return { label: bucket.label, velocity: Math.round((median(values) ?? 0) * 10) / 10, reps: values.length };
    })
    .filter((row) => row.reps >= 5);
  return (
    <div>
      <div className="eyebrow mb-2">Velocity by throw depth · mph</div>
      <DotPlot
        rows={data.map((row) => ({ label: row.label, value: row.velocity }))}
        unit="mph"
        precision={1}
        height={160}
        name="Median velocity"
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-3">
        Drawn as points rather than bars: every value sits between 50 and 60 mph, and bars from a zero baseline would
        make four different throws look identical.
      </p>
    </div>
  );
}
