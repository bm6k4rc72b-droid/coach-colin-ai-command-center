import { STAGES } from './stages.js';
import { bus } from './bus.js';
import { sfx } from '../audio/engine.js';

// Drives the checklist. It tracks the active stage, evaluates its tasks every
// frame, records facts from tool events, and unlocks the next stage when every
// task of the current one is met.
export class StageSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.stages = STAGES;
    this.index = 0;
    this.done = STAGES.map(() => false);
    this.times = STAGES.map(() => ({ start: null, end: null }));
    this.taskState = STAGES.map((s) => s.tasks.map(() => ({ ok: false, progress: 0 })));
    this.hover = {};
    this.facts = {};
    this.lastClipTime = null;
    this.complete = false;
    this.listeners = new Set();
    ctx.stages = this;

    const now = () => ctx.state.time;
    bus.on('doppler:check', ({ part, flow }) => { if (flow > 0.3) this.facts['doppler:' + part] = now(); else this.facts['dopplerNoFlow:' + part] = now(); });
    bus.on('icg:done', () => { this.facts.icg = now(); });
    bus.on('icg:start', () => { this.facts.icgStart = now(); });
    bus.on('clip:applied', () => { this.lastClipTime = now(); });
    bus.on('clip:removed', () => { if (!ctx.state.clips?.length) this.lastClipTime = null; });
  }

  onChange(fn) { this.listeners.add(fn); }
  get current() { return this.stages[this.index]; }

  start() {
    this.times[0].start = this.ctx.state.time;
    this.#emit();
  }

  // Stage progress (0–1): the mean of its tasks' partial progress.
  stageProgress(i = this.index) {
    if (this.done[i]) return 1;
    const ts = this.taskState[i];
    return ts.reduce((a, t) => a + (t.ok ? 1 : Math.min(0.99, t.progress)), 0) / ts.length;
  }
  get overall() {
    const doneCount = this.done.filter(Boolean).length;
    return this.complete ? 1 : (doneCount + (this.done[this.index] ? 0 : this.stageProgress())) / this.stages.length;
  }

  update(dt) {
    const c = this.ctx;
    const hovered = c.inspector.hit?.object.userData.pickPart;
    if (hovered) this.hover[hovered] = (this.hover[hovered] || 0) + dt;
    const tp = c.tools?.active && c.tools.down && c.tools.hit?.part;
    if (tp) this.facts['touch:' + tp] = c.state.time;
    if (this.complete) return;

    const st = this.current, ts = this.taskState[this.index];
    let all = true, changed = false;
    st.tasks.forEach((t, k) => {
      const ok = !!t.check(c, this);
      const progress = ok ? 1 : Math.max(0, Math.min(1, t.progress ? t.progress(c, this) : 0));
      if (ok !== ts[k].ok) {
        changed = true;
        if (ok) { sfx.select(); bus.emit('task:done', { stage: st.id, task: t.id }); }
      }
      ts[k].ok = ok; ts[k].progress = progress;
      all = all && ok;
    });
    if (all) this.#advance();
    else if (changed) this.#emit();
  }

  #advance() {
    const c = this.ctx, i = this.index;
    this.done[i] = true;
    this.times[i].end = c.state.time;
    sfx.confirm();
    bus.emit('stage:complete', { index: i, id: this.stages[i].id, duration: this.times[i].end - this.times[i].start });
    c.feed.push('feed.stageDone', 'ok', { n: i + 1, name: c.i18n.t('stage.' + this.stages[i].id) });
    if (i === this.stages.length - 1) {
      this.complete = true;
      bus.emit('procedure:complete', {});
    } else {
      this.index = i + 1;
      this.times[this.index].start = c.state.time;
      bus.emit('stage:start', { index: this.index, id: this.current.id });
    }
    this.#emit();
  }

  // Contextual advice for the mentor: urgent field problems first, then the next unmet task.
  hint() {
    const c = this.ctx;
    if (this.complete) return 'hint.complete';
    if (c.bleeding.activeSources.some((s) => s.kind === 'arterial')) return c.flow.tempClip ? 'hint.ruptureClip' : 'hint.rupture';
    if (c.bleeding.volume > 3) return 'hint.suctionPool';
    if (c.bleeding.activeSources.length) return 'hint.oozeBipolar';
    if (c.risk.value > 0.45) return 'hint.riskHigh';
    if (c.flow.tempClip && c.state.tempClipOn && c.state.time - c.state.tempClipStart > 240) return 'hint.tempLong';
    // After clipping, what ICG and the Doppler reveal about the clip.
    if (this.lastClipTime !== null) {
      const after = (k) => this.facts[k] !== undefined && this.facts[k] >= this.lastClipTime;
      if (after('dopplerNoFlow:PCom')) return 'hint.pcomLost';
      if (after('dopplerNoFlow:AChA')) return 'hint.achaLost';
      if (after('icg') && c.flow.at('aneurysm') > 0.08) return 'hint.domeFilling';
    }
    const ts = this.taskState[this.index];
    const next = this.current.tasks.find((t, k) => !ts[k].ok);
    return next ? 'hint.' + next.id : null;
  }

  #emit() { this.listeners.forEach((fn) => fn(this)); }
}
