// NEUROLENS · a procedural film: shot types drawn live on a canvas so their pixels
// can be analysed like real footage. Each draw returns semantic priors the eye
// cannot get from pixels alone (where the faces and eyes are).

export const SHOT_TYPES = ['portrait', 'eyes', 'pet', 'product', 'flower', 'landscape', 'city', 'action', 'text', 'crowd', 'abstract'];
export const MOVES = ['in', 'out', 'pan', 'static', 'shake'];
export const ICON = { portrait: '◐', eyes: '◉', pet: '🐾', product: '◆', flower: '✿', landscape: '△', city: '▥', action: '➤', text: 'Aa', crowd: '⁘', abstract: '◌' };

let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const BOKEH = Array.from({ length: 26 }, () => ({ x: rnd(), y: rnd(), r: 0.03 + rnd() * 0.09, h: rnd() }));
const CROWD = Array.from({ length: 70 }, () => ({ x: rnd(), y: 0.35 + rnd() * 0.7, s: 0.6 + rnd() * 0.6, c: rnd(), k: rnd() }));
const STARS = Array.from({ length: 60 }, () => ({ x: rnd(), y: rnd() * 0.5, a: rnd() }));
const CITY = Array.from({ length: 28 }, (_, i) => ({ x: i / 28, w: 0.025 + rnd() * 0.03, h: 0.25 + rnd() * 0.45, win: rnd() }));

function grad(g, x0, y0, x1, y1, stops) { const G = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => G.addColorStop(o, c)); return G; }
function radial(g, x, y, r0, r1, stops) { const G = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => G.addColorStop(o, c)); return G; }

function face(g, W, H, cx, cy, s, t, opts = {}) {
  const blink = Math.abs(Math.sin(t * 0.9)) > 0.985 ? 0.12 : 1;
  // Hair behind.
  g.fillStyle = opts.hair || '#3a2420'; g.beginPath(); g.ellipse(cx, cy - s * 0.12, s * 0.62, s * 0.78, 0, 0, Math.PI * 2); g.fill();
  // Neck & shoulders.
  g.fillStyle = grad(g, 0, cy + s * 0.6, 0, H, [[0, '#d9a48e'], [1, '#b98270']]); g.fillRect(cx - s * 0.18, cy + s * 0.45, s * 0.36, s * 0.5);
  g.fillStyle = opts.top || '#f6d6e4'; g.beginPath(); g.ellipse(cx, cy + s * 1.25, s * 1.1, s * 0.55, 0, Math.PI, 0); g.fill();
  // Head.
  g.fillStyle = radial(g, cx - s * 0.15, cy - s * 0.2, s * 0.05, s * 0.75, [[0, '#f8d2c0'], [0.7, '#e3a98f'], [1, '#c98a74']]);
  g.beginPath(); g.ellipse(cx, cy, s * 0.48, s * 0.62, 0, 0, Math.PI * 2); g.fill();
  // Fringe.
  g.fillStyle = opts.hair || '#3a2420'; g.beginPath(); g.ellipse(cx + s * 0.08, cy - s * 0.5, s * 0.5, s * 0.22, -0.25, 0, Math.PI * 2); g.fill();
  // Eyes.
  for (const sx of [-1, 1]) {
    const ex = cx + sx * s * 0.19, ey = cy - s * 0.06;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, s * 0.1, s * 0.055 * blink, 0, 0, Math.PI * 2); g.fill();
    if (blink > 0.5) { g.fillStyle = radial(g, ex, ey, 0, s * 0.05, [[0, '#1a0f0a'], [0.4, '#5a3b2a'], [1, '#7a5238']]); g.beginPath(); g.arc(ex + (opts.gaze || 0) * s * 0.03, ey, s * 0.048, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - s * 0.015, ey - s * 0.018, s * 0.012, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#2a1a14'; g.lineWidth = s * 0.018; g.beginPath(); g.ellipse(ex, ey - s * 0.11, s * 0.1, s * 0.03, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  }
  g.strokeStyle = 'rgba(150,90,70,.6)'; g.lineWidth = s * 0.015; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx - s * 0.05, cy + s * 0.14, cx + s * 0.03, cy + s * 0.16); g.stroke();
  g.fillStyle = '#d4566f'; g.beginPath(); g.ellipse(cx, cy + s * 0.3, s * 0.13, s * 0.045 + 0.01 * s * Math.sin(t * 3) ** 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,140,170,.25)'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * s * 0.28, cy + s * 0.14, s * 0.09, 0, Math.PI * 2); g.fill(); }
}

const DRAW = {
  portrait(g, W, H, u, t) {
    g.fillStyle = grad(g, 0, 0, W, H, [[0, '#fdeef4'], [1, '#f3c6d8']]); g.fillRect(0, 0, W, H);
    for (const b of BOKEH) { g.fillStyle = `hsla(${330 + b.h * 40},90%,${80 + b.h * 10}%,.35)`; g.beginPath(); g.arc(b.x * W, b.y * H, b.r * W, 0, Math.PI * 2); g.fill(); }
    const s = H * 0.42; face(g, W, H, W * 0.55, H * 0.5, s, t, { gaze: 0 });
    return { face: 1, eyes: 0.6, faces: [{ x: 0.55, y: 0.47, r: 0.09, w: 0.9 }] };
  },
  eyes(g, W, H, u, t) {
    g.fillStyle = '#e8b19b'; g.fillRect(0, 0, W, H);
    g.fillStyle = radial(g, W / 2, H / 2, 0, W * 0.6, [[0, '#f6cdb8'], [1, '#c48a72']]); g.fillRect(0, 0, W, H);
    const blink = Math.abs(Math.sin(t * 0.8)) > 0.99 ? 0.1 : 1;
    for (const sx of [-1, 1]) {
      const ex = W / 2 + sx * W * 0.22, ey = H * 0.52, rx = W * 0.15, ry = H * 0.2 * blink;
      g.fillStyle = '#fbf6f4'; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); g.fill();
      if (blink > 0.5) {
        g.fillStyle = radial(g, ex, ey, 0, H * 0.16, [[0, '#050302'], [0.32, '#120a06'], [0.36, '#6b3fa0'], [0.7, '#c06bd4'], [1, '#3a1f40']]); g.beginPath(); g.arc(ex, ey, H * 0.16, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - H * 0.05, ey - H * 0.06, H * 0.035, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#1b0f0b'; g.lineWidth = H * 0.025; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
    return { face: 0.7, eyes: 1, faces: [{ x: 0.28, y: 0.52, r: 0.07, w: 0.8 }, { x: 0.72, y: 0.52, r: 0.07, w: 0.8 }] };
  },
  pet(g, W, H, u, t) {
    g.fillStyle = grad(g, 0, 0, 0, H, [[0, '#fff3f8'], [1, '#f6d3e2']]); g.fillRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.55, s = H * 0.38, tilt = Math.sin(t * 1.3) * 0.08;
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.fillStyle = '#e9c7a8'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * 0.75, -s * 0.35); g.lineTo(sx * s * 0.45, -s * 1.05); g.lineTo(sx * s * 0.15, -s * 0.6); g.fill(); }
    g.fillStyle = radial(g, -s * 0.2, -s * 0.2, 0, s * 1.1, [[0, '#fbe4cf'], [1, '#d9a985']]); g.beginPath(); g.ellipse(0, 0, s * 0.85, s * 0.7, 0, 0, Math.PI * 2); g.fill();
    for (const sx of [-1, 1]) { g.fillStyle = '#1b130f'; g.beginPath(); g.ellipse(sx * s * 0.32, -s * 0.05, s * 0.17, s * 0.2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx * s * 0.32 - s * 0.05, -s * 0.12, s * 0.055, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f07fa0'; g.beginPath(); g.moveTo(-s * 0.07, s * 0.18); g.lineTo(s * 0.07, s * 0.18); g.lineTo(0, s * 0.27); g.fill();
    g.strokeStyle = 'rgba(80,50,40,.6)'; g.lineWidth = 1.2; for (const sx of [-1, 1]) for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(sx * s * 0.2, s * 0.25 + k * s * 0.05); g.lineTo(sx * s * 0.75, s * 0.2 + k * s * 0.1); g.stroke(); }
    g.restore();
    return { face: 0.6, eyes: 0.8, cute: 1, faces: [{ x: 0.5, y: 0.53, r: 0.1, w: 0.9 }] };
  },
  product(g, W, H, u, t) {
    g.fillStyle = radial(g, W / 2, H * 0.45, 0, W * 0.7, [[0, '#ffffff'], [1, '#f1e4ee']]); g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(200,150,180,.25)'; g.beginPath(); g.ellipse(W / 2, H * 0.84, W * 0.15, H * 0.04, 0, 0, Math.PI * 2); g.fill();
    const bw = W * 0.14, bh = H * 0.5, x = W / 2 - bw / 2, y = H * 0.32;
    g.fillStyle = grad(g, x, 0, x + bw, 0, [[0, '#ff5fa2'], [0.45, '#ffc2dc'], [0.55, '#ffffff'], [1, '#e2337f']]);
    g.beginPath(); g.roundRect(x, y, bw, bh, bw * 0.25); g.fill();
    g.fillStyle = '#d8c3a5'; g.fillRect(W / 2 - bw * 0.2, y - H * 0.08, bw * 0.4, H * 0.09);
    const sweep = (t * 0.35) % 1.4 - 0.2; g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.roundRect(x + bw * sweep, y + bh * 0.05, bw * 0.12, bh * 0.85, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.font = `600 ${H * 0.04}px Space Grotesk, sans-serif`; g.textAlign = 'center'; g.fillText('L U M E', W / 2, y + bh * 0.55);
    return {};
  },
  flower(g, W, H, u, t) {
    g.fillStyle = radial(g, W / 2, H / 2, 0, W * 0.6, [[0, '#ffe0ef'], [1, '#6f1d4b']]); g.fillRect(0, 0, W, H);
    const cx = W * 0.48, cy = H * 0.52;
    for (let ring = 3; ring >= 0; ring--) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + ring * 0.26 + t * 0.05, L = H * (0.18 + ring * 0.11), wd = H * (0.07 + ring * 0.03);
      g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = grad(g, 0, 0, L, 0, [[0, '#fff2f8'], [0.5, `hsl(${330 - ring * 6},90%,${68 - ring * 6}%)`], [1, `hsl(${320 - ring * 8},85%,${45 - ring * 4}%)`]]);
      g.beginPath(); g.ellipse(L * 0.55, 0, L * 0.55, wd, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.fillStyle = radial(g, cx, cy, 0, H * 0.07, [[0, '#fff6a8'], [1, '#e8a300']]); g.beginPath(); g.arc(cx, cy, H * 0.07, 0, Math.PI * 2); g.fill();
    return {};
  },
  landscape(g, W, H, u, t) {
    g.fillStyle = grad(g, 0, 0, 0, H, [[0, '#9fb6e8'], [0.45, '#f4c3d6'], [0.6, '#fbe0c8'], [1, '#f6d9c9']]); g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,250,240,.9)'; g.beginPath(); g.arc(W * 0.7, H * 0.5, H * 0.07, 0, Math.PI * 2); g.fill();
    const ridge = (y0, amp, col, f, ph) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 60) g.lineTo(x, H * y0 - amp * H * (0.5 + 0.5 * Math.sin(x / W * f + ph) * Math.cos(x / W * f * 0.37 + ph))); g.lineTo(W, H); g.fill(); };
    ridge(0.62, 0.12, 'rgba(176,160,200,.9)', 9, 1); ridge(0.7, 0.1, 'rgba(140,120,170,.95)', 13, 3); ridge(0.8, 0.08, 'rgba(100,84,130,1)', 17, 5);
    g.fillStyle = 'rgba(244,200,214,.55)'; g.fillRect(0, H * 0.86, W, H * 0.14);
    return {};
  },
  city(g, W, H, u, t) {
    g.fillStyle = grad(g, 0, 0, 0, H, [[0, '#120a26'], [1, '#3a1240']]); g.fillRect(0, 0, W, H);
    for (const s of STARS) { g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * s.a})`; g.fillRect(s.x * W, s.y * H, 1.2, 1.2); }
    for (const b of CITY) { g.fillStyle = '#0b0614'; g.fillRect(b.x * W, H * (1 - b.h), b.w * W, b.h * H); for (let y = H * (1 - b.h) + 6; y < H - 4; y += 7) for (let x = b.x * W + 3; x < (b.x + b.w) * W - 3; x += 6) if ((x * 7 + y * 13 + Math.floor(b.win * 50)) % 5 < 2) { g.fillStyle = (x + y) % 3 ? '#ff6fb5' : '#7fe8ff'; g.fillRect(x, y, 2.5, 3); } }
    g.lineCap = 'round';
    for (let k = 0; k < 8; k++) { const y = H * (0.88 + k * 0.012), off = ((t * (0.4 + k * 0.07) + k * 0.13) % 1.4 - 0.2) * W; g.strokeStyle = k % 2 ? 'rgba(255,90,140,.9)' : 'rgba(255,240,220,.9)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(off, y); g.lineTo(off + W * 0.18, y); g.stroke(); }
    return {};
  },
  action(g, W, H, u, t) {
    g.fillStyle = grad(g, 0, 0, W, 0, [[0, '#ffb3d1'], [1, '#ffffff']]); g.fillRect(0, 0, W, H);
    for (let k = 0; k < 30; k++) { const y = ((k * 37) % 100) / 100 * H, x = ((t * 3.2 + k * 0.137) % 1) * W * 1.4 - W * 0.2; g.strokeStyle = `rgba(255,${80 + k * 4},160,.55)`; g.lineWidth = 1 + (k % 4); g.beginPath(); g.moveTo(x, y); g.lineTo(x - W * 0.25, y); g.stroke(); }
    const px = W * (0.2 + 0.6 * ((t * 0.5) % 1)), py = H * 0.55 + Math.sin(t * 9) * H * 0.02;
    g.fillStyle = '#2a0d1f'; g.beginPath(); g.ellipse(px, py, W * 0.12, H * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff2f7d'; g.beginPath(); g.ellipse(px + W * 0.02, py - H * 0.04, W * 0.07, H * 0.05, 0, Math.PI, 0); g.fill();
    for (const dx of [-0.07, 0.07]) { g.fillStyle = '#111'; g.beginPath(); g.arc(px + dx * W, py + H * 0.06, H * 0.045, 0, Math.PI * 2); g.fill(); }
    return { shake: 1 };
  },
  text(g, W, H, u, t) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = grad(g, 0, 0, W, H, [[0, 'rgba(255,79,163,.18)'], [1, 'rgba(180,140,255,.18)']]); g.fillRect(0, 0, W, H);
    const k = 1 + 0.06 * Math.sin(u * Math.PI);
    g.save(); g.translate(W / 2, H / 2); g.scale(k, k); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#1b0b16'; g.font = `700 ${H * 0.16}px Space Grotesk, sans-serif`; g.fillText('WAIT FOR IT', 0, -H * 0.04);
    g.fillStyle = '#ff2f8e'; g.font = `500 ${H * 0.06}px Space Grotesk, sans-serif`; g.fillText('a film by you', 0, H * 0.12); g.restore();
    return { text: 1 };
  },
  crowd(g, W, H, u, t) {
    g.fillStyle = grad(g, 0, 0, 0, H, [[0, '#d9d4dc'], [1, '#9e94a3']]); g.fillRect(0, 0, W, H);
    for (const p of [...CROWD].sort((a, b) => a.y - b.y)) { const x = p.x * W + Math.sin(t * 1.5 + p.k * 9) * 2, y = p.y * H, s = H * 0.05 * p.s * (0.6 + p.y * 0.6); g.fillStyle = `hsl(${p.c * 360},25%,${35 + p.k * 30}%)`; g.beginPath(); g.ellipse(x, y + s * 1.6, s * 1.1, s * 1.3, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = `hsl(25,40%,${55 + p.k * 20}%)`; g.beginPath(); g.arc(x, y, s * 0.7, 0, Math.PI * 2); g.fill(); }
    return { face: 0.25 };
  },
  abstract(g, W, H, u, t) {
    g.fillStyle = '#f7f1f5'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 4; k++) { const x = W * (0.3 + 0.4 * Math.sin(t * 0.13 + k * 1.7)), y = H * (0.5 + 0.3 * Math.cos(t * 0.11 + k * 2.1)); g.fillStyle = radial(g, x, y, 0, H * 0.6, [[0, `hsla(${300 + k * 15},40%,85%,.6)`], [1, 'hsla(300,40%,90%,0)']]); g.fillRect(0, 0, W, H); }
    return {};
  },
};

// Draw shot `s` at local time `ts` (s) into context g (W×H). Returns semantic priors.
export function drawShot(g, W, H, s, ts) {
  const u = Math.min(1, ts / s.dur);
  g.save();
  // Camera move: push-in, pull-out, lateral pan, handheld shake.
  let z = 1, dx = 0, dy = 0;
  if (s.move === 'in') z = 1 + 0.18 * u; else if (s.move === 'out') z = 1.18 - 0.18 * u; else if (s.move === 'pan') { z = 1.12; dx = (u - 0.5) * W * 0.1; }
  if (s.move === 'shake') { z = 1.08; dx = Math.sin(ts * 31) * W * 0.008; dy = Math.cos(ts * 27) * H * 0.01; }
  g.translate(W / 2 + dx, H / 2 + dy); g.scale(z, z); g.translate(-W / 2, -H / 2);
  const meta = DRAW[s.type](g, W, H, u, ts) || {};
  g.restore();
  // Saturation grade (a colour-pop slider).
  if (s.sat !== 1) { g.save(); g.globalCompositeOperation = 'saturation'; g.fillStyle = `hsl(0,${Math.round(Math.min(100, s.sat * 50))}%,50%)`; if (s.sat < 1) g.fillRect(0, 0, W, H); g.restore(); }
  // Faces move with the camera.
  const faces = (meta.faces || []).map((f) => ({ x: 0.5 + (f.x - 0.5) * z + dx / W, y: 0.5 + (f.y - 0.5) * z + dy / H, r: f.r * z, w: f.w }));
  return { ...meta, faces };
}

export const REELS = {
  launch: [
    { type: 'text', dur: 1.6, move: 'in', sat: 1 }, { type: 'portrait', dur: 3, move: 'in', sat: 1 }, { type: 'product', dur: 2.6, move: 'static', sat: 1 },
    { type: 'flower', dur: 2, move: 'in', sat: 1 }, { type: 'action', dur: 1.8, move: 'shake', sat: 1 }, { type: 'eyes', dur: 1.6, move: 'in', sat: 1 },
    { type: 'landscape', dur: 5, move: 'pan', sat: 0.7 }, { type: 'crowd', dur: 3.2, move: 'static', sat: 0.8 }, { type: 'abstract', dur: 5, move: 'static', sat: 0.6 },
    { type: 'pet', dur: 2.2, move: 'in', sat: 1 }, { type: 'product', dur: 3, move: 'in', sat: 1 },
  ],
  tuned: [
    { type: 'eyes', dur: 1.2, move: 'in', sat: 1 }, { type: 'text', dur: 1.3, move: 'in', sat: 1 }, { type: 'portrait', dur: 2.4, move: 'in', sat: 1 },
    { type: 'product', dur: 2, move: 'in', sat: 1 }, { type: 'action', dur: 1.5, move: 'shake', sat: 1 }, { type: 'flower', dur: 1.8, move: 'in', sat: 1.2 },
    { type: 'city', dur: 2.2, move: 'pan', sat: 1 }, { type: 'pet', dur: 2, move: 'in', sat: 1 }, { type: 'landscape', dur: 2.6, move: 'pan', sat: 1.2 },
    { type: 'portrait', dur: 2.2, move: 'in', sat: 1 }, { type: 'action', dur: 1.4, move: 'shake', sat: 1 }, { type: 'product', dur: 2.8, move: 'in', sat: 1 },
  ],
};
export const reelDuration = (reel) => reel.reduce((a, s) => a + s.dur, 0);
export function shotAt(reel, t) { let a = 0; for (let i = 0; i < reel.length; i++) { if (t < a + reel[i].dur) return { i, s: reel[i], ts: t - a, start: a }; a += reel[i].dur; } const i = reel.length - 1; return { i, s: reel[i], ts: reel[i].dur, start: a - reel[i].dur }; }
