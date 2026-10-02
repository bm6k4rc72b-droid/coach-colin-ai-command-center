import { describe, expect, it } from 'vitest';
import { LESION } from '../src/config/anatomy';
import { computeLumen, lesionEnd, lesionStart } from '../src/anatomy/lumen';
import { buildAnatomy, CORONARY_IDS, valueAt, type VesselId } from '../src/anatomy/vessels';
import {
  aorticInjection,
  cineLength,
  computeFactors,
  distalFactor,
  flowFactor,
  selectiveInjection,
  timiGrade,
  type Dissection,
  type FlowConditions,
} from '../src/physics/flow';

const anat = buildAnatomy();
const lad = anat.vessels.LAD;
const ls = lesionStart();
const le = lesionEnd();

function conditions(opts: Partial<FlowConditions> & { stent?: boolean } = {}): FlowConditions {
  const lumen: Partial<Record<VesselId, number[]>> = {};
  const tr = opts.stent ? [{ kind: 'stent' as const, vessel: 'LAD' as const, s0: ls - 2, s1: le + 2, diameter: 3.07 }] : [];
  for (const id of CORONARY_IDS) lumen[id] = computeLumen(anat.vessels[id], tr, null);
  return { anatomy: anat, lumen, occlusion: opts.occlusion ?? null, dissections: opts.dissections ?? [] };
}

const arriveAt = (f: ReturnType<typeof selectiveInjection>, id: VesselId, s: number) => {
  const v = anat.vessels[id];
  return valueAt(f[id]!.arrive, v.s, s);
};

describe('flowFactor and TIMI', () => {
  it('is 1 below 60%, 0 at ≥ 98%, monotonic non-increasing in between', () => {
    expect(flowFactor(0)).toBe(1);
    expect(flowFactor(0.59)).toBe(1);
    expect(flowFactor(0.98)).toBe(0);
    expect(flowFactor(1)).toBe(0);
    let prev = 1;
    for (let ds = 0; ds <= 1; ds += 0.01) {
      const f = flowFactor(ds);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      prev = f;
    }
  });
  it('TIMI grade thresholds are monotonic', () => {
    expect(timiGrade(1)).toBe(3);
    expect(timiGrade(0.8)).toBe(3);
    expect(timiGrade(0.5)).toBe(2);
    expect(timiGrade(0.25)).toBe(2);
    expect(timiGrade(0.1)).toBe(1);
    expect(timiGrade(0.02)).toBe(0);
    expect(timiGrade(0)).toBe(0);
    let prev = 3;
    for (let ds = 0; ds <= 1; ds += 0.01) {
      const g = timiGrade(flowFactor(ds));
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
  });
  it('the untreated 90% lesion gives TIMI 2', () => {
    expect(timiGrade(flowFactor(0.9))).toBe(2);
    const factors = computeFactors(conditions());
    expect(timiGrade(distalFactor(factors, 'LAD'))).toBe(2);
  });
});

describe('contrast transit', () => {
  it('slows beyond the lesion', () => {
    const native = selectiveInjection(conditions());
    const stented = selectiveInjection(conditions({ stent: true }));
    // Same timing proximal to the lesion, later arrival distally with the stenosis.
    expect(arriveAt(native, 'LAD', ls - 5)).toBeCloseTo(arriveAt(stented, 'LAD', ls - 5), 3);
    const dNative = arriveAt(native, 'LAD', 100) - arriveAt(native, 'LAD', le + 2);
    const dStent = arriveAt(stented, 'LAD', 100) - arriveAt(stented, 'LAD', le + 2);
    expect(dNative).toBeGreaterThan(1.5 * dStent);
  });
  it('stops behind an inflated balloon, including D2 but not D1', () => {
    const f = selectiveInjection(conditions({ occlusion: { vessel: 'LAD', s: ls } }));
    expect(Number.isFinite(arriveAt(f, 'LAD', ls - 3))).toBe(true);
    expect(arriveAt(f, 'LAD', le + 5)).toBe(Infinity);
    expect(f.D2!.arrive.every((a) => a === Infinity)).toBe(true);
    expect(f.D1!.arrive.every((a) => Number.isFinite(a))).toBe(true);
    expect(f.LCx!.arrive.every((a) => Number.isFinite(a))).toBe(true);
  });
  it('recovers to TIMI 3 after stenting', () => {
    const factors = computeFactors(conditions({ stent: true }));
    expect(timiGrade(distalFactor(factors, 'LAD'))).toBe(3);
  });
  it('an unsealed dissection multiplies downstream flow by ~0.45; sealing restores it', () => {
    const d: Dissection = { vessel: 'LAD', s: le + 3, length: 6, sealed: false, cause: 'stent-edge', time: 0 };
    const open = computeFactors(conditions({ stent: true, dissections: [d] }));
    expect(distalFactor(open, 'LAD')).toBeCloseTo(0.45, 2);
    expect(timiGrade(distalFactor(open, 'LAD'))).toBe(2);
    // proximal to the flap is unaffected
    expect(valueAt(open.LAD!, lad.s, ls)).toBeCloseTo(1, 5);
    const sealed = computeFactors(conditions({ stent: true, dissections: [{ ...d, sealed: true }] }));
    expect(distalFactor(sealed, 'LAD')).toBeCloseTo(1, 5);
  });
  it('aortic flush opacifies the aorta and both coronaries faintly; selective adds slight reflux', () => {
    const a = aorticInjection(conditions());
    expect(a.aorta!.intensity).toBe(1);
    expect(a.RCA!.intensity).toBeLessThan(1);
    expect(a.LAD!.intensity).toBeLessThan(1);
    const s = selectiveInjection(conditions());
    expect(s.LAD!.intensity).toBe(1);
    expect(s.RCA).toBeUndefined();
    expect(s.aorta!.intensity).toBeLessThan(0.3);
    expect(s.aorta!.arrive.some((x) => x === Infinity)).toBe(true);
  });
  it('cine length adapts to the slowest filling', () => {
    const slow = cineLength(selectiveInjection(conditions()));
    const fast = cineLength(selectiveInjection(conditions({ stent: true })));
    expect(slow).toBeGreaterThan(fast);
  });
  it('lesion reference sanity', () => {
    expect(LESION.maxStenosis).toBe(0.9);
  });
});
