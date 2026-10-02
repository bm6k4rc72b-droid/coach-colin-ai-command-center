/**
 * Case evaluation and debrief. buildDebrief(summary) is pure and unit tested.
 */
import { CONTRAST, FLUORO, INFLATION_OK_SECONDS } from '../config/anatomy';

export interface CaseSummary {
  stagesCompleted: number;
  /** Worst residual diameter stenosis over the lesion (fraction), null if not measurable. */
  residualStenosis: number;
  finalTimi: number;
  stentCount: number;
  /** Largest deployed stent diameter in the lesion (mm), null if no stent. */
  stentDiameter: number | null;
  referenceDiameter: number;
  /** Stent margins beyond the lesion (mm). Negative = geographic miss. */
  marginProximal: number | null;
  marginDistal: number | null;
  heparin: boolean;
  preDilated: boolean;
  qcaUsed: boolean;
  dissection: boolean;
  dissectionSealed: boolean;
  wireForcingEvents: number;
  balloonRupture: boolean;
  longestInflation: number;
  contrastMl: number;
  fluoroSeconds: number;
  finalViews: number;
}

export type ItemStatus = 'ok' | 'warn' | 'bad';

export interface DebriefItem {
  id: string;
  label: string;
  value: string;
  status: ItemStatus;
  teaching: string;
  penalty: number;
}

export type Grade = 'Excellent' | 'Good' | 'Acceptable' | 'Needs work' | 'Incomplete';

export interface Debrief {
  score: number;
  grade: Grade;
  headline: string;
  items: DebriefItem[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function buildDebrief(s: CaseSummary): Debrief {
  const items: DebriefItem[] = [];
  const add = (
    id: string,
    label: string,
    value: string,
    status: ItemStatus,
    teaching: string,
    penalties: [number, number] = [5, 12],
  ) => {
    const penalty = status === 'ok' ? 0 : status === 'warn' ? penalties[0] : penalties[1];
    items.push({ id, label, value, status, teaching, penalty });
  };
  const stented = s.stentCount > 0 && s.stentDiameter !== null;

  // Residual stenosis
  add(
    'residual',
    'Residual stenosis',
    pct(s.residualStenosis),
    s.residualStenosis <= 0.1 ? 'ok' : s.residualStenosis <= 0.3 ? 'warn' : 'bad',
    s.residualStenosis <= 0.1
      ? 'Optimal angiographic result: ≤ 10% residual narrowing inside the stented segment.'
      : 'A residual narrowing usually means under-expansion or an uncovered segment. Post-dilate with a non-compliant balloon or cover the remaining plaque.',
    [6, 15],
  );

  // TIMI
  add(
    'timi',
    'Final TIMI flow',
    `TIMI ${s.finalTimi}`,
    s.finalTimi >= 3 ? 'ok' : s.finalTimi === 2 ? 'warn' : 'bad',
    s.finalTimi >= 3
      ? 'Brisk, complete filling and washout of the distal vessel.'
      : 'Slow flow after PCI suggests a flow-limiting dissection, residual stenosis, thrombus or distal embolisation — find and treat the cause before leaving.',
    [10, 20],
  );

  // Stent sizing
  if (stented) {
    const ratio = (s.stentDiameter as number) / s.referenceDiameter;
    add(
      'sizing',
      'Stent : reference diameter',
      `${(s.stentDiameter as number).toFixed(2)} mm / ${s.referenceDiameter.toFixed(2)} mm = ${ratio.toFixed(2)}`,
      ratio >= 0.95 && ratio <= 1.15 ? 'ok' : (ratio >= 0.85 && ratio < 0.95) || (ratio > 1.15 && ratio <= 1.2) ? 'warn' : 'bad',
      ratio < 0.95
        ? 'Under-expanded or undersized stents are the strongest predictor of restenosis and stent thrombosis.'
        : ratio > 1.15
          ? 'Over-sizing beyond ~1.15 × reference stretches the artery and risks edge dissection or perforation.'
          : 'Stent expanded to the reference diameter — good apposition without over-stretching.',
      [6, 12],
    );
  } else {
    add('sizing', 'Stent : reference diameter', 'no stent', 'bad', 'No stent was deployed in the lesion.', [6, 12]);
  }

  // Coverage
  if (stented && s.marginProximal !== null && s.marginDistal !== null) {
    const m = Math.min(s.marginProximal, s.marginDistal);
    add(
      'coverage',
      'Lesion coverage (margins)',
      `prox ${s.marginProximal.toFixed(1)} mm · dist ${s.marginDistal.toFixed(1)} mm`,
      m >= 1.5 ? 'ok' : m >= 0 ? 'warn' : 'bad',
      m < 0
        ? 'Geographic miss: part of the lesion is not covered. Uncovered plaque at a stent edge drives restenosis and edge dissection.'
        : m < 1.5
          ? 'Margins under 1.5 mm leave little room for positioning error — choose a longer stent.'
          : 'Healthy-to-healthy coverage with ≥ 1.5 mm on each side.',
      [4, 15],
    );
  } else {
    add('coverage', 'Lesion coverage (margins)', '—', 'bad', 'Lesion not covered by a stent.', [4, 15]);
  }

  add(
    'stents',
    'Stents used',
    String(s.stentCount),
    s.stentCount <= 1 ? (s.stentCount === 1 ? 'ok' : 'bad') : s.stentCount === 2 ? 'warn' : 'bad',
    s.stentCount > 1
      ? 'Bailout stenting can be right (dissection, miss), but every extra stent adds metal and restenosis risk — plan length from QCA first.'
      : s.stentCount === 1
        ? 'A single, well-sized stent for a focal lesion.'
        : 'No stent deployed.',
    [5, 10],
  );

  add(
    'heparin',
    'Anticoagulation',
    s.heparin ? 'heparin given' : 'none',
    s.heparin ? 'ok' : 'bad',
    s.heparin
      ? 'Unfractionated heparin ~100 IU/kg before wiring, aiming for ACT > 250 s.'
      : 'Wires and balloons in an unanticoagulated coronary invite thrombus — heparin comes before the wire.',
    [0, 15],
  );

  add(
    'predil',
    'Pre-dilation',
    s.preDilated ? 'done' : 'not done',
    s.preDilated ? 'ok' : 'warn',
    'Pre-dilating a tight lesion helps the stent cross and expand fully.',
    [5, 5],
  );

  add(
    'qca',
    'QCA sizing',
    s.qcaUsed ? 'used' : 'not used',
    s.qcaUsed ? 'ok' : 'warn',
    'Measuring reference diameter and lesion length avoids eyeballing errors in stent size.',
    [4, 4],
  );

  add(
    'dissection',
    'Dissection',
    !s.dissection ? 'none' : s.dissectionSealed ? 'sealed by stent' : 'UNSEALED',
    !s.dissection ? 'ok' : s.dissectionSealed ? 'warn' : 'bad',
    !s.dissection
      ? 'No dissection — gentle wiring and correct device sizing.'
      : s.dissectionSealed
        ? 'A dissection occurred but was covered by a stent. Causes: forced wiring, over-sized balloons, stent edges.'
        : 'An uncovered dissection can propagate and close the vessel. Cover it with a stent before finishing.',
    [6, 20],
  );

  add(
    'wire',
    'Wire forcing',
    s.wireForcingEvents === 0 ? 'none' : `${s.wireForcingEvents}×`,
    s.wireForcingEvents === 0 ? 'ok' : s.wireForcingEvents <= 2 ? 'warn' : 'bad',
    'A buckling wire is a stop sign: slow down, torque, and let the tip find the true lumen.',
    [4, 8],
  );

  add(
    'rupture',
    'Balloon rupture',
    s.balloonRupture ? 'yes' : 'no',
    s.balloonRupture ? 'bad' : 'ok',
    'Stay below rated burst pressure; a rupture can dissect or perforate the artery.',
    [0, 8],
  );

  add(
    'inflation',
    'Longest inflation',
    `${s.longestInflation.toFixed(0)} s`,
    s.longestInflation <= INFLATION_OK_SECONDS ? 'ok' : s.longestInflation <= 60 ? 'warn' : 'bad',
    'Every inflation occludes the LAD. Watch ST segments and the patient; deflate if they become unstable.',
    [4, 10],
  );

  add(
    'contrast',
    'Contrast volume',
    `${Math.round(s.contrastMl)} ml`,
    s.contrastMl <= CONTRAST.okTotalMl ? 'ok' : s.contrastMl <= 200 ? 'warn' : 'bad',
    'Contrast is nephrotoxic — every injection should answer a question.',
    [4, 8],
  );

  add(
    'fluoro',
    'Fluoroscopy time',
    mmss(s.fluoroSeconds),
    s.fluoroSeconds <= FLUORO.okTimeSeconds ? 'ok' : s.fluoroSeconds <= 1200 ? 'warn' : 'bad',
    'Radiation dose to patient and staff scales with fluoro time: step off the pedal when nothing is moving.',
    [3, 6],
  );

  add(
    'views',
    'Final angiographic views',
    String(s.finalViews),
    s.finalViews >= 2 ? 'ok' : s.finalViews === 1 ? 'warn' : 'bad',
    'Confirm the result in at least two distinct projections — lesions and edge dissections hide in single views.',
    [5, 10],
  );

  const missingStages = Math.max(0, 6 - s.stagesCompleted);
  const score = Math.max(0, Math.min(100, 100 - items.reduce((a, i) => a + i.penalty, 0) - missingStages * 3));

  let grade: Grade;
  if (!stented) grade = 'Incomplete';
  else if (score >= 90) grade = 'Excellent';
  else if (score >= 75) grade = 'Good';
  else if (score >= 60) grade = 'Acceptable';
  else grade = 'Needs work';

  const worst = items.filter((i) => i.status === 'bad').sort((a, b) => b.penalty - a.penalty)[0];
  const headline =
    grade === 'Incomplete'
      ? 'Case incomplete — the lesion was not stented. Review the stages you still had open.'
      : grade === 'Excellent'
        ? 'Excellent: optimal stent result, TIMI 3 flow, and a safe, efficient procedure.'
        : grade === 'Good'
          ? 'Good result with a few points to polish.'
          : grade === 'Acceptable'
            ? `Acceptable, but ${worst ? worst.label.toLowerCase() : 'several items'} needs attention.`
            : `Needs work — main issue: ${worst ? worst.label.toLowerCase() : 'multiple problems'}.`;

  return { score: Math.round(score), grade, headline, items };
}
