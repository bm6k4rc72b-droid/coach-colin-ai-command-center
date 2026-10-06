/**
 * App-wide state, persistence and a tiny event bus.
 *
 * @module vulture/state
 */

import { Camera } from './sources.js';
import { KineticsEngine } from './kinetics.js';
import { DEFAULT_RULES } from './alerts.js';

const KEY = 'vulture.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  detectFps: 6,
  minScore: 0.35,
  coverMin: 0.35,
  enterS: 2,
  exitS: 4,
  poseModel: 'lite',
  massKg: 75,
  heightM: 1.75,
  exercise: 'squat',
  treadmillKmh: 0,
  webhookUrl: '',
  webhookFormat: 'json',
  notify: false,
  sound: true,
  snapshots: true,
});

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

export const state = {
  cameras: /** @type {Camera[]} */ ([]),
  selectedId: null,
  settings: { ...DEFAULT_SETTINGS },
  rules: DEFAULT_RULES.map((r) => ({ ...r, params: { ...r.params } })),
  pipelines: new Map(), // camId → { tracker, lot, dets, tracks, lastDet, ms }
  events: [], // alert/event log, newest first
  kin: new KineticsEngine(),
  kinFrame: null,
  posePaused: false,
  bootedAt: Date.now(),
  route: null,
  gps: null,
  perf: { fps: 0, detMs: 0, poseMs: 0 },
};

export function selected() {
  return state.cameras.find((c) => c.id === state.selectedId) ?? state.cameras[0] ?? null;
}

/** Save configuration (cameras, zones, settings, rules) and recent history. */
export function persist() {
  try {
    const history = {};
    for (const [id, p] of state.pipelines) history[id] = p.lot.samples.slice(-2880);
    localStorage.setItem(KEY, JSON.stringify({
      cameras: state.cameras.map((c) => c.toJSON()),
      selectedId: state.selectedId,
      settings: state.settings,
      rules: state.rules,
      events: state.events.slice(0, 200).map(({ snapshot, ...e }) => e),
      history,
    }));
  } catch { /* storage full or blocked: keep running in memory */ }
}

/** @returns {object|null} Saved blob. */
export function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSaved() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
