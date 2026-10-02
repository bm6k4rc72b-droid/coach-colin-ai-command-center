/**
 * Coronary flow and contrast transit. Pure functions, unit tested.
 */
import { FLOW } from '../config/anatomy';
import { clamp } from '../anatomy/math';
import type { Anatomy, VesselId } from '../anatomy/vessels';
import { LEFT_TREE } from '../anatomy/vessels';

/**
 * Relative flow through a diameter stenosis (fraction 0..1).
 * 1 below 60%, falls steeply, 0 at ≥ 98%.
 */
export function flowFactor(ds: number): number {
  if (ds < FLOW.safeStenosis) return 1;
  if (ds >= FLOW.occlusiveStenosis) return 0;
  const x = (ds - FLOW.safeStenosis) / (FLOW.occlusiveStenosis - FLOW.safeStenosis);
  return 1 - x * x * x;
}

/** TIMI flow grade from a relative flow factor. */
export function timiGrade(factor: number): 0 | 1 | 2 | 3 {
  if (factor >= FLOW.timi3) return 3;
  if (factor >= FLOW.timi2) return 2;
  if (factor > FLOW.timi1) return 1;
  return 0;
}

export interface Dissection {
  vessel: VesselId;
  /** Arc-length centre of the flap. */
  s: number;
  length: number;
  sealed: boolean;
  cause: 'wire' | 'balloon' | 'stent-edge' | 'rupture';
  time: number;
}

export interface Occlusion {
  vessel: VesselId;
  /** Flow stops from this arc length onward. */
  s: number;
}

export interface FlowConditions {
  anatomy: Anatomy;
  lumen: Partial<Record<VesselId, number[]>>;
  occlusion: Occlusion | null;
  dissections: Dissection[];
}

export interface VesselFlow {
  /** Relative flow factor per sample. */
  factor: number[];
  /** Contrast front arrival time per sample (s after injection start; Infinity = never). */
  arrive: number[];
  /** Washout (tail) time per sample. */
  tail: number[];
  /** Opacification intensity for this injection (0..1). */
  intensity: number;
}

export type FlowField = Partial<Record<VesselId, VesselFlow>>;

/** Relative flow factor along every coronary (independent of injection type). */
export function computeFactors(c: FlowConditions): Partial<Record<VesselId, number[]>> {
  return transit(c, 0, 1).factors;
}

function transit(
  c: FlowConditions,
  t0: number,
  intensity: number,
  roots: VesselId[] = ['LM'],
): { field: FlowField; factors: Partial<Record<VesselId, number[]>> } {
  const field: FlowField = {};
  const factors: Partial<Record<VesselId, number[]>> = {};
  const { anatomy } = c;
  const walk = (id: VesselId, tStart: number, maxDS0: number, pen0: number, occ0: boolean) => {
    const v = anatomy.vessels[id];
    const lumen = c.lumen[id] ?? v.refD;
    const n = v.s.length;
    const factor = new Array<number>(n);
    const arrive = new Array<number>(n);
    const tail = new Array<number>(n);
    const myDiss = c.dissections.filter((d) => d.vessel === id && !d.sealed);
    let maxDS = maxDS0;
    let pen = pen0;
    let occ = occ0;
    let t = tStart;
    const passed = new Set<Dissection>();
    // State snapshots at each sample (for children).
    const snap: { t: number; maxDS: number; pen: number; occ: boolean }[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = v.s[i];
      const ds = clamp(1 - lumen[i] / v.refD[i], 0, 1);
      maxDS = Math.max(maxDS, ds);
      for (const d of myDiss) {
        if (!passed.has(d) && x >= d.s - d.length / 2) {
          passed.add(d);
          pen *= FLOW.dissectionPenalty;
        }
      }
      if (c.occlusion && c.occlusion.vessel === id && x >= c.occlusion.s) occ = true;
      const f = occ ? 0 : flowFactor(maxDS) * pen;
      factor[i] = f;
      if (i > 0) {
        const step = x - v.s[i - 1];
        t = f > 0 && Number.isFinite(t) ? t + step / (FLOW.baseSpeed * f) : Infinity;
      }
      arrive[i] = t;
      const slow = 1 + FLOW.washoutSlowing * (1 / Math.max(f, 0.08) - 1);
      tail[i] = Number.isFinite(t) ? t + FLOW.injectionDuration * slow : Infinity;
      snap[i] = { t, maxDS, pen, occ };
    }
    field[id] = { factor, arrive, tail, intensity };
    factors[id] = factor;
    for (const ch of v.children) {
      const cv = anatomy.vessels[ch];
      let k = 0;
      while (k < n - 1 && v.s[k + 1] <= cv.branchAt) k++;
      const sn = snap[k];
      walk(ch, sn.t, sn.maxDS, sn.pen, sn.occ);
    }
  };
  for (const r of roots) walk(r, t0, 0, 1, false);
  return { field, factors };
}

/** Contrast transit for a selective left-coronary injection (with slight aortic reflux). */
export function selectiveInjection(c: FlowConditions): FlowField {
  const { field } = transit(c, 0.05, 1, ['LM']);
  const ao = c.anatomy.vessels.aorta;
  const arrive = ao.s.map((s) => (s < FLOW.refluxLength ? 0.2 + s / 300 : Infinity));
  field.aorta = {
    factor: ao.s.map(() => 1),
    arrive,
    tail: arrive.map((a) => a + FLOW.injectionDuration * 0.7),
    intensity: FLOW.refluxIntensity,
  };
  return field;
}

/** Contrast transit for an aortic root flush: aorta opacifies, both coronaries fill faintly. */
export function aorticInjection(c: FlowConditions): FlowField {
  const { field } = transit(c, 0.18, FLOW.aorticCoronaryIntensity, ['LM', 'RCA']);
  const ao = c.anatomy.vessels.aorta;
  const arrive = ao.s.map((s) => s / 420);
  field.aorta = {
    factor: ao.s.map(() => 1),
    arrive,
    tail: arrive.map((a) => a + FLOW.aorticInjectionDuration + 0.5),
    intensity: 1,
  };
  return field;
}

/** Cine duration adapted to the slowest finite filling, clamped. */
export function cineLength(field: FlowField): number {
  let worst = 0;
  for (const id of [...LEFT_TREE, 'RCA', 'aorta'] as VesselId[]) {
    const f = field[id];
    if (!f) continue;
    for (const a of f.arrive) if (Number.isFinite(a)) worst = Math.max(worst, a);
  }
  return clamp(worst + FLOW.injectionDuration + 1.2, FLOW.minCine, FLOW.maxCine);
}

/** Flow factor at the distal end of a vessel (used for TIMI and perfusion). */
export function distalFactor(factors: Partial<Record<VesselId, number[]>>, id: VesselId): number {
  const f = factors[id];
  return f ? f[f.length - 1] : 1;
}
