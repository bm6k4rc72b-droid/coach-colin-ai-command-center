/**
 * Teaching cases. Numbers are rounded, plausible teaching values, not real patients.
 * Volumes in mL, times in minutes.
 */

export type ClotType = 'red' | 'mixed' | 'white';
export type Collaterals = 'good' | 'moderate' | 'poor';
export type ArchType = 1 | 2 | 3;

export interface Clot {
  /** Vessel segment and the fraction of it the clot spans. */
  segment: 'm1' | 'ica';
  from: number;
  to: number;
  /** For an ICA-terminus clot, it also extends this far into M1 (fraction of M1). */
  intoM1?: number;
  type: ClotType;
  lengthMm: number;
}

export interface Case {
  id: string;
  title: string;
  summary: string;
  age: number;
  sex: 'F' | 'M';
  /** Minutes from last known well to hospital door. */
  onsetToDoor: number;
  wakeUp: boolean;
  nihss: number;
  deficits: string;
  bp: [number, number];
  anticoagulated: boolean;
  aspects: number;
  /** CT perfusion: ischaemic core (rCBF < 30%) and total hypoperfused (Tmax > 6 s) at imaging. */
  coreAtImaging: number;
  hypoperfused: number;
  collaterals: Collaterals;
  arch: ArchType;
  clot: Clot;
  /** What a stroke team should decide. */
  answers: {
    thrombolysis: 'give' | 'withhold';
    perfusionNeeded: boolean;
    thrombectomy: 'proceed' | 'decline';
  };
  teaching: string[];
}

export const CASES: Case[] = [
  {
    id: 'm1',
    title: 'Left M1 · early window',
    summary: 'Sudden right-sided weakness and loss of speech at home, seen by her husband. Arrives 95 minutes after onset.',
    age: 67,
    sex: 'F',
    onsetToDoor: 95,
    wakeUp: false,
    nihss: 16,
    deficits: 'Right face/arm/leg weakness, global aphasia, left gaze preference',
    bp: [192, 104],
    anticoagulated: false,
    aspects: 9,
    coreAtImaging: 9,
    hypoperfused: 125,
    collaterals: 'good',
    arch: 1,
    clot: { segment: 'm1', from: 0.3, to: 0.69, type: 'red', lengthMm: 11 },
    answers: { thrombolysis: 'give', perfusionNeeded: false, thrombectomy: 'proceed' },
    teaching: [
      'Within 4.5 h with no contraindication: give IV thrombolysis (tenecteplase is a single bolus), but first bring BP to ≤ 185/110.',
      'Within 6 h, non-contrast CT (ASPECTS) and CTA showing a large-vessel occlusion are enough; perfusion imaging is optional and must not delay the groin puncture.',
      'Thrombolysis does not replace thrombectomy: go straight to the angio suite. Do not wait to see whether the drug works.',
    ],
  },
  {
    id: 'late',
    title: 'Wake-up stroke · late window',
    summary: 'Went to bed well at 22:00 and woke at 06:30 unable to speak or move his right arm. Arrives at 08:30: 10.5 h since last known well.',
    age: 72,
    sex: 'M',
    onsetToDoor: 630,
    wakeUp: true,
    nihss: 18,
    deficits: 'Right hemiplegia, expressive aphasia, right hemianopia',
    bp: [176, 92],
    anticoagulated: false,
    aspects: 8,
    coreAtImaging: 18,
    hypoperfused: 112,
    collaterals: 'moderate',
    arch: 2,
    clot: { segment: 'm1', from: 0.2, to: 0.735, type: 'white', lengthMm: 15 },
    answers: { thrombolysis: 'withhold', perfusionNeeded: true, thrombectomy: 'proceed' },
    teaching: [
      'Beyond 4.5 h from last known well, standard IV thrombolysis is not given (MRI DWI–FLAIR mismatch or perfusion-guided protocols are exceptions that need extra imaging).',
      'From 6 to 24 h, select by perfusion imaging: a small core and a large mismatch (DAWN, DEFUSE-3). This patient: 18 mL core vs 112 mL hypoperfused → eligible.',
      'Fibrin-rich ("white") clots are firm and sticky. Stent retrievers and combined techniques do relatively better than aspiration alone.',
    ],
  },
  {
    id: 'core',
    title: 'ICA terminus · large core',
    summary: 'Collapsed at lunch with left gaze deviation and dense right hemiplegia. On no anticoagulants. Arrives 4 h 40 min after onset.',
    age: 74,
    sex: 'F',
    onsetToDoor: 280,
    wakeUp: false,
    nihss: 22,
    deficits: 'Dense right hemiplegia, global aphasia, forced left gaze, right neglect',
    bp: [168, 88],
    anticoagulated: false,
    aspects: 4,
    coreAtImaging: 62,
    hypoperfused: 190,
    collaterals: 'poor',
    arch: 3,
    clot: { segment: 'ica', from: 0.927, to: 1, intoM1: 0.3, type: 'mixed', lengthMm: 18 },
    answers: { thrombolysis: 'withhold', perfusionNeeded: false, thrombectomy: 'proceed' },
    teaching: [
      'At 4 h 40 min she is just past the 4.5 h thrombolysis window by the time a bolus could be given, so IV lysis is withheld.',
      'Large core (ASPECTS 3–5) used to be excluded. SELECT2, ANGEL-ASPECT, RESCUE-Japan LIMIT and TENSION showed thrombectomy still improves outcomes, with more haemorrhage risk.',
      'Poor collaterals mean the core grows fast: every minute matters even more. A type III arch makes the left carotid harder and slower to catheterise.',
    ],
  },
];

export const CLOT_INFO: Record<ClotType, string> = {
  red: 'Red, RBC-rich: soft and fresh. Aspirates well; can fragment.',
  mixed: 'Mixed RBC/fibrin: intermediate.',
  white: 'White, fibrin/platelet-rich: firm and sticky. Hard to aspirate; can "cork" the catheter.',
};

/** Core growth rate (mL per hour) while unreperfused, by collateral grade. */
export const CORE_GROWTH: Record<Collaterals, number> = { good: 2.5, moderate: 6, poor: 16 };

/** Approximate neurons per mL of infarct, from Saver 2006 ("time is brain"). */
export const NEURONS_PER_ML = 21e6;
