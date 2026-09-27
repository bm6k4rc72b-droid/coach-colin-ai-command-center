// ─────────────────────────────────────────────────────────────────────────────
// RAPTOR LAB · ENGINE DYNAMICS
//
// A lumped-parameter model of a full-flow staged-combustion cycle, integrated
// with classical 4th-order Runge–Kutta at a fixed 1 ms step.
//
//   Fuel side:  fuel pump ─► all fuel ─► FUEL-RICH preburner (+ a little LOX) ─► fuel turbine ─► chamber
//   Ox side:    ox pump   ─► all LOX  ─► OX-RICH preburner (+ a little CH4)  ─► ox turbine   ─► chamber
//
// State (continuous):
//   nF, nO      turbopump speeds as a fraction of rated speed
//   pc          main-chamber pressure (Pa)
//   TpbF, TpbO  preburner (turbine-inlet) gas temperatures, first-order lag (K)
//   TlineF/O    propellant feed-line wall temperatures (K)
//   macc        unburned propellant pooled in the chamber (kg)
//
// Turbopump spool dynamics — the power balance of a rotating shaft:
//   J·ω·dω/dt = P_turbine − P_pump          (ω = n·ω_rated)
//   P_pump    = (ṁ/ρ)·Δp/η_p + churn,       Δp = Δp_rated · n² · (1 − 0.8·cav)   (affinity law)
//   P_turbine = η_t · ṁ_gas · cp · T_in · [1 − PR^(−(γ−1)/γ)]
//   PR        = p_preburner / p_chamber-inlet
// Chamber filling:
//   dpc/dt = (pc_ss − pc)/τ_c,              pc_ss = ṁ_burned · c* / At
// Line chill-down:
//   dT_line/dt = −(T_line − T_bulk)·(k_chill + k_flow) + (T_amb − T_line)·k_warm
// Cavitation: inducer margin = p_tank − p_vapour(T_inlet) against the required
// net positive suction pressure NPSP_req = NPSP_rated · n².
// ─────────────────────────────────────────────────────────────────────────────

import { GEOM, RATED, PROP, P_SL, BAR, vaporPressure, performance, products, cstar, plume, acoustics } from './thermo.js';

const RATED_PERF = performance(RATED.pc, RATED.MR);
const MDOT = RATED_PERF.mdot;                          // ≈ 632 kg/s
const MDOT_F = MDOT / (1 + RATED.MR), MDOT_O = MDOT - MDOT_F;

// Rated turbopump design point.
export const TP = {
  F: { rpm: 24000, dp: 600 * BAR, rho: PROP.ch4.rho, etaP: 0.74, cp: 3600, gam: 1.30, npsp: 0.9 * BAR },
  O: { rpm: 17500, dp: 600 * BAR, rho: PROP.lox.rho, etaP: 0.76, cp: 1080, gam: 1.33, npsp: 0.9 * BAR },
  dpInjPB: 60 * BAR, dpInjMain: 50 * BAR,
  spool: 0.22,          // spool time constant at rated power, s (J·ω² = P_rated · spool)
};
// Preburner chemistry (per kg): CH4 lower heating value, O2 needed per kg CH4 (stoichiometric).
const LHV = 50.0e6, O2_PER_CH4 = 3.989;
const HVAP = { ch4: 0.510e6, lox: 0.213e6 };
export const LIMITS = { TpbO: 900, TpbOfire: 1000, TpbF: 1050, over: 1.12, MRhot: 4.6, pcHard: 1.25 };
// Preburner valve → mixture.  FPB: ox/fuel mass ratio = 0.36·pos.  OPB: fuel mass fraction = 0.024·pos.
export const PBV = { fpbMR: 0.36, opbF: 0.024 };

// Fuel-rich preburner outlet temperature from an energy balance (ox-limited combustion):
//   T = T_in + ( o·LHV/(O2/CH4) − (1−o)·h_vap,CH4 ) / cp_F,     o = ox mass fraction
export function tempFPB(MR) { const o = MR / (1 + MR); return 120 + Math.max(0, o * LHV / O2_PER_CH4 - (1 - o) * HVAP.ch4) / TP.F.cp; }
// Ox-rich preburner outlet temperature (fuel-limited combustion), f = fuel mass fraction:
//   T = T_in + ( f·LHV − (1−f)·h_vap,O2 ) / cp_O
export function tempOPB(f) { return 95 + Math.max(0, f * LHV - (1 - f) * HVAP.lox) / TP.O.cp; }

const RATED_POS = { fpb: 0.78, opb: 0.772 };
const ratedTpbF = tempFPB(PBV.fpbMR * RATED_POS.fpb), ratedTpbO = tempOPB(PBV.opbF * RATED_POS.opb);

// Lumped hydraulic resistances (Pa per (kg/s)²), fixed by the rated pressure schedule:
//   pump discharge ≈ 603 bar → preburner injector −60 → preburner ≈ 543 → turbine → 350 → main injector −50 → pc 300.
const NET = (() => {
  const pdF = PROP.ch4.pTank + TP.F.dp, pdO = PROP.lox.pTank + TP.O.dp;
  const KF = (pdF - RATED.pc) / MDOT_F ** 2, KO = (pdO - RATED.pc) / MDOT_O ** 2;
  const KpbF = TP.dpInjPB / MDOT_F ** 2, KpbO = TP.dpInjPB / MDOT_O ** 2;
  const KmiF = TP.dpInjMain / MDOT_F ** 2, KmiO = TP.dpInjMain / MDOT_O ** 2;
  const ppbF = pdF - TP.dpInjPB, ppbO = pdO - TP.dpInjPB;
  return { KF, KO, KpbF, KpbO, KmiF, KmiO, dXO: pdO - ppbF, dXF: pdF - ppbO, ppbF, ppbO, pout: RATED.pc + TP.dpInjMain + 0.3 * BAR };
})();

function pumpPower(side, mdot, n, cav) {
  const S = TP[side];
  const dp = S.dp * n * n * (1 - 0.8 * cav);
  return (mdot / S.rho) * dp / S.etaP;
}
function turbineTerm(side, PR) { const g = TP[side].gam; return 1 - Math.pow(Math.max(1, PR), -(g - 1) / g); }

// Calibrate each turbine's effective efficiency so the rated point is an exact power balance.
const CAL = (() => {
  const pF = pumpPower('F', MDOT_F, 1, 0), pO = pumpPower('O', MDOT_O, 1, 0);
  const oxFPB = PBV.fpbMR * RATED_POS.fpb * MDOT_F;
  const fOPB = PBV.opbF * RATED_POS.opb, fuelOPB = fOPB / (1 - fOPB) * (MDOT_O - oxFPB);
  const gasF = MDOT_F - fuelOPB + oxFPB, gasO = MDOT_O - oxFPB + fuelOPB;
  const tF = gasF * TP.F.cp * ratedTpbF * turbineTerm('F', NET.ppbF / NET.pout);
  const tO = gasO * TP.O.cp * ratedTpbO * turbineTerm('O', NET.ppbO / NET.pout);
  return { etaF: (pF * 1.08) / tF, etaO: (pO * 1.08) / tO, PF: pF, PO: pO };   // 1.08: 8 % covers churn at rated
})();

export class Engine {
  constructor() { this.reset(); }

  reset() {
    this.t = 0;
    this.s = { nF: 0, nO: 0, pc: 0, TpbF: 290, TpbO: 290, TlineF: 290, TlineO: 290, macc: 0 };
    this.s.mfLast = 0; this.s.moLast = 0;   // not integrated: last solved flows, for the c* estimate
    // Valve positions: `cmd` is where the valve is told to go, `pos` where it is (slew-limited).
    this.v = {};
    for (const k of ['chill', 'purge', 'mfv', 'mov', 'fpb', 'opb']) this.v[k] = { cmd: 0, pos: 0 };
    this.spin = false; this.ign = false;
    this.lit = { F: false, O: false, main: false };
    this.throttleCmd = 1.0; this.throttle = 0; this.closedLoop = false;
    this.gimbal = { cmdP: 0, cmdY: 0, p: 0, y: 0 };
    this.env = { pa: P_SL };
    this.purgeTime = 0; this.purgeAfter = 0;
    this.health = { wall: 0, turbO: 0, turbF: 0, pumpF: 0, pumpO: 0, hardStart: 0, sepTime: 0, cavTime: 0, overspeed: 0 };
    this.peak = { pc: 0, TpbO: 0, TpbF: 0, MR: 0, nF: 0, nO: 0, pcRatio: 0 };
    this.events = [];
    this.failed = null;
    this.out = this.#outputs(this.s);
    this.ctl = { iF: 0, iO: 0 };
  }

  // ── Commands ───────────────────────────────────────
  set(valve, cmd) { this.v[valve].cmd = Math.max(0, Math.min(1, cmd)); this.#log(`${valve}:${cmd > 0 ? 'open' : 'close'}`); }
  log(e) { this.#log(e); }
  #log(e) { this.events.push({ t: this.t, e, nF: this.s.nF, nO: this.s.nO, pc: this.s.pc, TpbO: this.s.TpbO }); }

  // ── Algebraic relations: the hydraulic network, solved for a given state ──
  // Each feed system is a pump in series with a lumped resistance K (valve, preburner
  // injector, turbine, main injector) ending in the common chamber:
  //     p_tank + Δp_pump(n) − K·ṁ² = pc,        pc = (ṁ_F + ṁ_O + ṁ_burst) · c* / At
  // For a trial pc each side gives ṁ_i = √((p_d,i − pc)/K_i); the right-hand side falls
  // monotonically with pc, so the fixed point is found by bisection.
  #flows(s) {
    const V = this.v;
    const q = (x) => x * (2 - x);                                       // quick-opening valve characteristic
    const cavOf = (prop, Tline, n, npsp) => {
      const Tin = prop.Tbulk + 0.3 * (Tline - prop.Tbulk);
      const margin = prop.pTank - vaporPressure(prop, Tin);
      const req = npsp * Math.max(0.05, n * n);
      return { cav: Math.min(1, Math.max(0, (req - margin) / req)), margin, Tin };
    };
    const cF = cavOf(PROP.ch4, s.TlineF, s.nF, TP.F.npsp), cO = cavOf(PROP.lox, s.TlineO, s.nO, TP.O.npsp);
    const pdF = PROP.ch4.pTank + TP.F.dp * s.nF * s.nF * (1 - 0.8 * cF.cav);
    const pdO = PROP.lox.pTank + TP.O.dp * s.nO * s.nO * (1 - 0.8 * cO.cav);
    const Kof = (Ktot, v) => { const qv = q(v); return qv < 1e-3 ? Infinity : Ktot * 0.97 + Ktot * 0.03 / (qv * qv); };
    const KF = Kof(NET.KF, V.mfv.pos), KO = Kof(NET.KO, V.mov.pos);
    const burning = this.lit.main;
    // Characteristic velocity of what leaves the chamber: hot gas if lit, a cold spray if not.
    const MRguess = s.mfLast > 1e-3 ? s.moLast / s.mfLast : RATED.MR;
    const P = products(MRguess || RATED.MR);
    const cs = burning ? cstar(P.gamma, P.R, P.Tc) * RATED.etaCstar : 300;
    const burst = burning ? s.macc * 22 : 0;                            // pooled propellant burning off, kg/s
    const mdotAt = (pc, pd, K) => (pd > pc && K < Infinity ? Math.sqrt((pd - pc) / K) : 0);
    let lo = 0, hi = Math.max(pdF, pdO, 1);
    for (let i = 0; i < 48; i++) {
      const pc = 0.5 * (lo + hi);
      const rhs = (mdotAt(pc, pdF, KF) + mdotAt(pc, pdO, KO) + burst) * cs / GEOM.At;
      if (rhs > pc) lo = pc; else hi = pc;
    }
    const pcAlg = 0.5 * (lo + hi);
    const mf = mdotAt(pcAlg, pdF, KF) * (1 - 0.3 * cF.cav), mo = mdotAt(pcAlg, pdO, KO) * (1 - 0.3 * cO.cav);
    // Pressures along each branch.
    const ppbF = Math.max(0, pdF - NET.KpbF * mf * mf), ppbO = Math.max(0, pdO - NET.KpbO * mo * mo);
    const poutF = pcAlg + NET.KmiF * mf * mf + 0.3 * BAR, poutO = pcAlg + NET.KmiO * mo * mo + 0.3 * BAR;
    // Cross-feed to each preburner follows the orifice law ṁ ∝ √Δp, where Δp is the OTHER pump's
    // discharge minus this preburner's pressure, normalised to 1 at the rated point. A fast fuel
    // pump with a slow ox pump pushes extra fuel into the ox-rich preburner, and vice versa.
    const driveOx = Math.min(2.5, Math.sqrt(Math.max(0, pdO - ppbF) / NET.dXO));
    const driveFu = Math.min(2.5, Math.sqrt(Math.max(0, pdF - ppbO) / NET.dXF));
    const oxFPB = Math.min(mo * 0.5, PBV.fpbMR * V.fpb.pos * MDOT_F * driveOx);
    const fuelOPB = Math.min(mf * 0.5, (PBV.opbF / (1 - PBV.opbF)) * V.opb.pos * (MDOT_O - PBV.fpbMR * RATED_POS.fpb * MDOT_F) * driveFu);
    const gasF = Math.max(0, mf - fuelOPB) + oxFPB, gasO = Math.max(0, mo - oxFPB) + fuelOPB;
    const MRpbF = mf > 1e-3 ? oxFPB / Math.max(1e-3, mf - fuelOPB) : 0;
    const fracOPB = gasO > 1e-3 ? fuelOPB / gasO : 0;
    const TtF = this.lit.F ? tempFPB(MRpbF) : Math.min(290, PROP.ch4.Tbulk + 0.5 * (s.TlineF - PROP.ch4.Tbulk));
    const TtO = this.lit.O ? tempOPB(fracOPB) : Math.min(290, PROP.lox.Tbulk + 0.5 * (s.TlineO - PROP.lox.Tbulk));
    return { mf, mo, cF, cO, pdF, pdO, ppbF, ppbO, poutF, poutO, oxFPB, fuelOPB, gasF, gasO, MRpbF, fracOPB, TtF, TtO, pcAlg, burst, cs };
  }

  // Time derivatives of the continuous state.
  #deriv(s) {
    const f = this.#flows(s);
    // Turbine powers: η·ṁ·cp·T·[1 − PR^(−(γ−1)/γ)], PR = preburner / turbine-outlet pressure.
    const PT = (side, gas, T, ppb, pout, eta) => eta * gas * TP[side].cp * T * turbineTerm(side, ppb / pout);
    let PtF = PT('F', f.gasF, s.TpbF, f.ppbF, f.poutF, CAL.etaF), PtO = PT('O', f.gasO, s.TpbO, f.ppbO, f.poutO, CAL.etaO);
    // Spin-start gas (helium) drives both turbines while the valve is held.
    if (this.spin) { PtF += 0.03 * CAL.PF * Math.max(0, 1 - s.nF / 0.4); PtO += 0.03 * CAL.PO * Math.max(0, 1 - s.nO / 0.4); }
    const churn = (P, n) => 0.08 * P * n * n * n + 0.004 * P * n;   // fluid churning ∝ n³ plus bearing and seal drag ∝ n
    const PpF = pumpPower('F', f.mf, s.nF, f.cF.cav) + churn(CAL.PF, s.nF);
    const PpO = pumpPower('O', f.mo, s.nO, f.cO.cav) + churn(CAL.PO, s.nO);
    const J = (P) => P * TP.spool;                                         // J·ω_rated²
    const dnF = (PtF - PpF) / (J(CAL.PF) * Math.max(0.06, s.nF));
    const dnO = (PtO - PpO) / (J(CAL.PO) * Math.max(0.06, s.nO));
    const MR = f.mf > 1e-3 ? f.mo / f.mf : 0;
    // Chamber pressure follows the network solution with the gas-filling lag (τ = 8 ms).
    const dpc = (f.pcAlg - s.pc) / 0.008;
    const dmacc = this.lit.main ? -f.burst : (f.mf + f.mo) * 0.9 - s.macc / 0.6;
    // Preburner temperature lag (τ = 60 ms).
    const dTF = (f.TtF - s.TpbF) / 0.06, dTO = (f.TtO - s.TpbO) / 0.06;
    // Line chill-down: bleed flow (chill valve) and main flow both cool the line; ambient warms it.
    const kF = 0.55 * this.v.chill.pos + 3 * f.mf / MDOT_F, kO = 0.55 * this.v.chill.pos + 3 * f.mo / MDOT_O;
    const dLF = -(s.TlineF - PROP.ch4.Tbulk) * kF + (290 - s.TlineF) * 0.012;
    const dLO = -(s.TlineO - PROP.lox.Tbulk) * kO + (290 - s.TlineO) * 0.012;
    return { d: { nF: dnF, nO: dnO, pc: dpc, TpbF: dTF, TpbO: dTO, TlineF: dLF, TlineO: dLO, macc: dmacc }, f, MR, PtF, PtO, PpF, PpO };
  }

  // Classical RK4 on the state vector.
  #rk4(h) {
    const s = this.s;
    const add = (a, k, c) => { const o = { ...a }; for (const key in k) o[key] = a[key] + k[key] * c; return o; };
    const r1 = this.#deriv(s), k1 = r1.d;
    const k2 = this.#deriv(add(s, k1, h / 2)).d;
    const k3 = this.#deriv(add(s, k2, h / 2)).d;
    const k4 = this.#deriv(add(s, k3, h)).d;
    for (const key in k1) s[key] += (h / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]);
    s.nF = Math.max(0, s.nF); s.nO = Math.max(0, s.nO); s.pc = Math.max(0, s.pc); s.macc = Math.max(0, s.macc);
    s.mfLast = r1.f.mf; s.moLast = r1.f.mo;
  }

  step(dt) {
    const h = 0.001;
    const n = Math.max(1, Math.round(dt / h));
    for (let i = 0; i < n; i++) this.#tick(h);
    this.out = this.#outputs(this.s);
    return this.out;
  }

  #tick(h) {
    this.t += h;
    // Valve slew: 2.5 /s (a full stroke in 0.4 s); chill and purge valves are faster.
    for (const [k, v] of Object.entries(this.v)) { const rate = k === 'chill' || k === 'purge' ? 5 : 2.5; v.pos += Math.max(-rate * h, Math.min(rate * h, v.cmd - v.pos)); }
    // Ignition: spark-torch igniters light whatever has propellant in it.
    const f = this.#flows(this.s);
    if (this.ign && !this.failed) {
      if (!this.lit.F && f.oxFPB > 0.5 && f.mf > 1) { this.lit.F = true; this.#log('lit:FPB'); }
      if (!this.lit.O && f.fuelOPB > 0.05 && f.mo > 1) { this.lit.O = true; this.#log('lit:OPB'); }
      if (!this.lit.main && f.mf > 1 && f.mo > 1) { this.lit.main = true; this.ignitionMacc = Math.max(this.ignitionMacc || 0, this.s.macc); this.#log('lit:main'); }
    }
    // Flame-out when a preburner loses its minor propellant.
    if (this.lit.F && (this.v.fpb.pos < 0.02 || f.mf < 0.5)) { this.lit.F = false; this.#log('out:FPB'); }
    if (this.lit.O && (this.v.opb.pos < 0.02 || f.mo < 0.5)) { this.lit.O = false; this.#log('out:OPB'); }
    if (this.lit.main && f.mf + f.mo < 2) { this.lit.main = false; this.#log('out:main'); }
    // Purge accounting.
    if (this.lit.main) this.hasRun = true;
    // Purge accounting: before start, and after the engine has run and gone out (safing).
    if (this.v.purge.pos > 0.5) { this.purgeTime += h; if (this.hasRun && !this.lit.main && this.s.pc < 2 * BAR) this.purgeAfter += h; }
    this.#controller(h, f);
    this.#rk4(h);
    // Gimbal actuators: rate-limited to 20°/s.
    for (const ax of ['p', 'y']) { const c = ax === 'p' ? this.gimbal.cmdP : this.gimbal.cmdY; this.gimbal[ax] += Math.max(-20 * h, Math.min(20 * h, c - this.gimbal[ax])); }
    this.#health(h, f);
  }

  // Closed-loop mainstage control (engine computer): once engaged it trims the
  // fuel-preburner valve to hold pc = throttle × rated and the ox-preburner valve
  // to hold MR = 3.6. Proportional–integral, with feed-forward from the rated positions.
  // Hand over to closed loop without a bump: start from the current pressure and valve positions.
  engage(throttle = 1) {
    if (this.closedLoop) { this.throttleCmd = throttle; return; }
    this.closedLoop = true; this.throttleCmd = throttle;
    this.throttle = Math.min(1, this.s.pc / RATED.pc);
    const ff = 0.6 + 0.4 * this.throttle;
    this.ctl.iF = this.v.fpb.pos - RATED_POS.fpb * ff;
    this.ctl.iO = this.v.opb.pos - RATED_POS.opb * ff;
    this.#log('closed-loop');
  }

  #controller(h, f) {
    if (!this.closedLoop) return;
    this.throttle += Math.max(-0.25 * h, Math.min(0.25 * h, this.throttleCmd - this.throttle));   // 25 %/s ramp
    const s = this.s;
    const ePc = (this.throttle * RATED.pc - s.pc) / RATED.pc;
    const MR = f.mf > 1 ? f.mo / f.mf : RATED.MR;
    const eMR = (RATED.MR - MR) / RATED.MR;
    this.ctl.iF = Math.max(-0.5, Math.min(0.5, this.ctl.iF + ePc * h * 1.2));
    this.ctl.iO = Math.max(-0.5, Math.min(0.5, this.ctl.iO + (ePc * 0.8 + eMR) * h * 1.0));
    const ff = 0.6 + 0.4 * this.throttle;
    this.v.fpb.cmd = Math.max(0.05, Math.min(1, RATED_POS.fpb * ff + 0.9 * ePc + this.ctl.iF));
    this.v.opb.cmd = Math.max(0.05, Math.min(1, RATED_POS.opb * ff + 0.7 * ePc + 0.6 * eMR + this.ctl.iO));
  }

  #health(h, f) {
    const s = this.s, H = this.health, P = this.peak;
    const MR = f.mf > 1 ? f.mo / f.mf : 0;
    P.pc = Math.max(P.pc, s.pc); P.TpbO = Math.max(P.TpbO, s.TpbO); P.TpbF = Math.max(P.TpbF, s.TpbF);
    P.nF = Math.max(P.nF, s.nF); P.nO = Math.max(P.nO, s.nO);
    if (s.pc > 20 * BAR) P.MR = Math.max(P.MR, MR);
    // Hard start: chamber pressure far above what the flow alone would give.
    const expected = (f.mf + f.mo) * 1840 / GEOM.At;
    if (this.lit.main && s.pc > 30 * BAR) { const r = s.pc / Math.max(expected, 60 * BAR); P.pcRatio = Math.max(P.pcRatio, r); if (r > LIMITS.pcHard) H.hardStart = Math.max(H.hardStart, (r - 1)); }
    // Ox-rich turbine: hot oxygen attacks metal above ~900 K.
    if (s.TpbO > LIMITS.TpbO) H.turbO += h * (s.TpbO - LIMITS.TpbO) / 100;
    if (s.TpbF > LIMITS.TpbF) H.turbF += h * (s.TpbF - LIMITS.TpbF) / 150;
    // Ox-rich main chamber ("engine-rich combustion"): the copper liner burns.
    // A full-flow engine injects gas–gas. If the fuel preburner is not lit, the methane arrives
    // cold and vaporises slowly, so the zone that is actually burning runs far richer in oxygen
    // than the bulk ratio: MR_eff = ṁ_O / (ṁ_F · φ), φ ≈ 0.4 for cold fuel.
    const MReff = f.mf > 1 ? MR / (this.lit.O && !this.lit.F ? 0.4 : 1) : 0;
    this.MReff = MReff;
    if (MReff > LIMITS.MRhot && s.pc > 20 * BAR) H.wall += h * (MReff - LIMITS.MRhot) * 0.9;
    // Cavitating pumps and overspeed.
    if (f.cF.cav > 0.15 && s.nF > 0.1) { H.pumpF += h * f.cF.cav; H.cavTime += h; }
    if (f.cO.cav > 0.15 && s.nO > 0.1) { H.pumpO += h * f.cO.cav; H.cavTime += h; }
    if (s.nF > LIMITS.over) H.overspeed += h * (s.nF - LIMITS.over) * 10;
    if (s.nO > LIMITS.over) H.overspeed += h * (s.nO - LIMITS.over) * 10;
    // Flow separation in the nozzle (sea level, deep throttle).
    if (this.closedLoop && this.out && this.out.perf && this.out.perf.sep > 0.2) H.sepTime += h;   // steady running only; start/stop transients pass through it briefly
    // Catastrophic limits → automatic cut-off.
    if (!this.failed) {
      if (s.TpbO > LIMITS.TpbOfire) this.#fail('oxfire');
      else if (H.wall > 1) this.#fail('wall');
      else if (s.nF > 1.3 || s.nO > 1.3 || H.overspeed > 1) this.#fail('overspeed');
      else if (H.hardStart > 0.8) this.#fail('hardstart');
      else if (H.pumpF + H.pumpO > 1.5) this.#fail('cavitation');
      else if (s.TpbF > 1300) this.#fail(H.cavTime > 0.3 ? 'cavitation' : 'fuelturb');
    }
  }
  #fail(kind) { this.failed = { kind, t: this.t }; this.#log('fail:' + kind); this.safe(); }

  // Engine computer safe shutdown (also used by ABORT): fuel-rich, ox side first.
  safe() {
    this.closedLoop = false; this.spin = false;
    this.v.opb.cmd = 0;
    this.pendingSafe = [{ at: this.t + 0.25, fn: () => { this.v.fpb.cmd = 0; this.v.mov.cmd = 0; } }, { at: this.t + 0.6, fn: () => { this.v.mfv.cmd = 0; this.ign = false; this.v.purge.cmd = 1; } }];
  }
  runPending() {
    if (!this.pendingSafe) return;
    this.pendingSafe = this.pendingSafe.filter((p) => { if (this.t >= p.at) { p.fn(); return false; } return true; });
    if (!this.pendingSafe.length) this.pendingSafe = null;
  }

  #outputs(s) {
    const r = this.#deriv(s), f = r.f;
    const MR = r.MR;
    const perf = s.pc > 2 * BAR && this.lit.main ? performance(s.pc, MR || RATED.MR, this.env.pa) : null;
    const pl = perf ? plume(s.pc, perf.gamma, this.env.pa) : null;
    const ac = perf ? acoustics(perf.gamma, perf.R, perf.Tc) : null;
    const thrust = perf ? perf.F * Math.min(1, (f.mf + f.mo) / Math.max(1, perf.mdot)) : 0;
    return {
      pcBar: s.pc / BAR, MR, mf: f.mf, mo: f.mo, mdot: f.mf + f.mo,
      thrust, Isp: perf ? perf.Isp : 0, perf, plume: pl, ac,
      rpmF: s.nF * TP.F.rpm, rpmO: s.nO * TP.O.rpm, nF: s.nF, nO: s.nO,
      TpbF: s.TpbF, TpbO: s.TpbO, TlineF: s.TlineF, TlineO: s.TlineO,
      cavF: f.cF.cav, cavO: f.cO.cav, marginF: f.cF.margin, marginO: f.cO.margin, TinF: f.cF.Tin, TinO: f.cO.Tin,
      MRpbF: f.MRpbF, fracOPB: f.fracOPB, ppbF: f.ppbF, ppbO: f.ppbO,
      PtF: r.PtF, PtO: r.PtO, PpF: r.PpF, PpO: r.PpO, macc: s.macc,
    };
  }
}

export const RATED_INFO = { perf: RATED_PERF, MDOT, MDOT_F, MDOT_O, ratedTpbF, ratedTpbO, CAL, RATED_POS };
