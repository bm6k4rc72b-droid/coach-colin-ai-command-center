/**
 * The stage.
 *
 * One fixed canvas behind the whole document, one requestAnimationFrame loop,
 * and one rule: every frame is drawn from the scene state the director returns
 * for the current scroll position. The loop holds no story state of its own —
 * no "the explosion has started" flag, no timers counting down an act — which
 * is why scrubbing the scrollbar backwards runs the film backwards instead of
 * leaving the page in a state nothing can get it out of.
 *
 * The camera does keep one running number: a world offset that advances with
 * time as well as scroll, so the city still drifts past while you are reading
 * a section rather than freezing into a still. Set pieces are keyed to scroll
 * alone; only the scenery drifts.
 *
 * Two performance decisions worth knowing about. The canvas is sized to the
 * device pixel ratio but capped at 2, because a 3x phone gains nothing visible
 * here and loses a third of its frame rate. And the whole loop idles — no
 * drawing at all — when the page is hidden or the canvas is scrolled out of
 * reach, which on a laptop is the difference between a warm fan and a quiet
 * one.
 *
 * @module vice/stage
 */

import { EASE, clamp, css, mix, progress, rng } from './mathkit.js';
import { drawBay, drawPalms, drawRain, drawRoad, drawSky, drawSkyline, horizonFor } from './city.js';
import {
  drawCharger, drawChopper, drawColin, drawGoldTruck, drawRolls, drawSaucer, drawTank, drawTommy,
} from './actors.js';
import { drawBlast, flashAmount } from './explosion.js';
import { sceneState } from './sequence.js';

/** Cap the backing store at 2x. Beyond that is invisible and expensive. */
const MAX_DPR = 2;

/**
 * The renderer.
 */
export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas The canvas to draw into.
   * @param {object} [options] `{ onScene, reduced }`.
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
    this.onScene = options.onScene || (() => {});
    this.reduced = Boolean(options.reduced);
    this.view = { w: 0, h: 0, horizon: 0, dpr: 1 };
    this.camera = 0;
    this.time = 0;
    this.last = 0;
    this.progress = 0;
    this.scene = sceneState(0);
    this.frame = null;
    this.grain = null;
    this.running = false;
  }

  /** Size the backing store to the element, and remember the viewport. */
  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.view = { w, h, dpr, horizon: horizonFor(h, this.scene) };
    this.grain = null;
  }

  /** Start the loop. */
  start() {
    if (this.running || !this.ctx) return;
    this.running = true;
    this.last = performance.now();
    const step = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this.last) / 1000, 0, 0.05);
      this.last = now;
      this.time += dt;
      this.#advance(dt);
      this.#draw();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Stop the loop. */
  stop() {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * Hand the renderer a new reading position.
   *
   * @param {number} p Document progress, 0–1.
   */
  setProgress(p) {
    this.progress = clamp(p, 0, 1);
  }

  /** Move the camera on, and recompute the scene. */
  #advance(dt) {
    const scene = sceneState(this.progress);
    this.scene = scene;
    this.view.horizon = horizonFor(this.view.h, scene);
    // Scroll moves the world; time keeps it alive when nobody is scrolling.
    this.camera += scene.speed * 46 * dt;
    this.onScene(scene);
  }

  /** One frame. */
  #draw() {
    const { ctx, view, scene } = this;
    if (!ctx) return;
    const shake = this.reduced ? 0 : scene.shake;
    const jitterX = shake ? (Math.random() - 0.5) * shake * 2 : 0;
    const jitterY = shake ? (Math.random() - 0.5) * shake * 2 : 0;

    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.translate(jitterX, jitterY);

    drawSky(ctx, view, scene);
    drawSkyline(ctx, view, scene, this.camera);
    drawBay(ctx, view, scene);
    drawRoad(ctx, view, scene, this.camera);
    this.#drawSkyActors();
    drawPalms(ctx, view, scene, this.camera);
    this.#drawGroundActors();
    drawBlast(ctx, view, scene, this.time);
    this.#drawRescue();
    if (!this.reduced) drawRain(ctx, view, scene, this.time);
    this.#post();
    ctx.restore();
  }

  /** The road surface every wheeled thing stands on. */
  get roadY() {
    const { h, horizon } = this.view;
    return horizon + (h - horizon) * 0.78;
  }

  /** Choppers, armour in the air, the saucer and the gold truck's escort. */
  #drawSkyActors() {
    const { ctx, view, scene, time } = this;
    if (scene.choppers > 0.01) {
      const rotor = time * 26;
      for (let i = 0; i < 3; i += 1) {
        const lane = i / 3;
        const entry = progress(scene.p, 0.49 + i * 0.015, 0.55 + i * 0.015);
        const x = mix(view.w + 300, view.w * (0.2 + lane * 0.34), entry) -
          Math.sin(time * 0.4 + i) * 26;
        const y = view.horizon * mix(0.32, 0.62, lane) + Math.sin(time * 0.9 + i * 2) * 12;
        drawChopper(ctx, x, y, mix(0.42, 0.82, lane), {
          rotor: rotor + i, alpha: scene.choppers, tilt: -0.1 - lane * 0.04,
          searchlight: scene.choppers * (i === 1 ? 0.9 : 0.35),
        });
      }
    }

    if (scene.saucer > 0.01) {
      const descent = progress(scene.p, 0.68, 0.752);
      const x = mix(view.w + 420, view.w * 0.66, descent);
      const y = mix(-160, view.horizon * 0.34, descent) + Math.sin(time * 0.7) * 10;
      drawSaucer(ctx, x, y, mix(0.5, 1.05, descent), {
        spin: time * 1.4,
        alpha: scene.saucer,
        beam: progress(scene.p, 0.726, 0.747) * (1 - progress(scene.p, 0.749, 0.762)),
        charge: progress(scene.p, 0.722, 0.747),
      });
    }
  }

  /** Everything with wheels or feet. */
  #drawGroundActors() {
    const { ctx, view, scene, time } = this;
    const y = this.roadY;
    const spin = this.camera * 0.06;

    // Tommy, walking the strip in the opening.
    if (scene.tommyWalking > 0.01) {
      drawTommy(ctx, view.w * 0.22, y, mix(1.05, 1.5, progress(scene.p, 0, 0.16)), {
        phase: this.camera * 0.045,
        alpha: scene.tommyWalking,
      });
    }

    // Armour, behind the police and slower than them.
    if (scene.tanks > 0.01) {
      for (let i = 0; i < 2; i += 1) {
        const entry = progress(scene.p, 0.505 + i * 0.02, 0.585 + i * 0.02);
        const x = mix(view.w + 420 + i * 300, view.w * (0.76 + i * 0.3), entry);
        drawTank(ctx, x, y + 6, 0.72, {
          alpha: scene.tanks,
          turret: -0.2 + Math.sin(time * 0.5 + i) * 0.05,
          muzzle: i === 0 ? Math.max(0, Math.sin(time * 1.1) - 0.93) * 14 : 0,
        });
      }
    }

    // Police, in a stack behind the Rolls.
    if (scene.police > 0.01) {
      for (let i = 0; i < 3; i += 1) {
        const entry = progress(scene.p, 0.205 + i * 0.01, 0.27 + i * 0.01);
        const chase = Math.sin(time * (1.1 + i * 0.2) + i) * 22;
        const x = mix(view.w + 260 + i * 220, view.w * (0.68 + i * 0.19), entry) + chase;
        drawCharger(ctx, x, y, mix(0.62, 0.78, i / 2), {
          spin,
          flash: (time * 3.2 + i * 0.37) % 1,
          alpha: scene.police,
        });
      }
    }

    // The gold truck, arriving from the right ahead of the saucer.
    if (scene.goldTruck > 0.01) {
      const entry = progress(scene.p, 0.69, 0.748);
      const x = mix(view.w + 360, view.w * 0.82, entry);
      drawGoldTruck(ctx, x, y - 4, 0.7, {
        spin, alpha: scene.goldTruck, hover: entry * 6,
      });
    }

    // The Rolls.
    if (scene.rolls > 0.01) {
      const entry = progress(scene.p, 0.2, 0.26);
      const x = mix(-400, view.w * 0.36, entry) + Math.sin(time * 0.8) * 10;
      const lean = Math.sin(time * 1.7) * 0.012 - progress(scene.p, 0.2, 0.24) * 0.02;
      drawRolls(ctx, x, y, 0.86, {
        spin, lean, alpha: scene.rolls,
        headlights: 0.5 + 0.5 * progress(scene.p, 0.26, 0.46),
      });
      if (!this.reduced) this.#speedLines(x, y, scene);
    }
  }

  /** Streaks off the car, so speed reads even in a still frame. */
  #speedLines(x, y, scene) {
    const { ctx, view } = this;
    const amount = clamp(progress(scene.p, 0.22, 0.3) * (1 - progress(scene.p, 0.63, 0.73)), 0, 1);
    if (amount < 0.02) return;
    const random = rng(Math.floor(this.time * 30));
    ctx.save();
    ctx.globalAlpha = amount * 0.45;
    ctx.strokeStyle = css([255, 240, 220], 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 22; i += 1) {
      const ly = y - random() * 120 - 8;
      const lx = x + 120 + random() * view.w * 0.5;
      const length = 40 + random() * 130;
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + length, ly);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Tommy on the ground, and Captain Colin over him. */
  #drawRescue() {
    const { ctx, view, scene, time } = this;
    if (scene.tommyDown < 0.01 && scene.shield < 0.01) return;
    const y = this.roadY;
    const x = view.w * 0.34;

    if (scene.tommyDown > 0.01) {
      drawTommy(ctx, x + 66, y, 1.9, { phase: 0, down: scene.tommyDown, alpha: 1 });
    }
    if (scene.shield > 0.01) {
      const arrive = scene.shield;
      const cx = mix(-260, x, arrive);
      drawColin(ctx, cx, y, mix(1.4, 1.95, arrive), {
        alpha: 1,
        brace: scene.shieldLock,
        glow: scene.shieldLock * (0.6 + 0.4 * Math.sin(time * 9)),
      });
      // At the moment of impact the shield throws a ring of light out through
      // the blast — an expanding *stroke*, not a second shield. Drawn filled it
      // additively blends to a flat white disc that covers the two figures this
      // whole sequence exists to show.
      if (scene.shieldLock > 0.2) {
        const ring = progress(scene.p, 0.752, 0.8);
        const r = mix(70, 430, EASE.out(ring));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [scale, width, alpha] of [[1, 7, 0.75], [0.86, 3, 0.4], [1.14, 2, 0.28]]) {
          ctx.strokeStyle = css([255, 214, 110], (1 - ring) * alpha);
          ctx.lineWidth = width * (1 - ring * 0.6);
          ctx.beginPath();
          ctx.arc(cx - 112, y - 156, r * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /** Vignette, scanlines and grain — the VHS the whole thing is dubbed onto. */
  #post() {
    const { ctx, view, scene } = this;
    const flash = flashAmount(scene);
    if (flash > 0.001) {
      ctx.fillStyle = css([255, 244, 220], flash);
      ctx.fillRect(0, 0, view.w, view.h);
    }

    const vignette = ctx.createRadialGradient(
      view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.28,
      view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.w, view.h);

    if (this.reduced) return;

    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.fillStyle = '#000';
    for (let y = 0; y < view.h; y += 3) ctx.fillRect(0, y, view.w, 1);
    ctx.restore();

    if (!this.grain) this.grain = this.#grainTile();
    ctx.save();
    ctx.globalAlpha = 0.05;
    const ox = -Math.random() * 64;
    const oy = -Math.random() * 64;
    const pattern = ctx.createPattern(this.grain, 'repeat');
    ctx.translate(ox, oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, view.w + 64, view.h + 64);
    ctx.restore();
  }

  /** A 64px noise tile, rendered once and tiled. */
  #grainTile() {
    const tile = document.createElement('canvas');
    tile.width = 64;
    tile.height = 64;
    const tctx = tile.getContext('2d');
    const image = tctx.createImageData(64, 64);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 90 + Math.random() * 165;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    tctx.putImageData(image, 0, 0);
    return tile;
  }
}
