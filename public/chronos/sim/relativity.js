// CHRONOS · special relativity: the relativistic rocket and the twin paradox.
//
// Units: light-years and years, so c = 1.  1 g = 9.80665 m/s² = 1.0323 ly/yr².
// Constant proper acceleration a (felt by the crew), from rest, after proper time τ:
//   rapidity  η = a·τ           speed  β = tanh(η)        Lorentz factor  γ = cosh(η)
//   Earth time  t = sinh(η)/a   distance  x = (cosh(η) − 1)/a
// Rocket equation (exhaust speed u, relativistic):  m₀/m₁ = exp(Δη · c/u)
//   — a photon rocket (u = c) needs m₀/m₁ = e^(aτ) for every burn.
// Doppler factor ahead  D = √((1+β)/(1−β));  aberration  cos θ' = (cos θ + β)/(1 + β·cos θ).

export const G_LY = 9.80665 * (365.25 * 86400) ** 2 / 9.4607e15;   // 1 g in ly/yr² ≈ 1.0323
export const DESTINATIONS = {
  proxima: { d: 4.246, name: 'Proxima Centauri' },
  sirius: { d: 8.6, name: 'Sirius' },
  vega: { d: 25.0, name: 'Vega' },
  pleiades: { d: 444, name: 'Pleiades' },
  galcentre: { d: 26000, name: 'Galactic centre' },
  andromeda: { d: 2.537e6, name: 'Andromeda' },
};
export const ENGINES = { photon: { u: 1, name: 'Photon drive' }, antimatter: { u: 0.33, name: 'Antimatter (pion)' }, fusion: { u: 0.12, name: 'Fusion (D–He3)' }, chemical: { u: 1.5e-5, name: 'Chemical' } };

// One-way leg: accelerate at a (g units), coast at βmax if reached, decelerate symmetrically.
export function leg(D, aG, betaMax = 0.9999999) {
  const a = aG * G_LY;
  const etaMax = Math.atanh(Math.min(betaMax, 1 - 1e-15));
  let eta1 = Math.acosh(1 + (a * D) / 2), coast = 0;           // flip at the midpoint
  if (eta1 > etaMax) { eta1 = etaMax; coast = D - (2 * (Math.cosh(eta1) - 1)) / a; }
  const tau1 = eta1 / a, t1 = Math.sinh(eta1) / a, x1 = (Math.cosh(eta1) - 1) / a;
  const beta = Math.tanh(eta1), gamma = Math.cosh(eta1);
  const tc = coast / beta, tauc = tc / gamma;
  return { a, D, eta1, tau1, t1, x1, beta, gamma, coast, tc, tauc, T: 2 * t1 + tc, tau: 2 * tau1 + tauc };
}
// State at Earth time t along a one-way leg (for animation and the Minkowski diagram).
export function stateAt(L, t) {
  const { a, t1, x1, tc, beta, gamma } = L;
  if (t <= t1) { const eta = Math.asinh(a * t); return { x: (Math.cosh(eta) - 1) / a, beta: Math.tanh(eta), tau: eta / a, gamma: Math.cosh(eta), phase: 'accel' }; }
  if (t <= t1 + tc) { const dt = t - t1; return { x: x1 + beta * dt, beta, tau: L.tau1 + dt / gamma, gamma, phase: 'coast' }; }
  const tr = Math.max(0, L.T - t), eta = Math.asinh(a * tr);
  return { x: L.D - (Math.cosh(eta) - 1) / a, beta: Math.tanh(eta), tau: L.tau - eta / a, gamma: Math.cosh(eta), phase: tr > 0 ? 'decel' : 'arrived' };
}
// Round trip: out and back. Returns ages and the log10 of the mass ratio for an engine.
export function roundTrip(D, aG, betaMax, engine = 'photon') {
  const L = leg(D, aG, betaMax), u = ENGINES[engine].u;
  const log10MR = (4 * L.eta1 / u) / Math.LN10;                 // four burns
  return { L, earth: 2 * L.T, ship: 2 * L.tau, gap: 2 * (L.T - L.tau), log10MR };
}
export const doppler = (beta) => Math.sqrt((1 + beta) / (1 - beta));
export const aberr = (cosT, beta) => (cosT + beta) / (1 + beta * cosT);
// Kinetic energy of payload m (kg) at γ: (γ − 1)·m·c² in joules.
export const kinetic = (gamma, m) => (gamma - 1) * m * 8.98755e16;
export const fmtYears = (y) => (y >= 1e6 ? `${(y / 1e6).toFixed(2)} Myr` : y >= 1e3 ? `${(y / 1e3).toFixed(2)} kyr` : y >= 1 ? `${y.toFixed(2)} yr` : y * 365.25 >= 1 ? `${(y * 365.25).toFixed(1)} d` : `${(y * 8766).toFixed(1)} h`);
