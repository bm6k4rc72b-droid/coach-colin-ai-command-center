/**
 * Finding skin in a frame, and measuring it.
 *
 * The scan needs one region per frame whose average colour it can trust: the
 * same patch of skin, frame after frame, with as little background in it as
 * possible. Background is not merely dilution — a wall behind a moving head
 * enters and leaves the region as the subject shifts, and its colour steps in
 * and out of the average at exactly the frequencies a pulse lives at.
 *
 * Where the platform ships a face detector (Chrome on Android and desktop, and
 * anything else exposing `FaceDetector`) it is used, because it is better than
 * anything reasonable to write here. Where it does not — Safari on iOS, most
 * notably — the fallback is a chrominance skin test and a centroid tracker,
 * which is enough given the app already asks the subject to hold their face in
 * a drawn oval.
 *
 * @module baseline/roi
 */

import { clamp } from './signal.js';

/**
 * Whether a pixel is plausibly skin.
 *
 * The test is in chrominance, deliberately: skin of every tone occupies a
 * narrow, well-documented band in Cb/Cr while spanning nearly the whole
 * luminance range, so a rule written in Cb/Cr generalizes across skin tones in
 * a way that any rule written in RGB does not.
 *
 * @param {number} r Red, 0–255.
 * @param {number} g Green, 0–255.
 * @param {number} b Blue, 0–255.
 * @returns {boolean} Whether the pixel looks like illuminated skin.
 */
export function isSkin(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 32 || y > 250) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 132 && cr >= 130 && cr <= 178 && cr >= 0.9 * cb;
}

/**
 * The oval the subject is asked to fill, in normalized coordinates.
 *
 * @returns {{x: number, y: number, w: number, h: number}} Guide rectangle,
 *   as fractions of frame width and height.
 */
export function guideRect() {
  return { x: 0.28, y: 0.16, w: 0.44, h: 0.56 };
}

/**
 * Measure one region of a frame.
 *
 * Only skin pixels contribute to the channel means, and the region is reported
 * as `found` only when enough of it is skin — a scan is better abandoned than
 * taken from a wall.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame Frame pixels.
 * @param {{x: number, y: number, w: number, h: number}} rect Normalized region.
 * @param {object} [options] Options.
 * @param {number} [options.minSkin=0.28] Skin fraction required to call it a face.
 * @returns {{found: boolean, r: number, g: number, b: number, luma: number,
 *   clipped: number, skin: number, centroid: {x: number, y: number}}} Measurement.
 */
export function measureRegion(frame, rect, options = {}) {
  const minSkin = options.minSkin ?? 0.28;
  const { data, width, height } = frame;
  const x0 = clamp(Math.round(rect.x * width), 0, width - 1);
  const y0 = clamp(Math.round(rect.y * height), 0, height - 1);
  const x1 = clamp(Math.round((rect.x + rect.w) * width), x0 + 1, width);
  const y1 = clamp(Math.round((rect.y + rect.h) * height), y0 + 1, height);

  let count = 0;
  let skin = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumaSum = 0;
  let clipped = 0;
  let cxSum = 0;
  let cySum = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = (y * width + x) * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      count += 1;
      if (!isSkin(r, g, b)) continue;
      skin += 1;
      rSum += r;
      gSum += g;
      bSum += b;
      lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
      // A channel pegged at the top of the range has lost the pulse entirely:
      // the variation that carries the signal is being clipped away.
      if (r >= 250 || g >= 250 || b >= 250) clipped += 1;
      cxSum += x;
      cySum += y;
    }
  }

  const fraction = count ? skin / count : 0;
  if (!skin || fraction < minSkin) {
    return { found: false, r: 0, g: 0, b: 0, luma: 0, clipped: 0, skin: fraction, centroid: null };
  }
  return {
    found: true,
    r: rSum / skin,
    g: gSum / skin,
    b: bSum / skin,
    luma: lumaSum / skin,
    clipped: clipped / skin,
    skin: fraction,
    centroid: { x: cxSum / skin / width, y: cySum / skin / height },
  };
}

/**
 * Mean absolute luminance change between two frames, inside a region.
 *
 * This is the motion estimate the quality gate runs on. It is computed on the
 * whole region rather than on skin pixels alone, because the thing worth
 * detecting is the region's contents *changing* — which is precisely a head
 * moving out of it.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame Current frame.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} previous Previous frame.
 * @param {{x: number, y: number, w: number, h: number}} rect Normalized region.
 * @returns {number} Mean absolute difference, normalized to 0–1.
 */
export function regionMotion(frame, previous, rect) {
  if (!previous || previous.width !== frame.width || previous.height !== frame.height) return 0;
  const { width, height } = frame;
  const x0 = clamp(Math.round(rect.x * width), 0, width - 1);
  const y0 = clamp(Math.round(rect.y * height), 0, height - 1);
  const x1 = clamp(Math.round((rect.x + rect.w) * width), x0 + 1, width);
  const y1 = clamp(Math.round((rect.y + rect.h) * height), y0 + 1, height);

  let total = 0;
  let count = 0;
  // Every second pixel in each direction: motion this coarse does not need
  // every sample, and the loop runs on every frame of a 60-second scan.
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const p = (y * width + x) * 4;
      const a = 0.299 * frame.data[p] + 0.587 * frame.data[p + 1] + 0.114 * frame.data[p + 2];
      const b = 0.299 * previous.data[p] + 0.587 * previous.data[p + 1] + 0.114 * previous.data[p + 2];
      total += Math.abs(a - b);
      count += 1;
    }
  }
  return count ? total / count / 255 : 0;
}

/** Tracks where the face is, with or without a platform face detector. */
export class FaceRegion {
  /**
   * @param {object} [options] Options.
   * @param {number} [options.smoothing=0.12] How fast the box may move, per frame.
   */
  constructor(options = {}) {
    this.rect = guideRect();
    this.smoothing = options.smoothing ?? 0.12;
    this.detector = null;
    this.detectorFailed = false;
    this.lastDetectAt = 0;
  }

  /** @returns {boolean} Whether the platform ships a face detector. */
  static hasPlatformDetector() {
    return typeof globalThis.FaceDetector === 'function';
  }

  /** Create the platform detector once, tolerating platforms that refuse. */
  ensureDetector() {
    if (this.detector || this.detectorFailed) return;
    if (!FaceRegion.hasPlatformDetector()) {
      this.detectorFailed = true;
      return;
    }
    try {
      this.detector = new globalThis.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      this.detectorFailed = true;
    }
  }

  /**
   * Ask the platform detector where the face is.
   *
   * Run sparingly — it is far more expensive than the rest of the loop, and a
   * face does not move much in a third of a second.
   *
   * @param {HTMLVideoElement|HTMLCanvasElement} source Frame source.
   * @param {number} now Current time in milliseconds.
   * @returns {Promise<boolean>} Whether the box was updated from a detection.
   */
  async detect(source, now) {
    this.ensureDetector();
    if (!this.detector || now - this.lastDetectAt < 300) return false;
    this.lastDetectAt = now;
    try {
      const faces = await this.detector.detect(source);
      if (!faces.length) return false;
      const box = faces[0].boundingBox;
      const width = source.videoWidth || source.width;
      const height = source.videoHeight || source.height;
      if (!width || !height) return false;
      // Forehead and upper cheeks: the strongest perfusion in the face and the
      // part least disturbed by talking, blinking and jaw movement.
      this.moveTo({
        x: (box.x + box.width * 0.2) / width,
        y: (box.y + box.height * 0.1) / height,
        w: (box.width * 0.6) / width,
        h: (box.height * 0.45) / height,
      });
      return true;
    } catch {
      this.detectorFailed = true;
      return false;
    }
  }

  /**
   * Nudge the region toward the skin centroid of the last measurement.
   *
   * @param {{centroid: {x: number, y: number}|null}} measurement Region measurement.
   */
  follow(measurement) {
    if (!measurement?.centroid) return;
    const centreX = this.rect.x + this.rect.w / 2;
    const centreY = this.rect.y + this.rect.h / 2;
    const dx = measurement.centroid.x - centreX;
    const dy = measurement.centroid.y - centreY;
    // Deliberately sluggish: chasing the centroid fast turns head movement into
    // a region that moves with it, which hides motion the quality gate should
    // have caught.
    this.moveTo({
      ...this.rect,
      x: this.rect.x + dx * this.smoothing,
      y: this.rect.y + dy * this.smoothing,
    });
  }

  /**
   * Move the region, keeping it inside the frame.
   *
   * @param {{x: number, y: number, w: number, h: number}} rect Requested region.
   */
  moveTo(rect) {
    const w = clamp(rect.w, 0.12, 0.8);
    const h = clamp(rect.h, 0.1, 0.8);
    this.rect = {
      w,
      h,
      x: clamp(rect.x, 0, 1 - w),
      y: clamp(rect.y, 0, 1 - h),
    };
  }

  /** Return the region to the drawn guide oval. */
  reset() {
    this.rect = guideRect();
  }
}
