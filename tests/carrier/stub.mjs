/**
 * A canvas context that writes down what it was asked to draw.
 *
 * The renderer is worth testing and a real canvas is not available in Node
 * without a native dependency, so the tests hand it a context that records
 * calls instead of pixels. That turns questions a screenshot can only answer
 * approximately — is the headline below the platform's own navigation, does the
 * caption stay inside its card — into exact assertions about coordinates.
 *
 * Text is measured at a fixed advance per character. Real metrics differ, but
 * every layout decision in the engine is a comparison between measured widths,
 * so a consistent monospace model exercises the same code paths.
 *
 * @module tests/carrier/stub
 */

/** Pixels per character, as a fraction of the font size. */
const ADVANCE = 0.6;

/**
 * Build a recording 2D context.
 *
 * @returns {object} A context-shaped object with a `calls` log.
 */
export function stubContext() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push({ name, args });
  };

  const gradient = { addColorStop: record('addColorStop') };

  const ctx = {
    calls,
    canvas: { width: 1080, height: 1920 },
    font: '16px mono',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    textBaseline: 'alphabetic',
    filter: 'none',

    measureText(text) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 16);
      return { width: String(text).length * size * ADVANCE };
    },

    fillText: (text, x, y) => calls.push({ name: 'fillText', args: [String(text), x, y] }),
    strokeText: record('strokeText'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    bezierCurveTo: record('bezierCurveTo'),
    arc: record('arc'),
    rect: record('rect'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    scale: record('scale'),
    setLineDash: record('setLineDash'),
    drawImage: record('drawImage'),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };

  return ctx;
}

/**
 * Every `fillText` call, as text plus position.
 *
 * @param {object} ctx A stub context.
 * @returns {Array<{text: string, x: number, y: number}>} Text draws in order.
 */
export function texts(ctx) {
  return ctx.calls
    .filter((call) => call.name === 'fillText')
    .map((call) => ({ text: call.args[0], x: call.args[1], y: call.args[2] }));
}

/**
 * The text drawn, joined — tracked text arrives one character at a time.
 *
 * @param {object} ctx A stub context.
 * @returns {string} Everything drawn, in order.
 */
export function textBlob(ctx) {
  return texts(ctx).map((call) => call.text).join('');
}
