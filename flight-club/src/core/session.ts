/**
 * One flying session: course + energy source + controller + state, advanced at a fixed 120 Hz.
 * Pure (no DOM) so the app, the tour and the tests drive the exact same loop.
 */
import { ENERGY, type EnergyId } from '../config/suit';
import { Controller, NEUTRAL, type Assist, type Stick } from './control';
import { Autopilot, COURSES, Gusts, initialProgress, terrainFor, track, type CourseId, type Progress } from './courses';
import { energyRate, initialState, step, type State, type Terrain } from './flight';
import { clamp, type V3 } from './math';

export const DT = 1 / 120;
/** Manual / stability throttle that exactly balances weight (collective = throttle × 1.6 × weight). */
export const HOVER_THROTTLE = 1 / 1.6;

export class Session {
  courseId: CourseId = 'hover';
  source: EnergyId = 'reactor';
  ctl = new Controller();
  s!: State;
  p!: Progress;
  wind: V3 = [0, 0, 0];
  autopilot: Autopilot | null = null;
  /** Throttle lever for manual / stability modes (0..1); keys move it up and down. */
  throttleLevel = 0;
  private gusts = new Gusts();
  private terrain!: Terrain;
  private acc = 0;

  constructor(courseId: CourseId = 'hover', source: EnergyId = 'reactor') {
    this.reset(courseId, source);
  }

  get course() {
    return COURSES[this.courseId];
  }

  reset(courseId = this.courseId, source = this.source): void {
    this.courseId = courseId;
    this.source = source;
    const c = COURSES[courseId];
    this.terrain = terrainFor(c);
    this.s = initialState(source, [...c.start] as V3, c.startYaw);
    this.p = initialProgress();
    this.gusts = new Gusts();
    this.wind = [0, 0, 0];
    this.ctl.reset(c.start[1]);
    this.throttleLevel = 0;
    this.acc = 0;
    if (this.autopilot) this.autopilot = new Autopilot(c);
  }

  setAssist(a: Assist): void {
    if (a === this.ctl.assist) return;
    // Hand over smoothly: hold the current altitude / give the lever a hover setting.
    if (a === 'computer') this.ctl.altitudeTarget = this.s.pos[1];
    else if (!this.s.landed) this.throttleLevel = HOVER_THROTTLE;
    this.ctl.assist = a;
  }

  setAutopilot(on: boolean): void {
    if (on) {
      this.setAssist('computer');
      this.autopilot = new Autopilot(this.course);
    } else this.autopilot = null;
  }

  /** Advance real time dt with the pilot's stick (ignored while the autopilot flies). */
  update(dt: number, input: Stick = NEUTRAL): void {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick(input);
    }
  }

  private tick(input: Stick): void {
    if (this.p.phase === 'done' || this.p.phase === 'failed') return;
    let stick: Stick;
    if (this.autopilot) stick = this.autopilot.stick(this.s, this.p, this.ctl, DT);
    else if (this.ctl.assist === 'computer') stick = input;
    else {
      this.throttleLevel = clamp(this.throttleLevel + input.throttle * 0.45 * DT, 0, 1);
      stick = { ...input, throttle: this.throttleLevel };
    }
    const thr = this.ctl.thrusters(this.s, stick, DT);
    this.wind = this.gusts.next(DT, this.course.wind);
    const s1 = step(this.s, thr, DT, { source: this.source, wind: this.wind, terrain: this.terrain });
    this.p = track(this.course, this.p, this.s, s1, DT, this.source);
    this.s = s1;
  }

  /** Seconds of flight left at the current power draw (Infinity for the fictional reactor). */
  timeLeft(): number {
    if (!Number.isFinite(this.s.energy)) return Infinity;
    const r = energyRate(this.s.thrusters, this.source);
    const rate = ENERGY[this.source].unit === 'kg' ? r.fuelKgPerS : r.watts;
    return rate > 0 ? this.s.energy / rate : Infinity;
  }

  energyFraction(): number {
    const cap = ENERGY[this.source].capacity;
    return Number.isFinite(cap) ? this.s.energy / cap : 1;
  }
}
