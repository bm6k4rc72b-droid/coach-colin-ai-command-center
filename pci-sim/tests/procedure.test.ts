import { describe, expect, it } from 'vitest';
import { buildAnatomy } from '../src/anatomy/vessels';
import { buildDebrief, type CaseSummary } from '../src/procedure/debrief';
import { Demo, DEMO_STEPS } from '../src/procedure/demo';
import { emptyInput, Simulation, distinctViews, type SimInput } from '../src/procedure/sim';
import type { Snapshot } from '../src/procedure/snapshot';
import { initialProgress, STAGES, updateProgress } from '../src/procedure/stages';
import { toolAvailability } from '../src/tools/tools';

const anat = buildAnatomy();

const baseSnap = (): Snapshot => ({
  t: 0,
  stage: 0,
  guideS: 0,
  elbowS: 170,
  aortaEntryS: 610,
  guideAtRoot: false,
  guideAngle: 95,
  facingLeft: false,
  engaged: false,
  fluoroSeenGuide: false,
  angioDone: false,
  heparin: false,
  act: 128,
  wireOut: false,
  wireVessel: 'LM',
  wireS: 0,
  wireInLAD: false,
  wireCrossed: false,
  wireParked: false,
  wireBuckling: false,
  catheter: null,
  balloonInPatient: false,
  stentInPatient: false,
  predilInflated: false,
  predilationDone: false,
  qcaDone: false,
  stentDeployed: false,
  stentCoversLesion: false,
  stentDeflated: false,
  finalInjections: 0,
  finalDistinctViews: 0,
  lesionStart: 31,
  lesionEnd: 45,
  lesionCentre: 38,
  ischaemia: 0,
  occlusionTime: 0,
  unstable: false,
  dissection: false,
  dissectionSealed: false,
  timi: 2,
  demo: false,
});

describe('stage progression', () => {
  it('has six stages', () => {
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('sub-tasks latch and the stage completes only when all are done', () => {
    let p = initialProgress();
    let s = { ...baseSnap(), guideS: 200 };
    ({ progress: p } = updateProgress(p, s));
    expect(p.done['1:elbow']).toBe(true);
    // Pulling back does not un-latch.
    s = { ...s, guideS: 10 };
    ({ progress: p } = updateProgress(p, s));
    expect(p.done['1:elbow']).toBe(true);
    expect(p.current).toBe(0);
    s = { ...s, guideS: 700, guideAtRoot: true, fluoroSeenGuide: true, t: 42 };
    const r = updateProgress(p, s);
    expect(r.completed).toEqual([0]);
    expect(r.progress.current).toBe(1);
    expect(r.progress.completedAt[0]).toBe(42);
  });
  it('later stages are not evaluated before earlier ones complete', () => {
    const s = { ...baseSnap(), heparin: true, wireOut: true };
    const { progress } = updateProgress(initialProgress(), s);
    expect(progress.done['3:heparin']).toBeUndefined();
  });
});

describe('tool unlocking', () => {
  it('guide and fluoro are always available; others explain why they are locked', () => {
    const av = toolAvailability(baseSnap());
    expect(av.guide.enabled).toBe(true);
    expect(av.fluoro.enabled).toBe(true);
    for (const id of ['wire', 'balloon', 'stent', 'contrast', 'measure'] as const) {
      expect(av[id].enabled).toBe(false);
      expect(av[id].reason.length).toBeGreaterThan(10);
    }
  });
  it('wire needs engagement + angiogram + heparin', () => {
    const s = { ...baseSnap(), engaged: true, angioDone: true };
    expect(toolAvailability(s).wire.enabled).toBe(false);
    expect(toolAvailability(s).wire.reason).toMatch(/heparin/i);
    expect(toolAvailability({ ...s, heparin: true }).wire.enabled).toBe(true);
  });
  it('balloon needs the wire distal; stent needs pre-dilation and the balloon out', () => {
    const s = { ...baseSnap(), engaged: true, angioDone: true, heparin: true };
    expect(toolAvailability(s).balloon.enabled).toBe(false);
    const distal = { ...s, wireCrossed: true, wireParked: true, wireInLAD: true, wireS: 80 };
    expect(toolAvailability(distal).balloon.enabled).toBe(true);
    expect(toolAvailability(distal).stent.enabled).toBe(false);
    const pre = { ...distal, predilationDone: true, balloonInPatient: true };
    expect(toolAvailability(pre).stent.reason).toMatch(/Withdraw/);
    expect(toolAvailability({ ...pre, balloonInPatient: false }).stent.enabled).toBe(true);
    expect(toolAvailability({ ...pre, balloonInPatient: false, stentInPatient: true }).balloon.enabled).toBe(false);
  });
  it('the simulation refuses locked tools with a message', () => {
    const sim = new Simulation({ seed: 3 }, anat);
    expect(sim.selectTool('wire')).toBe(false);
    expect(sim.tool).toBe('guide');
    expect(sim.messages.at(-1)!.text).toMatch(/locked/);
  });
});

describe('distinct projections', () => {
  it('counts views at least 20° apart', () => {
    expect(distinctViews([{ lao: -30, cra: 30 }, { lao: -25, cra: 28 }])).toBe(1);
    expect(distinctViews([{ lao: -30, cra: 30 }, { lao: 45, cra: -30 }])).toBe(2);
  });
});

const good: CaseSummary = {
  stagesCompleted: 6,
  residualStenosis: 0.02,
  finalTimi: 3,
  stentCount: 1,
  stentDiameter: 3.07,
  referenceDiameter: 2.95,
  marginProximal: 2,
  marginDistal: 2,
  heparin: true,
  preDilated: true,
  qcaUsed: true,
  dissection: false,
  dissectionSealed: true,
  wireForcingEvents: 0,
  balloonRupture: false,
  longestInflation: 13,
  contrastMl: 24,
  fluoroSeconds: 60,
  finalViews: 2,
};

describe('debrief scoring', () => {
  it('a textbook case scores 100 / Excellent', () => {
    const d = buildDebrief(good);
    expect(d.score).toBe(100);
    expect(d.grade).toBe('Excellent');
    expect(d.items.every((i) => i.status === 'ok')).toBe(true);
    expect(d.items).toHaveLength(15);
    for (const i of d.items) expect(i.teaching.length).toBeGreaterThan(20);
  });
  it('minor issues give Good', () => {
    const d = buildDebrief({ ...good, finalViews: 1, contrastMl: 150, longestInflation: 40 });
    expect(d.grade).toBe('Good');
  });
  it('an oversized short stent with an unsealed edge dissection needs work', () => {
    const d = buildDebrief({
      ...good,
      stagesCompleted: 4,
      stentDiameter: 3.75,
      marginProximal: -1,
      marginDistal: -1,
      dissection: true,
      dissectionSealed: false,
      finalTimi: 2,
    });
    expect(d.grade).toBe('Needs work');
    expect(d.items.find((i) => i.id === 'coverage')!.status).toBe('bad');
    expect(d.items.find((i) => i.id === 'sizing')!.status).toBe('bad');
    expect(d.items.find((i) => i.id === 'dissection')!.status).toBe('bad');
  });
  it('a sealed dissection is a warning, an unsealed one is bad', () => {
    expect(buildDebrief({ ...good, dissection: true, dissectionSealed: true }).items.find((i) => i.id === 'dissection')!.status).toBe('warn');
  });
  it('no stent → Incomplete', () => {
    const d = buildDebrief({ ...good, stagesCompleted: 3, stentCount: 0, stentDiameter: null, marginProximal: null, marginDistal: null });
    expect(d.grade).toBe('Incomplete');
  });
  it('score stays within 0–100', () => {
    const d = buildDebrief({
      ...good,
      stagesCompleted: 0,
      residualStenosis: 0.9,
      finalTimi: 0,
      heparin: false,
      balloonRupture: true,
      wireForcingEvents: 9,
      contrastMl: 500,
      fluoroSeconds: 4000,
      longestInflation: 200,
      finalViews: 0,
      dissection: true,
      dissectionSealed: false,
    });
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
  });
});

/** Run the demo autopilot until a given step title, then hand back control. */
function demoUntil(sim: Simulation, title: string) {
  const demo = new Demo();
  demo.start(sim);
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 600 && demo.active; i++) {
    if (demo.step?.title.startsWith(title)) break;
    sim.step(dt, demo.input(sim, dt));
  }
  demo.stop(sim);
}

function hold(sim: Simulation, seconds: number, inp: Partial<SimInput> = {}, until?: () => boolean) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    if (until?.()) return;
    sim.step(dt, { ...emptyInput(), ...inp });
  }
}

describe('full cases', () => {
  it('the demo ends with all six stages and an Excellent debrief', () => {
    const sim = new Simulation({ seed: 11 }, anat);
    const demo = new Demo();
    demo.start(sim);
    for (let i = 0; i < 60 * 600 && demo.active; i++) sim.step(1 / 60, demo.input(sim, 1 / 60));
    expect(demo.done).toBe(true);
    expect(sim.progress.current).toBe(STAGES.length);
    const d = sim.debrief();
    expect(d.grade).toBe('Excellent');
    expect(sim.dissections).toHaveLength(0);
    expect(sim.timi).toBe(3);
    expect(DEMO_STEPS.length).toBeGreaterThan(20);
  });

  it('a deliberately bad case (oversized short stent at high pressure) dissects, slows flow and needs work', () => {
    const sim = new Simulation({ seed: 5 }, anat);
    demoUntil(sim, 'Load a 3.0');
    expect(sim.flags.predilationDone).toBe(true);
    expect(sim.timi).toBe(3);
    // Oversized, short stent.
    expect(sim.selectTool('stent')).toBe(true);
    expect(sim.setSize('stent', 3.5, 12)).toBe(true);
    // Advance until the stent centre reaches the lesion centre.
    hold(sim, 30, { advance: 1 }, () => {
      const r = sim.catheterRange();
      return !!r && r.vessel === 'LAD' && sim.catheterOutside() && (r.s0 + r.s1) / 2 >= sim.lesion.centre;
    });
    // High pressure: 16 atm (RBP).
    hold(sim, 10, { inflate: true }, () => (sim.catheter?.pressure ?? 0) >= 16);
    hold(sim, 5);
    hold(sim, 0.1, { deflate: true });
    hold(sim, 3);
    hold(sim, 30, { advance: -1 }, () => !sim.catheter);
    expect(sim.catheter).toBeNull();
    expect(sim.dissections.length).toBeGreaterThan(0);
    expect(sim.dissections.some((d) => d.cause === 'stent-edge' && !d.sealed)).toBe(true);
    expect(sim.timi).toBeLessThan(3);
    // Final angiograms in two projections.
    sim.setPreset(0);
    expect(sim.inject()).toBe(true);
    hold(sim, 10, {}, () => !sim.cine);
    sim.setPreset(3);
    expect(sim.inject()).toBe(true);
    hold(sim, 10, {}, () => !sim.cine);
    const d = sim.debrief();
    expect(d.grade).toBe('Needs work');
    expect(d.items.find((i) => i.id === 'coverage')!.status).toBe('bad');
    expect(d.items.find((i) => i.id === 'sizing')!.status).toBe('bad');
    expect(d.items.find((i) => i.id === 'dissection')!.value).toBe('UNSEALED');
  });

  it('a bailout stent covering the edge dissection seals it and restores flow', () => {
    const sim = new Simulation({ seed: 5 }, anat);
    demoUntil(sim, 'Load a 3.0');
    sim.selectTool('stent');
    sim.setSize('stent', 3.5, 12);
    hold(sim, 30, { advance: 1 }, () => {
      const r = sim.catheterRange();
      return !!r && r.vessel === 'LAD' && sim.catheterOutside() && (r.s0 + r.s1) / 2 >= sim.lesion.centre;
    });
    hold(sim, 10, { inflate: true }, () => (sim.catheter?.pressure ?? 0) >= 16);
    hold(sim, 0.1, { deflate: true });
    hold(sim, 3);
    hold(sim, 30, { advance: -1 }, () => !sim.catheter);
    const diss = sim.dissections[0];
    // Second (fresh) stent, normally sized, centred on the flap.
    sim.selectTool('stent');
    sim.setSize('stent', 3.0, 15);
    hold(sim, 40, { advance: 1 }, () => {
      const r = sim.catheterRange();
      return !!r && r.vessel === 'LAD' && sim.catheterOutside() && (r.s0 + r.s1) / 2 >= diss.s;
    });
    hold(sim, 10, { inflate: true }, () => (sim.catheter?.pressure ?? 0) >= 11);
    hold(sim, 0.1, { deflate: true });
    hold(sim, 3);
    expect(sim.stents).toHaveLength(2);
    expect(sim.dissections.every((d) => d.sealed)).toBe(true);
    expect(sim.timi).toBe(3);
  });

  it('a prolonged inflation makes the patient unstable', () => {
    const sim = new Simulation({ seed: 9 }, anat);
    demoUntil(sim, 'Hold ~12');
    hold(sim, 65);
    expect(sim.physio.unstable).toBe(true);
    expect(sim.messages.some((m) => /UNSTABLE/.test(m.text))).toBe(true);
    hold(sim, 0.1, { deflate: true });
    hold(sim, 3);
    expect(sim.physio.unstable).toBe(false);
  });
});
