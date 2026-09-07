/**
 * Record builders for the analysis tests.
 *
 * Hand-built reps, not generated ones: a test that asserts the sequencing rule
 * should state the five peak timings it is asserting about, so that when it
 * fails it says which rule broke rather than which season it was run against.
 * Not imported by any application module.
 */

import type {
  CognitiveMetrics,
  KineticPeak,
  KineticSegment,
  PlayContext,
  PlayOutcome,
  ThrowRecord,
} from '../domain/types';

export function chain(timings: Partial<Record<KineticSegment, number>> = {}): KineticPeak[] {
  const base: Record<KineticSegment, number> = {
    pelvis: 30,
    trunk: 74,
    'shoulder-ir': 117,
    'elbow-ext': 129,
    wrist: 144,
  };
  const peaks: Record<KineticSegment, number> = {
    pelvis: 580,
    trunk: 945,
    'shoulder-ir': 3380,
    'elbow-ext': 2230,
    wrist: 1740,
  };
  return (Object.keys(base) as KineticSegment[]).map((segment) => ({
    segment,
    peakAngularVelocityDegPerSec: peaks[segment],
    timeToPeakMs: timings[segment] ?? base[segment],
  }));
}

export interface RepOverrides {
  id?: string;
  gameId?: string;
  pressure?: boolean;
  pocketState?: PlayContext['pocketState'];
  down?: PlayContext['down'];
  distance?: number;
  quarter?: PlayContext['quarter'];
  twoMinute?: boolean;
  redZone?: boolean;
  yardsToGoal?: number;
  scoreDifferential?: number;
  result?: PlayOutcome['result'];
  yards?: number;
  onTarget?: boolean;
  anticipatory?: boolean;
  coverageIdCorrect?: boolean;
  workingMemoryLoad?: number;
  decisionLatencyMs?: number;
  coverageIdMs?: number;
  loopMs?: number;
  releaseHeightIn?: number;
  releaseLateralIn?: number;
  velocityMph?: number;
  airYards?: number;
  leadLegBrakingForceBw?: number;
  elbowVarusTorqueNm?: number;
  timings?: Partial<Record<KineticSegment, number>>;
  confidence?: number;
  safetyLookOff?: boolean;
}

/** One rep, with every field defaulted to something ordinary. */
export function rep(overrides: RepOverrides = {}): ThrowRecord {
  const result = overrides.result ?? 'complete';
  const ballLeftHand = result !== 'sack' && result !== 'scramble';
  const observeMs = overrides.coverageIdMs ?? 680;
  const decideMs = overrides.decisionLatencyMs ?? 290;
  const orientMs = 660;
  const loopMs = overrides.loopMs ?? observeMs + orientMs + decideMs + 970;
  const actMs = loopMs - observeMs - orientMs - decideMs;

  const context: PlayContext = {
    gameId: overrides.gameId ?? 'g1',
    quarter: overrides.quarter ?? 1,
    clockSec: 600,
    down: overrides.down ?? 1,
    distance: overrides.distance ?? 10,
    yardsToGoal: overrides.yardsToGoal ?? 60,
    scoreDifferential: overrides.scoreDifferential ?? 0,
    playType: 'shotgun-5',
    coverageShown: 'Cover 3',
    coveragePlayed: 'Cover 3',
    pressure: overrides.pressure ?? false,
    pressureOnsetMs: overrides.pressure ? 2000 : null,
    rushers: 4,
    pocketState: overrides.pocketState ?? (overrides.pressure ? 'muddied' : 'clean'),
    twoMinute: overrides.twoMinute ?? false,
    redZone: overrides.redZone ?? false,
    snapIndex: 0,
  };

  const cognition: CognitiveMetrics = {
    callToFirstReadMs: 1700,
    coverageIdMs: observeMs,
    coverageIdCorrect: overrides.coverageIdCorrect ?? true,
    progressionDepth: 2,
    perProgressionMs: 320,
    decisionLatencyMs: decideMs,
    workingMemoryLoad: overrides.workingMemoryLoad ?? 4,
    liveVariables: [],
    anticipatory: overrides.anticipatory ?? false,
    gazeDwellPrimaryMs: 540,
    safetyLookOff: overrides.safetyLookOff ?? false,
    postSnapRotation: false,
  };

  const outcome: PlayOutcome = {
    result,
    yards: overrides.yards ?? 12,
    epa: 0.3,
    onTarget: overrides.onTarget ?? true,
    targetSeparationYd: 2.6,
    placementScore: 82,
  };

  return {
    id: overrides.id ?? 'r1',
    athleteId: 'qb-test',
    seasonId: 's2026',
    snapAt: '2026-10-04T18:22:31.000Z',
    context,
    phases: ballLeftHand
      ? [
          { phase: 'stance', startMs: 0, endMs: 1800 },
          { phase: 'load', startMs: 1800, endMs: 2000 },
          { phase: 'stride', startMs: 2000, endMs: 2350 },
          { phase: 'trunk-rotation', startMs: 2350, endMs: 2408 },
          { phase: 'arm-cocking', startMs: 2408, endMs: 2454 },
          { phase: 'acceleration', startMs: 2454, endMs: 2486 },
          { phase: 'release', startMs: 2486, endMs: 2500 },
          { phase: 'follow-through', startMs: 2500, endMs: 2740 },
        ]
      : null,
    joints: {
      shoulderExternalRotationDeg: 165,
      elbowFlexionAtMaxErDeg: 92,
      elbowFlexionAtReleaseDeg: 25,
      hipShoulderSeparationDeg: 45,
      frontKneeFlexionDeg: 40,
      trunkLateralTiltDeg: 21,
      trunkForwardFlexionDeg: 33,
      shoulderAbductionDeg: 96,
    },
    kinetics: chain(overrides.timings),
    release: ballLeftHand
      ? {
          releaseHeightIn: overrides.releaseHeightIn ?? 74.6,
          releaseLateralIn: overrides.releaseLateralIn ?? 14.5,
          timeToReleaseMs: loopMs,
          armSlotDeg: 56,
        }
      : null,
    flight: ballLeftHand
      ? {
          velocityMph: overrides.velocityMph ?? 53,
          spinRateRpm: 570,
          spiralEfficiencyPct: 93,
          wobbleDeg: 3.9,
          launchAngleDeg: 14,
          airYards: overrides.airYards ?? 13,
        }
      : null,
    footwork: { dropTimeMs: 1180, frontFootPlantMs: 2350, baseWidthIn: 26, strideLengthPctHeight: 65 },
    symmetry: {
      leadLegBrakingForceBw: overrides.leadLegBrakingForceBw ?? 2.0,
      trailLegDriveForceBw: 1.35,
      throwSidePelvisRotationDeg: 52,
      gloveSidePelvisRotationDeg: 48,
      elbowVarusTorqueNm: overrides.elbowVarusTorqueNm ?? 60,
    },
    cognition,
    ooda: ballLeftHand ? { observeMs, orientMs, decideMs, actMs, loopMs } : null,
    outcome,
    capture: {
      source: 'synthetic',
      system: 'test',
      sampleRateHz: 300,
      confidence: overrides.confidence ?? 0.93,
    },
  };
}

/** `count` reps built from the same overrides, with distinct ids. */
export function reps(count: number, overrides: RepOverrides | ((index: number) => RepOverrides) = {}): ThrowRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const resolved = typeof overrides === 'function' ? overrides(index) : overrides;
    return rep({ ...resolved, id: resolved.id ? `${resolved.id}-${index}` : `r${index}` });
  });
}
