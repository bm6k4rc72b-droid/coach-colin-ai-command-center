import { describe, expect, it } from 'vitest';
import { ENERGY, G, SUIT } from '../src/config/suit';
import { Controller, NEUTRAL, PID } from '../src/core/control';
import { autoFly, COURSES, stepResponse, throughRing } from '../src/core/courses';
import { energyRate, fanPower, flat, hoverEndurance, initialState, MAX_THRUST, mix, step, totalThrust, WEIGHT, wrench } from '../src/core/flight';
import { euler, fromEuler, qRotate } from '../src/core/math';
import { Session } from '../src/core/session';
import { AGGRESSIVE, TOUR, TourRunner, TUNED, type TourActions } from '../src/core/tour';

const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('maths', () => {
  it('euler and fromEuler round-trip', () => {
    const e = euler(fromEuler(0.5, 0.2, 0.3));
    close(e.yaw, 0.5, 1e-9);
    close(e.pitch, 0.2, 1e-9);
    close(e.roll, 0.3, 1e-9);
  });
  it('positive pitch leans forward (nose down), positive roll leans right', () => {
    expect(qRotate(fromEuler(0, 0.3, 0), [0, 0, 1])[1]).toBeLessThan(0);
    expect(qRotate(fromEuler(0, 0, 0.3), [1, 0, 0])[1]).toBeLessThan(0);
  });
});

describe('mixer and thrust', () => {
  it('a pure collective command produces exactly that lift and no torque', () => {
    const w = wrench(mix({ collective: WEIGHT, torque: [0, 0, 0] }));
    close(w.force[1], WEIGHT, 1e-6);
    for (const t of w.torque) close(t, 0, 1e-6);
  });
  it('torque commands come out with the right sign on each axis', () => {
    for (const axis of [0, 1, 2]) {
      const tq: [number, number, number] = [0, 0, 0];
      tq[axis] = 40;
      const w = wrench(mix({ collective: WEIGHT, torque: tq }));
      expect(Math.sign(w.torque[axis])).toBe(1);
      close(w.torque[axis], 40, 6);
    }
  });
  it('saturates at the jets’ limits', () => {
    const t = mix({ collective: 1e6, torque: [0, 0, 0] });
    expect(t.bootL).toBeLessThanOrEqual(SUIT.bootMax);
    expect(t.palmR).toBeLessThanOrEqual(SUIT.palmMax);
    expect(totalThrust(t)).toBeGreaterThan(WEIGHT * 2);
  });
});

describe('energy', () => {
  it('fan power follows momentum theory F^1.5 / sqrt(2ρA)', () => {
    close(fanPower(1000, 0.03) / fanPower(500, 0.03), Math.pow(2, 1.5), 1e-9);
  });
  it('turbines hover for minutes, batteries for about a minute and a half', () => {
    const turb = hoverEndurance('turbine');
    const elec = hoverEndurance('electric');
    expect(turb).toBeGreaterThan(240);
    expect(turb).toBeLessThan(420);
    expect(elec).toBeGreaterThan(60);
    expect(elec).toBeLessThan(130);
    expect(hoverEndurance('reactor')).toBe(Infinity);
    const watts = energyRate(mix({ collective: WEIGHT, torque: [0, 0, 0] }), 'electric').watts;
    expect(watts).toBeGreaterThan(200e3);
  });
});

describe('physics', () => {
  it('with no thrust the suit falls at g and crashes', () => {
    let s = { ...initialState('reactor', [0, 20, 0]), landed: false };
    s = step(s, mix({ collective: 0, torque: [0, 0, 0] }), 0.1, { source: 'reactor', wind: [0, 0, 0], terrain: flat });
    close(s.vel[1], -G * 0.1, 0.05);
    for (let i = 0; i < 400 && !s.landed; i++) s = step(s, mix({ collective: 0, torque: [0, 0, 0] }), 1 / 120, { source: 'reactor', wind: [0, 0, 0], terrain: flat });
    expect(s.crashed).toBe(true);
  });
  it('thrust equal to weight holds a hover out of ground effect', () => {
    let s = { ...initialState('reactor', [0, 30, 0]), landed: false };
    for (let i = 0; i < 240; i++) s = step(s, mix({ collective: WEIGHT, torque: [0, 0, 0] }), 1 / 120, { source: 'reactor', wind: [0, 0, 0], terrain: flat });
    close(s.vel[1], 0, 0.05);
  });
  it('fuel burns and running dry stops the jets', () => {
    let s = { ...initialState('turbine', [0, 30, 0]), landed: false, energy: 0.001 };
    for (let i = 0; i < 120; i++) s = step(s, mix({ collective: WEIGHT, torque: [0, 0, 0] }), 1 / 120, { source: 'turbine', wind: [0, 0, 0], terrain: flat });
    expect(s.energy).toBe(0);
    expect(s.vel[1]).toBeLessThan(-5);
  });
  it('the suit tops out near 3.3 g; a movie-strength 6 g pull causes G-LOC', () => {
    let s = { ...initialState('reactor', [0, 50, 0]), landed: false };
    expect(MAX_THRUST / WEIGHT).toBeLessThan(3.5);
    // Bypass the mixer's limits to model a fictional suit.
    const thr = { ...mix({ collective: 0, torque: [0, 0, 0] }), bootL: SUIT.mass * G * 3, bootR: SUIT.mass * G * 3 };
    // Like a centrifuge: hold the 6 g load without the suit speeding up into drag.
    for (let i = 0; i < 1200 && !s.gloc; i++) s = step({ ...s, vel: [0, 0, 0] }, thr, 1 / 120, { source: 'reactor', wind: [0, 0, 0], terrain: flat });
    expect(s.maxG).toBeGreaterThan(4.5);
    expect(s.gloc).toBe(true);
  });
});

describe('control', () => {
  it('PID derivative-on-measurement does not kick on a setpoint step', () => {
    const p = new PID(1, 0, 10);
    p.update(0, 0, 0.01);
    expect(p.update(10, 0, 0.01)).toBe(10);
  });
  it('flight computer climbs to and holds the altitude target', () => {
    const r = stepResponse(TUNED);
    expect(r.overshoot).toBeLessThan(0.15);
    expect(r.steadyError).toBeLessThan(0.3);
    expect(r.verdict).toMatch(/Well tuned/);
  });
  it('the tuning lab diagnoses bad gains', () => {
    expect(stepResponse(AGGRESSIVE).verdict).toMatch(/Oscillating/);
    expect(stepResponse({ altKp: 0.3, altKi: 0, altKd: 1 }).verdict).toMatch(/Sluggish/);
  });
  it('stability mode holds a commanded lean angle', () => {
    const ctl = new Controller();
    ctl.assist = 'stability';
    let s = { ...initialState('reactor', [0, 50, 0]), landed: false };
    for (let i = 0; i < 360; i++) s = step(s, ctl.thrusters(s, { ...NEUTRAL, pitch: 0.5, throttle: 0.625 }, 1 / 120), 1 / 120, { source: 'reactor', wind: [0, 0, 0], terrain: flat });
    close(euler(s.q).pitch, 0.5 * (30 * Math.PI) / 180, 0.03);
    expect(s.vel[2]).toBeGreaterThan(1); // leaning forward accelerates forward
  });
});

describe('courses', () => {
  it('ring crossing detection respects direction and radius', () => {
    const r = COURSES.rings.rings[0];
    expect(throughRing([0, 8, 29], [0, 8, 31], r)).toBe(true);
    expect(throughRing([0, 8, 31], [0, 8, 29], r)).toBe(false);
    expect(throughRing([10, 8, 29], [10, 8, 31], r)).toBe(false);
  });
  for (const c of ['hover', 'rings', 'rooftop'] as const)
    it(`the autopilot completes "${c}" with a soft landing`, () => {
      const run = autoFly(c, 'turbine');
      expect(run.progress.phase).toBe('done');
      expect(run.progress.result!.success).toBe(true);
      expect(run.state.touchdownSpeed).toBeLessThan(SUIT.softLanding);
      expect(run.progress.ringsPassed).toBe(COURSES[c].rings.length);
    });
  it('the session loop matches: autopilot on the electric suit finishes the hover test', () => {
    const ss = new Session('hover', 'electric');
    ss.setAutopilot(true);
    for (let i = 0; i < 60 * 40 && ss.p.phase !== 'done'; i++) ss.update(1 / 60);
    expect(ss.p.phase).toBe('done');
    expect(ss.s.energy).toBeLessThan(ENERGY.electric.capacity);
  });
  it('manual throttle keys move the lever', () => {
    const ss = new Session('hover', 'reactor');
    ss.setAssist('stability');
    for (let i = 0; i < 60; i++) ss.update(1 / 60, { ...NEUTRAL, throttle: 1 });
    expect(ss.throttleLevel).toBeGreaterThan(0.4);
  });
});

describe('tour', () => {
  it('walks every step and stops', () => {
    const calls: string[] = [];
    const a: TourActions = {
      setCourse: (c) => calls.push(`course:${c}`),
      setSource: (s) => calls.push(`source:${s}`),
      setAssist: (x) => calls.push(`assist:${x}`),
      autopilot: (on) => calls.push(`ap:${on}`),
      setGains: () => calls.push('gains'),
      highlight: () => {},
    };
    const t = new TourRunner(a);
    t.start();
    for (let i = 0; i < 1000 && t.active; i++) t.update(0.5);
    expect(t.active).toBe(false);
    expect(t.index).toBe(TOUR.length);
    expect(calls).toContain('course:rooftop');
    expect(calls).toContain('source:electric');
  });
});
