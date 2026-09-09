/**
 * Finding the ball, and admitting when it cannot be found.
 *
 * Everything about possession rests on this module, and this module is the
 * weakest thing in the app. That is not a defect to be hidden behind a
 * confident number — it is the single most important fact for anyone reading a
 * possession figure, so it is reported on every frame.
 *
 * A football is 22 cm across. At the far end of a pitch, in the footage a phone
 * on a fence produces, that is a single pixel. Kicked hard it crosses two
 * metres between frames and smears into a faint streak. It spends much of the
 * match hidden by the player who has it. So the honest specification is not
 * "track the ball" but "say where the ball is when the ball can be seen, and
 * say plainly when it cannot".
 *
 * The other half of the problem is everything else that is small, white and
 * round. A pitch seen from a hundred metres away offers one at every crossing
 * of two painted lines, and a tracker with no opinion about them will follow a
 * corner of the six-yard box for a half and report a possession share computed
 * from it. Two things rule them out, and both use knowledge the app already
 * has rather than a guess: a speck sitting on one of the lines this pitch is
 * known to have is declined, and a speck that stays in one place for a couple
 * of seconds is written off as scenery until it moves again. The second rule
 * is wrong for exactly one situation — a ball placed for a corner, standing
 * still while everyone walks up — and there the app reports the ball as unseen,
 * which beats reporting a sprinkler head as the ball.
 *
 * What the app does with all this is the important part. Possession is only ever
 * accumulated while the ball is actually visible, and the share of the match
 * where it was not is reported next to the result rather than divided up
 * between the teams. A possession bar that reads 81/19 with no denominator is
 * an assertion about the twenty seconds the ball happened to be visible,
 * presented as a fact about ninety minutes.
 *
 * @module touchline/ball
 */

import { apply, distanceToLines, expectedPixelHeight, onPitch, scaleAt } from './pitch.js';
import { paintWhite } from './segment.js';

/** Diameter of a size 5 football, metres. */
export const BALL_DIAMETER_M = 0.22;

/** Fastest a struck ball travels, metres per second. Roughly 130 km/h. */
export const MAX_BALL_SPEED_MPS = 36;

/** Consecutive sightings before the ball is believed. */
export const BALL_BIRTH_FRAMES = 2;

/** Frames the ball may be missing before its position stops being reported. */
export const BALL_PATIENCE_FRAMES = 8;

/** How close to a painted line a white speck may be and still be the ball. */
export const LINE_CLEARANCE_M = 0.6;

/** Grid the clutter memory counts sightings on, metres. */
export const CLUTTER_CELL_M = 0.5;

/** Sightings in one cell before it is written off as scenery. */
export const CLUTTER_FRAMES = 60;

/** Per-frame decay of the clutter memory; about a three-second half-life. */
export const CLUTTER_DECAY = 0.99;

/**
 * Pick the regions that could be a ball.
 *
 * The size gate is in metres, like the player gate, but generous in a way the
 * player gate is not: a struck ball smears across several of its own diameters
 * in one frame, so anything from a third of a ball to four balls wide is
 * allowed through and the tracker sorts out which candidate moves like a ball.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {import('./segment.js').Blob[]} blobs Regions from the same frame.
 * @param {object} options Gating options.
 * @param {number[]} options.imageToPitch Row-major 3x3 homography.
 * @param {{lengthM: number, widthM: number}} options.dimensions Pitch size.
 * @returns {{x: number, y: number, u: number, v: number, area: number,
 *   widthM: number}[]} Candidates in pitch metres.
 */
export function ballCandidates(frame, blobs, { imageToPitch, dimensions }) {
  const { data, width } = frame;
  const out = [];
  for (const blob of blobs) {
    const pixelWidth = blob.maxX - blob.minX + 1;
    const pixelHeight = blob.maxY - blob.minY + 1;
    const scale = expectedPixelHeight(imageToPitch, blob.cx, blob.cy, 1);
    if (!scale) continue;
    const widthM = pixelWidth / scale;
    const heightM = pixelHeight / scale;
    if (widthM > BALL_DIAMETER_M * 4 || heightM > BALL_DIAMETER_M * 4) continue;
    if (widthM < BALL_DIAMETER_M * 0.33 && heightM < BALL_DIAMETER_M * 0.33) continue;
    // A ball is round. A one-pixel fleck of anything is not evidence.
    if (blob.area < 2) continue;
    const centreX = Math.round(blob.cx);
    const centreY = Math.round(blob.cy);
    const i = (centreY * width + centreX) * 4;
    if (!paintWhite(data[i], data[i + 1], data[i + 2])) continue;
    const at = apply(imageToPitch, { x: blob.cx, y: blob.maxY });
    if (!onPitch(at, dimensions, 2)) continue;
    // Where two painted lines meet, the far end of a pitch offers a small round
    // white thing on grass every few metres. The app knows where its own lines
    // are, so it declines the ambiguity rather than tracking a corner of the
    // six-yard box for a half.
    const clearance = distanceToLines(at, dimensions);
    if (clearance < LINE_CLEARANCE_M) continue;
    out.push({
      x: at.x,
      y: at.y,
      u: blob.cx,
      v: blob.maxY,
      area: blob.area,
      widthM,
      clearanceM: clearance,
      // How near this is to being exactly ball-sized, used to break ties before
      // the ball has been acquired and there is no motion to judge it by.
      sizeError: Math.abs(widthM - BALL_DIAMETER_M) / BALL_DIAMETER_M,
    });
  }
  return out;
}

/**
 * Follows the ball between frames, and reports when it has lost it.
 */
export class BallTracker {
  /**
   * @param {object} [options] Tracker settings.
   * @param {number[]} [options.imageToPitch] Homography, for the noise floor.
   */
  constructor(options = {}) {
    this.imageToPitch = options.imageToPitch ?? null;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.visible = false;
    this.hits = 0;
    this.misses = BALL_PATIENCE_FRAMES;
    this.lastSeenMs = null;
    this.updatedMs = null;
    this.speedMps = 0;
    this.seenFrames = 0;
    this.totalFrames = 0;
    this.clutter = new Map();
  }

  /** Grid key a candidate falls in. */
  #cell(candidate) {
    return `${Math.round(candidate.x / CLUTTER_CELL_M)},${Math.round(candidate.y / CLUTTER_CELL_M)}`;
  }

  /** Fade the clutter memory so scenery that is removed stops being scenery. */
  #ageClutter() {
    for (const [key, value] of this.clutter) {
      const faded = value * CLUTTER_DECAY;
      if (faded < 0.5) this.clutter.delete(key);
      else this.clutter.set(key, faded);
    }
  }

  /** Replace the homography. */
  setHomography(imageToPitch) {
    this.imageToPitch = imageToPitch;
  }

  /**
   * Advance by one frame.
   *
   * When several candidates survive the size gate — a corner flag, a discarded
   * bib, a bright patch of the six-yard box — the one chosen is the one nearest
   * to where a ball travelling at its last velocity would now be. That is the
   * whole of the tracking logic, and it is deliberately simple: a cleverer
   * association would be more confident about the wrong white speck.
   *
   * @param {object[]} candidates Candidates from {@link ballCandidates}.
   * @param {number} timeMs Frame time.
   * @returns {{visible: boolean, x: number, y: number, speedMps: number,
   *   sinceSeenMs: number|null}} The ball's state as it should be reported.
   */
  update(candidates, timeMs) {
    this.totalFrames += 1;
    const dt = this.updatedMs === null ? 0 : Math.max(0.001, (timeMs - this.updatedMs) / 1000);
    const predicted = { x: this.x + this.vx * dt, y: this.y + this.vy * dt };

    this.#ageClutter();
    const fresh = [];
    for (const candidate of candidates) {
      const key = this.#cell(candidate);
      const seen = (this.clutter.get(key) ?? 0) + 1;
      this.clutter.set(key, seen);
      if (seen < CLUTTER_FRAMES) fresh.push(candidate);
    }

    let best = null;
    let bestScore = Infinity;
    const holding = this.hits > 0;
    for (const candidate of fresh) {
      if (holding) {
        // Once something is being followed — even provisionally, before it has
        // earned the right to be called the ball — the next sighting has to be
        // somewhere a ball could have travelled to. Re-picking purely by size
        // each frame is what lets a tracker wander between specks.
        const gap = Math.hypot(candidate.x - predicted.x, candidate.y - predicted.y);
        if (gap > MAX_BALL_SPEED_MPS * Math.max(dt, 0.04) + 1.5) continue;
        if (gap < bestScore) {
          bestScore = gap;
          best = candidate;
        }
      } else if (candidate.sizeError < bestScore) {
        // Nothing is being followed, so there is no motion to judge by. Size is
        // all that is left, and the most ball-sized speck beats whichever one
        // the scan happened to reach first.
        bestScore = candidate.sizeError;
        best = candidate;
      }
    }

    if (best) {
      if (holding && dt > 0) {
        this.vx = (best.x - this.x) / dt;
        this.vy = (best.y - this.y) / dt;
      }
      this.x = best.x;
      this.y = best.y;
      this.hits += 1;
      this.misses = 0;
      this.lastSeenMs = timeMs;
      this.seenFrames += 1;
      if (this.hits >= BALL_BIRTH_FRAMES) this.visible = true;
      const speed = Math.hypot(this.vx, this.vy);
      this.speedMps = Math.min(speed, MAX_BALL_SPEED_MPS);
    } else {
      this.hits = 0;
      this.misses += 1;
      if (this.misses > BALL_PATIENCE_FRAMES) {
        // Past this point the ball is not "probably about there". It is lost,
        // and every figure that depends on it stops rather than coasting on a
        // guess. A ball coasted for two seconds is under a player's foot at the
        // other end of the pitch.
        this.visible = false;
        this.vx = 0;
        this.vy = 0;
        this.speedMps = 0;
      } else if (dt > 0) {
        this.x = predicted.x;
        this.y = predicted.y;
      }
    }
    this.updatedMs = timeMs;
    return this.state(timeMs);
  }

  /**
   * The ball's current reportable state.
   *
   * @param {number} timeMs Current time.
   * @returns {{visible: boolean, x: number, y: number, speedMps: number,
   *   sinceSeenMs: number|null, seenShare: number}} State, including the share
   *   of frames in which the ball has been visible at all.
   */
  state(timeMs) {
    return {
      visible: this.visible && this.misses <= BALL_PATIENCE_FRAMES,
      x: this.x,
      y: this.y,
      speedMps: this.speedMps,
      sinceSeenMs: this.lastSeenMs === null ? null : timeMs - this.lastSeenMs,
      seenShare: this.totalFrames ? this.seenFrames / this.totalFrames : 0,
    };
  }
}

/**
 * The smallest ball this footage could possibly resolve, in pixels.
 *
 * Used by the interface to tell someone, before they wait for a result, that
 * their camera is too far away to see the ball at all — which is a better
 * answer than a possession bar built from eleven sightings.
 *
 * @param {number[]} imageToPitch Row-major 3x3 homography.
 * @param {number} u Image column to test.
 * @param {number} v Image row to test.
 * @returns {number} Diameter of a ball at that point, in pixels.
 */
export function ballPixelsAt(imageToPitch, u, v) {
  const { minM } = scaleAt(imageToPitch, u, v);
  return minM > 1e-9 ? BALL_DIAMETER_M / minM : 0;
}
