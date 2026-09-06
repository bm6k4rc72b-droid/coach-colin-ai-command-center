/**
 * Keeping one identity attached to one moving thing.
 *
 * Segmentation hands over a bag of blobs per frame with no memory. The tracker
 * is what turns those into "the same subject, still here, forty seconds in,
 * having covered 7.7 m" — and every hard part of it is a failure mode rather
 * than an algorithm:
 *
 * **Swapped identities.** Two people passing each other are, for a few frames,
 * one blob; when they separate, the naive nearest-neighbour assignment hands
 * each the other's history and both paths become fiction. So the cost of an
 * assignment is not distance alone: it includes how the blob's size changed and
 * how its brightness profile compares with the one this track has been carrying.
 * A track coasts on its velocity while merged and re-acquires on appearance.
 *
 * **Phantom distance.** A stationary subject's centroid jitters by a pixel or
 * two per frame from noise alone. Summed over a ten-minute watch that is tens of
 * metres of "walking" by someone who never moved, and it makes every distance
 * this app reports worthless. Distance is therefore only accumulated across
 * steps that clear a noise floor computed from the ground scale *at that track's
 * own image row* — a subject near the horizon has a far larger floor than one at
 * the camera's feet, because a pixel there is worth far more ground.
 *
 * **Flicker.** A blob that vanishes for two frames behind a post is not a new
 * subject. Tracks are born only after several consistent detections and die only
 * after a run of misses, coasting on their last velocity in between.
 *
 * The filter is alpha-beta rather than a full Kalman: with one sensor, constant
 * velocity and no covariance to propagate anywhere, a Kalman filter reduces to
 * exactly this pair of gains, and this version can be read.
 *
 * @module sentry/tracker
 */

import { groundPoint, scaleAtRow, standingHeight } from './ground.js';

/** Position gain of the alpha-beta filter. */
const ALPHA = 0.45;

/** Velocity gain. */
const BETA = 0.12;

/** Consecutive detections before a track is reported. */
export const BIRTH_FRAMES = 4;

/** Consecutive misses before a track is retired. */
export const DEATH_FRAMES = 12;

/** Ceiling on plausible subject speed, metres per second. Above it, no match. */
export const MAX_SPEED_MPS = 18;

/** Multiples of the local pixel scale a step must clear to count as travel. */
const TRAVEL_NOISE_PIXELS = 1.4;

/** Trailing window the reported speed is averaged over, milliseconds. */
const SPEED_WINDOW_MS = 1000;

/** Fractional area change above which a step is not treated as travel. */
const SIZE_STABILITY = 0.3;

/** Windowed speed samples a peak must hold across before it is believed. */
const PEAK_SAMPLES = 7;

/**
 * A brightness histogram used to tell two subjects apart.
 *
 * Eight bins of luminance is a deliberately weak descriptor. It is enough to
 * keep a person in a dark coat from inheriting the track of one in a white
 * shirt, and far too coarse to identify anybody — which is the intended
 * ceiling, not a limitation to be fixed later.
 *
 * @param {{data: Uint8ClampedArray}} frame RGBA pixels.
 * @param {number} width Frame width.
 * @param {import('./scene.js').Blob} blob Region to describe.
 * @returns {Float32Array} Normalized eight-bin histogram.
 */
export function appearance(frame, width, blob) {
  const bins = new Float32Array(8);
  let total = 0;
  for (let y = blob.minY; y <= blob.maxY; y += 1) {
    for (let x = blob.minX; x <= blob.maxX; x += 1) {
      const p = (y * width + x) * 4;
      const luma = 0.299 * frame.data[p] + 0.587 * frame.data[p + 1] + 0.114 * frame.data[p + 2];
      bins[Math.min(7, Math.floor(luma / 32))] += 1;
      total += 1;
    }
  }
  if (total) for (let i = 0; i < 8; i += 1) bins[i] /= total;
  return bins;
}

/**
 * Distance between two appearance histograms.
 *
 * @param {Float32Array} a First histogram.
 * @param {Float32Array} b Second histogram.
 * @returns {number} Total variation distance, 0 (identical) to 1 (disjoint).
 */
export function appearanceDistance(a, b) {
  if (!a || !b) return 0.5;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / 2;
}

/**
 * Multi-target tracker over successive frames of blobs.
 */
export class Tracker {
  /**
   * @param {object} [options] Tracker settings.
   * @param {import('./ground.js').Pose} [options.pose] Camera pose; without one
   *   the tracker still works but reports pixels rather than metres.
   * @param {number} [options.maxTracks=12] Simultaneous tracks kept.
   */
  constructor(options = {}) {
    this.pose = options.pose ?? null;
    this.maxTracks = options.maxTracks ?? 12;
    this.tracks = [];
    this.nextId = 1;
  }

  /** Replace the camera pose; existing tracks keep their pixel history. */
  setPose(pose) {
    this.pose = pose;
  }

  /**
   * Advance the tracker by one frame.
   *
   * @param {import('./scene.js').Blob[]} detections Blobs from this frame.
   * @param {number} timeMs Capture time of the frame, milliseconds.
   * @param {object} [context] Frame context.
   * @param {{data: Uint8ClampedArray}} [context.frame] Pixels, for appearance.
   * @param {number} [context.width] Frame width.
   * @returns {{live: object[], born: object[], retired: object[]}} Tracks that
   *   are currently reported, newly confirmed, and just retired.
   */
  update(detections, timeMs, context = {}) {
    const { frame = null, width = 0 } = context;
    for (const track of this.tracks) track.matched = false;

    const pairs = [];
    for (let d = 0; d < detections.length; d += 1) {
      for (let t = 0; t < this.tracks.length; t += 1) {
        const cost = this.#cost(this.tracks[t], detections[d], timeMs, frame, width);
        if (cost !== null) pairs.push({ d, t, cost });
      }
    }
    // Greedy assignment in cost order. With at most a dozen tracks the optimal
    // Hungarian assignment and this one differ only when two costs are within
    // noise of each other, where neither answer is defensible anyway.
    pairs.sort((a, b) => a.cost - b.cost);
    const takenD = new Set();
    const takenT = new Set();
    for (const pair of pairs) {
      if (takenD.has(pair.d) || takenT.has(pair.t)) continue;
      takenD.add(pair.d);
      takenT.add(pair.t);
      this.#absorb(this.tracks[pair.t], detections[pair.d], timeMs, frame, width);
    }

    const born = [];
    for (let d = 0; d < detections.length; d += 1) {
      if (takenD.has(d)) continue;
      if (this.tracks.length >= this.maxTracks) break;
      this.tracks.push(this.#spawn(detections[d], timeMs, frame, width));
    }

    const retired = [];
    for (const track of this.tracks) {
      if (track.matched) {
        track.misses = 0;
        track.hits += 1;
        if (!track.confirmed && track.hits >= BIRTH_FRAMES) {
          track.confirmed = true;
          born.push(track);
        }
      } else {
        track.misses += 1;
        // Coast: the last known velocity carries the estimate through the gap.
        const dt = (timeMs - track.lastSeenMs) / 1000;
        track.u += track.vu * dt;
        track.v += track.vv * dt;
        track.lastSeenMs = timeMs;
      }
    }
    this.tracks = this.tracks.filter((track) => {
      if (track.misses < DEATH_FRAMES) return true;
      if (track.confirmed) retired.push(track);
      return false;
    });

    return { live: this.tracks.filter((t) => t.confirmed), born, retired };
  }

  /**
   * Cost of assigning a detection to a track, or null when it is impossible.
   *
   * @param {object} track Existing track.
   * @param {import('./scene.js').Blob} blob Candidate detection.
   * @param {number} timeMs Frame time.
   * @param {{data: Uint8ClampedArray}|null} frame Pixels.
   * @param {number} width Frame width.
   * @returns {number|null} Cost, or null when gated out.
   */
  #cost(track, blob, timeMs, frame, width) {
    const dt = Math.max(0.001, (timeMs - track.lastSeenMs) / 1000);
    const predictedU = track.u + track.vu * dt;
    const predictedV = track.v + track.vv * dt;
    const gapPx = Math.hypot(blob.cx - predictedU, blob.cy - predictedV);

    // Gate on physics before anything else: a subject cannot cross the yard
    // between two frames, and no appearance similarity should let them.
    const scale = this.pose ? scaleAtRow(this.pose, blob.cy) : null;
    if (scale) {
      const speed = (gapPx * scale) / dt;
      if (speed > MAX_SPEED_MPS) return null;
    } else if (gapPx > Math.max(24, track.boxWidth)) {
      return null;
    }

    const sizeRatio =
      Math.min(blob.area, track.area) / Math.max(1, Math.max(blob.area, track.area));
    const look = frame ? appearanceDistance(track.appearance, appearance(frame, width, blob)) : 0;
    const reach = Math.max(8, track.boxWidth * 0.9);
    return gapPx / reach + (1 - sizeRatio) * 0.8 + look * 1.2;
  }

  /**
   * Create a provisional track from an unmatched detection.
   *
   * @param {import('./scene.js').Blob} blob Detection.
   * @param {number} timeMs Frame time.
   * @param {{data: Uint8ClampedArray}|null} frame Pixels.
   * @param {number} width Frame width.
   * @returns {object} New track.
   */
  #spawn(blob, timeMs, frame, width) {
    const ground = this.pose ? groundPoint(this.pose, blob.footU, blob.footV) : null;
    return {
      id: this.nextId++,
      u: blob.cx,
      v: blob.cy,
      vu: 0,
      vv: 0,
      footU: blob.footU,
      footV: blob.footV,
      area: blob.area,
      fill: blob.fill,
      boxWidth: blob.maxX - blob.minX + 1,
      boxHeight: blob.maxY - blob.minY + 1,
      appearance: frame ? appearance(frame, width, blob) : null,
      startMs: timeMs,
      lastSeenMs: timeMs,
      // Zero, not one: this frame's detection is counted by the caller's own
      // pass over the matched tracks, and starting at one would confirm every
      // track a frame early — which is a frame of noise promoted to a subject.
      hits: 0,
      misses: 0,
      matched: true,
      confirmed: false,
      ground,
      groundAnchor: ground,
      distanceM: 0,
      speedMps: 0,
      peakSpeedMps: 0,
      anchorMs: timeMs,
      travel: [{ t: timeMs, distanceM: 0 }],
      recentSpeeds: [],
      heightM: null,
      heightSamples: [],
      path: ground ? [{ t: timeMs, x: ground.x, y: ground.y, u: blob.cx, v: blob.cy }] : [
        { t: timeMs, x: null, y: null, u: blob.cx, v: blob.cy },
      ],
      bobs: [{ t: timeMs, value: blob.minY }],
      upperEnergy: [{ t: timeMs, value: blob.upperEnergy }],
      lastBlob: blob,
    };
  }

  /**
   * Fold a matched detection into a track.
   *
   * @param {object} track Track to update.
   * @param {import('./scene.js').Blob} blob Matched detection.
   * @param {number} timeMs Frame time.
   * @param {{data: Uint8ClampedArray}|null} frame Pixels.
   * @param {number} width Frame width.
   * @returns {void}
   */
  #absorb(track, blob, timeMs, frame, width) {
    const dt = Math.max(0.001, (timeMs - track.lastSeenMs) / 1000);
    const predictedU = track.u + track.vu * dt;
    const predictedV = track.v + track.vv * dt;
    const residualU = blob.cx - predictedU;
    const residualV = blob.cy - predictedV;
    track.u = predictedU + ALPHA * residualU;
    track.v = predictedV + ALPHA * residualV;
    track.vu += (BETA * residualU) / dt;
    track.vv += (BETA * residualV) / dt;

    track.area = track.area * 0.7 + blob.area * 0.3;
    track.fill = track.fill * 0.7 + blob.fill * 0.3;
    track.boxWidth = track.boxWidth * 0.7 + (blob.maxX - blob.minX + 1) * 0.3;
    track.boxHeight = track.boxHeight * 0.7 + (blob.maxY - blob.minY + 1) * 0.3;
    if (frame) {
      const seen = appearance(frame, width, blob);
      if (!track.appearance) track.appearance = seen;
      else for (let i = 0; i < seen.length; i += 1) track.appearance[i] = track.appearance[i] * 0.9 + seen[i] * 0.1;
    }

    // The foot point gets the same smoothing as the centroid. Distance is
    // measured from it rather than from the raw detection because the raw
    // bottom row of a blob rattles by a pixel or two per frame, and a jitter
    // perpendicular to the direction of travel adds in quadrature — it cannot
    // cancel, so summing raw steps inflates every distance by a tenth or more.
    track.footU += ALPHA * (blob.footU - track.footU) + track.vu * dt * (1 - ALPHA);
    track.footV += ALPHA * (blob.footV - track.footV) + track.vv * dt * (1 - ALPHA);
    const ground = this.pose ? groundPoint(this.pose, track.footU, track.footV) : null;
    if (ground && track.groundAnchor) {
      const step = Math.hypot(ground.x - track.groundAnchor.x, ground.y - track.groundAnchor.y);
      // The noise floor is the ground distance a few pixels cover *here*, which
      // grows with range: a subject near the horizon must move much further
      // before a step is believed. Below it, the anchor is left where it is, so
      // a stationary subject accumulates nothing at all.
      const scale = scaleAtRow(this.pose, track.footV) ?? 0;
      const floor = scale * TRAVEL_NOISE_PIXELS;
      // A silhouette that is changing size is not one whose foot position can
      // be trusted. It happens whenever a subject is half-occluded by a parked
      // car, and — more insidiously — as a subject who has stood still long
      // enough begins dissolving into the background: the blob erodes from the
      // bottom, the apparent ground contact climbs, and the projection reads
      // that as walking away. The anchor still follows, so nothing accumulates
      // when the silhouette settles again; only the travel is withheld.
      const settled =
        Math.abs(blob.area - track.area) / Math.max(1, Math.max(blob.area, track.area)) <
        SIZE_STABILITY;
      if (step > floor && settled) {
        track.distanceM += step;
        track.groundAnchor = ground;
        track.anchorMs = timeMs;
      } else if (step > floor) {
        track.groundAnchor = ground;
        track.anchorMs = timeMs;
      }
      track.travel.push({ t: timeMs, distanceM: track.distanceM });
      // Speed over a trailing second, not frame to frame. A per-frame rate
      // divides an anchor-to-anchor step by a single frame interval whenever
      // the deadband held the anchor back, which reports a walk as a run.
      while (track.travel.length > 2 && timeMs - track.travel[0].t > SPEED_WINDOW_MS) {
        track.travel.shift();
      }
      const oldest = track.travel[0];
      const seconds = (timeMs - oldest.t) / 1000;
      if (seconds >= 0.3) {
        const rate = (track.distanceM - oldest.distanceM) / seconds;
        if (rate < MAX_SPEED_MPS) {
          track.speedMps = rate;
          // The peak has to be *sustained*, not merely touched. An absolute
          // maximum over thousands of frames finds the single worst one — a
          // recovery from an occlusion, a lighting step that briefly moves the
          // silhouette — and reports a walker as having sprinted. Worse, that
          // number is what the classifier reads to decide something was a
          // vehicle. Taking the median of the last few windowed rates means a
          // peak has to hold for half a second before it counts.
          track.recentSpeeds.push(rate);
          if (track.recentSpeeds.length > PEAK_SAMPLES) track.recentSpeeds.shift();
          if (track.recentSpeeds.length === PEAK_SAMPLES) {
            const sorted = [...track.recentSpeeds].sort((a, b) => a - b);
            const sustained = sorted[Math.floor(PEAK_SAMPLES / 2)];
            if (sustained > track.peakSpeedMps) track.peakSpeedMps = sustained;
          }
        }
      }
    } else if (ground) {
      track.groundAnchor = ground;
      track.anchorMs = timeMs;
    }
    if (ground) track.ground = ground;

    if (this.pose) {
      const height = standingHeight(
        this.pose,
        { u: blob.footU, v: blob.footV },
        { u: blob.cx, v: blob.minY },
      );
      if (height !== null && height > 0.05 && height < 4) {
        track.heightSamples.push(height);
        if (track.heightSamples.length > 90) track.heightSamples.shift();
        const sorted = [...track.heightSamples].sort((a, b) => a - b);
        track.heightM = sorted[Math.floor(sorted.length / 2)];
      }
    }

    track.path.push({
      t: timeMs,
      x: ground ? ground.x : null,
      y: ground ? ground.y : null,
      u: track.u,
      v: track.v,
    });
    if (track.path.length > 3600) track.path.shift();
    // The top row of the blob, sampled per frame. A walking body's head rises
    // and falls once per step while the support foot stays planted, so the head
    // carries the gait rhythm and the foot carries the position — which is why
    // cadence is read from one and distance from the other.
    track.bobs.push({ t: timeMs, value: blob.minY });
    if (track.bobs.length > 600) track.bobs.shift();
    track.upperEnergy.push({ t: timeMs, value: blob.upperEnergy });
    if (track.upperEnergy.length > 600) track.upperEnergy.shift();

    track.lastSeenMs = timeMs;
    track.matched = true;
    track.lastBlob = blob;
  }
}

/**
 * Straight-line displacement between a path's ends.
 *
 * @param {Array<{x: number|null, y: number|null}>} path Ground path.
 * @returns {number} Metres, or 0 without ground coordinates.
 */
export function netDisplacement(path) {
  const points = path.filter((p) => p.x !== null);
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(last.x - first.x, last.y - first.y);
}
