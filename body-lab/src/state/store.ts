import { create } from 'zustand';
import type { ActivityId } from '../models/physiology';

export type ReactionPhase = 'idle' | 'waiting' | 'go' | 'result' | 'early';
export type View = 'body' | 'bench';
export type Layer = 'skeleton' | 'muscles' | 'organs' | 'nervous' | 'vessels';

export interface PieceRef {
  id: string;
  name: string;
  system: string;
}

interface LabState {
  /** Whole-body explorer or the exhibit apparatus on its plinth. */
  view: View;
  /** Exhibit in focus; null in the body view means free exploring. */
  index: number | null;
  layers: Record<Layer, boolean>;
  xray: boolean;
  hovered: PieceRef | null;
  selected: PieceRef | null;
  ready: boolean;

  heart: { hr: number; sv: number; svr: number };
  air: { gen: number; flow: number };
  nerve: { d: number; myelin: boolean };
  hip: { mass: number; activity: ActivityId };
  race: { u: number; playing: boolean };
  reaction: { phase: ReactionPhase; goAt: number; result: number | null; best: number | null; tries: number[] };
  creditsOpen: boolean;

  /** Focus an exhibit (wraps around); null returns to free exploring. */
  go: (i: number | null) => void;
  setView: (v: View) => void;
  toggleLayer: (l: Layer) => void;
  setXray: (on: boolean) => void;
  hover: (p: PieceRef | null) => void;
  select: (p: PieceRef | null) => void;
  set: <K extends 'heart' | 'air' | 'nerve' | 'hip' | 'race' | 'reaction'>(k: K, v: Partial<LabState[K]>) => void;
  toggleCredits: () => void;
}

export const EXHIBIT_COUNT = 6;

export const useLab = create<LabState>()((set, get) => ({
  view: 'body',
  index: null,
  layers: { skeleton: true, muscles: false, organs: true, nervous: true, vessels: true },
  xray: false,
  hovered: null,
  selected: null,
  ready: false,

  heart: { hr: 70, sv: 70, svr: 17 },
  air: { gen: 4, flow: 0.5 },
  nerve: { d: 12, myelin: true },
  hip: { mass: 75, activity: 'walk' },
  race: { u: 0.2, playing: false },
  reaction: { phase: 'idle', goAt: 0, result: null, best: null, tries: [] },
  creditsOpen: false,

  go: (i) => {
    // The camera is about to fly, so whatever was under the pointer no longer is.
    if (i === null) return set({ index: null, view: 'body', hovered: null });
    set({ index: ((i % EXHIBIT_COUNT) + EXHIBIT_COUNT) % EXHIBIT_COUNT, selected: null, hovered: null });
  },
  setView: (view) => set({ view, hovered: null, index: view === 'bench' && get().index === null ? 0 : get().index }),
  toggleLayer: (l) => set({ layers: { ...get().layers, [l]: !get().layers[l] } }),
  setXray: (xray) => set({ xray }),
  hover: (hovered) => {
    const h = get().hovered;
    if (h?.id !== hovered?.id) set({ hovered });
  },
  select: (selected) => set({ selected }),
  set: (k, v) => set({ [k]: { ...get()[k], ...v } } as Partial<LabState>),
  toggleCredits: () => set({ creditsOpen: !get().creditsOpen }),
}));

if (import.meta.env.DEV) Object.assign(window, { __lab: useLab });
