// Real human gene variants with documented effects, and what they cost.
//
// Every "real" statement is sourced. The fiction dial in the app exaggerates
// the *visuals* only and is always labelled as speculative.

export type Evidence = 'strong' | 'moderate' | 'limited';
export type System = 'skeleton' | 'muscles' | 'heart' | 'sensory' | 'arteries' | 'veins' | 'nervous' | 'respiratory';

export interface Gene {
  id: string;
  symbol: string;
  name: string;
  variant: string;
  power: string;
  category: string;
  /** Latin-ish epithet for the creation's name. */
  epithet: string;
  /** Glow colour in the scene. */
  color: string;
  summary: string;
  /** Real effect, with numbers where the literature gives them. */
  effect: string;
  effectSize: 'Large' | 'Moderate' | 'Small';
  whoHasIt: string;
  tradeoffs: string[];
  evidence: Evidence;
  refs: string[];
  /** What the fiction dial imagines, clearly speculative. */
  fiction: string;
  /** How the body model changes. */
  visual: {
    systems: System[];
    /** Restrict to these body regions (manifest regions), if set. */
    regions?: string[];
    scale?: number;
    glow?: number;
    dim?: boolean;
  };
}

export const EVIDENCE_STYLE: Record<Evidence, { label: string; color: string }> = {
  strong: { label: 'Strong evidence', color: '#2F7A55' },
  moderate: { label: 'Moderate evidence', color: '#5F7F3A' },
  limited: { label: 'Limited evidence', color: '#A57A1C' },
};

const LIMBS = ['Thigh', 'Leg', 'Foot', 'Arm', 'Forearm', 'Hand', 'Shoulder', 'Upper limb', 'Lower limb', 'Hip'];

export const GENES: Gene[] = [
  {
    id: 'mstn',
    symbol: 'MSTN',
    name: 'Myostatin',
    variant: 'Loss of function, both copies',
    power: 'Double muscle',
    category: 'Strength',
    epithet: 'fortis',
    color: '#C24E3A',
    summary: 'Myostatin is the brake on muscle growth. Without it, muscles keep growing.',
    effect:
      'A German boy born without working myostatin had unusually large muscles and strength from infancy. The same loss causes “double-muscled” Belgian Blue cattle and “bully” whippets.',
    effectSize: 'Large',
    whoHasIt: 'Extremely rare in people (a handful of reported cases). Well known in cattle and dogs.',
    tradeoffs: [
      'Double-muscled cattle have difficult births and lower fertility.',
      'Homozygous “bully” whippets are prone to muscle cramping.',
      'Long-term health effects in humans are unknown.',
      'Drugs that block myostatin have mostly failed to improve function in muscle-wasting diseases.',
    ],
    evidence: 'strong',
    refs: ['Schuelke et al. (2004), New England Journal of Medicine', 'Mosher et al. (2007), PLOS Genetics'],
    fiction: 'Fiction: muscle that keeps adding mass with no brake at all, at no cost to energy, joints or heart.',
    visual: { systems: ['muscles'], scale: 0.14 },
  },
  {
    id: 'actn3',
    symbol: 'ACTN3',
    name: 'Alpha-actinin-3',
    variant: 'R577 (working) form',
    power: 'Sprint fibres',
    category: 'Speed',
    epithet: 'velox',
    color: '#D9822B',
    summary: 'A protein found only in fast-twitch muscle fibres, the ones used for sprinting and jumping.',
    effect:
      'Elite sprinters and power athletes almost all carry at least one working copy; about 18% of people worldwide have none (XX genotype). The effect on ordinary people is small.',
    effectSize: 'Small',
    whoHasIt: 'Most people have at least one working copy. About 1.5 billion people have none.',
    tradeoffs: [
      'People without it (XX) tolerate cold better and may suit endurance events, so neither version is simply “better”.',
      'Explains only a small part of athletic ability; training dominates.',
    ],
    evidence: 'moderate',
    refs: ['Yang et al. (2003), American Journal of Human Genetics', 'MacArthur et al. (2007), Nature Genetics', 'Wyckelsma et al. (2021), American Journal of Human Genetics'],
    fiction: 'Fiction: every fibre is a fast fibre: explosive speed, with endurance traded away.',
    visual: { systems: ['muscles'], regions: LIMBS, glow: 0.55 },
  },
  {
    id: 'lrp5',
    symbol: 'LRP5',
    name: 'LDL receptor-related protein 5',
    variant: 'G171V gain of function',
    power: 'Unbreakable bones',
    category: 'Bones',
    epithet: 'adamantinus',
    color: '#C9B98F',
    summary: 'Turns up the bone-building signal, so the skeleton becomes extremely dense.',
    effect:
      'In the family where it was found, members had bone density far above normal for their age and, as reported, no fractures. Their bones were otherwise normally shaped.',
    effectSize: 'Large',
    whoHasIt: 'A few families worldwide.',
    tradeoffs: [
      'Wide, deep jaw and a bony growth on the roof of the mouth (torus palatinus).',
      'Related high-bone-mass conditions (e.g. SOST mutations) can trap nerves as the skull thickens.',
    ],
    evidence: 'strong',
    refs: ['Boyden et al. (2002), New England Journal of Medicine', 'Little et al. (2002), American Journal of Human Genetics'],
    fiction: 'Fiction: a skeleton dense as armour, light enough to still swim.',
    visual: { systems: ['skeleton'], scale: 0.08, glow: 0.15 },
  },
  {
    id: 'epas1',
    symbol: 'EPAS1',
    name: 'Endothelial PAS domain protein 1',
    variant: 'Tibetan high-altitude haplotype',
    power: 'Thin-air lungs',
    category: 'Altitude',
    epithet: 'montanus',
    color: '#3E8FB0',
    summary: 'Tunes the body’s response to low oxygen.',
    effect:
      'Tibetans carrying this version live at 4,000 m without the thick, oxygen-hungry blood that lowlanders develop, and suffer less chronic mountain sickness. The variant came from Denisovans, an archaic human group.',
    effectSize: 'Moderate',
    whoHasIt: 'Common in Tibetans; rare elsewhere.',
    tradeoffs: ['Helps only at altitude; little benefit at sea level.', 'Works alongside other genes (such as EGLN1); it is not a single switch.'],
    evidence: 'strong',
    refs: ['Yi et al. (2010), Science', 'Beall et al. (2010), PNAS', 'Huerta-Sánchez et al. (2014), Nature'],
    fiction: 'Fiction: lungs that work on a mountaintop, or on a thin-atmosphere planet.',
    visual: { systems: ['respiratory', 'arteries'], glow: 0.6 },
  },
  {
    id: 'dec2',
    symbol: 'BHLHE41 (DEC2)',
    name: 'Basic helix-loop-helix family member e41',
    variant: 'P384R',
    power: 'Short sleeper',
    category: 'Sleep',
    epithet: 'vigil',
    color: '#7A5AA6',
    summary: 'Changes the body clock’s sleep-pressure settings.',
    effect:
      'Carriers in the family studied slept about 6.25 hours a night versus about 8 hours for relatives, without apparent ill effects. Mice engineered with the variant also slept less.',
    effectSize: 'Moderate',
    whoHasIt: 'Very rare: found in a small number of families.',
    tradeoffs: ['Long-term health effects are not known.', 'Studied in very few people; most of us cannot train ourselves into this.'],
    evidence: 'limited',
    refs: ['He et al. (2009), Science', 'Shi et al. (2019), Neuron (ADRB1, a second short-sleep gene)'],
    fiction: 'Fiction: no sleep needed at all, never tired.',
    visual: { systems: ['nervous'], glow: 0.6 },
  },
  {
    id: 'ccr5',
    symbol: 'CCR5',
    name: 'C-C chemokine receptor 5',
    variant: 'Δ32 deletion, both copies',
    power: 'HIV resistance',
    category: 'Immunity',
    epithet: 'immunis',
    color: '#3F8F6E',
    summary: 'Removes the doorway most HIV strains use to enter immune cells.',
    effect:
      'People with two copies are highly resistant to the common (R5) strains of HIV-1. About 10% of Northern Europeans carry one copy; around 1% carry two.',
    effectSize: 'Large',
    whoHasIt: 'Mostly people of European ancestry.',
    tradeoffs: [
      'Higher risk of severe illness from West Nile virus.',
      'No protection from HIV strains that use a different receptor (CXCR4).',
      'In 2018 a scientist edited CCR5 in human embryos; the work was condemned worldwide and he was jailed.',
    ],
    evidence: 'strong',
    refs: ['Samson et al. (1996), Nature', 'Liu et al. (1996), Cell', 'Glass et al. (2006), Journal of Experimental Medicine'],
    fiction: 'Fiction: an immune system no virus can get into.',
    visual: { systems: ['arteries', 'veins'], glow: 0.5 },
  },
  {
    id: 'pcsk9',
    symbol: 'PCSK9',
    name: 'Proprotein convertase subtilisin/kexin 9',
    variant: 'Loss of function',
    power: 'Clean arteries',
    category: 'Heart',
    epithet: 'cordatus',
    color: '#C99A2E',
    summary: 'Without working PCSK9, the liver clears much more LDL (“bad”) cholesterol.',
    effect:
      'Carriers of nonsense variants had 28% lower LDL cholesterol and 88% less coronary heart disease over 15 years; a milder variant gave 15% lower LDL and 47% less heart disease. This finding led to PCSK9-blocking drugs.',
    effectSize: 'Large',
    whoHasIt: 'About 2–3% of people of African ancestry and a similar share of Europeans carry a variant.',
    tradeoffs: ['Genetic studies suggest a small increase in type 2 diabetes risk.'],
    evidence: 'strong',
    refs: ['Cohen et al. (2006), New England Journal of Medicine', 'Schmidt et al. (2017), Lancet Diabetes & Endocrinology'],
    fiction: 'Fiction: arteries that never clog, whatever you eat.',
    visual: { systems: ['heart', 'arteries'], glow: 0.55 },
  },
  {
    id: 'scn9a',
    symbol: 'SCN9A',
    name: 'Sodium channel Nav1.7',
    variant: 'Loss of function, both copies',
    power: 'Feels no pain',
    category: 'Pain',
    epithet: 'impavidus',
    color: '#8A8F96',
    summary: 'Nav1.7 carries pain signals in sensory nerves. Without it, there is no pain at all.',
    effect:
      'Identified in Pakistani families with congenital insensitivity to pain, including a boy who performed street stunts on hot coals and with knives. Touch and temperature sensing remain.',
    effectSize: 'Large',
    whoHasIt: 'Extremely rare.',
    tradeoffs: [
      'This is the cautionary one: people injure themselves without knowing, with burns, fractures and bitten tongues.',
      'The boy in the original study died before his 14th birthday after jumping from a roof.',
      'Loss of the sense of smell.',
    ],
    evidence: 'strong',
    refs: ['Cox et al. (2006), Nature', 'Weiss et al. (2011), Nature'],
    fiction: 'Fiction: pain as an optional alert you can switch on when you want it.',
    visual: { systems: ['nervous'], dim: true },
  },
  {
    id: 'hbb',
    symbol: 'HBB',
    name: 'Haemoglobin beta',
    variant: 'Sickle-cell trait (one copy, HbAS)',
    power: 'Malaria shield',
    category: 'Blood',
    epithet: 'paludis',
    color: '#B23A48',
    summary: 'One copy of the sickle variant protects against the deadliest form of malaria.',
    effect:
      'Carriers have roughly 90% protection against severe malaria. This advantage is why the variant is common across malaria regions of Africa, the Middle East and South Asia.',
    effectSize: 'Large',
    whoHasIt: 'Hundreds of millions of people, mostly where malaria is or was common.',
    tradeoffs: [
      'Two copies cause sickle cell disease, a serious lifelong illness.',
      'Slightly higher risk of exertional muscle breakdown under extreme exertion or dehydration.',
    ],
    evidence: 'strong',
    refs: ['Williams et al. (2005), Journal of Infectious Diseases', 'Taylor et al. (2012), Lancet Infectious Diseases', 'Nelson et al. (2016), New England Journal of Medicine'],
    fiction: 'Fiction: blood that no parasite can live in, with none of the risk.',
    visual: { systems: ['arteries', 'veins', 'heart'], glow: 0.45 },
  },
];

export const GENE_BY_ID = Object.fromEntries(GENES.map((g) => [g.id, g])) as Record<string, Gene>;

/** A playful binomial for the current build, e.g. "Homo fortis montanus". */
export function creationName(active: string[], fiction: number): string {
  const genus = fiction >= 0.5 ? 'Xenohomo' : 'Homo';
  const eps = GENES.filter((g) => active.includes(g.id)).map((g) => g.epithet);
  if (eps.length === 0) return fiction >= 0.5 ? 'Xenohomo novus' : 'Homo sapiens';
  return `${genus} ${eps.slice(0, 3).join(' ')}${eps.length > 3 ? ` +${eps.length - 3}` : ''}`;
}
