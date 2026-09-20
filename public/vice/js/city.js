/**
 * The city.
 *
 * Vice City is not a photograph here — it is generated. A seeded random
 * number generator lays out four bands of towers, each band wrapping at its
 * own width and scrolling at its own speed, and the whole skyline is redrawn
 * from that description on every frame. That buys three things a picture
 * could not: it is a few kilobytes rather than a few megabytes, it never
 * reaches an edge no matter how far you scroll, and — because the seed is
 * fixed — it is the same city on every reload, which means the end-to-end
 * tests can assert on it.
 *
 * Depth is faked the way the old games faked it: each band moves at a fraction
 * of the scroll speed, is drawn darker and hazier the further back it sits,
 * and the near ones get the neon. Nothing here is a 3D engine and nothing here
 * needs to be.
 *
 * @module vice/city
 */

import { clamp, css, mix, progress, rng, wrap } from './mathkit.js';

/** Neon sign colours, in the order the generator cycles them. */
const NEON = [
  [255, 46, 136], [56, 214, 255], [255, 176, 32],
  [124, 227, 139], [199, 125, 255], [255, 90, 60],
];

/**
 * One parallax band of towers.
 *
 * @param {object} spec Band description.
 * @param {number} spec.seed Generator seed.
 * @param {number} spec.span World width the band wraps at.
 * @param {number} spec.depth 0 at the horizon, 1 at the road.
 * @param {number} spec.minH Shortest tower, as a fraction of the band height.
 * @param {number} spec.maxH Tallest tower, same units.
 * @param {number} spec.count How many towers to lay out.
 * @returns {object} The band, with its towers already generated.
 */
function band({ seed, span, depth, minH, maxH, count }) {
  const random = rng(seed);
  const towers = [];
  let x = 0;
  for (let i = 0; i < count; i += 1) {
    const w = mix(28, 96, random());
    const gap = mix(6, 40, random());
    const h = mix(minH, maxH, random() ** 1.6);
    const roof = random();
    towers.push({
      x, w, h,
      /** 0 flat, 1 stepped, 2 spired, 3 domed — enough variety to read as a city. */
      roof: roof < 0.55 ? 0 : roof < 0.78 ? 1 : roof < 0.92 ? 2 : 3,
      /** Window grid, fixed per tower so the lights do not crawl. */
      cols: Math.max(2, Math.round(w / 14)),
      rows: Math.max(3, Math.round(h * 26)),
      lit: random(),
      neon: NEON[Math.floor(random() * NEON.length)],
      sign: random() < 0.16,
      antenna: random() < 0.22,
      /** How much of this tower survives the blast. */
      resilience: mix(0.35, 0.86, random()),
    });
    x += w + gap;
  }
  return { span: Math.max(span, x), depth, towers };
}

/** The four bands, back to front. Seeds are fixed so the city is reproducible. */
const BANDS = [
  band({ seed: 0x5eed01, span: 2600, depth: 0.10, minH: 0.10, maxH: 0.34, count: 46 }),
  band({ seed: 0x5eed02, span: 2200, depth: 0.24, minH: 0.16, maxH: 0.54, count: 38 }),
  band({ seed: 0x5eed03, span: 1800, depth: 0.46, minH: 0.22, maxH: 0.74, count: 26 }),
  band({ seed: 0x5eed04, span: 1400, depth: 0.72, minH: 0.30, maxH: 0.96, count: 16 }),
];

/**
 * Expose the generated bands, so tests can check the city is stable and the
 * renderer is not laying out towers on top of each other.
 *
 * @returns {object[]} The bands, back to front.
 */
export function bands() {
  return BANDS;
}

/**
 * Paint the sky, from two colours and a sun.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport, `{ w, h, horizon }`.
 * @param {object} scene State from `sequence.sceneState`.
 */
export function drawSky(ctx, view, scene) {
  const { w, h, horizon } = view;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, css(scene.skyTop));
  sky.addColorStop(0.62, css(mix3(scene.skyTop, scene.skyLow, 0.55)));
  sky.addColorStop(1, css(scene.skyLow));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 1);

  if (scene.stars > 0.01) drawStars(ctx, view, scene.stars);
  if (scene.sun > 0.01) drawSun(ctx, view, scene);

  // The fireball washes the whole sky, which is what sells the scale of it.
  if (scene.fireball > 0.01) {
    const glow = ctx.createRadialGradient(w * 0.62, horizon, 0, w * 0.62, horizon, h * 1.3);
    glow.addColorStop(0, css([255, 236, 170], 0.85 * scene.fireball));
    glow.addColorStop(0.3, css([255, 132, 40], 0.6 * scene.fireball));
    glow.addColorStop(1, css([120, 20, 10], 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon + 2);
  }
}

/** Mix two `[r,g,b]` triples. Local so the hot path avoids an import hop. */
function mix3(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** The synthwave sun: a disc cut by horizontal bands that widen downwards. */
function drawSun(ctx, view, scene) {
  const { w, horizon } = view;
  const r = Math.min(w, view.h) * 0.19;
  const cx = w * 0.5;
  const cy = horizon - r * 0.18;
  const alpha = clamp(scene.sun, 0, 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  const disc = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  disc.addColorStop(0, '#fff2a8');
  disc.addColorStop(0.42, '#ff9a3c');
  disc.addColorStop(1, '#ff2e88');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Cut the bands out with the sky colour rather than drawing them over, so
  // the sun keeps its gradient inside every slice.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i += 1) {
    const t = i / 9;
    const y = cy - r * 0.15 + t * r * 1.2;
    const thickness = mix(1.5, 9, t);
    ctx.fillRect(cx - r, y, r * 2, thickness);
  }
  ctx.restore();
}

/** Stars, laid out once and reused. */
const STARS = (() => {
  const random = rng(0x57a25);
  return Array.from({ length: 220 }, () => ({
    x: random(), y: random() ** 1.7, r: mix(0.4, 1.5, random()), phase: random() * Math.PI * 2,
  }));
})();

function drawStars(ctx, view, amount) {
  const { w, horizon } = view;
  ctx.save();
  ctx.globalAlpha = clamp(amount, 0, 1);
  ctx.fillStyle = '#ffffff';
  for (const star of STARS) {
    const twinkle = 0.6 + 0.4 * Math.sin(star.phase + performance.now() / 900);
    ctx.globalAlpha = clamp(amount, 0, 1) * twinkle * 0.9;
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * horizon * 0.8, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Paint the skyline: four bands, back to front.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport, `{ w, h, horizon }`.
 * @param {object} scene Scene state.
 * @param {number} camera World offset in pixels.
 */
export function drawSkyline(ctx, view, scene, camera) {
  const { w, horizon } = view;
  for (const layer of BANDS) {
    const shift = camera * layer.depth;
    const height = horizon * mix(0.52, 0.94, layer.depth);
    const baseY = horizon + 1;
    // Further back reads as hazier: mix the silhouette towards the sky.
    const haze = 1 - layer.depth;
    const body = mix3([10, 6, 26], scene.skyLow, haze * 0.45);
    const ruin = scene.ruin;

    ctx.save();
    ctx.fillStyle = css(body);
    for (let repeat = -1; repeat <= Math.ceil(w / layer.span) + 1; repeat += 1) {
      const originX = repeat * layer.span - wrap(shift, layer.span);
      for (const tower of layer.towers) {
        const x = originX + tower.x;
        if (x > w + 120 || x + tower.w < -120) continue;
        const collapse = ruin * (1 - tower.resilience);
        const h = height * tower.h * (1 - collapse);
        drawTower(ctx, x, baseY, tower.w, h, tower, layer, scene, body);
      }
    }
    ctx.restore();
  }
}

/** One tower: body, roof, windows, and whatever neon it carries. */
function drawTower(ctx, x, baseY, w, h, tower, layer, scene, body) {
  const top = baseY - h;
  ctx.fillStyle = css(body);
  ctx.fillRect(x, top, w, h);

  if (tower.roof === 1) ctx.fillRect(x + w * 0.18, top - h * 0.08, w * 0.64, h * 0.08);
  if (tower.roof === 2) {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, top - h * 0.16);
    ctx.lineTo(x + w * 0.72, top);
    ctx.lineTo(x + w * 0.28, top);
    ctx.closePath();
    ctx.fill();
  }
  if (tower.roof === 3) {
    ctx.beginPath();
    ctx.arc(x + w * 0.5, top, w * 0.32, Math.PI, 0);
    ctx.fill();
  }
  if (tower.antenna && layer.depth > 0.3) {
    ctx.fillRect(x + w * 0.48, top - h * 0.2, 1.6, h * 0.2);
    ctx.fillStyle = css([255, 70, 70], 0.5 + 0.5 * Math.sin(performance.now() / 420));
    ctx.fillRect(x + w * 0.44, top - h * 0.22, 4, 3);
  }

  // Windows. Only the two near bands get them — at the back they would be a
  // shimmering mess that costs frames and reads as noise.
  if (layer.depth >= 0.4 && h > 26) {
    const cols = tower.cols;
    const rows = Math.min(tower.rows, Math.floor(h / 7));
    const cw = w / cols;
    const ch = h / Math.max(rows, 1);
    const warmth = 1 - scene.ruin * (1 - tower.resilience);
    ctx.fillStyle = css([255, 214, 140], 0.5 * warmth);
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        // A deterministic hash, so the same windows are lit every frame.
        const on = ((c * 73856093) ^ (r * 19349663) ^ Math.floor(tower.lit * 1e6)) % 7;
        if (on > 2) continue;
        ctx.fillRect(x + c * cw + cw * 0.24, top + r * ch + ch * 0.22, cw * 0.5, ch * 0.5);
      }
    }
    if (tower.sign) {
      const glow = clamp(1 - scene.ruin, 0, 1) * (0.7 + 0.3 * Math.sin(performance.now() / 300 + tower.lit * 10));
      ctx.fillStyle = css(tower.neon, 0.9 * glow);
      ctx.fillRect(x + w * 0.12, top + h * 0.16, w * 0.76, Math.max(3, h * 0.045));
      ctx.shadowColor = css(tower.neon, 0.8 * glow);
      ctx.shadowBlur = 18;
      ctx.fillRect(x + w * 0.12, top + h * 0.16, w * 0.76, Math.max(3, h * 0.045));
      ctx.shadowBlur = 0;
    }
  }

  // Fires on the broken tops, once the city has been hit.
  if (scene.ruin > 0.02 && layer.depth > 0.3 && (1 - tower.resilience) > 0.25) {
    const flicker = 0.55 + 0.45 * Math.sin(performance.now() / 180 + tower.lit * 20);
    const fire = ctx.createRadialGradient(x + w * 0.5, top, 0, x + w * 0.5, top, w * 0.9);
    fire.addColorStop(0, css([255, 190, 90], 0.55 * scene.ruin * flicker));
    fire.addColorStop(1, css([255, 90, 30], 0));
    ctx.fillStyle = fire;
    ctx.fillRect(x - w, top - w, w * 3, w * 2);
  }
}

/**
 * The bay in front of the city, and the neon it reflects.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport.
 * @param {object} scene Scene state.
 */
export function drawBay(ctx, view, scene) {
  const { w, h, horizon } = view;
  const depth = h - horizon;
  const water = ctx.createLinearGradient(0, horizon, 0, horizon + depth * 0.46);
  water.addColorStop(0, css(mix3(scene.skyLow, [8, 4, 30], 0.42), 0.95));
  water.addColorStop(1, css([6, 4, 24]));
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, w, depth * 0.46);

  ctx.save();
  ctx.globalAlpha = 0.5;
  const now = performance.now() / 1000;
  for (let i = 0; i < 26; i += 1) {
    const t = i / 26;
    const y = horizon + t * depth * 0.44;
    const wobble = Math.sin(now * 1.2 + i * 0.6) * (4 + t * 26);
    ctx.fillStyle = css(mix3(scene.skyLow, [255, 255, 255], 0.25), 0.10 + t * 0.08);
    ctx.fillRect(wobble, y, w, 1.4 + t * 2);
  }
  ctx.restore();
}

/**
 * The causeway the whole film is driven along.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport.
 * @param {object} scene Scene state.
 * @param {number} camera World offset in pixels.
 */
export function drawRoad(ctx, view, scene, camera) {
  const { w, h, horizon } = view;
  const roadTop = horizon + (h - horizon) * 0.46;
  const asphalt = ctx.createLinearGradient(0, roadTop, 0, h);
  asphalt.addColorStop(0, '#15111f');
  asphalt.addColorStop(1, '#0a0810');
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, roadTop, w, h - roadTop);

  // Wet asphalt: a band of the sky's own colour smeared down the surface.
  if (scene.rain > 0.02) {
    const sheen = ctx.createLinearGradient(0, roadTop, 0, h);
    sheen.addColorStop(0, css(scene.skyLow, 0.28 * scene.rain));
    sheen.addColorStop(1, css(scene.skyLow, 0));
    ctx.fillStyle = sheen;
    ctx.fillRect(0, roadTop, w, h - roadTop);
  }

  ctx.fillStyle = css([255, 220, 120], 0.55);
  ctx.fillRect(0, roadTop, w, 2);

  // Centre line. Dash length grows towards the camera so the road reads as
  // going away from you rather than being a flat strip.
  const dash = 78;
  const y = roadTop + (h - roadTop) * 0.52;
  const offset = wrap(camera * 1.6, dash * 2);
  ctx.fillStyle = css([245, 240, 220], 0.7);
  for (let x = -offset; x < w + dash; x += dash * 2) {
    ctx.fillRect(x, y, dash, 4);
  }
}

/**
 * Palms along the near edge, moving fastest of anything in the scene.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport.
 * @param {object} scene Scene state.
 * @param {number} camera World offset in pixels.
 */
export function drawPalms(ctx, view, scene, camera) {
  const { w, h, horizon } = view;
  const span = 620;
  const baseY = horizon + (h - horizon) * 0.5;
  const shift = wrap(camera * 1.15, span);
  const sway = Math.sin(performance.now() / 1400) * 0.05;

  ctx.save();
  ctx.fillStyle = css([8, 5, 18], 0.92);
  for (let repeat = -1; repeat <= Math.ceil(w / span) + 1; repeat += 1) {
    const originX = repeat * span - shift;
    for (let i = 0; i < 3; i += 1) {
      const x = originX + i * 210 + (i % 2) * 40;
      if (x < -140 || x > w + 140) continue;
      const trunk = mix(120, 230, ((i * 37 + repeat * 11) % 10) / 10);
      drawPalm(ctx, x, baseY, trunk, sway + (i % 2 ? 0.03 : -0.02));
    }
  }
  ctx.restore();
}

/** One palm: a leaning trunk and seven fronds. */
function drawPalm(ctx, x, baseY, height, lean) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.rotate(lean);
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.quadraticCurveTo(2, -height * 0.6, 6, -height);
  ctx.lineTo(12, -height);
  ctx.quadraticCurveTo(8, -height * 0.6, 4, 0);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 7; i += 1) {
    const angle = -Math.PI * 0.86 + (i / 6) * Math.PI * 0.72;
    ctx.save();
    ctx.translate(9, -height);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(34, -12, 68, 6);
    ctx.quadraticCurveTo(36, 2, 0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Rain, drawn as streaks whose angle follows how fast the world is moving.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {object} view Viewport.
 * @param {object} scene Scene state.
 * @param {number} time Seconds since boot.
 */
export function drawRain(ctx, view, scene, time) {
  if (scene.rain < 0.02) return;
  const { w, h } = view;
  const count = Math.round(160 * scene.rain);
  const lean = clamp(scene.speed * 0.9, 2, 22);
  ctx.save();
  ctx.strokeStyle = css([200, 220, 255], 0.22 * scene.rain);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const seed = i * 0.618;
    const x = wrap((seed * w * 1.7) - time * 260 * (0.6 + (i % 5) / 5), w + 200) - 100;
    const y = wrap((seed * h * 2.3) + time * 900 * (0.7 + (i % 7) / 7), h + 120) - 60;
    ctx.moveTo(x, y);
    ctx.lineTo(x - lean, y + 24);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * How far down the frame the horizon sits, given the act.
 *
 * The camera rises as the film escalates — a low horizon makes the sky, and
 * therefore the choppers and the saucer, feel enormous.
 *
 * @param {number} height Viewport height.
 * @param {object} scene Scene state.
 * @returns {number} Horizon Y in pixels.
 */
export function horizonFor(height, scene) {
  const base = mix(0.62, 0.5, progress(scene.p, 0.16, 0.75));
  const lift = progress(scene.p, 0.84, 1) * 0.06;
  return Math.round(height * (base + lift));
}
