/**
 * The reveal stunt (15 October 2026), as a physics model.
 *
 * As reported: the Roadster drove up a ramp that curled over until the car was upside down, held
 * on by its fan suction system, left the end of the ramp inverted, rolled 180° in mid-air on its
 * compressed-air thrusters, and came down on its wheels; separately it jumped over five other
 * Teslas. Tesla did not publish the ramp's size, the speeds or the thrust profile, so this module
 * rebuilds the manoeuvre from first principles with every assumed input exposed as a parameter.
 *
 * The geometry is an Immelmann turn: half a loop (radius R) up to the top, where the car is
 * inverted and travelling back the way it came, then a half-roll about its long axis while it
 * falls, then a thruster-cushioned landing.
 *
 * Pure: numbers in, numbers out.
 */
import { exhaustVelocity, G0, motorForce, RHO_AIR, tankAirKg, tankPressure, type Car } from './physics';

export interface StuntParams {
  /** Radius of the curling ramp, m. The car is inverted at height 2R. */
  radius: number;
  /** Speed the car holds into the ramp, m/s. */
  entrySpeed: number;
  /** Speed the control system eases to at the inverted top, m/s. */
  topTarget: number;
  /** Run-up length before the ramp, m. */
  runUp: number;
  /** Fan suction force, N (holds the car to the ramp). */
  suction: number;
  /** Roll thrusters: force per thruster (N) and lever arm from the roll axis (m); two fire as a couple. */
  rollThrust: number;
  rollArm: number;
  /** Vertical (landing) thrust available once the car is upright, N. */
  liftThrust: number;
  /** Target touchdown sink rate, m/s. */
  touchdown: number;
  /** Suspension travel available at landing, m. */
  stroke: number;
}

export const STUNT_DEFAULTS: StuntParams = {
  radius: 6,
  entrySpeed: 14,
  topTarget: 5.5,
  runUp: 70,
  suction: 9000,
  rollThrust: 9000,
  rollArm: 0.85,
  liftThrust: 34000,
  touchdown: 1.5,
  stroke: 0.16,
};

export type Phase = 'runup' | 'ramp' | 'flight' | 'landing' | 'done';

export interface StuntSample {
  t: number;
  phase: Phase;
  /** Position: x along the runway, y up (m). */
  x: number;
  y: number;
  /** Pitch: the car's nose angle in the vertical plane (rad); π at the top of the ramp. */
  pitch: number;
  /** Roll about the long axis (rad), 0 → π during the flip. */
  roll: number;
  speed: number;
  vx: number;
  vy: number;
  /** Load the occupants feel along their own head-to-seat axis, in g. */
  gSeat: number;
  /** Ramp contact force (N); negative would mean the car falls off. */
  normal: number;
  /** Thrusters firing (N): rear, roll couple, lift. */
  thrustRear: number;
  thrustRoll: number;
  thrustLift: number;
  airKg: number;
  tankBar: number;
}

export interface StuntResult {
  samples: StuntSample[];
  ok: boolean;
  /** Minimum ramp contact force on the curl (N) and where it happened (θ, rad). */
  minNormal: number;
  minNormalAt: number;
  /** Speed at the top, inverted (m/s), and the loop-the-loop speed √(gR) needed without suction. */
  topSpeed: number;
  speedNoSuction: number;
  /** Peak g on the ramp and at touchdown. */
  peakRampG: number;
  landingG: number;
  /** Free-fall time from the top without thrust, and the time actually airborne (s). */
  freeFall: number;
  airborne: number;
  /** Roll: time taken (s), peak rate (rad/s), torque (N·m), roll inertia (kg·m²). */
  rollTime: number;
  rollRate: number;
  rollTorque: number;
  rollInertia: number;
  /** Sink rate at touchdown with and without the landing burn (m/s). */
  touchdownSpeed: number;
  impactNoThrust: number;
  /** Air used in the stunt (kg) and tank pressure left (bar). */
  airUsed: number;
  barLeft: number;
  /** Energy book-keeping at the top of the ramp (J). */
  energy: { kineticEntry: number; potentialTop: number; kineticTop: number; motorWork: number };
  /** Horizontal distance from release to touchdown (m). */
  landingX: number;
  /** Where the car came off the ramp if it fell (rad), else null. */
  fellAt: number | null;
}

/** Roll moment of inertia of the car as a uniform box about its long axis. */
export const rollInertia = (m: number, width = 1.95, height = 1.15) => (m * (width * width + height * height)) / 12;

/**
 * Run the stunt. Semi-implicit Euler at 1 ms, sampled every 10 ms.
 */
export function simulateStunt(car: Car, p: StuntParams = STUNT_DEFAULTS): StuntResult {
  const dt = 0.001;
  const every = 0.01;
  const tankCar = car.tankL > 0 ? car : { ...car, tankL: 600, tankBar: 300 };
  let air = tankAirKg(tankCar);
  const air0 = air;
  let m = car.mass;
  const out: StuntSample[] = [];
  let t = 0;
  let next = 0;
  const R = p.radius;
  const dragK = 0.5 * RHO_AIR * car.cd * car.area;
  const useAir = (force: number) => {
    const bar = tankPressure(tankCar, air);
    const ve = exhaustVelocity(Math.max(bar, 1.1));
    const used = ve > 0 ? (force / ve) * dt : 0;
    air = Math.max(0, air - used);
    m -= used;
  };
  const push = (s: Omit<StuntSample, 't' | 'airKg' | 'tankBar'>, force = false) => {
    if (t >= next || force) {
      next += every;
      out.push({ ...s, t, airKg: air, tankBar: tankPressure(tankCar, air) });
    }
  };

  // ── Run-up: accelerate on the flat to the entry speed, then hold it. ──
  let x = -p.runUp;
  let v = 0;
  let motorWork = 0;
  while (x < 0) {
    const traction = car.mu * (m * G0 * car.rearWeight + p.suction * car.rearWeight);
    const want = v < p.entrySpeed ? Math.min(motorForce(car, v), traction) : dragK * v * v + car.crr * m * G0;
    const a = (want - dragK * v * v - car.crr * m * G0) / m;
    v = Math.min(p.entrySpeed, v + a * dt);
    x += v * dt;
    motorWork += want * v * dt;
    t += dt;
    push({ phase: 'runup', x, y: 0, pitch: 0, roll: 0, speed: v, vx: v, vy: 0, gSeat: 1, normal: m * G0 + p.suction, thrustRear: 0, thrustRoll: 0, thrustLift: 0 });
  }
  const kineticEntry = 0.5 * m * v * v;

  // ── The curl: half a loop. θ from 0 (bottom) to π (top, inverted). ──
  // Along the track: m dv/dt = F_drive − m g sin θ − drag.
  // Into the track:  N = m v²/R + m g cos θ + F_suction   (must stay > 0).
  let th = 0;
  let minN = Infinity;
  let minNAt = 0;
  let peakRampG = 1;
  while (th < Math.PI) {
    const N = (m * v * v) / R + m * G0 * Math.cos(th) + p.suction;
    if (N < minN) {
      minN = N;
      minNAt = th;
    }
    const grip = car.mu * Math.max(0, N) * car.rearWeight;
    // Speed plan: ease from the entry speed to the inverted top speed; motors push or regen-brake.
    const vPlan = p.entrySpeed + (p.topTarget - p.entrySpeed) * (th / Math.PI);
    const want = m * G0 * Math.sin(th) + dragK * v * v + (m * (vPlan - v)) / 0.15;
    const drive = Math.max(-grip, Math.min(motorForce(car, v), grip, want));
    const a = (drive - m * G0 * Math.sin(th) - dragK * v * v) / m;
    v = Math.max(0.5, v + a * dt);
    th += (v * dt) / R;
    motorWork += drive * v * dt;
    t += dt;
    if (N <= 0) break; // fell off the ramp
    // Felt load: (v²/R + g cos θ) pressing the occupants into their seats.
    const gSeat = (v * v / R + G0 * Math.cos(th)) / G0;
    peakRampG = Math.max(peakRampG, gSeat);
    push({ phase: 'ramp', x: R * Math.sin(th), y: R - R * Math.cos(th), pitch: th, roll: 0, speed: v, vx: v * Math.cos(th), vy: v * Math.sin(th), gSeat, normal: N, thrustRear: 0, thrustRoll: 0, thrustLift: 0 });
  }
  const topSpeed = v;

  // ── Flight: released inverted at (0, 2R) moving −x. Half-roll, then a landing burn. ──
  // If the car lost contact before the top, it flies off from wherever it was, unaided.
  const fell = th < Math.PI;
  const thR = Math.min(th, Math.PI);
  let px = R * Math.sin(thR);
  let py = R - R * Math.cos(thR);
  let vx = v * Math.cos(thR);
  let vy = v * Math.sin(thR);
  let roll = 0;
  let rollRate = 0;
  const I = rollInertia(m);
  const tau = 2 * p.rollThrust * p.rollArm;
  const alpha = tau / I;
  let rollPeak = 0;
  const tRelease = t;
  let rollDone = -1;
  let burning = false;
  const freeFall = Math.sqrt((2 * py) / G0);
  while (py > 0) {
    // Bang-bang roll: accelerate for the first half of the angle, brake for the second.
    let fRoll = 0;
    if (!fell && roll < Math.PI) {
      const stop = (rollRate * rollRate) / (2 * alpha);
      if (roll + stop < Math.PI) {
        rollRate += alpha * dt;
        fRoll = p.rollThrust;
      } else {
        rollRate = Math.max(0.05, rollRate - alpha * dt);
        fRoll = -p.rollThrust;
      }
      roll = Math.min(Math.PI, roll + rollRate * dt);
      rollPeak = Math.max(rollPeak, rollRate);
      useAir(2 * p.rollThrust);
      if (roll >= Math.PI) {
        rollDone = t - tRelease;
        rollRate = 0;
      }
    }
    // Landing burn: once upright, fire when the remaining height just suffices to slow to the touchdown rate.
    let fLift = 0;
    if (!fell && roll >= Math.PI) {
      const aNet = p.liftThrust / m - G0;
      const need = (vy * vy - p.touchdown * p.touchdown) / (2 * Math.max(aNet, 0.1));
      if (vy < -p.touchdown && (burning || py <= need)) {
        burning = true;
        fLift = p.liftThrust;
        useAir(fLift);
      }
    }
    const ay = (fLift / m) - G0;
    vy += ay * dt;
    vx -= (Math.sign(vx) * dragK * vx * vx / m) * dt;
    px += vx * dt;
    py += vy * dt;
    t += dt;
    push({ phase: 'flight', x: px, y: Math.max(0, py), pitch: thR, roll, speed: Math.hypot(vx, vy), vx, vy, gSeat: fLift / m / G0, normal: 0, thrustRear: 0, thrustRoll: fRoll, thrustLift: fLift });
  }
  const airborne = t - tRelease;
  const touchdownSpeed = -vy;
  // ── Landing: the suspension absorbs the sink rate over its stroke. ──
  const landingG = (touchdownSpeed * touchdownSpeed) / (2 * p.stroke) / G0 + 1;
  const tLand = t;
  while (t < tLand + 1.6) {
    vx *= 1 - dt * 1.4;
    px += vx * dt;
    t += dt;
    const k = Math.min(1, (t - tLand) / 0.25);
    push({ phase: t - tLand < 0.25 ? 'landing' : 'done', x: px, y: -Math.sin(k * Math.PI) * Math.min(p.stroke, 0.03 + touchdownSpeed * 0.04), pitch: thR, roll: fell ? 0 : Math.PI, speed: Math.abs(vx), vx, vy: 0, gSeat: t - tLand < 0.25 ? landingG : 1, normal: m * G0, thrustRear: 0, thrustRoll: 0, thrustLift: 0 });
  }
  push({ phase: 'done', x: px, y: 0, pitch: thR, roll: fell ? 0 : Math.PI, speed: Math.abs(vx), vx, vy: 0, gSeat: 1, normal: m * G0, thrustRear: 0, thrustRoll: 0, thrustLift: 0 }, true);

  return {
    samples: out,
    ok: !fell && minN > 0 && rollDone > 0 && touchdownSpeed < 4,
    minNormal: minN,
    minNormalAt: minNAt,
    topSpeed,
    speedNoSuction: Math.sqrt(G0 * R),
    peakRampG,
    landingG,
    freeFall,
    airborne,
    rollTime: rollDone,
    rollRate: rollPeak,
    rollTorque: tau,
    rollInertia: I,
    touchdownSpeed,
    impactNoThrust: Math.sqrt(2 * G0 * 2 * R),
    airUsed: air0 - air,
    barLeft: tankPressure(tankCar, air),
    energy: { kineticEntry, potentialTop: car.mass * G0 * 2 * R, kineticTop: 0.5 * car.mass * topSpeed * topSpeed, motorWork },
    landingX: px,
    fellAt: fell ? th : null,
  };
}

/** Suction needed to stay on the ramp at angle θ moving at v: F ≥ −(m v²/R + m g cos θ). */
export const suctionNeeded = (m: number, v: number, R: number, theta: number) => Math.max(0, -(m * v * v / R + m * G0 * Math.cos(theta)));

/** Entry speed needed to reach the top of a frictionless half-loop at speed vTop: v₀² = vTop² + 4gR. */
export const entrySpeedFor = (vTop: number, R: number) => Math.sqrt(vTop * vTop + 4 * G0 * R);

/**
 * The jump over five cars: a thruster-assisted hop. Upward impulse J lifts the car to apex h:
 * v_y = J/m, h = v_y²/(2g); time aloft 2v_y/g; distance = v_x · time.
 */
export function carJump(m: number, apex: number, vx: number) {
  const vy = Math.sqrt(2 * G0 * apex);
  const tAir = (2 * vy) / G0;
  return { vy, tAir, distance: vx * tAir, impulse: m * vy };
}
