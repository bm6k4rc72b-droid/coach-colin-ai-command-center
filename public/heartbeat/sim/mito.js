// HEARTBEAT · the neuron and its mitochondria during ischaemia and reperfusion.
//
// A small, physically consistent model (time in seconds, concentrations in mM
// unless noted). It is built so each step of the ischaemic cascade emerges from
// the one before rather than being scripted:
//
//  1. Oxygen falls → the electron transport chain (ETC) slows → the membrane
//     potential ΔΨm drops.
//  2. ATP synthase is driven by the proton-motive force against the free energy
//     of ATP synthesis:  flux ∝ n·F·Δp − ΔG_ATP,  n = 8/3 + 1 = 3.67 H⁺/ATP
//     (8-subunit c-ring makes 3 ATP per turn, plus one H⁺ for phosphate import).
//     When Δp is too low the sign flips and the synthase runs in REVERSE,
//     burning ATP to hold ΔΨm up.
//  3. Phosphocreatine buffers ATP for about a minute; anaerobic glycolysis
//     (2 ATP per glucose instead of ~31) adds a little and makes lactate (pH ↓).
//  4. The Na⁺/K⁺ pump (3 Na⁺ out, 2 K⁺ in per ATP) fails → Na⁺ in, K⁺ out.
//     The membrane voltage is the chord-conductance balance of the Na⁺, K⁺ and
//     glutamate-receptor currents plus the electrogenic pump current.
//  5. Depolarisation releases glutamate and transporters can no longer clear it
//     (they need the Na⁺ gradient) → NMDA/AMPA channels open → a runaway
//     "anoxic depolarisation" with Ca²⁺ flooding in.
//  6. Mitochondria take up Ca²⁺ through the uniporter (driven by ΔΨm).
//  7. Succinate piles up during ischaemia. On reperfusion it is oxidised fast
//     and drives reverse electron transport at complex I → a burst of reactive
//     oxygen species (Chouchani et al., Nature 2014).
//  8. Mitochondrial Ca²⁺ + ROS open the permeability transition pore (mPTP).
//     Acidosis keeps it shut during ischaemia; it opens as pH recovers on
//     reperfusion (the "pH paradox"). An open mPTP collapses ΔΨm, swells the
//     mitochondrion and releases cytochrome c → caspases → apoptosis.
//
// Rate constants are tuned so the timeline matches the classic observations
// for complete ischaemia: PCr gone in ~1 min, anoxic depolarisation after
// ~2 min, ATP near zero by ~4–5 min, tissue pH ≈ 6.3–6.5.

export const R = 8.314, F = 96485, T37 = 310.15;
export const RT_F = (R * T37) / F * 1000;          // 26.73 mV at 37 °C
export const RT_kJ = (R * T37) / 1000;             // 2.579 kJ/mol
export const H_PER_ATP = 8 / 3 + 1;                // 3.667
export const DG0 = 30.5;                           // kJ/mol, ATP hydrolysis at pH 7 (standard)
export const DPH_MV = 28;                          // chemical part of Δp: 61.5 mV × ΔpH (≈ 0.45)

// ATP from one glucose with complete oxidation (P/O: NADH 2.5, FADH₂ 1.5).
export const ATP_LEDGER = [
  ['glycolysis', 'ATP', 2, 1, 2], ['glycolysis', 'NADH', 2, 2.5, 5],
  ['pdh', 'NADH', 2, 2.5, 5], ['tca', 'GTP', 2, 1, 2], ['tca', 'NADH', 6, 2.5, 15], ['tca', 'FADH2', 2, 1.5, 3],
];
export const ATP_TOTAL = ATP_LEDGER.reduce((a, r) => a + r[4], 0);   // 32 (30 with the glycerol-phosphate shuttle)

const sig = (x) => 1 / (1 + Math.exp(-x));
const NAO = 145, KI0 = 140, NAI0 = 12, KO0 = 3;
// Leak conductances calibrated so that at rest (Vm = −70 mV, pump 0.21 mM/s) the
// Na⁺ influx is exactly 3× and the K⁺ efflux exactly 2× the pump turnover.
// Glutamate-receptor channels pass Na⁺ and K⁺ with a reversal near 0 mV, so
// their conductance splits as a = −E_K/(E_Na − E_K) to Na⁺ and 1 − a to K⁺.
const ENA0 = RT_F * Math.log(NAO / NAI0), EK0 = RT_F * Math.log(KO0 / KI0);
const G_SPLIT = -EK0 / (ENA0 - EK0);
const GG_MAX = 0.02, GLU_KD = 25, GG0 = GG_MAX / (1 + GLU_KD), PUMP0 = 0.21;
const G_NA = (3 * PUMP0) / (ENA0 + 70) - G_SPLIT * GG0;
export const ROS_PTP = 0.36;                         // ROS level that (with matrix Ca²⁺) opens the mPTP
const G_K = (2 * PUMP0) / (-70 - EK0) - (1 - G_SPLIT) * GG0;

export const MITO_REST = {
  o: 1, glc: 1, atp: 2.5, pcr: 5.0, psi: 176, nai: NAI0, ko: KO0, glu: 1, cai: 0.1, cam: 0.05,
  succ: 0.2, ros: 0.05, gsh: 1, lac: 1.2, ptp: 0, cytc: 0, casp: 0, dmg: 0,
};

export class Neuron {
  constructor() {
    this.s = { ...MITO_REST };
    this.p = 1; this.pGoal = 1;       // perfusion fraction (CBF/50)
    this.temp = 37; this.sdhBlock = false; this.gradual = false;
    this.t = 0; this.trace = []; this.acc = 0; this.fate = 'alive';
    this.events = {};
    for (let i = 0; i < 15000; i++) this.stepOnce(0.02);     // settle at rest
    this.t = 0; this.trace.length = 0; this.events = {};
  }
  setPerfusion(p, { ramp = 0 } = {}) { this.pGoal = p; this.rampRate = ramp > 0 ? 1 / ramp : 0; if (!ramp) this.p = p; }
  reset() { const keep = { temp: this.temp, sdhBlock: this.sdhBlock, gradual: this.gradual }; Object.assign(this, new Neuron(), keep); }

  // Derived quantities.
  derived(s = this.s) {
    const ki = KI0 - (s.nai - NAI0), nao = NAO - (s.ko - KO0) * 0.25;   // K⁺ leaves as Na⁺ enters; ECS is ~¼ of cell volume
    const ENa = RT_F * Math.log(nao / s.nai), EK = RT_F * Math.log(s.ko / ki);
    const q = 2.5 ** ((this.temp - 37) / 10);                              // Q10 ≈ 2.5
    const pump = PUMP0 * q * ((s.atp / (s.atp + 0.35)) / (2.5 / 2.85)) * ((s.nai / (s.nai + 20)) / (NAI0 / (NAI0 + 20))) * ((s.ko / (s.ko + 1.5)) / (KO0 / (KO0 + 1.5)));
    const gG = GG_MAX * (s.glu / (s.glu + GLU_KD));                      // glutamate-receptor conductance
    // Channel arrest: when O₂ is short, synaptic activity falls silent and background
    // conductances fall with it, roughly halving the pump's workload.
    const act = sig((s.o - 0.3) / 0.07), arrest = 0.45 + 0.55 * act;
    const gNa = G_NA * arrest * q + G_SPLIT * gG, gK = G_K * arrest * q + (1 - G_SPLIT) * gG;
    const Vm = (gNa * ENa + gK * EK - pump) / (gNa + gK);                  // chord conductance + electrogenic pump
    const adp = Math.max(0.005, 2.6 - s.atp), pi = 1 + (5 - s.pcr) + (2.5 - s.atp);
    const dG = DG0 + RT_kJ * Math.log((s.atp * 1e-3) / (adp * 1e-3 * pi * 1e-3));
    const dp = s.psi * (1 + DPH_MV / 176);                                 // ΔpH shrinks with ΔΨm
    const drive = (H_PER_ATP * F * dp * 1e-6) - dG;                        // kJ/mol available per ATP
    const pH = 7.05 - 0.035 * (s.lac - 1.2);
    return { ki, ENa, EK, Vm, pump, gG, gNa, gK, dG, dp, drive, pH, q, adp, pi, act };
  }

  deriv(s) {
    const d = this.derived(s), q = d.q, k = {};
    // 1. Oxygen and glucose follow perfusion.
    k.o = (Math.min(1, 2.2 * this.p) - s.o) / 8;            // O₂ extraction can roughly double when flow falls
    // 2. ETC proton pumping (ΔΨm units per s), limited by O₂, back-pressure and an open mPTP.
    const etc = 220 * s.o * Math.max(0, 1 - s.psi / 215) * (1 - 0.95 * s.ptp);
    // ATP synthase: forward when the drive is positive, reverse (hydrolysis) when negative.
    // Reverse mode is partly braked by the inhibitory factor IF1, which binds at low matrix pH.
    const syn = 0.028 * d.drive * (d.drive < 0 ? 0.35 : 1) * (1 - 0.9 * s.ptp);   // mM ATP/s
    const synH = syn * 55;                                              // ΔΨm cost of that flux
    const leak = 0.11 * s.psi + 400 * s.ptp * (s.psi / 180);           // proton leak; mPTP = huge leak
    const mcu = 0.9 * (s.cai ** 2 / (s.cai ** 2 + 1)) * sig((s.psi - 120) / 15);   // uniporter, needs ΔΨm
    k.psi = etc - leak - synH - 25 * mcu;
    // 3. Glycolysis (anaerobic part scales up when O₂ is short), glucose supply, lactate, PCr buffer.
    const glyc = 0.025 * q * Math.min(1, s.glc * 4) * (0.35 + 1.0 * (1 - s.o)) * (1 - 0.6 * sig((7.05 - d.pH - 0.7) / 0.08));
    k.glc = 0.05 * this.p * (1.05 - s.glc) - glyc * 0.12;              // delivery vs use (glucose + glycogen store)
    const lacOut = 0.012 * s.o * (s.lac - 1.2) + 0.04 * this.p * (s.lac - 1.2);
    k.lac = 2 * glyc * (1 - s.o) - lacOut;
    const ck = 2 * (s.pcr * d.adp - 0.04 * (10 - s.pcr) * s.atp);        // creatine kinase near equilibrium (total Cr 10 mM)
    // ATP use: pump + housekeeping + synaptic activity (falls silent when O₂ is short).
    const act = d.act;
    const use = d.pump + q * (0.045 + 0.095 * act) * (s.atp / (s.atp + 0.2)) + 0.004 * s.cai;
    k.atp = syn + 2 * glyc * (1 - s.o) + ck - use;                        // anaerobic glycolysis: 2 ATP per glucose
    k.pcr = -ck;
    // 4. Ions (mM/s). Glutamate channels carry Na⁺ in and K⁺ out.
    k.nai = d.gNa * (d.ENa - d.Vm) - 3 * d.pump;
    const kOut = d.gK * (d.Vm - d.EK) - 2 * d.pump;
    const glia = 0.08 * (s.ko - KO0) * (s.atp / 2.5);                   // astrocyte K⁺ buffering needs energy too
    k.ko = 4 * kOut - glia;
    // 5. Glutamate (µM): release on depolarisation and by reversed uptake; uptake needs the Na⁺ gradient.
    const gradNa = Math.max(0, (d.ENa - d.Vm) / 135);
    const rel = q * (2.4 + 220 * sig((d.Vm + 35) / 3)) * (0.3 + 0.7 * Math.min(1, s.atp / 1.2)) + 60 * sig((s.nai - 45) / 6);
    const relCap = Math.max(0, 1 - s.glu / 500);                         // vesicle pools run out
    const upt = 4 * s.glu * gradNa * (0.2 + 0.8 * s.atp / 2.5);
    k.glu = rel * relCap - upt;
    // 6. Cytosolic Ca²⁺ (µM): NMDA influx, pumps out with ATP, mitochondrial uptake.
    const caIn = (1 - Math.min(1, s.cai / 40)) * (0.012 + 0.5 * d.gG / GG_MAX * sig((d.Vm + 30) / 8) + 0.6 * sig((s.nai - 50) / 6) * (1 - s.atp / 2.5));   // extracellular Ca²⁺ depletes
    const caOut = 0.12 * (s.cai - 0.02) * (s.atp / (s.atp + 0.4));
    k.cai = caIn - caOut - mcu + 0.02 * s.ptp * s.cam;
    k.cam = mcu * 0.2 - 0.015 * (s.cam - 0.05) - 0.1 * s.ptp * s.cam;
    // 7. Succinate and ROS. Reverse electron transport needs succinate, O₂ and a high Δp.
    const succMake = (this.sdhBlock ? 0.25 : 1) * q * 0.02 * (1 - s.o) * sig((0.45 - s.o) / 0.08) * Math.max(0, 1 - s.succ / 8);
    const succOx = Math.max(0, (this.sdhBlock ? 0.15 : 1) * 0.02 * s.o * (s.succ - 0.2));
    k.succ = succMake - succOx;
    // RET scales with how FAST succinate is being oxidised (it over-reduces the CoQ pool), so
    // slowing SDH or letting O₂ back gradually blunts the burst.
    const ret = q * 20 * succOx ** 1.5 * sig((s.psi - 130) / 10);
    const rosMake = 0.004 + ret + 0.01 * s.ptp + 0.002 * s.cam;
    k.ros = rosMake - s.ros * (0.05 + 0.1 * s.gsh);                      // glutathione + other antioxidant systems
    k.gsh = 0.01 * (1 - s.gsh) * s.o - 0.02 * s.ros * s.gsh;
    // 8. mPTP: opened by matrix Ca²⁺ and ROS, held shut by acidosis.
    const drivePTP = sig((s.cam - 1.2) / 0.15) * sig((s.ros - ROS_PTP) / 0.015) * sig((d.pH - 6.75) / 0.06);
    k.ptp = 0.5 * drivePTP * (1 - s.ptp) - 0.08 * s.ptp;
    k.cytc = 0.02 * s.ptp * (1 - s.cytc);
    k.casp = 0.02 * Math.max(0, s.cytc - 0.2) * (s.atp > 0.4 ? 1 : 0.2) * (1 - s.casp);   // apoptosis needs some ATP
    k.dmg = (s.atp < 0.4 && s.cai > 1.5 ? 0.0012 : 0) * (1 - s.dmg);      // necrotic damage
    return k;
  }

  stepOnce(h) {
    if (this.rampRate) this.p += Math.sign(this.pGoal - this.p) * Math.min(Math.abs(this.pGoal - this.p), this.rampRate * h);
    else this.p = this.pGoal;
    const s = this.s, k1 = this.deriv(s);
    const mid = {}; for (const key in k1) mid[key] = s[key] + 0.5 * h * k1[key];
    const k2 = this.deriv(mid);
    for (const key in k2) {
      s[key] += h * k2[key];                                       // midpoint RK2 (stiff terms kept mild)
    }
    // Keep state physical.
    s.o = Math.min(1, Math.max(0, s.o)); s.glc = Math.min(1.2, Math.max(0, s.glc)); s.atp = Math.min(2.6, Math.max(0.01, s.atp));
    s.pcr = Math.min(5.2, Math.max(0, s.pcr)); s.psi = Math.max(0, s.psi); s.nai = Math.min(130, Math.max(5, s.nai));
    s.ko = Math.min(80, Math.max(2.5, s.ko)); s.glu = Math.max(0.1, s.glu); s.cai = Math.max(0.03, s.cai); s.cam = Math.max(0, s.cam);
    s.succ = Math.max(0.1, s.succ); s.ros = Math.max(0, s.ros); s.gsh = Math.min(1, Math.max(0, s.gsh)); s.lac = Math.max(0.5, s.lac);
    for (const key of ['ptp', 'cytc', 'casp', 'dmg']) s[key] = Math.min(1, Math.max(0, s[key]));
    this.t += h;
    const ev = this.events, dd = this.derived();
    if (ev.ad == null && s.ko > 20) ev.ad = this.t;                                   // anoxic depolarisation
    if (ev.pcr == null && s.pcr < 0.5) ev.pcr = this.t;
    if (ev.atp == null && s.atp < 0.5) ev.atp = this.t;
    if (ev.reverse == null && dd.drive < 0) ev.reverse = this.t;
    if (ev.ptp == null && s.ptp > 0.3) ev.ptp = this.t;
    if (s.dmg > 0.6) this.fate = 'necrosis'; else if (s.casp > 0.5) this.fate = 'apoptosis'; else if (s.cytc > 0.15) this.fate = 'committed'; else this.fate = 'alive';
  }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.stepOnce(h); this.acc += h;
      if (this.acc >= 0.5) { this.acc -= 0.5; const d = this.derived(); const s = this.s; this.trace.push([this.t, s.atp, s.psi, d.Vm, s.cai, s.ros, s.ptp, d.pH, s.ko, s.glu, s.pcr]); if (this.trace.length > 2400) this.trace.shift(); }
    }
  }
}
