/**
 * Fingertip tracking, on the CPU, from the same frames the viewfinder shows.
 *
 * The problem this solves is physical, not technical: on a job walk one hand
 * holds the phone and the other is holding a flashlight, a tape, or a door.
 * Nobody has a spare thumb to tap "capture", and tapping the screen nudges the
 * phone at exactly the moment its orientation is being read. So the app
 * watches for a finger in the frame instead, and a one-second dwell on a
 * corner takes the shot. Nothing is touched, so nothing moves.
 *
 * The pipeline is deliberately classical — no model, no weights, no network:
 *
 *   1. Downscale to a small YCbCr grid.
 *   2. Mark pixels whose chroma sits in the skin locus. Skin is remarkably
 *      well behaved in Cb/Cr across every skin tone; it is *luma* that varies,
 *      which is why the test is chroma-only with a wide luma gate.
 *   3. Mark pixels that moved since the last frame.
 *   4. Keep what is both skin-coloured and either moving or adjacent to
 *      movement, so a wooden door in the background does not become a hand.
 *   5. Label the blobs, keep the biggest plausible one, and find the point
 *      furthest from where it enters the frame — the fingertip.
 *
 * Where this fails is written into the UI: gloves in a colour outside the
 * skin locus are invisible to it, and a hand held perfectly still eventually
 * fades from the motion mask. Hence the touch controls remain in place; the
 * finger is the fast path, never the only one.
 *
 * @module housewright/hand
 */

import { clamp } from './mathkit.js';

/** Analysis grid width. Anything finer costs milliseconds and buys nothing. */
export const COLS = 48;

/** Analysis grid height. */
export const ROWS = 64;

/**
 * Reduce an RGBA frame to luma and chroma planes on the analysis grid.
 *
 * @param {Uint8ClampedArray} rgba Source pixels, `w * h * 4`.
 * @param {number} w Source width.
 * @param {number} h Source height.
 * @param {object} out Destination planes.
 * @param {Float32Array} out.luma Luminance 0–1.
 * @param {Float32Array} out.cb Blue-difference chroma, −0.5 to 0.5.
 * @param {Float32Array} out.cr Red-difference chroma, −0.5 to 0.5.
 * @param {number} [cols=COLS] Grid width.
 * @param {number} [rows=ROWS] Grid height.
 * @returns {object} The `out` planes, filled.
 */
export function sampleFrame(rgba, w, h, out, cols = COLS, rows = ROWS) {
  const cellW = w / cols;
  const cellH = h / rows;
  for (let r = 0; r < rows; r += 1) {
    const y0 = Math.floor(r * cellH);
    const y1 = Math.max(Math.floor((r + 1) * cellH), y0 + 1);
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor(c * cellW);
      const x1 = Math.max(Math.floor((c + 1) * cellW), x0 + 1);
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 2) {
        const row = y * w;
        for (let x = x0; x < x1; x += 2) {
          const i = (row + x) * 4;
          sr += rgba[i];
          sg += rgba[i + 1];
          sb += rgba[i + 2];
          n += 1;
        }
      }
      const i = r * cols + c;
      if (!n) {
        out.luma[i] = 0;
        out.cb[i] = 0;
        out.cr[i] = 0;
        continue;
      }
      const red = sr / n / 255;
      const green = sg / n / 255;
      const blue = sb / n / 255;
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;
      out.luma[i] = luma;
      out.cb[i] = (blue - luma) * 0.564;
      out.cr[i] = (red - luma) * 0.713;
    }
  }
  return out;
}

/**
 * Allocate the planes and masks for one grid size.
 *
 * @param {number} [cols=COLS] Grid width.
 * @param {number} [rows=ROWS] Grid height.
 * @returns {object} Reusable buffers.
 */
export function createBuffers(cols = COLS, rows = ROWS) {
  const n = cols * rows;
  return {
    cols,
    rows,
    luma: new Float32Array(n),
    cb: new Float32Array(n),
    cr: new Float32Array(n),
    previous: new Float32Array(n),
    hasPrevious: false,
    mask: new Uint8Array(n),
    moving: new Uint8Array(n),
    label: new Int32Array(n),
    stack: new Int32Array(n),
    gate: { active: false, cx: 0, cy: 0 },
  };
}

/**
 * Whether a chroma pair sits inside the skin locus.
 *
 * The bounds are the well-worn Cb/Cr rectangle, rescaled to the −0.5..0.5
 * convention used here. It is a coarse test and it is meant to be: a
 * fingertip only has to beat the wall behind it, not pass a dermatology exam.
 *
 * @param {number} cb Blue-difference chroma.
 * @param {number} cr Red-difference chroma.
 * @param {number} luma Luminance 0–1.
 * @returns {boolean} True when the pixel could be skin.
 */
export function isSkin(cb, cr, luma) {
  if (luma < 0.12 || luma > 0.96) return false;
  const cbLow = (77 - 128) / 255;
  const cbHigh = (129 - 128) / 255;
  const crLow = (133 - 128) / 255;
  const crHigh = (177 - 128) / 255;
  if (cb < cbLow || cb > cbHigh) return false;
  if (cr < crLow || cr > crHigh) return false;
  // Skin is always redder than it is blue; this drops orange-brown timber and
  // terracotta tile, which otherwise clear the rectangle on their own.
  return cr > cb + 0.02;
}

/**
 * Build the skin mask and the motion plane for this frame.
 *
 * Motion and skin play different roles, and conflating them was the first
 * thing that broke here. Skin colour alone will happily track a pine door or a
 * terracotta floor, both of which sit squarely inside the skin locus; motion
 * is what tells a hand from the room behind it.
 *
 * The subtlety is *where* that test is applied. Requiring every cell to be
 * moving fails twice over: a dwelling finger stops moving at exactly the
 * moment the gesture needs it, and a finger reaching in slowly only registers
 * motion at its leading and trailing edges, so the mask keeps a rim and throws
 * away the hand. So motion is not a per-cell filter at all. This function
 * emits both planes, and the blob step decides — a *component* qualifies if it
 * contains motion anywhere, or if it lies inside the lock the tracker already
 * holds. A hand keeps its identity whether it is moving, holding still, or
 * creeping forward; a static wall never acquires one.
 *
 * @param {object} buffers From `createBuffers`, with the planes filled.
 * @param {object} [options] Tuning.
 * @param {number} [options.motionThreshold=0.035] Luma change counting as movement.
 * @returns {{mask: Uint8Array, moved: number, skinCells: number}}
 *   The skin mask, the number of moving cells, and the number of skin cells.
 */
export function candidateMask(buffers, options = {}) {
  const { motionThreshold = 0.035 } = options;
  const { cols, rows, luma, cb, cr, previous, mask, moving } = buffers;
  const n = cols * rows;
  let moved = 0;
  let skinCells = 0;
  for (let i = 0; i < n; i += 1) {
    const skin = isSkin(cb[i], cr[i], luma[i]);
    if (skin) skinCells += 1;
    mask[i] = skin ? 1 : 0;
    // The very first frame has nothing to difference against. Calling it all
    // motion lets a hand already in shot be acquired immediately, and costs
    // nothing, because the area limits still reject a covered lens.
    const delta = buffers.hasPrevious ? Math.abs(luma[i] - previous[i]) : 1;
    const isMoving = delta >= motionThreshold ? 1 : 0;
    moving[i] = isMoving;
    moved += isMoving;
  }
  previous.set(luma);
  buffers.hasPrevious = true;
  return { mask, moved, skinCells };
}

/**
 * Largest connected component of the mask.
 *
 * @param {Uint8Array} mask One byte per cell, non-zero where set.
 * @param {number} cols Grid width.
 * @param {number} rows Grid height.
 * @param {object} scratch Scratch buffers.
 * @param {Int32Array} scratch.label Component ids.
 * @param {Int32Array} scratch.stack Flood-fill stack.
 * @param {Uint8Array} [weights] Optional per-cell weights; each blob reports
 *   their sum, which is how a component's motion content is measured.
 * @returns {{area: number, cx: number, cy: number, minX: number, maxX: number,
 *   minY: number, maxY: number, id: number, weight: number, edges: object}|null}
 *   The blob in grid coordinates, with which frame edges it touches, or
 *   `null` when the mask is empty.
 */
export function largestBlob(mask, cols, rows, scratch, weights = null) {
  const { label, stack } = scratch;
  label.fill(0);
  let best = null;
  let id = 0;
  for (let start = 0; start < cols * rows; start += 1) {
    if (!mask[start] || label[start]) continue;
    id += 1;
    let top = 0;
    stack[top] = start;
    top += 1;
    label[start] = id;
    let area = 0;
    let weight = 0;
    let sx = 0;
    let sy = 0;
    let minX = cols;
    let maxX = -1;
    let minY = rows;
    let maxY = -1;
    while (top > 0) {
      top -= 1;
      const i = stack[top];
      const y = (i / cols) | 0;
      const x = i - y * cols;
      area += 1;
      if (weights) weight += weights[i];
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = id; stack[top] = i - 1; top += 1; }
      if (x < cols - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = id; stack[top] = i + 1; top += 1; }
      if (y > 0 && mask[i - cols] && !label[i - cols]) { label[i - cols] = id; stack[top] = i - cols; top += 1; }
      if (y < rows - 1 && mask[i + cols] && !label[i + cols]) { label[i + cols] = id; stack[top] = i + cols; top += 1; }
    }
    if (!best || area > best.area) {
      best = {
        id,
        area,
        weight,
        cx: sx / area,
        cy: sy / area,
        minX,
        maxX,
        minY,
        maxY,
        edges: {
          left: minX === 0,
          right: maxX === cols - 1,
          top: minY === 0,
          bottom: maxY === rows - 1,
        },
      };
    }
  }
  return best;
}

/**
 * The fingertip of a blob: its furthest point from where the arm enters frame.
 *
 * A hand reaching into the frame is anchored at whichever border it crosses.
 * The point of the blob furthest from that anchor is the fingertip, which is
 * both true of pointing hands and cheap to compute. With no border crossed —
 * a hand fully inside the frame — the centroid stands in for the anchor and
 * the answer degrades to "the most extended part", which is still the finger.
 *
 * @param {object} blob From `largestBlob`.
 * @param {Int32Array} label Component ids from the same call.
 * @param {number} cols Grid width.
 * @param {number} rows Grid height.
 * @returns {{x: number, y: number, reach: number}} Fingertip in normalised
 *   coordinates (0–1, y down) and its distance from the anchor in cells.
 */
export function fingertip(blob, label, cols, rows) {
  let ax = blob.cx;
  let ay = blob.cy;
  const { edges } = blob;
  // Anchor on the crossed border, at the midpoint of the crossing.
  if (edges.bottom) { ay = rows - 1; ax = blob.cx; }
  else if (edges.left) { ax = 0; ay = blob.cy; }
  else if (edges.right) { ax = cols - 1; ay = blob.cy; }
  else if (edges.top) { ay = 0; ax = blob.cx; }

  let bestD = -1;
  let bx = blob.cx;
  let by = blob.cy;
  for (let y = blob.minY; y <= blob.maxY; y += 1) {
    for (let x = blob.minX; x <= blob.maxX; x += 1) {
      if (label[y * cols + x] !== blob.id) continue;
      const d = (x - ax) ** 2 + (y - ay) ** 2;
      if (d > bestD) { bestD = d; bx = x; by = y; }
    }
  }
  return { x: (bx + 0.5) / cols, y: (by + 0.5) / rows, reach: Math.sqrt(Math.max(bestD, 0)) };
}

/**
 * A fresh gesture tracker.
 *
 * @returns {object} Opaque state for `trackHand`.
 */
export function createHand() {
  return {
    phase: 'absent',
    x: 0.5,
    y: 0.5,
    smoothX: 0.5,
    smoothY: 0.5,
    speed: 0,
    hold: 0,
    idle: 0,
    armed: true,
    area: 0,
  };
}

/**
 * Advance the gesture state machine by one frame.
 *
 * The dwell rule is the whole interaction: a finger that arrives, settles, and
 * stays put for `holdSeconds` fires exactly one `commit`, and cannot fire
 * another until it has moved away and come back. Anything else — a hand
 * crossing the frame, an arm reaching past the lens — moves the cursor and
 * commits nothing.
 *
 * @param {object} state Tracker state, mutated in place.
 * @param {{present: boolean, x: number, y: number, area: number}} sample
 *   This frame's observation. `area` is the blob's share of the grid.
 * @param {number} dt Seconds since the previous frame.
 * @param {object} [options] Tuning.
 * @param {number} [options.minArea=0.012] Blob share needed to be a hand.
 * @param {number} [options.maxArea=0.55] Above this the lens is covered, not pointed at.
 * @param {number} [options.steady=0.06] Travel per second under which the finger counts as still.
 * @param {number} [options.holdSeconds=1] Dwell needed to commit.
 * @param {number} [options.smoothing=0.45] Cursor follow rate, 0–1 per frame.
 * @returns {{phase: string, x: number, y: number, hold: number, commit: boolean,
 *   present: boolean, speed: number}} The cursor and whether this frame commits.
 */
export function trackHand(state, sample, dt, options = {}) {
  const {
    minArea = 0.012,
    maxArea = 0.55,
    steady = 0.06,
    holdSeconds = 1,
    smoothing = 0.45,
  } = options;
  const step = clamp(dt, 0, 0.25);

  const usable = sample.present && sample.area >= minArea && sample.area <= maxArea;
  if (!usable) {
    state.idle += step;
    state.hold = 0;
    if (state.idle > 0.35) {
      state.phase = 'absent';
      state.speed = 0;
      // Leaving the frame re-arms the commit: one dwell, one point.
      state.armed = true;
    }
    return { phase: state.phase, x: state.smoothX, y: state.smoothY, hold: 0, commit: false, present: false, speed: 0 };
  }

  state.idle = 0;
  state.area = sample.area;
  if (state.phase === 'absent') {
    state.phase = 'acquiring';
    state.x = sample.x;
    state.y = sample.y;
    state.smoothX = sample.x;
    state.smoothY = sample.y;
    state.speed = 0;
    state.hold = 0;
    return { phase: state.phase, x: state.smoothX, y: state.smoothY, hold: 0, commit: false, present: true, speed: 0 };
  }

  const travel = Math.hypot(sample.x - state.x, sample.y - state.y);
  state.speed = step > 0 ? travel / step : 0;
  state.x = sample.x;
  state.y = sample.y;
  state.smoothX += (sample.x - state.smoothX) * smoothing;
  state.smoothY += (sample.y - state.smoothY) * smoothing;

  let commit = false;
  if (state.speed <= steady) {
    state.hold += step;
    state.phase = 'holding';
    if (state.hold >= holdSeconds && state.armed) {
      commit = true;
      state.armed = false;
      state.phase = 'committed';
    }
  } else {
    state.hold = 0;
    state.phase = 'tracking';
    // Moving off the point re-arms without needing to leave the frame, so a
    // survey is four dwells in a row rather than four hands.
    if (state.speed > steady * 3) state.armed = true;
  }

  return {
    phase: state.phase,
    x: state.smoothX,
    y: state.smoothY,
    hold: clamp(state.hold / holdSeconds, 0, 1),
    commit,
    present: true,
    speed: state.speed,
  };
}

/**
 * Run one camera frame all the way to a cursor.
 *
 * @param {object} buffers From `createBuffers`.
 * @param {object} state From `createHand`.
 * @param {Uint8ClampedArray} rgba Frame pixels.
 * @param {number} w Frame width.
 * @param {number} h Frame height.
 * @param {number} dt Seconds since the previous frame.
 * @param {object} [options] Passed through to `trackHand`.
 * @returns {object} The `trackHand` result, plus `area` and `reach`.
 */
export function readFrame(buffers, state, rgba, w, h, dt, options = {}) {
  const {
    minArea = 0.012,
    maxArea = 0.55,
    minMotionCells = 3,
    gateRadius = 12,
  } = options;
  sampleFrame(rgba, w, h, buffers, buffers.cols, buffers.rows);
  candidateMask(buffers, options);
  const blob = largestBlob(buffers.mask, buffers.cols, buffers.rows, buffers, buffers.moving);
  const cells = buffers.cols * buffers.rows;
  const gate = buffers.gate;

  // A component is a hand if it is moving, or if it is the one already being
  // tracked. Neither test alone is enough: motion loses a held finger, and
  // position alone would let the lock drift onto the wall behind it.
  const near = blob && gate.active
    && Math.hypot(blob.cx - gate.cx, blob.cy - gate.cy) <= gateRadius;
  const area = blob ? blob.area / cells : 0;
  const plausible = Boolean(blob) && area >= minArea && area <= maxArea;
  const accepted = plausible && (blob.weight >= minMotionCells || near);

  if (!accepted) {
    gate.active = false;
    return { ...trackHand(state, { present: false, x: 0, y: 0, area: 0 }, dt, options), area, reach: 0 };
  }

  gate.active = true;
  gate.cx = blob.cx;
  gate.cy = blob.cy;
  const tip = fingertip(blob, buffers.label, buffers.cols, buffers.rows);
  const result = trackHand(state, { present: true, x: tip.x, y: tip.y, area }, dt, options);
  return { ...result, area, reach: tip.reach };
}
