/* ══════════════════════════════════════════════════════════════
   PRISM · views — every screen, and the output renderer
   ══════════════════════════════════════════════════════════════ */

P.views = (function () {
  'use strict';

  const U = P.util, S = P.store, PR = P.progress, A = P.agents;
  const { el, frag, clear } = U;

  const sigil = (agent, cls) => {
    const wrap = el('div.' + cls);
    wrap.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + agent.sigil + '</svg>';
    return wrap;
  };

  /* ══════════════════════════════════════════════════════════
     Output renderer — a document → a holocard
     ══════════════════════════════════════════════════════════ */

  function renderBlock(b) {
    if (b.t === 'note') return el('div.blk', el('p', b.text));

    if (b.t === 'quote') {
      return el('div.blk',
        b.h ? el('div.blk__h', b.h) : null,
        el('div.quote', b.text));
    }

    if (b.t === 'list') {
      const items = (b.items || []).map((it, i) =>
        typeof it === 'string'
          ? el('li', b.ordered ? el('span.n', String(i + 1)) : el('span.n', '•'), el('span', it))
          : el('li', el('span.n', String(i + 1)), el('span', el('b', it.b + ' '), it.text))
      );
      return el('div.blk',
        b.h ? el('div.blk__h', b.h) : null,
        el(b.ordered ? 'ol' : 'ul', {}, items));
    }

    if (b.t === 'steps') {
      const items = (b.items || []).map((it, i) =>
        el('li', el('span.n', String(i + 1)),
           el('span', it.b ? el('b', it.b + ' — ') : null, it.text))
      );
      return el('div.blk',
        b.h ? el('div.blk__h', b.h) : null,
        el('ol', {}, items));
    }

    if (b.t === 'stats') {
      const cards = (b.items || []).map(it =>
        el('div.kv__c',
          el('div.kv__k', it.k),
          el('div.kv__v', it.v),
          it.n ? el('div.kv__n', it.n) : null));
      return el('div.blk',
        b.h ? el('div.blk__h', b.h) : null,
        el('div.kv', {}, cards));
    }

    if (b.t === 'tags') {
      return el('div.blk',
        b.h ? el('div.blk__h', b.h) : null,
        el('div.tags', {}, (b.items || []).map(x => el('span.tag', x))));
    }

    return el('div.blk', el('p', JSON.stringify(b)));
  }

  /**
   * Build the output card. `ctx` carries what the action bar needs
   * to copy, refine and archive.
   */
  function renderOutput(doc, ctx) {
    const body = el('div.out__body.reveal', {}, doc.blocks.map(renderBlock));
    U.stagger(body);

    const bar = el('div.out__bar',
      el('span.out__dot'),
      el('span', doc.live ? 'live · ' + (S.get().prefs.model || 'claude') : 'composed'),
      el('span.spacer'),
      el('button.out__act', { type: 'button', 'data-act': 'copy' }, 'Copy'),
      el('button.out__act', { type: 'button', 'data-act': 'save' }, 'Save')
    );

    const refine = el('div.refine',
      el('span.refine__lbl', 'Refine'),
      ...[
        ['shorter', 'Shorter'],
        ['bolder', 'Bolder'],
        ['specific', 'More specific'],
        ['angle', 'Different angle']
      ].map(([k, label]) => el('button.pill', { type: 'button', 'data-refine': k }, label))
    );

    const card = el('div.out.materialise', bar, body,
      ctx.onRefine ? el('div', { style: { padding: '0 22px 20px' } }, refine) : null);

    bar.addEventListener('click', async e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;

      if (act === 'copy') {
        const ok = await U.copy(P.compose.toText(doc));
        P.fx.sfx.tap();
        if (ok) {
          const res = PR.recordSide('copy');
          P.app.celebrate(res);
          P.app.toast('Copied to your clipboard', '⧉');
        } else {
          P.app.toast('Could not reach the clipboard — select and copy manually', '!');
        }
      }

      if (act === 'save') {
        P.app.archive(doc, ctx);
        P.fx.sfx.tap();
        P.app.toast('Saved to your archive', '▤');
      }
    });

    refine.addEventListener('click', e => {
      const mod = e.target.getAttribute && e.target.getAttribute('data-refine');
      if (mod && ctx.onRefine) ctx.onRefine(mod);
    });

    return card;
  }

  /* ══════════════════════════════════════════════════════════
     Deck
     ══════════════════════════════════════════════════════════ */

  function facetCard(agent, state) {
    const open = PR.isUnlocked(agent.id, state);
    const runs = state.agentRuns[agent.id] || 0;
    const mast = A.masteryOf(runs);

    const card = el('button.facet.holo.holo--live', {
      type: 'button',
      role: 'listitem',
      style: { '--hue': agent.hue },
      'data-agent': agent.id,
      'aria-label': agent.name + ' — ' + agent.role + (open ? '' : ' (locked)')
    },
      sigil(agent, 'facet__sigil'),
      el('div',
        el('div.facet__name', agent.name),
        el('div.facet__role', agent.role)),
      el('div.facet__foot',
        el('span', open ? (runs ? runs + ' run' + (runs === 1 ? '' : 's') : 'untouched') : 'sealed'),
        el('span.pips', {}, [0, 1, 2, 3, 4].map(i => el('i.pip' + (i < mast ? '.pip--on' : ''))))
      )
    );

    if (!open) {
      card.classList.add('is-locked');
      card.disabled = true;
      card.append(el('div.facet__lock',
        el('b', '◈'),
        el('span.facet__lockname', agent.name),
        el('span', 'Level ' + agent.unlock.level)));
    } else {
      P.fx.bindTilt(card, 8);
    }

    return card;
  }

  function renderDeck() {
    const state = S.get();
    const open = PR.unlockedIds(state);

    // Greeting shifts with progress so the deck never feels static.
    const greet = U.$('#deck-greeting');
    if (greet) {
      const st = PR.standing(state);
      greet.textContent = state.runs === 0
        ? 'Split your intent into a spectrum.'
        : state.streak > 1
          ? 'Day ' + state.streak + '. The beam is still on.'
          : st.pct > 0.7
            ? 'Nearly ' + PR.rankFor(state.level + 1) + '. ' + st.toNext + ' XP to go.'
            : 'Welcome back, ' + st.rank + '.';
    }

    // Facets
    const grid = U.$('#facets');
    clear(grid);
    A.list.forEach(a => grid.append(facetCard(a, state)));

    P.fx.setSpectrum(A.list.filter(a => open.indexOf(a.id) !== -1).map(a => a.hue));
    P.fx.sizePrism();

    // Beam hints — real examples that route somewhere
    const hints = U.$('#beam-hints');
    clear(hints);
    P.engine.hints('hints-' + U.dayKey() + '-' + open.length).forEach(h => {
      hints.append(el('button.hint', { type: 'button', 'data-hint': h.q }, h.q));
    });

    // Next best moves
    const next = U.$('#next-moves');
    clear(next);
    PR.suggestions().forEach(s => {
      const card = el('button.nextcard', {
        type: 'button',
        style: { '--hue': s.hue },
        'data-agent': s.agentId || '',
        'data-mission': s.missionId || '',
        disabled: s.locked || false
      },
        el('div.nextcard__tag', s.tag),
        el('div.nextcard__title', s.title),
        el('div.nextcard__why', s.why),
        s.xp ? el('div.nextcard__xp', '+' + s.xp + ' XP') : null
      );
      if (s.locked) card.classList.add('is-locked');
      next.append(card);
    });
  }

  /* ══════════════════════════════════════════════════════════
     Agent view
     ══════════════════════════════════════════════════════════ */

  function fieldControl(f, mission, agent) {
    const id = 'f-' + agent.id + '-' + mission.id + '-' + f.k;

    const label = el('label.field__label', { for: id },
      el('span', f.label),
      f.ex && f.ex.length
        ? el('button.field__dice', { type: 'button', 'data-ex': f.k, tabindex: '-1' }, 'example')
        : null
    );

    let control;

    if (f.type === 'area') {
      control = el('textarea.textarea', { id, placeholder: f.ph || '', 'data-k': f.k, rows: '3' });

    } else if (f.type === 'select') {
      control = el('select.select', { id, 'data-k': f.k },
        ...(f.options || []).map(o => el('option', { value: o, selected: o === f.def }, o)));

    } else if (f.type === 'pills') {
      control = el('div.pillrow', { 'data-k': f.k, role: 'group', 'aria-label': f.label },
        ...(f.options || []).map(o =>
          el('button.pill', {
            type: 'button', 'data-val': o,
            'aria-pressed': o === (f.def || f.options[0]) ? 'true' : 'false'
          }, o)));

      control.addEventListener('click', e => {
        const v = e.target.getAttribute && e.target.getAttribute('data-val');
        if (!v) return;
        U.$$('.pill', control).forEach(p => p.setAttribute('aria-pressed', String(p === e.target)));
        P.fx.sfx.tap();
      });

    } else {
      control = el('input.input', {
        id, type: f.type === 'number' ? 'number' : 'text',
        inputmode: f.type === 'number' ? 'decimal' : null,
        placeholder: f.ph || '', 'data-k': f.k
      });
    }

    const wrap = el('div.field', label, control);

    const dice = U.$('.field__dice', wrap);
    if (dice) {
      dice.addEventListener('click', () => {
        const v = U.pick(f.ex);
        if (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') control.value = v;
        control.classList.add('glitch');
        setTimeout(() => control.classList.remove('glitch'), 340);
        P.fx.sfx.tap();
      });
    }

    return wrap;
  }

  /** Read every control in a mission body into a plain object. */
  function readInputs(body) {
    const out = {};
    U.$$('[data-k]', body).forEach(node => {
      const k = node.getAttribute('data-k');
      if (node.classList.contains('pillrow')) {
        const on = U.$('.pill[aria-pressed="true"]', node);
        out[k] = on ? on.getAttribute('data-val') : '';
      } else {
        out[k] = node.value;
      }
    });
    return out;
  }

  function missionPanel(agent, mission, idx) {
    const details = el('details.mission.holo', { style: { '--hue': agent.hue }, 'data-mission': mission.id });

    const summary = el('summary.mission__head',
      el('span.mission__idx', mission.locked ? '◈' : String(idx + 1)),
      el('div.mission__text',
        el('div.mission__title', mission.title),
        el('div.mission__gives', mission.locked ? 'Sealed — reach ' + mission.lockNote : mission.gives)),
      el('span.mission__chev', '❯')
    );
    details.append(summary);

    if (mission.locked) {
      details.classList.add('is-locked');
      summary.addEventListener('click', e => {
        e.preventDefault();
        P.app.toast('Sealed until ' + mission.lockNote.toLowerCase(), '◈');
        P.fx.sfx.error();
      });
      return details;
    }

    const body = el('div.mission__body');
    mission.fields.forEach(f => body.append(fieldControl(f, mission, agent)));

    const runBtn = el('button.btn.btn--go', { type: 'button' }, 'Run mission');
    const meta = el('span.runbar__meta', '+' + (mission.xp || 40) + ' XP');
    const clearBtn = el('button.btn.btn--ghost', { type: 'button' }, 'Clear');

    body.append(el('div.runbar', runBtn, clearBtn, meta));

    const slot = el('div');
    body.append(slot);
    details.append(body);

    let controller = null;

    async function go(mod) {
      const inputs = readInputs(body);

      // A mission with nothing in it produces nothing useful.
      const filled = mission.fields.some(f => String(inputs[f.k] || '').trim());
      if (!filled) {
        P.app.toast('Fill in at least one field — or hit "example"', '!');
        P.fx.sfx.error();
        U.$('.input, .textarea', body) && U.$('.input, .textarea', body).focus();
        return;
      }

      runBtn.disabled = true;
      runBtn.textContent = mod ? 'Refining…' : 'Refracting…';
      P.fx.sfx.run();

      clear(slot);
      const live = P.engine.linkReady();
      const thinkBox = live ? el('div.think', 'connecting…') : null;
      if (thinkBox) slot.append(el('div.out.materialise', el('div.out__body', thinkBox)));

      if (controller) controller.abort();
      controller = new AbortController();

      let result;
      try {
        result = await P.engine.produce(agent.id, mission.id, inputs, {
          mod,
          signal: controller.signal,
          onThinking: t => { if (thinkBox) thinkBox.textContent = t.slice(-900); },
          onText: t => { if (thinkBox) thinkBox.textContent = t.slice(-900); }
        });
      } catch (err) {
        if (err.name === 'AbortError') return;
        result = { doc: P.compose.run(agent.id, mission.id, inputs, mod), live: false };
      }

      clear(slot);

      const ctx = {
        agentId: agent.id, missionId: mission.id, inputs,
        onRefine: m => {
          const res = PR.recordSide('refine');
          P.app.celebrate(res);
          go(m);
        }
      };

      slot.append(renderOutput(result.doc, ctx));

      runBtn.disabled = false;
      runBtn.textContent = 'Run again';
      P.fx.sfx.done();

      // Refines are paid for by recordSide; only a fresh run scores a mission.
      if (!mod) {
        const gain = PR.recordRun(agent.id, mission, { live: result.live, viaBeam: !!details.dataset.viaBeam });
        delete details.dataset.viaBeam;
        P.app.celebrate(gain);
        P.app.archive(result.doc, ctx);
      }

      slot.scrollIntoView({ behavior: U.reduceMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }

    runBtn.addEventListener('click', () => go(null));
    clearBtn.addEventListener('click', () => {
      U.$$('[data-k]', body).forEach(nd => { if (nd.value !== undefined) nd.value = ''; });
      clear(slot);
      runBtn.textContent = 'Run mission';
    });

    details.addEventListener('toggle', () => { if (details.open) P.fx.sfx.open(); });

    details._prism = { go, body, runBtn };
    return details;
  }

  function renderAgent(agentId, opts) {
    const o = opts || {};
    const agent = A.byId[agentId];
    const view = U.$('#view-agent');
    clear(view);
    if (!agent) return;

    const state = S.get();
    const runs = state.agentRuns[agentId] || 0;
    const mast = A.masteryOf(runs);
    const prog = A.masteryProgress(runs);

    view.style.setProperty('--hue', agent.hue);
    document.documentElement.style.setProperty('--hue', agent.hue);

    const back = el('button.backlink', { type: 'button', 'data-nav': 'deck' }, '❮', 'All facets');

    const idcard = el('aside.idcard.holo.holo--live', { style: { '--hue': agent.hue } },
      el('div.idcard__top',
        sigil(agent, 'idcard__sigil'),
        el('div',
          el('div.idcard__name', agent.name),
          el('div.idcard__role', agent.role))),
      el('p.idcard__line', agent.line),
      el('div',
        el('div.section-title', el('span', 'Good at')),
        el('ul.goodat', {}, agent.goodAt.map(g => el('li', g)))),
      el('div.mastery',
        el('div.mastery__row',
          el('span', 'Mastery'),
          el('b', A.MASTERY_NAMES[mast])),
        el('div.bar', el('i', { style: { width: (prog * 100).toFixed(0) + '%' } })),
        el('div.mastery__row',
          el('span', runs + ' run' + (runs === 1 ? '' : 's')),
          el('span', mast >= 5 ? 'maxed' : (A.MASTERY_STEPS[mast + 1] - runs) + ' to next')))
    );
    P.fx.bindTilt(idcard, 4);

    const missions = A.missionsFor(agent, runs);
    const list = el('div.missions', {}, missions.map((m, i) => missionPanel(agent, m, i)));

    view.append(back, el('div.agent', idcard, el('div', el('div.section-title', el('span', 'Missions')), list)));

    // Deep link: open a mission, optionally pre-filled from the beam.
    if (o.missionId) {
      const target = U.$('[data-mission="' + o.missionId + '"]', list);
      if (target && !target.classList.contains('is-locked')) {
        target.open = true;
        if (o.prefill) {
          Object.keys(o.prefill).forEach(k => {
            const nd = U.$('[data-k="' + k + '"]', target);
            if (nd && nd.value !== undefined) nd.value = o.prefill[k];
          });
          target.dataset.viaBeam = '1';
        }
        setTimeout(() => target.scrollIntoView({ behavior: U.reduceMotion() ? 'auto' : 'smooth', block: 'center' }), 120);
        if (o.autorun && target._prism) setTimeout(() => target._prism.go(null), 420);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     Progress
     ══════════════════════════════════════════════════════════ */

  function renderProgress() {
    const view = U.$('#view-progress');
    clear(view);
    const s = S.get();
    const st = PR.standing(s);

    document.documentElement.style.setProperty('--hue', 190);

    const uniq = Object.keys(s.agentRuns).length;
    const topId = Object.keys(s.agentRuns).sort((a, b) => s.agentRuns[b] - s.agentRuns[a])[0];

    const head = el('div.deck__head',
      el('p.eyebrow', 'progress'),
      el('h2.display', st.rank),
      el('p.lede', 'Level ' + st.level + ' · ' + st.into + ' / ' + st.span +
        ' XP toward ' + PR.rankFor(st.level + 1) + '. ' +
        (s.streak > 1 ? 'A ' + s.streak + '-day streak is running.' : 'Run one mission today to start a streak.')));

    const grid = el('div.pgrid',
      el('div.stat.holo', el('div.stat__k', 'Missions run'), el('div.stat__v', U.fmt(s.runs)), el('div.stat__n', 'all time')),
      el('div.stat.holo', el('div.stat__k', 'Streak'), el('div.stat__v', String(s.streak)), el('div.stat__n', 'best ' + s.bestStreak + ' days')),
      el('div.stat.holo', el('div.stat__k', 'Facets used'), el('div.stat__v', uniq + '/' + A.list.length), el('div.stat__n', topId ? 'most: ' + A.byId[topId].name : 'none yet')),
      el('div.stat.holo', el('div.stat__k', 'Total XP'), el('div.stat__v', U.fmt(s.xp)), el('div.stat__n', st.toNext + ' to next level'))
    );

    // Directives
    const ds = PR.directives();
    const qlist = el('div.qlist', {}, ds.map(d =>
      el('div.quest', { 'data-done': d.done ? '1' : '0' },
        el('div.quest__tick', '✔'),
        el('div.quest__t', el('b', d.title), el('span', d.note)),
        el('div.quest__p', d.have + '/' + d.need),
        el('div.quest__xp', '+' + d.xp))
    ));

    // Mastery per agent
    const open = PR.unlockedIds(s);
    const mastery = el('div.qlist', {}, A.list.filter(a => open.indexOf(a.id) !== -1).map(a => {
      const runs = s.agentRuns[a.id] || 0;
      const m = A.masteryOf(runs);
      return el('div.quest', { style: { '--hue': a.hue } },
        el('span.pips', {}, [0, 1, 2, 3, 4].map(i => el('i.pip' + (i < m ? '.pip--on' : '')))),
        el('div.quest__t', el('b', a.name), el('span', A.MASTERY_NAMES[m] + ' · ' + a.role)),
        el('div.quest__p', runs + ' run' + (runs === 1 ? '' : 's')));
    }));

    // Badges
    const badges = el('div.badges', {}, P.quests.ACHIEVEMENTS.map(a => {
      const got = s.achievements.indexOf(a.id) !== -1;
      return el('div.badge', { 'data-got': got ? '1' : '0', style: { '--hue': a.hue } },
        el('div.badge__ico', a.ico),
        el('div.badge__n', a.name),
        el('div.badge__d', got ? a.desc : 'Locked'));
    }));

    const got = s.achievements.length;

    view.append(head, grid,
      el('div.stack',
        el('div', el('div.section-title', el('span', "Today's directives")), qlist),
        el('div', el('div.section-title', el('span', 'Agent mastery')), mastery),
        el('div', el('div.section-title', el('span', 'Badges · ' + got + ' of ' + P.quests.ACHIEVEMENTS.length)), badges)));
  }

  /* ══════════════════════════════════════════════════════════
     Archive
     ══════════════════════════════════════════════════════════ */

  function renderArchive() {
    const view = U.$('#view-archive');
    clear(view);
    const s = S.get();

    document.documentElement.style.setProperty('--hue', 190);

    const head = el('div.deck__head',
      el('p.eyebrow', 'archive'),
      el('h2.display', 'Everything you have made'),
      el('p.lede', 'The last ' + Math.min(s.archive.length, 60) + ' outputs, newest first. Click one to read it again.'));

    view.append(head);

    if (!s.archive.length) {
      view.append(el('div.empty', el('b', 'Nothing here yet'), 'Run a mission and it lands here automatically.'));
      return;
    }

    const rows = el('div.arc', {}, s.archive.map((entry, i) => {
      const agent = A.byId[entry.agentId];
      return el('button.arcrow', {
        type: 'button', 'data-idx': i,
        style: { '--hue': agent ? agent.hue : 190 }
      },
        el('span.arcrow__dot'),
        el('div.arcrow__m',
          el('b', (agent ? agent.name + ' · ' : '') + entry.title),
          el('span', entry.subtitle || '')),
        el('span.arcrow__t', U.ago(entry.at)));
    }));

    rows.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('.arcrow');
      if (!btn) return;
      const entry = S.get().archive[parseInt(btn.getAttribute('data-idx'), 10)];
      if (!entry) return;
      P.app.modal(
        entry.title,
        entry.subtitle || '',
        renderOutput(entry.doc, { agentId: entry.agentId, missionId: entry.missionId, inputs: entry.inputs })
      );
    });

    view.append(rows);
  }

  /* ══════════════════════════════════════════════════════════
     Settings
     ══════════════════════════════════════════════════════════ */

  function toggleRow(title, note, key, onChange) {
    const on = !!S.get().prefs[key];
    const sw = el('button.switch', { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': title });
    sw.addEventListener('click', () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      S.update(s => { s.prefs[key] = next; });
      P.fx.sfx.tap();
      if (onChange) onChange(next);
    });
    return el('div.toggle', el('div.toggle__t', el('b', title), el('span', note)), sw);
  }

  function renderSettings() {
    const view = U.$('#view-settings');
    clear(view);
    const p = S.get().prefs;

    document.documentElement.style.setProperty('--hue', 190);

    const head = el('div.deck__head',
      el('p.eyebrow', 'settings'),
      el('h2.display', 'Tune the deck'),
      el('p.lede', 'PRISM works completely offline. Everything below is optional.'));

    /* ── display ── */
    const display = el('div.setcard.holo',
      el('h3', 'Display & feel'),
      toggleRow('Motion', 'Holographic field, tilt and parallax.', 'motion', () => P.fx.refresh()),
      toggleRow('Sound', 'Small synthesised blips on actions. Off by default.', 'sound', on => { if (on) P.fx.sfx.done(); })
    );

    /* ── live link ── */
    const modeSel = el('select.select', { 'aria-label': 'Live link mode' },
      el('option', { value: 'proxy', selected: p.linkMode === 'proxy' }, 'Proxy endpoint (recommended)'),
      el('option', { value: 'direct', selected: p.linkMode === 'direct' }, 'Direct — key stored in this browser'));

    const endpoint = el('input.input', {
      type: 'url', value: p.endpoint || '',
      placeholder: 'https://your-worker.example.com/prism'
    });

    const apiKey = el('input.input', {
      type: 'password', value: p.apiKey || '',
      placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false'
    });

    const model = el('select.select', { 'aria-label': 'Model' },
      ...['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']
        .map(m => el('option', { value: m, selected: p.model === m }, m)));

    const proxyField = el('div.field', el('label.field__label', el('span', 'Your endpoint URL')), endpoint);
    const keyField = el('div.field', el('label.field__label', el('span', 'Anthropic API key')), apiKey);
    const warn = el('p', { style: { color: 'var(--rose)' } },
      'A key here is readable by anything with access to this browser profile. Use it on your own machine only — never on a shared or public computer. The proxy option keeps the key on a server instead.');

    function syncMode() {
      const direct = modeSel.value === 'direct';
      proxyField.hidden = direct;
      keyField.hidden = !direct;
      warn.hidden = !direct;
    }
    modeSel.addEventListener('change', syncMode);
    syncMode();

    const save = el('button.btn.btn--go', { type: 'button' }, 'Save link');
    const test = el('button.btn.btn--ghost', { type: 'button' }, 'Test it');

    save.addEventListener('click', () => {
      S.update(s => {
        s.prefs.linkMode = modeSel.value;
        s.prefs.endpoint = endpoint.value.trim();
        s.prefs.apiKey = apiKey.value.trim();
        s.prefs.model = model.value;
        s.prefs.liveLink = !!(modeSel.value === 'proxy' ? s.prefs.endpoint : s.prefs.apiKey);
      });
      const on = P.engine.linkReady();
      P.app.toast(on ? 'Live link armed' : 'Live link off — missing endpoint or key', on ? '⌁' : '!');
      if (on) {
        PR.checkAchievements({ live: true });
        P.fx.sfx.reward();
      }
    });

    test.addEventListener('click', async () => {
      if (!P.engine.linkReady()) { P.app.toast('Save the link first', '!'); return; }
      test.disabled = true; test.textContent = 'Testing…';
      try {
        const agent = A.byId.atlas;
        await P.engine.live({
          agent, mission: agent.missions[1],
          inputs: { focus: 'confirm the link works', load: 'Wide open' }
        });
        P.app.toast('Live link answered', '⌁');
        P.fx.sfx.done();
      } catch (err) {
        P.app.toast(err.message.slice(0, 90), '!');
        P.fx.sfx.error();
      }
      test.disabled = false; test.textContent = 'Test it';
    });

    const link = el('div.setcard.holo',
      el('h3', 'Live link'),
      el('p', 'Off by default. PRISM composes everything locally with no network at all — the live link swaps that for a real Claude response, shaped by the same mission brief. Missions, XP and the archive work identically either way.'),
      el('div.field', el('label.field__label', el('span', 'How to connect')), modeSel),
      proxyField, keyField, warn,
      el('div.field', el('label.field__label', el('span', 'Model')), model),
      el('div.row', save, test,
        el('span.runbar__meta', P.engine.linkReady() ? 'status: armed' : 'status: local only'))
    );

    /* ── data ── */
    const exportBtn = el('button.btn.btn--ghost', { type: 'button' }, 'Export save');
    const importBtn = el('button.btn.btn--ghost', { type: 'button' }, 'Import save');
    const resetBtn = el('button.btn.btn--ghost.danger', { type: 'button' }, 'Erase everything');

    exportBtn.addEventListener('click', async () => {
      const ok = await U.copy(S.export());
      P.app.toast(ok ? 'Save copied to clipboard' : 'Could not copy', ok ? '⧉' : '!');
    });

    importBtn.addEventListener('click', () => {
      const ta = el('textarea.textarea', { placeholder: 'Paste an exported PRISM save…', rows: '6' });
      P.app.modal('Import a save', 'This replaces everything currently on this device.', ta, [
        { label: 'Import', primary: true, act: () => {
            try { S.import(ta.value); P.app.toast('Save imported', '✔'); P.app.go('deck'); }
            catch (e) { P.app.toast('That is not a valid save file', '!'); }
          } }
      ]);
    });

    resetBtn.addEventListener('click', () => {
      P.app.modal('Erase everything?',
        'Your level, streak, badges and archive are all stored on this device only. This cannot be undone.',
        null,
        [{ label: 'Erase it all', danger: true, act: () => { S.reset(); P.app.toast('Deck wiped', '✔'); P.app.go('deck'); } }]);
    });

    const data = el('div.setcard.holo',
      el('h3', 'Your data'),
      el('p', 'Everything lives in this browser. Nothing is uploaded, and there is no account. ' +
        (S.isPersistent()
          ? 'Clearing site data will wipe it, so export a save if you care about the streak.'
          : 'Heads up: this browser is blocking storage, so progress will vanish when you close the tab.')),
      el('div.row', exportBtn, importBtn, resetBtn));

    view.append(head, el('div.setgrid', display, link, data));
  }

  return { renderDeck, renderAgent, renderProgress, renderArchive, renderSettings, renderOutput, renderBlock };
})();
