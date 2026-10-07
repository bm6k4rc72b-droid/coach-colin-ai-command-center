import { describe, expect, it } from 'vitest';
import { abs2 } from '../src/core/complex';
import { run, sample, emptyCircuit, place } from '../src/core/circuit';
import { PRESETS, presetById } from '../src/core/algorithms';
import { State, applyOp, blochVector, purity } from '../src/core/quantum';

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('state vector', () => {
  it('starts in |0…0⟩ with norm 1', () => {
    const s = new State(3);
    near(s.amps[0].re, 1);
    near(s.norm(), 1);
    expect(s.label(5)).toBe('101');
  });
  it('X flips the qubit; H makes a 50/50 superposition', () => {
    const s = new State(1);
    applyOp(s, { gate: 'X', q: 0 });
    near(s.prob1(0), 1);
    applyOp(s, { gate: 'H', q: 0 });
    near(s.prob1(0), 0.5);
  });
  it('H·H returns to |0⟩ (interference, not randomness)', () => {
    const s = new State(1);
    applyOp(s, { gate: 'H', q: 0 });
    applyOp(s, { gate: 'H', q: 0 });
    near(abs2(s.amps[0]), 1);
  });
  it('every gate preserves the norm', () => {
    const s = new State(2);
    for (const g of ['H', 'T', 'Y', 'S'] as const) applyOp(s, { gate: g, q: 0 });
    applyOp(s, { gate: 'CNOT', q: 1, control: 0 });
    near(s.norm(), 1, 1e-12);
  });
  it('qubit ordering: X on q0 of a 2-qubit register gives |10⟩', () => {
    const s = new State(2);
    applyOp(s, { gate: 'X', q: 0 });
    near(abs2(s.amps[0b10]), 1);
  });
  it('S squared equals Z', () => {
    const a = new State(1);
    applyOp(a, { gate: 'H', q: 0 });
    applyOp(a, { gate: 'S', q: 0 });
    applyOp(a, { gate: 'S', q: 0 });
    const b = new State(1);
    applyOp(b, { gate: 'H', q: 0 });
    applyOp(b, { gate: 'Z', q: 0 });
    for (let i = 0; i < 2; i++) { near(a.amps[i].re, b.amps[i].re); near(a.amps[i].im, b.amps[i].im); }
  });
});

describe('entanglement', () => {
  it('a Bell pair only shows |00⟩ and |11⟩, and each qubit is maximally mixed', () => {
    const r = run(presetById('bell')!.build());
    const p = r.probabilities;
    near(p[0b00], 0.5); near(p[0b11], 0.5); near(p[0b01], 0); near(p[0b10], 0);
    near(r.purity[0], 0.5, 1e-9);
    near(r.purity[1], 0.5, 1e-9);
  });
  it('GHZ is all-0 or all-1', () => {
    const p = run(presetById('ghz')!.build()).probabilities;
    near(p[0b000], 0.5); near(p[0b111], 0.5);
    near(p.reduce((a, b) => a + b, 0), 1);
  });
  it('a product state has pure (unentangled) qubits', () => {
    const s = new State(2);
    applyOp(s, { gate: 'H', q: 0 });
    near(purity(s, 0), 1, 1e-9);
    near(purity(s, 1), 1, 1e-9);
  });
});

describe('Bloch sphere', () => {
  it('|0⟩ is the north pole and H|0⟩ points along +x', () => {
    const s = new State(1);
    expect(blochVector(s, 0)[2]).toBeCloseTo(1, 9);
    applyOp(s, { gate: 'H', q: 0 });
    const [x, y, z] = blochVector(s, 0);
    near(x, 1, 1e-9); near(y, 0, 1e-9); near(z, 0, 1e-9);
  });
});

describe('algorithms', () => {
  it('Grover finds |11⟩ with near-certainty in one iteration', () => {
    const p = run(presetById('grover')!.build()).probabilities;
    expect(p[0b11]).toBeGreaterThan(0.99);
  });
  it('Deutsch–Jozsa flags a balanced oracle (top qubit = 1)', () => {
    expect(run(presetById('dj')!.build()).state.prob1(0)).toBeCloseTo(1, 9);
  });
  it('teleportation leaves qubit 2 matching the prepared state', () => {
    // Prepared RY(π/3) on q0 ⇒ P(1)=sin²(π/6)=0.25 should appear on q2 after corrections.
    const r = run(presetById('teleport')!.build());
    expect(r.state.prob1(2)).toBeCloseTo(0.25, 6);
  });
  it('every preset keeps total probability at 1', () => {
    for (const preset of PRESETS) {
      const sum = run(preset.build()).probabilities.reduce((a, b) => a + b, 0);
      near(sum, 1, 1e-9);
    }
  });
});

describe('measurement sampling', () => {
  it('a Bell pair samples ~50/50 between 00 and 11 and never 01/10', () => {
    const counts = sample(presetById('bell')!.build(), 2000, 42);
    expect(counts['01'] ?? 0).toBe(0);
    expect(counts['10'] ?? 0).toBe(0);
    expect((counts['00'] ?? 0) / 2000).toBeGreaterThan(0.4);
    expect((counts['11'] ?? 0) / 2000).toBeGreaterThan(0.4);
  });
  it('measurement collapses and renormalises', () => {
    let c = emptyCircuit(1);
    c = place(c, 0, { gate: 'H', q: 0 });
    c = place(c, 1, { gate: 'MEASURE', q: 0 });
    const r = run(c, 3);
    near(r.state.norm(), 1);
    expect([0, 1]).toContain(r.measured[0]);
  });
});
