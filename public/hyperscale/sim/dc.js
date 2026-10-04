// HYPERSCALE · the physics and maths of an AI data center. Every number on screen comes from these models.
// Constants are representative of public datasheets and engineering references; they are teaching values,
// not a specification for any real product or site.

// ── Accelerators ────────────────────────────────────────────────────────────────
// Three generic accelerator classes with spec-sheet-like numbers (dense BF16 peak, memory, board power).
export const ACCEL = {
  a700: { peak: 989e12, hbm: 80, tdp: 700 },
  a1000: { peak: 2250e12, hbm: 192, tdp: 1000 },
  a1200: { peak: 2500e12, hbm: 186, tdp: 1200 },
};
// All-in IT power per accelerator: the chip plus its share of CPUs, NICs, switches, storage and fans.
// 1.4·TDP + 300 W gives ≈1.28 kW for a 700 W part (an 8-GPU server draws ≈10.2 kW).
export const allIn = (tdp) => 1.4 * tdp + 300;

// ── 1 · TRAIN: compute, time and the scaling law ────────────────────────────────
// Training a dense transformer costs C ≈ 6·N·D FLOPs (2 forward + 4 backward per parameter per token).
// Wall-clock time t = C / (n · peak · MFU), MFU = model FLOPs utilisation.
// Loss follows the Chinchilla fit (Hoffmann et al. 2022): L(N, D) = E + A/N^α + B/D^β.
export const CHIN = { E: 1.69, A: 406.4, B: 410.7, a: 0.34, b: 0.28 };
export const loss = (N, D) => CHIN.E + CHIN.A / N ** CHIN.a + CHIN.B / D ** CHIN.b;
// Minimising L subject to 6ND = C (Lagrange): N_opt = G·(C/6)^(β/(α+β)), D_opt = (C/6)^(α/(α+β))/G,
// G = (αA / βB)^(1/(α+β)).
export function optimal(C) {
  const { A, B, a, b } = CHIN, G = ((a * A) / (b * B)) ** (1 / (a + b)), N = G * (C / 6) ** (b / (a + b)), D = (C / 6) / N;
  return { N, D, L: loss(N, D) };
}
export function train({ N, D, n, mfu, acc }) {
  const X = ACCEL[acc], C = 6 * N * D, rate = n * X.peak * mfu, sec = C / rate, days = sec / 86400, L = loss(N, D), opt = optimal(C);
  const stateTB = (16 * N) / 1e12, minGPUs = Math.ceil((16 * N) / (X.hbm * 1e9 * 0.8));   // Adam mixed precision ≈ 16 bytes/param
  const mwh = (n * allIn(X.tdp) * sec) / 3.6e9;                                            // IT energy, MWh
  return { C, rate, sec, days, L, opt, gap: L - opt.L, ratio: D / N, stateTB, minGPUs, gpuHours: (n * sec) / 3600, mwh };
}
// The loss along the iso-FLOP curve (fixed C, varying N) for the chart.
export function isoFlop(C, n0 = 1e9, n1 = 2e12) { const pts = []; for (let k = 0; k <= 80; k++) { const N = n0 * (n1 / n0) ** (k / 80), D = C / (6 * N); pts.push([Math.log10(N), loss(N, D)]); } return pts; }

// ── 2 · POWER: the campus and the grid ──────────────────────────────────────────
// Peak facility power = n · P_all-in · PUE. Annual energy E = n · P_all-in · u · PUE · 8760 h.
// Lifecycle emissions, gCO2e/kWh: IPCC AR5 WG3 Annex III medians (coal 820, gas CC 490, solar PV utility 48,
// wind onshore 11, nuclear 12); "grid" is the 2023 US average, ≈370 g/kWh (EIA).
export const SUPPLY = { grid: { g: 370, cf: 1 }, gas: { g: 490, cf: 0.85 }, solar: { g: 48, cf: 0.25 }, wind: { g: 11, cf: 0.35 }, nuclear: { g: 12, cf: 0.92 } };
export const HOME_KWH = 10791;                                         // average US home, kWh/yr (EIA)
export function power({ n, acc, u, pue, supply, price }) {
  const X = ACCEL[acc], it = (n * allIn(X.tdp)) / 1e6, peak = it * pue, avg = it * u * pue, gwh = (avg * 8760) / 1000, S = SUPPLY[supply];
  const kt = (gwh * 1e6 * S.g) / 1e9, cost = gwh * 1000 * price, nameplate = avg / S.cf;           // kt CO2e, $, MW to build
  return { it, peak, avg, gwh, kt, cost, homes: (gwh * 1e6) / HOME_KWH, nameplate, km2: supply === 'solar' ? nameplate / 45 : supply === 'wind' ? nameplate / 3 : 0, overhead: peak - it };
}

// ── 3 · COOL: moving heat with fluid ────────────────────────────────────────────
// Q = ṁ·c_p·ΔT. Air: ρ 1.2 kg/m³, c_p 1005 J/kgK. Water: ρ 997, c_p 4186.
// Fan/pump power = V̇·Δp/η. A chiller's COP is a fraction of Carnot: COP = 0.5·T_evap/(T_cond − T_evap).
// Free cooling works while the return water is warmer than the outside heat sink plus an approach:
// dry cooler: ambient dry-bulb + 8 K; evaporative tower: wet-bulb + 4 K. The chiller trims the rest.
// Evaporation removes h_fg ≈ 2.43 MJ per kg of water; blowdown at 4 cycles of concentration adds a third.
export const AIR = { rho: 1.2, cp: 1005, dT: 12, dp: 600, eta: 0.6 };
export const WATER = { rho: 997, cp: 4186, dT: 10, dp: 250e3, eta: 0.65 };
export const DESIGN = { 20: { wb: 14 }, 35: { wb: 21 }, 45: { wb: 25 } };
export const T_MAX = 85;                                               // throttle limit (representative), °C
export const AIR_RACK_MAX = 2.5;                                       // m³/s of air per rack (≈5,300 CFM)
export const airFlowPerKW = () => 1000 / (AIR.rho * AIR.cp * AIR.dT);   // m³/s per kW
export const waterFlowPerKW = () => 1000 / (WATER.rho * WATER.cp * WATER.dT);
export const carnotCOP = (Tevap, Tcond) => 0.5 * (Tevap + 273.15) / Math.max(1, Tcond - Tevap);
export function cool({ mode, amb, supply, rack, tdp }) {
  const wb = DESIGN[amb]?.wb ?? amb - 12, dist = 0.04, misc = 0.01, airPerKW = airFlowPerKW(), wPerKW = waterFlowPerKW();
  const fanAir = (airPerKW * AIR.dp) / AIR.eta / 1000, pump = (wPerKW * WATER.dp) / WATER.eta / 1000;   // kW per kW of IT
  let fans, pumps, sinkFans, chilled, cop, wue = 0, chip, sw, sinkT;
  if (mode === 'air') {
    sw = 12; fans = fanAir; pumps = 0; sinkFans = 0.02; sinkT = amb + 8;
    chilled = Math.min(1, Math.max(0, (sinkT - sw) / WATER.dT)); cop = carnotCOP(sw - 2, amb + 10);
    chip = 24 + 0.06 * tdp;                                              // inlet air 24 °C, heat-sink resistance 0.06 K/W
  } else {
    sw = supply; fans = 0.15 * fanAir; pumps = pump; sinkFans = mode === 'tower' ? 0.015 : 0.03; sinkT = mode === 'tower' ? wb + 4 : amb + 8;
    chilled = Math.min(1, Math.max(0, (sinkT - sw) / WATER.dT)); cop = carnotCOP(sw - 2, (mode === 'tower' ? wb : amb) + 10);
    chip = sw + WATER.dT / 2 + 0.03 * tdp;                              // cold plate, 0.03 K/W
    if (mode === 'tower') wue = (3.6e6 / 2.43e6) * 0.85 * (4 / 3) * (1 + chilled / cop);   // L per kWh of IT
  }
  const chiller = chilled / cop, pue = 1 + dist + misc + fans + pumps + sinkFans + chiller;
  const rackAir = rack * (mode === 'air' ? 1 : 0.15) * airPerKW, airOK = rackAir <= AIR_RACK_MAX;
  return { pue, wue, chip, chipOK: chip <= T_MAX, chilled, cop, parts: { dist, misc, fans, pumps, sinkFans, chiller }, airPerKW, wPerKW, rackAir, airOK, cfm: rackAir * 2118.88, lpm: rack * wPerKW * 60000, sinkT, sw, wb };
}

// ── 4 · FABRIC: the network that makes one computer out of many ────────────────
// Data-parallel groups all-reduce their gradients every step. Ring all-reduce moves 2(d−1)/d of the
// gradient per GPU: t = 2(d−1)/d · S/BW + 2(d−1)·α. Communication overlaps the backward pass (≈ 2/3 of compute).
// A folded-Clos (fat-tree) of k-port switches reaches 2·(k/2)^t hosts in t tiers with (2t−1)·n/k switches.
export const STEP_TOKENS = 16e6;
export function tiersFor(n, k) { for (let t = 1; t <= 6; t++) if (2 * (k / 2) ** t >= n) return t; return 7; }
export function fabric({ n, gbps, k, m, N, acc, mfu }) {
  const X = ACCEL[acc], t = tiersFor(n, k), switches = Math.ceil(((2 * t - 1) * n) / k), links = t * n, optics = 2 * t * n;
  const alpha = 1.5e-6 + (2 * t - 1) * 0.6e-6 + 2 * t * 50 * 5e-9;    // NIC + switch hops + 50 m of fibre per hop
  const d = Math.max(1, n / m), S = (2 * N) / m, BW = (gbps * 1e9) / 8;
  const tc = (6 * N * STEP_TOKENS) / (n * X.peak * mfu), tBw = d > 1 ? ((2 * (d - 1)) / d) * (S / BW) : 0, tLat = d > 1 ? 2 * (d - 1) * alpha : 0, tar = tBw + tLat;
  const exposed = Math.max(0, tar - (2 / 3) * tc), eff = tc / (tc + exposed);
  return { t, switches, links, optics, opticsMW: (optics * 15) / 1e6, alpha, d, S, tc, tBw, tLat, tar, exposed, eff, cap: 2 * (k / 2) ** t };
}

// ── 5 · OPERATE: one day in the life ────────────────────────────────────────────
// 32,768 accelerators (1,000 W class). Clock scaling (DVFS): dynamic power ∝ f·V² and V ∝ f, so
// P_chip = P_idle + (TDP − P_idle)·s³ while throughput ∝ s. Heat leaves through dry coolers (UA·(T_loop − T_amb))
// plus a 15 MW trim chiller; the water loop's heat capacity C·dT/dt = Q_in − Q_out sets how fast it warms.
export const OPS = { n: 32768, tdp: 1000, idle: 0.2, grid: 75, dr: 45, batt: 40, battP: 20, UA: 4.3e6, chillMax: 10e6, C: 500e3 * 4186, setp: 45, R: 0.032 };
export const chipW = (s) => OPS.tdp * (OPS.idle + (1 - OPS.idle) * s ** 3);
export const ambient = (h, wave) => 25 + 8 * Math.max(0, Math.sin((Math.PI * (h - 8)) / 14)) + (wave ? 11 * Math.max(0, Math.sin((Math.PI * (h - 12)) / 6)) * (h > 12 && h < 18 ? 1 : 0) : 0);
export const priceAt = (h) => (h >= 17 && h < 21 ? 180 : h >= 10 && h < 15 ? 25 : h < 6 ? 35 : 70);
export const demandAt = (h) => 0.33 + 0.27 * Math.max(0, Math.sin((Math.PI * (h - 7)) / 16)) ** 1.5;   // fraction of the fleet at full clock
export function newDay() { return { h: 0, loop: OPS.setp, soc: 0.5, served: 0, asked: 0, trainWork: 0, trainIdeal: 0, cost: 0, kg: 0, mwh: 0, throttled: 0, drOK: true, drWorst: 0, peakChip: 0, log: [], done: false, hist: [] }; }
// One simulated minute. ctl: { s (clock 0.5–1), train (bool), batt ('auto'|'hold'|'charge'|'discharge') }.
export function dayStep(S, ctl) {
  const dtH = 1 / 60, h = S.h, wave = true, amb = ambient(h, wave), dem = demandAt(h), n = OPS.n;
  let s = ctl.s; const hot = S.loop + OPS.R * chipW(s) > T_MAX; if (hot) s = Math.min(s, 0.6);   // firmware throttle
  const cap = s, inf = Math.min(dem, cap), trainShare = ctl.train ? Math.max(0, 1 - inf / Math.max(cap, 1e-9)) : 0;
  const busy = inf / Math.max(cap, 1e-9) + trainShare, perGPU = busy * chipW(s) + (1 - busy) * OPS.tdp * 0.1;   // idle parts park at 10 % TDP
  const itW = n * (1.4 * perGPU + 300 * (0.4 + 0.6 * busy)), Q = itW;
  // Heat rejection: the chiller holds the setpoint up to its capacity; the dry coolers do the rest.
  // Dry-cooler fans slow down rather than chill the loop below its setpoint.
  const qDry = Math.max(0, Math.min(OPS.UA * (S.loop - amb), Q + (S.loop - OPS.setp) * 4e6)), need = Math.max(0, Q - qDry), qCh = Math.min(OPS.chillMax, need + Math.max(0, (S.loop - OPS.setp) * 2e6));
  const cop = carnotCOP(S.loop - 7, amb + 10), chW = qCh / cop;
  S.loop += ((Q - qDry - qCh) * dtH * 3600) / OPS.C; S.loop = Math.max(amb + 1, S.loop);
  const facW = itW * 1.07 + chW + 0.03 * qDry;                          // distribution, fans
  // Battery.
  const dr = h >= 18 && h < 19; let bP = 0; const mode = ctl.batt;
  if (mode === 'discharge' || (mode === 'auto' && (dr || priceAt(h) >= 180))) bP = Math.min(OPS.battP, (S.soc * OPS.batt) / dtH, Math.max(0, facW / 1e6 - (dr ? OPS.dr - 2 : 0)));
  else if (mode === 'charge' || (mode === 'auto' && priceAt(h) <= 35 && S.soc < 1)) bP = -Math.min(OPS.battP, ((1 - S.soc) * OPS.batt) / dtH / 0.9);
  if (mode === 'auto' && dr) bP = Math.min(OPS.battP, (S.soc * OPS.batt) / dtH, Math.max(0, facW / 1e6 - (OPS.dr - 1)));
  bP = Math.max(bP, facW / 1e6 - OPS.grid);                          // never charge past the interconnect limit
  S.soc = Math.min(1, Math.max(0, S.soc - (bP > 0 ? bP : bP * 0.9) * dtH / OPS.batt));
  const gridMW = facW / 1e6 - bP, chip = S.loop + OPS.R * chipW(s);
  S.asked += dem * dtH; S.served += inf * dtH; S.trainWork += (ctl.train ? (cap - inf) : 0) * dtH; S.trainIdeal += (1 - dem) * dtH;
  S.mwh += gridMW * dtH; S.cost += gridMW * dtH * priceAt(h); S.kg += gridMW * dtH * 370; S.peakChip = Math.max(S.peakChip, chip);
  if (hot) S.throttled += dtH;
  if (dr) { S.drWorst = Math.max(S.drWorst, gridMW); if (gridMW > OPS.dr + 0.05) S.drOK = false; }
  S.now = { h, amb, dem, s, hot, inf, cap, itMW: itW / 1e6, facMW: facW / 1e6, gridMW, bP, chip, loop: S.loop, chMW: chW / 1e6, qDryMW: qDry / 1e6, price: priceAt(h), dr, pue: facW / itW };
  if (Math.round(h * 60) % 10 === 0) S.hist.push([h, gridMW, chip, amb, dem * 100, s * 100]);
  S.h += dtH; if (S.h >= 24 - 1e-9) S.done = true;
  return S.now;
}
// The autopilot: keep inference whole, ride the clock down before the chips get hot, pause training for the
// demand-response hour, and let the battery buy cheap and sell dear.
export function autoCtl(S, ctl) {
  const n = S.now, h = S.h, dr = h >= 18 && h < 19;
  let s = ctl.s; if (n) { if (n.chip > 82.5) s -= 0.004; else if (n.chip < 80) s += 0.002; }
  s = Math.max(Math.min(1, s), Math.min(1, demandAt(h) + 0.04));
  return { s, train: !(dr && S.soc < 0.45), batt: 'auto' };
}
export const sla = (S) => (S.asked ? S.served / S.asked : 1);
