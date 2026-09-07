/**
 * Unit conversions for incoming sensor data.
 *
 * Tracking and mocap vendors report in SI: metres, radians, radians per second,
 * newtons, seconds. QB IQ displays in the units a football staff speaks —
 * inches, degrees, degrees per second, multiples of bodyweight, milliseconds.
 * Every conversion the adapters need lives here, exactly once, and is covered by
 * tests, because a silent factor-of-π error in a joint velocity is the kind of
 * bug that survives a demo and ruins a deployment.
 */

export const IN_PER_M = 39.3700787401575;
export const MPH_PER_MPS = 2.2369362920544;
export const DEG_PER_RAD = 180 / Math.PI;
/** Standard gravity, for converting force in newtons to multiples of bodyweight. */
export const G = 9.80665;

export const metresToInches = (m: number): number => m * IN_PER_M;
export const inchesToMetres = (inches: number): number => inches / IN_PER_M;
export const metresPerSecToMph = (mps: number): number => mps * MPH_PER_MPS;
export const radiansToDegrees = (rad: number): number => rad * DEG_PER_RAD;
export const degreesToRadians = (deg: number): number => deg / DEG_PER_RAD;
export const radPerSecToDegPerSec = (radPerSec: number): number => radPerSec * DEG_PER_RAD;
export const secondsToMs = (s: number): number => s * 1000;

/** Ball spin is reported in rad/s or Hz depending on vendor; both land in rpm. */
export const radPerSecToRpm = (radPerSec: number): number => (radPerSec * 60) / (2 * Math.PI);
export const hzToRpm = (hz: number): number => hz * 60;

/** Force plate newtons → multiples of the athlete's bodyweight. */
export function newtonsToBodyweights(newtons: number, massKg: number): number {
  if (massKg <= 0) throw new Error('newtonsToBodyweights: mass must be positive');
  return newtons / (massKg * G);
}

export const poundsToKilograms = (lb: number): number => lb * 0.45359237;

/** Round to a fixed number of decimals without the float dust that `toFixed` leaves behind. */
export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
