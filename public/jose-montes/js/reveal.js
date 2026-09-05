/**
 * Binding the scroll engine to the page.
 *
 * The maths lives in `scroll.js`; this is the part that reads the document
 * and writes the results. Two rules keep it fast:
 *
 *  1. **One read phase, one write phase.** Every rectangle is measured before
 *     anything is written, so the browser never has to reflow mid-frame.
 *  2. **Custom properties, not inline transforms.** Each element is told its
 *     progress as `--reveal`, `--shift` or `--t`, and the stylesheet decides
 *     what that means. The choreography stays in CSS where it belongs, and an
 *     element can respond to the same number in a completely different way
 *     without touching this file.
 *
 * @module jose-montes/reveal
 */

import { activeChapter, countTo, documentProgress, parallaxOffset, pinState, revealAmount } from './scroll.js';
import { clamp } from './mathkit.js';

/**
 * The choreographer.
 */
export class Director {
  /**
   * @param {object} [hooks] Callbacks.
   * @param {(id: string, t: number, phase: string) => void} [hooks.onPin]
   *   Fired every frame for each pinned scene.
   * @param {(progress: number, chapter: number) => void} [hooks.onProgress]
   *   Fired when the reading position changes.
   */
  constructor({ onPin, onProgress } = {}) {
    this.onPin = onPin || null;
    this.onProgress = onProgress || null;
    this.reveals = [];
    this.parallax = [];
    this.pins = [];
    this.counters = [];
    this.chapters = [];
    this.progress = 0;
    this.chapter = -1;
    this.frame = null;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  }

  /**
   * Scan the document and take hold of everything marked up for motion.
   */
  register() {
    const q = (selector) => Array.from(document.querySelectorAll(selector));
    this.reveals = q('[data-reveal]').map((el) => ({
      el,
      start: Number(el.dataset.revealStart || 0.92),
      end: Number(el.dataset.revealEnd || 0.42),
      value: -1,
    }));
    this.parallax = q('[data-parallax]').map((el) => ({
      el,
      depth: Number(el.dataset.parallax || 0.2),
      distance: Number(el.dataset.parallaxDistance || 140),
      value: null,
    }));
    this.pins = q('[data-pin]').map((el) => ({ el, id: el.dataset.pin, value: -1, phase: '' }));
    this.counters = q('[data-count]').map((el) => ({
      el,
      to: Number(el.dataset.count),
      from: Number(el.dataset.countFrom || 0),
      decimals: Number(el.dataset.countDecimals || 0),
      prefix: el.dataset.countPrefix || '',
      suffix: el.dataset.countSuffix || '',
      done: false,
    }));
    this.chapters = q('[data-chapter]');
  }

  /**
   * Start the loop.
   */
  start() {
    if (this.frame) return;
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.update();
    };
    this.frame = requestAnimationFrame(loop);
  }

  /**
   * Stop the loop.
   */
  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * Measure everything, then write everything.
   */
  update() {
    const viewport = window.innerHeight;
    const scrollY = window.scrollY || window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight;

    // --- read -------------------------------------------------------------
    const reveals = this.reveals.map((item) => {
      const rect = item.el.getBoundingClientRect();
      return revealAmount({
        top: rect.top,
        height: rect.height,
        viewport,
        start: item.start,
        end: item.end,
      });
    });
    const parallax = this.parallax.map((item) => {
      const rect = item.el.getBoundingClientRect();
      return parallaxOffset({
        top: rect.top,
        viewport,
        depth: item.depth,
        distance: item.distance,
      });
    });
    const pins = this.pins.map((item) => {
      const rect = item.el.getBoundingClientRect();
      return pinState({
        top: scrollY + rect.top,
        height: rect.height,
        scrollY,
        viewport,
      });
    });
    const chapterRects = this.chapters.map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: scrollY + rect.top, height: rect.height };
    });

    // --- write ------------------------------------------------------------
    this.reveals.forEach((item, i) => {
      const value = this.reduced ? 1 : reveals[i];
      if (Math.abs(value - item.value) < 0.002) return;
      item.value = value;
      item.el.style.setProperty('--reveal', value.toFixed(4));
      item.el.classList.toggle('is-revealed', value > 0.6);
    });

    this.parallax.forEach((item, i) => {
      const value = this.reduced ? 0 : parallax[i];
      if (item.value !== null && Math.abs(value - item.value) < 0.15) return;
      item.value = value;
      item.el.style.setProperty('--shift', `${value.toFixed(2)}px`);
    });

    this.pins.forEach((item, i) => {
      const { t, phase } = pins[i];
      if (Math.abs(t - item.value) > 0.0015 || phase !== item.phase) {
        item.value = t;
        item.phase = phase;
        item.el.style.setProperty('--t', t.toFixed(4));
        item.el.dataset.phase = phase;
        this.onPin?.(item.id, t, phase);
      }
    });

    this.counters.forEach((item) => {
      if (item.done) return;
      const rect = item.el.getBoundingClientRect();
      const seen = revealAmount({ top: rect.top, height: rect.height, viewport, start: 0.95, end: 0.55 });
      const value = countTo(this.reduced ? 1 : seen, item.from, item.to);
      item.el.textContent = `${item.prefix}${value.toLocaleString('en-US', {
        minimumFractionDigits: item.decimals,
        maximumFractionDigits: item.decimals,
      })}${item.suffix}`;
      if (seen >= 1) item.done = true;
    });

    const progress = documentProgress(scrollY, docHeight, viewport);
    const chapter = activeChapter(chapterRects, scrollY, viewport);
    if (Math.abs(progress - this.progress) > 0.0008 || chapter !== this.chapter) {
      this.progress = progress;
      this.chapter = chapter;
      document.documentElement.style.setProperty('--progress', progress.toFixed(4));
      this.onProgress?.(progress, chapter);
    }
  }

  /**
   * Scroll to a section by id, honouring reduced-motion.
   *
   * @param {string} id Element id.
   */
  goto(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /**
   * Scroll one screen, for the voice and keyboard paths.
   *
   * @param {'up'|'down'} direction Which way.
   */
  nudge(direction) {
    const amount = window.innerHeight * 0.85 * (direction === 'up' ? -1 : 1);
    window.scrollBy({ top: amount, behavior: this.reduced ? 'auto' : 'smooth' });
  }

  /**
   * How far through the document the reader is.
   *
   * @returns {number} 0–1.
   */
  get reading() {
    return clamp(this.progress, 0, 1);
  }
}
