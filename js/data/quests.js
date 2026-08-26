/* ══════════════════════════════════════════════════════════════
   PRISM · quests & achievements

   Directives are drawn deterministically from the calendar day, so
   everyone on the same day sees the same three, and a refresh
   never rerolls them.
   ══════════════════════════════════════════════════════════════ */

P.quests = (function () {
  'use strict';

  const U = P.util;

  /* ── daily directives ─────────────────────────────────────── */
  /* need: how many ticks to complete. track: which event advances it. */

  const POOL = [
    { id: 'run3',     title: 'Run three missions',        note: 'Any agents, any missions.',        need: 3, track: 'run',        xp: 60 },
    { id: 'two',      title: 'Use two different agents',  note: 'Variety keeps the spectrum open.', need: 2, track: 'agentUnique', xp: 55 },
    { id: 'copy',     title: 'Actually use something',    note: 'Copy one output to your clipboard.', need: 1, track: 'copy',     xp: 40 },
    { id: 'refine',   title: 'Refine an output twice',    note: 'Push a result until it fits.',     need: 2, track: 'refine',     xp: 50 },
    { id: 'beam',     title: 'Use the beam',              note: 'Type what you need and let PRISM route it.', need: 1, track: 'beam', xp: 35 },
    { id: 'combo3',   title: 'Reach a ×2.0 chain',        note: 'Keep moving without stopping.',    need: 1, track: 'combo2',     xp: 65 },
    { id: 'newagent', title: 'Meet an agent you have never used', note: 'First contact counts.',    need: 1, track: 'firstTouch',  xp: 70 },
    { id: 'deep',     title: 'Run two missions with one agent', note: 'Depth, not just breadth.',   need: 2, track: 'agentRepeat', xp: 55 },
    { id: 'write',    title: 'Create something to publish', note: 'Any VERSE mission.',             need: 1, track: 'agent:verse', xp: 45 },
    { id: 'money',    title: 'Look at your numbers',      note: 'Any LEDGER or CIPHER mission.',    need: 1, track: 'agent:money', xp: 45 }
  ];

  /** Three directives for a given local day key, stable across reloads. */
  function forDay(dayKey, unlockedIds) {
    const rnd = U.rng('prism-directives-' + dayKey);

    // Only offer agent-specific directives the player can actually reach.
    const has = id => unlockedIds.indexOf(id) !== -1;
    const eligible = POOL.filter(q => {
      if (q.track === 'agent:verse') return has('verse');
      if (q.track === 'agent:money') return has('ledger') || has('cipher');
      if (q.track === 'firstTouch')  return unlockedIds.length > 1;
      return true;
    });

    return U.sample(eligible, 3, rnd);
  }

  const byId = id => POOL.find(q => q.id === id) || null;

  /* ── achievements ─────────────────────────────────────────── */
  /* test(state, ctx) → boolean. ctx carries the just-happened event. */

  const ACHIEVEMENTS = [
    { id: 'first-light', ico: '✦', name: 'First Light',      desc: 'Ran your first mission.',
      hue: 190, test: s => s.runs >= 1 },
    { id: 'ten',         ico: '◈', name: 'Ten Down',          desc: 'Ten missions completed.',
      hue: 190, test: s => s.runs >= 10 },
    { id: 'fifty',       ico: '❋', name: 'Half a Hundred',    desc: 'Fifty missions completed.',
      hue: 265, test: s => s.runs >= 50 },
    { id: 'century',     ico: '✺', name: 'Century',           desc: 'One hundred missions.',
      hue: 315, test: s => s.runs >= 100 },

    { id: 'spectrum-3',  ico: '△', name: 'Three Facets',      desc: 'Used three different agents.',
      hue: 200, test: s => Object.keys(s.agentRuns).length >= 3 },
    { id: 'spectrum-6',  ico: '◇', name: 'Wide Spectrum',     desc: 'Used six different agents.',
      hue: 265, test: s => Object.keys(s.agentRuns).length >= 6 },
    { id: 'spectrum-all',ico: '◉', name: 'Full Spectrum',     desc: 'Used every agent at least once.',
      hue: 315, test: s => Object.keys(s.agentRuns).length >= P.agents.list.length },

    { id: 'streak-3',    ico: '◆', name: 'Three Days',        desc: 'A three-day streak.',
      hue: 32,  test: s => s.streak >= 3 || s.bestStreak >= 3 },
    { id: 'streak-7',    ico: '◆', name: 'Full Week',         desc: 'A seven-day streak.',
      hue: 32,  test: s => s.streak >= 7 || s.bestStreak >= 7 },
    { id: 'streak-30',   ico: '❖', name: 'Thirty Days',       desc: 'A thirty-day streak.',
      hue: 15,  test: s => s.streak >= 30 || s.bestStreak >= 30 },

    { id: 'combo-2',     ico: '✧', name: 'Momentum',          desc: 'Reached a ×2.0 chain.',
      hue: 300, test: (s, c) => c.combo >= 2 },
    { id: 'combo-25',    ico: '✸', name: 'Runaway Chain',     desc: 'Reached the ×2.5 ceiling.',
      hue: 300, test: (s, c) => c.combo >= 2.5 },

    { id: 'mastery-1',   ico: '▲', name: 'Calibrated',        desc: 'Reached mastery 2 with any agent.',
      hue: 172, test: s => Object.values(s.agentRuns).some(n => P.agents.masteryOf(n) >= 2) },
    { id: 'mastery-5',   ico: '★', name: 'Harmonic',          desc: 'Reached mastery 5 with any agent.',
      hue: 45,  test: s => Object.values(s.agentRuns).some(n => P.agents.masteryOf(n) >= 5) },

    { id: 'level-5',     ico: '▮', name: 'Operator',          desc: 'Reached level 5.',
      hue: 200, test: s => s.level >= 5 },
    { id: 'level-10',    ico: '▰', name: 'Architect',         desc: 'Reached level 10.',
      hue: 265, test: s => s.level >= 10 },
    { id: 'level-20',    ico: '⬢', name: 'Prism Sovereign',   desc: 'Reached level 20.',
      hue: 315, test: s => s.level >= 20 },

    { id: 'copy-10',     ico: '⧉', name: 'Put to Work',       desc: 'Copied ten outputs.',
      hue: 142, test: s => s.copies >= 10 },
    { id: 'refine-10',   ico: '↻', name: 'Never Satisfied',   desc: 'Refined ten outputs.',
      hue: 142, test: s => s.refines >= 10 },

    { id: 'quest-day',   ico: '✔', name: 'Clean Sweep',       desc: 'Cleared all three directives in a day.',
      hue: 150, test: (s, c) => c.allQuests === true },
    { id: 'deep-dive',   ico: '⬗', name: 'Deep Dive',         desc: 'Ran one agent twenty times.',
      hue: 172, test: s => Object.values(s.agentRuns).some(n => n >= 20) },
    { id: 'night-owl',   ico: '☾', name: 'Night Shift',       desc: 'Ran a mission after midnight.',
      hue: 265, test: () => { const h = new Date().getHours(); return h >= 0 && h < 5; } },
    { id: 'early-bird',  ico: '☀', name: 'Before the Alarm',  desc: 'Ran a mission before 6am.',
      hue: 45,  test: () => { const h = new Date().getHours(); return h >= 5 && h < 7; } },
    { id: 'live-link',   ico: '⌁', name: 'Live Link',         desc: 'Connected PRISM to a Claude model.',
      hue: 190, test: (s, c) => c.live === true }
  ];

  return { POOL, forDay, byId, ACHIEVEMENTS };
})();
