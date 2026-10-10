import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PEPTIDES } from '../src/data/peptides';
import { level, model, tToU, uToT } from '../src/sim/pk';

const manifest = JSON.parse(readFileSync(new URL('../../human-atlas/public/anatomy/manifest.json', import.meta.url), 'utf8')) as {
  pieces: Array<{ name: string; system: string }>;
};
const names = new Set(manifest.pieces.map((p) => p.name.replace(/\b(left|right) /, '')));

describe('pharmacokinetics', () => {
  it('peaks at the published time-to-peak with level 1', () => {
    for (const p of PEPTIDES) {
      const m = model(p);
      expect(m.peakT / p.tmax, p.id).toBeGreaterThan(0.97);
      expect(m.peakT / p.tmax, p.id).toBeLessThan(1.03);
      expect(level(p, m.peakT), p.id).toBeCloseTo(1, 3);
    }
  });

  it('declines at the slower of release and elimination', () => {
    for (const p of PEPTIDES) {
      const m = model(p);
      const terminal = Math.LN2 / Math.min(m.ka, m.ke);
      const t = m.peakT + 8 * terminal;
      const ratio = level(p, t + terminal) / level(p, t);
      expect(ratio, p.id).toBeGreaterThan(0.45);
      expect(ratio, p.id).toBeLessThan(0.55);
    }
  });

  it('injected medicines are elimination-limited, so their curve shows the real half-life', () => {
    for (const p of PEPTIDES.filter((x) => x.source.point)) expect(model(p).releaseLimited, p.id).toBe(false);
  });

  it('a natural hormone is gone within minutes once secretion stops', () => {
    const glp1 = PEPTIDES.find((p) => p.id === 'glp1')!;
    expect(level(glp1, glp1.tmax + 10 * glp1.halfLife)).toBeLessThan(0.002);
  });

  it('semaglutide outlasts native GLP-1 by orders of magnitude', () => {
    const glp1 = PEPTIDES.find((p) => p.id === 'glp1')!;
    const sema = PEPTIDES.find((p) => p.id === 'semaglutide')!;
    expect(level(glp1, 3 * 3600)).toBeLessThan(0.001);
    expect(level(sema, 7 * 86400)).toBeGreaterThan(0.4);
  });

  it('log timeline round-trips', () => {
    for (const u of [0, 0.25, 0.5, 0.9, 1]) expect(tToU(uToT(u))).toBeCloseTo(u, 6);
  });
});

describe('anatomy mapping', () => {
  it('every source, target and clearance mesh exists in the Human Atlas manifest', () => {
    for (const p of PEPTIDES) {
      const stops = [...p.targets, ...p.clearance];
      for (const s of stops) {
        for (const m of s.meshes ?? []) expect(names.has(m), `${p.id}/${s.id}: ${m}`).toBe(true);
        expect((s.meshes?.length ?? 0) + (s.systems?.length ?? 0), `${p.id}/${s.id}`).toBeGreaterThan(0);
      }
      for (const m of p.source.meshes ?? []) expect(names.has(m), `${p.id} source: ${m}`).toBe(true);
      expect(p.source.meshes || p.source.point, p.id).toBeTruthy();
    }
  });

  it('every peptide cites a source', () => {
    for (const p of PEPTIDES) expect(p.refs.length, p.id).toBeGreaterThan(0);
  });
});
