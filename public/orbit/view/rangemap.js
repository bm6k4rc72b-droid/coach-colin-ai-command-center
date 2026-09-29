import { RANGE } from '../sim/range.js';

// Tactical range display on a 2D canvas: coastline, range rings, radar sweep
// with phosphor persistence, hazard areas, destruct lines, air and sea
// tracks, the vehicle ground track and its instantaneous impact point.

function coast(y) { return 2.5 + 3 * Math.sin(y / 17) + 1.5 * Math.sin(y / 5.3 + 1) + (y > 30 && y < 55 ? -6 * Math.sin(((y - 30) / 25) * Math.PI) : 0); }

export function drawRange(cv, S, L, opt) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  const W = r.width, H = r.height;
  const span = opt.span || 200;                                   // km shown from centre to edge (horizontal)
  const ox = W * 0.34, oy = H * 0.5, k = (W * 0.62) / span;       // pad at 34 % from left, looking east over the sea
  const X = (x) => ox + x * k, Y = (y) => oy - y * k;
  g.fillStyle = 'rgba(2,6,10,0.92)'; g.fillRect(0, 0, W, H);
  // Sea and land.
  g.fillStyle = '#04121e'; g.fillRect(0, 0, W, H);
  g.beginPath(); g.moveTo(0, 0);
  for (let py = 0; py <= H; py += 4) { const y = (oy - py) / k; g.lineTo(X(coast(y)), py); }
  g.lineTo(0, H); g.closePath(); g.fillStyle = '#0b1a14'; g.fill();
  g.strokeStyle = 'rgba(93,255,168,.35)'; g.lineWidth = 1.2; g.beginPath();
  for (let py = 0; py <= H; py += 4) { const y = (oy - py) / k; py ? g.lineTo(X(coast(y)), py) : g.moveTo(X(coast(y)), py); }
  g.stroke();
  // Grid rings and bearings.
  g.strokeStyle = 'rgba(63,243,255,.12)'; g.fillStyle = 'rgba(63,243,255,.45)'; g.font = '10px "JetBrains Mono", monospace';
  for (const rk of [25, 50, 100, 150, 200, 300]) { g.beginPath(); g.arc(X(0), Y(0), rk * k, 0, Math.PI * 2); g.stroke(); g.fillText(`${rk} km`, X(0) + rk * k * 0.71 + 3, Y(0) - rk * k * 0.71); }
  for (let b = 0; b < 360; b += 30) { const a = (b * Math.PI) / 180; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(Math.sin(a) * 400), Y(Math.cos(a) * 400)); g.stroke(); }
  // Hazard areas.
  const poly = (P, stroke, fill, dash) => { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fillStyle = fill; g.fill(); g.setLineDash(dash); g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); };
  poly(RANGE.aha, 'rgba(255,184,107,.8)', 'rgba(255,184,107,.05)', [6, 4]);
  poly(RANGE.lha, 'rgba(255,68,102,.9)', 'rgba(255,68,102,.08)', [2, 0]);
  g.beginPath(); g.arc(X(0), Y(0), RANGE.padR * k, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,68,102,.7)'; g.stroke();
  // Destruct lines (crossrange limits for the IIP).
  g.setLineDash([10, 6]); g.strokeStyle = 'rgba(255,79,216,.8)'; g.lineWidth = 1.4;
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(X(10), Y(s * RANGE.destructY)); g.lineTo(X(400), Y(s * RANGE.destructY)); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,79,216,.8)'; g.fillText(opt.lab.destruct, X(160), Y(RANGE.destructY) - 5);
  g.fillStyle = 'rgba(255,68,102,.9)'; g.fillText('LHA', X(20), Y(0) + 3); g.fillStyle = 'rgba(255,184,107,.9)'; g.fillText('AHA ≤ FL600', X(120), Y(-29));
  // Town and radar site.
  g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(X(RANGE.town.x), Y(RANGE.town.y), 4, 0, Math.PI * 2); g.fill(); g.fillText(opt.lab.town, X(RANGE.town.x) - 30, Y(RANGE.town.y) - 8);
  // Radar sweep with persistence.
  const a = S.sweep, grd = g.createConicGradient ? g.createConicGradient(a - Math.PI / 2 - 0.9, X(0), Y(0)) : null;
  if (grd) { grd.addColorStop(0, 'rgba(93,255,168,0)'); grd.addColorStop(0.14, 'rgba(93,255,168,0.16)'); grd.addColorStop(0.1433, 'rgba(93,255,168,0)'); grd.addColorStop(1, 'rgba(93,255,168,0)'); g.fillStyle = grd; g.beginPath(); g.arc(X(0), Y(0), 320 * k, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(93,255,168,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(Math.sin(a) * 320), Y(Math.cos(a) * 320)); g.stroke();
  // Tracks.
  for (const T of S.tracks) {
    if (!T.detected && T.src === 'primary') continue;
    const x = X(T.x), y = Y(T.y), col = T.own ? '#3ff3ff' : T.violation ? '#ff4466' : T.src === 'primary' ? '#ffb86b' : '#e8eefc';
    // History dots.
    g.fillStyle = col; for (const [hx, hy] of T.hist) { g.globalAlpha = 0.35; g.fillRect(X(hx) - 1, Y(hy) - 1, 2, 2); } g.globalAlpha = 1;
    // Velocity leader (1 min).
    const ha = (T.hdg * Math.PI) / 180; g.strokeStyle = col; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(ha) * T.spd * 60 * k, y - Math.cos(ha) * T.spd * 60 * k); g.stroke();
    g.save(); g.translate(x, y);
    if (T.kind === 'air') { g.rotate(ha); g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fillStyle = col; g.fill(); }
    else { g.beginPath(); g.moveTo(0, -6); g.lineTo(6, 0); g.lineTo(0, 6); g.lineTo(-6, 0); g.closePath(); g.strokeStyle = col; g.lineWidth = 1.6; g.stroke(); }
    g.restore();
    if (opt.sel === T.id) { g.strokeStyle = '#3ff3ff'; g.strokeRect(x - 11, y - 11, 22, 22); }
    g.fillStyle = col; g.font = '10px "JetBrains Mono", monospace';
    g.fillText(`${T.cs}${T.kind === 'air' ? ` FL${String(Math.round(T.alt / 30.48)).padStart(3, '0')}` : ''}`, x + 10, y - 6);
    g.fillStyle = 'rgba(232,238,252,.55)'; g.fillText(`${T.src.toUpperCase()} ${Math.round(T.spd * 1944)}kt SNR ${T.snr.toFixed(0)}dB`, x + 10, y + 6);
    T._sx = x; T._sy = y;
  }
  // Launch: ground track and instantaneous impact point.
  if (L) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath();
    L.track.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke();
    g.strokeStyle = '#ff4fd8'; g.setLineDash([3, 3]); g.beginPath();
    L.track.filter((p) => p.iip).forEach((p, i) => (i ? g.lineTo(X(p.iip.x), Y(p.iip.y)) : g.moveTo(X(p.iip.x), Y(p.iip.y)))); g.stroke(); g.setLineDash([]);
    if (L.iip && !L.terminated) { const ix = X(L.iip.x), iy = Y(L.iip.y); g.strokeStyle = '#ff4fd8'; g.lineWidth = 2; g.beginPath(); g.arc(ix, iy, 9, 0, Math.PI * 2); g.moveTo(ix - 14, iy); g.lineTo(ix + 14, iy); g.moveTo(ix, iy - 14); g.lineTo(ix, iy + 14); g.stroke(); g.fillStyle = '#ff4fd8'; g.fillText('IIP', ix + 12, iy - 10); }
    const last = L.track[L.track.length - 1];
    if (last) { g.fillStyle = L.terminated ? '#ff4466' : '#fff'; g.beginPath(); g.arc(X(last.x), Y(last.y), 5, 0, Math.PI * 2); g.fill(); }
  }
  // Pad.
  g.fillStyle = '#3ff3ff'; g.fillRect(X(0) - 4, Y(0) - 4, 8, 8); g.fillText(opt.lab.pad, X(0) - 14, Y(0) + 18);
  return { X, Y, k };
}
