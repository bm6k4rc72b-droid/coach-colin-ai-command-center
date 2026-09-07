import { describe, expect, test } from 'vitest';
import { adaptVendorThrow, validateVendorPayload, type VendorThrowPayload } from './vendorAdapter';
import type { CognitiveMetrics, PlayContext, PlayOutcome } from '../../domain/types';
import { degreesToRadians, inchesToMetres } from './units';

const context: PlayContext = {
  gameId: 'g1',
  quarter: 2,
  clockSec: 412,
  down: 3,
  distance: 7,
  yardsToGoal: 41,
  scoreDifferential: -3,
  playType: 'shotgun-5',
  coverageShown: 'Cover 3',
  coveragePlayed: 'Quarters',
  pressure: true,
  pressureOnsetMs: 2100,
  rushers: 5,
  pocketState: 'muddied',
  twoMinute: false,
  redZone: false,
  snapIndex: 14,
};

const cognition: CognitiveMetrics = {
  callToFirstReadMs: 1600,
  coverageIdMs: 700,
  coverageIdCorrect: true,
  progressionDepth: 3,
  perProgressionMs: 300,
  decisionLatencyMs: 280,
  workingMemoryLoad: 4,
  liveVariables: ['MIKE identification', 'hot conversion vs. pressure'],
  anticipatory: true,
  gazeDwellPrimaryMs: 540,
  safetyLookOff: true,
  postSnapRotation: true,
};

const outcome: PlayOutcome = {
  result: 'complete',
  yards: 14,
  epa: 0.62,
  onTarget: true,
  targetSeparationYd: 2.8,
  placementScore: 84,
};

/** A well-formed SI payload, shaped the way tracking vendors emit one. */
function payload(overrides: Partial<VendorThrowPayload> = {}): VendorThrowPayload {
  return {
    id: 'g1-p14',
    athleteId: 'qb-0117',
    seasonId: 's2026',
    snapAt: '2026-10-04T18:22:31.000Z',
    athleteMassKg: 98.9,
    capture: { source: 'markerless-mocap', system: 'VendorCap 4', sampleRateHz: 240, confidence: 0.91 },
    events: { frontFootPlantSec: 2.35, releaseSec: 2.5, dropCompleteSec: 1.18 },
    jointsRad: {
      shoulderExternalRotation: degreesToRadians(166),
      elbowFlexionAtMaxEr: degreesToRadians(92),
      elbowFlexionAtRelease: degreesToRadians(24),
      hipShoulderSeparation: degreesToRadians(45),
      frontKneeFlexion: degreesToRadians(40),
      trunkLateralTilt: degreesToRadians(21),
      trunkForwardFlexion: degreesToRadians(33),
      shoulderAbduction: degreesToRadians(96),
    },
    segmentPeaks: [
      { segment: 'pelvis', peakAngularVelocityRadPerSec: degreesToRadians(580), timeToPeakSec: 0.03 },
      { segment: 'trunk', peakAngularVelocityRadPerSec: degreesToRadians(945), timeToPeakSec: 0.074 },
      { segment: 'shoulder-ir', peakAngularVelocityRadPerSec: degreesToRadians(3380), timeToPeakSec: 0.117 },
      { segment: 'elbow-ext', peakAngularVelocityRadPerSec: degreesToRadians(2230), timeToPeakSec: 0.129 },
      { segment: 'wrist', peakAngularVelocityRadPerSec: degreesToRadians(1740), timeToPeakSec: 0.144 },
    ],
    releaseMetres: {
      height: inchesToMetres(74.6),
      lateralFromMidline: inchesToMetres(14.5),
      armSlotRad: degreesToRadians(56),
    },
    ball: {
      speedMetresPerSec: 24.6,
      spinRadPerSec: 60,
      spiralEfficiency: 0.928,
      wobbleRad: degreesToRadians(4.1),
      launchAngleRad: degreesToRadians(14),
      airYards: 13.5,
    },
    footwork: {
      baseWidthMetres: inchesToMetres(26),
      strideLengthMetres: inchesToMetres(49),
      athleteHeightMetres: inchesToMetres(75),
    },
    forces: {
      leadLegPeakVerticalNewtons: 1940,
      trailLegPeakVerticalNewtons: 1300,
      elbowVarusTorqueNm: 61,
      throwSidePelvisRotationRad: degreesToRadians(52),
      gloveSidePelvisRotationRad: degreesToRadians(48),
    },
    context,
    cognition,
    outcome,
    ...overrides,
  };
}

function adapted(overrides: Partial<VendorThrowPayload> = {}) {
  const result = adaptVendorThrow(payload(overrides));
  if (!result.ok) throw new Error(`expected a record, got: ${result.reasons.join('; ')}`);
  return result.record;
}

describe('validation', () => {
  test('a well-formed payload has nothing to complain about', () => {
    expect(validateVendorPayload(payload())).toEqual([]);
  });

  test('rejects a capture rate too low to resolve a peak angular velocity', () => {
    const reasons = validateVendorPayload(
      payload({ capture: { source: 'imu-suit', system: 'Slow', sampleRateHz: 60, confidence: 0.9 } }),
    );
    expect(reasons.some((reason) => reason.includes('100 Hz'))).toBe(true);
  });

  test('rejects a release that precedes front-foot plant', () => {
    const reasons = validateVendorPayload(
      payload({ events: { frontFootPlantSec: 2.5, releaseSec: 2.35, dropCompleteSec: 1.1 } }),
    );
    expect(reasons).toContain('release precedes front-foot plant');
  });

  test('names every missing segment rather than the first one', () => {
    const reasons = validateVendorPayload(
      payload({ segmentPeaks: [{ segment: 'pelvis', peakAngularVelocityRadPerSec: 10, timeToPeakSec: 0.03 }] }),
    );
    expect(reasons.some((reason) => reason.includes('trunk') && reason.includes('wrist'))).toBe(true);
  });

  test('rejects a spiral efficiency sent as a percentage instead of a fraction', () => {
    const base = payload();
    const reasons = validateVendorPayload({ ...base, ball: { ...base.ball!, spiralEfficiency: 92.8 } });
    expect(reasons.some((reason) => reason.includes('0–1 fraction'))).toBe(true);
  });

  test('rejects charted spans that will not fit inside the measured release clock', () => {
    const reasons = validateVendorPayload(
      payload({ cognition: { ...cognition, coverageIdMs: 2200, decisionLatencyMs: 900 } }),
    );
    expect(reasons.some((reason) => reason.includes('exceed the measured release time'))).toBe(true);
  });

  test('collects every problem at once so a rep can be quarantined with all its reasons', () => {
    const reasons = validateVendorPayload(
      payload({
        athleteMassKg: 0,
        capture: { source: 'imu-suit', system: 'Slow', sampleRateHz: 30, confidence: 4 },
      }),
    );
    expect(reasons.length).toBeGreaterThanOrEqual(3);
  });

  test('a failed adaptation returns reasons and no record', () => {
    const result = adaptVendorThrow(payload({ athleteMassKg: -1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe('conversion', () => {
  test('joint angles arrive in degrees', () => {
    const record = adapted();
    expect(record.joints.shoulderExternalRotationDeg).toBeCloseTo(166, 1);
    expect(record.joints.hipShoulderSeparationDeg).toBeCloseTo(45, 1);
    expect(record.joints.frontKneeFlexionDeg).toBeCloseTo(40, 1);
  });

  test('segment peaks arrive in degrees per second, in the chain order', () => {
    const record = adapted();
    expect(record.kinetics.map((peak) => peak.segment)).toEqual([
      'pelvis',
      'trunk',
      'shoulder-ir',
      'elbow-ext',
      'wrist',
    ]);
    expect(record.kinetics[0]?.peakAngularVelocityDegPerSec).toBe(580);
    expect(record.kinetics[2]?.peakAngularVelocityDegPerSec).toBe(3380);
  });

  test('segment peak timings arrive in milliseconds relative to plant', () => {
    const record = adapted();
    expect(record.kinetics[0]?.timeToPeakMs).toBeCloseTo(30, 1);
    expect(record.kinetics[4]?.timeToPeakMs).toBeCloseTo(144, 1);
  });

  test('release geometry arrives in inches and degrees', () => {
    const record = adapted();
    expect(record.release?.releaseHeightIn).toBeCloseTo(74.6, 1);
    expect(record.release?.armSlotDeg).toBeCloseTo(56, 1);
    expect(record.release?.timeToReleaseMs).toBe(2500);
  });

  test('ball speed arrives in mph and spin in rpm', () => {
    const record = adapted();
    expect(record.flight?.velocityMph).toBeCloseTo(55.0, 1);
    expect(record.flight?.spinRateRpm).toBe(573);
    expect(record.flight?.spiralEfficiencyPct).toBeCloseTo(92.8, 1);
  });

  test('stride length is normalised to a percentage of standing height', () => {
    const record = adapted();
    // 49 in of stride on a 75 in athlete.
    expect(record.footwork.strideLengthPctHeight).toBeCloseTo(65.3, 1);
  });

  test('ground-reaction force is normalised to multiples of bodyweight', () => {
    const record = adapted();
    expect(record.symmetry.leadLegBrakingForceBw).toBeCloseTo(2.0, 1);
    expect(record.symmetry.trailLegDriveForceBw).toBeCloseTo(1.34, 2);
  });

  test('a rep with no ball solve keeps its mechanics and carries a null flight', () => {
    const record = adapted({ ball: null });
    expect(record.flight).toBeNull();
    expect(record.release?.releaseHeightIn).toBeCloseTo(74.6, 1);
  });
});

describe('derived fields', () => {
  test('the OODA spans partition the measured release clock exactly', () => {
    const record = adapted();
    const ooda = record.ooda as NonNullable<typeof record.ooda>;
    expect(ooda.observeMs + ooda.orientMs + ooda.decideMs + ooda.actMs).toBe(record.release?.timeToReleaseMs);
    expect(ooda.loopMs).toBe(record.release?.timeToReleaseMs);
  });

  test('act absorbs whatever the film room did not chart, and stays positive', () => {
    const record = adapted({ cognition: { ...cognition, coverageIdMs: 400, perProgressionMs: 200 } });
    const ooda = record.ooda as NonNullable<typeof record.ooda>;
    expect(ooda.actMs).toBeGreaterThan(0);
    expect(ooda.observeMs).toBe(400);
  });

  test('phase windows are anchored to the events the vendor did send, in order', () => {
    const record = adapted();
    const phases = record.phases as NonNullable<typeof record.phases>;
    expect(phases.map((phase) => phase.phase)).toEqual([
      'stance',
      'load',
      'stride',
      'trunk-rotation',
      'arm-cocking',
      'acceleration',
      'release',
      'follow-through',
    ]);
    for (let i = 1; i < phases.length; i += 1) {
      expect(phases[i]?.startMs).toBe(phases[i - 1]?.endMs);
    }
    expect(phases[2]?.endMs).toBe(2350);
  });

  test('charted context, cognition and outcome pass through untouched', () => {
    const record = adapted();
    expect(record.context).toEqual(context);
    expect(record.cognition).toEqual(cognition);
    expect(record.outcome).toEqual(outcome);
    expect(record.capture.system).toBe('VendorCap 4');
  });
});
