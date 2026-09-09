/**
 * The capture view: which networks are audible, and how much of each frame is.
 *
 * Deliberately limited to what a receiver learns without joining anything —
 * SSID, BSSID, channel, received power, and the per-subcarrier amplitude that
 * every OFDM radio computes to equalise a frame. That is the honest boundary of
 * passive observation, and the panel prints it: the payload stays encrypted,
 * and nothing here is a step towards decrypting it. What leaks is *metadata and
 * physics*, which is the uncomfortable part and the reason the episode exists.
 *
 * The rows and the bars are synthetic. There is no capture code in this app and
 * none of the numbers came from a radio.
 *
 * @module carrier/panels/sniffer
 */

import { drawTracked, roundRectPath, trackedWidth } from '../chrome.js';
import { hash3 } from '../rain.js';
import { toneColour, withAlpha } from '../theme.js';
import { fieldFooter, panelFrame } from './frame.js';

/** Networks shown when a script does not supply its own. */
const NETWORKS = [
  { ssid: 'CORP-ENTERPRISE-5G', bssid: '48:96:D9:16:6A:35', channel: 36, mhz: 5180, dbm: -48, subcarriers: 56, tone: 'accent' },
  { ssid: 'EXEC-CONFIDENTIAL', bssid: '48:96:D9:16:6A:36', channel: 44, mhz: 5220, dbm: -52, subcarriers: 56, tone: 'accent' },
  { ssid: 'FACILITY-IOT-INTERNAL', bssid: 'A0:04:60:11:F2:01', channel: 6, mhz: 2437, dbm: -61, subcarriers: 64, tone: 'warn' },
];

/**
 * Per-subcarrier amplitudes at a moment.
 *
 * Shaped like a real channel response — a broad frequency-selective tilt with
 * a couple of fades in it, wobbling slowly as the room changes — rather than
 * white noise, because the point of the panel is that this shape *is* the
 * information.
 *
 * @param {number} count How many subcarriers.
 * @param {number} t Seconds.
 * @param {number} [seed=1] Row seed.
 * @returns {number[]} Amplitudes, 0..1.
 */
export function subcarrierLevels(count, t, seed = 1) {
  const levels = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const u = i / (count - 1 || 1);
    const tilt = 0.55 + 0.25 * Math.cos(u * Math.PI * 1.4 + seed);
    const fade = 0.22 * Math.sin(u * Math.PI * 6 + t * 0.9 + seed * 2.1);
    const jitter = (hash3(i, Math.floor(t * 12), seed) - 0.5) * 0.14;
    levels[i] = Math.max(0.05, Math.min(1, tilt + fade + jitter));
  }
  return levels;
}

/**
 * Draw the capture view.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Panel box.
 * @param {object} params Panel parameters from the script.
 * @param {number} t Seconds since the scene started.
 * @param {object} context Render context.
 * @param {object} context.theme Palette.
 * @param {number} context.scale Canvas scale.
 * @returns {void}
 */
export function draw(ctx, box, params, t, { theme, scale }) {
  const rows = Array.isArray(params.networks) && params.networks.length ? params.networks : NETWORKS;
  const rate = Number(params.packetsPerSec) || 1420;
  const inner = panelFrame(ctx, box, theme, {
    status: params.status ?? 'passive monitor mode',
    statusTone: 'accent',
    legend: params.legend ?? 'physical layer only · payload stays encrypted',
    source: params.source ?? '',
    scale,
  });

  ctx.save();
  roundRectPath(ctx, inner, 6 * scale);
  ctx.clip();
  ctx.fillStyle = '#04060e';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

  const headH = Math.round(34 * scale);
  ctx.font = `${Math.round(14 * scale)}px ${theme.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.dim;
  drawTracked(ctx, 'SSID', inner.x + 12 * scale, inner.y + 10 * scale, 1.4 * scale);
  drawTracked(ctx, 'BSSID', inner.x + inner.w * 0.36, inner.y + 10 * scale, 1.4 * scale);
  drawTracked(ctx, 'CH', inner.x + inner.w * 0.62, inner.y + 10 * scale, 1.4 * scale);
  drawTracked(ctx, 'RSSI', inner.x + inner.w * 0.72, inner.y + 10 * scale, 1.4 * scale);
  drawTracked(ctx, 'CSI SUBCARRIERS', inner.x + inner.w * 0.82, inner.y + 10 * scale, 1.4 * scale);
  ctx.strokeStyle = withAlpha(theme.accent, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(inner.x + 10 * scale, inner.y + headH);
  ctx.lineTo(inner.x + inner.w - 10 * scale, inner.y + headH);
  ctx.stroke();

  const footerH = Math.round(30 * scale);
  const body = { x: inner.x, y: inner.y + headH, w: inner.w, h: inner.h - headH - footerH };
  const rowH = body.h / rows.length;

  rows.forEach((row, i) => {
    const tone = toneColour(theme, row.tone ?? 'accent');
    const y = body.y + i * rowH;
    const active = Math.floor(t * 1.6) % rows.length === i;

    ctx.fillStyle = withAlpha(tone, active ? 0.1 : 0.04);
    ctx.fillRect(body.x + 8 * scale, y + 4 * scale, body.w - 16 * scale, rowH - 8 * scale);
    ctx.fillStyle = tone;
    ctx.fillRect(body.x + 8 * scale, y + 4 * scale, Math.max(2, 3 * scale), rowH - 8 * scale);

    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(17 * scale)}px ${theme.mono}`;
    ctx.fillStyle = tone;
    drawTracked(ctx, row.ssid, body.x + 20 * scale, y + 14 * scale, 1 * scale);

    ctx.font = `${Math.round(14 * scale)}px ${theme.mono}`;
    ctx.fillStyle = theme.dim;
    drawTracked(ctx, row.bssid, body.x + body.w * 0.36, y + 16 * scale, 1 * scale);
    drawTracked(ctx, `${row.channel}`, body.x + body.w * 0.62, y + 16 * scale, 1 * scale);
    ctx.fillStyle = theme.text;
    drawTracked(ctx, `${row.dbm} dBm`, body.x + body.w * 0.72, y + 16 * scale, 1 * scale);

    ctx.fillStyle = withAlpha(theme.dim, 0.8);
    ctx.font = `${Math.round(12 * scale)}px ${theme.mono}`;
    drawTracked(ctx, `${row.mhz} MHz`, body.x + body.w * 0.62, y + 34 * scale, 0.8 * scale);

    // The channel response: the shape that carries the movement information.
    const barsBox = {
      x: body.x + body.w * 0.82,
      y: y + 12 * scale,
      w: body.w * 0.16,
      h: rowH - 26 * scale,
    };
    const levels = subcarrierLevels(Math.min(row.subcarriers ?? 56, 64), t, i + 1);
    const bw = barsBox.w / levels.length;
    levels.forEach((level, k) => {
      ctx.fillStyle = withAlpha(tone, 0.35 + level * 0.6);
      const h = Math.max(1, barsBox.h * level);
      ctx.fillRect(barsBox.x + k * bw, barsBox.y + barsBox.h - h, Math.max(1, bw - 0.6), h);
    });
    ctx.fillStyle = withAlpha(theme.dim, 0.8);
    drawTracked(ctx, `${row.subcarriers ?? 56} SC`, barsBox.x, y + rowH - 22 * scale, 0.8 * scale);
  });

  // A counter that visibly runs, so the frame reads as live capture.
  const packets = Math.floor(rate * t);
  const label = `INGEST ${packets.toLocaleString('en-US')} FRAMES · ${rate.toLocaleString('en-US')}/s`;
  ctx.font = `700 ${Math.round(14 * scale)}px ${theme.mono}`;
  const lw = trackedWidth(ctx, label, 1 * scale) + 18 * scale;
  const badge = {
    x: inner.x + inner.w - lw - 12 * scale,
    y: inner.y + inner.h - footerH - 30 * scale,
    w: lw,
    h: Math.round(24 * scale),
  };
  ctx.fillStyle = withAlpha('#000000', 0.7);
  roundRectPath(ctx, badge, 4 * scale);
  ctx.fill();
  ctx.fillStyle = theme.accent;
  ctx.textBaseline = 'top';
  drawTracked(ctx, label, badge.x + 9 * scale, badge.y + 5 * scale, 1 * scale);

  ctx.restore();
  ctx.strokeStyle = withAlpha(theme.accent, 0.4);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, inner, 6 * scale);
  ctx.stroke();
  fieldFooter(
    ctx,
    inner,
    params.footerLeft ?? 'synthetic capture · no radio attached',
    params.footerRight ?? 'ENCRYPTED PAYLOAD NOT TOUCHED',
    theme,
    scale,
  );
}
