/**
 * VOLTFORGE physics — Made by Colin Cook.
 *
 * A teaching model of the Tesla Roadster: a longitudinal launch simulation (motors, gearing,
 * tyre grip, load transfer, aero drag, rolling resistance, optional cold-gas thrusters), the
 * battery pack (energy, voltage, current, I²R heat, C-rate), range at steady speed, braking,
 * cornering, and the heliocentric orbit of the 2008 Roadster launched on Falcon Heavy.
 *
 * Honesty: the second-generation Roadster's performance figures are Tesla's *announced* targets
 * (2017 reveal). Mass, drag coefficient, gearing, cell format and pack voltage were never
 * published; the values below are labelled assumptions chosen so the model is self-consistent
 * with the announced numbers. The original Roadster figures are published production specs.
 *
 * Pure: numbers in, numbers out.
 */

export const G0 = 9.80665;
export const RHO_AIR = 1.204; // kg/m³ at 20 °C, sea level
export const MPH = 0.44704; // m/s per mph
export const QUARTER_MILE = 402.336; // m

export type Drive = 'awd' | 'rwd';

export interface Car {
  name: string;
  /** Mass with driver, kg. */
  mass: number;
  /** Tyre–road friction coefficient (peak, longitudinal). */
  mu: number;
  /** Combined peak motor power at the shafts, W. */
  power: number;
  /** Combined peak wheel torque, N·m (motor torque × gear ratio × efficiency, all motors). */
  wheelTorque: number;
  /** Top wheel speed set by motor rpm limit and gearing, m/s. */
  vLimit: number;
  /** Drag coefficient and frontal area (m²). */
  cd: number;
  area: number;
  /** Rolling-resistance coefficient. */
  crr: number;
  /** Tyre rolling radius, m. */
  radius: number;
  drive: Drive;
  /** Static fraction of weight on the rear axle; wheelbase and centre-of-mass height (m). */
  rearWeight: number;
  wheelbase: number;
  cgHeight: number;
  /** Downforce coefficient: F = ½ρ·ClA·v² (m²). */
  clA: number;
  /** Battery: usable energy (Wh), nominal pack voltage (V), pack internal resistance (Ω). */
  packWh: number;
  packV: number;
  packR: number;
  /** Battery-to-wheel efficiency (inverter × motor × gearbox). */
  eta: number;
  /** Cold-gas thruster package: thrust (N), stored gas (kg), exhaust velocity (m/s). */
  thrust: number;
  gasKg: number;
  ve: number;
  /** Auxiliary load (W): cooling, cabin, electronics. */
  aux: number;
}

/** Second-generation Roadster, announced 2017. Performance targets announced; the rest assumed. */
export const ROADSTER_2: Car = {
  name: 'Roadster (announced)',
  mass: 2000,
  mu: 1.48,
  power: 760e3,
  wheelTorque: 10000,
  vLimit: 250 * MPH * 1.03,
  cd: 0.28,
  area: 1.9,
  crr: 0.011,
  radius: 0.36,
  drive: 'awd',
  rearWeight: 0.55,
  wheelbase: 2.6,
  cgHeight: 0.42,
  clA: 0.25,
  packWh: 200e3,
  packV: 800,
  packR: 0.11,
  eta: 0.9,
  thrust: 0,
  gasKg: 0,
  ve: 716,
  aux: 900,
};

/** The optional "SpaceX package": cold-gas thrusters fed from a composite pressure vessel. */
export const SPACEX_PACKAGE: Partial<Car> = { thrust: 22000, gasKg: 32, mass: 2040, name: 'Roadster + SpaceX package (claimed)' };

/** Original Roadster Sport 2.5 (2010–2012): published specs. */
export const ROADSTER_1: Car = {
  name: 'Original Roadster (2008)',
  mass: 1310,
  mu: 1.0,
  power: 215e3,
  wheelTorque: 400 * 8.28 * 0.96,
  vLimit: 125 * MPH,
  cd: 0.35,
  area: 1.71,
  crr: 0.011,
  radius: 0.318,
  drive: 'rwd',
  rearWeight: 0.65,
  wheelbase: 2.35,
  cgHeight: 0.43,
  clA: 0,
  packWh: 53e3,
  packV: 375,
  packR: 0.12,
  eta: 0.88,
  thrust: 0,
  gasKg: 0,
  ve: 716,
  aux: 400,
};

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  car: Car;
}

export const PRESETS: Preset[] = [
  { id: 'gen2', name: 'Roadster', blurb: 'Tesla\'s announced targets: 0–60 mph in 1.9 s, 0–100 in 4.2 s, ¼ mile in 8.8 s, over 250 mph, 620 miles of range. Mass, drag and gearing are assumptions.', car: ROADSTER_2 },
  { id: 'spacex', name: '+ SpaceX package', blurb: 'The claimed option: cold-gas thrusters push the car beyond what tyre grip allows. Claimed 0–60 mph in about 1.1 s.', car: { ...ROADSTER_2, ...SPACEX_PACKAGE } },
  { id: 'street', name: 'Street tyres', blurb: 'The same car on ordinary road tyres (μ ≈ 1.0). The motors are no longer the limit; the rubber is.', car: { ...ROADSTER_2, mu: 1.0, name: 'Roadster on street tyres' } },
  { id: 'gen1', name: 'Original 2008', blurb: 'The first Roadster: a Lotus-based, rear-drive two-seater with 6,831 laptop cells. 0–60 mph in 3.7 s (Sport), 244 miles of range.', car: ROADSTER_1 },
];

/** Aerodynamic drag force, N. */
export const drag = (c: Car, v: number) => 0.5 * RHO_AIR * c.cd * c.area * v * v;
/** Downforce, N. */
export const downforce = (c: Car, v: number) => 0.5 * RHO_AIR * c.clA * v * v;
/** Rolling resistance force, N. */
export const rolling = (c: Car, m = c.mass) => c.crr * m * G0;

/**
 * Maximum tractive force the tyres can transmit at acceleration a (for load transfer), N.
 * AWD: μ × total normal load. RWD: μ × rear-axle load, which grows with acceleration
 * (N_r = m g·w_r + m a h / L).
 */
export function tractionLimit(c: Car, v: number, a: number, m = c.mass): number {
  const N = m * G0 + downforce(c, v);
  if (c.drive === 'awd') return c.mu * N;
  const Nr = N * c.rearWeight + (m * a * c.cgHeight) / c.wheelbase;
  return c.mu * Math.max(0, Math.min(N, Nr));
}

/** What the motors can deliver at the wheels at speed v, N (torque-limited, then power-limited). */
export function motorForce(c: Car, v: number): number {
  if (v >= c.vLimit) return 0;
  const fTorque = c.wheelTorque / c.radius;
  const fPower = (c.power * c.eta) / Math.max(v, 0.1);
  return Math.min(fTorque, fPower);
}

/** Speed at which the motors switch from constant torque to constant power, m/s. */
export const baseSpeed = (c: Car) => (c.power * c.eta * c.radius) / c.wheelTorque;

export interface Sample {
  t: number;
  v: number;
  x: number;
  a: number;
  /** Which limit is binding: grip, torque, power, rpm or none. */
  limit: 'grip' | 'torque' | 'power' | 'rpm';
  wheelForce: number;
  thrust: number;
  gas: number;
  battW: number;
  amps: number;
  heatW: number;
}

export interface RunResult {
  samples: Sample[];
  t60: number | null;
  /** 0–60 with the first foot of travel excluded, as drag strips and magazines time it. */
  t60Rollout: number | null;
  tRollout: number | null;
  t100: number | null;
  tQuarter: number | null;
  trapMph: number | null;
  topSpeed: number;
  peakG: number;
  peakBattW: number;
  peakAmps: number;
  energyWh: number;
}

/**
 * Time-step a full-throttle run from standstill (semi-implicit Euler, dt = 2 ms).
 * Thrusters fire from the start until the gas runs out.
 */
export function launch(c: Car, { tMax = 60, dt = 0.002, every = 0.02 } = {}): RunResult {
  let t = 0;
  let v = 0;
  let x = 0;
  let a = 0;
  let gas = c.gasKg;
  let m = c.mass;
  let energy = 0;
  const out: RunResult = { samples: [], t60: null, t60Rollout: null, tRollout: null, t100: null, tQuarter: null, trapMph: null, topSpeed: 0, peakG: 0, peakBattW: 0, peakAmps: 0, energyWh: 0 };
  let nextSample = 0;
  while (t < tMax) {
    const fm = motorForce(c, v);
    const ft = tractionLimit(c, v, a, m);
    const wheel = Math.min(fm, ft);
    let thrust = 0;
    if (gas > 0 && c.thrust > 0) {
      thrust = c.thrust;
      const mdot = c.thrust / c.ve;
      const used = Math.min(gas, mdot * dt);
      gas -= used;
      m -= used;
    }
    const fNet = wheel + thrust - drag(c, v) - (v > 0.01 ? rolling(c, m) : 0);
    a = Math.max(0, fNet / m);
    const battW = (wheel * v) / c.eta + c.aux;
    const amps = battW / c.packV;
    energy += battW * dt;
    const prevV = v;
    v += a * dt;
    x += v * dt;
    t += dt;
    if (out.tRollout === null && x >= 0.3048) out.tRollout = t;
    if (out.t60 === null && v >= 60 * MPH) out.t60 = t - ((v - 60 * MPH) / Math.max(v - prevV, 1e-9)) * dt;
    if (out.t100 === null && v >= 100 * MPH) out.t100 = t - ((v - 100 * MPH) / Math.max(v - prevV, 1e-9)) * dt;
    if (out.tQuarter === null && x >= QUARTER_MILE) {
      out.tQuarter = t;
      out.trapMph = v / MPH;
    }
    out.peakG = Math.max(out.peakG, a / G0);
    out.peakBattW = Math.max(out.peakBattW, battW);
    out.peakAmps = Math.max(out.peakAmps, amps);
    out.topSpeed = Math.max(out.topSpeed, v);
    if (t >= nextSample) {
      nextSample += every;
      const limit: Sample['limit'] = v >= c.vLimit * 0.999 ? 'rpm' : ft < fm ? 'grip' : v < baseSpeed(c) ? 'torque' : 'power';
      out.samples.push({ t, v, x, a, limit, wheelForce: wheel, thrust, gas, battW, amps, heatW: amps * amps * c.packR });
    }
    if (out.tQuarter !== null && a < 0.02 && t > 5) break;
  }
  out.energyWh = energy / 3600;
  if (out.t60 !== null && out.tRollout !== null) out.t60Rollout = out.t60 - out.tRollout;
  return out;
}

/** Steady top speed: where available power equals drag + rolling, capped by the rpm limit. */
export function topSpeed(c: Car): number {
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const v = (lo + hi) / 2;
    if (motorForce(c, v) > drag(c, v) + rolling(c)) lo = v;
    else hi = v;
  }
  return Math.min(lo, c.vLimit);
}

/** Energy per distance at a steady speed, Wh/km (battery side, including auxiliaries). */
export function consumption(c: Car, v: number): number {
  const fResist = drag(c, v) + rolling(c);
  const whPerKmDrive = (fResist * 1000) / c.eta / 3600;
  const whPerKmAux = (c.aux * (1000 / Math.max(v, 0.5))) / 3600;
  return whPerKmDrive + whPerKmAux;
}

/** Range at a steady speed, km. */
export const range = (c: Car, v: number) => c.packWh / consumption(c, v) * 0.95;

/** Speed that maximises steady-state range (m/s). */
export function bestRangeSpeed(c: Car): number {
  let best = 1;
  let bestR = 0;
  for (let v = 1; v < 60; v += 0.25) {
    const r = range(c, v);
    if (r > bestR) [best, bestR] = [v, r];
  }
  return best;
}

/** Braking from v to rest: distance (m) and time (s) at μ·g, plus reaction distance. */
export function braking(c: Car, v: number, reaction = 1.0) {
  const decel = c.mu * G0 + downforce(c, v) / c.mass * c.mu * 0.5;
  const dist = (v * v) / (2 * decel);
  return { distance: dist, time: v / decel, reaction: v * reaction, total: dist + v * reaction, decelG: decel / G0, kineticJ: 0.5 * c.mass * v * v };
}

/** Energy a regenerative stop can put back in the pack, Wh (round-trip efficiency η²). */
export const regenWh = (c: Car, v: number, regenEta = 0.7) => (0.5 * c.mass * v * v * regenEta) / 3600;

/** Cornering: maximum speed on a radius r at μ·g (plus downforce), m/s. */
export function cornerSpeed(c: Car, r: number): number {
  // m v²/r = μ (m g + ½ρ ClA v²)  →  v² = μ g r / (1 − μ ρ ClA r /(2m))
  const k = 1 - (c.mu * RHO_AIR * c.clA * r) / (2 * c.mass);
  return k <= 0 ? Infinity : Math.sqrt((c.mu * G0 * r) / k);
}

/** Pack electrical figures at a given power draw. */
export function pack(c: Car, watts: number) {
  const amps = watts / c.packV;
  const heat = amps * amps * c.packR;
  return { amps, heat, cRate: watts / c.packWh, efficiency: 1 - heat / Math.max(watts, 1) };
}

/** Cell count for a pack energy and a cell format. */
export const CELLS = {
  '18650': { wh: 11.6, label: '18650 (original Roadster)' },
  '2170': { wh: 17.5, label: '2170' },
  '4680': { wh: 94, label: '4680' },
} as const;
export const cellCount = (packWh: number, format: keyof typeof CELLS) => Math.round(packWh / CELLS[format].wh);

/** Tsiolkovsky: Δv a thruster package can add to the car. */
export const thrusterDeltaV = (c: Car) => c.ve * Math.log(c.mass / Math.max(1, c.mass - c.gasKg));
/** How long the gas lasts at full thrust, s. */
export const burnTime = (c: Car) => (c.thrust > 0 ? (c.gasKg * c.ve) / c.thrust : 0);
/** Specific impulse, s. */
export const isp = (c: Car) => c.ve / G0;

/** Kinetic energy at speed v, J. */
export const kinetic = (c: Car, v: number) => 0.5 * c.mass * v * v;

/* ------------------------------------------------------------------------ orbit */

export const AU = 1.495978707e11;
export const GM_SUN = 1.32712440018e20;
const DAY = 86400;

export interface Orbit {
  name: string;
  a: number; // AU
  e: number;
  /** Longitude of perihelion, degrees. */
  varpi: number;
  /** A perihelion passage, as a Date (UTC). */
  perihelion: Date;
  color: string;
}

/** Approximate two-body elements (heliocentric, ecliptic plane). */
export const ORBITS: Orbit[] = [
  { name: 'Earth', a: 1.00000261, e: 0.01671123, varpi: 102.94, perihelion: new Date(Date.UTC(2018, 0, 3, 6)), color: '#38bdf8' },
  { name: 'Mars', a: 1.52371034, e: 0.0933941, varpi: 336.04, perihelion: new Date(Date.UTC(2018, 8, 16)), color: '#f97316' },
  { name: 'Roadster', a: 1.3254, e: 0.25609, varpi: 134.7, perihelion: new Date(Date.UTC(2018, 1, 4)), color: '#ff2b4e' },
];

export const LAUNCH_DATE = new Date(Date.UTC(2018, 1, 6, 20, 45));

/** Orbital period, days (Kepler's third law). */
export const period = (o: Orbit) => (2 * Math.PI * Math.sqrt((o.a * AU) ** 3 / GM_SUN)) / DAY;

/** Solve Kepler's equation E − e sin E = M (Newton–Raphson). */
export function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Heliocentric position (AU, ecliptic x–y), distance (AU) and speed (km/s) at a date. */
export function positionAt(o: Orbit, date: Date) {
  const T = period(o);
  const days = (date.getTime() - o.perihelion.getTime()) / (DAY * 1000);
  const M = ((2 * Math.PI * days) / T) % (2 * Math.PI);
  const E = eccentricAnomaly(M < 0 ? M + 2 * Math.PI : M, o.e);
  const r = o.a * (1 - o.e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + o.e) * Math.sin(E / 2), Math.sqrt(1 - o.e) * Math.cos(E / 2));
  const lon = nu + (o.varpi * Math.PI) / 180;
  const speed = Math.sqrt(GM_SUN * (2 / (r * AU) - 1 / (o.a * AU))) / 1000;
  return { x: r * Math.cos(lon), y: r * Math.sin(lon), r, nu, speed, M };
}

/** Perihelion and aphelion distances, AU. */
export const apsides = (o: Orbit) => ({ q: o.a * (1 - o.e), Q: o.a * (1 + o.e) });

/** Distance between two bodies at a date, AU. */
export function separation(a: Orbit, b: Orbit, date: Date): number {
  const p = positionAt(a, date);
  const q = positionAt(b, date);
  return Math.hypot(p.x - q.x, p.y - q.y);
}
