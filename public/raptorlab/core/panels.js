import { i18n } from './i18n.js';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Left checklist: each stage locked, active or done, with progress and timer.
export class Checklist {
  constructor(el, sys, state) {
    this.el = el; this.sys = sys; this.state = state;
    this.list = el.querySelector('.cl-list');
    el.querySelector('.cl-head').onclick = () => el.classList.toggle('collapsed');
    sys.onChange(() => this.rebuild());
    i18n.onChange(() => this.rebuild());
  }
  setTitle(key) { this.titleKey = key; this.rebuild(); }
  rebuild() {
    const s = this.sys;
    this.el.querySelector('.cl-title').textContent = this.titleKey ? i18n.t(this.titleKey) : '';
    this.list.innerHTML = '';
    this.items = s.stages.map((st, i) => {
      const li = document.createElement('li');
      const status = s.done[i] ? 'done' : i === s.index && !s.complete ? 'active' : 'locked';
      li.className = status;
      li.innerHTML = `<span class="cl-dot mono">${status === 'done' ? '✓' : i + 1}</span><div class="cl-main"><div class="cl-name"></div><div class="cl-bar"><i></i></div></div><span class="cl-time mono">--:--</span>`;
      li.querySelector('.cl-name').textContent = i18n.t(s.key('stage', st.id));
      this.list.appendChild(li);
      return li;
    });
  }
  update() {
    const s = this.sys, t = this.state.time;
    (this.items || []).forEach((li, i) => {
      li.querySelector('.cl-bar i').style.width = `${Math.round(s.stageProgress(i) * 100)}%`;
      const tm = s.times[i];
      li.querySelector('.cl-time').textContent = tm.start === null ? '--:--' : fmt((tm.end ?? t) - tm.start);
    });
    this.el.querySelector('.cl-total').textContent = `${Math.round(s.overall * 100)}%`;
  }
}

// Bottom-right coach: short guidance, sub-task checkboxes, stage % and one hint.
export class Mentor {
  constructor(el, sys) {
    this.el = el; this.sys = sys; this.lastHint = undefined;
    this.tasks = el.querySelector('.m-tasks');
    el.querySelector('.m-head').onclick = () => el.classList.toggle('collapsed');
    sys.onChange(() => this.refresh());
    i18n.onChange(() => { this.lastHint = undefined; this.refresh(); });
  }
  refresh() {
    const s = this.sys, st = s.current;
    const q = (c) => this.el.querySelector(c);
    q('.m-kicker').textContent = `${i18n.t('mentor.kicker')} · ${Math.min(s.index + 1, s.stages.length)}/${s.stages.length}`;
    q('.m-title').textContent = st ? i18n.t(s.key('stage', st.id)) : '';
    q('.m-text').textContent = st ? i18n.t(s.key('mentor', st.id)) : '';
    this.tasks.innerHTML = '';
    if (!st || s.complete) return;
    st.tasks.forEach((t) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="box"></span><span class="lbl"></span><span class="tp mono"></span>`;
      li.querySelector('.lbl').textContent = i18n.t(s.key('task', t.id));
      this.tasks.appendChild(li);
    });
    this.lastHint = undefined;
  }
  update() {
    const s = this.sys;
    const pct = Math.round((s.complete ? 1 : s.stageProgress()) * 100);
    this.el.querySelector('.m-pct').textContent = `${pct}%`;
    this.el.querySelector('.m-bar i').style.width = `${pct}%`;
    if (!s.complete && s.taskState[s.index]) {
      [...this.tasks.children].forEach((li, k) => {
        const t = s.taskState[s.index][k];
        if (!t) return;
        li.classList.toggle('ok', t.ok);
        li.querySelector('.tp').textContent = !t.ok && t.progress > 0 ? `${Math.round(t.progress * 100)}%` : '';
      });
    }
    const hint = s.hint();
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      const h = this.el.querySelector('.m-hint');
      h.textContent = hint ? i18n.t(hint) : '';
      h.className = 'm-hint' + (hint && hint.includes('urgent') ? ' urgent' : '');
    }
  }
}

// A tool's state callback may run before its mode has finished setting up.
const safe = (fn) => { try { return !!fn?.(); } catch { return false; } };

// Bottom toolbar. Tools: { id, key, icon (SVG inner markup), labelKey, onSelect, active?() }.
export class Toolbar {
  constructor(el, card) { this.el = el; this.card = card; this.tools = []; i18n.onChange(() => this.refresh()); }
  set(tools, ruleKeyFn) {
    this.tools = tools; this.ruleKeyFn = ruleKeyFn;
    this.el.innerHTML = '';
    tools.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg><span class="tname"></span><kbd>${t.key}</kbd>`;
      b.onclick = () => { this.focus = t.id; t.onSelect(); this.refresh(); };
      this.el.appendChild(b);
    });
    this.refresh();
  }
  press(key) {
    const t = this.tools.find((x) => x.key === key);
    if (!t) return false;
    this.focus = t.id; t.onSelect(); this.refresh();
    return true;
  }
  refresh() {
    this.el.querySelectorAll('.tool').forEach((b) => {
      const t = this.tools.find((x) => x.id === b.dataset.tool);
      b.querySelector('.tname').textContent = i18n.t(t.labelKey);
      b.classList.toggle('active', safe(t.active));
      b.classList.toggle('disabled', safe(t.disabled));
    });
    const t = this.tools.find((x) => x.id === this.focus);
    this.card.classList.toggle('hidden', !t);
    if (t) {
      this.card.querySelector('.tc-name').textContent = i18n.t(t.labelKey);
      this.card.querySelector('.tc-rule').textContent = i18n.t(this.ruleKeyFn(t.id));
    }
  }
}

// Debrief overlay: a generic card filled by the mode.
export class Debrief {
  constructor(el) {
    this.el = el;
    el.querySelector('.db-close').onclick = () => this.hide();
  }
  hide() { this.el.classList.add('hidden'); }
  show({ title, sub, score, stats, checks, tips, onAgain }) {
    const q = (c) => this.el.querySelector(c);
    q('.db-title').textContent = title;
    q('.db-sub').textContent = sub;
    q('.db-score').textContent = score;
    q('.db-ring').style.setProperty('--p', score);
    const grid = q('.db-grid'); grid.innerHTML = '';
    for (const s of stats) {
      const d = document.createElement('div');
      d.innerHTML = `<label></label><b class="${s.cls || ''}"></b>`;
      d.children[0].textContent = s.label; d.children[1].textContent = s.value;
      grid.appendChild(d);
    }
    const ul = q('.db-checks'); ul.innerHTML = '';
    for (const c of checks) {
      const li = document.createElement('li');
      li.className = c.ok ? 'ok' : 'bad';
      li.innerHTML = `<span class="ic">${c.ok ? '✓' : '✕'}</span><span></span><b class="mono"></b>`;
      li.children[1].textContent = c.label; li.children[2].textContent = c.value;
      ul.appendChild(li);
    }
    const ol = q('.db-tips'); ol.innerHTML = '';
    for (const t of tips) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
    q('.db-again').onclick = () => { this.hide(); onAgain?.(); };
    this.el.classList.remove('hidden');
  }
}
