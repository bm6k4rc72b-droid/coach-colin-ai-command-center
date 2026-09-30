// RANCH OPS · pasture: paddocks, grass growth, grazing and rotation planning.
//
// Grass (logistic regrowth, kg DM/ha):     dB/dt = r·B·(1 − B/K) − N·I/A
// Regrowth time from B₀ to B₁ (no grazing): t = (1/r)·ln[ B₁(K − B₀) / (B₀(K − B₁)) ]
// Grazing days in a paddock:                D = (B − B_res)·A / (N·I)
// Rest needed so the next graze starts at B_in:  the regrowth time from B_res to B_in
// Animal-unit month (AUM): forage for one 1000-lb (454 kg) cow for a month ≈ 12 kg DM/day × 30.4 days.
// A ewe is ~0.2 AU.  Carrying capacity (AUM) = Σ (B − B_res)·A·u / 365 kg, u = harvest efficiency.
// NDVI (canopy greenness from the red/near-infrared bands) saturates with biomass:
//                                          NDVI ≈ 0.15 + 0.75·(1 − e^(−B/1400))

export const K = 4200;          // kg DM/ha — ceiling of this pasture
export const B_RES = 1200;      // leave this much behind (≈ 4–5 cm sward) for fast regrowth
export const B_IN = 2800;       // enter a paddock at ≈ 2800 kg DM/ha (≈ 12–15 cm)
export const AU_DAY = 12;       // kg DM per animal unit per day
export const EWE_AU = 0.2;
export const SEASONS = { spring: 0.075, summer: 0.035, autumn: 0.045, winter: 0.012 };  // r (1/day)

// Paddock grid (metres). Six paddocks, 100 m × 80 m = 0.8 ha each, on the south slope.
export function makePaddocks() {
  const P = [], B0 = [2900, 2100, 3400, 1500, 2600, 3900];
  let i = 0;
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x0 = -150 + col * 100, z0 = -40 + row * 80;
    P.push({ id: i + 1, x0, x1: x0 + 100, z0, z1: z0 + 80, ha: (100 * 80) / 10000, B: B0[i], rest: [12, 30, 21, 3, 26, 40][i], gate: { x: x0 + 50, z: z0 } });
    i++;
  }
  return P;
}
export const ndvi = (B) => 0.15 + 0.75 * (1 - Math.exp(-B / 1400));
export const regrowDays = (r, B0, B1) => (B1 <= B0 ? 0 : B1 >= K ? Infinity : (1 / r) * Math.log((B1 * (K - B0)) / (B0 * (K - B1))));
export const grazeDays = (pad, N, I) => Math.max(0, ((pad.B - B_RES) * pad.ha) / (N * I));

// Advance every paddock by dt days; `grazing` is the paddock the flock is in.
export function stepPasture(pads, dt, r, grazing, N, I) {
  for (const p of pads) {
    const growth = r * p.B * (1 - p.B / K);
    const eat = p === grazing ? (N * I) / p.ha : 0;
    p.B = Math.max(300, p.B + (growth - eat) * dt);
    p.rest = p === grazing ? 0 : p.rest + dt;
  }
}
// Forward simulation of a rotation: stay until B_res, move to the paddock with the most grass.
export function planRotation(pads, days, r, N, I, start) {
  const P = pads.map((p) => ({ ...p })), series = P.map(() => []), moves = [];
  let cur = P.find((p) => p.id === start.id);
  for (let d = 0; d <= days; d += 0.5) {
    P.forEach((p, i) => series[i].push([d, p.B]));
    if (cur.B <= B_RES + 30) {
      const next = P.filter((p) => p !== cur).sort((a, b) => b.B - a.B)[0];
      moves.push({ d, from: cur.id, to: next.id, B: next.B }); cur = next;
    }
    stepPasture(P, 0.5, r, cur, N, I);
  }
  const shortfall = P.some((p) => p === cur && p.B < B_RES - 100);
  return { series, moves, end: P, shortfall };
}
// Carrying capacity: AUM available now above the residual, and months this flock can run on it.
export function capacity(pads, N, util = 0.7) {
  const kg = pads.reduce((a, p) => a + Math.max(0, p.B - B_RES) * p.ha, 0) * util;
  const aum = kg / (AU_DAY * 30.4), demand = N * EWE_AU;
  return { kg, aum, demand, months: aum / demand };
}
