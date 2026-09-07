/**
 * The synthetic source: four athlete-seasons built from the model in
 * `generateSeason`, memoised so the numbers on screen never move between views.
 */

import type {
  AthleteProfile,
  GameSummary,
  ProtocolSession,
  RecognitionSession,
  SeasonBundle,
  SeasonSummary,
  ThrowQuery,
  ThrowRecord,
} from '../../domain/types';
import { applyThrowFilters, type QbIqDataSource } from '../source';
import { generateSeason, type SeasonSpec } from './generateSeason';

export const ATHLETE: AthleteProfile = {
  id: 'qb-0117',
  name: 'M. Vance',
  org: 'Meridian',
  level: 'NFL',
  jersey: 17,
  heightIn: 75,
  weightLb: 218,
  wingspanIn: 77.5,
  handSizeIn: 9.6,
  dominantHand: 'R',
  ageYears: 24,
  experienceYears: 3,
  archetype: 'rhythm-passer',
};

const SEASONS: SeasonSummary[] = [
  { id: 's2023', label: '2023 · College', year: 2023, level: 'FBS', ageYears: 21 },
  { id: 's2024', label: '2024 · Rookie', year: 2024, level: 'NFL', ageYears: 22 },
  { id: 's2025', label: '2025', year: 2025, level: 'NFL', ageYears: 23 },
  { id: 's2026', label: '2026 · Current', year: 2026, level: 'NFL', ageYears: 24 },
];

const SPECS: Record<string, SeasonSpec> = {
  s2023: { season: SEASONS[0] as SeasonSummary, games: 12, installFamiliarity: 0.52, physicalIndex: 0.975, carriesLateSeasonDrift: false },
  s2024: { season: SEASONS[1] as SeasonSummary, games: 15, installFamiliarity: 0.10, physicalIndex: 0.985, carriesLateSeasonDrift: false },
  s2025: { season: SEASONS[2] as SeasonSummary, games: 17, installFamiliarity: 0.42, physicalIndex: 1.0, carriesLateSeasonDrift: false },
  s2026: { season: SEASONS[3] as SeasonSummary, games: 17, installFamiliarity: 0.66, physicalIndex: 1.005, carriesLateSeasonDrift: true },
};

/** The season the app opens on. */
export const CURRENT_SEASON_ID = 's2026';

const cache = new Map<string, SeasonBundle>();

export function seasonBundle(seasonId: string): SeasonBundle {
  const cached = cache.get(seasonId);
  if (cached) return cached;
  const spec = SPECS[seasonId];
  if (!spec) throw new Error(`Unknown season: ${seasonId}`);
  const bundle = generateSeason(ATHLETE, spec);
  cache.set(seasonId, bundle);
  return bundle;
}

export const SEASON_IDS = SEASONS.map((s) => s.id);

export function createMockSource(): QbIqDataSource {
  return {
    id: 'mock',
    label: 'Synthetic model v1',
    kind: 'synthetic',
    async listAthletes(): Promise<AthleteProfile[]> {
      return [ATHLETE];
    },
    async listSeasons(): Promise<SeasonSummary[]> {
      return SEASONS;
    },
    async listGames(_athleteId: string, seasonId: string): Promise<GameSummary[]> {
      return seasonBundle(seasonId).games;
    },
    async listThrows(query: ThrowQuery): Promise<ThrowRecord[]> {
      const seasonIds = query.seasonId ? [query.seasonId] : SEASON_IDS;
      const records = seasonIds.flatMap((id) => seasonBundle(id).throws);
      return applyThrowFilters(records, query);
    },
    async listProtocolSessions(_athleteId: string, seasonId: string): Promise<ProtocolSession[]> {
      return seasonBundle(seasonId).protocols;
    },
    async listRecognitionSessions(_athleteId: string, seasonId: string): Promise<RecognitionSession[]> {
      return seasonBundle(seasonId).recognition;
    },
  };
}
