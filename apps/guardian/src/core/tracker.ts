/**
 * Multi-object tracker — a compact take on ByteTrack.
 *
 * The idea worth keeping from that paper: don't throw away low-confidence
 * detections. Match high-confidence ones first, then give surviving tracks a
 * second chance against the leftovers. A person walking behind a hedge drops to
 * a low score for a few frames; a one-pass tracker loses them and starts a new
 * track, which resets every dwell timer and defeats suppression. The second
 * pass is what keeps identity stable through partial occlusion.
 *
 * Association is greedy on IoU rather than Hungarian: at the handful of
 * simultaneous subjects this app sees, the optimal assignment and the greedy
 * one agree, and greedy costs nothing.
 *
 * Motion is a constant-velocity estimate rather than a Kalman filter. At 15-30
 * fps over sub-second horizons the difference is not measurable, and this stays
 * readable and testable.
 */

import { iou, foot, predict, clampBox } from './geometry.ts';
import {
  DEFAULT_TRACKER,
  type Detection,
  type Track,
  type TrackerConfig,
  type Point,
  type Box,
} from './types.ts';

interface Pair {
  trackIdx: number;
  detIdx: number;
  score: number;
}

/** Greedy IoU association. Returns pairs plus the indices left unmatched. */
function associate(
  boxes: Box[],
  dets: Detection[],
  threshold: number,
): { pairs: Pair[]; freeTracks: number[]; freeDets: number[] } {
  const candidates: Pair[] = [];
  for (let t = 0; t < boxes.length; t++) {
    for (let d = 0; d < dets.length; d++) {
      const score = iou(boxes[t], dets[d].box);
      if (score >= threshold) candidates.push({ trackIdx: t, detIdx: d, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const usedTracks = new Set<number>();
  const usedDets = new Set<number>();
  const pairs: Pair[] = [];
  for (const c of candidates) {
    if (usedTracks.has(c.trackIdx) || usedDets.has(c.detIdx)) continue;
    usedTracks.add(c.trackIdx);
    usedDets.add(c.detIdx);
    pairs.push(c);
  }

  const freeTracks: number[] = [];
  for (let t = 0; t < boxes.length; t++) if (!usedTracks.has(t)) freeTracks.push(t);
  const freeDets: number[] = [];
  for (let d = 0; d < dets.length; d++) if (!usedDets.has(d)) freeDets.push(d);

  return { pairs, freeTracks, freeDets };
}

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private readonly cfg: TrackerConfig;

  constructor(cfg: Partial<TrackerConfig> = {}) {
    this.cfg = { ...DEFAULT_TRACKER, ...cfg };
  }

  /** Live tracks, tentative ones included. */
  all(): readonly Track[] {
    return this.tracks;
  }

  confirmed(): Track[] {
    return this.tracks.filter((t) => t.state === 'confirmed');
  }

  reset(): void {
    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * Advance the tracker by one frame. `detections` should already be filtered
   * to the score floor; the split between high and low confidence happens here.
   */
  update(detections: Detection[], t: number): readonly Track[] {
    const { highScore, iouThreshold, maxAge, minHits, maxPath } = this.cfg;

    const high = detections.filter((d) => d.score >= highScore);
    const low = detections.filter((d) => d.score < highScore);

    // Predict forward so association compares like with like.
    const predicted = this.tracks.map((tr) => predict(tr.box, tr.velocity));

    // Pass one — confident detections against every track.
    const first = associate(predicted, high, iouThreshold);
    for (const p of first.pairs) {
      this.absorb(this.tracks[p.trackIdx], high[p.detIdx], t, maxPath);
    }

    // Pass two — leftover tracks get a shot at the low-confidence detections.
    // Only tracks that already have history are eligible; a tentative track
    // built purely from weak detections is usually noise.
    const secondEligible = first.freeTracks.filter(
      (i) => this.tracks[i].state === 'confirmed' || this.tracks[i].hits >= minHits,
    );
    const second = associate(
      secondEligible.map((i) => predicted[i]),
      low,
      iouThreshold,
    );
    const matchedInSecond = new Set<number>();
    for (const p of second.pairs) {
      const trackIdx = secondEligible[p.trackIdx];
      matchedInSecond.add(trackIdx);
      this.absorb(this.tracks[trackIdx], low[p.detIdx], t, maxPath);
    }

    // Age everything that found nothing this frame.
    for (const idx of first.freeTracks) {
      if (matchedInSecond.has(idx)) continue;
      const tr = this.tracks[idx];
      tr.age += 1;
      if (tr.state === 'confirmed') tr.state = 'lost';
      // Coast along the last known velocity so a brief miss doesn't strand the
      // box; decay it so a long miss doesn't send the box flying off-frame.
      tr.box = predict(tr.box, tr.velocity);
      tr.velocity = { x: tr.velocity.x * 0.6, y: tr.velocity.y * 0.6 };
    }

    // Unmatched confident detections start new tracks. Weak detections never
    // do — that is the main source of one-frame phantom tracks.
    for (const d of first.freeDets) this.spawn(high[d], t);

    this.tracks = this.tracks.filter((tr) => tr.age <= maxAge);
    return this.tracks;
  }

  private absorb(tr: Track, d: Detection, t: number, maxPath: number): void {
    const prevFoot = foot(tr.box);
    const nextFoot = foot(d.box);
    tr.velocity = { x: nextFoot.x - prevFoot.x, y: nextFoot.y - prevFoot.y };
    tr.box = clampBox(d.box);
    tr.score = Math.max(tr.score, d.score);
    tr.label = d.label;
    tr.hits += 1;
    tr.age = 0;
    tr.lastSeen = t;
    if (tr.state !== 'confirmed' && tr.hits >= this.cfg.minHits) tr.state = 'confirmed';
    else if (tr.state === 'lost') tr.state = 'confirmed';
    tr.path.push(nextFoot);
    if (tr.path.length > maxPath) tr.path.shift();
  }

  private spawn(d: Detection, t: number): void {
    const box = clampBox(d.box);
    const start: Point = foot(box);
    this.tracks.push({
      id: this.nextId++,
      box,
      label: d.label,
      score: d.score,
      state: 'tentative',
      hits: 1,
      age: 0,
      firstSeen: t,
      lastSeen: t,
      path: [start],
      velocity: { x: 0, y: 0 },
    });
  }
}
