/**
 * Vehicle dynamics for the builder. Pure functions — every test the UI runs is computed here
 * and unit tested.
 */
import {
  AERO,
  AIR_DENSITY,
  ARMOUR,
  CHASSIS,
  DEFAULTS,
  ENGINES,
  G,
  MISSION,
  POWERTRAIN,
  TYRES,
  type ArmourId,
  type ChassisId,
  type Drive,
  type EngineId,
  type TyreId,
} from '../config/parts';

export interface Build {
  chassis: ChassisId;
  engine: EngineId;
  armour: ArmourId;
  tyres: TyreId;
  drive: Drive;
  springK: number;
  damping: number;
  travel: number;
  wing: number;
  rideOffset: number;
}

export const DEFAULT_BUILD: Build = {
  chassis: 'interceptor',
  engine: 'v8',
  armour: 'none',
  tyres: 'street',
  drive: 'rwd',
  ...DEFAULTS,
};

export interface Derived {
  mass: number;
  power: number;
  powerToWeight: number;
  cdA: number;
  clA: number;
  mu: number;
  crr: number;
  hCG: number;
  track: number;
  /** Static stability factor: track / (2·h) — lateral g at which the car tips. */
  ssf: number;
  crumple: number;
  protection: number;
}

export function derive(b: Build): Derived {
  const c = CHASSIS[b.chassis];
  const e = ENGINES[b.engine];
  const a = ARMOUR[b.armour];
  const t = TYRES[b.tyres];
  const mass = c.mass + e.mass + a.mass;
  const hCG = c.hCG + b.rideOffset + (a.mass / 1000) * POWERTRAIN.armourCgRise;
  return {
    mass,
    power: e.power,
    powerToWeight: e.power / mass,
    cdA: c.cdA + AERO.wingCdA * b.wing,
    clA: AERO.wingClA * b.wing,
    mu: t.mu,
    crr: t.crr,
    hCG,
    track: c.track,
    ssf: c.track / (2 * hCG),
    crumple: Math.max(0.15, c.crumple - a.stiffness),
    protection: a.rating,
  };
}

/** Suspension travel actually available: the chassis limits how much can be packaged. */
export const effectiveTravel = (b: Build) => Math.min(b.travel, CHASSIS[b.chassis].maxTravel);

const drag = (d: Derived, v: number) => 0.5 * AIR_DENSITY * d.cdA * v * v;
const downforce = (d: Derived, v: number) => 0.5 * AIR_DENSITY * d.clA * v * v;
export const kmh = (v: number) => v * 3.6;
export const ms = (k: number) => k / 3.6;

export interface AccelResult {
  t0to100: number;
  quarterMile: number;
  trapKmh: number;
  /** Speed (m/s) samples every 0.1 s for 15 s. */
  trace: { t: number; v: number }[];
  /** Fraction of the 0–100 run limited by traction (wheelspin) rather than power. */
  tractionLimited: number;
}

/** Straight-line acceleration from rest: min(power, traction) − drag − rolling resistance. */
export function accelerate(b: Build, seconds = 15): AccelResult {
  const d = derive(b);
  const e = ENGINES[b.engine];
  const driven = b.drive === 'awd' ? 1 : POWERTRAIN.rwdFraction;
  const dt = 0.005;
  let v = 0;
  let x = 0;
  let t = 0;
  let t100 = Infinity;
  let tq = Infinity;
  let trap = 0;
  let tractionTime = 0;
  let step = 0;
  const trace: AccelResult['trace'] = [];
  while (t < seconds) {
    const normal = d.mass * G + downforce(d, v);
    const fGrip = d.mu * normal * driven;
    const fPower = (d.power * POWERTRAIN.eta) / Math.max(v, 1);
    const fDrive = v >= e.vLimit ? 0 : Math.min(fGrip, fPower);
    if (fGrip < fPower && v < ms(100)) tractionTime += dt;
    const a = (fDrive - drag(d, v) - d.crr * d.mass * G) / d.mass;
    v = Math.max(0, v + a * dt);
    x += v * dt;
    t += dt;
    if (t100 === Infinity && v >= ms(100)) t100 = t;
    if (tq === Infinity && x >= 402.3) {
      tq = t;
      trap = kmh(v);
    }
    if (++step % 20 === 0) trace.push({ t: Math.round(t * 10) / 10, v });
  }
  return { t0to100: t100, quarterMile: tq, trapKmh: trap, trace, tractionLimited: Number.isFinite(t100) ? tractionTime / t100 : 1 };
}

/** Top speed where wheel power equals drag + rolling resistance (or the gearing limit). */
export function topSpeed(b: Build): { kmh: number; limitedBy: 'drag' | 'gearing' } {
  const d = derive(b);
  const e = ENGINES[b.engine];
  const need = (v: number) => (drag(d, v) + d.crr * d.mass * G) * v;
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) < d.power * POWERTRAIN.eta) lo = mid;
    else hi = mid;
  }
  return lo > e.vLimit ? { kmh: kmh(e.vLimit), limitedBy: 'gearing' } : { kmh: kmh(lo), limitedBy: 'drag' };
}

/** Braking distance from a speed to rest (m), with drag and downforce helping. */
export function brakingDistance(b: Build, fromKmh = 100): number {
  const d = derive(b);
  let v = ms(fromKmh);
  let x = 0;
  const dt = 0.002;
  while (v > 0) {
    const normal = d.mass * G + downforce(d, v);
    const fBrake = d.mu * normal * POWERTRAIN.brakeEfficiency;
    const a = (fBrake + drag(d, v) + d.crr * d.mass * G) / d.mass;
    v -= a * dt;
    x += Math.max(0, v) * dt;
  }
  return x;
}

export interface CornerResult {
  /** Maximum speed on the radius before sliding (grip) or tipping (rollover), km/h. */
  gripKmh: number;
  rolloverKmh: number;
  maxKmh: number;
  limitedBy: 'grip' | 'rollover';
  /** Lateral acceleration at the limit (g). */
  lateralG: number;
}

/**
 * Steady cornering on radius R: grip limit μ(mg + downforce) = m v²/R; rollover when lateral
 * acceleration exceeds the static stability factor (track / 2h) in g.
 */
export function corner(b: Build, radius: number): CornerResult {
  const d = derive(b);
  // Solve m v²/R = μ (m g + ½ρ ClA v²)  →  v² = μ g / (1/R − μ ½ρ ClA / m)
  const k = (d.mu * 0.5 * AIR_DENSITY * d.clA) / d.mass;
  const denom = 1 / radius - k;
  const vGrip = denom > 0 ? Math.sqrt((d.mu * G) / denom) : 200;
  const vRoll = Math.sqrt(d.ssf * G * radius);
  const limitedBy = vRoll < vGrip ? 'rollover' : 'grip';
  const v = Math.min(vGrip, vRoll);
  return { gripKmh: kmh(vGrip), rolloverKmh: kmh(vRoll), maxKmh: kmh(v), limitedBy, lateralG: (v * v) / radius / G };
}

export interface JumpResult {
  range: number;
  clears: boolean;
  /** Vertical landing speed (m/s). */
  vz: number;
  /** Peak deceleration felt by occupants (g). */
  occupantG: number;
  bottomedOut: boolean;
  /** Fraction of the landing energy the suspension could absorb. */
  absorbed: number;
  flightTime: number;
}

/**
 * Ballistic jump off a ramp at angle θ: range = v² sin 2θ / g (same take-off and landing height).
 * Landing: each wheel's share of ½ m v_z² must be absorbed by spring + damper over the travel.
 */
export function jump(b: Build, approachKmh: number, angleDeg: number, gap: number): JumpResult {
  const d = derive(b);
  const travel = effectiveTravel(b);
  const v = ms(approachKmh);
  const th = (angleDeg * Math.PI) / 180;
  const range = (v * v * Math.sin(2 * th)) / G;
  const vz = v * Math.sin(th);
  const flightTime = (2 * v * Math.sin(th)) / G;
  const energyPerWheel = 0.25 * 0.5 * d.mass * vz * vz;
  const capacity = 0.5 * b.springK * travel * travel * (1 + 2.5 * b.damping);
  const bottomedOut = energyPerWheel > capacity;
  // Stopping distance for the vertical speed: suspension travel, or only the tyre/chassis flex if bottomed out.
  const stroke = bottomedOut ? travel * Math.sqrt(capacity / energyPerWheel) * 0.5 + 0.04 : travel * Math.min(1, Math.sqrt(energyPerWheel / capacity)) + 0.03;
  const occupantG = (vz * vz) / (2 * Math.max(0.03, stroke)) / G + 1;
  return { range, clears: range >= gap, vz, occupantG, bottomedOut, absorbed: Math.min(1, capacity / energyPerWheel), flightTime };
}

/** Frontal barrier crash: occupant deceleration from crumple zone + restraint ride-down. */
export function crash(b: Build, kmhSpeed: number): { occupantG: number; crumple: number; energyKJ: number } {
  const d = derive(b);
  const v = ms(kmhSpeed);
  const stroke = d.crumple + POWERTRAIN.restraint;
  return { occupantG: (v * v) / (2 * stroke) / G, crumple: d.crumple, energyKJ: (0.5 * d.mass * v * v) / 1000 };
}

/** Range at a steady cruise (km). */
export function range(b: Build, cruiseKmh: number): number {
  const d = derive(b);
  const e = ENGINES[b.engine];
  const v = ms(cruiseKmh);
  const force = drag(d, v) + d.crr * d.mass * G;
  const usable = e.energy * e.efficiency * POWERTRAIN.eta;
  return usable / force / 1000;
}

export interface TestSuite {
  accel: AccelResult;
  top: ReturnType<typeof topSpeed>;
  brake: number;
  hairpin: CornerResult;
  jump: JumpResult;
  crash: ReturnType<typeof crash>;
  rangeKm: number;
  derived: Derived;
}

export function runAll(b: Build): TestSuite {
  return {
    accel: accelerate(b),
    top: topSpeed(b),
    brake: brakingDistance(b, 100),
    hairpin: corner(b, MISSION.hairpinRadius),
    jump: jump(b, MISSION.jumpApproachKmh, MISSION.jumpAngleDeg, MISSION.jumpGap),
    crash: crash(b, MISSION.crashKmh),
    rangeKm: range(b, MISSION.cruiseKmh),
    derived: derive(b),
  };
}
