// VOIDFRAME · galaxy, vacuum, gravity and the senses. Every number on screen comes from these models.

export const G = 6.6743e-11, kB = 1.380649e-23, g0 = 9.80665, Msun = 1.98892e30, KPC = 3.0857e19, sigmaSB = 5.670374e-8;

// ── 1 · GALAXY: what holds it together ──────────────────────────────────────────
// Visible matter: a bulge (Hernquist, M_b = 1.5×10¹⁰ M☉, a = 0.6 kpc) and an exponential disk (M_d = 5×10¹⁰ M☉,
// scale length R_d = 2.6 kpc; spherical approximation of the enclosed mass). Dark matter: a pseudo-isothermal
// halo with v_h²(r) = v₀²·(1 − (r_c/r)·atan(r/r_c)). Circular speed v² = v_b² + v_d² + f·v_h².
export const MW = { Mb: 1.5e10, ab: 0.6, Md: 5e10, Rd: 2.6, v0: 230, rc: 4, sun: 8.2, vsun: 230 };
export function vcirc(rk, f = 1) {
  const r = Math.max(rk, 0.05), Mb = (MW.Mb * r * r) / ((r + MW.ab) ** 2), x = r / MW.Rd, Md = MW.Md * (1 - (1 + x) * Math.exp(-x));
  const vb2 = (G * Mb * Msun) / (r * KPC) / 1e6, vd2 = (G * Md * Msun) / (r * KPC) / 1e6, vh2 = MW.v0 ** 2 * (1 - (MW.rc / r) * Math.atan(r / MW.rc));
  return { v: Math.sqrt(vb2 + vd2 + f * vh2), vis: Math.sqrt(vb2 + vd2), halo: Math.sqrt(vh2) };
}
// Observed rotation (approximate, Milky Way compilations): roughly flat near 220–235 km/s from 5 to 20 kpc.
export const OBS = [[2, 200], [4, 225], [6, 230], [8.2, 230], [10, 228], [12, 226], [15, 222], [18, 220], [20, 218]];
export const galYear = (rk, v) => ((2 * Math.PI * rk * KPC) / (v * 1e3)) / 3.156e13;   // Myr

// ── 2 · VACUUM ──────────────────────────────────────────────────────────────────
// US Standard Atmosphere 1976 up to 86 km (lapse-rate layers), then measured number densities, then space.
const LAY = [[0, 288.15, -6.5, 101325], [11, 216.65, 0, 22632.1], [20, 216.65, 1, 5474.89], [32, 228.65, 2.8, 868.019], [47, 270.65, 0, 110.906], [51, 270.65, -2.8, 66.9389], [71, 214.65, -2, 3.95642]];
export function atmo(hkm) {
  if (hkm <= 86) {
    let L = LAY[0]; for (const l of LAY) if (hkm >= l[0]) L = l;
    const [h0, T0, lap, p0] = L, dh = hkm - h0, T = T0 + lap * dh, M = 0.0289644, R = 8.3144598, gg = 9.80665;
    const p = lap === 0 ? p0 * Math.exp((-gg * M * dh * 1000) / (R * T0)) : p0 * Math.pow(T0 / T, (gg * M) / (R * lap / 1000));
    return { p, T, n: p / (kB * T) };
  }
  // Above 86 km: log-interpolate representative number densities (m⁻³) and temperatures.
  const tab = [[86, 1.45e20, 187], [100, 1.2e19, 195], [150, 5.0e16, 634], [200, 7.3e15, 855], [300, 6.0e14, 976], [400, 1.0e14, 996], [600, 7.0e12, 1000], [1000, 3.0e11, 1000]];
  let i = 0; while (i < tab.length - 2 && hkm > tab[i + 1][0]) i++;
  const [h1, n1, T1] = tab[i], [h2, n2, T2] = tab[i + 1], k = Math.min(1, (hkm - h1) / (h2 - h1)), n = Math.exp(Math.log(n1) + k * (Math.log(n2) - Math.log(n1))), T = T1 + k * (T2 - T1);
  return { p: n * kB * T, T, n };
}
// Places beyond the atmosphere: number density n (m⁻³) and kinetic temperature T (K).
export const PLACES = { sea: { h: 0 }, everest: { h: 8.849 }, armstrong: { h: 19 }, karman: { h: 100 }, iss: { h: 410 }, wind: { n: 5e6, T: 1.2e5 }, ism: { n: 1e6, T: 8000 }, igm: { n: 0.2, T: 1e6 } };
export function place(k) { const P = PLACES[k]; if (P.h !== undefined) return { ...atmo(P.h), h: P.h }; return { n: P.n, T: P.T, p: P.n * kB * P.T }; }
// Mean free path λ = 1/(√2·π·d²·n), molecular diameter d ≈ 3.7×10⁻¹⁰ m (air). Water boils when its vapour pressure
// equals the ambient pressure (Antoine: log₁₀P[mmHg] = 8.07131 − 1730.63/(233.426 + T)).
export const mfp = (n) => 1 / (Math.SQRT2 * Math.PI * (3.7e-10) ** 2 * n);
export function boil(p) { const mm = p / 133.322; if (mm <= 0) return -Infinity; return 1730.63 / (8.07131 - Math.log10(mm)) - 233.426; }
// A sphere in sunlight at distance d (AU), albedo a: radiative equilibrium T = (S(1 − a)/(4σ))^¼, S = 1361 W/m²/d².
export const sunT = (dAU = 1, a = 0.3) => Math.pow((1361 / (dAU * dAU)) * (1 - a) / (4 * sigmaSB), 0.25);
export const CMB = 2.7255;

// ── 3 · GRAVITY SHAPES EVERYTHING ───────────────────────────────────────────────
// A body turns round when its self-gravity crushes its own strength. Central pressure of a uniform sphere
// P_c = (2π/3)·G·ρ²·R²; setting P_c = σ (yield strength) gives the "potato radius" R_p = √(3σ/(2πGρ²)).
// The tallest mountain a planet supports: h ≈ σ/(ρ·g). Kepler: T = 2π√(a³/GM).
export const MAT = { rock: { rho: 3000, sigma: 2.0e8 }, ice: { rho: 1000, sigma: 4.0e6 }, iron: { rho: 7800, sigma: 5e8 } };   // effective long-term strengths (order of magnitude)
export const potato = (m) => Math.sqrt((3 * MAT[m].sigma) / (2 * Math.PI * G * MAT[m].rho ** 2));
export const BODIES = { hyperion: { R: 135e3, m: 'ice', round: false }, mimas: { R: 198e3, m: 'ice', round: true }, vesta: { R: 263e3, m: 'rock', round: false }, ceres: { R: 470e3, m: 'rock', round: true }, moon: { R: 1737e3, m: 'rock', round: true } };
export function body(Rm, m) { const M = MAT[m], mass = (4 / 3) * Math.PI * Rm ** 3 * M.rho, g = (G * mass) / Rm ** 2, Pc = (2 * Math.PI / 3) * G * M.rho ** 2 * Rm ** 2, Rp = potato(m); return { mass, g, Pc, Rp, ratio: Pc / M.sigma, hmax: M.sigma / (M.rho * g), vesc: Math.sqrt((2 * G * mass) / Rm), round: Rm >= Rp }; }

// ── 4 · BODY & SENSES: the inner ear measures gravity ───────────────────────────
// The otolith organs feel the gravito-inertial vector f = g − a and cannot tell tilt from acceleration (the
// equivalence principle in your head). Accelerating forward at a feels like pitching up by θ = atan(a/g):
// the somatogravic illusion that has caused aircraft accidents on dark take-offs.
export const pitchIllusion = (a, gw = g0) => (Math.atan2(a, gw) * 180) / Math.PI;
export const gif = (a, gw = g0) => Math.hypot(a, gw);
export const SPACEFLIGHT = { sms: 0.6, bonePerMonth: 1.25, fluidL: 2, heightCm: 3 };

// ── 5 · PERCEPTION: the brain's model of gravity ────────────────────────────────
// A ball falls from height h with initial speed v₀ (down). Real arrival: h = v₀t + ½gt². The brain times the
// catch with its internal model g_m (≈ 1 g, McIntyre et al. 2001; Zago et al. 2008). Error Δt = t_pred − t_real;
// a catch succeeds if |Δt| < 40 ms. Each throw updates the model: g_m ← g_m + η·(g_world − g_m).
export function arrival(h, v0, g) { if (g <= 0.0001) return h / v0; return (-v0 + Math.sqrt(v0 * v0 + 2 * g * h)) / g; }
export const WORLDS = { earth: 9.81, moon: 1.62, mars: 3.71, iss: 0, jupiter: 24.79 };
export function catchTrial(h, v0, gw, gm) { const tr = arrival(h, v0, gw), tp = arrival(h, v0, gm), dt = tp - tr; return { tr, tp, dt, ok: Math.abs(dt) < 0.04 }; }
