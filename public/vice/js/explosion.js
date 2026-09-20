/**
 * The detonation.
 *
 * The one hard constraint on this module: the explosion is a *function of
 * scroll*, not a simulation running on a clock. Scrub back up the page and the
 * fireball has to collapse, the shockwave has to come back in, and every piece
 * of debris has to fly back to where it came from — which a stateful particle
 * system cannot do.
 *
 * So the debris is seeded once at module load, and each piece's position at
 * blast progress `t` is closed-form ballistics: launch angle, speed, gravity.
 * Nothing accumulates. The only thing time is used for is flicker, where being
 * frame-dependent is the point.
 *
 * The blast is built in five passes, back to front: the flash on the horizon,
 * the rising column, the shockwave ring, the debris field, and the embers that
 * stay in the air long after the rest has gone.
 *
 * @module vice/explosion
 */

import { EASE, clamp, css, mix, progress, rng } from './mathkit.js';

/** Debris, seeded once so the same rubble flies the same way every time. */
const DEBRIS = (() => {
  const random = rng(0xb1a57);
  return Array.from({ length: 190 }, () => {
    const angle = mix(-Math.PI * 0.94, -Math.PI * 0.06, random());
    return {
      angle,
      speed: mix(0.35, 1.5, random() ** 0.7),
      spin: mix(-9, 9, random()),
      size: mix(2.5, 16, random() ** 2),
      /** 0 concrete, 1 glass, 2 burning. */
      kind: random() < 0.62 ? 0 : random() < 0.75 ? 1 : 2,
      lag: mix(0, 0.16, random()),
    };
  });
})();

/** Embers, which drift rather than fly. */
const EMBERS = (() => {
  const random = rng(0xe3b12);
  return Array.from({ length: 130 }, () => ({
    x: random(), y: random(), drift: mix(-0.4, 0.9, random()),
    rise: mix(0.15, 0.75, random()), size: mix(1, 3.4, random()), phase: random() * 7,
  }));
})();

/**
 * The centre of the blast on screen, as a fraction of the viewport.
 *
 * Off to the right and down on the horizon, so the shockwave crosses the frame
 * rather than exploding out of the middle of it, and so Captain Colin has a
 * side of the screen to arrive from.
 */
export const EPICENTRE = Object.freeze({ x: 0.66, y: 0.52 });

/**
 * Paint the whole detonation.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport, `{ w, h, horizon }`.
 * @param {object} scene Scene state from `sequence.sceneState`.
 * @param {number} time Seconds since boot, for flicker only.
 */
export function drawBlast(ctx, view, scene, time) {
  const t = scene.blast;
  if (t <= 0.001 && scene.embers <= 0.001) return;

  const { w, h, horizon } = view;
  const cx = w * EPICENTRE.x;
  const cy = mix(horizon, h * EPICENTRE.y, 0.35);
  const reach = Math.hypot(w, h);

  if (t > 0) {
    drawColumn(ctx, cx, cy, reach, t, time);
    drawCore(ctx, cx, cy, reach, t, time);
  }
  if (scene.shock > 0) drawShock(ctx, cx, cy, reach, scene.shock);
  if (t > 0) drawDebris(ctx, cx, cy, reach, t);
  if (scene.embers > 0) drawEmbers(ctx, view, scene.embers, time);
}

/** The mushroom column, drawn as three stacked plumes that rise and spread. */
function drawColumn(ctx, cx, cy, reach, t, time) {
  const rise = EASE.out(t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i += 1) {
    const k = i / 3;
    const y = cy - reach * 0.42 * rise * (0.4 + k);
    const r = reach * mix(0.06, 0.2, k) * (0.4 + rise);
    const wobble = Math.sin(time * 1.4 + i * 2) * r * 0.08;
    const plume = ctx.createRadialGradient(cx + wobble, y, 0, cx + wobble, y, r);
    const heat = clamp(1 - k * 0.5 - t * 0.35, 0, 1);
    plume.addColorStop(0, css([255, mix(120, 236, heat), mix(40, 150, heat)], 0.72 * (1 - k * 0.2)));
    plume.addColorStop(0.55, css([255, 110, 40], 0.34));
    plume.addColorStop(1, css([60, 20, 14], 0));
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.arc(cx + wobble, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The core: a white-hot centre that cools to orange as it grows. */
function drawCore(ctx, cx, cy, reach, t, time) {
  const r = reach * mix(0.02, 0.38, EASE.blast(t));
  const flicker = 0.9 + 0.1 * Math.sin(time * 26);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const cool = progress(t, 0.15, 1);
  core.addColorStop(0, css([255, 255, mix(250, 170, cool)], (1 - cool * 0.55) * flicker));
  core.addColorStop(0.28, css([255, mix(230, 140, cool), mix(150, 40, cool)], 0.85 * (1 - cool * 0.4)));
  core.addColorStop(0.7, css([255, 90, 30], 0.35 * (1 - cool * 0.5)));
  core.addColorStop(1, css([120, 24, 10], 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The shockwave: a thin bright ring with a compressed-air lens behind it. */
function drawShock(ctx, cx, cy, reach, s) {
  const r = reach * 1.25 * EASE.out(s);
  const fade = 1 - s;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const lens = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
  lens.addColorStop(0, css([255, 240, 220], 0));
  lens.addColorStop(0.75, css([255, 226, 190], 0.14 * fade));
  lens.addColorStop(1, css([255, 255, 255], 0));
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = css([255, 246, 224], 0.75 * fade);
  ctx.lineWidth = mix(26, 3, s);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // A second, faster ring, which is what makes it read as pressure rather
  // than as a circle being animated.
  ctx.strokeStyle = css([180, 220, 255], 0.35 * fade);
  ctx.lineWidth = mix(10, 1.5, s);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Rubble, on closed-form ballistic arcs. */
function drawDebris(ctx, cx, cy, reach, t) {
  ctx.save();
  for (const piece of DEBRIS) {
    const local = clamp((t - piece.lag) / (1 - piece.lag), 0, 1);
    if (local <= 0) continue;
    const v = piece.speed * reach * 0.9;
    const x = cx + Math.cos(piece.angle) * v * local;
    const y = cy + Math.sin(piece.angle) * v * local + reach * 1.5 * local * local * 0.42;
    const alpha = clamp(1 - local * 0.75, 0, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(piece.spin * local);
    ctx.globalAlpha = alpha;
    if (piece.kind === 2) {
      ctx.fillStyle = css([255, mix(190, 90, local), 60], 0.95);
      ctx.shadowColor = css([255, 140, 50], 0.8);
      ctx.shadowBlur = 12;
    } else if (piece.kind === 1) {
      ctx.fillStyle = css([190, 230, 245], 0.7);
    } else {
      ctx.fillStyle = css([70, 62, 58], 0.95);
    }
    ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.72);
    ctx.restore();
  }
  ctx.restore();
}

/** Embers: slow, upward, and still there long after the fire has gone. */
function drawEmbers(ctx, view, amount, time) {
  const { w, h } = view;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ember of EMBERS) {
    const life = (time * ember.rise * 0.12 + ember.y) % 1;
    const x = (ember.x + Math.sin(time * 0.5 + ember.phase) * 0.04 + ember.drift * life * 0.12) % 1;
    const y = 1 - life;
    const alpha = amount * Math.sin(life * Math.PI) * 0.9;
    if (alpha <= 0.01) continue;
    ctx.fillStyle = css([255, mix(200, 90, life), 60], alpha);
    ctx.beginPath();
    ctx.arc(x * w, y * h, ember.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * How white the screen should go, for the DOM flash element.
 *
 * The flash is deliberately short and it is deliberately not full white — a
 * page that blanks to #fff for a quarter of a second is unpleasant on a phone
 * at night and genuinely unsafe for a small number of readers, so it peaks
 * warm and at 78%.
 *
 * @param {object} scene Scene state.
 * @returns {number} Flash opacity, 0–1.
 */
export function flashAmount(scene) {
  const rise = progress(scene.p, 0.7475, 0.7505);
  const fall = 1 - progress(scene.p, 0.7505, 0.764);
  return clamp(Math.min(rise, fall), 0, 1) * 0.78;
}

/**
 * The debris field, exposed so the tests can check it is deterministic and
 * that nothing ends up travelling backwards.
 *
 * @returns {object[]} The seeded debris.
 */
export function debris() {
  return DEBRIS;
}
