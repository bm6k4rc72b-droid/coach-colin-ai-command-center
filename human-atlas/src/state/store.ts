import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { SYSTEM_IDS } from '../types';
import type { Manifest, ManifestEntry, SystemId } from '../types';
import type { CollectionId, SideFilter } from '../data/collections';

export type Tool = 'orbit' | 'pan';

export interface AtlasState {
  manifest: Manifest | null;
  byId: Map<string, ManifestEntry>;
  /** Systems whose GLB has finished loading. */
  loaded: Partial<Record<SystemId, boolean>>;

  visible: Record<SystemId, boolean>;
  hoveredId: string | null;
  selectedId: string | null;
  isolated: boolean;
  /** Target explode amount 0..1 (the scene animates toward it). */
  explode: number;
  /** True while the user drags the slider (scene follows instead of easing). */
  scrubbing: boolean;
  collection: CollectionId | null;
  side: SideFilter;
  tool: Tool;
  creditsOpen: boolean;
  mobileLayersOpen: boolean;

  setManifest: (m: Manifest) => void;
  markLoaded: (s: SystemId) => void;
  setVisible: (s: SystemId, on: boolean) => void;
  setVisibleSet: (on: SystemId[]) => void;
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
  setIsolated: (on: boolean) => void;
  setExplode: (v: number, scrubbing?: boolean) => void;
  setCollection: (c: CollectionId | null) => void;
  setSide: (s: SideFilter) => void;
  setTool: (t: Tool) => void;
  setCreditsOpen: (open: boolean) => void;
  setMobileLayersOpen: (open: boolean) => void;
}

const allOn = Object.fromEntries(SYSTEM_IDS.map((s) => [s, true])) as Record<SystemId, boolean>;

export const useAtlas = create<AtlasState>()(
  subscribeWithSelector((set, get) => ({
    manifest: null,
    byId: new Map(),
    loaded: {},
    visible: allOn,
    hoveredId: null,
    selectedId: null,
    isolated: false,
    explode: 0,
    scrubbing: false,
    collection: null,
    side: 'both',
    tool: 'orbit',
    creditsOpen: false,
    mobileLayersOpen: false,

    setManifest: (m) => set({ manifest: m, byId: new Map(m.pieces.map((p) => [p.id, p])) }),
    markLoaded: (s) => set((st) => ({ loaded: { ...st.loaded, [s]: true } })),
    setVisible: (s, on) => set((st) => ({ visible: { ...st.visible, [s]: on } })),
    setVisibleSet: (on) =>
      set({ visible: Object.fromEntries(SYSTEM_IDS.map((s) => [s, on.includes(s)])) as Record<SystemId, boolean> }),
    hover: (id) => {
      if (get().hoveredId !== id) set({ hoveredId: id });
    },
    select: (id) => {
      const st = get();
      if (id === null) {
        set({ selectedId: null, isolated: false });
        return;
      }
      const p = st.byId.get(id);
      // Selecting a structure from a hidden system turns that system back on.
      if (p && !st.visible[p.system]) set({ visible: { ...st.visible, [p.system]: true } });
      set({ selectedId: id, isolated: st.isolated && st.selectedId === id });
    },
    setIsolated: (on) => set({ isolated: on && get().selectedId !== null }),
    setExplode: (v, scrubbing = false) => set({ explode: Math.min(1, Math.max(0, v)), scrubbing }),
    setCollection: (c) => set({ collection: c, isolated: false, selectedId: null, explode: c ? 1 : 0 }),
    setSide: (s) => set({ side: s }),
    setTool: (t) => set({ tool: t }),
    setCreditsOpen: (open) => set({ creditsOpen: open }),
    setMobileLayersOpen: (open) => set({ mobileLayersOpen: open }),
  })),
);

// Exposed in development for QA scripts and debugging.
if (import.meta.env.DEV) (window as unknown as { __atlas: typeof useAtlas }).__atlas = useAtlas;
