/**
 * A room, a person, and eight things that can happen in it.
 *
 * You cannot demonstrate a fall detector by falling over, and you certainly
 * cannot demonstrate one by asking an eighty-year-old to. So the demonstration
 * is synthetic — but the important word is *demonstration*, not *simulation*.
 * Nothing here is faked at the level that matters: this module produces
 * ordinary RGBA frames, ordinary accelerometer samples and ordinary band
 * energies, and hands them to precisely the same segmentation, posture,
 * kinematics, inertial, acoustic and fusion code that a real camera and a real
 * phone feed. There is no demo branch inside the detector. If the detector is
 * wrong, the demonstration shows it being wrong, which is the only kind of
 * demonstration worth putting in front of anybody.
 *
 * The eight scenarios are chosen to be adversarial rather than flattering.
 * Four of them are things that look like falls and are not, and one of them —
 * the dropped phone — is specifically designed to fool the inertial channel
 * completely, so that the fusion stage can be seen refusing it. A demo that
 * only contains falls proves nothing except that a detector can say yes.
 *
 * The figure is a skeleton of capsules scaled by perspective and rotated about
 * its ground contact. It is not a person and does not need to be: what the
 * silhouette stage measures is extent, orientation and moments, and a capsule
 * skeleton has all three with the right proportions and the right dynamics.
 *
 * @module aegis/demo
 */

import { clamp, lerp } from './mathkit.js';

/** Frame size the pipeline works at. */
export const DEMO_WIDTH = 256;

/** Frame height. */
export const DEMO_HEIGHT = 192;

/** Frames per second the scenarios are authored at. */
export const DEMO_FPS = 15;

/** Standing height in pixels at the bottom of the frame. */
const NEAR_HEIGHT = 150;

/** Standing height in pixels at the horizon of the walkable floor. */
const FAR_HEIGHT = 74;

/** Row of the far edge of the floor. */
const FLOOR_TOP = 96;

/**
 * A deterministic value noise, so a scenario replays identically every time.
 *
 * A demo whose background model has to cope with a different noise field on
 * every run is a demo that occasionally behaves differently in front of an
 * audience.
 *
 * @param {number} x Column.
 * @param {number} y Row.
 * @param {number} t Frame index.
 * @returns {number} Noise, −1 to 1.
 */
function noise(x, y, t) {
  let h = (x * 374761393 + y * 668265263 + t * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (((h ^ (h >>> 16)) >>> 0) / 2147483648) - 1;
}

/**
 * Standing height in pixels for a body whose feet are on a given row.
 *
 * @param {number} footRow The row.
 * @returns {number} The height in pixels.
 */
export function standingHeightAt(footRow) {
  const t = clamp((footRow - FLOOR_TOP) / (DEMO_HEIGHT - FLOOR_TOP), 0, 1);
  return lerp(FAR_HEIGHT, NEAR_HEIGHT, t);
}

/** Furniture in the demo room, in normalised frame coordinates. */
/**
 * Furniture in the demo room, in normalised frame coordinates.
 *
 * Each is a *band* rather than a block reaching the bottom of the picture,
 * because that is what a piece of furniture actually is in an image: below its
 * lower edge you are standing in front of it, not behind it. Getting this
 * wrong is the difference between a sofa that hides the legs of anybody behind
 * it and a sofa that hides the legs of everybody in the room.
 */
export const DEMO_OCCLUDERS = Object.freeze([
  { x: 0.02, y: 0.580, w: 0.24, h: 0.280, label: 'sofa' },
  { x: 0.40, y: 0.718, w: 0.28, h: 0.104, label: 'coffee table' },
  { x: 0.76, y: 0.620, w: 0.23, h: 0.260, label: 'bed' },
]);

/** Where lying down is expected. */
export const DEMO_REST_ZONES = Object.freeze([
  { x: 0.72, y: 0.58, w: 0.28, h: 0.36 },
]);

/**
 * Paint the empty room into a frame buffer.
 *
 * @param {Uint8ClampedArray} data The RGBA buffer to paint into.
 * @param {number} frameIndex Which frame, for the noise field.
 */
function paintRoom(data, frameIndex) {
  const w = DEMO_WIDTH;
  const h = DEMO_HEIGHT;
  // A slow global light level, so the background model is doing real work
  // rather than tracking a mathematically perfect still.
  const breathe = 1 + 0.012 * Math.sin(frameIndex / 41);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r;
      let g;
      let b;
      if (y < FLOOR_TOP) {
        // Wall, with a corner shadow and a lit doorway at the far end.
        const wall = 64 + 14 * (1 - Math.abs(x - w * 0.5) / (w * 0.5));
        // A lit doorway at the far end, kept modest: a blown-out rectangle in
        // the middle of the wall pins the contrast stretch and darkens the
        // whole room around it.
        const door = x > 112 && x < 146 && y > 24 && y < FLOOR_TOP ? 16 : 0;
        const skirting = y > FLOOR_TOP - 5 ? -12 : 0;
        r = wall + door + skirting;
        g = wall + door * 0.96 + skirting;
        b = wall + door * 0.82 + skirting + 6;
      } else {
        // Floor, receding, with boards running away from the camera.
        const depth = (y - FLOOR_TOP) / (h - FLOOR_TOP);
        const base = lerp(46, 84, depth);
        const perspectiveX = (x - w / 2) / lerp(0.35, 1, depth) + w / 2;
        const board = Math.sin(perspectiveX * 0.42) > 0.9 ? -6 : 0;
        r = base + board + 8;
        g = base + board + 4;
        b = base + board;
      }
      // A rug, which the segmenter must learn is scenery.
      if (y > 162 && y < 190 && x > 66 && x < 196) { r -= 6; g -= 2; b += 12; }
      const n = noise(x, y, frameIndex) * 3.2;
      const i = (y * w + x) * 4;
      data[i] = clamp(r * breathe + n, 0, 255);
      data[i + 1] = clamp(g * breathe + n, 0, 255);
      data[i + 2] = clamp(b * breathe + n, 0, 255);
      data[i + 3] = 255;
    }
  }
}

/** How each piece of furniture is shaded. */
const FURNITURE = Object.freeze([
  { index: 0, face: 72, top: 100, lip: 5 },
  { index: 1, face: 88, top: 118, lip: 4 },
  { index: 2, face: 108, top: 136, lip: 4 },
]);

/**
 * The image row a piece of furniture's base sits on — its depth.
 *
 * @param {{y: number, h: number}} box The occluder.
 * @returns {number} The row.
 */
function baseRow(box) {
  return (box.y + box.h) * DEMO_HEIGHT;
}

/**
 * Paint some of the furniture.
 *
 * Drawing order here is depth, not convenience, and getting it wrong produced
 * one of the more educational bugs in this app: with the furniture always
 * painted last, a coffee table sliced the legs off anybody standing three feet
 * *in front of* it, the silhouette split in two, and the detector spent every
 * scenario reporting that it could not see. A piece of furniture hides a body
 * when its base is nearer the camera than the body's feet, and not otherwise —
 * which is the same rule the occlusion logic uses to decide whether a lowest
 * visible row is a foot or a cut, so the picture and the reasoning about the
 * picture cannot disagree.
 *
 * @param {Uint8ClampedArray} data The RGBA buffer.
 * @param {number} frameIndex Which frame, for the noise field.
 * @param {(box: {y: number, h: number}) => boolean} include Which pieces to paint.
 */
function paintFurniture(data, frameIndex, include) {
  const w = DEMO_WIDTH;
  const h = DEMO_HEIGHT;
  const pieces = FURNITURE
    .map((piece) => ({ ...piece, box: DEMO_OCCLUDERS[piece.index] }))
    .filter((piece) => include(piece.box));
  for (const { box, face, top: topShade, lip } of pieces) {
    const x0 = Math.round(box.x * w);
    const x1 = Math.round((box.x + box.w) * w);
    const y0 = Math.round(box.y * h);
    const y1 = Math.min(h, Math.round((box.y + box.h) * h));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const shade = y - y0 < lip ? topShade : face - (y - y0) * 0.12;
        const n = noise(x, y, frameIndex) * 2.4;
        const i = (y * w + x) * 4;
        data[i] = clamp(shade + n, 0, 255);
        data[i + 1] = clamp(shade * 0.97 + n, 0, 255);
        data[i + 2] = clamp(shade * 0.92 + n, 0, 255);
        data[i + 3] = 255;
      }
    }
  }
}

/**
 * Draw a thick line segment — a capsule — into the buffer.
 *
 * @param {Uint8ClampedArray} data The RGBA buffer.
 * @param {number} x0 Start column.
 * @param {number} y0 Start row.
 * @param {number} x1 End column.
 * @param {number} y1 End row.
 * @param {number} radius Half-thickness in pixels.
 * @param {number} shade Grey level, 0–255.
 */
function capsule(data, x0, y0, x1, y1, radius, shade) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius - 1));
  const maxX = Math.min(DEMO_WIDTH - 1, Math.ceil(Math.max(x0, x1) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius - 1));
  const maxY = Math.min(DEMO_HEIGHT - 1, Math.ceil(Math.max(y0, y1) + radius + 1));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = lengthSquared > 1e-6
        ? clamp(((x - x0) * dx + (y - y0) * dy) / lengthSquared, 0, 1)
        : 0;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      const distance = Math.hypot(x - px, y - py);
      if (distance > radius) continue;
      // A soft edge, because a hard-edged silhouette is easier to segment than
      // anything a real camera produces and would flatter the detector.
      const alpha = clamp(radius - distance, 0, 1);
      const i = (y * DEMO_WIDTH + x) * 4;
      data[i] = lerp(data[i], shade, alpha);
      data[i + 1] = lerp(data[i + 1], shade * 0.97, alpha);
      data[i + 2] = lerp(data[i + 2], shade * 0.92, alpha);
    }
  }
}

/**
 * The pose of the figure at one instant.
 *
 * @typedef {object} Pose
 * @property {number} footX Ground contact column, in pixels.
 * @property {number} footRow Ground contact row, in pixels.
 * @property {number} stature Height now over standing height, 0–1.
 * @property {number} tilt Degrees the body leans from vertical.
 * @property {number} phase Walk phase, radians.
 * @property {number} [fold] How much the body is folded at the hip, 0–1.
 */

/**
 * Draw the figure into the buffer.
 *
 * The skeleton is built upright in body coordinates, compressed by `stature`
 * about the feet, folded at the hip by `fold`, then rotated about the ground
 * contact by `tilt`. Doing it in that order is what makes a slump look like a
 * slump and a topple look like a topple: a slump loses height without rotating,
 * a topple rotates without losing much.
 *
 * @param {Uint8ClampedArray} data The RGBA buffer.
 * @param {Pose} pose The pose.
 */
function paintFigure(data, pose) {
  const full = standingHeightAt(pose.footRow);
  const height = full * clamp(pose.stature, 0.08, 1.2);
  const scale = full / 150;
  const fold = clamp(pose.fold ?? 0, 0, 1);
  const swing = Math.sin(pose.phase) * 0.16;

  // Body-space joints: y is 0 at the feet, 1 at the crown.
  const joints = {
    footL: [-0.06 + swing * 0.5, 0],
    footR: [0.06 - swing * 0.5, 0],
    kneeL: [-0.05 + swing * 0.3, 0.26],
    kneeR: [0.05 - swing * 0.3, 0.26],
    hip: [0, 0.52],
    chest: [0, 0.76],
    shoulder: [0, 0.83],
    head: [0, 0.94],
    handL: [-0.15 - swing * 0.6, 0.55],
    handR: [0.15 + swing * 0.6, 0.55],
  };

  // Folding pitches everything above the hip forward, which is what bending to
  // a shoelace actually is and what no aspect-ratio detector can tell from a
  // collapse.
  const foldRad = fold * 1.35;
  const project = ([bx, by]) => {
    let x = bx;
    let y = by;
    if (by > 0.52) {
      const arm = by - 0.52;
      x += Math.sin(foldRad) * arm;
      y = 0.52 + Math.cos(foldRad) * arm;
    }
    const tiltRad = (pose.tilt * Math.PI) / 180;
    const px = x * full;
    const py = y * height;
    const rx = px * Math.cos(tiltRad) - py * Math.sin(tiltRad);
    const ry = px * Math.sin(tiltRad) + py * Math.cos(tiltRad);
    return [pose.footX + rx, pose.footRow - ry];
  };

  const p = Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, project(v)]));
  const shade = 176;
  const limb = 4.4 * scale;
  const trunk = 7.6 * scale;
  capsule(data, p.footL[0], p.footL[1], p.kneeL[0], p.kneeL[1], limb, shade - 22);
  capsule(data, p.footR[0], p.footR[1], p.kneeR[0], p.kneeR[1], limb, shade - 22);
  capsule(data, p.kneeL[0], p.kneeL[1], p.hip[0], p.hip[1], limb * 1.15, shade - 14);
  capsule(data, p.kneeR[0], p.kneeR[1], p.hip[0], p.hip[1], limb * 1.15, shade - 14);
  capsule(data, p.hip[0], p.hip[1], p.chest[0], p.chest[1], trunk, shade);
  capsule(data, p.chest[0], p.chest[1], p.shoulder[0], p.shoulder[1], trunk * 0.9, shade);
  capsule(data, p.shoulder[0], p.shoulder[1], p.handL[0], p.handL[1], limb * 0.85, shade - 10);
  capsule(data, p.shoulder[0], p.shoulder[1], p.handR[0], p.handR[1], limb * 0.85, shade - 10);
  // The neck. Without it the head segments as its own region a few pixels
  // clear of the shoulders, and since the head row is the measurement this
  // whole product rests on, that 3-pixel gap is not cosmetic.
  capsule(data, p.shoulder[0], p.shoulder[1], p.head[0], p.head[1], 3.6 * scale, shade + 6);
  capsule(data, p.head[0], p.head[1], p.head[0], p.head[1], 6.4 * scale, shade + 26);
}

/**
 * Interpolate a pose from a scenario's keyframes.
 *
 * @param {object[]} keys Keyframes with a `t` in seconds.
 * @param {number} seconds The time to sample.
 * @returns {object|null} The interpolated keyframe, or null before the first.
 */
export function sampleKeys(keys, seconds) {
  if (!keys.length) return null;
  if (seconds <= keys[0].t) return { ...keys[0] };
  const last = keys[keys.length - 1];
  if (seconds >= last.t) return { ...last };
  for (let i = 1; i < keys.length; i += 1) {
    if (seconds > keys[i].t) continue;
    const a = keys[i - 1];
    const b = keys[i];
    const span = b.t - a.t;
    let u = span > 0 ? (seconds - a.t) / span : 1;
    // Falls are eased in — they accelerate — while deliberate movements are
    // eased at both ends. The `ease` flag on the later keyframe decides.
    if (b.ease === 'gravity') u *= u;
    else if (b.ease !== 'linear') u = u * u * (3 - 2 * u);
    const out = { t: seconds };
    for (const key of ['x', 'row', 'stature', 'tilt', 'fold', 'walk']) {
      if (a[key] == null && b[key] == null) continue;
      out[key] = lerp(a[key] ?? b[key] ?? 0, b[key] ?? a[key] ?? 0, u);
    }
    return out;
  }
  return { ...last };
}

/**
 * The scenarios, in the order a presenter should walk through them.
 *
 * Four negatives before the first positive, deliberately: the interesting
 * claim is not that a fall detector detects falls.
 */
export const SCENARIOS = Object.freeze([
  {
    id: 'walk',
    title: 'Walking through',
    kind: 'negative',
    expect: 'Nothing. Somebody crossed the room.',
    claim: 'The baseline. Everything below is measured against this.',
    seconds: 14,
    impactAt: null,
    keys: [
      { t: 0, x: 0.28, row: 184, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 12, x: 0.72, row: 176, stature: 1, tilt: 0, fold: 0, walk: 1 },
    ],
  },
  {
    id: 'sit',
    title: 'Sitting down heavily',
    kind: 'negative',
    expect: 'No alarm. Settled at seat height and stayed there.',
    claim: 'Fast is not the same as falling. This descent is quick — and it stops at a chair.',
    seconds: 20,
    impactAt: 6.4,
    impactHard: false,
    keys: [
      { t: 0, x: 0.62, row: 180, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 5.4, x: 0.48, row: 178, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 5.7, x: 0.48, row: 178, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 6.5, x: 0.48, row: 178, stature: 0.60, tilt: 0, fold: 0.30, walk: 0, ease: 'linear' },
      { t: 20, x: 0.48, row: 178, stature: 0.58, tilt: 0, fold: 0.30, walk: 0 },
    ],
  },
  {
    id: 'lace',
    title: 'Doing up a shoelace',
    kind: 'negative',
    expect: 'No alarm. Down for six seconds, then upright again.',
    claim: 'The case that defeats every posture-only detector. Aegis waits, and waiting answers it.',
    seconds: 20,
    impactAt: null,
    keys: [
      { t: 0, x: 0.32, row: 180, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 3.5, x: 0.46, row: 180, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 5.0, x: 0.46, row: 180, stature: 0.72, tilt: 0, fold: 0.95, walk: 0 },
      { t: 11.0, x: 0.46, row: 180, stature: 0.72, tilt: 0, fold: 0.95, walk: 0 },
      { t: 12.6, x: 0.46, row: 180, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 20, x: 0.66, row: 180, stature: 1, tilt: 0, fold: 0, walk: 1 },
    ],
  },
  {
    id: 'bed',
    title: 'Going to bed',
    kind: 'negative',
    expect: 'No alarm. Lying down inside a rest zone.',
    claim: 'Horizontal in the place you go to be horizontal is not an event.',
    seconds: 24,
    impactAt: null,
    keys: [
      { t: 0, x: 0.52, row: 182, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 6, x: 0.86, row: 152, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 7, x: 0.86, row: 152, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 10.5, x: 0.86, row: 152, stature: 0.56, tilt: 0, fold: 0.3, walk: 0 },
      { t: 14, x: 0.87, row: 152, stature: 0.26, tilt: 58, fold: 0.1, walk: 0 },
      { t: 24, x: 0.87, row: 152, stature: 0.25, tilt: 62, fold: 0.1, walk: 0 },
    ],
  },
  {
    id: 'drop',
    title: 'The phone is dropped',
    kind: 'negative',
    expect: 'No alarm. The carried phone screams; the camera sees somebody standing.',
    claim: 'Built to fool the accelerometer completely — free fall, impact, silence. There is no breathing in the silence, and nothing else agrees.',
    seconds: 18,
    impactAt: 6.0,
    impactHard: true,
    freefall: true,
    phoneDropped: true,
    keys: [
      { t: 0, x: 0.34, row: 180, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 5.4, x: 0.50, row: 180, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 18, x: 0.51, row: 180, stature: 1, tilt: 0, fold: 0, walk: 0 },
    ],
  },
  {
    id: 'fall',
    title: 'A fall in the open',
    kind: 'positive',
    expect: 'Alarm. All three channels agree.',
    claim: 'Fast descent, terminal impact, floor height, no recovery.',
    seconds: 26,
    impactAt: 7.1,
    impactHard: true,
    freefall: true,
    keys: [
      { t: 0, x: 0.30, row: 182, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 6.2, x: 0.54, row: 180, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 6.5, x: 0.55, row: 180, stature: 0.97, tilt: 8, fold: 0.1, walk: 0, ease: 'linear' },
      { t: 7.2, x: 0.56, row: 180, stature: 0.22, tilt: 72, fold: 0.2, walk: 0, ease: 'gravity' },
      { t: 9.5, x: 0.56, row: 180, stature: 0.19, tilt: 78, fold: 0.15, walk: 0 },
      { t: 26, x: 0.56, row: 180, stature: 0.18, tilt: 80, fold: 0.15, walk: 0 },
    ],
  },
  {
    id: 'occluded',
    title: 'A fall behind the coffee table',
    kind: 'positive',
    expect: 'Alarm, on a coasted floor reference. The feet are never visible.',
    claim: 'The reason this app exists. The bounding box is useless here; the head row is not.',
    seconds: 26,
    impactAt: 8.0,
    impactHard: true,
    freefall: true,
    keys: [
      { t: 0, x: 0.50, row: 186, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 5.5, x: 0.52, row: 150, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 7.2, x: 0.52, row: 150, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 8.0, x: 0.53, row: 150, stature: 0.24, tilt: 70, fold: 0.2, walk: 0, ease: 'gravity' },
      { t: 26, x: 0.53, row: 150, stature: 0.21, tilt: 76, fold: 0.2, walk: 0 },
    ],
  },
  {
    id: 'slump',
    title: 'A slow slide down a wall',
    kind: 'positive',
    expect: 'Alarm — but on the dwell, not on the speed.',
    claim: 'Not every fall is fast. A faint is slow, ends on the floor, and stays.',
    seconds: 30,
    impactAt: null,
    keys: [
      { t: 0, x: 0.40, row: 176, stature: 1, tilt: 0, fold: 0, walk: 1 },
      { t: 4.5, x: 0.30, row: 174, stature: 1, tilt: 0, fold: 0, walk: 0 },
      { t: 6.5, x: 0.30, row: 174, stature: 0.86, tilt: 4, fold: 0.1, walk: 0, ease: 'linear' },
      { t: 11.0, x: 0.30, row: 174, stature: 0.26, tilt: 20, fold: 0.5, walk: 0, ease: 'linear' },
      { t: 30, x: 0.30, row: 174, stature: 0.23, tilt: 24, fold: 0.5, walk: 0 },
    ],
  },
]);

/**
 * Look a scenario up by id.
 *
 * @param {string} id The id.
 * @returns {object} The scenario, defaulting to the first.
 */
export function scenario(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}

/**
 * A running scenario: frames, motion samples and band energies on demand.
 */
export class Scene {
  /**
   * @param {string} id Which scenario.
   * @param {object} [options] Options.
   * @param {number} [options.settleSeconds] Empty-room lead-in.
   */
  constructor(id, options = {}) {
    this.scenario = scenario(id);
    this.settleSeconds = options.settleSeconds ?? 3;
    this.width = DEMO_WIDTH;
    this.height = DEMO_HEIGHT;
    this.buffer = new Uint8ClampedArray(DEMO_WIDTH * DEMO_HEIGHT * 4);
    this.frameIndex = 0;
  }

  /** @returns {number} Total length of the scenario in seconds. */
  get seconds() {
    return this.settleSeconds + this.scenario.seconds;
  }

  /**
   * Render the frame at a moment.
   *
   * @param {number} seconds Time since the scenario began, including lead-in.
   * @returns {{width: number, height: number, data: Uint8ClampedArray, pose: Pose|null}}
   *   A frame the pipeline will accept, and the pose that produced it.
   */
  frameAt(seconds) {
    this.frameIndex = Math.round(seconds * DEMO_FPS);
    paintRoom(this.buffer, this.frameIndex);
    const local = seconds - this.settleSeconds;
    let pose = null;
    if (local >= 0) {
      const key = sampleKeys(this.scenario.keys, local);
      if (key && key.x * this.width > -30 && key.x * this.width < this.width + 30) {
        pose = {
          footX: key.x * this.width,
          footRow: key.row,
          stature: key.stature,
          tilt: key.tilt,
          fold: key.fold,
          phase: (key.walk ?? 0) > 0.1 ? local * 6.4 : 0,
        };
      }
    }
    // Painter's algorithm: everything further away than the subject, then the
    // subject, then everything nearer — which is what makes some furniture
    // scenery and some of it an occluder.
    const depth = pose ? pose.footRow : Infinity;
    paintFurniture(this.buffer, this.frameIndex, (box) => baseRow(box) < depth);
    if (pose) paintFigure(this.buffer, pose);
    paintFurniture(this.buffer, this.frameIndex, (box) => baseRow(box) >= depth);
    return { width: this.width, height: this.height, data: this.buffer, pose };
  }

  /**
   * Accelerometer samples for a carried phone, over a trailing window.
   *
   * The phone is modelled as riding on the trunk, so it sees the same descent
   * the camera does, plus the walking cadence, plus the impact — and, when the
   * body comes to rest, the small oscillation of breathing that separates a
   * person from an object.
   *
   * @param {number} seconds The present moment in the scenario.
   * @param {number} [windowSeconds] How much history to produce.
   * @returns {{t: number, ax: number, ay: number, az: number}[]} Samples, 50 Hz.
   */
  motionAt(seconds, windowSeconds = 10) {
    const out = [];
    const rate = 50;
    const start = Math.max(0, seconds - windowSeconds);
    const impact = this.scenario.impactAt == null
      ? null
      : this.scenario.impactAt + this.settleSeconds;
    for (let t = start; t <= seconds; t += 1 / rate) {
      const local = t - this.settleSeconds;
      const key = sampleKeys(this.scenario.keys, Math.max(0, local));
      const walking = (key?.walk ?? 0) > 0.1;
      const tilt = ((key?.tilt ?? 0) * Math.PI) / 180;
      const jitter = () => noise(Math.round(t * 997), 17, Math.round(t * 331)) * 0.06;

      // Gravity in device axes: the phone rides the trunk, so it rotates with it.
      let ax = Math.sin(tilt) * 9.80665;
      let ay = Math.cos(tilt) * 9.80665;
      let az = 0;

      if (walking) {
        ax += Math.sin(t * 12.8) * 0.9;
        ay += Math.sin(t * 6.4) * 1.6;
        az += Math.cos(t * 6.4) * 0.7;
      } else if (this.scenario.phoneDropped && impact != null && t > impact + 0.9) {
        // The handset has come to rest. Everything before this instant still
        // falls through to the impact model below, so the drop really does
        // produce the free fall and the spike it is meant to produce — an
        // earlier cut-off here skipped straight past them and quietly turned
        // the one scenario built to fool the accelerometer into a quiet one.
        // A phone on the floor: not merely still, but *dead* still. This is
        // the signal the fusion stage uses to refuse this scenario.
        ax = 0.4; ay = 9.72; az = 0.2;
        ax += jitter() * 0.02; ay += jitter() * 0.02; az += jitter() * 0.02;
        out.push({ t: t * 1000, ax, ay, az });
        continue;
      } else {
        // A resting body breathes: about fourteen a minute, a few thousandths
        // of a g, and it is the whole reason this channel can be trusted. The
        // modulation is applied to the whole vector rather than to one axis,
        // because a device riding a chest rocks with it — put the breath on a
        // fixed axis and it cancels out for any subject who happens to have
        // come to rest on their side, which is most of them.
        const breath = 1 + 0.0055 * Math.sin(t * 2 * Math.PI * 0.23);
        ax *= breath;
        ay *= breath;
        az *= breath;
      }

      if (impact != null) {
        const dt = t - impact;
        if (dt >= 0 && dt < 0.9) {
          // The unloading before contact, then the spike. Only a body that is
          // actually falling unloads the sensor: somebody lowering themselves
          // into a chair is on their legs the whole way down, and modelling a
          // dip there would hand the inertial channel the strongest evidence
          // of a fall in the whole scenario for something that is not one.
          if (dt < 0.34) {
            if (this.scenario.freefall) {
              const unload = 1 - Math.exp(-dt * 5);
              ay *= 1 - 0.62 * unload;
              ax *= 1 - 0.62 * unload;
            }
          } else if (dt < 0.44) {
            const peak = this.scenario.impactHard ? 34 : 18;
            const shape = Math.exp(-((dt - 0.38) ** 2) / 0.0007);
            ay += peak * shape;
            ax += peak * 0.4 * shape;
            az += peak * 0.3 * shape;
          }
        }
      }

      ax += jitter();
      ay += jitter();
      az += jitter();
      out.push({ t: t * 1000, ax, ay, az });
    }
    return out;
  }

  /**
   * Band energies for the room's sound over a trailing window.
   *
   * @param {number} seconds The present moment in the scenario.
   * @param {number} [windowSeconds] How much history to produce.
   * @returns {{t: number, low: number, mid: number, high: number, total: number, centroidHz: number}[]}
   *   Readings at 30 Hz.
   */
  audioAt(seconds, windowSeconds = 3) {
    const out = [];
    const rate = 30;
    const start = Math.max(0, seconds - windowSeconds);
    const impact = this.scenario.impactAt == null
      ? null
      : this.scenario.impactAt + this.settleSeconds;
    for (let t = start; t <= seconds; t += 1 / rate) {
      const floorTone = 0.0009 * (1 + 0.3 * noise(Math.round(t * 613), 5, 3));
      let low = floorTone;
      let mid = floorTone * 0.6;
      let high = floorTone * 0.3;
      let centroid = 900;
      if (impact != null) {
        const dt = t - impact;
        if (dt >= 0 && dt < 1.2) {
          const envelope = Math.exp(-dt * 11);
          if (this.scenario.phoneDropped) {
            // Small, hard, bright: a handset on a floor.
            low += 0.06 * envelope;
            mid += 0.10 * envelope;
            high += 0.14 * envelope;
            centroid = 2600;
          } else if (this.scenario.freefall) {
            // Large, soft, low: a body on a hard floor.
            low += 0.55 * envelope;
            mid += 0.10 * envelope;
            high += 0.03 * envelope;
            centroid = 420;
          } else {
            // A body landing on upholstery. Same shape, a fraction of the
            // energy — which is why the detector measures contrast against
            // the room rather than level.
            low += 0.045 * envelope;
            mid += 0.014 * envelope;
            high += 0.005 * envelope;
            centroid = 480;
          }
        }
      }
      out.push({ t: t * 1000, low, mid, high, total: low + mid + high, centroidHz: centroid });
    }
    return out;
  }
}
