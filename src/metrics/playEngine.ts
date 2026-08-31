/**
 * Per-play metric engine for quarterback reps.
 *
 * The engine is a small state machine driven by two operator events (snap and
 * throw) and one detection stream. Everything else — pressure onset, response
 * latency, distance travelled — is derived, because those are the numbers a
 * human cannot eyeball reliably from the sideline and the reason to point a
 * camera at the rep in the first place.
 *
 * All internal geometry is in field yards, never pixels. Callers hand in a
 * homography and the engine refuses to record a play without one, so a number
 * in yards is always a real measurement rather than a scaled guess.
 */

import type { Matrix3, Point } from '../vision/homography.ts';
import { applyHomography, distance } from '../vision/homography.ts';
import type { TrackedPlayer } from '../vision/players.ts';
import { groundPoint } from '../vision/players.ts';

/** A defender inside this radius of the QB counts as pressure, in yards. */
export const PRESSURE_RADIUS_YARDS = 3.5;
/** QB speed that counts as reacting to pressure, in yards/second. */
const RESPONSE_SPEED_YPS = 2.5;
/**
 * Distance the QB must get from the last committed point before that travel is
 * added to the path length, in yards.
 *
 * Deliberately a displacement threshold and not a per-frame one. A per-frame
 * floor is frame-rate dependent — at 60fps a QB drifting at 2 yd/s moves only
 * 0.03 yd per frame, so any floor coarse enough to reject detector jitter also
 * silently rejects real movement, and the play reports far less ground covered
 * than the QB actually gained. Committing displacement from an anchor instead
 * lets slow movement accumulate over as many frames as it needs, while jitter,
 * which is mean-reverting, never walks far enough from the anchor to commit.
 *
 * The value is set above the smoothed keypoint noise amplitude (see the jitter
 * check in scripts/verify-engine.mjs). Raising it costs almost no accuracy on
 * real movement, because travel is committed in chunks and the final partial
 * chunk is flushed at the release, but it is what keeps a stationary QB from
 * accruing yards he never ran.
 */
const MOVEMENT_COMMIT_YARDS = 0.5;
/** Window over which speed is measured, in seconds. */
const SPEED_WINDOW_S = 0.12;
/** Smoothing applied to the QB's field position before differentiating it. */
const POSITION_SMOOTHING = 0.4;

export type PlayPhase = 'idle' | 'live' | 'thrown' | 'complete';

export type PlaySnapshot = {
  phase: PlayPhase;
  /** Seconds from snap to the first defender inside the pressure radius. */
  pressureOnset: number | null;
  /** Seconds from pressure onset until the QB moved off the spot. */
  pressureResponse: number | null;
  /** Path length the QB covered from snap to throw, in yards. */
  totalMovement: number;
  /** Seconds from snap to release. */
  timeToThrow: number | null;
  /** Release point to target point, in yards. */
  throwDistance: number | null;
  /** Nearest defender at release, in yards. */
  separationAtRelease: number | null;
  elapsed: number;
};

export type CompletedPlay = PlaySnapshot & {
  id: string;
  recordedAt: number;
  quarterbackId: number;
  label: string;
  expectedCompletion: number | null;
  expectedFirstDown: number | null;
};

export class PlayEngine {
  private phase: PlayPhase = 'idle';
  private homography: Matrix3 | null = null;
  private quarterbackId: number | null = null;

  private snapTime = 0;
  private smoothedPosition: Point | null = null;
  /** Last point whose travel has been added to totalMovement. */
  private anchorPosition: Point | null = null;
  /** Recent smoothed positions, used to measure speed over a window. */
  private history: { t: number; position: Point }[] = [];

  private pressureOnsetAt: number | null = null;
  private pressureResponseAt: number | null = null;
  private throwAt: number | null = null;
  private releasePoint: Point | null = null;
  private targetPoint: Point | null = null;
  private separationAtRelease: number | null = null;
  private totalMovement = 0;
  private elapsed = 0;

  setHomography(H: Matrix3 | null): void {
    this.homography = H;
  }

  get calibrated(): boolean {
    return this.homography !== null;
  }

  get currentPhase(): PlayPhase {
    return this.phase;
  }

  get trackedQuarterback(): number | null {
    return this.quarterbackId;
  }

  /**
   * Begin a rep. Returns false when the app is not ready to measure — an
   * uncalibrated play would produce yard figures that are really pixel counts,
   * which is worse than no play at all.
   */
  snap(quarterbackId: number, timestampMs: number): boolean {
    if (!this.homography) return false;

    this.phase = 'live';
    this.quarterbackId = quarterbackId;
    this.snapTime = timestampMs;
    this.smoothedPosition = null;
    this.anchorPosition = null;
    this.history = [];
    this.pressureOnsetAt = null;
    this.pressureResponseAt = null;
    this.throwAt = null;
    this.releasePoint = null;
    this.targetPoint = null;
    this.separationAtRelease = null;
    this.totalMovement = 0;
    this.elapsed = 0;
    return true;
  }

  /** Feed one frame of detections. Safe to call in any phase. */
  update(players: TrackedPlayer[], timestampMs: number): void {
    if (this.phase !== 'live' || !this.homography || this.quarterbackId === null) return;

    const qb = players.find((p) => p.id === this.quarterbackId);
    this.elapsed = (timestampMs - this.snapTime) / 1000;

    if (!qb) {
      // Losing the QB mid-play (occlusion in the pocket) must not invent travel.
      // The anchor is kept, so when he reappears the real displacement across
      // the gap is committed once — a straight-line estimate of ground actually
      // covered — rather than being either dropped or interpolated frame by
      // frame. Speed history is dropped, since a stale sample paired with a new
      // one would read as an impossible burst.
      this.history = [];
      return;
    }

    const field = applyHomography(this.homography, groundPoint(qb));
    if (!field) return;

    this.smoothedPosition = this.smoothedPosition
      ? {
          x: this.smoothedPosition.x + (field.x - this.smoothedPosition.x) * POSITION_SMOOTHING,
          y: this.smoothedPosition.y + (field.y - this.smoothedPosition.y) * POSITION_SMOOTHING,
        }
      : field;

    if (!this.anchorPosition) this.anchorPosition = this.smoothedPosition;
    const travelled = distance(this.smoothedPosition, this.anchorPosition);
    if (travelled >= MOVEMENT_COMMIT_YARDS) {
      this.totalMovement += travelled;
      this.anchorPosition = this.smoothedPosition;
    }

    const speed = this.trackSpeed(this.smoothedPosition, timestampMs);

    const separation = this.nearestDefenderDistance(players, qb, this.smoothedPosition);

    if (this.pressureOnsetAt === null && separation !== null && separation <= PRESSURE_RADIUS_YARDS) {
      this.pressureOnsetAt = timestampMs;
    }

    if (
      this.pressureOnsetAt !== null &&
      this.pressureResponseAt === null &&
      timestampMs > this.pressureOnsetAt &&
      speed >= RESPONSE_SPEED_YPS
    ) {
      this.pressureResponseAt = timestampMs;
    }
  }

  /** Mark the release. The operator taps this; ball tracking is not attempted. */
  markThrow(players: TrackedPlayer[], timestampMs: number): void {
    if (this.phase !== 'live') return;

    // Commit whatever travel has not yet cleared the threshold, so the final
    // figure is not short by up to one commit distance.
    if (this.smoothedPosition && this.anchorPosition) {
      this.totalMovement += distance(this.smoothedPosition, this.anchorPosition);
      this.anchorPosition = this.smoothedPosition;
    }

    this.phase = 'thrown';
    this.throwAt = timestampMs;
    this.releasePoint = this.smoothedPosition;

    const qb = players.find((p) => p.id === this.quarterbackId);
    if (qb && this.smoothedPosition) {
      this.separationAtRelease = this.nearestDefenderDistance(players, qb, this.smoothedPosition);
    }
  }

  /** Set where the ball came down, as a pixel point the operator tapped. */
  markTarget(pixel: Point): void {
    if (this.phase !== 'thrown' || !this.homography) return;
    this.targetPoint = applyHomography(this.homography, pixel);
  }

  snapshot(): PlaySnapshot {
    return {
      phase: this.phase,
      pressureOnset:
        this.pressureOnsetAt === null ? null : (this.pressureOnsetAt - this.snapTime) / 1000,
      pressureResponse:
        this.pressureOnsetAt === null || this.pressureResponseAt === null
          ? null
          : (this.pressureResponseAt - this.pressureOnsetAt) / 1000,
      totalMovement: this.totalMovement,
      timeToThrow: this.throwAt === null ? null : (this.throwAt - this.snapTime) / 1000,
      throwDistance:
        this.releasePoint && this.targetPoint
          ? distance(this.releasePoint, this.targetPoint)
          : null,
      separationAtRelease: this.separationAtRelease,
      elapsed: this.elapsed,
    };
  }

  /** Close the rep out and hand back an immutable record. */
  finish(label: string): CompletedPlay | null {
    if (this.phase === 'idle' || this.quarterbackId === null) return null;

    const snap = this.snapshot();
    this.phase = 'complete';

    return {
      ...snap,
      phase: 'complete',
      id: `play-${Date.now().toString(36)}`,
      recordedAt: Date.now(),
      quarterbackId: this.quarterbackId,
      label,
      expectedCompletion: null,
      expectedFirstDown: null,
    };
  }

  reset(): void {
    this.phase = 'idle';
    this.quarterbackId = null;
  }

  /**
   * Speed over a short trailing window rather than between adjacent frames.
   *
   * Differentiating consecutive frames amplifies keypoint noise enormously at
   * 60fps — a couple of pixels of ankle wobble reads as several yards per
   * second — which would fire the pressure-response timer while the QB is still
   * standing in the pocket.
   */
  private trackSpeed(position: Point, timestampMs: number): number {
    this.history.push({ t: timestampMs, position });

    const cutoff = timestampMs - SPEED_WINDOW_S * 1000;
    while (this.history.length > 2 && this.history[0].t < cutoff) this.history.shift();

    const oldest = this.history[0];
    const dt = (timestampMs - oldest.t) / 1000;
    if (dt <= 0) return 0;

    return distance(position, oldest.position) / dt;
  }

  private nearestDefenderDistance(
    players: TrackedPlayer[],
    qb: TrackedPlayer,
    qbField: Point,
  ): number | null {
    if (!this.homography || qb.team === null) return null;

    let nearest: number | null = null;
    for (const player of players) {
      if (player.id === qb.id || player.team === null || player.team === qb.team) continue;
      const field = applyHomography(this.homography, groundPoint(player));
      if (!field) continue;
      const d = distance(qbField, field);
      if (nearest === null || d < nearest) nearest = d;
    }
    return nearest;
  }
}
