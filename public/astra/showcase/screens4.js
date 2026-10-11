/**
 * The classified station's wall screen: hazard tape, a redacted dossier and
 * the state of the visitor's clearance.
 *
 * @module astra/showcase/screens4
 */

import { DRAWERS, ink } from './screens.js';
import { IDENTITY } from './classified.js';

const { chrome, text, GOLD, TEXT, DIM } = ink;
const RED = '#ff4d4d';
const GREEN = '#3ef0b4';

function hazard(ctx, x, y, w, h, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#f2b51c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#0b0b0b';
  const off = (t * 30) % (h * 2);
  for (let k = -h * 2; k < w + h * 2; k += h * 2) {
    ctx.beginPath();
    ctx.moveTo(x + k + off, y + h);
    ctx.lineTo(x + k + off + h, y);
    ctx.lineTo(x + k + off + h * 2, y);
    ctx.lineTo(x + k + off + h, y + h);
    ctx.fill();
  }
  ctx.restore();
}

function classified(ctx, w, h, t, s) {
  const v = s.vault || {};
  const granted = v.granted || v.phase === 'open';
  chrome(ctx, w, h, `CLASSIFIED · ${IDENTITY.code}`, granted ? 'Access logged · the custodian disapproves' : 'Level 4 clearance · signature and biometric required');
  hazard(ctx, 0, h * 0.2, w, h * 0.035, t);
  const blink = Math.sin(t * 5) > 0;
  text(ctx, granted ? 'ACCESS GRANTED' : 'ACCESS RESTRICTED', 44, h * 0.34, { size: h * 0.06, weight: 800, color: granted ? GREEN : RED, glow: blink ? 14 : 4 });
  const rows = [
    ['SUBJECT', granted ? `${IDENTITY.name} (${IDENTITY.aka})` : null],
    ['ORIGIN', granted ? 'Gila monster venom' : null],
    ['RESIDUES', `${IDENTITY.residues}`],
    ['HALF-LIFE', granted ? `${IDENTITY.halfLife} h` : null],
    ['STATUS', granted ? 'Approved 2005' : null],
  ];
  rows.forEach(([k, val], i) => {
    const y = h * 0.44 + i * h * 0.065;
    text(ctx, k, 44, y, { size: h * 0.028, weight: 700, color: DIM });
    if (val) text(ctx, val, 44 + w * 0.15, y, { size: h * 0.03, color: TEXT });
    else {
      ctx.fillStyle = '#000';
      ctx.fillRect(44 + w * 0.15, y - h * 0.03, w * (0.18 + ((i * 37) % 10) / 60), h * 0.038);
    }
  });
  const checks = [
    ['SIGNATURE', v.signature ? v.signature : '—', Boolean(v.signature)],
    ['BIOMETRIC', v.print ? 'MATCH 1/1' : '—', Boolean(v.print)],
    ['VAULT', granted ? 'OPEN' : v.phase === 'unlocking' ? 'UNLOCKING' : 'SEALED', granted],
  ];
  checks.forEach(([k, val, ok], i) => {
    const y = h * 0.8 + i * h * 0.05;
    text(ctx, `${ok ? '■' : '□'} ${k}`, 44, y, { size: h * 0.028, weight: 700, color: ok ? GREEN : GOLD });
    text(ctx, val, 44 + w * 0.15, y, { size: h * 0.028, color: ok ? GREEN : DIM });
  });
  hazard(ctx, 0, h * 0.965, w, h * 0.035, -t);
}

Object.assign(DRAWERS, { classified });
