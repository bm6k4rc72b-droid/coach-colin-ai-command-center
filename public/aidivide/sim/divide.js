// TWO MINDS · why people split over AI. The models are simple and openly labelled as teaching models; the
// findings they encode come from published research (cited beside each one).

// ── 1 · THE SPLIT: what people actually think ───────────────────────────────────
// Pew Research Center (US adults, Aug 2023): 52 % more concerned than excited about AI in daily life,
// 10 % more excited than concerned, 36 % an equal mix. Most people are not in either "camp".
export const PEW2023 = { concerned: 52, mixed: 36, excited: 10 };
// Where-do-you-stand questions, each scored −2 (strongly disagree) … +2 (strongly agree); sign says which way it leans.
export const QUIZ = [['q1', +1], ['q2', -1], ['q3', +1], ['q4', -1], ['q5', +1]];
export const stance = (ans) => ans.reduce((a, v, i) => a + v * QUIZ[i][1], 0) / (2 * QUIZ.length);   // −1 (very concerned) … +1 (very enthusiastic)

// ── 2 · THE BRAIN: threat versus reward ─────────────────────────────────────────
// Prospect theory (Kahneman & Tversky 1979): losses weigh about twice as much as gains (λ ≈ 2); neural loss aversion
// shows up as asymmetric striatum/vmPFC responses (Tom et al. 2007). Ambiguity raises amygdala and OFC activity
// (Hsu et al. 2005), and people high in intolerance of uncertainty inflate unknown risks.
//   value = benefit − λ·threat·(1 + IU·uncertainty);  P(adopt) = 1/(1 + e^(−0.45·value))
export function appraise({ benefit, threat, unc, lambda, iu }) {
  const loss = lambda * threat * (1 + iu * unc), value = benefit - loss, P = 1 / (1 + Math.exp(-0.45 * value));
  return { loss, value, P, threatDrive: Math.min(1, loss / 20), rewardDrive: Math.min(1, benefit / 15) };
}

// ── 3 · ROOTS: how growing up tunes the brain for change ────────────────────────
// Teaching model built on published directions of effect:
// · Harsh or unpredictable early environments raise threat reactivity (amygdala) and can speed up amygdala–mPFC
//   maturation (Tottenham; Gee et al. 2013); a reliable caregiver buffers this ("social buffering").
// · Some adversity, with support, predicts more resilience than none or a lot (Seery et al. 2010): an inverted U.
// · Experiencing control teaches the vmPFC to damp the stress response (Maier & Seligman 2016, "learned controllability").
// · Forced change triggers psychological reactance (Brehm 1966); chosen change engages autonomy (Deci & Ryan).
export function grow({ harsh, unpred, support, autonomy }) {
  const adv = Math.min(1, 0.6 * harsh + 0.4 * unpred), buf = 1 - 0.65 * support;
  const threat = Math.min(1, 0.2 + 0.7 * adv * buf + 0.2 * unpred);
  const control = Math.max(0, Math.min(1, 0.25 + 0.55 * autonomy + 0.2 * support - 0.35 * unpred));
  const resil = Math.max(0, Math.min(1, (1 - ((adv - 0.35) / 0.5) ** 2) * (0.55 + 0.45 * support) * (0.7 + 0.3 * control)));
  const explore = Math.max(0, Math.min(1, 0.3 + 0.35 * support + 0.3 * control - 0.3 * threat + 0.15 * (1 - unpred)));
  const forced = Math.max(0, Math.min(1, 0.5 * explore + 0.35 * resil - 0.45 * threat * (1 - control) - 0.15));
  const chosen = Math.max(0, Math.min(1, 0.25 + 0.45 * explore + 0.3 * control + 0.15 * resil - 0.2 * threat));
  return { adv, threat, control, resil, explore, forced, chosen };
}
// Brain maturation by age (teaching curve): limbic system early, prefrontal cortex last (myelination into the 20s).
export const mature = (age) => ({ amygdala: Math.min(1, age / 12), pfc: Math.min(1, Math.max(0, (age - 2) / 23)), striatum: Math.min(1, age / 16) });

// ── 4 · TRIBES: how groups pull apart ───────────────────────────────────────────
// Deffuant–Weisbuch bounded-confidence model (2000): two people talk; if their opinions differ by less than ε they
// move toward each other by μ·(difference). Small ε → many camps (≈ 1/(2ε) clusters), large ε → consensus.
// Echo chambers: with probability h the partner is picked from people who already agree (feed algorithms).
// Zealots never move. Identity-protective cognition (Kahan) makes ε shrink when the topic signals group identity.
export function newSociety(n = 360, seed = 1) { let a = seed >>> 0; const r = () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; return { x: Float64Array.from({ length: n }, () => r() * 2 - 1), z: new Uint8Array(n), r, t: 0 }; }
export function stepSociety(S, { eps, mu = 0.3, h, zeal }, steps = 600) {
  const n = S.x.length, r = S.r, nz = Math.floor(zeal * n);
  for (let i = 0; i < nz; i++) S.z[i] = 1;
  for (let k = 0; k < steps; k++) {
    const i = Math.floor(r() * n); let j;
    if (r() < h) { let best = -1, bd = 9; for (let s = 0; s < 6; s++) { const c = Math.floor(r() * n), d = Math.abs(S.x[c] - S.x[i]); if (c !== i && d < bd) { bd = d; best = c; } } j = best; } else j = Math.floor(r() * n);
    if (j < 0 || j === i) continue; const d = S.x[j] - S.x[i];
    if (Math.abs(d) < eps) { if (!S.z[i]) S.x[i] += mu * d; if (!S.z[j]) S.x[j] -= mu * d; }
  }
  S.t += steps; return S;
}
export function clusters(S, gap = 0.08) { const v = [...S.x].sort((a, b) => a - b), out = []; let start = 0; for (let i = 1; i <= v.length; i++) if (i === v.length || v[i] - v[i - 1] > gap) { const g = v.slice(start, i); if (g.length >= v.length * 0.04) out.push({ c: g.reduce((a, b) => a + b, 0) / g.length, n: g.length }); start = i; } return out; }
export function polar(S) { const n = S.x.length, m = S.x.reduce((a, b) => a + b, 0) / n; return S.x.reduce((a, b) => a + (b - m) ** 2, 0) / n; }

// ── 5 · BRIDGE: what actually changes minds ─────────────────────────────────────
// Openness to experience (Big Five) is moderately heritable (twin studies ≈ 40–60 %) and linked to dopamine and
// the prefrontal/default networks; need for cognitive closure (Kruglanski) pushes toward quick, firm answers.
// Approaches and their evidence, as effect weights in a teaching model:
//  · facts alone: small positive effects; true backfire is rare (Wood & Porter 2019)
//  · mockery or shaming: backfires (reactance, identity threat)
//  · acknowledging legitimate concerns + self-affirmation lower defensiveness (Cohen & Sherman 2014)
//  · hands-on, low-stakes experience reduces uncertainty (exposure; mere-exposure effect, Zajonc 1968)
//  · choice and control (autonomy, reactance avoided)
//  · a trusted messenger from one's own group; deep, non-judgemental conversation (Kalla & Broockman 2016/2020)
export const APPROACHES = { facts: 0.4, mock: -2.2, concerns: 1.4, handsOn: 1.6, choice: 1.5, messenger: 1.3 };
export const PERSONAS = {
  worker: { start: -1.1, fit: { concerns: 1.4, choice: 1.2, handsOn: 1.0, messenger: 1.1, facts: 0.6, mock: 1 } },
  artist: { start: -1.4, fit: { concerns: 1.6, messenger: 1.2, choice: 1.1, handsOn: 0.6, facts: 0.4, mock: 1 } },
  privacy: { start: -1.0, fit: { choice: 1.6, facts: 1.2, concerns: 1.1, handsOn: 0.8, messenger: 0.8, mock: 1 } },
  elder: { start: -1.2, fit: { handsOn: 1.6, messenger: 1.4, concerns: 1.0, choice: 0.9, facts: 0.5, mock: 1 } },
};
export function converse(p, approach, open = 0.5) { const P = PERSONAS[p], w = APPROACHES[approach] * (P.fit[approach] ?? 1), gain = w * (0.55 + 0.6 * open) * (w < 0 ? 1.3 : 1); return gain * 0.45; }
export const opennessP = (x) => 1 / (1 + Math.exp(-1.6 * x));
