import { describe, expect, it } from 'vitest';
import { DEFAULTS, SPECIES, evaluate, steps, type Choices } from '../src/core/cloning';

const base: Choices = { ...DEFAULTS };

describe('SCNT model', () => {
  it('every step is a probability in [0,1] for every species', () => {
    for (const sp of SPECIES) for (const st of steps({ ...base, species: sp.id })) {
      expect(st.rate).toBeGreaterThanOrEqual(0);
      expect(st.rate).toBeLessThanOrEqual(1);
    }
  });
  it('overall efficiency is low — a few percent at best — matching why cloning is hard', () => {
    const e = evaluate(base).efficiency;
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(0.08);
    expect(evaluate(base).embryosPerBirth).toBeGreaterThan(15);
  });
  it('arresting donor cells in G0 beats cycling cells (Campbell\'s insight)', () => {
    expect(evaluate({ ...base, arrest: 'g0' }).efficiency).toBeGreaterThan(evaluate({ ...base, arrest: 'cycling' }).efficiency);
  });
  it('HDAC inhibitors help, especially for hard species like the primate', () => {
    const mac = { ...base, species: 'macaque' };
    expect(evaluate({ ...mac, hdac: true }).efficiency).toBeGreaterThan(evaluate({ ...mac, hdac: false }).efficiency);
  });
  it('an unsynchronised surrogate lowers the birth yield', () => {
    expect(evaluate({ ...base, synchronised: false }).expectedBirths).toBeLessThan(evaluate({ ...base, synchronised: true }).expectedBirths);
  });
  it('more transferred embryos means more expected births', () => {
    expect(evaluate({ ...base, embryosTransferred: 40 }).expectedBirths).toBeGreaterThan(evaluate({ ...base, embryosTransferred: 10 }).expectedBirths);
  });
  it('the dog is harder (lower efficiency) than cattle', () => {
    expect(evaluate({ ...base, species: 'dog' }).efficiency).toBeLessThan(evaluate({ ...base, species: 'cattle' }).efficiency);
  });
  it('always teaches that a clone shares only nuclear DNA', () => {
    expect(evaluate(base).lessons.some((l) => /mitochondria|coat colour|identical/i.test(l))).toBe(true);
  });
});
