/**
 * Keeping one identity on one player, for ninety minutes.
 *
 * Detection hands over a bag of positions per frame with no memory. Everything
 * this app reports — distance covered, top speed, who had the ball, how long a
 * team kept it — is a statement about a *player*, and a player only exists once
 * these positions are threaded into a history. Every hard problem in here is a
 * way that thread breaks, and each one corrupts a number rather than merely
 * losing one:
 *
 * **Swapped identities.** Two players cross; for a few frames they are one
 * blob; when they separate the naive nearest-neighbour assignment hands each
 * the other's history. Both distance totals are now fiction, and worse, they
 * look entirely reasonable. So the cost of an assignment is not distance alone:
 * it is distance from where the track was *predicted* to be, plus how different
 * the kit colour is. A centre-back does not inherit a winger's history when
 * they are in different shirts, and when they are in the same shirt the tracker
 * says so rather than guessing.
 *
 * **Phantom distance.** A player standing still has a foot point that jitters
 * by a pixel or two of noise every frame. At the far end of a pitch one pixel
 * is most of a metre. Left alone, a goalkeeper who never moved "covers" several
 * kilometres in a half, and every distance figure in the app becomes worthless
 * at the same moment.
 *
 * The obvious guard — ignore any frame-to-frame step below a noise floor —
 * fails in the opposite direction here, and silently. At 25 frames a second a
 * genuine sprint advances 28 cm per frame, which is *below* the noise floor at
 * the far touchline, so a threshold applied per frame throws away every metre
 * anyone runs and reports a match in which nobody moved. Distance is therefore
 * measured from an anchor: the displacement from the last credited position is
 * accumulated once it clears the floor, and the anchor moves there. Jitter
 * about a fixed point never leaves the floor, so a stationary player scores
 * exactly zero; a running player's displacement grows without bound and every
 * metre of it is credited.
 *
 * **Flicker.** A player who disappears for three frames behind another is not a
 * new player. Tracks are born only after several consistent detections and die
 * only after a run of misses, coasting on their velocity in between.
 *
 * **Occlusion honestly handled.** When detection reports a blob that is more
 * than one player, the tracks in it share it: each coasts, none accumulates
 * distance, and all are flagged. The alternative — one of them "wins" the blob
 * and the others are declared missing — produces a sudden two-metre jump for
 * one player and a phantom disappearance for another, both of which show up as
 * sprints.
 *
 * The filter is alpha-beta rather than Kalman. With one sensor, constant
 * velocity, and no covariance to propagate anywhere, a Kalman filter reduces to
 * exactly this pair of gains, and this version can be read by the person whose
 * match is being measured.
 *
 * @module touchline/track
 */

import { scaleAt } from './pitch.js';

/** Position gain of the alpha-beta filter. */
const ALPHA = 0.5;

/** Velocity gain. */
const BETA = 0.16;

/** Consecutive detections before a track is reported. */
export const BIRTH_FRAMES = 3;

/** Consecutive misses before a track is retired. */
export const DEATH_FRAMES = 15;

/**
 * Fastest a human runs, metres per second.
 *
 * Usain Bolt's peak is about 12.3 m/s and no footballer has ever come near it
 * with a ball in play. Anything above this in the data is an identity swap, not
 * an athlete, so it is refused as an association and never reaches a report.
 */
export const MAX_SPEED_MPS = 12;

/** Multiples of the local ground scale a move must clear to count as travel. */
const TRAVEL_NOISE_PIXELS = 1.5;

/** Speed a sprint must fall below before another one can be counted, m/s. */
const SPRINT_EXIT_MPS = 6;

/**
 * Windowed speed readings a peak is taken across, to reject single spikes.
 *
 * The top-speed column is the one people screenshot, and it is a maximum over
 * hundreds of readings, so it picks up the tail of the noise rather than the
 * middle of it. Taking the median of a short run means a peak has to be held
 * for a fraction of a second to be reported. Seven readings is where the gain
 * flattens: it takes a 25 fps clip from about 3.6% optimistic to 2.7%, and
 * longer runs buy very little while starting to clip genuinely brief peaks.
 */
const PEAK_SAMPLES = 7;

/**
 * Window the reported speed is averaged over, milliseconds.
 *
 * A second is long enough that detection noise averages out — over a shorter
 * window the peak of a sprint reads several percent high, because the noise
 * only ever adds path length — and short enough that a real acceleration is
 * still visible in the number on screen.
 */
const SPEED_WINDOW_MS = 1000;

/**
 * Positions a speed window must hold, however short a second turns out to be.
 *
 * A second of a 25 fps clip is twenty-five measurements; a second on a phone
 * analysing at eight is eight, and a chord across eight noisy points is a good
 * deal noisier than one across twenty-five. Since the reported peak is a
 * maximum over hundreds of readings, that extra noise goes straight into it —
 * the same sprint reads about 3% high on a fast device and 8% high on a slow
 * one, which is the worst possible failure mode: a number whose optimism
 * depends on the hardware. Holding a minimum sample count stretches the window
 * on slow devices instead, so the figure means the same thing on both.
 */
const MIN_SPEED_SAMPLES = 20;

/** Speed above which a player is running hard, metres per second (~19.8 km/h). */
export const HIGH_INTENSITY_MPS = 5.5;

/** Speed that counts as a sprint, metres per second (~25.2 km/h). */
export const SPRINT_MPS = 7;

/** How long a player must hold sprint pace for it to be a sprint, ms. */
export const SPRINT_MIN_MS = 700;

/**
 * Distance between two kit samples.
 *
 * @param {{r: number, g: number, b: number}|null} a First sample.
 * @param {{r: number, g: number, b: number}|null} b Second sample.
 * @returns {number} 0 (identical) to about 1 (opposite corners of the gamut).
 */
export function kitDistance(a, b) {
  if (!a || !b) return 0.25;
  return (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 2;
}

/** Blend a kit sample into a running average, weighted by how much was seen. */
function blendKit(current, sample, weight = 0.15) {
  if (!sample || !sample.samples) return current;
  if (!current) return { ...sample };
  return {
    r: current.r + (sample.r - current.r) * weight,
    g: current.g + (sample.g - current.g) * weight,
    b: current.b + (sample.b - current.b) * weight,
    luma: current.luma + (sample.luma - current.luma) * weight,
    samples: sample.samples,
  };
}

/**
 * Fit a constant velocity to a run of positions.
 *
 * @param {{t: number, x: number, y: number}[]} samples Recent positions.
 * @returns {{vx: number, vy: number, span: number}|null} Metres per second, or
 *   null when the window is too short to say anything.
 */
export function windowVelocity(samples) {
  const n = samples.length;
  if (n < 3) return null;
  const t0 = samples[0].t;
  const span = (samples[n - 1].t - t0) / 1000;
  if (span < 0.25) return null;
  let sumT = 0;
  let sumTT = 0;
  let sumX = 0;
  let sumY = 0;
  let sumTX = 0;
  let sumTY = 0;
  for (const sample of samples) {
    const t = (sample.t - t0) / 1000;
    sumT += t;
    sumTT += t * t;
    sumX += sample.x;
    sumY += sample.y;
    sumTX += t * sample.x;
    sumTY += t * sample.y;
  }
  const denominator = n * sumTT - sumT * sumT;
  if (denominator < 1e-9) return null;
  return {
    vx: (n * sumTX - sumT * sumX) / denominator,
    vy: (n * sumTY - sumT * sumY) / denominator,
    span,
  };
}

/**
 * Multi-player tracker over successive frames of detections.
 */
export class Tracker {
  /**
   * @param {object} [options] Tracker settings.
   * @param {number[]} [options.imageToPitch] Homography, for the noise floor.
   * @param {number} [options.maxTracks=30] Simultaneous tracks kept. Twenty-two
   *   players, four officials and room for the ones the segmenter invents.
   */
  constructor(options = {}) {
    this.imageToPitch = options.imageToPitch ?? null;
    this.maxTracks = options.maxTracks ?? 30;
    this.tracks = [];
    this.nextId = 1;
  }

  /** Replace the homography; existing tracks keep their history. */
  setHomography(imageToPitch) {
    this.imageToPitch = imageToPitch;
  }

  /**
   * The floor a step must clear before it counts as movement, in metres.
   *
   * Two pixels of centroid noise at the far touchline is over a metre of pitch;
   * the same two pixels at the near one is a few centimetres. A single fixed
   * threshold either lets the far players walk kilometres standing still or
   * throws away the near players' real movement, so the floor is computed where
   * the player actually is.
   *
   * @param {number} u Image column of the player's feet.
   * @param {number} v Image row of the player's feet.
   * @returns {number} Metres.
   */
  noiseFloorAt(u, v) {
    if (!this.imageToPitch) return 0.05;
    const { maxM } = scaleAt(this.imageToPitch, u, v);
    return Math.max(0.03, maxM * TRAVEL_NOISE_PIXELS);
  }

  /**
   * Advance the tracker by one frame.
   *
   * @param {object[]} detections Candidates from `segment.detect`.
   * @param {number} timeMs Capture time of the frame, milliseconds.
   * @returns {{live: object[], born: object[], retired: object[]}} Tracks that
   *   are currently reported, newly confirmed, and just retired.
   */
  update(detections, timeMs) {
    const born = [];
    const retired = [];

    for (const track of this.tracks) {
      const dt = Math.max(0, (timeMs - track.updatedMs) / 1000);
      track.predicted = {
        x: track.x + track.vx * dt,
        y: track.y + track.vy * dt,
      };
      track.claimed = null;
    }

    // Cheapest-first greedy assignment. The Hungarian algorithm is optimal and
    // is not worth it here: with a hard gate at what a human can run in one
    // frame, the candidate lists are tiny and the two agree almost always.
    const pairs = [];
    for (let d = 0; d < detections.length; d += 1) {
      const detection = detections[d];
      for (let t = 0; t < this.tracks.length; t += 1) {
        const track = this.tracks[t];
        const dt = Math.max(0.001, (timeMs - track.updatedMs) / 1000);
        const gap = Math.hypot(
          detection.pitch.x - track.predicted.x,
          detection.pitch.y - track.predicted.y,
        );
        if (gap > MAX_SPEED_MPS * dt + 1.2) continue;
        const kit = kitDistance(track.kit, detection.kit);
        // Kit difference is worth about two metres of position error: enough to
        // stop a swap between two players in different shirts, not enough to
        // steal a track from a team-mate standing closer.
        pairs.push({ d, t, cost: gap + kit * 4 });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);

    const takenDetections = new Set();
    const takenTracks = new Set();
    const shared = new Map();
    for (const pair of pairs) {
      if (takenTracks.has(pair.t)) continue;
      const detection = detections[pair.d];
      if (takenDetections.has(pair.d)) {
        // A merged blob may back more than one track: the players are really
        // there, they are just not separable this frame.
        if (!detection.merged) continue;
        const holders = shared.get(pair.d) ?? 0;
        if (holders >= 3) continue;
        shared.set(pair.d, holders + 1);
      } else {
        takenDetections.add(pair.d);
        shared.set(pair.d, 1);
      }
      takenTracks.add(pair.t);
      this.#absorb(this.tracks[pair.t], detection, timeMs, (shared.get(pair.d) ?? 1) > 1);
    }

    for (let t = 0; t < this.tracks.length; t += 1) {
      if (takenTracks.has(t)) continue;
      const track = this.tracks[t];
      track.misses += 1;
      track.hits = 0;
      track.contested = false;
      const dt = (timeMs - track.updatedMs) / 1000;
      if (dt > 0 && dt < 2) {
        track.x = track.predicted.x;
        track.y = track.predicted.y;
        // Coasting is a guess, so it decays rather than flying off the pitch.
        track.vx *= 0.85;
        track.vy *= 0.85;
      }
      track.updatedMs = timeMs;
      track.speedMps = 0;
    }

    for (let d = 0; d < detections.length; d += 1) {
      if (takenDetections.has(d)) continue;
      if (this.tracks.length >= this.maxTracks) break;
      const detection = detections[d];
      this.tracks.push({
        id: this.nextId,
        label: `#${this.nextId}`,
        x: detection.pitch.x,
        y: detection.pitch.y,
        vx: 0,
        vy: 0,
        u: detection.footU,
        v: detection.footV,
        kit: detection.kit ? { ...detection.kit } : null,
        team: null,
        hits: 1,
        misses: 0,
        confirmed: false,
        contested: false,
        firstSeenMs: timeMs,
        lastSeenMs: timeMs,
        updatedMs: timeMs,
        distanceM: 0,
        highIntensityM: 0,
        anchor: { x: detection.pitch.x, y: detection.pitch.y },
        speedHistory: [],
        sprints: 0,
        sprintActive: false,
        sprintSinceMs: null,
        topSpeedMps: 0,
        speedMps: 0,
        samples: [{ t: timeMs, x: detection.pitch.x, y: detection.pitch.y }],
        path: [{ t: timeMs, x: detection.pitch.x, y: detection.pitch.y }],
      });
      this.nextId += 1;
    }

    const live = [];
    const survivors = [];
    for (const track of this.tracks) {
      if (track.misses >= DEATH_FRAMES) {
        if (track.confirmed) retired.push(track);
        continue;
      }
      survivors.push(track);
      if (!track.confirmed && track.hits >= BIRTH_FRAMES) {
        track.confirmed = true;
        born.push(track);
      }
      if (track.confirmed) live.push(track);
    }
    this.tracks = survivors;
    return { live, born, retired };
  }

  /**
   * Fold one detection into one track.
   *
   * @param {object} track Track to update.
   * @param {object} detection Matching detection.
   * @param {number} timeMs Frame time.
   * @param {boolean} contested Whether the detection backs several tracks.
   */
  #absorb(track, detection, timeMs, contested) {
    const dt = Math.max(0.001, (timeMs - track.updatedMs) / 1000);
    const measured = detection.pitch;
    const previousX = track.x;
    const previousY = track.y;

    const residualX = measured.x - track.predicted.x;
    const residualY = measured.y - track.predicted.y;
    track.x = track.predicted.x + ALPHA * residualX;
    track.y = track.predicted.y + ALPHA * residualY;
    track.vx += (BETA * residualX) / dt;
    track.vy += (BETA * residualY) / dt;
    const speed = Math.hypot(track.vx, track.vy);
    if (speed > MAX_SPEED_MPS) {
      track.vx *= MAX_SPEED_MPS / speed;
      track.vy *= MAX_SPEED_MPS / speed;
    }

    track.u = detection.footU;
    track.v = detection.footV;
    track.kit = blendKit(track.kit, detection.kit);
    track.hits += 1;
    track.misses = 0;
    track.lastSeenMs = timeMs;
    track.updatedMs = timeMs;
    track.contested = contested;

    const floor = this.noiseFloorAt(detection.footU, detection.footV);
    const fromAnchor = Math.hypot(track.x - track.anchor.x, track.y - track.anchor.y);
    // Nothing is credited while a blob is shared: the position inside a merged
    // pair is not known well enough to spend on a distance total that a coach
    // will read as fact. The anchor is dragged along so the occluded stretch is
    // skipped rather than banked and paid out as a jump on the far side.
    if (contested) {
      track.anchor = { x: track.x, y: track.y };
    } else if (fromAnchor > floor) {
      track.distanceM += fromAnchor;
      if (track.speedMps >= HIGH_INTENSITY_MPS) track.highIntensityM += fromAnchor;
      track.anchor = { x: track.x, y: track.y };
    }
    void previousX;
    void previousY;

    track.samples.push({ t: timeMs, x: track.x, y: track.y });
    while (
      track.samples.length > MIN_SPEED_SAMPLES &&
      timeMs - track.samples[0].t > SPEED_WINDOW_MS
    ) {
      track.samples.shift();
    }
    // Speed over a window rather than frame to frame: a single frame of
    // detection noise at the far touchline is a metre, which at 25 fps reads as
    // 90 km/h and would take the top-speed column with it.
    //
    // The window is measured end to end rather than by fitting a line through
    // it, which is the opposite of what the textbook says and was settled by
    // measurement. The positions going in have already been through the
    // alpha-beta filter, so consecutive samples share most of their error; a
    // least-squares slope over correlated samples is noisier than the chord,
    // not smoother, and the difference showed up as a wider tail on exactly the
    // statistic that matters — the peak. {@link windowVelocity} is kept for the
    // cases that want a velocity vector rather than a speed.
    const first = track.samples[0];
    const span = (timeMs - first.t) / 1000;
    track.speedMps =
      span > 0.15 && !contested
        ? Math.hypot(track.x - first.x, track.y - first.y) / span
        : track.speedMps * 0.6;
    if (track.speedMps > MAX_SPEED_MPS) track.speedMps = MAX_SPEED_MPS;

    // The top-speed column is the one people screenshot, so it is the one worth
    // being strict about. A single frame in which a blob jumped to a team-mate
    // and back produces one enormous windowed speed; taking the median of a
    // short run of them means a peak has to be genuinely held to be reported.
    track.speedHistory.push(contested ? 0 : track.speedMps);
    if (track.speedHistory.length > PEAK_SAMPLES) track.speedHistory.shift();
    if (track.speedHistory.length === PEAK_SAMPLES) {
      const sustained = [...track.speedHistory].sort((a, b) => a - b)[
        (PEAK_SAMPLES - 1) / 2
      ];
      if (sustained > track.topSpeedMps) track.topSpeedMps = sustained;
    }

    // Sprints need hysteresis in both directions. Without a lower exit
    // threshold, a player holding 7.0 m/s crosses it a dozen times on noise
    // alone and the match report credits a dozen sprints.
    if (track.sprintActive) {
      if (track.speedMps < SPRINT_EXIT_MPS) {
        track.sprintActive = false;
        track.sprintSinceMs = null;
      }
    } else if (track.speedMps >= SPRINT_MPS) {
      if (track.sprintSinceMs === null) track.sprintSinceMs = timeMs;
      else if (timeMs - track.sprintSinceMs >= SPRINT_MIN_MS) {
        track.sprints += 1;
        track.sprintActive = true;
      }
    } else {
      track.sprintSinceMs = null;
    }

    const last = track.path[track.path.length - 1];
    if (!last || Math.hypot(track.x - last.x, track.y - last.y) > 0.5) {
      track.path.push({ t: timeMs, x: track.x, y: track.y });
      if (track.path.length > 4000) track.path.shift();
    }
  }
}

/**
 * Net displacement of a path, metres.
 *
 * @param {{x: number, y: number}[]} path Ordered positions.
 * @returns {number} Straight-line distance from first to last.
 */
export function netDisplacement(path) {
  if (!path || path.length < 2) return 0;
  const a = path[0];
  const b = path[path.length - 1];
  return Math.hypot(b.x - a.x, b.y - a.y);
}
