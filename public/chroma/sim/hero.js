// CHROMA FORCE · the physics of a five-colour hero team: light, mass–energy, strikes, jumps, and why a
// 50-metre robot is hard to build (the square–cube law). Closed-form and hand-checkable.

export const G = 9.80665, C = 299792458, H = 6.62607015e-34, EV = 1.602176634e-19;

// ── The five colours ────────────────────────────────────────────────────────────
// Photon energy E = hc/λ (in eV: 1239.84 / λ[nm]). Pink is not in the rainbow: the eye builds it from
// red + violet together, so it has no single wavelength.
export const TEAM = [
  { id: 'red', hex: '#e8262f', nm: 650, role: 'leader' },
  { id: 'blue', hex: '#2a6cf0', nm: 470, role: 'tactician' },
  { id: 'gold', hex: '#f2b31b', nm: 580, role: 'engineer' },
  { id: 'green', hex: '#22c45e', nm: 530, role: 'scout' },
  { id: 'pink', hex: '#ff4fa8', nm: [650, 420], role: 'medic' },
];
export const photonEV = (nm) => 1239.84198 / nm;
export const photonJ = (nm) => (H * C) / (nm * 1e-9);

// ── Morph: matter is expensive ──────────────────────────────────────────────────
// Conjuring the suit from energy: E = mc². In TNT: 1 Mt = 4.184×10¹⁵ J.
// Deploying a stored, folded suit instead: kinetic energy ½mv² to move it into place.
export function morph({ suitKg = 11, vDeploy = 3, tDeploy = 0.6 }) {
  const E = suitKg * C * C, Mt = E / 4.184e15, Ek = 0.5 * suitKg * vDeploy ** 2;
  return { E, Mt, hiroshima: E / 6.3e13, Ek, P: Ek / tDeploy, homes: E / (10500 * 3.6e6) };   // a home uses ~10 500 kWh/yr
}

// ── Strikes ─────────────────────────────────────────────────────────────────────
// Impulse–momentum: F̄ = m_eff·v / Δt (the strike stops in Δt), KE = ½·m_eff·v².
// Breaking thresholds (typical, single board/slab): pine board ≈ 2.4 kN, concrete paver ≈ 3.2 kN.
export const TARGETS = { pine: 2400, concrete: 3200, brick: 4500 };
export function strike({ meff = 3, v = 9, dt = 8, amp = 1 }) {
  const p = meff * v, F = (p / (dt / 1000)) * amp, KE = 0.5 * meff * v * v;
  return { p, F, KE, P: F * v / 2, breaks: Object.fromEntries(Object.entries(TARGETS).map(([k, f]) => [k, F >= f])) };
}
// Jumps and flips: h = v²/2g, airtime t = 2v/g, spin needed for n turns: ω = 2πn/t.
export function jump({ v = 3.2, turns = 1 }) { const h = (v * v) / (2 * G), t = (2 * v) / G; return { h, t, omega: (2 * Math.PI * turns) / t, rpm: (60 * turns) / t }; }

// ── The square–cube law ─────────────────────────────────────────────────────────
// Scale a 1.8 m, 90 kg human by s = H/1.8 with density ratio ρ (mech/human):
//   mass ∝ ρ·s³,  leg cross-section ∝ s²,  so leg stress σ = σ₀·ρ·s grows linearly with size.
// σ₀ ≈ 3.8 MPa: peak leg-bone stress of a human walking (≈ 3× body weight on one leg).
// Tallest safe height with safety factor SF: H_max = 1.8·σ_yield / (σ₀·ρ·SF).
// Walking speed at Froude number Fr = v²/(g·L) = 0.25 (leg length L ≈ 0.53·H): v = √(0.25·g·L).
// Ground pressure p = m·g / (2 feet · 0.025·s² m²) — compare with soil bearing (~0.2 MPa) or asphalt (~1 MPa).
export const MATS = { aluminium: { y: 280, rho: 1.6 }, steel: { y: 350, rho: 3 }, titanium: { y: 880, rho: 2.2 }, nanotube: { y: 3000, rho: 1.1 } };
export function giant({ Hm = 40, mat = 'steel', SF = 2 }) {
  const M = MATS[mat], s = Hm / 1.8, mass = 90 * M.rho * s ** 3, sigma = 3.8 * M.rho * s, sf = M.y / sigma;
  const Hmax = (1.8 * M.y) / (3.8 * M.rho * SF), L = 0.53 * Hm, vWalk = Math.sqrt(0.25 * G * L), step = Math.PI * Math.sqrt(L / G);
  const pFoot = (mass * G) / (2 * 0.025 * s * s) / 1e6;
  return { s, mass, sigma, sf, Hmax, L, vWalk, kmh: vWalk * 3.6, step, pFoot, tFall: Math.sqrt((2 * Hm * 0.55) / G), ok: sf >= SF };
}

// ── Team strike: synchronised impulses ──────────────────────────────────────────
// Five strikes of force F and contact width w (ms). If they land at times tᵢ, the peak combined force is
// max_t Σ F·exp(−(t − tᵢ)²/(2w²)). Perfect timing gives 5F; a spread of a few w gives little more than F.
export function teamPeak(times, F = 4000, w = 12) {
  let best = 0; const t0 = Math.min(...times) - 4 * w, t1 = Math.max(...times) + 4 * w;
  for (let t = t0; t <= t1; t += 1) { let s = 0; for (const ti of times) s += F * Math.exp(-((t - ti) ** 2) / (2 * w * w)); best = Math.max(best, s); }
  return best;
}
