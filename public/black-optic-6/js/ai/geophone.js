/**
 * A phone on the ground as a geophone.
 *
 * A phone's accelerometer, laid flat on a fence post footing or a gate pillar,
 * is a poor but real vibration sensor: 50–100 samples a second, about a
 * milli-g of noise. Seismologists have triggered on that kind of signal for
 * fifty years with STA/LTA — the ratio of a short-term average of energy to a
 * long-term average. A footstep, a hoof or a truck makes the short window
 * jump while the long window still remembers the quiet.
 *
 * After a trigger, two numbers describe the event: its dominant frequency and,
 * for walking, its cadence — people step at about 1.5–2.5 Hz, and that rhythm
 * shows in the autocorrelation of the energy envelope. A vehicle is long and
 * continuous; an impact (a dropped gate, a kick) is over in half a second.
 * The classification is a Modelled guess from those numbers, and says so.
 *
 * Geophones proper (an SM-24 on an ADC, read over Web Serial) feed the same
 * code; only the sample rate changes.
 *
 * @module black-optic-6/ai/geophone
 */

/** Classic trigger thresholds (Allen 1978; Trnkoczy, NMSOP). */
export const ON_RATIO = 3;
export const OFF_RATIO = 1.5;

/**
 * Remove gravity and drift with a one-pole high-pass filter.
 *
 * @param {ArrayLike<number>} x Samples.
 * @param {number} fs Sample rate, Hz.
 * @param {number} [cutoffHz=0.5]
 * @returns {Float64Array}
 */
export function highPass(x, fs, cutoffHz = 0.5) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const a = rc / (rc + 1 / fs);
  const y = new Float64Array(x.length);
  for (let i = 1; i < x.length; i += 1) y[i] = a * (y[i - 1] + x[i] - x[i - 1]);
  return y;
}

/**
 * Recursive STA/LTA on squared amplitude.
 *
 * @param {ArrayLike<number>} x High-passed samples.
 * @param {number} fs Sample rate.
 * @param {number} [staSec=0.25]
 * @param {number} [ltaSec=8]
 * @returns {Float64Array} Ratio per sample (0 until the LTA has warmed up).
 */
export function staLta(x, fs, staSec = 0.25, ltaSec = 8) {
  const ns = Math.max(1, Math.round(staSec * fs));
  const nl = Math.max(ns + 1, Math.round(ltaSec * fs));
  const cs = 1 / ns; const cl = 1 / nl;
  const out = new Float64Array(x.length);
  let sta = 0; let lta = 0;
  for (let i = 0; i < x.length; i += 1) {
    const e = x[i] * x[i];
    sta += cs * (e - sta);
    lta += cl * (e - lta);
    out[i] = i >= nl && lta > 0 ? sta / lta : 0;
  }
  return out;
}

/**
 * Trigger windows from a ratio trace: on above `on`, off below `off`.
 *
 * @returns {{start: number, end: number, peak: number}[]} Sample indices.
 */
export function triggers(ratio, on = ON_RATIO, off = OFF_RATIO) {
  const out = [];
  let open = null;
  for (let i = 0; i < ratio.length; i += 1) {
    if (!open && ratio[i] >= on) open = { start: i, end: i, peak: ratio[i] };
    else if (open) {
      if (ratio[i] > open.peak) open.peak = ratio[i];
      if (ratio[i] < off) { open.end = i; out.push(open); open = null; }
    }
  }
  if (open) { open.end = ratio.length - 1; out.push(open); }
  return out;
}

/**
 * Dominant frequency by a direct DFT scan (fine for a few hundred samples).
 *
 * @returns {number} Hz of the largest-magnitude bin above `minHz`.
 */
export function dominantHz(x, fs, minHz = 0.8) {
  const n = x.length;
  let best = 0; let bestK = 0;
  const kMin = Math.max(1, Math.ceil((minHz * n) / fs));
  for (let k = kMin; k <= n >> 1; k += 1) {
    let re = 0; let im = 0;
    const w = (-2 * Math.PI * k) / n;
    for (let i = 0; i < n; i += 1) { re += x[i] * Math.cos(w * i); im += x[i] * Math.sin(w * i); }
    const m = re * re + im * im;
    if (m > best) { best = m; bestK = k; }
  }
  return (bestK * fs) / n;
}

/**
 * Cadence of a pulse train: the strongest autocorrelation peak of the
 * mean-removed energy envelope between minHz and maxHz.
 *
 * @returns {{hz: number, strength: number}} strength is the normalised autocorrelation (−1…1).
 */
export function cadence(x, fs, minHz = 1.2, maxHz = 3) {
  const env = Array.from(x, (v) => v * v);
  const mean = env.reduce((s, v) => s + v, 0) / (env.length || 1);
  const e = env.map((v) => v - mean);
  const r0 = e.reduce((s, v) => s + v * v, 0);
  if (!(r0 > 0)) return { hz: 0, strength: 0 };
  let best = { hz: 0, strength: -Infinity };
  const lagMin = Math.max(1, Math.floor(fs / maxHz));
  const lagMax = Math.min(e.length - 1, Math.ceil(fs / minHz));
  for (let lag = lagMin; lag <= lagMax; lag += 1) {
    let r = 0;
    for (let i = 0; i + lag < e.length; i += 1) r += e[i] * e[i + lag];
    // Unbiased: normalise by the overlap so long lags are not penalised.
    const strength = (r / (e.length - lag)) / (r0 / e.length);
    if (strength > best.strength) best = { hz: fs / lag, strength };
  }
  return best;
}

/**
 * Duty cycle: fraction of the window whose 0.1 s energy envelope is above a
 * quarter of its peak.
 */
export function dutyCycle(x, fs) {
  const w = Math.max(1, Math.round(0.1 * fs));
  const env = new Float64Array(x.length);
  let acc = 0;
  for (let i = 0; i < x.length; i += 1) {
    acc += x[i] * x[i];
    if (i >= w) acc -= x[i - w] * x[i - w];
    env[i] = acc / Math.min(i + 1, w);
  }
  let peak = 0;
  for (const e of env) if (e > peak) peak = e;
  if (!(peak > 0)) return 0;
  let on = 0;
  for (const e of env) if (e > peak / 4) on += 1;
  return on / env.length;
}

/**
 * Name an event from its numbers. Modelled.
 *
 * @param {{durationSec: number, cadenceHz: number, cadenceStrength: number, dominantHz: number, duty?: number}} f
 *   duty is the share of the event the shaking is "on" — footsteps are pulses
 *   with quiet between them (low duty); an engine never lets up (high duty).
 * @returns {{label: string, why: string}}
 */
export function classify({ durationSec, cadenceHz, cadenceStrength, dominantHz: hz, duty = 0 }) {
  if (durationSec >= 2 && duty < 0.5 && cadenceStrength >= 0.3 && cadenceHz >= 1.3 && cadenceHz <= 2.7) {
    return { label: 'footsteps', why: `a ${cadenceHz.toFixed(2)} Hz rhythm (people walk at 1.5–2.5 steps a second) held for ${durationSec.toFixed(1)} s` };
  }
  if (durationSec >= 4 && duty >= 0.5) {
    return { label: 'vehicle or machinery', why: `continuous shaking for ${durationSec.toFixed(1)} s with no walking rhythm, dominant ${hz.toFixed(1)} Hz` };
  }
  const activeSec = duty * durationSec;
  if (activeSec < 0.6) {
    return { label: 'impact', why: `shaking for only ${activeSec.toFixed(2)} s — a dropped gate, a kick, a hoof` };
  }
  return { label: 'unclassified vibration', why: `${durationSec.toFixed(1)} s at ${hz.toFixed(1)} Hz fits none of the patterns` };
}

/**
 * Analyse a buffer end to end: high-pass, STA/LTA, triggers, then features
 * for each trigger window.
 *
 * @param {ArrayLike<number>} samples Acceleration magnitude (any units).
 * @param {number} fs Sample rate.
 */
export function analyse(samples, fs, options = {}) {
  const x = highPass(samples, fs);
  const ratio = staLta(x, fs, options.staSec, options.ltaSec);
  // Footsteps arrive as separate pulses; join pulses less than a second apart
  // into one event so their rhythm can be measured.
  const gap = Math.round((options.mergeSec ?? 1) * fs);
  const merged = [];
  for (const t of triggers(ratio, options.on, options.off)) {
    const last = merged[merged.length - 1];
    if (last && t.start - last.end <= gap) { last.end = t.end; last.peak = Math.max(last.peak, t.peak); last.pulses += 1; }
    else merged.push({ ...t, pulses: 1 });
  }
  return merged.map((t) => {
    const seg = x.slice(t.start, t.end + 1);
    const c = cadence(seg, fs);
    const durationSec = seg.length / fs;
    const f = { durationSec, cadenceHz: c.hz, cadenceStrength: c.strength, dominantHz: dominantHz(seg, fs), duty: dutyCycle(seg, fs) };
    return { ...t, ...f, ...classify(f) };
  });
}
