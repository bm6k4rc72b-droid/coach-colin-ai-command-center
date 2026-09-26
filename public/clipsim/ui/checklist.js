import { i18n } from './i18n.js';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Left panel: the six stages, each locked, active or done, with a progress
// bar and its elapsed time.
export class Checklist {
  constructor(el, stages, state) {
    this.el = el; this.sys = stages; this.state = state;
    this.list = el.querySelector('#cl-list');
    this.items = stages.stages.map((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="cl-dot mono">${i + 1}</span><div class="cl-main"><div class="cl-name"></div><div class="cl-bar"><i></i></div></div><span class="cl-time mono">--:--</span>`;
      this.list.appendChild(li);
      return li;
    });
    el.querySelector('.cl-head').onclick = () => el.classList.toggle('collapsed');
    stages.onChange(() => this.refresh());
    i18n.onChange(() => this.refresh());
    this.refresh();
  }
  refresh() {
    const s = this.sys;
    this.items.forEach((li, i) => {
      const status = s.done[i] ? 'done' : i === s.index && !s.complete ? 'active' : 'locked';
      li.className = status;
      li.querySelector('.cl-name').textContent = i18n.t('stage.' + s.stages[i].id);
      li.querySelector('.cl-dot').textContent = status === 'done' ? '✓' : status === 'locked' ? '🔒︎' : String(i + 1);
    });
  }
  update() {
    const s = this.sys, t = this.state.time;
    this.items.forEach((li, i) => {
      li.querySelector('.cl-bar i').style.width = `${Math.round(s.stageProgress(i) * 100)}%`;
      const tm = s.times[i];
      li.querySelector('.cl-time').textContent = tm.start === null ? '--:--' : fmt((tm.end ?? t) - tm.start);
    });
    this.el.querySelector('#cl-total').textContent = `${Math.round(s.overall * 100)}%`;
  }
}
