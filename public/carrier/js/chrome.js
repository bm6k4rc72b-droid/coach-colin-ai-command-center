/**
 * The furniture around the panel: kicker, title, stat strip, caption card.
 *
 * The layout is computed bottom-up from the safe areas rather than top-down
 * from the canvas, and that is the most important decision in the file. A reel
 * is not shown on a 1080×1920 rectangle — it is shown inside a host app that
 * draws its own header over the top ~300 px and its handle, caption and buttons
 * over the bottom ~470 px. Laying out from the top means the title lands under
 * the platform's own navigation, which is exactly what happens in most reels of
 * this kind: the headline is there, and unreadable. Here the caption card is
 * anchored above the bottom furniture, the stat strip above that, and the panel
 * takes whatever is left, so nothing meaningful is ever drawn where the host
 * will cover it.
 *
 * Every draw function takes a box and a theme and touches no globals, so the
 * same code paints the preview, the export and the headless check.
 *
 * @module carrier/chrome
 */

import { rainCells } from './rain.js';
import { toneColour, withAlpha } from './theme.js';

/** A rectangle. @typedef {{x: number, y: number, w: number, h: number}} Box */

/** Height of the caption card, at 1080 px wide. */
const CAPTION_H = 300;

/** Height of the stat strip, at 1080 px wide. */
const STATS_H = 96;

/**
 * Where everything goes.
 *
 * @param {object} options Frame description.
 * @param {{w: number, h: number}} options.size Canvas size.
 * @param {{top: number, bottom: number}} options.safeArea Host furniture bands.
 * @param {number} [options.titleLines=2] Lines the title wrapped to.
 * @param {boolean} [options.hasStats=true] Whether a stat strip is drawn.
 * @returns {{scale: number, margin: number, kicker: Box, title: Box, panel: Box,
 *   stats: Box, caption: Box, progress: Box}} Boxes, in canvas pixels.
 */
export function layoutFrame({ size, safeArea, titleLines = 2, hasStats = true }) {
  const scale = size.w / 1080;
  const margin = Math.round(26 * scale);
  const kickerH = Math.round(38 * scale);
  const titleLine = Math.round(64 * scale);
  const captionH = Math.round(CAPTION_H * scale);
  const statsH = hasStats ? Math.round(STATS_H * scale) : 0;
  const gap = Math.round(24 * scale);

  const kicker = { x: margin, y: safeArea.top, w: size.w - margin * 2, h: kickerH };
  const title = {
    x: margin,
    y: kicker.y + kicker.h + Math.round(6 * scale),
    w: size.w - margin * 2,
    h: titleLine * Math.max(1, titleLines),
  };

  const captionY = size.h - safeArea.bottom - captionH;
  const caption = { x: margin, y: captionY, w: size.w - margin * 2, h: captionH };

  // Above the caption card, not below it. A progress strip under the card would
  // land inside the host's own footer band, which is a strip nobody ever sees.
  const progressH = Math.round(6 * scale);
  const progress = {
    x: margin,
    y: caption.y - Math.round(12 * scale) - progressH,
    w: size.w - margin * 2,
    h: progressH,
  };
  const stats = {
    x: margin,
    y: progress.y - gap - statsH,
    w: size.w - margin * 2,
    h: statsH,
  };

  const panelTop = title.y + title.h + gap;
  const panelBottom = (hasStats ? stats.y : progress.y) - gap;
  const panel = {
    x: margin,
    y: panelTop,
    w: size.w - margin * 2,
    h: Math.max(Math.round(120 * scale), panelBottom - panelTop),
  };

  return { scale, margin, kicker, title, panel, stats, caption, progress };
}

/**
 * Draw text with per-character tracking.
 *
 * Canvas letter-spacing is recent and unevenly supported, and the look of this
 * material depends on wide-tracked monospace labels, so the spacing is applied
 * by hand. It also gives an exact advance width back, which the caller needs to
 * centre or right-align a tracked run.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {string} text The text.
 * @param {number} x Left edge.
 * @param {number} y Baseline-independent top (uses the context's textBaseline).
 * @param {number} spacing Extra pixels between characters.
 * @returns {number} The advance width drawn.
 */
export function drawTracked(ctx, text, x, y, spacing) {
  let at = x;
  for (const ch of String(text)) {
    ctx.fillText(ch, at, y);
    at += ctx.measureText(ch).width + spacing;
  }
  return at - x;
}

/**
 * The advance width tracked text would take.
 *
 * @param {CanvasRenderingContext2D} ctx Target context, with the font already set.
 * @param {string} text The text.
 * @param {number} spacing Extra pixels between characters.
 * @returns {number} Width in pixels.
 */
export function trackedWidth(ctx, text, spacing) {
  let width = 0;
  for (const ch of String(text)) width += ctx.measureText(ch).width + spacing;
  return Math.max(0, width - spacing);
}

/**
 * Trim tracked text to fit a width, with an ellipsis when it has to be cut.
 *
 * Panels carry a lot of small type in fixed-width slots — a legend beside a
 * status pill, a verdict beside a power reading — and the alternative to
 * trimming is not a longer label, it is two labels drawn on top of each other.
 * A cut label reads; overlapping labels read as a broken renderer.
 *
 * @param {CanvasRenderingContext2D} ctx Target context, with the font set.
 * @param {string} text The text.
 * @param {number} maxWidth Space available.
 * @param {number} spacing Tracking, in pixels.
 * @returns {string} Text that fits, possibly empty.
 */
export function fitText(ctx, text, maxWidth, spacing) {
  const full = String(text);
  if (maxWidth <= 0) return '';
  if (trackedWidth(ctx, full, spacing) <= maxWidth) return full;
  for (let len = full.length - 1; len > 0; len -= 1) {
    const candidate = `${full.slice(0, len).trimEnd()}…`;
    if (trackedWidth(ctx, candidate, spacing) <= maxWidth) return candidate;
  }
  return '';
}

/**
 * Break coloured title runs into lines that fit a width.
 *
 * Wrapping happens at word boundaries across run edges, so a two-colour title
 * breaks where the sentence breaks rather than where the colour changes.
 *
 * @param {CanvasRenderingContext2D} ctx Target context, with the title font set.
 * @param {Array<{text: string, tone: string}>} runs Title runs.
 * @param {number} maxWidth Available width.
 * @returns {Array<Array<{text: string, tone: string}>>} Lines of runs.
 */
export function wrapRuns(ctx, runs, maxWidth) {
  /** @type {Array<{word: string, tone: string}>} */
  const words = [];
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/).filter((p) => p !== '');
    for (const part of parts) words.push({ word: part, tone: run.tone });
  }

  const lines = [];
  let line = [];
  let width = 0;

  const flush = () => {
    while (line.length && /^\s+$/.test(line[line.length - 1].word)) line.pop();
    if (line.length) lines.push(condense(line));
    line = [];
    width = 0;
  };

  for (const item of words) {
    const w = ctx.measureText(item.word).width;
    const blank = /^\s+$/.test(item.word);
    if (!blank && width + w > maxWidth && line.length) flush();
    if (blank && !line.length) continue;
    line.push(item);
    width += w;
  }
  flush();
  return lines;
}

/**
 * Merge adjacent same-tone words back into runs, so each is one fillText.
 *
 * @param {Array<{word: string, tone: string}>} items Words with tones.
 * @returns {Array<{text: string, tone: string}>} Runs.
 */
function condense(items) {
  const runs = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && last.tone === item.tone) last.text += item.word;
    else runs.push({ text: item.word, tone: item.tone });
  }
  return runs;
}

/**
 * Fill a rounded rectangle path.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box The rectangle.
 * @param {number} r Corner radius.
 * @returns {void}
 */
export function roundRectPath(ctx, box, r) {
  const radius = Math.min(r, box.w / 2, box.h / 2);
  ctx.beginPath();
  ctx.moveTo(box.x + radius, box.y);
  ctx.lineTo(box.x + box.w - radius, box.y);
  ctx.quadraticCurveTo(box.x + box.w, box.y, box.x + box.w, box.y + radius);
  ctx.lineTo(box.x + box.w, box.y + box.h - radius);
  ctx.quadraticCurveTo(box.x + box.w, box.y + box.h, box.x + box.w - radius, box.y + box.h);
  ctx.lineTo(box.x + radius, box.y + box.h);
  ctx.quadraticCurveTo(box.x, box.y + box.h, box.x, box.y + box.h - radius);
  ctx.lineTo(box.x, box.y + radius);
  ctx.quadraticCurveTo(box.x, box.y, box.x + radius, box.y);
  ctx.closePath();
}

/**
 * The ground: flat fill, character rain, and a violet bloom behind the panel.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{w: number, h: number}} size Canvas size.
 * @param {object} theme Palette.
 * @param {number} t Seconds from the top of the episode.
 * @returns {void}
 */
export function drawGround(ctx, size, theme, t) {
  ctx.fillStyle = theme.ink;
  ctx.fillRect(0, 0, size.w, size.h);

  const bloom = ctx.createRadialGradient(
    size.w * 0.5, size.h * 0.34, 0,
    size.w * 0.5, size.h * 0.34, size.w * 0.9,
  );
  bloom.addColorStop(0, withAlpha(theme.accent, 0.07));
  bloom.addColorStop(0.55, withAlpha('#7c3aed', 0.05));
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, size.w, size.h);

  const scale = size.w / 1080;
  const cell = Math.round(34 * scale);
  const cols = Math.ceil(size.w / cell);
  const rows = Math.ceil(size.h / cell);
  ctx.font = `${Math.round(20 * scale)}px ${theme.mono}`;
  ctx.textBaseline = 'top';
  for (const cellState of rainCells({ cols, rows, t, seed: 4 })) {
    ctx.fillStyle = withAlpha(theme.accent, 0.055 * cellState.alpha + 0.02);
    ctx.fillText(cellState.glyph, cellState.col * cell + 6 * scale, cellState.row * cell);
  }
}

/**
 * The kicker line: `// 03 · NEURAL NETWORK TRANSLATION`.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Its box.
 * @param {string} text Kicker text.
 * @param {object} theme Palette.
 * @param {string} [tone='accent'] Tone for the text after the slashes.
 * @returns {void}
 */
export function drawKicker(ctx, box, text, theme, tone = 'accent') {
  if (!text) return;
  const scale = box.h / 38;
  ctx.textBaseline = 'top';
  ctx.font = `${Math.round(25 * scale)}px ${theme.mono}`;
  const spacing = 3 * scale;
  ctx.fillStyle = withAlpha(theme.alert, 0.9);
  const slashes = drawTracked(ctx, '// ', box.x, box.y + 6 * scale, spacing);
  ctx.fillStyle = toneColour(theme, tone);
  drawTracked(ctx, text.toUpperCase(), box.x + slashes, box.y + 6 * scale, spacing);
}

/**
 * The headline, wrapped and coloured.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Its box.
 * @param {Array<{text: string, tone: string}>} runs Title runs.
 * @param {object} theme Palette.
 * @param {number} [scale=1] Canvas scale against the 1080 px reference.
 * @returns {number} Lines drawn.
 */
export function drawTitle(ctx, box, runs, theme, scale = 1) {
  if (!runs.length) return 0;
  const size = Math.round(52 * scale);
  ctx.font = `700 ${size}px ${theme.display}`;
  ctx.textBaseline = 'top';
  const lines = wrapRuns(ctx, runs, box.w);
  const lineHeight = Math.round(64 * scale);
  lines.forEach((line, i) => {
    let x = box.x;
    for (const run of line) {
      const colour = toneColour(theme, run.tone);
      ctx.fillStyle = withAlpha(colour, 0.28);
      ctx.fillText(run.text, x + 2 * scale, box.y + i * lineHeight + 2 * scale);
      ctx.fillStyle = colour;
      ctx.fillText(run.text, x, box.y + i * lineHeight);
      x += ctx.measureText(run.text).width;
    }
  });
  return lines.length;
}

/**
 * How many lines a title will wrap to, without drawing it.
 *
 * The layout needs this before it can place the panel, and the answer depends
 * on the font, so it has to be measured on the real context.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Array<{text: string, tone: string}>} runs Title runs.
 * @param {number} width Available width.
 * @param {object} theme Palette.
 * @param {number} scale Canvas scale.
 * @returns {number} Line count, at least one.
 */
export function measureTitleLines(ctx, runs, width, theme, scale) {
  if (!runs.length) return 1;
  ctx.save();
  ctx.font = `700 ${Math.round(52 * scale)}px ${theme.display}`;
  const lines = wrapRuns(ctx, runs, width);
  ctx.restore();
  return Math.max(1, lines.length);
}

/**
 * The three-up stat strip under the panel.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Strip box.
 * @param {Array<{label: string, value: string, tone: string}>} stats Up to three.
 * @param {object} theme Palette.
 * @param {number} [scale=1] Canvas scale.
 * @returns {void}
 */
export function drawStats(ctx, box, stats, theme, scale = 1) {
  if (!stats.length) return;
  const gap = Math.round(14 * scale);
  const w = (box.w - gap * (stats.length - 1)) / stats.length;
  stats.forEach((stat, i) => {
    const cell = { x: box.x + i * (w + gap), y: box.y, w, h: box.h };
    ctx.fillStyle = withAlpha(theme.accent, 0.05);
    roundRectPath(ctx, cell, 8 * scale);
    ctx.fill();
    ctx.strokeStyle = withAlpha(toneColour(theme, stat.tone), 0.4);
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    roundRectPath(ctx, cell, 8 * scale);
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(17 * scale)}px ${theme.mono}`;
    ctx.fillStyle = theme.dim;
    drawTracked(ctx, stat.label.toUpperCase(), cell.x + 14 * scale, cell.y + 14 * scale, 2 * scale);

    ctx.font = `700 ${Math.round(26 * scale)}px ${theme.mono}`;
    ctx.fillStyle = toneColour(theme, stat.tone);
    drawTracked(ctx, stat.value.toUpperCase(), cell.x + 14 * scale, cell.y + 44 * scale, 1 * scale);
  });
}

/**
 * The caption card: avatar, speaker handle, and the typewriter line.
 *
 * The highlighted word is drawn on a filled block rather than in a different
 * colour, because at phone size a colour change on one word of a monospace line
 * is invisible and a filled block is not.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Card box.
 * @param {object} state Caption state.
 * @param {string} state.speaker Handle shown above the text.
 * @param {string[]} state.words Every word of the caption.
 * @param {number} state.shown How many are on screen.
 * @param {number} state.highlight Index of the word that just landed, or −1.
 * @param {CanvasImageSource|null} [state.avatar] Avatar image, if one is loaded.
 * @param {object} theme Palette.
 * @param {number} [scale=1] Canvas scale.
 * @returns {void}
 */
export function drawCaption(ctx, box, state, theme, scale = 1) {
  const radius = 10 * scale;
  ctx.fillStyle = withAlpha(theme.ink, 0.86);
  roundRectPath(ctx, box, radius);
  ctx.fill();
  ctx.strokeStyle = withAlpha('#a06bff', 0.75);
  ctx.lineWidth = Math.max(1, 2 * scale);
  roundRectPath(ctx, box, radius);
  ctx.stroke();

  const pad = Math.round(18 * scale);
  const avatarSize = box.h - pad * 2;
  const avatarBox = { x: box.x + pad, y: box.y + pad, w: avatarSize, h: avatarSize };
  drawAvatar(ctx, avatarBox, state.avatar, theme, scale);

  const textX = avatarBox.x + avatarBox.w + Math.round(22 * scale);
  const textW = box.x + box.w - pad - textX;

  ctx.textBaseline = 'top';
  ctx.font = `${Math.round(22 * scale)}px ${theme.mono}`;
  ctx.fillStyle = withAlpha(theme.accent, 0.85);
  drawTracked(ctx, `>_ ${state.speaker || ''}`.trim(), textX, box.y + pad + 4 * scale, 2 * scale);

  const fontSize = Math.round(36 * scale);
  ctx.font = `600 ${fontSize}px ${theme.mono}`;
  const lineHeight = Math.round(48 * scale);
  const space = ctx.measureText(' ').width;
  let x = textX;
  let y = box.y + pad + Math.round(46 * scale);
  const maxY = box.y + box.h - pad - lineHeight;

  for (let i = 0; i < state.shown; i += 1) {
    const word = state.words[i];
    const w = ctx.measureText(word).width;
    if (x + w > textX + textW && x > textX) {
      x = textX;
      y += lineHeight;
    }
    if (y > maxY) break;
    if (i === state.highlight) {
      ctx.fillStyle = withAlpha('#a06bff', 0.85);
      ctx.fillRect(x - 4 * scale, y - 5 * scale, w + 8 * scale, fontSize + 12 * scale);
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = theme.text;
    }
    ctx.fillText(word, x, y);
    x += w + space;
  }
}

/**
 * The caption avatar, or a drawn stand-in when no image is loaded.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Avatar box.
 * @param {CanvasImageSource|null|undefined} image Loaded image, if any.
 * @param {object} theme Palette.
 * @param {number} scale Canvas scale.
 * @returns {void}
 */
export function drawAvatar(ctx, box, image, theme, scale) {
  ctx.save();
  roundRectPath(ctx, box, 8 * scale);
  ctx.clip();
  if (image) {
    ctx.drawImage(image, box.x, box.y, box.w, box.h);
  } else {
    // No portrait loaded: a terminal plate rather than an empty rectangle, so a
    // frame previewed before the art exists still looks composed.
    ctx.fillStyle = withAlpha('#a06bff', 0.14);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = withAlpha(theme.accent, 0.1);
    ctx.lineWidth = 1;
    for (let y = box.y + 4 * scale; y < box.y + box.h; y += 6 * scale) {
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    }
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(46 * scale)}px ${theme.mono}`;
    ctx.fillStyle = withAlpha(theme.accent, 0.75);
    const glyph = ctx.measureText('>_').width;
    ctx.fillText('>_', box.x + (box.w - glyph) / 2, box.y + box.h / 2 - 30 * scale);
    ctx.font = `${Math.round(15 * scale)}px ${theme.mono}`;
    ctx.fillStyle = withAlpha(theme.dim, 0.7);
    const label = 'AVATAR SLOT';
    const lw = trackedWidth(ctx, label, 1.5 * scale);
    drawTracked(ctx, label, box.x + (box.w - lw) / 2, box.y + box.h / 2 + 24 * scale, 1.5 * scale);
  }
  ctx.restore();
  ctx.strokeStyle = withAlpha('#a06bff', 0.8);
  ctx.lineWidth = Math.max(1, 2 * scale);
  roundRectPath(ctx, box, 8 * scale);
  ctx.stroke();
  drawCorners(ctx, box, withAlpha(theme.accent, 0.9), 14 * scale, Math.max(1, 2 * scale));
}

/**
 * Bracket marks at the corners of a box.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box The box.
 * @param {string} colour Stroke colour.
 * @param {number} len Arm length.
 * @param {number} width Stroke width.
 * @returns {void}
 */
export function drawCorners(ctx, box, colour, len, width) {
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
    ctx.moveTo(x + sx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * len);
    ctx.stroke();
  }
}

/**
 * The scene-progress ticks under the caption card.
 *
 * One segment per scene, filled as it plays — the reel equivalent of a story
 * bar, and the only place the viewer is told how much is left.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Box} box Strip box.
 * @param {{cues: Array<object>, total: number}} timeline Episode clock.
 * @param {number} t Seconds from the top.
 * @param {object} theme Palette.
 * @returns {void}
 */
export function drawProgress(ctx, box, timeline, t, theme) {
  const gap = Math.max(2, box.h * 0.6);
  const count = timeline.cues.length || 1;
  const w = (box.w - gap * (count - 1)) / count;
  timeline.cues.forEach((cue, i) => {
    const filled = Math.max(0, Math.min(1, (t - cue.start) / cue.scene.seconds));
    const x = box.x + i * (w + gap);
    ctx.fillStyle = withAlpha(theme.accent, 0.16);
    ctx.fillRect(x, box.y, w, box.h);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x, box.y, w * filled, box.h);
  });
}

/**
 * The safe-area guides, drawn in the editor only.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{w: number, h: number}} size Canvas size.
 * @param {{top: number, bottom: number}} safeArea Host furniture bands.
 * @param {object} theme Palette.
 * @returns {void}
 */
export function drawSafeGuides(ctx, size, safeArea, theme) {
  ctx.save();
  ctx.fillStyle = withAlpha(theme.alert, 0.1);
  ctx.fillRect(0, 0, size.w, safeArea.top);
  ctx.fillRect(0, size.h - safeArea.bottom, size.w, safeArea.bottom);
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = withAlpha(theme.alert, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, safeArea.top);
  ctx.lineTo(size.w, safeArea.top);
  ctx.moveTo(0, size.h - safeArea.bottom);
  ctx.lineTo(size.w, size.h - safeArea.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `20px ${theme.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = withAlpha(theme.alert, 0.85);
  ctx.fillText('HOST CHROME — nothing readable here', 26, safeArea.top - 28);
  ctx.fillText('HOST CHROME — handle, caption, buttons', 26, size.h - safeArea.bottom + 10);
  ctx.restore();
}
