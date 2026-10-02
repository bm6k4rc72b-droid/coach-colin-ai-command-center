/**
 * Patient physiology (ischaemia, ST, haemodynamics, ACT) and a synthetic V2 ECG. Pure.
 */
import { PHYSIOLOGY as P } from '../config/anatomy';
import { clamp } from '../anatomy/math';

export interface Physiology {
  ischaemia: number;
  /** Continuous LAD occlusion time (s). */
  occlusionTime: number;
  hr: number;
  sys: number;
  dia: number;
  spo2: number;
  /** ST elevation in V2 (mm). */
  st: number;
  act: number;
  heparinAt: number | null;
  chestPain: boolean;
  pvcRisk: boolean;
  unstable: boolean;
  maxOcclusion: number;
}

export const initialPhysiology = (): Physiology => ({
  ischaemia: 0,
  occlusionTime: 0,
  hr: P.baseHR,
  sys: P.baseSys,
  dia: P.baseDia,
  spo2: P.baseSpO2,
  st: 0,
  act: P.actBaseline,
  heparinAt: null,
  chestPain: false,
  pvcRisk: false,
  unstable: false,
  maxOcclusion: 0,
});

/** ACT (s) at time t given heparin time. */
export function actAt(t: number, heparinAt: number | null): number {
  if (heparinAt === null || t < heparinAt) return P.actBaseline;
  return P.actBaseline + (P.actHeparin - P.actBaseline) * (1 - Math.exp(-(t - heparinAt) / P.actTau));
}

/**
 * Advance physiology by dt.
 * @param ladFlow relative flow at the distal LAD (0 = occluded)
 * @param occluded a balloon is inflated in the LAD
 */
export function stepPhysiology(p0: Physiology, dt: number, t: number, ladFlow: number, occluded: boolean): Physiology {
  const p = { ...p0 };
  const noFlow = occluded || ladFlow <= 0.02;
  if (noFlow) {
    p.occlusionTime += dt;
    p.maxOcclusion = Math.max(p.maxOcclusion, p.occlusionTime);
  } else p.occlusionTime = 0;

  let target = 0;
  if (noFlow) target = 1;
  else if (ladFlow < P.poorFlow) target = 0.6 * (1 - ladFlow / P.poorFlow) + 0.2;
  if (target > p.ischaemia) p.ischaemia = Math.min(target, p.ischaemia + dt / P.ischaemiaRise);
  else p.ischaemia += (target - p.ischaemia) * (1 - Math.exp(-dt / P.recoveryTau));
  p.ischaemia = clamp(p.ischaemia, 0, 1);

  p.st = P.maxST * p.ischaemia;
  p.chestPain = p.ischaemia > P.chestPainAt;
  p.pvcRisk = p.occlusionTime > P.pvcAfter;
  p.unstable = p.occlusionTime > P.unstableAfter;

  const occBp = p.occlusionTime > P.pvcAfter ? Math.min(1, (p.occlusionTime - P.pvcAfter) / 25) : 0;
  const hrT = P.baseHR + P.hrRise * p.ischaemia + (p.unstable ? 12 : 0);
  const sysT = P.baseSys + 8 * p.ischaemia - 34 * occBp - (p.unstable ? 12 : 0);
  const diaT = P.baseDia + 3 * p.ischaemia - 16 * occBp;
  const spT = P.baseSpO2 - (p.unstable ? 4 : 0) - 1 * p.ischaemia;
  const k = 1 - Math.exp(-dt / 2.5);
  p.hr += (hrT - p.hr) * k;
  p.sys += (sysT - p.sys) * k;
  p.dia += (diaT - p.dia) * k;
  p.spo2 += (spT - p.spo2) * k;
  p.act = actAt(t, p.heparinAt);
  return p;
}

const g = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) * (x - mu)) / (2 * sigma * sigma));

/**
 * Synthetic V2 lead (mV) at time τ (s) since the beat's R wave onset reference, for a beat of
 * period `rr`. `stMm` adds ST elevation (1 mm = 0.1 mV). PVC beats are wide, early, without P.
 */
export function ecgSample(tau: number, rr: number, stMm: number, pvc = false): number {
  const st = stMm * 0.1;
  if (pvc) {
    // Wide bizarre QRS, discordant T.
    return 1.3 * g(tau, 0.06, 0.035) - 0.7 * g(tau, 0.15, 0.04) - 0.45 * g(tau, 0.36, 0.08);
  }
  const p = 0.1 * g(tau, -0.16, 0.025);
  const q = -0.08 * g(tau, -0.025, 0.008);
  const r = 1.1 * g(tau, 0, 0.011);
  const s = -0.32 * g(tau, 0.028, 0.011);
  const tw = (0.28 + st * 0.6) * g(tau, 0.26 * Math.min(1, rr), 0.05);
  // ST segment: plateau from J point to the T wave.
  const j = 0.05;
  const tEnd = 0.26 * Math.min(1, rr);
  let seg = 0;
  if (tau > j && tau < tEnd) seg = st;
  else if (tau >= j - 0.015 && tau <= j) seg = st * ((tau - (j - 0.015)) / 0.015);
  else if (tau >= tEnd && tau < tEnd + 0.08) seg = st * (1 - (tau - tEnd) / 0.08);
  return p + q + r + s + tw + seg;
}

/** Mean ST level (mV) sampled in the ST segment of a normal beat — used by tests. */
export function stLevel(stMm: number): number {
  return ecgSample(0.12, 0.9, stMm) - ecgSample(0.12, 0.9, 0);
}
