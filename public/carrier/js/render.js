/**
 * One frame, from a script and a timestamp.
 *
 * This is the whole engine in one function. The preview loop calls it with the
 * clock; the exporter calls it with a fixed frame cadence; the headless check
 * calls it with a handful of chosen seconds and compares the pixels. Because
 * nothing here reads a global, keeps state between calls, or asks what time it
 * is, those three agree by construction — a frame at t = 7.5 is the same frame
 * whichever of them asked for it, in whatever order.
 *
 * Everything that could have been stateful was pushed elsewhere on purpose:
 * time into `timeline`, randomness into `rain`'s hash, loaded footage into a
 * registry that is read but never written from here.
 *
 * @module carrier/render
 */

import {
  drawCaption, drawGround, drawKicker, drawProgress, drawSafeGuides, drawStats, drawTitle,
  layoutFrame, measureTitleLines,
} from './chrome.js';
import { drawPanel } from './panels/index.js';
import { captionAt, parseTitle } from './script.js';
import { crossfadeAt } from './timeline.js';
import { themeFor } from './theme.js';

/**
 * Draw one scene's contents at a given alpha.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {object} script The parsed script.
 * @param {object} scene The scene.
 * @param {number} tLocal Seconds since the scene started.
 * @param {object} options Render options.
 * @param {object} options.theme Palette.
 * @param {number} options.scale Canvas scale.
 * @param {object} [options.media] Media registry.
 * @param {number} [options.alpha=1] Opacity for the whole scene.
 * @returns {object} The layout used, so callers can place their own overlays.
 */
export function drawScene(ctx, script, scene, tLocal, { theme, scale, media, alpha = 1 }) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const runs = parseTitle(scene.title);
  const probe = layoutFrame({ size: script.size, safeArea: script.safeArea, titleLines: 1 });
  const titleLines = measureTitleLines(ctx, runs, probe.title.w, theme, scale);
  const layout = layoutFrame({
    size: script.size,
    safeArea: script.safeArea,
    titleLines,
    hasStats: scene.stats.length > 0,
  });

  drawKicker(ctx, layout.kicker, scene.kicker, theme);
  drawTitle(ctx, layout.title, runs, theme, scale);
  drawPanel(ctx, layout.panel, { source: scene.source, ...scene.panel }, tLocal, { theme, scale, media });
  drawStats(ctx, layout.stats, scene.stats, theme, scale);

  const caption = captionAt(scene.caption, tLocal);
  drawCaption(ctx, layout.caption, {
    speaker: script.speaker,
    words: caption.words,
    shown: caption.shown,
    highlight: caption.highlight,
    avatar: media?.get?.(script.avatarSlot)?.element ?? null,
  }, theme, scale);

  ctx.restore();
  return layout;
}

/**
 * Draw the episode at a moment.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {object} script The parsed script.
 * @param {{cues: Array<object>, total: number}} timeline The episode clock.
 * @param {number} t Seconds from the top of the episode.
 * @param {object} [options] Render options.
 * @param {object} [options.media] Media registry.
 * @param {boolean} [options.guides=false] Draw the safe-area guides.
 * @returns {object|null} The layout of the incoming scene, or null if the
 *   episode has no scenes.
 */
export function renderFrame(ctx, script, timeline, t, { media, guides = false } = {}) {
  const theme = themeFor(script.theme);
  const scale = script.size.w / 1080;

  drawGround(ctx, script.size, theme, t);

  const cross = crossfadeAt(timeline, t);
  if (!cross) return null;

  if (cross.from && cross.mix < 1) {
    // The outgoing scene is held on its own last frame, not rewound, so a cut
    // dissolves out of what the viewer was actually looking at.
    drawScene(ctx, script, cross.from.scene, cross.from.scene.seconds, {
      theme, scale, media, alpha: 1 - cross.mix,
    });
  }

  const layout = drawScene(ctx, script, cross.to.scene, Math.max(0, t - cross.to.start), {
    theme, scale, media, alpha: cross.mix,
  });

  drawProgress(ctx, layout.progress, timeline, t, theme);
  if (guides) drawSafeGuides(ctx, script.size, script.safeArea, theme);
  return layout;
}
