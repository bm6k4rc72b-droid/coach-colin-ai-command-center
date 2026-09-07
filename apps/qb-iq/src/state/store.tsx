/**
 * Application state.
 *
 * One provider holds the selected athlete, season and game, the capture-quality
 * floor, and the records those choices select. Views read the filtered record
 * list and nothing else — they never reach for the source, which is what keeps
 * the swap to a live feed a one-file change.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createMockSource } from '../data/mock/mockSource';
import type { QbIqDataSource } from '../data/source';
import type {
  AthleteProfile,
  GameSummary,
  ProtocolSession,
  RecognitionSession,
  SeasonSummary,
  ThrowRecord,
} from '../domain/types';

export interface SeasonData {
  season: SeasonSummary;
  games: GameSummary[];
  throws: ThrowRecord[];
  protocols: ProtocolSession[];
  recognition: RecognitionSession[];
}

interface Store {
  source: QbIqDataSource;
  loading: boolean;
  athlete: AthleteProfile | null;
  seasons: SeasonSummary[];
  seasonId: string;
  setSeasonId: (id: string) => void;
  /** 'season' means no game filter. */
  gameId: string;
  setGameId: (id: string) => void;
  /** Reps below this solver confidence are excluded everywhere. */
  minConfidence: number;
  setMinConfidence: (value: number) => void;
  /** Every season loaded, for the career views. */
  allSeasons: SeasonData[];
  /** The selected season. */
  current: SeasonData | null;
  /** Season reps after the confidence floor. */
  seasonRecords: ThrowRecord[];
  /** Season reps after the confidence floor and the game filter — what most views read. */
  records: ThrowRecord[];
  /** The selected game, or null when viewing the whole season. */
  game: GameSummary | null;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const source = useMemo(() => createMockSource(), []);
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [allSeasons, setAllSeasons] = useState<SeasonData[]>([]);
  const [seasonId, setSeasonId] = useState('s2026');
  const [gameId, setGameId] = useState('season');
  const [minConfidence, setMinConfidence] = useState(0.7);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const athletes = await source.listAthletes();
      const first = athletes[0] ?? null;
      if (!first) return;
      const seasonList = await source.listSeasons(first.id);
      const bundles: SeasonData[] = [];
      for (const season of seasonList) {
        const [games, throws, protocols, recognition] = await Promise.all([
          source.listGames(first.id, season.id),
          source.listThrows({ athleteId: first.id, seasonId: season.id }),
          source.listProtocolSessions(first.id, season.id),
          source.listRecognitionSessions(first.id, season.id),
        ]);
        bundles.push({ season, games, throws, protocols, recognition });
      }
      if (cancelled) return;
      setAthlete(first);
      setSeasons(seasonList);
      setAllSeasons(bundles);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  const current = useMemo(
    () => allSeasons.find((entry) => entry.season.id === seasonId) ?? null,
    [allSeasons, seasonId],
  );

  const seasonRecords = useMemo(
    () => (current ? current.throws.filter((record) => record.capture.confidence >= minConfidence) : []),
    [current, minConfidence],
  );

  const records = useMemo(
    () => (gameId === 'season' ? seasonRecords : seasonRecords.filter((record) => record.context.gameId === gameId)),
    [seasonRecords, gameId],
  );

  const game = useMemo(
    () => current?.games.find((entry) => entry.id === gameId) ?? null,
    [current, gameId],
  );

  // Changing season invalidates a game selection from the previous one.
  useEffect(() => {
    setGameId('season');
  }, [seasonId]);

  const value: Store = {
    source,
    loading,
    athlete,
    seasons,
    seasonId,
    setSeasonId,
    gameId,
    setGameId,
    minConfidence,
    setMinConfidence,
    allSeasons,
    current,
    seasonRecords,
    records,
    game,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
