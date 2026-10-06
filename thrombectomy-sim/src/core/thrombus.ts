/**
 * What happens on one thrombectomy pass. Probabilities are teaching values shaped by the
 * literature's direction of effect (clot composition, technique, balloon-guide flow arrest,
 * stent-retriever embedding time and coverage, catheter at the clot face, pass number).
 * Pure; the random draw is supplied by the caller.
 */
import type { ClotType } from '../config/cases';

export type Technique = 'aspiration' | 'stent' | 'combined';

export interface PassInput {
  technique: Technique;
  clot: ClotType;
  clotLength: number;
  /** Balloon guide inflated (proximal flow arrest) during retrieval. */
  flowArrest: boolean;
  /** Minutes the stent retriever was left to embed before pulling. */
  embedMinutes: number;
  /** Fraction of the clot covered by the deployed stent (stent techniques). */
  coverage: number;
  /** Aspiration catheter tip within ~2 mm of the clot face (aspiration techniques). */
  atFace: boolean;
  /** 1-based pass number. */
  pass: number;
  /** ICA-terminus clot: fragments can reach the ACA (a new territory). */
  icaT: boolean;
}

export interface PassOdds {
  complete: number;
  partial: number;
  distalEmboli: number;
  newTerritory: number;
  why: string[];
}

const BASE: Record<Technique, Record<ClotType, number>> = {
  aspiration: { red: 0.55, mixed: 0.4, white: 0.22 },
  stent: { red: 0.42, mixed: 0.42, white: 0.36 },
  combined: { red: 0.6, mixed: 0.55, white: 0.46 },
};

export function passOdds(i: PassInput): PassOdds {
  const why: string[] = [];
  let p = BASE[i.technique][i.clot];
  why.push(`${i.technique === 'aspiration' ? 'Aspiration' : i.technique === 'stent' ? 'Stent retriever' : 'Combined'} on a ${i.clot === 'red' ? 'red, soft' : i.clot === 'white' ? 'white, firm' : 'mixed'} clot: ${Math.round(p * 100)}% base`);
  const usesStent = i.technique !== 'aspiration';
  const usesAsp = i.technique !== 'stent';
  if (usesStent) {
    if (i.coverage < 0.999) {
      p *= 0.25 + 0.75 * i.coverage;
      why.push(`stent covered only ${Math.round(i.coverage * 100)}% of the clot`);
    }
    if (i.embedMinutes >= 3) {
      p += 0.05;
      why.push('waited ≥ 3 min for the stent to embed');
    } else if (i.embedMinutes < 2) {
      p -= 0.1;
      why.push('pulled before the stent could embed');
    }
  }
  if (usesAsp && !i.atFace) {
    p *= 0.45;
    why.push('aspiration catheter was not at the clot face');
  }
  if (i.flowArrest) {
    p += usesStent ? 0.08 : 0.04;
    why.push('balloon guide flow arrest');
  }
  if (i.clotLength > 14) {
    p -= 0.08;
    why.push(`long clot (${i.clotLength} mm)`);
  }
  if (i.pass > 1) {
    p -= 0.05 * (i.pass - 1);
    why.push(`pass ${i.pass}: clot remnants are harder, vessel more irritable`);
  }
  const complete = Math.max(0.03, Math.min(0.9, p));
  const rest = 1 - complete;
  const partial = rest * (usesStent ? 0.55 : 0.5);
  let emb = (i.clot === 'red' ? 0.2 : 0.13) * (i.flowArrest ? 0.5 : 1) * (usesAsp ? 0.85 : 1);
  if (!i.flowArrest) why.push('no flow arrest: more distal emboli');
  emb = Math.min(0.5, emb);
  const nt = i.icaT ? (i.flowArrest ? 0.03 : 0.1) : 0.01;
  return { complete, partial, distalEmboli: emb, newTerritory: nt, why };
}

export type PassResult = 'complete' | 'partial' | 'none';

export interface PassOutcome {
  result: PassResult;
  distalEmboli: boolean;
  newTerritory: boolean;
  odds: PassOdds;
}

/** Resolve a pass with three uniform draws in [0, 1). */
export function resolvePass(i: PassInput, r: [number, number, number]): PassOutcome {
  const odds = passOdds(i);
  const result: PassResult = r[0] < odds.complete ? 'complete' : r[0] < odds.complete + odds.partial ? 'partial' : 'none';
  return { result, distalEmboli: result !== 'none' && r[1] < odds.distalEmboli, newTerritory: result !== 'none' && r[2] < odds.newTerritory, odds };
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
