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

import { PEPTIDES, STACKS, SYSTEMS, allStudies, corpusSize } from '../js/data/peptides.js';
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

/* ------------------------------------------------------------- the plates */

/**
 * The photographic plates. Each fills a station's wall screen behind its
 * instruments and heads its card; `reception` is also the source of the
 * holographic receptionist himself.
 */
export const PLATES = {
  reception: '../assets/showcase/reception.webp',
  cells: '../assets/showcase/cells.webp',
  core: '../assets/showcase/core.webp',
  assembly: '../assets/showcase/assembly.webp',
  brain: '../assets/showcase/brain.webp',
  shattered: '../assets/showcase/shattered.webp',
  bench: '../assets/showcase/bench.webp',
  archive: '../assets/showcase/archive.webp',
  golddna: '../assets/showcase/golddna.webp',
  ligand: '../assets/showcase/ligand.webp',
  hub: '../assets/showcase/hub.webp',
  court: '../assets/showcase/court.webp',
  exBanner: '../assets/showcase/ex-banner.webp',
  influencer: '../assets/showcase/influencer.webp',
  holoscan: '../assets/showcase/holoscan.webp',
  comparison: '../assets/showcase/comparison.jpg',
  showmap: '../assets/showcase/showmap.webp',
  debateroom: '../assets/showcase/debateroom.webp',
  dermLab: '../assets/showcase/derm-lab.webp',
};

/* ----------------------------------------------------------- tool helpers */

/** Everything the comparison bench and debate room can take. */
export const SUBJECTS = [...PEPTIDES, ...STACKS].map((entry) => ({ id: entry.id, name: entry.name, kind: entry.members ? 'stack' : 'peptide' }));

/** Every catalogued study, strongest tier first. */
export const STUDIES = allStudies().sort((a, b) => TIERS.findIndex((t) => t.id === a.tier) - TIERS.findIndex((t) => t.id === b.tier) || b.year - a.year);

export { SYSTEMS };

/** Myths people actually post, for the shatter bench to start from. */
export const MYTHS = [
  'BPC-157 heals almost any injury in the body',
  'Semaglutide weight loss is maintained after you stop taking it',
  'GHK-Cu reverses ageing at the gene level',
  'Retatrutide research vials sold online are the same drug as the trials',
  'Tesamorelin reduces visceral fat in people with HIV',
  'TB-500 is proven to speed up muscle recovery in athletes',
];

/**
 * Turn a corpus study record into decodable prose, so the content studio can
 * run its real paper decoder on it.
 *
 * @param {object} study A study record.
 * @returns {string} An abstract-like paragraph.
 */
export function studyAbstract(study) {
  return [
    `${study.title}.`,
    `${study.design}${study.n ? ` with n=${study.n} participants` : ''} in ${study.population}.`,
    study.finding,
    `Limitation: ${study.limitation}`,
  ].join(' ');
}

/* ------------------------------------------------------------ the stations */

/**
 * Station copy, in the order the room is walked. `id` keys the hologram and
 * screen builders; `plate` names the photograph on its wall; `colin` is what
 * the receptionist says on arrival.
 */
export const STATIONS = [
  {
    id: 'chamber',
    plate: 'reception',
    kicker: 'Reception',
    title: 'COLIN Biomedical Technologies',
    body: `A circular laboratory of twenty-two stations, with a holographic receptionist on the centre pedestal. Swipe or scroll sideways to walk the room; tilt your phone, or move a finger, to look around. Every number here is read from ASTRA’s graded corpus (${SIZE.peptides} compounds, ${SIZE.studies} studies, ${SIZE.claims} graded claims) or computed in front of you.`,
    facts: [
      'Tap “Ask Colin” to talk to him: type, or hold the mic',
      'Say “give me the tour” and he walks you round',
      'Swipe, scroll or use ← → to change station',
    ],
    colin: 'Good evening, and welcome to COLIN Biomedical Technologies. I’m Colin, the receptionist. Technically a hologram, so do forgive me for not taking your coat. Swipe sideways to begin, or ask me for the tour.',
  },
  {
    id: 'translate',
    plate: 'hub',
    kicker: 'International Translation Hub',
    title: 'Peptide science in twelve languages',
    body: 'Colin the interpreter, live. Where this browser has an on-device AI translator, the hub uses it — for any sentence, any station card, or a spoken conversation in two languages — and shows which engine answered and how many milliseconds it really took. Where it has none, the hub says so and falls back to its own phrasebook. Either way, nothing you type or say leaves the device.',
    facts: [
      'Engines: the browser’s built-in Translator and LanguageDetector (on-device AI), else the hub’s own phrasebook — labelled on every line',
      'Glossary: 14 terms every study page uses, written per language in its medical register (随机对照试验, ランダム化比較試験, تجربة عشوائية مضبوطة …)',
      'Colin himself speaks 7 languages: English, 日本語, Español, Français, Deutsch, 中文, العربية',
    ],
    cite: 'Translation runs on the device (hub.js). Glossary and safety lines are written per language, not machine-translated.',
    colin: 'The International Translation Hub. Sombrero optional, accuracy not. Type anything, or talk to me, and I’ll interpret it on this device. I’ll even tell you which engine did the work, which is more than most interpreters will.',
  },
  {
    id: 'map',
    plate: 'showmap',
    kicker: 'Peptide showcase map',
    title: 'The whole field as one structure',
    body: 'Every compound on the outer shell, every body system on the inner one, and a thread for every link between them. Pick a compound to light up what it touches and what it is related to.',
    facts: [],
    cite: 'Graph built live from js/data/peptides.js — compounds, systems, goals and related links.',
    colin: 'The map. Every compound, every body system, and the threads between them. Rather like the London Underground, only with better evidence and fewer delays.',
  },
  {
    id: 'scan',
    plate: 'holoscan',
    kicker: 'Body holo-scan',
    title: 'Tap an organ, see what touches it',
    body: 'A full-body scan with a glowing zone for each body system. Tap a zone on the hologram, or pick a system below, and every compound with graded evidence for that system orbits it, coloured by how strong that evidence is.',
    facts: [],
    cite: 'Systems and scores from ASTRA’s corpus and evidence engine.',
    colin: 'The holo-scan. Tap an organ and I’ll tell you which compounds have been studied there. Please don’t tap anything personal; I’m a professional.',
  },
  {
    id: 'analysis',
    plate: 'core',
    kicker: 'Peptide analysis',
    title: 'Seven tiers, each with a ceiling',
    body: 'The analysis wall grades every compound the same way. The best design available sets the band — a randomised human trial can reach 96%, an animal study never more than 45% — and replication and consistency place it inside.',
    facts: CEILINGS.map((tier) => `${tier.label}: ceiling ${Math.round(tier.ceiling * 100)}%`),
    cite: 'Scores computed live by ASTRA’s evidence engine (js/evidence.js).',
    colin: 'Peptide analysis. Seven tiers of evidence, each with a hard ceiling. A mouse study tops out at forty-five percent, however charming the mouse.',
  },
  {
    id: 'compare',
    plate: 'comparison',
    kicker: 'Comparison bench',
    title: 'Which has the better evidence?',
    body: 'Put two compounds on the balance. The heavier side has the stronger evidence base — design, size, replication — which is a different question from which works better for anyone.',
    facts: [],
    cite: 'Comparison engine: js/compare.js. Scores from js/evidence.js.',
    colin: 'The comparison bench. Pick two compounds and I’ll tell you which has the better evidence. Not which is better for you; that’s a doctor’s job, and I haven’t got the hands for it.',
  },
  {
    id: 'debate',
    plate: 'debateroom',
    kicker: 'Debate room',
    title: 'Four reviewers, one compound',
    body: 'A research scientist, a clinical reviewer, a sceptic and a statistician read the same evidence and argue. Where four different priorities agree, the conclusion is robust; where they split, the split names the study that would settle it.',
    facts: [],
    cite: 'Panel engine: js/reviewers.js, reading each compound’s dossier.',
    colin: 'The debate room. Four reviewers, one compound, and nobody brings cake. Pick a subject and I’ll read them out — I do all the voices. Well, one voice.',
  },
  {
    id: 'arena',
    plate: 'court',
    kicker: 'Courtroom Sector 7 · AI judge',
    title: 'Put a claim on trial',
    body: 'A motion goes on trial with Judge Colin on the bench. The Defence argues for it, the Prosecution against, three rounds each — pass the phone, or put it on a big screen. The compound’s own studies come into court as lettered exhibits, and citing one is worth what its design is worth. Object to the other side’s argument; the judge sustains it only if the argument really does what you say. A jury of twelve decides with him, and the library sentences the motion.',
    facts: [
      'Exhibits: a randomised trial is worth up to 10 points, a rat study 5, an anecdote 1 — and an exhibit that points the other way costs whoever leans on it',
      'Objections: hearsay, speculation, overstatement, relevance, ad hominem — sustained +5 / −5, overruled −3',
      'Verdict: judge’s scorecard 70% · jury of twelve 30% (the room’s votes first, empty seats follow the scorecard)',
    ],
    cite: 'Court engine: court.js · argument cues: wing.js · motion verdicts and exhibits: js/claims.js and the corpus studies.',
    colin: 'All rise. Courtroom Sector 7 is in session, and I’m presiding. Pick a motion, name your counsel, cite your exhibits, and do try to object to something; it’s the best bit.',
  },
  {
    id: 'myth',
    plate: 'shattered',
    kicker: 'Myth checker',
    title: 'Paste a claim. Watch it hold or shatter.',
    body: 'Type something you have seen in a caption, an ad or a group chat. The checker finds the compound, maps the claim onto graded corpus claims, checks the wording against advertising rules, and returns a verdict with the evidence behind it.',
    facts: [],
    cite: 'Claim analysis and compliance rules: js/claims.js.',
    colin: 'The myth checker. Type a claim you’ve seen online and I’ll shatter it. Or, very occasionally, apologise and admit it holds up.',
  },
  {
    id: 'roast',
    plate: 'influencer',
    kicker: 'Colin vs the influencer',
    title: 'Read it with feeling. Then check every line.',
    body: 'Paste a caption, or pick one of the made-up examples. Colin performs it, dramatically, then fact-checks it line by line against the library and the advertising rules, gives it an honesty score, and writes the version that could actually have been posted.',
    facts: ['The example captions are invented to show the genre — they are not real posts or real people.'],
    cite: 'Claim analysis and compliance rules: js/claims.js.',
    colin: 'Colin versus the influencer. Pass me a caption and I’ll read it with all the gravitas it deserves. Then I’ll check it.',
  },
  {
    id: 'simulator',
    plate: 'bench',
    kicker: 'Study simulator',
    title: 'Design a study, then see what it is worth',
    body: 'Change the sample size, the true effect and the prior plausibility, and switch randomisation, blinding and pre-registration on and off. The grid shows what 100 positive results from that design would look like: red squares are the ones that are false.',
    facts: [
      'Detectable effect at 80% power: d ≈ 2.8·√(2 / n per arm)',
      'False-positive risk = 1 − PPV, with PPV = power·prior / (power·prior + α′·(1 − prior))',
    ],
    cite: 'Ioannidis, PLoS Med 2005; Button et al., Nat Rev Neurosci 2013. Engine: js/reviewers.js.',
    colin: 'The study simulator. Fiddle with the sample size and watch the false positives misbehave. Very satisfying. Like popping bubble wrap, but with statistics.',
  },
  {
    id: 'studies',
    plate: 'archive',
    kicker: 'The archive',
    title: `All ${STUDIES.length} cited studies`,
    body: 'Every study in the library, with its design, its size, what it found and the catch. Filter by evidence tier or compound; each opens a live PubMed search so you land on the literature rather than on a link that may have rotted.',
    facts: [],
    cite: 'Verify every citation against the source before reusing it.',
    colin: 'The archive. Every study in the library, with its design, its size and its catch. Do touch the exhibits; that’s rather the point.',
  },
  {
    id: 'studio',
    plate: 'golddna',
    kicker: 'Content studio',
    title: 'For creators and influencers',
    body: 'Pick a compound and one of its studies. The studio decodes it and writes a full content pack — carousel, reel and YouTube scripts, email, FAQ, hooks and a quiz — then runs every asset past the compliance guardian. Blocked lines stay visible so you can see what the template tried to say.',
    facts: [],
    cite: 'Decoder: js/decoder.js · Studio: js/studio.js · Guardian: js/claims.js.',
    colin: 'The content studio, for creators and influencers. One study in, a full content pack out, with the claims kept honest. I’m afraid the honest bit is non-negotiable.',
  },
  {
    id: 'pk',
    kicker: 'Half-life bench',
    title: 'Why a weekly jab is weekly',
    body: 'A one-compartment model with first-order absorption: each dose rises and decays, and doses stack by superposition until intake balances elimination. Change the compound and the interval, or miss a dose, and watch the curve. Units are relative; this is a model of shape, not a dosing tool.',
    facts: [
      'Single dose: C(t) ∝ kₐ/(kₐ − kₑ) · (e^(−kₑt) − e^(−kₐt)), with kₑ = ln 2 / t½',
      'Accumulation at steady state: R = 1 / (1 − e^(−kₑτ))',
      '90% of steady state after ln 10 / kₑ ≈ 3.3 half-lives',
    ],
    cite: 'Half-lives from prescribing information and Phase 1 reports; tmax values approximate. Teaching model only.',
    colin: 'The half-life bench. Native GLP-1 lasts two minutes; semaglutide lasts a week. One of them is my kind of molecule.',
  },
  {
    id: 'receptor',
    plate: 'ligand',
    kicker: 'GLP-1 receptor agonist',
    title: 'How the key fits the lock',
    body: 'The GLP-1 receptor is a class B G-protein-coupled receptor: a 463-amino-acid protein that crosses the cell membrane seven times. The peptide binds in two steps — its C-terminal helix docks on the extracellular domain, then its N-terminus slides into the transmembrane core — which switches on Gαs, adenylyl cyclase and cAMP, and so glucose-dependent insulin release.',
    facts: [
      'Native GLP-1 lasts about 2 minutes: DPP-4 cleaves it after Ala8',
      'Semaglutide lasts about a week: Aib8 plus albumin binding',
    ],
    cite: 'Zhang et al., Nature 2017 (cryo-EM GLP-1R–Gs); Drucker, Cell Metab 2018; Lau et al., J Med Chem 2015.',
    colin: 'The GLP-1 receptor. Seven helices, one lock, and a ligand that docks in two orderly steps. Very civilised. Rather like queuing.',
  },
  {
    id: 'agonists',
    kicker: 'GLP-1 receptor agonists',
    title: 'One receptor, two, then three',
    body: 'Each generation adds a receptor. Semaglutide activates GLP-1R; tirzepatide adds GIPR; retatrutide adds the glucagon receptor. Bars show weight loss with the placebo arm subtracted (Δ = drug − placebo). Different trials, different durations — not a head-to-head comparison.',
    facts: AGONISTS.map((a) => `${a.name}: −${a.drug}% vs −${a.placebo}% placebo at ${a.weeks} wk → Δ ${a.delta} pts (${a.trial})`),
    cite: 'Wilding NEJM 2021; Jastreboff NEJM 2022; Jastreboff NEJM 2023. Retatrutide is investigational.',
    colin: 'One receptor, then two, then three. Semaglutide, tirzepatide, and retatrutide, which is still investigational, so do keep your expectations on a lead.',
  },
  {
    id: 'synthesis',
    kicker: 'Molecular synthesis',
    title: 'Building a chain one residue at a time',
    body: 'Solid-phase peptide synthesis anchors the first residue to a resin bead, then repeats two reactions for every residue added: deprotect, couple. If each reaction works with probability p, the share of chains that come out full length is Y = p^(2(L−1)). Small losses compound, and long peptides punish them hard.',
    facts: [],
    cite: 'Merrifield, J Am Chem Soc 1963 (Nobel Prize in Chemistry, 1984).',
    colin: 'Molecular synthesis. Build a peptide one residue at a time. Small losses compound, rather like my holiday plans.',
  },
  {
    id: 'telemetry',
    kicker: 'Biological telemetry',
    title: 'Where the incretin signal lands',
    body: 'The same molecule acts in many tissues at once. Pick a site to see what the receptors there do. The trace on the wall is a simulated 72 bpm display, not a measurement of anyone.',
    facts: [],
    cite: 'Drucker, Cell Metab 2018; Jastreboff NEJM 2023; Sanyal, Nat Med 2024.',
    colin: 'Biological telemetry. The heartbeat is simulated, by the way. I haven’t got a pulse. I checked.',
  },
  {
    id: 'genome',
    kicker: 'From gene to drug',
    title: 'Read off a gene, then rewritten',
    body: 'GLP-1 comes from the proglucagon gene GCG on chromosome 2q24.2. Intestinal L-cells cut its 180-residue precursor with PC1/3 to release GLP-1; pancreatic α-cells use PC2 to make glucagon. Each residue costs three bases, so GLP-1(7–37) needs 93 coding nucleotides — and semaglutide keeps 28 of its 31 residues and rewrites three.',
    facts: SEQUENCES.changes.map((c) => `Position ${c.position}: ${c.from} → ${c.to} (${c.why})`),
    cite: 'Drucker, Cell Metab 2018; Lau et al., J Med Chem 2015.',
    colin: 'From gene to drug. Three small changes to GLP-1 and it lasts a week instead of two minutes. If only my weekends worked like that.',
  },
  {
    id: 'globe',
    kicker: 'Regulatory globe',
    title: 'Legal where, and banned in sport?',
    body: 'Pick a compound and the globe lights each regulator by its status — approved medicine, cosmetic only, investigational, withdrawn or not approved — with the WADA ring for sport. A dated snapshot: laws change, so check the regulator before relying on it.',
    facts: [],
    cite: 'Snapshot October 2026 from public regulator decisions; WADA lines from the corpus. Not legal advice.',
    colin: 'The regulatory globe. Every country has its own rules, and none of them asked me. Pick a compound.',
  },
  {
    id: 'future',
    plate: 'golddna',
    kicker: 'The future wing',
    title: 'What comes after retatrutide',
    body: 'The pipeline as it stands in October 2026, from a pill approved this year to ideas that are still science fiction. Each candidate is labelled by stage, with its headline result and where that number came from. The top of the spiral is real; the bottom is honest speculation.',
    facts: [],
    cite: 'Sponsor announcements and publications, 2025–26. Re-check as programmes move.',
    colin: 'The future wing. Some of this is in pharmacies, some is in trials, and some is frankly in films. I’ll tell you which is which.',
  },
  {
    id: 'dermal',
    plate: 'dermLab',
    kicker: 'COLIN Dermal Technologies',
    title: 'Skin, scanned — then explained',
    body: 'A new wing for skin care and anti-ageing peptides. Entry is by face scan: your front camera reads tone evenness, redness, shine, texture and under-eye contrast, on this device only. Inside, it takes you from your pain points to what actually helps, strongest evidence first, and through the peptides — GHK-Cu, Matrixyl, Argireline and more — with the maths of how far each gets into skin.',
    facts: [],
    cite: 'Potts & Guy, Pharm Res 1992; Bos & Meinardi, Exp Dermatol 2000; Robinson et al. 2005; Blanes-Mira et al. 2002; Pickart & Margolina 2018; Hughes et al., Ann Intern Med 2013. The camera is analysed on-device; nothing is stored or sent.',
    colin: 'COLIN Dermal Technologies. The door would like to see your face. Not your passport, your face. I promise not to comment on your pores.',
  },
  {
    id: 'classified',
    plate: 'exBanner',
    kicker: 'CLASSIFIED · EX-039',
    title: 'Warning: restricted specimen',
    body: 'Behind this door is the file on EX-039 — a peptide that began in the venom of a desert lizard and became the first drug of its kind. Entry needs a signature and a thumbprint. The custodian would much rather you didn’t.',
    facts: [],
    cite: 'The vault is theatre; the file is cited — prescribing information and peer-reviewed trials (classified.js). Signature and print are simulated and never leave this device.',
    colin: 'Ah. No. Not this one. This door is classified, and frankly so is the corridor you’re standing in. Turn back. … Still here? Then sign the form, and give me your thumb.',
  },
];
