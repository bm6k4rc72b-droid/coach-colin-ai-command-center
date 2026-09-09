/**
 * The panel registry, and the grid that nests panels inside panels.
 *
 * A scene names a panel type and hands it a bag of parameters; nothing above
 * this module knows what a heatmap is. Adding a diagram to the engine means
 * adding a file here and a line to {@link PANELS} — the script format, the
 * editor, the exporter and the tests all pick it up without changes.
 *
 * `grid` is the one panel that is not a diagram: it splits its box and draws
 * other panels inside it, which is how the reference frames put a research clip
 * and its reconstruction on screen together. Nesting is depth-limited, because
 * a script is data and data can be recursive by accident.
 *
 * @module carrier/panels
 */

import { gridCells } from './frame.js';
import * as heatmap from './heatmap.js';
import * as floorplan from './floorplan.js';
import * as sniffer from './sniffer.js';
import * as pose from './pose.js';
import * as media from './media.js';

/** How deep a `grid` may nest before the renderer stops descending. */
export const MAX_DEPTH = 3;

/** Every drawable panel, by the `type` a script uses. */
export const PANELS = {
  heatmap: heatmap.draw,
  floorplan: floorplan.draw,
  sniffer: sniffer.draw,
  pose: pose.draw,
  media: media.draw,
};

/**
 * Draw a panel into a box.
 *
 * Unknown types draw nothing rather than throwing: a script with a typo in it
 * should still render every scene that is fine, so the author can see the gap
 * and the validator can name it.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Panel box.
 * @param {object} panel Panel spec from the script.
 * @param {number} t Seconds since the scene started.
 * @param {object} context Render context: `theme`, `scale`, optional `media`.
 * @param {number} [depth=0] Current nesting depth.
 * @returns {void}
 */
export function drawPanel(ctx, box, panel, t, context, depth = 0) {
  if (!panel || panel.type === 'blank') return;

  if (panel.type === 'grid') {
    if (depth >= MAX_DEPTH) return;
    const cellsIn = Array.isArray(panel.cells) ? panel.cells : [];
    if (!cellsIn.length) return;
    const cols = Math.max(1, Number(panel.cols) || Math.min(2, cellsIn.length));
    const rows = Math.max(1, Number(panel.rows) || Math.ceil(cellsIn.length / cols));
    const gap = Number(panel.gap ?? 10) * (context.scale ?? 1);
    const boxes = gridCells(box, cols, rows, gap);
    cellsIn.forEach((cell, i) => {
      if (!boxes[i]) return;
      // A grid has no chrome of its own, so a scene's citation would vanish
      // inside one. It is handed to the first cell that has not already named
      // its own source — cited once, on the panel it belongs to.
      const withSource = i === 0 && panel.source && !cell.source
        ? { ...cell, source: panel.source }
        : cell;
      drawPanel(ctx, boxes[i], withSource, t, context, depth + 1);
    });
    return;
  }

  const draw = PANELS[panel.type];
  if (draw) draw(ctx, box, panel, t, context);
}
