// Crisp 2D charts on <canvas>: monitor strips, time series and XY loops.

const DPR = () => Math.min(2, window.devicePixelRatio || 1);
function fit(cv) {
  const r = cv.getBoundingClientRect(), d = DPR();
  const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.scale(d, d);
  return { g, W: r.width, H: r.height };
}
const FONT = '10px "JetBrains Mono", monospace';

// series: [{ pts: [[x,y],…], color, width, label, dash, fill }]
export function lineChart(cv, { series, x0, x1, y0, y1, pad = [8, 8, 18, 34], grid = 4, xTicks = null, yTicks = null, xFmt = (v) => v, yFmt = (v) => (Math.abs(v) >= 10 ? Math.round(v) : +v.toFixed(1)), bands = [], marks = [], glow = true, title = '' }) {
  const { g, W, H } = fit(cv);
  if (W < 20 || H < 20) return;
  g.clearRect(0, 0, W, H);
  const [pt, pr, pb, pl] = pad, iw = W - pl - pr, ih = H - pt - pb;
  const X = (x) => pl + ((x - x0) / (x1 - x0)) * iw, Y = (y) => pt + ih - ((y - y0) / (y1 - y0)) * ih;
  for (const b of bands) { g.fillStyle = b.color; g.fillRect(X(Math.max(x0, b.from)), pt, X(Math.min(x1, b.to)) - X(Math.max(x0, b.from)), ih); if (b.label) { g.fillStyle = b.text || 'rgba(230,240,255,.55)'; g.font = FONT; g.fillText(b.label, X(Math.max(x0, b.from)) + 3, pt + 10); } }
  g.strokeStyle = 'rgba(141,151,179,.16)'; g.lineWidth = 1; g.font = FONT; g.fillStyle = 'rgba(141,151,179,.85)';
  const yt = yTicks ?? Array.from({ length: grid + 1 }, (_, i) => y0 + ((y1 - y0) * i) / grid);
  for (const v of yt) { const y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(pl, y); g.lineTo(pl + iw, y); g.stroke(); g.fillText(yFmt(v), 2, y + 3); }
  const xt = xTicks ?? Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  for (const v of xt) { const x = Math.round(X(v)) + 0.5; g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ih); g.stroke(); const s = String(xFmt(v)); g.fillText(s, Math.min(W - g.measureText(s).width - 2, Math.max(pl, x - g.measureText(s).width / 2)), H - 4); }
  g.save(); g.beginPath(); g.rect(pl, pt, iw, ih); g.clip();
  for (const s of series) {
    if (!s.pts.length) continue;
    g.beginPath();
    s.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    if (s.fill) { g.save(); g.lineTo(X(s.pts[s.pts.length - 1][0]), Y(y0)); g.lineTo(X(s.pts[0][0]), Y(y0)); g.closePath(); g.fillStyle = s.fill; g.fill(); g.restore(); g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); }
    g.setLineDash(s.dash || []); g.strokeStyle = s.color; g.lineWidth = s.width || 1.6; g.lineJoin = 'round';
    if (glow) { g.shadowColor = s.color; g.shadowBlur = 8; }
    g.stroke(); g.shadowBlur = 0; g.setLineDash([]);
  }
  for (const m of marks) {
    g.strokeStyle = m.color; g.fillStyle = m.color; g.setLineDash([3, 3]);
    if (m.x !== undefined) { g.beginPath(); g.moveTo(X(m.x), pt); g.lineTo(X(m.x), pt + ih); g.stroke(); }
    if (m.y !== undefined) { g.beginPath(); g.moveTo(pl, Y(m.y)); g.lineTo(pl + iw, Y(m.y)); g.stroke(); }
    g.setLineDash([]);
    if (m.dot) { g.beginPath(); g.arc(X(m.dot[0]), Y(m.dot[1]), 3.5, 0, Math.PI * 2); g.shadowColor = m.color; g.shadowBlur = 10; g.fill(); g.shadowBlur = 0; }
    if (m.label) { g.font = FONT; g.fillText(m.label, (m.x !== undefined ? X(m.x) : pl) + 4, m.y !== undefined ? Y(m.y) - 4 : pt + 20); }
  }
  g.restore();
  if (title) { g.fillStyle = 'rgba(232,238,252,.8)'; g.font = FONT; g.fillText(title, pl + 4, pt + 10); }
  // Legend.
  let lx = pl + iw - 4; g.font = FONT;
  for (const s of [...series].reverse()) { if (!s.label) continue; const tw = g.measureText(s.label).width; lx -= tw + 16; g.fillStyle = s.color; g.fillRect(lx, pt + (title ? 17 : 4), 8, 2); g.fillStyle = 'rgba(232,238,252,.8)'; g.fillText(s.label, lx + 11, pt + (title ? 21 : 8)); }
}

// Sweeping monitor strip (like a bedside ECG): newest samples overwrite the oldest.
export function monitor(cv, samples, { span = 4, lo = -0.6, hi = 1.5, color = '#5dffa8', now }) {
  const { g, W, H } = fit(cv);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(93,255,168,.08)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 12) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y < H; y += 12) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  if (!samples.length) return;
  const t1 = now ?? samples[samples.length - 1][0], phase = (t1 % span) / span;
  const X = (t) => (((t % span) / span) * W), Y = (v) => H - ((v - lo) / (hi - lo)) * H;
  g.strokeStyle = color; g.lineWidth = 1.7; g.shadowColor = color; g.shadowBlur = 9; g.beginPath();
  let prevX = -1;
  for (const s of samples) {
    if (s[0] < t1 - span * 0.96) continue;
    const x = X(s[0]), y = Y(s[1]);
    if (prevX < 0 || x < prevX) g.moveTo(x, y); else g.lineTo(x, y);
    prevX = x;
  }
  g.stroke(); g.shadowBlur = 0;
  const cx = phase * W; const grd = g.createLinearGradient(cx, 0, cx + 26, 0); grd.addColorStop(0, 'rgba(3,4,7,1)'); grd.addColorStop(1, 'rgba(3,4,7,0)');
  g.fillStyle = grd; g.fillRect(cx + 1, 0, 26, H);
  g.fillStyle = color; g.beginPath(); g.arc(cx, Y(samples[samples.length - 1][1]), 2.5, 0, Math.PI * 2); g.fill();
}

// Bars: [{ x, y, color }] with a shared width; marks as in lineChart.
export function barChart(cv, { bars, x0, x1, y0 = 0, y1, w = 1, pad = [8, 8, 18, 34], xFmt = (v) => v, yFmt = (v) => v, xTicks = null, title = '', marks = [] }) {
  const { g, W, H } = fit(cv);
  if (W < 20 || H < 20) return;
  g.clearRect(0, 0, W, H);
  const [pt, pr, pb, pl] = pad, iw = W - pl - pr, ih = H - pt - pb;
  const X = (x) => pl + ((x - x0) / (x1 - x0)) * iw, Y = (y) => pt + ih - ((y - y0) / (y1 - y0)) * ih;
  g.strokeStyle = 'rgba(141,151,179,.16)'; g.font = FONT; g.fillStyle = 'rgba(141,151,179,.85)';
  for (let i = 0; i <= 4; i++) { const v = y0 + ((y1 - y0) * i) / 4, y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(pl, y); g.lineTo(pl + iw, y); g.stroke(); g.fillText(yFmt(v), 2, y + 3); }
  for (const v of xTicks ?? Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4)) { const s = String(xFmt(v)), x = X(v); g.fillText(s, Math.min(W - g.measureText(s).width - 2, Math.max(pl, x - g.measureText(s).width / 2)), H - 4); }
  for (const b of bars) { const xa = X(b.x - w / 2) + 0.5, xb = X(b.x + w / 2) - 0.5, y = Y(Math.min(y1, b.y)); g.fillStyle = b.color; g.shadowColor = b.color; g.shadowBlur = b.glow ? 10 : 0; g.fillRect(xa, y, Math.max(1, xb - xa), Y(y0) - y); }
  g.shadowBlur = 0;
  for (const m of marks) { g.strokeStyle = m.color; g.fillStyle = m.color; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(m.x), pt); g.lineTo(X(m.x), pt + ih); g.stroke(); g.setLineDash([]); if (m.label) g.fillText(m.label, Math.min(pl + iw - g.measureText(m.label).width, X(m.x) + 4), pt + 22); }
  if (title) { g.fillStyle = 'rgba(232,238,252,.8)'; g.font = FONT; g.fillText(title, pl + 4, pt + 10); }
}
