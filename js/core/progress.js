/* ══════════════════════════════════════════════════════════════
   PRISM · progress — XP, ranks, streaks, chains, directives

   The loop, deliberately: every action pays out immediately (XP +
   a visible chain multiplier), the day pays out on top (streak +
   three directives), and the week pays out in unlocks (new agents,
   new missions). Nothing here gates the useful work behind a wall
   — locked agents are extra range, never a paywall on the basics.
   ══════════════════════════════════════════════════════════════ */

P.progress = (function () {
  'use strict';

  const U = P.util, S = P.store;

  /* ── ranks ────────────────────────────────────────────────── */

  const RANKS = [
    'Initiate', 'Signal', 'Operator', 'Refractor', 'Analyst',
    'Conductor', 'Architect', 'Cartographer', 'Luminary', 'Overseer',
    'Prism Sovereign'
  ];

  /** XP needed to move from level n to n+1. */
  const need = n => Math.round(70 + 46 * Math.pow(n, 1.35));

  /** Total XP required to have reached level n. */
  function totalFor(level) {
    let t = 0;
    for (let i = 1; i < level; i++) t += need(i);
    return t;
  }

  function rankFor(level) {
    return RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2.5))];
  }

  /** Everything the HUD needs about where you are. */
  function standing(state) {
    const s = state || S.get();
    const base = totalFor(s.level);
    const span = need(s.level);
    const into = s.xp - base;
    return {
      level: s.level,
      rank: rankFor(s.level),
      into: Math.max(0, into),
      span,
      pct: U.clamp(into / span, 0, 1),
      toNext: Math.max(0, span - into)
    };
  }

  /* ── unlocks ──────────────────────────────────────────────── */

  function unlockedIds(state) {
    const s = state || S.get();
    return P.agents.list
      .filter(a => s.level >= a.unlock.level || s.unlocked.indexOf(a.id) !== -1)
      .map(a => a.id);
  }

  const isUnlocked = (agentId, state) => unlockedIds(state).indexOf(agentId) !== -1;

  /* ── the chain (combo) ────────────────────────────────────── */
  /* Chains are session-only on purpose — you should not be able to
     bank a multiplier overnight, or the streak stops meaning much. */

  const CHAIN_WINDOW = 180000;  // 3 minutes to keep it alive
  const CHAIN_MAX    = 2.5;

  let chain = { mult: 1, last: 0, timer: null };
  const chainListeners = new Set();

  function chainNotify() {
    const remain = chain.last ? Math.max(0, CHAIN_WINDOW - (Date.now() - chain.last)) : 0;
    chainListeners.forEach(fn => fn({
      mult: chain.mult,
      live: chain.mult > 1,
      remain,
      frac: remain / CHAIN_WINDOW
    }));
  }

  function chainBump() {
    const now = Date.now();
    if (chain.last && now - chain.last > CHAIN_WINDOW) chain.mult = 1;
    chain.mult = Math.min(CHAIN_MAX, U.round1(chain.mult + 0.3));
    chain.last = now;

    clearTimeout(chain.timer);
    chain.timer = setTimeout(() => { chain.mult = 1; chain.last = 0; chainNotify(); }, CHAIN_WINDOW);
    chainNotify();
    return chain.mult;
  }

  const chainState = () => ({ mult: chain.mult, live: chain.mult > 1 });
  const onChain = fn => { chainListeners.add(fn); return () => chainListeners.delete(fn); };

  // Keep the decay bar honest while nothing else is happening.
  setInterval(() => { if (chain.mult > 1) chainNotify(); }, 1000);

  /* ── daily roll: streak + directives ──────────────────────── */

  /** Called once at boot and again whenever an action lands. */
  function touchDay() {
    const today = U.dayKey();
    const out = { newDay: false, streakBroken: false, streak: 0 };

    S.update(s => {
      if (s.lastActiveDay !== today) {
        const gap = s.lastActiveDay ? U.daysBetween(s.lastActiveDay, today) : null;
        if (gap === 1) s.streak += 1;
        else if (gap === null) s.streak = 1;
        else { out.streakBroken = s.streak > 1; s.streak = 1; }

        s.lastActiveDay = today;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        out.newDay = true;
      }
      out.streak = s.streak;

      // Roll a fresh set of directives when the day turns over.
      if (s.quests.day !== today) {
        s.quests = {
          day: today,
          ids: P.quests.forDay(today, unlockedIds(s)).map(q => q.id),
          progress: {},
          claimed: []
        };
      }
    });

    return out;
  }

  /** The day's three directives, with live progress attached. */
  function directives() {
    const s = S.get();
    return s.quests.ids.map(id => {
      const q = P.quests.byId(id);
      if (!q) return null;
      const have = s.quests.progress[id] || 0;
      return {
        ...q,
        have: Math.min(have, q.need),
        done: s.quests.claimed.indexOf(id) !== -1
      };
    }).filter(Boolean);
  }

  /**
   * Advance any directive listening for `track`.
   * Returns the directives that just completed, so the UI can celebrate.
   */
  function advanceQuests(track, amount) {
    const finished = [];
    S.update(s => {
      s.quests.ids.forEach(id => {
        const q = P.quests.byId(id);
        if (!q || q.track !== track) return;
        if (s.quests.claimed.indexOf(id) !== -1) return;

        const next = (s.quests.progress[id] || 0) + (amount || 1);
        s.quests.progress[id] = next;

        if (next >= q.need) {
          s.quests.claimed.push(id);
          s.xp += q.xp;
          finished.push(q);
        }
      });
    });
    return finished;
  }

  /* ── awarding XP ──────────────────────────────────────────── */

  const events = new Set();
  const emit = payload => events.forEach(fn => fn(payload));
  const on = fn => { events.add(fn); return () => events.delete(fn); };

  /**
   * Grant XP and settle every knock-on effect in one place:
   * level-ups, newly unlocked agents, achievements.
   */
  function award(amount, reason, ctx) {
    const before = S.get().level;
    let levelled = [];

    S.update(s => { s.xp += Math.round(amount); });

    // Level up as many times as the XP allows.
    S.update(s => {
      while (s.xp >= totalFor(s.level + 1)) {
        s.level += 1;
        levelled.push(s.level);
      }
    });

    const after = S.get().level;
    const freshAgents = levelled.length
      ? P.agents.list.filter(a => a.unlock.level > before && a.unlock.level <= after)
      : [];

    const badges = checkAchievements(ctx || {});

    const payload = { amount: Math.round(amount), reason, levelled, freshAgents, badges };
    emit(payload);
    return payload;
  }

  /* ── achievements ─────────────────────────────────────────── */

  function checkAchievements(ctx) {
    const earned = [];
    const s = S.get();
    P.quests.ACHIEVEMENTS.forEach(a => {
      if (s.achievements.indexOf(a.id) !== -1) return;
      let ok = false;
      try { ok = !!a.test(s, ctx || {}); } catch (_) { ok = false; }
      if (ok) earned.push(a);
    });

    if (earned.length) {
      S.update(st => { earned.forEach(a => st.achievements.push(a.id)); });
    }
    return earned;
  }

  /* ── the one call the app makes after a mission ───────────── */

  /**
   * Record a completed mission run and pay out everything it earns.
   * Returns { xp, mult, levelled, freshAgents, badges, quests }.
   */
  function recordRun(agentId, mission, meta) {
    const info = meta || {};
    touchDay();

    const first = !S.get().agentSeen[agentId];
    const mult = chainBump();

    let base = mission.xp || 40;
    if (first) base += 30;                       // first contact bonus
    if (info.live) base += 8;                    // live model runs cost you something
    const gained = Math.round(base * mult);

    S.update(s => {
      s.runs += 1;
      s.agentRuns[agentId] = (s.agentRuns[agentId] || 0) + 1;
      if (!s.agentSeen[agentId]) s.agentSeen[agentId] = Date.now();
    });

    // Directives that a run can satisfy.
    const doneQuests = []
      .concat(advanceQuests('run', 1))
      .concat(first ? advanceQuests('firstTouch', 1) : [])
      .concat(info.viaBeam ? advanceQuests('beam', 1) : [])
      .concat(mult >= 2 ? advanceQuests('combo2', 1) : [])
      .concat(agentId === 'verse' ? advanceQuests('agent:verse', 1) : [])
      .concat((agentId === 'ledger' || agentId === 'cipher') ? advanceQuests('agent:money', 1) : [])
      .concat(uniqueAgentQuest())
      .concat(repeatAgentQuest(agentId));

    const s = S.get();
    const allQuests = s.quests.ids.length > 0 && s.quests.ids.every(id => s.quests.claimed.indexOf(id) !== -1);

    const res = award(gained, 'mission', { combo: mult, allQuests, live: !!info.live });

    return {
      xp: gained, mult, first,
      levelled: res.levelled,
      freshAgents: res.freshAgents,
      badges: res.badges,
      quests: doneQuests
    };
  }

  /* Directives that need a look at history rather than a single event. */

  function uniqueAgentQuest() {
    const s = S.get();
    const uniq = Object.keys(s.agentRuns).length;
    const id = s.quests.ids.find(i => (P.quests.byId(i) || {}).track === 'agentUnique');
    if (!id || s.quests.claimed.indexOf(id) !== -1) return [];
    const q = P.quests.byId(id);
    const done = [];
    S.update(st => {
      st.quests.progress[id] = uniq;
      if (uniq >= q.need) { st.quests.claimed.push(id); st.xp += q.xp; done.push(q); }
    });
    return done;
  }

  function repeatAgentQuest(agentId) {
    const s = S.get();
    const id = s.quests.ids.find(i => (P.quests.byId(i) || {}).track === 'agentRepeat');
    if (!id || s.quests.claimed.indexOf(id) !== -1) return [];
    const q = P.quests.byId(id);
    const runsToday = s.agentRuns[agentId] || 0;
    const best = Math.max(runsToday, s.quests.progress[id] || 0);
    const done = [];
    S.update(st => {
      st.quests.progress[id] = best;
      if (best >= q.need) { st.quests.claimed.push(id); st.xp += q.xp; done.push(q); }
    });
    return done;
  }

  /** Small side actions worth a nudge of XP. */
  function recordSide(kind) {
    touchDay();
    let xp = 0, quests = [];

    if (kind === 'copy') {
      S.update(s => { s.copies += 1; });
      quests = advanceQuests('copy', 1);
      xp = 10;
    } else if (kind === 'refine') {
      S.update(s => { s.refines += 1; });
      quests = advanceQuests('refine', 1);
      xp = 14;
    }

    const res = award(xp, kind, { combo: chain.mult });
    return { xp, quests, badges: res.badges, levelled: res.levelled };
  }

  /* ── suggestions: the "what next" engine ──────────────────── */

  /**
   * Three next-best moves, chosen to pull the player toward whatever
   * is closest to paying out — an unlock, a directive, or a mastery tier.
   */
  function suggestions() {
    const s = S.get();
    const open = unlockedIds(s);
    const out = [];

    // 1. An unclaimed directive that maps onto a concrete agent.
    const pending = directives().filter(d => !d.done);
    pending.forEach(d => {
      if (out.length >= 1) return;
      let agentId = null;
      if (d.track === 'agent:verse') agentId = 'verse';
      else if (d.track === 'agent:money') agentId = open.indexOf('cipher') !== -1 ? 'cipher' : 'ledger';
      else if (d.track === 'firstTouch') agentId = open.find(id => !s.agentRuns[id]);
      if (agentId && P.agents.byId[agentId]) {
        const a = P.agents.byId[agentId];
        out.push({
          tag: 'directive', hue: a.hue, agentId, missionId: a.missions[0].id,
          title: a.missions[0].title,
          why: d.title + ' — ' + (d.need - d.have) + ' to go',
          xp: d.xp
        });
      }
    });

    // 2. The agent you have never touched.
    const untouched = open.filter(id => !s.agentRuns[id]);
    if (untouched.length && out.length < 3) {
      const a = P.agents.byId[untouched[0]];
      out.push({
        tag: 'first contact', hue: a.hue, agentId: a.id, missionId: a.missions[0].id,
        title: a.name + ' · ' + a.missions[0].title,
        why: a.line,
        xp: (a.missions[0].xp || 40) + 30
      });
    }

    // 3. The mastery tier you are closest to cracking.
    if (out.length < 3) {
      const near = open
        .map(id => ({ id, runs: s.agentRuns[id] || 0 }))
        .filter(x => x.runs > 0 && P.agents.masteryOf(x.runs) < 5)
        .sort((a, b) => P.agents.masteryProgress(b.runs) - P.agents.masteryProgress(a.runs))[0];
      if (near) {
        const a = P.agents.byId[near.id];
        const m = P.agents.masteryOf(near.runs);
        const togo = P.agents.MASTERY_STEPS[m + 1] - near.runs;
        out.push({
          tag: 'mastery', hue: a.hue, agentId: a.id,
          missionId: a.missions[Math.min(1, a.missions.length - 1)].id,
          title: a.name + ' → ' + P.agents.MASTERY_NAMES[m + 1],
          why: togo + ' more run' + (togo === 1 ? '' : 's') + ' to the next tier',
          xp: a.missions[0].xp || 40
        });
      }
    }

    // 4. Fill any gap with the nearest locked agent as a carrot.
    if (out.length < 3) {
      const locked = P.agents.list.filter(a => open.indexOf(a.id) === -1)
        .sort((a, b) => a.unlock.level - b.unlock.level)[0];
      if (locked) {
        const st = standing(s);
        out.push({
          tag: 'locked', hue: locked.hue, locked: true,
          title: locked.name + ' · ' + locked.role,
          why: 'Unlocks at level ' + locked.unlock.level + ' — ' + st.toNext + ' XP to level ' + (s.level + 1),
          xp: 0
        });
      }
    }

    // 5. Last resort: a solid default.
    while (out.length < 3) {
      const a = P.agents.byId[open[out.length % open.length]];
      const m = a.missions[0];
      out.push({ tag: 'try', hue: a.hue, agentId: a.id, missionId: m.id, title: a.name + ' · ' + m.title, why: m.gives, xp: m.xp });
    }

    return out.slice(0, 3);
  }

  return {
    RANKS, need, totalFor, rankFor, standing,
    unlockedIds, isUnlocked,
    chainBump, chainState, onChain, CHAIN_MAX,
    touchDay, directives, advanceQuests,
    award, checkAchievements, recordRun, recordSide,
    suggestions, on
  };
})();
