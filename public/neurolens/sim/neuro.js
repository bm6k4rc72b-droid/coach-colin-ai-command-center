// NEUROLENS · a computational viewer: dopamine, noradrenaline, attention and mind-wandering.
//
// Reward prediction error (temporal-difference learning, Schultz, Dayan & Montague 1997):
//   δ(t) = r(t) − V(t),   dV/dt = α·δ          phasic dopamine (VTA → nucleus accumbens) ∝ δ
//   bursts when the content is better than expected, dips when it is worse (boredom).
// Liking / appeal r(t) (vmPFC–OFC value): weighted visual features, scaled by the viewer profile,
//   habituating within a shot:  h = e^(−t_shot/τ_h)
//   plus a novelty bonus at each cut (Kakade & Dayan 2002):  b = β/√(n_type + 1)
// Locus coeruleus (adaptive gain theory, Aston-Jones & Cohen 2005):
//   phasic NE ∝ abrupt change (cuts, motion onsets) → orienting, re-capture of attention
//   tonic NE drifts up when utility (recent reward) is low → distractible, exploratory mode
//   task efficiency follows Yerkes–Dodson:  η = exp(−((NE_tonic − 0.5)/0.25)²)
// Attention A ∈ [0,1]:  dA/dt = (A* − A)/τ,  A* = f(utility·η, δ⁺, NE_phasic, control)
//   A < θ for long enough → the default-mode network takes over (mind-wandering).
// Retention (probability the viewer is still watching):  dS/dt = −h·S,
//   h = 0.01 + 0.08·(1 − A)² while engaged,  0.12 + 0.15·(1 − A) while the mind wanders (per second)

export const PROFILE_KEYS = ['novelty', 'reward', 'faces', 'colour', 'motion', 'arousal', 'focus'];
export const PRESETS = {
  scroller: { novelty: 0.85, reward: 0.8, faces: 0.6, colour: 0.7, motion: 0.8, arousal: 0.62, focus: 0.25 },
  cinephile: { novelty: 0.35, reward: 0.5, faces: 0.7, colour: 0.85, motion: 0.35, arousal: 0.42, focus: 0.82 },
  analyst: { novelty: 0.3, reward: 0.4, faces: 0.3, colour: 0.3, motion: 0.3, arousal: 0.45, focus: 0.9 },
  thrill: { novelty: 0.95, reward: 0.9, faces: 0.4, colour: 0.6, motion: 0.95, arousal: 0.78, focus: 0.35 },
  social: { novelty: 0.5, reward: 0.65, faces: 0.95, colour: 0.5, motion: 0.4, arousal: 0.5, focus: 0.55 },
};
export const THETA = 0.38;                    // engagement threshold
export const REGIONS = ['vta', 'nacc', 'vmpfc', 'ofc', 'dlpfc', 'acc', 'amyg', 'hipp', 'insula', 'lc', 'sc', 'v1', 'v4', 'mt', 'ffa', 'dmn'];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// Derived parameters of a profile.
export function params(p) {
  return {
    tauH: 2 + 7 * (1 - p.novelty),                  // s before a shot's appeal has fallen to 1/e
    beta: 0.15 + 0.55 * p.novelty,                  // novelty bonus
    gainDA: 0.6 + 1.2 * p.reward,                   // phasic DA gain
    alpha: 0.9 + 0.8 * p.novelty,                   // how fast expectations adapt (1/s)
    tauFall: 1.2 + 3.5 * p.focus,                   // attention decays slower with strong executive control
    pace: 1.5 + 6 * (1 - p.novelty),                // preferred shot length (s)
    u0: (0.3 + 0.45 * p.novelty) * (1 - 0.5 * p.focus),   // boredom threshold for recent reward
    w: { face: 0.15 + 0.55 * p.faces, eyes: 0.1 + 0.4 * p.faces, colour: 0.1 + 0.45 * p.colour, motion: 0.08 + 0.55 * p.motion, contrast: 0.15, focus: 0.18 + 0.2 * p.focus, cute: 0.25 + 0.2 * p.faces, text: 0.1 + 0.2 * p.focus, clutter: 0.5 - 0.2 * p.novelty },
  };
}

export function makeViewer(profile) {
  const v = {
    profile: { ...profile }, P: params(profile),
    t: 0, V: 0.3, A: 0.75, S: 1, dmn: 0.15, neT: profile.arousal, neP: 0, da: 0, delta: 0, r: 0, util: 0.4, appeal: 0, nb: 0,
    tShot: 0, seen: {}, engaged: true, lowT: 0, segStart: 0, segments: [], events: [], hookA: 0, hookN: 0, lost: 0, peaks: 0, lastPeak: -9,
    act: Object.fromEntries(REGIONS.map((k) => [k, 0.1])), trace: [],
  };
  v.setProfile = (p) => { v.profile = { ...p }; v.P = params(p); };
  v.reset = () => { Object.assign(v, { t: 0, V: 0.3, A: 0.75, S: 1, dmn: 0.15, neT: v.profile.arousal, neP: 0, da: 0, delta: 0, util: 0.4, tShot: 0, seen: {}, engaged: true, lowT: 0, segStart: 0, segments: [], events: [], hookA: 0, hookN: 0, lost: 0, peaks: 0, lastPeak: -9, trace: [] }); };
  // One step. `f` = { contrast, colourfulness, edgeDensity, motion, focus, face, eyes, cute, text, cut, cutMag, type }
  v.step = (dt, f) => {
    const P = v.P, p = v.profile;
    v.t += dt; v.tShot += dt;
    if (f.cut) { v.tShot = 0; const n = v.seen[f.type] || 0; v.seen[f.type] = n + 1; v.nb = P.beta / Math.sqrt(n + 1); }
    v.nb *= Math.exp(-dt / 1.5);
    const colour = clamp(f.colourfulness / 90), motion = clamp(f.motion * 25), contrast = clamp(f.contrast / 0.8), clutter = Math.max(0, f.edgeDensity - 0.22);
    const w = P.w;
    const appeal = w.face * (f.face || 0) + w.eyes * (f.eyes || 0) + w.colour * colour + w.motion * motion + w.contrast * contrast + w.focus * f.focus + w.cute * (f.cute || 0) + w.text * (f.text || 0) - w.clutter * clutter;
    const h = Math.exp(-v.tShot / P.tauH);
    v.appeal = appeal; v.r = appeal * (0.15 + 0.85 * h) + v.nb;
    // Reward prediction error and value.
    v.delta = v.r - v.V; v.V += P.alpha * v.delta * dt;
    v.da = clamp(0.25 + P.gainDA * v.delta, -0.5, 1.5);
    if (v.delta * P.gainDA > 0.22 && v.t - v.lastPeak > 0.8) { v.peaks++; v.lastPeak = v.t; v.events.push({ t: v.t, k: 'peak', why: f.cut ? 'cut' : f.face ? 'face' : motion > 0.4 ? 'motion' : 'colour', type: f.type, d: v.delta }); }
    v.util += (v.r - v.util) * dt / 2;
    // Locus coeruleus.
    v.neP = Math.max(v.neP * Math.exp(-dt / 0.35), clamp((f.cutMag || 0) * 1.6 + Math.max(0, motion - 0.5) * 0.4));
    const neTarget = clamp(p.arousal + 0.45 * (0.45 - v.util));
    v.neT += (neTarget - v.neT) * dt / 4;
    const eta = Math.exp(-(((v.neT - 0.5) / 0.25) ** 2));
    // Attention.
    // Engagement drive: recent reward against this viewer's boredom threshold u₀ (novelty seekers need
    // more, executive control lowers the bar):  E = σ((utility − u₀)/0.1)
    const E = 1 / (1 + Math.exp(-(v.util - P.u0) / 0.1));
    const Astar = clamp(0.08 + 0.85 * E * eta + 0.25 * Math.max(0, v.delta) * P.gainDA + 0.5 * v.neP + 0.1 * p.focus - (v.engaged ? 0 : 0.1));
    const tau = Astar > v.A ? 0.6 : P.tauFall;
    v.A += (Astar - v.A) * dt / tau;
    // Engagement state machine (with hysteresis).
    if (v.engaged) {
      v.lowT = v.A < THETA ? v.lowT + dt : 0;
      if (v.lowT > 0.6) { v.engaged = false; v.lost++; v.segments.push([v.segStart, v.t]); v.events.push({ t: v.t, k: 'lost', why: diagnose(v, f, colour, motion, clutter) }); }
    } else if (v.A > THETA + 0.12 && (v.neP > 0.3 || v.delta > 0.15)) { v.engaged = true; v.segStart = v.t; v.events.push({ t: v.t, k: 'back', why: f.cut ? 'cut' : f.face ? 'face' : 'motion' }); }
    v.dmn += ((v.engaged ? 0.12 + 0.3 * (1 - v.A) : 0.55 + 0.4 * (1 - v.A)) - v.dmn) * dt / 1.2;
    v.S *= Math.exp(-(v.engaged ? 0.01 + 0.08 * (1 - v.A) ** 2 : 0.12 + 0.15 * (1 - v.A)) * dt);
    if (v.t <= 3) { v.hookA += v.A * dt; v.hookN += dt; }
    // Region activity (0–1) for the 3D brain.
    const a = v.act, sm = (k, x) => { a[k] += (clamp(x) - a[k]) * Math.min(1, dt * 6); };
    sm('vta', 0.2 + v.da * 0.7); sm('nacc', 0.15 + Math.max(0, v.da) * 0.6 + v.r * 0.3); sm('vmpfc', 0.2 + v.V * 0.8); sm('ofc', 0.15 + appeal * 0.9);
    sm('dlpfc', 0.15 + v.A * 0.7 * (0.5 + 0.5 * p.focus)); sm('acc', 0.15 + (f.cut ? 0.6 : 0) + Math.abs(v.delta) * 0.6); sm('amyg', 0.15 + 0.35 * (f.face || 0) + 0.3 * (f.eyes || 0) + 0.35 * motion + 0.3 * Math.abs(v.delta));
    sm('hipp', 0.15 + v.nb * 2); sm('insula', 0.15 + Math.abs(v.delta) * 0.8 + v.neP * 0.4); sm('lc', 0.15 + v.neT * 0.4 + v.neP * 0.7); sm('sc', 0.2 + f.focus * 0.4 + (f.cutMag || 0) * 1.5);
    sm('v1', 0.2 + contrast * 0.5 + f.edgeDensity * 1.2); sm('v4', 0.15 + colour * 0.85); sm('mt', 0.1 + motion * 0.9); sm('ffa', 0.08 + 0.9 * Math.max(f.face || 0, (f.cute || 0) * 0.8)); sm('dmn', v.dmn);
    v.trace.push({ t: v.t, A: v.A, da: v.da, ne: v.neT * 0.6 + v.neP * 0.6, dmn: v.dmn, S: v.S, r: v.r, V: v.V, engaged: v.engaged, cut: !!f.cut });
    return v;
  };
  v.summary = () => {
    const segs = [...v.segments]; if (v.engaged) segs.push([v.segStart, v.t]);
    const span = segs.length ? segs.reduce((s, [a, b]) => s + (b - a), 0) / segs.length : 0;
    const engagedT = segs.reduce((s, [a, b]) => s + (b - a), 0);
    return { hook: v.hookN ? v.hookA / v.hookN : 0, span, engaged: v.t ? engagedT / v.t : 0, retention: v.S, peaks: v.peaks, lost: v.lost, T: v.t };
  };
  return v;
}

// Why did attention drop? The biggest shortfall against this viewer's preferences.
function diagnose(v, f, colour, motion, clutter) {
  const P = v.P, p = v.profile, c = [];
  if (v.tShot > P.pace) c.push(['long', v.tShot / P.pace]);
  if (clutter > 0.08) c.push(['clutter', clutter * 8]);
  if (!f.face && p.faces > 0.55) c.push(['noface', p.faces * 1.2]);
  if (motion < 0.15 && p.motion > 0.55) c.push(['still', p.motion * 1.1]);
  if (colour < 0.3 && p.colour > 0.55) c.push(['flat', p.colour]);
  if (v.seen[f.type] > 1) c.push(['repeat', 0.9 + 0.1 * v.seen[f.type]]);
  if (!c.length) c.push(['low', 1]);
  c.sort((a, b) => b[1] - a[1]);
  return c[0][0];
}

// Schultz's monkey experiment as TD(0) with a tapped-delay-line state after the cue:
//   δ_t = r_t + γ·V(s_{t+1}) − V(s_t),  V(s_t) ← V(s_t) + α·δ_t
// Before learning the burst is at the reward; after learning it moves to the cue,
// and an omitted reward produces a dip exactly when the reward was due.
export function schultzTD({ trials = 400, alpha = 0.25, gamma = 0.98, test = 'expected' } = {}) {
  const bins = 40, cue = 10, rew = 30, dt = 0.05, V = new Float32Array(bins + 2);
  const run = (R, learn) => {
    const d = [];
    for (let t = 0; t < bins; t++) {
      const r = t === rew ? R : 0, Vt = t >= cue && t <= rew ? V[t] : 0, Vn = t + 1 >= cue && t + 1 <= rew ? V[t + 1] : 0;
      const delta = r + gamma * Vn - Vt; d.push([t * dt, delta]);
      if (learn && t >= cue && t <= rew) V[t] += alpha * delta;
    }
    return d;
  };
  const naive = run(1, true);
  for (let i = 1; i < trials; i++) run(1, true);
  const trained = run(test === 'omitted' ? 0 : test === 'bigger' ? 2 : 1, false);
  return { naive, trained, cueT: cue * dt, rewT: rew * dt };
}
