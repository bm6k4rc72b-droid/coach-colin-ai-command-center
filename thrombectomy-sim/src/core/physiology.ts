/**
 * Ischaemic core growth and a teaching outcome estimate. Simplified, monotone models chosen to
 * show the right relationships ("time is brain", collaterals, reperfusion), not to predict
 * real patients. Pure and unit tested.
 */
import { CORE_GROWTH, NEURONS_PER_ML, type Case } from '../config/cases';

/** Minutes from hospital arrival until the CT perfusion snapshot. */
export const IMAGING_AT = 20;

/**
 * Core volume at `minutesSinceDoor`, given how much of the territory has been reperfused and
 * when. Growth is linear in time at the collateral-dependent rate, capped at the hypoperfused
 * volume; reperfused tissue stops growing.
 */
export function coreVolume(c: Case, minutesSinceDoor: number, reperfusion: { at: number; fraction: number } | null = null): number {
  const rate = CORE_GROWTH[c.collaterals] / 60;
  const grow = (from: number, to: number, share: number) => Math.max(0, to - from) * rate * share;
  // Before imaging we extrapolate backwards from the measured core.
  let v = c.coreAtImaging + (minutesSinceDoor - IMAGING_AT) * rate;
  if (reperfusion && minutesSinceDoor > reperfusion.at) {
    v = c.coreAtImaging + grow(IMAGING_AT, reperfusion.at, 1) + grow(reperfusion.at, minutesSinceDoor, 1 - reperfusion.fraction);
  }
  return Math.max(0, Math.min(c.hypoperfused, v));
}

/** Penumbra = hypoperfused but still salvageable. */
export const penumbra = (c: Case, core: number) => Math.max(0, c.hypoperfused - core);

export const neurons = (mL: number) => mL * NEURONS_PER_ML;

/**
 * Final infarct after the procedure: the core at the end, plus the unreperfused penumbra
 * (which goes on to die), plus extra infarct from emboli to a new territory.
 */
export function finalInfarct(c: Case, endMinutes: number, reperfusedFraction: number, reperfusedAt: number | null, newTerritoryMl = 0): number {
  const core = coreVolume(c, endMinutes, reperfusedAt === null ? null : { at: reperfusedAt, fraction: reperfusedFraction });
  return Math.min(c.hypoperfused + newTerritoryMl, core + penumbra(c, core) * (1 - reperfusedFraction) * 0.85 + newTerritoryMl);
}

/** What happens with best medical care only (no thrombectomy): most of the penumbra infarcts. */
export const untreatedInfarct = (c: Case) => c.coreAtImaging + (c.hypoperfused - c.coreAtImaging) * 0.85;

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** Probability of functional independence (mRS 0–2) at 90 days: a teaching logistic model. */
export function pIndependent(c: Case, infarctMl: number, sich: boolean): number {
  const x = 1.25 - 0.0165 * infarctMl - 0.045 * (c.age - 65) - 0.06 * (c.nihss - 10) - (sich ? 1.4 : 0);
  return logistic(x);
}

/** Symptomatic intracranial haemorrhage risk rises with core size, time and thrombolysis. */
export function sichRisk(c: Case, core: number, lysis: boolean, passes: number): number {
  return Math.min(0.4, 0.015 + core * 0.0009 + (lysis ? 0.015 : 0) + Math.max(0, passes - 2) * 0.01 + (c.age >= 80 ? 0.01 : 0));
}
