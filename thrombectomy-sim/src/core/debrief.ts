/** Debrief: timings, reperfusion, outcome estimate vs no thrombectomy, decisions and lessons. Pure. */
import { NEURONS_PER_ML } from '../config/cases';
import { isSuccess, type ETici } from './angio';
import { finalInfarct, pIndependent, sichRisk, untreatedInfarct } from './physiology';
import type { Sim } from './sim';

export interface Debrief {
  grade: ETici | null;
  success: boolean;
  firstPass: boolean;
  passes: number;
  times: { label: string; value: number | null; target: string; ok: boolean | null }[];
  infarct: number;
  untreated: number;
  pIndep: number;
  pIndepUntreated: number;
  neuronsSaved: number;
  sichRisk: number;
  score: number;
  lessons: string[];
}

export function debrief(sim: Sim): Debrief {
  const c = sim.c;
  const last = sim.runs[sim.runs.length - 1];
  const grade = last ? last.grade : null;
  const success = !!grade && isSuccess(grade);
  const m = sim.metrics();
  const infarct = finalInfarct(c, sim.t, sim.reperfusedAt === null ? 0 : Math.max(sim.reperfusedF, last?.f ?? 0), sim.reperfusedAt, sim.newTerritoryMl);
  const untreated = untreatedInfarct(c);
  const pIndep = pIndependent(c, infarct, sim.sich);
  const pIndepUntreated = pIndependent(c, untreated, false);
  const lessons: string[] = [];
  const passes = sim.passes;

  const times = [
    { label: 'Door-to-needle (thrombolysis)', value: m.doorToNeedle, target: c.answers.thrombolysis === 'give' ? '≤ 60 min (ideally ≤ 45)' : 'not indicated in this case', ok: m.doorToNeedle === null ? null : c.answers.thrombolysis === 'give' ? m.doorToNeedle <= 60 : false },
    { label: 'Door-to-groin puncture', value: m.doorToGroin, target: '≤ 90 min (ideally ≤ 60)', ok: m.doorToGroin === null ? null : m.doorToGroin <= 90 },
    { label: 'Groin-to-reperfusion', value: m.groinToReperfusion, target: '≤ 60 min (ideally ≤ 30)', ok: m.groinToReperfusion === null ? false : m.groinToReperfusion <= 60 },
    { label: 'Onset-to-reperfusion', value: m.onsetToReperfusion, target: 'as short as possible', ok: null },
  ];

  if (m.firstPass) lessons.push('First-pass effect: complete reperfusion (eTICI 2c/3) on the first pass is linked to better outcomes and fewer complications than getting there in several passes.');
  else if (success && passes.length > 1) lessons.push(`Success after ${passes.length} passes. Each pass adds time, endothelial injury and haemorrhage risk; the first-pass effect is what operators chase.`);
  if (!passes.length) lessons.push('The procedure ended without a thrombectomy pass, so the occlusion was never treated.');
  if (!success) lessons.push('No successful reperfusion (eTICI ≥ 2b50). The unreperfused penumbra will mostly infarct. Rescue options include changing technique, intracranial angioplasty/stenting for underlying stenosis, or stopping when risk outweighs benefit.');
  const aspWhite = passes.some((p) => p.technique === 'aspiration' && c.clot.type === 'white' && p.outcome.result !== 'complete');
  if (aspWhite) lessons.push('Aspiration struggled with a firm, fibrin-rich ("white") clot. A stent retriever or combined technique engages fibrin clots better. On CT a non-dense clot and a negative "susceptibility vessel sign" on MRI hint at this.');
  if (passes.some((p) => !p.flowArrest)) lessons.push('A pass without balloon-guide flow arrest: inflating the balloon stops antegrade flow, so fragments are less likely to shower downstream (fewer distal emboli).');
  if (passes.some((p) => p.technique !== 'aspiration' && p.coverage < 0.999)) lessons.push('The stent retriever did not cover the whole clot. Choose a stent at least ~10 mm longer than the clot and deploy so the clot sits in its proximal-to-middle part.');
  if (passes.some((p) => p.technique !== 'aspiration' && p.embed < 2)) lessons.push('The stent was pulled before it embedded. Most operators wait 3–5 minutes after unsheathing.');
  if (passes.some((p) => p.technique !== 'stent' && !p.atFace)) lessons.push('The aspiration catheter was not at the clot face. Aspiration only works when the catheter tip seals against the clot.');
  if (sim.complications.includes('perforation')) lessons.push('Vessel perforation: never push a wire against resistance in a small distal branch. Keep the wire tip in a large M2 trunk.');
  if (sim.complications.includes('distal emboli')) lessons.push('Distal emboli turned complete reperfusion into near-complete (eTICI 2c). Flow arrest and combined techniques reduce this.');
  if (sim.complications.includes('emboli to a new territory')) lessons.push('Fragments went to the anterior cerebral artery: emboli to a new territory, a risk with ICA-terminus clots. Flow arrest lowers it.');
  if (sim.decisions.some((d) => d.correct === false)) lessons.push('Review the triage decisions marked ✖: protocol errors cost time or add risk before the procedure even starts.');
  lessons.push(...c.teaching);

  const tiers: Record<ETici, number> = { '0': 0, '1': 5, '2a': 15, '2b50': 40, '2b67': 50, '2c': 58, '3': 62 };
  let score = grade ? tiers[grade] : 0;
  score += m.firstPass ? 10 : 0;
  score += m.groinToReperfusion !== null ? Math.max(0, 15 - Math.max(0, m.groinToReperfusion - 20) / 3) : 0;
  score += sim.decisions.filter((d) => d.correct === true).length * 3 - sim.decisions.filter((d) => d.correct === false).length * 5;
  score -= sim.complications.length * 6 + (sim.sich ? 15 : 0);
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    grade,
    success,
    firstPass: m.firstPass,
    passes: passes.length,
    times,
    infarct,
    untreated,
    pIndep,
    pIndepUntreated,
    neuronsSaved: Math.max(0, untreated - infarct) * NEURONS_PER_ML,
    sichRisk: sim.sich ? 1 : sichRisk(c, sim.core, sim.lysis, passes.length),
    score,
    lessons,
  };
}
