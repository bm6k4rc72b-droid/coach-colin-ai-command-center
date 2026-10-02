/**
 * 0.014" coronary guidewire: exits the guide into the LM, steered at bifurcations by tip rotation,
 * buckles when pushed too fast through the lesion and builds a hidden dissection risk.
 */
import { GUIDE, WIRE } from '../config/anatomy';
import { wrapAngle } from '../anatomy/math';
import { lesionEnd, lesionStart, type LesionSpec } from '../anatomy/lumen';
import type { Anatomy, VesselId } from '../anatomy/vessels';
import type { Msg } from './messages';
import { advanceAlongTree, initialLegs, locate, type BranchDecision, type Leg } from './route';

export interface WireState {
  /** Tip path distance from the LM ostium (inside the guide when < guide depth). */
  d: number;
  angle: number;
  legs: Leg[];
  /** Smoothed commanded tip speed (mm/s). */
  speed: number;
  buckling: boolean;
  /** 0..1 resistance meter. */
  resistance: number;
  /** Hidden dissection risk 0..1 accumulated by forcing. */
  risk: number;
  crossed: boolean;
  forcingEvents: number;
  forcingTime: number;
  endWarnings: number;
  atEnd: boolean;
}

export const WIRE_MIN_D = -40;

export const initialWire = (): WireState => ({
  d: 0,
  angle: WIRE.initialRotation,
  legs: initialLegs(),
  speed: 0,
  buckling: false,
  resistance: 0,
  risk: 0,
  crossed: false,
  forcingEvents: 0,
  forcingTime: 0,
  endWarnings: 0,
  atEnd: false,
});

export const wireIsOut = (w: WireState) => w.d > GUIDE.engagedDepth + 0.5;

export interface WireStepInput {
  move: number;
  rotate: number;
  dt: number;
  /** A balloon/stent catheter is out on the wire: no retraction. */
  catheterOut: boolean;
  /** The guide is engaged (wire may leave the guide). */
  guideEngaged: boolean;
  lesion: LesionSpec;
  rng: () => number;
}

export interface WireStepResult {
  state: WireState;
  messages: Msg[];
  decisions: BranchDecision[];
  /** Crossed the lesion this step. */
  crossedNow: boolean;
  /** Crossing caused a dissection. */
  dissection: boolean;
}

export function inLesionZone(vessel: VesselId, s: number, lesion: LesionSpec): boolean {
  return vessel === 'LAD' && s >= lesionStart(lesion) - 1 && s <= lesionEnd(lesion);
}

export function stepWire(anat: Anatomy, w0: WireState, inp: WireStepInput): WireStepResult {
  const w: WireState = { ...w0, legs: w0.legs };
  const messages: Msg[] = [];
  let decisions: BranchDecision[] = [];
  let crossedNow = false;
  let dissection = false;

  if (inp.rotate !== 0) w.angle = wrapAngle(w.angle + inp.rotate);

  const k = 1 - Math.exp(-inp.dt / 0.2);
  const cmdSpeed = inp.move / Math.max(inp.dt, 1e-6);
  w.speed += (Math.max(0, cmdSpeed) - w.speed) * k;

  let move = inp.move;
  if (move < 0 && inp.catheterOut) {
    messages.push({ level: 'warn', text: 'Cannot pull the wire back while a balloon/stent is on it — withdraw the catheter first.' });
    move = 0;
  }
  if (move > 0 && !inp.guideEngaged && w.d + move > GUIDE.engagedDepth) {
    messages.push({ level: 'warn', text: 'Engage the guide in the left main before advancing the wire out.' });
    move = Math.max(0, GUIDE.engagedDepth - w.d);
  }

  const before = locate(anat, w.legs, w.d);
  const inZone = move > 0 && !w.crossed && inLesionZone(before.vessel, before.s, inp.lesion);
  if (inZone) {
    const safe = WIRE.safeLesionSpeed * (inp.rotate !== 0 ? WIRE.torqueBonus : 1);
    if (w.speed > safe) {
      if (!w.buckling) {
        w.forcingEvents++;
        messages.push({ level: 'danger', text: 'Wire buckling in the lesion — slow down (Shift) and torque gently.' });
      }
      w.buckling = true;
      w.forcingTime += inp.dt;
      w.risk = Math.min(WIRE.maxRisk, w.risk + WIRE.riskPerSecond * ((w.speed - safe) / safe) * inp.dt);
      w.resistance = Math.min(1, w.speed / (2 * safe));
      move *= WIRE.buckleProgress;
    } else {
      w.buckling = false;
      w.resistance = Math.min(0.6, 0.15 + (0.45 * w.speed) / safe);
    }
  } else {
    w.buckling = false;
    w.resistance = Math.max(0, w.resistance - inp.dt * 2);
  }

  if (move !== 0) {
    const r = advanceAlongTree(anat, w.legs, w.d, move, w.angle, WIRE_MIN_D);
    w.legs = r.legs;
    w.d = r.d;
    decisions = r.decisions;
    for (const dcs of decisions) {
      const name = anat.vessels[dcs.chosen].name;
      if (dcs.chosen === 'LCx') messages.push({ level: 'warn', text: 'The wire went into the LCx. Pull back to the LM and rotate toward the LAD.' });
      else if (dcs.wasSideBranch) messages.push({ level: 'warn', text: `Wire entered the ${name}. Pull back and rotate away from the branch.` });
      else if (dcs.chosen === 'LAD' && dcs.at === 'LM') messages.push({ level: 'ok', text: 'Wire is in the LAD.' });
    }
    const after = locate(anat, w.legs, w.d);
    const v = anat.vessels[after.vessel];
    const continues = v.children.some((c) => anat.vessels[c].branchAt >= v.length - 1e-6);
    const nearEnd = !continues && after.s >= v.length - WIRE.endWarnDistance;
    if (nearEnd && !w.atEnd) {
      w.endWarnings++;
      messages.push({ level: 'danger', text: 'Wire tip at the distal end of the vessel — perforation risk. Pull back a little.' });
    }
    w.atEnd = nearEnd;
    if (after.s >= v.length) w.d -= 0.5; // never poke through the end
    if (!w.crossed && after.vessel === 'LAD' && after.s > lesionEnd(inp.lesion)) {
      w.crossed = true;
      crossedNow = true;
      w.buckling = false;
      if (inp.rng() < w.risk) {
        dissection = true;
        messages.push({ level: 'danger', text: 'The wire crossed, but forcing it raised a dissection flap at the lesion.' });
      } else {
        messages.push({ level: 'ok', text: 'Lesion crossed. Park the wire tip in the distal LAD.' });
      }
    }
    if (w.crossed && !(after.vessel === 'LAD' && after.s > lesionStart(inp.lesion))) {
      // Pulled back proximal to the lesion: crossing has to be repeated.
      w.crossed = false;
    }
  }
  return { state: w, messages, decisions, crossedNow, dissection };
}
