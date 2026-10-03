// KEYLIGHT · the maths and physics behind the magic. Exact where it can be (integer counting uses BigInt).

// ── 1 · Stained glass and symmetry ─────────────────────────────────────────────
// A rose window cut into n wedges, each coloured with one of k colours. Two windows are "the same" if a
// rotation (cyclic group C_n, n elements) or also a flip (dihedral group D_n, 2n elements) maps one
// onto the other. Burnside's lemma counts the distinct windows: average the colourings each symmetry fixes.
//   Necklaces (rotations):      N(n,k) = (1/n)·Σ_{d|n} φ(d)·k^{n/d}
//   Bracelets (+ reflections):  B(n,k) = N/2 + (n odd ? k^{(n+1)/2}/2 : (k^{n/2} + k^{n/2+1})/4)
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function phi(n) { let r = n; for (let p = 2; p * p <= n; p++) if (n % p === 0) { while (n % p === 0) n /= p; r -= r / p; } if (n > 1) r -= r / n; return r; }
export const divisors = (n) => [...Array(n).keys()].map((i) => i + 1).filter((d) => n % d === 0);
export function necklaces(n, k) { const K = BigInt(k); let s = 0n; for (const d of divisors(n)) s += BigInt(phi(d)) * K ** BigInt(n / d); return s / BigInt(n); }
export function bracelets(n, k) {
  const K = BigInt(k), N2 = necklaces(n, k) * BigInt(n) * 2n;     // 2n·N = Σ over rotations, doubled for averaging over 2n
  const refl = n % 2 ? BigInt(n) * K ** BigInt((n + 1) / 2) : (BigInt(n / 2) * K ** BigInt(n / 2) + BigInt(n / 2) * K ** BigInt(n / 2 + 1));
  return (N2 / 2n + refl) / (2n * BigInt(n));
}
export const raw = (n, k) => BigInt(k) ** BigInt(n);
export const fmtBig = (b) => { const s = b.toString(); return s.length > 15 ? `${s[0]}.${s.slice(1, 3)}×10^${s.length - 1}` : Number(b).toLocaleString('en-US'); };
export function smallestN(k, target, refl = true) { for (let n = 1; n <= 64; n++) if ((refl ? bracelets(n, k) : necklaces(n, k)) > BigInt(target)) return n; return null; }
void gcd;

// ── 2 · Spells: real energy budgets ─────────────────────────────────────────────
// 1 MP = 10 kJ of delivered magic. Only part of a spell's energy reaches the target (efficiency η).
export const MP_KJ = 10;
export const SPELLS = {
  // Ignite a 0.5 kg wooden totem: heat from 20 °C to ~300 °C ignition. Q = m·c·ΔT, c(wood) ≈ 1.7 kJ/kg·K. η = 0.6.
  fire: { need: () => 0.5 * 1.7 * 280, eta: 0.6 },
  // Freeze a 0.5 kg water orb from 20 °C to −10 °C: cool, freeze (L_f = 334 kJ/kg), cool the ice.
  // Q = m(c_w·20 + L_f + c_ice·10) with c_w 4.186, c_ice 2.09 kJ/kg·K. η = 0.7.
  ice: { need: () => 0.5 * (4.186 * 20 + 334 + 2.09 * 10), eta: 0.7 },
  // Thunder: break down a 4 m air gap to the lightning rod. Breakdown field E_b ≈ 3 MV/m → V = E_b·d.
  // The spell is a 1 nF "cloud" charged to V: energy ½CV². η = 1 (all of it goes into the discharge).
  thunder: { need: () => (0.5 * 1e-9 * (3e6 * 4) ** 2) / 1000, eta: 1 },
};
export function cast(kind, mp) { const S = SPELLS[kind], delivered = mp * MP_KJ * S.eta, need = S.need(); return { delivered, need, ok: delivered >= need, ratio: delivered / need, mpMin: Math.ceil(need / (S.eta * MP_KJ)) }; }
export const thunderVolts = (mp) => Math.sqrt((2 * mp * MP_KJ * 1000) / 1e-9);    // V from ½CV² = energy

// ── 3 · Prism-ship routes: Hohmann transfers around the Lumen ──────────────────
// Worlds circle the Lumen (μ = 1 in game units: r in "light-radii", speeds in units of √(μ/r₀)).
// A Hohmann transfer r1 → r2: Δv₁ = √(μ/r1)·(√(2r2/(r1+r2)) − 1), Δv₂ = √(μ/r2)·(1 − √(2r1/(r1+r2))),
// time = π√((r1+r2)³/(8μ)); the target must lead by θ = π(1 − ((r1+r2)/(2r2))^{3/2}) at departure.
// Fuel by the rocket equation: m₀/m_f = e^{Δv/v_e}.
export const WORLDS = [
  { id: 'haven', r: 1.0, col: '#ffd27a' }, { id: 'tide', r: 1.6, col: '#5fd0ff' }, { id: 'ember', r: 2.3, col: '#ff7a4a' },
  { id: 'frost', r: 3.1, col: '#bfe8ff' }, { id: 'night', r: 4.2, col: '#b48cff' },
];
export function hohmann(r1, r2, mu = 1) {
  const a = (r1 + r2) / 2, dv1 = Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1), dv2 = Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  return { dv: Math.abs(dv1) + Math.abs(dv2), dv1, dv2, t: Math.PI * Math.sqrt(a ** 3 / mu), phase: Math.PI * (1 - ((r1 + r2) / (2 * r2)) ** 1.5), a };
}
export const SHIP = { dry: 10, fuel: 7, ve: 1.0 };          // tonnes, tonnes, exhaust speed (game units)
export function route(ids, ship = SHIP) {
  const legs = []; let dv = 0, t = 0;
  for (let i = 1; i < ids.length; i++) { const a = WORLDS.find((w) => w.id === ids[i - 1]), b = WORLDS.find((w) => w.id === ids[i]); const h = hohmann(a.r, b.r); legs.push({ from: a.id, to: b.id, ...h }); dv += h.dv; t += h.t; }
  const m0 = ship.dry + ship.fuel, mf = m0 / Math.exp(dv / ship.ve), fuelUsed = m0 - mf;
  return { legs, dv, t, fuelUsed, ok: fuelUsed <= ship.fuel + 1e-9, dvMax: ship.ve * Math.log(m0 / ship.dry) };
}

// ── 4 · Combat: the key's swing ────────────────────────────────────────────────
// A 1.1 m key swung at ω gives tip speed v = ωL. A hit delivers impulse J ≈ m_eff·v_tip (m_eff 0.6 kg);
// a Hollow of mass m is knocked back with Δv = J/m. Combo hits come faster and harder; the finisher spins.
export const KEY = { L: 1.1, meff: 0.6 };
export const COMBO = [{ w: 9, dmg: 10, win: [0.25, 0.6] }, { w: 11, dmg: 12, win: [0.25, 0.6] }, { w: 13, dmg: 15, win: [0.3, 0.7] }, { w: 16, dmg: 28, win: null }];
export const knock = (step, m) => (KEY.meff * COMBO[step].w * KEY.L) / m;
