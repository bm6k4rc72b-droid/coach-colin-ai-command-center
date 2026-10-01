// VANGUARD · the skin scan: remote photoplethysmography (rPPG).
//
// Each heartbeat pushes blood into the skin's capillaries, which absorb slightly more green light,
// so the average colour of facial skin flickers by ~0.1–0.5 % at the pulse rate. We average R, G, B
// over a face region every frame and recover the pulse with the CHROM method (de Haan & Jeanne 2013):
//   r̂ = R/mean(R), ĝ = G/mean(G), b̂ = B/mean(B)
//   X = 3r̂ − 2ĝ,   Y = 1.5r̂ + ĝ − 1.5b̂,   both band-passed to 0.7–3.0 Hz (42–180 bpm)
//   S = X − α·Y,   α = σ(X)/σ(Y)          (cancels most motion and lighting changes)
// Heart rate = the spectral peak (parabolic interpolation between FFT bins).
// Beat-to-beat intervals from the peaks of S give RMSSD = √(mean (IBIₙ₊₁ − IBIₙ)²), a standard
// index of parasympathetic (vagal) activity.
//
// Camera rPPG is noisy: the SNR is reported, and the app treats the result as an estimate only.

export const FS = 30;          // resampling rate (Hz)

// Resample irregular samples [{t (s), r, g, b}] to a uniform grid by linear interpolation.
export function resample(samples, fs = FS) {
  if (samples.length < 2) return { r: [], g: [], b: [] };
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t, n = Math.floor((t1 - t0) * fs), out = { r: new Float64Array(n), g: new Float64Array(n), b: new Float64Array(n) };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs; while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j], c = samples[j + 1], u = c.t > a.t ? (t - a.t) / (c.t - a.t) : 0;
    out.r[i] = a.r + (c.r - a.r) * u; out.g[i] = a.g + (c.g - a.g) * u; out.b[i] = a.b + (c.b - a.b) * u;
  }
  return out;
}

// Radix-2 FFT (in place, real + imaginary arrays).
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const nextPow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

// Zero-phase band-pass by FFT masking (mean removed, Hann-tapered edges).
export function bandpass(x, lo = 0.7, hi = 3.0, fs = FS) {
  const n = x.length, N = nextPow2(n), re = new Float64Array(N), im = new Float64Array(N);
  let m = 0; for (let i = 0; i < n; i++) m += x[i]; m /= n;
  for (let i = 0; i < n; i++) re[i] = x[i] - m;
  fft(re, im);
  for (let k = 0; k < N; k++) { const f = (Math.min(k, N - k) * fs) / N; if (f < lo || f > hi) { re[k] = 0; im[k] = 0; } }
  // Inverse FFT via conjugation.
  for (let k = 0; k < N; k++) im[k] = -im[k];
  fft(re, im);
  const y = new Float64Array(n); for (let i = 0; i < n; i++) y[i] = re[i] / N;
  return y;
}
const std = (x) => { let m = 0; for (const v of x) m += v; m /= x.length; let s = 0; for (const v of x) s += (v - m) ** 2; return Math.sqrt(s / x.length); };

export function chrom({ r, g, b }) {
  const n = r.length, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, mr = mean(r), mg = mean(g), mb = mean(b);
  const X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { const rn = r[i] / mr, gn = g[i] / mg, bn = b[i] / mb; X[i] = 3 * rn - 2 * gn; Y[i] = 1.5 * rn + gn - 1.5 * bn; }
  const Xf = bandpass(X), Yf = bandpass(Y), alpha = std(Xf) / (std(Yf) || 1), S = new Float64Array(n);
  for (let i = 0; i < n; i++) S[i] = Xf[i] - alpha * Yf[i];
  return S;
}

// Power spectrum → HR (bpm) with parabolic peak interpolation, and SNR (dB): power within
// ±0.1 Hz of the fundamental and first harmonic vs. the rest of the 0.7–3 Hz band.
export function spectrum(S, fs = FS) {
  const N = nextPow2(S.length * 4), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < S.length; i++) re[i] = S[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (S.length - 1)));
  fft(re, im);
  const pw = [], df = fs / N;
  for (let k = 0; k < N / 2; k++) pw.push(re[k] * re[k] + im[k] * im[k]);
  const k0 = Math.ceil(0.7 / df), k1 = Math.floor(3.0 / df); let kp = k0;
  for (let k = k0; k <= k1; k++) if (pw[k] > pw[kp]) kp = k;
  const a = pw[kp - 1], b = pw[kp], c = pw[kp + 1], d = (a - c) / (2 * (a - 2 * b + c) || 1), fp = (kp + d) * df;
  let sig = 0, tot = 0;
  for (let k = k0; k <= k1; k++) { const f = k * df; tot += pw[k]; if (Math.abs(f - fp) < 0.1 || Math.abs(f - 2 * fp) < 0.1) sig += pw[k]; }
  const snr = 10 * Math.log10(sig / Math.max(1e-12, tot - sig));
  const curve = []; for (let k = k0; k <= k1; k++) curve.push([k * df * 60, pw[k]]);
  return { hr: fp * 60, snr, curve, peak: b };
}

// Beat detection: local maxima of S at least 0.6·(60/HR) s apart, refined by parabola; IBIs within
// ±30 % of the median kept (ectopic/noise rejection); RMSSD over successive kept intervals.
export function beats(S, hr, fs = FS) {
  const minGap = Math.floor(0.6 * (60 / hr) * fs), peaks = [];
  for (let i = 1; i < S.length - 1; i++) {
    if (S[i] > S[i - 1] && S[i] >= S[i + 1] && S[i] > 0) {
      const last = peaks[peaks.length - 1];
      if (last === undefined || i - last.i >= minGap) peaks.push({ i, v: S[i] }); else if (S[i] > last.v) peaks[peaks.length - 1] = { i, v: S[i] };
    }
  }
  const t = peaks.map(({ i }) => { const a = S[i - 1], b = S[i], c = S[i + 1]; return (i + (a - c) / (2 * (a - 2 * b + c) || 1)) / fs; });
  const ibi = []; for (let k = 1; k < t.length; k++) ibi.push((t[k] - t[k - 1]) * 1000);
  const med = [...ibi].sort((x, y) => x - y)[ibi.length >> 1] || 0, ok = ibi.map((v) => Math.abs(v - med) <= 0.3 * med);
  let ss = 0, n = 0; for (let k = 1; k < ibi.length; k++) if (ok[k] && ok[k - 1]) { ss += (ibi[k] - ibi[k - 1]) ** 2; n++; }
  return { t, ibi, rmssd: n ? Math.sqrt(ss / n) : NaN, kept: ok.filter(Boolean).length };
}

export function analyse(samples) {
  const R = resample(samples); if (R.r.length < FS * 8) return null;
  // Beats are timed on a narrower band (f₀ ± 0.6 Hz) that still keeps the breathing side-bands.
  const S = chrom(R), sp = spectrum(S), f0 = sp.hr / 60, Sn = bandpass(S, Math.max(0.6, f0 - 0.6), f0 + 0.6), bt = beats(Sn, sp.hr);
  return { ...sp, ...bt, S: Sn, seconds: R.r.length / FS };
}

// Synthetic skin signal for the demo scan (and tests): a pulse with respiratory sinus arrhythmia
// (HR swings with breathing — this is what RMSSD measures), plus lighting drift and sensor noise.
export function synth({ seconds = 30, hr = 62, rsa = 6, breath = 0.22, noise = 0.6, seed = 3 } = {}) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  const out = []; let phase = 0;
  for (let i = 0; i < seconds * FS; i++) {
    const t = i / FS, f = (hr + rsa * Math.sin(2 * Math.PI * breath * t)) / 60; phase += 2 * Math.PI * f / FS;
    const pulse = Math.sin(phase) + 0.35 * Math.sin(2 * phase - 0.8), drift = 2 * Math.sin(0.05 * t) + 0.8 * Math.sin(0.31 * t);
    out.push({ t, r: 150 + drift + 0.35 * pulse + noise * rnd(), g: 105 + drift + 0.9 * pulse + noise * rnd(), b: 90 + drift + 0.25 * pulse + noise * rnd() });
  }
  return out;
}
