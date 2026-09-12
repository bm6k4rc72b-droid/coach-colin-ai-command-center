/**
 * The lens.
 *
 * Everything up to this point draws objects. This module draws the *camera* —
 * the bloom around bright things, the haze between the viewer and the far
 * towers, the anamorphic streak off a headlight, and the colour grade over the
 * top. It is the difference between a picture of a city and a frame of a film,
 * and on a 2D canvas it is almost entirely one trick: draw the bright parts
 * again, blurred, and add them back.
 *
 * The trick is only affordable because of where it is done. A full-resolution
 * `filter: blur(24px)` across the viewport costs more than the entire rest of
 * the frame. So the bright pass is kept on its own canvas at a quarter of the
 * linear resolution — a sixteenth of the pixels — blurred there, and scaled
 * back up on the way in. Bloom is low-frequency by definition, so the
 * downsample is invisible, and the cost drops by more than an order of
 * magnitude.
 *
 * Everything here degrades rather than fails. If `ctx.filter` is missing the
 * bloom is skipped, the grade still runs, and the page looks like it did
 * before rather than breaking.
 *
 * @module vice/grade
 */

import { clamp, css, mix, progress } from './mathkit.js';

/** How much smaller the bright-pass buffer is than the frame. */
const BLOOM_SCALE = 0.25;

/**
 * Whether this browser can blur on a canvas at all.
 *
 * @param {CanvasRenderingContext2D} ctx Any 2D context.
 * @returns {boolean} Support flag.
 */
export function canBlur(ctx) {
  if (!ctx || typeof ctx.filter !== 'string') return false;
  const before = ctx.filter;
  ctx.filter = 'blur(2px)';
  const supported = ctx.filter !== 'none';
  ctx.filter = before;
  return supported;
}

/**
 * The post-processing chain.
 *
 * Owns one small offscreen buffer and reuses it for the life of the page.
 */
export class Lens {
  constructor() {
    this.buffer = null;
    this.bufferCtx = null;
    this.enabled = true;
    this.slow = 0;
    this.radius = 4;
  }

  /**
   * Size the bright-pass buffer to the frame.
   *
   * @param {number} width Frame width in device pixels.
   * @param {number} height Frame height in device pixels.
   */
  resize(width, height) {
    const w = Math.max(1, Math.round(width * BLOOM_SCALE));
    const h = Math.max(1, Math.round(height * BLOOM_SCALE));
    if (!this.buffer) {
      this.buffer = document.createElement('canvas');
      this.bufferCtx = this.buffer.getContext('2d', { willReadFrequently: false });
    }
    if (this.buffer.width !== w || this.buffer.height !== h) {
      this.buffer.width = w;
      this.buffer.height = h;
    }
    // A radius in buffer pixels. Scaled against the buffer's own size so the
    // halo is the same fraction of the screen on a phone and on a monitor.
    this.radius = clamp(Math.round(w * 0.012), 2, 7);
    this.enabled = canBlur(this.bufferCtx);
  }

  /**
   * Add bloom from the frame that has just been drawn.
   *
   * The bright pass is extracted by drawing the frame into the small buffer
   * and then crushing the shadows with a `multiply` of itself — a cheap
   * approximation of a luminance threshold that keeps the neon and the
   * fireball and drops the asphalt.
   *
   * **The blur happens inside the small buffer, never on the way out.** A
   * `blur(18px)` applied while compositing a full-viewport image is one of the
   * most expensive operations available on a 2D canvas; the same visual result
   * costs a fraction of that as a `blur(4px)` on a quarter-scale buffer, and
   * the upscale on the way back smooths it further for free. Getting this the
   * wrong way round drops the page from 60fps to about one frame every two
   * seconds, so it is worth being explicit about.
   *
   * @param {CanvasRenderingContext2D} ctx The frame's context.
   * @param {HTMLCanvasElement} source The frame's canvas.
   * @param {object} view Viewport, `{ w, h }` in CSS pixels.
   * @param {number} amount 0–1, how much bloom this frame wants.
   */
  bloom(ctx, source, view, amount) {
    if (!this.enabled || amount <= 0.01 || !this.buffer) return;
    const { buffer, bufferCtx } = this;

    bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
    bufferCtx.globalCompositeOperation = 'source-over';
    bufferCtx.globalAlpha = 1;
    bufferCtx.filter = 'none';
    bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
    bufferCtx.drawImage(source, 0, 0, buffer.width, buffer.height);

    // Square the image against itself: mid-tones fall away fast, the brightest
    // pixels survive nearly intact.
    bufferCtx.globalCompositeOperation = 'multiply';
    bufferCtx.drawImage(buffer, 0, 0);
    bufferCtx.globalCompositeOperation = 'source-over';

    // Blur in place, at buffer scale. One pass, small radius, cheap.
    bufferCtx.filter = `blur(${this.radius}px)`;
    bufferCtx.drawImage(buffer, 0, 0);
    bufferCtx.filter = 'none';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(amount, 0, 1);
    ctx.drawImage(buffer, 0, 0, view.w, view.h);
    ctx.restore();
  }

  /**
   * Anamorphic streaks off the brightest points in the scene.
   *
   * A horizontal smear of the already-blurred bright pass — what a spherical
   * lens does to a point light, and what every film about this city did on
   * purpose. Reuses the buffer {@link Lens#bloom} just built, so it costs one
   * more `drawImage` and no additional blur.
   *
   * @param {CanvasRenderingContext2D} ctx The frame's context.
   * @param {object} view Viewport.
   * @param {number} amount 0–1.
   */
  streak(ctx, view, amount) {
    if (!this.enabled || amount <= 0.01 || !this.buffer) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(amount * 0.42, 0, 1);
    ctx.drawImage(this.buffer, -view.w * 0.5, 0, view.w * 2, view.h);
    ctx.restore();
  }

  /**
   * Report how long the last frame took, so the lens can stand down.
   *
   * A phone that cannot afford bloom should lose the bloom, not the frame
   * rate — a smooth plain city beats a beautiful slideshow. Three consecutive
   * slow frames turn it off; it does not come back on by itself, because a
   * bloom that flickers in and out with the frame rate is worse than either.
   *
   * @param {number} ms Milliseconds the last frame took.
   */
  observe(ms) {
    if (!this.enabled) return;
    this.slow = ms > 34 ? (this.slow || 0) + 1 : 0;
    if (this.slow >= 3) this.enabled = false;
  }
}

/**
 * Depth haze: the air between the camera and a parallax band.
 *
 * Far things in a real city are not just smaller and darker, they are *bluer
 * and lower contrast*, because there is a kilometre of lit air in the way.
 * Painting that air explicitly is what stops a generated skyline reading as
 * cardboard cut-outs on a shelf.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport, `{ w, horizon }`.
 * @param {number[]} tint The colour of the air, usually the low sky.
 * @param {number} strength 0–1.
 * @param {number} top Where the haze starts, in pixels.
 */
export function haze(ctx, view, tint, strength, top = 0) {
  if (strength <= 0.005) return;
  const depth = view.horizon - top;
  if (depth <= 0) return;
  const gradient = ctx.createLinearGradient(0, top, 0, view.horizon);
  gradient.addColorStop(0, css(tint, strength * 0.28));
  gradient.addColorStop(1, css(tint, strength));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, view.w, depth + 1);
  ctx.restore();
}

/**
 * Volumetric shafts from the low sun.
 *
 * Wedges of light fanning up from the horizon, brightest near the source. Only
 * drawn while the sun is actually in the sky, because light shafts with no sun
 * is the single most common way a scene like this goes wrong.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport.
 * @param {object} scene Scene state.
 * @param {number} time Seconds since boot.
 */
export function godRays(ctx, view, scene, time) {
  const amount = scene.sun * 0.28;
  if (amount <= 0.01) return;
  const cx = view.w * 0.5;
  const cy = view.horizon - Math.min(view.w, view.h) * 0.03;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  for (let i = 0; i < 9; i += 1) {
    const drift = Math.sin(time * 0.12 + i * 1.7) * 0.06;
    const angle = -Math.PI / 2 + (i - 4) * 0.19 + drift;
    const width = 0.032 + 0.02 * Math.sin(i * 2.3);
    const reach = Math.max(view.w, view.h) * 1.2;
    const shaft = ctx.createLinearGradient(0, 0, Math.cos(angle) * reach, Math.sin(angle) * reach);
    shaft.addColorStop(0, css([255, 214, 150], 0.13 * amount));
    shaft.addColorStop(1, css([255, 150, 120], 0));
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle - width) * reach, Math.sin(angle - width) * reach);
    ctx.lineTo(Math.cos(angle + width) * reach, Math.sin(angle + width) * reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The colour grade.
 *
 * Cool the shadows, warm the highlights, and pull the corners down. It is the
 * last thing that happens to the frame and it is what makes every element look
 * like it was photographed together rather than drawn separately.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport.
 * @param {object} scene Scene state.
 */
export function grade(ctx, view, scene) {
  const { w, h } = view;

  // Teal into the shadows. `multiply` only touches what is already dark, and
  // the alpha is deliberately small: a grade is a bias, not a coat of paint,
  // and anything heavier here flattens the contrast the city is built on.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const shadow = ctx.createLinearGradient(0, 0, 0, h);
  shadow.addColorStop(0, css([214, 224, 246]));
  shadow.addColorStop(1, css([186, 210, 234]));
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Warmth back into the highlights, biased to wherever the light is coming
  // from in this act — the sun early, the fireball late.
  const heat = Math.max(scene.sun * 0.5, scene.fireball);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const warm = ctx.createRadialGradient(
    w * mix(0.5, 0.64, scene.fireball), view.horizon, 0,
    w * 0.5, view.horizon, Math.max(w, h) * 0.9,
  );
  warm.addColorStop(0, css([255, 168, 92], 0.13 * (0.35 + heat)));
  warm.addColorStop(1, css([40, 20, 60], 0));
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // A little chromatic separation at the edges, strongest when the camera is
  // being shaken — a lens under stress, not a colour scheme.
  const aberration = clamp(scene.shake / 26, 0, 1) * 0.5 + 0.1;
  if (aberration > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.05 * aberration;
    const left = ctx.createLinearGradient(0, 0, w * 0.16, 0);
    left.addColorStop(0, 'rgba(255,60,120,1)');
    left.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, w * 0.16, h);
    const right = ctx.createLinearGradient(w, 0, w * 0.84, 0);
    right.addColorStop(0, 'rgba(60,200,255,1)');
    right.addColorStop(1, 'rgba(60,200,255,0)');
    ctx.fillStyle = right;
    ctx.fillRect(w * 0.84, 0, w * 0.16, h);
    ctx.restore();
  }
}

/**
 * How much bloom the frame wants, given what is in it.
 *
 * Neon at night blooms more than a city in daylight, and a fireball blooms
 * more than either.
 *
 * @param {object} scene Scene state.
 * @returns {number} Bloom amount, 0–1.
 */
export function bloomAmount(scene) {
  const night = progress(scene.p, 0.1, 0.34);
  return clamp(0.34 + night * 0.3 + scene.fireball * 0.5 + scene.blast * 0.2, 0, 1);
}
