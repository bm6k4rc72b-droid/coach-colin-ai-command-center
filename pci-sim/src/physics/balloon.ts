/**
 * Balloon and stent-delivery catheters riding over the wire. Semi-compliant pressure–diameter
 * model, inflation records, rupture, stent deployment.
 */
import { BALLOON, INFLATION, STENT, type DeviceSpec } from '../config/anatomy';
import { clamp } from '../anatomy/math';
import type { Msg } from './messages';

/** Diameter (mm) of a semi-compliant balloon at pressure P (atm). */
export function balloonDiameter(spec: DeviceSpec, nominalD: number, P: number): number {
  const at = (p: number) => nominalD * (1 + spec.compliance * (p - spec.nominal));
  if (P <= 0) return INFLATION.foldedDiameter;
  if (P < INFLATION.unfoldPressure) {
    const t = P / INFLATION.unfoldPressure;
    return INFLATION.foldedDiameter + (at(INFLATION.unfoldPressure) - INFLATION.foldedDiameter) * t * t;
  }
  return at(P);
}

export const specFor = (kind: 'balloon' | 'stent'): DeviceSpec => (kind === 'balloon' ? BALLOON : STENT);
export const rupturePressure = (spec: DeviceSpec) => spec.rbp + INFLATION.ruptureMargin;

export interface InflationRecord {
  kind: 'balloon' | 'stent';
  /** Path range of the working length (distal end = pos). */
  pos: number;
  length: number;
  maxPressure: number;
  maxDiameter: number;
  duration: number;
  start: number;
}

export interface CatheterState {
  kind: 'balloon' | 'stent';
  nominalD: number;
  length: number;
  /** Path distance of the distal end of the working length. */
  pos: number;
  pressure: number;
  deflating: boolean;
  ruptured: boolean;
  /** Stent left behind in the vessel (stent catheters only). */
  deployed: boolean;
  /** Time inflated above the occlusive pressure in the current inflation. */
  inflationTime: number;
  maxPressure: number;
  maxDiameter: number;
  warnedRBP: boolean;
  inflationStart: number;
}

export function newCatheter(kind: 'balloon' | 'stent', nominalD: number, length: number): CatheterState {
  return {
    kind,
    nominalD,
    length,
    pos: INFLATION.loadPosition,
    pressure: 0,
    deflating: false,
    ruptured: false,
    deployed: false,
    inflationTime: 0,
    maxPressure: 0,
    maxDiameter: 0,
    warnedRBP: false,
    inflationStart: 0,
  };
}

export const catheterDiameter = (c: CatheterState) =>
  c.ruptured ? INFLATION.foldedDiameter : balloonDiameter(specFor(c.kind), c.nominalD, c.pressure);

export const isInflated = (c: CatheterState) => c.pressure > 0.05;
export const isOccluding = (c: CatheterState) => c.pressure >= INFLATION.occlusivePressure && !c.ruptured;

export interface CatheterStepInput {
  move: number;
  inflate: boolean;
  fine: boolean;
  deflate: boolean;
  dt: number;
  now: number;
  /** Wire tip path distance (catheter must stay behind it). */
  wireTip: number;
  /** Guide tip path distance (the catheter is "in the guide" behind this). */
  guideTip: number;
}

export interface CatheterStepResult {
  state: CatheterState;
  messages: Msg[];
  withdrawn: boolean;
  ruptured: boolean;
  deployedNow: boolean;
  /** Completed inflation (pressure fell back below the occlusive level). */
  record: InflationRecord | null;
}

/** Can a new size be chosen? Only while the catheter is still inside the guide. */
export const canResize = (c: CatheterState, guideTip: number) => c.pos <= guideTip - c.length && !c.deployed;

export function stepCatheter(c0: CatheterState, inp: CatheterStepInput): CatheterStepResult {
  const c: CatheterState = { ...c0 };
  const messages: Msg[] = [];
  const spec = specFor(c.kind);
  let withdrawn = false;
  let ruptured = false;
  let deployedNow = false;
  let record: InflationRecord | null = null;
  const label = c.kind === 'balloon' ? 'balloon' : 'stent balloon';

  if (inp.move !== 0) {
    if (isInflated(c)) {
      messages.push({ level: 'warn', text: `Deflate the ${label} before moving it.` });
    } else if (inp.move > 0) {
      const maxPos = inp.wireTip - INFLATION.wireLead;
      if (c.pos + inp.move > maxPos) {
        if (c.pos < maxPos) c.pos = maxPos;
        messages.push({ level: 'warn', text: 'The catheter must stay well behind the wire tip — advance the wire further first.' });
      } else c.pos += inp.move;
    } else {
      c.pos += inp.move;
      if (c.pos < INFLATION.loadPosition) {
        withdrawn = true;
        c.pos = INFLATION.loadPosition;
      }
    }
  }

  const outside = c.pos - c.length > inp.guideTip - 0.5;
  if (inp.deflate && isInflated(c)) c.deflating = true;
  if (inp.inflate && !c.ruptured) {
    if (!outside) {
      messages.push({ level: 'warn', text: `The ${label} is still inside the guide — advance it into the vessel first.` });
    } else {
      c.deflating = false;
      c.pressure += (inp.fine ? INFLATION.fineRate : INFLATION.rate) * inp.dt;
    }
  }
  if (inp.inflate && c.ruptured) messages.push({ level: 'warn', text: 'This balloon has ruptured — withdraw it.' });
  if (c.deflating) {
    c.pressure = Math.max(0, c.pressure - INFLATION.deflateRate * inp.dt);
    if (c.pressure === 0) c.deflating = false;
  }
  if (c.pressure > spec.rbp && !c.warnedRBP) {
    c.warnedRBP = true;
    messages.push({ level: 'warn', text: `Above rated burst pressure (${spec.rbp} atm) — rupture risk.` });
  }
  if (c.pressure >= rupturePressure(spec)) {
    c.ruptured = true;
    ruptured = true;
    c.pressure = 0;
    c.deflating = false;
    messages.push({ level: 'danger', text: `Balloon RUPTURE at ${rupturePressure(spec)} atm! Withdraw it and take an angiogram.` });
  }
  c.pressure = clamp(c.pressure, 0, 40);

  const d = catheterDiameter(c);
  if (isOccluding(c)) {
    if (c0.pressure < INFLATION.occlusivePressure || c0.ruptured) {
      c.inflationTime = 0;
      c.maxPressure = 0;
      c.maxDiameter = 0;
      c.inflationStart = inp.now;
    }
    c.inflationTime += inp.dt;
  }
  if (c.pressure > 0.05) {
    c.maxPressure = Math.max(c.maxPressure, c.pressure);
    c.maxDiameter = Math.max(c.maxDiameter, d);
  }
  if (c.kind === 'stent' && !c.deployed && c.pressure >= INFLATION.stentDeployPressure) {
    c.deployed = true;
    deployedNow = true;
    messages.push({ level: 'ok', text: 'Stent deployed — it now stays in the artery. Finish the inflation, then deflate.' });
  }
  const wasOcc = c0.pressure >= INFLATION.occlusivePressure && !c0.ruptured;
  if (wasOcc && (!isOccluding(c) || ruptured)) {
    record = {
      kind: c.kind,
      pos: c.pos,
      length: c.length,
      maxPressure: c.maxPressure,
      maxDiameter: c.maxDiameter,
      duration: c.inflationTime,
      start: c.inflationStart,
    };
  }
  if (c.pressure === 0) c.warnedRBP = false;
  return { state: c, messages, withdrawn, ruptured, deployedNow, record };
}
