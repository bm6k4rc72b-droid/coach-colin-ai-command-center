/**
 * Narrated autopilot: performs the case through the same Sim API the buttons use, steering at
 * each junction like an operator would. Drives the "Watch a demo" mode and the end-to-end tests.
 */
import { pathTo } from './anatomy';
import { isSuccess, ETICI_ORDER } from './angio';
import type { DeviceId, Sim } from './sim';
import type { Technique } from './thrombus';

interface Task {
  say: string;
  /** Returns true when finished. dt in real seconds. */
  run: (dt: number) => boolean;
}

export class Autopilot {
  private tasks: Task[] = [];
  private i = 0;
  private timer = 0;
  narration = '';
  done = false;

  constructor(
    private sim: Sim,
    private technique: Technique = 'combined',
    /** Navigation speed (mm per real second). */
    private speed = 60,
  ) {
    this.planTriage();
    this.planAccess();
    this.planPass();
  }

  get stepIndex(): number {
    return this.i;
  }

  private add(say: string, run: Task['run']): void {
    this.tasks.push({ say, run });
  }

  /** Hold for a moment so a narrated step can be read. */
  private pause(say: string, seconds: number, fn?: () => void): void {
    let t = 0;
    this.add(say, (dt) => {
      if (t === 0) fn?.();
      t += dt;
      return t >= seconds;
    });
  }

  /**
   * Move a device toward (segment, mm into it), backing out of wrong branches and setting the
   * tip angle before each junction.
   */
  private goTo(d: DeviceId, seg: string | (() => { seg: string; u: number }), u = 0): (dt: number) => boolean {
    return (dt) => {
      const sim = this.sim;
      if (typeof seg === 'function') ({ seg, u } = seg());
      sim.active = d;
      const path = pathTo(sim.tree, seg);
      const tip = sim.dev[d].s;
      // Wrong branch on the route at or behind the tip? Retract to its start.
      for (const r of sim.route) {
        if (!path.includes(r)) {
          const st = sim.segStart(r)!;
          if (tip > st - 0.5) {
            sim.move(d, -Math.min(this.speed * dt, tip - st + 1));
            return false;
          }
          break;
        }
      }
      const last = sim.route[sim.route.length - 1];
      const nextOnPath = path[path.indexOf(last) + 1];
      if (nextOnPath && path.includes(last)) sim.setAngle(d, sim.tree.segs[nextOnPath].angle);
      const st = sim.segStart(seg);
      const target = st === null ? Infinity : st + u;
      const delta = target - tip;
      if (Math.abs(delta) < 0.4) return true;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), this.speed * dt);
      const before = sim.dev[d].s;
      sim.move(d, step);
      // Blocked (e.g. the aspiration catheter at the clot face): accept where we are.
      return Math.abs(sim.dev[d].s - before) < 1e-6 && step > 0;
    };
  }

  private planTriage(): void {
    const sim = this.sim;
    this.pause('Code stroke. CT shows no bleed; CTA shows the occlusion. Now the decisions — each one is shown with its reasoning.', 3, () => sim.beginTriage());
    for (let k = 0; k < 6; k++) {
      let shown = 0;
      this.add('', (dt) => {
        const q = sim.triageCurrent;
        if (shown === 0) {
          if (!q) return true;
          const a = sim.c.answers;
          const choice =
            q.id === 'perfusion' ? (a.perfusionNeeded ? 'get' : 'skip') : q.id === 'bp' ? 'lower' : q.id === 'lysis' ? a.thrombolysis : q.id === 'evt' ? a.thrombectomy : 'sedation';
          sim.decide(q.id, choice);
          const d = sim.decisions[sim.decisions.length - 1];
          this.narration = `${d.question} → ${d.choice}. ${d.feedback}`;
        }
        shown += dt;
        return shown >= 4;
      });
    }
  }

  private planAccess(): void {
    const sim = this.sim;
    this.add('Femoral access. The balloon guide catheter goes up the descending aorta. Tip down to follow the arch…', this.goTo('guide', 'arch1', 3));
    this.add('…then tip up at the left common carotid origin. Arch type matters: higher arches are slower and harder.', this.goTo('guide', 'lcca', 30));
    this.add('Up the left common carotid and into the cervical internal carotid, below the skull base.', this.goTo('guide', 'ica', 40));
    this.pause('Diagnostic angiogram from the ICA: contrast stops abruptly at the occlusion (eTICI 0).', 3, () => sim.runDsa());
  }

  /** Where the microcatheter tip should sit: far enough beyond the clot for the stent to centre it. */
  private microTarget(): { seg: string; u: number } {
    const sim = this.sim;
    const main = sim.occ.find((o) => o.kind === 'clot' || o.kind === 'residual');
    const segs = sim.tree.segs;
    if (!main) return { seg: 'm2s', u: 9 };
    if (main.seg === 'ica' || main.seg === 'm1') {
      // Where the clot ends, measured from the start of M1; park the tip ~8 mm beyond it.
      const endInM1 = main.seg === 'm1' ? main.u + main.len : main.len - (segs.ica.length - main.u);
      const u = Math.max(4, endInM1 + 8);
      return u <= segs.m1.length - 3 ? { seg: 'm1', u } : { seg: 'm2s', u: Math.min(segs.m2s.length - 2, Math.max(4, u - segs.m1.length)) };
    }
    return { seg: main.seg, u: Math.min(segs[main.seg].length - 1, main.u + main.len + 7) };
  }

  private planPass(): void {
    const sim = this.sim;
    const tech = this.technique;
    const second = sim.passes.length > 0;
    this.add(
      second ? 'Another pass: re-cross what is left of the clot with the microcatheter and wire.' : 'Microcatheter and wire up through the carotid siphon. Tip lateral (0°) at the ICA terminus for the M1…',
      this.goTo('micro', 'm1', 3),
    );
    this.add('…and gently through the clot into an M2 trunk beyond it. The wire must cross before a stent can be deployed.', this.goTo('micro', () => this.microTarget()));
    if (tech !== 'stent')
      this.add('Aspiration catheter up over the microcatheter to the face of the clot.', this.goTo('asp', () => ({ ...this.microTarget(), u: this.microTarget().u })));
    if (tech !== 'aspiration') {
      this.pause('Unsheath the stent retriever across the clot: its struts open into the thrombus.', 1.5, () => {
        const cl = sim.clotRange();
        const len = cl ? cl.to - cl.from : 10;
        sim.setStentLength([20, 30, 40].find((l) => l >= len + 12) ?? 40);
        sim.deployStent();
      });
      this.pause('Wait about 3 minutes for the stent to embed in the clot (simulated time).', 2, () => sim.wait(3));
    }
    this.pause('Inflate the balloon guide: flow arrest stops blood pushing fragments downstream.', 1.5, () => sim.setBalloon(true));
    if (tech !== 'stent') this.pause('Aspiration on: the pump stalls when the clot is engaged.', 1.2, () => sim.setAspiration(true));
    this.pause('Retrieve: pull everything back together into the guide under aspiration.', 2, () => sim.retrieve());
    this.pause('Control angiogram: grade the reperfusion with eTICI.', 3, () => {
      sim.runDsa();
      const grade = sim.runs[sim.runs.length - 1].grade;
      const good = ETICI_ORDER.indexOf(grade) >= ETICI_ORDER.indexOf('2b67');
      if (!good && sim.passes.length < 4) this.planPass();
      else this.add(isSuccess(grade) ? `eTICI ${grade}: successful reperfusion. Finish and check the debrief.` : 'Stopping after several passes — each extra pass adds risk.', () => sim.finish() || true);
    });
  }

  update(dt: number): void {
    if (this.done) return;
    const task = this.tasks[this.i];
    if (!task) {
      this.done = true;
      return;
    }
    if (task.say && this.timer === 0) this.narration = task.say;
    this.timer += dt;
    // Safety net: never let one step hang the demo.
    if (task.run(dt) || this.timer > 45) {
      this.i++;
      this.timer = 0;
    }
  }

  /** Run to completion instantly (tests). */
  runAll(maxSteps = 20000): void {
    for (let k = 0; k < maxSteps && !this.done; k++) this.update(0.25);
  }
}
