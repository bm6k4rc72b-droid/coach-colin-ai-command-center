/**
 * The shell: identity, filters, the always-visible headline strip, and the
 * module switch.
 *
 * The header is deliberately heavy. In the room this gets shown in, the first
 * question is always "who is this and what am I looking at", and the answer —
 * athlete, level, season, game, how many reps survived the capture-quality
 * floor, and what produced the data — should never require a click.
 */

import { useMemo, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { aggregate, isChaos, isPressured, isThrow } from './analysis/aggregate';
import { composure } from './analysis/splits';
import { weeklySeries } from './analysis/trends';
import { MetricInfo, StatTile } from './components/ui';
import { BiomechanicsView } from './modules/BiomechanicsView';
import { CognitionView } from './modules/CognitionView';
import { OodaView } from './modules/OodaView';
import { TacticalView } from './modules/TacticalView';
import { GameReportView } from './modules/GameReportView';
import { TrendsView } from './modules/TrendsView';
import type { MetricId } from './domain/metrics';

const MODULES = [
  { id: 'biomechanics', label: 'Biomechanics', hint: 'motion, chain, release, load' },
  { id: 'cognition', label: 'Cognition', hint: 'reads, latency, load, eyes' },
  { id: 'ooda', label: 'OODA', hint: 'loop speed and disorder' },
  { id: 'tactical', label: 'Stress & Training', hint: 'protocols, drilling, situations' },
  { id: 'report', label: 'Game Report', hint: 'per-game, printable' },
  { id: 'trends', label: 'Development', hint: 'season, career, archetypes' },
] as const;

type ModuleId = (typeof MODULES)[number]['id'];

const HEADLINE: MetricId[] = ['oodaLoop', 'decisionLatency', 'timeToRelease', 'onTargetRate', 'epaPerDropback'];

function Shell() {
  const store = useStore();
  const [moduleId, setModuleId] = useState<ModuleId>('biomechanics');
  const { athlete, current, records, seasonRecords, loading } = store;

  const headline = useMemo(() => {
    if (!current) return [];
    return HEADLINE.map((id) => ({
      id,
      value: aggregate(records, id),
      spark: weeklySeries(seasonRecords, current.games, id).points.map((point) => point.value),
    }));
  }, [records, seasonRecords, current]);

  const composureScore = useMemo(() => composure(records), [records]);

  if (loading || !athlete || !current) {
    return (
      <div className="grid min-h-dvh place-items-center bg-void">
        <div className="text-center">
          <div className="num text-[13px] tracking-[0.3em] text-accent">QB IQ</div>
          <div className="mt-2 text-[11px] text-ink-3">Building the season model…</div>
        </div>
      </div>
    );
  }

  const pressured = records.filter(isPressured).length;
  const chaos = records.filter(isChaos).length;
  const thrown = records.filter(isThrow).length;

  return (
    <div className="min-h-dvh bg-void">
      <header className="no-print sticky top-0 z-40 border-b border-hairline bg-void/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <span className="num text-[15px] font-semibold tracking-[0.26em] text-accent">QB&nbsp;IQ</span>
            <span className="hidden text-[10px] uppercase tracking-[0.18em] text-ink-3 sm:inline">
              Quarterback Performance Intelligence
            </span>
          </div>

          <div className="flex items-center gap-3 border-l border-hairline pl-5">
            <div className="num grid h-9 w-9 place-items-center rounded-sm border border-hairline-strong bg-panel text-[13px] text-ink">
              {athlete.jersey}
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-ink">{athlete.name}</div>
              <div className="num text-[10px] tracking-wide text-ink-3">
                {athlete.org} · {athlete.level} · {Math.floor(athlete.heightIn / 12)}′{athlete.heightIn % 12}″ ·{' '}
                {athlete.weightLb} lb · {athlete.dominantHand}H · {athlete.handSizeIn}″ hand
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Select
              label="Season"
              value={store.seasonId}
              onChange={store.setSeasonId}
              options={store.seasons.map((season) => ({ value: season.id, label: season.label }))}
            />
            <Select
              label="Scope"
              value={store.gameId}
              onChange={store.setGameId}
              options={[
                { value: 'season', label: `Full season · ${seasonRecords.length} dropbacks` },
                ...current.games.map((game) => ({
                  value: game.id,
                  label: `W${game.week} ${game.home ? 'vs' : '@'} ${game.opponent}`,
                })),
              ]}
            />
            <ConfidenceControl />
          </div>
        </div>

        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline px-5 py-2">
          <nav className="flex flex-wrap gap-1" aria-label="Modules">
            {MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                onClick={() => setModuleId(module.id)}
                aria-current={module.id === moduleId}
                className={`group rounded-sm px-3 py-1.5 text-left transition-colors ${
                  module.id === moduleId ? 'bg-accent text-void' : 'text-ink-2 hover:bg-raised hover:text-ink'
                }`}
              >
                <span className="block text-[12px] font-medium leading-tight">{module.label}</span>
                <span
                  className={`block text-[9px] leading-tight ${
                    module.id === moduleId ? 'text-void/70' : 'text-ink-3'
                  }`}
                >
                  {module.hint}
                </span>
              </button>
            ))}
          </nav>

          <div className="num ml-auto flex items-center gap-4 text-[10px] text-ink-3">
            <span>
              <span className="text-ink-2">{records.length}</span> dropbacks
            </span>
            <span>
              <span className="text-ink-2">{thrown}</span> throws
            </span>
            <span>
              <span className="text-ink-2">{pressured}</span> pressured
            </span>
            <span>
              <span className="text-ink-2">{chaos}</span> off-structure
            </span>
            <span className="flex items-center gap-1.5 rounded-sm border border-hairline px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {store.source.label}
              <span className="text-ink-3">
                · {store.source.kind === 'synthetic' ? 'modelled data' : 'live capture'}
              </span>
            </span>
          </div>
        </div>
      </header>

      <div className="no-print mx-auto grid max-w-[1600px] grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        {headline.map((entry) => (
          <StatTile key={entry.id} id={entry.id} value={entry.value} spark={entry.spark} size="md" />
        ))}
        <div className="print-surface rounded-sm border border-hairline bg-panel px-3 py-3">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">COMPOSURE</span>
            <MetricInfo id="composure" align="right" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="num text-[28px] font-medium leading-none text-ink">
              {composureScore.reliable ? composureScore.score : '—'}
            </span>
            <span className="num text-[11px] text-ink-3">/100</span>
          </div>
          <div className="mt-1.5 text-[10px] text-ink-3">
            {composureScore.reliable
              ? `${composureScore.pressuredReps} pressured vs ${composureScore.cleanReps} clean`
              : 'needs 12+ reps each side'}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-5 pb-16">
        {moduleId === 'biomechanics' && <BiomechanicsView />}
        {moduleId === 'cognition' && <CognitionView />}
        {moduleId === 'ooda' && <OodaView />}
        {moduleId === 'tactical' && <TacticalView />}
        {moduleId === 'report' && <GameReportView />}
        {moduleId === 'trends' && <TrendsView />}
      </main>

      <footer className="no-print mx-auto max-w-[1600px] border-t border-hairline px-5 py-6 text-[10px] leading-relaxed text-ink-3">
        Every figure in this console is defined, united and sourced — press the “i” beside any label for how it is
        measured, why it matters and the published range it sits in. This build runs on a seeded synthetic season so
        every module is populated; the record model, the source interface and the vendor adapter are the same ones a
        live optical-tracking, markerless-mocap or wearable feed would fill.
      </footer>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="num rounded-sm border border-hairline bg-sunken px-2 py-1.5 text-[11px] text-ink outline-none hover:border-hairline-strong focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The capture-quality floor. It is a first-class control rather than a buried
 * setting because "which reps are in this number" is the first question a
 * biomechanist asks about any figure on a screen like this.
 */
function ConfidenceControl() {
  const { minConfidence, setMinConfidence, current, seasonRecords } = useStore();
  const total = current?.throws.length ?? 0;
  const excluded = total - seasonRecords.length;
  return (
    <label className="flex items-center gap-2" title="Reps whose kinematic solve scores below this are excluded everywhere">
      <span className="eyebrow">Solve ≥</span>
      <input
        type="range"
        min={0.6}
        max={0.95}
        step={0.05}
        value={minConfidence}
        onChange={(event) => setMinConfidence(Number(event.target.value))}
        className="h-1 w-20 cursor-pointer accent-[#4cc9ff]"
      />
      <span className="num text-[11px] text-ink-2">{minConfidence.toFixed(2)}</span>
      <span className="num text-[10px] text-ink-3">−{excluded} reps</span>
    </label>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
