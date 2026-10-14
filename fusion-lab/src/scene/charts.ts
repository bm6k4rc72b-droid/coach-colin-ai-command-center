/** Neon canvas charts: D–T reactivity vs temperature, and the Lawson (nτ vs T) diagram. */
import { nTauForQ, reactivityDT } from '../core/physics';

const BG = '#070513';

function frame(g: CanvasRenderingContext2D, W: number, H: number): void {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0d0820');
  grad.addColorStop(1, BG);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

/** Map a log10 value into a pixel range. */
const logMap = (v: number, lo: number, hi: number, p0: number, p1: number) => p0 + ((Math.log10(v) - lo) / (hi - lo)) * (p1 - p0);

export function drawReactivity(cv: HTMLCanvasElement, T: number): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  frame(g, W, H);
  const L = 46;
  const Rr = W - 14;
  const top = 16;
  const bot = H - 30;
  const x = (t: number) => logMap(t, 0, 2, L, Rr);
  const y = (sv: number) => logMap(sv, -25, -20.8, bot, top);
  g.strokeStyle = 'rgba(167,139,250,0.12)';
  g.fillStyle = '#9aa3c7';
  g.font = '11px ui-monospace, monospace';
  for (const t of [1, 2, 5, 10, 20, 50, 100]) {
    g.beginPath();
    g.moveTo(x(t), top);
    g.lineTo(x(t), bot);
    g.stroke();
    g.fillText(`${t}`, x(t) - 6, H - 14);
  }
  for (let e = -25; e <= -21; e++) {
    g.beginPath();
    g.moveTo(L, y(10 ** e));
    g.lineTo(Rr, y(10 ** e));
    g.stroke();
    g.fillText(`1e${e}`, 2, y(10 ** e) + 4);
  }
  g.fillText('temperature (keV) →', Rr - 130, H - 2);
  // Curve with glow
  const grad = g.createLinearGradient(L, 0, Rr, 0);
  grad.addColorStop(0, '#ff6a00');
  grad.addColorStop(0.45, '#ff2bd6');
  grad.addColorStop(1, '#22d3ee');
  g.strokeStyle = grad;
  g.lineWidth = 3;
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = 12;
  g.beginPath();
  for (let i = 0; i <= 200; i++) {
    const t = 10 ** (i / 100);
    const px = x(t);
    const py = y(Math.max(reactivityDT(t), 1e-25));
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  g.shadowBlur = 0;
  // Current temperature marker
  const sv = reactivityDT(T);
  const mx = x(Math.min(100, Math.max(1, T)));
  const my = y(Math.max(sv, 1e-25));
  g.strokeStyle = 'rgba(253,224,71,0.5)';
  g.lineWidth = 1;
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(mx, bot);
  g.lineTo(mx, my);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#fde047';
  g.shadowColor = '#fde047';
  g.shadowBlur = 14;
  g.beginPath();
  g.arc(mx, my, 5, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#e9e4ff';
  g.fillText(`⟨σv⟩ = ${sv.toExponential(1)} m³/s`, Math.min(mx + 8, W - 150), Math.max(my - 8, 26));
  g.lineWidth = 1;
}

export function drawLawson(cv: HTMLCanvasElement, T: number, nTau: number, unstable: boolean): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  frame(g, W, H);
  const L = 46;
  const Rr = W - 14;
  const top = 16;
  const bot = H - 30;
  const x = (t: number) => logMap(t, 0, 2, L, Rr);
  const y = (v: number) => logMap(v, 18, 22, bot, top);
  g.strokeStyle = 'rgba(56,189,248,0.12)';
  g.fillStyle = '#9aa3c7';
  g.font = '11px ui-monospace, monospace';
  for (const t of [1, 2, 5, 10, 20, 50, 100]) {
    g.beginPath();
    g.moveTo(x(t), top);
    g.lineTo(x(t), bot);
    g.stroke();
    g.fillText(`${t}`, x(t) - 6, H - 14);
  }
  for (let e = 18; e <= 22; e++) {
    g.beginPath();
    g.moveTo(L, y(10 ** e));
    g.lineTo(Rr, y(10 ** e));
    g.stroke();
    g.fillText(`1e${e}`, 4, y(10 ** e) + 4);
  }
  g.fillText('nτ (s/m³) vs temperature (keV)', Rr - 200, H - 2);
  const curves: [number, string, string][] = [
    [1, '#38bdf8', 'Q = 1 breakeven'],
    [10, '#a78bfa', 'Q = 10'],
    [Infinity, '#ff2bd6', 'ignition'],
  ];
  // Shade the ignition region
  g.fillStyle = 'rgba(255,43,214,0.08)';
  g.beginPath();
  g.moveTo(L, top);
  for (let i = 0; i <= 200; i++) {
    const t = 10 ** (i / 100);
    const v = nTauForQ(t, Infinity);
    g.lineTo(x(t), Number.isFinite(v) ? Math.max(top, y(Math.min(v, 1e22))) : top);
  }
  g.lineTo(Rr, top);
  g.closePath();
  g.fill();
  for (const [Q, col, label] of curves) {
    g.strokeStyle = col;
    g.lineWidth = 2.4;
    g.shadowColor = col;
    g.shadowBlur = 10;
    g.beginPath();
    let started = false;
    let labelAt: [number, number] | null = null;
    for (let i = 0; i <= 200; i++) {
      const t = 10 ** (i / 100);
      const v = nTauForQ(t, Q);
      if (!Number.isFinite(v) || v > 1e22) {
        started = false;
        continue;
      }
      const px = x(t);
      const py = y(v);
      if (!started) g.moveTo(px, py);
      else g.lineTo(px, py);
      started = true;
      if (i === 150) labelAt = [px, py];
    }
    g.stroke();
    g.shadowBlur = 0;
    if (labelAt) {
      g.fillStyle = col;
      g.fillText(label, labelAt[0] - 30, labelAt[1] - 6);
    }
  }
  // Current operating point
  const px = x(Math.min(100, Math.max(1, T)));
  const py = y(Math.min(1e22, Math.max(1e18, nTau)));
  g.fillStyle = unstable ? '#ef4444' : '#fde047';
  g.shadowColor = g.fillStyle;
  g.shadowBlur = 16;
  g.beginPath();
  g.arc(px, py, 6, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#fff';
  g.fillText('you', px + 9, py + 4);
  g.lineWidth = 1;
}
