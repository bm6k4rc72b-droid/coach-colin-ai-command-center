import { create } from 'zustand';
import { GENE_BY_ID } from '../data/genes';
import type { System } from '../data/genes';

export type View = 'body' | 'skeleton' | 'organs';

export const VIEW_SYSTEMS: Record<View, System[]> = {
  body: ['skeleton', 'muscles', 'heart', 'sensory', 'arteries', 'veins', 'nervous', 'respiratory'],
  skeleton: ['skeleton'],
  organs: ['heart', 'sensory', 'arteries', 'veins', 'nervous', 'respiratory'],
};

/** The view that best shows a gene's effect. */
export function viewFor(geneId: string): View {
  const systems = GENE_BY_ID[geneId].visual.systems;
  if (systems.includes('muscles')) return 'body';
  if (systems.includes('skeleton')) return 'skeleton';
  return 'organs';
}

interface LabState {
  ready: boolean;
  active: string[];
  fiction: number;
  alien: boolean;
  view: View;
  selectedGene: string | null;
  hovered: { name: string; system: string } | null;
  autoRotate: boolean;
  creditsOpen: boolean;
  sheetOpen: boolean;

  setReady: () => void;
  toggleGene: (id: string) => void;
  setActive: (ids: string[]) => void;
  setFiction: (v: number) => void;
  setView: (v: View) => void;
  selectGene: (id: string | null) => void;
  hover: (h: LabState['hovered']) => void;
  toggle: (k: 'alien' | 'autoRotate' | 'creditsOpen' | 'sheetOpen') => void;
}

export const useLab = create<LabState>()((set, get) => ({
  ready: false,
  active: [],
  fiction: 0,
  alien: false,
  view: 'body',
  selectedGene: null,
  hovered: null,
  autoRotate: true,
  creditsOpen: false,
  sheetOpen: false,

  setReady: () => set({ ready: true }),
  toggleGene: (id) => {
    const on = !get().active.includes(id);
    const active = on ? [...get().active, id] : get().active.filter((g) => g !== id);
    // Switching a gene on shows the part of the body it changes.
    const visible = VIEW_SYSTEMS[get().view];
    const needsView = on && !GENE_BY_ID[id].visual.systems.some((s) => visible.includes(s));
    set({ active, ...(needsView ? { view: viewFor(id) } : {}) });
  },
  setActive: (active) => set({ active }),
  setFiction: (fiction) => set({ fiction: Math.min(1, Math.max(0, fiction)), alien: fiction < 0.5 ? false : get().alien }),
  setView: (view) => set({ view }),
  selectGene: (selectedGene) => set({ selectedGene }),
  hover: (hovered) => {
    if (get().hovered?.name !== hovered?.name) set({ hovered });
  },
  toggle: (k) => set({ [k]: !get()[k] } as Partial<LabState>),
}));

if (import.meta.env.DEV) (window as unknown as { __lab: typeof useLab }).__lab = useLab;
