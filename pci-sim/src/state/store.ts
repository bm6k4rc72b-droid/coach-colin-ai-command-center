/**
 * Single in-memory app state (the current Simulation plus UI flags) with a tiny subscribe/emit.
 */
import { Simulation } from '../procedure/sim';

export type AppEvent = 'new-case' | 'tool' | 'view' | 'debrief' | 'pause' | 'demo';

export interface UiState {
  started: boolean;
  paused: boolean;
  labels: boolean;
  follow: boolean;
  mentorOpen: boolean;
  sound: boolean;
  helpOpen: boolean;
  debriefOpen: boolean;
  /** Debrief was already shown automatically for this case. */
  debriefShown: boolean;
}

export interface Store {
  sim: Simulation;
  ui: UiState;
}

const listeners = new Map<AppEvent, Set<() => void>>();

export const store: Store = {
  sim: new Simulation(),
  ui: {
    started: false,
    paused: false,
    labels: true,
    follow: false,
    mentorOpen: true,
    sound: true,
    helpOpen: false,
    debriefOpen: false,
    debriefShown: false,
  },
};

export function subscribe(ev: AppEvent, fn: () => void): () => void {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev)!.add(fn);
  return () => listeners.get(ev)!.delete(fn);
}

export function emit(ev: AppEvent): void {
  listeners.get(ev)?.forEach((fn) => fn());
}

export function newCase(): void {
  store.sim = new Simulation({ seed: (Date.now() & 0xffff) + 1 }, store.sim.anat);
  store.ui.debriefOpen = false;
  store.ui.debriefShown = false;
  store.ui.paused = false;
  emit('new-case');
}
