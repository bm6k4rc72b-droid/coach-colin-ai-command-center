/**
 * A scripted 60-second synthetic "match" with known highlights and two decoys, so the cutter can
 * be graded. Pure: frames are drawn through a tiny Painter interface (a canvas in the browser,
 * a software rasteriser in the tests) and the soundtrack is generated sample by sample.
 */
import { clamp } from './signal';

export const DEMO_DURATION = 60;

export interface Moment {
  t: number;
  label: string;
  /** Where on the pitch it happens (world units, 100 × 60). */
  focus: [number, number];
  cheer: number;
  replay: [number, number] | null;
}

/** The real highlights. */
export const MOMENTS: Moment[] = [
  { t: 8, label: 'Goal', focus: [94, 30], cheer: 1, replay: [11, 14] },
  { t: 18, label: 'Great save', focus: [6, 26], cheer: 0.8, replay: [20.5, 23] },
  { t: 36, label: 'Near miss', focus: [92, 22], cheer: 0.6, replay: null },
  { t: 49, label: 'Goal', focus: [6, 32], cheer: 1, replay: [52, 55] },
  { t: 57.5, label: 'Final whistle', focus: [50, 30], cheer: 0.9, replay: null },
];

/** Things that fool a single feature. */
export const DECOYS = [
  { t0: 27, t1: 31, label: 'Advert break (loud music, no action)' },
  { t0: 41, t1: 44, label: 'Camera pan (motion, no action)' },
];

export interface Painter {
  rect(x: number, y: number, w: number, h: number, color: string): void;
  circle(x: number, y: number, r: number, color: string): void;
  text(s: string, x: number, y: number, size: number, color: string): void;
}

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 0→1 as the build-up starts, 1 during the moment, back to 0 over the next seconds. */
function rush(t: number, m: Moment): number {
  if (t < m.t - 2 || t > m.t + 4) return 0;
  if (t < m.t) return (t - (m.t - 2)) / 2;
  if (t < m.t + 1) return 1;
  return 1 - (t - m.t - 1) / 3;
}

function cheerLevel(t: number): number {
  let c = 0;
  for (const m of MOMENTS) if (t >= m.t && t < m.t + 5) c = Math.max(c, m.cheer * Math.exp(-(t - m.t) / 2.2) * clamp((t - m.t) / 0.3, 0, 1));
  return c;
}

export type Shot = 'wide' | 'replay' | 'advert';

export function shotAt(t: number): { shot: Shot; moment?: Moment } {
  if (t >= DECOYS[0].t0 && t < DECOYS[0].t1) return { shot: 'advert' };
  for (const m of MOMENTS) if (m.replay && t >= m.replay[0] && t < m.replay[1]) return { shot: 'replay', moment: m };
  return { shot: 'wide' };
}

/** Player positions (world units). Ten players and a ball. */
function players(t: number): { x: number; y: number; team: number }[] {
  const out: { x: number; y: number; team: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const bx = 15 + (i % 5) * 17.5;
    const by = 12 + Math.floor(i / 5) * 30 + (i % 2) * 6;
    let x = bx + 3 * Math.sin(t * 0.35 + i * 1.7);
    let y = by + 3 * Math.cos(t * 0.3 + i * 2.3);
    for (const m of MOMENTS) {
      const r = rush(t, m);
      if (r > 0) {
        const jitter = 4 * Math.sin(t * 9 + i);
        x += (m.focus[0] + jitter - x) * 0.65 * r;
        y += (m.focus[1] + 6 * Math.cos(i * 2.1) - y) * 0.65 * r;
      }
    }
    out.push({ x, y, team: i % 2 });
  }
  return out;
}

function ball(t: number): [number, number] {
  let x = 50 + 20 * Math.sin(t * 0.25);
  let y = 30 + 10 * Math.sin(t * 0.4);
  for (const m of MOMENTS) {
    const r = rush(t, m);
    if (r > 0) {
      x += (m.focus[0] - x) * r;
      y += (m.focus[1] - y) * r;
    }
  }
  return [x, y];
}

/** Camera: pan offset (world units) and shake for the wide shot. */
function camera(t: number): { pan: number; shake: [number, number] } {
  const d = DECOYS[1];
  let pan = 0;
  if (t >= d.t0 && t < d.t1) pan = 40 * Math.sin(((t - d.t0) / (d.t1 - d.t0)) * Math.PI * 2);
  let s = 0;
  for (const m of MOMENTS) if (t >= m.t - 0.5 && t < m.t + 2) s = Math.max(s, m.cheer);
  return { pan, shake: [s * 3 * Math.sin(t * 37), s * 2 * Math.cos(t * 41)] };
}

function crowd(p: Painter, x0: number, y0: number, w: number, h: number, t: number, cell: number): void {
  p.rect(x0, y0, w, h, '#2a2f3a');
  const c = cheerLevel(t);
  const frame = Math.floor(t * 8);
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      // Fans jump when the crowd cheers: their brightness flickers frame to frame.
      const base = hash(r * 97 + k);
      const flick = c > 0.1 ? hash(r * 97 + k + frame * 13) * c : 0;
      const v = Math.round(60 + 120 * base * (1 - c * 0.5) + 130 * flick);
      const col = `#${[v, Math.round(v * 0.85), Math.round(v * 0.7)].map((n) => clamp(n, 0, 255).toString(16).padStart(2, '0')).join('')}`;
      p.rect(x0 + k * cell + 1, y0 + r * cell + 1 - flick * cell * 0.4, cell - 2, cell - 2, col);
    }
}

/** Draw the broadcast frame at time t onto a W × H painter. */
export function drawDemo(p: Painter, W: number, H: number, t: number): void {
  const { shot, moment } = shotAt(t);
  if (shot === 'advert') {
    p.rect(0, 0, W, H, '#ffd60a');
    p.rect(W * 0.08, H * 0.18, W * 0.42, H * 0.64, '#c1121f');
    p.circle(W * 0.29, H * 0.5, H * 0.2, '#fdf0d5');
    p.text('SUPER COLA', W * 0.55, H * 0.45, H * 0.11, '#1d3557');
    p.text('now with more fizz', W * 0.55, H * 0.6, H * 0.06, '#1d3557');
    return;
  }
  const replay = shot === 'replay';
  // Replays show the moment again in slow motion, zoomed on the action.
  const tt = replay && moment ? moment.t - 1.5 + (t - moment.replay![0]) * 0.6 : t;
  const zoom = replay ? 2.4 : 1;
  const cam = camera(t);
  const standH = replay ? H * 0.42 : H * 0.18;
  const fx0 = replay && moment ? clamp(moment.focus[0] - 50 / zoom, 0, 100 - 100 / zoom) : 0;
  const fy0 = replay && moment ? clamp(moment.focus[1] - 30 / zoom, 0, 60 - 60 / zoom) : 0;
  const sx = W / (100 / zoom);
  const fieldH = H - standH;
  const sy = fieldH / (60 / zoom);
  const X = (x: number) => (x - fx0 - cam.pan) * sx + cam.shake[0];
  const Y = (y: number) => standH + (y - fy0) * sy + cam.shake[1];

  crowd(p, 0, 0, W, standH, tt, Math.max(4, Math.round(H / 30)));
  p.rect(0, standH, W, fieldH, '#2f7d32');
  for (let s = -10; s < 20; s++) if (s % 2 === 0) p.rect(X(s * 10), standH, 10 * sx, fieldH, '#3a8f3c');
  // Lines and goals
  p.rect(X(0), Y(0), 0.6 * sx, 60 * sy, '#e8f5e9');
  p.rect(X(100) - 0.6 * sx, Y(0), 0.6 * sx, 60 * sy, '#e8f5e9');
  p.rect(X(50) - 0.3 * sx, Y(0), 0.6 * sx, 60 * sy, '#e8f5e9');
  p.rect(X(-2), Y(26), 2 * sx, 8 * sy, '#f1f1f1');
  p.rect(X(100), Y(26), 2 * sx, 8 * sy, '#f1f1f1');
  for (const pl of players(tt)) p.circle(X(pl.x), Y(pl.y), 1.6 * sx, pl.team ? '#e63946' : '#1d4ed8');
  const b = ball(tt);
  p.circle(X(b[0]), Y(b[1]), 0.8 * sx, '#ffffff');
  if (replay) {
    p.rect(0, 0, W, H * 0.08, '#000000');
    p.rect(0, H * 0.92, W, H * 0.08, '#000000');
    p.text('REPLAY', W * 0.04, H * 0.06, H * 0.05, '#facc15');
  } else {
    // Score bug
    const goals = MOMENTS.filter((m) => m.label === 'Goal' && m.t <= t);
    const home = goals.filter((m) => m.focus[0] > 50).length;
    const away = goals.length - home;
    p.rect(W * 0.02, H * 0.02, W * 0.3, H * 0.07, '#0b1320');
    p.text(`BLU ${home} – ${away} RED  ${Math.floor(t)}'`, W * 0.03, H * 0.07, H * 0.04, '#ffffff');
  }
}

/** The soundtrack: crowd murmur, cheers at the moments, loud advert music, a whistle. */
export function demoAudio(sampleRate = 16000): Float32Array {
  const n = Math.round(DEMO_DURATION * sampleRate);
  const out = new Float32Array(n);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    lp += (rnd() - lp) * 0.25; // low-passed noise sounds like a distant crowd
    const murmur = 0.05 * (1 + 0.3 * Math.sin(t * 0.7));
    const cheer = cheerLevel(t);
    let s = lp * (murmur + cheer * 0.9) * 2;
    const ad = DECOYS[0];
    if (t >= ad.t0 && t < ad.t1) {
      const beat = (t * 2) % 1 < 0.15 ? 1 : 0.6;
      s += 0.22 * beat * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 277 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t));
    }
    if (t >= 57.5 && t < 58.3) s += 0.25 * Math.sin(2 * Math.PI * 2800 * t) * (1 + 0.5 * Math.sin(2 * Math.PI * 30 * t));
    out[i] = clamp(s, -1, 1);
  }
  return out;
}
