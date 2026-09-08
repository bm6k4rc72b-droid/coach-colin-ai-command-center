/**
 * What a radio-frequency reconstruction produces: heat, then a stick figure.
 *
 * Two views of the same synthetic subjects. `blob` is the intermediate the
 * networks in the literature actually emit — per-joint confidence maps, which
 * look like coloured smudges and are the honest picture of what the radio
 * knows. `skeleton` is the keypoint fit drawn from those maps, which is what
 * gets screenshotted and posted, and which flatters the method considerably.
 *
 * Drawing both, side by side, is deliberate. A viewer shown only the skeleton
 * concludes that Wi-Fi sees people; a viewer shown the smudge it was fitted to
 * concludes something more accurate and more useful: that it resolves posture
 * and position, not identity, and that it does so from a model trained on
 * camera-labelled data in the room it was trained in.
 *
 * The walk cycle is synthetic and has no research content — it exists so the
 * frame moves.
 *
 * @module carrier/panels/pose
 */

import { roundRectPath } from '../chrome.js';
import { withAlpha } from '../theme.js';
import { fieldFooter, panelFrame } from './frame.js';

/** The 14 keypoints, in the order the classic pose papers list them. */
export const JOINTS = [
  'head', 'neck',
  'rShoulder', 'rElbow', 'rWrist',
  'lShoulder', 'lElbow', 'lWrist',
  'rHip', 'rKnee', 'rAnkle',
  'lHip', 'lKnee', 'lAnkle',
];

/** Bones, as pairs of keypoint names, with the limb colour each is drawn in. */
export const BONES = [
  ['head', 'neck', '#ff4d5e'],
  ['neck', 'rShoulder', '#ffb545'],
  ['rShoulder', 'rElbow', '#ffd23f'],
  ['rElbow', 'rWrist', '#8be04e'],
  ['neck', 'lShoulder', '#ffb545'],
  ['lShoulder', 'lElbow', '#ffd23f'],
  ['lElbow', 'lWrist', '#8be04e'],
  ['neck', 'rHip', '#3ff59a'],
  ['neck', 'lHip', '#3ff59a'],
  ['rHip', 'rKnee', '#45e0ff'],
  ['rKnee', 'rAnkle', '#5b8cff'],
  ['lHip', 'lKnee', '#45e0ff'],
  ['lKnee', 'lAnkle', '#5b8cff'],
];

/**
 * A walking figure's keypoints at a moment.
 *
 * Coordinates are body-relative: x is metres either side of the spine, y is
 * metres above the floor, so a caller scales by the height it wants to draw at
 * and never has to reason about pixels.
 *
 * @param {number} t Seconds.
 * @param {object} [options] Gait.
 * @param {number} [options.phase=0] Phase offset in radians, to desynchronise figures.
 * @param {number} [options.heightM=1.75] Standing height.
 * @param {number} [options.cadence=1.9] Steps per second.
 * @returns {Record<string, {x: number, y: number}>} Keypoints by name.
 */
export function walkPose(t, { phase = 0, heightM = 1.75, cadence = 1.9 } = {}) {
  const a = t * cadence * Math.PI + phase;
  const h = heightM;
  const swing = Math.sin(a);
  const counter = Math.sin(a + Math.PI);
  const bob = Math.abs(Math.cos(a)) * 0.02 * h;

  const hipY = 0.52 * h + bob;
  const neckY = 0.82 * h + bob;
  const shoulder = 0.1 * h;
  const hip = 0.06 * h;

  // Stride and swing are deliberately modest. An exaggerated gait reads as a
  // cartoon, and the frame is claiming that this is what a reconstruction looks
  // like.
  const leg = (side, drive) => {
    const knee = { x: side * hip + drive * 0.05 * h, y: hipY - 0.24 * h };
    const ankle = {
      x: side * hip + drive * 0.13 * h,
      y: Math.max(0, 0.05 * h - Math.min(0, drive) * 0.04 * h),
    };
    return { knee, ankle };
  };
  const arm = (side, drive) => ({
    elbow: { x: side * shoulder * 1.15 + drive * 0.05 * h, y: neckY - 0.17 * h },
    wrist: { x: side * shoulder * 1.25 + drive * 0.1 * h, y: neckY - 0.33 * h },
  });

  const right = leg(1, swing);
  const left = leg(-1, counter);
  const rArm = arm(1, counter);
  const lArm = arm(-1, swing);

  return {
    head: { x: 0, y: 0.94 * h + bob },
    neck: { x: 0, y: neckY },
    rShoulder: { x: shoulder, y: neckY },
    rElbow: rArm.elbow,
    rWrist: rArm.wrist,
    lShoulder: { x: -shoulder, y: neckY },
    lElbow: lArm.elbow,
    lWrist: lArm.wrist,
    rHip: { x: hip, y: hipY },
    rKnee: right.knee,
    rAnkle: right.ankle,
    lHip: { x: -hip, y: hipY },
    lKnee: left.knee,
    lAnkle: left.ankle,
  };
}

/**
 * Draw the reconstruction.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Panel box.
 * @param {object} params Panel parameters. `mode` is `blob`, `skeleton` or `both`.
 * @param {number} t Seconds since the scene started.
 * @param {object} context Render context.
 * @param {object} context.theme Palette.
 * @param {number} context.scale Canvas scale.
 * @returns {void}
 */
export function draw(ctx, box, params, t, { theme, scale }) {
  const mode = params.mode ?? 'both';
  const people = Math.max(1, Math.min(4, Number(params.people) || 2));
  const inner = panelFrame(ctx, box, theme, {
    status: params.status ?? (mode === 'blob' ? 'confidence maps' : 'keypoint fit'),
    statusTone: 'accent',
    legend: params.legend ?? `${people} subjects · ${JOINTS.length} keypoints`,
    source: params.source ?? '',
    scale,
  });

  const fields = mode === 'both'
    ? [
      { box: { ...inner, w: inner.w / 2 - 6 * scale }, mode: 'blob' },
      { box: { ...inner, x: inner.x + inner.w / 2 + 6 * scale, w: inner.w / 2 - 6 * scale }, mode: 'skeleton' },
    ]
    : [{ box: inner, mode }];

  for (const field of fields) drawField(ctx, field.box, field.mode, people, t, theme, scale, params);
}

/**
 * One view of the subjects.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Field box.
 * @param {string} mode `blob` or `skeleton`.
 * @param {number} people How many figures.
 * @param {number} t Seconds.
 * @param {object} theme Palette.
 * @param {number} scale Canvas scale.
 * @param {object} params Panel parameters.
 * @returns {void}
 */
function drawField(ctx, box, mode, people, t, theme, scale, params) {
  ctx.save();
  roundRectPath(ctx, box, 6 * scale);
  ctx.clip();
  ctx.fillStyle = '#02030a';
  ctx.fillRect(box.x, box.y, box.w, box.h);

  const floor = box.y + box.h - 40 * scale;
  const heightPx = box.h * 0.62;
  const perMetre = heightPx / 1.75;

  for (let i = 0; i < people; i += 1) {
    const lane = (i + 1) / (people + 1);
    const drift = Math.sin(t * 0.35 + i * 1.7) * box.w * 0.06;
    const originX = box.x + box.w * lane + drift;
    const pose = walkPose(t, { phase: i * 2.1, cadence: 1.7 + i * 0.15 });
    const point = (p) => ({ x: originX + p.x * perMetre, y: floor - p.y * perMetre });

    if (mode === 'blob') drawBlobs(ctx, pose, point, perMetre, scale);
    else drawSkeleton(ctx, pose, point, scale);
  }

  ctx.restore();
  ctx.strokeStyle = withAlpha(theme.accent, 0.4);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, box, 6 * scale);
  ctx.stroke();
  fieldFooter(
    ctx,
    box,
    mode === 'blob' ? 'joint confidence maps (network output)' : 'keypoint fit (what gets posted)',
    params.footerRight ?? (mode === 'blob' ? 'NO IDENTITY' : `${JOINTS.length} POINTS`),
    theme,
    scale,
  );
}

/**
 * The smudge view: one soft blob per keypoint, in its limb colour.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Record<string, {x: number, y: number}>} pose Keypoints.
 * @param {(p: {x: number, y: number}) => {x: number, y: number}} point Body-to-canvas mapping.
 * @param {number} perMetre Pixels per metre.
 * @param {number} scale Canvas scale.
 * @returns {void}
 */
function drawBlobs(ctx, pose, point, perMetre, scale) {
  const colours = new Map();
  for (const [a, b, colour] of BONES) {
    if (!colours.has(a)) colours.set(a, colour);
    colours.set(b, colour);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const name of JOINTS) {
    const p = point(pose[name]);
    const radius = perMetre * 0.17;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    const colour = colours.get(name) ?? '#45e0ff';
    grad.addColorStop(0, withAlpha(colour, 0.85));
    grad.addColorStop(0.45, withAlpha(colour, 0.32));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void scale;
}

/**
 * The stick-figure view.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Record<string, {x: number, y: number}>} pose Keypoints.
 * @param {(p: {x: number, y: number}) => {x: number, y: number}} point Body-to-canvas mapping.
 * @param {number} scale Canvas scale.
 * @returns {void}
 */
function drawSkeleton(ctx, pose, point, scale) {
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 4 * scale);
  for (const [a, b, colour] of BONES) {
    const p = point(pose[a]);
    const q = point(pose[b]);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  for (const name of JOINTS) {
    const p = point(pose[name]);
    ctx.fillStyle = withAlpha('#ffffff', 0.85);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, 3 * scale), 0, Math.PI * 2);
    ctx.fill();
  }
}
