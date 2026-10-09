import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creationName, GENES } from '../src/data/genes';
import { targetFor } from '../src/scene/effects';

const manifest = JSON.parse(readFileSync(new URL('../../human-atlas/public/anatomy/manifest.json', import.meta.url), 'utf8')) as {
  pieces: Array<{ system: string; region: string }>;
};

describe('gene library', () => {
  it('every gene has an effect, trade-offs, sources and a fiction note', () => {
    for (const g of GENES) {
      expect(g.effect.length, g.id).toBeGreaterThan(40);
      expect(g.tradeoffs.length, g.id).toBeGreaterThan(0);
      expect(g.refs.length, g.id).toBeGreaterThan(0);
      expect(g.fiction.startsWith('Fiction:'), g.id).toBe(true);
    }
  });

  it('every gene changes at least one real body piece', () => {
    for (const g of GENES) {
      const hits = manifest.pieces.filter(
        (p) => g.visual.systems.includes(p.system as never) && (!g.visual.regions || g.visual.regions.includes(p.region)),
      );
      expect(hits.length, g.id).toBeGreaterThan(0);
    }
  });

  it('the fiction dial only ever amplifies effects', () => {
    const all = GENES.map((g) => g.id);
    const real = targetFor('muscles', 'Thigh', all, 0, ['muscles']);
    const fic = targetFor('muscles', 'Thigh', all, 1, ['muscles']);
    expect(real.scale).toBeGreaterThan(1);
    expect(fic.scale).toBeGreaterThan(real.scale);
    expect(targetFor('muscles', 'Thigh', [], 1, ['muscles']).scale).toBe(1);
  });

  it('names the creation', () => {
    expect(creationName([], 0)).toBe('Homo sapiens');
    expect(creationName(['mstn', 'epas1'], 0)).toBe('Homo fortis montanus');
    expect(creationName(['mstn'], 1).startsWith('Xenohomo')).toBe(true);
  });
});
