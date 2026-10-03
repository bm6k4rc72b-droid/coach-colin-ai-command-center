// STRIDE · footwear science models. Each one is small, transparent and tied to a cited study (see EVIDENCE).

// ── 1 · Foams ───────────────────────────────────────────────────────────────────
// Mechanical energy return measured by Hoogkamer et al. (2018): EVA 66 %, TPU 76 %, PEBA 87 %.
// Peak compression strain at ~2.5× body weight is a model value (softer foams squash further).
export const FOAMS = {
  eva: { er: 0.66, strain: 0.22, col: '#d9d8d0' },
  tpu: { er: 0.76, strain: 0.25, col: '#dcd6c4' },
  peba: { er: 0.87, strain: 0.3, col: '#b9dd2e' },
};
export const PLATES = { none: 0, rods: 0.5, plate: 0.8 };
export const REF = { foam: 'eva', stack: 25, plate: 'none', mass: 230 };   // a traditional racing shoe

// ── 2 · Predicted change in running economy (energy cost), % (negative = better) ──
// A transparent, calibrated teaching model, not a lab measurement:
//   foam:  −k·(ER·√(stack/35) − ER_ref·√(25/35)), k = 8.1 %, so that new PEBA vs new EVA at the same
//          stack ≈ −1.8 % (Rodrigo-Carranza et al. 2024)
//   lever: −0.04 % per mm of stack above 25 mm (to 45 mm); +0.15 %/mm above 40 mm for instability
//   plate: −0.8 % (full plate) or −0.5 % (rods). Small on purpose: cutting the Vaporfly plate changed
//          economy by only 0.55 ± 1.77 % (Healey & Hoogkamer 2022)
//   mass:  +1.11 % per 100 g per shoe (Hoogkamer et al. 2016)
// Result: a Vaporfly-like shoe ≈ −3 to −4 % vs a traditional racer (measured −4.16 %, Hoogkamer et al. 2018).
export function shoeModel({ foam = 'peba', stack = 35, plate = 'plate', mass = 200, wornKm = 0 }) {
  const F = FOAMS[foam], er = F.er * (1 - wearER(foam, wornKm));
  const Es = er * Math.sqrt(stack / 35), Eref = FOAMS[REF.foam].er * Math.sqrt(REF.stack / 35);
  const terms = {
    foam: -8.1 * (Es - Eref),
    lever: -0.04 * (Math.min(stack, 45) - REF.stack),
    instab: stack > 40 ? 0.15 * (stack - 40) : 0,
    plate: -PLATES[plate],
    mass: (1.11 * (mass - REF.mass)) / 100,
  };
  const total = Object.values(terms).reduce((a, b) => a + b, 0);
  return { terms, total, er, Es, legalRoad: stack <= 40, legalTrack: stack <= 20 };
}

// ── 3 · Foam mechanics: a hysteresis loop with exactly the foam's energy return ──
// Loading F = Fmax·(x/xmax)^p, unloading F = Fmax·(x/xmax)^q. Stored = Fmax·xmax/(p+1),
// returned = Fmax·xmax/(q+1). Choosing q = (p+1)/ER − 1 makes returned/stored = ER exactly.
export function hysteresis({ foam, stack, bw = 70, wornKm = 0, p = 1.6 }) {
  const F = FOAMS[foam], er = F.er * (1 - wearER(foam, wornKm)), Fmax = 2.5 * bw * 9.81, xmax = F.strain * stack * (1 - 0.25 * wearStiff(foam, wornKm));
  const q = (p + 1) / er - 1, stored = (Fmax * xmax / 1000) / (p + 1), back = stored * er;
  const load = [], unload = []; for (let i = 0; i <= 40; i++) { const x = (i / 40) * xmax; load.push([x, Fmax * (x / xmax) ** p]); unload.push([x, Fmax * (x / xmax) ** q]); }
  return { load, unload, stored, back, lost: stored - back, xmax, Fmax, er };
}

// ── 4 · Wear (Rodrigo-Carranza et al. 2024, 22 trained runners, 13 km/h) ──
// New PEBA beat new EVA by 1.8 %; after 450 km the PEBA shoe's cost rose 2.28 % while EVA's barely changed
// (0.06 ± 0.58 W/kg, ≈ +0.4 %). Modelled as a linear rise to 450 km, half as steep beyond.
const WEAR = { peba: 2.28, eva: 0.4, tpu: 0.9 };
export function wearPenalty(foam, km) { const a = WEAR[foam] ?? 1; return km <= 450 ? (a * km) / 450 : a + (a * (km - 450)) / 900; }
const wearER = (foam, km) => Math.min(0.2, wearPenalty(foam, km) / 8.1 / 1.1);    // fraction of ER lost (display only)
const wearStiff = (foam, km) => Math.min(1, km / 900);
// Relative cost (% vs new EVA) of each foam after km of use.
export const wearCurve = (foam, km) => (foam === 'peba' ? -1.8 : 0) + wearPenalty(foam, km);
export function crossover() { let lo = 0, hi = 2000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (wearCurve('peba', m) < wearCurve('eva', m)) lo = m; else hi = m; } return (lo + hi) / 2; }

// ── 5 · From economy to race time (the method of Kipp, Kram & Hoogkamer 2019) ──
// Treadmill oxygen cost rises linearly with speed but has a positive intercept (Léger & Mercier 1984 form):
//   VO₂ (ml·kg⁻¹·min⁻¹) = 2.209 + 3.1633·v (km/h); 1 ml O₂ ≈ 20.1 J.
// Overground you also push air: P_air = ½ρ·C_dA·v³ (C_dA 0.24 m², ρ 1.2), at ~28 % efficiency
// (≈ 2 % of the cost at 3.3 m/s and ≈ 8 % at 6 m/s, in line with Pugh 1971).
// A shoe saving s scales the running part; we solve for the speed that uses the same metabolic power.
const RUN = (v) => ((2.209 + 3.1633 * v * 3.6) * 20.1) / 60;      // W/kg
const AIR = (v, m) => (0.5 * 1.2 * 0.24 * v ** 3) / 0.28 / m;       // W/kg
export function newSpeed(v0, s, m = 60) {
  const P = RUN(v0) + AIR(v0, m); let lo = v0 * 0.9, hi = v0 * 1.2;
  for (let i = 0; i < 60; i++) { const v = (lo + hi) / 2; if ((1 - s) * RUN(v) + AIR(v, m) < P) lo = v; else hi = v; }
  return (lo + hi) / 2;
}
export const DIST = { '5k': 5000, '10k': 10000, half: 21097.5, marathon: 42195 };
export function racePredict(distKey, t0, savingPct, m = 60) {
  const D = DIST[distKey], v0 = D / t0, v1 = newSpeed(v0, savingPct / 100, m), t1 = D / v1;
  return { v0, v1, t1, dt: t0 - t1, pct: ((t0 - t1) / t0) * 100, airShare: AIR(v0, m) / (RUN(v0) + AIR(v0, m)) };
}
export const fmtTime = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

// ── 6 · Evidence ────────────────────────────────────────────────────────────────
// effect: change in running economy or performance (%, negative = better) where a single number applies.
export const EVIDENCE = [
  { id: 'hoog18', y: 2018, ref: 'Hoogkamer W, Kipp S, Frank JH, Farina EM, Luo G, Kram R. A comparison of the energetic cost of running in marathon racing shoes. Sports Med. 2018;48:1009–1019.', effect: -4.16, n: 18, kind: 'RE' },
  { id: 'barnes19', y: 2019, ref: 'Barnes KR, Kilding AE. A randomized crossover study investigating the running economy of highly-trained male and female distance runners in marathon racing shoes versus track spikes. Sports Med. 2019;49:331–342.', effect: -4.2, n: 24, kind: 'RE' },
  { id: 'hoog16', y: 2016, ref: 'Hoogkamer W, Kipp S, Spiering BA, Kram R. Altered running economy directly translates to altered distance-running performance. Med Sci Sports Exerc. 2016;48(11):2175–2180.', effect: 1.11, n: 18, kind: 'mass' },
  { id: 'kipp19', y: 2019, ref: 'Kipp S, Kram R, Hoogkamer W. Extrapolating metabolic savings in running: implications for performance predictions. Front Physiol. 2019;10:79.', effect: null, kind: 'model' },
  { id: 'bermon21', y: 2021, ref: 'Bermon S, Garrandes F, Szabo A, Berkovics I, Adami PE. Effect of advanced shoe technology on the evolution of road race times in male and female elite runners. Front Sports Act Living. 2021;3:653173.', effect: -2.0, kind: 'perf' },
  { id: 'healey22', y: 2022, ref: 'Healey LA, Hoogkamer W. Longitudinal bending stiffness does not affect running economy in Nike Vaporfly shoes. J Sport Health Sci. 2022;11(3):285–292.', effect: 0.55, n: 15, kind: 'RE' },
  { id: 'tenforde23', y: 2023, ref: 'Tenforde A, Hoenig T, Saxena A, Hollander K. Bone stress injuries in runners using carbon fiber plate footwear. Sports Med. 2023.', effect: null, kind: 'injury' },
  { id: 'rodrigo24', y: 2024, ref: 'Rodrigo-Carranza V, Hoogkamer W, González-Ravé JM, et al. Influence of different midsole foam in advanced footwear technology use on running economy and biomechanics in trained runners. Scand J Med Sci Sports. 2024;34:e14526.', effect: -1.8, n: 22, kind: 'RE' },
  { id: 'bertschy', y: 2025, ref: 'Bertschy M, Rodrigo-Carranza V, Wilkie EWC, Healey LA, Noble J, Albert WJ, Hoogkamer W. Quantifying the benefits of advanced footwear technology track spikes in middle-distance running (200 m repeat method). J Sport Health Sci. 2024–25.', effect: -2.0, kind: 'perf' },
  { id: 'hebert25', y: 2025, ref: 'Hébert-Losier K, et al. Are super shoes a super placebo? A randomised crossover trial in female recreational runners. Footwear Sci. 2025.', effect: 0, n: 24, kind: 'RE' },
  { id: 'kuz25', y: 2025, ref: 'Kuzmeski J, Bertschy M, Healey L, Barrons Z, Hoogkamer W. Data driven shoe design improves running economy beyond state-of-the-art advanced footwear technology running shoes. J Sport Health Sci. 2025/26 (PUMA collaboration).', effect: -3.62, n: 15, kind: 'RE' },
  { id: 'kobay26', y: 2026, ref: 'Kobayashi EN, de Toledo RRF, de Almeida MO, Sprey JWC, Jorge PB. Metabolic effects of carbon-plated running shoes: a systematic review and meta-analysis. Front Sports Act Living. 2026;7:1710224.', effect: -2.9, kind: 'meta' },
  { id: 'wa24', y: 2024, ref: 'World Athletics Technical Rules (athletic shoe regulations): road shoes ≤ 40 mm sole; track and field shoes ≤ 20 mm from 1 Nov 2024; one rigid plate; shoes must be available for purchase.', effect: null, kind: 'rule' },
];
