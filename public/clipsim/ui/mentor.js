import { i18n } from './i18n.js';

// Bottom-right mentor: calm, short guidance for the current stage, its
// sub-task checkboxes, the stage percentage and one contextual hint.
// Click the header to collapse it.
export class Mentor {
  constructor(el, stages) {
    this.el = el; this.sys = stages;
    this.tasks = el.querySelector('.m-tasks');
    this.lastHint = null;
    el.querySelector('.m-head').onclick = () => el.classList.toggle('collapsed');
    stages.onChange(() => this.refresh());
    i18n.onChange(() => { this.lastHint = null; this.refresh(); });
    this.refresh();
  }
  refresh() {
    const s = this.sys, st = s.current;
    const n = s.index + 1;
    this.el.querySelector('.m-kicker').textContent = s.complete ? i18n.t('mentor.doneKicker') : `${i18n.t('mentor.kicker')} · ${n}/${s.stages.length}`;
    this.el.querySelector('.m-title').textContent = s.complete ? i18n.t('mentor.doneTitle') : i18n.t('stage.' + st.id);
    this.el.querySelector('.m-text').textContent = s.complete ? i18n.t('mentor.doneText') : i18n.t('mentor.' + st.id);
    this.tasks.innerHTML = '';
    if (s.complete) return;
    st.tasks.forEach((t) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="box"></span><span class="lbl"></span><span class="tp mono"></span>`;
      li.querySelector('.lbl').textContent = i18n.t('task.' + t.id);
      this.tasks.appendChild(li);
    });
  }
  update() {
    const s = this.sys;
    const pct = Math.round((s.complete ? 1 : s.stageProgress()) * 100);
    this.el.querySelector('.m-pct').textContent = `${pct}%`;
    this.el.querySelector('.m-bar i').style.width = `${pct}%`;
    if (!s.complete) {
      const ts = s.taskState[s.index];
      [...this.tasks.children].forEach((li, k) => {
        const t = ts[k];
        li.classList.toggle('ok', t.ok);
        li.querySelector('.tp').textContent = !t.ok && t.progress > 0 ? `${Math.round(t.progress * 100)}%` : '';
      });
    }
    const hint = s.hint();
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      const h = this.el.querySelector('.m-hint');
      h.textContent = hint ? i18n.t(hint) : '';
      h.className = 'm-hint' + (/rupture|suctionPool|riskHigh|tempLong/.test(hint || '') ? ' urgent' : '');
    }
  }
}
