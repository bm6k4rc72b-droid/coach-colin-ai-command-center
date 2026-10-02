import { describe, expect, it } from 'vitest';
import { cloakDowntime, DEVICES, e1FieldVPerM, evaluate, explain, NO_PROTECTION, protectionCost, shieldFactor } from '../src/core/emp';

const dev = (id: string) => DEVICES.find((d) => d.id === id)!;

describe('EMP hardening model', () => {
  it('no threat, no damage', () => {
    for (const d of DEVICES) expect(evaluate(d, NO_PROTECTION, 0).outcome).toBe('ok');
  });
  it('induced voltage scales with field and conductor length', () => {
    const a = evaluate(dev('phone'), NO_PROTECTION, 0.5).e1V;
    const b = evaluate(dev('phone'), NO_PROTECTION, 1).e1V;
    expect(b).toBeCloseTo(2 * a);
    expect(evaluate(dev('radio'), NO_PROTECTION, 0.5).e1V).toBeGreaterThan(evaluate(dev('phone'), NO_PROTECTION, 0.5).e1V * 10);
  });
  it('small unplugged devices survive where antennas and long cables fail', () => {
    expect(evaluate(dev('phone'), NO_PROTECTION, 1).outcome).toBe('ok');
    expect(evaluate(dev('radio'), NO_PROTECTION, 0.5).outcome).toBe('damaged');
  });
  it('20 dB of shielding is a factor of 10 in field', () => {
    expect(shieldFactor(20)).toBeCloseTo(0.1);
    expect(shieldFactor(0)).toBe(1);
    expect(e1FieldVPerM(1)).toBe(50000);
  });
  it('an unprotected cloak controller fails; a bag + filters + fibre saves it', () => {
    expect(evaluate(dev('cloak'), NO_PROTECTION, 0.8).outcome).not.toBe('ok');
    const r = evaluate(dev('cloak'), { enclosure: 'bag', filters: true, fiber: true, isolated: false }, 1);
    expect(r.outcome).toBe('ok');
    expect(explain(r, { enclosure: 'bag', filters: true, fiber: true, isolated: false })).toMatch(/Survives/);
  });
  it('filters clamp what enters through wires', () => {
    const r = evaluate(dev('radio'), { ...NO_PROTECTION, filters: true }, 1);
    expect(r.e1V).toBeLessThanOrEqual(60);
    expect(r.outcome).toBe('ok');
  });
  it('grid transformers suffer E3 through long lines; a metal box does not help, isolation does', () => {
    const t = dev('transformer');
    expect(evaluate(t, NO_PROTECTION, 1).outcome).toBe('damaged');
    expect(evaluate(t, { ...NO_PROTECTION, enclosure: 'room' }, 1).outcome).toBe('damaged');
    expect(evaluate(t, { ...NO_PROTECTION, isolated: true }, 1).outcome).toBe('ok');
    expect(evaluate(t, NO_PROTECTION, 1).cause).toBe('E3');
  });
  it('protection costs money and weight; cloak downtime by outcome', () => {
    expect(protectionCost(NO_PROTECTION)).toEqual({ cost: 0, kg: 0 });
    expect(protectionCost({ enclosure: 'bag', filters: true, fiber: true, isolated: true }).cost).toBeGreaterThan(0);
    expect(cloakDowntime('ok')).toBeLessThan(1);
    expect(cloakDowntime('upset')).toBeGreaterThan(1);
    expect(cloakDowntime('damaged')).toBe(Infinity);
  });
});
