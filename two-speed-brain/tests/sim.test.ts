import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REFS } from '../src/data/evidence';
import { CLAIMS } from '../src/data/myths';
import { REGIONS } from '../src/data/regions';
import { DURATION, SCENARIOS } from '../src/data/scenarios';
import { TRAINER_STEPS } from '../src/data/trainer';
import { activityAt, crossover } from '../src/sim/activity';

const calm = { sleepLoss: false, stress: false, pause: false };
const tired = { sleepLoss: true, stress: true, pause: false };
const trained = { sleepLoss: false, stress: false, pause: true };

describe('simulation', () => {
  it('keeps every activity within 0..1', () => {
    for (const sc of SCENARIOS)
      for (const mods of [calm, tired, trained])
        for (let t = 0; t <= DURATION; t += 50) {
          for (const v of Object.values(activityAt(sc, t, mods))) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
  });

  it('fires the fast alarm before the prefrontal brake in the offense scenario', () => {
    const sc = SCENARIOS.find((s) => s.id === 'criticised')!;
    const first = (region: 'amygdala' | 'lpfc') => {
      for (let t = 0; t <= DURATION; t += 5) if (activityAt(sc, t, calm)[region] > 0.2) return t;
      return Infinity;
    };
    expect(first('amygdala')).toBeLessThan(first('lpfc'));
  });

  it('sleep loss raises the amygdala peak', () => {
    const sc = SCENARIOS.find((s) => s.id === 'criticised')!;
    const peak = (mods: typeof calm) => Math.max(...Array.from({ length: 60 }, (_, i) => activityAt(sc, i * 50, mods).amygdala));
    expect(peak({ ...calm, sleepLoss: true })).toBeGreaterThan(peak(calm));
  });

  it('a practised pause lets reason overtake sooner than a tired, stressed state', () => {
    for (const sc of SCENARIOS) {
      const fast = crossover(sc, trained, DURATION) ?? Infinity;
      const slow = crossover(sc, tired, DURATION) ?? Infinity;
      expect(fast).toBeLessThanOrEqual(slow);
    }
  });
});

describe('content integrity', () => {
  it('every cited reference exists', () => {
    const keys = [
      ...SCENARIOS.flatMap((s) => s.phases.map((p) => p.ref).filter(Boolean)),
      ...CLAIMS.map((c) => c.ref),
      ...TRAINER_STEPS.map((s) => s.ref).filter(Boolean),
    ] as string[];
    for (const k of keys) expect(REFS[k], k).toBeDefined();
  });

  it('every phase that cites a source also rates it', () => {
    for (const sc of SCENARIOS) for (const p of sc.phases) if (p.ref) expect(p.rating, `${sc.id}: ${p.title}`).toBeDefined();
  });

  it('every region maps to meshes that exist in the Human Atlas manifest', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../human-atlas/public/anatomy/manifest.json', import.meta.url), 'utf8')) as {
      pieces: Array<{ name: string }>;
    };
    const names = new Set(manifest.pieces.map((p) => p.name.replace(/\b(left|right) /, '')));
    for (const r of REGIONS) for (const m of r.meshes) expect(names.has(m), `${r.id}: ${m}`).toBe(true);
  });

  it('phases are in time order and inside the timeline', () => {
    for (const sc of SCENARIOS) {
      const ats = sc.phases.map((p) => p.at);
      expect([...ats].sort((a, b) => a - b)).toEqual(ats);
      expect(Math.max(...ats)).toBeLessThan(DURATION);
    }
  });
});
