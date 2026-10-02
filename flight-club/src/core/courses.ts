/**
 * Courses, objectives, scoring and the PID tuning lab. Pure — the autopilot flies every course
 * headless in the tests through the same stick inputs a pilot uses.
 */
import { SUIT, WIND, type EnergyId } from '../config/suit';
import { Controller, guide, NEUTRAL, type Gains, type Stick } from './control';
import { initialState, step, type State, type Terrain } from './flight';
import { rng, type V3 } from './math';

export type CourseId = 'hover' | 'rings' | 'rooftop';

export interface Ring {
  pos: V3;
  /** Unit normal (the direction you fly through). */
  normal: V3;
  radius: number;
}

export interface Course {
  id: CourseId;
  name: string;
  brief: string;
  start: V3;
  startYaw: number;
  pad: V3;
  padRadius: number;
  rings: Ring[];
  wind: boolean;
  buildings: { x: number; z: number; w: number; d: number; h: number }[];
  /** Hover course: altitude band and hold time. */
  hold?: { min: number; max: number; seconds: number };
}

const ROOF = { x: 0, z: 70, w: 18, d: 18, h: 22 };

export const COURSES: Record<CourseId, Course> = {
  hover: {
    id: 'hover',
    name: 'Hover test',
    brief: 'Take off, hold 9–11 m for 10 s, then land softly on the pad (under 2 m/s).',
    start: [0, 0, 0],
    startYaw: 0,
    pad: [0, 0, 0],
    padRadius: 4,
    rings: [],
    wind: false,
    buildings: [],
    hold: { min: 9, max: 11, seconds: 10 },
  },
  rings: {
    id: 'rings',
    name: 'Ring run',
    brief: 'Fly through six rings in order, then land on the far pad.',
    start: [0, 0, 0],
    startYaw: 0,
    pad: [-30, 0, 150],
    padRadius: 5,
    rings: [
      { pos: [0, 8, 30], normal: [0, 0, 1], radius: 3.5 },
      { pos: [15, 12, 55], normal: [0.5, 0, 0.87], radius: 3.5 },
      { pos: [35, 16, 75], normal: [0.7, 0, 0.7], radius: 3.5 },
      { pos: [40, 14, 105], normal: [0, 0, 1], radius: 3.5 },
      { pos: [20, 10, 125], normal: [-0.7, 0, 0.7], radius: 3.5 },
      { pos: [-10, 8, 140], normal: [-0.87, 0, 0.5], radius: 3.5 },
    ],
    wind: false,
    buildings: [],
  },
  rooftop: {
    id: 'rooftop',
    name: 'Gusty rooftop landing',
    brief: 'Crosswind gusts. Climb to the rooftop 70 m ahead and land on its pad without crashing.',
    start: [0, 0, 0],
    startYaw: 0,
    pad: [ROOF.x, ROOF.h, ROOF.z],
    padRadius: 4,
    rings: [],
    wind: true,
    buildings: [ROOF, { x: -40, z: 40, w: 20, d: 30, h: 35 }, { x: 45, z: 30, w: 16, d: 16, h: 28 }],
  },
};

/** Terrain height (ground or building roofs). */
export function terrainFor(c: Course): Terrain {
  return (x, z) => {
    let h = 0;
    for (const b of c.buildings) if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) h = Math.max(h, b.h);
    return h;
  };
}

/** Did the segment a→b pass through the ring (crossing its plane inside the radius, in its direction)? */
export function throughRing(a: V3, b: V3, r: Ring): boolean {
  const da = (a[0] - r.pos[0]) * r.normal[0] + (a[1] - r.pos[1]) * r.normal[1] + (a[2] - r.pos[2]) * r.normal[2];
  const db = (b[0] - r.pos[0]) * r.normal[0] + (b[1] - r.pos[1]) * r.normal[1] + (b[2] - r.pos[2]) * r.normal[2];
  if (!(da < 0 && db >= 0)) return false;
  const t = da / (da - db);
  const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return Math.hypot(p[0] - r.pos[0], p[1] - r.pos[1], p[2] - r.pos[2]) <= r.radius;
}

export interface Progress {
  phase: 'ready' | 'flying' | 'done' | 'failed';
  ringIndex: number;
  ringsPassed: number;
  holdTime: number;
  holdDone: boolean;
  tookOff: boolean;
  message: string;
  result: Result | null;
}

export interface Result {
  success: boolean;
  time: number;
  energyUsed: number;
  energyUnit: 'kg' | 'J' | '';
  maxG: number;
  touchdown: number;
  ringsPassed: number;
  stars: number;
  lessons: string[];
}

export const initialProgress = (): Progress => ({
  phase: 'ready',
  ringIndex: 0,
  ringsPassed: 0,
  holdTime: 0,
  holdDone: false,
  tookOff: false,
  message: '',
  result: null,
});

/** Update objectives after a physics step from s0 to s1. */
export function track(c: Course, p0: Progress, s0: State, s1: State, dt: number, source: EnergyId): Progress {
  const p: Progress = { ...p0 };
  if (p.phase === 'done' || p.phase === 'failed') return p;
  if (!s1.landed && s1.pos[1] > 0.5) {
    p.tookOff = true;
    p.phase = 'flying';
  }
  if (s1.crashed) {
    p.phase = 'failed';
    p.message = `Crashed at ${s1.touchdownSpeed.toFixed(1)} m/s.`;
    p.result = result(c, p, s1, false, source);
    return p;
  }
  if (s1.energy <= 0 && !s1.landed) p.message = 'OUT OF ENERGY — falling!';
  if (c.hold && !p.holdDone) {
    const inBand = s1.pos[1] >= c.hold.min && s1.pos[1] <= c.hold.max;
    p.holdTime = inBand ? p.holdTime + dt : 0;
    p.message = inBand ? `Holding: ${p.holdTime.toFixed(1)} / ${c.hold.seconds} s` : `Climb to ${c.hold.min}–${c.hold.max} m and hold`;
    if (p.holdTime >= c.hold.seconds) {
      p.holdDone = true;
      p.message = 'Hold complete — now land on the pad.';
    }
  }
  if (p.ringIndex < c.rings.length) {
    const r = c.rings[p.ringIndex];
    if (throughRing(s0.pos, s1.pos, r)) {
      p.ringIndex++;
      p.ringsPassed++;
      p.message = `Ring ${p.ringIndex}/${c.rings.length} ✓`;
    } else {
      // Skipping a ring: passing its plane outside the radius counts as a miss and moves on.
      const da = (s0.pos[0] - r.pos[0]) * r.normal[0] + (s0.pos[2] - r.pos[2]) * r.normal[2];
      const db = (s1.pos[0] - r.pos[0]) * r.normal[0] + (s1.pos[2] - r.pos[2]) * r.normal[2];
      if (da < 0 && db >= 0 && Math.hypot(s1.pos[0] - r.pos[0], s1.pos[2] - r.pos[2]) < 25) {
        p.ringIndex++;
        p.message = `Missed ring ${p.ringIndex}`;
      }
    }
  }
  const objectivesDone = (!c.hold || p.holdDone) && p.ringIndex >= c.rings.length;
  if (p.tookOff && s1.landed && !s0.landed) {
    const onPad = Math.hypot(s1.pos[0] - c.pad[0], s1.pos[2] - c.pad[2]) <= c.padRadius && Math.abs(s1.pos[1] - c.pad[1]) < 0.5;
    if (objectivesDone && onPad) {
      p.phase = 'done';
      p.result = result(c, p, s1, true, source);
      p.message = 'Landed — course complete!';
    } else p.message = objectivesDone ? 'Landed off the pad — take off and try again.' : 'Landed early — objectives not complete.';
  }
  return p;
}

function result(c: Course, p: Progress, s: State, success: boolean, source: EnergyId): Result {
  const lessons: string[] = [];
  if (!success && s.crashed) lessons.push(`Touchdown at ${s.touchdownSpeed.toFixed(1)} m/s exceeded the ${SUIT.crashSpeed} m/s the legs can absorb. Slow the descent before the ground, not at it.`);
  if (success && s.touchdownSpeed > SUIT.softLanding) lessons.push('A firm landing: flare by reducing descent rate below 2 m/s in the last few metres.');
  if (s.maxG > 3) lessons.push(`Peak ${s.maxG.toFixed(1)} g: hard manoeuvres load the pilot. Above ~4.5 g sustained, vision greys out.`);
  if (source === 'electric') lessons.push('Electric fans hover for about 90 s on 24 kg of battery: thrust power grows with thrust^1.5, and lifting a person needs hundreds of kW.');
  if (source === 'turbine') lessons.push('Real jet suits fly for minutes on kerosene turbines — energy density, not thrust, limits flight time.');
  if (source === 'reactor') lessons.push('Unlimited energy is the fictional part. Everything else here — thrust, control, G-force — is real physics.');
  if (c.rings.length && p.ringsPassed < c.rings.length) lessons.push('Missed rings: fly slower, line up early, and use yaw so the rings come straight at you.');
  const touchdown = s.touchdownSpeed;
  const stars = success ? 1 + (touchdown <= SUIT.softLanding ? 1 : 0) + (s.maxG < 3 && p.ringsPassed === c.rings.length ? 1 : 0) : 0;
  return {
    success,
    time: s.t,
    energyUsed: s.energyUsed,
    energyUnit: source === 'turbine' ? 'kg' : source === 'electric' ? 'J' : '',
    maxG: s.maxG,
    touchdown,
    ringsPassed: p.ringsPassed,
    stars,
    lessons,
  };
}

/** Wind gusts: Ornstein–Uhlenbeck process (correlated random wind) in x and z. */
export class Gusts {
  private w: V3 = [0, 0, 0];
  private r: () => number;
  constructor(seed = 3) {
    this.r = rng(seed);
  }
  next(dt: number, on: boolean): V3 {
    if (!on) return [0, 0, 0];
    const n = () => (this.r() + this.r() + this.r() - 1.5) * 2;
    const k = dt / WIND.tau;
    const s = WIND.gust * Math.sqrt(2 * k);
    this.w = [this.w[0] - this.w[0] * k + s * n() + 0.04 * k * 60, 0, this.w[2] - this.w[2] * k + s * n()];
    return this.w;
  }
}

/** Autopilot plan for a course: sequence of waypoints (and hold / land behaviour). */
export class Autopilot {
  private holdT = 0;
  private stage = 0;
  constructor(private c: Course) {}

  stick(s: State, p: Progress, ctl: Controller, dt: number): Stick {
    const c = this.c;
    if (c.hold) {
      if (!p.holdDone) {
        const tgt: V3 = [c.pad[0], 10, c.pad[2]];
        this.holdT += dt;
        return guide(s, tgt, ctl, 4);
      }
      return this.land(s, ctl);
    }
    if (p.ringIndex < c.rings.length) {
      const r = c.rings[p.ringIndex];
      // Aim at a point slightly beyond the ring centre so we pass through it.
      const tgt: V3 = [r.pos[0] + r.normal[0] * 6, r.pos[1], r.pos[2] + r.normal[2] * 6];
      return guide(s, tgt, ctl, 9, 2);
    }
    // Climb above the pad (or rooftop), arrive, then descend.
    const above: V3 = [c.pad[0], c.pad[1] + 6, c.pad[2]];
    const horiz = Math.hypot(s.pos[0] - c.pad[0], s.pos[2] - c.pad[2]);
    if (this.stage === 0) {
      const cruiseAlt: V3 = [c.pad[0], Math.max(c.pad[1] + 6, 8), c.pad[2]];
      if (ctl.altitudeTarget < c.pad[1] + 4 && horiz > 25) return { ...NEUTRAL, throttle: 1 };
      if (horiz < 1.2 && Math.hypot(s.vel[0], s.vel[2]) < 1) this.stage = 1;
      return guide(s, horiz < 15 ? above : cruiseAlt, ctl, 8);
    }
    return this.land(s, ctl);
  }

  private land(s: State, ctl: Controller): Stick {
    const c = this.c;
    const st = guide(s, [c.pad[0], c.pad[1], c.pad[2]], ctl, 2);
    const h = s.pos[1] - c.pad[1];
    // Descend at a rate proportional to height, gently near the pad.
    const want = h > 4 ? -0.6 : -0.25;
    ctl.altitudeTarget = Math.max(c.pad[1] - 1, ctl.altitudeTarget);
    return { ...st, throttle: want };
  }
}

export interface FlightRun {
  progress: Progress;
  state: State;
  samples: { t: number; pos: V3; gLoad: number }[];
}

/** Fly a course headless with the autopilot. */
export function autoFly(courseId: CourseId, source: EnergyId, maxSeconds = 240, gains?: Gains): FlightRun {
  const c = COURSES[courseId];
  const ctl = new Controller(gains);
  ctl.reset(c.start[1]);
  const ap = new Autopilot(c);
  const terrain = terrainFor(c);
  const gusts = new Gusts();
  let s = initialState(source, c.start, c.startYaw);
  let p = initialProgress();
  const dt = 1 / 120;
  const samples: FlightRun['samples'] = [];
  for (let i = 0; i < maxSeconds / dt && p.phase !== 'done' && p.phase !== 'failed'; i++) {
    const stick = ap.stick(s, p, ctl, dt);
    const thr = ctl.thrusters(s, stick, dt);
    const s1 = step(s, thr, dt, { source, wind: gusts.next(dt, c.wind), terrain });
    p = track(c, p, s, s1, dt, source);
    s = s1;
    if (i % 12 === 0) samples.push({ t: s.t, pos: s.pos, gLoad: s.gLoad });
  }
  return { progress: p, state: s, samples };
}

export interface StepResponse {
  t: number[];
  alt: number[];
  overshoot: number;
  riseTime: number;
  settleTime: number;
  steadyError: number;
  crashed: boolean;
  verdict: string;
}

/** PID tuning lab: altitude step from the ground to 10 m with the given gains. */
export function stepResponse(g: Gains, target = 10, seconds = 14): StepResponse {
  const ctl = new Controller(g);
  ctl.reset(0);
  ctl.altitudeTarget = target;
  let s = initialState('reactor');
  const dt = 1 / 120;
  const t: number[] = [];
  const alt: number[] = [];
  let rise = Infinity;
  for (let i = 0; i < seconds / dt; i++) {
    s = step(s, ctl.thrusters(s, NEUTRAL, dt), dt, { source: 'reactor', wind: [0, 0, 0], terrain: () => 0 });
    if (rise === Infinity && s.pos[1] >= 0.9 * target) rise = s.t;
    if (i % 6 === 0) {
      t.push(s.t);
      alt.push(s.pos[1]);
    }
    if (s.crashed) break;
  }
  const peak = Math.max(...alt);
  let settle = 0;
  for (let i = alt.length - 1; i >= 0; i--) {
    if (Math.abs(alt[i] - target) > 0.05 * target) {
      settle = t[i];
      break;
    }
  }
  const overshoot = Math.max(0, (peak - target) / target);
  const steadyError = Math.abs(alt[alt.length - 1] - target);
  const tail = alt.slice(-40);
  const oscillating = Math.max(...tail) - Math.min(...tail) > 0.6;
  let verdict: string;
  if (s.crashed) verdict = 'Crashed — the loop drove the suit into the ground.';
  else if (oscillating) verdict = 'Oscillating: too much proportional gain or too little damping (Kd).';
  else if (overshoot > 0.2) verdict = 'Big overshoot: add derivative (Kd) to brake the climb, or lower Kp.';
  else if (rise > 4) verdict = 'Sluggish: raise Kp to respond faster.';
  else if (steadyError > 0.4) verdict = 'Steady-state error: a little integral (Ki) removes the offset.';
  else verdict = 'Well tuned: fast, little overshoot, settles on target.';
  return { t, alt, overshoot, riseTime: rise, settleTime: settle, steadyError, crashed: s.crashed, verdict };
}
