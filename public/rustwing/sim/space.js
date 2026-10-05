// RUSTWING · the physics behind every number on screen.

export const c = 299792458, G = 6.6743e-11, g0 = 9.80665, Msun = 1.98892e30;
export const LY = 9.4607304725808e15, PC = 3.0856775814913673e16, AU = 1.495978707e11, YR = 3.15576e7, MPC = 1e6 * PC;

// ── 1 · HANGAR: rockets and relativity ──────────────────────────────────────────
// Relativistic rocket equation: rapidity change Δφ = (v_e/c)·ln(m₀/m_f), Δv = c·tanh(Δφ) (→ v_e ln R when slow).
// A constant proper acceleration a, flipping at the midpoint (Rindler 1960; Baez's "relativistic rocket"):
//   ship time τ = (2c/a)·acosh(1 + a·d/(2c²)), Earth time t = (2c/a)·sinh(a·τ/(2c)), peak γ = 1 + a·d/(2c²).
// The mass ratio needed for that trip: R = exp(2·acosh(γ_peak)·c/v_e).
export const ENGINES = { chem: 4400, ion: 30e3, fusion: 0.035 * c, photon: c };
export function rocketDv(ve, R) { return c * Math.tanh((ve / c) * Math.log(R)); }
export function trip(dLy, aG, ve) {
  const a = aG * g0, d = dLy * LY, k = (a * d) / (2 * c * c), gamma = 1 + k, phi = Math.acosh(gamma), tau = ((2 * c) / a) * phi, t = ((2 * c) / a) * Math.sinh(phi);
  const lnR = (2 * phi * c) / ve;
  return { tau: tau / YR, t: t / YR, gamma, vmax: Math.tanh(phi), lnR, R: Math.exp(Math.min(700, lnR)) };
}
// Proper-time curve for the chart: (Earth years, ship years) along the trip.
export function tripCurve(dLy, aG) { const a = aG * g0, d = dLy * LY, phi = Math.acosh(1 + (a * d) / (2 * c * c)), pts = []; for (let i = 0; i <= 60; i++) { const p = (phi * i) / 60, tE = ((c / a) * Math.sinh(p)) / YR, tS = ((c / a) * p) / YR; pts.push([tE, tS]); } const T = pts[60]; for (let i = 59; i >= 0; i--) pts.push([2 * T[0] - pts[i][0], 2 * T[1] - pts[i][1]]); return pts; }

// ── 2 · HYPERSPACE: faster than light, on paper ─────────────────────────────────
// Effective speed of the hyperdrive k·c (fiction). Alcubierre (1994) found a spacetime that moves a bubble
// faster than light, but it needs negative energy. Order-of-magnitude scaling of the energy required:
//   |E| ~ (c⁴/G)·(v/c)²·R²/Δ   (bubble radius R, wall thickness Δ; Pfenning & Ford 1997 show Δ must be tiny).
// A "mass shadow": the jump needs the local gravity below g_th = 10⁻³ m/s², so r_j = √(GM/g_th).
export const DEST = { proxima: 4.2465, sirius: 8.6, vega: 25.04, kepler452: 1800, center: 26000, andromeda: 2.537e6 };
export const G_TH = 1e-3;
export const shadow = (Mkg) => Math.sqrt((G * Mkg) / G_TH);
export function warp({ k, R, D }) { const E = ((c ** 4) / G) * k * k * (R * R) / D; return { E, kg: E / (c * c), suns: E / (c * c) / Msun }; }
export function jump(dLy, k) { const s = (dLy * LY) / (k * c); return { s, h: s / 3600, d: s / 86400 }; }

// ── 3 · BLACK HOLE ──────────────────────────────────────────────────────────────
// Schwarzschild radius r_s = 2GM/c². Photon sphere 1.5 r_s; innermost stable circular orbit (ISCO) 3 r_s.
// Circular orbit at r = x·r_s: clock rate dτ/dt = √(1 − 1.5/x); period (far clock) T = 2π√(r³/GM);
// speed measured locally v/c = 1/√(2(x − 1)); tidal stretch over length L: Δa = 2GML/r³.
export function hole(Msol, x, L = 30) {
  const M = Msol * Msun, rs = (2 * G * M) / (c * c), r = x * rs, rate = x > 1.5 ? Math.sqrt(1 - 1.5 / x) : 0;
  return { rs, r, rate, slow: rate ? 1 / rate : Infinity, T: 2 * Math.PI * Math.sqrt(r ** 3 / (G * M)), v: x > 1 ? 1 / Math.sqrt(2 * (x - 1)) : 1, tidal: (2 * G * M * L) / r ** 3, stable: x >= 3, z: 1 / Math.sqrt(1 - 1 / x) - 1, shadowR: (3 * Math.sqrt(3)) / 2 * rs };
}
export const HOLES = { stellar: 10, sgr: 4.3e6, m87: 6.5e9 };

// ── 4 · MERGER: gravitational waves ─────────────────────────────────────────────
// Chirp mass M_c = (m₁m₂)^{3/5}/(m₁+m₂)^{1/5}. Leading order (Peters & Mathews 1963 / quadrupole formula):
//   time to merger from frequency f: τ = (5/256)·(GM_c/c³)^{−5/3}·(πf)^{−8/3}
//   strain h = (4/d)·(GM_c/c²)^{5/3}·(πf/c)^{2/3}; the inspiral ends near f_ISCO = c³/(6^{3/2}·π·G·M).
// Final hole ≈ 95 % of the total mass (≈ 5 % radiated, as in GW150914); ringdown frequency from Berti et al.
// 2006 with spin a ≈ 0.67: f = 0.5226·c³/(2πGM_f).
export function chirp(m1, m2, dMpc) {
  const M = (m1 + m2) * Msun, Mc = (Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2)) * Msun, d = dMpc * MPC, tc = (G * Mc) / c ** 3;
  const fisco = c ** 3 / (6 ** 1.5 * Math.PI * G * M), tau20 = (5 / 256) * tc ** (-5 / 3) * (Math.PI * 20) ** (-8 / 3);
  const h = (f) => (4 / d) * ((G * Mc) / (c * c)) ** (5 / 3) * ((Math.PI * f) / c) ** (2 / 3), Mf = 0.95 * (m1 + m2), fring = (0.5226 * c ** 3) / (2 * Math.PI * G * Mf * Msun);
  const Erad = 0.05 * (m1 + m2) * Msun * c * c;
  return { Mc: Mc / Msun, fisco, tau20, hpeak: h(fisco), h, Mf, fring, Erad, tc };
}
// A waveform sample for the chart and the audio: frequency follows f(τ) = (1/π)(5/(256τ))^{3/8}(GM_c/c³)^{−5/8}.
export function waveform(m1, m2, dMpc, span = 0.25, n = 1200) {
  const C = chirp(m1, m2, dMpc), pts = [], fOf = (tau) => (1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(C.tc, -5 / 8);
  let tauIsco = (5 / 256) * C.tc ** (-5 / 3) * (Math.PI * C.fisco) ** (-8 / 3), phase = 0, last = 0, hl = 0;
  for (let i = 0; i <= n; i++) {
    const t = -span + (span * 1.15 * i) / n, dt = (span * 1.15) / n;
    let f, h;
    if (t < 0) { const tau = -t + tauIsco; f = Math.min(C.fisco, fOf(tau)); h = C.h(f); hl = h; }
    else { f = C.fring; h = hl * Math.exp(-t * C.fring * 0.9); }
    phase += 2 * Math.PI * f * dt; pts.push([t, h * Math.cos(phase), f]); last = f;
  }
  return { pts, C, last };
}

// ── 5 · THE RUN: threading a black-hole cluster ─────────────────────────────────
// Hyperspace lanes are drawn on a map in parsecs. Every hole casts a mass shadow r_j = √(GM/g_th); a route
// segment that enters one pulls the ship out of hyperspace. The shortest legal path wins.
export const RUN = {
  start: [0, 0], end: [11.2, 0],
  holes: [[3.3, 0.35, 5e9], [5.9, -1.05, 1.4e10], [7.9, 1.1, 7e9], [5.3, 2.35, 9e9], [9.3, -0.75, 3e9], [2.9, -1.95, 6e9]],
};
export const runShadowPc = (Msol) => shadow(Msol * Msun) / PC;
function segDist(p, a, b) { const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1], L2 = vx * vx + vy * vy, t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)); return Math.hypot(wx - t * vx, wy - t * vy); }
export function route(wps) {
  const pts = [RUN.start, ...wps, RUN.end]; let L = 0, clear = Infinity, hit = -1;
  for (let i = 0; i < pts.length - 1; i++) { L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    RUN.holes.forEach(([x, y, m], j) => { const m2 = segDist([x, y], pts[i], pts[i + 1]) - runShadowPc(m); if (m2 < clear) { clear = m2; if (m2 < 0) hit = j; } }); }
  return { L, clear, ok: clear >= 0, hit, ly: L * (PC / LY) };
}
