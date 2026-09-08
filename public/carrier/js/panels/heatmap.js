/**
 * RF containment: the same floor, leaking and contained.
 *
 * The panel exists to make one defensive point visible — that whether an
 * outsider can sense anything at all is a function of how much signal you spill
 * past your own walls, and that both terms in that are adjustable. The left
 * field is a default install at full transmit power through untreated glass;
 * the right is the same room at a tuned power with an attenuating film on the
 * facade. The number that matters is printed on both: the strongest signal
 * reaching the kerb.
 *
 * The field is a plain free-space path-loss model at 2.4 GHz plus a facade
 * attenuation term. It is not a propagation simulation and does not pretend to
 * be: it is a teaching diagram whose shape is right — power falls with the
 * square of distance, attenuation is a flat subtraction — and whose absolute
 * numbers should be treated as illustrative. The footer says so on the frame.
 *
 * @module carrier/panels/heatmap
 */

import { drawTracked, roundRectPath, trackedWidth } from '../chrome.js';
import { dbmColour, withAlpha } from '../theme.js';
import { fieldFooter, panelFrame } from './frame.js';

/** Path loss at one metre, 2.4 GHz, in dB. */
export const FSPL_1M_DB = 40.05;

/** Noise floor a commodity radio realistically hears through, in dBm. */
export const NOISE_FLOOR_DBM = -82;

/**
 * Received signal strength at a distance.
 *
 * @param {number} txDbm Transmit power in dBm (EIRP).
 * @param {number} metres Distance from the access point.
 * @param {number} [attenDb=0] Extra attenuation on the path, in dB.
 * @returns {number} Received power in dBm.
 */
export function rssiAt(txDbm, metres, attenDb = 0) {
  const d = Math.max(0.5, metres);
  return txDbm - FSPL_1M_DB - 20 * Math.log10(d) - attenDb;
}

/**
 * A grid of received-power samples over a plan.
 *
 * Cells past the facade line pick up the facade's attenuation, which is the
 * whole mechanism the panel is about: the glass is where the decision gets
 * made.
 *
 * @param {object} options Field description.
 * @param {number} options.cols Grid columns.
 * @param {number} options.rows Grid rows.
 * @param {number} options.spanM Width of the plan in metres.
 * @param {{x: number, y: number}} options.ap Access point position, 0..1 of the plan.
 * @param {number} options.txDbm Transmit power in dBm.
 * @param {number} options.facadeY Facade line, 0..1 down the plan.
 * @param {number} [options.filmDb=0] Facade attenuation in dB.
 * @returns {{cells: number[], cols: number, rows: number, kerbDbm: number}} Samples
 *   in reading order, and the strongest reading past the facade.
 */
export function leakField({ cols, rows, spanM, ap, txDbm, facadeY, filmDb = 0 }) {
  const cells = new Array(cols * rows);
  const aspect = rows / cols;
  let kerbDbm = -Infinity;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const u = (c + 0.5) / cols;
      const v = (r + 0.5) / rows;
      const dx = (u - ap.x) * spanM;
      const dy = (v - ap.y) * spanM * aspect;
      const outside = v > facadeY;
      const dbm = rssiAt(txDbm, Math.hypot(dx, dy), outside ? filmDb : 0);
      cells[r * cols + c] = dbm;
      if (outside && dbm > kerbDbm) kerbDbm = dbm;
    }
  }
  return { cells, cols, rows, kerbDbm };
}

/** The two sides of the comparison, and the trim printed on each. */
const SIDES = [
  {
    key: 'leaking',
    title: 'DEFAULT: UNCONTAINED RF LEAKAGE',
    tone: 'alert',
    sub: '100% Tx power (+20 dBm) · untreated glass (−3 dB)',
    txDbm: 20,
    filmDb: 3,
    verdict: 'PASSIVE SENSING SUCCEEDS',
  },
  {
    key: 'contained',
    title: 'HARDENED: CONTAINED PERIMETER',
    tone: 'good',
    sub: 'Tuned +12 dBm · RF window film (−36 dB)',
    txDbm: 12,
    filmDb: 36,
    verdict: 'BELOW NOISE FLOOR — NO USABLE SIGNAL',
  },
];

/**
 * Draw the containment comparison.
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
  const inner = panelFrame(ctx, box, theme, {
    status: params.status ?? 'RF site survey',
    statusTone: 'accent',
    legend: params.legend ?? 'transmit power · facade attenuation',
    source: params.source ?? '',
    scale,
  });

  const scaleBarH = Math.round(62 * scale);
  const fieldsBox = { ...inner, h: inner.h - scaleBarH };
  const gap = Math.round(14 * scale);
  const fieldW = (fieldsBox.w - gap) / 2;
  const spanM = Number(params.spanM) || 46;
  const facadeY = Number(params.facadeY) || 0.62;

  SIDES.forEach((side, i) => {
    const field = { x: fieldsBox.x + i * (fieldW + gap), y: fieldsBox.y, w: fieldW, h: fieldsBox.h };
    const txDbm = Number(params[`${side.key}Tx`] ?? side.txDbm);
    const filmDb = Number(params[`${side.key}Film`] ?? side.filmDb);
    drawField(ctx, field, { side, spanM, facadeY, txDbm, filmDb, t }, theme, scale);
  });

  drawScale(ctx, { x: inner.x, y: inner.y + inner.h - scaleBarH + 8 * scale, w: inner.w, h: scaleBarH - 8 * scale }, theme, scale);
}

/**
 * A dark plate behind a small label, so it survives being drawn over heat.
 *
 * @param {CanvasRenderingContext2D} ctx Target context, with the label's font set.
 * @param {string} text The label.
 * @param {number} x Left edge of the text.
 * @param {number} y Top edge of the text.
 * @param {number} scale Canvas scale.
 * @returns {void}
 */
function plate(ctx, text, x, y, scale) {
  const w = trackedWidth(ctx, text, 0.8 * scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x - 4 * scale, y - 1 * scale, w + 8 * scale, 14 * scale);
}


/**
 * One side of the comparison.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Field box.
 * @param {object} state Field state.
 * @param {object} theme Palette.
 * @param {number} scale Canvas scale.
 * @returns {void}
 */
function drawField(ctx, box, state, theme, scale) {
  const { side, spanM, facadeY, txDbm, filmDb, t } = state;
  const headerH = Math.round(44 * scale);
  const plan = { x: box.x, y: box.y + headerH, w: box.w, h: box.h - headerH };
  const tone = side.tone === 'alert' ? theme.alert : theme.good;

  ctx.font = `700 ${Math.round(17 * scale)}px ${theme.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = tone;
  drawTracked(ctx, side.title, box.x, box.y, 1.2 * scale);
  ctx.font = `${Math.round(14 * scale)}px ${theme.mono}`;
  ctx.fillStyle = theme.dim;
  drawTracked(ctx, side.sub, box.x, box.y + 21 * scale, 0.8 * scale);

  const cols = 44;
  const rows = Math.max(8, Math.round((cols * plan.h) / plan.w));
  const ap = { x: 0.42, y: 0.34 };
  const field = leakField({ cols, rows, spanM, ap, txDbm, facadeY, filmDb });
  const cw = plan.w / cols;
  const ch = plan.h / rows;

  ctx.save();
  roundRectPath(ctx, plan, 6 * scale);
  ctx.clip();
  ctx.fillStyle = '#05060c';
  ctx.fillRect(plan.x, plan.y, plan.w, plan.h);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const dbm = field.cells[r * cols + c];
      if (dbm < -92) continue;
      ctx.globalAlpha = dbm < NOISE_FLOOR_DBM ? 0.35 : 0.85;
      ctx.fillStyle = dbmColour(dbm);
      ctx.fillRect(plan.x + c * cw - 0.5, plan.y + r * ch - 0.5, cw + 1, ch + 1);
    }
  }
  ctx.globalAlpha = 1;

  // The building: interior rooms, then the facade the signal has to cross.
  const facadePx = plan.y + plan.h * facadeY;
  ctx.strokeStyle = withAlpha('#ffffff', 0.22);
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  const rooms = [
    { x: 0.06, y: 0.06, w: 0.44, h: 0.26, label: 'EXECUTIVE SUITE' },
    { x: 0.54, y: 0.06, w: 0.4, h: 0.26, label: '' },
    { x: 0.06, y: 0.38, w: 0.88, h: 0.2, label: 'OPEN WORKSPACES' },
  ];
  ctx.font = `${Math.round(11 * scale)}px ${theme.mono}`;
  for (const room of rooms) {
    const r = {
      x: plan.x + room.x * plan.w,
      y: plan.y + room.y * plan.h,
      w: room.w * plan.w,
      h: room.h * plan.h,
    };
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (room.label) {
      plate(ctx, room.label, r.x + 6 * scale, r.y + 5 * scale, scale);
      ctx.fillStyle = withAlpha('#ffffff', 0.85);
      drawTracked(ctx, room.label, r.x + 6 * scale, r.y + 6 * scale, 0.8 * scale);
    }
  }

  const hardened = filmDb >= 12;
  ctx.strokeStyle = hardened ? theme.good : withAlpha(theme.alert, 0.9);
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.beginPath();
  ctx.moveTo(plan.x, facadePx);
  ctx.lineTo(plan.x + plan.w, facadePx);
  ctx.stroke();
  // Small type over a hot field is unreadable, so every in-plan label gets a
  // dark plate under it rather than a heavier weight.
  ctx.font = `${Math.round(11 * scale)}px ${theme.mono}`;
  const facadeLabel = hardened
    ? `RF-ATTENUATING FILM (−${filmDb} dB)`
    : `EXTERIOR GLASS (−${filmDb} dB, UNSHIELDED)`;
  plate(ctx, facadeLabel, plan.x + 8 * scale, facadePx - 17 * scale, scale);
  ctx.fillStyle = hardened ? theme.good : withAlpha(theme.alert, 0.95);
  drawTracked(ctx, facadeLabel, plan.x + 8 * scale, facadePx - 16 * scale, 0.8 * scale);

  // The access point, pulsing at the rate the field is refreshed.
  const apPx = { x: plan.x + ap.x * plan.w, y: plan.y + ap.y * plan.h };
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  ctx.strokeStyle = withAlpha(theme.accent, 0.5 + pulse * 0.4);
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.arc(apPx.x, apPx.y, (10 + pulse * 12) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(apPx.x, apPx.y, 5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.font = `${Math.round(11 * scale)}px ${theme.mono}`;
  drawTracked(ctx, 'WI-FI AP', apPx.x - 22 * scale, apPx.y - 26 * scale, 0.8 * scale);

  // The kerb, and the van parked on it.
  const kerbY = plan.y + plan.h * 0.82;
  ctx.setLineDash([6 * scale, 6 * scale]);
  ctx.strokeStyle = withAlpha('#ffffff', 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plan.x, kerbY);
  ctx.lineTo(plan.x + plan.w, kerbY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Right-aligned, because the kerb reading badge sits at the left of this row.
  const walk = 'PUBLIC SIDEWALK';
  const walkW = trackedWidth(ctx, walk, 0.8 * scale);
  const walkX = plan.x + plan.w - walkW - 8 * scale;
  plate(ctx, walk, walkX, kerbY - 16 * scale, scale);
  ctx.fillStyle = withAlpha('#ffffff', 0.7);
  drawTracked(ctx, walk, walkX, kerbY - 15 * scale, 0.8 * scale);

  const van = {
    x: plan.x + plan.w * 0.52,
    y: plan.y + plan.h * 0.88,
    w: plan.w * 0.34,
    h: Math.round(26 * scale),
  };
  ctx.strokeStyle = tone;
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, van, 4 * scale);
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.font = `700 ${Math.round(12 * scale)}px ${theme.mono}`;
  drawTracked(ctx, 'PASSIVE RECEIVER', van.x + 8 * scale, van.y + 7 * scale, 0.8 * scale);

  // The one number the panel is about.
  const readout = `KERB: ${field.kerbDbm.toFixed(0)} dBm`;
  ctx.font = `700 ${Math.round(15 * scale)}px ${theme.mono}`;
  const rw = trackedWidth(ctx, readout, 1 * scale) + 18 * scale;
  const badge = { x: plan.x + 8 * scale, y: van.y - 34 * scale, w: rw, h: Math.round(24 * scale) };
  ctx.fillStyle = withAlpha('#000000', 0.75);
  roundRectPath(ctx, badge, 4 * scale);
  ctx.fill();
  ctx.strokeStyle = tone;
  ctx.lineWidth = 1;
  roundRectPath(ctx, badge, 4 * scale);
  ctx.stroke();
  ctx.fillStyle = tone;
  drawTracked(ctx, readout, badge.x + 9 * scale, badge.y + 5 * scale, 1 * scale);

  ctx.restore();

  ctx.strokeStyle = withAlpha(tone, 0.6);
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  roundRectPath(ctx, plan, 6 * scale);
  ctx.stroke();
  fieldFooter(ctx, plan, side.verdict, `${txDbm} dBm EIRP`, theme, scale);
}

/**
 * The signal-strength scale, with the noise floor marked.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number, w: number, h: number}} box Scale box.
 * @param {object} theme Palette.
 * @param {number} scale Canvas scale.
 * @returns {void}
 */
function drawScale(ctx, box, theme, scale) {
  const barH = Math.round(12 * scale);
  const bar = { x: box.x, y: box.y + Math.round(16 * scale), w: box.w, h: barH };
  const steps = 64;
  for (let i = 0; i < steps; i += 1) {
    const dbm = -95 + (65 * i) / (steps - 1);
    ctx.fillStyle = dbmColour(dbm);
    ctx.fillRect(bar.x + (bar.w * i) / steps, bar.y, bar.w / steps + 1, bar.h);
  }
  ctx.font = `${Math.round(13 * scale)}px ${theme.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.dim;
  drawTracked(ctx, 'RF SIGNAL STRENGTH (dBm)  −95', bar.x, box.y, 0.8 * scale);
  const right = '−30  ILLUSTRATIVE MODEL: FSPL + FACADE LOSS';
  const rw = trackedWidth(ctx, right, 0.8 * scale);
  drawTracked(ctx, right, bar.x + bar.w - rw, box.y, 0.8 * scale);

  const floorX = bar.x + bar.w * ((NOISE_FLOOR_DBM + 95) / 65);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.beginPath();
  ctx.moveTo(floorX, bar.y - 4 * scale);
  ctx.lineTo(floorX, bar.y + bar.h + 4 * scale);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  drawTracked(ctx, `${NOISE_FLOOR_DBM} dBm NOISE FLOOR`, floorX + 6 * scale, bar.y + bar.h + 6 * scale, 0.8 * scale);
}
