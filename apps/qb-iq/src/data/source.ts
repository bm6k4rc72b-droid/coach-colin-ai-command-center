/**
 * The data seam.
 *
 * Everything above this line — every chart, every score, every flag — talks to
 * `QbIqDataSource` and nothing else. The mock source below it builds a season
 * from a seeded model; a live deployment writes a source that pulls from an
 * optical-tracking feed, a markerless mocap solve and a wearable, maps them
 * through `data/adapters`, and hands back the same `ThrowRecord[]`. No view code
 * changes.
 *
 * The interface is asynchronous on purpose even though the mock resolves
 * immediately: a real source is a network call, and building the UI against a
 * synchronous source is how an app ends up needing a rewrite to accept one.
 */

import type {
  AthleteProfile,
  GameSummary,
  ProtocolSession,
  RecognitionSession,
  SeasonSummary,
  ThrowQuery,
  ThrowRecord,
} from '../domain/types';

export interface QbIqDataSource {
  /** Stable identifier for the source, shown in the provenance strip. */
  readonly id: string;
  /** Human-readable name, e.g. "Synthetic model" or "Hawk-Eye + Catapult (live)". */
  readonly label: string;
  /** Whether the data is real capture or a model — the UI must never hide this. */
  readonly kind: 'synthetic' | 'live';

  listAthletes(): Promise<AthleteProfile[]>;
  listSeasons(athleteId: string): Promise<SeasonSummary[]>;
  listGames(athleteId: string, seasonId: string): Promise<GameSummary[]>;
  listThrows(query: ThrowQuery): Promise<ThrowRecord[]>;
  listProtocolSessions(athleteId: string, seasonId: string): Promise<ProtocolSession[]>;
  listRecognitionSessions(athleteId: string, seasonId: string): Promise<RecognitionSession[]>;
}

/** Apply the query's non-identifying filters. Shared by every source implementation. */
export function applyThrowFilters(records: readonly ThrowRecord[], query: ThrowQuery): ThrowRecord[] {
  const minConfidence = query.minConfidence ?? 0;
  return records.filter((record) => {
    if (record.athleteId !== query.athleteId) return false;
    if (query.seasonId && record.seasonId !== query.seasonId) return false;
    if (query.gameId && record.context.gameId !== query.gameId) return false;
    return record.capture.confidence >= minConfidence;
  });
}
