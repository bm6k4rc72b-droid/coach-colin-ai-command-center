/**
 * Vessel tree: centreline polylines with arc length, reference diameter and heartbeat weight.
 * Pure: no Three.js. Built once per case.
 */
import {
  ACCESS,
  AORTA,
  CORONARY,
  CORONARY_LIFT,
  CORONARY_STEP,
  DIAGONALS,
  GUIDE,
  LAD_DIAMETER_KNOTS,
  LM_LENGTH,
  type Vec3,
} from '../config/anatomy';
import { heartFrame, onSurface, type HeartFrame } from './heart';
import {
  add,
  arcLengths,
  catmullRom,
  clamp,
  dist,
  dot,
  interpKnots,
  lerp,
  lerp3,
  norm,
  resample,
  rotateAround,
  scale,
  smoothstep,
  sub,
} from './math';

export type VesselId =
  | 'LM'
  | 'LAD'
  | 'LCx'
  | 'D1'
  | 'D2'
  | 'RCA'
  | 'aorta'
  | 'radial'
  | 'brachial'
  | 'axillary'
  | 'subclavian'
  | 'brachiocephalic';

export const CORONARY_IDS: VesselId[] = ['LM', 'LAD', 'LCx', 'D1', 'D2', 'RCA'];
export const LEFT_TREE: VesselId[] = ['LM', 'LAD', 'LCx', 'D1', 'D2'];

export interface Vessel {
  id: VesselId;
  name: string;
  info: string;
  parent: VesselId | null;
  /** Arc length on the parent where this vessel starts. */
  branchAt: number;
  children: VesselId[];
  pts: Vec3[];
  s: number[];
  length: number;
  /** Reference (healthy) lumen diameter per sample. */
  refD: number[];
  /** Heartbeat weight per sample. */
  beatW: number[];
  coronary: boolean;
  /** Wire-tip rotation that steers into this vessel at its origin. */
  wireAngle: number;
}

/** A 1D route for sliding devices: polyline + arc length. */
export interface Rail {
  pts: Vec3[];
  s: number[];
  length: number;
  beatW: number[];
}

export interface Anatomy {
  frame: HeartFrame;
  vessels: Record<VesselId, Vessel>;
  rootCentre: Vec3;
  /** Unit direction of the ascending aorta at the root (upward). */
  rootAxis: Vec3;
  leftOstium: Vec3;
  rightOstium: Vec3;
  /** Access rail: wrist → aortic root. */
  access: Rail;
  /** Landmarks on the access rail (arc length). */
  landmarks: { elbow: number; aortaEntry: number; root: number };
}

function buildRail(pts: Vec3[], beatW: number[]): Rail {
  const s = arcLengths(pts);
  return { pts, s, length: s[s.length - 1], beatW };
}

/** Beat weight for aortic/access points: 1 at the root, fading out up the ascending aorta. */
export function aorticBeatWeight(p: Vec3, root: Vec3): number {
  return 1 - smoothstep(18, 55, dist(p, root));
}

function makeVessel(
  id: VesselId,
  name: string,
  info: string,
  parent: VesselId | null,
  branchAt: number,
  pts: Vec3[],
  diameterAt: (s: number, len: number) => number,
  beatAt: (p: Vec3) => number,
  coronary: boolean,
  wireAngle = 0,
): Vessel {
  const s = arcLengths(pts);
  const length = s[s.length - 1];
  return {
    id,
    name,
    info,
    parent,
    branchAt,
    children: [],
    pts,
    s,
    length,
    refD: s.map((x) => diameterAt(x, length)),
    beatW: pts.map(beatAt),
    coronary,
    wireAngle,
  };
}

/** Sample a heart-surface path given as (v, φ) knots into world points, lifted by the vessel radius. */
function surfacePath(f: HeartFrame, knots: [number, number][], radiusAt: (t: number) => number): Vec3[] {
  const fine: Vec3[] = [];
  const N = 240;
  const kv = knots.map(([v, a]) => [v, a, 0] as Vec3);
  const smooth = catmullRom(kv, 24);
  const sm = resample(smooth, (arcLengths(smooth).at(-1) ?? 1) / N);
  for (let i = 0; i < sm.length; i++) {
    const t = i / (sm.length - 1);
    fine.push(onSurface(f, sm[i][0], sm[i][1], radiusAt(t) + CORONARY_LIFT));
  }
  return fine;
}

const spec = (id: VesselId) => CORONARY.find((c) => c.id === id)!;

/** Find (v, φ) knots of a vessel sample by nearest LAD knot interpolation (used for diagonals). */
function ladParamAt(s: number, ladLen: number): [number, number] {
  const k = spec('LAD').surfacePath;
  // Approximate: parameter proportional to arc length along the knot polyline.
  const kp = k.map(([v, a]) => [v, a, 0] as Vec3);
  const sl = arcLengths(kp);
  const target = (s / ladLen) * sl[sl.length - 1];
  for (let i = 1; i < kp.length; i++) {
    if (sl[i] >= target) {
      const t = (target - sl[i - 1]) / (sl[i] - sl[i - 1] || 1);
      return [lerp(k[i - 1][0], k[i][0], t), lerp(k[i - 1][1], k[i][1], t)];
    }
  }
  return k[k.length - 1];
}

export function buildAnatomy(): Anatomy {
  const f = heartFrame();
  const vessels = {} as Record<VesselId, Vessel>;

  // --- Left system bifurcation & LM -------------------------------------
  const lad = spec('LAD');
  const lcx = spec('LCx');
  const bifV = lad.surfacePath[0][0] - 1;
  const bifA = (lad.surfacePath[0][1] + lcx.surfacePath[0][1]) / 2;
  const lmSpec = spec('LM');
  const bif = onSurface(f, bifV, bifA, lmSpec.dDist / 2 + CORONARY_LIFT);
  // LM runs from the aorta toward the bifurcation: from base-ward, right and slightly posterior.
  const lmDir = norm(add(add(scale(f.axis, -0.55), scale(f.lateral, -0.72)), scale(f.anterior, -0.18)));
  const leftOstium = add(bif, scale(lmDir, LM_LENGTH));
  const rootCentre = add(leftOstium, scale(norm(add(lmDir, [0, 0.15, -0.1])), AORTA.sinusRadius));
  const lmMid = add(lerp3(leftOstium, bif, 0.5), scale(f.anterior, 0.8));
  const lmPts = resample(catmullRom([leftOstium, lmMid, bif], 12), CORONARY_STEP);
  vessels.LM = makeVessel(
    'LM',
    lmSpec.name,
    lmSpec.info,
    null,
    0,
    lmPts,
    (s, L) => lerp(lmSpec.dProx, lmSpec.dDist, s / L),
    () => 1,
    true,
  );
  const lmLen = vessels.LM.length;

  // --- LAD ----------------------------------------------------------------
  const ladRadius = (t: number) => interpKnots(LAD_DIAMETER_KNOTS, t * 130) / 2;
  const ladSurf = surfacePath(f, lad.surfacePath, ladRadius);
  const ladPts = resample([bif, ...ladSurf], CORONARY_STEP);
  vessels.LAD = makeVessel(
    'LAD',
    lad.name,
    lad.info,
    'LM',
    lmLen,
    ladPts,
    (s) => interpKnots(LAD_DIAMETER_KNOTS, s),
    () => 1,
    true,
    lad.wireAngle,
  );

  // --- LCx ----------------------------------------------------------------
  const lcxSurf = surfacePath(f, lcx.surfacePath, (t) => lerp(lcx.dProx, lcx.dDist, t) / 2);
  vessels.LCx = makeVessel(
    'LCx',
    lcx.name,
    lcx.info,
    'LM',
    lmLen,
    resample([bif, ...lcxSurf], CORONARY_STEP),
    (s, L) => lerp(lcx.dProx, lcx.dDist, s / L),
    () => 1,
    true,
    lcx.wireAngle,
  );

  // --- Diagonals ------------------------------------------------------------
  for (const id of ['D1', 'D2'] as const) {
    const sp = spec(id);
    const dg = DIAGONALS[id];
    const ladS = sp.branchAt;
    const start = sampleAt(vessels.LAD, ladS);
    const [v0, a0] = ladParamAt(ladS, vessels.LAD.length);
    const knots: [number, number][] = [];
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = (dg.length * i) / steps;
      const r = 40;
      knots.push([v0 + dg.apicalDrift * t, a0 + ((dg.lateralSweep * t) / r) * (180 / Math.PI)]);
    }
    const surf = surfacePath(f, [[v0 + 0.5, a0 - 2], ...knots], (t) => lerp(sp.dProx, sp.dDist, t) / 2);
    // Skip the first few samples so the branch leaves the LAD smoothly.
    const pts = resample([start, ...surf.slice(10)], CORONARY_STEP);
    vessels[id] = makeVessel(
      id,
      sp.name,
      sp.info,
      'LAD',
      ladS,
      pts,
      (s, L) => lerp(sp.dProx, sp.dDist, s / L),
      () => 1,
      true,
      sp.wireAngle,
    );
  }

  // --- Aorta ----------------------------------------------------------------
  const aortaCtrl = AORTA.path.map((o) => add(rootCentre, o));
  const aortaPts = resample(catmullRom(aortaCtrl, 16), ACCESS.step);
  const aortaS = arcLengths(aortaPts);
  const archStartS = nearestS(aortaPts, aortaS, aortaCtrl[2]);
  const descS = nearestS(aortaPts, aortaS, aortaCtrl[6]);
  const rootAxis = norm(sub(aortaPts[6], aortaPts[0]));
  vessels.aorta = makeVessel(
    'aorta',
    'Aorta',
    'Aortic root, ascending aorta, arch and descending aorta. The guide catheter travels down the ascending aorta to the root.',
    null,
    0,
    aortaPts,
    (s) => {
      if (s < 12) return 2 * lerp(AORTA.rootRadius, AORTA.ascendingRadius, s / 12);
      if (s < archStartS) return 2 * AORTA.ascendingRadius;
      if (s < descS) return 2 * lerp(AORTA.ascendingRadius, AORTA.archRadius, (s - archStartS) / (descS - archStartS));
      return 2 * AORTA.descendingRadius;
    },
    (p) => aorticBeatWeight(p, rootCentre),
    false,
  );

  // --- RCA ----------------------------------------------------------------
  const rca = spec('RCA');
  const rcaSurf = surfacePath(f, rca.surfacePath, (t) => lerp(rca.dProx, rca.dDist, t) / 2);
  const rightOstium = add(rootCentre, scale(cuspDir(rootCentre, rootAxis, leftOstium, GUIDE.rightCuspAngle), AORTA.sinusRadius));
  const rcaLead = add(rightOstium, scale(norm(sub(rightOstium, rootCentre)), 6));
  vessels.RCA = makeVessel(
    'RCA',
    rca.name,
    rca.info,
    null,
    0,
    resample(catmullRom([rightOstium, rcaLead, ...rcaSurf.filter((_, i) => i % 12 === 0), rcaSurf[rcaSurf.length - 1]], 10), CORONARY_STEP),
    (s, L) => lerp(rca.dProx, rca.dDist, s / L),
    () => 1,
    true,
  );

  // --- Access path ------------------------------------------------------------
  const accessPts: Vec3[] = [];
  let elbow = 0;
  for (const seg of ACCESS.segments) {
    const ctrl = seg.points.map((o) => add(rootCentre, o));
    const pts = resample(catmullRom(ctrl, 12), ACCESS.step);
    vessels[seg.id as VesselId] = makeVessel(
      seg.id as VesselId,
      seg.name,
      seg.info,
      null,
      0,
      pts,
      () => seg.radius * 2,
      () => 0,
      false,
    );
    if (accessPts.length) pts.shift();
    accessPts.push(...pts);
    if (seg.id === 'radial') elbow = arcLengths(accessPts).at(-1)!;
  }
  const aortaEntry = arcLengths(accessPts).at(-1)!;
  // Down the ascending aorta from the brachiocephalic junction to just above the valve.
  const joinIdx = nearestIndex(aortaPts, aortaCtrl[AORTA.brachioJoinIndex]);
  const down = aortaPts.slice(0, joinIdx + 1).reverse();
  const rootStop = add(rootCentre, scale(rootAxis, 9));
  // Replace the last few samples so the rail ends a little above the valve plane.
  const trimmed = down.filter((p) => dist(p, rootCentre) > 12);
  trimmed.push(rootStop);
  const accessAll = resample([...accessPts, ...trimmed.slice(1)], ACCESS.step);
  const access = buildRail(
    accessAll,
    accessAll.map((p) => aorticBeatWeight(p, rootCentre)),
  );

  // Children lists
  for (const v of Object.values(vessels)) {
    if (v.parent) vessels[v.parent].children.push(v.id);
  }
  for (const v of Object.values(vessels)) v.children.sort((a, b) => vessels[a].branchAt - vessels[b].branchAt);

  return {
    frame: f,
    vessels,
    rootCentre,
    rootAxis,
    leftOstium,
    rightOstium,
    access,
    landmarks: { elbow, aortaEntry, root: access.length },
  };
}

/** Unit direction in the aortic-root plane for rotation θ (deg); 0 = toward the left ostium. */
export function cuspDir(root: Vec3, axis: Vec3, leftOstium: Vec3, angleDeg: number): Vec3 {
  const toL = sub(leftOstium, root);
  const ref = norm(sub(toL, scale(axis, dot(toL, axis))));
  return rotateAround(ref, axis, -(angleDeg * Math.PI) / 180);
}

function nearestIndex(pts: Vec3[], q: Vec3): number {
  let best = 0;
  let bd = Infinity;
  pts.forEach((p, i) => {
    const d = dist(p, q);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function nearestS(pts: Vec3[], s: number[], q: Vec3): number {
  return s[nearestIndex(pts, q)];
}

/** Index of the last sample with s ≤ x. */
export function indexAt(s: number[], x: number): number {
  if (x <= s[0]) return 0;
  if (x >= s[s.length - 1]) return s.length - 2;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Interpolated point at arc length x along a polyline. */
export function pointAt(pts: Vec3[], s: number[], x: number): Vec3 {
  const i = indexAt(s, x);
  const t = clamp((x - s[i]) / (s[i + 1] - s[i] || 1), 0, 1);
  return lerp3(pts[i], pts[i + 1], t);
}

export function tangentAt(pts: Vec3[], s: number[], x: number): Vec3 {
  const i = indexAt(s, x);
  return norm(sub(pts[i + 1], pts[i]));
}

export function sampleAt(v: Vessel, x: number): Vec3 {
  return pointAt(v.pts, v.s, clamp(x, 0, v.length));
}

/** Interpolated per-sample value at arc length x. */
export function valueAt(arr: ArrayLike<number>, s: number[], x: number): number {
  const i = indexAt(s, x);
  const t = clamp((x - s[i]) / (s[i + 1] - s[i] || 1), 0, 1);
  const a = arr[i];
  const b = arr[i + 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return t < 0.5 ? a : b;
  return a + (b - a) * t;
}

export function railPoint(r: Rail, x: number): Vec3 {
  return pointAt(r.pts, r.s, clamp(x, 0, r.length));
}
