/**
 * Arterial tree from the descending aorta to the left MCA cortical branches, as smoothed
 * centrelines with radii. Millimetres; x = patient's left, y = cranial, z = anterior.
 * Simplified teaching geometry, not a patient scan. Pure and unit tested.
 */
import type { ArchType } from '../config/cases';

export type V3 = [number, number, number];

export interface Seg {
  id: string;
  name: string;
  parent: string | null;
  /** Tip rotation (deg) that selects this branch at its parent's end. */
  angle: number;
  pts: V3[];
  /** Cumulative arc length at each point. */
  s: number[];
  length: number;
  r0: number;
  r1: number;
  children: string[];
  /** Share of the left MCA territory this branch supplies (cortical branches only). */
  territory: number;
}

interface Def {
  id: string;
  name: string;
  parent: string | null;
  angle?: number;
  ctrl: V3[];
  r: [number, number];
  territory?: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Centripetal-ish Catmull–Rom through control points, ~1 mm spacing. */
export function smooth(ctrl: V3[], step = 1): V3[] {
  if (ctrl.length < 2) return ctrl;
  const p = [sub(ctrl[0], sub(ctrl[1], ctrl[0])), ...ctrl, (() => {
    const n = ctrl.length;
    const d = sub(ctrl[n - 1], ctrl[n - 2]);
    return [ctrl[n - 1][0] + d[0], ctrl[n - 1][1] + d[1], ctrl[n - 1][2] + d[2]] as V3;
  })()];
  const out: V3[] = [ctrl[0]];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const n = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (j: number) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1), c(2)]);
    }
  }
  return out;
}

function defs(arch: ArchType): Def[] {
  // Higher arch types: the great vessels arise lower down the curve, below the apex.
  const a = (arch - 1) * 9;
  return [
    { id: 'desc', name: 'Descending aorta', parent: null, ctrl: [[22, -170, -36], [22, -110, -36], [21, -55, -33], [18, -24 - a, -26]], r: [11, 11] },
    { id: 'arch1', name: 'Aortic arch', parent: 'desc', angle: 180, ctrl: [[14, -10 + a * 0.2, -16], [7, -4 + a * 0.6, -6]], r: [12, 12] },
    { id: 'arch2', name: 'Aortic arch', parent: 'arch1', angle: 180, ctrl: [[-2, -3 + a * 0.6, 3], [-9, -7, 9]], r: [12, 12] },
    { id: 'asc', name: 'Ascending aorta', parent: 'arch2', angle: 180, ctrl: [[-15, -16, 14], [-18, -40, 16], [-16, -75, 14]], r: [14, 14] },
    { id: 'lsa', name: 'Left subclavian artery', parent: 'desc', angle: 0, ctrl: [[22, -8 - a, -24], [36, 2, -22], [58, 6, -20]], r: [4.5, 4] },
    { id: 'lcca', name: 'Left common carotid', parent: 'arch1', angle: 0, ctrl: [[9, 14, -4], [18, 60, 0], [24, 108, 4]], r: [3.7, 3.5] },
    { id: 'bct', name: 'Brachiocephalic trunk', parent: 'arch2', angle: 0, ctrl: [[-12, 10, 7], [-18, 32, 5]], r: [6, 5.5] },
    { id: 'rsa', name: 'Right subclavian artery', parent: 'bct', angle: 180, ctrl: [[-34, 36, 2], [-56, 32, 0]], r: [4.5, 4] },
    { id: 'rcca', name: 'Right common carotid', parent: 'bct', angle: 0, ctrl: [[-23, 70, 4], [-25, 110, 6]], r: [3.6, 3.5] },
    { id: 'eca', name: 'Left external carotid', parent: 'lcca', angle: 180, ctrl: [[28, 124, 13], [33, 150, 24]], r: [2.3, 1.8] },
    {
      id: 'ica',
      name: 'Left internal carotid',
      parent: 'lcca',
      angle: 0,
      ctrl: [[24, 124, -2], [23, 150, -4], [22, 170, -3], [21, 180, 4], [18, 184, 16], [16, 189, 23], [15, 195, 27], [15, 203, 29], [14, 210, 24], [14, 215, 17]],
      r: [2.5, 1.9],
    },
    { id: 'm1', name: 'Left M1 (MCA)', parent: 'ica', angle: 0, ctrl: [[23, 217, 16], [32, 219, 14], [41, 220, 12]], r: [1.5, 1.3] },
    { id: 'a1', name: 'Left A1 (ACA)', parent: 'ica', angle: 180, ctrl: [[9, 218, 20], [3, 219, 24]], r: [1.2, 1.1] },
    { id: 'a2', name: 'Left A2 (pericallosal)', parent: 'a1', angle: 0, ctrl: [[2, 228, 34], [2, 246, 43], [2, 266, 40], [2, 282, 22]], r: [1, 0.8] },
    { id: 'm2s', name: 'Superior M2 trunk', parent: 'm1', angle: 0, ctrl: [[45, 226, 10], [48, 236, 5], [50, 246, 0]], r: [1.1, 0.95] },
    { id: 'm2i', name: 'Inferior M2 trunk', parent: 'm1', angle: 180, ctrl: [[46, 214, 8], [50, 208, 0], [52, 204, -10]], r: [1.1, 0.95] },
    { id: 'm3a', name: 'Frontal M3', parent: 'm2s', angle: 0, ctrl: [[57, 253, 16], [62, 263, 32], [61, 276, 48]], r: [0.75, 0.5], territory: 0.19 },
    { id: 'm3b', name: 'Precentral M3', parent: 'm2s', angle: 120, ctrl: [[58, 258, 1], [62, 272, -1], [61, 287, -3]], r: [0.75, 0.5], territory: 0.18 },
    { id: 'm3c', name: 'Parietal M3', parent: 'm2s', angle: 240, ctrl: [[58, 251, -16], [63, 262, -32], [61, 273, -48]], r: [0.75, 0.5], territory: 0.17 },
    { id: 'm3d', name: 'Anterior temporal M3', parent: 'm2i', angle: 0, ctrl: [[59, 206, 2], [64, 199, 14], [64, 191, 28]], r: [0.7, 0.5], territory: 0.13 },
    { id: 'm3e', name: 'Posterior temporal M3', parent: 'm2i', angle: 120, ctrl: [[59, 203, -22], [64, 197, -38], [62, 191, -55]], r: [0.7, 0.5], territory: 0.17 },
    { id: 'm3f', name: 'Angular M3', parent: 'm2i', angle: 240, ctrl: [[59, 214, -27], [63, 226, -45], [60, 237, -61]], r: [0.7, 0.5], territory: 0.16 },
  ];
}

export interface Tree {
  segs: Record<string, Seg>;
  order: string[];
}

export function buildTree(arch: ArchType = 1): Tree {
  const segs: Record<string, Seg> = {};
  const order: string[] = [];
  for (const d of defs(arch)) {
    const start = d.parent ? segs[d.parent].pts[segs[d.parent].pts.length - 1] : null;
    const pts = smooth(start ? [start, ...d.ctrl] : d.ctrl);
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
    segs[d.id] = { id: d.id, name: d.name, parent: d.parent, angle: d.angle ?? 0, pts, s, length: s[s.length - 1], r0: d.r[0], r1: d.r[1], children: [], territory: d.territory ?? 0 };
    if (d.parent) segs[d.parent].children.push(d.id);
    order.push(d.id);
  }
  return { segs, order };
}

/** Point and radius at arc length u along a segment. */
export function pointOn(seg: Seg, u: number): { p: V3; r: number } {
  const x = Math.max(0, Math.min(seg.length, u));
  let i = 1;
  while (i < seg.s.length - 1 && seg.s[i] < x) i++;
  const t = (x - seg.s[i - 1]) / (seg.s[i] - seg.s[i - 1] || 1);
  return { p: lerp3(seg.pts[i - 1], seg.pts[i], t), r: seg.r0 + (seg.r1 - seg.r0) * (x / seg.length) };
}

/** Angular distance between two angles in degrees (0..180). */
export const angDiff = (a: number, b: number) => {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
};

/** Which child the tip will enter at a junction, given its rotation. */
export function choose(tree: Tree, segId: string, tipAngle: number): string | null {
  const kids = tree.segs[segId].children;
  if (!kids.length) return null;
  return kids.reduce((best, k) => (angDiff(tree.segs[k].angle, tipAngle) < angDiff(tree.segs[best].angle, tipAngle) ? k : best), kids[0]);
}

/** All descendants of a segment (inclusive). */
export function descendants(tree: Tree, id: string): string[] {
  const out = [id];
  for (const k of tree.segs[id].children) out.push(...descendants(tree, k));
  return out;
}

/** The path of segment ids from the root to a target. */
export function pathTo(tree: Tree, id: string): string[] {
  const p: string[] = [];
  for (let c: string | null = id; c; c = tree.segs[c].parent) p.unshift(c);
  return p;
}

/** Friendly description of the branches at a junction. */
export const BRANCH_HINT: Record<string, string> = {
  desc: 'tip up → left subclavian · tip down → follow the arch',
  arch1: 'tip up → LEFT COMMON CAROTID · tip down → follow the arch',
  arch2: 'tip up → brachiocephalic · tip down → ascending aorta',
  lcca: 'tip back (0°) → INTERNAL carotid · tip forward (180°) → external carotid',
  bct: 'tip up → right carotid · tip down → right subclavian',
  ica: 'tip lateral (0°) → M1 · tip medial (180°) → A1',
  m1: 'tip up (0°) → superior M2 · tip down (180°) → inferior M2',
  m2s: 'cortical M3 branches — small and fragile',
  m2i: 'cortical M3 branches — small and fragile',
  a1: 'A2',
};
