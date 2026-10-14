import { describe, expect, it } from 'vitest';
import { PART_ORDER, PARTS } from '../src/core/parts';
import { balance, energySplit, greenwaldLimit, ignitionNTau, ITER, keVToCelsius, massDefect, nTauForQ, PRESETS, reactivityDT, status, type Plasma } from '../src/core/physics';
import { TOUR, TourRunner, type TourActions } from '../src/core/tour';

describe('D–T reactivity (Bosch–Hale)', () => {
  it('matches the published values', () => {
    // ~1.14e-16 cm³/s at 10 keV; ~8.9e-16 near the 64 keV peak
    expect(reactivityDT(10) * 1e6).toBeCloseTo(1.136e-16, 18);
    expect(reactivityDT(64) * 1e6).toBeGreaterThan(8.8e-16);
    expect(reactivityDT(64) * 1e6).toBeLessThan(9.0e-16);
  });
  it('rises steeply with temperature, then peaks around 60–70 keV', () => {
    expect(reactivityDT(5)).toBeLessThan(reactivityDT(10));
    expect(reactivityDT(10) / reactivityDT(1)).toBeGreaterThan(1e4);
    let peakT = 0;
    let peak = 0;
    for (let T = 1; T <= 100; T += 0.5) if (reactivityDT(T) > peak) [peak, peakT] = [reactivityDT(T), T];
    expect(peakT).toBeGreaterThan(55);
    expect(peakT).toBeLessThan(75);
  });
});

describe('energy', () => {
  it('the mass defect is 17.6 MeV (E = mc²)', () => {
    expect(massDefect().MeV).toBeCloseTo(17.59, 1);
  });
  it('momentum gives the neutron ~14.1 MeV and the helium ~3.5 MeV', () => {
    const s = energySplit();
    expect(s.neutron).toBeCloseTo(14.05, 1);
    expect(s.alpha).toBeCloseTo(3.54, 1);
    expect(s.alpha + s.neutron).toBeCloseTo(17.59, 6);
  });
  it('13 keV is about 150 million °C', () => {
    expect(keVToCelsius(13) / 1e6).toBeGreaterThan(145);
    expect(keVToCelsius(13) / 1e6).toBeLessThan(155);
  });
});

describe('power balance', () => {
  it('the ITER design point gives ~500 MW at Q ≈ 10', () => {
    const b = balance(ITER);
    expect(b.fusionMW).toBeGreaterThan(400);
    expect(b.fusionMW).toBeLessThan(650);
    expect(b.Q).toBeGreaterThan(7);
    expect(b.Q).toBeLessThan(16);
    expect(b.stable).toBe(true);
    expect(b.neutronMW / b.fusionMW).toBeCloseTo(0.8, 1);
  });
  it('JET-like conditions make fusion power but Q < 1', () => {
    const b = balance(PRESETS.find((p) => p.id === 'jet')!.p);
    expect(b.fusionMW).toBeGreaterThan(5);
    expect(b.Q).toBeLessThan(1);
  });
  it('a cold plasma makes essentially no fusion', () => {
    const p = PRESETS.find((x) => x.id === 'cold')!.p;
    const b = balance(p);
    expect(b.fusionMW).toBeLessThan(0.01);
    expect(status(p, b)).toBe('cold');
  });
  it('fusion power scales with density squared', () => {
    const lo = balance({ ...ITER, n: 0.5e20 }).fusionMW;
    const hi = balance({ ...ITER, n: 1.0e20 }).fusionMW;
    expect(hi / lo).toBeCloseTo(4, 6);
  });
  it('longer confinement eventually reaches ignition', () => {
    const p: Plasma = { ...ITER, tauE: 12 };
    const b = balance(p);
    expect(b.ignited).toBe(true);
    expect(status(p, b)).toBe('ignition');
  });
  it('the Lawson minimum nτ sits near 15–30 keV at a few ×10²⁰ s/m³', () => {
    let best = Infinity;
    let bestT = 0;
    for (let T = 5; T <= 80; T += 0.5) if (ignitionNTau(T) < best) [best, bestT] = [ignitionNTau(T), T];
    expect(bestT).toBeGreaterThan(15);
    expect(bestT).toBeLessThan(40);
    expect(best).toBeGreaterThan(1e20);
    expect(best).toBeLessThan(6e20);
    expect(nTauForQ(15, 1)).toBeLessThan(nTauForQ(15, 10));
    expect(nTauForQ(15, 10)).toBeLessThan(nTauForQ(15, Infinity));
  });
});

describe('stability limits', () => {
  it('too much pressure for the field breaks the Troyon beta limit', () => {
    const p = PRESETS.find((x) => x.id === 'pressure')!.p;
    const b = balance(p);
    expect(b.beta).toBeGreaterThan(b.betaLimit);
    expect(status(p, b)).toBe('disrupted');
  });
  it('too much density breaks the Greenwald limit', () => {
    const p = PRESETS.find((x) => x.id === 'dense')!.p;
    expect(p.n).toBeGreaterThan(greenwaldLimit(p.Ip));
    expect(balance(p).stable).toBe(false);
  });
  it('the ITER design point sits inside both limits', () => {
    const b = balance(ITER);
    expect(b.beta).toBeLessThan(b.betaLimit);
    expect(ITER.n).toBeLessThan(b.greenwald);
  });
});

describe('content', () => {
  it('every labelled part has a description and facts', () => {
    for (const id of PART_ORDER) {
      expect(PARTS[id].body.length).toBeGreaterThan(80);
      expect(PARTS[id].facts.length).toBeGreaterThan(1);
    }
  });
  it('the tour visits every step and stops', () => {
    const calls: string[] = [];
    const a: TourActions = {
      select: (p) => calls.push(`select:${p}`),
      preset: (id) => calls.push(`preset:${id}`),
      explode: (on) => calls.push(`explode:${on}`),
      highlight: () => {},
    };
    const t = new TourRunner(a);
    t.start();
    for (let i = 0; i < 2000 && t.active; i++) t.update(0.5);
    expect(t.active).toBe(false);
    expect(t.index).toBe(TOUR.length);
    expect(calls).toEqual(expect.arrayContaining(['select:plasma', 'select:divertor', 'preset:cold', 'preset:pressure', 'explode:true']));
  });
});
