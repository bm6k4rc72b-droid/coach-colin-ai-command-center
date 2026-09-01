/**
 * The suppression engine.
 *
 * This file is the product. Detection is commodity — anyone can fine-tune a
 * person detector. What people pay a subscription for is not being woken at
 * 3am because a fox walked past, and every rule below exists because of a
 * specific real-world false positive:
 *
 *   fox / cat            → aspect ratio, size plausibility
 *   branch in wind       → straightness (travels far, arrives nowhere)
 *   wheelie bin, statue  → path length over the dwell window
 *   rain on the lens     → dwell time, confirmed-track requirement
 *   headlights sweeping  → frame-brightness transient gate
 *   neighbour's path     → zone masking on the ground-contact point
 *   one person, pacing   → per-zone cooldown
 *
 * Every rejection carries a reason code. Those codes go into the event log so
 * the user can see what was filtered and we can tune against real footage
 * rather than intuition. A suppression system you cannot audit is one you
 * cannot improve.
 */

import { aspect, foot, pathLength, pointInPolygon, straightness } from './geometry.ts';
import {
  DEFAULT_SUPPRESSION,
  type SuppressionConfig,
  type SuppressionReason,
  type Track,
  type Verdict,
  type Zone,
} from './types.ts';

export interface AssessInput {
  tracks: readonly Track[];
  zones: Zone[];
  /** Frame timestamp in milliseconds. */
  t: number;
  /** Mean luma of the current frame, 0..1. */
  brightness: number;
}

export interface AssessResult {
  verdicts: Verdict[];
  /** Track ids that should raise an alert this frame. */
  alerts: number[];
}

export class Suppressor {
  private readonly cfg: SuppressionConfig;
  /** Tracks that have already fired, so one subject alerts once. */
  private alerted = new Set<number>();
  /** Zone id → timestamp when its cooldown expires. */
  private cooldowns = new Map<string, number>();
  private lastBrightness: number | null = null;
  /** Frames remaining in an illumination-transient hold. */
  private transientHold = 0;

  constructor(cfg: Partial<SuppressionConfig> = {}) {
    this.cfg = { ...DEFAULT_SUPPRESSION, ...cfg };
  }

  reset(): void {
    this.alerted.clear();
    this.cooldowns.clear();
    this.lastBrightness = null;
    this.transientHold = 0;
  }

  /** Forget tracks that no longer exist, so the alerted set stays bounded. */
  private prune(tracks: readonly Track[]): void {
    if (this.alerted.size === 0) return;
    const live = new Set(tracks.map((t) => t.id));
    for (const id of this.alerted) if (!live.has(id)) this.alerted.delete(id);
  }

  /**
   * A sudden global brightness change means the whole scene just changed — car
   * headlights, a security light, someone flicking the kitchen light on. Every
   * detector produces junk for a few frames afterwards, so we hold off rather
   * than trying to reason about individual boxes.
   */
  private updateTransient(brightness: number): boolean {
    const prev = this.lastBrightness;
    this.lastBrightness = brightness;
    if (prev !== null && Math.abs(brightness - prev) >= this.cfg.brightnessJump) {
      this.transientHold = 15;
    }
    if (this.transientHold > 0) {
      this.transientHold -= 1;
      return true;
    }
    return false;
  }

  private zoneFor(track: Track, zones: Zone[]): Zone | null {
    const point = foot(track.box);
    for (const z of zones) {
      if (!z.armed) continue;
      if (pointInPolygon(point, z.points)) return z;
    }
    return null;
  }

  /**
   * Evaluate one track. Returns the reason it was suppressed, or null if it
   * should alert. Ordered cheapest-first, and more importantly ordered so the
   * reason surfaced to the user is the most explanatory one.
   */
  private judge(track: Track, zones: Zone[], t: number, transient: boolean): SuppressionReason | null {
    const c = this.cfg;

    if (this.alerted.has(track.id)) return 'already-alerted';
    if (!c.armedLabels.includes(track.label)) return 'class-not-armed';
    if (track.score < c.scoreCeiling) return 'below-score-floor';
    if (transient) return 'illumination-transient';

    // Zones are optional. With none defined the whole frame is armed, which is
    // the sane default before the user has drawn anything.
    const armedZones = zones.filter((z) => z.armed);
    let zone: Zone | null = null;
    if (armedZones.length > 0) {
      zone = this.zoneFor(track, armedZones);
      if (!zone) return 'outside-zone';
    }

    const ratio = aspect(track.box);
    if (ratio < c.aspectRange[0] || ratio > c.aspectRange[1]) return 'implausible-aspect';

    const h = track.box.h;
    if (h < c.heightRange[0] || h > c.heightRange[1]) return 'implausible-size';

    if (track.state !== 'confirmed') return 'not-yet-confirmed';
    if (track.hits < c.minHits) return 'not-yet-confirmed';
    if (t - track.firstSeen < c.dwellMs) return 'not-yet-confirmed';

    // Motion rules only apply once there is enough path to judge. Before that,
    // the dwell check above is what is holding the track back anyway.
    const len = pathLength(track.path);
    if (track.path.length >= 6) {
      if (len < c.minPathLength) return 'stationary-object';
      if (straightness(track.path) < c.minStraightness) return 'oscillating-motion';
    }

    if (zone) {
      const until = this.cooldowns.get(zone.id) ?? 0;
      if (t < until) return 'zone-cooldown';
    }

    return null;
  }

  assess({ tracks, zones, t, brightness }: AssessInput): AssessResult {
    this.prune(tracks);
    const transient = this.updateTransient(brightness);

    const verdicts: Verdict[] = [];
    const alerts: number[] = [];

    for (const track of tracks) {
      const reason = this.judge(track, zones, t, transient);
      if (reason) {
        verdicts.push({ trackId: track.id, alert: false, reason });
        continue;
      }
      verdicts.push({ trackId: track.id, alert: true });
      alerts.push(track.id);
      this.alerted.add(track.id);
      const zone = this.zoneFor(track, zones);
      if (zone) this.cooldowns.set(zone.id, t + this.cfg.zoneCooldownMs);
    }

    return { verdicts, alerts };
  }
}

/** Human-readable rejection reasons, for the event log and the tuning screen. */
export const REASON_TEXT: Record<SuppressionReason, string> = {
  'class-not-armed': 'Not a person',
  'below-score-floor': 'Too uncertain to call',
  'outside-zone': 'Outside your armed area',
  'implausible-aspect': 'Wrong shape for a person',
  'implausible-size': 'Wrong size for a person',
  'not-yet-confirmed': 'Gone before it could be confirmed',
  'oscillating-motion': 'Moving on the spot — likely foliage',
  'stationary-object': 'Not moving — likely an object',
  'illumination-transient': 'Sudden light change',
  'zone-cooldown': 'Already alerted for this area',
  'already-alerted': 'Already alerted for this subject',
};
