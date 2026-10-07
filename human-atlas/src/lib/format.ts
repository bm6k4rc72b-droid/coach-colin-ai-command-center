import type { ManifestEntry } from '../types';
import { SYSTEM_STYLE } from '../data/systems';

const SMALL = new Set(['of', 'and', 'the', 'to', 'in']);

/** "long head of right biceps brachii" → "Long Head of Right Biceps Brachii". */
export function titleCase(name: string): string {
  return name
    .replace(/, nsn$/, '')
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function sentenceCase(name: string): string {
  const n = name.replace(/, nsn$/, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

const REGION_PHRASE: Record<string, string> = {
  Brain: 'of the brain',
  Heart: 'of the heart',
  Hand: 'of the hand',
  Foot: 'of the foot',
  Thigh: 'of the thigh',
  Leg: 'of the leg',
  Knee: 'of the knee',
  Hip: 'of the hip',
  Forearm: 'of the forearm',
  Arm: 'of the arm',
  Shoulder: 'of the shoulder',
  Head: 'of the head',
  Neck: 'of the neck',
  Pelvis: 'of the pelvis',
  Thorax: 'of the thorax',
  Abdomen: 'of the abdomen',
  Back: 'of the back',
  'Upper limb': 'of the upper limb',
  'Lower limb': 'of the lower limb',
  Trunk: 'of the trunk',
};

function article(word: string) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * A short description assembled only from facts in the manifest: category,
 * region, side, the dataset's part-of grouping and curated attachments.
 */
export function describe(p: ManifestEntry, byId: Map<string, ManifestEntry>): string {
  const cat = p.category.toLowerCase();
  const where = REGION_PHRASE[p.region] ?? '';
  const side =
    p.side === 'midline' ? 'It lies on the midline of the body.' : `It lies on the ${p.side} side of the body.`;
  const parts: string[] = [`${sentenceCase(p.name)} is ${article(cat)} ${cat} ${where}.`.replace(' .', '.'), side];

  const strip = (n: string) => n.replace(/\b(left|right) /, '').replace(/, nsn$/, '');
  const named = (role: string) =>
    [...new Set(p.relations.filter((r) => r.role === role).map((r) => strip(byId.get(r.id)?.name ?? '')))].filter(Boolean);
  const origins = named('origin');
  const insertions = named('insertion');
  if (origins.length && insertions.length) {
    parts.push(`It arises from the ${list(origins)} and inserts on the ${list(insertions)}.`);
  } else if (origins.length) {
    parts.push(`It arises from the ${list(origins)}.`);
  } else if (insertions.length) {
    parts.push(`It inserts on the ${list(insertions)}.`);
  }
  const muscles = p.relations.filter((r) => r.role === 'attached-muscle').length;
  if (muscles) parts.push(`${muscles} muscle${muscles > 1 ? 's' : ''} in this atlas attach${muscles > 1 ? '' : 'es'} to it.`);

  // Skip the side-less twin of this very structure ("long head of biceps brachii").
  const groups = p.partOf.map((g) => g.replace(/, nsn$/, '')).filter((g) => g !== strip(p.name));
  if (groups.length && parts.length < 4) parts.push(`BodyParts3D files it under ${list(groups)}.`);
  return parts.join(' ');
}

export function systemLabel(p: ManifestEntry) {
  return SYSTEM_STYLE[p.system].label;
}

export function sideLabel(p: ManifestEntry) {
  return p.side === 'midline' ? 'Midline' : p.side === 'left' ? 'Left' : 'Right';
}
