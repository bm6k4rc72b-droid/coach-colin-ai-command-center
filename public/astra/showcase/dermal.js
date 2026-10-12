/**
 * The science behind COLIN Dermal Technologies: skin-care peptides, how far
 * a molecule gets into skin, and what the evidence says.
 *
 * Penetration uses the Potts–Guy equation, fitted to the permeability of
 * ninety-odd compounds through human skin (Potts & Guy, Pharm Res 1992):
 *
 *   log₁₀ Kp [cm/h] = −2.72 + 0.71·log₁₀ Kow − 0.0061·MW
 *
 * Kp = K·D/h, where K is the stratum corneum/water partition coefficient
 * (log K = 0.71·log Kow), D the diffusivity in it and h its thickness. So
 * the size term belongs to diffusivity: D = h·10^(−2.72 − 0.0061·MW) cm²/h.
 * With D in hand, a molecule held at the surface reaches depth x by time t
 * as C/C₀ = erfc(x / 2√(Dt)) (diffusion into a semi-infinite slab), its
 * typical reach is 2√(Dt), and the lag time to steady flux across the
 * layer is t_lag = h²/6D. Every number the room draws comes from these.
 *
 * The model is a textbook one, not a measurement: it was fitted to small
 * molecules (mostly under 500 Da), and formulation — liposomes, enhancers,
 * microneedling — changes everything. It is here to show why size matters
 * (Bos & Meinardi's "500 Dalton rule", Exp Dermatol 2000), not to predict a
 * product.
 *
 * @module astra/showcase/dermal
 */

/* ------------------------------------------------------------- chemistry */

/** Standard atomic weights (IUPAC 2021, conventional values). */
export const ATOMIC = { C: 12.011, H: 1.008, N: 14.007, O: 15.999, S: 32.06, Cu: 63.546 };

/**
 * Molar mass of a molecular formula such as "C14H24N6O4" or "C14H22CuN6O4".
 *
 * @param {string} formula Hill-style formula, elements from ATOMIC.
 * @returns {number} g/mol.
 */
export function molarMass(formula) {
  let total = 0;
  for (const [, el, n] of String(formula).matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (!el) continue;
    if (!(el in ATOMIC)) throw new Error(`unknown element ${el}`);
    total += ATOMIC[el] * (n ? Number(n) : 1);
  }
  return total;
}

/** Subscript digits for display: C14H24N6O4 → C₁₄H₂₄N₆O₄. */
export function prettyFormula(formula) {
  return String(formula).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
}

/* -------------------------------------------------------------- the skin */

/**
 * Facial skin, outside in. Thicknesses are typical ranges; they vary with
 * site, age and person (the epidermis on the cheek is thinner than on the
 * back; the stratum corneum on the face is ~10–20 µm).
 */
export const LAYERS = [
  { id: 'sc', name: 'Stratum corneum', from: 0, to: 15, note: 'The barrier: ~15–20 layers of flattened dead cells in a lipid mortar. Almost everything stops here.' },
  { id: 'epi', name: 'Viable epidermis', from: 15, to: 90, note: 'Living keratinocytes and melanocytes. Where pigment is made and handed out.' },
  { id: 'derm', name: 'Dermis', from: 90, to: 1200, note: 'Collagen and elastin, laid down by fibroblasts. Wrinkles and firmness live here.' },
  { id: 'muscle', name: 'Expression muscle', from: 1200, to: 2500, note: 'Below the skin. Where a nerve tells a frown to happen.' },
];

/** Stratum corneum thickness used by the model (µm). */
export const SC_UM = 15;

/* ------------------------------------------------------------ penetration */

const UM_PER_CM = 1e4;

/**
 * Potts–Guy permeability coefficient.
 *
 * @param {number} mw Molecular weight (Da).
 * @param {number} logP log₁₀ octanol/water partition coefficient.
 * @returns {number} log₁₀ Kp in cm/h.
 */
export function logKp(mw, logP) {
  return -2.72 + 0.71 * logP - 0.0061 * mw;
}

/**
 * Diffusivity in the stratum corneum implied by Potts–Guy's size term.
 *
 * @param {number} mw Molecular weight (Da).
 * @returns {number} D in cm²/h.
 */
export function diffusivity(mw) {
  return (SC_UM / UM_PER_CM) * 10 ** (-2.72 - 0.0061 * mw);
}

/** Typical reach 2√(Dt), in µm, after `hours`. */
export function reach(mw, hours) {
  return 2 * Math.sqrt(diffusivity(mw) * hours) * UM_PER_CM;
}

/** Lag time h²/6D across the stratum corneum, in hours. */
export function lagTime(mw) {
  const h = SC_UM / UM_PER_CM;
  return (h * h) / (6 * diffusivity(mw));
}

/**
 * Complementary error function, Abramowitz & Stegun 7.1.26
 * (|error| ≤ 1.5 × 10⁻⁷).
 */
export function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/** Inverse of erfc on (0, 2), by bisection (erfc is strictly decreasing). */
export function erfcInv(y) {
  if (y <= 0) return Infinity;
  if (y >= 2) return -Infinity;
  let lo = -6;
  let hi = 6;
  for (let k = 0; k < 60; k += 1) {
    const mid = (lo + hi) / 2;
    if (erfc(mid) > y) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Relative concentration C/C₀ at depth `um` after `hours`, for a molecule
 * held at the surface.
 */
export function concentration(mw, um, hours) {
  if (hours <= 0) return um <= 0 ? 1 : 0;
  return erfc((um / UM_PER_CM) / (2 * Math.sqrt(diffusivity(mw) * hours)));
}

/** How many times slower than a 300 Da reference molecule (ratio of D). */
export function slowdown(mw, ref = 300) {
  return 10 ** (0.0061 * (mw - ref));
}

/* ------------------------------------------------------------- the ageing */

/**
 * Skin collagen falls about 1% a year through adult life (Shuster, Black
 * & McVitie, Br J Dermatol 1975). Returned as a share of the level at 20,
 * on that straight-line approximation.
 */
export function collagenShare(age) {
  return Math.max(0, Math.min(1, 1 - 0.01 * (age - 20)));
}

/** The headline numbers on time, sun and sunscreen, each with its source. */
export const AGEING_FACTS = [
  { value: '≈1% / yr', label: 'Skin collagen lost each adult year', cite: 'Shuster, Black & McVitie, Br J Dermatol 1975' },
  { value: '≈80%', label: 'Of visible facial ageing signs attributed to UV exposure, in a study of 298 women', cite: 'Flament et al., Clin Cosmet Investig Dermatol 2013' },
  { value: '24% less', label: 'Skin ageing over 4.5 years with daily sunscreen vs discretionary use (randomised trial, 903 adults)', cite: 'Hughes et al., Ann Intern Med 2013' },
];

/* ---------------------------------------------------------- the peptides */

/**
 * Evidence grades, strongest first. The room labels every claim with one.
 * A: several randomised controlled trials. B: at least one decent RCT or
 * consistent controlled data. C: small or sponsor-run trials. D: lab or
 * manufacturer data only.
 */
export const GRADES = {
  A: { label: 'Strong', note: 'Several randomised controlled trials' },
  B: { label: 'Moderate', note: 'Controlled trials, some independent' },
  C: { label: 'Limited', note: 'Small or sponsor-run trials' },
  D: { label: 'Early', note: 'Lab or manufacturer data only' },
};

/**
 * Topical cosmetic peptides. `logP` values are rough estimates for the
 * calculator (peptides are very water-loving; a palmitoyl tail is there to
 * make them less so) — the room shows them as estimates and lets you move
 * them. Formulas are for the free peptides as named.
 */
export const SKIN_PEPTIDES = [
  {
    id: 'ghkcu',
    name: 'GHK-Cu',
    inci: 'Copper tripeptide-1',
    sequence: 'Gly-His-Lys · Cu²⁺',
    formula: 'C14H22CuN6O4',
    logP: -2,
    family: 'Carrier',
    target: 'derm',
    mechanism: 'A tripeptide found in human plasma that binds copper(II). In cell and animal studies it promotes wound repair and collagen and glycosaminoglycan synthesis, and modulates remodelling enzymes.',
    concerns: ['lines', 'firmness', 'texture'],
    grade: 'C',
    evidence: 'Strong laboratory and wound-healing data; human facial trials are small and mostly unpublished or presented as posters.',
    cite: 'Pickart & Margolina, Int J Mol Sci 2018 (review); Gorouhi & Maibach, Int J Cosmet Sci 2009.',
    cant: 'No large independent randomised trial of a GHK-Cu face cream yet.',
  },
  {
    id: 'matrixyl',
    name: 'Matrixyl',
    inci: 'Palmitoyl pentapeptide-4',
    sequence: 'Pal-Lys-Thr-Thr-Lys-Ser',
    formula: 'C39H75N7O10',
    logP: 1.5,
    family: 'Signal',
    target: 'derm',
    mechanism: 'KTTKS is a fragment of type I procollagen. As a "signal peptide" it is proposed to tell fibroblasts to make more matrix; the palmitoyl tail helps it into the barrier.',
    concerns: ['lines', 'firmness'],
    grade: 'C',
    evidence: '12-week, vehicle-controlled split-face trial in 93 women: measurable improvement in wrinkles and fine lines, rated by experts and image analysis.',
    cite: 'Robinson et al., Int J Cosmet Sci 2005 (sponsor-run); Gorouhi & Maibach 2009.',
    cant: 'One main trial, run by a manufacturer; effects are modest beside retinoids.',
  },
  {
    id: 'argireline',
    name: 'Argireline',
    inci: 'Acetyl hexapeptide-8 (formerly -3)',
    sequence: 'Ac-Glu-Glu-Met-Gln-Arg-Arg-NH₂',
    formula: 'C34H60N14O12S',
    logP: -4,
    family: 'Neurotransmitter-inhibiting',
    target: 'muscle',
    mechanism: 'Mimics the N-terminus of SNAP-25 and competes for a place in the SNARE complex, so in the dish it damps the release of the signal that makes a muscle contract — a "topical Botox" idea.',
    concerns: ['lines'],
    grade: 'C',
    evidence: 'Small trials report shallower expression lines over 4 weeks, including a randomised placebo-controlled one.',
    cite: 'Blanes-Mira et al., Int J Cosmet Sci 2002; Wang et al., Am J Clin Dermatol 2013.',
    cant: 'Its target is muscle, under the whole skin; at ~889 Da how much gets there is doubtful. Not comparable to botulinum toxin.',
  },
  {
    id: 'snap8',
    name: 'SNAP-8',
    inci: 'Acetyl octapeptide-3',
    sequence: 'Ac-Glu-Glu-Met-Gln-Arg-Arg-Ala-Asp-NH₂',
    formula: 'C41H70N16O16S',
    logP: -5,
    family: 'Neurotransmitter-inhibiting',
    target: 'muscle',
    mechanism: 'Argireline lengthened by two residues to mimic more of SNAP-25.',
    concerns: ['lines'],
    grade: 'D',
    evidence: 'Manufacturer data only; no independent peer-reviewed trial found.',
    cite: 'Schagen, Cosmetics 2017 (review).',
    cant: 'At ~1075 Da it is the largest here — twice the 500 Da rule of thumb.',
  },
  {
    id: 'leuphasyl',
    name: 'Leuphasyl',
    inci: 'Pentapeptide-18',
    sequence: 'Tyr-D-Ala-Gly-Phe-Leu',
    formula: 'C29H39N5O7',
    logP: 1,
    family: 'Neurotransmitter-inhibiting',
    target: 'muscle',
    mechanism: 'Modelled on enkephalin; proposed to quieten the nerve ending before it signals the muscle. Often paired with Argireline.',
    concerns: ['lines'],
    grade: 'D',
    evidence: 'Manufacturer data only.',
    cite: 'Schagen, Cosmetics 2017 (review).',
    cant: 'Same problem as Argireline: the target is deep.',
  },
  {
    id: 'pal3',
    name: 'Palmitoyl tripeptide-1',
    inci: 'Pal-GHK (in "Matrixyl 3000" with palmitoyl tetrapeptide-7)',
    sequence: 'Pal-Gly-His-Lys',
    formula: 'C30H54N6O5',
    logP: 2,
    family: 'Signal',
    target: 'derm',
    mechanism: 'The GHK sequence with a palmitoyl tail; proposed to signal collagen production. Its partner, palmitoyl tetrapeptide-7, is proposed to calm inflammatory signalling (IL-6).',
    concerns: ['lines', 'firmness'],
    grade: 'D',
    evidence: 'Manufacturer data, plus combination products in small trials.',
    cite: 'Lupo & Cole, Dermatol Ther 2007; Schagen 2017.',
    cant: 'Hard to separate its effect from everything else in the jar.',
  },
];

/** Molecular weight of a peptide from its formula. */
export function mwOf(peptide) {
  return molarMass(peptide.formula);
}

/* --------------------------------------------------- concerns → solutions */

/**
 * The visitor's possible pain points, and what helps, strongest evidence
 * first. Peptides sit honestly among the other options.
 */
export const CONCERNS = [
  {
    id: 'lines', name: 'Fine lines & wrinkles', icon: '〰',
    why: 'Collagen falls about 1% a year, and sun exposure breaks down what is left. Repeated expressions etch the lines in.',
    options: [
      { name: 'Daily broad-spectrum sunscreen', grade: 'A', how: 'Prevents the UV damage behind most visible ageing.', cite: 'Hughes et al., Ann Intern Med 2013' },
      { name: 'Retinoids (tretinoin; retinol over the counter)', grade: 'A', how: 'The best-studied topical for photoaged skin: new collagen, smoother lines.', cite: 'Weiss et al., JAMA 1988; Kafi et al., Arch Dermatol 2007' },
      { peptide: 'matrixyl' }, { peptide: 'ghkcu' }, { peptide: 'argireline' }, { peptide: 'snap8' }, { peptide: 'leuphasyl' },
    ],
  },
  {
    id: 'firmness', name: 'Loss of firmness', icon: '◠',
    why: 'Elastin and collagen thin with age and sun; the dermis gets less springy.',
    options: [
      { name: 'Daily broad-spectrum sunscreen', grade: 'A', how: 'Slows the breakdown of the matrix.', cite: 'Hughes et al., Ann Intern Med 2013' },
      { name: 'Retinoids', grade: 'A', how: 'Increase dermal collagen in photoaged skin.', cite: 'Kafi et al., Arch Dermatol 2007' },
      { peptide: 'ghkcu' }, { peptide: 'matrixyl' }, { peptide: 'pal3' },
    ],
  },
  {
    id: 'tone', name: 'Uneven tone & dark spots', icon: '◐',
    why: 'Sun, hormones and inflammation make melanocytes overproduce pigment in patches.',
    options: [
      { name: 'Daily broad-spectrum sunscreen', grade: 'A', how: 'Without it, nothing else keeps up.', cite: 'Hughes et al., Ann Intern Med 2013' },
      { name: 'Niacinamide', grade: 'B', how: 'Reduces the transfer of pigment to skin cells; spots fade over weeks.', cite: 'Hakozaki et al., Br J Dermatol 2002' },
      { name: 'Retinoids', grade: 'B', how: 'Speed turnover and even out pigment.', cite: 'Weiss et al., JAMA 1988' },
    ],
  },
  {
    id: 'redness', name: 'Redness & sensitivity', icon: '◉',
    why: 'Often a stressed barrier — but persistent redness can be rosacea, which a dermatologist can treat.',
    options: [
      { name: 'See a dermatologist if it persists', grade: 'A', how: 'Rosacea and dermatitis have proven prescription treatments.', cite: 'Clinical guidelines' },
      { name: 'Gentle, fragrance-free barrier care', grade: 'B', how: 'Fewer irritants, more moisture.', cite: 'Tanno et al., Br J Dermatol 2000 (niacinamide and ceramides)' },
      { peptide: 'pal3' },
    ],
  },
  {
    id: 'dryness', name: 'Dryness & dull texture', icon: '◇',
    why: 'A thinner lipid barrier loses water; dead cells pile up and scatter light unevenly.',
    options: [
      { name: 'Moisturiser with humectants and ceramides', grade: 'B', how: 'Restores the barrier and holds water.', cite: 'Tanno et al., Br J Dermatol 2000' },
      { name: 'Retinoids', grade: 'B', how: 'Smooth texture over months.', cite: 'Kafi et al., Arch Dermatol 2007' },
      { peptide: 'ghkcu' },
    ],
  },
  {
    id: 'oil', name: 'Shine & breakouts', icon: '✧',
    why: 'Sebum output is set by hormones and genes; clogged pores feed breakouts.',
    options: [
      { name: 'See a dermatologist for acne', grade: 'A', how: 'Prescription retinoids and other treatments are proven.', cite: 'Clinical guidelines' },
      { name: 'Niacinamide', grade: 'C', how: 'Reduced sebum in a small trial.', cite: 'Draelos et al., J Cosmet Laser Ther 2006' },
    ],
  },
  {
    id: 'eyes', name: 'Dark circles & tired eyes', icon: '◡',
    why: 'Thin skin over blood vessels, pigment and shadow from volume loss — often genetic.',
    options: [
      { name: 'Sleep, sunscreen, and an honest expectation', grade: 'B', how: 'Little topical evidence; shadows are often structure, not colour.', cite: 'Reviews of periorbital hyperpigmentation' },
      { peptide: 'pal3' }, { peptide: 'ghkcu' },
    ],
  },
];

/**
 * Pain points in order: what the visitor said bothers them first, then
 * what the scan flagged, strongest flag first.
 *
 * @param {string[]} chosen Concern ids the visitor picked.
 * @param {{ concern: string, score: number }[]} flags Scan flags (0–100).
 * @returns {string[]} Concern ids, no repeats.
 */
export function rankConcerns(chosen = [], flags = []) {
  const out = [];
  for (const id of chosen) if (!out.includes(id) && CONCERNS.some((c) => c.id === id)) out.push(id);
  for (const f of [...flags].sort((a, b) => b.score - a.score)) if (f.score >= 50 && !out.includes(f.concern)) out.push(f.concern);
  return out;
}

/** The options for a concern with peptide entries filled in. */
export function solutionsFor(concernId) {
  const concern = CONCERNS.find((c) => c.id === concernId);
  if (!concern) return [];
  return concern.options.map((o) => {
    if (!o.peptide) return { ...o, kind: 'other' };
    const p = SKIN_PEPTIDES.find((x) => x.id === o.peptide);
    return { kind: 'peptide', id: p.id, name: p.name, inci: p.inci, grade: p.grade, how: p.mechanism, cite: p.cite };
  }).sort((a, b) => a.grade.localeCompare(b.grade));
}
