// Shared data contracts between the asset build script and the app.

export const SYSTEM_IDS = [
  'skeleton',
  'muscles',
  'heart',
  'sensory',
  'arteries',
  'veins',
  'nervous',
  'respiratory',
] as const;

export type SystemId = (typeof SYSTEM_IDS)[number];

export type Side = 'left' | 'right' | 'midline';

export type Vec3 = [number, number, number];

export type RelationRole = 'origin' | 'insertion' | 'attached-muscle';

export interface Relation {
  id: string;
  role: RelationRole;
}

export interface ManifestEntry {
  /** BodyParts3D element ID (FMA… or BP…). Also the node name inside meshFile. */
  id: string;
  /** English name from parts_list_e.txt. */
  name: string;
  system: SystemId;
  /** Coarse body region (e.g. "Hand", "Thigh", "Brain"). */
  region: string;
  side: Side;
  /** GLB file (relative to the manifest) that holds this piece as a node named `id`. */
  meshFile: string;
  /** Centre of the piece in the assembled body, metres, Y-up, +Z anterior. */
  assembledPosition: Vec3;
  /** Centre of the piece in the full atlas specimen sheet. */
  explodedPosition: Vec3;
  /** Axis-aligned extent of the piece, metres. */
  size: Vec3;
  /** Display category: Bone, Muscle, Artery… */
  category: string;
  /** Immediate "part of" groups from conventional_part_of.txt (verified, from the dataset). */
  partOf: string[];
  /** Curated bone-level attachments (verified references only). */
  relations: Relation[];
  /** Pieces whose surfaces lie within a few millimetres in the model. Proximity only. */
  nearby: string[];
  /** Triangle count after decimation. */
  triangles: number;
}

export interface SystemInfo {
  id: SystemId;
  label: string;
  file: string;
  count: number;
}

export interface Manifest {
  version: number;
  generatedAt: string;
  source: string;
  units: 'm';
  pieceCount: number;
  triangleCount: number;
  bounds: { min: Vec3; max: Vec3 };
  sheet: { min: Vec3; max: Vec3 };
  systems: SystemInfo[];
  pieces: ManifestEntry[];
}
