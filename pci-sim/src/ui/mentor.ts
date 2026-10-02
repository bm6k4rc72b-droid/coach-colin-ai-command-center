/**
 * Mentor panel: step, goal, sub-tasks, progress, calm situation-specific hint and a
 * "Why this step?" teaching note. In demo mode it narrates the autopilot with a DEMO badge.
 */
import { mentorHint } from '../procedure/mentor';
import type { Demo } from '../procedure/demo';
import type { Simulation } from '../procedure/sim';
import { STAGES, stagePercent, taskKey } from '../procedure/stages';
import { $, esc, setHTML, setText } from './dom';

export class MentorPanel {
  private el = $('mentor');
  private title!: HTMLElement;
  private body!: HTMLElement;
  private toggle!: HTMLButtonElement;
  private lastWhy = -1;

  constructor(onToggle: () => void) {
    this.el.innerHTML = `<div class="mhead"><h2 id="m-title"></h2><button id="m-toggle" title="Collapse (M)">–</button></div>
      <div class="mbody" id="m-body"></div>`;
    this.title = $('m-title');
    this.body = $('m-body');
    this.toggle = $('m-toggle') as HTMLButtonElement;
    this.toggle.addEventListener('click', onToggle);
  }

  update(sim: Simulation, demo: Demo, open: boolean): void {
    this.el.classList.toggle('collapsed', !open);
    setText(this.toggle, open ? '–' : '+');
    const p = sim.progress;
    const idx = Math.min(p.current, STAGES.length - 1);
    const st = STAGES[idx];
    const finished = p.current >= STAGES.length;
    const demoStep = demo.step;
    this.el.classList.toggle('demo', !!demoStep);
    setText(this.title, finished ? 'Case complete' : `Step ${st.id}/6 · ${st.title}`);
    if (!open) return;
    const snap = sim.snapshot();
    const lad = sim.anat.vessels.LAD;
    const up = sim.upcomingBranch();
    const hint = demoStep
      ? `<span class="demo-badge">DEMO</span> <strong>${esc(demoStep.title)}</strong><br>${esc(demoStep.text)}`
      : esc(
          mentorHint(snap, {
            guideRootS: sim.anat.landmarks.root,
            tool: sim.tool,
            wireAngle: sim.wire.angle,
            ladAngle: lad.wireAngle,
            upcoming: up ? { options: up.options.map((o) => sim.anat.vessels[o].name.split(' (')[0]), distance: up.distance, terminal: up.terminal } : null,
            qcaRef: sim.qca?.referenceDiameter ?? null,
            qcaLength: sim.qca?.lesionLength ?? null,
            stentSize: sim.stentSize,
            catheterPressure: sim.catheter?.pressure ?? 0,
            inflationTime: sim.catheter?.inflationTime ?? 0,
            cineRunning: !!sim.cine,
          }),
        );
    const tasks = finished
      ? ''
      : `<ul>${st.tasks
          .map((t) => {
            const done = !!p.done[taskKey(st.id, t.id)];
            return `<li class="${done ? 'done' : ''}"><span class="box">${done ? '✓' : ''}</span>${esc(t.label)}</li>`;
          })
          .join('')}</ul>`;
    const pct = finished ? 100 : stagePercent(p, idx);
    const html = `${finished ? '' : `<div class="goal">${esc(st.goal)}</div>`}${tasks}
      <div class="progress" title="${pct}%"><i style="width:${pct}%"></i></div>
      <div style="font-size:11px;color:var(--muted);text-align:right;margin-top:-4px">${pct}% of this step</div>
      <div class="hint">${hint}</div>`;
    // Keep the <details> element stable so it does not collapse while the user reads it.
    let main = this.body.querySelector<HTMLElement>('.m-main');
    if (!main) {
      this.body.innerHTML = '<div class="m-main"></div><details class="m-why"><summary>Why this step?</summary><p></p></details>';
      main = this.body.querySelector<HTMLElement>('.m-main')!;
    }
    setHTML(main, html);
    if (this.lastWhy !== idx) {
      this.lastWhy = idx;
      setText(this.body.querySelector('.m-why p')!, st.why);
    }
  }
}
