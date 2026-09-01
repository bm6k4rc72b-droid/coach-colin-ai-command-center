import { db } from './db.ts';
import type { Box, DetectionLabel, SuppressionReason } from '../core/types.ts';

export interface GuardEvent {
  id: number;
  at: number;
  trackId: number;
  zoneId: string | null;
  label: DetectionLabel;
  score: number;
  alerted: boolean;
  reason: SuppressionReason | null;
  thumbUri: string | null;
  box: Box;
}

interface Row {
  id: number;
  at: number;
  track_id: number;
  zone_id: string | null;
  label: string;
  score: number;
  alerted: number;
  reason: string | null;
  thumb_uri: string | null;
  box_json: string;
}

const hydrate = (r: Row): GuardEvent => ({
  id: r.id,
  at: r.at,
  trackId: r.track_id,
  zoneId: r.zone_id,
  label: r.label as DetectionLabel,
  score: r.score,
  alerted: r.alerted === 1,
  reason: r.reason as SuppressionReason | null,
  thumbUri: r.thumb_uri,
  box: JSON.parse(r.box_json) as Box,
});

export async function record(e: Omit<GuardEvent, 'id'>): Promise<void> {
  const d = await db();
  await d.runAsync(
    `INSERT INTO events (at, track_id, zone_id, label, score, alerted, reason, thumb_uri, box_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.at, e.trackId, e.zoneId, e.label, e.score, e.alerted ? 1 : 0, e.reason, e.thumbUri,
    JSON.stringify(e.box),
  );
}

/** Alerts only — what the user was actually woken for. */
export async function recentAlerts(limit = 100): Promise<GuardEvent[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row>(
    'SELECT * FROM events WHERE alerted = 1 ORDER BY at DESC LIMIT ?', limit,
  );
  return rows.map(hydrate);
}

/**
 * Everything the system saw and chose not to raise. This is the screen that
 * builds trust — it shows the app is watching and deciding, not asleep.
 */
export async function recentSuppressed(limit = 100): Promise<GuardEvent[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row>(
    'SELECT * FROM events WHERE alerted = 0 ORDER BY at DESC LIMIT ?', limit,
  );
  return rows.map(hydrate);
}

/** Counts by reason over a window, for the tuning screen. */
export async function suppressionBreakdown(sinceMs: number): Promise<Record<string, number>> {
  const d = await db();
  const rows = await d.getAllAsync<{ reason: string; n: number }>(
    'SELECT reason, COUNT(*) AS n FROM events WHERE alerted = 0 AND at >= ? GROUP BY reason ORDER BY n DESC',
    sinceMs,
  );
  return Object.fromEntries(rows.map((r) => [r.reason, r.n]));
}

/** Retention — footage and events age out rather than accumulating forever. */
export async function prune(olderThanMs: number): Promise<number> {
  const d = await db();
  const res = await d.runAsync('DELETE FROM events WHERE at < ?', olderThanMs);
  return res.changes;
}
