/**
 * Angiography: which vessels fill with contrast from the injection point, given the current
 * occlusions, and the eTICI reperfusion grade of the left MCA territory. Pure.
 */
import { descendants, type Tree } from './anatomy';

export interface Occlusion {
  seg: string;
  /** Arc length (mm) along the segment where the vessel is blocked. */
  u: number;
  kind: 'clot' | 'residual' | 'embolus' | 'new-territory';
  /** Length of the occluding thrombus (mm). */
  len: number;
}

export const MCA_BRANCHES = ['m3a', 'm3b', 'm3c', 'm3d', 'm3e', 'm3f'];

/** Fraction of the left MCA territory with antegrade flow (0..1). */
export function perfusedFraction(tree: Tree, occ: Occlusion[]): number {
  const open = branchOpen(tree, occ);
  return Math.min(1, MCA_BRANCHES.reduce((f, id) => f + tree.segs[id].territory * open[id], 0));
}

export type ETici = '0' | '1' | '2a' | '2b50' | '2b67' | '2c' | '3';
export const ETICI_ORDER: ETici[] = ['0', '1', '2a', '2b50', '2b67', '2c', '3'];

/** Expanded TICI from the perfused fraction of the target territory. */
export function eTici(f: number): ETici {
  if (f <= 0.001) return '0';
  if (f < 0.1) return '1';
  if (f < 0.5) return '2a';
  if (f < 0.67) return '2b50';
  if (f < 0.9) return '2b67';
  if (f < 0.999) return '2c';
  return '3';
}

export const ETICI_TEXT: Record<ETici, string> = {
  '0': 'No reperfusion beyond the occlusion',
  '1': 'Contrast passes the clot but fills little or no distal territory',
  '2a': 'Reperfusion of < 50% of the territory',
  '2b50': 'Reperfusion of 50–66% of the territory',
  '2b67': 'Reperfusion of 67–89% of the territory',
  '2c': 'Near-complete (90–99%): a few small distal emboli',
  '3': 'Complete reperfusion of the whole territory',
};

/** Successful reperfusion is conventionally eTICI ≥ 2b50. */
export const isSuccess = (g: ETici) => ETICI_ORDER.indexOf(g) >= ETICI_ORDER.indexOf('2b50');

/**
 * Contrast reach: for each segment downstream of the injection, the path distance (mm) from the
 * catheter tip to the segment's start, and how far along the segment contrast can get.
 */
export function contrastReach(tree: Tree, inj: { seg: string; u: number }, occ: Occlusion[]): Record<string, { d0: number; from: number; to: number }> {
  const out: Record<string, { d0: number; from: number; to: number }> = {};
  const limit = (id: string, from: number) => {
    let to = tree.segs[id].length;
    for (const o of occ) if (o.seg === id && o.u >= from) to = Math.min(to, o.u);
    return to;
  };
  const walk = (id: string, d0: number, from: number) => {
    const to = limit(id, from);
    out[id] = { d0, from, to };
    if (to < tree.segs[id].length - 0.01) return;
    for (const k of tree.segs[id].children) walk(k, d0 + (to - from), 0);
  };
  walk(inj.seg, 0, inj.u);
  return out;
}

/** How much of each MCA cortical branch still has antegrade flow (0..1). */
export function branchOpen(tree: Tree, occ: Occlusion[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of MCA_BRANCHES) {
    const seg = tree.segs[id];
    let open = 1;
    for (const o of occ) {
      if (o.seg === id) open = Math.min(open, o.u / seg.length);
      else if (descendants(tree, o.seg).includes(id)) open = 0;
    }
    out[id] = open;
  }
  return out;
}
