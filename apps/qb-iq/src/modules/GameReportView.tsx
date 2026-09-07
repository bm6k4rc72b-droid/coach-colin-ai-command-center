/**
 * The per-game report.
 *
 * Auto-generated from the rep records for one game, laid out the way a scouting
 * report is laid out and formatted to print on letter paper without further
 * work. The findings block at the bottom is written by rules that read the same
 * numbers shown above them; each finding names the figures it compared and the
 * sample it compared them on.
 */

import { useMemo, useState } from 'react';
import { metric } from '../domain/metrics';
import type { ThrowRecord } from '../domain/types';
import { useStore } from '../state/store';
import { aggregate, isChaos, isPressured, isThrow } from '../analysis/aggregate';
import { buildGameReport, duressRecords, gameSuccessRate } from '../analysis/report';
import { situationalJudgement } from '../analysis/splits';
import { median } from '../lib/stats';
import { formatDate, formatDownDistance, formatPct, formatValue } from '../lib/format';
import { OODA_RAMP, STATUS } from '../lib/palette';
import { Badge, DataRow, Empty, MetricInfo, Panel, Sample, SectionTitle } from '../components/ui';
import { GroupedBars, OodaStack } from '../components/charts';

export function GameReportView() {
  const { current, seasonRecords, minConfidence } = useStore();
  const [gameId, setGameId] = useState<string | null>(null);

  const games = current?.games ?? [];
  const selected = useMemo(() => {
    const id = gameId ?? games[games.length - 1]?.id ?? null;
    return games.find((game) => game.id === id) ?? null;
  }, [gameId, games]);

  const gameRecords = useMemo(
    () => (selected ? seasonRecords.filter((record) => record.context.gameId === selected.id) : []),
    [seasonRecords, selected],
  );

  const report = useMemo(
    () => (selected ? buildGameReport(selected, gameRecords, seasonRecords) : null),
    [selected, gameRecords, seasonRecords],
  );

  if (!current || !selected || !report) return <Empty>No games in this season.</Empty>;

  const duress = duressRecords(gameRecords);

  return (
    <div className="space-y-4">
      {/* Game picker — never printed. */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Game</span>
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => setGameId(game.id)}
            className={`num rounded-sm border px-2.5 py-1.5 text-[10px] transition-colors ${
              game.id === selected.id
                ? 'border-accent bg-accent text-void'
                : 'border-hairline text-ink-3 hover:border-hairline-strong hover:text-ink'
            }`}
          >
            W{game.week} {game.home ? 'vs' : '@'} {game.opponent}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-sm border border-accent px-3 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent hover:text-void"
        >
          Print / save as PDF
        </button>
      </div>

      {/* ── The report itself ───────────────────────────────────────────── */}
      <article className="space-y-4">
        <ReportHeader
          report={report}
          minConfidence={minConfidence}
          successRate={gameSuccessRate(gameRecords)}
        />

        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Panel eyebrow="Headline" title="This game against the rest of the season">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th className="eyebrow py-2 pr-3 font-normal">Metric</th>
                    <th className="eyebrow py-2 pr-3 text-right font-normal">This game</th>
                    <th className="eyebrow py-2 pr-3 text-right font-normal">Season, other games</th>
                    <th className="eyebrow py-2 text-right font-normal">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.headlines.map((row) => {
                    const def = metric(row.id);
                    const delta = row.value !== null && row.seasonValue !== null ? row.value - row.seasonValue : null;
                    const good =
                      delta === null || def.better === 'band' ? null : def.better === 'higher' ? delta > 0 : delta < 0;
                    return (
                      <tr key={row.id} className="border-b border-hairline/50 last:border-0">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1.5 text-[11px] text-ink-2 print-ink-2">
                            {def.label}
                            <MetricInfo id={row.id} />
                          </span>
                        </td>
                        <td className="num print-ink py-2 pr-3 text-right text-[13px]">
                          {formatValue(row.id, row.value)}
                          <span className="ml-1 text-[10px] text-ink-3">{def.unit}</span>
                        </td>
                        <td className="num py-2 pr-3 text-right text-[12px] text-ink-2 print-ink-2">
                          {formatValue(row.id, row.seasonValue)}
                        </td>
                        <td
                          className="num py-2 text-right text-[12px]"
                          style={{ color: good === null ? undefined : good ? STATUS.good : STATUS.serious }}
                        >
                          {delta === null ? '—' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(def.precision)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            eyebrow="Cognitive load"
            title="What the call sheet asked for"
            note="Live variables per rep, and what the high-load calls returned."
          >
            <div className="space-y-0.5">
              <DataRow
                label="Median live variables per dropback"
                value={formatValue('workingMemoryLoad', report.cognitiveLoad.meanLoad)}
                unit="vars"
                info="workingMemoryLoad"
              />
              <DataRow
                label="On-target, 5+ live variables"
                value={formatValue('onTargetRate', report.cognitiveLoad.highLoadOnTarget)}
                unit={`% · ${report.cognitiveLoad.highLoadReps} reps`}
              />
              <DataRow
                label="On-target, ≤3 live variables"
                value={formatValue('onTargetRate', report.cognitiveLoad.lowLoadOnTarget)}
                unit="%"
              />
              <DataRow
                label="Load penalty"
                value={
                  report.cognitiveLoad.highLoadOnTarget !== null && report.cognitiveLoad.lowLoadOnTarget !== null
                    ? `${(report.cognitiveLoad.lowLoadOnTarget - report.cognitiveLoad.highLoadOnTarget).toFixed(1)}`
                    : '—'
                }
                unit="points"
              />
              <DataRow label="Reps facing a post-snap rotation" value={`${gameRecords.filter((r) => r.cognition.postSnapRotation).length}`} unit={`of ${gameRecords.length}`} />
              <DataRow label="Coverage ID accuracy" value={formatValue('coverageIdAccuracy', aggregate(gameRecords, 'coverageIdAccuracy'))} unit="%" info="coverageIdAccuracy" />
            </div>

            <div className="mt-4">
              <SectionTitle note="median ms per span">OODA partition</SectionTitle>
              <OodaStack
                data={[
                  buildStack('This game', gameRecords.filter(isThrow)),
                  buildStack('Season', seasonRecords.filter((r) => r.context.gameId !== selected.id && isThrow(r))),
                ]}
                ramp={OODA_RAMP}
                height={130}
              />
            </div>
          </Panel>
        </div>

        {/* ── Under duress ─────────────────────────────────────────────── */}
        <Panel
          eyebrow="Under duress"
          title="Pressure and off-structure snaps, isolated"
          note="Every metric below is computed on the pressured reps alone and shown beside the clean-pocket figure from the same game. The split is charted from tracking, not inferred from the result."
          actions={<Sample n={duress.length} of="reps" />}
        >
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th className="eyebrow py-2 pr-3 font-normal">Metric</th>
                    <th className="eyebrow py-2 pr-3 text-right font-normal">Clean</th>
                    <th className="eyebrow py-2 pr-3 text-right font-normal">Pressured</th>
                    <th className="eyebrow py-2 pr-3 text-right font-normal">Δ</th>
                    <th className="eyebrow py-2 text-right font-normal">n</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pressure.map((split) => {
                    const def = metric(split.metric);
                    return (
                      <tr key={split.metric} className="border-b border-hairline/50 last:border-0">
                        <td className="py-2 pr-3 text-[11px] text-ink-2 print-ink-2">{def.label}</td>
                        <td className="num py-2 pr-3 text-right text-[12px]">{formatValue(split.metric, split.b)}</td>
                        <td className="num py-2 pr-3 text-right text-[12px]">{formatValue(split.metric, split.a)}</td>
                        <td className="num py-2 pr-3 text-right text-[12px] text-ink-2">
                          {split.delta === null ? '—' : `${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(def.precision)}`}
                        </td>
                        <td className="num py-2 text-right text-[11px] text-ink-3">
                          {split.nA}/{split.nB}
                          {!split.reliable && <span className="ml-1.5">·thin</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <SectionTitle note="fourth quarter against the first three">Fatigue markers</SectionTitle>
              <div className="space-y-0.5">
                {report.fatigue.map((split) => {
                  const def = metric(split.metric);
                  return (
                    <DataRow
                      key={split.metric}
                      label={def.label}
                      value={
                        split.delta === null
                          ? '—'
                          : `${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(def.precision)}`
                      }
                      unit={`${def.unit} · n ${split.nA}/${split.nB}`}
                      tone={
                        split.delta === null || def.better === 'band'
                          ? undefined
                          : (def.better === 'higher') === split.delta > 0
                            ? STATUS.good
                            : STATUS.serious
                      }
                      info={split.metric}
                    />
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-ink-3 print-ink-2">
                Late-game drop-off is only meaningful where the fourth-quarter sample supports it; splits marked thin
                are printed so the absence is visible, not so the number is used.
              </p>

              <div className="mt-4">
                <SectionTitle>Situational decision score</SectionTitle>
                {report.situational.byState.some((state) => state.score !== null) ? (
                  <GroupedBars
                    data={report.situational.byState.map((state) => ({ label: state.state, score: state.score }))}
                    keys={[{ key: 'score', name: 'Score', colorIndex: 0 }]}
                    precision={0}
                    layout="vertical"
                    height={190}
                  />
                ) : (
                  <p className="rounded-sm border border-hairline bg-sunken px-3 py-4 text-[11px] leading-relaxed text-ink-3 print-ink-2">
                    No game state in this game reached the ten-rep floor, so none is scored. The season view has the
                    sample this question needs.
                  </p>
                )}
                <div className="mt-2 space-y-0.5">
                  {report.situational.byState.map((state) => (
                    <DataRow
                      key={state.state}
                      label={state.state}
                      value={state.score === null ? 'below floor' : state.score.toFixed(0)}
                      unit={`${state.reps} reps`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-3 print-ink-2">
                  A single game rarely puts ten reps into every game state, and states that fall short are left blank
                  rather than scored on four snaps.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        {/* ── Findings ─────────────────────────────────────────────────── */}
        <Panel
          eyebrow="Findings"
          title="Generated from the numbers above"
          note="Each line is produced by a rule that required a rep floor and states the two figures it compared. No line is written that cannot name a number."
        >
          <ol className="space-y-2">
            {report.findings.map((finding, index) => (
              <li key={index} className="flex gap-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      finding.severity === 'attention'
                        ? STATUS.serious
                        : finding.severity === 'positive'
                          ? STATUS.good
                          : '#64707e',
                  }}
                />
                <p className="text-[12px] leading-relaxed text-ink-2 print-ink">{finding.text}</p>
              </li>
            ))}
            {report.findings.length === 0 && (
              <li className="text-[11px] text-ink-3">
                No rule cleared its threshold on this game. Everything measured sat inside the season pattern.
              </li>
            )}
          </ol>
        </Panel>

        {/* ── Rep ledger ───────────────────────────────────────────────── */}
        <Panel
          eyebrow="Appendix"
          title={`Rep ledger · ${gameRecords.length} dropbacks`}
          note="Every charted rep in the game, in order. This is the layer a coach argues with, and it is deliberately in the report rather than behind a click."
          padded={false}
        >
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-hairline">
                  {['#', 'Q', 'Dn & dist', 'Play', 'Shown', 'Played', 'Pocket', 'Loop', 'Dec', 'TTR', 'Velo', 'Result', 'Sit'].map(
                    (heading) => (
                      <th key={heading} className="eyebrow px-2 py-2 font-normal">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {gameRecords.map((record, index) => {
                  const judgement = situationalJudgement(record.context, record.outcome);
                  return (
                    <tr key={record.id} className="border-b border-hairline/40 hover:bg-raised/60">
                      <td className="num px-2 py-1.5 text-[10px] text-ink-3">{index + 1}</td>
                      <td className="num px-2 py-1.5 text-[10px] text-ink-3">{record.context.quarter}</td>
                      <td className="num px-2 py-1.5 text-[11px] text-ink-2">
                        {formatDownDistance(record.context.down, record.context.distance)}
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-ink-2">{record.context.playType}</td>
                      <td className="px-2 py-1.5 text-[11px] text-ink-3">{record.context.coverageShown}</td>
                      <td className="px-2 py-1.5 text-[11px] text-ink-2">
                        {record.context.coveragePlayed}
                        {record.cognition.postSnapRotation && <span className="ml-1 text-[9px] text-ink-3">rot</span>}
                      </td>
                      <td className="px-2 py-1.5 text-[11px]">
                        <span style={{ color: isChaos(record) ? STATUS.serious : isPressured(record) ? STATUS.warning : undefined }}>
                          {record.context.pocketState}
                        </span>
                      </td>
                      <td className="num px-2 py-1.5 text-[11px] text-ink-2">{record.ooda ? record.ooda.loopMs : '—'}</td>
                      <td className="num px-2 py-1.5 text-[11px] text-ink-2">{record.cognition.decisionLatencyMs}</td>
                      <td className="num px-2 py-1.5 text-[11px] text-ink-2">
                        {record.release ? (record.release.timeToReleaseMs / 1000).toFixed(2) : '—'}
                      </td>
                      <td className="num px-2 py-1.5 text-[11px] text-ink-2">
                        {record.flight ? record.flight.velocityMph.toFixed(1) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-[11px]">
                        <span
                          style={{
                            color:
                              record.outcome.result === 'interception' || record.outcome.result === 'sack'
                                ? STATUS.critical
                                : record.outcome.result === 'touchdown'
                                  ? STATUS.good
                                  : undefined,
                          }}
                        >
                          {record.outcome.result}
                          {record.outcome.yards !== 0 && <span className="num ml-1 text-ink-3">{record.outcome.yards}</span>}
                        </span>
                      </td>
                      <td className="num px-2 py-1.5 text-[11px] text-ink-3">{judgement.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </article>
    </div>
  );
}

function buildStack(label: string, records: readonly ThrowRecord[]) {
  return {
    label,
    observe: Math.round(median(records.map((r) => r.ooda?.observeMs ?? Number.NaN)) ?? 0),
    orient: Math.round(median(records.map((r) => r.ooda?.orientMs ?? Number.NaN)) ?? 0),
    decide: Math.round(median(records.map((r) => r.ooda?.decideMs ?? Number.NaN)) ?? 0),
    act: Math.round(median(records.map((r) => r.ooda?.actMs ?? Number.NaN)) ?? 0),
  };
}

function ReportHeader({
  report,
  minConfidence,
  successRate,
}: {
  report: ReturnType<typeof buildGameReport>;
  minConfidence: number;
  successRate: number | null;
}) {
  const { athlete, source } = useStore();
  const { game } = report;
  return (
    <header className="print-surface rounded-sm border border-hairline bg-panel px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Game report</div>
          <h1 className="print-ink mt-1 text-[20px] font-semibold tracking-tight text-ink">
            Week {game.week} {game.home ? 'vs' : 'at'} {game.opponent}
          </h1>
          <p className="num print-ink-2 mt-1 text-[11px] text-ink-3">
            {formatDate(game.date)} · {game.surface} · {game.tempF}°F · {athlete?.name} #{athlete?.jersey},{' '}
            {athlete?.org}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Stat label="Dropbacks" value={String(report.dropbacks)} />
          <Stat label="Throws" value={String(report.throws)} />
          <Stat label="Success rate" value={formatPct(successRate)} />
          <Stat
            label="Composure"
            value={report.composure.reliable ? `${report.composure.score}` : '—'}
            hint={report.composure.reliable ? '/100' : 'thin'}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <Badge tone="accent">{source.label}</Badge>
        <Badge>solve ≥ {minConfidence.toFixed(2)}</Badge>
        <Badge>{report.chaosReps} off-structure reps</Badge>
        {report.flags.length > 0 && <Badge tone="serious">{report.flags.length} baseline departure(s)</Badge>}
        <span className="print-ink-2 ml-auto text-[10px] text-ink-3">
          Every figure in this report is defined in the metric dictionary; press “i” beside a label on screen for its
          measurement definition, unit and published range.
        </span>
      </div>
    </header>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="num print-ink mt-1 text-[20px] leading-none text-ink">
        {value}
        {hint && <span className="ml-1 text-[10px] text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}
