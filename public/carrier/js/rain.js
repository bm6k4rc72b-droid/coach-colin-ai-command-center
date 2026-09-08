/**
 * The character rain behind everything.
 *
 * It is decoration, and decoration in a briefing frame has exactly one job:
 * to be ignorable. So it is drawn in the theme's faintest colour, it never
 * crosses the caption card, and it is deterministic — column *n* at second *t*
 * shows the same glyph on every machine, which is what lets a rendered frame be
 * compared against a reference image in CI at all.
 *
 * Determinism comes from hashing (column, row, tick) rather than stepping a
 * generator, so any frame can be drawn without having drawn the one before it.
 * Scrubbing backwards is therefore free and identical to scrubbing forwards.
 *
 * @module carrier/rain
 */

/** The glyphs the columns are drawn from — hex, operators, nothing pronounceable. */
export const GLYPHS = '0123456789ABCDEF+-=*/@#$%&?!:;<>';

/**
 * A small integer hash, mixed well enough for glyph choice.
 *
 * @param {number} x First input.
 * @param {number} y Second input.
 * @param {number} z Third input.
 * @returns {number} A value in [0, 1).
 */
export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * The state of the rain at a moment.
 *
 * Each column falls at its own rate and holds a glyph for a whole tick, so the
 * field reads as characters scrolling rather than as static noise flickering.
 *
 * @param {object} options Field description.
 * @param {number} options.cols Column count.
 * @param {number} options.rows Rows per column.
 * @param {number} options.t Seconds from the top of the episode.
 * @param {number} [options.seed=1] Field seed.
 * @returns {Array<{col: number, row: number, glyph: string, alpha: number}>} Cells to draw.
 */
export function rainCells({ cols, rows, t, seed = 1 }) {
  const cells = [];
  for (let col = 0; col < cols; col += 1) {
    const rate = 0.6 + hash3(col, seed, 7) * 1.8;
    const offset = hash3(col, seed, 11) * rows;
    const head = (t * rate + offset) % rows;
    const density = 0.34 + hash3(col, seed, 13) * 0.3;
    for (let row = 0; row < rows; row += 1) {
      const tick = Math.floor(t * rate * 2 + row * 0.5);
      if (hash3(col * 31 + row, tick, seed) > density) continue;
      const distance = (head - row + rows) % rows;
      const alpha = distance < 3 ? 1 - distance * 0.22 : Math.max(0.16, 0.34 - distance * 0.012);
      const glyph = GLYPHS[Math.floor(hash3(col, row, tick) * GLYPHS.length)];
      cells.push({ col, row, glyph, alpha });
    }
  }
  return cells;
}
