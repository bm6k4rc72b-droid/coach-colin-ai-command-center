import { describe, expect, it } from 'vitest';
import { ARMOUR, CHASSIS, ENGINES, G, MISSION, TYRES } from '../src/config/parts';
import { evaluate, score } from '../src/core/mission';
import { TOUR, TourRunner, type TourActions } from '../src/core/tour';
import {
  accelerate,
  brakingDistance,
  corner,
  crash,
  DEFAULT_BUILD,
  derive,
  effectiveTravel,
  jump,
  range,
  runAll,
  topSpeed,
  type Build,
} from '../src/core/vehicle';

const B = (p: Partial<Build> = {}): Build => ({ ...DEFAULT_BUILD, ...p });
const WINNER = B({ chassis: 'tumbler', armour: 'composite', drive: 'awd', travel: 0.35, springK: 120e3, damping: 0.6 });

describe('derived properties', () => {
  it('mass adds up and armour raises the centre of gravity', () => {
    const d = derive(B({ armour: 'steel' }));
    expect(d.mass).toBe(CHASSIS.interceptor.mass + ENGINES.v8.mass + ARMOUR.steel.mass);
    expect(d.hCG).toBeGreaterThan(derive(B()).hCG);
    expect(d.ssf).toBeCloseTo(CHASSIS.interceptor.track / (2 * d.hCG));
  });
  it('a wing adds downforce and drag', () => {
    expect(derive(B({ wing: 1 })).clA).toBeGreaterThan(derive(B({ wing: 0 })).clA);
    expect(derive(B({ wing: 1 })).cdA).toBeGreaterThan(derive(B({ wing: 0 })).cdA);
  });
  it('packaging limits suspension travel per chassis', () => {
    expect(effectiveTravel(B({ travel: 0.5 }))).toBe(CHASSIS.interceptor.maxTravel);
    expect(effectiveTravel(B({ chassis: 'tumbler', travel: 0.5 }))).toBe(0.5);
  });
});

describe('acceleration, top speed, braking', () => {
  it('reaches 100 km/h and the quarter mile; the trace rises', () => {
    const a = accelerate(B());
    expect(a.t0to100).toBeGreaterThan(2);
    expect(a.t0to100).toBeLessThan(8);
    expect(a.quarterMile).toBeGreaterThan(a.t0to100);
    for (let i = 1; i < a.trace.length; i++) expect(a.trace[i].v).toBeGreaterThanOrEqual(a.trace[i - 1].v - 1e-9);
  });
  it('all-wheel drive beats rear-wheel drive off the line when traction-limited', () => {
    const rwd = accelerate(B({ chassis: 'tumbler' }));
    const awd = accelerate(B({ chassis: 'tumbler', drive: 'awd' }));
    expect(rwd.tractionLimited).toBeGreaterThan(0.3);
    expect(awd.t0to100).toBeLessThan(rwd.t0to100);
  });
  it('more mass is slower; more power is faster', () => {
    expect(accelerate(B({ armour: 'steel', drive: 'awd' })).t0to100).toBeGreaterThan(accelerate(B({ drive: 'awd' })).t0to100);
    expect(accelerate(B({ engine: 'v12tt', drive: 'awd' })).t0to100).toBeLessThan(accelerate(B({ engine: 'v8', drive: 'awd' })).t0to100);
  });
  it('top speed: drag-limited power balance, more drag area → lower', () => {
    const t = topSpeed(B({ wing: 0 }));
    const d = derive(B({ wing: 0 }));
    const v = t.kmh / 3.6;
    if (t.limitedBy === 'drag') {
      const need = (0.5 * 1.225 * d.cdA * v * v + d.crr * d.mass * G) * v;
      expect(need / (d.power * 0.88)).toBeCloseTo(1, 2);
    }
    expect(topSpeed(B({ chassis: 'tank' })).kmh).toBeLessThan(topSpeed(B()).kmh);
  });
  it('braking distance ≈ v²/(2μg), shorter with more grip, nearly independent of mass', () => {
    const d = brakingDistance(B({ wing: 0 }), 100);
    const ideal = (100 / 3.6) ** 2 / (2 * TYRES.street.mu * 0.95 * G);
    expect(d).toBeLessThan(ideal);
    expect(d).toBeGreaterThan(ideal * 0.85);
    expect(brakingDistance(B({ tyres: 'allterrain' }))).toBeGreaterThan(d);
    expect(Math.abs(brakingDistance(B({ armour: 'steel', wing: 0 })) - d)).toBeLessThan(2);
  });
});

describe('cornering and rollover', () => {
  it('grip-limited speed ≈ √(μ g R) without downforce', () => {
    const c = corner(B({ wing: 0 }), 30);
    expect(c.gripKmh / 3.6).toBeCloseTo(Math.sqrt(TYRES.street.mu * G * 30), 3);
    expect(c.limitedBy).toBe('grip');
  });
  it('a tall, heavy vehicle tips before it slides', () => {
    const c = corner(B({ chassis: 'tank', armour: 'steel', rideOffset: 0.2 }), 30);
    expect(c.limitedBy).toBe('rollover');
    expect(c.rolloverKmh).toBeLessThan(c.gripKmh);
  });
  it('downforce raises the grip limit on fast corners', () => {
    expect(corner(B({ wing: 1 }), 150).gripKmh).toBeGreaterThan(corner(B({ wing: 0 }), 150).gripKmh);
  });
});

describe('jump, crash, range', () => {
  it('ballistic range v² sin2θ / g', () => {
    const j = jump(B(), 80, 15, 20);
    const v = 80 / 3.6;
    expect(j.range).toBeCloseTo((v * v * Math.sin(Math.PI / 6)) / G, 5);
    expect(j.clears).toBe(true);
    expect(jump(B(), 40, 15, 20).clears).toBe(false);
  });
  it('short travel bottoms out; long travel lands softly', () => {
    const low = jump(B(), MISSION.jumpApproachKmh, MISSION.jumpAngleDeg, MISSION.jumpGap);
    const tall = jump(WINNER, MISSION.jumpApproachKmh, MISSION.jumpAngleDeg, MISSION.jumpGap);
    expect(low.bottomedOut).toBe(true);
    expect(tall.bottomedOut).toBe(false);
    expect(tall.occupantG).toBeLessThan(low.occupantG);
    expect(tall.occupantG).toBeLessThanOrEqual(MISSION.landingMaxG);
  });
  it('stiff armour steals crumple distance → harder crash for occupants', () => {
    const soft = crash(B(), 56);
    const steel = crash(B({ armour: 'steel' }), 56);
    expect(steel.occupantG).toBeGreaterThan(soft.occupantG);
    expect(soft.occupantG).toBeCloseTo((56 / 3.6) ** 2 / (2 * (CHASSIS.interceptor.crumple + 0.12)) / G, 5);
  });
  it('range falls with drag and mass; electric is efficient but has less energy', () => {
    expect(range(B({ chassis: 'tank' }), 100)).toBeLessThan(range(B(), 100));
    expect(range(B({ engine: 'turbine' }), 100)).toBeGreaterThan(0);
  });
});

describe('mission', () => {
  it('the default supercar misses the jump and protection', () => {
    const reqs = evaluate(runAll(B()));
    expect(reqs.find((r) => r.id === 'jump')!.status).toBe('fail');
    expect(reqs.find((r) => r.id === 'protection')!.status).toBe('fail');
    expect(score(reqs).score).toBeLessThan(100);
  });
  it('the tour\'s final build is mission ready', () => {
    const s = score(evaluate(runAll(WINNER)));
    expect(s.score).toBe(100);
    expect(s.grade).toBe('Mission ready');
  });
  it('the mission is hard: only a small share of builds pass everything', () => {
    let pass = 0;
    let total = 0;
    for (const chassis of Object.keys(CHASSIS)) for (const engine of Object.keys(ENGINES)) for (const armour of Object.keys(ARMOUR)) for (const tyres of Object.keys(TYRES)) for (const drive of ['rwd', 'awd'])
      for (const travel of [0.2, 0.35]) {
        total++;
        if (score(evaluate(runAll(B({ chassis, engine, armour, tyres, drive, travel, springK: 120e3, damping: 0.6 } as Partial<Build>)))).score === 100) pass++;
      }
    expect(pass).toBeGreaterThan(0);
    expect(pass / total).toBeLessThan(0.15);
  });
});

describe('guided tour', () => {
  it('walks from the default car to a mission-ready build', () => {
    let b: Build = { ...DEFAULT_BUILD };
    const tests: string[] = [];
    const actions: TourActions = {
      setBuild: (p) => (b = { ...b, ...p }),
      runTest: (t) => tests.push(t),
      runAll: () => tests.push('all'),
      highlight: () => undefined,
    };
    const tour = new TourRunner(actions);
    tour.start();
    // Stop at the mission check step and verify the build passes.
    while (tour.active && TOUR[tour.index].title !== 'Back to composite — mission check') tour.update(1);
    expect(score(evaluate(runAll(b))).score).toBe(100);
    while (tour.active) tour.update(1);
    expect(tests).toContain('jump');
    expect(tests).toContain('crash');
  });
});
