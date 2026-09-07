/**
 * Stress performance and the training work behind it.
 *
 * Everything in this module is documented performance science: slow paced
 * breathing and its measurable effect on vagally mediated heart-rate
 * variability, graded exposure to the stressor being trained for, rapid-exposure
 * perceptual drilling with response-time scoring, and situational decision
 * charting. It is the same literature a university sports-psychology programme
 * or a professional performance department works from.
 *
 * The bar it is held to here is the bar the rest of the app uses: a protocol
 * only earns space if its effect can be measured, and it is shown against a
 * control rather than on its own.
 */

import { useMemo, useState } from 'react';
import type { ProtocolSession, RecognitionSession, ThrowRecord } from '../domain/types';
import { useStore } from '../state/store';
import { isPressured } from '../analysis/aggregate';
import { composure, situationalByState, situationalJudgement } from '../analysis/splits';
import { weeklySeries } from '../analysis/trends';
import { linearFit, mean, median } from '../lib/stats';
import { formatDownDistance, formatPct } from '../lib/format';
import { STATUS } from '../lib/palette';
import { Badge, DataRow, Empty, Panel, Sample, SectionTitle, Segmented, StatTile } from '../components/ui';
import { GroupedBars, MiniLine, ScatterWithFit } from '../components/charts';

const PROTOCOL_LABEL: Record<string, string> = {
  'box-4-4-4-4': 'Box breathing 4-4-4-4',
  'coherent-5.5': 'Coherent breathing 5.5 br/min',
  'physiological-sigh': 'Physiological sigh',
};

export function TacticalView() {
  const { records, seasonRecords, current } = useStore();
  const [category, setCategory] = useState<'shell' | 'pressure' | 'leverage'>('shell');

  const protocols = current?.protocols ?? [];
  const recognition = current?.recognition ?? [];
  const comp = useMemo(() => composure(records), [records]);
  const states = useMemo(() => situationalByState(records), [records]);

  const hrv = useMemo(() => protocolSummary(protocols), [protocols]);
  const recogSeries = useMemo(
    () => recognitionByWeek(recognition.filter((session) => session.category === category)),
    [recognition, category],
  );
  const transfer = useMemo(
    () => (current ? transferCheck(recognition, seasonRecords, current.games) : null),
    [recognition, seasonRecords, current],
  );

  if (records.length === 0) return <Empty>No reps in scope.</Empty>;

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Scope"
        title="What this module is, and what it is not"
        note="Public-domain, peer-reviewed human-performance practice — the same material taught in sports-psychology programmes and used in professional performance departments."
      >
        <p className="max-w-[110ch] text-[11px] leading-relaxed text-ink-2">
          Four practices are tracked here because each of them produces a number that can be checked. Slow paced
          breathing has a well-established acute effect on vagally mediated heart-rate variability, so it is measured
          with a chest strap and scored against a control block rather than assumed. Graded exposure — building
          tolerance by rehearsing under progressively closer approximations of the real stressor — is the standard
          structure behind pressure practice, so it is scored by the gap between pressured and clean performance rather
          than by how hard the session felt. Rapid-exposure perceptual drilling is scored by response time and accuracy
          on flashed pre-snap pictures. Situational decision quality is charted against down, distance, field position,
          clock and score with a rule engine whose rules are printed beside the score. None of this is proprietary and
          none of it is mystique; it is training with a measurement attached.
        </p>
      </Panel>

      {/* ── Breathing protocols ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel
          eyebrow="Autonomic regulation"
          title="Paced breathing, measured"
          note="RMSSD from a chest strap at 1000 Hz: seated baseline against the final two minutes of the protocol. Between-athlete RMSSD comparison is not meaningful; the within-athlete change is."
          actions={<Sample n={protocols.length} of="sessions" />}
        >
          {protocols.length === 0 ? (
            <Empty>No protocol sessions logged for this season.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile id="hrvRmssd" value={hrv.preMedian} size="sm" sub="pre-protocol" />
                <StatTile id="hrvRmssd" value={hrv.postMedian} size="sm" sub="during protocol" />
                <div className="rounded-sm border border-hairline bg-panel px-3 py-3">
                  <span className="eyebrow">Δ RMSSD</span>
                  <div className="num mt-2 text-[28px] leading-none" style={{ color: STATUS.good }}>
                    +{hrv.gainPct.toFixed(0)}
                  </div>
                  <div className="num mt-1.5 text-[10px] text-ink-3">% within session</div>
                </div>
                <div className="rounded-sm border border-hairline bg-panel px-3 py-3">
                  <span className="eyebrow">Δ HR</span>
                  <div className="num mt-2 text-[28px] leading-none text-ink">{hrv.hrDelta.toFixed(1)}</div>
                  <div className="num mt-1.5 text-[10px] text-ink-3">bpm</div>
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle note="each session, protocol duration against the RMSSD change it produced">
                  Dose–response
                </SectionTitle>
                <ScatterWithFit
                  points={protocols.map((session) => ({
                    x: session.minutes,
                    y: ((session.postRmssdMs - session.preRmssdMs) / session.preRmssdMs) * 100,
                  }))}
                  xName="Protocol duration"
                  yName="RMSSD change"
                  xUnit="min"
                  yUnit="%"
                  fit={hrv.doseFit}
                  height={190}
                  colorIndex={2}
                />
              </div>

              <div className="mt-4">
                <SectionTitle note="20-trial pressured decision block run immediately after the protocol, against a matched control block on a day without it">
                  Does it reach the decision?
                </SectionTitle>
                <GroupedBars
                  data={byProtocol(protocols)}
                  keys={[
                    { key: 'post', name: 'After protocol', colorIndex: 0 },
                    { key: 'control', name: 'Control day', colorIndex: 1 },
                  ]}
                  unit="%"
                  precision={1}
                  layout="vertical"
                  height={170}
                />
                <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                  The autonomic effect is large and reliable; the decision-accuracy effect is small and noisy, and it is
                  shown that way on purpose. A protocol that moves HRV by thirty per cent and decision accuracy by four
                  points is still worth doing — it is just not worth overselling.
                </p>
              </div>
            </>
          )}
        </Panel>

        {/* ── Stress inoculation ───────────────────────────────────────── */}
        <Panel
          eyebrow="Graded exposure"
          title="Composure: what changes when the rush arrives"
          note="Four measured pressured-minus-clean deltas, each scaled onto 0–100 across a stated range and averaged with equal weight. The ranges are printed below rather than hidden in the index."
          actions={
            <Badge tone={comp.score >= 70 ? 'good' : comp.score >= 55 ? 'warning' : 'critical'}>
              {comp.reliable ? `${comp.score}/100` : 'thin sample'}
            </Badge>
          }
        >
          <div className="space-y-2">
            {comp.components.map((component) => (
              <div key={component.label} className="rounded-sm border border-hairline bg-sunken p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-ink-2">{component.label}</span>
                  <span className="num text-[12px] text-ink">
                    {component.delta > 0 ? '+' : '−'}
                    {Math.abs(component.delta).toFixed(1)}
                    <span className="ml-1 text-[10px] text-ink-3">{component.unit}</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${component.score}%`,
                      background: component.score >= 70 ? STATUS.good : component.score >= 45 ? '#4cc9ff' : STATUS.serious,
                    }}
                  />
                </div>
                <div className="num mt-1 text-[10px] text-ink-3">{component.score.toFixed(0)} / 100</div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-sm border border-hairline bg-sunken p-3">
            <div className="eyebrow mb-2">Scaling ranges</div>
            <div className="space-y-0.5">
              <DataRow label="On-target rate" value="−30 pp → 0 · 0 pp → 100" />
              <DataRow label="Decision latency" value="+180 ms → 0 · 0 ms → 100" />
              <DataRow label="Release scatter" value="+2.5 in → 0 · 0 in → 100" />
              <DataRow label="Loop time" value="+700 ms → 0 · 0 ms → 100" />
            </div>
          </div>

          {current && (
            <div className="mt-4">
              <div className="eyebrow mb-2">Pressured on-target rate by week</div>
              <MiniLine
                data={weeklySeries(seasonRecords.filter(isPressured), current.games, 'onTargetRate').points.map((point) => ({
                  label: point.label,
                  value: point.value,
                }))}
                unit="%"
                precision={1}
                colorIndex={1}
                name="Pressured on-target"
                height={140}
              />
              <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                Graded exposure work is judged on this line, not on how the session looked. Practice that gets harder
                without this line moving is practice that has become punishment.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Recognition drilling ────────────────────────────────────────── */}
      <Panel
        eyebrow="Perceptual training"
        title="Rapid-exposure recognition drilling"
        note="A pre-snap picture flashed for a fixed exposure, then answered. Scored on correct-trial response time and accuracy; error trials have their own, faster distribution and are excluded from the response-time figure."
        actions={
          <Segmented
            label="Drill"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'shell' as const, label: 'Shell' },
              { value: 'pressure' as const, label: 'Pressure' },
              { value: 'leverage' as const, label: 'Leverage' },
            ]}
          />
        }
      >
        {recognition.length === 0 ? (
          <Empty>No recognition sessions logged for this season.</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <MiniLine
                data={recogSeries.map((row) => ({ label: `W${row.week}`, value: row.rt }))}
                unit="ms"
                precision={0}
                colorIndex={0}
                name="Correct-trial RT"
                height={190}
              />
              <div className="mt-2">
                <div className="eyebrow mb-2">Accuracy by week</div>
                <MiniLine
                  data={recogSeries.map((row) => ({ label: `W${row.week}`, value: row.accuracy }))}
                  unit="%"
                  precision={1}
                  colorIndex={2}
                  name="Accuracy"
                  height={140}
                />
              </div>
            </div>

            <div>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  id="recognitionRt"
                  value={median(recogSeries.map((row) => row.rt))}
                  size="sm"
                  sub={`${category} drill`}
                />
                <div className="rounded-sm border border-hairline bg-panel px-3 py-3">
                  <span className="eyebrow">Accuracy</span>
                  <div className="num mt-2 text-[20px] leading-none text-ink">
                    {formatPct(median(recogSeries.map((row) => row.accuracy)))}
                  </div>
                  <div className="num mt-1.5 text-[10px] text-ink-3">correct trials</div>
                </div>
              </div>

              <div className="mt-3 rounded-sm border border-hairline bg-sunken p-3">
                <div className="eyebrow mb-2">Response time by exposure duration</div>
                <div className="space-y-0.5">
                  {byExposure(recognition.filter((session) => session.category === category)).map((row) => (
                    <DataRow key={row.exposure} label={`${row.exposure} ms flash`} value={`${row.rt.toFixed(0)}`} unit={`ms · ${row.accuracy.toFixed(1)}% correct`} />
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
                  Shorter exposures stay harder, which is the point: the drill is calibrated so accuracy sits below
                  ceiling. A drill everyone passes has stopped measuring anything.
                </p>
              </div>

              {transfer && (
                <div className="mt-3 rounded-sm border border-hairline bg-sunken p-3">
                  <div className="eyebrow mb-2">Transfer check</div>
                  <ScatterWithFit
                    points={transfer.points}
                    xName="Drill RT"
                    yName="On-field observe span"
                    xUnit="ms"
                    yUnit="ms"
                    fit={transfer.fit}
                    height={170}
                    colorIndex={3}
                  />
                  <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                    Each point is one week: mean drill response time against the median on-field observe span for the
                    same week.{' '}
                    {transfer.fit
                      ? `Slope ${transfer.fit.slope.toFixed(2)} ms of observe time per ms of drill time, r² ${transfer.fit.r2.toFixed(2)} across ${transfer.fit.n} weeks — ${transfer.fit.r2 >= 0.35 ? 'a relationship worth acting on' : 'too weak to claim transfer from'}.`
                      : 'Not enough weeks to fit.'}{' '}
                    Correlation across seventeen weeks is not causation, and the drill earns its slot in the schedule
                    only while this line has a slope.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* ── Situational decision quality ────────────────────────────────── */}
      <Panel
        eyebrow="Situational awareness"
        title="Decision quality against game state"
        note="A transparent rule engine, not a model. Each rule is a statement a coordinator would make out loud, and every rep below can be expanded into the rules that produced its score."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <GroupedBars
              data={states.map((state) => ({ label: state.state, score: state.score, reps: state.reps }))}
              keys={[{ key: 'score', name: 'Situational decision score', colorIndex: 0 }]}
              precision={0}
              layout="vertical"
              height={240}
            />
            <div className="mt-2 space-y-0.5">
              {states.map((state) => (
                <DataRow
                  key={state.state}
                  label={state.state}
                  value={state.score === null ? 'below floor' : state.score.toFixed(0)}
                  unit={`${state.reps} reps`}
                />
              ))}
            </div>
          </div>

          <RepLedger records={records} />
        </div>
      </Panel>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function protocolSummary(sessions: readonly ProtocolSession[]) {
  const pre = sessions.map((session) => session.preRmssdMs);
  const post = sessions.map((session) => session.postRmssdMs);
  const gains = sessions.map((session) => ((session.postRmssdMs - session.preRmssdMs) / session.preRmssdMs) * 100);
  return {
    preMedian: median(pre),
    postMedian: median(post),
    gainPct: median(gains) ?? 0,
    hrDelta: (mean(sessions.map((session) => session.postHrBpm - session.preHrBpm)) ?? 0),
    doseFit: linearFit(sessions.map((session) => session.minutes), gains),
  };
}

function byProtocol(sessions: readonly ProtocolSession[]) {
  const groups = new Map<string, ProtocolSession[]>();
  for (const session of sessions) {
    const list = groups.get(session.protocol) ?? [];
    list.push(session);
    groups.set(session.protocol, list);
  }
  return [...groups.entries()].map(([protocol, list]) => ({
    label: PROTOCOL_LABEL[protocol] ?? protocol,
    post: Math.round((mean(list.map((s) => s.postProtocolAccuracyPct)) ?? 0) * 10) / 10,
    control: Math.round((mean(list.map((s) => s.controlAccuracyPct)) ?? 0) * 10) / 10,
    sessions: list.length,
  }));
}

function recognitionByWeek(sessions: readonly RecognitionSession[]) {
  return [...sessions]
    .sort((a, b) => a.week - b.week)
    .map((session) => ({
      week: session.week,
      rt: session.meanRtMs,
      accuracy: (session.correct / session.trials) * 100,
      exposure: session.exposureMs,
    }));
}

function byExposure(sessions: readonly RecognitionSession[]) {
  const groups = new Map<number, RecognitionSession[]>();
  for (const session of sessions) {
    const list = groups.get(session.exposureMs) ?? [];
    list.push(session);
    groups.set(session.exposureMs, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([exposure, list]) => ({
      exposure,
      rt: mean(list.map((s) => s.meanRtMs)) ?? 0,
      accuracy: (mean(list.map((s) => (s.correct / s.trials) * 100)) ?? 0),
    }));
}

/**
 * Whether the drilling reaches the field: weekly drill response time against the
 * same week's median on-field observe span.
 */
function transferCheck(
  sessions: readonly RecognitionSession[],
  records: readonly ThrowRecord[],
  games: readonly { id: string; week: number }[],
) {
  const observeByWeek = weeklySeries(records, games as never, 'oodaObserve');
  const drillByWeek = new Map<number, number[]>();
  for (const session of sessions) {
    const list = drillByWeek.get(session.week) ?? [];
    list.push(session.meanRtMs);
    drillByWeek.set(session.week, list);
  }
  const points: { x: number; y: number }[] = [];
  for (const point of observeByWeek.points) {
    const drills = drillByWeek.get(point.x);
    if (!drills || point.value === null) continue;
    points.push({ x: Math.round(mean(drills) ?? 0), y: Math.round(point.value) });
  }
  return { points, fit: linearFit(points.map((p) => p.x), points.map((p) => p.y)) };
}

/**
 * The rule ledger: individual reps with the rules that scored them. This is the
 * panel that makes the situational score arguable, which is the only thing that
 * makes it useful in a meeting.
 */
function RepLedger({ records }: { records: readonly ThrowRecord[] }) {
  const scored = useMemo(
    () =>
      records
        .map((record) => ({ record, judgement: situationalJudgement(record.context, record.outcome) }))
        .sort((a, b) => a.judgement.score - b.judgement.score)
        .slice(0, 8),
    [records],
  );

  return (
    <div className="rounded-sm border border-hairline bg-sunken p-3">
      <div className="eyebrow mb-2">Lowest-scoring decisions in scope</div>
      <div className="space-y-2">
        {scored.map(({ record, judgement }) => (
          <div key={record.id} className="border-b border-hairline/60 pb-2 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="num text-[11px] text-ink-2">
                Q{record.context.quarter} · {formatDownDistance(record.context.down, record.context.distance)} ·{' '}
                {record.context.yardsToGoal} yd out · {record.context.coveragePlayed}
                {record.context.pressure ? ' · pressured' : ''}
              </span>
              <span className="num text-[12px]" style={{ color: judgement.score < 45 ? STATUS.critical : STATUS.warning }}>
                {judgement.score}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {judgement.reasons.map((reason) => (
                <span key={reason.rule} className="text-[10px] text-ink-3">
                  {reason.rule}{' '}
                  <span className="num" style={{ color: reason.delta > 0 ? STATUS.good : STATUS.serious }}>
                    {reason.delta > 0 ? '+' : '−'}
                    {Math.abs(reason.delta)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
        Season situational score{' '}
        <span className="num text-ink-2">
          {(mean(records.map((r) => situationalJudgement(r.context, r.outcome).score)) ?? 0).toFixed(1)}
        </span>{' '}
        across {records.length} dropbacks. Rules are additive from a base of 70; a rep with no rule firing scores 70 by
        construction, which is the honest way to say "nothing notable happened".
      </p>
    </div>
  );
}
