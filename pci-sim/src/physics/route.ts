/**
 * 1D "rail" model through the coronary tree. A path is a list of legs; path distance d is
 * measured from the LM ostium (d < 0 is inside the guide catheter).
 */
import { WIRE, type Vec3 } from '../config/anatomy';
import { angleDiff, clamp } from '../anatomy/math';
import { pointAt, type Anatomy, type VesselId } from '../anatomy/vessels';

export interface Leg {
  vessel: VesselId;
  /** Arc length on the vessel where this leg starts. */
  from: number;
  /** Path distance at which this leg starts. */
  offset: number;
}

export const initialLegs = (): Leg[] => [{ vessel: 'LM', from: 0, offset: 0 }];

export interface Locus {
  vessel: VesselId;
  s: number;
  leg: number;
}

/** Vessel and arc length at path distance d. */
export function locate(anat: Anatomy, legs: Leg[], d: number): Locus {
  let li = 0;
  for (let i = legs.length - 1; i >= 0; i--) {
    if (d >= legs[i].offset) {
      li = i;
      break;
    }
  }
  const leg = legs[li];
  const v = anat.vessels[leg.vessel];
  return { vessel: leg.vessel, s: clamp(leg.from + (d - leg.offset), -1e3, v.length), leg: li };
}

/** World (rest) position at path distance d ≥ 0. */
export function pathPoint(anat: Anatomy, legs: Leg[], d: number): Vec3 {
  const l = locate(anat, legs, Math.max(0, d));
  const v = anat.vessels[l.vessel];
  return pointAt(v.pts, v.s, clamp(l.s, 0, v.length));
}

/** Polyline of the path from d0 to d1 (rest positions) sampled every `step` mm. */
export function pathPolyline(anat: Anatomy, legs: Leg[], d0: number, d1: number, step = 0.5): Vec3[] {
  const out: Vec3[] = [];
  if (d1 <= d0) return out;
  const n = Math.max(1, Math.ceil((d1 - d0) / step));
  for (let i = 0; i <= n; i++) out.push(pathPoint(anat, legs, d0 + ((d1 - d0) * i) / n));
  return out;
}

export interface BranchDecision {
  at: VesselId;
  chosen: VesselId;
  wasSideBranch: boolean;
}

export interface AdvanceResult {
  legs: Leg[];
  d: number;
  decisions: BranchDecision[];
  hitEnd: boolean;
}

/** Child chosen at a terminal bifurcation (closest steering angle). */
export function chooseTerminal(anat: Anatomy, kids: VesselId[], angle: number): VesselId {
  let best = kids[0];
  let bd = Infinity;
  for (const k of kids) {
    const diff = Math.abs(angleDiff(angle, anat.vessels[k].wireAngle));
    if (diff < bd) {
      bd = diff;
      best = k;
    }
  }
  return best;
}

/** Does the tip at `angle` get captured by a side branch? */
export function capturesSideBranch(anat: Anatomy, branch: VesselId, angle: number): boolean {
  return Math.abs(angleDiff(angle, anat.vessels[branch].wireAngle)) < WIRE.sideBranchCapture;
}

/**
 * Move a tip along the tree by `delta` mm, choosing branches by tip rotation.
 * Retracting past a branch point forgets that choice.
 */
export function advanceAlongTree(
  anat: Anatomy,
  legsIn: Leg[],
  dIn: number,
  delta: number,
  angle: number,
  dMin: number,
): AdvanceResult {
  const legs = legsIn.map((l) => ({ ...l }));
  let d = dIn;
  let remaining = delta;
  const decisions: BranchDecision[] = [];
  let hitEnd = false;
  let guard = 0;
  while (Math.abs(remaining) > 1e-9 && guard++ < 50) {
    const leg = legs[legs.length - 1];
    const v = anat.vessels[leg.vessel];
    const sNow = leg.from + (d - leg.offset);
    if (remaining > 0) {
      const target = sNow + remaining;
      // Next decision point strictly ahead of the tip.
      const ahead = v.children
        .map((c) => ({ id: c, at: Math.min(anat.vessels[c].branchAt, v.length) }))
        .filter((c) => c.at > sNow + 1e-9 && c.at <= target);
      if (ahead.length === 0) {
        if (target >= v.length) {
          d += v.length - sNow;
          remaining = 0;
          hitEnd = true;
        } else {
          d += remaining;
          remaining = 0;
        }
        continue;
      }
      const at = ahead[0].at;
      const group = ahead.filter((c) => Math.abs(c.at - at) < 1e-6).map((c) => c.id);
      const terminal = at >= v.length - 1e-6;
      d += at - sNow;
      remaining -= at - sNow;
      let chosen: VesselId | null = null;
      if (terminal) chosen = chooseTerminal(anat, group, angle);
      else chosen = group.find((g) => capturesSideBranch(anat, g, angle)) ?? null;
      if (chosen) {
        legs.push({ vessel: chosen, from: 0, offset: d });
        decisions.push({ at: v.id, chosen, wasSideBranch: !terminal });
      } else {
        decisions.push({ at: v.id, chosen: v.id, wasSideBranch: false });
        // Nudge past the branch point so it is not reconsidered.
        if (remaining <= 1e-9) {
          remaining = 0;
        }
      }
    } else {
      const target = d + remaining;
      if (legs.length > 1 && target < leg.offset) {
        remaining = target - (leg.offset - 1e-6);
        d = leg.offset - 1e-6;
        legs.pop();
        continue;
      }
      d = Math.max(dMin, target);
      remaining = 0;
    }
  }
  return { legs, d, decisions, hitEnd };
}

/** Upcoming decision point within `look` mm, if any. */
export function upcomingBranch(
  anat: Anatomy,
  legs: Leg[],
  d: number,
  look = WIRE.hintDistance,
): { at: VesselId; options: VesselId[]; distance: number; terminal: boolean } | null {
  const leg = legs[legs.length - 1];
  const v = anat.vessels[leg.vessel];
  const sNow = leg.from + (d - leg.offset);
  const ahead = v.children
    .map((c) => ({ id: c, at: Math.min(anat.vessels[c].branchAt, v.length) }))
    .filter((c) => c.at > sNow + 1e-6 && c.at - sNow <= look)
    .sort((a, b) => a.at - b.at);
  if (!ahead.length) return null;
  const at = ahead[0].at;
  const options = ahead.filter((c) => Math.abs(c.at - at) < 1e-6).map((c) => c.id);
  return { at: v.id, options, distance: at - sNow, terminal: at >= v.length - 1e-6 };
}
