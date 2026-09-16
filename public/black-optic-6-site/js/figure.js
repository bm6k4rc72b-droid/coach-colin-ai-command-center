/**
 * Drawing the operator.
 *
 * `operator.js` decides where every joint is. This file decides what a joint
 * looks like, and it does the whole figure in strokes and fills on a 2D canvas
 * — no sprites, no image assets, nothing traced from anybody's character.
 *
 * The design brief was the silhouette from the reference: long storm coat, hard
 * shoulder and shin plates, a full visor with one horizontal light bar. Drawn
 * from a rig rather than a still, which buys three things a cutout cannot have:
 *
 * - **The coat moves.** Its hem is a curve whose control points lag the pelvis
 *   by a fixed number of frames' worth of stride, so it swings behind him and
 *   settles when he stops.
 * - **He is lit by the scene, not baked.** Rim strength comes from how close he
 *   is to the practical lights in the backdrop, so walking into frame genuinely
 *   brightens him.
 * - **Distance costs contrast.** Atmospheric haze is applied as a lift toward
 *   the fog colour rather than a fade to transparent — far objects get flatter
 *   and bluer, they do not get see-through, and that single difference is most
 *   of why a composite reads as real.
 *
 * @module black-optic-6-site/figure
 */

import { rig } from './operator.js';

/** The palette he is drawn in. Ice on near-black, one warm accent. */
export const INK = Object.freeze({
  body: '#05080d',
  coat: '#080d15',
  plate: '#111c28',
  edge: 'rgba(150, 200, 225, 0.55)',
  rim: 'rgba(120, 220, 255, 0.95)',
  visor: '#4fe8ff',
  warm: '#ffb23d',
  fog: '#0b1420',
});

function mix(hex, toHex, amount) {
  const parse = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(toHex);
  const t = Math.min(Math.max(amount, 0), 1);
  const channel = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`;
}

/** Stroke a chain of points as a limb of a given width. */
function limb(ctx, points, width, colour) {
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

/**
 * Draw the operator into a canvas context.
 *
 * `state` is whatever `operatorAt()` returned. Coordinates are in device
 * pixels; the figure is drawn with its feet at `state.footY` and its height at
 * `state.heightPx`, centred on `centreX`.
 */
export function drawOperator(ctx, state, { centreX, scale = 1, lean = 0.02 } = {}) {
  const height = state.heightPx;
  if (!(height > 2)) return;

  const skeleton = rig(state.pose, { lean });
  const foot = state.footY;
  const bob = state.pose.bob * height;

  // Unit rig space (feet 0, crown 1) → screen.
  const px = (point) => ({ x: centreX + point.x * height, y: foot - point.y * height + bob });

  const haze = state.haze;
  const bodyColour = mix(INK.body, INK.fog, haze * 0.85);
  const coatColour = mix(INK.coat, INK.fog, haze * 0.8);
  const plateColour = mix(INK.plate, INK.fog, haze * 0.75);
  const edgeAlpha = (1 - haze) * 0.75;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // ------------------------------------------------------------- contact
  // A shadow under the feet. Without it he floats, and nothing else you do
  // afterwards will fix that.
  const heelL = px(skeleton.legL.ankle);
  const heelR = px(skeleton.legR.ankle);
  const shadowY = foot + bob;
  const shadowW = height * 0.26;
  const shadow = ctx.createRadialGradient(centreX, shadowY, 0, centreX, shadowY, shadowW);
  shadow.addColorStop(0, `rgba(0, 0, 0, ${0.5 * (1 - haze * 0.6)})`);
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(centreX, shadowY, shadowW, shadowW * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  const stroke = Math.max(height * 0.028, 0.6) * scale;

  // ------------------------------------------------------------ far limbs
  limb(ctx, [px(skeleton.legR.hip), px(skeleton.legR.knee), px(skeleton.legR.ankle), px(skeleton.legR.toe)], stroke * 1.15, mix(bodyColour, INK.fog, 0.25));
  limb(ctx, [px(skeleton.armR.shoulder), px(skeleton.armR.elbow), px(skeleton.armR.hand)], stroke * 0.85, mix(bodyColour, INK.fog, 0.25));

  // --------------------------------------------------------------- torso
  // Drawn as a tapered polygon rather than a capsule. A constant-width stroke
  // from hip to neck gives a figure the same girth at the waist as at the
  // shoulders, which is the difference between a person and a bollard.
  const hipP = px(skeleton.pelvis);
  const neckP = px(skeleton.neck);
  const shoulderHalf = height * 0.105;
  const waistHalf = height * 0.062;

  ctx.fillStyle = bodyColour;
  ctx.beginPath();
  ctx.moveTo(neckP.x - shoulderHalf, neckP.y);
  ctx.lineTo(neckP.x + shoulderHalf, neckP.y);
  ctx.quadraticCurveTo(hipP.x + waistHalf * 1.25, (neckP.y + hipP.y) / 2, hipP.x + waistHalf, hipP.y);
  ctx.lineTo(hipP.x - waistHalf, hipP.y);
  ctx.quadraticCurveTo(hipP.x - waistHalf * 1.25, (neckP.y + hipP.y) / 2, neckP.x - shoulderHalf, neckP.y);
  ctx.closePath();
  ctx.fill();

  // Chest rig: two horizontal straps, the only geometry on the front.
  if (height > 90) {
    ctx.strokeStyle = `rgba(120, 170, 205, ${edgeAlpha * 0.5})`;
    ctx.lineWidth = Math.max(height * 0.006, 0.5);
    for (const t of [0.66, 0.73]) {
      const y = foot - height * t + bob;
      ctx.beginPath();
      ctx.moveTo(hipP.x - height * 0.052, y);
      ctx.lineTo(hipP.x + height * 0.052, y);
      ctx.stroke();
    }
  }

  // ----------------------------------------------------------------- coat
  // A storm coat, not a robe: the hem sits just below the knee (0.26 of
  // standing height) and the front is open, so the legs read through it. The
  // hem lags the pelvis — the coat is still catching up with the step he
  // already took — and the lag scales with posture swing so a figure carrying
  // a rifle does not flap like a cape.
  const swing = (state.posture?.swing ?? 1);
  const lag = Math.sin(state.pose.phase * Math.PI * 2 - 0.9) * height * 0.042 * swing;
  const hemY = foot - height * 0.26 + bob;
  const hemHalf = height * 0.118;
  const collarHalf = height * 0.115;

  // Two panels with an open front, drawn one at a time so the near leg can
  // pass between them.
  for (const side of [-1, 1]) {
    ctx.fillStyle = side < 0 ? coatColour : mix(INK.coat, INK.fog, haze * 0.8 + 0.08);
    ctx.beginPath();
    ctx.moveTo(neckP.x, neckP.y - height * 0.005);
    ctx.lineTo(neckP.x + side * collarHalf, neckP.y);
    ctx.quadraticCurveTo(
      hipP.x + side * height * 0.10, hipP.y,
      hipP.x + side * hemHalf + lag * side * 0.6, hemY,
    );
    ctx.lineTo(hipP.x + side * height * 0.012 + lag * 0.5, hemY + height * 0.012);
    ctx.closePath();
    ctx.fill();
  }
  if (edgeAlpha > 0.05) {
    ctx.strokeStyle = `rgba(150, 200, 225, ${edgeAlpha * 0.35})`;
    ctx.lineWidth = Math.max(stroke * 0.18, 0.4);
    ctx.beginPath();
    ctx.moveTo(neckP.x - collarHalf, neckP.y);
    ctx.quadraticCurveTo(hipP.x - height * 0.10, hipP.y, hipP.x - hemHalf + lag * -0.6, hemY);
    ctx.stroke();
  }

  // ---------------------------------------------------------- near limbs
  limb(ctx, [px(skeleton.legL.hip), px(skeleton.legL.knee), px(skeleton.legL.ankle), px(skeleton.legL.toe)], stroke * 1.2, bodyColour);

  // Shin plate on the near leg.
  if (height > 70) {
    const knee = px(skeleton.legL.knee);
    const ankle = px(skeleton.legL.ankle);
    ctx.strokeStyle = plateColour;
    ctx.lineWidth = stroke * 1.5;
    ctx.beginPath();
    ctx.moveTo(knee.x, knee.y);
    ctx.lineTo(ankle.x, ankle.y);
    ctx.stroke();
  }

  // ------------------------------------------------------------ shoulders
  // Drawn after the coat so the pauldrons sit *on* the collar rather than
  // beside it — two ellipses floating off a silhouette read as debris.
  const shoulderL = px(skeleton.shoulderL);
  const shoulderR = px(skeleton.shoulderR);
  ctx.fillStyle = plateColour;
  for (const shoulder of [shoulderR, shoulderL]) {
    ctx.beginPath();
    ctx.ellipse(shoulder.x, shoulder.y + height * 0.008, height * 0.047, height * 0.036, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  limb(ctx, [px(skeleton.armL.shoulder), px(skeleton.armL.elbow), px(skeleton.armL.hand)], stroke * 0.9, bodyColour);

  // ---------------------------------------------------------------- head
  const head = px(skeleton.head);
  const headR = height * 0.064;
  const helmet = mix('#0a1119', INK.fog, haze * 0.7);

  // A short neck, or the head floats. At a distance this is two pixels; up
  // close its absence is the first thing that looks wrong.
  ctx.strokeStyle = helmet;
  ctx.lineWidth = height * 0.042;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(neckP.x, neckP.y - height * 0.004);
  ctx.lineTo(head.x, head.y + headR * 0.55);
  ctx.stroke();

  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, headR * 0.80, headR, 0, 0, Math.PI * 2);
  ctx.fill();

  // The visor bar. This is the whole face, and it is the brightest thing on him.
  const visorAlpha = (1 - haze * 0.55);
  ctx.fillStyle = `rgba(79, 232, 255, ${visorAlpha})`;
  ctx.shadowColor = `rgba(79, 232, 255, ${visorAlpha * 0.8})`;
  ctx.shadowBlur = Math.max(height * 0.05, 3);
  ctx.beginPath();
  ctx.ellipse(head.x, head.y - headR * 0.08, headR * 0.70, Math.max(headR * 0.16, 0.7), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // ---------------------------------------------------------------- prop
  drawProp(ctx, state, skeleton, px, height, { plateColour, edgeAlpha, haze });

  // ------------------------------------------------------------ rim light
  // A cool edge down the camera-left side, strengthening as he nears the
  // practicals. Drawn as a screen-blended stroke so it lifts rather than paints.
  if (state.rim > 0.02 && height > 40) {
    // The rim must hug the silhouette's own left edge. Routed any wider it
    // stops reading as light catching a shoulder and starts reading as a wire
    // hanging beside him — which is exactly what it looked like before the
    // control point was pulled back onto the collar.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(90, 200, 255, ${0.24 * state.rim})`;
    ctx.lineWidth = Math.max(height * 0.007, 0.5);
    ctx.beginPath();
    ctx.moveTo(head.x - headR * 0.74, head.y + headR * 0.2);
    ctx.quadraticCurveTo(neckP.x - collarHalf, neckP.y + height * 0.02, hipP.x - hemHalf * 0.92 + lag * -0.6, hemY);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
}

/**
 * The prop in his hands, chosen by posture.
 *
 * Each one is a few strokes. What matters is that it lands in the hand the
 * posture named and that the arm was already posed with reduced swing to
 * account for carrying it — a prop drawn onto a full-swing arm is the thing
 * that makes an animation look pasted together.
 */
function drawProp(ctx, state, skeleton, px, height, { plateColour, edgeAlpha }) {
  const prop = state.posture?.prop || 'none';
  if (prop === 'none' || height < 55) return;

  const handL = px(skeleton.armL.hand);
  const handR = px(skeleton.armR.hand);
  const glow = `rgba(79, 232, 255, ${0.8 * (1 - state.haze)})`;

  ctx.lineCap = 'round';

  if (prop === 'tablet') {
    const w = height * 0.085;
    const h = height * 0.055;
    ctx.fillStyle = plateColour;
    ctx.fillRect(handL.x - w * 0.15, handL.y - h * 0.5, w, h);
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(handL.x - w * 0.15 + w * 0.08, handL.y - h * 0.5 + h * 0.12, w * 0.84, h * 0.76);
    ctx.globalAlpha = 1;
    return;
  }

  if (prop === 'monocular') {
    const head = px(skeleton.head);
    ctx.strokeStyle = plateColour;
    ctx.lineWidth = height * 0.030;
    ctx.beginPath();
    ctx.moveTo(head.x + height * 0.02, head.y);
    ctx.lineTo(head.x + height * 0.085, head.y - height * 0.006);
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x + height * 0.088, head.y - height * 0.006, height * 0.014, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (prop === 'controller') {
    const mid = { x: (handL.x + handR.x) / 2, y: (handL.y + handR.y) / 2 };
    ctx.fillStyle = plateColour;
    ctx.fillRect(mid.x - height * 0.045, mid.y - height * 0.018, height * 0.09, height * 0.036);
    ctx.strokeStyle = glow;
    ctx.lineWidth = Math.max(height * 0.008, 0.6);
    ctx.beginPath();
    ctx.moveTo(mid.x - height * 0.03, mid.y - height * 0.020);
    ctx.lineTo(mid.x - height * 0.03, mid.y - height * 0.055);
    ctx.moveTo(mid.x + height * 0.03, mid.y - height * 0.020);
    ctx.lineTo(mid.x + height * 0.03, mid.y - height * 0.055);
    ctx.stroke();
    return;
  }

  if (prop === 'watch') {
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(handL.x, handL.y - height * 0.012, Math.max(height * 0.014, 1), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (prop === 'spotter') {
    const head = px(skeleton.head);
    ctx.strokeStyle = plateColour;
    ctx.lineWidth = height * 0.024;
    ctx.beginPath();
    ctx.moveTo(head.x - height * 0.03, head.y - height * 0.004);
    ctx.lineTo(head.x + height * 0.07, head.y - height * 0.010);
    ctx.stroke();
    ctx.fillStyle = `rgba(150, 200, 225, ${edgeAlpha})`;
    ctx.beginPath();
    ctx.arc(head.x + height * 0.072, head.y - height * 0.010, height * 0.016, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (prop === 'rifle-low') {
    // Muzzle down and across, off any line the camera is on. Low ready, drawn
    // as low ready — this is a range section, and it starts the way a range does.
    const grip = { x: (handL.x + handR.x) / 2, y: (handL.y + handR.y) / 2 };
    ctx.strokeStyle = plateColour;
    ctx.lineWidth = Math.max(height * 0.016, 0.8);
    ctx.beginPath();
    ctx.moveTo(grip.x - height * 0.055, grip.y - height * 0.055);
    ctx.lineTo(grip.x + height * 0.065, grip.y + height * 0.075);
    ctx.stroke();
    ctx.strokeStyle = `rgba(150, 200, 225, ${edgeAlpha * 0.7})`;
    ctx.lineWidth = Math.max(height * 0.007, 0.5);
    ctx.beginPath();
    ctx.moveTo(grip.x - height * 0.040, grip.y - height * 0.062);
    ctx.lineTo(grip.x - height * 0.010, grip.y - height * 0.030);
    ctx.stroke();
  }
}
