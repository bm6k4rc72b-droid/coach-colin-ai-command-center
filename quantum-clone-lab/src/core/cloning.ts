/**
 * Somatic-cell nuclear transfer (SCNT) as a teaching model. This is the technique behind Dolly
 * the sheep and every mammal cloned since. The yields below are simplified, literature-anchored
 * teaching values — enough to show WHY cloning is so inefficient, not a laboratory protocol.
 * Pure and unit tested.
 *
 * Educational and demonstration use only. Human reproductive cloning is prohibited by law in
 * most of the world; this module exists to explain the biology and its limits, and the UI says so.
 */

export type DonorArrest = 'g0' | 'cycling';
export type Activation = 'electro-chem' | 'electro-only';

export interface Species {
  id: string;
  name: string;
  /** Baseline fraction of reconstructed embryos that reach blastocyst in vitro. */
  blastocystBase: number;
  /** Baseline live births per embryo transferred to a surrogate. */
  birthBase: number;
  difficulty: number;
  milestone: string;
  note: string;
}

/** Real milestones; the efficiency figures are rounded teaching values. */
export const SPECIES: Species[] = [
  { id: 'sheep', name: 'Sheep', blastocystBase: 0.17, birthBase: 0.06, difficulty: 1, milestone: 'Dolly, 1996 (Wilmut & Campbell, Roslin Institute) — the first mammal cloned from an adult cell.', note: 'Dolly came from 1 live lamb out of 277 reconstructed embryos — roughly 0.4% efficiency.' },
  { id: 'cattle', name: 'Cattle', blastocystBase: 0.35, birthBase: 0.09, difficulty: 0.8, milestone: 'Cloned commercially since the late 1990s for elite breeding stock.', note: 'Among the more efficient mammals for SCNT, but "large offspring syndrome" is common.' },
  { id: 'mouse', name: 'Mouse', blastocystBase: 0.45, birthBase: 0.02, difficulty: 1.1, milestone: 'Cumulina, 1997–98 (Wakayama & Yanagimachi) — established the injection method.', note: 'High blastocyst rates but low birth rates; the workhorse for studying reprogramming.' },
  { id: 'cat', name: 'Cat', blastocystBase: 0.2, birthBase: 0.04, difficulty: 1.1, milestone: 'CC ("CopyCat"), 2001 — the first cloned pet.', note: "CC had a different coat pattern from her genetic donor: coat colour depends on X-inactivation and development, not just DNA." },
  { id: 'dog', name: 'Dog', blastocystBase: 0.12, birthBase: 0.03, difficulty: 1.5, milestone: 'Snuppy, 2005 (Hwang lab, Seoul) — dogs are hard because their eggs mature unusually.', note: 'Required over 1,000 reconstructed embryos; oocyte maturation in dogs is especially difficult.' },
  { id: 'macaque', name: 'Macaque (primate)', blastocystBase: 0.28, birthBase: 0.015, difficulty: 2, milestone: 'Zhong Zhong & Hua Hua, 2018 (Sun et al., Shanghai) — the first primates cloned by SCNT.', note: 'Needed HDAC inhibitors and injected reprogramming factors; primate SCNT stayed out of reach for ~20 years after Dolly.' },
];

export interface Choices {
  species: string;
  /** G0/G1-arrested donor cells (e.g. by serum starvation) reprogram more reliably. */
  arrest: DonorArrest;
  activation: Activation;
  /** HDAC inhibitor (e.g. trichostatin A) to loosen chromatin and aid epigenetic reprogramming. */
  hdac: boolean;
  /** Embryos transferred to surrogates in this attempt. */
  embryosTransferred: number;
  /** Surrogate's cycle synchronised with the embryo's stage. */
  synchronised: boolean;
}

export const DEFAULTS: Choices = { species: 'sheep', arrest: 'g0', activation: 'electro-chem', hdac: false, embryosTransferred: 20, synchronised: true };

export interface StepYield {
  id: string;
  name: string;
  /** Fraction surviving this step (conditional on reaching it). */
  rate: number;
  detail: string;
}

export function speciesOf(c: Choices): Species {
  return SPECIES.find((s) => s.id === c.species) ?? SPECIES[0];
}

/**
 * Per-step survival for one attempt. Steps: enucleation, nuclear transfer + fusion,
 * activation, cleavage, blastocyst, pregnancy per transfer, and live birth per pregnancy.
 */
export function steps(c: Choices): StepYield[] {
  const sp = speciesOf(c);
  const reprogram = (c.arrest === 'g0' ? 1 : 0.6) * (c.hdac ? 1.25 : 1);
  const fuse = c.activation === 'electro-chem' ? 0.85 : 0.7;
  const blast = Math.min(0.6, sp.blastocystBase * reprogram);
  return [
    { id: 'enucleate', name: 'Enucleate the oocyte', rate: 0.9, detail: 'A fine pipette removes the egg\'s own metaphase-II chromosomes under polarised light, leaving the cytoplasm that will do the reprogramming.' },
    { id: 'transfer', name: 'Transfer the donor nucleus & fuse', rate: fuse, detail: `The somatic donor cell is slipped under the zona and ${c.activation === 'electro-chem' ? 'an electric pulse fuses it with the egg' : 'fused by electric pulse only'}. Membranes must merge cleanly.` },
    { id: 'activate', name: 'Activate (mimic fertilisation)', rate: c.activation === 'electro-chem' ? 0.8 : 0.65, detail: 'Chemical/electrical activation makes the egg behave as if fertilised and begin dividing. Now the hard part — the egg must silence the adult cell\'s gene programme and switch on the embryo\'s.' },
    { id: 'cleave', name: 'Early cleavage', rate: 0.75 * reprogram, detail: 'The reconstructed embryo starts to divide. Faulty epigenetic reprogramming stalls many embryos here.' },
    { id: 'blastocyst', name: 'Reach blastocyst (in vitro, ~5–7 days)', rate: blast / (0.75 * reprogram), detail: `About ${Math.round(blast * 100)}% of reconstructed embryos become transferable blastocysts for ${sp.name.toLowerCase()}.` },
    { id: 'pregnancy', name: 'Implantation & pregnancy (per embryo transferred)', rate: Math.min(0.6, sp.birthBase * 2.4 * (c.synchronised ? 1 : 0.5)), detail: 'Transferred to a hormonally synchronised surrogate. Abnormal placentas (from imprinting errors) cause many losses.' },
    { id: 'birth', name: 'Healthy live birth (per pregnancy)', rate: Math.min(0.75, (sp.birthBase / Math.min(0.6, sp.birthBase * 2.4)) * (c.hdac ? 1.15 : 1)), detail: 'Large offspring syndrome, respiratory and heart defects reduce survival. Survivors are genetically identical in nuclear DNA, but carry the egg donor\'s mitochondria.' },
  ];
}

export interface Outcome {
  stepRates: StepYield[];
  /** Fraction of reconstructed embryos reaching blastocyst. */
  blastocystRate: number;
  /** Expected live births from this attempt. */
  expectedBirths: number;
  /** Overall efficiency: live births per reconstructed embryo. */
  efficiency: number;
  /** Reconstructed embryos needed, on average, per live birth. */
  embryosPerBirth: number;
  lessons: string[];
}

export function evaluate(c: Choices): Outcome {
  const sp = speciesOf(c);
  const st = steps(c);
  const toBlast = st.slice(0, 5).reduce((p, s) => p * s.rate, 1);
  const pregPer = st[5].rate;
  const birthPer = st[6].rate;
  // embryosTransferred are blastocysts placed in surrogates; reconstructed embryos needed are more.
  const perEmbryoTransferred = pregPer * birthPer;
  const expectedBirths = c.embryosTransferred * perEmbryoTransferred;
  const efficiency = toBlast * perEmbryoTransferred;
  const lessons: string[] = [];
  if (c.arrest === 'cycling') lessons.push('Cycling donor cells reprogram poorly. Arresting them in G0/G1 (serum starvation) was Keith Campbell\'s key insight that made Dolly possible.');
  if (!c.hdac && sp.difficulty >= 1.5) lessons.push(`${sp.name} is hard: HDAC inhibitors (e.g. trichostatin A) relax the chromatin and were essential for the first primate clones.`);
  if (c.activation === 'electro-only') lessons.push('Combined electrical + chemical activation fuses and activates more reliably than an electric pulse alone.');
  if (!c.synchronised) lessons.push('An unsynchronised surrogate halves implantation: the uterus must be at the right point in its cycle for the embryo\'s stage.');
  lessons.push(`Even optimised, efficiency is ~${(efficiency * 100).toFixed(1)}% — about ${Math.round(1 / Math.max(efficiency, 1e-4))} reconstructed embryos per healthy birth. ${sp.note}`);
  lessons.push('A clone is not an instant copy: it is born as a baby and must grow up. It shares nuclear DNA only — mitochondria come from the egg, and coat colour, fingerprints and personality differ.');
  return { stepRates: st, blastocystRate: toBlast, expectedBirths, efficiency, embryosPerBirth: 1 / Math.max(efficiency, 1e-4), lessons };
}
