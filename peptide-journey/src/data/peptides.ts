// Ten real peptides: where they are made (or injected), where they act, how
// they are cleared and how long they last. Numbers are typical published
// values; sources are listed per peptide. No dosing information, by design.

export type System = 'skeleton' | 'muscles' | 'heart' | 'sensory' | 'arteries' | 'veins' | 'nervous' | 'respiratory' | 'viscera';
export type Vec3 = [number, number, number];

export interface Stop {
  id: string;
  label: string;
  /** Mesh base names (side stripped) from BodyParts3D. */
  meshes?: string[];
  /** Or whole systems (e.g. all skeletal muscle). */
  systems?: System[];
  effect: string;
  /** Relative strength of the response, 0..1. */
  weight: number;
}

export interface Peptide {
  id: string;
  name: string;
  kind: 'Natural hormone' | 'Medicine' | 'Venom-derived medicine';
  aminoAcids: number;
  color: string;
  summary: string;
  /** Where it starts. A `point` is an injection site in atlas coordinates. */
  source: { label: string; meshes?: string[]; point?: Vec3; text: string };
  route: string;
  halfLifeLabel: string;
  /** Elimination half-life in seconds. */
  halfLife: number;
  /**
   * Medicines: time to peak after injection. Natural hormones: how long the
   * gland keeps secreting after the trigger (the level peaks as it stops).
   */
  tmax: number;
  targets: Stop[];
  clearance: Stop[];
  trick?: string;
  status: string;
  fact: string;
  /** Overlay this peptide's curve on the timeline for comparison. */
  compareWith?: string;
  refs: string[];
}

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

// Subcutaneous injection sites (front of the abdomen, front of the thigh).
const ABDOMEN: Vec3 = [0.07, 0.99, 0.115];
const THIGH: Vec3 = [0.1, 0.64, 0.07];

const BRAIN_APPETITE = (effect: string, weight = 0.8): Stop => ({
  id: 'brain',
  label: 'Brain appetite centres',
  meshes: ['hypothalamus, nsn', 'medulla oblongata'],
  effect,
  weight,
});

export const PEPTIDES: Peptide[] = [
  {
    id: 'glp1',
    name: 'GLP-1',
    kind: 'Natural hormone',
    aminoAcids: 30,
    color: '#2F8F83',
    summary: 'The gut’s “food has arrived” signal. It boosts insulin, slows the stomach and tells the brain you are full.',
    source: { label: 'Small intestine and colon', meshes: ['ileum', 'colon, nsn'], text: 'Released by L-cells in the gut lining minutes after you eat.' },
    route: 'Released into the blood from the gut',
    halfLifeLabel: 'About 2 minutes',
    halfLife: 2 * MIN,
    tmax: 45 * MIN,
    targets: [
      { id: 'pancreas', label: 'Pancreas', meshes: ['pancreas, nsn'], effect: 'More insulin when blood sugar is high, less glucagon.', weight: 1 },
      { id: 'stomach', label: 'Stomach', meshes: ['stomach'], effect: 'Slows emptying, so food stays longer.', weight: 0.7 },
      BRAIN_APPETITE('Fullness; at high levels, nausea.', 0.6),
    ],
    clearance: [{ id: 'dpp4', label: 'DPP-4 enzyme and kidneys', meshes: ['kidney'], effect: 'The enzyme DPP-4 cuts it within minutes; the kidneys remove the pieces.', weight: 0.6 }],
    status: 'Natural. Its short life is why drug versions had to be re-engineered.',
    fact: 'Only about 10–15% of the GLP-1 your gut releases reaches the general circulation intact; enzymes in the gut wall and liver get the rest.',
    refs: ['Holst (2007), Physiological Reviews', 'Deacon et al. (1995), Diabetes'],
  },
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    kind: 'Medicine',
    aminoAcids: 31,
    color: '#2F64A8',
    summary: 'A re-engineered GLP-1 that lasts a week instead of two minutes. Used for type 2 diabetes and obesity.',
    source: { label: 'Injection under the skin', point: ABDOMEN, text: 'A weekly injection into the fat under the skin; it seeps into the blood over a few days.' },
    route: 'Once-weekly injection (a daily tablet form also exists)',
    halfLifeLabel: 'About 1 week',
    halfLife: 7 * DAY,
    tmax: 2 * DAY,
    targets: [
      { id: 'pancreas', label: 'Pancreas', meshes: ['pancreas, nsn'], effect: 'More insulin when blood sugar is high.', weight: 0.9 },
      { id: 'stomach', label: 'Stomach', meshes: ['stomach'], effect: 'Slower emptying; a common cause of early nausea.', weight: 0.7 },
      BRAIN_APPETITE('Less hunger and “food noise”.', 1),
      { id: 'heart', label: 'Heart and vessels', meshes: ['wall of heart'], effect: 'In people with heart disease and obesity, 20% fewer heart attacks, strokes and cardiovascular deaths.', weight: 0.5 },
    ],
    clearance: [
      { id: 'body', label: 'Broken down throughout the body', meshes: ['liver', 'kidney'], effect: 'Slowly cut up by enzymes; fragments leave in urine and stool.', weight: 0.4 },
    ],
    trick:
      'Two edits: one amino acid swapped (for Aib) so DPP-4 can no longer cut it, and a fatty-acid tail that makes it ride on albumin in the blood, hiding it from the kidneys.',
    status: 'Approved medicine (prescription only).',
    fact: 'Its fatty-acid tail was borrowed from the same idea used to make long-acting insulins.',
    compareWith: 'glp1',
    refs: ['Lau et al. (2015), Journal of Medicinal Chemistry', 'Lincoff et al. (2023), New England Journal of Medicine (SELECT)'],
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    kind: 'Medicine',
    aminoAcids: 39,
    color: '#6A4FA8',
    summary: 'One molecule that acts on two gut-hormone receptors, GIP and GLP-1.',
    source: { label: 'Injection under the skin', point: ABDOMEN, text: 'A weekly injection under the skin, absorbed over one to three days.' },
    route: 'Once-weekly injection',
    halfLifeLabel: 'About 5 days',
    halfLife: 5 * DAY,
    tmax: 1 * DAY,
    targets: [
      { id: 'pancreas', label: 'Pancreas', meshes: ['pancreas, nsn'], effect: 'Insulin release through both GIP and GLP-1 receptors.', weight: 1 },
      { id: 'stomach', label: 'Stomach', meshes: ['stomach'], effect: 'Slower emptying.', weight: 0.6 },
      BRAIN_APPETITE('Less appetite. In a 72-week trial, the highest dose gave about 21% average weight loss.', 1),
    ],
    clearance: [{ id: 'body', label: 'Broken down throughout the body', meshes: ['liver', 'kidney'], effect: 'Cut up by enzymes; pieces leave in urine and stool.', weight: 0.4 }],
    trick: 'Built on the GIP hormone’s backbone, tuned to also hit the GLP-1 receptor, with a fatty-acid tail for albumin binding.',
    status: 'Approved medicine (prescription only).',
    fact: 'It is a “twincretin”: one peptide doing the job of two incretin hormones.',
    compareWith: 'glp1',
    refs: ['Coskun et al. (2018), Molecular Metabolism', 'Jastreboff et al. (2022), New England Journal of Medicine (SURMOUNT-1)'],
  },
  {
    id: 'exenatide',
    name: 'Exenatide',
    kind: 'Venom-derived medicine',
    aminoAcids: 39,
    color: '#B7791F',
    summary: 'The first GLP-1 medicine, copied from a peptide in the saliva of the Gila monster lizard.',
    source: { label: 'Injection under the skin', point: ABDOMEN, text: 'Injected under the skin twice a day in its original form.' },
    route: 'Twice-daily injection (a weekly slow-release form also exists)',
    halfLifeLabel: 'About 2.4 hours',
    halfLife: 2.4 * HOUR,
    tmax: 2.1 * HOUR,
    targets: [
      { id: 'pancreas', label: 'Pancreas', meshes: ['pancreas, nsn'], effect: 'More insulin when blood sugar is high.', weight: 1 },
      { id: 'stomach', label: 'Stomach', meshes: ['stomach'], effect: 'Slower emptying.', weight: 0.6 },
      BRAIN_APPETITE('Fullness.', 0.6),
    ],
    clearance: [{ id: 'kidney', label: 'Kidneys', meshes: ['kidney'], effect: 'Mainly filtered out by the kidneys, which is why it is avoided in severe kidney disease.', weight: 0.8 }],
    trick: 'None needed: the lizard’s version (exendin-4) naturally resists DPP-4, so it lasts hours instead of minutes.',
    status: 'Approved medicine (prescription only).',
    fact: 'Gila monsters eat only a few times a year; exendin-4 may help them handle huge, rare meals.',
    compareWith: 'glp1',
    refs: ['Eng et al. (1992), Journal of Biological Chemistry', 'Byetta prescribing information'],
  },
  {
    id: 'insulin',
    name: 'Insulin',
    kind: 'Natural hormone',
    aminoAcids: 51,
    color: '#C24E3A',
    summary: 'The hormone that moves sugar out of the blood and into liver, muscle and fat.',
    source: { label: 'Pancreas (beta cells)', meshes: ['pancreas, nsn'], text: 'Released by beta cells in the pancreas when blood sugar rises.' },
    route: 'Released into the portal vein, straight to the liver',
    halfLifeLabel: 'About 5 minutes',
    halfLife: 5 * MIN,
    tmax: 45 * MIN,
    targets: [
      { id: 'liver', label: 'Liver', meshes: ['liver'], effect: 'Stores sugar as glycogen and stops making new glucose.', weight: 1 },
      { id: 'muscle', label: 'Skeletal muscle', systems: ['muscles'], effect: 'Takes up glucose from the blood: the biggest sugar sink after a meal.', weight: 0.7 },
    ],
    clearance: [
      { id: 'liver', label: 'Liver', meshes: ['liver'], effect: 'About half is removed on its first pass through the liver.', weight: 0.8 },
      { id: 'kidney', label: 'Kidneys', meshes: ['kidney'], effect: 'Clear much of the rest.', weight: 0.6 },
    ],
    status: 'Natural. Medicinal insulin since 1922.',
    fact: 'Insulin was the first protein to be fully sequenced (Frederick Sanger, 1955).',
    refs: ['Duckworth, Bennett & Hamel (1998), Endocrine Reviews', 'Banting & Best (1922), Journal of Laboratory and Clinical Medicine'],
  },
  {
    id: 'ghrelin',
    name: 'Ghrelin',
    kind: 'Natural hormone',
    aminoAcids: 28,
    color: '#D9822B',
    summary: 'The “hunger hormone”. It rises before meals and falls after eating.',
    source: { label: 'Stomach', meshes: ['stomach'], text: 'Made mainly by cells in the stomach wall, rising in the hours before a usual mealtime.' },
    route: 'Released into the blood from the stomach',
    halfLifeLabel: 'About 10 minutes (active form)',
    halfLife: 10 * MIN,
    tmax: 30 * MIN,
    targets: [
      BRAIN_APPETITE('Hunger: the urge to start eating.', 1),
      { id: 'pituitary', label: 'Pituitary gland', meshes: ['pituitary gland'], effect: 'Releases growth hormone.', weight: 0.7 },
    ],
    clearance: [{ id: 'blood', label: 'Blood enzymes and kidneys', meshes: ['kidney'], effect: 'Its fatty-acid group is clipped off, inactivating it.', weight: 0.5 }],
    status: 'Natural.',
    fact: 'It is the only known hormone that needs a fatty-acid group (octanoyl) attached to work.',
    refs: ['Kojima et al. (1999), Nature', 'Cummings et al. (2001), Diabetes'],
  },
  {
    id: 'vasopressin',
    name: 'Vasopressin (ADH)',
    kind: 'Natural hormone',
    aminoAcids: 9,
    color: '#3F6FB2',
    summary: 'The water-saving hormone. When you are dehydrated it tells the kidneys to hold on to water.',
    source: { label: 'Hypothalamus → pituitary', meshes: ['hypothalamus, nsn', 'pituitary gland'], text: 'Made in the hypothalamus and released from the back of the pituitary when the blood gets too salty.' },
    route: 'Released into the blood from the pituitary',
    halfLifeLabel: '10–20 minutes',
    halfLife: 15 * MIN,
    tmax: 30 * MIN,
    targets: [
      { id: 'kidney', label: 'Kidneys', meshes: ['kidney'], effect: 'Insert water channels so less water is lost in urine: darker, more concentrated urine.', weight: 1 },
      { id: 'vessels', label: 'Blood vessels', systems: ['arteries'], effect: 'At high levels, narrows blood vessels to raise blood pressure.', weight: 0.4 },
    ],
    clearance: [{ id: 'clear', label: 'Liver and kidneys', meshes: ['liver', 'kidney'], effect: 'Broken down quickly by both.', weight: 0.5 }],
    status: 'Natural. Also given in intensive care.',
    fact: 'Alcohol suppresses vasopressin, which is why drinking makes you urinate more.',
    refs: ['Verney (1947), Proceedings of the Royal Society B', 'Robertson (2001), Endocrinology and Metabolism Clinics'],
  },
  {
    id: 'anp',
    name: 'ANP',
    kind: 'Natural hormone',
    aminoAcids: 28,
    color: '#9E3B3B',
    summary: 'A hormone made by the heart. When the heart is stretched by too much blood volume, it tells the body to shed salt and water.',
    source: { label: 'Heart (atria)', meshes: ['wall of heart'], text: 'Released by heart muscle cells in the atria when they are stretched.' },
    route: 'Released into the blood from the heart',
    halfLifeLabel: '2–4 minutes',
    halfLife: 3 * MIN,
    tmax: 15 * MIN,
    targets: [
      { id: 'kidney', label: 'Kidneys', meshes: ['kidney'], effect: 'More salt and water in the urine.', weight: 1 },
      { id: 'vessels', label: 'Blood vessels', systems: ['arteries', 'veins'], effect: 'Relaxes vessels, lowering blood pressure.', weight: 0.6 },
      { id: 'adrenal', label: 'Adrenal glands', meshes: ['adrenal gland'], effect: 'Less aldosterone, the salt-retaining hormone.', weight: 0.5 },
    ],
    clearance: [{ id: 'nep', label: 'Neprilysin and clearance receptors', meshes: ['kidney'], effect: 'The enzyme neprilysin breaks it down. Blocking neprilysin (sacubitril) is a heart-failure treatment.', weight: 0.5 }],
    status: 'Natural. The drug sacubitril works by protecting it.',
    fact: 'Its discovery in 1981 showed the heart is also an endocrine gland.',
    refs: ['de Bold et al. (1981), Life Sciences', 'McMurray et al. (2014), New England Journal of Medicine (PARADIGM-HF)'],
  },
  {
    id: 'secretin',
    name: 'Secretin',
    kind: 'Natural hormone',
    aminoAcids: 27,
    color: '#5F7F3A',
    summary: 'The first hormone ever discovered. When stomach acid reaches the intestine, secretin calls for an antacid.',
    source: { label: 'Duodenum', meshes: ['duodenum'], text: 'Released by S-cells in the duodenum when acidic stomach contents arrive.' },
    route: 'Released into the blood from the duodenum',
    halfLifeLabel: 'A few minutes',
    halfLife: 3 * MIN,
    tmax: 15 * MIN,
    targets: [
      { id: 'pancreas', label: 'Pancreas', meshes: ['pancreas, nsn'], effect: 'Pours bicarbonate (a natural antacid) into the intestine.', weight: 1 },
      { id: 'liver', label: 'Liver and bile ducts', meshes: ['liver', 'gallbladder'], effect: 'More bicarbonate-rich bile.', weight: 0.5 },
      { id: 'stomach', label: 'Stomach', meshes: ['stomach'], effect: 'Less acid production.', weight: 0.4 },
    ],
    clearance: [{ id: 'kidney', label: 'Kidneys', meshes: ['kidney'], effect: 'Cleared mainly by the kidneys.', weight: 0.5 }],
    status: 'Natural. Used in hospital tests of pancreatic function.',
    fact: 'Bayliss and Starling’s 1902 discovery of secretin led Starling to coin the word “hormone” in 1905, from the Greek for “to set in motion”.',
    refs: ['Bayliss & Starling (1902), Journal of Physiology'],
  },
  {
    id: 'teriparatide',
    name: 'Teriparatide',
    kind: 'Medicine',
    aminoAcids: 34,
    color: '#A8925A',
    summary: 'The active first 34 amino acids of parathyroid hormone, used to rebuild bone in severe osteoporosis.',
    source: { label: 'Injection under the skin', point: THIGH, text: 'A daily injection into the thigh or abdomen.' },
    route: 'Once-daily injection',
    halfLifeLabel: 'About 1 hour',
    halfLife: 1 * HOUR,
    tmax: 30 * MIN,
    targets: [
      { id: 'bone', label: 'Bones', systems: ['skeleton'], effect: 'Short daily pulses switch on bone-building cells. In a major trial, new spine fractures fell by about 65%.', weight: 1 },
      { id: 'kidney', label: 'Kidneys', meshes: ['kidney'], effect: 'Hold on to calcium and activate vitamin D.', weight: 0.6 },
    ],
    clearance: [{ id: 'clear', label: 'Liver and kidneys', meshes: ['liver', 'kidney'], effect: 'Broken down by both.', weight: 0.5 }],
    trick: 'Timing is the trick: a brief daily spike builds bone, while constantly high parathyroid hormone (as in some gland diseases) breaks bone down.',
    status: 'Approved medicine (prescription only).',
    fact: 'The same hormone can build or destroy bone depending only on whether its level pulses or stays high.',
    refs: ['Neer et al. (2001), New England Journal of Medicine'],
  },
];

export const PEPTIDE_BY_ID = Object.fromEntries(PEPTIDES.map((p) => [p.id, p])) as Record<string, Peptide>;
