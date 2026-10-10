// Subset of the Human Atlas manifest that this app reads.
export type Vec3 = [number, number, number];

export interface AtlasPiece {
  id: string;
  name: string;
  system: string;
  region: string;
  side: 'left' | 'right' | 'midline';
  category: string;
  meshFile: string;
  assembledPosition: Vec3;
  size: Vec3;
}

export interface AtlasManifest {
  pieces: AtlasPiece[];
}
