/**
 * 6F guide catheter on the access rail (wrist → aortic root) with a pre-shaped, rotatable tip.
 */
import { GUIDE } from '../config/anatomy';
import { angleDiff, wrapAngle } from '../anatomy/math';
import type { Msg } from './messages';

export interface GuideState {
  /** Tip arc length along the access rail. */
  s: number;
  /** Tip rotation (deg); 0 faces the left coronary cusp. */
  angle: number;
  engaged: boolean;
  engagedAngle: number;
  /** Smoothed advance speed (mm/s). */
  speed: number;
}

export const initialGuide = (): GuideState => ({
  s: 6,
  angle: GUIDE.initialRotation,
  engaged: false,
  engagedAngle: 0,
  speed: 0,
});

export interface GuideStepInput {
  /** Commanded movement this step (mm, + advance). */
  move: number;
  /** Rotation this step (deg). */
  rotate: number;
  dt: number;
  railLength: number;
  wireOut: boolean;
}

export interface GuideStepResult {
  state: GuideState;
  messages: Msg[];
  engagedNow: boolean;
  poppedOut: boolean;
}

export type CuspFacing = 'left' | 'right' | 'non-coronary';

export function cuspFacing(angle: number): CuspFacing {
  const dl = Math.abs(angleDiff(angle, GUIDE.leftCuspAngle));
  const dr = Math.abs(angleDiff(angle, GUIDE.rightCuspAngle));
  const dn = Math.abs(angleDiff(angle, GUIDE.nonCoronaryCuspAngle));
  if (dl <= dr && dl <= dn) return 'left';
  return dr <= dn ? 'right' : 'non-coronary';
}

export const facesLeftCusp = (angle: number) => Math.abs(angleDiff(angle, GUIDE.leftCuspAngle)) <= GUIDE.engageTolerance;

export function stepGuide(g0: GuideState, inp: GuideStepInput): GuideStepResult {
  const g = { ...g0 };
  const messages: Msg[] = [];
  let engagedNow = false;
  let poppedOut = false;
  const k = 1 - Math.exp(-inp.dt / 0.2);
  g.speed += (Math.abs(inp.move) / Math.max(inp.dt, 1e-6) - g.speed) * k;

  if ((inp.move !== 0 || inp.rotate !== 0) && inp.wireOut) {
    messages.push({
      level: 'warn',
      text: 'The guide cannot move while the wire is out — retract the wire into the guide first.',
    });
    return { state: g0, messages, engagedNow, poppedOut };
  }

  if (inp.rotate !== 0) {
    g.angle = wrapAngle(g.angle + inp.rotate);
    if (g.engaged && Math.abs(angleDiff(g.angle, g.engagedAngle)) > GUIDE.popOutTorque) {
      g.engaged = false;
      g.s = inp.railLength - 4;
      poppedOut = true;
      messages.push({ level: 'warn', text: 'Too much torque — the guide popped out of the left main. Re-engage gently.' });
    }
  }

  if (inp.move > 0) {
    if (g.engaged) {
      messages.push({ level: 'warn', text: 'Guide is engaged — pushing further deep-seats it and risks LM dissection.' });
    } else if (g.s >= inp.railLength - 1e-6) {
      if (g.speed > GUIDE.gentleSpeed) {
        messages.push({ level: 'info', text: 'At the aortic root — advance gently (hold Shift) to engage.' });
      } else {
        const facing = cuspFacing(g.angle);
        if (facesLeftCusp(g.angle)) {
          g.engaged = true;
          g.engagedAngle = g.angle;
          engagedNow = true;
          messages.push({ level: 'ok', text: 'Guide engaged in the left main ostium. Check pressure, then take an angiogram.' });
        } else if (facing === 'right') {
          messages.push({
            level: 'warn',
            text: 'The tip faces the RIGHT coronary cusp (RCA ostium). Rotate toward the left cusp (A/D).',
          });
        } else if (facing === 'non-coronary') {
          messages.push({ level: 'warn', text: 'The tip faces the non-coronary cusp — no ostium here. Rotate toward the left cusp.' });
        } else {
          const off = Math.round(angleDiff(g.angle, GUIDE.leftCuspAngle));
          messages.push({ level: 'info', text: `Almost — the tip is ${Math.abs(off)}° off the left cusp. Fine-tune with A/D.` });
        }
      }
    } else {
      g.s = Math.min(inp.railLength, g.s + inp.move);
    }
  } else if (inp.move < 0) {
    if (g.engaged) {
      g.engaged = false;
      g.s = inp.railLength - 1;
      messages.push({ level: 'info', text: 'Guide disengaged from the left main.' });
    } else {
      g.s = Math.max(0, g.s + inp.move);
    }
  }
  return { state: g, messages, engagedNow, poppedOut };
}
