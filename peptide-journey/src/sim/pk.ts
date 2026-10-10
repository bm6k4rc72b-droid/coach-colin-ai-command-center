// One-compartment pharmacokinetics, normalised so the peak level is 1.
// ke = ln2 / half-life.
//
// Injected medicines: first-order absorption and elimination (the Bateman
// function), C(t) ∝ ka/(ka−ke)·(e^(−ke·t) − e^(−ka·t)), with ka solved from the
// published time-to-peak, tmax = ln(ka/ke)/(ka − ke).
//
// Natural hormones: the gland secretes at a steady rate for a release window
// R (= tmax), so C rises as 1 − e^(−ke·t), then falls at the hormone's own
// half-life once secretion stops.
//
// A teaching model of each peptide's rise and fall, not a dosing model.

import type { Peptide } from '../data/peptides';

/** Timeline span: 1 second to 30 days, on a log scale. */
export const T_MIN = 1;
export const T_MAX = 30 * 86400;

export function tmaxFor(ka: number, ke: number) {
  if (Math.abs(ka - ke) < 1e-9 * ke) return 1 / ke;
  return Math.log(ka / ke) / (ka - ke);
}

/**
 * Solve ka so that the curve peaks at `tmax`. tmax falls monotonically as ka
 * grows, on both sides of ka = ke. When tmax is longer than 1/ke the input is
 * the slow step (“flip-flop” kinetics): for a hormone, the gland is still
 * releasing it, so the level falls at the release rate, not the half-life.
 */
export function solveKa(ke: number, tmax: number) {
  let lo = ke * 1e-6;
  let hi = ke * 1e6;
  if (tmaxFor(hi, ke) > tmax) return hi;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (tmaxFor(mid, ke) > tmax) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

export interface Model {
  ke: number;
  ka: number;
  peakT: number;
  scale: number;
  /** True when absorption, not elimination, sets the decline. */
  releaseLimited: boolean;
  kind: 'injection' | 'secretion';
}

const cache = new Map<string, Model>();

export function model(p: Peptide): Model {
  const hit = cache.get(p.id);
  if (hit) return hit;
  const ke = Math.LN2 / p.halfLife;
  let m: Model;
  if (p.source.point) {
    const ka = solveKa(ke, p.tmax);
    const peakT = tmaxFor(ka, ke);
    const raw = (ka / (ka - ke)) * (Math.exp(-ke * peakT) - Math.exp(-ka * peakT));
    m = { ke, ka, peakT, scale: 1 / raw, releaseLimited: ka < ke, kind: 'injection' };
  } else {
    m = { ke, ka: Infinity, peakT: p.tmax, scale: 1 / (1 - Math.exp(-ke * p.tmax)), releaseLimited: false, kind: 'secretion' };
  }
  cache.set(p.id, m);
  return m;
}

/** Normalised blood level (0..1) at t seconds after release or injection. */
export function level(p: Peptide, t: number) {
  if (t <= 0) return 0;
  const m = model(p);
  let v: number;
  if (m.kind === 'secretion') {
    const R = m.peakT;
    v = t <= R ? 1 - Math.exp(-m.ke * t) : (1 - Math.exp(-m.ke * R)) * Math.exp(-m.ke * (t - R));
  } else {
    v = (m.ka / (m.ka - m.ke)) * (Math.exp(-m.ke * t) - Math.exp(-m.ka * t));
  }
  return Math.max(0, Math.min(1, m.scale * v));
}

/** Map a 0..1 timeline position to seconds (log scale). */
export function uToT(u: number) {
  return T_MIN * Math.pow(T_MAX / T_MIN, Math.min(1, Math.max(0, u)));
}

export function tToU(t: number) {
  return Math.log(Math.max(T_MIN, t) / T_MIN) / Math.log(T_MAX / T_MIN);
}

export function formatDuration(t: number) {
  if (t < 60) return `${Math.round(t)} s`;
  if (t < 3600) return `${Math.round(t / 60)} min`;
  if (t < 86400) {
    const h = Math.floor(t / 3600);
    const m = Math.round((t % 3600) / 60);
    return m && h < 10 ? `${h} h ${m} min` : `${Math.round(t / 3600)} h`;
  }
  const d = t / 86400;
  return d < 10 ? `${d.toFixed(1).replace(/\.0$/, '')} days` : `${Math.round(d)} days`;
}
