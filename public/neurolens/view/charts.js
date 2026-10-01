// Light-theme charts for NEUROLENS (canvas 2D, crisp on HiDPI).

function fit(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height); return { g, W: r.width, H: r.height };
}
const INK = '#4a3550', MUTED = 'rgba(74,53,80,.45)', GRID = 'rgba(180,120,170,.16)';

export function lineChart(cv, { series, x0, x1, y0, y1, xTicks = [], yTicks = null, xFmt = (v) => v, yFmt = (v) => v, title = '', marks = [], bands = [], spans = [], now = null }) {
  if (!cv) return;
  const legend = series.some((s) => s.label), { g, W, H } = fit(cv), pl = 30, pr = 8, pt = title ? (legend ? 30 : 18) : (legend ? 18 : 8), pb = 16;
  const X = (x) => pl + ((x - x0) / (x1 - x0 || 1)) * (W - pl - pr), Y = (y) => H - pb - ((y - y0) / (y1 - y0 || 1)) * (H - pt - pb);
  g.font = '9.5px "JetBrains Mono", monospace';
  for (const b of spans) { g.fillStyle = b.color; g.fillRect(X(b.from), pt, X(b.to) - X(b.from), H - pt - pb); }
  for (const b of bands) { g.fillStyle = b.color; g.fillRect(pl, Y(b.to), W - pl - pr, Y(b.from) - Y(b.to)); }
  g.strokeStyle = GRID; g.lineWidth = 1; g.fillStyle = MUTED;
  for (const v of yTicks || [y0, (y0 + y1) / 2, y1]) { g.beginPath(); g.moveTo(pl, Y(v)); g.lineTo(W - pr, Y(v)); g.stroke(); g.textAlign = 'right'; g.fillText(yFmt(v), pl - 4, Y(v) + 3); }
  g.textAlign = 'center'; for (const v of xTicks) g.fillText(xFmt(v), X(v), H - 4);
  for (const m of marks) { g.strokeStyle = m.color; g.setLineDash(m.dash || [3, 3]); g.beginPath(); if (m.x !== undefined) { g.moveTo(X(m.x), pt); g.lineTo(X(m.x), H - pb); } else { g.moveTo(pl, Y(m.y)); g.lineTo(W - pr, Y(m.y)); } g.stroke(); g.setLineDash([]); if (m.label) { g.fillStyle = m.color; g.textAlign = 'left'; g.fillText(m.label, m.x !== undefined ? X(m.x) + 3 : pl + 3, m.x !== undefined ? pt + 9 : Y(m.y) - 3); } }
  for (const s of series) {
    if (!s.pts.length) continue;
    g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(Math.max(y0, Math.min(y1, y)))) : g.moveTo(X(x), Y(Math.max(y0, Math.min(y1, y))))));
    if (s.fill) { const last = s.pts[s.pts.length - 1]; g.lineTo(X(last[0]), Y(y0)); g.lineTo(X(s.pts[0][0]), Y(y0)); g.closePath(); g.fillStyle = s.fill; g.fill(); g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(Math.max(y0, Math.min(y1, y)))) : g.moveTo(X(x), Y(Math.max(y0, Math.min(y1, y)))))); }
    g.strokeStyle = s.color; g.lineWidth = s.width || 1.8; g.stroke();
  }
  if (now !== null) { g.strokeStyle = 'rgba(255,47,142,.8)'; g.beginPath(); g.moveTo(X(now), pt); g.lineTo(X(now), H - pb); g.stroke(); }
  if (title) { g.fillStyle = INK; g.textAlign = 'left'; g.font = '600 10px "Space Grotesk", sans-serif'; g.fillText(title, pl, 11); }
  let lx = W - pr; const ly = title ? 24 : 11; g.textAlign = 'right'; g.font = '9.5px "JetBrains Mono", monospace';
  for (const s of [...series].reverse()) { if (!s.label) continue; g.fillStyle = s.color; g.fillText('● ' + s.label, lx, ly); lx -= g.measureText('● ' + s.label).width + 10; }
}

export function radar(cv, keys, values, labels, compare = null) {
  if (!cv) return;
  const { g, W, H } = fit(cv), cx = W / 2, cy = H / 2 + 4, R = Math.min(W, H) / 2 - 26, n = keys.length;
  const P = (i, v) => [cx + Math.sin((i / n) * Math.PI * 2) * R * v, cy - Math.cos((i / n) * Math.PI * 2) * R * v];
  g.strokeStyle = GRID; for (const k of [0.25, 0.5, 0.75, 1]) { g.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = P(i % n, k); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  for (let i = 0; i < n; i++) { const [x, y] = P(i, 1); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); const [lx, ly] = P(i, 1.17); g.fillStyle = INK; g.font = '10px "Space Grotesk", sans-serif'; g.textAlign = 'center'; g.fillText(labels[i], lx, ly + 3); }
  const poly = (vals, fill, stroke) => { g.beginPath(); vals.forEach((v, i) => { const [x, y] = P(i, v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1.6; g.stroke(); };
  if (compare) poly(compare, 'rgba(176,92,255,.08)', 'rgba(176,92,255,.5)');
  poly(values, 'rgba(255,47,142,.18)', '#ff2f8e');
  values.forEach((v, i) => { const [x, y] = P(i, v); g.fillStyle = '#ff2f8e'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
}
