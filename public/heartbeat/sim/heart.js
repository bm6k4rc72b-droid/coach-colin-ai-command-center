// HEARTBEAT · left-heart haemodynamics.
//
// Left ventricle: time-varying elastance (Suga & Sagawa), P_lv = E(t)·(V − V0),
// with the double-Hill activation curve of Stergiopulos et al. (1996):
//   g1 = (t/(0.7·Tmax))^1.9,  g2 = (t/(1.17·Tmax))^21.9,
//   e(t) = k · g1/(1+g1) · 1/(1+g2)   (k normalises the peak to 1),
//   E(t) = (Emax − Emin)·e(t) + Emin,  Tmax = 0.2 + 0.15·RR  (s).
// Arteries: three-element Windkessel (Zc, C, R) draining to venous pressure Pv.
// Valves are ideal diodes with a small resistance. The left atrium is a pressure
// source with an atrial "kick" timed by the PR interval; in atrial fibrillation
// the kick is lost and the RR interval becomes irregularly irregular.
// Integrated with RK4 at 0.5 ms.

export const HEART_DEFAULT = {
  hr: 72,          // beats/min
  emax: 2.5,       // mmHg/mL  end-systolic elastance (contractility)
  emin: 0.09,      // mmHg/mL  diastolic elastance
  v0: 10,          // mL       unstressed volume
  pla: 9,          // mmHg     mean left-atrial pressure (preload)
  kick: 3,         // mmHg     atrial systolic boost
  R: 1.0,          // mmHg·s/mL systemic vascular resistance
  C: 1.0,          // mL/mmHg  arterial compliance
  Zc: 0.05,        // mmHg·s/mL characteristic impedance of the aorta
  Pv: 4,           // mmHg     venous pressure
  Rmv: 0.004,      // mmHg·s/mL mitral valve
  Rav: 0.0025,     // mmHg·s/mL aortic valve
  af: false,
};

const PR = 0.16;   // s, P wave onset to QRS

// Normalise the double-Hill curve once so its peak is exactly 1.
const hill = (tn) => { const g1 = (tn / 0.7) ** 1.9, g2 = (tn / 1.17) ** 21.9; return (g1 / (1 + g1)) * (1 / (1 + g2)); };
const HILL_K = (() => { let m = 0; for (let i = 1; i < 4000; i++) m = Math.max(m, hill(i / 2000)); return 1 / m; })();
export const activation = (t, rr) => { const Tmax = 0.2 + 0.15 * rr; return t <= 0 ? 0 : HILL_K * hill(t / Tmax); };

// Seeded PRNG so AF looks the same in the tour and in tests.
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Synthetic lead-II ECG (mV) as a sum of Gaussians around the R peak.
// QT follows Bazett: QTc = QT/√RR ≈ 0.40 s, so the T wave moves with rate.
export function ecg(tb, rr, af, tAbs) {
  const g = (mu, a, w) => a * Math.exp(-0.5 * ((tb - mu) / w) ** 2);
  const gn = (mu, a, w) => a * Math.exp(-0.5 * ((tb - rr - mu) / w) ** 2);  // next beat's P wave
  const qt = 0.4 * Math.sqrt(rr);
  let v = g(-0.02, -0.08, 0.008) + g(0, 1.25, 0.011) + g(0.022, -0.26, 0.009) + g(qt - 0.1, 0.32, 0.055);
  if (!af) v += gn(-PR + 0.04, 0.14, 0.022) + g(-PR + 0.04, 0.14, 0.022);
  else v += 0.045 * Math.sin(tAbs * 2 * Math.PI * 6.3) + 0.03 * Math.sin(tAbs * 2 * Math.PI * 4.7 + 1.3) + 0.02 * Math.sin(tAbs * 2 * Math.PI * 8.1 + 0.4);
  return v;
}

export class Heart {
  constructor(params = {}) {
    this.p = { ...HEART_DEFAULT, ...params };
    this.rand = rng(20260929);
    this.V = 125; this.Pc = 85;            // LV volume (mL), Windkessel capacitor pressure (mmHg)
    this.tb = 0; this.tAbs = 0;            // time since this beat's R wave, absolute time
    this.rr = 60 / this.p.hr; this.nextRR = this.drawRR();
    this.beat = this.freshBeat(); this.last = null; this.beats = 0;
    this.trace = [];                       // [t, Plv, Pao, Pla, V, ecg, Qav] at 250 Hz
    this.sampleAcc = 0; this.stasis = 0;   // left-atrial appendage stasis (AF), 0..1
    // Spin up to a periodic steady state.
    for (let i = 0; i < 12 * 2000; i++) this.stepOnce(0.0005, false);
    this.trace.length = 0;
  }
  set(k, v) { this.p[k] = v; if (k === 'hr' && !this.p.af) this.nextRR = 60 / v; }
  drawRR() {
    const m = 60 / this.p.hr;
    if (!this.p.af) return m;
    // Irregularly irregular: independent RR draws, coefficient of variation ≈ 0.2.
    const u = this.rand() + this.rand() + this.rand() - 1.5;       // ~N(0, 0.5²)
    return Math.max(0.33, m * (1 + 0.4 * u));
  }
  freshBeat() { return { edv: this.V ?? 120, esv: 1e9, sbp: 0, dbp: 1e9, mapInt: 0, t: 0, qInt: 0 }; }
  pla(tb) {
    const { pla, kick, af } = this.p;
    if (af) return pla + 1;                                            // AF: no atrial kick; mean LA pressure rises a little
    const s = this.rr - PR;                                            // atrial systole, ~100 ms before the next R
    const u = (tb - s) / 0.1;
    return pla + (u > 0 && u < 1 ? kick * Math.sin(Math.PI * u) ** 2 : 0);
  }
  deriv(V, Pc, tb) {
    const { emax, emin, v0, R, C, Zc, Pv, Rmv, Rav } = this.p;
    const E = (emax - emin) * activation(tb, this.rr) + emin;
    const Plv = E * (V - v0);
    const Pla = this.pla(tb);
    const Qmv = Math.max(0, (Pla - Plv) / Rmv);
    const Qav = Math.max(0, (Plv - Pc) / (Rav + Zc));
    return { dV: Qmv - Qav, dPc: (Qav - (Pc - Pv) / R) / C, Plv, Pla, Qav, Pao: Pc + Zc * Qav };
  }
  stepOnce(h, record = true) {
    const tb = this.tb;
    const k1 = this.deriv(this.V, this.Pc, tb);
    const k2 = this.deriv(this.V + 0.5 * h * k1.dV, this.Pc + 0.5 * h * k1.dPc, tb + 0.5 * h);
    const k3 = this.deriv(this.V + 0.5 * h * k2.dV, this.Pc + 0.5 * h * k2.dPc, tb + 0.5 * h);
    const k4 = this.deriv(this.V + h * k3.dV, this.Pc + h * k3.dPc, tb + h);
    this.V += (h / 6) * (k1.dV + 2 * k2.dV + 2 * k3.dV + k4.dV);
    this.Pc += (h / 6) * (k1.dPc + 2 * k2.dPc + 2 * k3.dPc + k4.dPc);
    this.tb += h; this.tAbs += h;
    const s = this.deriv(this.V, this.Pc, this.tb);
    this.now = s;
    const B = this.beat;
    B.esv = Math.min(B.esv, this.V); B.sbp = Math.max(B.sbp, s.Pao); B.dbp = Math.min(B.dbp, s.Pao);
    B.mapInt += s.Pao * h; B.t += h; B.qInt += s.Qav * h;
    if (this.p.af) this.stasis = Math.min(1, this.stasis + h / 240); else this.stasis = Math.max(0, this.stasis - h / 60);
    if (record) {
      this.sampleAcc += h;
      if (this.sampleAcc >= 0.004) {
        this.sampleAcc -= 0.004;
        this.trace.push([this.tAbs, s.Plv, s.Pao, s.Pla, this.V, ecg(this.tb, this.rr, this.p.af, this.tAbs), s.Qav]);
        if (this.trace.length > 1500) this.trace.splice(0, this.trace.length - 1500);
      }
    }
    // R wave: close out the beat's statistics and start the next one.
    if (this.tb >= this.rr) {
      const sv = B.qInt;                                       // ejected volume = ∫Q_av dt
      this.last = {
        rr: B.t, hr: 60 / B.t, edv: B.edv, esv: B.esv, sv, ef: sv / B.edv,
        co: (sv * 60 / B.t) / 1000, sbp: B.sbp, dbp: B.dbp, map: B.mapInt / B.t,
        pp: B.sbp - B.dbp, svr: this.p.R * 80, emax: this.p.emax,
      };
      this.beats++;
      this.tb -= this.rr; this.rr = this.nextRR; this.nextRR = this.drawRR();
      this.beat = this.freshBeat(); this.beat.edv = this.V;
      this.onBeat?.(this.last);
    }
  }
  step(dt) { const n = Math.max(1, Math.round(dt / 0.0005)); for (let i = 0; i < n; i++) this.stepOnce(dt / n); }
  // Contraction amount for the 3D heart, 0 (end-diastole) .. 1 (end-systole).
  get squeeze() { const B = this.last; if (!B) return 0; return Math.min(1, Math.max(0, (B.edv - this.V) / Math.max(1, B.sv))); }
}

// Textbook relations shown next to the live numbers.
export const hemo = {
  co: (hr, sv) => hr * sv / 1000,                          // L/min
  mapFormula: (sbp, dbp) => dbp + (sbp - dbp) / 3,         // bedside estimate
  svrWood: (map, cvp, co) => (map - cvp) / co,             // Wood units
  svrDyn: (map, cvp, co) => 80 * (map - cvp) / co,         // dyn·s·cm⁻⁵
};

// CHA₂DS₂-VASc (Lip 2010). Annual stroke/TIA/systemic embolism rate without
// anticoagulation from Friberg et al. 2012 (Swedish AF cohort), %/year.
export const CHADS_ITEMS = [
  ['chf', 1], ['htn', 1], ['age75', 2], ['dm', 1], ['stroke', 2], ['vasc', 1], ['age65', 1], ['female', 1],
];
export const CHADS_RATE = [0.2, 0.6, 2.2, 3.2, 4.8, 7.2, 9.7, 11.2, 10.8, 12.2];
export function chadsVasc(sel) {
  let s = 0;
  for (const [k, w] of CHADS_ITEMS) if (sel[k]) s += w;
  if (sel.age75 && sel.age65) s -= 1;          // age scores 2 (≥75) or 1 (65–74), never both
  return { score: s, rate: CHADS_RATE[Math.min(9, s)] };
}
