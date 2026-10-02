/**
 * Tool definitions and the rules that unlock them. Pure.
 */
import type { Snapshot } from '../procedure/snapshot';

export type ToolId = 'guide' | 'wire' | 'balloon' | 'stent' | 'contrast' | 'fluoro' | 'measure';

export interface ToolDef {
  id: ToolId;
  key: string;
  name: string;
  short: string;
  rules: string;
  /** Tools that are momentary actions rather than a selected mode. */
  action?: boolean;
  hold?: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    id: 'guide',
    key: '1',
    name: 'Guide catheter 6F',
    short: 'Guide',
    rules: 'W/S or wheel to advance/retract (Shift = fine). A/D rotates the curved tip. Engage the left main by facing the left cusp and advancing gently at the root. Cannot move while the wire is out.',
  },
  {
    id: 'wire',
    key: '2',
    name: 'Guidewire 0.014"',
    short: 'Wire',
    rules: 'W/S advance/retract, A/D rotate the shaped tip to choose branches. Cross the lesion slowly (Shift). Unlocks after engagement, a diagnostic angiogram and heparin.',
  },
  {
    id: 'balloon',
    key: '3',
    name: 'Balloon (pre-dilation)',
    short: 'Balloon',
    rules: 'Pick a size while in the guide, advance over the wire, centre the markers on the lesion. Hold E to inflate (Shift fine), Q to deflate. Needs the wire parked distally.',
  },
  {
    id: 'stent',
    key: '4',
    name: 'Drug-eluting stent',
    short: 'Stent',
    rules: 'Size from QCA, cover the whole lesion with margins, inflate ≥ 6 atm to deploy, then deflate and withdraw. Needs pre-dilation and the balloon out of the patient.',
  },
  {
    id: 'contrast',
    key: '5',
    name: 'Contrast injection',
    short: 'Contrast',
    action: true,
    rules: 'Injects contrast and records a cine run. Selective (8 ml) when the guide is engaged, otherwise an aortic root flush (20 ml). Also C.',
  },
  {
    id: 'fluoro',
    key: '6',
    name: 'Fluoroscopy pedal',
    short: 'Fluoro',
    hold: true,
    rules: 'Hold Space or 6 for live X-ray (15 fps pulsed). Releasing keeps the last image (LIH). Every second counts toward fluoro time.',
  },
  {
    id: 'measure',
    key: '7',
    name: 'QCA measure',
    short: 'Measure',
    rules: 'Quantitative coronary angiography of the lesion: reference diameter, MLD, % stenosis and length. Hover vessels in 3D for diameters. Needs an angiogram.',
  },
];

export interface ToolAvailability {
  enabled: boolean;
  reason: string;
}

export function toolAvailability(s: Snapshot): Record<ToolId, ToolAvailability> {
  const ok = (): ToolAvailability => ({ enabled: true, reason: '' });
  const no = (reason: string): ToolAvailability => ({ enabled: false, reason });

  const wire = !s.engaged
    ? no('Engage the left main with the guide first.')
    : !s.angioDone
      ? no('Take a diagnostic angiogram (5) before wiring.')
      : !s.heparin
        ? no('Give heparin first (G) — a wire in a coronary without anticoagulation risks thrombus.')
        : ok();

  const wireDistal = s.wireParked || (s.wireCrossed && s.wireInLAD && s.wireS > s.lesionEnd + 10);
  const balloon = !wireDistal
    ? no('Cross the lesion and park the wire tip in the distal LAD first.')
    : s.stentInPatient
      ? no('Only one balloon catheter at a time — withdraw the stent catheter first.')
      : ok();

  const stent = !s.predilationDone
    ? no('Pre-dilate the lesion with a balloon first.')
    : s.balloonInPatient
      ? no('Withdraw the pre-dilation balloon first (one catheter at a time).')
      : !wireDistal
        ? no('Keep the wire parked in the distal LAD.')
        : ok();

  const contrast = s.engaged || s.guideAtRoot ? ok() : no('Bring the guide to the aortic root before injecting contrast.');
  const measure = s.angioDone ? ok() : no('QCA needs an angiogram of the left coronary first.');

  return {
    guide: ok(),
    wire: wire,
    balloon,
    stent,
    contrast,
    fluoro: ok(),
    measure,
  };
}
