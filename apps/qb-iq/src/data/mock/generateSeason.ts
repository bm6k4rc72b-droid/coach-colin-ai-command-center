/**
 * The synthetic season.
 *
 * This is a *model*, not a random-number spray. Every rep is built from a small
 * set of latent variables — throw effort, in-game fatigue, season-long
 * familiarity with the install, whether the pocket held — and each observable is
 * a function of those. That is what makes the dataset defensible in front of
 * someone who knows the domain: velocity tracks effort, spin follows velocity,
 * wobble is the complement of spiral efficiency, the kinetic chain sequences
 * proximal-to-distal and degrades in the same reps where the pocket collapses,
 * decision latency lengthens under pressure and shortens across the season, and
 * the accuracy split between clean and pressured pockets lands where charted
 * football says it lands.
 *
 * One deliberate storyline is planted so the injury-risk module has something
 * true to find: from week 13 the lead leg stops braking as hard, the trunk
 * starts tilting further to get over the throw, and elbow varus torque climbs
 * while velocity stays flat. That is a recognisable compensation pattern, and
 * the flag engine has to discover it from the athlete's own earlier weeks
 * rather than from any constant written into this file.
 */

import type {
  AthleteProfile,
  BallFlight,
  CognitiveMetrics,
  CoverageShell,
  FootworkMetrics,
  GameSummary,
  JointAngles,
  KineticPeak,
  LoadSymmetry,
  OodaTiming,
  PhaseWindow,
  PlayContext,
  PlayOutcome,
  PlayResult,
  PlayType,
  PocketState,
  ProtocolSession,
  RecognitionSession,
  ReleaseMetrics,
  SeasonBundle,
  SeasonSummary,
  ThrowRecord,
} from '../../domain/types';
import { createRng, type Rng } from './rng';

const OPPONENTS = [
  'Ironside', 'Cascade', 'Rampart', 'Vanguard', 'Northgate', 'Silverline',
  'Bayhawks', 'Cindermen', 'Foundry', 'Redcliff', 'Harbourmen', 'Lakeshore',
  'Sable', 'Highland', 'Meridian Bay', 'Copperhead', 'Junction',
] as const;

const PLAY_TYPE_WEIGHTS: readonly (readonly [PlayType, number])[] = [
  ['shotgun-quick', 22],
  ['shotgun-5', 25],
  ['play-action', 19],
  ['rpo', 11],
  ['under-center-3', 7],
  ['under-center-5', 9],
  ['under-center-7', 3],
  ['screen', 4],
];

const SHELL_WEIGHTS: readonly (readonly [CoverageShell, number])[] = [
  ['Cover 3', 24],
  ['Quarters', 19],
  ['Cover 1', 15],
  ['Cover 2', 11],
  ['Cover 6', 9],
  ['Tampa 2', 7],
  ['2-Man', 8],
  ['Cover 0', 7],
];

/** Nominal drop time per play type, in ms, before per-rep noise. */
const DROP_MS: Record<PlayType, number> = {
  'under-center-3': 1080,
  'under-center-5': 1580,
  'under-center-7': 1910,
  'shotgun-quick': 720,
  'shotgun-5': 1180,
  'play-action': 2040,
  rpo: 640,
  screen: 660,
};

/** How much of the release clock each play type asks the QB to spend holding. */
const HOLD_MS: Record<PlayType, number> = {
  'under-center-3': 1180,
  'under-center-5': 1290,
  'under-center-7': 1360,
  'shotgun-quick': 1080,
  'shotgun-5': 1330,
  'play-action': 1260,
  rpo: 900,
  screen: 820,
};

/** Base probability that a rusher gets home inside 2.5 s, by play type. */
const PRESSURE_P: Record<PlayType, number> = {
  'under-center-3': 0.22,
  'under-center-5': 0.36,
  'under-center-7': 0.47,
  'shotgun-quick': 0.19,
  'shotgun-5': 0.38,
  'play-action': 0.41,
  rpo: 0.17,
  screen: 0.12,
};

/** Typical air yards by play type: [mean, sd]. */
const AIR_YARDS: Record<PlayType, readonly [number, number]> = {
  'under-center-3': [7.5, 3.4],
  'under-center-5': [13.5, 5.5],
  'under-center-7': [21.0, 7.5],
  'shotgun-quick': [5.5, 3.0],
  'shotgun-5': [13.0, 6.5],
  'play-action': [15.5, 8.0],
  rpo: [4.0, 2.6],
  screen: [-0.5, 1.6],
};

/** Live variables the call can put in the air, drawn without replacement. */
const LIVE_VARIABLES = [
  'MIKE identification',
  'slide protection direction',
  'back release / check-release',
  'hot conversion vs. pressure',
  'sight adjust on the single receiver',
  'run/pass conflict key',
  'alert to the backside shot',
  'tempo check at the line',
  'clock and personnel match',
] as const;

export interface SeasonSpec {
  season: SeasonSummary;
  games: number;
  /** 0 in the first professional season, rising with accrued experience. */
  installFamiliarity: number;
  /** Scales physical output — the arm at 21 is not the arm at 25. */
  physicalIndex: number;
  /** True only for the season carrying the planted late-year compensation pattern. */
  carriesLateSeasonDrift: boolean;
}

/** Sum the phase windows for one rep. Boundaries are event-detected in a real rig. */
function buildPhases(rng: Rng, plantMs: number, releaseMs: number): PhaseWindow[] {
  const setupEnd = Math.max(120, plantMs - rng.gauss(560, 60));
  const loadEnd = Math.max(setupEnd + 40, plantMs - rng.gauss(360, 45));
  const strideEnd = plantMs;
  const trunkEnd = plantMs + rng.gauss(58, 8);
  const cockEnd = plantMs + rng.gauss(104, 9);
  const accelEnd = releaseMs - rng.gauss(14, 3);
  return [
    { phase: 'stance', startMs: 0, endMs: Math.round(setupEnd) },
    { phase: 'load', startMs: Math.round(setupEnd), endMs: Math.round(loadEnd) },
    { phase: 'stride', startMs: Math.round(loadEnd), endMs: Math.round(strideEnd) },
    { phase: 'trunk-rotation', startMs: Math.round(strideEnd), endMs: Math.round(trunkEnd) },
    { phase: 'arm-cocking', startMs: Math.round(trunkEnd), endMs: Math.round(cockEnd) },
    { phase: 'acceleration', startMs: Math.round(cockEnd), endMs: Math.round(accelEnd) },
    { phase: 'release', startMs: Math.round(accelEnd), endMs: Math.round(releaseMs) },
    { phase: 'follow-through', startMs: Math.round(releaseMs), endMs: Math.round(releaseMs + rng.gauss(240, 30)) },
  ];
}

/**
 * Peak angular velocity and timing for the five tracked segments, with t = 0 at
 * front-foot plant. Nominal timings run proximal to distal; per-rep jitter is
 * what produces the sequencing violations the biomechanics view counts, and
 * that jitter widens when the athlete is throwing off a broken platform.
 */
function buildKinetics(rng: Rng, effort: number, disorder: number, physical: number): KineticPeak[] {
  const jitter = 7 + disorder * 13;
  const pelvis = rng.gauss(548 + 96 * effort, 42) * physical;
  const trunk = pelvis * rng.gauss(1.63, 0.07) + rng.gauss(0, 40);
  const draft: KineticPeak[] = [
    { segment: 'pelvis', peakAngularVelocityDegPerSec: pelvis, timeToPeakMs: rng.gauss(30, jitter) },
    { segment: 'trunk', peakAngularVelocityDegPerSec: trunk, timeToPeakMs: rng.gauss(74, jitter) },
    {
      segment: 'shoulder-ir',
      peakAngularVelocityDegPerSec: rng.gauss(3080 + 940 * effort, 235) * physical,
      timeToPeakMs: rng.gauss(117, jitter),
    },
    {
      segment: 'elbow-ext',
      peakAngularVelocityDegPerSec: rng.gauss(2040 + 390 * effort, 145) * physical,
      timeToPeakMs: rng.gauss(129, jitter),
    },
    {
      segment: 'wrist',
      peakAngularVelocityDegPerSec: rng.gauss(1620 + 300 * effort, 130) * physical,
      timeToPeakMs: rng.gauss(144, jitter),
    },
  ];
  return draft.map((peak) => ({
    ...peak,
    peakAngularVelocityDegPerSec: Math.round(peak.peakAngularVelocityDegPerSec),
    timeToPeakMs: Math.round(peak.timeToPeakMs * 10) / 10,
  }));
}

interface RepLatents {
  effort: number;
  disorder: number;
  fatigue: number;
  familiarity: number;
  /** 0 before the drift window, ramping to 1 by the last game of a drift season. */
  drift: number;
  physical: number;
  gameForm: number;
}

function buildJoints(rng: Rng, l: RepLatents): JointAngles {
  return {
    shoulderExternalRotationDeg: rng.gaussClamped(163 + 7 * l.effort - 3.5 * l.disorder, 4.4, 140, 184),
    elbowFlexionAtMaxErDeg: rng.gaussClamped(92 - 3 * l.effort, 5.0, 72, 112),
    elbowFlexionAtReleaseDeg: rng.gaussClamped(25 + 4.5 * l.disorder, 3.9, 12, 46),
    hipShoulderSeparationDeg: rng.gaussClamped(45 + 5 * l.effort - 7 * l.disorder, 4.3, 24, 62),
    frontKneeFlexionDeg: rng.gaussClamped(41 - 6 * l.effort + 7 * l.disorder, 4.8, 20, 68),
    // The planted compensation: the trunk starts leaning further to get over
    // the ball once the lead leg stops holding up.
    trunkLateralTiltDeg: rng.gaussClamped(20.5 + 6.0 * l.drift + 5 * l.disorder, 3.3, 6, 44),
    trunkForwardFlexionDeg: rng.gaussClamped(33 - 2 * l.disorder, 4.6, 16, 52),
    shoulderAbductionDeg: rng.gaussClamped(96 - 4.0 * l.drift, 4.6, 76, 118),
  };
}

function buildSymmetry(rng: Rng, l: RepLatents): LoadSymmetry {
  return {
    // Lead-leg braking force is the first thing to give.
    leadLegBrakingForceBw: rng.gaussClamped(1.98 + 0.34 * l.effort - 0.78 * l.drift - 0.22 * l.disorder, 0.13, 0.9, 2.9),
    trailLegDriveForceBw: rng.gaussClamped(1.34 + 0.12 * l.effort, 0.10, 0.85, 1.9),
    throwSidePelvisRotationDeg: rng.gaussClamped(52 + 3 * l.effort, 3.9, 34, 70),
    gloveSidePelvisRotationDeg: rng.gaussClamped(48 - 2.6 * l.drift, 3.9, 30, 66),
    // And the arm quietly takes the load the leg gave up.
    elbowVarusTorqueNm: rng.gaussClamped(52 + 23 * l.effort + 20.0 * l.drift, 5.4, 26, 112),
  };
}

function buildFlight(rng: Rng, l: RepLatents, airYards: number): BallFlight {
  const velocity = rng.gaussClamped(
    49.8 + 14.0 * l.effort + 0.9 * l.gameForm - 1.4 * l.fatigue - 2.4 * l.disorder,
    1.2,
    36,
    64,
  ) * l.physical;
  const spiral = rng.gaussClamped(93.6 - 4.6 * l.disorder - 0.7 * l.fatigue, 1.7, 74, 99.2);
  return {
    velocityMph: Math.round(velocity * 10) / 10,
    spinRateRpm: Math.round(rng.gaussClamped(505 + 215 * l.effort - 30 * l.disorder, 34, 380, 830)),
    spiralEfficiencyPct: Math.round(spiral * 10) / 10,
    // Wobble is the geometric complement of a clean spiral, not an independent draw.
    wobbleDeg: Math.round(Math.max(0.4, (100 - spiral) * 0.56 + rng.gauss(0, 0.9)) * 10) / 10,
    launchAngleDeg: Math.round(rng.gaussClamped(9 + airYards * 0.42, 2.4, 1, 42) * 10) / 10,
    airYards: Math.round(airYards * 10) / 10,
  };
}

interface CognitionDraw {
  cognition: CognitiveMetrics;
  ooda: OodaTiming;
  releaseMs: number;
}

function buildCognition(
  rng: Rng,
  l: RepLatents,
  context: Omit<PlayContext, 'pocketState'> & { pocketState: PocketState },
): CognitionDraw {
  const disguised = context.coverageShown !== context.coveragePlayed;
  const load = Math.round(
    rng.gaussClamped(
      3.7 + (context.playType === 'play-action' ? 0.8 : 0) + (context.down === 3 ? 0.5 : 0) + (context.twoMinute ? 0.4 : 0),
      0.9,
      2,
      7,
    ),
  );

  // Observe: the snap-to-picture span. Disguise and post-snap rotation are what
  // lengthen it; familiarity with the install is what shortens it.
  const observeMs = rng.gaussClamped(
    724 - 150 * l.familiarity + (disguised ? 205 : 0) + 150 * l.disorder + 22 * (load - 4) + 30 * l.fatigue,
    92,
    280,
    1500,
  );
  // Orient: matching the picture to the install. The span experience owns.
  const orientMs = rng.gaussClamped(
    782 - 235 * l.familiarity + (disguised ? 120 : 0) + 330 * l.disorder + 34 * (load - 4),
    108,
    210,
    1600,
  );
  // Decide: the reaction-time core, isolated from footwork and arm speed.
  const decisionLatencyMs = rng.gaussClamped(
    302 - 58 * l.familiarity + 140 * l.disorder + 14 * (load - 4) + 34 * l.fatigue,
    52,
    140,
    720,
  );
  // Act: the mechanical span. Pressure shortens it and widens its spread —
  // hurried is faster, not slower, and that is the point.
  const actMs = rng.gaussClamped(
    978 - 70 * l.disorder + (HOLD_MS[context.playType] - 1180) * 0.28,
    58 + 34 * l.disorder,
    520,
    1500,
  );

  // Round each span first and take the loop as their sum. Rounding the sum
  // instead leaves the four parts a millisecond short of the whole, and the
  // partition is only useful if it is exact.
  const observe = Math.round(observeMs);
  const orient = Math.round(orientMs);
  const decide = Math.round(decisionLatencyMs);
  const act = Math.round(actMs);
  const loopMs = observe + orient + decide + act;
  const progressionDepth = Math.round(
    rng.gaussClamped(context.playType === 'rpo' || context.playType === 'screen' ? 1.4 : 2.3, 0.85, 1, 5),
  );

  const cognition: CognitiveMetrics = {
    callToFirstReadMs: Math.round(rng.gaussClamped(1850 - 340 * l.familiarity, 320, 700, 4200)),
    coverageIdMs: observe,
    coverageIdCorrect: rng.chance(
      Math.min(0.98, 0.90 + 0.05 * l.familiarity - (disguised ? 0.20 : 0) - 0.025 * (load - 4) - 0.06 * l.disorder),
    ),
    progressionDepth,
    perProgressionMs: Math.round(rng.gaussClamped(340 - 55 * l.familiarity + 40 * l.disorder, 58, 160, 700)),
    decisionLatencyMs: decide,
    workingMemoryLoad: load,
    liveVariables: pickVariables(rng, load),
    anticipatory: rng.chance(
      Math.max(0.04, 0.30 + 0.20 * l.familiarity - 0.15 * l.disorder - 0.03 * (load - 4) - (disguised ? 0.08 : 0)),
    ),
    gazeDwellPrimaryMs: Math.round(rng.gaussClamped(600 - 95 * l.familiarity + 70 * l.disorder, 128, 180, 1250)),
    safetyLookOff: rng.chance(Math.min(0.85, 0.31 + 0.21 * l.familiarity - 0.12 * l.disorder)),
    postSnapRotation: disguised,
  };

  return {
    cognition,
    ooda: { observeMs: observe, orientMs: orient, decideMs: decide, actMs: act, loopMs },
    releaseMs: loopMs,
  };
}

function pickVariables(rng: Rng, load: number): string[] {
  const pool = [...LIVE_VARIABLES];
  const out: string[] = [];
  for (let i = 0; i < load && pool.length > 0; i += 1) {
    const index = rng.int(0, pool.length - 1);
    out.push(pool.splice(index, 1)[0] as string);
  }
  return out;
}

function buildRelease(rng: Rng, athlete: AthleteProfile, l: RepLatents, joints: JointAngles, releaseMs: number): ReleaseMetrics {
  // Release height follows from the athlete's height and how far the trunk is
  // tilted at release, so the planted tilt drift moves it — as it should.
  const heightIn = athlete.heightIn * 0.985 + 4.2 - joints.trunkLateralTiltDeg * 0.16 + rng.gauss(0, 0.9);
  return {
    releaseHeightIn: Math.round(heightIn * 10) / 10,
    releaseLateralIn: Math.round(rng.gauss(14.5 + 0.9 * l.disorder, 1.35 + 0.8 * l.disorder) * 10) / 10,
    timeToReleaseMs: releaseMs,
    armSlotDeg: Math.round(rng.gaussClamped(57 - 4.5 * l.drift - 3 * l.disorder, 3.1, 34, 80) * 10) / 10,
  };
}

function buildFootwork(rng: Rng, l: RepLatents, playType: PlayType, releaseMs: number): FootworkMetrics {
  const plant = Math.max(300, releaseMs - rng.gaussClamped(152, 22, 95, 230));
  return {
    dropTimeMs: Math.round(rng.gaussClamped(DROP_MS[playType] + 40 * l.fatigue, 68, DROP_MS[playType] - 260, DROP_MS[playType] + 340)),
    frontFootPlantMs: Math.round(plant),
    baseWidthIn: Math.round(rng.gaussClamped(26.1, 1.7, 20, 33) * 10) / 10,
    strideLengthPctHeight: Math.round(rng.gaussClamped(65 + 4 * l.effort - 5.5 * l.disorder, 3.3, 48, 82) * 10) / 10,
  };
}

function buildOutcome(
  rng: Rng,
  l: RepLatents,
  context: PlayContext,
  cognition: CognitiveMetrics,
  flight: BallFlight,
): PlayOutcome {
  const deep = flight.airYards >= 20;
  const onTargetP = Math.min(
    0.95,
    Math.max(
      0.20,
      0.80 + 0.05 * l.familiarity - 0.152 * l.disorder - 0.022 * (cognition.workingMemoryLoad - 4)
        - (deep ? 0.13 : 0) - 0.05 * l.fatigue - (cognition.coverageIdCorrect ? 0 : 0.11),
    ),
  );
  const onTarget = rng.chance(onTargetP);
  const separation = Math.max(0, rng.gauss(cognition.anticipatory ? 2.9 : 2.4, 1.15));

  let result: PlayResult;
  if (!cognition.coverageIdCorrect && rng.chance(0.10 + 0.06 * l.disorder + (deep ? 0.05 : 0))) result = 'interception';
  else if (onTarget && rng.chance(0.87 - (deep ? 0.14 : 0) + Math.min(0.08, separation * 0.02))) {
    result = context.yardsToGoal <= 22 && rng.chance(0.34) ? 'touchdown' : 'complete';
  } else result = 'incomplete';

  const placementBase = onTarget ? 74 + 16 * (1 - l.disorder) : 40;
  const yards = result === 'complete' || result === 'touchdown'
    ? Math.max(0, Math.round(flight.airYards + Math.max(0, rng.gauss(separation * 1.6, 3.4))))
    : 0;

  return {
    result,
    yards: result === 'touchdown' ? Math.max(yards, Math.round(flight.airYards)) : yards,
    epa: epaFor(result, yards, context),
    onTarget,
    targetSeparationYd: Math.round(separation * 10) / 10,
    placementScore: Math.round(Math.min(100, Math.max(0, rng.gauss(placementBase, 9)))),
  };
}

/**
 * A deliberately simple expected-points model: enough for the outcome column to
 * move in the right direction and the right rough magnitude, and clearly not a
 * substitute for a fitted league model. A live deployment replaces this with
 * whatever EPA the club already trusts.
 */
function epaFor(result: PlayResult, yards: number, context: PlayContext): number {
  const needed = context.distance;
  let epa: number;
  switch (result) {
    case 'touchdown': epa = 3.4; break;
    case 'interception': epa = -3.9; break;
    case 'sack': epa = -1.45; break;
    case 'throwaway': epa = -0.62; break;
    case 'scramble': epa = yards >= needed ? 0.8 : -0.22 + yards * 0.04; break;
    case 'complete': epa = yards >= needed ? 0.58 + (yards - needed) * 0.028 : -0.16 + yards * 0.045; break;
    default: epa = context.down >= 3 ? -1.25 : -0.62;
  }
  if (context.down === 4) epa *= 1.35;
  return Math.round(epa * 1000) / 1000;
}

function buildContext(
  rng: Rng,
  gameId: string,
  snapIndex: number,
  totalSnaps: number,
): PlayContext {
  const playType = rng.weighted(PLAY_TYPE_WEIGHTS);
  const quarter = (Math.min(4, Math.floor((snapIndex / totalSnaps) * 4) + 1) as 1 | 2 | 3 | 4);
  const down = rng.weighted([[1, 42], [2, 33], [3, 22], [4, 3]] as const) as 1 | 2 | 3 | 4;
  const distance = down === 1 ? 10 : Math.max(1, Math.round(rng.gaussClamped(7, 3.4, 1, 20)));
  const pressure = rng.chance(PRESSURE_P[playType]);
  const shown = rng.weighted(SHELL_WEIGHTS);
  const played = rng.chance(0.74) ? shown : rng.weighted(SHELL_WEIGHTS);
  const clockSec = Math.round(rng.uniform(0, 900));
  const pocketState: PocketState = pressure
    ? rng.weighted([['muddied', 46], ['collapsed', 31], ['off-platform', 23]] as const)
    : rng.weighted([['clean', 93], ['muddied', 7]] as const);

  return {
    gameId,
    quarter,
    clockSec,
    down,
    distance,
    yardsToGoal: Math.round(rng.uniform(3, 92)),
    scoreDifferential: Math.round(rng.gaussClamped(0, 9, -24, 24)),
    playType,
    coverageShown: shown,
    coveragePlayed: played,
    pressure,
    pressureOnsetMs: pressure ? Math.round(rng.gaussClamped(1950, 380, 900, 2500)) : null,
    rushers: pressure ? rng.weighted([[4, 52], [5, 34], [6, 14]] as const) : rng.weighted([[3, 12], [4, 76], [5, 12]] as const),
    pocketState,
    twoMinute: (quarter === 2 || quarter === 4) && clockSec < 120,
    redZone: false,
    snapIndex,
  };
}

const DISORDER: Record<PocketState, number> = {
  clean: 0,
  muddied: 0.45,
  collapsed: 0.85,
  'off-platform': 1,
};

/** Build one athlete-season. Same spec in, same bundle out, every time. */
export function generateSeason(athlete: AthleteProfile, spec: SeasonSpec): SeasonBundle {
  const rng = createRng(`${athlete.id}:${spec.season.id}`);
  const games: GameSummary[] = [];
  const throws: ThrowRecord[] = [];

  for (let g = 0; g < spec.games; g += 1) {
    const week = g < 8 ? g + 1 : g + 2; // one bye, after week 8
    const gameId = `${spec.season.id}-w${String(week).padStart(2, '0')}`;
    const date = new Date(Date.UTC(spec.season.year, 8, 8 + week * 7, 18, 5));
    games.push({
      id: gameId,
      seasonId: spec.season.id,
      week,
      opponent: OPPONENTS[g % OPPONENTS.length] as string,
      date: date.toISOString(),
      home: g % 2 === 0,
      tempF: Math.round(rng.gaussClamped(72 - week * 1.9, 8, 18, 96)),
      surface: rng.chance(0.55) ? 'grass' : 'turf',
    });

    const gameForm = rng.gauss(0, 1);
    const totalSnaps = Math.round(rng.gaussClamped(36, 4.5, 24, 48));
    // The planted compensation window: nothing before week 13, ramping after.
    const drift = spec.carriesLateSeasonDrift ? Math.max(0, Math.min(1, (week - 12) / 6)) : 0;
    const familiarity = Math.min(1, spec.installFamiliarity + (week / 18) * 0.35);

    for (let s = 0; s < totalSnaps; s += 1) {
      const context = buildContext(rng, gameId, s, totalSnaps);
      const [airMean, airSd] = AIR_YARDS[context.playType];
      const airYards = rng.gaussClamped(airMean, airSd, -4, 58);
      const latents: RepLatents = {
        effort: Math.min(1, Math.max(0, (airYards + 4) / 46)),
        disorder: DISORDER[context.pocketState],
        fatigue: s / totalSnaps,
        familiarity,
        drift,
        physical: spec.physicalIndex,
        gameForm,
      };

      const { cognition, ooda, releaseMs } = buildCognition(rng, latents, context);

      // Reps that never became a throw are recorded, but carry no ball flight —
      // a sack has no release point, and averaging one in would be a lie.
      const sacked = context.pressure && rng.chance(0.13 + 0.10 * latents.disorder);
      const scrambled = !sacked && context.pressure && rng.chance(0.11);
      const threwAway = !sacked && !scrambled && context.pressure && rng.chance(0.14);

      const joints = buildJoints(rng, latents);
      const flight = sacked || scrambled ? null : buildFlight(rng, latents, airYards);
      const outcome: PlayOutcome = sacked
        ? { result: 'sack', yards: -Math.round(rng.uniform(3, 9)), epa: epaFor('sack', 0, context), onTarget: false, targetSeparationYd: 0, placementScore: 0 }
        : scrambled
          ? (() => {
              const gained = Math.round(rng.gaussClamped(6.5, 4.5, -2, 26));
              return { result: 'scramble' as const, yards: gained, epa: epaFor('scramble', gained, context), onTarget: false, targetSeparationYd: 0, placementScore: 0 };
            })()
          : threwAway
            ? { result: 'throwaway', yards: 0, epa: epaFor('throwaway', 0, context), onTarget: false, targetSeparationYd: 0, placementScore: 0 }
            : buildOutcome(rng, latents, context, cognition, flight as BallFlight);

      const ballLeftHand = !sacked && !scrambled;
      const release = ballLeftHand ? buildRelease(rng, athlete, latents, joints, releaseMs) : null;
      const footwork = buildFootwork(rng, latents, context.playType, releaseMs);

      throws.push({
        id: `${gameId}-p${String(s).padStart(2, '0')}`,
        athleteId: athlete.id,
        seasonId: spec.season.id,
        snapAt: new Date(date.getTime() + s * 42_000).toISOString(),
        context: { ...context, redZone: context.yardsToGoal <= 20 },
        phases: ballLeftHand ? buildPhases(rng, footwork.frontFootPlantMs, releaseMs) : null,
        joints,
        kinetics: buildKinetics(rng, latents.effort, latents.disorder, latents.physical),
        release,
        flight,
        footwork,
        symmetry: buildSymmetry(rng, latents),
        cognition,
        ooda: ballLeftHand ? ooda : null,
        outcome,
        capture: {
          source: 'synthetic',
          system: 'QB IQ synthetic model v1',
          sampleRateHz: 300,
          confidence: Math.round(rng.gaussClamped(0.93 - 0.08 * latents.disorder, 0.04, 0.6, 0.995) * 1000) / 1000,
        },
      });
    }
  }

  return {
    season: spec.season,
    games,
    throws,
    protocols: buildProtocols(rng, athlete.id, spec),
    recognition: buildRecognition(rng, athlete.id, spec),
  };
}

/**
 * Weekly breathing-protocol sessions. The effect modelled here is the one the
 * literature actually supports: a reliable acute rise in vagally mediated HRV
 * during and just after slow paced breathing, and a smaller, noisier advantage
 * on a pressured decision block. It is deliberately not modelled as a
 * transformation.
 */
function buildProtocols(rng: Rng, athleteId: string, spec: SeasonSpec): ProtocolSession[] {
  const out: ProtocolSession[] = [];
  for (let week = 1; week <= spec.games + 1; week += 1) {
    const protocol = rng.weighted([
      ['box-4-4-4-4', 52],
      ['coherent-5.5', 34],
      ['physiological-sigh', 14],
    ] as const);
    const pre = rng.gaussClamped(58 - week * 0.35, 9, 28, 96);
    const gain = protocol === 'coherent-5.5' ? 1.32 : protocol === 'box-4-4-4-4' ? 1.24 : 1.11;
    const control = rng.gaussClamped(71, 6.5, 50, 90);
    out.push({
      id: `${athleteId}-${spec.season.id}-proto-${week}`,
      athleteId,
      date: new Date(Date.UTC(spec.season.year, 8, 5 + week * 7, 15, 0)).toISOString(),
      week,
      protocol,
      minutes: rng.weighted([[5, 40], [8, 35], [12, 25]] as const),
      preRmssdMs: Math.round(pre),
      postRmssdMs: Math.round(pre * rng.gaussClamped(gain, 0.11, 0.9, 1.7)),
      preHrBpm: Math.round(rng.gaussClamped(68, 4.5, 54, 84)),
      postHrBpm: Math.round(rng.gaussClamped(60, 4.5, 46, 76)),
      postProtocolAccuracyPct: Math.round(Math.min(100, control + rng.gaussClamped(4.6, 4.2, -6, 16))),
      controlAccuracyPct: Math.round(control),
    });
  }
  return out;
}

/**
 * Rapid-exposure recognition drilling. Reaction time falls across the season
 * with a decelerating curve, accuracy rises more slowly, and the shortest
 * exposure stays the hardest — the ordinary shape of a perceptual-training
 * dose-response, not a straight line to perfection.
 */
function buildRecognition(rng: Rng, athleteId: string, spec: SeasonSpec): RecognitionSession[] {
  const out: RecognitionSession[] = [];
  const categories = ['shell', 'pressure', 'leverage'] as const;
  const exposures = [250, 400, 600] as const;
  for (let week = 1; week <= spec.games + 1; week += 1) {
    for (const [categoryIndex, category] of categories.entries()) {
      const exposure = exposures[(week - 1 + categoryIndex) % exposures.length] as number;
      const learning = 1 - Math.exp(-week / 6.5);
      const base = category === 'shell' ? 690 : category === 'pressure' ? 745 : 800;
      const trials = 40;
      const accuracy = Math.min(
        0.97,
        (category === 'shell' ? 0.80 : 0.74) + 0.13 * learning + (exposure - 400) * 0.00016 + rng.gauss(0, 0.035),
      );
      out.push({
        id: `${athleteId}-${spec.season.id}-recog-${week}-${category}`,
        athleteId,
        date: new Date(Date.UTC(spec.season.year, 8, 6 + week * 7, 14, 30)).toISOString(),
        week,
        exposureMs: exposure,
        category,
        trials,
        correct: Math.round(trials * accuracy),
        meanRtMs: Math.round(
          rng.gaussClamped(base - 150 * learning - (exposure - 400) * 0.10 - 30 * spec.installFamiliarity, 34, 400, 1100),
        ),
        sdRtMs: Math.round(rng.gaussClamped(120 - 22 * learning, 14, 55, 200)),
      });
    }
  }
  return out;
}
