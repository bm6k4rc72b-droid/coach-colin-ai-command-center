/**
 * Suit, thruster, energy and course constants. SI units. Teaching values, rounded.
 * Body frame: x = right, y = up (head), z = forward (the way the pilot faces).
 */

export const G = 9.81;
export const RHO = 1.225;

export const SUIT = {
  /** Suit + pilot mass (kg). */
  mass: 200,
  /** Principal moments of inertia about body x (pitch), y (yaw), z (roll), kg·m². */
  inertia: [22, 9, 20] as [number, number, number],
  /** Drag area (m²) and rotational damping (N·m per rad/s). */
  cdA: 0.55,
  angularDamping: [30, 15, 30] as [number, number, number],
  /** Boots: 2 thrusters below the centre of mass that can gimbal fore/aft (pitch). */
  bootMax: 2400,
  bootOffsetY: -1.0,
  bootOffsetX: 0.14,
  bootGimbal: (15 * Math.PI) / 180,
  /** Palms: 2 thrusters at the hands, can gimbal fore/aft (yaw when differential). */
  palmMax: 800,
  palmOffsetX: 0.5,
  palmOffsetY: -0.15,
  palmGimbal: (20 * Math.PI) / 180,
  /** Share of collective thrust carried by the boots. */
  bootShare: 0.78,
  /** Ground effect: extra lift fraction near the ground, and its height scale (m). */
  groundEffect: 0.12,
  groundEffectHeight: 1.6,
  /** Landing: touchdown faster than this (m/s) is a crash. */
  crashSpeed: 4.5,
  softLanding: 2.0,
};

export type EnergyId = 'turbine' | 'electric' | 'reactor';

export interface EnergySource {
  name: string;
  maturity: 'Shipping' | 'Prototype' | 'Fiction';
  /** Usable store (kg fuel, or J). */
  capacity: number;
  unit: 'kg' | 'J';
  info: string;
}

export const ENERGY: Record<EnergyId, EnergySource> = {
  turbine: {
    name: 'Kerosene micro-turbines',
    maturity: 'Shipping',
    capacity: 24,
    unit: 'kg',
    info: 'How real jet suits fly today: small turbojets burn fuel fast. Expect minutes, not hours.',
  },
  electric: {
    name: 'Electric ducted fans + battery',
    maturity: 'Prototype',
    capacity: 24 * 260 * 3600,
    unit: 'J',
    info: '24 kg of the best lithium cells (~260 Wh/kg). Fans need huge power to lift a person — the battery empties in about a minute.',
  },
  reactor: {
    name: '"Arc reactor"',
    maturity: 'Fiction',
    capacity: Infinity,
    unit: 'J',
    info: 'A palm-sized power plant with unlimited energy does not exist. This is the movie part.',
  },
};

export const PROPULSION = {
  /** Thrust-specific fuel consumption of small turbojets, kg per N per hour. */
  tsfc: 0.14,
  /** Electric fans: total disk area of all four fans (m²) and electrical-to-thrust efficiency. */
  fanArea: 0.12,
  fanEfficiency: 0.72,
};

/** Pilot G tolerance (simplified G-LOC model). */
export const PILOT = {
  /** Sustained head-to-foot g that starts to grey out vision. */
  greyout: 4.5,
  /** Accumulated stress (g·s above greyout) that causes loss of consciousness. */
  glocDose: 6,
  /** Recovery per second below greyout. */
  recovery: 1.5,
};

export const ASSIST = {
  /** Manual: stick → torque fraction. Stability: stick → attitude angle (rad). Computer: stick → velocity (m/s). */
  maxTilt: (30 * Math.PI) / 180,
  maxYawRate: 1.2,
  maxSpeed: 14,
  maxClimb: 5,
};

export const WIND = {
  /** Gust strength (m/s) and correlation time (s). */
  gust: 5,
  tau: 2.5,
};
