// NOCTURNE · the physics behind the suit. Plain closed-form mechanics so every number can be
// checked by hand: gliding flight, ballistic protection, grapnel lines and echolocation.

export const G = 9.80665, RHO = 1.225;

// ── Cape glide ──────────────────────────────────────────────────────────────────
// Drag polar C_D = C_D0 + k·C_L², k = 1/(π·e·AR). Steady glide (no thrust):
//   tan γ = C_D / C_L = 1/(L/D),   V = √(2·m·g·cos γ / (ρ·S·C_L)),   sink = V·sin γ
//   distance from height h: d = h·(L/D),   time t = h / sink
//   (L/D)max = 1 / (2√(C_D0·k)) at C_L* = √(C_D0/k).
// Landing: the impact equals a free fall from h_eq = V²/(2g). A canopy of area A_c and C_Dc
// descends at v = √(2mg / (ρ·C_Dc·A_c)).
export const CAPE = { soft: { cd0: 0.14, AR: 1.1, e: 0.75 }, rigid: { cd0: 0.10, AR: 1.8, e: 0.85 } };
export function glide({ mass = 112, S = 2.4, CL = 0.6, mode = 'rigid', h = 120 }) {
  const c = CAPE[mode], k = 1 / (Math.PI * c.e * c.AR), CD = c.cd0 + k * CL * CL, gam = Math.atan(CD / CL);
  const V = Math.sqrt((2 * mass * G * Math.cos(gam)) / (RHO * S * CL)), sink = V * Math.sin(gam), vx = V * Math.cos(gam);
  const LD = CL / CD, LDmax = 1 / (2 * Math.sqrt(c.cd0 * k)), CLstar = Math.sqrt(c.cd0 / k);
  return { k, CD, gam, V, sink, vx, LD, LDmax, CLstar, dist: h * LD, time: h / sink, heq: (V * V) / (2 * G), wingLoad: (mass * G) / S };
}
export const chute = ({ mass = 112, A = 22, cd = 1.5 }) => { const v = Math.sqrt((2 * mass * G) / (RHO * cd * A)); return { v, heq: (v * v) / (2 * G) }; };
export function polar(opts) { const pts = []; for (let CL = 0.12; CL <= 1.3; CL += 0.02) { const g = glide({ ...opts, CL }); pts.push([g.vx, g.sink, CL]); } return pts; }

// ── Armour ──────────────────────────────────────────────────────────────────────
// NIJ 0101.06 test threats: mass (g), velocity (m/s). Kinetic energy ½mv², momentum mv.
export const THREATS = [
  { id: 'IIA', round: '9 mm FMJ', g: 8.0, v: 373 },
  { id: 'II', round: '9 mm FMJ', g: 8.0, v: 398 },
  { id: 'IIIA', round: '.44 Magnum SJHP', g: 15.6, v: 436 },
  { id: 'III', round: '7.62×51 M80 ball', g: 9.6, v: 847 },
  { id: 'IV', round: '.30-06 M2 AP', g: 10.8, v: 878 },
];
// Typical areal density (kg/m²) needed to defeat each level; null = cannot stop it at any practical thickness.
export const MATERIALS = {
  aramid: { IIA: 3.4, II: 4.2, IIIA: 5.6, III: null, IV: null, rho: 1440 },
  uhmwpe: { IIA: 2.6, II: 3.2, IIIA: 4.4, III: 16.5, IV: null, rho: 970 },
  ceramic: { IIA: 9, II: 9, IIIA: 12, III: 22, IV: 30, rho: 2520 },   // B4C strike face + UHMWPE backing
};
export const ke = (t) => 0.5 * (t.g / 1000) * t.v * t.v;
export const mom = (t) => (t.g / 1000) * t.v;
export function armour({ mat = 'uhmwpe', ad = 6, threat = 'IIIA', area = 0.55 }) {
  const t = THREATS.find((x) => x.id === threat), need = MATERIALS[mat][threat], stops = need != null && ad >= need;
  const mass = ad * area, thick = (ad / MATERIALS[mat].rho) * 1000;          // kg, mm
  // Body recoil if the round is stopped: Δv = p / M (a 100 kg person): the "movie knock-back" myth.
  return { t, need, stops, mass, thick, E: ke(t), p: mom(t), recoil: mom(t) / 100, margin: need ? ad / need : 0 };
}

// ── Grapnel ─────────────────────────────────────────────────────────────────────
// Gas launch (constant pressure, upper bound): ½·m·v² = P·A·L → v = √(2PAL/m); ballistic apex h = v²/2g.
// Winch: T = m(g + a), P = T·v. Line: Dyneema SK78, σ ≈ 3.0 GPa, braid efficiency 0.5, E ≈ 110 GPa.
// Pendulum swing from θ₀: v_b = √(2gL(1 − cos θ₀)), T_b = mg(3 − 2cos θ₀).
// Shock load after a free fall h on a line of stiffness k = E·A/L (plus an optional absorber):
//   F_peak = mg + √((mg)² + 2·mg·k_eff·h),  1/k_eff = 1/k_line + 1/k_abs.
export function grapnel({ mass = 112, P = 3.5e6, bore = 22, barrel = 0.32, hook = 0.28, d = 4, L = 30, theta = 60, fall = 2, absorber = 0, vWinch = 4, aWinch = 2 }) {
  const A = Math.PI * (bore / 2000) ** 2, v0 = Math.sqrt((2 * P * A * barrel) / hook), apex = (v0 * v0) / (2 * G);
  const Al = Math.PI * (d / 2000) ** 2, brk = 3.0e9 * Al * 0.5, kLine = (110e9 * Al * 0.5) / L;
  const kEff = absorber > 0 ? 1 / (1 / kLine + 1 / absorber) : kLine, mg = mass * G, Fshock = mg + Math.sqrt(mg * mg + 2 * mg * kEff * fall);
  const th = (theta * Math.PI) / 180, vb = Math.sqrt(2 * G * L * (1 - Math.cos(th))), Tb = mg * (3 - 2 * Math.cos(th));
  const Tw = mass * (G + aWinch), Pw = Tw * vWinch;
  const peak = Math.max(Fshock, Tb, Tw);
  return { v0, apex, E: P * A * barrel, brk, kLine, kEff, Fshock, gShock: Fshock / mg, vb, Tb, Tw, Pw, peak, sf: brk / peak };
}

// ── Sonar / echolocation ────────────────────────────────────────────────────────
// c = 331.3·√(1 + T/273.15) m/s · range r = c·t/2 · wavelength λ = c/f (features ≳ λ/2 resolvable)
// Air absorption ≈ 0.03·f(kHz) dB/m (one way, rough fit at 20 °C, 50 % RH).
// Two-way loss: 40·log₁₀(r) + 2·α·r ≤ budget → maximum range (solved by bisection).
// Doppler from a target closing at v (two-way): f' = f·(c + v)/(c − v).
export function sonar({ f = 45, T = 14, budget = 100, v = 10 }) {
  const c = 331.3 * Math.sqrt(1 + T / 273.15), lam = c / (f * 1000), alpha = 0.03 * f;
  const loss = (r) => 40 * Math.log10(Math.max(r, 1e-3)) + 2 * alpha * r;
  let a = 0.1, b = 500; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (loss(m) > budget) b = m; else a = m; }
  const rmax = (a + b) / 2, fd = (f * 1000 * (c + v)) / (c - v);
  return { c, lam, res: lam / 2, alpha, rmax, tmax: (2 * rmax) / c, shift: fd - f * 1000, loss };
}
