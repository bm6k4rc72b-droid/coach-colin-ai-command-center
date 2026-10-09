/**
 * The chamber's seven stations: what each one says, and the arithmetic behind
 * the numbers on its screens.
 *
 * Everything quantitative here is either read live from ASTRA's corpus (the
 * evidence ceilings and every compound's confidence reading) or comes from a
 * cited trial, and the synthesis yield is computed rather than quoted. The
 * room is a showcase; the numbers in it are not decoration.
 *
 * @module astra/showcase/sections
 */

import { PEPTIDES, corpusSize } from '../js/data/peptides.js';
import { TIERS, band, scoreEvidence } from '../js/evidence.js';

/* ------------------------------------------------------------ live corpus */

/** Every compound's confidence reading, strongest first. */
export const READINGS = PEPTIDES.map((peptide) => {
  const reading = scoreEvidence(peptide.studies);
  return {
    id: peptide.id,
    name: peptide.name,
    klass: peptide.klass,
    score: reading.score,
    band: band(reading.score),
    status: peptide.regulatory.status,
  };
}).sort((a, b) => b.score - a.score);

/** The seven tiers' hard ceilings, as the analysis wall shows them. */
export const CEILINGS = TIERS.map((tier) => ({ id: tier.id, label: tier.label, ceiling: tier.ceiling, accent: tier.accent }));

export const SIZE = corpusSize();

/* ------------------------------------------------------- incretin trials */

/**
 * The three incretin agonists, with the headline obesity trial for each.
 * Placebo-subtracted change is computed, not quoted: Δ = drug − placebo.
 */
export const AGONISTS = [
  {
    id: 'semaglutide', name: 'Semaglutide', targets: ['GLP-1R'],
    halfLife: '≈ 7 days (about 165 h)', residues: 31,
    trial: 'STEP 1 · NEJM 2021', weeks: 68, drug: 14.9, placebo: 2.4, dose: '2.4 mg',
    status: 'Approved',
  },
  {
    id: 'tirzepatide', name: 'Tirzepatide', targets: ['GLP-1R', 'GIPR'],
    halfLife: '≈ 5 days (about 117 h)', residues: 39,
    trial: 'SURMOUNT-1 · NEJM 2022', weeks: 72, drug: 20.9, placebo: 3.1, dose: '15 mg',
    status: 'Approved',
  },
  {
    id: 'retatrutide', name: 'Retatrutide', targets: ['GLP-1R', 'GIPR', 'GCGR'],
    halfLife: '≈ 6 days', residues: 39,
    trial: 'Phase 2 · NEJM 2023', weeks: 48, drug: 24.2, placebo: 2.1, dose: '12 mg',
    status: 'Investigational',
    topline: 'Phase 3 TRIUMPH-1 topline (May 2026, not yet peer-reviewed): −28.3% at 80 weeks vs −2.2% placebo.',
  },
].map((agonist) => ({ ...agonist, delta: Number((agonist.drug - agonist.placebo).toFixed(1)) }));

export const RECEPTORS = [
  { id: 'GLP-1R', label: 'GLP-1 receptor', role: 'Appetite, glucose-dependent insulin, slower gastric emptying' },
  { id: 'GIPR', label: 'GIP receptor', role: 'Insulin secretion, adipose lipid handling' },
  { id: 'GCGR', label: 'Glucagon receptor', role: 'Energy expenditure, liver fat oxidation' },
];

/* -------------------------------------------------------------- synthesis */

/**
 * Solid-phase peptide synthesis yield.
 *
 * The first residue is pre-loaded on the resin, so a chain of L residues needs
 * L − 1 cycles, each a deprotection followed by a coupling: 2(L − 1)
 * reactions. If every reaction succeeds with probability p, the fraction of
 * chains that are full length is
 *
 *     Y = p^(2(L − 1))
 *
 * and the per-step efficiency needed to hit a target yield is its inverse,
 *
 *     p = Y^(1 / (2(L − 1))).
 *
 * @param {number} p Per-reaction efficiency in (0, 1].
 * @param {number} length Residues in the chain (L ≥ 1).
 * @returns {{ reactions: number, yield: number, failed: number }} The result.
 */
export function sppsYield(p, length) {
  const reactions = 2 * Math.max(0, length - 1);
  const value = reactions ? p ** reactions : 1;
  return { reactions, yield: value, failed: 1 - value };
}

/**
 * Per-reaction efficiency needed for a target full-length yield.
 *
 * @param {number} target Desired yield in (0, 1].
 * @param {number} length Residues in the chain.
 * @returns {number} Required per-step efficiency.
 */
export function requiredEfficiency(target, length) {
  const reactions = 2 * Math.max(0, length - 1);
  return reactions ? target ** (1 / reactions) : 1;
}

/** Chain lengths the synthesis bench offers as presets. */
export const CHAINS = [
  { id: 'ghk', name: 'GHK', length: 3 },
  { id: 'bpc', name: 'BPC-157', length: 15 },
  { id: 'sema', name: 'Semaglutide', length: 31 },
  { id: 'reta', name: 'Retatrutide', length: 39 },
];

/* ------------------------------------------------------------- sequences */

/**
 * Native GLP-1(7–37) and semaglutide, aligned residue by residue. Semaglutide
 * keeps 28 of 31 positions: Aib at 8 resists DPP-4, Arg at 34 leaves Lys26
 * as the single acylation site, and Lys26 carries the C18 fatty diacid that
 * binds albumin.
 */
export const SEQUENCES = {
  native: 'HAEGTFTSDVSSYLEGQAAKEFIAWLVKGRG'.split(''),
  sema: 'H·EGTFTSDVSSYLEGQAA*EFIAWLVRGRG'.split(''),
  changes: [
    { position: 8, from: 'A', to: 'Aib', why: 'α-aminoisobutyric acid: DPP-4 can no longer cleave the N-terminus' },
    { position: 26, from: 'K', to: 'K + C18 diacid', why: 'fatty-acid side chain binds albumin, stretching half-life to about a week' },
    { position: 34, from: 'K', to: 'R', why: 'removes the second lysine so the acyl chain goes on exactly one site' },
  ],
};

/** The codon table subset needed to read GLP-1(7–37) back to its gene. */
export const CODONS = {
  H: 'CAU', A: 'GCU', E: 'GAA', G: 'GGA', T: 'ACU', F: 'UUC', S: 'AGC', D: 'GAU', V: 'GUG',
  Y: 'UAC', L: 'CUG', Q: 'CAG', K: 'AAG', I: 'AUU', W: 'UGG', R: 'CGG',
};

/* --------------------------------------------------------------- body map */

export const SITES = [
  { id: 'brain', label: 'Hypothalamus & hindbrain', at: [0, 1.62, 0.02], text: 'GLP-1 receptors in the arcuate nucleus and the area postrema / nucleus of the solitary tract reduce appetite. The same hindbrain region is involved in nausea, the most common side effect of the class.' },
  { id: 'heart', label: 'Heart', at: [0.05, 1.18, 0.06], text: 'Resting heart rate rises a few beats per minute across the GLP-1 agonist class. Retatrutide’s Phase 2 rise was dose-dependent and peaked around week 24.' },
  { id: 'stomach', label: 'Stomach', at: [0.07, 1.0, 0.07], text: 'Gastric emptying slows, so fullness lasts longer after a meal. This is a large part of the early effect, and a source of the gastrointestinal side effects.' },
  { id: 'liver', label: 'Liver', at: [-0.1, 0.98, 0.06], text: 'Glucagon-receptor activation (retatrutide’s third arm) raises hepatic fatty-acid oxidation. In a Phase 2 substudy, most participants on the top doses reached normal liver fat by 48 weeks.' },
  { id: 'pancreas', label: 'Pancreas', at: [0.02, 0.92, 0.0], text: 'β-cells release more insulin only when glucose is high (glucose-dependent), and GLP-1 also suppresses glucagon from α-cells. That dependence is why hypoglycaemia risk is low on its own.' },
  { id: 'fat', label: 'Adipose tissue', at: [0.14, 0.82, 0.04], text: 'GIP receptors in fat tissue are proposed to improve lipid buffering and insulin sensitivity; how much the GIP arm contributes to weight loss is still debated.' },
];

/* ------------------------------------------------------------ the stations */

/**
 * Station copy. `id` keys the hologram and screen builders in the room.
 */
export const STATIONS = [
  {
    id: 'chamber',
    kicker: '00 · The chamber',
    title: 'Peptide Intelligence Chamber',
    body: `A circular laboratory with seven stations. Swipe or scroll sideways to travel round the room; tilt your phone, or move a finger or the mouse, and the room moves with you. Every number on these screens comes from ASTRA’s graded corpus (${SIZE.peptides} compounds, ${SIZE.studies} studies, ${SIZE.claims} graded claims) or from a cited trial.`,
    facts: [
      'Swipe, scroll or use ← → to change station',
      'Tilt the device, or move a finger, to look around',
      'Tap a hologram to pulse it',
    ],
  },
  {
    id: 'analysis',
    kicker: '01 · Peptide analysis',
    title: 'Seven tiers, each with a ceiling',
    body: 'The analysis wall grades every compound the same way. The best study design available sets the band (a randomised human trial can reach 96%, an animal study never more than 45%), and replication and consistency place the compound inside it.',
    facts: CEILINGS.map((tier) => `${tier.label}: ceiling ${Math.round(tier.ceiling * 100)}%`),
    cite: 'Scores computed live by ASTRA’s evidence engine (js/evidence.js).',
  },
  {
    id: 'receptor',
    kicker: '02 · GLP-1 receptor agonist',
    title: 'How the key fits the lock',
    body: 'The GLP-1 receptor is a class B G-protein-coupled receptor: a 463-amino-acid protein that crosses the cell membrane seven times. The peptide binds in two steps. Its C-terminal helix docks on the receptor’s extracellular domain, then its N-terminus slides into the transmembrane core. That shift activates Gαs, which drives adenylyl cyclase and cAMP, which drive glucose-dependent insulin release.',
    facts: [
      'Native GLP-1 lasts about 2 minutes: DPP-4 cleaves it after Ala8',
      'Semaglutide lasts about a week: Aib8 plus albumin binding',
      'Hologram: 7 transmembrane helices, extracellular domain and ligand',
    ],
    cite: 'Zhang et al., Nature 2017 (cryo-EM GLP-1R–Gs); Drucker, Cell Metab 2018; Lau et al., J Med Chem 2015.',
  },
  {
    id: 'agonists',
    kicker: '03 · GLP-1 receptor agonists',
    title: 'One receptor, two, then three',
    body: 'Each generation adds a receptor. Semaglutide activates GLP-1R alone, tirzepatide adds GIPR, and retatrutide adds the glucagon receptor. Bars show weight loss with the placebo arm subtracted (Δ = drug − placebo). These are different trials of different lengths, so the gaps between them are not a head-to-head comparison.',
    facts: AGONISTS.map((a) => `${a.name}: −${a.drug}% vs −${a.placebo}% placebo at ${a.weeks} wk → Δ ${a.delta} pts (${a.trial})`),
    cite: 'Wilding NEJM 2021; Jastreboff NEJM 2022; Jastreboff NEJM 2023. Retatrutide is investigational.',
  },
  {
    id: 'synthesis',
    kicker: '04 · Molecular synthesis',
    title: 'Building a chain one residue at a time',
    body: 'Solid-phase peptide synthesis anchors the first residue to a resin bead, then repeats two reactions for every residue added: deprotect, couple. If each reaction works with probability p, the share of chains that come out full length is Y = p^(2(L−1)). Small losses compound, and long peptides punish them hard.',
    facts: [],
    cite: 'Merrifield, J Am Chem Soc 1963 (Nobel Prize in Chemistry, 1984).',
  },
  {
    id: 'telemetry',
    kicker: '05 · Biological telemetry',
    title: 'Where the incretin signal lands',
    body: 'The same molecule acts in many tissues at once. Pick a site to see what the receptors there do. The trace on the wall is a simulated 72 bpm display, not a measurement of anyone.',
    facts: [],
    cite: 'Drucker, Cell Metab 2018; Jastreboff NEJM 2023; Sanyal, Nat Med 2024.',
  },
  {
    id: 'genome',
    kicker: '06 · From gene to drug',
    title: 'Read off a gene, then rewritten',
    body: 'GLP-1 comes from the proglucagon gene GCG on chromosome 2q24.2. Intestinal L-cells cut its 180-residue precursor with PC1/3 to release GLP-1, while pancreatic α-cells use PC2 to make glucagon. Each residue costs three bases, so GLP-1(7–37) needs 93 coding nucleotides. Semaglutide keeps 28 of its 31 residues and rewrites the other three.',
    facts: SEQUENCES.changes.map((c) => `Position ${c.position}: ${c.from} → ${c.to} (${c.why})`),
    cite: 'Drucker, Cell Metab 2018; Lau et al., J Med Chem 2015.',
  },
];
