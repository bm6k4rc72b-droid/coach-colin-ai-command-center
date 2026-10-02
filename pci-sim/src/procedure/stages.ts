/**
 * The six procedure stages with latching sub-tasks. Pure.
 */
import type { Snapshot } from './snapshot';

export interface SubTask {
  id: string;
  label: string;
  done: (s: Snapshot) => boolean;
}

export interface StageDef {
  id: number;
  title: string;
  goal: string;
  why: string;
  tasks: SubTask[];
}

export const STAGES: StageDef[] = [
  {
    id: 1,
    title: 'Advance guide to the aortic root',
    goal: 'Bring the 6F guide catheter from the right wrist up the arm and down into the aortic root.',
    why: 'Radial access lowers bleeding and access-site complications versus femoral access. Catheters are always advanced under fluoroscopy so you never push blindly against a loop, a side branch or spasm.',
    tasks: [
      { id: 'elbow', label: 'Advance past the elbow', done: (s) => s.guideS > s.elbowS },
      { id: 'aorta', label: 'Enter the aorta', done: (s) => s.guideS > s.aortaEntryS },
      { id: 'fluoro', label: 'Check the catheter on fluoro (Space)', done: (s) => s.fluoroSeenGuide },
      { id: 'root', label: 'Reach the aortic root', done: (s) => s.guideAtRoot || s.engaged },
    ],
  },
  {
    id: 2,
    title: 'Engage the left main',
    goal: 'Rotate the pre-shaped tip toward the left coronary cusp, seat it gently, and take a diagnostic angiogram.',
    why: 'A coaxial, gently seated guide gives support for devices and safe contrast injections. Facing the wrong cusp finds the RCA or nothing; forcing it can dissect the left main.',
    tasks: [
      { id: 'face', label: 'Face the left coronary cusp (A/D)', done: (s) => (s.guideAtRoot && s.facingLeft) || s.engaged },
      { id: 'seat', label: 'Seat the guide with a gentle advance', done: (s) => s.engaged },
      { id: 'angio', label: 'Diagnostic angiogram (5 / C)', done: (s) => s.angioDone },
    ],
  },
  {
    id: 3,
    title: 'Cross the LAD lesion',
    goal: 'Anticoagulate, then steer the 0.014" wire into the LAD (not the LCx), cross the stenosis gently and park the tip distally.',
    why: 'Heparin (ACT > 250 s) prevents thrombus on wires and devices. The wire is the rail for everything that follows: a distal, stable position gives support, and gentle crossing avoids subintimal tracking and dissection.',
    tasks: [
      { id: 'heparin', label: 'Give heparin (G)', done: (s) => s.heparin },
      { id: 'out', label: 'Wire out of the guide', done: (s) => s.wireOut },
      { id: 'lad', label: 'Steer into the LAD, not the LCx', done: (s) => s.wireInLAD },
      { id: 'cross', label: 'Cross the lesion gently (Shift)', done: (s) => s.wireCrossed },
      { id: 'park', label: 'Park the tip in the distal LAD', done: (s) => s.wireParked },
    ],
  },
  {
    id: 4,
    title: 'Pre-dilate',
    goal: 'Advance an undersized balloon over the wire, centre its markers on the lesion, inflate to at least 6 atm, then deflate.',
    why: 'Pre-dilation prepares the plaque so the stent can cross and expand fully. An undersized balloon (≈0.8–0.9 × reference) lowers the risk of dissection before the stent is in.',
    tasks: [
      {
        id: 'markers',
        label: 'Balloon markers across the lesion',
        done: (s) =>
          !!s.catheter && s.catheter.kind === 'balloon' && s.catheter.outside && s.catheter.vessel === 'LAD' &&
          s.catheter.s0 <= s.lesionCentre - 2 && s.catheter.s1 >= s.lesionCentre + 2,
      },
      { id: 'inflate', label: 'Inflate ≥ 6 atm over the lesion (hold E)', done: (s) => s.predilInflated },
      {
        id: 'deflate',
        label: 'Deflate (Q)',
        done: (s) => s.predilInflated && (!s.catheter || s.catheter.kind !== 'balloon' || s.catheter.pressure < 0.05),
      },
    ],
  },
  {
    id: 5,
    title: 'Deploy the stent',
    goal: 'Measure with QCA, pick a stent of the reference diameter long enough for ≥ 1.5 mm margins, cover the lesion, deploy and deflate.',
    why: 'A drug-eluting stent scaffolds the artery and prevents recoil and restenosis. Under-sizing leaves malapposition; over-sizing dissects; a short stent misses part of the lesion (geographic miss).',
    tasks: [
      { id: 'qca', label: 'Measure the lesion (QCA, 7)', done: (s) => s.qcaDone },
      { id: 'load', label: 'Load a stent on the wire (4)', done: (s) => s.stentInPatient || s.stentDeployed },
      {
        id: 'cover',
        label: 'Cover the whole lesion',
        done: (s) =>
          s.stentCoversLesion ||
          (!!s.catheter && s.catheter.kind === 'stent' && s.catheter.outside && s.catheter.vessel === 'LAD' &&
            s.catheter.s0 <= s.lesionStart && s.catheter.s1 >= s.lesionEnd),
      },
      { id: 'deploy', label: 'Deploy (≥ 6 atm)', done: (s) => s.stentDeployed },
      { id: 'deflate', label: 'Deflate the stent balloon', done: (s) => s.stentDeflated },
    ],
  },
  {
    id: 6,
    title: 'Final angiogram',
    goal: 'Inject after stenting and confirm the result in a second, distinct projection.',
    why: 'Every result is checked in at least two orthogonal views: a stenosis or an edge dissection can hide in one projection. Look for residual narrowing, TIMI 3 flow and contrast staining at the stent edges.',
    tasks: [
      { id: 'inject', label: 'Angiogram after the stent (5)', done: (s) => s.finalInjections >= 1 },
      { id: 'second', label: 'Second, distinct projection (V)', done: (s) => s.finalDistinctViews >= 2 },
    ],
  },
];

export interface StageProgress {
  /** Index of the current stage (0-based); STAGES.length when all are done. */
  current: number;
  done: Record<string, boolean>;
  completedAt: (number | null)[];
}

export const initialProgress = (): StageProgress => ({
  current: 0,
  done: {},
  completedAt: STAGES.map(() => null),
});

export const taskKey = (stage: number, task: string) => `${stage}:${task}`;

/**
 * Latch sub-tasks of the current stage and advance. Returns the new progress and the indices of
 * stages completed by this update (possibly several if later stages were already satisfied).
 */
export function updateProgress(p0: StageProgress, s: Snapshot): { progress: StageProgress; completed: number[] } {
  const p: StageProgress = { current: p0.current, done: { ...p0.done }, completedAt: p0.completedAt.slice() };
  const completed: number[] = [];
  let guard = 0;
  while (p.current < STAGES.length && guard++ < STAGES.length) {
    const st = STAGES[p.current];
    for (const t of st.tasks) {
      const k = taskKey(st.id, t.id);
      if (!p.done[k] && t.done(s)) p.done[k] = true;
    }
    if (st.tasks.every((t) => p.done[taskKey(st.id, t.id)])) {
      p.completedAt[p.current] = s.t;
      completed.push(p.current);
      p.current++;
    } else break;
  }
  return { progress: p, completed };
}

export function stagePercent(p: StageProgress, stageIndex: number): number {
  const st = STAGES[stageIndex];
  if (!st) return 100;
  const n = st.tasks.filter((t) => p.done[taskKey(st.id, t.id)]).length;
  return Math.round((100 * n) / st.tasks.length);
}
