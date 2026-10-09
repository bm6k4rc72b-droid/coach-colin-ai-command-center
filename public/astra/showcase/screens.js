/**
 * The wall screens, drawn in 2D canvas and mapped onto the curved panels.
 *
 * Each drawer receives the canvas context, its size, the clock and the shared
 * interaction state. They draw instrument faces, not decoration: every bar,
 * gauge and curve is computed from the same data the station's card cites.
 *
 * @module astra/showcase/screens
 */

import { AGONISTS, CEILINGS, CODONS, READINGS, SEQUENCES, SIZE, SITES, STUDIES, requiredEfficiency, sppsYield } from './sections.js';
import { PEPTIDES, SYSTEMS } from '../js/data/peptides.js';
import { REVIEWERS } from '../js/reviewers.js';
import { FORMATS } from '../js/studio.js';
import { TIERS } from '../js/evidence.js';

/** The station's photograph, set by {@link draw} for the duration of one draw. */
let plate = null;
/** How hard to darken the plate: 0 leaves it bright, 1 nearly hides it. */
let plateShade = 0.7;

const GOLD = '#f0b75a';
const GOLD_SOFT = 'rgba(240,183,90,0.35)';
const ICE = '#6fd3ff';
const ICE_SOFT = 'rgba(111,211,255,0.3)';
const TEXT = '#e9eef8';
const DIM = 'rgba(200,214,236,0.6)';
const FONT = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif';

/* ------------------------------------------------------------ primitives */

function chrome(ctx, w, h, title, sub) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#05080f');
  bg.addColorStop(1, '#020306');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (plate && plate.complete && plate.naturalWidth) {
    // Cover-fit the photograph, then shade it so the instruments stay legible:
    // heavier on the left, where the readouts sit.
    const scale = Math.max(w / plate.naturalWidth, h / plate.naturalHeight);
    const dw = plate.naturalWidth * scale;
    const dh = plate.naturalHeight * scale;
    ctx.drawImage(plate, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, `rgba(2,3,6,${0.55 + plateShade * 0.4})`);
    shade.addColorStop(0.55, `rgba(2,3,6,${0.25 + plateShade * 0.45})`);
    shade.addColorStop(1, `rgba(2,3,6,${0.1 + plateShade * 0.3})`);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  }
  // Fine grid.
  ctx.strokeStyle = 'rgba(111,211,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  // Corner brackets.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  const c = 34;
  for (const [x, y, dx, dy] of [[14, 14, 1, 1], [w - 14, 14, -1, 1], [14, h - 14, 1, -1], [w - 14, h - 14, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * c); ctx.lineTo(x, y); ctx.lineTo(x + dx * c, y); ctx.stroke();
  }
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 12;
  ctx.font = `700 ${Math.round(h * 0.062)}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(title, 40, 40 + h * 0.06);
  ctx.shadowBlur = 0;
  if (sub) {
    ctx.fillStyle = DIM;
    ctx.font = `500 ${Math.round(h * 0.03)}px ${FONT}`;
    ctx.fillText(sub, 42, 40 + h * 0.06 + h * 0.05);
  }
}

function text(ctx, value, x, y, { size = 20, color = TEXT, weight = 500, align = 'left', glow = 0 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillText(value, x, y);
  ctx.shadowBlur = 0;
}

function gauge(ctx, x, y, r, value, color, caption, size) {
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * value); ctx.stroke();
  ctx.shadowBlur = 0;
  text(ctx, `${Math.round(value * 100)}%`, x, y + size * 0.35, { size, weight: 700, align: 'center', color: TEXT, glow: 6 });
  if (caption) text(ctx, caption, x, y + r + size * 0.95, { size: size * 0.48, align: 'center', color: DIM });
}

/* --------------------------------------------------------------- drawers */

function chamber(ctx, w, h, t) {
  chrome(ctx, w, h, 'PEPTIDE INTELLIGENCE CHAMBER', 'ASTRA corpus · live');
  const stats = [[SIZE.peptides, 'COMPOUNDS'], [SIZE.studies, 'STUDIES'], [SIZE.claims, 'GRADED CLAIMS'], [7, 'EVIDENCE TIERS']];
  stats.forEach(([n, l], i) => {
    const x = 50 + i * (w - 100) / 4;
    ctx.strokeStyle = GOLD_SOFT;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, h * 0.3, (w - 100) / 4 - 22, h * 0.24);
    text(ctx, String(n), x + 20, h * 0.44, { size: h * 0.1, weight: 700, color: i % 2 ? ICE : GOLD, glow: 10 });
    text(ctx, l, x + 22, h * 0.5, { size: h * 0.028, color: DIM });
  });
  // Radar sweep.
  const cx = w * 0.5;
  const cy = h * 0.78;
  const r = h * 0.15;
  ctx.strokeStyle = ICE_SOFT;
  ctx.lineWidth = 1.5;
  for (const k of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); }
  const a = t * 1.4;
  const sweep = ctx.createConicGradient ? ctx.createConicGradient(a - 0.8, cx, cy) : null;
  if (sweep) {
    sweep.addColorStop(0, 'rgba(111,211,255,0)');
    sweep.addColorStop(0.12, 'rgba(111,211,255,0.4)');
    sweep.addColorStop(0.13, 'rgba(111,211,255,0)');
    ctx.fillStyle = sweep;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  READINGS.slice(0, 8).forEach((reading, i) => {
    const ang = (i / 8) * Math.PI * 2;
    const rr = r * (1 - reading.score) * 1.4 + r * 0.12;
    ctx.fillStyle = reading.band.accent;
    ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * Math.min(rr, r), cy + Math.sin(ang) * Math.min(rr, r), 5, 0, Math.PI * 2); ctx.fill();
  });
  text(ctx, 'Educational · not medical advice', w - 44, h - 36, { size: h * 0.026, align: 'right', color: DIM });
}

function analysis(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'PEPTIDE ANALYSIS', 'Confidence readings · computed by the evidence engine');
  const left = 44;
  const top = h * 0.24;
  const rowH = (h * 0.68) / READINGS.length;
  const barW = w * 0.36;
  READINGS.forEach((reading, i) => {
    const y = top + i * rowH;
    const selected = reading.id === s.compound;
    const grow = Math.min(1, Math.max(0, t * 0.8 - i * 0.05));
    text(ctx, reading.name, left, y + rowH * 0.62, { size: rowH * 0.5, color: selected ? GOLD : TEXT, weight: selected ? 700 : 500 });
    const x = left + w * 0.17;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y + rowH * 0.3, barW, rowH * 0.4);
    ctx.fillStyle = reading.band.accent;
    ctx.shadowColor = reading.band.accent;
    ctx.shadowBlur = selected ? 16 : 6;
    ctx.fillRect(x, y + rowH * 0.3, barW * reading.score * grow, rowH * 0.4);
    ctx.shadowBlur = 0;
    text(ctx, `${Math.round(reading.score * 100)}%`, x + barW + 12, y + rowH * 0.66, { size: rowH * 0.46, color: selected ? GOLD : DIM, weight: 600 });
  });
  // The seven ceilings as gauges, like the reference wall's dials.
  const gx = w * 0.7;
  const r = h * 0.075;
  CEILINGS.forEach((tier, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    gauge(ctx, gx + col * w * 0.15, h * 0.3 + row * h * 0.19 + (i === 6 ? 0 : 0), r, tier.ceiling, tier.accent, tier.label, h * 0.042);
  });
}

function receptor(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'GLP-1 RECEPTOR AGONIST', 'Class B GPCR · two-step binding · Gαs → cAMP');
  const steps = ['Ligand approaches', 'C-terminus docks on ECD', 'N-terminus enters TM core', 'Gαs → adenylyl cyclase', 'cAMP ↑ → insulin (only if glucose is high)'];
  const phase = s.receptorPhase || 0;
  const active = phase < 0.3 ? 0 : phase < 0.4 ? 1 : phase < 0.5 ? 2 : phase < 0.68 ? 3 : phase < 0.85 ? 4 : 0;
  steps.forEach((step, i) => {
    const y = h * 0.27 + i * h * 0.085;
    const on = i === active;
    ctx.fillStyle = on ? GOLD : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(56, y - h * 0.012, 7, 0, Math.PI * 2); ctx.fill();
    text(ctx, step, 76, y, { size: h * 0.036, color: on ? GOLD : TEXT, weight: on ? 700 : 500, glow: on ? 8 : 0 });
  });
  // Half-life decay on a log time axis: C(t)/C0 = 0.5^(t / t½).
  const x0 = w * 0.52;
  const y0 = h * 0.86;
  const pw = w * 0.42;
  const ph = h * 0.56;
  const tMin = Math.log10(0.1); // minutes
  const tMax = Math.log10(60 * 24 * 21);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0 - ph); ctx.lineTo(x0, y0); ctx.lineTo(x0 + pw, y0); ctx.stroke();
  const ticks = [[1, '1 min'], [60, '1 h'], [1440, '1 day'], [10080, '1 wk']];
  for (const [m, l] of ticks) {
    const x = x0 + ((Math.log10(m) - tMin) / (tMax - tMin)) * pw;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(x, y0 - ph); ctx.lineTo(x, y0); ctx.stroke();
    text(ctx, l, x, y0 + h * 0.045, { size: h * 0.028, align: 'center', color: DIM });
  }
  const curve = (halfLifeMin, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i <= 200; i += 1) {
      const lt = tMin + (i / 200) * (tMax - tMin);
      const c = 0.5 ** (10 ** lt / halfLifeMin);
      const x = x0 + (i / 200) * pw;
      const y = y0 - c * ph;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };
  curve(2, ICE);
  curve(165 * 60, GOLD);
  text(ctx, 'Native GLP-1 · t½ ≈ 2 min', x0 + 12, y0 - ph + h * 0.02, { size: h * 0.032, color: ICE, weight: 600 });
  text(ctx, 'Semaglutide · t½ ≈ 165 h', x0 + 12, y0 - ph + h * 0.07, { size: h * 0.032, color: GOLD, weight: 600 });
  text(ctx, 'fraction remaining = 0.5^(t / t½)', x0 + pw, y0 - ph - h * 0.02, { size: h * 0.026, align: 'right', color: DIM });
}

function agonists(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'GLP-1 RECEPTOR AGONISTS', 'Mean weight change, placebo subtracted · cross-trial, not head-to-head');
  const max = 30;
  const x0 = w * 0.06;
  const pw = w * 0.56;
  AGONISTS.forEach((agonist, i) => {
    const y = h * 0.3 + i * h * 0.19;
    const on = agonist.id === s.agonist?.id;
    text(ctx, agonist.name, x0, y, { size: h * 0.045, weight: 700, color: on ? GOLD : TEXT, glow: on ? 10 : 0 });
    text(ctx, `${agonist.targets.join(' + ')} · ${agonist.trial} · ${agonist.weeks} wk · ${agonist.status}`, x0 + w * 0.22, y, { size: h * 0.03, color: DIM });
    const by = y + h * 0.03;
    const bh = h * 0.055;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x0, by, pw, bh);
    // Drug arm, placebo arm, and the difference between them.
    ctx.fillStyle = 'rgba(111,211,255,0.25)';
    ctx.fillRect(x0, by, (agonist.drug / max) * pw, bh);
    ctx.fillStyle = on ? GOLD : 'rgba(240,183,90,0.75)';
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = on ? 18 : 4;
    ctx.fillRect(x0 + (agonist.placebo / max) * pw, by, (agonist.delta / max) * pw, bh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x0 + (agonist.placebo / max) * pw - 1, by - 4, 2, bh + 8);
    text(ctx, `−${agonist.drug}% vs −${agonist.placebo}%`, x0 + pw + 16, by + bh * 0.4, { size: h * 0.03, color: on ? GOLD : TEXT, weight: 600 });
    text(ctx, `Δ ${agonist.delta.toFixed(1)} pts`, x0 + pw + 16, by + bh * 1.05, { size: h * 0.036, color: on ? GOLD : ICE, weight: 700, glow: on ? 8 : 0 });
  });
  const reta = AGONISTS[2];
  text(ctx, reta.topline, x0, h * 0.9, { size: h * 0.027, color: DIM });
}

function synthesis(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'MOLECULAR SYNTHESIS', 'Solid-phase peptide synthesis · full-length yield');
  const { yield: Y, reactions } = sppsYield(s.p, s.length);
  // Yield against chain length at the current step efficiency.
  const x0 = w * 0.07;
  const y0 = h * 0.86;
  const pw = w * 0.5;
  const ph = h * 0.56;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0 - ph); ctx.lineTo(x0, y0); ctx.lineTo(x0 + pw, y0); ctx.stroke();
  for (const L of [10, 20, 30, 40, 50, 60]) text(ctx, String(L), x0 + (L / 60) * pw, y0 + h * 0.045, { size: h * 0.028, align: 'center', color: DIM });
  for (const v of [0.5, 1]) text(ctx, `${v * 100}%`, x0 - 10, y0 - v * ph + 8, { size: h * 0.028, align: 'right', color: DIM });
  ctx.strokeStyle = ICE;
  ctx.lineWidth = 4;
  ctx.shadowColor = ICE;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let L = 1; L <= 60; L += 1) {
    const x = x0 + (L / 60) * pw;
    const y = y0 - sppsYield(s.p, L).yield * ph;
    if (L > 1) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  const mx = x0 + (s.length / 60) * pw;
  const my = y0 - Y * ph;
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  text(ctx, 'chain length L (residues)', x0 + pw, y0 + h * 0.09, { size: h * 0.026, align: 'right', color: DIM });
  // The equation with the live numbers in it.
  const gx = w * 0.79;
  gauge(ctx, gx, h * 0.47, h * 0.17, Y, GOLD, 'full-length chains', h * 0.07);
  text(ctx, 'Y = p^(2(L − 1))', gx, h * 0.8, { size: h * 0.04, align: 'center', color: TEXT, weight: 600 });
  text(ctx, `${s.p.toFixed(3)}^${reactions} = ${(Y * 100).toFixed(1)}%`, gx, h * 0.86, { size: h * 0.036, align: 'center', color: GOLD, weight: 700 });
  const need = requiredEfficiency(0.87, s.length);
  text(ctx, `87% needs p ≥ ${(need * 100).toFixed(2)}%`, gx, h * 0.92, { size: h * 0.028, align: 'center', color: DIM });
}

/** A synthetic PQRST complex, one beat in [0, 1). */
function ecg(phase) {
  const g = (mu, sigma, a) => a * Math.exp(-((phase - mu) ** 2) / (2 * sigma * sigma));
  return g(0.18, 0.025, 0.12) + g(0.34, 0.008, -0.12) + g(0.37, 0.01, 1) + g(0.4, 0.01, -0.25) + g(0.62, 0.045, 0.28);
}

function telemetry(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'BIOLOGICAL TELEMETRY', 'SIMULATED DISPLAY · not a measurement');
  const bpm = 72;
  const beat = 60 / bpm;
  const x0 = w * 0.05;
  const pw = w * 0.56;
  const mid = h * 0.42;
  ctx.strokeStyle = ICE;
  ctx.lineWidth = 3;
  ctx.shadowColor = ICE;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  const window = 4; // seconds across the trace
  for (let i = 0; i <= 400; i += 1) {
    const time = t - window + (i / 400) * window;
    const y = mid - ecg(((time / beat) % 1 + 1) % 1) * h * 0.2;
    const x = x0 + (i / 400) * pw;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  text(ctx, String(bpm), w * 0.7, h * 0.46, { size: h * 0.16, weight: 700, color: GOLD, glow: 12 });
  text(ctx, 'bpm · simulated', w * 0.7, h * 0.52, { size: h * 0.03, color: DIM });
  SITES.forEach((site, i) => {
    const on = site.id === s.site;
    const x = x0 + (i % 3) * (w * 0.3);
    const y = h * 0.66 + Math.floor(i / 3) * h * 0.12;
    ctx.strokeStyle = on ? GOLD : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = on ? 3 : 1.5;
    ctx.strokeRect(x, y, w * 0.28, h * 0.09);
    text(ctx, site.label, x + 16, y + h * 0.058, { size: h * 0.032, color: on ? GOLD : TEXT, weight: on ? 700 : 500 });
  });
}

function genome(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'GCG → GLP-1(7–37) → SEMAGLUTIDE', 'Proglucagon gene, chromosome 2q24.2 · 31 residues = 93 coding bases');
  const native = SEQUENCES.native;
  const sema = SEQUENCES.sema;
  const cell = (w - 80) / native.length;
  const rows = [['mRNA', h * 0.34], ['GLP-1', h * 0.48], ['Sema', h * 0.6]];
  for (const [l, y] of rows) text(ctx, l, 40, y, { size: h * 0.028, color: DIM, weight: 600 });
  const cursor = Math.floor((t * 3) % native.length);
  native.forEach((aa, i) => {
    const x = 40 + w * 0.06 + i * cell * 0.94;
    const changed = sema[i] !== aa;
    const read = i === cursor;
    text(ctx, CODONS[aa] || '', x, h * 0.34, { size: cell * 0.36, color: read ? ICE : 'rgba(111,211,255,0.55)', weight: read ? 700 : 500 });
    text(ctx, aa, x + cell * 0.25, h * 0.48, { size: cell * 0.6, color: read ? ICE : TEXT, weight: 700, glow: read ? 10 : 0 });
    const label = sema[i] === '·' ? 'Aib' : sema[i] === '*' ? 'K*' : sema[i];
    text(ctx, label, x + cell * 0.25, h * 0.6, { size: cell * (label.length > 1 ? 0.4 : 0.6), color: changed ? GOLD : 'rgba(233,238,248,0.7)', weight: 700, glow: changed ? 12 : 0 });
    if (changed) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - cell * 0.1, h * 0.43, cell * 0.85, h * 0.21);
    }
    if (i % 5 === 0) text(ctx, String(i + 7), x + cell * 0.25, h * 0.69, { size: cell * 0.3, color: DIM });
  });
  SEQUENCES.changes.forEach((change, i) => {
    text(ctx, `${change.position}: ${change.from} → ${change.to}`, 40, h * 0.79 + i * h * 0.05, { size: h * 0.032, color: GOLD, weight: 600 });
  });
  text(ctx, 'K* = Lys26 carrying the C18 fatty diacid', w - 40, h * 0.94, { size: h * 0.026, color: DIM, align: 'right' });
}

/** Word-wrap a paragraph; returns the y after the last line. */
function para(ctx, value, x, y, maxWidth, lineHeight, { size = 22, color = TEXT, weight = 400, lines = 6 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  const words = String(value || '').split(/\s+/);
  let line = '';
  let n = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(n === lines - 1 ? `${line}…` : line, x, y + n * lineHeight);
      n += 1;
      line = word;
      if (n >= lines) return y + n * lineHeight;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y + n * lineHeight); n += 1; }
  return y + n * lineHeight;
}

function map(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'PEPTIDE SHOWCASE MAP', 'Compounds · body systems · related links');
  const peptide = PEPTIDES.find((p) => p.id === s.mapSelected);
  if (!peptide) {
    const links = PEPTIDES.reduce((n, p) => n + p.systems.length + (p.related || []).length, 0);
    [[PEPTIDES.length, 'COMPOUNDS'], [SYSTEMS.length, 'BODY SYSTEMS'], [links, 'LINKS']].forEach(([n, l], i) => {
      text(ctx, String(n), 50, h * (0.36 + i * 0.2), { size: h * 0.11, weight: 700, color: i === 1 ? ICE : GOLD, glow: 10 });
      text(ctx, l, 54, h * (0.42 + i * 0.2), { size: h * 0.03, color: DIM });
    });
    text(ctx, 'Pick a compound to light its threads →', 50, h * 0.92, { size: h * 0.034, color: TEXT });
    return;
  }
  const reading = READINGS.find((r) => r.id === peptide.id);
  text(ctx, peptide.name, 44, h * 0.3, { size: h * 0.08, weight: 700, color: GOLD, glow: 10 });
  text(ctx, `${peptide.klass} · ${Math.round(reading.score * 100)}% ${reading.band.label}`, 46, h * 0.37, { size: h * 0.032, color: DIM });
  const sys = peptide.systems.map((id) => SYSTEMS.find((x) => x.id === id)?.label || id);
  text(ctx, 'BODY SYSTEMS', 46, h * 0.47, { size: h * 0.028, color: ICE, weight: 700 });
  sys.forEach((label, i) => text(ctx, `• ${label}`, 46, h * (0.53 + i * 0.055), { size: h * 0.034 }));
  text(ctx, 'RELATED', w * 0.42, h * 0.47, { size: h * 0.028, color: ICE, weight: 700 });
  (peptide.related || []).forEach((id, i) => text(ctx, `• ${PEPTIDES.find((p) => p.id === id)?.name || id}`, w * 0.42, h * (0.53 + i * 0.055), { size: h * 0.034 }));
  para(ctx, peptide.tagline, 46, h * 0.86, w * 0.6, h * 0.045, { size: h * 0.032, color: TEXT, lines: 2 });
}

function compare(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'COMPARISON BENCH', 'Evidence quality, not effect size');
  const result = s.compareResult;
  if (!result) return;
  [result.left, result.right].forEach((col, i) => {
    const x = 44 + i * w * 0.47;
    const r = col.reading;
    text(ctx, col.entry.name, x, h * 0.3, { size: h * 0.064, weight: 700, color: i ? ICE : GOLD, glow: 8 });
    gauge(ctx, x + h * 0.13, h * 0.53, h * 0.11, r.score, r.band.accent, r.band.label, h * 0.05);
    para(ctx, `Best design: ${r.best.label}`, x + h * 0.3, h * 0.46, w * 0.22, h * 0.04, { size: h * 0.03, color: TEXT, lines: 2 });
    para(ctx, col.entry.regulatory ? col.entry.regulatory.headline : 'Strictest component status applies', x + h * 0.3, h * 0.56, w * 0.22, h * 0.04, { size: h * 0.028, color: DIM, lines: 3 });
  });
  para(ctx, result.verdict.headline, 44, h * 0.84, w - 90, h * 0.05, { size: h * 0.042, weight: 700, color: GOLD, lines: 1 });
  para(ctx, result.verdict.caution, 44, h * 0.9, w - 90, h * 0.038, { size: h * 0.028, color: DIM, lines: 2 });
}

function debate(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'DEBATE ROOM', 'Four reviewers · one evidence base');
  const result = s.debateResult;
  if (!result) return;
  text(ctx, result.entry.name, 44, h * 0.29, { size: h * 0.06, weight: 700, color: GOLD, glow: 8 });
  REVIEWERS.forEach((reviewer, i) => {
    const on = s.debate?.speaker === i;
    const x = 44 + i * (w - 88) / 4;
    ctx.strokeStyle = on ? reviewer.accent : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = on ? 3 : 1.5;
    ctx.strokeRect(x, h * 0.34, (w - 88) / 4 - 12, h * 0.1);
    text(ctx, reviewer.name.replace(' Reviewer', ''), x + 12, h * 0.385, { size: h * 0.028, color: on ? reviewer.accent : TEXT, weight: on ? 700 : 500 });
    text(ctx, result.opinions[i].position, x + 12, h * 0.425, { size: h * 0.024, color: DIM });
  });
  const opinion = result.opinions[s.debate?.speaker ?? 0];
  para(ctx, `“${opinion.body}”`, 44, h * 0.53, w - 90, h * 0.046, { size: h * 0.032, color: TEXT, lines: 5 });
  para(ctx, result.consensus.verdict, 44, h * 0.9, w - 90, h * 0.04, { size: h * 0.03, color: GOLD, weight: 600, lines: 2 });
}

const LEVEL = {
  supported: ['HOLDS UP', '#3ef0b4'],
  mixed: ['MIXED', '#f0b75a'],
  overstated: ['OVERSTATED', '#f0b75a'],
  contradicted: ['SHATTERED', '#ff5a5a'],
  unsupported: ['NO EVIDENCE', '#ff5a5a'],
  unknown: ['UNKNOWN COMPOUND', '#6fd3ff'],
};

function myth(ctx, w, h, t, s) {
  plateShade = 0.55;
  chrome(ctx, w, h, 'MYTH CHECKER', 'Claim → corpus → verdict');
  const result = s.mythResult;
  if (!result || !result.ok) {
    para(ctx, result?.reason || 'Type or pick a claim. The glass holds, or it shatters.', 44, h * 0.4, w * 0.6, h * 0.06, { size: h * 0.045, color: TEXT, lines: 4 });
    return;
  }
  para(ctx, `“${result.text}”`, 44, h * 0.32, w * 0.62, h * 0.055, { size: h * 0.04, color: TEXT, weight: 500, lines: 3 });
  const [word, color] = LEVEL[result.verdict.level] || ['CHECKED', ICE];
  ctx.save();
  ctx.translate(w * 0.36, h * 0.62);
  ctx.rotate(-0.06);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.font = `800 ${Math.round(h * 0.1)}px ${FONT}`;
  const width = ctx.measureText(word).width + 40;
  ctx.strokeRect(-width / 2, -h * 0.085, width, h * 0.13);
  text(ctx, word, 0, h * 0.02, { size: h * 0.1, weight: 800, align: 'center', color, glow: 16 });
  ctx.restore();
  para(ctx, result.verdict.headline, 44, h * 0.82, w - 90, h * 0.045, { size: h * 0.034, color: GOLD, weight: 600, lines: 2 });
  text(ctx, `Best tier: ${result.tierInfo.label} · wording: ${result.compliance.severity}`, 44, h * 0.93, { size: h * 0.028, color: DIM });
}

function simulator(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'STUDY SIMULATOR', 'What would 100 positive results from this design be worth?');
  const r = s.simResult;
  if (!r) return;
  const stats = [
    [`${Math.round(r.power * 100)}%`, 'POWER', ICE],
    [`${Math.round(r.falsePositiveRisk * 100)}%`, 'FALSE-POSITIVE RISK', r.falsePositiveRisk > 0.5 ? '#ff5a5a' : GOLD],
    [r.detectable.toFixed(2), 'SMALLEST DETECTABLE d', TEXT],
    [r.tier.short, 'DESIGN TIER', r.tier.accent],
  ];
  stats.forEach(([v, l, c], i) => {
    const x = 44 + (i % 2) * w * 0.27;
    const y = h * (0.38 + Math.floor(i / 2) * 0.24);
    text(ctx, v, x, y, { size: h * 0.1, weight: 700, color: c, glow: 10 });
    text(ctx, l, x + 2, y + h * 0.05, { size: h * 0.026, color: DIM });
  });
  para(ctx, r.verdict.text, 44, h * 0.86, w * 0.56, h * 0.042, { size: h * 0.03, color: TEXT, lines: 3 });
  // The 10 × 10 grid, mirrored from the hologram.
  const wrong = Math.round(r.falsePositiveRisk * 100);
  const cell = h * 0.052;
  for (let i = 0; i < 100; i += 1) {
    ctx.fillStyle = i < wrong ? '#ff5a5a' : GOLD;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(w * 0.64 + (i % 10) * cell, h * 0.26 + Math.floor(i / 10) * cell, cell - 4, cell - 4);
  }
  ctx.globalAlpha = 1;
  text(ctx, `${wrong} of 100 positives are false`, w * 0.64, h * 0.83, { size: h * 0.032, color: wrong > 50 ? '#ff5a5a' : GOLD, weight: 700 });
}

function studies(ctx, w, h, t, s) {
  chrome(ctx, w, h, `THE ARCHIVE · ${STUDIES.length} STUDIES`, 'Every citation in the corpus, by tier');
  const counts = TIERS.map((tier) => ({ tier, n: STUDIES.filter((st) => st.tier === tier.id).length })).filter((x) => x.n);
  const max = Math.max(...counts.map((c) => c.n));
  counts.forEach(({ tier, n }, i) => {
    const y = h * 0.27 + i * h * 0.075;
    const on = s.studyTier === tier.id;
    text(ctx, tier.label, 44, y + h * 0.03, { size: h * 0.03, color: on ? GOLD : TEXT, weight: on ? 700 : 500 });
    ctx.fillStyle = tier.accent;
    ctx.globalAlpha = on || !s.studyTier ? 1 : 0.35;
    ctx.fillRect(w * 0.24, y + h * 0.008, (w * 0.22) * (n / max), h * 0.03);
    ctx.globalAlpha = 1;
    text(ctx, String(n), w * 0.24 + (w * 0.22) * (n / max) + 10, y + h * 0.032, { size: h * 0.03, color: DIM });
  });
  const study = STUDIES.find((st) => st.id === s.studyPicked);
  if (study) {
    const x = w * 0.56;
    para(ctx, study.title, x, h * 0.3, w * 0.4, h * 0.045, { size: h * 0.034, weight: 700, color: GOLD, lines: 3 });
    text(ctx, `${study.journal.split(',')[0]} · ${study.year}${study.n ? ` · n=${study.n}` : ''}`, x, h * 0.47, { size: h * 0.026, color: DIM });
    para(ctx, study.finding, x, h * 0.54, w * 0.4, h * 0.04, { size: h * 0.028, color: TEXT, lines: 5 });
    para(ctx, `Catch: ${study.limitation}`, x, h * 0.78, w * 0.4, h * 0.038, { size: h * 0.026, color: DIM, lines: 4 });
  }
}

function studio(ctx, w, h, t, s) {
  plateShade = 0.6;
  chrome(ctx, w, h, 'CONTENT STUDIO', 'One study in · a governed content pack out');
  const pack = s.studio?.pack;
  if (!pack) return;
  text(ctx, String(pack.assets.length), 44, h * 0.4, { size: h * 0.14, weight: 700, color: GOLD, glow: 12 });
  text(ctx, 'ASSETS', 48, h * 0.46, { size: h * 0.028, color: DIM });
  text(ctx, String(pack.blocked), 44 + w * 0.17, h * 0.4, { size: h * 0.14, weight: 700, color: pack.blocked ? '#ff5a5a' : '#3ef0b4', glow: 10 });
  text(ctx, 'BLOCKED', 48 + w * 0.17, h * 0.46, { size: h * 0.028, color: DIM });
  text(ctx, String(pack.warnings), 44 + w * 0.34, h * 0.4, { size: h * 0.14, weight: 700, color: ICE, glow: 10 });
  text(ctx, 'WARNINGS', 48 + w * 0.34, h * 0.46, { size: h * 0.028, color: DIM });
  FORMATS.forEach((format, i) => {
    const x = 44 + (i % 3) * w * 0.2;
    const y = h * 0.58 + Math.floor(i / 3) * h * 0.08;
    text(ctx, `${format.icon} ${format.label} ×${format.count}`, x, y, { size: h * 0.028, color: s.studio.asset?.format === format.id ? GOLD : TEXT });
  });
  text(ctx, `${s.studio.peptideName} · ${s.studio.studyTitle}`.slice(0, 80), 44, h * 0.92, { size: h * 0.028, color: DIM });
}

export const DRAWERS = { chamber, map, analysis, compare, debate, myth, simulator, studies, studio, receptor, agonists, synthesis, telemetry, genome };

/**
 * Draw one station's screen over its photograph.
 *
 * @param {string} id Station id.
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {number} t Clock.
 * @param {object} s Shared state.
 * @param {HTMLImageElement|null} image The station's plate, if it has one.
 */
export function draw(id, ctx, w, h, t, s, image) {
  plate = image || null;
  plateShade = 0.7;
  DRAWERS[id](ctx, w, h, t, s);
  plate = null;
}
