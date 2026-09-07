/**
 * The live-feed adapter.
 *
 * This is the piece that makes "swap the mock for real sensors later" a claim
 * rather than a hope. `VendorThrowPayload` is the shape the tracking vendors
 * converge on — SI units, a joint-angle map keyed by segment, a list of segment
 * angular-velocity peaks with timestamps, and an optional ball solve — and
 * `adaptVendorThrow` turns one of those into the `ThrowRecord` every view in
 * this app already consumes.
 *
 * It does three things a real integration always ends up needing: it converts
 * units in exactly one place, it derives the fields the vendor does not send
 * (the OODA partition is re-based onto the release clock so the four spans still
 * sum to it), and it refuses bad records rather than passing through a plausible
 * looking one. `adaptVendorThrow` returns either a record or a list of reasons,
 * so an ingest pipeline can quarantine a rep and say why.
 */

import type {
  CaptureSource,
  CognitiveMetrics,
  PlayContext,
  PlayOutcome,
  ThrowRecord,
} from '../../domain/types';
import { KINETIC_SEGMENTS, type KineticSegment } from '../../domain/types';
import {
  metresPerSecToMph,
  metresToInches,
  newtonsToBodyweights,
  radiansToDegrees,
  radPerSecToDegPerSec,
  radPerSecToRpm,
  round,
  secondsToMs,
} from './units';

/** One segment's angular-velocity peak as a vendor reports it: rad/s, seconds. */
export interface VendorSegmentPeak {
  segment: KineticSegment;
  peakAngularVelocityRadPerSec: number;
  /** Timestamp of the peak, seconds relative to front-foot plant. */
  timeToPeakSec: number;
}

/** SI-unit payload for one dropback, as it arrives from a tracking or mocap vendor. */
export interface VendorThrowPayload {
  id: string;
  athleteId: string;
  seasonId: string;
  snapAt: string;
  /** Athlete mass, needed to normalise force-plate output. */
  athleteMassKg: number;
  capture: {
    source: CaptureSource;
    system: string;
    sampleRateHz: number;
    confidence: number;
  };
  events: {
    /** Seconds from snap. */
    frontFootPlantSec: number;
    releaseSec: number;
    dropCompleteSec: number;
  };
  /** Joint angles in radians, at the events named in the domain model. */
  jointsRad: {
    shoulderExternalRotation: number;
    elbowFlexionAtMaxEr: number;
    elbowFlexionAtRelease: number;
    hipShoulderSeparation: number;
    frontKneeFlexion: number;
    trunkLateralTilt: number;
    trunkForwardFlexion: number;
    shoulderAbduction: number;
  };
  segmentPeaks: VendorSegmentPeak[];
  releaseMetres: {
    height: number;
    lateralFromMidline: number;
    /** Forearm angle above horizontal, radians. */
    armSlotRad: number;
  };
  ball: {
    speedMetresPerSec: number;
    spinRadPerSec: number;
    spiralEfficiency: number;
    wobbleRad: number;
    launchAngleRad: number;
    airYards: number;
  } | null;
  footwork: {
    baseWidthMetres: number;
    strideLengthMetres: number;
    athleteHeightMetres: number;
  };
  forces: {
    leadLegPeakVerticalNewtons: number;
    trailLegPeakVerticalNewtons: number;
    elbowVarusTorqueNm: number;
    throwSidePelvisRotationRad: number;
    gloveSidePelvisRotationRad: number;
  };
  /** Charted, not sensed: the film-room half of a rep. */
  context: PlayContext;
  cognition: CognitiveMetrics;
  outcome: PlayOutcome;
}

export type AdaptResult =
  | { ok: true; record: ThrowRecord }
  | { ok: false; reasons: string[] };

/** Everything that would make a record untrustworthy, collected rather than thrown one at a time. */
export function validateVendorPayload(payload: VendorThrowPayload): string[] {
  const reasons: string[] = [];
  const { events, capture } = payload;
  if (!(capture.sampleRateHz >= 100)) {
    reasons.push(`capture rate ${capture.sampleRateHz} Hz is below the 100 Hz floor for peak angular velocity`);
  }
  if (capture.confidence < 0 || capture.confidence > 1) {
    reasons.push(`solver confidence ${capture.confidence} is outside 0–1`);
  }
  if (!(events.releaseSec > events.frontFootPlantSec)) {
    reasons.push('release precedes front-foot plant');
  }
  if (!(events.frontFootPlantSec > 0)) {
    reasons.push('front-foot plant is at or before the snap');
  }
  if (payload.athleteMassKg <= 0) reasons.push('athlete mass must be positive');
  if (payload.footwork.athleteHeightMetres <= 0) reasons.push('athlete height must be positive');
  const seen = new Set(payload.segmentPeaks.map((p) => p.segment));
  const missing = KINETIC_SEGMENTS.filter((segment) => !seen.has(segment));
  if (missing.length > 0) reasons.push(`missing segment peaks: ${missing.join(', ')}`);
  if (payload.ball && (payload.ball.spiralEfficiency < 0 || payload.ball.spiralEfficiency > 1)) {
    reasons.push('spiral efficiency must be a 0–1 fraction');
  }
  const { observeMs, orientMs, decideMs } = spans(payload);
  if (observeMs + orientMs + decideMs >= secondsToMs(events.releaseSec)) {
    reasons.push('charted observe/orient/decide spans exceed the measured release time');
  }
  return reasons;
}

/**
 * The three charted spans. `act` is not charted — it is whatever is left of the
 * release clock, which is what keeps the partition exact no matter how the film
 * room timed the first three.
 */
function spans(payload: VendorThrowPayload): { observeMs: number; orientMs: number; decideMs: number } {
  const observeMs = payload.cognition.coverageIdMs;
  const orientMs = Math.max(0, payload.cognition.perProgressionMs * Math.max(1, payload.cognition.progressionDepth - 1));
  return { observeMs, orientMs, decideMs: payload.cognition.decisionLatencyMs };
}

export function adaptVendorThrow(payload: VendorThrowPayload): AdaptResult {
  const reasons = validateVendorPayload(payload);
  if (reasons.length > 0) return { ok: false, reasons };

  const releaseMs = Math.round(secondsToMs(payload.events.releaseSec));
  const plantMs = Math.round(secondsToMs(payload.events.frontFootPlantSec));
  const { observeMs, orientMs, decideMs } = spans(payload);
  const actMs = releaseMs - observeMs - orientMs - decideMs;

  const heightIn = metresToInches(payload.footwork.athleteHeightMetres);
  const j = payload.jointsRad;

  const record: ThrowRecord = {
    id: payload.id,
    athleteId: payload.athleteId,
    seasonId: payload.seasonId,
    snapAt: payload.snapAt,
    context: payload.context,
    // A vendor that ships event timestamps but not phase windows still gets a
    // usable phase strip: the boundaries are anchored to the events it did send.
    phases: [
      { phase: 'stance', startMs: 0, endMs: Math.round(plantMs * 0.42) },
      { phase: 'load', startMs: Math.round(plantMs * 0.42), endMs: Math.round(plantMs * 0.72) },
      { phase: 'stride', startMs: Math.round(plantMs * 0.72), endMs: plantMs },
      { phase: 'trunk-rotation', startMs: plantMs, endMs: plantMs + Math.round((releaseMs - plantMs) * 0.38) },
      { phase: 'arm-cocking', startMs: plantMs + Math.round((releaseMs - plantMs) * 0.38), endMs: plantMs + Math.round((releaseMs - plantMs) * 0.7) },
      { phase: 'acceleration', startMs: plantMs + Math.round((releaseMs - plantMs) * 0.7), endMs: releaseMs - 12 },
      { phase: 'release', startMs: releaseMs - 12, endMs: releaseMs },
      { phase: 'follow-through', startMs: releaseMs, endMs: releaseMs + 240 },
    ],
    joints: {
      shoulderExternalRotationDeg: round(radiansToDegrees(j.shoulderExternalRotation), 1),
      elbowFlexionAtMaxErDeg: round(radiansToDegrees(j.elbowFlexionAtMaxEr), 1),
      elbowFlexionAtReleaseDeg: round(radiansToDegrees(j.elbowFlexionAtRelease), 1),
      hipShoulderSeparationDeg: round(radiansToDegrees(j.hipShoulderSeparation), 1),
      frontKneeFlexionDeg: round(radiansToDegrees(j.frontKneeFlexion), 1),
      trunkLateralTiltDeg: round(radiansToDegrees(j.trunkLateralTilt), 1),
      trunkForwardFlexionDeg: round(radiansToDegrees(j.trunkForwardFlexion), 1),
      shoulderAbductionDeg: round(radiansToDegrees(j.shoulderAbduction), 1),
    },
    kinetics: KINETIC_SEGMENTS.map((segment) => {
      const peak = payload.segmentPeaks.find((p) => p.segment === segment) as VendorSegmentPeak;
      return {
        segment,
        peakAngularVelocityDegPerSec: Math.round(radPerSecToDegPerSec(peak.peakAngularVelocityRadPerSec)),
        timeToPeakMs: round(secondsToMs(peak.timeToPeakSec), 1),
      };
    }),
    release: {
      releaseHeightIn: round(metresToInches(payload.releaseMetres.height), 1),
      releaseLateralIn: round(metresToInches(payload.releaseMetres.lateralFromMidline), 1),
      timeToReleaseMs: releaseMs,
      armSlotDeg: round(radiansToDegrees(payload.releaseMetres.armSlotRad), 1),
    },
    flight: payload.ball
      ? {
          velocityMph: round(metresPerSecToMph(payload.ball.speedMetresPerSec), 1),
          spinRateRpm: Math.round(radPerSecToRpm(payload.ball.spinRadPerSec)),
          spiralEfficiencyPct: round(payload.ball.spiralEfficiency * 100, 1),
          wobbleDeg: round(radiansToDegrees(payload.ball.wobbleRad), 1),
          launchAngleDeg: round(radiansToDegrees(payload.ball.launchAngleRad), 1),
          airYards: round(payload.ball.airYards, 1),
        }
      : null,
    footwork: {
      dropTimeMs: Math.round(secondsToMs(payload.events.dropCompleteSec)),
      frontFootPlantMs: plantMs,
      baseWidthIn: round(metresToInches(payload.footwork.baseWidthMetres), 1),
      strideLengthPctHeight: round(
        (metresToInches(payload.footwork.strideLengthMetres) / heightIn) * 100,
        1,
      ),
    },
    symmetry: {
      leadLegBrakingForceBw: round(newtonsToBodyweights(payload.forces.leadLegPeakVerticalNewtons, payload.athleteMassKg), 2),
      trailLegDriveForceBw: round(newtonsToBodyweights(payload.forces.trailLegPeakVerticalNewtons, payload.athleteMassKg), 2),
      throwSidePelvisRotationDeg: round(radiansToDegrees(payload.forces.throwSidePelvisRotationRad), 1),
      gloveSidePelvisRotationDeg: round(radiansToDegrees(payload.forces.gloveSidePelvisRotationRad), 1),
      elbowVarusTorqueNm: round(payload.forces.elbowVarusTorqueNm, 0),
    },
    cognition: payload.cognition,
    ooda: { observeMs, orientMs, decideMs, actMs, loopMs: releaseMs },
    outcome: payload.outcome,
    capture: payload.capture,
  };

  return { ok: true, record };
}
