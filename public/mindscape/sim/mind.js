// MINDSCAPE · the models behind every number on screen. Classic, published models with their
// parameters stated; where a number is a teaching choice rather than a measurement, it says so.

// ── 1 · ATLAS ───────────────────────────────────────────────────────────────────
// Parts of the brain, grouped. 'c' = drawn on the cortex surface, 'd' = a deep structure, 's' = stem/cerebellum.
export const PARTS = [
  ['frontal', 'lobe', 'c'], ['dlpfc', 'lobe', 'c'], ['ofc', 'lobe', 'c'], ['motor', 'lobe', 'c'], ['broca', 'lobe', 'c'],
  ['parietal', 'lobe', 'c'], ['somato', 'lobe', 'c'], ['temporal', 'lobe', 'c'], ['auditory', 'lobe', 'c'], ['wernicke', 'lobe', 'c'],
  ['occipital', 'lobe', 'c'], ['acc', 'limbic', 'c'], ['pcc', 'limbic', 'c'], ['insula', 'limbic', 'd'],
  ['hippocampus', 'limbic', 'd'], ['amygdala', 'limbic', 'd'], ['thalamus', 'deep', 'd'], ['hypothalamus', 'deep', 'd'], ['pituitary', 'deep', 'd'], ['pineal', 'deep', 'd'],
  ['caudate', 'basal', 'd'], ['putamen', 'basal', 'd'], ['pallidus', 'basal', 'd'], ['nacc', 'basal', 'd'], ['sn', 'basal', 'd'], ['vta', 'basal', 'd'],
  ['callosum', 'deep', 'd'], ['midbrain', 'stem', 's'], ['pons', 'stem', 's'], ['lc', 'stem', 'd'], ['medulla', 'stem', 's'], ['cerebellum', 'stem', 's'],
].map(([id, group, kind]) => ({ id, group, kind }));
// Neuron census (Azevedo et al. 2009, isotropic fractionator): 86 billion in total.
export const CENSUS = { total: 86.1e9, cortex: 16.3e9, cerebellum: 69.0e9, rest: 0.69e9 };
// Energy: about 2 % of body mass, about 20 % of resting metabolism. Resting metabolism ≈ 2,000 kcal/day.
export function energy(bodyKg = 70, brainKg = 1.4, kcalDay = 2000) { const W = (kcalDay * 4184) / 86400; return { mass: brainKg / bodyKg, wholeW: W, brainW: 0.2 * W, perNeuronPW: ((0.2 * W) / CENSUS.total) * 1e12 }; }

// ── 2 · DOPAMINE: reward prediction error ───────────────────────────────────────
// Temporal-difference learning (Sutton & Barto; matched to dopamine firing by Schultz, Dayan & Montague 1997).
// Each trial has T time steps, a cue at t_c and a reward at t_r. States before the cue carry no information
// (V = 0). δ_t = r_{t+1} + γ·V(t+1) − V(t), and V(t) ← V(t) + α·δ_t. Dopamine bursts track δ: positive = better
// than expected, negative (a dip) = worse.
export const TD = { T: 20, tc: 5, tr: 15 };
export function newTD() { return { V: new Float64Array(TD.T + 1), n: 0, hist: [], last: null }; }
export function tdTrial(L, { alpha, gamma, R, p, omit = false, rnd = Math.random }) {
  const { T, tc, tr } = TD, got = !omit && rnd() < p, d = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    const r = t + 1 === tr && got ? R : 0, Vn = t + 1 >= tc && t + 1 < tr ? L.V[t + 1] : 0, Vc = t >= tc && t < tr ? L.V[t] : 0;
    d[t] = r + gamma * Vn - Vc; if (t >= tc && t < tr) L.V[t] += alpha * d[t];
  }
  L.n++; L.last = { d, got, omit }; L.hist.push([L.n, d[tc - 1], d[tr - 1], got]); if (L.hist.length > 400) L.hist.shift();
  return L.last;
}
// The learned asymptote: V(t_r − k) = γ^(k−1)·p·R, so the cue burst → γ^(t_r − t_c)·p·R and the reward burst → (1 − p)·R.
export const tdAsym = ({ gamma, R, p }) => ({ cue: gamma ** (TD.tr - TD.tc) * p * R, reward: (1 - p) * R, omit: -p * R });
// Fiorillo, Tobler & Schultz 2003: a sustained ramp between cue and reward that scales with uncertainty, peaking at p = 0.5.
export const uncertainty = (p) => p * (1 - p);

// ── 3 · MOTIVATION: why we start, and why we don't ─────────────────────────────
// Subjective value of the task: hyperbolic delay discounting (Mazur 1987) and parabolic effort discounting
// (Hartmann et al. 2013), with dopamine tone DA scaling benefits up and effort costs down (Westbrook & Braver 2016).
//   SV_task = DA·R/(1 + k·delay) + DA·r_now − c·E²/DA
//   SV_alt  = DA·A           (an effortless, instant alternative such as the phone)
//   P(start) = 1/(1 + e^(−β(SV_task − SV_alt)))   (softmax choice)
// Vigor (Niv et al. 2007): acting with latency τ costs C_v/τ in effort and R̄·τ in reward forgone, so the best
// latency is τ* = √(C_v/R̄). R̄, the average reward rate, is thought to be signalled by tonic dopamine.
export const MOT = { k: 0.15, c: 0.9, beta: 1.1, Cv: 4 };
export function motivate({ R, delay, E, now, A, DA }) {
  const { k, c, beta, Cv } = MOT, gain = (DA * R) / (1 + k * delay), cost = (c * E * E) / DA, bonus = DA * now, task = gain + bonus - cost, alt = DA * A;
  const P = 1 / (1 + Math.exp(-beta * (task - alt))), Rbar = Math.max(0.05, DA * 0.8), tau = Math.sqrt(Cv / Rbar);
  return { gain, cost, bonus, task, alt, P, tau, Rbar };
}

// ── 4 · AROUSAL & INTEREST ──────────────────────────────────────────────────────
// Yerkes–Dodson (1908): performance is an inverted U of arousal, and the peak sits lower for harder tasks.
// Modelled as a Gaussian: perf = exp(−(a − a*)²/(2σ²)), a* = 0.72 − 0.32·difficulty, σ = 0.26 − 0.08·difficulty.
// Locus coeruleus (Aston-Jones & Cohen 2005): tonic rate rises with arousal; task-locked phasic bursts are
// strongest at moderate tonic levels (the "exploit" mode). Pupil diameter tracks LC activity.
export const yd = (a, diff) => { const s = 0.26 - 0.08 * diff, a0 = 0.72 - 0.32 * diff; return Math.exp(-((a - a0) ** 2) / (2 * s * s)); };
export const ydPeak = (diff) => 0.72 - 0.32 * diff;
export function lc(a) { const tonic = 0.3 + 4.2 * a, phasic = Math.exp(-(((a - 0.45) / 0.2) ** 2)), mode = a < 0.25 ? 'drowsy' : a < 0.65 ? 'exploit' : 'explore'; return { tonic, phasic, mode, pupil: 3 + 4 * a }; }
// Curiosity (Kang et al. 2009): rated curiosity was an inverted U of confidence, peaking near the middle, and fits
// uncertainty P(1 − P). The information-gap view (Loewenstein 1994): you are most curious when you know a little.
// Memory (Gruber et al. 2014): answers learned in high-curiosity states were recalled better a day later; the
// recall line below is a teaching model scaled to that direction (≈ 0.45 → 0.70).
export const curiosity = (conf) => 4 * conf * (1 - conf);
export const recall = (cur) => 0.45 + 0.25 * cur;

// ── 5 · ATTRACTION ──────────────────────────────────────────────────────────────
// Fisher (1998): three overlapping systems — lust (sex steroids), attraction (dopamine, noradrenaline; VTA and
// caudate light up when people in early-stage love view their partner, Aron et al. 2005) and attachment
// (oxytocin, vasopressin; ventral pallidum).
// Misattribution of arousal: Dutton & Aron (1974), Capilano bridge. Men who met the interviewer on a high,
// swaying suspension bridge called her afterwards 9 of 18 times; on a low, solid bridge 2 of 16.
export const BRIDGE = { high: [9, 18], low: [2, 16] };
const lnf = (() => { const t = [0]; for (let i = 1; i <= 4000; i++) t[i] = t[i - 1] + Math.log(i); return (n) => t[n]; })();
const hyp = (k, K, n, N) => Math.exp(lnf(K) - lnf(k) - lnf(K - k) + lnf(N - K) - lnf(n - k) - lnf(N - K - n + k) - lnf(N) + lnf(n) + lnf(N - n));
// One-sided Fisher exact test that group 1 (a of n1) has the higher rate than group 2 (b of n2).
export function fisher(a, n1, b, n2) { const K = a + b, N = n1 + n2; let p = 0; for (let k = a; k <= Math.min(K, n1); k++) p += hyp(k, K, n1, N); return Math.min(1, p); }
// Normal-approximation power of a one-sided two-proportion test at α = 0.05.
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a); return s * y; }
export function power(p1, p2, n) { const pb = (p1 + p2) / 2, se0 = Math.sqrt((2 * pb * (1 - pb)) / n), se1 = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / n); return Phi((Math.abs(p1 - p2) - 1.6449 * se0) / se1); }
export function study(n, rnd, p1 = 0.5, p2 = 0.125) { let a = 0, b = 0; for (let i = 0; i < n; i++) { if (rnd() < p1) a++; if (rnd() < p2) b++; } return { a, b, n, p: fisher(a, n, b, n) }; }

// ── 6 · SUGGESTION: hypnosis and the critical filter ───────────────────────────
// EEG: alert (beta 13–30 Hz) → relaxed (alpha 8–12 Hz) → absorbed / hypnagogic (theta 4–8 Hz).
// Belief model, after Gilbert (1991, 1993): understanding a statement starts by provisionally accepting it;
// "unbelieving" takes a second, effortful step that fails under load, fatigue or absorption. Repetition makes a
// claim feel familiar and therefore true (illusory truth: Hasher et al. 1977; Fazio et al. 2015, even when
// people know better). Asking "is this accurate?" restores the check (Brashier et al. 2020).
//   scrutiny S = (1 − load)·(1 − 0.5·fatigue)·(1 − 0.6·depth·h)·min(1, 0.6·(1 + prompt))
//   P(accept false claim) = σ(−1.2 + 0.45·ln(1 + reps) + 0.8·trust − 2.5·S)
// The coefficients are teaching values chosen so that the alert baseline is ≈ 8 % and the worst case ≈ 60 %.
export const HYP = { h: { low: 0.2, medium: 0.6, high: 1 } };
export function filter({ load, fatigue, depth, h, reps, trust, prompt }) {
  const motive = Math.min(1, 0.6 * (1 + (prompt ? 1 : 0))), S = (1 - load) * (1 - 0.5 * fatigue) * (1 - 0.6 * depth * HYP.h[h]) * motive;
  const z = -1.2 + 0.45 * Math.log(1 + reps) + 0.8 * trust - 2.5 * S, P = 1 / (1 + Math.exp(-z));
  return { S, z, P, motive };
}
export const eegFreq = (depth) => 20 * (1 - depth) + 6 * depth;   // dominant frequency, Hz
export const band = (f) => (f >= 13 ? 'beta' : f >= 8 ? 'alpha' : 'theta');
// Hypnotisability across people: Harvard Group Scale scores (0–12) are roughly bell-shaped; ≈ 10–15 % score high.
export const HGSHS = [2, 4, 6, 8, 10, 11, 12, 11, 10, 9, 8, 6, 3];   // relative frequency, scores 0…12 (illustrative)
