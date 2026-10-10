/**
 * Wall screens for the new wing. They register themselves into the shared
 * drawer table, so the room draws them like any other station.
 *
 * @module astra/showcase/screens2
 */

import { DRAWERS, ink } from './screens.js';
import { PEPTIDES } from '../js/data/peptides.js';
import { FUTURE, PK, REGIONS, REGULATORY, STAGES, STATUS, SYSTEM_LABEL, compoundsFor, simulatePK } from './wing.js';

const { chrome, text, gauge, para, GOLD, ICE, TEXT, DIM } = ink;
const RED = '#ff5a5a';
const GREEN = '#3ef0b4';

function pk(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'HALF-LIFE BENCH', 'One-compartment model · relative units · not a dosing tool');
  const drug = PK.find((d) => d.id === s.pk.drug) || PK[1];
  const native = drug.halfLife < 1;
  const sim = simulatePK(drug, { interval: s.pk.interval, miss: s.pk.miss ? 2 : null, step: native ? 0.01 : 1, hours: native ? 0.5 : 24 * 7 * 6 });
  const x0 = w * 0.06;
  const y0 = h * 0.82;
  const pw = w * 0.6;
  const ph = h * 0.5;
  const max = Math.max(...sim.points.map((p) => p[1]));
  const span = sim.points[sim.points.length - 1][0];
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0 - ph); ctx.lineTo(x0, y0); ctx.lineTo(x0 + pw, y0); ctx.stroke();
  const ticks = native ? [[0, '0'], [10 / 60, '10 min'], [20 / 60, '20 min'], [0.5, '30 min']] : [0, 1, 2, 3, 4, 5, 6].map((wk) => [wk * 168, `wk ${wk}`]);
  for (const [tt, l] of ticks) text(ctx, l, x0 + (tt / span) * pw, y0 + h * 0.045, { size: h * 0.026, align: 'center', color: DIM });
  for (const d of sim.doses) {
    ctx.fillStyle = ICE;
    ctx.beginPath(); ctx.moveTo(x0 + (d / span) * pw, y0 - 2); ctx.lineTo(x0 + (d / span) * pw - 6, y0 + 10); ctx.lineTo(x0 + (d / span) * pw + 6, y0 + 10); ctx.fill();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  sim.points.forEach(([tt, c], i) => {
    const x = x0 + (tt / span) * pw;
    const y = y0 - (c / max) * ph;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  text(ctx, drug.name, x0, h * 0.25, { size: h * 0.055, weight: 700, color: GOLD, glow: 8 });
  text(ctx, `t½ ≈ ${native ? '2 min' : drug.halfLife >= 48 ? `${(drug.halfLife / 24).toFixed(1)} days` : `${drug.halfLife} h`} · ${drug.route}`, x0, h * 0.3, { size: h * 0.026, color: DIM });
  const rx = w * 0.71;
  const rows = native
    ? [['Gone in', '≈ 20 min'], ['Left after 10 half-lives', '0.1%'], ['Weekly dosing', 'pointless']]
    : [
      ['Accumulation R', sim.accumulation.toFixed(2)],
      ['90% of steady state', `${(sim.toSteady90 / 24).toFixed(0)} days`],
      ['Peak : trough', sim.fluctuation.toFixed(2)],
      ['Dosing interval', `${(s.pk.interval / 24).toFixed(s.pk.interval % 24 ? 1 : 0)} d`],
    ];
  rows.forEach(([l, v], i) => {
    text(ctx, v, rx, h * (0.3 + i * 0.15), { size: h * 0.075, weight: 700, color: i % 2 ? ICE : GOLD, glow: 8 });
    text(ctx, l, rx, h * (0.35 + i * 0.15), { size: h * 0.026, color: DIM });
  });
  text(ctx, native ? 'C(t) = e^(−kₑt)' : 'R = 1 / (1 − e^(−kₑτ))', rx, h * 0.92, { size: h * 0.032, color: TEXT, weight: 600 });
}

function scan(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'BODY HOLO-SCAN', 'Tap an organ zone, or pick a system');
  const sys = s.scanSystem;
  if (!sys) { para(ctx, 'Tap a glowing zone on the hologram. Every compound with graded evidence touching that body system will orbit it.', 44, h * 0.4, w * 0.55, h * 0.06, { size: h * 0.042, lines: 4 }); return; }
  text(ctx, SYSTEM_LABEL[sys] || sys, 44, h * 0.3, { size: h * 0.07, weight: 700, color: GOLD, glow: 10 });
  const list = compoundsFor(sys);
  list.slice(0, 8).forEach((r, i) => {
    const y = h * 0.4 + i * h * 0.065;
    text(ctx, r.name, 44, y, { size: h * 0.034 });
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(w * 0.26, y - h * 0.025, w * 0.3, h * 0.025);
    ctx.fillStyle = r.band.accent;
    ctx.fillRect(w * 0.26, y - h * 0.025, w * 0.3 * r.score, h * 0.025);
    text(ctx, `${Math.round(r.score * 100)}%`, w * 0.58, y, { size: h * 0.03, color: DIM });
  });
  if (!list.length) text(ctx, 'No compound in the library targets this system.', 44, h * 0.45, { size: h * 0.034, color: DIM });
}

function globe(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'REGULATORY GLOBE', 'Snapshot, October 2026 · laws change — check the regulator');
  const peptide = PEPTIDES.find((p) => p.id === s.globeCompound);
  const table = REGULATORY[s.globeCompound] || {};
  text(ctx, peptide ? peptide.name : '—', 44, h * 0.29, { size: h * 0.065, weight: 700, color: GOLD, glow: 8 });
  REGIONS.forEach((region, i) => {
    const status = STATUS[table[region.id] || 'untracked'];
    const y = h * 0.38 + i * h * 0.062;
    ctx.fillStyle = status.color;
    ctx.beginPath(); ctx.arc(54, y - h * 0.01, 7, 0, Math.PI * 2); ctx.fill();
    text(ctx, `${region.label} · ${region.agency}`, 72, y, { size: h * 0.03 });
    text(ctx, status.label, w * 0.42, y, { size: h * 0.028, color: status.color });
  });
  const y = h * 0.38 + REGIONS.length * h * 0.062 + h * 0.02;
  text(ctx, 'WADA', 44, y, { size: h * 0.03, weight: 700, color: s.globeBanned ? RED : s.globeBanned === false ? GREEN : GOLD });
  para(ctx, peptide?.regulatory?.sport || '', 120, y, w * 0.75, h * 0.036, { size: h * 0.026, color: DIM, lines: 2 });
}

function roast(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'COLIN vs THE INFLUENCER', 'Line-by-line fact-check · captions are made-up examples');
  const r = s.roast;
  if (!r) { para(ctx, 'Paste a caption, or pick one of the made-up examples. Colin reads it with feeling, then checks every line.', 44, h * 0.4, w * 0.6, h * 0.06, { size: h * 0.042, lines: 4 }); return; }
  r.lines.slice(0, 6).forEach((line, i) => {
    const y = h * 0.28 + i * h * 0.1;
    const colour = line.verdict === 'holds' ? GREEN : line.verdict === 'fails' ? RED : line.verdict === 'hype' ? GOLD : ICE;
    ctx.fillStyle = colour;
    ctx.globalAlpha = s.roastLine === i ? 0.3 : 0.12;
    ctx.fillRect(40, y - h * 0.05, w * 0.6, h * 0.085);
    ctx.globalAlpha = 1;
    para(ctx, line.line, 52, y - h * 0.015, w * 0.57, h * 0.036, { size: h * 0.028, color: TEXT, lines: 2 });
  });
  gauge(ctx, w * 0.82, h * 0.5, h * 0.16, r.score / 100, r.score > 70 ? GREEN : r.score > 40 ? GOLD : RED, 'honesty score', h * 0.07);
}

function arena(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'DEBATE ARENA', 'Two players · Colin judges · the room votes');
  const a = s.arena;
  if (!a) return;
  para(ctx, `Motion: “${a.motion}”`, 44, h * 0.29, w - 90, h * 0.05, { size: h * 0.038, color: GOLD, weight: 600, lines: 2 });
  [['a', a.names.a, 'FOR', GOLD], ['b', a.names.b, 'AGAINST', ICE]].forEach(([k, name, side, colour], i) => {
    const x = 44 + i * w * 0.48;
    text(ctx, `${name} · ${side}`, x, h * 0.45, { size: h * 0.04, weight: 700, color: colour, glow: a.turn === k ? 10 : 0 });
    text(ctx, String(a.totals[k]), x, h * 0.6, { size: h * 0.12, weight: 700, color: colour, glow: 10 });
    text(ctx, `Colin’s points · ${a.votes[k]} votes`, x, h * 0.66, { size: h * 0.028, color: DIM });
  });
  text(ctx, a.done ? a.result : `Round ${Math.min(a.round, 3)} of 3 · ${a.turn === 'a' ? a.names.a : a.names.b} to speak`, 44, h * 0.82, { size: h * 0.034, color: TEXT, weight: 600 });
  if (a.lean) para(ctx, a.lean, 44, h * 0.89, w - 90, h * 0.036, { size: h * 0.026, color: DIM, lines: 2 });
}

function future(ctx, w, h, t, s) {
  chrome(ctx, w, h, 'THE FUTURE WING', 'Pipeline snapshot · October 2026');
  STAGES.forEach((stage, i) => {
    const items = FUTURE.filter((f) => f.stage === stage.id);
    const y = h * 0.28 + i * h * 0.13;
    text(ctx, stage.label.toUpperCase(), 44, y, { size: h * 0.026, weight: 700, color: stage.id === 'approved' ? GREEN : stage.id === 'early' ? ICE : GOLD });
    para(ctx, items.map((f) => f.name).join(' · '), 44, y + h * 0.045, w * 0.55, h * 0.036, { size: h * 0.029, color: TEXT, lines: 2 });
  });
  const picked = FUTURE.find((f) => f.id === s.futurePicked);
  if (picked) {
    const x = w * 0.62;
    para(ctx, picked.name, x, h * 0.3, w * 0.34, h * 0.05, { size: h * 0.042, weight: 700, color: GOLD, lines: 2 });
    para(ctx, picked.result, x, h * 0.45, w * 0.34, h * 0.04, { size: h * 0.029, color: TEXT, lines: 5 });
    para(ctx, picked.status, x, h * 0.72, w * 0.34, h * 0.04, { size: h * 0.028, color: DIM, lines: 3 });
  }
}

Object.assign(DRAWERS, { pk, scan, globe, roast, arena, future });
