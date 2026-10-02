/**
 * Every part, physical constant and mission requirement. SI units (kg, m, s, W) unless noted.
 * Values are rounded, textbook-level figures for teaching — not engineering data.
 */

export const G = 9.81;
export const AIR_DENSITY = 1.225;

export type ChassisId = 'interceptor' | 'tumbler' | 'tank';
export type EngineId = 'v8' | 'v12tt' | 'electric' | 'turbine';
export type ArmourId = 'none' | 'composite' | 'ceramic' | 'steel';
export type TyreId = 'street' | 'allterrain' | 'runflat';
export type Drive = 'rwd' | 'awd';

export interface Chassis {
  name: string;
  /** Bare chassis + body + occupant mass (kg). */
  mass: number;
  /** Track width (m) — distance between left and right wheels. */
  track: number;
  wheelbase: number;
  /** Drag area Cd·A (m²). */
  cdA: number;
  /** Centre-of-gravity height at default ride height (m). */
  hCG: number;
  /** Front crumple-zone length (m). */
  crumple: number;
  wheelRadius: number;
  /** Maximum suspension travel the chassis can package (m). */
  maxTravel: number;
  info: string;
}

export const CHASSIS: Record<ChassisId, Chassis> = {
  interceptor: { name: 'Street interceptor', mass: 1500, track: 1.9, wheelbase: 2.9, cdA: 0.72, hCG: 0.48, crumple: 0.75, wheelRadius: 0.36, maxTravel: 0.15, info: 'Low, long and slippery: a supercar layout. Great on roads, fragile off them.' },
  tumbler: { name: 'Off-road "tumbler"', mass: 2300, track: 2.4, wheelbase: 3.0, cdA: 1.25, hCG: 0.72, crumple: 0.6, wheelRadius: 0.55, maxTravel: 0.5, info: 'Wide track, huge wheels, long-travel suspension. Built to jump and land.' },
  tank: { name: 'Urban tank', mass: 3300, track: 2.5, wheelbase: 3.4, cdA: 1.8, hCG: 1.15, crumple: 0.45, wheelRadius: 0.5, maxTravel: 0.3, info: 'A fortress on wheels. Heavy, tall and slow to turn.' },
};

export interface Engine {
  name: string;
  /** Peak power at the wheels' input (W). */
  power: number;
  /** Powertrain mass including fuel or battery (kg). */
  mass: number;
  /** Usable onboard energy (J) and tank-to-wheel efficiency. */
  energy: number;
  efficiency: number;
  /** Top speed limited by gearing / motor rpm (m/s). */
  vLimit: number;
  real: string;
}

export const ENGINES: Record<EngineId, Engine> = {
  v8: { name: '6.2 L V8', power: 480e3, mass: 280, energy: 80 * 34.2e6, efficiency: 0.28, vLimit: 90, real: 'Shipping: large-displacement V8s make ~480 kW in production supercars.' },
  v12tt: { name: 'Twin-turbo V12', power: 620e3, mass: 360, energy: 90 * 34.2e6, efficiency: 0.3, vLimit: 95, real: 'Shipping: hypercar V12s reach 600+ kW.' },
  electric: { name: 'Quad electric motors + 120 kWh battery', power: 750e3, mass: 820, energy: 120 * 3.6e6, efficiency: 0.88, vLimit: 85, real: 'Shipping: four-motor EVs exceed 700 kW. Instant torque, but the battery is heavy.' },
  turbine: { name: 'Gas turbine (jet-assist)', power: 900e3, mass: 420, energy: 150 * 34.2e6, efficiency: 0.17, vLimit: 110, real: 'Real but rare: turbine cars were built in the 1960s; turbines are powerful and very thirsty.' },
};

export interface Armour {
  name: string;
  mass: number;
  /** Protection rating 0–5 against debris and impacts. */
  rating: number;
  /** Crumple length lost because the stiff armour does not crush (m). */
  stiffness: number;
  info: string;
}

export const ARMOUR: Record<ArmourId, Armour> = {
  none: { name: 'No armour', mass: 0, rating: 0, stiffness: 0, info: 'Light and fast. Protection comes only from the body shell.' },
  composite: { name: 'Composite panels (aramid / UHMWPE)', mass: 260, rating: 3, stiffness: 0.05, info: 'High protection per kilogram; expensive.' },
  ceramic: { name: 'Ceramic + composite', mass: 480, rating: 5, stiffness: 0.12, info: 'Best protection, very stiff, heavy.' },
  steel: { name: 'Steel plate', mass: 950, rating: 4, stiffness: 0.25, info: 'Cheap and strong, but enormously heavy and stiff.' },
};

export interface Tyre {
  name: string;
  /** Peak friction coefficient on dry tarmac. */
  mu: number;
  /** Rolling-resistance coefficient. */
  crr: number;
  info: string;
}

export const TYRES: Record<TyreId, Tyre> = {
  street: { name: 'Sticky street tyres', mu: 1.08, crr: 0.011, info: 'Most grip on tarmac, lowest rolling resistance.' },
  allterrain: { name: 'All-terrain', mu: 0.88, crr: 0.016, info: 'Less tarmac grip; tough sidewalls for landings.' },
  runflat: { name: 'Run-flat', mu: 0.98, crr: 0.014, info: 'Keeps going after a puncture; slightly less grip.' },
};

export const DEFAULTS = {
  /** Suspension: spring rate per wheel (N/m), damping ratio, travel (m). */
  springK: 60e3,
  damping: 0.4,
  travel: 0.2,
  /** Rear wing 0–1. */
  wing: 0.3,
  /** Ride-height offset from the chassis default (m). */
  rideOffset: 0,
};

export const LIMITS = {
  springK: [20e3, 200e3] as [number, number],
  damping: [0.1, 1.0] as [number, number],
  travel: [0.08, 0.5] as [number, number],
  wing: [0, 1] as [number, number],
  rideOffset: [-0.08, 0.2] as [number, number],
};

export const AERO = {
  /** Lift-coefficient area of a full wing (m², downforce). */
  wingClA: 1.6,
  /** Extra drag area of a full wing (m²). */
  wingCdA: 0.3,
};

export const POWERTRAIN = {
  /** Drivetrain efficiency (engine → wheels). */
  eta: 0.88,
  /** Fraction of weight on the driven wheels: rear-wheel drive under acceleration. */
  rwdFraction: 0.6,
  /** Braking deceleration cap from brakes / ABS as a fraction of tyre grip. */
  brakeEfficiency: 0.95,
  /** Armour raises the centre of gravity: m per 1000 kg. */
  armourCgRise: 0.05,
  /** Occupant ride-down distance from seatbelt + airbag (m). */
  restraint: 0.12,
};

/** The "Gotham pursuit" mission: each test has a target. */
export const MISSION = {
  accel0to100: 4.5,
  topSpeedKmh: 250,
  brake100to0: 42,
  hairpinRadius: 30,
  hairpinKmh: 60,
  jumpGap: 20,
  jumpAngleDeg: 15,
  jumpApproachKmh: 80,
  landingMaxG: 8,
  crashKmh: 56,
  crashMaxG: 40,
  rangeKm: 300,
  cruiseKmh: 100,
  protection: 3,
};
