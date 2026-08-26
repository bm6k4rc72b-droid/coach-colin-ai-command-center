/* ══════════════════════════════════════════════════════════════
   PRISM · app — boot, routing, HUD, celebrations
   ══════════════════════════════════════════════════════════════ */

P.app = (function () {
  'use strict';

  const U = P.util, S = P.store, PR = P.progress, V = P.views;
  const { el, clear } = U;

  let current = 'deck';

  /* ══════════════════════════════════════════════════════════
     Transient UI
     ══════════════════════════════════════════════════════════ */

  function toast(text, ico) {
    const host = U.$('#toasts');
    const node = el('div.toast', el('span.toast__ico', ico || '◆'), el('span', text));
    host.append(node);
    setTimeout(() => {
      node.classList.add('toast--out');
      setTimeout(() => node.remove(), 400);
    }, 3200);
  }

  /** Big centre-screen pop for the things worth stopping for. */
  function pop(kicker, value, note, hue) {
    const host = U.$('#rewards');
    const node = el('div.pop', { style: { '--hue': hue || 190 } },
      el('div.pop__k', kicker),
      el('div.pop__v', value),
      note ? el('div.pop__n', note) : null);
    host.append(node);
    setTimeout(() => node.remove(), 2500);
  }

  /** Queue payouts so three things happening at once do not overlap. */
  const queue = [];
  let draining = false;

  function enqueue(fn, delay) {
    queue.push({ fn, delay: delay || 900 });
    if (!draining) drain();
  }

  async function drain() {
    draining = true;
    while (queue.length) {
      const job = queue.shift();
      job.fn();
      await U.wait(job.delay);
    }
    draining = false;
  }

  /**
   * Show everything a single action earned: XP, directives cleared,
   * levels gained, agents unlocked, badges. Order matters — smallest
   * first so the biggest reward lands last.
   */
  function celebrate(res) {
    if (!res) return;

    if (res.xp) {
      const chain = res.mult && res.mult > 1 ? ' ×' + res.mult.toFixed(1) : '';
      toast('+' + res.xp + ' XP' + chain, '✦');
    }

    (res.quests || []).forEach(q => {
      enqueue(() => {
        pop('directive cleared', q.title, '+' + q.xp + ' XP', 150);
        P.fx.sfx.reward();
      }, 1400);
    });

    (res.levelled || []).forEach(lv => {
      enqueue(() => {
        pop('level ' + lv, PR.rankFor(lv), 'rank advanced', 190);
        P.fx.sfx.reward();
      }, 1600);
    });

    (res.freshAgents || []).forEach(a => {
      enqueue(() => {
        pop('facet unsealed', a.name, a.role, a.hue);
        P.fx.sfx.reward();
        toast(a.name + ' is now on your deck', '◈');
      }, 1800);
    });

    (res.badges || []).forEach(b => {
      enqueue(() => {
        pop('badge', b.name, b.desc, b.hue);
        P.fx.sfx.reward();
      }, 1500);
    });

    syncHud();
    if ((res.freshAgents || []).length && current === 'deck') enqueue(() => V.renderDeck(), 100);
  }

  function modal(title, sub, node, actions) {
    const host = U.$('#modal');
    clear(host);
    host.hidden = false;

    const acts = el('div.modal__acts',
      el('button.btn.btn--ghost', { type: 'button', 'data-close': '1' }, 'Close'),
      ...(actions || []).map(a => {
        const b = el('button.btn' + (a.primary ? '.btn--go' : '.btn--ghost') + (a.danger ? '.danger' : ''),
          { type: 'button' }, a.label);
        b.addEventListener('click', () => { a.act(); close(); });
        return b;
      })
    );

    const box = el('div.modal__box.holo',
      el('h3', title),
      sub ? el('p', sub) : null,
      node || null,
      acts);

    function close() { host.hidden = true; clear(host); }

    host.append(box);
    host.addEventListener('click', e => {
      if (e.target === host || (e.target.getAttribute && e.target.getAttribute('data-close'))) close();
    });

    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    return close;
  }

  /* ══════════════════════════════════════════════════════════
     Archive
     ══════════════════════════════════════════════════════════ */

  function archive(doc, ctx) {
    S.update(s => {
      s.archive.unshift({
        at: Date.now(),
        agentId: ctx.agentId,
        missionId: ctx.missionId,
        title: doc.title,
        subtitle: doc.subtitle,
        inputs: ctx.inputs,
        doc
      });
      // Keep the save file small — sixty is well past what anyone scrolls.
      if (s.archive.length > 60) s.archive.length = 60;
    });
  }

  /* ══════════════════════════════════════════════════════════
     HUD
     ══════════════════════════════════════════════════════════ */

  function syncHud() {
    const s = S.get();
    const st = PR.standing(s);

    U.$('#hud-level').textContent = String(st.level);
    U.$('#hud-rankname').textContent = st.rank;
    U.$('#hud-xp').textContent = st.into + ' / ' + st.span + ' XP';
    U.$('#hud-ring').style.setProperty('--pct', st.pct.toFixed(3));

    U.$('#streak-n').textContent = String(s.streak);
    U.$('#hud-streak').setAttribute('data-hot', s.streak >= 3 ? '1' : '0');

    const ds = PR.directives();
    const done = ds.filter(d => d.done).length;
    U.$('#quest-n').textContent = done + '/' + ds.length;
    U.$('#hud-quests').setAttribute('data-done', done === ds.length && ds.length ? '1' : '0');
  }

  function syncChain(c) {
    const chip = U.$('#hud-combo');
    U.$('#combo-x').textContent = '×' + c.mult.toFixed(1);
    chip.setAttribute('data-live', c.live ? '1' : '0');
    U.$('#combo-decay').style.transform = 'scaleX(' + (c.live ? c.frac : 0).toFixed(3) + ')';
  }

  /* ══════════════════════════════════════════════════════════
     Routing
     ══════════════════════════════════════════════════════════ */

  const VIEWS = ['deck', 'agent', 'progress', 'archive', 'settings'];

  function go(view, opts) {
    const o = opts || {};
    if (VIEWS.indexOf(view) === -1) view = 'deck';
    current = view;

    VIEWS.forEach(v => { U.$('#view-' + v).hidden = v !== view; });
    U.$$('.hud__nav .iconbtn').forEach(b =>
      b.setAttribute('aria-current', String(b.getAttribute('data-nav') === view)));

    if (view !== 'agent') document.documentElement.style.setProperty('--hue', 190);

    if (view === 'deck')     V.renderDeck();
    if (view === 'agent')    V.renderAgent(o.agentId, o);
    if (view === 'progress') V.renderProgress();
    if (view === 'archive')  V.renderArchive();
    if (view === 'settings') V.renderSettings();

    const hash = view === 'agent' ? '#/agent/' + o.agentId : '#/' + view;
    if (location.hash !== hash) history.replaceState(null, '', hash);

    window.scrollTo({ top: 0, behavior: U.reduceMotion() ? 'auto' : 'smooth' });
    syncHud();
  }

  function fromHash() {
    const m = (location.hash || '').match(/^#\/agent\/([a-z]+)/);
    if (m && P.agents.byId[m[1]] && PR.isUnlocked(m[1])) return { view: 'agent', agentId: m[1] };
    const v = (location.hash || '').replace('#/', '');
    return { view: VIEWS.indexOf(v) !== -1 ? v : 'deck' };
  }

  /* ══════════════════════════════════════════════════════════
     The beam
     ══════════════════════════════════════════════════════════ */

  function refract(text) {
    const q = String(text || '').trim();
    if (!q) return;

    const hits = P.engine.route(q);

    if (!hits.length) {
      toast('Nothing matched — try naming what you want to make', '?');
      P.fx.sfx.error();
      return;
    }

    const open = hits.filter(h => !h.locked);
    const sealed = hits.filter(h => h.locked);

    // Either nothing usable matched, or a sealed facet is a far better
    // answer than anything open. Say which facet owns this and what it
    // costs, rather than quietly routing to a weak second choice.
    const outranked = sealed.length && open.length && sealed[0].score >= open[0].score * 1.5;

    if (!open.length || outranked) {
      const best = sealed[0];
      const st = PR.standing();
      modal(
        best.agent.name + ' handles this',
        '“' + q + '” is ' + best.agent.role.toLowerCase() + ' — that facet unseals at level ' +
        best.agent.unlock.level + '. You are level ' + st.level + ', ' + st.toNext + ' XP off level ' + (st.level + 1) + '.',
        el('p', { style: { color: 'var(--ink-3)', fontSize: '13.5px' } },
          'Every mission you run gets you there. Nothing is paywalled — the facets are extra range, not the basics.')
      );
      P.fx.sfx.error();
      return;
    }

    // One clear winner goes straight through; a close call asks.
    if (open.length === 1 || open[0].score >= open[1].score * 1.6) {
      const hit = open[0];
      P.fx.sfx.open();
      go('agent', {
        agentId: hit.agentId,
        missionId: hit.missionId,
        prefill: P.engine.prefill(hit.mission, q)
      });
      toast('Routed to ' + hit.agent.name + ' · ' + hit.mission.title, '▶');
      return;
    }

    const choices = el('div.qlist', {}, open.slice(0, 3).map(h =>
      el('button.quest', { type: 'button', style: { '--hue': h.agent.hue }, 'data-pick': h.agentId + '/' + h.missionId },
        el('div.quest__tick', '▶'),
        el('div.quest__t', el('b', h.agent.name + ' · ' + h.mission.title), el('span', h.mission.gives)))
    ));

    const close = modal('Which one did you mean?', '“' + q + '”', choices);

    choices.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('[data-pick]');
      if (!btn) return;
      const [agentId, missionId] = btn.getAttribute('data-pick').split('/');
      close();
      go('agent', {
        agentId, missionId,
        prefill: P.engine.prefill(P.agents.findMission(agentId, missionId), q)
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     Global wiring
     ══════════════════════════════════════════════════════════ */

  function wire() {
    // Anything with data-nav navigates.
    document.addEventListener('click', e => {
      const nav = e.target.closest && e.target.closest('[data-nav]');
      if (nav) { P.fx.sfx.tap(); go(nav.getAttribute('data-nav')); return; }

      const facet = e.target.closest && e.target.closest('.facet[data-agent]');
      if (facet && !facet.disabled) {
        P.fx.sfx.open();
        go('agent', { agentId: facet.getAttribute('data-agent') });
        return;
      }

      const nextCard = e.target.closest && e.target.closest('.nextcard[data-agent]');
      if (nextCard && !nextCard.disabled && nextCard.getAttribute('data-agent')) {
        P.fx.sfx.open();
        go('agent', {
          agentId: nextCard.getAttribute('data-agent'),
          missionId: nextCard.getAttribute('data-mission')
        });
        return;
      }

      const hint = e.target.closest && e.target.closest('[data-hint]');
      if (hint) {
        U.$('#beam-input').value = hint.getAttribute('data-hint');
        refract(hint.getAttribute('data-hint'));
      }
    });

    U.$('#beam-form').addEventListener('submit', e => {
      e.preventDefault();
      refract(U.$('#beam-input').value);
    });

    window.addEventListener('hashchange', () => {
      const r = fromHash();
      if (r.view !== current || r.agentId) go(r.view, r);
    });

    // Keyboard: / focuses the beam, Escape goes home.
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); go('deck'); U.$('#beam-input').focus(); }
      if (e.key === 'Escape' && typing) document.activeElement.blur();
    });

    PR.onChain(syncChain);
    S.on(syncHud);
  }

  /* ══════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════ */

  const BOOT_LINES = [
    'initialising spectrum…',
    'aligning facets…',
    'calibrating dispersion…',
    'deck ready'
  ];

  async function boot() {
    const first = S.get().runs === 0 && !S.get().lastActiveDay;
    const bootEl = U.$('#boot');
    const line = U.$('#boot-line');
    const fill = U.$('#boot-fill');

    P.fx.init();

    // Returning users get a much shorter curtain.
    const step = first ? 520 : 190;

    for (let i = 0; i < BOOT_LINES.length; i++) {
      line.textContent = BOOT_LINES[i];
      fill.style.width = ((i + 1) / BOOT_LINES.length * 100) + '%';
      await U.wait(step);
    }

    const day = PR.touchDay();

    bootEl.classList.add('boot--gone');
    setTimeout(() => { bootEl.hidden = true; }, 800);

    U.$('#hud').hidden = false;
    U.$('#stage').hidden = false;

    wire();
    syncChain({ mult: 1, live: false, frac: 0 });

    const r = fromHash();
    go(r.view, r);

    // Day-turn payouts land after the deck is up.
    if (day.newDay && S.get().runs > 0) {
      setTimeout(() => {
        if (day.streakBroken) {
          toast('Streak reset — starting again at day 1', '◆');
        } else if (day.streak > 1) {
          pop('day ' + day.streak, 'Streak alive', 'run one mission to keep it', 32);
          P.fx.sfx.reward();
        }
        toast('Three fresh directives are up', '▤');
      }, 700);
    }

    if (first) {
      setTimeout(() => {
        toast('Tap a facet, or type what you need into the beam', '▶');
      }, 900);
    }
  }

  return { boot, go, toast, pop, celebrate, modal, archive, syncHud, refract };
})();

document.addEventListener('DOMContentLoaded', () => P.app.boot());
