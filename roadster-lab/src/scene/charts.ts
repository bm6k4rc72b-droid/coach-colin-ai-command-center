/** 2D canvas charts: launch trace, force budget, range curve and Starman's orbit. */
import {
  apsides, AU, drag, G0, LAUNCH_DATE, motorForce, MPH, ORBITS, period, positionAt, range, rolling, separation, tractionLimit, type Car, type RunResult,
} from '../core/physics';

const FONT = '11px ui-monospace, SF Mono, Menlo, monospace';

function setup(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth || c.width;
  const h = c.clientHeight || c.height;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, 'rgba(24,10,22,0.85)');
  bg.addColorStop(1, 'rgba(6,4,12,0.85)');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.font = FONT;
  return { g, w, h };
}

function axes(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, xl: string, yl: string) {
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x0, y1);
  g.lineTo(x1, y1);
  g.stroke();
  g.fillStyle = 'rgba(230,220,255,0.6)';
  g.fillText(xl, x1 - g.measureText(xl).width, y1 + 16);
  g.fillText(yl, x0 + 6, y0 + 10);
}

function glowLine(g: CanvasRenderingContext2D, pts: [number, number][], color: string, width = 2.2) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.restore();
}

/** Speed (mph) and acceleration (g) against time, with the playback cursor. */
export function drawLaunch(c: HTMLCanvasElement, run: RunResult, cursor: number, tSpan = 12) {
  const { g, w, h } = setup(c);
  const L = 44;
  const R = w - 44;
  const T = 14;
  const B = h - 26;
  const vMax = Math.max(200, Math.ceil(Math.max(...run.samples.map((s) => s.v / MPH)) / 50) * 50);
  const gMax = Math.max(1.6, Math.ceil(run.peakG * 2) / 2 + 0.2);
  const X = (t: number) => L + (Math.min(t, tSpan) / tSpan) * (R - L);
  const Yv = (v: number) => B - (v / vMax) * (B - T);
  const Yg = (a: number) => B - (a / gMax) * (B - T);
  axes(g, L, T, R, B, `time (s) → ${tSpan}`, 'mph');
  g.fillStyle = 'rgba(255,170,200,0.7)';
  g.fillText('g', R + 8, T + 8);
  for (let v = 50; v <= vMax; v += 50) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(L, Yv(v), R - L, 1);
    g.fillStyle = 'rgba(230,220,255,0.45)';
    g.fillText(String(v), L - 26, Yv(v) + 4);
  }
  for (let a = 0.5; a <= gMax; a += 0.5) {
    g.fillStyle = 'rgba(255,170,200,0.55)';
    g.fillText(a.toFixed(1), R + 6, Yg(a) + 4);
  }
  // Shade where grip is the limit.
  for (const s of run.samples) {
    if (s.t > tSpan) break;
    if (s.limit === 'grip') {
      g.fillStyle = 'rgba(251,191,36,0.07)';
      g.fillRect(X(s.t), T, Math.max(1, X(s.t + 0.02) - X(s.t)), B - T);
    }
  }
  const S = run.samples.filter((s) => s.t <= tSpan);
  glowLine(g, S.map((s) => [X(s.t), Yg(s.a / G0)]), '#ff4fd8', 1.6);
  glowLine(g, S.map((s) => [X(s.t), Yv(s.v / MPH)]), '#38e1ff', 2.4);
  const mark = (t: number | null, label: string, v: number) => {
    if (t === null || t > tSpan) return;
    g.strokeStyle = 'rgba(255,246,194,0.55)';
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(X(t), B);
    g.lineTo(X(t), Yv(v));
    g.lineTo(L, Yv(v));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fff6c2';
    g.fillText(`${label} ${t.toFixed(2)} s`, X(t) + 4, Yv(v) - 5);
  };
  mark(run.t60, '0–60', 60);
  mark(run.t100, '0–100', 100);
  if (cursor > 0) {
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.moveTo(X(cursor), T);
    g.lineTo(X(cursor), B);
    g.stroke();
  }
}

/** Forces against speed: what the motors offer, what the tyres allow, what the air takes. */
export function drawForces(c: HTMLCanvasElement, car: Car, vNow: number) {
  const { g, w, h } = setup(c);
  const L = 50;
  const R = w - 12;
  const T = 14;
  const B = h - 26;
  const vTop = 120;
  const fMax = Math.max(motorForce(car, 0.5), tractionLimit(car, 0, 0) + car.thrust) * 1.15;
  const X = (v: number) => L + (v / vTop) * (R - L);
  const Y = (f: number) => B - (f / fMax) * (B - T);
  axes(g, L, T, R, B, 'speed (mph) →', 'kN');
  for (let f = 10000; f < fMax; f += 10000) {
    g.fillStyle = 'rgba(230,220,255,0.45)';
    g.fillText(String(f / 1000), L - 22, Y(f) + 4);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(L, Y(f), R - L, 1);
  }
  const vs = Array.from({ length: 200 }, (_, i) => (i / 199) * vTop);
  glowLine(g, vs.map((v) => [X(v), Y(motorForce(car, v))]), '#a78bfa');
  glowLine(g, vs.map((v) => [X(v), Y(tractionLimit(car, v, 0))]), '#fbbf24', 1.6);
  glowLine(g, vs.map((v) => [X(v), Y(drag(car, v) + rolling(car))]), '#f87171', 1.6);
  if (car.thrust > 0) glowLine(g, vs.map((v) => [X(v), Y(Math.min(motorForce(car, v), tractionLimit(car, v, 0)) + car.thrust)]), '#f472b6', 1.2);
  // Top speed: where usable force meets drag.
  g.fillStyle = '#fff6c2';
  const legend: [string, string][] = [['#a78bfa', 'motors: τ·G/r, then P/v'], ['#fbbf24', 'tyre grip μ·N'], ['#f87171', 'drag + rolling'], ...(car.thrust > 0 ? [['#f472b6', '+ thrusters'] as [string, string]] : [])];
  legend.forEach(([col, txt], i) => {
    g.fillStyle = col;
    g.fillRect(R - 168, T + 6 + i * 15, 10, 3);
    g.fillStyle = 'rgba(240,235,255,0.85)';
    g.fillText(txt, R - 152, T + 10 + i * 15);
  });
  if (vNow > 0.2) {
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.moveTo(X(vNow), T);
    g.lineTo(X(vNow), B);
    g.stroke();
  }
  [50, 100, 150, 200, 250].forEach((mph) => {
    g.fillStyle = 'rgba(230,220,255,0.4)';
    g.fillText(`${mph}`, X(mph * MPH) - 8, B + 14);
  });
}

/** Range against steady speed, in miles. */
export function drawRange(c: HTMLCanvasElement, car: Car, compare?: Car) {
  const { g, w, h } = setup(c);
  const L = 44;
  const R = w - 12;
  const T = 14;
  const B = h - 26;
  const vMax = 160;
  const peak = Math.max(...Array.from({ length: 60 }, (_, i) => range(car, (10 + i * 2) * MPH) / 1.609), ...(compare ? [range(compare, 25 * MPH) / 1.609] : []));
  const rMax = Math.max(800, Math.ceil((peak * 1.08) / 200) * 200);
  const X = (mph: number) => L + (mph / vMax) * (R - L);
  const Y = (mi: number) => B - (mi / rMax) * (B - T);
  axes(g, L, T, R, B, 'steady speed (mph) →', 'miles');
  for (let r = 200; r <= rMax; r += 200) {
    g.fillStyle = 'rgba(230,220,255,0.45)';
    g.fillText(String(r), L - 30, Y(r) + 4);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(L, Y(r), R - L, 1);
  }
  const ms = Array.from({ length: 150 }, (_, i) => 10 + (i / 149) * (vMax - 10));
  if (compare) glowLine(g, ms.map((m) => [X(m), Y(range(compare, m * MPH) / 1.609)]), 'rgba(251,191,36,0.8)', 1.4);
  glowLine(g, ms.map((m) => [X(m), Y(range(car, m * MPH) / 1.609)]), '#4ade80');
  g.strokeStyle = 'rgba(255,246,194,0.5)';
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(L, Y(620));
  g.lineTo(R, Y(620));
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#fff6c2';
  g.fillText('announced 620 mi', R - 118, Y(620) - 5);
  for (let m = 25; m <= vMax; m += 25) {
    g.fillStyle = 'rgba(230,220,255,0.4)';
    g.fillText(String(m), X(m) - 8, B + 14);
  }
  const r70 = range(car, 70 * MPH) / 1.609;
  g.fillStyle = '#4ade80';
  g.beginPath();
  g.arc(X(70), Y(r70), 4, 0, 7);
  g.fill();
  g.fillText(`${r70.toFixed(0)} mi at 70 mph`, X(70) + 8, Y(r70) - 6);
  if (compare) {
    g.fillStyle = 'rgba(251,191,36,0.9)';
    g.fillText(compare.name, R - g.measureText(compare.name).width - 4, T + 30);
  }
}

/** Heliocentric orbits of Earth, Mars and the Falcon Heavy Roadster at a date. */
export function drawOrbit(c: HTMLCanvasElement, date: Date, t: number) {
  const { g, w, h } = setup(c);
  const cx = w / 2;
  const cy = h / 2 + 4;
  const scale = Math.min(w, h) * 0.27;
  // Stars.
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.5})`;
    g.fillRect(r() * w, r() * h, 1, 1);
  }
  // Sun.
  const sun = g.createRadialGradient(cx, cy, 0, cx, cy, 24);
  sun.addColorStop(0, '#fff6c2');
  sun.addColorStop(0.3, '#fbbf24');
  sun.addColorStop(1, 'rgba(251,146,60,0)');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(cx, cy, 24, 0, 7);
  g.fill();
  for (const o of ORBITS) {
    // The ellipse, traced from the positions over one period.
    const T = period(o);
    g.strokeStyle = o.color + '88';
    g.lineWidth = o.name === 'Roadster' ? 1.6 : 1;
    if (o.name === 'Roadster') g.setLineDash([5, 4]);
    g.beginPath();
    for (let i = 0; i <= 240; i++) {
      const p = positionAt(o, new Date(o.perihelion.getTime() + (i / 240) * T * 86400000));
      const x = cx + p.x * scale;
      const y = cy - p.y * scale;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.setLineDash([]);
    const p = positionAt(o, date);
    const x = cx + p.x * scale;
    const y = cy - p.y * scale;
    g.save();
    g.shadowColor = o.color;
    g.shadowBlur = 14;
    g.fillStyle = o.color;
    g.beginPath();
    g.arc(x, y, o.name === 'Roadster' ? 4 + Math.sin(t * 6) : 4, 0, 7);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(240,235,255,0.9)';
    g.fillText(o.name === 'Roadster' ? `Roadster · ${p.r.toFixed(2)} AU · ${p.speed.toFixed(1)} km/s` : o.name, x + 8, y - 6);
  }
  const ro = ORBITS[2];
  const a = apsides(ro);
  const days = (date.getTime() - LAUNCH_DATE.getTime()) / 86400000;
  const sep = separation(ORBITS[0], ro, date);
  g.fillStyle = 'rgba(240,235,255,0.85)';
  const lines = [
    date.toISOString().slice(0, 10),
    `${days >= 0 ? days.toFixed(0) + ' days after launch' : 'before launch'} · orbit ${(days / period(ro)).toFixed(2)}`,
    `from Earth: ${sep.toFixed(2)} AU · ${(sep * AU / 1e9).toFixed(0)} million km`,
    `perihelion ${a.q.toFixed(3)} AU · aphelion ${a.Q.toFixed(3)} AU · T = ${period(ro).toFixed(0)} d`,
  ];
  lines.forEach((l, i) => g.fillText(l, 10, h - 8 - (lines.length - 1 - i) * 14));
}
