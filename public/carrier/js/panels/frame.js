/**
 * The container every panel is drawn inside, and the arithmetic they share.
 *
 * A panel is a diagram with a border, a status pill and, when it is asserting
 * something about the world, a source badge in the corner. The badge is not
 * decoration: a frame that claims a research result and does not name it is the
 * single fastest way to lose a technical audience, so the frame drawing code
 * makes citing cheap and the script validator makes omitting it loud.
 *
 * @module carrier/panels/frame
 */

import { drawCorners, drawTracked, fitText, roundRectPath, trackedWidth } from '../chrome.js';
import { withAlpha, toneColour } from '../theme.js';

/** A rectangle. @typedef {{x: number, y: number, w: number, h: number}} Box */

/**
 * Draw the panel container and return the area left for its contents.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Outer box.
 * @param {object} theme Palette.
 * @param {object} [options] Trim.
 * @param {string} [options.status] Status pill text, top left.
 * @param {string} [options.statusTone='alert'] Tone for the pill.
 * @param {string} [options.legend] Small caps text beside the pill.
 * @param {string} [options.source] Citation drawn at the top left of the field.
 * @param {number} [options.scale=1] Canvas scale.
 * @returns {Box} The inner area.
 */
export function panelFrame(ctx, box, theme, options = {}) {
  const { status = '', statusTone = 'alert', legend = '', source = '', scale = 1 } = options;
  ctx.fillStyle = withAlpha(theme.panel, 0.92);
  roundRectPath(ctx, box, 12 * scale);
  ctx.fill();
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = Math.max(1, 2 * scale);
  roundRectPath(ctx, box, 12 * scale);
  ctx.stroke();
  drawCorners(ctx, box, withAlpha(theme.accent, 0.55), 22 * scale, Math.max(1, 2 * scale));

  const pad = Math.round(14 * scale);
  const row = box.w - pad * 2;
  let top = box.y + pad;

  // A citation is set at 16 px and shrunk — never below 11 px — until it fits
  // the panel it belongs to, which on a two-up grid can be half a frame wide.
  const sourceFit = source ? fitSource(ctx, source, row, theme, scale) : null;
  const sourceW = sourceFit ? sourceFit.width + 16 * scale : 0;

  const pillFont = Math.round(18 * scale);
  ctx.font = `700 ${pillFont}px ${theme.mono}`;
  const pillW = status ? trackedWidth(ctx, status.toUpperCase(), 2 * scale) + 34 * scale : 0;
  const pillH = Math.round(30 * scale);
  const badgeH = Math.round(24 * scale);

  // On a narrow panel the pill and the citation cannot share a line. Rather
  // than overlap them — or drop the citation — the citation takes the next row.
  const stacked = Boolean(status && sourceFit && pillW + sourceW + 18 * scale > row);

  if (status) {
    const pill = { x: box.x + pad, y: top, w: pillW, h: pillH };
    ctx.fillStyle = withAlpha(toneColour(theme, statusTone), 0.9);
    roundRectPath(ctx, pill, 5 * scale);
    ctx.fill();
    ctx.fillStyle = '#0a0416';
    ctx.beginPath();
    ctx.arc(pill.x + 13 * scale, pill.y + pill.h / 2, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 ${pillFont}px ${theme.mono}`;
    drawTracked(ctx, status.toUpperCase(), pill.x + 24 * scale, pill.y + 6 * scale, 2 * scale);

    if (legend) {
      ctx.font = `${pillFont}px ${theme.mono}`;
      const legendX = pill.x + pill.w + 14 * scale;
      const room = box.x + box.w - pad - (stacked ? 0 : sourceW + 16 * scale) - legendX;
      const shown = fitText(ctx, legend.toUpperCase(), room, 2 * scale);
      if (shown) {
        ctx.fillStyle = withAlpha(theme.accent, 0.85);
        drawTracked(ctx, shown, legendX, pill.y + 6 * scale, 2 * scale);
      }
    }
    top = pill.y + pill.h + Math.round(10 * scale);
  }

  if (sourceFit) {
    const badge = {
      x: box.x + box.w - pad - sourceW,
      y: stacked ? top : box.y + pad,
      w: sourceW,
      h: badgeH,
    };
    ctx.fillStyle = withAlpha('#000000', 0.6);
    roundRectPath(ctx, badge, 4 * scale);
    ctx.fill();
    ctx.strokeStyle = withAlpha(theme.dim, 0.5);
    ctx.lineWidth = 1;
    roundRectPath(ctx, badge, 4 * scale);
    ctx.stroke();
    ctx.font = `${sourceFit.size}px ${theme.mono}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.dim;
    drawTracked(ctx, sourceFit.text, badge.x + 8 * scale, badge.y + 4 * scale, 1 * scale);
    if (stacked) top = badge.y + badge.h + Math.round(8 * scale);
    else if (!status) top = badge.y + badge.h + Math.round(10 * scale);
  }

  return {
    x: box.x + pad,
    y: top,
    w: box.w - pad * 2,
    h: box.y + box.h - pad - top,
  };
}

/**
 * The largest legible setting of a citation that fits a panel.
 *
 * Citations are the one label that must not simply be dropped, so they are
 * shrunk first and only cut as a last resort — and the full text is always
 * available in the editor's Checks deck regardless of what the frame can hold.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {string} source The citation.
 * @param {number} maxWidth Space available.
 * @param {object} theme Palette.
 * @param {number} scale Canvas scale.
 * @returns {{text: string, size: number, width: number}} What to draw.
 */
function fitSource(ctx, source, maxWidth, theme, scale) {
  const room = Math.max(0, maxWidth - 16 * scale);
  for (let size = Math.round(16 * scale); size >= Math.round(11 * scale); size -= 1) {
    ctx.font = `${size}px ${theme.mono}`;
    const width = trackedWidth(ctx, source, 1 * scale);
    if (width <= room) return { text: source, size, width };
  }
  const size = Math.max(1, Math.round(11 * scale));
  ctx.font = `${size}px ${theme.mono}`;
  const text = fitText(ctx, source, room, 1 * scale);
  return { text, size, width: trackedWidth(ctx, text, 1 * scale) };
}

/**
 * A caption strip along the bottom edge of a field, as used under each diagram.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Field box.
 * @param {string} left Left-aligned label.
 * @param {string} right Right-aligned label.
 * @param {object} theme Palette.
 * @param {number} [scale=1] Canvas scale.
 * @returns {void}
 */
export function fieldFooter(ctx, box, left, right, theme, scale = 1) {
  const h = Math.round(30 * scale);
  const strip = { x: box.x, y: box.y + box.h - h, w: box.w, h };
  ctx.fillStyle = withAlpha('#000000', 0.55);
  ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
  ctx.font = `${Math.round(16 * scale)}px ${theme.mono}`;
  ctx.textBaseline = 'top';
  const y = strip.y + 7 * scale;
  const rightW = right ? trackedWidth(ctx, right.toUpperCase(), 1.5 * scale) : 0;
  if (left) {
    // The left label is the verdict and the right one is a reading; when they
    // will not both fit, the verdict is the one that survives intact.
    const room = strip.w - 30 * scale - rightW;
    const shown = fitText(ctx, left.toUpperCase(), room, 1.5 * scale);
    ctx.fillStyle = theme.dim;
    drawTracked(ctx, shown, strip.x + 10 * scale, y, 1.5 * scale);
  }
  if (right) {
    ctx.fillStyle = withAlpha(theme.accent, 0.9);
    drawTracked(ctx, right.toUpperCase(), strip.x + strip.w - 10 * scale - rightW, y, 1.5 * scale);
  }
}

/**
 * Fit a source rectangle into a box, covering it and cropping the overflow.
 *
 * @param {number} srcW Source width.
 * @param {number} srcH Source height.
 * @param {Box} box Destination.
 * @returns {Box} Destination rectangle to draw the source into.
 */
export function coverRect(srcW, srcH, box) {
  if (!srcW || !srcH) return { ...box };
  const scale = Math.max(box.w / srcW, box.h / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * Split a box into a grid of cells.
 *
 * @param {Box} box Outer box.
 * @param {number} cols Columns.
 * @param {number} rows Rows.
 * @param {number} [gap=0] Gap in pixels.
 * @returns {Box[]} Cells in reading order.
 */
export function gridCells(box, cols, rows, gap = 0) {
  const w = (box.w - gap * (cols - 1)) / cols;
  const h = (box.h - gap * (rows - 1)) / rows;
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push({ x: box.x + c * (w + gap), y: box.y + r * (h + gap), w, h });
    }
  }
  return cells;
}
