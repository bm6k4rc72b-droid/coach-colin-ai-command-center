/**
 * Tiny canvas charts (no dependency): line/area, bars and heat strips.
 * Each call sizes the backing store to the element's CSS box × devicePixelRatio
 * so lines stay crisp on phones.
 *
 * @module vulture/charts
 */

const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function prep(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(10, canvas.clientWidth);
  const h = Math.max(10, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

/**
 * Line chart with optional area fill.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {{data:number[], color:string, fill?:boolean, width?:number}[]} series Series (NaN = gap).
 * @param {object} [o] Options.
 * @param {number} [o.min] Y min (auto if omitted).
 * @param {number} [o.max] Y max.
 * @param {string[]} [o.xLabels] Up to ~6 x labels spread across the axis.
 * @param {(v:number)=>string} [o.fmt] Y label formatter.
 * @param {number} [o.cursor] Fraction 0..1 for a vertical cursor.
 * @param {{y:number,color:string}[]} [o.bands] Horizontal reference lines.
 * @param {boolean} [o.axes=true] Draw grid and labels.
 */
export function lineChart(canvas, series, o = {}) {
  const { g, w, h } = prep(canvas);
  const axes = o.axes !== false;
  const padL = axes ? 34 : 2; const padR = 4; const padT = 6; const padB = axes ? (o.xLabels ? 18 : 6) : 2;
  const all = series.flatMap((s) => s.data.filter(Number.isFinite));
  if (!all.length) { g.fillStyle = css('--muted', '#789'); g.font = '11px system-ui'; g.fillText('No data yet', padL + 6, h / 2); return; }
  let min = o.min ?? Math.min(...all);
  let max = o.max ?? Math.max(...all);
  if (max - min < 1e-9) { max += 1; min -= 1; }
  const X = (i, n) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const Y = (v) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  if (axes) {
    g.strokeStyle = css('--grid', '#ffffff14'); g.fillStyle = css('--muted', '#789'); g.font = '10px ui-monospace, monospace'; g.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const v = min + ((max - min) * k) / 3; const y = Y(v);
      g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
      g.fillText((o.fmt ?? ((x) => x.toFixed(Math.abs(max - min) < 10 ? 1 : 0)))(v), 2, y + 3);
    }
    if (o.xLabels?.length) {
      o.xLabels.forEach((lab, i) => {
        const x = padL + (i / Math.max(1, o.xLabels.length - 1)) * (w - padL - padR);
        g.textAlign = i === 0 ? 'left' : i === o.xLabels.length - 1 ? 'right' : 'center';
        g.fillText(lab, x, h - 4);
      });
      g.textAlign = 'left';
    }
  }
  for (const b of o.bands ?? []) {
    g.strokeStyle = b.color; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(padL, Y(b.y)); g.lineTo(w - padR, Y(b.y)); g.stroke(); g.setLineDash([]);
  }
  for (const s of series) {
    const n = s.data.length;
    g.strokeStyle = s.color; g.lineWidth = s.width ?? 1.6; g.lineJoin = 'round';
    g.beginPath();
    let pen = false; let firstX = null; let lastX = null;
    s.data.forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      const x = X(i, n); const y = Y(v);
      if (!pen) { g.moveTo(x, y); pen = true; if (firstX === null) firstX = x; } else g.lineTo(x, y);
      lastX = x;
    });
    g.stroke();
    if (s.fill && firstX !== null) {
      g.lineTo(lastX, Y(min)); g.lineTo(firstX, Y(min)); g.closePath();
      const grd = g.createLinearGradient(0, padT, 0, h - padB);
      grd.addColorStop(0, `${s.color}55`); grd.addColorStop(1, `${s.color}00`);
      g.fillStyle = grd;
      g.beginPath();
      pen = false;
      s.data.forEach((v, i) => { if (!Number.isFinite(v)) return; const x = X(i, n); const y = Y(v); if (!pen) { g.moveTo(x, Y(min)); g.lineTo(x, y); pen = true; } else g.lineTo(x, y); });
      g.lineTo(lastX, Y(min)); g.closePath(); g.fill();
    }
  }
  if (Number.isFinite(o.cursor)) {
    const x = padL + o.cursor * (w - padL - padR);
    g.strokeStyle = css('--accent', '#f5d90a'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, padT); g.lineTo(x, h - padB); g.stroke();
  }
}

/**
 * Vertical bars.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {number[]} values Values (NaN = empty).
 * @param {object} [o] Options: max, labels[], color, colorFn(v,i).
 */
export function barChart(canvas, values, o = {}) {
  const { g, w, h } = prep(canvas);
  const padB = o.labels ? 16 : 2; const padT = 12;
  const max = o.max ?? Math.max(1, ...values.filter(Number.isFinite));
  const n = values.length; const bw = w / n;
  g.font = '9px ui-monospace, monospace'; g.textAlign = 'center';
  values.forEach((v, i) => {
    const x = i * bw;
    if (Number.isFinite(v)) {
      const bh = (v / max) * (h - padB - padT);
      g.fillStyle = o.colorFn ? o.colorFn(v, i) : (o.color ?? css('--accent', '#f5d90a'));
      g.fillRect(x + bw * 0.15, h - padB - bh, bw * 0.7, bh);
      if (o.showValues) { g.fillStyle = css('--text', '#ddd'); g.fillText(o.showValues(v), x + bw / 2, h - padB - bh - 2); }
    }
    if (o.labels && (n < 13 || i % Math.ceil(n / 12) === 0)) { g.fillStyle = css('--muted', '#789'); g.fillText(o.labels[i], x + bw / 2, h - 4); }
  });
  g.textAlign = 'left';
}

/** Colour ramp blue → yellow → orange → red for 0..100. */
export function heatColor(v) {
  const stops = [[0, [40, 90, 200]], [35, [70, 170, 220]], [60, [245, 217, 10]], [80, [255, 140, 30]], [100, [235, 50, 40]]];
  const x = Math.max(0, Math.min(100, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, ca] = stops[i - 1]; const [b, cb] = stops[i];
      const t = (x - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(',')})`;
    }
  }
  return 'rgb(235,50,40)';
}

/**
 * Heat strip: one cell per value, coloured by intensity.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {number[]} values 0..100 (NaN = unvisited).
 */
export function heatStrip(canvas, values) {
  const { g, w, h } = prep(canvas);
  const n = values.length; const cw = w / n;
  values.forEach((v, i) => {
    g.fillStyle = Number.isFinite(v) ? heatColor(v) : css('--panel-2', '#1a1f27');
    g.fillRect(i * cw, 0, cw + 0.5, h);
  });
}
