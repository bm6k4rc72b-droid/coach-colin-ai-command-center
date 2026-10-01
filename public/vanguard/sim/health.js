// VANGUARD · pilot clearance maths: suit physics, lab reference ranges, the strength and sprint
// gates, questionnaires and the reaction-time battery. Everything here is plain arithmetic so it
// can be checked by hand.

export const G = 9.80665, RHO = 1.225, LB = 0.45359237;

// ── Suit physics (momentum theory for the repulsors) ─────────────────────────
// Hover thrust T = m·g. Ideal induced power of an actuator disc: P = T^(3/2) / √(2ρA);
// real power = P / FM (figure of merit). Induced velocity w = √(T / 2ρA); far-wake jet = 2w.
// Banked turn load factor: n = √(1 + (v²/(r·g))²).
export const SUIT = { mass: 228, fm: 0.72 };
export function hover({ pilot = 90, repD = 0.24, nRep = 4, coreKWh = 120, v = 80, r = 150, eta = 0.9 }) {
  const m = SUIT.mass + pilot, T = m * G, A = nRep * Math.PI * (repD / 2) ** 2;
  const Pi = T ** 1.5 / Math.sqrt(2 * RHO * A), P = Pi / SUIT.fm, w = Math.sqrt(T / (2 * RHO * A));
  const endurance = (coreKWh * 3.6e6 * eta) / P / 60;   // minutes of hover
  const n = Math.sqrt(1 + (v * v / (r * G)) ** 2);
  return { m, T, A, Pi, P, w, jet: 2 * w, endurance, n, diskLoading: T / A };
}

// ── Labs ───────────────────────────────────────────────────────────────────────
// [lo, hi] = the clearance range (adult reference / risk-guideline cut-offs; US units).
// opt = an optional tighter "optimal" band. Only lo/hi decide the gate.
export const LABS = [
  // Heart
  { id: 'ldl', grp: 'heart', unit: 'mg/dL', lo: 0, hi: 100, opt: [0, 70], def: 92, step: 1, max: 250 },
  { id: 'apob', grp: 'heart', unit: 'mg/dL', lo: 0, hi: 90, opt: [0, 70], def: 82, step: 1, max: 200 },
  { id: 'hdl', grp: 'heart', unit: 'mg/dL', lo: 40, hi: 150, opt: [50, 150], def: 52, step: 1, max: 120 },
  { id: 'tg', grp: 'heart', unit: 'mg/dL', lo: 0, hi: 150, opt: [0, 100], def: 96, step: 1, max: 500 },
  { id: 'lpa', grp: 'heart', unit: 'nmol/L', lo: 0, hi: 75, opt: [0, 30], def: 24, step: 1, max: 300 },
  { id: 'sbp', grp: 'heart', unit: 'mmHg', lo: 90, hi: 129, opt: [100, 119], def: 118, step: 1, max: 180 },
  { id: 'rhr', grp: 'heart', unit: 'bpm', lo: 40, hi: 80, opt: [45, 60], def: 58, step: 1, max: 120 },
  // Inflammation
  { id: 'hscrp', grp: 'inflam', unit: 'mg/L', lo: 0, hi: 2.0, opt: [0, 1.0], def: 0.6, step: 0.1, max: 10 },
  { id: 'il6', grp: 'inflam', unit: 'pg/mL', lo: 0, hi: 5.0, opt: [0, 2.0], def: 1.6, step: 0.1, max: 20 },
  { id: 'hcy', grp: 'inflam', unit: 'µmol/L', lo: 4, hi: 15, opt: [5, 10], def: 9, step: 0.5, max: 40 },
  { id: 'fib', grp: 'inflam', unit: 'mg/dL', lo: 200, hi: 400, opt: [200, 350], def: 290, step: 5, max: 700 },
  { id: 'wbc', grp: 'inflam', unit: '×10³/µL', lo: 4.0, hi: 11.0, opt: [4.5, 8.0], def: 6.1, step: 0.1, max: 20 },
  { id: 'ferritin', grp: 'inflam', unit: 'ng/mL', lo: 30, hi: 300, opt: [50, 200], def: 120, step: 5, max: 800 },
  // Metabolic
  { id: 'glucose', grp: 'metab', unit: 'mg/dL', lo: 70, hi: 99, opt: [72, 90], def: 86, step: 1, max: 200 },
  { id: 'a1c', grp: 'metab', unit: '%', lo: 4.0, hi: 5.6, opt: [4.5, 5.3], def: 5.2, step: 0.1, max: 10 },
  { id: 'insulin', grp: 'metab', unit: 'µIU/mL', lo: 2, hi: 19, opt: [2, 8], def: 6, step: 0.5, max: 40 },
  { id: 'vitd', grp: 'metab', unit: 'ng/mL', lo: 30, hi: 100, opt: [40, 70], def: 44, step: 1, max: 150 },
  // Mitochondria
  { id: 'lactate', grp: 'mito', unit: 'mmol/L', lo: 0.5, hi: 2.2, opt: [0.5, 1.5], def: 1.1, step: 0.1, max: 8 },
  { id: 'lp', grp: 'mito', unit: 'ratio', lo: 10, hi: 25, opt: [10, 20], def: 15, step: 1, max: 60 },
  { id: 'coq10', grp: 'mito', unit: 'µg/mL', lo: 0.5, hi: 1.7, opt: [0.8, 1.7], def: 0.9, step: 0.05, max: 3 },
  { id: 'ck', grp: 'mito', unit: 'U/L', lo: 30, hi: 300, opt: [50, 200], def: 180, step: 5, max: 2000 },
  { id: 'vo2', grp: 'mito', unit: 'mL/kg/min', lo: 45, hi: 90, opt: [52, 90], def: 51, step: 1, max: 90 },
];
export const LAB_GROUPS = ['heart', 'inflam', 'metab', 'mito'];
export const labStatus = (L, v) => (v < L.lo || v > L.hi ? 'out' : v >= L.opt[0] && v <= L.opt[1] ? 'opt' : 'in');

// Atherogenic and insulin-resistance indices derived from the panel.
export const homaIR = (glucose, insulin) => (glucose * insulin) / 405;           // mg/dL · µIU/mL
export const tgHdl = (tg, hdl) => tg / hdl;

// ── Strength gates ─────────────────────────────────────────────────────────────
// lb = load in pounds; reps; checks = form standards that must ALL be met.
export const LIFTS = [
  { id: 'bench', lb: 400, reps: 1, rom: 0.42, checks: ['pins', 'nomo', 'lockout'] },
  { id: 'rdl', lb: 500, reps: 5, rom: 0.55, checks: ['pause', 'hinge', 'nostraps'] },
  { id: 'ohp', lb: 100, reps: 5, rom: 0.55, checks: ['pause', 'ecc', 'strict'], perSide: true },
  { id: 'pull', lb: 100, reps: 5, rom: 0.6, checks: ['wide', 'top2', 'dead'], bw: true },
];
// Epley estimated one-rep max, 1RM = w·(1 + r/30) (r = 1 → w itself).
export const epley = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
// Mechanical work per rep against gravity: W = m·g·h (pull-ups move body + added load).
export function liftWork(L, lb, bodyKg) { const m = lb * LB + (L.bw ? bodyKg : 0); return m * G * L.rom; }
export function liftPass(L, entry) { return entry.lb >= L.lb && entry.reps >= L.reps && L.checks.every((c) => entry.checks?.[c]); }

// ── Bike sprints: 10 × 10 s at max resistance, max heart rate ────────────────
// HRmax (Tanaka 2001) = 208 − 0.7·age. Pass: 10 sprints done, peak HR ≥ 95 % HRmax,
// fatigue index FI = (P_best − P_worst) / P_best ≤ 30 %, mean power ≥ 10 W/kg.
export const BIKE = { n: 10, sec: 10, hrPct: 0.95, fiMax: 0.30, wkg: 10 };
export const hrMax = (age) => 208 - 0.7 * age;
export function bikeStats(powers, hrs, age, kg) {
  const P = powers.filter((p) => p > 0), best = Math.max(...P, 0), worst = P.length ? Math.min(...P) : 0;
  const mean = P.length ? P.reduce((a, b) => a + b, 0) / P.length : 0, hm = hrMax(age), peakHr = Math.max(...hrs, 0);
  const fi = best ? (best - worst) / best : 1, work = P.reduce((a, b) => a + b * BIKE.sec, 0) / 1000;
  const ok = { count: P.length >= BIKE.n, hr: peakHr >= BIKE.hrPct * hm, fi: fi <= BIKE.fiMax, wkg: mean / kg >= BIKE.wkg };
  return { best, worst, mean, fi, work, hm, peakHr, wkgMean: mean / kg, ok, pass: Object.values(ok).every(Boolean) };
}

// ── Questionnaires ─────────────────────────────────────────────────────────────
// PHQ-2 and GAD-2 (public-domain screeners): 4 options 0–3 each, positive screen at ≥ 3.
export const PHQ2 = ['phq1', 'phq2'], GAD2 = ['gad1', 'gad2'];
// Sleep: hours, minutes to fall asleep, awakenings, restedness 0–3.
export function sleepScore({ hours, latency, wakes, rested }) {
  const h = Math.max(0, 1 - Math.abs(Math.min(hours, 9) - 8) / 3) * (hours > 10 ? 0.7 : 1);
  const l = latency <= 20 ? 1 : Math.max(0, 1 - (latency - 20) / 40);
  const w = Math.max(0, 1 - wakes / 4), r = rested / 3;
  return Math.round(100 * (0.4 * h + 0.2 * l + 0.2 * w + 0.2 * r));
}
// Physical readiness: training days/week, pain 0–10, injuries, steps (k/day).
export function physScore({ days, pain, injury, steps }) {
  return Math.round(100 * (0.3 * Math.min(1, days / 5) + 0.3 * (1 - pain / 10) + 0.2 * (injury ? 0 : 1) + 0.2 * Math.min(1, steps / 10)));
}
// Autonomic (nervous-system) index from the skin scan: vagal tone from ln RMSSD
// (≈ 2.5 low … 4.5 high) and resting HR. 0–100.
export function ansScore(hr, rmssd) {
  const v = Math.max(0, Math.min(1, (Math.log(Math.max(1, rmssd)) - 2.5) / 2)), h = Math.max(0, Math.min(1, (95 - hr) / 45));
  return Math.round(100 * (0.6 * v + 0.4 * h));
}

// ── Neuro battery ──────────────────────────────────────────────────────────────
// Simple RT (median < 250 ms), choice RT (median < 400 ms, ≥ 90 % correct),
// go/no-go (≤ 1 commission error on no-go trials, go median < 350 ms). Anticipations < 100 ms are void.
export const NEURO = { simple: { n: 10, med: 250 }, choice: { n: 12, med: 400, acc: 0.9 }, gonogo: { n: 20, nogo: 0.25, med: 350, errs: 1 } };
export const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
