// ─────────────────────────────────────────────────────────────────────────────
// IRON LAB BIOMECHANICS: a sagittal-plane (side view) model of three lifts.
//
// Coordinates: metres, x forward (toward the toes), y up, ankle at the origin.
// Every pose is solved for BALANCE: in the squat and deadlift the bar must stay
// over mid-foot, or you fall. The joint torques ("moments") are then simply
//     moment = load × gravity × horizontal distance from the bar to the joint.
// That one idea explains most technique advice: keep the bar close to the joint
// you want to spare.
// ─────────────────────────────────────────────────────────────────────────────

export const BODY = {                // a 1.80 m lifter
  ankleY: 0.08, shank: 0.44, thigh: 0.45, torso: 0.52, neck: 0.24,
  upperArm: 0.31, forearm: 0.29, midfoot: 0.06, bodyMass: 90,
};
export const G = 9.81;
const deg = (r) => r * 180 / Math.PI, rad = (d) => d * Math.PI / 180;
const v = (x, y) => ({ x, y });
const add = (a, b, k = 1) => v(a.x + b.x * k, a.y + b.y * k);

// ── Load, fatigue and bar speed ────────────────────────────────
// Epley in reverse gives the reps possible at a load: reps = 30 × (1RM / load − 1).
export const repsPossible = (pct) => Math.max(1, Math.floor(30 * (1 / Math.max(pct, 0.3) - 1) + 1e-6));
// Load–velocity profile: lighter loads move faster. Typical mean concentric velocity (m/s).
export const freshVelocity = (lift, pct) => ({ squat: 1.78 - 1.5 * pct, deadlift: 1.55 - 1.25 * pct, bench: 1.62 - 1.45 * pct }[lift]);

// ── Squat ──────────────────────────────────────────────────────
const SQUAT = {
  depthKnee: { quarter: 62, parallel: 114, deep: 132 },          // knee flexion at the bottom (°)
  shankMax: { narrow: 41, shoulder: 37, wide: 31 },              // how far the knees travel forward (°)
  winkAt: { narrow: 104, shoulder: 113, wide: 120 },             // knee angle where the pelvis starts to tuck ("butt wink")
  bar: { high: { along: 0.05, back: 0.04 }, low: { along: -0.06, back: 0.065 } },
};

function torsoPoint(hip, beta, along, back) {
  // Point on the back: `along` the torso from the shoulder line, `back` behind it.
  const up = v(Math.sin(beta), Math.cos(beta)), bk = v(-Math.cos(beta), Math.sin(beta));
  return add(add(hip, up, BODY.torso + along), bk, back);
}

export function squatPose(s, p, st) {
  const kMax = SQUAT.depthKnee[p.depth];
  const thK = rad(kMax * s);
  const phiS = rad(SQUAT.shankMax[p.stance] * s * (0.85 + 0.15 * s));
  const a = thK - phiS;
  const ankle = v(0, BODY.ankleY);
  const knee = add(ankle, v(Math.sin(phiS), Math.cos(phiS)), BODY.shank);
  const hip = add(knee, v(-Math.sin(a), Math.cos(a)), BODY.thigh);
  const bar = SQUAT.bar[p.bar];
  const target = BODY.midfoot + st.drift;
  // Solve the torso angle that puts the bar over the target (bisection).
  let lo = 0, hi = 1.45;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (torsoPoint(hip, m, bar.along, bar.back).x < target ? (lo = m) : (hi = m)); }
  let beta = (lo + hi) / 2 + st.goodMorning;
  const barPt = torsoPoint(hip, beta, bar.along, bar.back);
  const shoulder = torsoPoint(hip, beta, 0, 0);
  // Butt wink: past the hips' comfortable range, the pelvis tucks under. Bracing limits it.
  const wink = Math.max(0, kMax * s - SQUAT.winkAt[p.stance]) * (p.brace ? 0.35 : 1.0);
  return { ankle, knee, hip, shoulder, bar: barPt, beta, knees: deg(thK), wink, lying: false };
}

// ── Deadlift ───────────────────────────────────────────────────
// s = 1 with the bar on the floor, 0 at lockout. Arms hang straight down; the
// shoulders sit a little in front of the bar at the start.
export function deadliftPose(s, p, st) {
  const plateR = 0.225, arm = BODY.upperArm + BODY.forearm;
  const lockY = BODY.ankleY + BODY.shank + BODY.thigh + BODY.torso - arm;
  const barY = plateR + (1 - s) * (lockY - plateR);
  const barX = BODY.midfoot + st.drift + (p.bar === 'toes' ? 0.05 : 0);
  const shoulderAhead = 0.035 * s;
  let bestPose = null, bestErr = Infinity;
  for (let kd = 0; kd <= 110; kd += 0.5) {
    const thK = rad(kd), phiS = thK * 0.32;
    const a = thK - phiS;
    const ankle = v(0, BODY.ankleY);
    const knee = add(ankle, v(Math.sin(phiS), Math.cos(phiS)), BODY.shank);
    const hip = add(knee, v(-Math.sin(a), Math.cos(a)), BODY.thigh);
    const cosB = (barY + arm - hip.y) / BODY.torso;
    if (cosB > 1 || cosB < -0.2) continue;
    const beta = Math.acos(Math.min(1, cosB));
    const shoulder = add(hip, v(Math.sin(beta), Math.cos(beta)), BODY.torso);
    const err = Math.abs(shoulder.x - (barX + shoulderAhead));
    if (err < bestErr) { bestErr = err; bestPose = { ankle, knee, hip, shoulder, beta, knees: kd }; }
  }
  const P = bestPose;
  P.beta += st.goodMorning;
  P.bar = v(barX, barY);
  // A rounded back: under heavy load without a brace, the lumbar spine flexes.
  P.wink = (p.brace ? 0.25 : 1) * Math.max(0, st.load01 - 0.6) * 40 * s * (0.5 + st.fatigue);
  P.lying = false;
  return P;
}

// ── Bench press ────────────────────────────────────────────────
// Lying on the bench, x runs along the body toward the feet and y is up.
// s = 1 with the bar on the chest, 0 at lockout over the shoulders.
export function benchPose(s, p, st) {
  const shoulder = v(0, 0.52);
  const touchX = p.bar === 'low' ? 0.14 : 0.07;
  const grip = { narrow: 0.9, shoulder: 1.0, medium: 1.0, wide: 1.12 }[p.stance];
  const rom = 0.42 / grip;                                    // wider grip, shorter range of motion
  const chestY = shoulder.y + 0.12;
  // The ideal path is a J-curve: from over the shoulders, down and slightly toward the feet.
  const x = touchX * Math.pow(s, 1.3) + st.drift;
  const y = chestY + (1 - s) * rom;
  const flare = p.cue ? 48 : 78;                              // elbow angle from the torso (°)
  return { shoulder, bar: v(x, y), flare, rom, lying: true, wink: 0 };
}

// Joint moments (N·m, both sides together) for a pose.
export function moments(lift, pose, loadKg, p) {
  const F = loadKg * G;
  if (lift === 'bench') {
    const armIn = p.stance === 'wide' ? 0.08 : p.stance === 'narrow' ? 0.02 : 0.05;
    const shoulder = F * Math.abs(pose.bar.x - pose.shoulder.x) + F * armIn * (pose.flare / 90);
    const elbow = F * (0.03 + (p.stance === 'narrow' ? 0.04 : 0.015));
    return { shoulder, elbow, knee: 0, hip: 0, lumbar: 0 };
  }
  const knee = F * Math.abs(pose.bar.x - pose.knee.x);
  const hip = F * Math.abs(pose.bar.x - pose.hip.x);
  const lumbar = hip * (0.92 + pose.wink * 0.02);
  return { knee, hip, lumbar, shoulder: 0, elbow: 0 };
}

// Which muscles are working, 0…1, from the joint moments.
export function activation(lift, M, loadKg) {
  const n = (x, ref) => Math.min(1, x / ref);
  const ref = Math.max(200, loadKg * G * 0.25);
  if (lift === 'bench') return { pecs: n(M.shoulder, ref * 0.9), delts: n(M.shoulder, ref * 1.3), triceps: n(M.elbow + 30, ref * 0.5), quads: 0.1, glutes: 0.15, hams: 0.05, erectors: 0.2, lats: 0.3 };
  return {
    quads: n(M.knee, ref * (lift === 'squat' ? 0.9 : 1.8)),
    glutes: n(M.hip, ref * 1.1),
    hams: n(M.hip, ref * (lift === 'deadlift' ? 1.1 : 1.8)),
    erectors: n(M.lumbar, ref * 1.2),
    lats: lift === 'deadlift' ? 0.7 : 0.2, pecs: 0.05, delts: 0.1, triceps: 0.05,
  };
}

// Advance one rep's per-frame "state" (bar drift and hip shoot-through), driven by fatigue and cues.
export function faultState(lift, p, fatigue, s, ascending, load01) {
  const f = Math.max(0, fatigue);
  const bracing = p.brace ? 1 : 0;
  const cue = p.cue ? 1 : 0;
  let drift = 0, goodMorning = 0, valgus = 0;
  if (lift === 'squat') {
    drift = (0.008 + (1 - bracing) * 0.03 + f * 0.03) * Math.sin(s * Math.PI) * (ascending ? 1.2 : 0.8);
    // Hips shooting up ("good morning"): a braced trunk resists most of it.
    goodMorning = ascending ? rad((1 - bracing) * 6 + f * (bracing ? 3 : 7)) * Math.sin(s * Math.PI) : 0;
    valgus = cue ? f * 0.01 : Math.max(0, f - 0.3) * 0.09 * (ascending ? 1 : 0.4) * Math.sin(s * Math.PI);
  } else if (lift === 'deadlift') {
    drift = ((1 - cue) * 0.045 + f * 0.03 + (1 - bracing) * 0.015) * s;
    goodMorning = ascending ? rad((1 - bracing) * 5 + f * 6) * s : 0;
  } else {
    drift = -(f * 0.06 + (1 - cue) * 0.01) * Math.sin(s * Math.PI * 0.8);   // bar drifts toward the face when tired
  }
  return { drift, goodMorning, valgus, fatigue: f, load01 };
}
