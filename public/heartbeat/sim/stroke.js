// HEARTBEAT · acute stroke: perfusion, core and penumbra over time, and the
// treatment pathway.
//
// Each surface vertex of the left hemisphere is a "voxel" with a weight w in the
// middle cerebral artery (MCA) territory (1 at the centre, 0 outside). After an
// M1 occlusion its blood flow falls to
//      CBF = max(2, 50 − (50 − CBFc)·w·n)      mL/100 g/min
// where CBFc is the flow the collaterals keep alive at the centre and n a small
// per-voxel variation. Tissue dies when its flow sits below a threshold that
// rises with time, after Jones et al. (1981): only very low flow kills within
// minutes, while ~17–18 mL/100 g/min is fatal if the occlusion is permanent:
//      θ(t) = 18 − 12·e^(−t/180)       (t in minutes)
// Once dead it stays dead; reperfusion restores flow only to living tissue.
//
// Neuron accounting follows Saver (2006): a typical large-vessel infarct of
// 54 mL destroys 1.2 billion neurons over ~10 h, i.e. 22 million neurons per mL,
// 1.9 million per minute, and the brain "ages" 3.6 years per hour untreated.

export const NORMAL_CBF = 50;
export const NEURONS_PER_ML = 1.2e9 / 54;             // ≈ 2.2 × 10⁷
export const SAVER = { neuronsMin: 1.9e6, synapsesMin: 14e9, kmMin: 12, yearsHour: 3.6 };
export const NEURONS_PER_YEAR_AGEING = SAVER.neuronsMin * 60 / SAVER.yearsHour;   // ≈ 3.2 × 10⁷
export const COLLATERALS = { good: 18, moderate: 12, poor: 6 };
export const theta = (tMin) => 18 - 12 * Math.exp(-tMin / 180);
export const PENUMBRA_CBF = 20;                       // below this: electrically silent but alive

// Timings of the chain of survival (minutes), after AHA/ASA targets.
export const TIMES = {
  ems: 38,          // 911 call → hospital door (response ≈ 8, on scene ≈ 15, transport ≈ 15)
  ct: 12,           // door → non-contrast CT read (target ≤ 20–25)
  cta: 8,           // CT angiography + perfusion
  lysisOnset: 20,   // bolus → start of any clot lysis
  groin: 30,        // decision → groin puncture (team activation)
  recan: 28,        // groin → reperfusion
  lysisWindow: 270, // 4.5 h (ECASS III)
  evtEarly: 360,    // 6 h (MR CLEAN et al.)
  evtLate: 1440,    // 24 h with imaging selection (DAWN, DEFUSE 3)
};

// DEFUSE 3 perfusion-imaging criteria for late thrombectomy.
export const defuse3 = (coreMl, penMl) => {
  const hypo = coreMl + penMl, ratio = coreMl > 0 ? hypo / coreMl : Infinity;
  return { ok: coreMl < 70 && ratio >= 1.8 && penMl >= 15, ratio, mismatch: penMl };
};

// ICH: hematoma volume by the ABC/2 bedside formula (Kothari 1996) vs the exact
// ellipsoid 4/3·π·a·b·c, and the ICH score (Hemphill 2001) with 30-day mortality.
export const abc2 = (A, B, C) => (A * B * C) / 2;
export const ellipsoid = (A, B, C) => (4 / 3) * Math.PI * (A / 2) * (B / 2) * (C / 2);
export const ICH_MORTALITY = [0, 13, 26, 72, 97, 100, 100];
export function ichScore({ gcs, vol, ivh, infra, age }) {
  const s = (gcs <= 4 ? 2 : gcs <= 12 ? 1 : 0) + (vol >= 30 ? 1 : 0) + (ivh ? 1 : 0) + (infra ? 1 : 0) + (age >= 80 ? 1 : 0);
  return { score: s, mortality: ICH_MORTALITY[s] };
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class StrokeCase {
  // weights: Float32Array of MCA-territory weights per voxel; mlPerVoxel: tissue volume each voxel stands for.
  constructor(weights, mlPerVoxel, { type = 'isch', collat = 'moderate', seed = 7 } = {}) {
    this.w = weights; this.ml = mlPerVoxel; this.N = weights.length;
    this.type = type; this.collat = collat;
    const r = rng(seed);
    this.n = new Float32Array(this.N); for (let i = 0; i < this.N; i++) this.n[i] = 0.72 + 0.56 * r();
    this.cbf = new Float32Array(this.N); this.dead = new Uint8Array(this.N); this.deadAt = new Float32Array(this.N).fill(-1);
    this.t = 0; this.r = 0; this.rGoal = 0; this.rRate = 0;          // reperfusion fraction 0..1
    this.ev = {}; this.log = []; this.pending = [];
    this.hist = [];                                                    // [t, core, penumbra]
    // ICH
    this.ich = { v0: 18, v: 18, growth: 0.55, bp: false, rev: false, sbp: 188, onAnticoag: true };
    this.update(0);
  }
  get cbfCentre() { return COLLATERALS[this.collat]; }
  schedule(at, fn) { this.pending.push({ at, fn }); this.pending.sort((a, b) => a.at - b.at); }
  note(key, vars = {}) { this.log.push({ t: this.t, key, vars }); this.onNote?.(key, vars); }

  update(dtMin) {
    this.t += dtMin;
    while (this.pending.length && this.pending[0].at <= this.t) this.pending.shift().fn();
    if (this.rRate) this.r = Math.min(this.rGoal, this.r + this.rRate * dtMin);
    if (this.type === 'isch') {
      const c = this.cbfCentre, th = theta(this.t);
      for (let i = 0; i < this.N; i++) {
        const deficit = Math.min(NORMAL_CBF - 2, (NORMAL_CBF - c) * this.w[i] * this.n[i]);
        this.cbf[i] = NORMAL_CBF - deficit * (1 - this.r);
        if (!this.dead[i] && this.w[i] > 0 && this.cbf[i] < th) { this.dead[i] = 1; this.deadAt[i] = this.t; }
      }
    } else {
      // Hematoma growth: most expansion happens in the first ~3 hours. Blood-pressure
      // lowering and anticoagulant reversal cut the remaining growth rate.
      const I = this.ich, k = (I.bp ? 0.7 : 1) * (I.rev ? 0.35 : 1);
      I.v += dtMin * I.v0 * I.growth * k * Math.exp(-this.t / 90) / 90;
      if (I.bp) I.sbp += (140 - I.sbp) * (1 - Math.exp(-dtMin / 20));
    }
    const m = this.metrics();
    if (!this.hist.length || this.t - this.hist[this.hist.length - 1][0] >= 1) this.hist.push([this.t, m.core, m.pen]);
  }
  metrics() {
    let core = 0, pen = 0, terr = 0;
    for (let i = 0; i < this.N; i++) {
      if (this.w[i] <= 0) continue;
      terr++;
      if (this.dead[i]) core++; else if (this.cbf[i] < PENUMBRA_CBF) pen++;
    }
    const coreMl = core * this.ml, penMl = pen * this.ml;
    const neurons = coreMl * NEURONS_PER_ML;
    return { core: coreMl, pen: penMl, terr: terr * this.ml, neurons, years: neurons / NEURONS_PER_YEAR_AGEING, d3: defuse3(coreMl, penMl), theta: theta(this.t) };
  }
  // Neurons lost per minute right now, from the core growth over the last few minutes.
  rate() {
    const H = this.hist; if (H.length < 2) return 0;
    const a = H[Math.max(0, H.length - 6)], b = H[H.length - 1];
    return b[0] > a[0] ? ((b[1] - a[1]) / (b[0] - a[0])) * NEURONS_PER_ML : 0;
  }

  // ── Actions: each returns { ok, key } ────────────────────────────────
  call() {
    if (this.ev.call != null) return { ok: false, key: 'cs.already' };
    this.ev.call = this.t; this.note('cs.n.call');
    this.schedule(this.t + TIMES.ems, () => { this.ev.door = this.t; this.note('cs.n.door'); });
    return { ok: true, key: 'cs.n.call' };
  }
  ct() {
    if (this.ev.door == null) return { ok: false, key: 'cs.needDoor' };
    if (this.ev.ctReq != null) return { ok: false, key: 'cs.already' };
    this.ev.ctReq = this.t;
    this.schedule(this.t + TIMES.ct, () => { this.ev.ct = this.t; this.note(this.type === 'isch' ? 'cs.n.ctIsch' : 'cs.n.ctIch'); });
    return { ok: true, key: 'cs.n.ctReq' };
  }
  cta() {
    if (this.ev.ct == null) return { ok: false, key: 'cs.needCt' };
    if (this.type !== 'isch') return { ok: false, key: 'cs.ichNoCta' };
    if (this.ev.ctaReq != null) return { ok: false, key: 'cs.already' };
    this.ev.ctaReq = this.t;
    this.schedule(this.t + TIMES.cta, () => { this.ev.cta = this.t; this.note('cs.n.cta'); });
    return { ok: true, key: 'cs.n.ctaReq' };
  }
  lysis() {
    if (this.ev.ct == null) return { ok: false, key: 'cs.lysisNoCt' };
    if (this.type === 'ich') { this.ev.harm = this.t; return { ok: false, key: 'cs.lysisIch' }; }
    if (this.ev.lysis != null) return { ok: false, key: 'cs.already' };
    if (this.t > TIMES.lysisWindow) return { ok: false, key: 'cs.lysisLate' };
    this.ev.lysis = this.t; this.note('cs.n.lysis');
    // IV lysis alone reopens an M1 clot only sometimes; model a partial effect.
    this.schedule(this.t + TIMES.lysisOnset, () => { this.rGoal = Math.max(this.rGoal, 0.3); this.rRate = 0.3 / 30; this.note('cs.n.lysisEffect'); });
    return { ok: true, key: 'cs.n.lysis' };
  }
  evt() {
    if (this.type === 'ich') return { ok: false, key: 'cs.evtIch' };
    if (this.ev.cta == null) return { ok: false, key: 'cs.evtNoCta' };
    if (this.ev.evt != null) return { ok: false, key: 'cs.already' };
    const m = this.metrics();
    if (this.t > TIMES.evtLate) return { ok: false, key: 'cs.evtLate' };
    if (this.t > TIMES.evtEarly && !m.d3.ok) return { ok: false, key: 'cs.evtNoMismatch' };
    this.ev.evt = this.t; this.note('cs.n.evt');
    this.schedule(this.t + TIMES.groin, () => { this.ev.groin = this.t; this.note('cs.n.groin'); });
    this.schedule(this.t + TIMES.groin + TIMES.recan, () => { this.ev.recan = this.t; this.rGoal = 0.93; this.rRate = 0.93 / 4; this.note('cs.n.recan'); });
    return { ok: true, key: 'cs.n.evt' };
  }
  bp() {
    if (this.type !== 'ich') return { ok: false, key: 'cs.bpIsch' };
    if (this.ev.ct == null) return { ok: false, key: 'cs.needCt' };
    if (this.ich.bp) return { ok: false, key: 'cs.already' };
    this.ich.bp = true; this.ev.bp = this.t; this.note('cs.n.bp'); return { ok: true, key: 'cs.n.bp' };
  }
  reverse() {
    if (this.type !== 'ich') return { ok: false, key: 'cs.revIsch' };
    if (this.ev.ct == null) return { ok: false, key: 'cs.needCt' };
    if (this.ich.rev) return { ok: false, key: 'cs.already' };
    this.ich.rev = true; this.ev.rev = this.t; this.note('cs.n.rev'); return { ok: true, key: 'cs.n.rev' };
  }
  // Hematoma axes (cm) for a fixed 1 : 0.8 : 0.7 shape with the current volume (ABC/2 convention).
  ichAxes() { const v = this.ich.v, k = Math.cbrt((2 * v) / (1 * 0.8 * 0.7)); return [k, 0.8 * k, 0.7 * k]; }
}
