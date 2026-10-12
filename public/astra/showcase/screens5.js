/**
 * The dermal station's wall screen: the scan checkpoint's status over the
 * owner's dermal plate, and the size rule that decides what gets into skin.
 *
 * @module astra/showcase/screens5
 */

import { DRAWERS, ink } from './screens.js';
import { SKIN_PEPTIDES, mwOf } from './dermal.js';

const { chrome, text, GOLD, TEXT, DIM } = ink;
const PINK = '#ff5fa8';
const CYAN = '#38e1ff';

function dermal(ctx, w, h, t, s) {
  const d = s.derm || {};
  chrome(ctx, w, h, 'COLIN DERMAL TECHNOLOGIES', d.entered ? `Visitor scanned in · ${d.via === 'questionnaire' ? 'questionnaire' : `${d.confidence} reading`}` : 'Entry checkpoint · face scan required');
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  text(ctx, d.scanning ? 'SCANNING…' : d.entered ? 'ACCESS GRANTED' : 'SCAN TO ENTER', 44, h * 0.3, { size: h * 0.06, weight: 800, color: d.entered ? '#3ef0b4' : d.scanning ? CYAN : PINK, glow: 6 + pulse * 10 });
  text(ctx, 'MOLECULAR WEIGHT · THE 500 DALTON RULE', 44, h * 0.42, { size: h * 0.026, weight: 700, color: DIM });
  const x0 = 44;
  const x1 = w * 0.62;
  const X = (mw) => x0 + ((mw - 200) / 1000) * (x1 - x0);
  ctx.strokeStyle = PINK;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(X(500), h * 0.45);
  ctx.lineTo(X(500), h * 0.88);
  ctx.stroke();
  ctx.setLineDash([]);
  SKIN_PEPTIDES.forEach((p, i) => {
    const mw = mwOf(p);
    const y = h * 0.5 + i * h * 0.062;
    ctx.fillStyle = mw < 500 ? CYAN : GOLD;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x0, y - h * 0.02, X(mw) - x0, h * 0.03);
    ctx.globalAlpha = 1;
    text(ctx, `${p.name} · ${mw.toFixed(1)} Da`, X(mw) + 10, y + h * 0.005, { size: h * 0.026, color: TEXT });
  });
  text(ctx, 'Every +100 Da ≈ ×¼ the permeability (Potts & Guy, 1992)', 44, h * 0.94, { size: h * 0.026, color: DIM });
}

Object.assign(DRAWERS, { dermal });
