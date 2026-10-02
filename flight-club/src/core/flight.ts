/**
 * Rigid-body flight of a four-thruster suit (two boots, two palms). Pure and unit tested.
 * Body frame: x right, y up, z forward. Euler conventions in math.ts: positive pitch = lean
 * forward (nose down), positive roll = lean right.
 */
import { ENERGY, G, PILOT, PROPULSION, RHO, SUIT, type EnergyId } from '../config/suit';
import { add, clamp, cross, len, qIntegrate, qRotate, qRotateInv, scale, sub, v, type Q, type V3 } from './math';

export interface Thrusters {
  bootL: number;
  bootR: number;
  /** Boot gimbal (rad) about body x; positive tilts the jets toward +z (forward). */
  bootGimbal: number;
  palmL: number;
  palmR: number;
  palmGimbalL: number;
  palmGimbalR: number;
}

export const IDLE: Thrusters = { bootL: 0, bootR: 0, bootGimbal: 0, palmL: 0, palmR: 0, palmGimbalL: 0, palmGimbalR: 0 };

export const MAX_THRUST = 2 * SUIT.bootMax + 2 * SUIT.palmMax;
export const WEIGHT = SUIT.mass * G;

/** Desired collective thrust (N, along body up) and body torque (N·m: x pitch, y yaw, z roll). */
export interface Command {
  collective: number;
  torque: V3;
}

/** Allocate a command to the four thrusters with gimbal and thrust saturation. */
export function mix(cmd: Command): Thrusters {
  const T = clamp(cmd.collective, 0, MAX_THRUST);
  const B = T * SUIT.bootShare;
  const P = T - B;
  const [tx, ty, tz] = cmd.torque;
  // Roll: differential thrust, mostly palms (long lever arm).
  const dPalm = (0.8 * tz) / SUIT.palmOffsetX;
  const dBoot = (0.2 * tz) / SUIT.bootOffsetX;
  // Pitch: boot gimbal. τx = −B·sinβ·|y| → β = asin(−τx / (B·|y|)).
  const bootGimbal = B > 1 ? clamp(Math.asin(clamp(-tx / (B * Math.abs(SUIT.bootOffsetY)), -1, 1)), -SUIT.bootGimbal, SUIT.bootGimbal) : 0;
  // Yaw: palms gimbal in opposite directions. τy = x·P·sinγ.
  const g = P > 1 ? clamp(Math.asin(clamp(ty / (P * SUIT.palmOffsetX), -1, 1)), -SUIT.palmGimbal, SUIT.palmGimbal) : 0;
  const sat = (f: number, max: number) => clamp(f, 0, max);
  return {
    bootL: sat(B / 2 - dBoot / 2, SUIT.bootMax),
    bootR: sat(B / 2 + dBoot / 2, SUIT.bootMax),
    bootGimbal,
    palmL: sat(P / 2 - dPalm / 2, SUIT.palmMax),
    palmR: sat(P / 2 + dPalm / 2, SUIT.palmMax),
    palmGimbalL: g,
    palmGimbalR: -g,
  };
}

interface Jet {
  f: number;
  gimbal: number;
  pos: V3;
}

const jets = (t: Thrusters): Jet[] => [
  { f: t.bootL, gimbal: t.bootGimbal, pos: [-SUIT.bootOffsetX, SUIT.bootOffsetY, 0] },
  { f: t.bootR, gimbal: t.bootGimbal, pos: [SUIT.bootOffsetX, SUIT.bootOffsetY, 0] },
  { f: t.palmL, gimbal: t.palmGimbalL, pos: [-SUIT.palmOffsetX, SUIT.palmOffsetY, 0] },
  { f: t.palmR, gimbal: t.palmGimbalR, pos: [SUIT.palmOffsetX, SUIT.palmOffsetY, 0] },
];

/** Net body-frame force and torque from the thrusters. */
export function wrench(t: Thrusters): { force: V3; torque: V3 } {
  let force: V3 = v();
  let torque: V3 = v();
  for (const j of jets(t)) {
    const F: V3 = [0, j.f * Math.cos(j.gimbal), j.f * Math.sin(j.gimbal)];
    force = add(force, F);
    torque = add(torque, cross(j.pos, F));
  }
  return { force, torque };
}

export const totalThrust = (t: Thrusters) => t.bootL + t.bootR + t.palmL + t.palmR;

/** Electrical power (W) for a thrust with ideal momentum theory over the fan disk. */
export function fanPower(thrustN: number, diskArea: number): number {
  if (thrustN <= 0) return 0;
  return Math.pow(thrustN, 1.5) / Math.sqrt(2 * RHO * diskArea);
}

/** Power or fuel flow for the current thrusters. */
export function energyRate(t: Thrusters, source: EnergyId): { fuelKgPerS: number; watts: number } {
  if (source === 'turbine') return { fuelKgPerS: (PROPULSION.tsfc * totalThrust(t)) / 3600, watts: 0 };
  if (source === 'electric') {
    const a = PROPULSION.fanArea / 4;
    const w = [t.bootL, t.bootR, t.palmL, t.palmR].reduce((s, f) => s + fanPower(f, a), 0) / PROPULSION.fanEfficiency;
    return { fuelKgPerS: 0, watts: w };
  }
  return { fuelKgPerS: 0, watts: 0 };
}

/** Hover endurance (s) for a source at thrust = weight. */
export function hoverEndurance(source: EnergyId): number {
  const t = mix({ collective: WEIGHT, torque: v() });
  const r = energyRate(t, source);
  const e = ENERGY[source];
  if (!Number.isFinite(e.capacity)) return Infinity;
  return e.unit === 'kg' ? e.capacity / r.fuelKgPerS : e.capacity / r.watts;
}

export type Terrain = (x: number, z: number) => number;
export const flat: Terrain = () => 0;

export interface State {
  t: number;
  pos: V3;
  vel: V3;
  q: Q;
  /** Body angular velocity (rad/s). */
  w: V3;
  /** Remaining energy (kg fuel or J). */
  energy: number;
  energyUsed: number;
  landed: boolean;
  crashed: boolean;
  touchdownSpeed: number;
  /** Head-to-foot load on the pilot (g) and G-LOC stress dose. */
  gLoad: number;
  maxG: number;
  gDose: number;
  gloc: boolean;
  glocTimer: number;
  thrusters: Thrusters;
}

export function initialState(source: EnergyId, pos: V3 = v(), yaw = 0): State {
  return {
    t: 0,
    pos,
    vel: v(),
    q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    w: v(),
    energy: ENERGY[source].capacity,
    energyUsed: 0,
    landed: true,
    crashed: false,
    touchdownSpeed: 0,
    gLoad: 1,
    maxG: 1,
    gDose: 0,
    gloc: false,
    glocTimer: 0,
    thrusters: IDLE,
  };
}

export interface StepOptions {
  source: EnergyId;
  wind: V3;
  terrain: Terrain;
}

/** Advance the suit by dt (semi-implicit Euler, quaternion attitude). */
export function step(s0: State, thr: Thrusters, dt: number, o: StepOptions): State {
  const s: State = { ...s0, t: s0.t + dt };
  if (s.crashed) return s;
  // Out of energy → no thrust. G-LOC → the pilot's hands go limp (thrust holds, no control).
  let th = s.energy > 0 ? thr : IDLE;
  if (s.gloc) th = { ...thr, bootGimbal: 0, palmGimbalL: 0, palmGimbalR: 0, bootR: thr.bootL, palmR: thr.palmL };
  s.thrusters = th;

  const ground = o.terrain(s.pos[0], s.pos[2]);
  const height = s.pos[1] - ground;
  const { force, torque } = wrench(th);
  const ge = 1 + SUIT.groundEffect * Math.exp(-Math.max(0, height) / SUIT.groundEffectHeight);
  let F = scale(qRotate(s.q, force), ge);
  const vRel = sub(s.vel, o.wind);
  F = add(F, scale(vRel, -0.5 * RHO * SUIT.cdA * len(vRel)));
  F = add(F, [0, -WEIGHT, 0]);
  const acc = scale(F, 1 / SUIT.mass);

  // Pilot load: specific force (what the body feels) along the body's head axis.
  const specific = qRotateInv(s.q, add(acc, [0, G, 0]));
  s.gLoad = specific[1] / G;
  s.maxG = Math.max(s.maxG, Math.abs(s.gLoad));
  if (s.gLoad > PILOT.greyout) s.gDose += (s.gLoad - PILOT.greyout) * dt;
  else s.gDose = Math.max(0, s.gDose - PILOT.recovery * dt);
  if (!s.gloc && s.gDose > PILOT.glocDose) {
    s.gloc = true;
    s.glocTimer = 4;
  }
  if (s.gloc) {
    s.glocTimer -= dt;
    if (s.glocTimer <= 0) {
      s.gloc = false;
      s.gDose = 0;
    }
  }

  // Energy
  const r = energyRate(th, o.source);
  const use = r.fuelKgPerS > 0 ? r.fuelKgPerS * dt : r.watts * dt;
  if (Number.isFinite(s.energy)) s.energy = Math.max(0, s.energy - use);
  s.energyUsed += use;

  // Translation
  let vel = add(s.vel, scale(acc, dt));
  let pos = add(s.pos, scale(vel, dt));

  // Rotation: ω̇ = I⁻¹ (τ − c·ω − ω × Iω)
  const I = SUIT.inertia;
  const Iw: V3 = [I[0] * s.w[0], I[1] * s.w[1], I[2] * s.w[2]];
  const gyro = cross(s.w, Iw);
  const damp: V3 = [SUIT.angularDamping[0] * s.w[0], SUIT.angularDamping[1] * s.w[1], SUIT.angularDamping[2] * s.w[2]];
  const net = sub(sub(torque, damp), gyro);
  let w: V3 = [s.w[0] + (net[0] / I[0]) * dt, s.w[1] + (net[1] / I[1]) * dt, s.w[2] + (net[2] / I[2]) * dt];
  let q = qIntegrate(s.q, w, dt);

  // Ground contact
  const gNew = o.terrain(pos[0], pos[2]);
  if (pos[1] <= gNew) {
    const up = qRotate(q, [0, 1, 0]);
    const impact = -vel[1];
    if (!s.landed) {
      s.touchdownSpeed = impact;
      if (impact > SUIT.crashSpeed || up[1] < Math.cos((40 * Math.PI) / 180)) s.crashed = true;
    }
    s.landed = true;
    pos = [pos[0], gNew, pos[2]];
    vel = [vel[0] * 0.5, Math.max(0, vel[1]), vel[2] * 0.5];
    // Standing on the ground levels the suit.
    w = scale(w, 0.5);
    const lift = qRotate(q, [0, 1, 0]);
    if (lift[1] < 0.999) {
      const yaw = Math.atan2(qRotate(q, [0, 0, 1])[0], qRotate(q, [0, 0, 1])[2]);
      q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    }
  } else if (pos[1] > gNew + 0.05) s.landed = false;

  return { ...s, pos, vel, w, q };
}
