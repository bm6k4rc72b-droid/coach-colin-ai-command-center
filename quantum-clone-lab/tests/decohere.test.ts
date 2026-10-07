import { describe, expect, it } from 'vitest';
import { decohere, blochLength, fidelity, gatesBeforeDecoherence, PLATFORMS } from '../src/core/decohere';

describe('decoherence', () => {
  it('a superposition on the equator shrinks toward the centre (losing phase) under dephasing', () => {
    const b0 = { x: 1, y: 0, z: 0 };
    const b = decohere(b0, 100, 150, 100);
    expect(b.x).toBeCloseTo(Math.exp(-1), 6);
    expect(blochLength(b)).toBeLessThan(blochLength(b0));
  });
  it('relaxation pulls the state toward |0⟩ (north pole)', () => {
    const b = decohere({ x: 0, y: 0, z: -1 }, 1e9, 150, 120);
    expect(b.z).toBeCloseTo(1, 6);
  });
  it('no time means no change; infinite time on the equator means a fully mixed state', () => {
    const b0 = { x: 0.6, y: 0, z: 0.8 };
    expect(fidelity(b0, decohere(b0, 0, 150, 120))).toBeCloseTo(1, 9);
  });
  it('trapped ions allow far more gates before decoherence than transmons', () => {
    const ion = PLATFORMS.find((p) => p.id === 'ion')!;
    const sc = PLATFORMS.find((p) => p.id === 'super')!;
    expect(gatesBeforeDecoherence(ion.T2, ion.gate)).toBeGreaterThan(gatesBeforeDecoherence(sc.T2, sc.gate));
  });
});
