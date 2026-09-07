/**
 * The QB IQ record model.
 *
 * One `ThrowRecord` is one dropback: everything a motion-capture rig, a
 * ball-tracking system, a wearable and a film-study tagger know about a single
 * rep, in one flat, unit-tagged shape. Every downstream view — biomechanics,
 * cognition, OODA, the game report, the trend lines — is a pure function of a
 * list of these, which is why swapping the mock generator for a real feed is an
 * adapter and not a rewrite.
 *
 * Units are named in the field, always, because a number with an implied unit
 * is how a lab gets a wrong answer: `...Deg`, `...Ms`, `...In`, `...Mph`,
 * `...DegPerSec`, `...Bw` (multiples of bodyweight), `...Pct`.
 */

/** Where a record came from, and how much to trust it. */
export type CaptureSource =
  | 'synthetic'
  | 'markerless-mocap'
  | 'optical-tracking'
  | 'imu-suit'
  | 'ball-tracking'
  | 'manual-tag';

export interface CaptureProvenance {
  /** Vendor class that produced the kinematics. */
  source: CaptureSource;
  /** Free-text vendor/system name as reported by the feed. */
  system: string;
  /** Capture rate of the kinematic solve. Below 200 Hz, peak velocities are under-read. */
  sampleRateHz: number;
  /** Solver confidence for this rep, 0–1. Reps below the view's floor are excluded, not smoothed. */
  confidence: number;
}

/** Named phases of the throw, in order. Boundaries are event-detected, not time-sliced. */
export type ThrowPhase =
  | 'stance'
  | 'load'
  | 'stride'
  | 'trunk-rotation'
  | 'arm-cocking'
  | 'acceleration'
  | 'release'
  | 'follow-through';

export const THROW_PHASES: readonly ThrowPhase[] = [
  'stance',
  'load',
  'stride',
  'trunk-rotation',
  'arm-cocking',
  'acceleration',
  'release',
  'follow-through',
] as const;

/** A phase window, in milliseconds relative to the snap. */
export interface PhaseWindow {
  phase: ThrowPhase;
  startMs: number;
  endMs: number;
}

/** Joint angles at the event named in each field. Degrees. */
export interface JointAngles {
  /** Peak shoulder external rotation, end of arm cocking. The lay-back. */
  shoulderExternalRotationDeg: number;
  /** Elbow flexion at that same instant of peak external rotation. */
  elbowFlexionAtMaxErDeg: number;
  /** Elbow flexion at ball release — how much extension is left in the arm. */
  elbowFlexionAtReleaseDeg: number;
  /** Hip–shoulder separation (the "X-factor") at front-foot plant. */
  hipShoulderSeparationDeg: number;
  /** Front-knee flexion at release. Extension here is the block that transfers energy up. */
  frontKneeFlexionDeg: number;
  /** Trunk lateral tilt away from the throwing arm at release. */
  trunkLateralTiltDeg: number;
  /** Trunk forward flexion at release. */
  trunkForwardFlexionDeg: number;
  /** Shoulder abduction at release — how far the arm is from the trunk. Slot is set here. */
  shoulderAbductionDeg: number;
}

/** Segments of the kinetic chain, proximal to distal. */
export type KineticSegment = 'pelvis' | 'trunk' | 'shoulder-ir' | 'elbow-ext' | 'wrist';

export const KINETIC_SEGMENTS: readonly KineticSegment[] = [
  'pelvis',
  'trunk',
  'shoulder-ir',
  'elbow-ext',
  'wrist',
] as const;

/** Peak angular velocity of one segment, and when it happened. */
export interface KineticPeak {
  segment: KineticSegment;
  peakAngularVelocityDegPerSec: number;
  /** Time of the peak, in ms relative to front-foot plant (t = 0). */
  timeToPeakMs: number;
}

export interface ReleaseMetrics {
  /** Height of the ball at release, above the ground. */
  releaseHeightIn: number;
  /** Lateral offset of the release point from the body midline (+ = throwing side). */
  releaseLateralIn: number;
  /** Snap to ball out of the hand. The number every coordinator already quotes. */
  timeToReleaseMs: number;
  /** Arm-slot angle of the forearm at release, measured from horizontal. */
  armSlotDeg: number;
}

export interface BallFlight {
  velocityMph: number;
  spinRateRpm: number;
  /** Share of total angular momentum about the ball's long axis. */
  spiralEfficiencyPct: number;
  /** Half-angle of the spin-axis precession — visible wobble. */
  wobbleDeg: number;
  launchAngleDeg: number;
  airYards: number;
}

export interface FootworkMetrics {
  /** Snap to the last step of the drop. */
  dropTimeMs: number;
  /** Snap to front-foot plant. Everything upstream in the chain is timed off this. */
  frontFootPlantMs: number;
  /** Stance width at the top of the drop, ankle to ankle. */
  baseWidthIn: number;
  /** Stride length as a percentage of standing height. */
  strideLengthPctHeight: number;
}

/**
 * Left/right loading. Compared against the athlete's own history, never a
 * population norm: a QB who has always braced at 1.9 BW is not injured because
 * a textbook says 2.2.
 */
export interface LoadSymmetry {
  /** Peak vertical ground-reaction force on the lead (blocking) leg, × bodyweight. */
  leadLegBrakingForceBw: number;
  /** Peak vertical ground-reaction force on the trail (drive) leg, × bodyweight. */
  trailLegDriveForceBw: number;
  /** Pelvis rotation contributed on the throwing side. */
  throwSidePelvisRotationDeg: number;
  /** Pelvis rotation contributed on the glove side. */
  gloveSidePelvisRotationDeg: number;
  /** Peak elbow varus torque — the arm's share of the load, in newton-metres. */
  elbowVarusTorqueNm: number;
}

/** What the QB was tracking, and how fast the picture resolved. */
export interface CognitiveMetrics {
  /** Huddle break (or no-huddle call) to the first defensive fixation. Pre-snap. */
  callToFirstReadMs: number;
  /** Snap to a committed coverage declaration. */
  coverageIdMs: number;
  /** Whether that declaration matched the coverage actually played. */
  coverageIdCorrect: boolean;
  /** How many receivers were scanned before the ball came out. */
  progressionDepth: number;
  /** Mean dwell per progression stop. */
  perProgressionMs: number;
  /** Read complete to the start of the throwing motion. The reaction-time core. */
  decisionLatencyMs: number;
  /** Count of live variables the play asked the QB to hold at once. */
  workingMemoryLoad: number;
  /** The variables themselves, for the drill-down. */
  liveVariables: string[];
  /** Ball released before the receiver's break — anticipation, not reaction. */
  anticipatory: boolean;
  /** Gaze dwell on the primary read before the eyes moved. */
  gazeDwellPrimaryMs: number;
  /** Whether the QB moved a deep safety with his eyes before throwing. */
  safetyLookOff: boolean;
  /** Coverage rotated after the snap and forced a re-orient. */
  postSnapRotation: boolean;
}

/**
 * The snap-to-throw OODA decomposition. The four spans partition the release
 * time exactly: observe + orient + decide + act === timeToReleaseMs.
 */
export interface OodaTiming {
  /** Snap → defensive picture acquired. */
  observeMs: number;
  /** → picture matched against the install; leverage and help resolved. */
  orientMs: number;
  /** → target locked, or the play design abandoned. */
  decideMs: number;
  /** → ball out. Mechanical execution. */
  actMs: number;
  /** Sum of the four. */
  loopMs: number;
}

export type PlayType =
  | 'under-center-3'
  | 'under-center-5'
  | 'under-center-7'
  | 'shotgun-quick'
  | 'shotgun-5'
  | 'play-action'
  | 'rpo'
  | 'screen';

export type CoverageShell =
  | 'Cover 0'
  | 'Cover 1'
  | 'Cover 2'
  | 'Tampa 2'
  | 'Cover 3'
  | 'Quarters'
  | 'Cover 6'
  | '2-Man';

/** How intact the pocket was at the moment of decision. */
export type PocketState = 'clean' | 'muddied' | 'collapsed' | 'off-platform';

export interface PlayContext {
  gameId: string;
  quarter: 1 | 2 | 3 | 4;
  /** Seconds remaining in the quarter. */
  clockSec: number;
  down: 1 | 2 | 3 | 4;
  distance: number;
  /** Distance to the opponent's goal line. */
  yardsToGoal: number;
  scoreDifferential: number;
  playType: PlayType;
  /** The shell the defence showed before the snap. */
  coverageShown: CoverageShell;
  /** The shell it actually played. */
  coveragePlayed: CoverageShell;
  /** A rusher inside the pocket within 2.5 s of the snap. */
  pressure: boolean;
  /** When that pressure arrived, ms from snap; null on a clean rep. */
  pressureOnsetMs: number | null;
  rushers: number;
  pocketState: PocketState;
  twoMinute: boolean;
  redZone: boolean;
  /** Snaps into the game — the fatigue axis. */
  snapIndex: number;
}

export type PlayResult =
  | 'complete'
  | 'incomplete'
  | 'touchdown'
  | 'interception'
  | 'sack'
  | 'scramble'
  | 'throwaway';

export interface PlayOutcome {
  result: PlayResult;
  yards: number;
  /** Expected points added. */
  epa: number;
  /** Catchable and where it should have been — charted, not inferred from the catch. */
  onTarget: boolean;
  /** Receiver separation at the catch point, yards. */
  targetSeparationYd: number;
  /** Ball placement relative to the receiver's leverage and the nearest defender, 0–100. */
  placementScore: number;
}

/** One dropback. */
export interface ThrowRecord {
  id: string;
  athleteId: string;
  seasonId: string;
  /** ISO timestamp of the snap. */
  snapAt: string;
  context: PlayContext;
  /**
   * Phase windows, release metrics, ball flight and the OODA partition are all
   * null on a rep where the ball never left the hand. A sack has no release
   * point and no loop time, and inventing one so the field is populated is how a
   * dashboard ends up reporting a 3.1-second "time to release" on a play that
   * ended with the quarterback on the ground.
   */
  phases: PhaseWindow[] | null;
  joints: JointAngles;
  kinetics: KineticPeak[];
  release: ReleaseMetrics | null;
  flight: BallFlight | null;
  footwork: FootworkMetrics;
  symmetry: LoadSymmetry;
  cognition: CognitiveMetrics;
  ooda: OodaTiming | null;
  outcome: PlayOutcome;
  capture: CaptureProvenance;
}

export type ArchetypeId = 'rhythm-passer' | 'creator' | 'field-general' | 'gunslinger';

export interface AthleteProfile {
  id: string;
  name: string;
  org: string;
  level: 'NFL' | 'FBS' | 'Pro Day';
  jersey: number;
  heightIn: number;
  weightLb: number;
  wingspanIn: number;
  handSizeIn: number;
  dominantHand: 'R' | 'L';
  ageYears: number;
  /** Accrued seasons at this level. */
  experienceYears: number;
  archetype: ArchetypeId;
}

export interface GameSummary {
  id: string;
  seasonId: string;
  week: number;
  opponent: string;
  date: string;
  home: boolean;
  /** Ambient temperature at kickoff, °F — a mechanics covariate worth keeping. */
  tempF: number;
  surface: 'grass' | 'turf';
}

export interface SeasonSummary {
  id: string;
  label: string;
  year: number;
  level: AthleteProfile['level'];
  /** Age at the start of the season. */
  ageYears: number;
}

/** A query against a source. Every field narrows; omitted fields do not filter. */
export interface ThrowQuery {
  athleteId: string;
  seasonId?: string;
  gameId?: string;
  /** Drop reps whose solver confidence is below this. */
  minConfidence?: number;
}

// ── Training-side records ───────────────────────────────────────────────────
// The performance-science block is only worth building if the training work is
// measured the same way the field work is. These two records are what a
// breathing protocol and a recognition drill leave behind.

export type BreathingProtocol = 'box-4-4-4-4' | 'coherent-5.5' | 'physiological-sigh';

export interface ProtocolSession {
  id: string;
  athleteId: string;
  date: string;
  week: number;
  protocol: BreathingProtocol;
  minutes: number;
  /** Seated RMSSD before the protocol, from a chest strap at 1000 Hz. */
  preRmssdMs: number;
  /** RMSSD over the final two minutes of the protocol. */
  postRmssdMs: number;
  preHrBpm: number;
  postHrBpm: number;
  /**
   * Accuracy on a standard 20-trial pressured decision block run immediately
   * after the protocol, and on a matched block run on a control day without it.
   * Both are needed: a post-protocol figure alone says nothing.
   */
  postProtocolAccuracyPct: number;
  controlAccuracyPct: number;
}

export type RecognitionCategory = 'shell' | 'pressure' | 'leverage';

export interface RecognitionSession {
  id: string;
  athleteId: string;
  date: string;
  week: number;
  /** Flash duration of the pre-snap picture. Shorter exposures are harder. */
  exposureMs: number;
  category: RecognitionCategory;
  trials: number;
  correct: number;
  /** Mean reaction time on correct trials only — errors have their own, faster, distribution. */
  meanRtMs: number;
  sdRtMs: number;
}

/** Everything one athlete-season contains. */
export interface SeasonBundle {
  season: SeasonSummary;
  games: GameSummary[];
  throws: ThrowRecord[];
  protocols: ProtocolSession[];
  recognition: RecognitionSession[];
}
