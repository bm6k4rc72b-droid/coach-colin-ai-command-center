/**
 * Procedural heart: a deformed ellipsoid parameterised by (v, φ):
 *   v  = mm along the long axis from the centre (+ toward the apex, − toward the base)
 *   φ  = angle (deg) around the long axis: 0 lateral (LV), 90 anterior, 180 right (RV), 270 posterior.
 * Pure maths — used both for the mesh and to lay coronaries on the epicardium.
 */
import { HEART, CORONARY, type Vec3 } from '../config/anatomy';
import { add, angleDiff, cross, dot, interpKnots, norm, rad, scale, sub } from './math';

export interface HeartFrame {
  centre: Vec3;
  /** Unit long axis toward the apex. */
  axis: Vec3;
  /** Unit lateral (LV free wall) direction. */
  lateral: Vec3;
  /** Unit anterior direction. */
  anterior: Vec3;
}

export function heartFrame(): HeartFrame {
  const axis = norm(HEART.apexDir);
  const z: Vec3 = [0, 0, 1];
  const anterior = norm(sub(z, scale(axis, dot(z, axis))));
  const lateral = norm(cross(anterior, axis));
  return { centre: HEART.centre, axis, lateral, anterior };
}

const LAD_PATH = CORONARY.find((b) => b.id === 'LAD')!.surfacePath.map(([v, a]) => [v, a] as [number, number]);

/** Longitudinal radius profile factor: tapered apex, flattened base. */
export function profileFactor(v: number): number {
  if (v >= 0) {
    const t = Math.min(1, v / HEART.apexLength);
    return Math.pow(Math.max(0, 1 - t * t), 0.6);
  }
  const t = Math.min(1, -v / HEART.baseLength);
  return Math.sqrt(Math.max(0, 1 - t * t * t));
}

/** Angle of the anterior interventricular groove at height v (follows the LAD course). */
export function antGrooveAngle(v: number): number {
  return interpKnots(LAD_PATH, v);
}

function windowV(v: number, a: number, b: number, soft: number): number {
  const lo = 1 / (1 + Math.exp(-(v - a) / soft));
  const hi = 1 / (1 + Math.exp((v - b) / soft));
  return lo * hi;
}

/** Fat weight (0..1) along the AV and interventricular grooves. */
export function grooveWeight(v: number, phi: number, widthScale = 1): number {
  const r = (HEART.radiusLateral + HEART.radiusAnterior) * 0.5 * Math.max(0.6, profileFactor(v));
  const w = 4.2 * widthScale;
  const dAnt = (rad(angleDiff(phi, antGrooveAngle(v))) * r) / w;
  const dPost = (rad(angleDiff(phi, HEART.postGrooveAngle)) * r) / w;
  const below = windowV(v, HEART.avGrooveV, HEART.apexLength - 8, 2);
  const ant = Math.exp(-dAnt * dAnt) * below;
  const post = Math.exp(-dPost * dPost) * below;
  const dv = (v - HEART.avGrooveV) / (3.5 * widthScale);
  const av = Math.exp(-dv * dv);
  return Math.min(1, Math.max(ant, post, av));
}

/** Point on the epicardium. */
export function heartSurface(f: HeartFrame, v: number, phi: number): Vec3 {
  const p = profileFactor(v);
  const a = rad(phi);
  const bulgeAng = angleDiff(phi, HEART.rvBulgeAngle) / 55;
  const bulge = HEART.rvBulge * Math.exp(-bulgeAng * bulgeAng) * windowV(v, -34, 42, 6);
  const dent = HEART.grooveDepth * grooveWeight(v, phi, 0.6);
  const rl = Math.max(0, HEART.radiusLateral * p + (bulge - dent) * p);
  const ra = Math.max(0, HEART.radiusAnterior * p + (bulge - dent) * p);
  let pt = add(f.centre, scale(f.axis, v));
  pt = add(pt, scale(f.lateral, rl * Math.cos(a)));
  pt = add(pt, scale(f.anterior, ra * Math.sin(a)));
  return pt;
}

/** Outward unit normal (finite differences). */
export function heartNormal(f: HeartFrame, v: number, phi: number): Vec3 {
  const e = 0.25;
  const dv = sub(heartSurface(f, v + e, phi), heartSurface(f, v - e, phi));
  const dp = sub(heartSurface(f, v, phi + e), heartSurface(f, v, phi - e));
  let n = norm(cross(dp, dv));
  const radial = sub(heartSurface(f, v, phi), add(f.centre, scale(f.axis, v)));
  if (dot(n, radial) < 0) n = scale(n, -1);
  // Near the apex the derivatives degenerate; fall back to the axis.
  if (!Number.isFinite(n[0])) return f.axis;
  return n;
}

/** Point lifted off the epicardium (for vessels riding on the surface). */
export function onSurface(f: HeartFrame, v: number, phi: number, lift: number): Vec3 {
  return add(heartSurface(f, v, phi), scale(heartNormal(f, v, phi), lift));
}

/** Cardiac contraction (0..1) at cycle phase p ∈ [0,1): systole ≈ first 38% of the cycle. */
export function contraction(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const sys = HEART.systoleFraction;
  if (p < sys) return Math.sin((Math.PI * p) / sys) ** 2 * 0.98 + 0.02 * Math.sin((Math.PI * p) / sys);
  return 0;
}

/** Uniform heart scale at phase p (≤ 1). */
export function beatScale(phase: number): number {
  return 1 - HEART.beatAmplitude * contraction(phase);
}

/** Displace a rest-position point by the heartbeat with weight w ∈ [0,1]. */
export function beatDisplace(p: Vec3, centre: Vec3, s: number, w: number): Vec3 {
  const k = 1 + (s - 1) * w;
  return [centre[0] + (p[0] - centre[0]) * k, centre[1] + (p[1] - centre[1]) * k, centre[2] + (p[2] - centre[2]) * k];
}
