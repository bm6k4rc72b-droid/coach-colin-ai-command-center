/**
 * The live stat readout, styled after a broadcast telestration panel.
 *
 * Values that have not happened yet in the current rep render as a dash rather
 * than a zero: "pressure onset 0.0s" and "no pressure yet" mean opposite things
 * to a coach, and the HUD must never blur that line.
 */

import type { PlaySnapshot } from '../metrics/playEngine.ts';

type Props = {
  snapshot: PlaySnapshot;
  expectedCompletion: number | null;
  expectedFirstDown: number | null;
  jerseyLabel: string;
  trackId: number | null;
};

export function Hud({
  snapshot,
  expectedCompletion,
  expectedFirstDown,
  jerseyLabel,
  trackId,
}: Props) {
  const rows: { label: string; value: string; unit: string }[] = [
    { label: 'Pressure Onset', value: seconds(snapshot.pressureOnset), unit: 'seconds' },
    { label: 'Pressure Response', value: seconds(snapshot.pressureResponse), unit: 'seconds' },
    { label: 'Total Movement', value: number(snapshot.totalMovement), unit: 'yards' },
    { label: 'Time To Throw', value: seconds(snapshot.timeToThrow), unit: 'seconds' },
    { label: 'Expected Completion', value: percent(expectedCompletion), unit: '%' },
    { label: 'Expected First Down', value: percent(expectedFirstDown), unit: '%' },
    { label: 'Throw Distance', value: number(snapshot.throwDistance), unit: 'yds' },
  ];

  return (
    <div className="hud">
      <div className="hud__title">
        <span className="hud__position">QB</span>
        <span className="hud__jersey">{jerseyLabel}</span>
        <span className="hud__pid">{trackId === null ? '(no track)' : `(PID: ${trackId})`}</span>
      </div>

      {rows.map((row) => (
        <div className="hud__row" key={row.label}>
          <span className="hud__label">{row.label}:</span>
          <span className="hud__value">
            <strong>{row.value}</strong>
            <em>{row.unit}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

function seconds(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

function number(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

function percent(value: number | null): string {
  return value === null ? '—' : Math.round(value * 100).toString();
}
