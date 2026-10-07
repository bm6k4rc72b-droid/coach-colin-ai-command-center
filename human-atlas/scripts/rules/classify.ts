// Classification rules for BodyParts3D pieces.
//
// Everything here is driven by the dataset itself: the conventional part-of
// tree (conventional_part_of.txt) roots every piece under one or more organ
// systems ("skeletal system", "muscular system", "cardiovascular system", …).
// Name patterns are only used to split the cardiovascular system into
// heart / arteries / veins and to read laterality. A piece that matches no
// rule returns null and is written to the unclassified log; we never guess.

import type { Side, SystemId } from '../../src/types.ts';

/** FMA IDs of the system roots in conventional_part_of.txt. */
export const ROOTS = {
  skeletal: 'FMA23881',
  muscular: 'FMA72954',
  cardiovascular: 'FMA7161',
  nervous: 'FMA7157',
  respiratory: 'FMA7158',
  sense: 'FMA78499',
  alimentary: 'FMA7152',
  urinary: 'FMA7159',
  genital: 'FMA7160',
  endocrine: 'FMA9668',
  lymphoid: 'FMA74594',
  integumentary: 'FMA72979',
} as const;

export type RootKey = keyof typeof ROOTS;

const ARTERY = /\b(arter(y|ies)|aorta|celiac trunk|pulmonary trunk)\b/;
const VEIN = /\b(veins?|vena cava|coronary sinus)\b/;

export interface Classification {
  system: SystemId;
  rule: string;
}

/**
 * @param name English name.
 * @param roots System roots this piece descends from in the part-of tree.
 */
export function classify(name: string, roots: Set<RootKey>): Classification | null {
  const n = name.toLowerCase();

  if (roots.has('cardiovascular')) {
    if (ARTERY.test(n)) return { system: 'arteries', rule: 'cardiovascular + artery name' };
    if (VEIN.test(n)) return { system: 'veins', rule: 'cardiovascular + vein name' };
    if (/\b(heart|valve|ventricle|atrium|papillary)\b/.test(n))
      return { system: 'heart', rule: 'cardiovascular + cardiac name' };
    return null;
  }
  if (roots.has('nervous')) return { system: 'nervous', rule: 'nervous system subtree' };
  if (roots.has('muscular')) return { system: 'muscles', rule: 'muscular system subtree' };
  if (roots.has('sense')) return { system: 'sensory', rule: 'sense organ system subtree' };
  if (roots.has('skeletal')) return { system: 'skeleton', rule: 'skeletal system subtree' };
  // Secondary teeth sit under "mouth", which the tree files under both the
  // alimentary and respiratory systems. Anatomical atlases display the
  // dentition with the skull, so teeth are shown with the skeleton.
  if (/\btooth\b/.test(n)) return { system: 'skeleton', rule: 'dentition shown with skull' };
  if (roots.has('respiratory') && !roots.has('alimentary'))
    return { system: 'respiratory', rule: 'respiratory system subtree' };
  return null;
}

/** Display category shown above a structure's name. */
export function categoryFor(name: string, system: SystemId): string {
  const n = name.toLowerCase();
  switch (system) {
    case 'skeleton':
      if (/\btooth\b/.test(n)) return 'Tooth';
      if (/\bdisk\b/.test(n)) return 'Intervertebral disc';
      if (/cartilage/.test(n)) return 'Cartilage';
      return 'Bone';
    case 'muscles':
      if (/ligament|retinaculum/.test(n)) return 'Ligament';
      if (/tendon/.test(n)) return 'Tendon';
      if (/aponeurosis|membrane|tract|linea alba|arch of/.test(n)) return 'Connective tissue';
      return 'Muscle';
    case 'heart':
      if (/valve/.test(n)) return 'Heart valve';
      return 'Heart';
    case 'arteries':
      return 'Artery';
    case 'veins':
      return 'Vein';
    case 'nervous':
      if (/nerve|chiasm|tract/.test(n)) return 'Nerve';
      if (/ventricle|aqueduct|canal|foramen|plexus/.test(n)) return 'Ventricular system';
      return 'Brain';
    case 'sensory':
      return 'Sense organ';
    case 'respiratory':
      if (/lung/.test(n)) return 'Lung';
      if (/cartilage/.test(n)) return 'Cartilage';
      return 'Airway';
  }
}

// "left ventricle", "right coronary artery", … name a cardiac chamber or a
// vessel named after one, not the side of the body.
const CARDIAC_LATERALITY =
  /\b(left|right) (ventricle|atrium|coronary|posterolateral)|\bof (left|right) (ventricle|atrium|coronary)/;

export function sideFor(name: string, system: SystemId): Side {
  const n = name.toLowerCase();
  if (system === 'heart' || CARDIAC_LATERALITY.test(n)) return 'midline';
  if (/\bleft\b/.test(n)) return 'left';
  if (/\bright\b/.test(n)) return 'right';
  return 'midline';
}

/**
 * Region from the part-of tree. Order matters: the most specific region wins
 * (a metacarpal is in both "upper limb" and "hand"; it is filed under Hand).
 */
export const REGION_NODES: Array<[string, string]> = [
  ['FMA50801', 'Brain'],
  ['FMA7088', 'Heart'],
  ['FMA9712', 'Hand'],
  ['FMA9664', 'Foot'],
  ['FMA24967', 'Thigh'],
  ['FMA24979', 'Leg'],
  ['FMA24974', 'Knee'],
  ['FMA9663', 'Forearm'],
  ['FMA24890', 'Arm'],
  ['FMA23217', 'Shoulder'],
  ['FMA25570', 'Shoulder'],
  ['FMA24964', 'Hip'],
  ['FMA7154', 'Head'],
  ['FMA7155', 'Neck'],
  ['FMA9578', 'Pelvis'],
  ['FMA9576', 'Thorax'],
  ['FMA9577', 'Abdomen'],
  ['FMA14181', 'Back'],
  ['FMA7183', 'Upper limb'],
  ['FMA7184', 'Lower limb'],
  ['FMA7181', 'Trunk'],
];
