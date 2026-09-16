/**
 * The scroll timeline — the whole film runs off one number.
 *
 * A scroll-driven film has exactly one clock: how far down the document you
 * are. Everything else — where the operator stands, how open the letterbox is,
 * which voice is speaking, how far a parallax plate has drifted — is a pure
 * function of that clock. Nothing here listens to a scroll event, animates on a
 * timer, or keeps state between frames. Ask for the state at a scroll position
 * and you get it, deterministically, which is why the whole timeline is
 * testable without a browser.
 *
 * Two rules keep it from feeling like a slideshow:
 *
 * - **Scenes overlap.** Each scene owns a span of the document plus a lead-in
 *   and a lead-out that bleed into its neighbours. A cut on a hard boundary
 *   reads as a page change; a cross-dissolve reads as a camera move.
 * - **Easing lives at the edges, never in the middle.** The centre of a scene
 *   is linear, so scrubbing feels connected to the finger. The ends ease, so
 *   arrivals and departures settle instead of stopping dead.
 *
 * @module black-optic-6-site/timeline
 */

/** Anamorphic aspect — Panavision's 2.39:1, the one that makes a frame read as film. */
export const ANAMORPHIC = 2.39;

/** Clamp to the unit interval. */
export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Linear interpolation, clamped. */
export function lerp(from, to, t) {
  return from + (to - from) * clamp01(t);
}

/**
 * Where a position sits inside a span, as 0..1.
 *
 * Returns 0 below the span and 1 above it, so a caller can use the result
 * directly without guarding the ends.
 */
export function progressThrough(position, start, end) {
  if (!(end > start)) return position >= end ? 1 : 0;
  return clamp01((position - start) / (end - start));
}

/** Smooth both ends. The classic smoothstep — cheap, and it never overshoots. */
export function easeInOut(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Decelerate into rest. For arrivals. */
export function easeOut(t) {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

/** Accelerate out of rest. For departures. */
export function easeIn(t) {
  const x = clamp01(t);
  return x * x;
}

/**
 * Ease only the outer `edge` fraction, leaving the middle linear.
 *
 * This is the function that makes scrubbing feel attached to the finger. With
 * `edge = 0.25`, the first and last quarter of a move ease and the middle half
 * tracks the scroll one-to-one.
 */
export function easeEdges(t, edge = 0.25) {
  const x = clamp01(t);
  const e = Math.min(Math.max(edge, 0.0001), 0.5);
  if (x < e) return easeIn(x / e) * e;
  if (x > 1 - e) return 1 - e + easeOut((x - (1 - e)) / e) * e;
  return x;
}

/**
 * A 0 → 1 → 0 envelope: rise, hold, fall.
 *
 * Scene opacity, in one call. `rise` and `fall` are fractions of the span, so a
 * scene that should be fully present for its middle third passes 0.33 / 0.33.
 */
export function envelope(t, rise = 0.2, fall = 0.2) {
  const x = clamp01(t);
  const up = rise > 0 ? easeInOut(clamp01(x / rise)) : 1;
  const down = fall > 0 ? easeInOut(clamp01((1 - x) / fall)) : 1;
  return Math.min(up, down);
}

/**
 * Parallax offset in pixels for a plate at a given depth.
 *
 * `depth` is how far behind the page the plate sits: 0 rides with the scroll
 * exactly, 1 is pinned to the viewport and appears infinitely far away.
 * Negative depth pushes a plate *in front* of the page, which is how foreground
 * grass and lens dirt get their overshoot.
 */
export function parallax(scrolled, depth, span = 1) {
  if (!Number.isFinite(scrolled)) return 0;
  return -scrolled * depth * span;
}

/**
 * The letterbox for a viewport.
 *
 * The frame is as wide as the viewport and as tall as the aspect allows; the
 * leftover height is split into two matte bars. When the viewport is already
 * wider than the aspect — a short landscape window — there is nothing to matte
 * and the bars go to zero rather than negative.
 */
export function letterbox(width, height, ratio = ANAMORPHIC) {
  const w = Math.max(width, 0);
  const h = Math.max(height, 0);
  const frameHeight = Math.min(h, w / ratio);
  const bar = Math.max((h - frameHeight) / 2, 0);
  return { width: w, height: frameHeight, bar, top: bar, bottom: bar };
}

/**
 * A scene's span in the document, plus the bleed into its neighbours.
 *
 * @typedef {object} Scene
 * @property {string} id
 * @property {number} start Document position where the scene begins, 0..1.
 * @property {number} end Where it ends.
 * @property {number} [bleed] Fraction of its own length it overlaps neighbours by.
 */

/**
 * Lay scenes out end to end, weighted.
 *
 * A scene with `weight: 2` gets twice the scroll distance of a `weight: 1`
 * scene — which is how a section with thirteen thermal palettes gets room to
 * breathe while a title card does not linger.
 */
export function layout(scenes, bleed = 0.15) {
  const total = scenes.reduce((sum, scene) => sum + (scene.weight || 1), 0) || 1;
  let cursor = 0;
  return scenes.map((scene) => {
    const share = (scene.weight || 1) / total;
    const start = cursor;
    cursor += share;
    return Object.freeze({ ...scene, start, end: cursor, span: share, bleed });
  });
}

/**
 * Every scene's state at a document position.
 *
 * Returns one entry per scene with its local progress and presence, so a
 * renderer can cross-dissolve without asking which scene is "current". The
 * `active` field names the scene with the highest presence, for the things that
 * genuinely can only be one at a time — the voice that is speaking, the label
 * in the corner.
 */
export function stateAt(position, scenes) {
  const p = clamp01(position);
  const states = scenes.map((scene) => {
    const bleed = (scene.bleed ?? 0.15) * scene.span;
    const from = scene.start - bleed;
    const to = scene.end + bleed;
    const local = progressThrough(p, scene.start, scene.end);
    const wide = progressThrough(p, from, to);
    const presence = p < from || p > to ? 0 : envelope(wide, 0.28, 0.28);
    return { id: scene.id, progress: local, presence, entered: p >= from, span: scene.span };
  });
  let active = states[0];
  for (const state of states) if (state.presence > (active?.presence ?? 0)) active = state;
  return { position: p, scenes: states, active: active ? active.id : null };
}

/**
 * Total document height for a given scene list and viewport.
 *
 * Each unit of weight buys `perScreen` viewport heights of scroll. Short enough
 * that the film does not outlast anybody's patience, long enough that the
 * easing has room to read.
 */
export function documentHeight(scenes, viewportHeight, perScreen = 1.35) {
  const total = scenes.reduce((sum, scene) => sum + (scene.weight || 1), 0) || 1;
  return Math.round(viewportHeight * (1 + total * perScreen));
}

/** Document position from a raw scrollTop, given the scrollable range. */
export function positionFrom(scrollTop, documentPixels, viewportHeight) {
  const range = Math.max(documentPixels - viewportHeight, 1);
  return clamp01(scrollTop / range);
}
