/**
 * The Hollywood Secret's wall screen: a marquee of chasing bulbs around a
 * "now showing" board — the 72-hour call sheet and the visitor's clearance.
 *
 * @module astra/showcase/screens6
 */

import { DRAWERS, ink } from './screens.js';
import { GAUGE } from './hollywood.js';

const { text, DIM } = ink;
const GOLD = '#f7c948';
const WARM = '#ffe7a8';
const RED = '#e2564f';

function bulbs(ctx, w, h, t) {
  const n = 28;
  const draw = (x, y, i) => {
    const on = (Math.floor(t * 6) + i) % 3 === 0;
    ctx.fillStyle = on ? WARM : 'rgba(247, 201, 72, 0.25)';
    ctx.shadowColor = WARM;
    ctx.shadowBlur = on ? 14 : 0;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.011, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.save();
  for (let i = 0; i < n; i += 1) {
    const x = 24 + (i / (n - 1)) * (w - 48);
    draw(x, 18, i);
    draw(x, h - 18, i + 1);
  }
  for (let i = 1; i < 14; i += 1) {
    const y = 18 + (i / 14) * (h - 36);
    draw(18, y, i + 2);
    draw(w - 18, y, i);
  }
  ctx.restore();
  ctx.shadowBlur = 0;
}

function hollywood(ctx, w, h, t, s) {
  const holly = s.holly || {};
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#120708');
  bg.addColorStop(0.5, '#07070a');
  bg.addColorStop(1, '#140a06');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // A spotlight sweeping across the board.
  const sx = w * (0.5 + 0.35 * Math.sin(t * 0.6));
  const beam = ctx.createRadialGradient(sx, h * 0.45, 0, sx, h * 0.45, w * 0.45);
  beam.addColorStop(0, 'rgba(255, 231, 168, 0.16)');
  beam.addColorStop(1, 'rgba(255, 231, 168, 0)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, w, h);
  bulbs(ctx, w, h, t);
  text(ctx, 'NOW SHOWING · CLOSED SET', w / 2, h * 0.15, { size: h * 0.032, weight: 700, color: RED, align: 'center' });
  text(ctx, 'THE HOLLYWOOD SECRET', w / 2, h * 0.27, { size: h * 0.085, weight: 800, color: GOLD, align: 'center', glow: 16 });
  text(ctx, 'THE 72-HOUR DEFLATE', w / 2, h * 0.35, { size: h * 0.04, weight: 600, color: WARM, align: 'center' });
  text(ctx, 'WHAT MOVES IN 72 HOURS', 60, h * 0.47, { size: h * 0.026, weight: 700, color: DIM });
  GAUGE.forEach(([name, fill, level], i) => {
    const y = h * 0.52 + i * h * 0.062;
    text(ctx, name.toUpperCase(), 60, y + h * 0.012, { size: h * 0.026, weight: 700, color: WARM });
    const x0 = 60 + w * 0.16;
    const bw = w * 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x0, y - h * 0.008, bw, h * 0.022);
    const grad = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
    grad.addColorStop(0, '#a87b12');
    grad.addColorStop(1, '#ffe07a');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y - h * 0.008, bw * (fill / 100) * (0.92 + 0.08 * Math.sin(t * 2 + i)), h * 0.022);
    text(ctx, level, x0 + bw + 16, y + h * 0.012, { size: h * 0.026, color: fill > 50 ? GOLD : DIM });
  });
  const blink = Math.sin(t * 4) > 0;
  text(ctx, holly.entered ? '● ON SET · CLEARANCE GRANTED' : holly.print ? 'PRINT ON FILE · ANSWER THE QUESTION' : (blink ? 'FINGERPRINT REQUIRED' : ''), w / 2, h * 0.9, { size: h * 0.032, weight: 800, color: holly.entered ? '#3ef0b4' : RED, align: 'center', glow: 8 });
}

Object.assign(DRAWERS, { hollywood });
