/**
 * Play persistence and export.
 *
 * Reps live in localStorage so a session survives the phone locking or Safari
 * evicting the tab mid-practice. CSV export is the handoff to everything a
 * coaching staff already uses — Hudl, a spreadsheet, a film session.
 */

import type { CompletedPlay } from '../metrics/playEngine.ts';

const STORAGE_KEY = 'ccai.plays.v1';

export function loadPlays(): CompletedPlay[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompletedPlay[]) : [];
  } catch {
    // A corrupt or unavailable store must never take the camera down mid-rep.
    return [];
  }
}

export function savePlays(plays: CompletedPlay[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plays));
  } catch {
    /* Quota or private-mode failure: the in-memory session still works. */
  }
}

const CSV_COLUMNS: { header: string; value: (p: CompletedPlay) => string }[] = [
  { header: 'play_id', value: (p) => p.id },
  { header: 'recorded_at', value: (p) => new Date(p.recordedAt).toISOString() },
  { header: 'label', value: (p) => p.label },
  { header: 'qb_track_id', value: (p) => String(p.quarterbackId) },
  { header: 'pressure_onset_s', value: (p) => fixed(p.pressureOnset) },
  { header: 'pressure_response_s', value: (p) => fixed(p.pressureResponse) },
  { header: 'total_movement_yd', value: (p) => fixed(p.totalMovement) },
  { header: 'time_to_throw_s', value: (p) => fixed(p.timeToThrow) },
  { header: 'throw_distance_yd', value: (p) => fixed(p.throwDistance) },
  { header: 'separation_at_release_yd', value: (p) => fixed(p.separationAtRelease) },
  { header: 'expected_completion', value: (p) => fixed(p.expectedCompletion, 3) },
  { header: 'expected_first_down', value: (p) => fixed(p.expectedFirstDown, 3) },
];

export function toCsv(plays: CompletedPlay[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(',');
  const rows = plays.map((play) => CSV_COLUMNS.map((c) => escapeCell(c.value(play))).join(','));
  return [header, ...rows].join('\n');
}

function fixed(value: number | null, digits = 2): string {
  return value === null || Number.isNaN(value) ? '' : value.toFixed(digits);
}

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
