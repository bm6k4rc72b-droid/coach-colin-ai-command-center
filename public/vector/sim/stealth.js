// SILENT VECTOR · the science of not being found. Colour matching, thermal signature, footstep
// acoustics, radio link budgets and a guard-detection model — closed-form and hand-checkable.

export const SIGMA = 5.670374419e-8;   // Stefan–Boltzmann (W/m²K⁴)

// ── Adaptive camouflage: CIE L*a*b* and ΔE*ab (CIE76) ─────────────────────────
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function lab(h) {
  const [r, g, b] = hex(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
// Environments: three dominant colours each (what the suit's chromatophore panels sample).
export const ENVS = {
  forest: ['#2f3a22', '#4a5a30', '#1c2316'], concrete: ['#5d6066', '#7a7d82', '#45484d'], desert: ['#b89a6a', '#d1b98b', '#8f7550'],
  night: ['#141821', '#1f2532', '#0b0e14'], snow: ['#d9dee6', '#f2f4f7', '#aeb6c2'],
};
// Mean ΔE between the suit palette and the environment palette (pairwise by rank).
export const camoMatch = (suit, env) => suit.reduce((s, c, i) => s + dE(c, env[i]), 0) / suit.length;
// Blend the suit toward the environment by the adaptation fraction a ∈ [0, 1] (sRGB mix).
export function adapt(base, env, a) { return base.map((c, i) => { const A = hex(c), B = hex(env[i]); return '#' + A.map((v, k) => Math.round((v + (B[k] - v) * a) * 255).toString(16).padStart(2, '0')).join(''); }); }
export const camoFactor = (de) => Math.max(0, Math.min(1, 1 - de / 40));   // 1 = perfect match

// ── Thermal signature ─────────────────────────────────────────────────────────
// Heat flow through the suit (per m²): q = (T_skin − T_env) / (R_suit + R_surf), R in m²K/W
// (1 clo = 0.155 m²K/W, R_surf = 1/(h_c + h_r) ≈ 1/13). Outer surface: T_s = T_env + q·R_surf.
// A broadband thermal imager sees the apparent temperature T_app = (ε·T_s⁴ + (1 − ε)·T_env⁴)^¼.
// The heat the suit traps is stored in the body: dT_core/dt = (M − q·A) / (m·c), c = 3470 J/kgK.
export function thermal({ Tenv = 12, clo = 1.5, eps = 0.9, M = 260, mass = 85, area = 1.9, cooling = 0 }) {
  const Tsk = 34, Rs = clo * 0.155, Rf = 1 / 13, q = (Tsk - Tenv) / (Rs + Rf), Ts = Tenv + q * Rf;
  const K = (c) => c + 273.15, Tapp = Math.pow(eps * K(Ts) ** 4 + (1 - eps) * K(Tenv) ** 4, 0.25) - 273.15;
  const loss = q * area + cooling, store = M - loss, rate = store / (mass * 3470) * 3600;   // °C per hour
  return { q, Ts, Tapp, dT: Tapp - Tenv, Mexit: eps * SIGMA * K(Ts) ** 4, loss, store, rate, minsToPlus1: store > 0 ? 60 / rate : Infinity };
}

// ── Footstep acoustics ────────────────────────────────────────────────────────
// Point source in the open: L(r) = L₁ − 20·log₁₀(r)  (−6 dB per doubling of distance).
// Heard where L(r) ≥ L_ambient + 3 dB → audible radius r = 10^((L₁ − L_amb − 3)/20).
export const GAITS = { crawl: { v: 0.4, L: 32 }, crouch: { v: 0.9, L: 42 }, walk: { v: 1.4, L: 55 }, run: { v: 3.6, L: 70 } };
export const SURF = { carpet: -10, grass: -6, concrete: 0, gravel: 6, grating: 10 };
export const AMB = { silent: 25, night: 32, rain: 45, storm: 56, generator: 64 };
export function footstep({ gait = 'walk', surf = 'concrete', amb = 'night', soles = 6 }) {
  const L1 = GAITS[gait].L + SURF[surf] - soles, La = AMB[amb], r = Math.min(300, Math.max(0.05, 10 ** ((L1 - La - 3) / 20)));
  return { L1, La, r, v: GAITS[gait].v, at: (d) => L1 - 20 * Math.log10(Math.max(d, 0.05)) };
}

// ── Radio link budget ─────────────────────────────────────────────────────────
// FSPL(dB) = 20·log₁₀(d_km) + 20·log₁₀(f_MHz) + 32.44.  P_rx = P_tx + G_tx + G_rx − FSPL − L_obs.
// Sensitivity = −174 dBm/Hz + 10·log₁₀(B) + NF + SNR_req.  Margin = P_rx − sensitivity.
// An eavesdropper without the spreading code loses the processing gain G_p = 10·log₁₀(B_spread/B_data).
// A directional antenna (gain > 6 dBi) is pointed at the base: off-axis listeners get ~20 dB less (sidelobes).
// Chance a scanning receiver (revisit time T_s) lands on a burst of length τ: P = 1 − e^(−τ/T_s).
// Radio horizon (4/3-earth): d = 4.12·(√h₁ + √h₂) km.
export function link({ ptx = 30, f = 400, d = 8, gtx = 2, grx = 9, obs = 12, B = 25e3, nf = 6, snr = 10, spread = 64, dEnemy = 3, tau = 0.4, Tscan = 12, h1 = 2, h2 = 30 }) {
  const fspl = (km) => 20 * Math.log10(Math.max(km, 1e-3)) + 20 * Math.log10(f) + 32.44;
  const sens = -174 + 10 * Math.log10(B) + nf + snr, prx = ptx + gtx + grx - fspl(d) - obs, margin = prx - sens;
  const Gp = 10 * Math.log10(spread), gSide = gtx > 6 ? gtx - 20 : gtx, pEnemy = ptx + gSide + 2 - fspl(dEnemy) - obs * 0.5, eMargin = pEnemy - sens - Gp;
  const range = 10 ** ((ptx + gtx + grx - obs - sens - 20 * Math.log10(f) - 32.44) / 20), horizon = 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));
  return { fspl: fspl(d), sens, prx, margin, Gp, gSide, pEnemy, eMargin, pIntercept: 1 - Math.exp(-tau / Tscan), range, horizon, reach: Math.min(range, horizon) };
}

// ── Guard detection ───────────────────────────────────────────────────────────
// Visibility of the operative to a guard: v = light · (1 − 0.85·camo) · stance · motion,
// accumulated while inside the guard's view cone and line of sight:
//   dD/dt = k · v · (1 − r/R)²  (closer = faster). D ≥ 1 → spotted; D > 0.35 → suspicious.
export const STANCE = { stand: 1, crouch: 0.6, crawl: 0.32 };
export const visibility = ({ light, camo, stance, moving }) => light * (1 - 0.85 * camo) * STANCE[stance] * (moving ? 1.5 : 1);
