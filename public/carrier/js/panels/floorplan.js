/**
 * A facility plan with occupancy and a patrol, drawn as an attacker would see it.
 *
 * This is the frame that carries the point of the whole episode: the output of
 * passive sensing is not a photograph, it is a floor plan with counts and
 * timings on it, and that is worse. Nobody feels watched by an occupancy
 * number until they see it laid over the room they are sitting in with a guard
 * walking a predictable loop through it.
 *
 * The patrol is a straight-line walk between checkpoints at a constant pace,
 * looped. It is drawn because predictability is the finding — a patrol whose
 * position at second *n* can be stated is a patrol that can be avoided.
 *
 * @module carrier/panels/floorplan
 */

import { drawTracked, roundRectPath, trackedWidth } from '../chrome.js';
import { toneColour, withAlpha } from '../theme.js';
import { fieldFooter, panelFrame } from './frame.js';

/** Default rooms, in plan-relative units. */
const ROOMS = [
  { id: 'conf', name: 'CONF ROOM A', x: 0.2, y: 0.04, w: 0.42, h: 0.3, occupants: 4, tone: 'warn' },
  { id: 'exec', name: 'EXEC SUITE', x: 0.64, y: 0.04, w: 0.32, h: 0.3, occupants: 1, tone: 'accent' },
  { id: 'open', name: 'OPEN OFFICE', x: 0.2, y: 0.56, w: 0.3, h: 0.4, occupants: 0, tone: 'dim' },
  { id: 'break', name: 'BREAK ROOM', x: 0.52, y: 0.56, w: 0.22, h: 0.4, occupants: 2, tone: 'warn' },
  { id: 'sec', name: 'SECURITY HQ', x: 0.76, y: 0.56, w: 0.2, h: 0.4, occupants: 1, tone: 'alert' },
];

/** Default patrol checkpoints, in plan-relative units. */
const CHECKPOINTS = [
  { id: 'CP-01', x: 0.22, y: 0.47 },
  { id: 'CP-02', x: 0.38, y: 0.47 },
  { id: 'CP-03', x: 0.55, y: 0.47 },
  { id: 'CP-04', x: 0.72, y: 0.47 },
  { id: 'CP-05', x: 0.92, y: 0.47 },
];

/**
 * Where the patrol is at a moment.
 *
 * The walk runs out to the last checkpoint and back, so the loop closes without
 * a teleport at the end — a guard who vanishes from one end of the corridor and
 * reappears at the other reads as an animation glitch and undermines the point.
 *
 * @param {Array<{id: string, x: number, y: number}>} points Checkpoints in order.
 * @param {number} t Seconds since the scene started.
 * @param {number} [secPerLeg=2.4] Seconds to walk one leg.
 * @returns {{x: number, y: number, from: string, to: string, leg: number}} Position and leg.
 */
export function patrolAt(points, t, secPerLeg = 2.4) {
  if (points.length < 2) return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, from: '', to: '', leg: 0 };
  const route = [...points, ...points.slice(0, -1).reverse()];
  const legs = route.length - 1;
  const cycle = legs * secPerLeg;
  const at = ((t % cycle) + cycle) % cycle;
  const leg = Math.min(legs - 1, Math.floor(at / secPerLeg));
  const k = (at - leg * secPerLeg) / secPerLeg;
  const a = route[leg];
  const b = route[leg + 1];
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    from: a.id,
    to: b.id,
    leg,
  };
}

/**
 * Occupant positions inside a room.
 *
 * Deterministic from the room id, so a scene scrubbed backwards does not
 * reshuffle the people in it.
 *
 * @param {{id: string, x: number, y: number, w: number, h: number}} room The room.
 * @param {number} count How many occupants.
 * @returns {Array<{x: number, y: number}>} Positions in plan-relative units.
 */
export function occupantDots(room, count) {
  const seed = [...room.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const a = ((seed + i * 137) % 360) * (Math.PI / 180);
    const r = 0.18 + ((seed + i * 53) % 100) / 380;
    // Kept below the room's label block: an occupant drawn over the room name
    // hides the count the frame is making its point with.
    dots.push({
      x: room.x + room.w * (0.5 + Math.cos(a) * r),
      y: room.y + room.h * (0.62 + Math.sin(a) * r * 0.6),
    });
  }
  return dots;
}

/**
 * Draw the plan.
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
  const rooms = Array.isArray(params.rooms) && params.rooms.length ? params.rooms : ROOMS;
  const checkpoints = Array.isArray(params.checkpoints) && params.checkpoints.length
    ? params.checkpoints
    : CHECKPOINTS;

  const inner = panelFrame(ctx, box, theme, {
    status: params.status ?? 'reconstructed layout',
    statusTone: 'alert',
    legend: params.legend ?? 'occupancy · patrol timing',
    source: params.source ?? '',
    scale,
  });

  ctx.save();
  roundRectPath(ctx, inner, 6 * scale);
  ctx.clip();
  ctx.fillStyle = '#05060e';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

  // Faint plan grid, so the diagram reads as a survey rather than a drawing.
  ctx.strokeStyle = withAlpha(theme.accent, 0.07);
  ctx.lineWidth = 1;
  const step = Math.round(28 * scale);
  for (let x = inner.x; x < inner.x + inner.w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, inner.y);
    ctx.lineTo(x, inner.y + inner.h);
    ctx.stroke();
  }
  for (let y = inner.y; y < inner.y + inner.h; y += step) {
    ctx.beginPath();
    ctx.moveTo(inner.x, y);
    ctx.lineTo(inner.x + inner.w, y);
    ctx.stroke();
  }

  const px = (p) => ({ x: inner.x + p.x * inner.w, y: inner.y + p.y * inner.h });

  // The receiver on the street, and the facade it is looking through.
  const facadeX = inner.x + inner.w * 0.17;
  ctx.strokeStyle = withAlpha(theme.accent, 0.5);
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.moveTo(facadeX, inner.y);
  ctx.lineTo(facadeX, inner.y + inner.h);
  ctx.stroke();
  ctx.save();
  ctx.translate(facadeX - 8 * scale, inner.y + inner.h * 0.62);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `${Math.round(12 * scale)}px ${theme.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = withAlpha(theme.accent, 0.7);
  drawTracked(ctx, 'EXTERIOR FACADE (RF TRANSPARENT)', 0, 0, 0.8 * scale);
  ctx.restore();

  const van = {
    x: inner.x + 10 * scale,
    y: inner.y + inner.h * 0.3,
    w: facadeX - inner.x - 26 * scale,
    h: Math.round(74 * scale),
  };
  ctx.fillStyle = withAlpha(theme.alert, 0.12);
  roundRectPath(ctx, van, 4 * scale);
  ctx.fill();
  ctx.strokeStyle = withAlpha(theme.alert, 0.8);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, van, 4 * scale);
  ctx.stroke();
  ctx.font = `700 ${Math.round(12 * scale)}px ${theme.mono}`;
  ctx.fillStyle = theme.alert;
  ctx.textBaseline = 'top';
  drawTracked(ctx, 'RECEIVER', van.x + 8 * scale, van.y + 10 * scale, 0.8 * scale);
  ctx.font = `${Math.round(11 * scale)}px ${theme.mono}`;
  ctx.fillStyle = withAlpha(theme.alert, 0.75);
  drawTracked(ctx, 'PARKED, PASSIVE', van.x + 8 * scale, van.y + 28 * scale, 0.6 * scale);

  // Rooms, with what the reconstruction believes is inside them.
  for (const room of rooms) {
    const r = {
      x: inner.x + room.x * inner.w,
      y: inner.y + room.y * inner.h,
      w: room.w * inner.w,
      h: room.h * inner.h,
    };
    const tone = toneColour(theme, room.tone ?? 'dim');
    ctx.fillStyle = withAlpha(tone, room.occupants ? 0.09 : 0.03);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = withAlpha(tone, room.occupants ? 0.8 : 0.35);
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    ctx.font = `700 ${Math.round(13 * scale)}px ${theme.mono}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = withAlpha(tone, 0.95);
    drawTracked(ctx, room.name, r.x + 8 * scale, r.y + 8 * scale, 1 * scale);

    const label = room.occupants
      ? `${room.occupants} OCCUPANT${room.occupants > 1 ? 'S' : ''} DETECTED`
      : 'CLEAR';
    ctx.font = `${Math.round(11 * scale)}px ${theme.mono}`;
    ctx.fillStyle = withAlpha(tone, 0.75);
    drawTracked(ctx, label, r.x + 8 * scale, r.y + 26 * scale, 0.7 * scale);

    for (const dot of occupantDots(room, room.occupants ?? 0)) {
      const p = px(dot);
      const breathe = 0.6 + 0.4 * Math.sin(t * 2 + dot.x * 14);
      ctx.fillStyle = withAlpha(tone, 0.25 * breathe);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The corridor, its checkpoints, and the guard on them.
  const first = px(checkpoints[0]);
  const last = px(checkpoints[checkpoints.length - 1]);
  ctx.setLineDash([8 * scale, 8 * scale]);
  ctx.strokeStyle = withAlpha(theme.warn, 0.6);
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `${Math.round(11 * scale)}px ${theme.mono}`;
  for (const cp of checkpoints) {
    const p = px(cp);
    ctx.strokeStyle = withAlpha(theme.warn, 0.9);
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = withAlpha(theme.warn, 0.7);
    drawTracked(ctx, cp.id, p.x - 16 * scale, p.y + 14 * scale, 0.6 * scale);
  }

  const guard = patrolAt(checkpoints, t, Number(params.secPerLeg) || 2.4);
  const gp = px(guard);
  ctx.fillStyle = withAlpha(theme.warn, 0.3);
  ctx.beginPath();
  ctx.arc(gp.x, gp.y, 16 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.warn;
  ctx.beginPath();
  ctx.arc(gp.x, gp.y, 8 * scale, 0, Math.PI * 2);
  ctx.fill();

  const tag = `GUARD 02 [${guard.from} → ${guard.to}]`;
  ctx.font = `700 ${Math.round(12 * scale)}px ${theme.mono}`;
  const tw = trackedWidth(ctx, tag, 0.8 * scale) + 16 * scale;
  const tagBox = { x: gp.x - tw / 2, y: gp.y - 34 * scale, w: tw, h: Math.round(22 * scale) };
  ctx.fillStyle = withAlpha('#000000', 0.8);
  roundRectPath(ctx, tagBox, 4 * scale);
  ctx.fill();
  ctx.strokeStyle = withAlpha(theme.warn, 0.8);
  ctx.lineWidth = 1;
  roundRectPath(ctx, tagBox, 4 * scale);
  ctx.stroke();
  ctx.fillStyle = theme.warn;
  ctx.textBaseline = 'top';
  drawTracked(ctx, tag, tagBox.x + 8 * scale, tagBox.y + 5 * scale, 0.8 * scale);

  ctx.restore();
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, inner, 6 * scale);
  ctx.stroke();
  fieldFooter(
    ctx,
    inner,
    params.footerLeft ?? 'no cameras · no network credentials · signal only',
    params.footerRight ?? 'SCALE 1:100',
    theme,
    scale,
  );
}
