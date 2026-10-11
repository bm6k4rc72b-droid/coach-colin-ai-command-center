/**
 * Wall screens for the International Translation Hub and Courtroom Sector 7,
 * registered into the shared drawer table like the rest of the room.
 *
 * @module astra/showcase/screens3
 */

import { DRAWERS, ink } from './screens.js';
import { GREETINGS, HUB_LANGS, langById } from './hub.js';
import { JURY_SIZE, ROUNDS, SIDES } from './court.js';

const { chrome, text, GOLD, ICE, TEXT, DIM, FONT } = ink;
const RED = '#ff5a5a';
const GREEN = '#3ef0b4';

/**
 * Wrap text that may have no spaces: words for spaced scripts, single
 * characters for Chinese, Japanese and Korean. Right-to-left lines are
 * right-aligned.
 */
function wrap(ctx, value, x, y, maxWidth, lineHeight, { size = 22, color = TEXT, weight = 400, lines = 3, rtl = false } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const tokens = String(value || '').match(/[぀-ヿ㐀-鿿가-힯][、。，！？]?|[^\s぀-ヿ㐀-鿿가-힯]+\s*|\s+/g) || [];
  const at = rtl ? x + maxWidth : x;
  let row = '';
  let n = 0;
  for (const token of tokens) {
    const test = row + token;
    if (ctx.measureText(test.trim()).width > maxWidth && row) {
      if (n === lines - 1) { ctx.fillText(`${row.trim()}…`, at, y + n * lineHeight); n += 1; row = ''; break; }
      ctx.fillText(row.trim(), at, y + n * lineHeight);
      n += 1;
      row = token.trimStart();
    } else row = test;
  }
  if (row && n < lines) ctx.fillText(row.trim(), at, y + n * lineHeight);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
}

function translate(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'INTERNATIONAL TRANSLATION HUB', 'On-device translation · 12 languages · nothing leaves this device');
  const hub = s.hub || {};
  const source = hub.pairFrom || hub.from;
  // The language pipeline: a pill per language, the active pair lit.
  text(ctx, 'LANGUAGE PIPELINE', 44, h * 0.25, { size: h * 0.026, weight: 700, color: DIM });
  const pill = w * 0.046;
  HUB_LANGS.forEach((l, i) => {
    const x = 44 + i * (pill + 6);
    const on = l.id === source || l.id === hub.to;
    ctx.fillStyle = on ? 'rgba(240,183,90,0.28)' : 'rgba(111,211,255,0.08)';
    ctx.fillRect(x, h * 0.275, pill, h * 0.055);
    text(ctx, l.flag, x + pill / 2, h * 0.315, { size: h * 0.028, weight: 700, align: 'center', color: on ? GOLD : ICE, glow: on ? 8 : 0 });
  });
  const last = hub.last;
  const engine = last?.engine || 'idle';
  const live = s.hubEngine;
  text(ctx, `ENGINE  ${live ? 'on-device AI' : 'phrasebook'}${last ? `  ·  LAST  ${last.engine}${last.engine === 'none' ? '' : `, ${last.ms.toFixed(last.ms < 10 ? 1 : 0)} ms`}` : ''}`, 44, h * 0.4, { size: h * 0.028, weight: 600, color: engine === 'on-device AI' ? GREEN : engine === 'none' ? RED : GOLD });
  if (last) {
    const from = langById(last.from);
    const to = langById(last.to);
    text(ctx, `${from.flag} → ${to.flag}${last.detected ? `   detected ${from.english} ${Math.round(last.detected.confidence * 100)}%` : ''}`, 44, h * 0.47, { size: h * 0.026, color: DIM });
    wrap(ctx, last.source, 44, h * 0.53, w * 0.56, h * 0.042, { size: h * 0.03, color: TEXT, lines: 2, rtl: from.dir === 'rtl' });
    wrap(ctx, last.text || '— no translator for this pair on this device —', 44, h * 0.64, w * 0.56, h * 0.05, { size: h * 0.038, weight: 600, color: last.text ? GOLD : DIM, lines: 3, rtl: to.dir === 'rtl' });
  } else {
    wrap(ctx, 'Type, paste or speak in the card. The engine that answers and the milliseconds it took appear here.', 44, h * 0.55, w * 0.56, h * 0.045, { size: h * 0.032, color: TEXT, lines: 3 });
  }
  // Measured latency of the last twelve translations.
  const history = hub.history || [];
  const x0 = w * 0.66;
  const y0 = h * 0.82;
  text(ctx, 'MEASURED LATENCY', x0, h * 0.25, { size: h * 0.026, weight: 700, color: DIM });
  const max = Math.max(50, ...history.map((r) => r.ms));
  history.forEach((r, i) => {
    const bh = (r.ms / max) * h * 0.42;
    ctx.fillStyle = r.engine === 'on-device AI' ? 'rgba(62,240,180,0.75)' : r.engine === 'phrasebook' ? 'rgba(240,183,90,0.75)' : 'rgba(255,90,90,0.5)';
    ctx.fillRect(x0 + i * w * 0.024, y0 - bh, w * 0.016, Math.max(2, bh));
  });
  if (history.length) {
    const mean = history.reduce((a, r) => a + r.ms, 0) / history.length;
    text(ctx, `mean ${mean.toFixed(mean < 10 ? 1 : 0)} ms · n = ${history.length}`, x0, y0 + h * 0.05, { size: h * 0.026, color: TEXT });
  }
  // "Hello" ticker along the bottom.
  const greet = HUB_LANGS.map((l) => GREETINGS[l.id]).join('   ·   ');
  ctx.save();
  ctx.beginPath();
  ctx.rect(44, h * 0.885, w - 88, h * 0.06);
  ctx.clip();
  ctx.font = `500 ${h * 0.03}px ${FONT}`;
  const span = ctx.measureText(`${greet}   ·   `).width;
  const off = (t * 40) % span;
  for (let k = 0; k < 3; k += 1) text(ctx, greet, 44 - off + k * span, h * 0.925, { size: h * 0.03, color: ICE });
  ctx.restore();
}

function arena(ctx, w, h, t, s) {
  const k = s.court;
  chrome(ctx, w, h, 'COURTROOM SECTOR 7 · JUDICIAL DIVISION', k ? `Case No. ${k.number}` : 'Court in recess · open a case in the card');
  if (!k) {
    wrap(ctx, 'Put a claim on trial. Defence argues for, Prosecution against; the compound’s studies are the exhibits; Judge Colin rules on every objection.', 44, h * 0.32, w * 0.55, h * 0.05, { size: h * 0.034, color: TEXT, lines: 4 });
    return;
  }
  wrap(ctx, `Motion: “${k.motion}”`, 44, h * 0.26, w * 0.9, h * 0.045, { size: h * 0.034, weight: 600, color: GOLD, lines: 1 });
  // Exhibits.
  text(ctx, 'TRIAL EXHIBITS', 44, h * 0.34, { size: h * 0.026, weight: 700, color: DIM });
  k.exhibits.slice(0, 6).forEach((e, i) => {
    const y = h * 0.39 + i * h * 0.065;
    const on = k.witness?.letter === e.letter && t - k.witness.at < 20;
    text(ctx, e.letter, 44, y, { size: h * 0.034, weight: 700, color: e.direction < 0 ? RED : GOLD, glow: on ? 12 : 0 });
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(74, y - h * 0.022, w * 0.12, h * 0.016);
    ctx.fillStyle = e.direction < 0 ? RED : e.ceiling > 0.6 ? GREEN : e.ceiling > 0.4 ? GOLD : ICE;
    ctx.fillRect(74, y - h * 0.022, w * 0.12 * e.ceiling, h * 0.016);
    wrap(ctx, `${e.tierLabel} · ${e.year}${on ? ' · ON THE STAND' : ''}`, 74 + w * 0.13, y, w * 0.24, h * 0.03, { size: h * 0.024, color: on ? GOLD : TEXT, lines: 1 });
  });
  if (!k.exhibits.length) text(ctx, 'No exhibits on file', 44, h * 0.4, { size: h * 0.028, color: DIM });
  // Scorecard.
  const cx = w * 0.52;
  [['a', GOLD], ['b', ICE]].forEach(([side, colour], i) => {
    const x = cx + i * w * 0.2;
    const winner = k.verdict?.winner === side;
    text(ctx, `${SIDES[side].role.toUpperCase()} · ${SIDES[side].stance}`, x, h * 0.37, { size: h * 0.024, weight: 700, color: colour, glow: !k.closed && k.turn === side ? 10 : 0 });
    wrap(ctx, k.names[side], x, h * 0.42, w * 0.18, h * 0.04, { size: h * 0.03, color: TEXT, lines: 1 });
    text(ctx, String(k.totals[side]), x, h * 0.55, { size: h * 0.1, weight: 700, color: winner ? GREEN : colour, glow: 10 });
  });
  text(ctx, k.done ? 'VERDICT' : k.closed ? 'JURY OUT' : `ROUND ${Math.min(k.round, ROUNDS)} / ${ROUNDS}`, cx, h * 0.62, { size: h * 0.026, weight: 700, color: DIM });
  // Objection log.
  const objections = k.log.filter((e) => e.kind === 'objection').slice(-3);
  text(ctx, 'OBJECTION LOG', cx, h * 0.69, { size: h * 0.026, weight: 700, color: DIM });
  objections.forEach((o, i) => wrap(ctx, o.text, cx, h * 0.735 + i * h * 0.04, w * 0.43, h * 0.03, { size: h * 0.024, color: /Sustained/.test(o.text) ? RED : ICE, lines: 1 }));
  if (!objections.length) text(ctx, 'None yet', cx, h * 0.735, { size: h * 0.024, color: DIM });
  // Jury box.
  const jy = h * 0.88;
  text(ctx, 'JURY', 44, jy + h * 0.01, { size: h * 0.026, weight: 700, color: DIM });
  for (let i = 0; i < JURY_SIZE; i += 1) {
    const v = k.jury[i];
    ctx.beginPath();
    ctx.arc(120 + i * h * 0.05, jy, h * 0.014, 0, Math.PI * 2);
    ctx.fillStyle = v === 'a' ? GOLD : v === 'b' ? ICE : 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
  if (k.verdict) {
    const v = k.verdict;
    wrap(ctx, v.winner ? `Verdict for the ${SIDES[v.winner].role} · jury ${v.jury.a}–${v.jury.b}` : `No majority · jury ${v.jury.a}–${v.jury.b}`, cx, jy + h * 0.01, w * 0.43, h * 0.04, { size: h * 0.03, weight: 700, color: GREEN, lines: 1 });
  }
}

Object.assign(DRAWERS, { translate, arena });
