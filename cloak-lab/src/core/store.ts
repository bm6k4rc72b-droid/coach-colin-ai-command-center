/** Single in-memory lab state shared by the views, with a tiny subscribe/emit. */
import type { Light } from '../config/lab';
import { DEVICES, NO_PROTECTION, type Protection } from './emp';
import { NO_CLOAK, type Loadout } from './spectrum';
import type { Tab } from './tour';

export interface LabState {
  tab: Tab;
  loadout: Loadout;
  light: Light;
  threat: number;
  protection: Record<string, Protection>;
  /** Cloak controller outcome from the most recent EMP lab pulse (or null). */
  lastPulseAt: number;
  quizAnswers: (number | null)[];
  budget: string[];
}

export const state: LabState = {
  tab: 'stack',
  loadout: { ...NO_CLOAK },
  light: 'day',
  threat: 0.6,
  protection: Object.fromEntries(DEVICES.map((d) => [d.id, { ...NO_PROTECTION }])),
  lastPulseAt: -1,
  quizAnswers: [],
  budget: ['mp-seg', 'plate'],
};

type Listener = () => void;
const listeners = new Set<Listener>();
export const subscribe = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const emit = () => listeners.forEach((f) => f());
