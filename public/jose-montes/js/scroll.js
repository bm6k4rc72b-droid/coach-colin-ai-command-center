/**
 * The scroll engine.
 *
 * Every motion on this site is a function of one number: how far the page has
 * been scrolled. That keeps the animation reversible — scrub back up and the
 * scene runs backwards exactly — and it keeps the maths testable, because the
 * geometry below is pure arithmetic over rectangles rather than anything that
 * needs a browser.
 *
 * Three ideas do all the work:
 *
 *   1. **Document progress** — the reading position, 0 at the top and 1 at the
 *      bottom, which drives the progress rail and the chapter dots.
 *   2. **Pinning** — a tall section whose inner stage is `position: sticky`.
 *      The stage holds still while the extra height scrolls past it, and the
 *      fraction of that extra height consumed is the scene's timeline.
 *   3. **Reveal and parallax** — a rectangle's position in the viewport,
 *      normalised, then eased, then multiplied by a depth so near layers move
 *      further than far ones.
 *
 * @module jose-montes/scroll
 */

import { EASE, clamp, mix, progress } from './mathkit.js';

/**
 * How far through the document the reader is.
 *
 * @param {number} scrollY Current scroll offset.
 * @param {number} scrollHeight Full document height.
 * @param {number} viewport Viewport height.
 * @returns {number} 0 at the top, 1 at the bottom.
 */
export function documentProgress(scrollY, scrollHeight, viewport) {
  const travel = scrollHeight - viewport;
  if (travel <= 0) return 0;
  return clamp(scrollY / travel, 0, 1);
}

/**
 * The state of a pinned scene.
 *
 * A pinned section is laid out as `viewport * (1 + hold)` tall with a sticky
 * stage inside it. Before the section reaches the top of the viewport the
 * scene is `before`; while the sticky stage is held it is `pinned`; once the
 * extra height is spent it is `after`. `t` runs 0 → 1 across the held part,
 * which is the timeline every scene animation is written against.
 *
 * @param {object} input Geometry.
 * @param {number} input.top Section offset from the top of the document.
 * @param {number} input.height Section height, including the held extra.
 * @param {number} input.scrollY Current scroll offset.
 * @param {number} input.viewport Viewport height.
 * @returns {{ phase: 'before'|'pinned'|'after', t: number, held: number }}
 *   The phase, the scene timeline, and how many pixels have been held.
 */
export function pinState({ top, height, scrollY, viewport }) {
  const hold = Math.max(height - viewport, 0);
  const held = scrollY - top;
  if (held <= 0) return { phase: 'before', t: 0, held: 0 };
  if (hold === 0) return { phase: 'after', t: 1, held: 0 };
  if (held >= hold) return { phase: 'after', t: 1, held: hold };
  return { phase: 'pinned', t: held / hold, held };
}

/**
 * Split a scene timeline into a sub-range with its own easing.
 *
 * Scene beats are written as "between 20% and 55% of this pin, ease out",
 * which is what this turns into a 0–1 number.
 *
 * @param {number} t Scene timeline, 0–1.
 * @param {number} from Start of the beat, 0–1.
 * @param {number} to End of the beat, 0–1.
 * @param {keyof typeof EASE} [ease] Easing name.
 * @returns {number} The beat's own 0–1 progress.
 */
export function beat(t, from, to, ease = 'inOut') {
  const curve = EASE[ease] || EASE.linear;
  return clamp(curve(progress(t, from, to)), 0, 1);
}

/**
 * How revealed an element is, from its viewport rectangle.
 *
 * Zero while the element's top edge is still below `start` (a fraction of the
 * viewport height), one once it has risen to `end`. Elements taller than the
 * viewport are clamped so they cannot stall half-revealed.
 *
 * @param {object} input Geometry.
 * @param {number} input.top Element top, relative to the viewport.
 * @param {number} input.height Element height.
 * @param {number} input.viewport Viewport height.
 * @param {number} [input.start] Fraction of the viewport where the reveal begins.
 * @param {number} [input.end] Fraction where it completes.
 * @returns {number} 0–1 reveal amount.
 */
export function revealAmount({ top, height, viewport, start = 0.92, end = 0.42 }) {
  const span = Math.min(height, viewport);
  const startY = viewport * start;
  const endY = viewport * end - span * 0.12;
  return clamp(progress(top, startY, endY), 0, 1);
}

/**
 * A parallax offset in pixels.
 *
 * `depth` is signed: positive layers trail the scroll (they feel far away),
 * negative layers lead it (they feel close to the reader).
 *
 * @param {object} input Geometry.
 * @param {number} input.top Element top, relative to the viewport.
 * @param {number} input.viewport Viewport height.
 * @param {number} input.depth Depth factor, roughly -1 to 1.
 * @param {number} [input.distance] Maximum travel in pixels.
 * @returns {number} The offset to apply on the Y axis.
 */
export function parallaxOffset({ top, viewport, depth, distance = 160 }) {
  // -1 when the element is a screen below, +1 when a screen above.
  const centred = (viewport / 2 - top) / viewport;
  return clamp(centred, -1.5, 1.5) * depth * distance;
}

/**
 * Interpolate a number for a counter or a readout.
 *
 * @param {number} t Progress, 0–1.
 * @param {number} from Start value.
 * @param {number} to End value.
 * @param {keyof typeof EASE} [ease] Easing name.
 * @returns {number} The interpolated value.
 */
export function countTo(t, from, to, ease = 'out') {
  const curve = EASE[ease] || EASE.linear;
  return mix(from, to, clamp(curve(clamp(t, 0, 1)), 0, 1));
}

/**
 * Which chapter the reader is in.
 *
 * A chapter becomes current once its top edge has passed the marker line —
 * a third of the way down the viewport — which matches where the eye
 * actually is rather than where the section technically begins.
 *
 * @param {Array<{ top: number, height: number }>} chapters Document-space rectangles.
 * @param {number} scrollY Current scroll offset.
 * @param {number} viewport Viewport height.
 * @returns {number} Index of the current chapter, or 0 when above them all.
 */
export function activeChapter(chapters, scrollY, viewport) {
  const marker = scrollY + viewport / 3;
  let index = 0;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i].top <= marker) index = i;
  }
  return index;
}

/**
 * Turn a wheel, touch or air-gesture impulse into a smoothed scroll delta.
 *
 * Raw input is spiky — trackpads fire fractional pixels, phones fire bursts,
 * the camera gesture fires whatever a hand happened to do. This clamps a
 * single impulse so no one input can throw the page across three chapters,
 * then blends it with the momentum already in flight.
 *
 * @param {number} momentum Current velocity, pixels per frame.
 * @param {number} impulse New input this frame, pixels.
 * @param {object} [options] Tuning.
 * @param {number} [options.limit] Largest impulse honoured in one frame.
 * @param {number} [options.friction] Fraction of momentum kept each frame.
 * @returns {number} The new momentum.
 */
export function integrateImpulse(momentum, impulse, { limit = 140, friction = 0.86 } = {}) {
  const capped = clamp(impulse, -limit, limit);
  const next = momentum * friction + capped * (1 - friction) * 4;
  return Math.abs(next) < 0.04 ? 0 : next;
}
