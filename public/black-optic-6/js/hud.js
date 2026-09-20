/**
 * The overlay drawn on the live frame.
 *
 * A head-up display earns its place by answering, without being read, three
 * questions: is the system looking, what has it found, and can it be believed.
 * Everything drawn here serves one of those. Nothing is drawn because it looks
 * like a targeting computer.
 *
 * The rule that shapes the file: **a box around a person is a claim, so it
 * carries its evidence.** Each contact's label states the class, the measured
 * height and speed, and — when the view was never calibrated — says so in place
 * of numbers rather than quietly reporting pixels as metres. A reticle with no
 * calibration behind it is the exact failure this console exists to avoid.
 *
 * @module black-optic-6/hud
 */

import { horizonRow } from '../../sentry/js/ground.js';

/** Palette, matched to the stylesheet so canvas and DOM never drift. */
export const HUD = Object.freeze({
  primary: '#4fe8ff',
  confirm: '#29e07f',
  caution: '#ffb23d',
  alert: '#ff3b4e',
  muted: '#5a6b7d',
  ink: '#dff0f8',
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
});

/**
 * Colour for a contact class.
 *
 * @param {string} label Class label.
 * @returns {string} A CSS colour.
 */
export function classColour(label) {
  if (label === 'person') return HUD.alert;
  if (label === 'vehicle') return HUD.caution;
  if (label === 'animal') return HUD.confirm;
  return HUD.muted;
}

/**
 * Corner brackets around a rectangle.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {{x: number, y: number, w: number, h: number}} box The rectangle.
 * @param {string} colour Stroke colour.
 * @param {number} [arm=14] Arm length in pixels.
 * @param {number} [width=1.5] Stroke width.
 * @returns {void}
 */
export function brackets(ctx, box, colour, arm = 14, width = 1.5) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.w, box.y, -1, 1],
    [box.x, box.y + box.h, 1, -1],
    [box.x + box.w, box.y + box.h, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * arm);
    ctx.stroke();
  }
}

/**
 * A small label plate, so type stays readable over any frame.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {string[]} lines Text lines.
 * @param {number} x Left edge.
 * @param {number} y Top edge.
 * @param {string} colour Text and border colour.
 * @param {number} [size=11] Font size.
 * @returns {{w: number, h: number}} The plate's size.
 */
export function plate(ctx, lines, x, y, colour, size = 11) {
  ctx.font = `${size}px ${HUD.mono}`;
  ctx.textBaseline = 'top';
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 12;
  const height = lines.length * (size + 4) + 8;
  ctx.fillStyle = 'rgba(4, 6, 10, 0.82)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = colour;
  lines.forEach((line, i) => ctx.fillText(line, x + 6, y + 5 + i * (size + 4)));
  return { w: width, h: height };
}

/**
 * The frame's own furniture: brackets, centre reticle, and a state line.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {{w: number, h: number}} size Canvas size.
 * @param {object} state Console state.
 * @param {string} state.mode Optics view in use.
 * @param {boolean} state.settled Whether the background model is ready.
 * @param {number} state.settleProgress 0..1 while settling.
 * @param {boolean} state.calibrated Whether metres are available.
 * @returns {void}
 */
export function frame(ctx, size, state) {
  ctx.clearRect(0, 0, size.w, size.h);
  const inset = 10;
  brackets(ctx, { x: inset, y: inset, w: size.w - inset * 2, h: size.h - inset * 2 }, HUD.primary, 22, 1.5);

  // Centre reticle: a gap cross, never a crosshair with a dot. This is a camera,
  // not a sight, and the shape should not suggest otherwise.
  const cx = size.w / 2;
  const cy = size.h / 2;
  ctx.strokeStyle = 'rgba(79, 232, 255, 0.5)';
  ctx.lineWidth = 1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 9, cy + dy * 9);
    ctx.lineTo(cx + dx * 20, cy + dy * 20);
    ctx.stroke();
  }

  const lines = [];
  if (!state.settled) {
    lines.push(`LEARNING SCENE  ${Math.round(state.settleProgress * 100)}%`);
  }
  lines.push(state.calibrated ? 'CALIBRATED · METRES' : 'UNCALIBRATED · PIXELS ONLY');
  plate(ctx, lines, inset + 6, size.h - inset - 8 - lines.length * 15 - 8,
    state.calibrated ? HUD.confirm : HUD.caution, 10);

  // Clear of the corner bracket, so the two never sit on top of each other.
  ctx.fillStyle = HUD.primary;
  ctx.font = `10px ${HUD.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillText(String(state.mode ?? '').toUpperCase(), inset + 30, inset + 6);
}

/**
 * Draw the contacts.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object[]} contacts Contacts from the watch.
 * @param {{x: number, y: number}} scale Frame-to-canvas scale factors.
 * @returns {void}
 */
export function contacts(ctx, list, scale) {
  for (const contact of list) {
    const box = {
      x: (contact.box.x ?? 0) * scale.x,
      y: (contact.box.y ?? 0) * scale.y,
      w: (contact.box.width ?? contact.box.w ?? 0) * scale.x,
      h: (contact.box.height ?? contact.box.h ?? 0) * scale.y,
    };
    if (box.w < 2 || box.h < 2) continue;

    const label = contact.classification?.value ?? 'unknown';
    const colour = classColour(label);
    brackets(ctx, box, colour, Math.min(16, box.w / 3), 1.5);

    // The trail: where it came from, which is usually the useful part.
    if (Array.isArray(contact.trailPx) && contact.trailPx.length > 1) {
      ctx.strokeStyle = `${colour}88`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      contact.trailPx.forEach((point, i) => {
        const x = point.u * scale.x;
        const y = point.v * scale.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    const lines = [`${label.toUpperCase()} · ${String(contact.id).padStart(2, '0')}`];
    if (contact.calibrated) {
      if (contact.height?.value !== null && contact.height?.value !== undefined) {
        lines.push(`H ${contact.height.value.toFixed(2)}±${(contact.height.error ?? 0).toFixed(2)} m`);
      }
      if (contact.speed?.value !== null && contact.speed?.value !== undefined) {
        lines.push(`V ${contact.speed.value.toFixed(2)} m/s`);
      }
    } else {
      lines.push('NOT CALIBRATED');
    }
    plate(ctx, lines, box.x, Math.max(0, box.y - (lines.length * 15 + 8)), colour, 10);
  }
}

/**
 * The horizon, where the view has been calibrated.
 *
 * Drawn because it is the single quickest check that a calibration is wrong: if
 * the line is not on the horizon, none of the metres below it mean anything.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} pose Camera pose.
 * @param {{w: number, h: number}} size Canvas size.
 * @param {number} frameHeight Source frame height.
 * @returns {void}
 */
export function horizon(ctx, pose, size, frameHeight) {
  if (!pose) return;
  const row = horizonRow(pose);
  if (!Number.isFinite(row) || row < 0 || row > frameHeight) return;
  const y = (row / frameHeight) * size.h;
  ctx.strokeStyle = 'rgba(79, 232, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(size.w, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(79, 232, 255, 0.6)';
  ctx.font = `9px ${HUD.mono}`;
  ctx.textBaseline = 'bottom';
  ctx.fillText('HORIZON', 12, y - 3);
}
