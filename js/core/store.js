/* ══════════════════════════════════════════════════════════════
   PRISM · store — durable state with an in-memory fallback

   localStorage throws in private windows and in some file://
   configurations, so every access is guarded and the app keeps
   working (for the session) even when nothing can be persisted.
   ══════════════════════════════════════════════════════════════ */

P.store = (function () {
  'use strict';

  const KEY = 'prism.state.v1';

  const DEFAULTS = () => ({
    version: 1,
    createdAt: Date.now(),
    xp: 0,
    level: 1,
    streak: 0,
    bestStreak: 0,
    lastActiveDay: null,
    runs: 0,
    copies: 0,
    refines: 0,
    agentRuns: {},        // agentId → run count (drives mastery)
    agentSeen: {},        // agentId → first-touch timestamp
    unlocked: [],         // agentIds unlocked beyond the starting set
    achievements: [],     // achievement ids earned
    quests: { day: null, ids: [], progress: {}, claimed: [] },
    archive: [],          // recent outputs, newest first (capped)
    prefs: {
      sound: false,
      motion: true,
      liveLink: false,
      linkMode: 'proxy',  // 'proxy' | 'direct'
      endpoint: '',
      apiKey: '',
      model: 'claude-opus-5'
    }
  });

  let memory = null;      // fallback when storage is unavailable
  let usable = true;

  function read() {
    if (!usable) return memory;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      usable = false;
      return memory;
    }
  }

  function write(state) {
    if (usable) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (_) {
        usable = false;
      }
    }
    memory = state;
    return false;
  }

  /** Shallow-merge saved state over defaults so new keys appear on upgrade. */
  function hydrate() {
    const saved = read();
    const base = DEFAULTS();
    if (!saved) return base;
    const merged = Object.assign(base, saved);
    merged.prefs = Object.assign(base.prefs, saved.prefs || {});
    merged.quests = Object.assign(base.quests, saved.quests || {});
    return merged;
  }

  let state = hydrate();
  const listeners = new Set();

  function emit() { listeners.forEach(fn => fn(state)); }

  return {
    get: () => state,

    /** Mutate through a callback, then persist and notify. */
    update(fn) {
      fn(state);
      write(state);
      emit();
      return state;
    },

    save() { write(state); emit(); },

    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    reset() {
      state = DEFAULTS();
      memory = null;
      if (usable) { try { localStorage.removeItem(KEY); } catch (_) {} }
      write(state);
      emit();
      return state;
    },

    /** False when we are running memory-only (private window, blocked storage). */
    isPersistent: () => usable,

    export() { return JSON.stringify(state, null, 2); },

    import(json) {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object') throw new Error('Not a PRISM save file.');
      state = Object.assign(DEFAULTS(), parsed);
      state.prefs = Object.assign(DEFAULTS().prefs, parsed.prefs || {});
      write(state);
      emit();
      return state;
    }
  };
})();
