// APEX · race strategy: tyre degradation, fuel effect and pit stops.
//
// Lap time on lap n of a stint (tyre age a, fuel f kg):
//   t = t_base + Δ_compound + d·a + cliff·max(0, a − a_cliff)^1.6 + k_fuel·(f − f_ref)
//   k_fuel ≈ 0.033 s per kg (the classic "0.3 s per 10 kg"), burn ≈ 1.75 kg/lap.
// A stop costs the pit-lane loss (≈ 21 s at this track). Rules: at least two dry compounds.
// We enumerate every 1- and 2-stop plan (compound order × stint lengths) and keep the fastest.

import { COMPOUNDS } from './car.js';

export const RACE = { laps: 58, pitLoss: 21.4, fuelStart: 105, burn: 1.75, kFuel: 0.033 };
const DRY = ['soft', 'medium', 'hard'];

export function stintTimes(base, compound, startLap, laps, fresh = true) {
  const c = COMPOUNDS[compound], out = [];
  for (let a = 0; a < laps; a++) {
    const lap = startLap + a, fuel = RACE.fuelStart - RACE.burn * lap;
    const age = a + (fresh ? 0 : 3);
    const cliff = age > c.cliff ? 0.06 * (age - c.cliff) ** 1.6 : 0;
    out.push(base + c.delta + c.deg * age + cliff + RACE.kFuel * (fuel - 50));
  }
  return out;
}
export function planTime(base, plan) {
  let lap = 0, T = 0; const laps = [];
  plan.forEach((st, i) => { const ts = stintTimes(base, st.c, lap, st.n); ts.forEach((x, k) => laps.push({ lap: lap + k + 1, t: x + (k === 0 && i > 0 ? RACE.pitLoss : 0), c: st.c, pit: k === 0 && i > 0 })); T += ts.reduce((a, b) => a + b, 0) + (i > 0 ? RACE.pitLoss : 0); lap += st.n; });
  return { T, laps };
}
export function optimise(base) {
  const N = RACE.laps, best = { 1: null, 2: null };
  for (const a of DRY) for (const b of DRY) {
    if (a === b) continue;
    for (let n1 = 8; n1 <= N - 8; n1++) { const p = [{ c: a, n: n1 }, { c: b, n: N - n1 }], r = planTime(base, p); if (!best[1] || r.T < best[1].T) best[1] = { plan: p, ...r }; }
  }
  for (const a of DRY) for (const b of DRY) for (const c of DRY) {
    if (a === b && b === c) continue;
    for (let n1 = 6; n1 <= N - 12; n1 += 1) for (let n2 = 6; n1 + n2 <= N - 6; n2 += 1) { const p = [{ c: a, n: n1 }, { c: b, n: n2 }, { c, n: N - n1 - n2 }], r = planTime(base, p); if (!best[2] || r.T < best[2].T) best[2] = { plan: p, ...r }; }
  }
  return best;
}
