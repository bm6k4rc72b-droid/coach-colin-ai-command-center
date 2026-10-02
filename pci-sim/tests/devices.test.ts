import { describe, expect, it } from 'vitest';
import { BALLOON, GUIDE, INFLATION, LESION, STENT, WIRE } from '../src/config/anatomy';
import { lesionEnd, lesionStart } from '../src/anatomy/lumen';
import { buildAnatomy } from '../src/anatomy/vessels';
import { canResize, newCatheter, rupturePressure, stepCatheter, type CatheterState } from '../src/physics/balloon';
import { initialGuide, stepGuide, type GuideState } from '../src/physics/guide';
import { advanceAlongTree, initialLegs, locate } from '../src/physics/route';
import { initialWire, stepWire, type WireState } from '../src/physics/wire';

const anat = buildAnatomy();
const root = anat.landmarks.root;

const atRoot = (angle: number): GuideState => ({ ...initialGuide(), s: root, angle });
const guideStep = (g: GuideState, move: number, rotate = 0, dt = 1 / 60, wireOut = false) =>
  stepGuide(g, { move, rotate, dt, railLength: root, wireOut });

describe('guide catheter', () => {
  it('advances from the wrist and stops at the aortic root', () => {
    let g = initialGuide();
    for (let i = 0; i < 2000; i++) g = guideStep(g, 2).state;
    expect(g.s).toBe(root);
    expect(g.engaged).toBe(false);
  });
  it('engages the LM on a gentle advance when facing the left cusp (±25°)', () => {
    for (const a of [0, 20, -24]) {
      const r = guideStep(atRoot(a), GUIDE.fineSpeed / 60);
      expect(r.engagedNow).toBe(true);
      expect(r.state.engaged).toBe(true);
    }
    expect(guideStep(atRoot(30), GUIDE.fineSpeed / 60).state.engaged).toBe(false);
  });
  it('gives a specific message when facing the right cusp', () => {
    const r = guideStep(atRoot(GUIDE.rightCuspAngle), GUIDE.fineSpeed / 60);
    expect(r.state.engaged).toBe(false);
    expect(r.messages.some((m) => /RIGHT coronary cusp/.test(m.text))).toBe(true);
  });
  it('does not engage on a fast push', () => {
    let g = atRoot(0);
    g = { ...g, speed: 60 };
    const r = guideStep(g, GUIDE.speed / 60);
    expect(r.state.engaged).toBe(false);
  });
  it('pops out with > 40° of torque', () => {
    let g = guideStep(atRoot(0), GUIDE.fineSpeed / 60).state;
    let popped = false;
    for (let i = 0; i < 60 && !popped; i++) {
      const r = guideStep(g, 0, 2);
      g = r.state;
      popped = r.poppedOut;
    }
    expect(popped).toBe(true);
    expect(g.engaged).toBe(false);
  });
  it('cannot move while the wire is out', () => {
    const g = { ...initialGuide(), s: 100 };
    const r = guideStep(g, 5, 0, 1 / 60, true);
    expect(r.state.s).toBe(100);
    expect(r.messages[0].level).toBe('warn');
  });
});

const wireStep = (w: WireState, move: number, opts: { rotate?: number; rng?: () => number; catheterOut?: boolean } = {}) =>
  stepWire(anat, w, {
    move,
    rotate: opts.rotate ?? 0,
    dt: 1 / 60,
    catheterOut: opts.catheterOut ?? false,
    guideEngaged: true,
    lesion: LESION,
    rng: opts.rng ?? (() => 0.99),
  });

function driveWire(angle: number, untilD: number, speed: number, rng?: () => number) {
  let w: WireState = { ...initialWire(), angle };
  let dissection = false;
  for (let i = 0; i < 20000 && w.d < untilD; i++) {
    const r = wireStep(w, speed / 60, { rng });
    w = r.state;
    dissection ||= r.dissection;
    if (w.atEnd) break;
  }
  return { w, dissection };
}

describe('guidewire steering', () => {
  it('rotation picks LAD vs LCx at the LM bifurcation', () => {
    const lm = anat.vessels.LM.length;
    expect(locate(anat, driveWire(0, lm + 10, 15).w.legs, lm + 10).vessel).toBe('LAD');
    expect(locate(anat, driveWire(165, lm + 10, 15).w.legs, lm + 10).vessel).toBe('LCx');
    expect(locate(anat, driveWire(WIRE.initialRotation, lm + 10, 15).w.legs, lm + 10).vessel).toBe('LCx');
  });
  it('diagonals capture the tip within ±50°', () => {
    const d1 = anat.vessels.LM.length + anat.vessels.D1.branchAt + 5;
    const r = advanceAlongTree(anat, initialLegs(), 0, d1, anat.vessels.D1.wireAngle - 40, -40);
    // terminal choice at LM goes LAD (closer to 32° than LCx at 165°), then D1 captures
    expect(locate(anat, r.legs, r.d).vessel).toBe('D1');
    const miss = advanceAlongTree(anat, initialLegs(), 0, d1, -10, -40);
    expect(locate(anat, miss.legs, miss.d).vessel).toBe('LAD');
  });
  it('retracting past a branch point forgets the choice', () => {
    const lm = anat.vessels.LM.length;
    const a = advanceAlongTree(anat, initialLegs(), 0, lm + 8, 165, -40);
    expect(locate(anat, a.legs, a.d).vessel).toBe('LCx');
    const b = advanceAlongTree(anat, a.legs, a.d, -12, 0, -40);
    expect(b.legs.length).toBe(1);
    const c = advanceAlongTree(anat, b.legs, b.d, 12, 0, -40);
    expect(locate(anat, c.legs, c.d).vessel).toBe('LAD');
  });
  it('crossing gently (< 8 mm/s) causes no buckling and no risk', () => {
    const target = anat.vessels.LM.length + lesionEnd() + 3;
    const { w, dissection } = driveWire(0, target, WIRE.fineSpeed, () => 0);
    expect(w.crossed).toBe(true);
    expect(w.forcingEvents).toBe(0);
    expect(w.risk).toBe(0);
    expect(dissection).toBe(false);
  });
  it('forcing the lesion buckles the wire, builds risk, and may dissect on crossing', () => {
    const target = anat.vessels.LM.length + lesionEnd() + 3;
    const { w, dissection } = driveWire(0, target, 30, () => 0);
    expect(w.crossed).toBe(true);
    expect(w.forcingEvents).toBeGreaterThan(0);
    expect(w.forcingTime).toBeGreaterThan(0);
    expect(w.risk).toBeGreaterThan(0);
    expect(dissection).toBe(true);
    // Same forcing but a lucky roll: no dissection.
    expect(driveWire(0, target, 30, () => 0.999).dissection).toBe(false);
  });
  it('torque raises the safe crossing speed', () => {
    let w: WireState = { ...initialWire(), angle: 0 };
    w = { ...w, d: anat.vessels.LM.length + lesionStart() + 1, legs: advanceAlongTree(anat, initialLegs(), 0, anat.vessels.LM.length + lesionStart() + 1, 0, -40).legs };
    let buckledPlain = false;
    let buckledTorque = false;
    let a = w;
    let b = w;
    for (let i = 0; i < 30; i++) {
      const ra = wireStep(a, 10 / 60);
      a = ra.state;
      buckledPlain ||= a.buckling;
      const rb = wireStep(b, 10 / 60, { rotate: 1 });
      b = rb.state;
      buckledTorque ||= b.buckling;
    }
    expect(buckledPlain).toBe(true);
    expect(buckledTorque).toBe(false);
  });
  it('warns at the distal end of the vessel (perforation risk) without false alarms at bifurcations', () => {
    const { w } = driveWire(0, 1e4, 15);
    expect(w.endWarnings).toBe(1);
    const loc = locate(anat, w.legs, w.d);
    expect(loc.vessel).toBe('LAD');
    expect(loc.s).toBeLessThan(anat.vessels.LAD.length);
  });
  it('cannot be retracted while a balloon is on it', () => {
    const w = { ...initialWire(), d: 50 };
    const r = wireStep(w, -1, { catheterOut: true });
    expect(r.state.d).toBe(50);
  });
});

const catStep = (c: CatheterState, o: Partial<Parameters<typeof stepCatheter>[1]> = {}) =>
  stepCatheter(c, { move: 0, inflate: false, fine: false, deflate: false, dt: 1 / 60, now: 0, wireTip: 150, guideTip: GUIDE.engagedDepth, ...o });

describe('balloon catheter', () => {
  const outCatheter = () => ({ ...newCatheter('balloon', 2.5, 15), pos: LESION.centre + 20 });

  it('size can only change while inside the guide', () => {
    const inGuide = newCatheter('balloon', 2.5, 15);
    expect(canResize(inGuide, GUIDE.engagedDepth)).toBe(true);
    expect(canResize(outCatheter(), GUIDE.engagedDepth)).toBe(false);
  });
  it('rides over the wire but stays behind its tip', () => {
    let c = outCatheter();
    for (let i = 0; i < 400; i++) c = catStep(c, { move: 1, wireTip: 80 }).state;
    expect(c.pos).toBeLessThanOrEqual(80 - INFLATION.wireLead + 1e-9);
  });
  it('cannot move while inflated', () => {
    let c = outCatheter();
    for (let i = 0; i < 60; i++) c = catStep(c, { inflate: true }).state;
    const pos = c.pos;
    const r = catStep(c, { move: 2 });
    expect(r.state.pos).toBe(pos);
    expect(r.messages.some((m) => /Deflate/.test(m.text))).toBe(true);
  });
  it('inflates at ~3 atm/s and deflates with Q, recording the inflation', () => {
    let c = outCatheter();
    for (let i = 0; i < 180; i++) c = catStep(c, { inflate: true, now: i / 60 }).state;
    expect(c.pressure).toBeCloseTo(9, 0);
    let rec = null;
    let r = catStep(c, { deflate: true, now: 3 });
    c = r.state;
    for (let i = 0; i < 200 && !rec; i++) {
      r = catStep(c, { now: 3 + i / 60 });
      c = r.state;
      rec = r.record;
    }
    expect(rec).not.toBeNull();
    expect(rec!.maxPressure).toBeCloseTo(9, 0);
    expect(rec!.maxDiameter).toBeCloseTo(2.5 * (1 + 0.015 * (rec!.maxPressure - 8)), 2);
    expect(rec!.duration).toBeGreaterThan(2);
  });
  it('warns above RBP and ruptures at RBP + 4', () => {
    let c = outCatheter();
    const msgs: string[] = [];
    let ruptured = false;
    let record = null;
    for (let i = 0; i < 60 * 10 && !ruptured; i++) {
      const r = catStep(c, { inflate: true });
      c = r.state;
      msgs.push(...r.messages.map((m) => m.text));
      ruptured = r.ruptured;
      record = r.record ?? record;
    }
    expect(msgs.some((m) => /rated burst/.test(m))).toBe(true);
    expect(ruptured).toBe(true);
    expect(c.ruptured).toBe(true);
    expect(c.pressure).toBe(0);
    expect(record).not.toBeNull();
    expect(rupturePressure(BALLOON)).toBe(18);
  });
  it('a stent deploys permanently once pressure reaches 6 atm', () => {
    let c: CatheterState = { ...newCatheter('stent', 3, 18), pos: LESION.centre + 9 };
    let deployed = false;
    for (let i = 0; i < 200 && !deployed; i++) {
      const r = catStep(c, { inflate: true });
      c = r.state;
      deployed = r.deployedNow;
    }
    expect(deployed).toBe(true);
    expect(c.pressure).toBeGreaterThanOrEqual(INFLATION.stentDeployPressure);
    expect(c.pressure).toBeLessThan(INFLATION.stentDeployPressure + 0.1);
    expect(STENT.rbp).toBe(16);
  });
  it('withdrawing past the load position removes the catheter', () => {
    const c = newCatheter('balloon', 2.5, 15);
    expect(catStep(c, { move: -1 }).withdrawn).toBe(true);
  });
});
