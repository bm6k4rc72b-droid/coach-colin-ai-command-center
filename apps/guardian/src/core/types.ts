/**
 * Core domain types for Guardian.
 *
 * Everything in `src/core` is pure TypeScript with no React Native imports,
 * so it runs (and is tested) under plain Node. Keep it that way — this is the
 * part of the product that has to be provably correct.
 */

/** Axis-aligned box in normalised frame coordinates: 0..1, origin top-left. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A single model output for one frame. */
export interface Detection {
  box: Box;
  score: number;
  label: DetectionLabel;
}

export type DetectionLabel = 'person' | 'vehicle' | 'animal' | 'other';

export interface Frame {
  /** Milliseconds, monotonic. */
  t: number;
  detections: Detection[];
  /** Mean luma of the frame, 0..1. Used for illumination-transient rejection. */
  brightness: number;
}

export type TrackState = 'tentative' | 'confirmed' | 'lost';

export interface Track {
  id: number;
  box: Box;
  label: DetectionLabel;
  score: number;
  state: TrackState;
  /** Frames matched since creation. */
  hits: number;
  /** Consecutive frames without a match. */
  age: number;
  /** Timestamp of first observation. */
  firstSeen: number;
  /** Timestamp of most recent match. */
  lastSeen: number;
  /** Bounded history of ground-contact points, oldest first. */
  path: Point[];
  /** Per-frame velocity estimate in normalised units. */
  velocity: Point;
}

/**
 * Why a candidate was rejected. Surfaced in the event log so the user can see
 * what the system chose not to wake them for — and so we can tune against real
 * footage rather than guesses.
 */
export type SuppressionReason =
  | 'class-not-armed'
  | 'below-score-floor'
  | 'outside-zone'
  | 'implausible-aspect'
  | 'implausible-size'
  | 'not-yet-confirmed'
  | 'oscillating-motion'
  | 'stationary-object'
  | 'illumination-transient'
  | 'zone-cooldown'
  | 'already-alerted';

export interface Verdict {
  trackId: number;
  alert: boolean;
  reason?: SuppressionReason;
}

/** A closed polygon in normalised frame coordinates. */
export interface Zone {
  id: string;
  name: string;
  armed: boolean;
  points: Point[];
}

export interface SuppressionConfig {
  /** Labels that may raise an alert. */
  armedLabels: DetectionLabel[];
  /** Detections below this never enter the tracker. */
  scoreFloor: number;
  /** A track must reach this score at least once to be alertable. */
  scoreCeiling: number;
  /** Minimum milliseconds a track must persist before it can alert. */
  dwellMs: number;
  /** Minimum matched frames before a track is confirmed. */
  minHits: number;
  /** Plausible height/width ratio for an upright human. */
  aspectRange: [number, number];
  /** Plausible box height as a fraction of frame height. */
  heightRange: [number, number];
  /**
   * Net-displacement / path-length below this reads as oscillation
   * (foliage in wind) rather than travel. 0 = pure oscillation, 1 = straight line.
   */
  minStraightness: number;
  /** Path length below this over the dwell window reads as a static object. */
  minPathLength: number;
  /** Frame-brightness jump that marks an illumination transient (headlights). */
  brightnessJump: number;
  /** Milliseconds of quiet enforced per zone after an alert. */
  zoneCooldownMs: number;
}

export const DEFAULT_SUPPRESSION: SuppressionConfig = {
  armedLabels: ['person'],
  scoreFloor: 0.25,
  scoreCeiling: 0.55,
  dwellMs: 1200,
  minHits: 8,
  aspectRange: [1.2, 6.0],
  heightRange: [0.06, 0.95],
  minStraightness: 0.35,
  minPathLength: 0.04,
  brightnessJump: 0.18,
  zoneCooldownMs: 45_000,
};

export interface TrackerConfig {
  /** IoU required to associate a detection with an existing track. */
  iouThreshold: number;
  /** Detections at or above this are matched in the first pass. */
  highScore: number;
  /** Frames a track survives without a match before deletion. */
  maxAge: number;
  /** Matched frames before a tentative track is confirmed. */
  minHits: number;
  /** Maximum retained path points per track. */
  maxPath: number;
}

export const DEFAULT_TRACKER: TrackerConfig = {
  iouThreshold: 0.25,
  highScore: 0.5,
  maxAge: 12,
  minHits: 3,
  maxPath: 90,
};
