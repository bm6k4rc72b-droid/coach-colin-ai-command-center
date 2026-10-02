/**
 * Per-frame snapshot of everything the stage logic, tool rules and mentor need. Pure data.
 */
import type { VesselId } from '../anatomy/vessels';

export interface CatheterSnap {
  kind: 'balloon' | 'stent';
  inGuide: boolean;
  outside: boolean;
  pressure: number;
  vessel: VesselId | null;
  s0: number;
  s1: number;
  deployed: boolean;
  ruptured: boolean;
  nominalD: number;
  length: number;
}

export interface Snapshot {
  t: number;
  stage: number;
  guideS: number;
  elbowS: number;
  aortaEntryS: number;
  guideAtRoot: boolean;
  guideAngle: number;
  facingLeft: boolean;
  engaged: boolean;
  fluoroSeenGuide: boolean;
  angioDone: boolean;
  heparin: boolean;
  act: number;
  wireOut: boolean;
  wireVessel: VesselId;
  wireS: number;
  wireInLAD: boolean;
  wireCrossed: boolean;
  wireParked: boolean;
  wireBuckling: boolean;
  catheter: CatheterSnap | null;
  balloonInPatient: boolean;
  stentInPatient: boolean;
  predilInflated: boolean;
  predilationDone: boolean;
  qcaDone: boolean;
  stentDeployed: boolean;
  stentCoversLesion: boolean;
  stentDeflated: boolean;
  finalInjections: number;
  finalDistinctViews: number;
  lesionStart: number;
  lesionEnd: number;
  lesionCentre: number;
  ischaemia: number;
  occlusionTime: number;
  unstable: boolean;
  dissection: boolean;
  dissectionSealed: boolean;
  timi: number;
  demo: boolean;
}
