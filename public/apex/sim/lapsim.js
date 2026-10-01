// APEX · quasi-steady-state lap simulation (point mass on a g-g-v envelope).
//
// 1. Cornering limit at every point: m·v²·κ = μ·(m·g + ½ρ·C_L A·v²)
//        → v² = μ·m·g / (m·|κ| − μ·½ρ·C_L A)      (no limit when the denominator ≤ 0: downforce wins)
// 2. Forward pass (acceleration): a_x = min(drive, traction)/m − drag/m, traction from the friction
//    ellipse  a_x,max = a_tot·√(1 − (a_y/a_y,max)²), only the rear axle drives.
// 3. Backward pass (braking): the same ellipse with all four tyres, plus drag helping.
//    v_i = min(corner, forward, backward);   lap time = Σ Δs / v̄.

import { CAR, RHO, G, aero, mu, gearFor, powerFrac } from './car.js';

export function lapSim(track, s, { age = 0, extraMu = 1 } = {}) {
  const { pts, N } = track, A = aero(s), m = CAR.mass + s.fuel, q = 0.5 * RHO;
  const muAt = (v) => mu(s.compound, (m * G + q * A.CLA * v * v) / 4, null, age) * extraMu;
  const vC = new Float64Array(N), vF = new Float64Array(N), vB = new Float64Array(N), v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const k = Math.abs(pts[i].k); let vv = 120;
    if (k > 1e-5) { for (let it = 0; it < 6; it++) { const mm = muAt(vv), den = m * k - mm * q * A.CLA; vv = den <= 0 ? 120 : Math.min(120, Math.sqrt((mm * m * G) / den)); } }
    vC[i] = vv;
  }
  const ds = track.L / N;
  const lat = (i, vv) => { const N_ = m * G + q * A.CLA * vv * vv, ay = vv * vv * Math.abs(pts[i].k), aymax = (muAt(vv) * N_) / m; return { N_, r: Math.min(1, ay / aymax) }; };
  // Forward (start from the slowest point so the loop is self-consistent).
  let i0 = 0; for (let i = 1; i < N; i++) if (vC[i] < vC[i0]) i0 = i;
  vF[i0] = vC[i0];
  for (let c = 1; c <= N; c++) {
    const i = (i0 + c - 1) % N, j = (i0 + c) % N, vv = Math.min(vF[i], vC[i]), { N_, r } = lat(i, vv);
    const g = gearFor(Math.max(vv, 5), s), Fdrive = (CAR.power * CAR.eta * powerFrac(g.rpm)) / Math.max(vv, 8);
    const Ftrac = muAt(vv) * N_ * CAR.rearShare * Math.sqrt(Math.max(0, 1 - r * r));
    const ax = (Math.min(Fdrive, Ftrac) - q * A.CDA * vv * vv - CAR.crr * m * G) / m;
    vF[j] = Math.min(vC[j], Math.sqrt(Math.max(1, vv * vv + 2 * ax * ds)));
  }
  // Backward.
  vB[i0] = vC[i0];
  for (let c = 1; c <= N; c++) {
    const j = (i0 - c + 1 + N) % N, i = (i0 - c + N) % N, vv = Math.min(vB[j], vC[j]), { N_, r } = lat(j, vv);
    const ax = (0.86 * muAt(vv) * N_ * Math.sqrt(Math.max(0, 1 - r * r)) + q * A.CDA * vv * vv) / m;   // brakes use ~86 % of peak grip (lock-up margin)
    vB[i] = Math.min(vC[i], Math.sqrt(vv * vv + 2 * ax * ds));
  }
  let T = 0; const out = [];
  for (let i = 0; i < N; i++) v[i] = Math.min(vC[i], vF[i], vB[i]);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, vm = (v[i] + v[j]) / 2, dt = ds / vm; T += dt;
    const ax = (v[j] * v[j] - v[i] * v[i]) / (2 * ds), ay = v[i] * v[i] * pts[i].k, g = gearFor(v[i], s);
    out.push({ s: pts[i].s, t: T - dt, v: v[i], ax, ay, gear: g.gear, rpm: g.rpm, thr: ax > 0.3 ? Math.min(1, ax / 6 + 0.4) : vF[i] <= vB[i] + 0.01 && v[i] >= vC[i] - 0.3 ? 0.35 : 0, brk: ax < -1 ? Math.min(1, -ax / 45) : 0, lim: v[i] >= vC[i] - 0.05 ? 'corner' : vF[i] < vB[i] ? 'power' : 'brake' });
  }
  const vmax = Math.max(...v), vmin = Math.min(...v);
  return { T, trace: out, vmax, vmin, aero: A };
}
export const fmtLap = (T) => `${Math.floor(T / 60)}:${(T % 60).toFixed(3).padStart(6, '0')}`;
