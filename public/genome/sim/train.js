// GENOME ATHLETE · trainability of VO₂max (the HERITAGE Family Study).
//
// HERITAGE: 20 weeks, 3 sessions/week, 55 → 75 % of VO₂max. Mean gain 384 mL/min, SD 202,
// heritability of the response h² ≈ 0.47 (Bouchard et al. 1999). A 21-SNP predictor separated
// carriers of ≤ 9 favourable alleles (+221 mL/min) from ≥ 19 (+604 mL/min) (Bouchard et al. 2011).
//
// Model:  Δ = μ + β·(k − E[k]) + ε,   k ~ Binomial(42, p),   ε ~ N(0, σ_ε²).
// p and β are calibrated so that E[Δ | k ≤ 9] and E[Δ | k ≥ 19] reproduce 221 and 604 (computed
// exactly below); σ_ε² = σ² − β²·Var k keeps the total SD at 202. The resulting R² ≈ 0.23 is lower
// than the 49 % reported in-sample — out-of-sample prediction is always weaker.

export const HER = { mu: 384, sd: 202, h2: 0.47, nSnp: 21, lo: 221, hi: 604, weeks: 20, sessions: 3, tau: 6 };

const binom = (n, p) => { const d = []; let c = 1; for (let k = 0; k <= n; k++) { d.push(c * p ** k * (1 - p) ** (n - k)); c = (c * (n - k)) / (k + 1); } return d; };
function calibrate() {
  // Solve for p so that the implied group means match 221 / 604 (bisection on the ≤9 mean).
  const at = (p) => { const d = binom(2 * HER.nSnp, p); let a = 0, an = 0, b = 0, bn = 0; d.forEach((x, k) => { if (k <= 9) { a += x * k; an += x; } if (k >= 19) { b += x * k; bn += x; } }); const lo = a / an, hi = b / bn, beta = (HER.hi - HER.lo) / (hi - lo), m = 2 * HER.nSnp * p; return { d, beta, m, lo: HER.mu + beta * (lo - m), hi: HER.mu + beta * (hi - m), pLo: an, pHi: bn }; };
  let a = 0.2, b = 0.45;
  for (let i = 0; i < 50; i++) { const c = (a + b) / 2; if (at(c).lo > HER.lo) a = c; else b = c; }
  const p = (a + b) / 2, r = at(p), varK = 2 * HER.nSnp * p * (1 - p);
  return { p, beta: r.beta, meanK: r.m, sdK: Math.sqrt(varK), dist: r.d, r2: (r.beta ** 2 * varK) / HER.sd ** 2, sdE: Math.sqrt(HER.sd ** 2 - r.beta ** 2 * varK), fitLo: r.lo, fitHi: r.hi, pLo: r.pLo, pHi: r.pHi };
}
export const CAL = calibrate();

// Standard normal helpers.
export const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
export function Phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-0.5 * z * z), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z > 0 ? 1 - p : p; }

// Dose: weeks follow a saturating time course Δ(w) = Δ₂₀·(1 − e^(−w/τ)) / (1 − e^(−20/τ)).
// Sessions/week scale the mean by √(s/3) — an illustrative assumption, not a HERITAGE result.
export const timeFactor = (w) => (1 - Math.exp(-w / HER.tau)) / (1 - Math.exp(-HER.weeks / HER.tau));
export const sessionFactor = (s) => Math.sqrt(s / HER.sessions);

// Prediction for an individual with k favourable alleles.
export function predict({ k, weeks = 20, sessions = 3, vo2 = 40, mass = 70 }) {
  const f = timeFactor(weeks) * sessionFactor(sessions);
  const mean = (HER.mu + CAL.beta * (k - CAL.meanK)) * f, sd = CAL.sdE * f, pop = HER.mu * f, popSd = HER.sd * f;
  const abs = (vo2 * mass) / 1000;                                     // baseline L/min
  return { mean, sd, pop, popSd, f, abs, pct: (100 * mean) / (abs * 1000), rel: mean / mass, pLow: Phi((100 * f - mean) / sd), pHigh: Phi((mean - 600 * f) / sd), kPct: 100 * kCdf(k) };
}
// Mid-rank percentile of k in the population.
export function kCdf(k) { let p = 0; for (let i = 0; i < k; i++) p += CAL.dist[i]; return p + 0.5 * CAL.dist[k]; }
// A reproducible synthetic cohort (for the 3D cloud): k and Δ for n people.
export function cohort(n, r) {
  const out = [], gauss = () => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let i = 0; i < n; i++) { let k = 0; for (let j = 0; j < 2 * HER.nSnp; j++) if (r() < CAL.p) k++; out.push({ k, d: HER.mu + CAL.beta * (k - CAL.meanK) + CAL.sdE * gauss() }); }
  return out;
}
