import { describe, expect, it } from 'vitest';
import { PHYSIOLOGY } from '../src/config/anatomy';
import { actAt, ecgSample, initialPhysiology, stepPhysiology, stLevel, type Physiology } from '../src/physics/physiology';

function run(p0: Physiology, seconds: number, ladFlow: number, occluded: boolean, t0 = 0) {
  let p = p0;
  const dt = 0.05;
  for (let t = 0; t < seconds; t += dt) p = stepPhysiology(p, dt, t0 + t, ladFlow, occluded);
  return p;
}

describe('physiology', () => {
  it('ST rises with LAD occlusion (~20 s to full) and recovers after reperfusion (τ ≈ 8 s)', () => {
    const p10 = run(initialPhysiology(), 10, 0, true);
    expect(p10.st).toBeGreaterThan(1.5);
    expect(p10.st).toBeLessThan(PHYSIOLOGY.maxST);
    const p20 = run(p10, 10.5, 0, true);
    expect(p20.st).toBeCloseTo(PHYSIOLOGY.maxST, 1);
    expect(p20.chestPain).toBe(true);
    expect(p20.hr).toBeGreaterThan(PHYSIOLOGY.baseHR + 5);
    const rec8 = run(p20, 8, 1, false);
    expect(rec8.st).toBeLessThan(p20.st * 0.45);
    expect(rec8.st).toBeGreaterThan(p20.st * 0.25);
    const rec30 = run(rec8, 22, 1, false);
    expect(rec30.st).toBeLessThan(0.2);
    expect(rec30.occlusionTime).toBe(0);
  });
  it('very poor flow (without a balloon) also causes ischaemia', () => {
    const p = run(initialPhysiology(), 30, 0.05, false);
    expect(p.ischaemia).toBeGreaterThan(0.3);
    expect(run(initialPhysiology(), 30, 0.5, false).ischaemia).toBe(0);
  });
  it('occlusion > 40 s brings PVCs and a BP drop; > 60 s instability', () => {
    const p45 = run(initialPhysiology(), 45, 0, true);
    expect(p45.pvcRisk).toBe(true);
    expect(p45.unstable).toBe(false);
    const p65 = run(p45, 20, 0, true);
    expect(p65.unstable).toBe(true);
    expect(p65.sys).toBeLessThan(PHYSIOLOGY.baseSys - 15);
    expect(p65.maxOcclusion).toBeGreaterThan(60);
    const after = run(p65, 1, 1, false);
    expect(after.unstable).toBe(false);
  });
  it('ACT rises from 128 s to ~285 s after heparin', () => {
    expect(actAt(100, null)).toBe(PHYSIOLOGY.actBaseline);
    expect(actAt(5, 10)).toBe(PHYSIOLOGY.actBaseline);
    expect(actAt(10 + 200, 10)).toBeCloseTo(PHYSIOLOGY.actHeparin, 0);
    expect(actAt(10 + 60, 10)).toBeGreaterThan(PHYSIOLOGY.actTarget);
    const p = run({ ...initialPhysiology(), heparinAt: 0 }, 120, 1, false);
    expect(p.act).toBeGreaterThan(280);
  });
});

describe('synthetic ECG', () => {
  it('has a dominant R wave and a flat ST segment at baseline', () => {
    expect(ecgSample(0, 0.9, 0)).toBeGreaterThan(0.9);
    expect(Math.abs(ecgSample(0.12, 0.9, 0))).toBeLessThan(0.08);
  });
  it('elevates the ST segment by 0.1 mV per mm', () => {
    expect(stLevel(2)).toBeCloseTo(0.2, 1);
    expect(stLevel(4)).toBeCloseTo(0.4, 1);
    expect(ecgSample(0.12, 0.9, 4)).toBeGreaterThan(ecgSample(0.12, 0.9, 0) + 0.35);
  });
  it('PVCs are wide and lack a P wave', () => {
    const width = (pvc: boolean) => {
      let n = 0;
      for (let t = -0.1; t < 0.25; t += 0.002) if (Math.abs(ecgSample(t, 0.9, 0, pvc)) > 0.5) n++;
      return n;
    };
    expect(width(true)).toBeGreaterThan(2 * width(false));
    expect(Math.abs(ecgSample(-0.16, 0.9, 0, true))).toBeLessThan(0.02);
    expect(ecgSample(-0.16, 0.9, 0, false)).toBeGreaterThan(0.05);
  });
});
