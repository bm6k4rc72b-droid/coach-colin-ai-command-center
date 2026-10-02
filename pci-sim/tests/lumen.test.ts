import { describe, expect, it } from 'vitest';
import { LESION, BALLOON, STENT, INFLATION } from '../src/config/anatomy';
import {
  computeLumen,
  coverWeight,
  heldDiameter,
  lesionEnd,
  lesionStart,
  measureQCA,
  nativeLumen,
  stenosisAt,
  worstStenosis,
} from '../src/anatomy/lumen';
import { buildAnatomy, valueAt } from '../src/anatomy/vessels';
import { balloonDiameter } from '../src/physics/balloon';
import { Simulation } from '../src/procedure/sim';

const anat = buildAnatomy();
const lad = anat.vessels.LAD;

describe('stenosis profile', () => {
  it('peaks at 90% over a short plateau at the lesion centre', () => {
    expect(stenosisAt(LESION.centre)).toBeCloseTo(0.9);
    expect(stenosisAt(LESION.centre + LESION.plateau / 2 - 0.01)).toBeCloseTo(0.9);
  });
  it('is cosine-tapered, symmetric, and zero outside the 14 mm lesion', () => {
    expect(lesionEnd() - lesionStart()).toBe(14);
    expect(stenosisAt(lesionStart() - 0.1)).toBe(0);
    expect(stenosisAt(lesionEnd() + 0.1)).toBe(0);
    for (const d of [2, 3.5, 5, 6.5]) {
      expect(stenosisAt(LESION.centre - d)).toBeCloseTo(stenosisAt(LESION.centre + d), 10);
    }
    let prev = 1;
    for (let d = LESION.plateau / 2; d <= 7; d += 0.5) {
      const s = stenosisAt(LESION.centre + d);
      expect(s).toBeLessThanOrEqual(prev + 1e-12);
      prev = s;
    }
  });
  it('sits in the mid LAD between D1 and D2 with a ~2.95 mm reference', () => {
    expect(lesionStart()).toBeGreaterThan(anat.vessels.D1.branchAt);
    expect(lesionEnd()).toBeLessThan(anat.vessels.D2.branchAt);
    const ref = valueAt(lad.refD, lad.s, LESION.centre);
    expect(ref).toBeGreaterThanOrEqual(2.9);
    expect(ref).toBeLessThanOrEqual(3.0);
  });
  it('native lumen has a 90% diameter stenosis and QCA measures it', () => {
    const lum = nativeLumen(lad);
    expect(worstStenosis(lad, lum, lesionStart(), lesionEnd())).toBeCloseTo(0.9, 2);
    const q = measureQCA(lad, lum, lesionStart() - 8, lesionEnd() + 8);
    expect(q.ds).toBeGreaterThan(0.88);
    expect(q.referenceDiameter).toBeCloseTo(2.95, 1);
    expect(q.lesionLength).toBeGreaterThan(8);
    expect(q.lesionLength).toBeLessThan(15);
  });
});

describe('balloon / stent pressure–diameter', () => {
  it('equals nominal diameter at nominal pressure', () => {
    expect(balloonDiameter(BALLOON, 2.5, BALLOON.nominal)).toBeCloseTo(2.5);
    expect(balloonDiameter(STENT, 3.0, STENT.nominal)).toBeCloseTo(3.0);
  });
  it('grows 1.5%/atm (balloon) and 1.2%/atm (stent) above nominal', () => {
    expect(balloonDiameter(BALLOON, 2.5, 10)).toBeCloseTo(2.5 * (1 + 0.015 * 2));
    expect(balloonDiameter(STENT, 3.0, 12)).toBeCloseTo(3.0 * 1.024);
    expect(balloonDiameter(STENT, 3.5, 16)).toBeCloseTo(3.5 * 1.072);
  });
  it('is smaller while unfolding below 2 atm and monotonic', () => {
    expect(balloonDiameter(BALLOON, 3.0, 1)).toBeLessThan(balloonDiameter(BALLOON, 3.0, 2));
    expect(balloonDiameter(BALLOON, 3.0, 0)).toBe(INFLATION.foldedDiameter);
    let prev = 0;
    for (let p = 0; p <= 18; p += 0.25) {
      const d = balloonDiameter(BALLOON, 3.0, p);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('lumen treatment', () => {
  const ls = lesionStart();
  const le = lesionEnd();
  it('a live balloon stretches the vessel while inflated', () => {
    const lum = computeLumen(lad, [], { vessel: 'LAD', s0: ls - 0.5, s1: le + 0.5, diameter: 2.6 });
    expect(valueAt(lum, lad.s, LESION.centre)).toBeCloseTo(2.6, 2);
  });
  it('a plain balloon leaves the lumen open minus ~30% recoil', () => {
    const lum = computeLumen(lad, [{ kind: 'balloon', vessel: 'LAD', s0: ls, s1: le, diameter: 2.575 }], null);
    expect(valueAt(lum, lad.s, LESION.centre)).toBeCloseTo(2.575 * 0.7, 2);
  });
  it('a stent holds its expanded size minus ~3% recoil, never narrowing healthy lumen', () => {
    const st = { kind: 'stent' as const, vessel: 'LAD' as const, s0: ls - 2, s1: le + 2, diameter: 3.07 };
    expect(heldDiameter(st)).toBeCloseTo(3.07 * 0.97);
    const lum = computeLumen(lad, [st], null);
    expect(valueAt(lum, lad.s, LESION.centre)).toBeCloseTo(3.07 * 0.97, 2);
    expect(worstStenosis(lad, lum, ls, le)).toBeLessThan(0.05);
    // proximal healthy LAD is wider than the stent: untouched
    expect(valueAt(lum, lad.s, 5)).toBeCloseTo(valueAt(lad.refD, lad.s, 5), 5);
  });
  it('tapers smoothly at the ends', () => {
    expect(coverWeight(10, 10, 20)).toBe(1);
    expect(coverWeight(9.4, 10, 20)).toBeGreaterThan(0);
    expect(coverWeight(9.4, 10, 20)).toBeLessThan(1);
    expect(coverWeight(5, 10, 20)).toBe(0);
  });
});

describe('coverage margins', () => {
  const place = (s0: number, s1: number) => {
    const sim = new Simulation({ seed: 1 }, anat);
    sim.stents.push({ vessel: 'LAD', s0, s1, diameter: 3.07, nominalD: 3, length: s1 - s0, deployedAt: 0 });
    return sim.stentCoverage();
  };
  it('reports healthy margins for an 18 mm stent centred on the 14 mm lesion', () => {
    const c = place(LESION.centre - 9, LESION.centre + 9);
    expect(c.covered).toBe(true);
    expect(c.marginProx).toBeCloseTo(2);
    expect(c.marginDist).toBeCloseTo(2);
  });
  it('flags a geographic miss for a short stent', () => {
    const c = place(LESION.centre - 6, LESION.centre + 6);
    expect(c.covered).toBe(false);
    expect(c.marginProx!).toBeLessThan(0);
    expect(c.marginDist!).toBeLessThan(0);
  });
  it('detects a gap between two stents', () => {
    const sim = new Simulation({ seed: 1 }, anat);
    sim.stents.push({ vessel: 'LAD', s0: 25, s1: 36, diameter: 3, nominalD: 3, length: 11, deployedAt: 0 });
    sim.stents.push({ vessel: 'LAD', s0: 38, s1: 50, diameter: 3, nominalD: 3, length: 12, deployedAt: 0 });
    const c = sim.stentCoverage();
    expect(c.covered).toBe(false);
    expect(c.marginDist!).toBeLessThan(0);
  });
});
