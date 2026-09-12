/**
 * Reading position, and everything derived from it.
 *
 * The pure half — {@link documentProgress}, {@link revealAmount},
 * {@link parallaxShift}, {@link railSegments} — is arithmetic over rectangles
 * and is tested without a browser. The {@link Director} at the bottom is the
 * thin layer that reads those rectangles off the real DOM once per frame.
 *
 * One measurement pass per frame, batched, and nothing in the render path
 * writes a style that then forces a re-measure. That discipline is the whole
 * reason a page with this much going on stays smooth: layout thrash, not
 * drawing, is what kills scroll-linked sites.
 *
 * @module vice/scroll
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
 * How revealed an element is, from its viewport rectangle.
 *
 * Zero while the element's top edge is still below `start` (a fraction of the
 * viewport height), one once it has risen to `end`. Elements taller than the
 * viewport are clamped so nothing can stall half-revealed forever.
 *
 * @param {object} input Geometry.
 * @param {number} input.top Element top, relative to the viewport.
 * @param {number} input.height Element height.
 * @param {number} input.viewport Viewport height.
 * @param {number} [input.start] Trigger point, as a fraction of the viewport.
 * @param {number} [input.end] Completion point, same units.
 * @returns {number} Reveal amount, 0–1.
 */
export function revealAmount({ top, height, viewport, start = 0.92, end = 0.42 }) {
  if (viewport <= 0) return 0;
  const from = viewport * start;
  const to = viewport * end;
  const raw = progress(top, from, to);
  // An element that has already left the top of the screen is fully revealed,
  // whatever its height says.
  if (top + height < viewport * 0.1) return 1;
  return clamp(raw, 0, 1);
}

/**
 * How far a parallax layer should be displaced.
 *
 * @param {object} input Geometry.
 * @param {number} input.top Element top, relative to the viewport.
 * @param {number} input.height Element height.
 * @param {number} input.viewport Viewport height.
 * @param {number} input.depth Negative moves against the scroll, positive with it.
 * @returns {number} Displacement in pixels.
 */
export function parallaxShift({ top, height, viewport, depth }) {
  if (viewport <= 0) return 0;
  const centre = top + height / 2;
  const offset = (centre - viewport / 2) / viewport;
  return -offset * depth * viewport * 0.5;
}

/**
 * The progress rail, split into one segment per act.
 *
 * @param {object[]} acts Acts with `from`/`to`.
 * @param {number} p Document progress.
 * @returns {object[]} `{ id, width, fill }` per act, widths summing to 1.
 */
export function railSegments(acts, p) {
  return acts.map((act) => ({
    id: act.id,
    chapter: act.chapter,
    width: act.to - act.from,
    fill: progress(clamp(p, 0, 1), act.from, act.to),
    active: p >= act.from && p < act.to,
  }));
}

/**
 * A horizontal rack's position, from a vertical scroll.
 *
 * The showcase is a row of cards that slides sideways while its section is
 * pinned. This turns the section's own 0–1 timeline into "how many cards
 * along" plus a per-card angle for the 3D rotation.
 *
 * @param {object} input Geometry.
 * @param {number} input.t Section timeline, 0–1.
 * @param {number} input.count How many cards.
 * @param {number} [input.visible] How many fit on screen.
 * @returns {{ offset: number, index: number }} Cards scrolled, and the focused index.
 */
export function rackPosition({ t, count, visible = 1.6 }) {
  const travel = Math.max(count - visible, 0);
  const offset = clamp(t, 0, 1) * travel;
  return { offset, index: Math.round(offset) };
}

/**
 * How a rack card should be transformed, given its distance from focus.
 *
 * Cards turn away from the reader as they leave the middle and drop back in Z,
 * which is what makes a row of divs read as a rack of objects rather than a
 * carousel.
 *
 * @param {number} distance Signed card distance from the focused position.
 * @returns {object} `{ rotateY, translateZ, opacity, scale }`.
 */
export function cardTransform(distance) {
  const d = clamp(Math.abs(distance), 0, 3);
  return {
    rotateY: clamp(distance, -2.4, 2.4) * -19,
    translateZ: mix(0, -320, EASE.out(d / 3)),
    opacity: mix(1, 0.24, EASE.out(clamp(d / 2.6, 0, 1))),
    scale: mix(1, 0.82, EASE.out(clamp(d / 3, 0, 1))),
  };
}

/**
 * Build the map from scroll pixels to act progress.
 *
 * The naive approach — progress is `scrollY / travel`, and the sections are
 * laid out to be the right height — works right up until a paragraph wraps
 * differently on somebody's phone and the whole film is half an act behind the
 * copy it is supposed to be scoring.
 *
 * So the mapping is measured instead. Each act names the scroll offset at
 * which its first section reaches the top of the viewport; between two
 * anchors, progress is interpolated linearly across that act's own span. The
 * result is that "the gunships arrive at 50%" is not a claim about section
 * heights, it is a guarantee: the gunships arrive when the cavalry section
 * does, at whatever height it turned out to be.
 *
 * @param {Array<{ id: string, from: number, to: number }>} acts The act table.
 * @param {Map<string, number>|object} tops Scroll offset of each act's first section.
 * @param {number} travel Scrollable distance, `scrollHeight - viewport`.
 * @returns {Array<{ id: string, pixels: number[], span: number[] }>} Segments in order.
 */
export function actScrollMap(acts, tops, travel) {
  const read = (id) => (tops instanceof Map ? tops.get(id) : tops[id]);
  const segments = [];
  for (let i = 0; i < acts.length; i += 1) {
    const start = read(acts[i].id);
    if (!Number.isFinite(start)) continue;
    let end = travel;
    for (let j = i + 1; j < acts.length; j += 1) {
      const next = read(acts[j].id);
      if (Number.isFinite(next)) { end = next; break; }
    }
    segments.push({
      id: acts[i].id,
      pixels: [clamp(start, 0, travel), clamp(Math.max(end, start), 0, travel)],
      span: [acts[i].from, acts[i].to],
    });
  }
  return segments;
}

/**
 * Turn a scroll offset into document progress through the measured map.
 *
 * Falls back to the plain ratio when there is no usable map, so the page still
 * runs its film before the first measurement pass or if the markup changes.
 *
 * @param {number} scrollY Current scroll offset.
 * @param {object[]} segments From {@link actScrollMap}.
 * @param {number} travel Scrollable distance.
 * @returns {number} Document progress, 0–1.
 */
export function progressFromMap(scrollY, segments, travel) {
  if (!segments || !segments.length) return documentProgress(scrollY, travel + 1, 1);
  const y = clamp(scrollY, 0, travel);
  if (y < segments[0].pixels[0]) return clamp(segments[0].span[0], 0, 1);
  for (const segment of segments) {
    const [from, to] = segment.pixels;
    // The upper bound is exclusive: a scroll offset that is exactly a
    // section's top belongs to that section, not to the one above it, or
    // every act would be announced one pixel late.
    if (y >= to) continue;
    if (y < from) break;
    const within = to > from ? (y - from) / (to - from) : 0;
    return clamp(mix(segment.span[0], segment.span[1], within), 0, 1);
  }
  return clamp(segments[segments.length - 1].span[1], 0, 1);
}

/**
 * The measurement and reveal loop.
 *
 * Registers elements once, then on each frame measures them in one pass and
 * writes the results back as CSS custom properties and a class. Elements opt
 * in with `data-reveal`, `data-parallax` and `data-counter` attributes, so the
 * markup stays declarative and nothing here needs to know what the page is
 * about.
 */
export class Director {
  /**
   * @param {ParentNode} [root] Where to look for participating elements.
   */
  constructor(root = document) {
    this.root = root;
    this.reveals = [];
    this.parallax = [];
    this.counters = [];
    this.viewport = window.innerHeight;
  }

  /** Collect the elements to drive. Safe to call again after DOM changes. */
  collect() {
    this.reveals = Array.from(this.root.querySelectorAll('[data-reveal]'));
    this.parallax = Array.from(this.root.querySelectorAll('[data-parallax]'));
    this.counters = Array.from(this.root.querySelectorAll('[data-counter]')).map((el) => ({
      el,
      to: Number(el.dataset.counter),
      prefix: el.dataset.counterPrefix || '',
      suffix: el.dataset.counterSuffix || '',
      decimals: Number(el.dataset.counterDecimals || 0),
      done: false,
    }));
  }

  /** One measurement and write pass. */
  update() {
    this.viewport = window.innerHeight;

    for (const el of this.reveals) {
      const rect = el.getBoundingClientRect();
      const amount = revealAmount({ top: rect.top, height: rect.height, viewport: this.viewport });
      el.style.setProperty('--reveal', amount.toFixed(3));
      el.classList.toggle('is-revealed', amount > 0.02);
    }

    for (const el of this.parallax) {
      const rect = el.getBoundingClientRect();
      const depth = Number(el.dataset.parallax) || 0;
      const shift = parallaxShift({
        top: rect.top, height: rect.height, viewport: this.viewport, depth,
      });
      el.style.setProperty('--parallax', `${shift.toFixed(1)}px`);
    }

    for (const counter of this.counters) {
      if (counter.done) continue;
      const rect = counter.el.getBoundingClientRect();
      const amount = revealAmount({
        top: rect.top, height: rect.height, viewport: this.viewport, start: 0.9, end: 0.55,
      });
      const value = counter.to * EASE.out(amount);
      counter.el.textContent =
        `${counter.prefix}${value.toLocaleString('en-US', {
          minimumFractionDigits: counter.decimals,
          maximumFractionDigits: counter.decimals,
        })}${counter.suffix}`;
      if (amount >= 1) counter.done = true;
    }
  }
}
