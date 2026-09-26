import { bus } from './bus.js';
import { sfx } from './audio.js';

// Generic stage engine. A mode supplies stage definitions:
//   { id, tasks: [{ id, check(ctx, sys), progress?(ctx, sys) }] }
// Every task of the active stage is evaluated each frame. When all are met at
// once, the stage completes and the next one unlocks. Strings come from i18n under
// `<prefix>.stage.<id>`, `<prefix>.mentor.<id>`, `<prefix>.task.<id>` and `<prefix>.hint.<id>`.
export class StageSystem {
  constructor(ctx) { this.ctx = ctx; this.listeners = new Set(); this.load('none', []); }

  load(prefix, stages, { urgentHint = () => null } = {}) {
    this.prefix = prefix;
    this.stages = stages;
    this.urgentHint = urgentHint;
    this.index = 0;
    this.complete = stages.length === 0;
    this.done = stages.map(() => false);
    this.times = stages.map(() => ({ start: null, end: null }));
    this.taskState = stages.map((s) => s.tasks.map(() => ({ ok: false, progress: 0 })));
    if (stages.length) this.times[0].start = this.ctx.state.time;
    this.#emit();
  }

  onChange(fn) { this.listeners.add(fn); }
  get current() { return this.stages[this.index]; }
  key(kind, id) { return `${this.prefix}.${kind}.${id}`; }

  stageProgress(i = this.index) {
    if (this.done[i]) return 1;
    const ts = this.taskState[i];
    if (!ts || !ts.length) return 0;
    return ts.reduce((a, t) => a + (t.ok ? 1 : Math.min(0.99, t.progress)), 0) / ts.length;
  }
  get overall() {
    if (!this.stages.length) return 0;
    return this.complete ? 1 : (this.done.filter(Boolean).length + this.stageProgress()) / this.stages.length;
  }

  update() {
    if (this.complete || !this.stages.length) return;
    const c = this.ctx, st = this.current, ts = this.taskState[this.index];
    let all = true, changed = false;
    st.tasks.forEach((t, k) => {
      const ok = !!t.check(c, this);
      const p = ok ? 1 : Math.max(0, Math.min(1, t.progress ? t.progress(c, this) : 0));
      if (ok !== ts[k].ok) { changed = true; if (ok) sfx.select(); }
      ts[k].ok = ok; ts[k].progress = p;
      all = all && ok;
    });
    if (all) this.#advance(); else if (changed) this.#emit();
  }

  // Force-complete the current stage (for stages completed by an explicit action).
  advance() { if (!this.complete) this.#advance(); }

  #advance() {
    const i = this.index;
    this.done[i] = true;
    this.times[i].end = this.ctx.state.time;
    bus.emit('stage:complete', { prefix: this.prefix, index: i, id: this.stages[i].id });
    if (i === this.stages.length - 1) { this.complete = true; bus.emit('stages:complete', { prefix: this.prefix }); }
    else { this.index = i + 1; this.times[this.index].start = this.ctx.state.time; }
    this.#emit();
  }

  hint() {
    const u = this.urgentHint(this.ctx, this);
    if (u) return u;
    if (this.complete) return null;
    const ts = this.taskState[this.index];
    const next = this.current.tasks.find((t, k) => !ts[k].ok);
    return next ? this.key('hint', next.id) : null;
  }

  #emit() { this.listeners.forEach((fn) => fn(this)); }
}
