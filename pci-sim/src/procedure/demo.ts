/**
 * Scripted autopilot that performs the whole case through the SAME input path as the learner:
 * it produces SimInput (advance, rotate, fine, inflate…) and calls the same action methods
 * the keyboard handlers call. Pure — runs headless in tests.
 */
import { GUIDE, LESION } from '../config/anatomy';
import { angleDiff } from '../anatomy/math';
import { lesionEnd, lesionStart } from '../anatomy/lumen';
import { emptyInput, type SimInput, type Simulation } from './sim';

interface Ctx {
  /** Seconds since this step began. */
  t: number;
  /** Scratch memory for the step. */
  mem: Record<string, number>;
}

interface DemoStep {
  title: string;
  text: string;
  enter?: (sim: Simulation) => void;
  /** Return the input for this frame, or 'done' to move on. */
  update: (sim: Simulation, ctx: Ctx) => Partial<SimInput> | 'done';
}

const rotateToward = (current: number, target: number, tol = 2.5): number => {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= tol) return 0;
  return Math.sign(d) * Math.min(1, Math.abs(d) / 25 + 0.15);
};

const wait = (s: number) => (_: Simulation, c: Ctx) => (c.t >= s ? 'done' : {});

const cineDone = (sim: Simulation, c: Ctx) => (c.t > 0.3 && !sim.cine ? 'done' : {});

/** Centre a catheter's working length on the lesion centre; returns input or done. */
function positionCatheter(sim: Simulation, c: Ctx): Partial<SimInput> | 'done' {
  const r = sim.catheterRange();
  if (!r || r.vessel !== 'LAD' || !sim.catheterOutside()) return { advance: 1 };
  const pedal = sim.view === 'fluoro';
  const centre = (r.s0 + r.s1) / 2;
  const err = LESION.centre - centre;
  if (Math.abs(err) < 0.15) {
    c.mem.settle = (c.mem.settle ?? 0) + 1;
    return c.mem.settle > 20 ? 'done' : { pedal };
  }
  c.mem.settle = 0;
  if (err > 3) return { advance: 1, pedal };
  if (err < -3) return { advance: -1, pedal };
  return { advance: Math.sign(err) * Math.min(1, Math.abs(err) / 1.5 + 0.1), fine: true, pedal };
}

function inflateTo(target: number) {
  return (sim: Simulation): Partial<SimInput> | 'done' => {
    const c = sim.catheter;
    if (!c) return 'done';
    if (c.pressure >= target) return 'done';
    return { inflate: true, fine: target - c.pressure < 1, pedal: true };
  };
}

function holdInflation(seconds: number) {
  return (sim: Simulation): Partial<SimInput> | 'done' => {
    const c = sim.catheter;
    if (!c || c.inflationTime >= seconds) return 'done';
    return { pedal: c.inflationTime < 2 };
  };
}

const deflate = (sim: Simulation, c: Ctx): Partial<SimInput> | 'done' => {
  const cat = sim.catheter;
  if (!cat || (cat.pressure <= 0 && c.t > 0.6)) return 'done';
  return c.t < 0.05 ? { deflate: true } : cat.pressure > 0 && !cat.deflating ? { deflate: true } : {};
};

const withdraw = (sim: Simulation): Partial<SimInput> | 'done' => (sim.catheter ? { advance: -1 } : 'done');

export const DEMO_STEPS: DemoStep[] = [
  {
    title: 'Demo: right radial PCI of the mid LAD',
    text: 'Watch a complete case. The autopilot uses exactly the same controls you will. Press any key, click or scroll to take over at any moment.',
    enter: (sim) => {
      sim.selectTool('guide');
      sim.view = '3d';
      sim.setPreset(0);
    },
    update: wait(3),
  },
  {
    title: 'Guide up the arm',
    text: 'Hold W to advance the 6F guide from the wrist: radial → brachial → axillary → subclavian → brachiocephalic. Short fluoro taps (Space) confirm the tip is moving freely.',
    update: (sim, c) => {
      if (sim.guide.s >= sim.anat.landmarks.aortaEntry) return 'done';
      const tap = c.t % 4 < 0.5;
      return { advance: 1, pedal: tap };
    },
  },
  {
    title: 'Down to the aortic root',
    text: 'Into the ascending aorta. On fluoro the catheter tip drops toward the aortic valve — stop at the root.',
    enter: (sim) => {
      sim.view = 'fluoro';
      sim.setPreset(2);
    },
    update: (sim, c) => {
      if (sim.guideAtRoot) return 'done';
      return { advance: 1, pedal: c.t % 2.5 < 0.6 };
    },
  },
  {
    title: 'Rotate to the left coronary cusp',
    text: 'Torque the pre-shaped tip (A/D) until it faces the left coronary cusp. Facing the right cusp would find the RCA instead.',
    update: (sim, c) => {
      const r = rotateToward(sim.guide.angle, GUIDE.leftCuspAngle);
      if (r === 0 && c.t > 1.2) return 'done';
      return { rotate: r, pedal: c.t < 1.0 };
    },
  },
  {
    title: 'Engage the left main',
    text: 'A gentle, fine advance (Shift + W) seats the tip coaxially in the left main ostium.',
    update: (sim) => (sim.guide.engaged ? 'done' : { advance: 1, fine: true, pedal: true }),
  },
  {
    title: 'Diagnostic angiogram',
    text: 'Selective injection (5): 8 ml of contrast fills the LM, LAD, LCx and diagonals. Note the tight, faint mid-LAD narrowing and the slower filling beyond it (TIMI 2).',
    enter: (sim) => {
      sim.setPreset(0);
      sim.inject();
    },
    update: cineDone,
  },
  {
    title: 'Heparin',
    text: 'Unfractionated heparin 100 IU/kg (G) before any wire enters the coronary. ACT climbs from 128 s toward ~285 s.',
    enter: (sim) => sim.giveHeparin(),
    update: wait(2),
  },
  {
    title: 'Wire out — aim for the LAD',
    text: 'Select the wire (2). Rotate the shaped tip toward the LAD before the LM bifurcation, otherwise it falls into the circumflex.',
    enter: (sim) => {
      sim.selectTool('wire');
      sim.view = '3d';
    },
    update: (sim, c) => {
      const r = rotateToward(sim.wire.angle, sim.anat.vessels.LAD.wireAngle, 3);
      if (r === 0 && c.t > 0.8) return 'done';
      return { rotate: r };
    },
  },
  {
    title: 'Through the LM, past D1',
    text: 'Advance into the LAD. The tip stays away from the first diagonal because it is not pointing at it (side branches capture within ±50°).',
    update: (sim) => {
      const l = sim.wireLocus();
      if (l.vessel === 'LAD' && l.s >= lesionStart(LESION) - 3) return 'done';
      return { advance: 1 };
    },
  },
  {
    title: 'Cross the lesion slowly',
    text: 'Fine advance (Shift) at ~4 mm/s: no buckling, no resistance spike, no dissection risk.',
    update: (sim) => {
      const l = sim.wireLocus();
      if (sim.wire.crossed && l.s >= lesionEnd(LESION) + 2) return 'done';
      return { advance: 1, fine: true };
    },
  },
  {
    title: 'Park the wire distally',
    text: 'Advance to the distal LAD, past D2, for support. Keep the tip away from the very end of the vessel.',
    update: (sim) => {
      const l = sim.wireLocus();
      if (l.vessel === 'LAD' && l.s >= lesionEnd(LESION) + 32) return 'done';
      return { advance: 1 };
    },
  },
  {
    title: 'Pre-dilation balloon 2.5 × 15 mm',
    text: 'Choose a 2.5 × 15 mm balloon (≈0.85 × reference) while it is still in the guide, then advance it over the wire.',
    enter: (sim) => {
      sim.selectTool('balloon');
      sim.setSize('balloon', 2.5, 15);
    },
    update: (sim, c) => (c.t > 0.5 && sim.catheter ? 'done' : { advance: 1 }),
  },
  {
    title: 'Centre the markers on the lesion',
    text: 'The two radiopaque markers bracket the working length. Centre them on the lesion with fine moves under fluoro.',
    enter: (sim) => (sim.view = 'fluoro'),
    update: positionCatheter,
  },
  {
    title: 'Inflate to 10 atm',
    text: 'Hold E: the semi-compliant balloon grows ~1.5% per atm above its 8 atm nominal. The LAD is occluded — watch ST rise in V2.',
    update: inflateTo(10),
  },
  {
    title: 'Hold ~12 seconds',
    text: 'A short inflation cracks the plaque. Longer occlusion only adds ischaemia.',
    update: holdInflation(12),
  },
  {
    title: 'Deflate',
    text: 'Q deflates. Flow returns and the ST segment settles over a few seconds.',
    update: deflate,
  },
  {
    title: 'Withdraw the balloon',
    text: 'Pull the balloon back into the guide and out (S). The wire stays across the lesion.',
    update: withdraw,
  },
  {
    title: 'QCA',
    text: 'Measure (7): reference ~2.95 mm and a lesion of ~14 mm → a 3.0 × 18 mm stent gives ≥ 1.5 mm healthy margins on both sides.',
    enter: (sim) => sim.selectTool('measure'),
    update: wait(2.5),
  },
  {
    title: 'Load a 3.0 × 18 mm drug-eluting stent',
    text: 'Select the stent (4), size it from QCA, and advance it over the wire.',
    enter: (sim) => {
      sim.selectTool('stent');
      sim.setSize('stent', 3.0, 18);
      sim.view = '3d';
    },
    update: (sim, c) => (c.t > 0.5 && sim.catheter ? 'done' : { advance: 1 }),
  },
  {
    title: 'Cover the whole lesion',
    text: 'Centre the stent so it covers the lesion from healthy to healthy segment, checking the markers on fluoro.',
    enter: (sim) => (sim.view = 'fluoro'),
    update: positionCatheter,
  },
  {
    title: 'Deploy at 12 atm',
    text: 'At 6 atm the stent is deployed; 12 atm expands it to ~3.07 mm (1.2% per atm above 10 atm nominal).',
    update: inflateTo(12),
  },
  {
    title: 'Hold the deployment',
    text: 'Hold briefly for full expansion and apposition.',
    update: holdInflation(10),
  },
  {
    title: 'Deflate the stent balloon',
    text: 'Deflate fully before moving anything.',
    update: deflate,
  },
  {
    title: 'Withdraw the delivery balloon',
    text: 'The stent stays; the delivery balloon comes out.',
    update: withdraw,
  },
  {
    title: 'Final angiogram — view 1',
    text: 'Inject in RAO 30 CRA 30: no residual narrowing, brisk TIMI 3 flow, no edge staining.',
    enter: (sim) => {
      sim.setPreset(0);
      sim.inject();
    },
    update: cineDone,
  },
  {
    title: 'Final angiogram — view 2',
    text: 'A second, distinct projection (LAO 45 CAU 30, "spider") confirms the result.',
    enter: (sim) => {
      sim.setPreset(3);
      sim.inject();
    },
    update: cineDone,
  },
  {
    title: 'Case complete',
    text: 'All six stages done. Open the debrief to see how this case scores.',
    update: wait(1),
  },
];

export class Demo {
  active = false;
  index = 0;
  private ctx: Ctx = { t: 0, mem: {} };
  private entered = false;

  start(sim: Simulation): void {
    this.active = true;
    this.index = 0;
    this.entered = false;
    this.ctx = { t: 0, mem: {} };
    sim.demo = true;
  }

  stop(sim: Simulation): void {
    this.active = false;
    sim.demo = false;
  }

  get step(): DemoStep | null {
    return this.active ? DEMO_STEPS[this.index] ?? null : null;
  }

  get done(): boolean {
    return this.index >= DEMO_STEPS.length;
  }

  /** Produce this frame's input (and fire step actions). */
  input(sim: Simulation, dt: number): SimInput {
    const inp = emptyInput();
    if (!this.active) return inp;
    let guard = 0;
    while (this.index < DEMO_STEPS.length && guard++ < 4) {
      const st = DEMO_STEPS[this.index];
      if (!this.entered) {
        this.entered = true;
        this.ctx = { t: 0, mem: {} };
        st.enter?.(sim);
      }
      const r = st.update(sim, this.ctx);
      this.ctx.t += dt;
      if (r === 'done') {
        this.index++;
        this.entered = false;
        continue;
      }
      Object.assign(inp, r);
      break;
    }
    if (this.index >= DEMO_STEPS.length) this.stop(sim);
    return inp;
  }
}
