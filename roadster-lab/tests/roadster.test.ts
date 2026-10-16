import { describe, expect, it } from 'vitest';
import { PART_ORDER, PARTS } from '../src/core/parts';
import {
  apsides, braking, burnTime, cellCount, consumption, cornerSpeed, drag, eccentricAnomaly, G0, launch, LAUNCH_DATE, MPH, ORBITS, pack, period,
  positionAt, PRESETS, range, ROADSTER_1, ROADSTER_2, separation, thrusterDeltaV, topSpeed, tractionLimit,
} from '../src/core/physics';
import { TOUR, TourRunner, type TourActions } from '../src/core/tour';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.car;

describe('launch', () => {
  it('the announced Roadster lands near its 1.9 s 0–60 mph target', () => {
    const r = launch(ROADSTER_2);
    expect(r.t60!).toBeGreaterThan(1.8);
    expect(r.t60!).toBeLessThan(2.1);
    expect(r.t60Rollout!).toBeLessThan(r.t60!);
    expect(r.tQuarter!).toBeGreaterThan(8.5);
    expect(r.tQuarter!).toBeLessThan(9.4);
  });
  it('cannot accelerate faster than its torque or grip allows', () => {
    const r = launch(ROADSTER_2);
    expect(r.peakG).toBeLessThanOrEqual(ROADSTER_2.mu + 0.01);
    expect(r.peakG).toBeCloseTo(ROADSTER_2.wheelTorque / ROADSTER_2.radius / ROADSTER_2.mass / G0, 2);
  });
  it('street tyres make the tyres the limit', () => {
    const r = launch(preset('street'));
    expect(r.peakG).toBeCloseTo(1.0, 1);
    expect(r.t60!).toBeGreaterThan(2.6);
    expect(r.samples.some((s) => s.limit === 'grip')).toBe(true);
  });
  it('thrusters push past μ·g, then the gas runs out', () => {
    const c = preset('spacex');
    const r = launch(c);
    expect(r.peakG).toBeGreaterThan(c.mu + 0.5);
    expect(r.t60!).toBeLessThan(1.3);
    expect(burnTime(c)).toBeCloseTo((c.gasKg * c.ve) / c.thrust, 6);
    const after = r.samples.find((s) => s.t > burnTime(c) + 0.1)!;
    expect(after.thrust).toBe(0);
    expect(thrusterDeltaV(c)).toBeCloseTo(c.ve * Math.log(c.mass / (c.mass - c.gasKg)), 6);
  });
  it('the original Roadster matches its published 3.7–3.9 s and 125 mph', () => {
    const r = launch(ROADSTER_1);
    expect(r.t60!).toBeGreaterThan(3.5);
    expect(r.t60!).toBeLessThan(4.1);
    expect(topSpeed(ROADSTER_1) / MPH).toBeCloseTo(125, 0);
  });
  it('rear-drive grip grows with load transfer', () => {
    const still = tractionLimit(ROADSTER_1, 0, 0);
    const accel = tractionLimit(ROADSTER_1, 0, 5);
    expect(accel).toBeGreaterThan(still);
  });
});

describe('aero, range, braking', () => {
  it('drag scales with v²', () => {
    expect(drag(ROADSTER_2, 40) / drag(ROADSTER_2, 20)).toBeCloseTo(4, 6);
  });
  it('range falls at high speed and the 200 kWh pack goes hundreds of miles', () => {
    expect(range(ROADSTER_2, 30)).toBeGreaterThan(range(ROADSTER_2, 50));
    expect(range(ROADSTER_2, 55 * MPH) / 1.609).toBeGreaterThan(600);
    expect(consumption(ROADSTER_2, 30)).toBeGreaterThan(100);
  });
  it('stopping distance is v²/(2μg)', () => {
    const b = braking({ ...ROADSTER_2, clA: 0 }, 26.8224);
    expect(b.distance).toBeCloseTo(26.8224 ** 2 / (2 * ROADSTER_2.mu * G0), 6);
  });
  it('downforce lets the car corner faster than √(μ g r)', () => {
    expect(cornerSpeed(ROADSTER_2, 100)).toBeGreaterThan(Math.sqrt(ROADSTER_2.mu * G0 * 100));
  });
  it('pack heat follows I²R', () => {
    const a = pack(ROADSTER_2, 500e3);
    const b = pack({ ...ROADSTER_2, packV: ROADSTER_2.packV / 2 }, 500e3);
    expect(b.heat / a.heat).toBeCloseTo(4, 6);
    expect(cellCount(200e3, '2170')).toBeGreaterThan(10000);
  });
});

describe("Starman's orbit (Kepler)", () => {
  it('solves Kepler\'s equation', () => {
    for (const [M, e] of [[0.3, 0.1], [2.5, 0.25], [5, 0.7]]) {
      const E = eccentricAnomaly(M, e);
      expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
    }
  });
  it('periods follow Kepler\'s third law', () => {
    const [earth, mars, roadster] = ORBITS;
    expect(period(earth)).toBeCloseTo(365.26, 0);
    expect(period(mars)).toBeCloseTo(687, 0);
    expect(period(roadster)).toBeGreaterThan(550);
    expect(period(roadster)).toBeLessThan(565);
    expect(apsides(roadster).Q).toBeGreaterThan(1.6);
  });
  it('the Roadster starts next to Earth at launch', () => {
    expect(separation(ORBITS[0], ORBITS[2], LAUNCH_DATE)).toBeLessThan(0.08);
    const p = positionAt(ORBITS[2], LAUNCH_DATE);
    expect(p.r).toBeCloseTo(0.986, 1);
  });
});

describe('content and tour', () => {
  it('every part has a name, facts and maths', () => {
    for (const id of PART_ORDER) {
      expect(PARTS[id].facts.length).toBeGreaterThan(1);
      expect(PARTS[id].math.length).toBeGreaterThan(0);
    }
  });
  it('the tour runs end to end', () => {
    const calls: string[] = [];
    const a: TourActions = { select: () => calls.push('s'), preset: () => calls.push('p'), explode: () => calls.push('e'), xray: () => calls.push('x'), run: () => calls.push('r'), highlight: () => calls.push('h') };
    const t = new TourRunner(a);
    t.start();
    for (let i = 0; i < 400; i++) t.update(1);
    expect(t.active).toBe(false);
    expect(calls.length).toBeGreaterThan(TOUR.length);
  });
});
