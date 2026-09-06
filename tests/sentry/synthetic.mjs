/**
 * Synthetic scenes with known answers.
 *
 * The point of these fixtures is that the truth is not a matter of opinion. A
 * subject is placed at an exact world position, at an exact height, and moved
 * at an exact speed, then projected into the image through the same camera
 * model the app calibrates. If the pipeline reports that they walked 7.7 m at
 * 0.97 m/s and the fixture walked them 8.0 m at 1.0 m/s, the error is a number
 * rather than an impression — and a regression that quietly inflates distances
 * by a third fails a test instead of shipping.
 *
 * The scenes carry sensor noise and a textured ground on purpose. A pipeline
 * tuned against noiseless fixtures learns thresholds that collapse on the first
 * real frame, and a flat grey background makes the segmenter look far better
 * than it is.
 *
 * @module tests/sentry/synthetic
 */

import { imagePoint, pose } from '../../public/sentry/js/ground.js';

/**
 * A deterministic pseudo-random source.
 *
 * Tests that use `Math.random` fail one run in fifty and get re-run until they
 * pass, which is the same as not having them.
 *
 * @param {number} seed Starting state.
 * @returns {() => number} Generator returning 0–1.
 */
export function random(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** The camera every fixture is shot through. */
export const FIXTURE_POSE = pose({
  heightM: 3.0,
  tiltDeg: 24,
  fovDeg: 70,
  width: 192,
  height: 144,
});

/**
 * An RGBA frame with a textured ground and a little sensor noise.
 *
 * @param {object} [options] Scene options.
 * @param {number} [options.width=192] Frame width.
 * @param {number} [options.height=144] Frame height.
 * @param {() => number} [options.rng] Noise source.
 * @param {number} [options.noise=3] Peak noise amplitude in levels.
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} Frame.
 */
export function backdrop({ width = 192, height = 144, rng = random(7), noise = 3 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      // A coarse checker plus a vertical gradient: enough structure that a
      // subject crossing it has to actually differ from what is behind them.
      const checker = ((x >> 4) + (y >> 4)) % 2 ? 8 : 0;
      const gradient = 42 + (y / height) * 26;
      const grain = (rng() - 0.5) * 2 * noise;
      data[p] = gradient + checker + grain;
      data[p + 1] = gradient + checker + 3 + grain;
      data[p + 2] = gradient + checker + 9 + grain;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * Paint an upright subject standing at a world position.
 *
 * The subject is drawn as a body block with a narrower head block, which is
 * enough for the geometry under test: a bounding box, a ground-contact row, and
 * a top row from which a height is recovered.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame Frame
 *   to draw into, modified in place.
 * @param {object} subject Subject description.
 * @param {number} subject.x Ground X, metres.
 * @param {number} subject.y Ground Y, metres.
 * @param {number} subject.heightM Standing height, metres.
 * @param {number} [subject.widthM=0.5] Shoulder width, metres.
 * @param {number} [subject.shade=190] Body brightness.
 * @param {number} [subject.bobM=0] Rise and fall of the head this frame, metres.
 *   The feet stay on the ground, because a real walker's do: the support foot
 *   is planted while the body's centre of mass rises over it. Bobbing the whole
 *   subject instead would lift the ground-contact point off the ground plane,
 *   and the projection would read that as the subject moving away from the
 *   camera — a stationary person who appears to pace.
 * @param {import('../../public/sentry/js/ground.js').Pose} [subject.camera]
 *   Camera to project through.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} The
 *   box drawn, or null when the subject is out of frame.
 */
export function paintSubject(frame, subject) {
  const {
    x,
    y,
    heightM,
    widthM = 0.5,
    shade = 190,
    bobM = 0,
    camera = FIXTURE_POSE,
  } = subject;
  const foot = imagePoint(camera, x, y, 0);
  const head = imagePoint(camera, x, y, heightM + bobM);
  const side = imagePoint(camera, x + widthM / 2, y, 0);
  if (!foot || !head || !side) return null;

  const halfWidth = Math.max(1.5, Math.abs(side.u - foot.u));
  const box = {
    minX: Math.max(0, Math.round(foot.u - halfWidth)),
    maxX: Math.min(frame.width - 1, Math.round(foot.u + halfWidth)),
    minY: Math.max(0, Math.round(head.v)),
    maxY: Math.min(frame.height - 1, Math.round(foot.v)),
  };
  if (box.maxX <= box.minX || box.maxY <= box.minY) return null;

  const boxHeight = box.maxY - box.minY;
  for (let py = box.minY; py <= box.maxY; py += 1) {
    // The top fifth is the head: narrower, and a different shade, so the
    // silhouette is not a plain rectangle.
    const isHead = py < box.minY + boxHeight * 0.2;
    const inset = isHead ? Math.round(halfWidth * 0.45) : 0;
    for (let px = box.minX + inset; px <= box.maxX - inset; px += 1) {
      const p = (py * frame.width + px) * 4;
      frame.data[p] = isHead ? shade * 0.92 : shade;
      frame.data[p + 1] = isHead ? shade * 0.72 : shade * 0.86;
      frame.data[p + 2] = isHead ? shade * 0.62 : shade * 0.78;
      frame.data[p + 3] = 255;
    }
  }
  return box;
}

/**
 * A subject walking a straight line at a constant speed.
 *
 * @param {object} [options] Walk description.
 * @param {number} [options.fps=15] Frames a second.
 * @param {number} [options.seconds=8] Duration.
 * @param {number} [options.speedMps=1] Ground speed.
 * @param {number} [options.heightM=1.75] Standing height.
 * @param {{x: number, y: number}} [options.from] Start position, metres.
 * @param {{x: number, y: number}} [options.to] Direction of travel; the walk
 *   runs along this bearing at `speedMps` regardless of the point's distance.
 * @param {number} [options.stepHz=1.8] Footfall rate, for the vertical bob.
 * @returns {{frames: Array<object>, truth: object}} Frames with capture times
 *   and the exact answer the pipeline should recover.
 */
export function walk(options = {}) {
  const {
    fps = 15,
    seconds = 8,
    speedMps = 1,
    heightM = 1.75,
    from = { x: -2.5, y: 6 },
    to = { x: 2.5, y: 6 },
    stepHz = 1.8,
    rng = random(99),
  } = options;
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const dir = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
  const frames = [];
  const count = Math.round(fps * seconds);
  let firstSeen = null;
  let lastSeen = null;
  for (let i = 0; i < count; i += 1) {
    const t = i / fps;
    const travelled = speedMps * t;
    const frame = backdrop({ rng, width: FIXTURE_POSE.width, height: FIXTURE_POSE.height });
    // Six centimetres of head travel per step is about right for a walk, and it
    // is the rhythm the cadence estimator is supposed to find.
    const bobM = 0.03 * Math.sin(2 * Math.PI * stepHz * t);
    const box = paintSubject(frame, {
      x: from.x + dir.x * travelled,
      y: from.y + dir.y * travelled,
      heightM,
      bobM,
    });
    // A subject clipped by the frame edge is one the tracker can only partly
    // measure, so the answer it is graded against must stop there too.
    const whole = box && box.minX > 0 && box.maxX < frame.width - 1 && box.minY > 0;
    if (whole) {
      if (firstSeen === null) firstSeen = travelled;
      lastSeen = travelled;
    }
    frames.push({ frame, timeMs: t * 1000 });
  }
  const visibleM = firstSeen === null ? 0 : lastSeen - firstSeen;
  return {
    frames,
    truth: {
      distanceM: visibleM,
      speedMps,
      heightM,
      stepsPerMin: stepHz * 60,
      fps,
    },
  };
}

/**
 * Frames of an empty scene, for letting a background model settle.
 *
 * @param {number} count How many.
 * @param {number} [fps=15] Frame rate, for the timestamps.
 * @param {() => number} [rng] Noise source.
 * @returns {Array<{frame: object, timeMs: number}>} Frames.
 */
export function idle(count, fps = 15, rng = random(4242)) {
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    frames.push({
      frame: backdrop({ rng, width: FIXTURE_POSE.width, height: FIXTURE_POSE.height }),
      timeMs: (i / fps) * 1000 - count * (1000 / fps),
    });
  }
  return frames;
}
