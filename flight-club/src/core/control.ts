/**
 * Flight control: PID loops and three assist levels (manual, stability, flight computer),
 * plus a guidance autopilot that flies waypoints through the same stick inputs. Pure.
 */
import { ASSIST, G, SUIT } from '../config/suit';
import { mix, WEIGHT, type Command, type State, type Thrusters } from './flight';
import { clamp, euler, qRotateInv, wrapPi, type V3 } from './math';

export class PID {
  private integral = 0;
  private prevMeas: number | null = null;
  constructor(
    public kp: number,
    public ki: number,
    public kd: number,
    public iLimit = Infinity,
  ) {}

  reset(): void {
    this.integral = 0;
    this.prevMeas = null;
  }

  /** Derivative on measurement (no kick on setpoint changes), clamped integral (anti-windup). */
  update(setpoint: number, measured: number, dt: number, rate?: number): number {
    const err = setpoint - measured;
    this.integral = clamp(this.integral + err * dt, -this.iLimit, this.iLimit);
    const d = rate !== undefined ? -rate : this.prevMeas === null ? 0 : -(measured - this.prevMeas) / dt;
    this.prevMeas = measured;
    return this.kp * err + this.ki * this.integral + this.kd * d;
  }
}

export type Assist = 'manual' | 'stability' | 'computer';

/** Pilot (or autopilot) inputs, each in −1..1 (throttle 0..1 in manual). */
export interface Stick {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
}

export const NEUTRAL: Stick = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };

export interface Gains {
  altKp: number;
  altKi: number;
  altKd: number;
}

export const DEFAULT_GAINS: Gains = { altKp: 1.4, altKi: 0.25, altKd: 2.2 };

export class Controller {
  assist: Assist = 'computer';
  /** Altitude being held by the flight computer (m). */
  altitudeTarget = 0;
  private alt: PID;
  private pitch = new PID(9, 0, 3.2);
  private roll = new PID(9, 0, 3.2);
  private yawRate = new PID(4, 0.5, 0);
  private velX = new PID(0.35, 0.02, 0, 3);
  private velZ = new PID(0.35, 0.02, 0, 3);

  constructor(public gains: Gains = { ...DEFAULT_GAINS }) {
    this.alt = new PID(gains.altKp, gains.altKi, gains.altKd, 4);
  }

  setGains(g: Gains): void {
    this.gains = { ...g };
    this.alt = new PID(g.altKp, g.altKi, g.altKd, 4);
  }

  reset(alt = 0): void {
    this.altitudeTarget = alt;
    for (const p of [this.alt, this.pitch, this.roll, this.yawRate, this.velX, this.velZ]) p.reset();
  }

  /** Attitude loop: desired lean angles + yaw rate → body torque command. */
  private attitude(s: State, pitchT: number, rollT: number, yawRateT: number, dt: number): V3 {
    const e = euler(s.q);
    const I = SUIT.inertia;
    // Positive pitch (lean forward) is +rotation about x; positive roll (lean right) is −rotation about z.
    const ax = this.pitch.update(pitchT, e.pitch, dt, s.w[0]);
    const az = this.roll.update(rollT, e.roll, dt, -s.w[2]);
    const ay = this.yawRate.update(yawRateT, s.w[1], dt);
    return [ax * I[0], ay * I[1], -az * I[2]];
  }

  /** Stick → thruster settings for the current assist level. */
  thrusters(s: State, stick: Stick, dt: number): Thrusters {
    let cmd: Command;
    const e = euler(s.q);
    if (this.assist === 'manual') {
      cmd = {
        collective: clamp(stick.throttle, 0, 1) * WEIGHT * 1.6,
        torque: [stick.pitch * 260, stick.yaw * 90, -stick.roll * 220],
      };
    } else if (this.assist === 'stability') {
      const torque = this.attitude(s, stick.pitch * ASSIST.maxTilt, stick.roll * ASSIST.maxTilt, stick.yaw * ASSIST.maxYawRate, dt);
      const tilt = Math.max(0.5, Math.cos(e.pitch) * Math.cos(e.roll));
      cmd = { collective: (clamp(stick.throttle, 0, 1) * WEIGHT * 1.6) / tilt, torque };
    } else {
      // Flight computer: stick = velocity in the heading frame; throttle = climb rate; altitude hold.
      const yaw = e.yaw;
      const fwd = stick.pitch * ASSIST.maxSpeed;
      const right = stick.roll * ASSIST.maxSpeed;
      const vb = headingFrame(s.vel, yaw);
      const aF = this.velZ.update(fwd, vb.forward, dt) * G;
      const aR = this.velX.update(right, vb.right, dt) * G;
      const pitchT = clamp(Math.atan2(aF, G), -ASSIST.maxTilt, ASSIST.maxTilt);
      const rollT = clamp(Math.atan2(aR, G), -ASSIST.maxTilt, ASSIST.maxTilt);
      const torque = this.attitude(s, pitchT, rollT, stick.yaw * ASSIST.maxYawRate, dt);
      this.altitudeTarget = Math.max(0, this.altitudeTarget + stick.throttle * ASSIST.maxClimb * dt);
      const aUp = this.alt.update(this.altitudeTarget, s.pos[1], dt, s.vel[1]);
      const tilt = Math.max(0.5, Math.cos(e.pitch) * Math.cos(e.roll));
      cmd = { collective: (SUIT.mass * (G + clamp(aUp, -G * 0.9, G * 1.5))) / tilt, torque };
    }
    return mix(cmd);
  }
}

/** World velocity → forward/right components relative to the suit's heading. */
export function headingFrame(vel: V3, yaw: number): { forward: number; right: number } {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  return { forward: vel[0] * sy + vel[2] * cy, right: vel[0] * cy - vel[2] * sy };
}

/**
 * Guidance autopilot for flight-computer mode: fly toward a target point (and altitude),
 * slowing on approach and yawing to face the direction of travel. Returns stick inputs.
 */
export function guide(s: State, target: V3, ctl: Controller, cruise = 10, arriveRadius = 6): Stick {
  const e = euler(s.q);
  const dx = target[0] - s.pos[0];
  const dz = target[2] - s.pos[2];
  const dist = Math.hypot(dx, dz);
  const speed = Math.min(cruise, dist * 0.6) / 14;
  const bearing = Math.atan2(dx, dz);
  const yawErr = wrapPi(bearing - e.yaw);
  const yaw = dist > arriveRadius ? clamp(yawErr * 1.5, -1, 1) : 0;
  // Desired velocity along the bearing, expressed in the heading frame.
  const fwd = Math.cos(yawErr) * speed;
  const right = Math.sin(yawErr) * speed;
  const climbErr = target[1] - ctl.altitudeTarget;
  const throttle = clamp(climbErr / 2, -1, 1);
  return { pitch: clamp(fwd, -1, 1), roll: clamp(right, -1, 1), yaw, throttle };
}

/** Body-frame helper for HUD: velocity in body axes. */
export const bodyVelocity = (s: State): V3 => qRotateInv(s.q, s.vel);
