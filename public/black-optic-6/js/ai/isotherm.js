/**
 * Automatic isotherm: let the frame choose its own "hot" threshold, then find
 * the hot blobs.
 *
 * The thermal panel's isotherm used to need typed Low/High numbers. Otsu's
 * method (1979) picks the threshold that best separates a histogram into two
 * classes — it maximises the between-class variance σ²_B(k) = ω₀ω₁(μ₀ − μ₁)²,
 * which is the same as minimising the variance inside each class. On a
 * thermal frame with a warm animal against cool grass, that lands in the gap
 * between them. Otsu also reports how separable the frame was, η = σ²_B/σ²_T
 * (0–1); a low η means there is no distinct hot mode and the panel says so
 * instead of highlighting noise.
 *
 * Hot regions are then the 4-connected components above the threshold
 * (two-pass labelling with union–find).
 *
 * The field is whatever the thermal panel is ramping: true radiometric
 * temperature from a PureThermal/Lepton only where the browser can get the
 * 16-bit stream (it usually cannot — UVC in a browser arrives as 8-bit AGC
 * video), otherwise brightness. The labels on the panel follow the source.
 *
 * @module black-optic-6/ai/isotherm
 */

/**
 * Otsu's threshold over values in [0, 1].
 *
 * @param {ArrayLike<number>} field
 * @param {number} [bins=256]
 * @returns {{threshold: number, separability: number, hotFraction: number}}
 */
export function otsu(field, bins = 256) {
  const hist = new Float64Array(bins);
  let n = 0;
  for (let i = 0; i < field.length; i += 1) {
    const v = field[i];
    if (!Number.isFinite(v)) continue;
    hist[Math.min(bins - 1, Math.max(0, Math.floor(v * bins)))] += 1;
    n += 1;
  }
  if (!n) return { threshold: NaN, separability: 0, hotFraction: 0 };
  let sumAll = 0;
  for (let k = 0; k < bins; k += 1) sumAll += k * hist[k];
  const mu = sumAll / n;
  let varT = 0;
  for (let k = 0; k < bins; k += 1) varT += hist[k] * (k - mu) ** 2;
  varT /= n;
  // σ²_B for every split; when an empty gap makes several splits tie, take
  // the middle of the gap rather than hugging the cool class.
  const between = new Float64Array(bins);
  let w0 = 0; let sum0 = 0; let best = -1;
  for (let k = 0; k < bins - 1; k += 1) {
    w0 += hist[k]; sum0 += k * hist[k];
    const w1 = n - w0;
    if (!w0 || !w1) continue;
    const m0 = sum0 / w0; const m1 = (sumAll - sum0) / w1;
    between[k] = (w0 / n) * (w1 / n) * (m0 - m1) ** 2;
    if (between[k] > best) best = between[k];
  }
  let first = -1; let last = -1;
  for (let k = 0; k < bins - 1; k += 1) {
    if (best - between[k] <= 1e-12 * best) { if (first < 0) first = k; last = k; } else if (first >= 0) break;
  }
  const bestK = Math.round((first + last) / 2);
  let hot = 0;
  for (let k = bestK + 1; k < bins; k += 1) hot += hist[k];
  return { threshold: (bestK + 1) / bins, separability: varT > 0 ? best / varT : 0, hotFraction: hot / n };
}

/**
 * Connected regions at or above a threshold.
 *
 * @returns {{box: number[], area: number, peak: number, mean: number, centroid: number[]}[]}
 *   Largest first.
 */
export function hotspots(field, width, height, threshold, minArea = 4) {
  const labels = new Int32Array(width * height);
  const parent = [0];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  let next = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!(field[i] >= threshold)) continue;
      const left = x > 0 ? labels[i - 1] : 0;
      const up = y > 0 ? labels[i - width] : 0;
      if (!left && !up) { labels[i] = next; parent.push(next); next += 1; } else if (left && up) {
        const a = find(left); const b = find(up);
        labels[i] = Math.min(a, b);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      } else labels[i] = left || up;
    }
  }
  const regions = new Map();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!labels[i]) continue;
      const root = find(labels[i]);
      let r = regions.get(root);
      if (!r) { r = { x0: x, y0: y, x1: x, y1: y, area: 0, sum: 0, peak: -Infinity, sx: 0, sy: 0 }; regions.set(root, r); }
      r.area += 1; r.sum += field[i]; r.sx += x; r.sy += y;
      if (field[i] > r.peak) r.peak = field[i];
      if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
    }
  }
  return [...regions.values()].filter((r) => r.area >= minArea).map((r) => ({
    box: [r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1], area: r.area, peak: r.peak, mean: r.sum / r.area, centroid: [r.sx / r.area, r.sy / r.area],
  })).sort((a, b) => b.area - a.area);
}

/**
 * The isotherm the panel should use, with its honesty sentence.
 *
 * @returns {{low: number, high: number, usable: boolean, note: string, separability: number}}
 */
export function autoIsotherm(field) {
  const o = otsu(field);
  // A single Gaussian scores 2/π ≈ 0.64 and a flat histogram 0.75: demand more.
  const usable = o.separability >= 0.85 && o.hotFraction > 0 && o.hotFraction < 0.5;
  return {
    low: o.threshold,
    high: 1,
    usable,
    separability: o.separability,
    note: usable
      ? `Otsu threshold ${o.threshold.toFixed(3)}: ${(o.hotFraction * 100).toFixed(1)}% of the frame is in the hot class; separability η = ${o.separability.toFixed(2)}.`
      : `No distinct hot mode (η = ${o.separability.toFixed(2)}, hot share ${(o.hotFraction * 100).toFixed(0)}%) — highlighting it would be highlighting noise.`,
  };
}
