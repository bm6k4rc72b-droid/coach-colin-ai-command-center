/**
 * Rest-pose device geometry: a unified "device rail" (guide catheter + coronary path) and the
 * polylines for the guide, wire and balloon/stent catheter. Pure; the renderer adds heartbeat.
 */
import { AORTA, GUIDE, INFLATION, type Vec3 } from '../config/anatomy';
import {
  add,
  addScaled,
  arcLengths,
  bezier,
  cross,
  dot,
  lerp3,
  norm,
  perpendicular,
  rad,
  rotateAround,
  scale,
  smoothstep,
  sub,
} from '../anatomy/math';
import { aorticBeatWeight, cuspDir, indexAt, pointAt, railPoint, tangentAt, type Anatomy } from '../anatomy/vessels';
import { pathPoint, pathPolyline, type Leg } from './route';

/** Unit direction in the aortic-root plane for guide rotation θ (0 = toward the left ostium). */
export function cuspDirection(anat: Anatomy, angleDeg: number): Vec3 {
  return cuspDir(anat.rootCentre, anat.rootAxis, anat.leftOstium, angleDeg);
}

/** Rotation angle (deg) at which the guide tip points at the right coronary ostium. */
export function rightOstiumAngle(anat: Anatomy): number {
  const ax = anat.rootAxis;
  const toR = sub(anat.rightOstium, anat.rootCentre);
  const r = norm(sub(toR, scale(ax, dot(toR, ax))));
  const l = cuspDirection(anat, 0);
  const ang = -Math.atan2(dot(cross(l, r), ax), dot(l, r));
  return (ang * 180) / Math.PI;
}

export interface Polyline {
  pts: Vec3[];
  /** Heartbeat weight per point. */
  w: number[];
}

/** Guide catheter centreline from the wrist to its tip, including the pre-shaped curve. */
export function guidePolyline(anat: Anatomy, s: number, angle: number, engaged: boolean, legs: Leg[]): Polyline {
  const rail = anat.access;
  const root = anat.landmarks.root;
  const curl = engaged ? 1 : smoothstep(root - 70, root, s);
  const tipLen = GUIDE.tipCurveLength;
  const bodyEnd = curl > 0.001 ? Math.max(0, s - tipLen) : s;
  const pts: Vec3[] = [];
  const i1 = indexAt(rail.s, bodyEnd);
  for (let i = 0; i <= i1; i++) pts.push(rail.pts[i]);
  pts.push(railPoint(rail, bodyEnd));
  if (curl > 0.001) {
    const B = railPoint(rail, bodyEnd);
    const T = tangentAt(rail.pts, rail.s, Math.max(0, bodyEnd - 1));
    const straightEnd = railPoint(rail, s);
    let E: Vec3;
    let Tend: Vec3;
    if (engaged) {
      E = pathPoint(anat, legs, GUIDE.engagedDepth);
      Tend = norm(sub(pathPoint(anat, legs, GUIDE.engagedDepth + 1), E));
    } else {
      const dir = cuspDirection(anat, angle);
      const curled = addScaled(add(anat.rootCentre, scale(anat.rootAxis, 5)), dir, AORTA.sinusRadius - 4);
      E = lerp3(straightEnd, curled, curl);
      Tend = norm(add(scale(dir, curl), scale(T, 1 - curl * 0.7)));
    }
    const span = Math.max(4, Math.hypot(...sub(E, B)));
    const c1 = addScaled(B, T, span * 0.55);
    const c2 = addScaled(E, Tend, -span * 0.45);
    for (let k = 1; k <= 16; k++) pts.push(bezier(B, c1, c2, E, k / 16));
  }
  return { pts, w: pts.map((p) => aorticBeatWeight(p, anat.rootCentre)) };
}

export interface DeviceRail {
  pts: Vec3[];
  s: number[];
  w: number[];
  /** Rail arc length of the guide tip; coronary path distance d maps to guideLen + (d − engagedDepth). */
  guideLen: number;
}

/** Guide polyline extended into the coronary path up to path distance dMax. */
export function deviceRail(anat: Anatomy, guide: Polyline, engaged: boolean, legs: Leg[], dMax: number): DeviceRail {
  const pts = guide.pts.slice();
  const w = guide.w.slice();
  const guideLen = arcLengths(pts).at(-1) ?? 0;
  if (engaged && dMax > GUIDE.engagedDepth) {
    const cor = pathPolyline(anat, legs, GUIDE.engagedDepth, dMax, 0.5);
    for (let i = 1; i < cor.length; i++) {
      pts.push(cor[i]);
      w.push(1);
    }
  }
  return { pts, s: arcLengths(pts), w, guideLen };
}

export const railU = (r: DeviceRail, d: number) => r.guideLen + (d - GUIDE.engagedDepth);

/** Sub-polyline of the rail between arc lengths u0 and u1. */
export function railSlice(r: DeviceRail, u0: number, u1: number, step = 0): Polyline {
  const total = r.s[r.s.length - 1];
  const a = Math.max(0, Math.min(u0, total));
  const b = Math.max(0, Math.min(u1, total));
  const pts: Vec3[] = [];
  const w: number[] = [];
  if (b <= a) return { pts, w };
  const wAt = (u: number) => {
    const i = indexAt(r.s, u);
    const t = (u - r.s[i]) / (r.s[i + 1] - r.s[i] || 1);
    return r.w[i] + (r.w[i + 1] - r.w[i]) * Math.max(0, Math.min(1, t));
  };
  if (step > 0) {
    const n = Math.max(1, Math.ceil((b - a) / step));
    for (let k = 0; k <= n; k++) {
      const u = a + ((b - a) * k) / n;
      pts.push(pointAt(r.pts, r.s, u));
      w.push(wAt(u));
    }
    return { pts, w };
  }
  pts.push(pointAt(r.pts, r.s, a));
  w.push(wAt(a));
  for (let i = 0; i < r.s.length; i++) {
    if (r.s[i] > a && r.s[i] < b) {
      pts.push(r.pts[i]);
      w.push(r.w[i]);
    }
  }
  pts.push(pointAt(r.pts, r.s, b));
  w.push(wAt(b));
  return { pts, w };
}

/** Wire polyline with a shaped (bent) tip and an optional buckle loop. */
export function wirePolyline(r: DeviceRail, d: number, angle: number, buckling: boolean, time: number): Polyline {
  const u = railU(r, d);
  const body = railSlice(r, 0, u);
  if (body.pts.length < 2) return body;
  const n = body.pts.length;
  const tip = body.pts[n - 1];
  const tdir = norm(sub(tip, body.pts[Math.max(0, n - 4)]));
  const side = rotateAround(perpendicular(tdir), tdir, rad(angle));
  // Buckle: lateral bow over the last 12 mm.
  if (buckling) {
    const amp = 1.6 + 0.3 * Math.sin(time * 9);
    const sl = arcLengths(body.pts);
    const L = sl[n - 1];
    for (let i = 0; i < n; i++) {
      const back = L - sl[i];
      if (back < 12) {
        const k = Math.sin((Math.PI * back) / 12);
        body.pts[i] = addScaled(body.pts[i], side, amp * k);
      }
    }
  }
  // Shaped J-ish tip: 3 mm bent toward `side`.
  const bend: Vec3[] = [];
  for (let k = 1; k <= 4; k++) {
    const t = k / 4;
    bend.push(add(tip, add(scale(tdir, 2.4 * t * (1 - 0.3 * t)), scale(side, 1.3 * t * t))));
  }
  return { pts: [...body.pts, ...bend], w: [...body.w, ...bend.map(() => body.w[n - 1])] };
}

export interface CatheterGeometry {
  shaft: Polyline;
  balloon: Polyline;
  tip: Polyline;
  /** Positions of the proximal and distal radiopaque markers. */
  markers: [Vec3, Vec3];
  markerW: [number, number];
}

export function catheterGeometry(r: DeviceRail, pos: number, length: number): CatheterGeometry {
  const uDist = railU(r, pos);
  const uProx = uDist - length;
  const shaft = railSlice(r, 0, uProx);
  const balloon = railSlice(r, uProx, uDist, 0.4);
  const tip = railSlice(r, uDist, uDist + INFLATION.tipLength, 0.5);
  const at = (u: number): Vec3 => pointAt(r.pts, r.s, Math.max(0, Math.min(u, r.s[r.s.length - 1])));
  const wAt = (u: number) => r.w[indexAt(r.s, Math.max(0, u))];
  return { shaft, balloon, tip, markers: [at(uProx), at(uDist)], markerW: [wAt(uProx), wAt(uDist)] };
}

