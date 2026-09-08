/**
 * A slot for real footage.
 *
 * Half of a briefing reel is material that cannot be drawn — a clip from a
 * paper's supplementary video, a screen recording, a photograph of the room.
 * A media panel names a slot; the editor lets someone drop a file into that
 * slot; the renderer draws whatever is there, cropped to fill, with the same
 * border and trim as every other panel so the frame stays one design.
 *
 * When the slot is empty the panel draws itself as an empty slot — labelled,
 * sized, and obviously waiting — rather than a hole. An author scrubbing the
 * timeline should be able to see the shape of the finished episode before any
 * footage exists, and a missing file should never be mistaken for a broken
 * renderer.
 *
 * @module carrier/panels/media
 */

import { drawCorners, drawTracked, roundRectPath, trackedWidth } from '../chrome.js';
import { withAlpha } from '../theme.js';
import { coverRect, fieldFooter, panelFrame } from './frame.js';

/**
 * Draw the slot, or its contents.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Panel box.
 * @param {object} params Panel parameters. `slot` names the media slot.
 * @param {number} t Seconds since the scene started.
 * @param {object} context Render context.
 * @param {object} context.theme Palette.
 * @param {number} context.scale Canvas scale.
 * @param {{get: (slot: string) => ({element: CanvasImageSource, width: number,
 *   height: number}|null)}} [context.media] Loaded media, if any.
 * @returns {void}
 */
export function draw(ctx, box, params, t, { theme, scale, media }) {
  const slot = String(params.slot ?? 'clip');
  const held = media?.get?.(slot) ?? null;
  const inner = panelFrame(ctx, box, theme, {
    status: params.status ?? '',
    statusTone: params.statusTone ?? 'accent',
    legend: params.legend ?? '',
    source: params.source ?? '',
    scale,
  });

  ctx.save();
  roundRectPath(ctx, inner, 6 * scale);
  ctx.clip();
  ctx.fillStyle = '#04050b';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

  if (held?.element) {
    const rect = coverRect(held.width, held.height, inner);
    ctx.drawImage(held.element, rect.x, rect.y, rect.w, rect.h);
    if (params.dim) {
      ctx.fillStyle = withAlpha('#000000', Math.min(0.8, Number(params.dim)));
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
  } else {
    // Empty: hatching, the slot name, and what belongs in it.
    ctx.strokeStyle = withAlpha(theme.accent, 0.12);
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    const step = Math.round(26 * scale);
    for (let x = inner.x - inner.h; x < inner.x + inner.w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, inner.y + inner.h);
      ctx.lineTo(x + inner.h, inner.y);
      ctx.stroke();
    }
    const title = `MEDIA SLOT · ${slot.toUpperCase()}`;
    ctx.font = `700 ${Math.round(20 * scale)}px ${theme.mono}`;
    ctx.textBaseline = 'top';
    const tw = trackedWidth(ctx, title, 2 * scale);
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    ctx.fillStyle = withAlpha(theme.accent, 0.85);
    drawTracked(ctx, title, cx - tw / 2, cy - 26 * scale, 2 * scale);

    const hint = params.hint ?? 'drop a clip or still into this slot in the editor';
    ctx.font = `${Math.round(15 * scale)}px ${theme.mono}`;
    ctx.fillStyle = theme.dim;
    const hw = trackedWidth(ctx, hint, 1 * scale);
    drawTracked(ctx, hint, cx - hw / 2, cy + 6 * scale, 1 * scale);

    const pulse = 0.35 + 0.35 * Math.sin(t * 2.4);
    drawCorners(ctx, {
      x: cx - tw / 2 - 24 * scale,
      y: cy - 44 * scale,
      w: tw + 48 * scale,
      h: 84 * scale,
    }, withAlpha(theme.accent, pulse + 0.2), 16 * scale, Math.max(1, 2 * scale));
  }

  ctx.restore();
  ctx.strokeStyle = withAlpha(theme.accent, 0.4);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, inner, 6 * scale);
  ctx.stroke();
  if (params.footerLeft || params.footerRight) {
    fieldFooter(ctx, inner, params.footerLeft ?? '', params.footerRight ?? '', theme, scale);
  }
}
