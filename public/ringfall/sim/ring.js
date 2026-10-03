// RINGFALL · physics of a spinning ring world. Closed-form where possible; every number is checkable.

export const G0 = 9.80665;

// ── 1 · Spin gravity ────────────────────────────────────────────────────────────
// Floor "gravity" is the centripetal acceleration ω²R. For a target g: ω = √(g/R), rim speed v = ωR = √(gR).
export function spin(R, g = G0) { const w = Math.sqrt(g / R), v = w * R; return { w, v, T: (2 * Math.PI) / w, rpm: (60 * w) / (2 * Math.PI) }; }
// Climb h towards the hub and gravity falls linearly: g(h) = ω²(R − h).
export const gAt = (R, g, h) => g * (1 - h / R);

// ── 2 · Hoop stress: why a 10,000 km ring is a materials problem ────────────────
// A thin spinning hoop carries σ = ρ_s·v² from its own mass. Soil, water and air (mass ratio λ to the
// structure) ride on the floor and add λ·ρ_s·v². So σ/ρ_s = v²(1 + λ) = gR(1 + λ): independent of
// thickness! The material's specific strength σ_u/ρ (J/kg) sets the largest ring: R_max = (σ_u/ρ)/(g(1+λ)·SF).
export const MATS = {
  steel: { s: 1.5e9, rho: 7850 }, kevlar: { s: 3.6e9, rho: 1440 }, zylon: { s: 5.8e9, rho: 1560 }, cfrp: { s: 7.0e9, rho: 1790 },
  cnt: { s: 63e9, rho: 1300 }, exotic: { s: 2e12, rho: 1000 },
};
export function hoop({ R, g = G0, mat = 'cnt', lam = 0.5, SF = 1.5 }) {
  const M = MATS[mat], spec = M.s / M.rho, { v } = spin(R, g), need = v * v * (1 + lam);
  return { v, spec, need, sf: spec / need, Rmax: spec / (g * (1 + lam) * SF), ok: spec / need >= SF };
}
// Keeping the air in: open-topped rings hold air with walls. Isothermal scale height H = R*T/(M·g).
export const scaleHeight = (g = G0, T = 288) => (8.314 * T) / (0.029 * g);
export const wallFor = (leak, g = G0) => scaleHeight(g) * Math.log(1 / leak);          // pressure at wall top = leak × floor pressure
// The "arch": a point a distance s around the ring is seen at elevation s/(2R) above the horizon (inscribed angle).
export const archElevation = (s, R) => s / (2 * R);

// ── 3 · Throwing things in a rotating frame (exact) ────────────────────────────
// In the inertial frame a thrown object feels no force at all, so it flies in a straight line until it
// meets the floor again. Launch from the bottom of the ring (0, −R): ring velocity there is (ωR, 0).
// Inertial velocity u = (v_spin + ωR, v_up); the line meets |p| = R again at t* = 2R·u_y/|u|².
// Rotating the path back by −ωt gives what the thrower sees: a curved arc that "drifts" antispinward.
export function throwRot({ R, g = G0, vUp, vSpin, vAx = 0, n = 120 }) {
  const { w } = spin(R, g), ux = vSpin + w * R, uy = vUp, u2 = ux * ux + uy * uy;
  const tHit = uy > 0 ? (2 * R * uy) / u2 : 0, path = [], inertial = [];
  for (let i = 0; i <= n; i++) {
    const t = (tHit * i) / n, px = ux * t, py = -R + uy * t, c = Math.cos(-w * t), s = Math.sin(-w * t);
    const rx = px * c - py * s, ry = px * s + py * c, ang = Math.atan2(ry, rx) + Math.PI / 2;
    path.push([R * ang, R - Math.hypot(rx, ry), vAx * t]); inertial.push([px, py]);
  }
  const land = path[path.length - 1], flatT = (2 * vUp) / g;
  return { path, inertial, tHit, land: land[0], landAx: land[2], flat: vSpin * flatT, flatT, peak: Math.max(...path.map((p) => p[1])), w };
}
// Apparent weight while moving spinward at v on the floor: (ωR + v)²/R; antispinward: (ωR − v)²/R.
export const apparentG = (R, g, v) => { const { w } = spin(R, g); return (w * R + v) ** 2 / R; };

// ── 4 · Energy shields ─────────────────────────────────────────────────────────
// Shield capacity C (kJ) absorbs hits first; it starts recharging at rate r (kJ/s) τ seconds after the last
// hit. Overflow damages the hull (12 kJ). Mass: 160 kg armour + 1.4 kg per kJ of capacitor + 4 kg per kW of
// recharge power (reactor share). Bigger capacitors run hotter and need a longer cool-down: τ ≥ 0.6 + 0.09·C.
export const HULL = 12;
export const suitMass = (C, r) => 160 + 1.4 * C + 4 * r;
export const minDelay = (C) => 0.6 + 0.09 * C;
// A 30 s engagement: [time s, damage kJ]. Rifle rounds 2.5 kJ, plasma bolts 4 kJ, a grenade 10 kJ, a needle stream.
export const SCENARIO = (() => {
  const ev = [];
  for (let t = 1.5; t < 3.5; t += 0.4) ev.push([t, 2.5]);
  for (const t of [7, 7.8]) ev.push([t, 4]);
  for (let t = 11, k = 0; k < 12; t += 0.15, k++) ev.push([t, 0.6]);
  ev.push([16, 10]);
  for (let t = 20, k = 0; k < 5; t += 0.5, k++) ev.push([t, 2.5]);
  for (const t of [26, 26.6, 27.2]) ev.push([t, 4]);
  return ev.sort((a, b) => a[0] - b[0]);
})();
export function shieldSim({ C, tau, r, events = SCENARIO, T = 30, dt = 0.01 }) {
  let S = C, H = HULL, last = -1e9, k = 0, minH = H, absorbed = 0, bled = 0; const sS = [], sH = [];
  for (let t = 0; t <= T + 1e-9; t += dt) {
    while (k < events.length && events[k][0] <= t) { const d = events[k][1], a = Math.min(S, d); S -= a; absorbed += a; H -= d - a; bled += d - a; last = t; k++; }
    if (t - last >= tau) S = Math.min(C, S + r * dt);
    minH = Math.min(minH, H); if (Math.round(t / dt) % 10 === 0) { sS.push([t, S]); sH.push([t, Math.max(0, H)]); }
  }
  const total = events.reduce((a, e) => a + e[1], 0);
  return { sS, sH, survived: minH > 0, minH, absorbed, bled, total };
}
