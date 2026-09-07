/**
 * How tall somebody is right now, even when you cannot see their feet.
 *
 * This is the module the whole product turns on, so it is worth being plain
 * about the problem it solves.
 *
 * The obvious way to tell standing from lying is the shape of the silhouette:
 * a standing person is tall and thin, a fallen one is short and wide. It works
 * beautifully in a clear corridor and fails in every room anybody actually
 * lives in, because rooms contain furniture. A sofa, a bed, a coffee table, a
 * kitchen island — each of them cuts the bottom off the silhouette. The
 * bounding box shortens. Height-over-width collapses. The app announces that
 * somebody standing behind their own sofa has fallen over, and it does this
 * every single time they walk past it.
 *
 * The way out is an observation about furniture rather than about people:
 * **furniture is low.** A sofa hides shins. A bed hides a body up to the
 * shoulder. Almost nothing in a home hides a standing adult's head. So the
 * measurement this module takes is not the height of the silhouette — it is
 * the *row the head occupies*, referred to a floor position tracked separately
 * and held steady while the feet are hidden. Stature computed that way is
 * still correct behind the sofa, which is the entire difference between a
 * system for a laboratory corridor and one for a living room.
 *
 * Three consequences follow, and all three are visible in the interface rather
 * than buried:
 *
 * - The floor reference is **coasted, not guessed**, while the feet are
 *   occluded, and its age is reported. A stale reference is a weak
 *   measurement, and the app grades itself down instead of pretending.
 * - When the *head* is occluded too, stature is not reported at all. The state
 *   becomes `obscured` and downstream logic widens its confirmation window
 *   rather than filling in a number.
 * - The torso angle is only reported when the silhouette is elongated enough
 *   for a principal axis to mean something. A crouching person is a round
 *   blob, and the axis of a round blob is noise with a decimal point.
 *
 * Pure functions and one small stateful tracker. No DOM, no camera.
 *
 * @module aegis/posture
 */

import { Ring, clamp, ema, median, ramp } from './mathkit.js';

/** Elongation below which the principal axis is not reported. */
export const AXIS_MIN_ELONGATION = 1.28;

/** Rows of slack allowed before the lowest visible row counts as clipped. */
const CLIP_SLACK = 2;

/**
 * Lateral drift, as a fraction of standing height, that spends a coasted
 * floor reference.
 *
 * Staleness here is deliberately measured in *distance moved*, not in seconds.
 * The first version of this used an age in seconds and it was wrong in the
 * exact case the app is for: somebody lying motionless behind a sofa has a
 * floor reference thirty seconds old and perfectly valid, because nothing has
 * moved. Timing them out downgraded the system's confidence precisely as the
 * situation got more serious. What actually invalidates the reference is the
 * subject going somewhere else, and that is what is measured.
 */
export const FLOOR_DRIFT_LIMIT = 1.1;

/** A coasted reference is abandoned outright after this long without sight of a foot. */
export const FLOOR_COAST_SECONDS = 180;

/**
 * A single frame's reading of a body.
 *
 * @typedef {object} Posture
 * @property {boolean} present Whether a body was found at all.
 * @property {number} headRow Topmost body row, in pixels.
 * @property {number} footRow The floor row used, observed or coasted.
 * @property {number} centreCol Body centroid column, in pixels.
 * @property {number} stature Height now over height standing, 0–1.2.
 * @property {number|null} torsoDeg Degrees from vertical, or null when the
 *   silhouette is too round for an axis to be meaningful.
 * @property {number} elongation Major over minor axis length.
 * @property {number} aspect Bounding-box height over width.
 * @property {number} occlusion Fraction of the body below the lowest visible
 *   row, 0–1.
 * @property {boolean} imputed Whether the floor reference was coasted.
 * @property {boolean} headHidden Whether the head itself is behind something.
 * @property {number} confidence How much to believe this reading, 0–1.
 * @property {string} note Plain words for why confidence is what it is.
 */

/**
 * Principal axis and elongation of a region, from its second moments.
 *
 * @param {import('./silhouette.js').Region} region The region.
 * @returns {{torsoDeg: number|null, elongation: number}} The axis tilt from
 *   vertical in degrees, or null when the region is too round, and how
 *   elongated it is.
 */
export function principalAxis(region) {
  const { mxx, myy, mxy } = region;
  const trace = mxx + myy;
  const spread = Math.hypot(mxx - myy, 2 * mxy);
  const major = (trace + spread) / 2;
  const minor = (trace - spread) / 2;
  const elongation = minor > 1e-6 ? Math.sqrt(major / minor) : 1;
  if (elongation < AXIS_MIN_ELONGATION) return { torsoDeg: null, elongation };
  // Image coordinates run x right and y *down*, so an upright body has the
  // larger moment in y and the axis formula returns ±90°. Tilt from vertical
  // is therefore 90 minus the magnitude, which is 0 upright and 90 flat.
  const theta = 0.5 * Math.atan2(2 * mxy, mxx - myy);
  const degrees = (theta * 180) / Math.PI;
  return { torsoDeg: clamp(90 - Math.abs(degrees), 0, 90), elongation };
}

/**
 * Whether the lowest visible row of a region is cut off rather than a foot.
 *
 * Two things clip a body: a declared occluder, and the bottom edge of the
 * picture. Both are checked at the body's own column, because a sofa on the
 * left of the room says nothing about somebody standing on the right.
 *
 * @param {import('./silhouette.js').Region} region The region.
 * @param {{x: number, y: number, w: number, h: number}[]} occluders Rectangles
 *   in normalised frame coordinates.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {boolean} Whether the body's lowest row is a cut rather than a foot.
 */
export function bottomClipped(region, occluders, width, height) {
  if (region.maxY >= height - 1 - CLIP_SLACK) return true;
  const left = region.minX / width;
  const right = region.maxX / width;
  const bottom = region.maxY / height;
  for (const box of occluders || []) {
    // Overlapping in x, and the body's lowest row sits at or below the
    // occluder's top edge: the legs are behind it.
    const overlaps = right > box.x && left < box.x + box.w;
    if (!overlaps) continue;
    if (bottom >= box.y - CLIP_SLACK / height && bottom <= box.y + box.h) return true;
  }
  return false;
}

/** Visible fraction of a standing body below which nothing useful is left. */
export const BURIED_FRACTION = 0.14;

/**
 * Whether so little of the body is showing that stature cannot be read.
 *
 * An earlier version asked this geometrically — is the topmost row inside a
 * declared occluder? — and it was wrong in a way worth recording, because it
 * is the mistake anybody would make. Standing *in front of* a sofa puts your
 * head at the same image rows as the sofa. The test fired on somebody in plain
 * view and the app went blind exactly when it could see perfectly. Whether a
 * body is behind furniture is a fact about its *feet*, not its head, and the
 * only honest question about the head is the one asked here: is there enough
 * of this person above the obstruction to measure anything at all?
 *
 * @param {number} visibleExtent Rows of body actually visible.
 * @param {number} expectedExtent Rows a standing body would occupy.
 * @returns {boolean} Whether the body is effectively buried.
 */
export function buried(visibleExtent, expectedExtent) {
  if (!(expectedExtent > 4)) return false;
  return visibleExtent < expectedExtent * BURIED_FRACTION;
}

/**
 * Learns how tall a standing adult is at each part of the picture, then keeps
 * a floor reference alive while the feet are hidden.
 *
 * The scale model is a straight line — standing pixel height against floor
 * row. Perspective is not linear, but over the band of a room a camera can
 * usefully watch it is close enough that the residuals are smaller than the
 * frame-to-frame noise in the silhouette, and a line can be fitted from a
 * handful of samples where a homography needs a calibration ritual nobody
 * doing this for their mother is going to perform.
 */
export class FloorModel {
  constructor() {
    /** Samples of `[footRow, extentPx]` taken while clearly standing. */
    this.samples = new Ring(160);
    /** Fitted intercept and slope of extent against foot row. */
    this.intercept = 0;
    this.slope = 0;
    /** Last confidently observed floor row, and when. */
    this.footRow = null;
    this.footCol = null;
    this.footAtMs = 0;
    /** Smoothed standing extent, a fallback before the fit converges. */
    this.typicalExtent = NaN;
  }

  /** @returns {boolean} Whether enough has been seen to report a stature. */
  get ready() {
    return this.samples.length >= 12 || Number.isFinite(this.typicalExtent);
  }

  /**
   * Offer a frame in which the subject was unambiguously standing and whole.
   *
   * @param {number} footRow The observed lowest body row.
   * @param {number} extentPx The observed head-to-foot extent.
   * @param {number} centreCol The body's centroid column.
   * @param {number} timeMs Capture time.
   */
  observeStanding(footRow, extentPx, centreCol, timeMs) {
    this.samples.push([footRow, extentPx]);
    this.typicalExtent = ema(this.typicalExtent, extentPx, 1, 6);
    this.footRow = footRow;
    this.footCol = centreCol;
    this.footAtMs = timeMs;
    this.fit();
  }

  /**
   * Offer a frame in which the feet were visible but the pose was not standing.
   *
   * The floor reference is still valid — a person sitting on the floor has
   * their feet on the floor — so it is refreshed without teaching the scale
   * model, which would otherwise learn that adults are 40 pixels tall.
   *
   * @param {number} footRow The observed lowest body row.
   * @param {number} centreCol The body's centroid column.
   * @param {number} timeMs Capture time.
   */
  observeFloor(footRow, centreCol, timeMs) {
    this.footRow = footRow;
    this.footCol = centreCol;
    this.footAtMs = timeMs;
  }

  /**
   * Refit the line of standing height against floor row.
   *
   * The fit is to the **upper envelope** of the samples, not to their middle,
   * and that is the whole trick. Standing height is the *tallest* a person is;
   * every measurement error, every partial silhouette, every frame caught
   * mid-stoop makes them look shorter and none makes them look taller. A least
   * squares fit through the middle of that cloud therefore learns a height
   * somewhere between standing and crouching — and then a person genuinely
   * crouching measures as a stature of 0.7 instead of 0.5, and a slow collapse
   * reads as sitting down. It cost a whole scenario to find.
   *
   * So: fit, discard everything below the fit, fit again. Twice is enough to
   * ride the top of the cloud, and it is cheap enough to do on every sample.
   */
  fit() {
    const all = this.samples.toArray();
    if (all.length < 8) return;
    const extents = all.map(([, e]) => e);
    const mid = median(extents);
    // One frame where two bodies merged reports an extent nobody has. That is
    // trimmed at the top; the bottom is handled by the envelope itself.
    let kept = all.filter(([, e]) => e < mid * 1.9);
    if (kept.length < 6) return;
    let line = leastSquares(kept);
    for (let pass = 0; pass < 2; pass += 1) {
      const above = kept.filter(([row, extent]) => extent >= line.intercept + line.slope * row);
      if (above.length < 5) break;
      kept = above;
      line = leastSquares(kept);
    }
    this.slope = line.slope;
    this.intercept = line.intercept;
  }

  /**
   * Standing pixel height at a floor row.
   *
   * @param {number} footRow The floor row.
   * @returns {number} Expected head-to-foot extent in pixels.
   */
  extentAt(footRow) {
    if (this.samples.length >= 8) {
      const value = this.intercept + this.slope * footRow;
      if (Number.isFinite(value) && value > 4) return value;
    }
    return Number.isFinite(this.typicalExtent) ? this.typicalExtent : 0;
  }

  /**
   * The floor row to use for this frame.
   *
   * @param {number|null} observedRow The observed lowest row, or null when clipped.
   * @param {number} timeMs Capture time.
   * @param {number} centreCol Where the body is now, for the drift test.
   * @returns {{row: number|null, imputed: boolean, ageMs: number, drift: number}}
   *   The floor row, whether it was coasted, how old the reference is, and how
   *   far the subject has moved sideways since it was taken, in standing heights.
   */
  reference(observedRow, timeMs, centreCol = null) {
    if (observedRow != null) return { row: observedRow, imputed: false, ageMs: 0, drift: 0 };
    if (this.footRow == null) return { row: null, imputed: true, ageMs: Infinity, drift: Infinity };
    const ageMs = timeMs - this.footAtMs;
    if (ageMs > FLOOR_COAST_SECONDS * 1000) {
      return { row: null, imputed: true, ageMs, drift: Infinity };
    }
    const extent = Math.max(1, this.extentAt(this.footRow));
    const drift = centreCol == null || this.footCol == null
      ? 0
      : Math.abs(centreCol - this.footCol) / extent;
    return { row: this.footRow, imputed: true, ageMs, drift };
  }
}

/**
 * Ordinary least squares through `[x, y]` pairs.
 *
 * @param {number[][]} points The pairs.
 * @returns {{intercept: number, slope: number}} The line.
 */
function leastSquares(points) {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const n = points.length;
  const denominator = n * sxx - sx * sx;
  // A subject only ever seen at one distance gives a vertical line: keep the
  // flat model rather than dividing by nothing.
  if (Math.abs(denominator) < 1e-6) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denominator;
  return { slope, intercept: (sy - slope * sx) / n };
}

/**
 * Read one frame's posture.
 *
 * @param {import('./silhouette.js').Region|null} region The largest region, or
 *   null when nothing was found.
 * @param {object} context Frame context.
 * @param {number} context.width Frame width.
 * @param {number} context.height Frame height.
 * @param {number} context.timeMs Capture time.
 * @param {FloorModel} context.floor The floor model, updated in place.
 * @param {{x: number, y: number, w: number, h: number}[]} [context.occluders]
 *   Declared furniture, in normalised coordinates.
 * @returns {Posture} The reading.
 */
export function readPosture(region, context) {
  const { width, height, timeMs, floor, occluders = [] } = context;
  if (!region) {
    return {
      present: false,
      headRow: 0,
      footRow: 0,
      centreCol: 0,
      stature: NaN,
      torsoDeg: null,
      elongation: 1,
      aspect: 0,
      occlusion: 0,
      imputed: false,
      headHidden: false,
      confidence: 0,
      note: 'nobody in frame',
    };
  }

  const { torsoDeg, elongation } = principalAxis(region);
  const boxHeight = region.maxY - region.minY + 1;
  const boxWidth = region.maxX - region.minX + 1;
  const aspect = boxHeight / Math.max(1, boxWidth);
  const clipped = bottomClipped(region, occluders, width, height);
  const observedFoot = clipped ? null : region.maxY;

  // The scale model is consulted before it is taught, so that "does this frame
  // show somebody standing?" can be answered against what standing has looked
  // like so far rather than against the shape of the silhouette alone. That is
  // not circular: the model only ever rides the top of its own samples, so a
  // gate that admits frames near the current prediction can sharpen it and
  // cannot drag it down.
  const priorReference = floor.reference(observedFoot, timeMs, region.cx);
  const priorExpected = priorReference.row == null ? 0 : floor.extentAt(priorReference.row);
  const priorVisible = priorReference.row == null
    ? boxHeight
    : priorReference.row - region.minY + 1;
  const priorStature = priorExpected > 4 ? priorVisible / priorExpected : NaN;

  // A frame worth teaching from: whole body, plainly vertical, elongated
  // enough that the axis is real, and — once there is a model to check it
  // against — as tall as the model says standing is.
  const standing = observedFoot != null
    && torsoDeg != null
    && torsoDeg < 15
    && aspect > 1.9
    && (!floor.ready || !Number.isFinite(priorStature) || priorStature >= 0.86);
  if (standing) floor.observeStanding(observedFoot, boxHeight, region.cx, timeMs);
  else if (observedFoot != null) floor.observeFloor(observedFoot, region.cx, timeMs);

  const reference = floor.reference(observedFoot, timeMs, region.cx);
  const expected = reference.row == null ? 0 : floor.extentAt(reference.row);
  const visibleExtent = reference.row == null ? boxHeight : reference.row - region.minY + 1;
  const hidden = buried(visibleExtent, expected);
  const stature = expected > 4 && !hidden ? clamp(visibleExtent / expected, 0, 1.4) : NaN;
  const occlusion = reference.row == null || !reference.imputed
    ? 0
    : clamp((reference.row - region.maxY) / Math.max(1, expected), 0, 1);

  // Confidence is the product of everything that could be wrong with this
  // reading, and it is reported rather than used to silently discard frames.
  let confidence = 1;
  const reasons = [];
  if (!floor.ready) {
    confidence *= 0.25;
    reasons.push('still learning the room');
  }
  if (reference.imputed && reference.row != null) {
    confidence *= 1 - 0.55 * ramp(reference.drift, 0.2, FLOOR_DRIFT_LIMIT);
    reasons.push(reference.drift < 0.2
      ? 'floor reference coasted, subject has not moved'
      : `floor reference coasted, subject ${reference.drift.toFixed(2)} heights along`);
  } else if (reference.row == null) {
    confidence *= 0.2;
    reasons.push('no floor reference — the feet have never been seen');
  }
  if (hidden) {
    confidence *= 0.15;
    reasons.push('almost nothing of the body is showing above the furniture');
  }
  if (region.area < 120) {
    confidence *= 0.6;
    reasons.push('subject small in frame');
  }
  if (torsoDeg == null) reasons.push('shape too round for a torso angle');

  return {
    present: true,
    headRow: region.minY,
    footRow: reference.row ?? region.maxY,
    centreCol: region.cx,
    stature,
    torsoDeg,
    elongation,
    aspect,
    occlusion,
    imputed: reference.imputed,
    headHidden: hidden,
    confidence: clamp(confidence, 0, 1),
    note: reasons.length ? reasons.join('; ') : 'clear view',
  };
}
