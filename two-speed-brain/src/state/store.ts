import { create } from 'zustand';
import type { RegionId } from '../data/regions';
import { SCENARIOS } from '../data/scenarios';
import type { StateMods } from '../sim/activity';
import { clock, onClockStop } from '../sim/clock';

export type Mode = 'simulate' | 'trainer' | 'evidence';

interface BrainState {
  ready: boolean;
  mode: Mode;
  scenarioId: string;
  mods: StateMods;
  playing: boolean;
  speed: number;
  phaseIndex: number;
  hovered: { region: RegionId | null; name: string } | null;
  selectedRegion: RegionId | null;
  trainerStep: number;
  trainerTrigger: number;
  trainerChoice: number | null;
  skull: boolean;
  peel: boolean;
  autoRotate: boolean;
  creditsOpen: boolean;
  sheetOpen: boolean;

  setReady: () => void;
  setMode: (m: Mode) => void;
  setScenario: (id: string) => void;
  toggleMod: (k: keyof StateMods) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (s: number) => void;
  setPhaseIndex: (i: number) => void;
  hover: (h: BrainState['hovered']) => void;
  selectRegion: (r: RegionId | null) => void;
  setTrainerStep: (i: number) => void;
  setTrainerTrigger: (i: number) => void;
  setTrainerChoice: (i: number | null) => void;
  toggle: (k: 'skull' | 'peel' | 'autoRotate' | 'creditsOpen' | 'sheetOpen') => void;
}

export const useBrain = create<BrainState>()((set, get) => ({
  ready: false,
  mode: 'simulate',
  scenarioId: SCENARIOS[0].id,
  mods: { sleepLoss: false, stress: false, pause: false },
  playing: false,
  speed: clock.speed,
  phaseIndex: 0,
  hovered: null,
  selectedRegion: null,
  trainerStep: 0,
  trainerTrigger: 0,
  trainerChoice: null,
  skull: true,
  peel: false,
  autoRotate: true,
  creditsOpen: false,
  sheetOpen: false,

  setReady: () => {
    set({ ready: true });
    // Start the first scenario on its own, unless the visitor already did something.
    setTimeout(() => {
      const st = get();
      if (st.mode === 'simulate' && !st.playing && clock.t === 0) st.play();
    }, 1200);
  },
  setMode: (mode) => {
    clock.playing = false;
    set({ mode, playing: false, selectedRegion: null });
  },
  setScenario: (scenarioId) => {
    clock.set(0);
    clock.playing = true;
    set({ scenarioId, playing: true, phaseIndex: 0, selectedRegion: null, mode: 'simulate', sheetOpen: false });
  },
  toggleMod: (k) => set({ mods: { ...get().mods, [k]: !get().mods[k] } }),
  play: () => {
    if (clock.t >= 2999) clock.set(0);
    clock.playing = true;
    set({ playing: true });
  },
  pause: () => {
    clock.playing = false;
    set({ playing: false });
  },
  setSpeed: (speed) => {
    clock.speed = speed;
    set({ speed });
  },
  setPhaseIndex: (phaseIndex) => {
    if (get().phaseIndex !== phaseIndex) set({ phaseIndex });
  },
  hover: (hovered) => {
    const cur = get().hovered;
    if (cur?.name !== hovered?.name) set({ hovered });
  },
  selectRegion: (selectedRegion) => set({ selectedRegion }),
  setTrainerStep: (trainerStep) => set({ trainerStep, trainerChoice: trainerStep === get().trainerStep ? get().trainerChoice : null }),
  setTrainerTrigger: (trainerTrigger) => set({ trainerTrigger, trainerStep: 0, trainerChoice: null }),
  setTrainerChoice: (trainerChoice) => set({ trainerChoice }),
  toggle: (k) => set({ [k]: !get()[k] } as Partial<BrainState>),
}));

onClockStop(() => useBrain.setState({ playing: false }));

if (import.meta.env.DEV) (window as unknown as { __brain: typeof useBrain; __clock: typeof clock }).__brain = useBrain;
if (import.meta.env.DEV) (window as unknown as { __clock: typeof clock }).__clock = clock;
