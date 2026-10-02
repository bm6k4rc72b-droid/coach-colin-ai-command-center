/**
 * Situation-specific, calm mentor hints. Pure: derived from the snapshot plus a few extras.
 */
import { GUIDE, PHYSIOLOGY } from '../config/anatomy';
import { angleDiff } from '../anatomy/math';
import type { Snapshot } from './snapshot';

export interface MentorExtras {
  guideRootS: number;
  tool: string;
  wireAngle: number;
  ladAngle: number;
  upcoming: { options: string[]; distance: number; terminal: boolean } | null;
  qcaRef: number | null;
  qcaLength: number | null;
  stentSize: { d: number; l: number };
  catheterPressure: number;
  inflationTime: number;
  cineRunning: boolean;
}

export function mentorHint(s: Snapshot, x: MentorExtras): string {
  if (s.unstable) return 'The patient is unstable from prolonged occlusion. Deflate now (Q) and let the myocardium reperfuse before trying again.';
  if (s.occlusionTime > PHYSIOLOGY.pvcAfter) return `The LAD has been occluded for ${Math.round(s.occlusionTime)} s — ectopics are starting. Finish and deflate.`;
  if (s.wireBuckling) return 'The wire is buckling: you are pushing faster than the tip can track. Pull back slightly, hold Shift and advance slowly, rotating a little (A/D).';
  if (s.dissection && !s.dissectionSealed && s.stage >= 3)
    return 'There is an unsealed dissection. Keep the wire across it — a stent covering the flap seals it and restores flow.';

  switch (s.stage) {
    case 0: {
      if (s.guideS < 15) return 'Select the guide (1) and hold W to advance it from the radial sheath. Shift gives fine control.';
      if (!s.fluoroSeenGuide) return 'Tap the fluoro pedal (hold Space briefly) to see the catheter — never advance blind.';
      if (s.guideS < s.elbowS) return 'Keep advancing up the radial artery toward the elbow.';
      if (s.guideS < s.aortaEntryS) return 'Through the brachial, axillary and subclavian arteries into the brachiocephalic trunk.';
      return 'Into the ascending aorta — advance down to the aortic root.';
    }
    case 1: {
      if (!s.engaged) {
        const off = angleDiff(s.guideAngle, GUIDE.leftCuspAngle);
        if (Math.abs(off) > GUIDE.engageTolerance)
          return `Rotate the tip ${off > 0 ? 'left (A)' : 'right (D)'} by about ${Math.round(Math.abs(off))}° to face the left coronary cusp. Watch the dial in the device panel.`;
        return 'Facing the left cusp. Advance gently with Shift + W to seat the guide in the left main.';
      }
      if (x.cineRunning) return 'Watch the cine: LM, LAD with its diagonals, and the circumflex. The mid-LAD narrowing is thin and faint.';
      return 'Engaged. Inject contrast (5 or C) for the diagnostic angiogram. Try a cranial view such as RAO 30 CRA 30.';
    }
    case 2: {
      if (!s.heparin) return 'Before any wire goes into the coronary, give heparin (G): 100 IU/kg.';
      if (x.tool !== 'wire') return 'Select the wire (2).';
      if (!s.wireOut) {
        const off = angleDiff(x.wireAngle, x.ladAngle);
        if (Math.abs(off) > 40) return `Rotate the wire tip toward the LAD (${off > 0 ? 'A' : 'D'}) before advancing — at its current angle it will fall into the circumflex.`;
        return 'Advance the wire out of the guide into the left main (W).';
      }
      if (s.wireVessel === 'LCx') return 'The wire is in the circumflex. Pull back (S) into the LM, rotate toward the LAD, and advance again.';
      if (s.wireVessel === 'D1' || s.wireVessel === 'D2') return 'The wire went into a diagonal. Pull back into the LAD and rotate the tip away from the branch.';
      if (x.upcoming && x.upcoming.distance < 10) {
        const opts = x.upcoming.options.join(' / ');
        return x.upcoming.terminal
          ? `Bifurcation (${opts}) in ${x.upcoming.distance.toFixed(0)} mm — make sure the tip points to the LAD.`
          : `Side branch ${opts} in ${x.upcoming.distance.toFixed(0)} mm — keep the tip rotated away from it.`;
      }
      if (s.wireVessel === 'LAD' && !s.wireCrossed && s.wireS > s.lesionStart - 6)
        return 'At the lesion: hold Shift and advance slowly (< 8 mm/s). A small rotation helps the tip find the lumen.';
      if (s.wireCrossed && !s.wireParked) return 'Crossed. Keep going to the distal LAD for a stable rail — stop before the very end.';
      return 'Advance down the LAD toward the lesion.';
    }
    case 3: {
      const c = s.catheter;
      if (!c || c.kind !== 'balloon') return 'Select the balloon (3), choose a size around 0.85 × the reference (2.5 mm here), then advance it over the wire.';
      if (!c.outside || c.vessel !== 'LAD') return 'Advance the balloon out of the guide and down the LAD (W).';
      if (x.catheterPressure < 0.1 && !s.predilInflated) {
        const mid = (c.s0 + c.s1) / 2;
        const err = s.lesionCentre - mid;
        if (Math.abs(err) > 1) return `Move the balloon ${err > 0 ? 'forward' : 'back'} ${Math.abs(err).toFixed(1)} mm to centre the markers on the lesion (Shift for fine).`;
        return 'Markers centred. Hold E to inflate to about 8–10 atm, watching the pressure gauge.';
      }
      if (x.catheterPressure > 0.1) {
        if (x.inflationTime > 20) return 'Long enough — deflate (Q). Short inflations limit ischaemia.';
        return 'Balloon up: ST rises in V2 and the patient may feel chest pain. Hold ~10–15 s, then deflate (Q).';
      }
      return 'Deflated. Now pull the balloon back out (S) to make room for the stent.';
    }
    case 4: {
      if (s.balloonInPatient) return 'Withdraw the pre-dilation balloon completely (select it and hold S).';
      if (!s.qcaDone) return 'Measure the lesion with QCA (7): reference diameter and lesion length decide the stent size.';
      const c = s.catheter;
      if (!c || c.kind !== 'stent') {
        const ref = x.qcaRef ? x.qcaRef.toFixed(2) : '≈3.0';
        const len = x.qcaLength ? x.qcaLength.toFixed(0) : '≈14';
        return `Select the stent (4). QCA reference ${ref} mm, lesion ${len} mm → a 3.0 mm stent at least 3 mm longer than the lesion (e.g. 3.0 × 18).`;
      }
      if (!c.outside || c.vessel !== 'LAD') return 'Advance the stent over the wire into the LAD.';
      if (!c.deployed) {
        const mid = (c.s0 + c.s1) / 2;
        const err = s.lesionCentre - mid;
        if (c.s0 > s.lesionStart || c.s1 < s.lesionEnd) {
          if (c.length < s.lesionEnd - s.lesionStart) return 'This stent is shorter than the lesion — it cannot cover it. Withdraw and choose a longer one.';
          return `Not covering the whole lesion yet: move ${err > 0 ? 'forward' : 'back'} ${Math.abs(err).toFixed(1)} mm.`;
        }
        if (Math.abs(err) > 0.8) return `Covered, but off-centre by ${Math.abs(err).toFixed(1)} mm — centre it for equal margins.`;
        return 'Centred over the lesion. Inflate (E) past 6 atm to deploy; ~12 atm expands it to the reference.';
      }
      if (x.catheterPressure > 0.1) return 'Stent deployed. Hold for a few seconds, then deflate (Q).';
      return 'Deflated. Withdraw the delivery balloon (S), keeping the wire in place.';
    }
    case 5: {
      if (s.finalInjections === 0) return 'Final angiogram: inject (5) and look for residual stenosis, TIMI 3 flow and edge staining.';
      return 'Change projection (V cycles presets) by at least 20°, then inject again for an orthogonal view.';
    }
    default:
      return 'Case complete. Open the debrief (End case) or keep exploring.';
  }
}
