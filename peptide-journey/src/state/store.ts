import { create } from 'zustand';
import { PEPTIDES } from '../data/peptides';
import { clock, onClockStop } from '../sim/clock';

interface JourneyState {
  ready: boolean;
  peptideId: string;
  playing: boolean;
  focusStop: string | null;
  hovered: { name: string; system: string } | null;
  skeleton: boolean;
  autoRotate: boolean;
  creditsOpen: boolean;
  sheetOpen: boolean;

  setReady: () => void;
  choose: (id: string) => void;
  play: () => void;
  pause: () => void;
  setFocusStop: (id: string | null) => void;
  hover: (h: JourneyState['hovered']) => void;
  toggle: (k: 'skeleton' | 'autoRotate' | 'creditsOpen' | 'sheetOpen') => void;
}

export const useJourney = create<JourneyState>()((set, get) => ({
  ready: false,
  peptideId: PEPTIDES[0].id,
  playing: false,
  focusStop: null,
  hovered: null,
  skeleton: true,
  autoRotate: false,
  creditsOpen: false,
  sheetOpen: false,

  setReady: () => {
    set({ ready: true });
    setTimeout(() => {
      if (!get().playing && clock.u === 0) get().play();
    }, 1200);
  },
  choose: (peptideId) => {
    clock.set(0);
    clock.playing = true;
    set({ peptideId, playing: true, focusStop: null, sheetOpen: false });
  },
  play: () => {
    if (clock.u >= 0.999) clock.set(0);
    clock.playing = true;
    set({ playing: true });
  },
  pause: () => {
    clock.playing = false;
    set({ playing: false });
  },
  setFocusStop: (focusStop) => set({ focusStop }),
  hover: (hovered) => {
    if (get().hovered?.name !== hovered?.name) set({ hovered });
  },
  toggle: (k) => set({ [k]: !get()[k] } as Partial<JourneyState>),
}));

onClockStop(() => useJourney.setState({ playing: false }));

if (import.meta.env.DEV) Object.assign(window, { __journey: useJourney, __clock: clock });
