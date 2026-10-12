import { create } from 'zustand';
import type { ActivityId } from '../models/physiology';

export type ReactionPhase = 'idle' | 'waiting' | 'go' | 'result' | 'early';

interface LabState {
  index: number;
  heart: { hr: number; sv: number; svr: number };
  air: { gen: number; flow: number };
  nerve: { d: number; myelin: boolean };
  hip: { mass: number; activity: ActivityId };
  race: { u: number; playing: boolean };
  reaction: { phase: ReactionPhase; goAt: number; result: number | null; best: number | null; tries: number[] };
  creditsOpen: boolean;

  go: (i: number) => void;
  set: <K extends 'heart' | 'air' | 'nerve' | 'hip' | 'race' | 'reaction'>(k: K, v: Partial<LabState[K]>) => void;
  toggleCredits: () => void;
}

export const useLab = create<LabState>()((set, get) => ({
  index: 0,
  heart: { hr: 70, sv: 70, svr: 17 },
  air: { gen: 4, flow: 0.5 },
  nerve: { d: 12, myelin: true },
  hip: { mass: 75, activity: 'walk' },
  race: { u: 0.2, playing: false },
  reaction: { phase: 'idle', goAt: 0, result: null, best: null, tries: [] },
  creditsOpen: false,

  go: (i) => set({ index: ((i % 6) + 6) % 6 }),
  set: (k, v) => set({ [k]: { ...get()[k], ...v } } as Partial<LabState>),
  toggleCredits: () => set({ creditsOpen: !get().creditsOpen }),
}));

if (import.meta.env.DEV) Object.assign(window, { __lab: useLab });
