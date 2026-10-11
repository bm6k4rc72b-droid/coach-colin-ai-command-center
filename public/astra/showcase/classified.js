/**
 * EX-039 — the classified file: exenatide, the first GLP-1 drug, which began
 * as a peptide in Gila monster venom.
 *
 * The vault is theatre; the file is not. Every number here is from the
 * prescribing information or a cited paper, every claim is graded by
 * ASTRA's own evidence engine, and the teaser posters' more cinematic
 * claims are checked against the record in plain view. Pure data and maths:
 * no DOM, no three.js.
 *
 * @module astra/showcase/classified
 */

import { band, scoreEvidence } from '../js/evidence.js';

/* --------------------------------------------------------------- identity */

/** Exenatide (synthetic exendin-4), one letter per residue; C-terminus amidated. */
export const EXENATIDE = 'HGEGTFTSDLSKQMEEEAVRLFIEWLKNGGPSSGAPPPS';

/** Human GLP-1(7–36) amide, the hormone it imitates, aligned from its first residue. */
export const GLP1 = 'HAEGTFTSDVSSYLEGQAAKEFIAWLVKGR';

export const IDENTITY = {
  name: 'Exenatide',
  aka: 'synthetic exendin-4',
  code: 'EX-039',
  residues: EXENATIDE.length,
  formula: 'C184H282N50O60S',
  mass: 4186.6,
  halfLife: 2.4,
  tmax: 2.1,
  source: 'Heloderma suspectum (Gila monster) venom',
  discovered: 'Isolated by John Eng, Bronx VA Medical Center, 1992',
  approved: [
    { brand: 'Byetta', year: 2005, form: 'twice-daily injection', note: 'April 2005 — the first GLP-1 receptor agonist approved anywhere' },
    { brand: 'Bydureon', year: 2012, form: 'once-weekly extended-release microspheres', note: 'January 2012; steady state takes 6–7 weeks; boxed warning for thyroid C-cell tumours seen in rodents' },
  ],
  use: 'Adjunct to diet and exercise for glycaemic control in adults with type 2 diabetes.',
  made: 'Made by chemical (solid-phase) synthesis. No lizards are milked.',
  label: 'BYETTA (exenatide) and BYDUREON prescribing information, AstraZeneca (US).',
};

/**
 * Align exenatide with GLP-1 over GLP-1's length and count identical residues.
 *
 * @returns {{ positions: Array<{ i: number, ex: string, glp: string|null, same: boolean, tail: boolean }>, identical: number, compared: number, percent: number }} The alignment.
 */
export function alignment() {
  const positions = [...EXENATIDE].map((ex, i) => {
    const glp = GLP1[i] ?? null;
    return { i: i + 1, ex, glp, same: glp === ex, tail: glp === null };
  });
  const compared = GLP1.length;
  const identical = positions.filter((p) => p.same).length;
  return { positions, identical, compared, percent: (identical / compared) * 100 };
}

/** Residues with a story. */
export const LANDMARKS = [
  { i: 2, label: 'Gly2', text: 'GLP-1 has alanine here, and DPP-4 cuts the hormone right after it within minutes. Glycine resists the cut — the main reason exenatide lasts hours, not minutes.' },
  { i: 25, label: 'Trp25', text: 'The tryptophan the C-terminal tail folds back on to.' },
  { i: 31, label: 'Trp-cage', text: 'Residues 31–39 have no GLP-1 counterpart. They fold round Trp25 into a “Trp-cage” — so neat that chemists shrank it into a 20-residue model protein (Neidigh et al., 2002).' },
];

/* ---------------------------------------------------- pharmacokinetics */

export const LN2 = Math.LN2;

/** Elimination rate from a half-life: kₑ = ln 2 / t½. */
export const keFrom = (halfLife) => LN2 / halfLife;

/** Time to peak of a one-compartment first-order absorption model: tmax = ln(ka/kₑ)/(ka − kₑ). */
export const tmaxOf = (ka, ke) => Math.log(ka / ke) / (ka - ke);

/**
 * The absorption rate that reproduces an observed tmax, by bisection on
 * tmax(ka), which falls monotonically for ka > kₑ.
 *
 * @returns {number} ka in /h.
 */
export function kaFor(tmax, ke) {
  let lo = ke * 1.0001;
  let hi = 50;
  for (let k = 0; k < 200; k += 1) {
    const mid = (lo + hi) / 2;
    if (tmaxOf(mid, ke) > tmax) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Relative concentration after repeated doses (Bateman function with
 * superposition), scaled so a single dose peaks at 1.
 *
 * @param {{ halfLife: number, tmax: number, interval: number, hours: number, step?: number }} options Model.
 * @returns {{ ke: number, ka: number, points: Array<[number, number]>, remaining: number, accumulation: number }} The curve.
 */
export function simulate({ halfLife = IDENTITY.halfLife, tmax = IDENTITY.tmax, interval = 12, hours = 48, step = 0.1 } = {}) {
  const ke = keFrom(halfLife);
  const ka = kaFor(tmax, ke);
  const single = (t) => (t < 0 ? 0 : (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t)));
  const peak = single(tmaxOf(ka, ke));
  const points = [];
  for (let t = 0; t <= hours + 1e-9; t += step) {
    let c = 0;
    for (let d = 0; d <= t; d += interval) c += single(t - d);
    points.push([t, c / peak]);
  }
  return {
    ke,
    ka,
    points,
    // Fraction of a dose left one interval later, and the steady-state
    // accumulation ratio R = 1 / (1 − e^(−kₑτ)).
    remaining: Math.exp(-ke * interval),
    accumulation: 1 / (1 - Math.exp(-ke * interval)),
  };
}

/**
 * A molecule's lifetime under first-order elimination: exponential with
 * mean t½ / ln 2, sampled by inversion, −ln(U)·t½/ln 2.
 *
 * @param {number} u A uniform random number in (0, 1].
 * @param {number} halfLife Half-life.
 * @returns {number} Lifetime, same units as the half-life.
 */
export const lifetime = (u, halfLife) => (-Math.log(Math.max(u, 1e-12)) * halfLife) / LN2;

/* -------------------------------------------------------------- the file */

/** The evidence file, in ASTRA's study-record shape. */
export const STUDIES = [
  {
    id: 'eng-1992', title: 'Isolation and characterization of exendin-4, an exendin-3 analogue, from Heloderma suspectum venom',
    authors: 'Eng J, Kleinman WA, Singh L, Singh G, Raufman JP', journal: 'Journal of Biological Chemistry', year: 1992,
    design: 'Biochemical isolation and cell assays', tier: 'invitro', n: 0, population: 'Gila monster venom; guinea-pig pancreatic acini',
    finding: 'A 39-residue peptide in the venom raised cAMP in pancreatic acinar cells, acting through receptors later shown to be the GLP-1 receptor.',
    limitation: 'Venom chemistry in a dish — the start of the story, not evidence of benefit in people.', direction: 1,
  },
  {
    id: 'defronzo-2005', title: 'Effects of exenatide (exendin-4) on glycemic control and weight over 30 weeks in metformin-treated patients with type 2 diabetes',
    authors: 'DeFronzo RA, Ratner RE, Han J, Kim DD, Fineman MS, Baron AD', journal: 'Diabetes Care', year: 2005,
    design: 'Randomised, double-blind, placebo-controlled trial', tier: 'human-rct', n: 336, population: 'Adults with type 2 diabetes on metformin',
    finding: 'HbA1c fell 0.78 percentage points on the higher-dose arm against a 0.08 rise on placebo; weight fell 2.8 kg against 0.3 kg.',
    limitation: 'Thirty weeks, industry-funded, and nausea was common.', direction: 1,
  },
  {
    id: 'duration-1', title: 'Exenatide once weekly versus twice daily for the treatment of type 2 diabetes (DURATION-1)',
    authors: 'Drucker DJ, Buse JB, Taylor K, et al.', journal: 'The Lancet', year: 2008,
    design: 'Randomised, open-label, non-inferiority trial', tier: 'human-rct', n: 295, population: 'Adults with type 2 diabetes',
    finding: 'At 30 weeks HbA1c fell 1.9 points on once-weekly against 1.5 on twice-daily; weight fell by a similar 3–4 kg on both.',
    limitation: 'Open-label and industry-funded; compares two forms of the same drug rather than drug against placebo.', direction: 1,
  },
  {
    id: 'exscel', title: 'Effects of once-weekly exenatide on cardiovascular outcomes in type 2 diabetes (EXSCEL)',
    authors: 'Holman RR, Bethel MA, Mentz RJ, et al.', journal: 'New England Journal of Medicine', year: 2017,
    design: 'Randomised, double-blind, placebo-controlled outcomes trial', tier: 'human-rct', n: 14752, population: 'Adults with type 2 diabetes, with or without cardiovascular disease',
    finding: 'Over a median 3.2 years, major cardiovascular events occurred in 11.4% vs 12.2%: hazard ratio 0.91 (95% CI 0.83–1.00). Non-inferior — safe for the heart — but not shown to be superior.',
    limitation: 'Many participants stopped the drug early, which blunts any real effect.', direction: 0,
  },
  {
    id: 'exenatide-pd', title: 'Exenatide once weekly versus placebo in Parkinson’s disease',
    authors: 'Athauda D, Maclagan K, Skene SS, et al.', journal: 'The Lancet', year: 2017,
    design: 'Randomised, double-blind, placebo-controlled phase 2 trial', tier: 'human-rct', n: 62, population: 'Adults with moderate Parkinson’s disease',
    finding: 'At 60 weeks, off-medication motor scores (MDS-UPDRS part 3) favoured exenatide by 3.5 points (95% CI 0.3–6.7).',
    limitation: 'Small and single-centre: a signal to test, not a result to rely on.', direction: 1,
  },
  {
    id: 'exenatide-pd3', title: 'Exenatide once a week versus placebo as a potential disease-modifying treatment for Parkinson’s disease (Exenatide-PD3)',
    authors: 'Vijiaratnam N, Girges C, Auld G, et al.', journal: 'The Lancet', year: 2025,
    design: 'Randomised, double-blind, placebo-controlled phase 3 trial', tier: 'human-rct', n: 194, population: 'Adults with Parkinson’s disease, six UK centres',
    finding: 'Over 96 weeks, no difference in off-medication motor scores: adjusted difference 0.92 points (95% CI −1.56 to 3.39). The phase 2 signal did not replicate.',
    limitation: 'Does not rule out benefit in a subgroup or at an earlier stage of disease.', direction: -1,
  },
  {
    id: 'neidigh-2002', title: 'Designing a 20-residue protein',
    authors: 'Neidigh JW, Fesinmeyer RM, Andersen NH', journal: 'Nature Structural Biology', year: 2002,
    design: 'Protein design and NMR structure', tier: 'mechanistic', n: 0, population: 'Peptides derived from the exendin-4 C-terminus',
    finding: 'The exendin-4 tail’s Trp-cage fold was shrunk into a stable 20-residue miniprotein.',
    limitation: 'Structural chemistry: says nothing about effects in people.', direction: 1,
  },
];

const byId = (ids) => STUDIES.filter((s) => ids.includes(s.id));

/**
 * What the file claims, each graded by ASTRA's evidence engine. `verdict`
 * is written by hand where the engine's score alone would mislead (a
 * neutral or negative trial is still a strong design).
 */
export const CLAIMS = [
  { id: 'glycaemia', text: 'Lowers HbA1c in adults with type 2 diabetes', studies: ['defronzo-2005', 'duration-1'], level: 'established', verdict: 'Established: replicated in randomised trials, and approved for exactly this.' },
  { id: 'weight', text: 'Causes weight loss', studies: ['defronzo-2005', 'duration-1'], level: 'modest', verdict: 'Modest: about 3–4 kg in diabetes trials — a fraction of what semaglutide or tirzepatide achieve.' },
  { id: 'heart', text: 'Prevents heart attacks and strokes', studies: ['exscel'], level: 'neutral', verdict: 'Not shown: EXSCEL found it safe for the heart, but the benefit missed significance (HR 0.91, upper bound 1.00).' },
  { id: 'parkinson', text: 'Slows Parkinson’s disease', studies: ['exenatide-pd', 'exenatide-pd3'], level: 'contradicted', verdict: 'Contradicted: a promising phase 2, then a negative phase 3 in 2025.' },
  { id: 'muscle', text: 'Builds muscle (“muscular hypertrophy 142%”)', studies: [], level: 'fiction', verdict: 'Fiction. No study shows it; weight lost on GLP-1 drugs includes some lean mass, not extra muscle.' },
].map((claim) => {
  const reading = scoreEvidence(byId(claim.studies));
  return { ...claim, score: reading.score, band: band(reading.score) };
});

/** The teaser posters, fact-checked line by line. */
export const TEASER_CHECK = [
  { said: '39 amino acids', verdict: 'true', note: 'Exendin-4 has 39 residues; GLP-1 has 30 in its active form.' },
  { said: 'Half-life 2.4 hours', verdict: 'true', note: 'Mean terminal half-life after injection, from the prescribing information.' },
  { said: 'Mass 4186.6 Da · C184H282N50O60S', verdict: 'true', note: 'Exactly as on the label.' },
  { said: 'The first GLP-1 from Gila monster saliva', verdict: 'true', note: 'The venom is delivered in saliva; Byetta (2005) was the first GLP-1 drug approved.' },
  { said: 'Once–twice daily injectable', verdict: 'partly', note: 'Byetta is twice daily; Bydureon is once weekly. There is no once-daily exenatide.' },
  { said: 'Range: SW USA & NW Mexico', verdict: 'true', note: 'Arizona and neighbouring corners of Nevada, Utah, California and New Mexico, into Sonora. The poster map’s state labels are scrambled.' },
  { said: 'Binding affinity IC50 0.42 nM', verdict: 'unverified', note: 'Sub-nanomolar to low-nanomolar figures are reported, but they vary with the assay. Plausible, not a constant.' },
  { said: 'Purity 97.4% · stability 82%', verdict: 'prop', note: 'Set dressing. Release specifications for a licensed medicine are not marketing numbers.' },
  { said: 'Muscular hypertrophy 142% · black goo synth', verdict: 'false', note: 'Pure fiction. Exenatide does not build muscle, and it is not goo.' },
  { said: 'Level 4 biohazard · Class III peptide', verdict: 'false', note: 'Biosafety level 4 is for pathogens like Ebola. Exenatide is a licensed prescription medicine — supervised by a doctor, not a hazmat team.' },
];

/** Safety, from the labels: what a reader should know without any dosing. */
export const SAFETY_FILE = [
  'Nausea is the commonest side effect, especially early on; vomiting and diarrhoea also occur.',
  'Acute pancreatitis has been reported after marketing; the labels carry a warning.',
  'Cleared mainly by the kidneys: not recommended in severe kidney impairment, and kidney injury has been reported, often with dehydration from vomiting.',
  'Low blood sugar mainly when combined with sulfonylureas or insulin.',
  'Bydureon (weekly) carries a boxed warning for thyroid C-cell tumours seen in rodents.',
];

/** The panels of the Black Lab, in order. */
export const LAB_PANELS = [
  { id: 'specimen', plate: 'exColin', kicker: 'Specimen file', title: 'The first GLP-1 drug came out of a lizard' },
  { id: 'origin', plate: 'exGila', kicker: 'Origin', title: 'Heloderma suspectum' },
  { id: 'structure', plate: 'exLab', kicker: 'Structure', title: 'Half human, half monster' },
  { id: 'halflife', plate: 'exBench', kicker: 'Half-life', title: '2.4 hours, by the numbers' },
  { id: 'evidence', plate: 'exTank', kicker: 'Evidence file', title: 'What it does — and doesn’t' },
  { id: 'truth', plate: 'exPoster', kicker: 'Declassified', title: 'The teaser, fact-checked' },
];
