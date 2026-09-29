// HEARTBEAT · recovery after stroke.
//
// Timeline: Stroke Recovery and Rehabilitation Roundtable (Bernhardt et al. 2017):
// hyperacute 0–24 h, acute 1–7 d, early subacute 7 d–3 mo, late subacute
// 3–6 mo, chronic > 6 mo. Heightened plasticity is greatest early.
//
// Upper-limb prediction: PREP2 (Stinear et al. 2017), ~75 % accurate for the
// 3-month category, from the SAFE score (shoulder abduction + finger extension,
// MRC 0–5 each) on day 3, age, the motor-evoked potential (MEP, by TMS) and NIHSS.
//
// Impairment curve: proportional recovery (Prabhakaran 2008): patients whose
// corticospinal tract works recover ~70 % of their potential Fugl-Meyer upper
// extremity (FM-UE, max 66) within ~3 months:  ΔFM ≈ 0.7·(66 − FM₀).
// Modelled as FM(t) = FM₀ + ΔFM·(1 − e^(−t/τ)), τ = 4 weeks, so ~95 % of the
// change is in by 12 weeks. Some severe patients ("non-fitters", typically with
// no MEP) recover far less. The rule is debated (mathematical coupling, Hawe
// 2019), so HEARTBEAT shows it as a teaching model, not a forecast.

export const FM_MAX = 66;
export const PHASES = [
  { id: 'hyper', from: 0, to: 1 / 30.44 },            // in months (0–24 h)
  { id: 'acute', from: 1 / 30.44, to: 7 / 30.44 },
  { id: 'early', from: 7 / 30.44, to: 3 },
  { id: 'late', from: 3, to: 6 },
  { id: 'chronic', from: 6, to: 12 },
];
export const PREP2_ARAT = { excellent: '51–57', good: '34–57', limited: '13–33', poor: '0–12' };

export function prep2({ safe, age, mep, nihss }) {
  if (safe >= 5) {
    if (age < 80) return { cat: 'excellent', path: ['safe5', 'ageU80'] };
    return safe >= 8 ? { cat: 'excellent', path: ['safe5', 'age80', 'safe8'] } : { cat: 'good', path: ['safe5', 'age80', 'safeU8'] };
  }
  if (mep === null || mep === undefined) return { cat: null, path: ['safeU5', 'needMep'] };
  if (mep) return { cat: 'good', path: ['safeU5', 'mepPos'] };
  return nihss < 7 ? { cat: 'limited', path: ['safeU5', 'mepNeg', 'nihssU7'] } : { cat: 'poor', path: ['safeU5', 'mepNeg', 'nihss7'] };
}

// Proportional-recovery curve with optional, clearly illustrative modifiers.
// practice: 0 usual care, 1 more task-specific practice, 2 high-dose (hundreds of reps a day)
// aerobic: bool; the chronic phase can still improve slowly with training.
export function recoveryCurve({ fm0, fitter = true, practice = 1, aerobic = false }) {
  const frac = fitter ? [0.62, 0.7, 0.75][practice] + (aerobic ? 0.02 : 0) : [0.08, 0.12, 0.16][practice];
  const d = frac * (FM_MAX - fm0), tau = fitter ? 4 : 8;           // weeks
  const lateSlope = [0, 0.25, 0.5][practice] + (aerobic ? 0.15 : 0);  // FM points per month after 6 mo (training effect)
  return (months) => {
    const w = months * 4.345;
    let fm = fm0 + d * (1 - Math.exp(-w / tau));
    if (months > 6) fm += lateSlope * (months - 6);
    return Math.min(FM_MAX, fm);
  };
}
export const phaseAt = (m) => (PHASES.find((p) => m >= p.from && m < p.to) ?? PHASES[PHASES.length - 1]).id;

// Mitochondria and recovery: what is known, with an honest evidence label.
export const MITO_RECOVERY = [
  { id: 'biogenesis', ev: 'pre' },
  { id: 'mitophagy', ev: 'pre' },
  { id: 'transfer', ev: 'pre' },
  { id: 'muscle', ev: 'clin' },
  { id: 'fatigue', ev: 'hyp' },
  { id: 'supps', ev: 'none' },
];
export const PREVENTION = ['bp', 'ldl', 'antithrombotic', 'af', 'glucose', 'smoke', 'move', 'sleep'];
