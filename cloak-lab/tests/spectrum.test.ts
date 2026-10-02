import { describe, expect, it } from 'vitest';
import { SPECTRUM } from '../src/config/lab';
import {
  actorAt,
  johnson,
  lessons,
  loadoutCost,
  NO_CLOAK,
  pixelsOnTarget,
  runScenario,
  sensorProbabilities,
  SENSORS,
  thermalDelta,
  visualResidual,
  type Loadout,
} from '../src/core/spectrum';

const day = { light: 'day' as const };
const night = { light: 'night' as const };
const FULL: Loadout = { visual: 'display', thermal: 'cooling', radar: 'ram', acoustic: 'quiet', gait: 'creep' };

describe('sensor physics', () => {
  it('Johnson detection rises monotonically with cycles on target', () => {
    let prev = 0;
    for (let c = 0; c <= 6; c += 0.25) {
      const p = johnson(c, 1);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(johnson(1, 1)).toBeCloseTo(0.5);
    expect(johnson(0, 1)).toBe(0);
  });
  it('pixels on target fall with range', () => {
    expect(pixelsOnTarget(20, 1080, 40)).toBeCloseTo(2 * pixelsOnTarget(40, 1080, 40));
  });
  it('the actor is closest to the post mid-crossing', () => {
    const mid = actorAt(SPECTRUM.pathHalf / 1.4, 'walk');
    expect(mid.range).toBeCloseTo(SPECTRUM.lateral, 0);
    expect(actorAt(0, 'walk').range).toBeGreaterThan(mid.range);
  });
  it('a display cloak cuts visible contrast, but not off-axis or in motion', () => {
    const a = actorAt(SPECTRUM.pathHalf / 1.4, 'walk');
    expect(visualResidual({ ...NO_CLOAK, visual: 'display' }, a)).toBeLessThan(0.1);
    expect(visualResidual({ ...NO_CLOAK, visual: 'display' }, actorAt(0, 'walk'))).toBeGreaterThan(visualResidual({ ...NO_CLOAK, visual: 'display' }, a));
    expect(visualResidual({ ...NO_CLOAK, visual: 'display', gait: 'sprint' }, { ...a, speed: 4.5 })).toBeGreaterThan(visualResidual({ ...NO_CLOAK, visual: 'display' }, a));
  });
  it('an active display makes you warmer; blankets warm up over time; cooling holds near ambient', () => {
    expect(thermalDelta({ ...NO_CLOAK, visual: 'display' }, day, 0)).toBeGreaterThan(thermalDelta(NO_CLOAK, day, 0));
    const b = { ...NO_CLOAK, thermal: 'blanket' as const };
    expect(thermalDelta(b, day, 60)).toBeGreaterThan(thermalDelta(b, day, 0));
    expect(thermalDelta({ ...NO_CLOAK, thermal: 'cooling' }, day, 100)).toBeLessThan(0.5);
  });
  it('radar is defeated by stillness more than by optics', () => {
    const a = actorAt(SPECTRUM.pathHalf / 1.4, 'walk');
    const optical = sensorProbabilities({ ...NO_CLOAK, visual: 'display' }, day, a).radar;
    const plain = sensorProbabilities(NO_CLOAK, day, a).radar;
    expect(optical).toBeCloseTo(plain, 10);
    const slow = sensorProbabilities({ ...NO_CLOAK, gait: 'creep' }, day, { ...a, speed: 0.45 }).radar;
    expect(slow).toBeLessThan(plain);
  });
  it('footsteps are heard at night but not in daytime noise', () => {
    const a = actorAt(SPECTRUM.pathHalf / 1.4, 'walk');
    expect(sensorProbabilities(NO_CLOAK, night, a).acoustic).toBeGreaterThan(sensorProbabilities(NO_CLOAK, day, a).acoustic);
    expect(sensorProbabilities({ ...NO_CLOAK, acoustic: 'quiet' }, night, a).acoustic).toBeLessThan(sensorProbabilities(NO_CLOAK, night, a).acoustic);
  });
});

describe('scenarios', () => {
  it('an uncloaked walker is detected', () => {
    expect(runScenario(NO_CLOAK, day).overall).toBeGreaterThan(0.99);
  });
  it('an optical cloak alone fools the camera less than everything else — other bands still detect', () => {
    const r = runScenario({ ...NO_CLOAK, visual: 'display' }, day);
    expect(r.cumulative.visible).toBeLessThan(runScenario(NO_CLOAK, day).cumulative.visible);
    expect(r.cumulative.thermal).toBeGreaterThan(0.9);
    expect(r.cumulative.radar).toBeGreaterThan(0.9);
    expect(r.overall).toBeGreaterThan(0.99);
  });
  it('the full loadout lowers overall detection but is not invisibility, and costs weight and power', () => {
    const r = runScenario(FULL, night);
    expect(r.overall).toBeLessThan(0.9);
    expect(r.overall).toBeGreaterThan(0.3);
    expect(r.cumulative.visible).toBeLessThan(0.2);
    expect(r.weightKg).toBeGreaterThan(10);
    expect(r.powerW).toBeGreaterThan(150);
  });
  it('probabilities stay in range and the timeline covers the crossing', () => {
    const r = runScenario(FULL, day);
    for (const s of SENSORS) {
      expect(r.cumulative[s]).toBeGreaterThanOrEqual(0);
      expect(r.cumulative[s]).toBeLessThanOrEqual(1);
    }
    expect(r.timeline[0].x).toBeCloseTo(-SPECTRUM.pathHalf);
    expect(r.timeline.at(-1)!.x).toBeCloseTo(SPECTRUM.pathHalf, 0);
  });
  it('costs and lessons', () => {
    expect(loadoutCost(NO_CLOAK)).toEqual({ kg: 0, w: 0 });
    const l = lessons({ ...NO_CLOAK, visual: 'display' }, runScenario({ ...NO_CLOAK, visual: 'display' }, day));
    expect(l.some((x) => /heater/.test(x))).toBe(true);
  });
});
