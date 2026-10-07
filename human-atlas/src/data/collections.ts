import type { ManifestEntry } from '../types';

export type CollectionId = 'hand' | 'shoulder' | 'thigh' | 'foot' | 'heart' | 'brain';
export type SideFilter = 'both' | 'left' | 'right';

export interface Collection {
  id: CollectionId;
  label: string;
  /** Manifest regions that make up the collection. */
  regions: string[];
}

export const COLLECTIONS: Collection[] = [
  { id: 'hand', label: 'Hand', regions: ['Hand'] },
  { id: 'shoulder', label: 'Shoulder', regions: ['Shoulder'] },
  { id: 'thigh', label: 'Thigh', regions: ['Thigh', 'Hip'] },
  { id: 'foot', label: 'Foot', regions: ['Foot'] },
  { id: 'heart', label: 'Heart', regions: ['Heart'] },
  { id: 'brain', label: 'Brain', regions: ['Brain'] },
];

export function inCollection(p: ManifestEntry, c: Collection, side: SideFilter): boolean {
  if (!c.regions.includes(p.region)) return false;
  if (side === 'both' || p.side === 'midline') return true;
  return p.side === side;
}
