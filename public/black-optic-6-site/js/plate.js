/**
 * The operator, as a photographic plate.
 *
 * The first version of this film drew the figure from a joint rig. That was the
 * right call while there was no photograph — a rig can walk, and a still cannot.
 * With a real plate of the operator in hand the trade reverses, and it is worth
 * saying exactly why rather than leaving it as taste.
 *
 * **Why a plate rather than a cutout.** The obvious move is to matte him out and
 * composite him over the backdrop. It does not survive contact with the image.
 * The plate is graded cold, so his white hat sits at b* ≈ -20 — bluer than most
 * of the background — and his leather coat sits at L ≈ 2, b* ≈ -3, which is the
 * same pixel as the dark corners of the frame. No colour threshold separates
 * them, and the topology that would (the Earth's glow forms a bright ring around
 * him) breaks at the bottom of frame where coat and floor merge. Every matte
 * that can be produced from this image either eats the hat or keeps a blue rim,
 * and a blue rim against a dark page is the single most obvious sign of a cheap
 * cutout.
 *
 * **What is done instead.** The plate is kept whole and given an elliptical
 * feather. Its own corners are already #000–#040a10, and the page ground is
 * #04060a, so a falloff over the outer third of the ellipse lands the plate on
 * the page with no visible edge at all — and the Earth, the glow and the HUD
 * panels come with it, at full photographic fidelity, because they were always
 * part of the artwork.
 *
 * **The approach is then a push-in, not a walk.** Scale and position come from
 * the same `operatorAt()` motion model the rig used, so the maths that made the
 * rig's approach feel right — apparent size growing at a constant rate, distance
 * falling from 64 m to 2.6 m — is unchanged. What the gait model now drives is
 * the *breath*: a small vertical bob at the footfall rate, because a push-in on
 * a walking subject is never perfectly steady, and a plate that slides in
 * without one reads as a sticker being scaled.
 *
 * @module black-optic-6-site/plate
 */

import { clamp01 } from './timeline.js';

/**
 * The plates, and where the hat crown sits in each.
 *
 * `crown` is the fraction of the plate's height at which the top of the hat
 * falls, measured off the exported file rather than guessed. It is what the
 * compositor anchors to: the operator's head is the feature the eye tracks
 * through a push-in, so it is the point that must stay put.
 *
 * `feather` is how far in from each edge, as a fraction of that dimension,
 * alpha ramps from 0 to 1. A separable edge feather rather than an ellipse: an
 * ellipse large enough to leave the subject and the Earth at full opacity
 * necessarily extends past the plate's own bounds, so it never actually reaches
 * zero at the sides and the plate keeps a visible rectangular edge — which is
 * precisely the artifact this whole approach exists to avoid. Ramping per edge
 * guarantees zero on all four sides while leaving the middle untouched. The
 * bottom margin is the largest because that is where the console desk sits and
 * it is the one edge that is not already near-black.
 */
export const PLATES = Object.freeze([
  {
    id: 'approach',
    src: 'img/operator-approach.jpg',
    crown: 0.106,
    feather: { left: 0.17, right: 0.17, top: 0.10, bottom: 0.20 },
  },
  {
    id: 'arrival',
    src: 'img/operator-arrival.jpg',
    crown: 0.150,
    feather: { left: 0.15, right: 0.15, top: 0.12, bottom: 0.18 },
  },
]);

/**
 * How much of the frame the plate fills, at the start and at the end.
 *
 * This is the one place the plate deliberately departs from the rig.
 *
 * The rig was sized from anatomy: a 1.83 m figure at the distance the motion
 * model reported, which at 60 m is a thirty-pixel silhouette and reads
 * perfectly — a distant person *should* be a smudge. A photograph at thirty
 * pixels does not read as a distant person, it reads as a thumbnail, because
 * the plate carries a whole scene and the man inside it is only part of it.
 *
 * So the plate is framed against the frame, the way a push-in is actually
 * shot: it starts at 0.62 of frame height and ends filling it twice over,
 * cropped by the matte. The *rate* is unchanged — the interpolation is linear
 * in scroll, which is exactly the constant-growth property the reciprocal
 * distance model was chosen to give — so the approach still feels like one
 * continuous move rather than an ease.
 */
export const FILL = Object.freeze({ start: 0.62, end: 2.3 });

/** Where the hat crown sits in the frame, as a fraction, at the start and end. */
export const CROWN_Y = Object.freeze({ start: 0.21, end: 0.05 });

/**
 * The plate's geometry for a scroll position.
 *
 * Pure, so the push-in can be checked without a canvas: height must grow
 * monotonically and at a constant rate, and the crown must stay inside frame.
 */
export function plateFrame(progress, frameHeight) {
  const p = clamp01(progress);
  const height = frameHeight * (FILL.start + (FILL.end - FILL.start) * p);
  const crownY = frameHeight * (CROWN_Y.start + (CROWN_Y.end - CROWN_Y.start) * p);
  return { height, crownY };
}

/** Smoothstep. A linear ramp leaves a faint but visible band where it starts. */
function ramp(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Alpha of the feather at a point, in plate fractions (0..1 on each axis).
 *
 * The four edge ramps are multiplied rather than min-ed, which darkens the
 * corners faster than the sides — corners are where two edges of a plate meet
 * and are the first place a seam shows.
 *
 * Pure, so the falloff can be checked without a canvas.
 */
export function featherAlpha(fx, fy, feather) {
  const l = ramp(fx / feather.left);
  const r = ramp((1 - fx) / feather.right);
  const t = ramp(fy / feather.top);
  const b = ramp((1 - fy) / feather.bottom);
  return l * r * t * b;
}

/**
 * Which plate is showing at a scroll position, and how much of the next one.
 *
 * The arrival plate — he tips his hat to camera — is held back for the very end
 * and dissolved in over the last stretch. It is the closing beat, and cutting to
 * it earlier spends it.
 */
export function plateMix(progress, from = 0.88) {
  const p = clamp01(progress);
  if (p <= from) return { base: 'approach', over: null, mix: 0 };
  const t = clamp01((p - from) / (1 - from));
  return { base: 'approach', over: 'arrival', mix: t * t * (3 - 2 * t) };
}

/** Load one image, resolving to null rather than rejecting — a missing plate is not fatal. */
function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * The compositor.
 *
 * Feathering is baked once per plate into an offscreen canvas at load, because
 * doing it per frame means re-running a full-plate gradient composite sixty
 * times a second for a mask that never changes.
 */
export class OperatorPlates {
  constructor(base = '') {
    this.base = base;
    this.ready = false;
    this.plates = new Map();
  }

  /** Load and feather every plate. Resolves true if at least one is usable. */
  async load() {
    const images = await Promise.all(PLATES.map((plate) => loadImage(this.base + plate.src)));
    PLATES.forEach((plate, index) => {
      const image = images[index];
      if (!image) return;
      this.plates.set(plate.id, { ...plate, canvas: this.feather(image, plate.feather), image });
    });
    this.ready = this.plates.size > 0;
    return this.ready;
  }

  /**
   * Bake the edge feather into an offscreen copy of the image.
   *
   * Done once at load. Writing the alpha channel directly rather than
   * compositing four gradients: the product of the four ramps is not something
   * a stack of linear gradients reproduces, and at this size a single pass over
   * the pixels is faster than the composites would have been anyway.
   */
  feather(image, feather) {
    const canvas = document.createElement('canvas');
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const frame = ctx.getImageData(0, 0, w, h);
    const pixels = frame.data;
    // Per-axis ramps are separable, so they cost one row and one column rather
    // than a full multiply per pixel.
    const cols = new Float32Array(w);
    for (let x = 0; x < w; x += 1) {
      const fx = (x + 0.5) / w;
      cols[x] = ramp(fx / feather.left) * ramp((1 - fx) / feather.right);
    }
    for (let y = 0; y < h; y += 1) {
      const fy = (y + 0.5) / h;
      const rowAlpha = ramp(fy / feather.top) * ramp((1 - fy) / feather.bottom);
      const base = y * w * 4;
      for (let x = 0; x < w; x += 1) {
        pixels[base + x * 4 + 3] = Math.round(255 * rowAlpha * cols[x]);
      }
    }
    ctx.putImageData(frame, 0, 0);
    return canvas;
  }

  /**
   * Draw one plate.
   *
   * `state` is whatever `operatorAt()` returned, so the plate inherits the same
   * distance, haze and bob the rig used.
   */
  drawOne(ctx, id, state, { centreX, frameHeight, alpha = 1 }) {
    const plate = this.plates.get(id);
    if (!plate || alpha <= 0.002) return false;

    const { height, crownY } = plateFrame(state.progress, frameHeight);
    const width = height * (plate.canvas.width / plate.canvas.height);
    if (!(height > 4)) return false;

    // Anchor on the crown: his head is what the eye tracks through a push-in.
    // The bob is the gait model's only remaining job here, and it is scaled to
    // the plate rather than to anatomy — a couple of pixels, which is all a
    // steady dolly on a walking subject actually shows.
    const bob = state.pose.bob * height * 0.4;
    const top = crownY - plate.crown * height + bob;
    const left = centreX - width / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(plate.canvas, left, top, width, height);

    // Atmospheric haze: far plates wash toward the fog colour rather than fading
    // out. `source-atop` keeps the tint inside the feather, so the veil has the
    // same soft edge the plate does and no rectangle appears.
    if (state.haze > 0.01) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = alpha * state.haze * 0.86;
      ctx.fillStyle = '#0b1420';
      ctx.fillRect(left, top, width, height);
    }
    ctx.restore();
    return true;
  }

  /** Draw whatever the scroll position calls for, dissolving into the arrival plate. */
  draw(ctx, state, options) {
    if (!this.ready) return false;
    const mix = plateMix(state.progress);
    let drew = this.drawOne(ctx, mix.base, state, { ...options, alpha: (options.alpha ?? 1) * (1 - mix.mix) });
    if (mix.over) {
      drew = this.drawOne(ctx, mix.over, state, { ...options, alpha: (options.alpha ?? 1) * mix.mix }) || drew;
    }
    return drew;
  }
}
