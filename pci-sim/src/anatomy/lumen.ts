/**
 * Lumen profiles: the native stenosis and how balloons / stents change it. Pure functions.
 */
import { INFLATION, LESION } from '../config/anatomy';
import type { Vessel, VesselId } from './vessels';

export interface LesionSpec {
  centre: number;
  length: number;
  plateau: number;
  maxStenosis: number;
}

/** Diameter stenosis (fraction) at arc length x: cosine-tapered with a short plateau. */
export function stenosisAt(x: number, l: LesionSpec = LESION): number {
  const d = Math.abs(x - l.centre);
  const half = l.length / 2;
  const plat = l.plateau / 2;
  if (d <= plat) return l.maxStenosis;
  if (d >= half) return 0;
  const t = (d - plat) / (half - plat);
  return l.maxStenosis * 0.5 * (1 + Math.cos(Math.PI * t));
}

export const lesionStart = (l: LesionSpec = LESION) => l.centre - l.length / 2;
export const lesionEnd = (l: LesionSpec = LESION) => l.centre + l.length / 2;

/** A lasting change to the lumen left by a balloon or a stent. */
export interface Treatment {
  kind: 'balloon' | 'stent';
  vessel: VesselId;
  s0: number;
  s1: number;
  /** Achieved device diameter (mm) before recoil. */
  diameter: number;
}

/** A balloon currently inflated in the vessel. */
export interface LiveBalloon {
  vessel: VesselId;
  s0: number;
  s1: number;
  diameter: number;
}

/** Weight 1 inside [s0, s1], blending to 0 over `taper` mm outside. */
export function coverWeight(x: number, s0: number, s1: number, taper = INFLATION.edgeTaper): number {
  if (x >= s0 && x <= s1) return 1;
  const d = x < s0 ? s0 - x : x - s1;
  if (d >= taper) return 0;
  const t = d / taper;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

/** Diameter a treatment holds open (after recoil). */
export function heldDiameter(t: Treatment): number {
  const recoil = t.kind === 'stent' ? INFLATION.stentRecoil : INFLATION.balloonRecoil;
  return t.diameter * (1 - recoil);
}

/** Native lumen diameter per sample (only the LAD carries the lesion). */
export function nativeLumen(v: Vessel, lesion: LesionSpec = LESION): number[] {
  if (v.id !== 'LAD') return v.refD.slice();
  return v.s.map((x, i) => v.refD[i] * (1 - stenosisAt(x, lesion)));
}

/**
 * Current lumen diameter per sample: native lumen, opened by lasting treatments,
 * and stretched by any live (inflated) balloon. Devices never narrow the lumen.
 */
export function computeLumen(
  v: Vessel,
  treatments: Treatment[],
  live: LiveBalloon | null,
  lesion: LesionSpec = LESION,
): number[] {
  const out = nativeLumen(v, lesion);
  const mine = treatments.filter((t) => t.vessel === v.id);
  for (let i = 0; i < out.length; i++) {
    const x = v.s[i];
    let d = out[i];
    for (const t of mine) {
      const w = coverWeight(x, t.s0, t.s1);
      if (w > 0) d = Math.max(d, d + (heldDiameter(t) - d) * w);
    }
    if (live && live.vessel === v.id) {
      const w = coverWeight(x, live.s0, live.s1, 0.6);
      if (w > 0) d = Math.max(d, d + (live.diameter - d) * w);
    }
    out[i] = d;
  }
  return out;
}

export interface QCA {
  referenceDiameter: number;
  mld: number;
  /** Diameter stenosis (fraction). */
  ds: number;
  lesionLength: number;
  mldAt: number;
}

/**
 * Quantitative coronary angiography over a window of the LAD:
 * reference = mean diameter of healthy segments just proximal and distal to the narrowing,
 * MLD = minimum lumen diameter, lesion length = extent narrower than 80% of local reference.
 */
export function measureQCA(v: Vessel, lumen: number[], from: number, to: number): QCA {
  let mld = Infinity;
  let mldAt = from;
  let mldIdx = 0;
  for (let i = 0; i < v.s.length; i++) {
    if (v.s[i] < from || v.s[i] > to) continue;
    if (lumen[i] < mld) {
      mld = lumen[i];
      mldAt = v.s[i];
      mldIdx = i;
    }
  }
  // Interpolated reference at the MLD site (vessel tapers), from healthy flanks.
  const refAt = v.refD[mldIdx];
  let len = 0;
  let inLesion = false;
  let start = 0;
  for (let i = 0; i < v.s.length; i++) {
    if (v.s[i] < from || v.s[i] > to) continue;
    const narrow = lumen[i] < 0.8 * v.refD[i];
    if (narrow && !inLesion) {
      inLesion = true;
      start = v.s[i];
    } else if (!narrow && inLesion) {
      inLesion = false;
      len = Math.max(len, v.s[i] - start);
    }
  }
  if (inLesion) len = Math.max(len, to - start);
  return {
    referenceDiameter: refAt,
    mld,
    ds: Math.max(0, 1 - mld / refAt),
    lesionLength: len,
    mldAt,
  };
}

/** Worst diameter stenosis (fraction) over [from, to] relative to the reference. */
export function worstStenosis(v: Vessel, lumen: number[], from: number, to: number): number {
  let worst = 0;
  for (let i = 0; i < v.s.length; i++) {
    if (v.s[i] < from || v.s[i] > to) continue;
    worst = Math.max(worst, 1 - lumen[i] / v.refD[i]);
  }
  return worst;
}
