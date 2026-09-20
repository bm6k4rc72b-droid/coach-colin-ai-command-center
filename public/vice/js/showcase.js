/**
 * The rack.
 *
 * A horizontal 3D showcase of the apps that slides sideways while its section
 * is pinned, turns each card away from the reader as it leaves the middle, and
 * can also be dragged or flicked directly.
 *
 * Two details do most of the work. The cards are transformed in a real
 * perspective context rather than being scaled, so a card leaving the frame
 * genuinely rotates away rather than shrinking — the difference is obvious the
 * moment you see both. And the rack accepts input from three places (the
 * scroll timeline, a pointer drag, and the keyboard) which all write to the
 * same position, so they can never fight each other.
 *
 * @module vice/showcase
 */

import { clamp, mix } from './mathkit.js';
import { cardTransform } from './scroll.js';

/**
 * Build a card's markup for one app.
 *
 * @param {object} app A record from `apps.js`.
 * @param {number} index Position in the rack.
 * @returns {string} HTML.
 */
function cardMarkup(app, index) {
  // The rack's shots are fixed-height boxes, so `object-fit` crops them and no
  // intrinsic size is needed — but the attribute pair is still written so the
  // browser reserves the box before the file arrives.
  const media = app.media
    ? `<div class="rack-shot"><img src="${app.media}" alt="${app.mediaAlt || ''}"` +
      ' width="600" height="1298" loading="lazy" decoding="async"></div>'
    : '<div class="rack-shot is-empty" aria-hidden="true"></div>';
  const points = (app.points || []).map((point) => `<li>${point}</li>`).join('');
  const link = app.href
    ? `<a class="btn small" href="${app.href}"${app.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${app.cta || 'Open'}</a>`
    : '<a class="btn small ghost" href="#hire">Ask about it</a>';
  return `
    <article class="rack-card" data-index="${index}" style="--accent:${app.accent}">
      <header>
        <span class="rack-tier">${app.tier}</span>
        <h3>${app.name}</h3>
        <p class="rack-tagline">${app.tagline}</p>
      </header>
      ${media}
      <p class="rack-blurb">${app.blurb}</p>
      <ul class="rack-points">${points}</ul>
      <footer>
        <span class="rack-audience">${app.audience || ''}</span>
        ${link}
      </footer>
    </article>`;
}

/**
 * The showcase.
 */
export class Showcase {
  /**
   * @param {HTMLElement} root The rack container.
   * @param {object[]} apps Apps to show, already in billing order.
   * @param {object} [options] `{ onFocus }`.
   */
  constructor(root, apps, options = {}) {
    this.root = root;
    this.apps = apps;
    this.onFocus = options.onFocus || (() => {});
    this.position = 0;
    this.target = 0;
    this.dragging = false;
    this.dragFrom = 0;
    this.dragStart = 0;
    this.focused = -1;
    this.cards = [];
    this.locked = false;
  }

  /** Render the cards and wire the direct-manipulation input. */
  build() {
    if (!this.root) return;
    this.root.innerHTML = this.apps.map(cardMarkup).join('');
    this.cards = Array.from(this.root.querySelectorAll('.rack-card'));
    this.root.setAttribute('tabindex', '0');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Apps — use the left and right arrow keys, or scroll');

    this.root.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.locked = true;
      this.dragStart = event.clientX;
      this.dragFrom = this.target;
      this.root.setPointerCapture(event.pointerId);
      this.root.classList.add('is-dragging');
    });
    this.root.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const width = this.cardWidth();
      this.target = clamp(this.dragFrom - (event.clientX - this.dragStart) / width, 0, this.max);
    });
    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.target = clamp(Math.round(this.target), 0, this.max);
      this.root.classList.remove('is-dragging');
    };
    this.root.addEventListener('pointerup', release);
    this.root.addEventListener('pointercancel', release);

    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      this.locked = true;
      this.target = clamp(this.target + (event.key === 'ArrowRight' ? 1 : -1), 0, this.max);
    });
  }

  /** How far the rack can travel, in cards. */
  get max() {
    return Math.max(this.apps.length - 1, 0);
  }

  /** One card's width plus its gap, measured rather than assumed. */
  cardWidth() {
    if (!this.cards.length) return 320;
    // Measured from the element rather than the transformed rectangle, which
    // is already scaled and rotated by the time this is asked for.
    const width = this.cards[0].offsetWidth;
    return Math.max(width + 26, 120);
  }

  /**
   * Drive the rack from its section's scroll timeline.
   *
   * Once the reader has touched the rack directly, scroll stops moving it —
   * having the page yank a card out from under a finger is the single most
   * irritating thing a showcase like this can do.
   *
   * @param {number} t Section timeline, 0–1.
   */
  setTimeline(t) {
    if (this.locked) return;
    this.target = clamp(t, 0, 1) * this.max;
  }

  /**
   * Ease towards the target and write the transforms.
   *
   * @param {number} dt Seconds since the last frame.
   */
  update(dt) {
    if (!this.cards.length) return;
    const k = 1 - Math.exp(-12 * dt);
    this.position += (this.target - this.position) * k;
    const width = this.cardWidth();
    const focus = Math.round(this.position);

    for (let i = 0; i < this.cards.length; i += 1) {
      // Every card sits at the same `left`; its place in the rack is the
      // translation. The distance from the focused position drives both the
      // offset and the turn, so one number moves the whole rack.
      const distance = i - this.position;
      const transform = cardTransform(distance);
      const card = this.cards[i];
      card.style.transform =
        `translateX(${(distance * width).toFixed(1)}px) ` +
        `translateZ(${transform.translateZ.toFixed(1)}px) ` +
        `rotateY(${transform.rotateY.toFixed(2)}deg) ` +
        `scale(${transform.scale.toFixed(3)})`;
      card.style.opacity = transform.opacity.toFixed(3);
      card.style.zIndex = String(100 - Math.round(Math.abs(distance) * 10));
      card.classList.toggle('is-focused', i === focus);
      card.setAttribute('aria-hidden', Math.abs(distance) > 2.4 ? 'true' : 'false');
    }

    if (focus !== this.focused && this.apps[focus]) {
      this.focused = focus;
      this.onFocus(this.apps[focus], focus);
    }
  }

  /**
   * Jump to a card.
   *
   * @param {number} index Card index.
   */
  focus(index) {
    this.locked = true;
    this.target = clamp(index, 0, this.max);
  }

  /**
   * A readable position for the caption under the rack.
   *
   * @returns {string} e.g. `03 / 11`.
   */
  label() {
    const index = clamp(Math.round(this.position) + 1, 1, this.apps.length);
    return `${String(index).padStart(2, '0')} / ${String(this.apps.length).padStart(2, '0')}`;
  }
}

/** Exported for the tests: how wide the rack's travel is in cards. */
export function rackTravel(count) {
  return Math.max(count - 1, 0);
}

/** Exported for the tests: the transform applied at a given distance. */
export { cardTransform };

/** How opaque the rack's backdrop should be at a given timeline position. */
export function backdrop(t) {
  return mix(0.2, 0.72, clamp(t, 0, 1));
}
