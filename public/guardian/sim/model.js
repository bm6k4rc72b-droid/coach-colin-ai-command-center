// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN · SAFETY MODEL
//
// Home hazards: each unfixed hazard i carries a weight wᵢ (0–1). The home hazard
// index combines them like independent events:
//      H = 1 − Π (1 − wᵢ)            (over unfixed hazards)
// so fixing the heaviest hazards moves the index most. This is an illustrative
// index for teaching, NOT a probability that someone will fall.
//
// Balance: the CDC STEADI screening tools (Stopping Elderly Accidents, Deaths &
// Injuries): the 12-item "Stay Independent" checklist (score ≥ 4 → may be at
// risk), the Timed Up and Go test (≥ 12 s → at risk), the 30-Second Chair Stand
// (below-average norms by age and sex), and the 4-Stage Balance Test (cannot hold
// the tandem stance for 10 s → at risk). Education only; not a diagnosis.
//
// Physics of a fall: dropping from hip height h, impact speed v = √(2gh), time
// t = √(2h/g), energy E = m·g·h; a surface that deforms by d spreads the stop, so
// the mean deceleration is a = v² / (2d).
// ─────────────────────────────────────────────────────────────────────────────

export const G = 9.80665;

// Hazards: id, 3D position (x, z) in the house, weight, where it is, and the fix.
export const HAZARDS = [
  { id: 'rug', x: -0.5, z: -1.6, w: 0.12, room: 'hall' },
  { id: 'dimHall', x: -0.5, z: 0.6, w: 0.14, room: 'hall' },
  { id: 'bathFloor', x: -4.2, z: 2.6, w: 0.12, room: 'bath' },
  { id: 'grab', x: -5.3, z: 3.6, w: 0.16, room: 'bath' },
  { id: 'stairs', x: -2.0, z: 3.4, w: 0.15, room: 'entry' },
  { id: 'cords', x: 2.6, z: -0.6, w: 0.08, room: 'living' },
  { id: 'clutter', x: -3.2, z: -1.2, w: 0.07, room: 'bed' },
  { id: 'bedLight', x: -5.2, z: -3.6, w: 0.07, room: 'bed' },
  { id: 'shelf', x: 5.2, z: 3.9, w: 0.06, room: 'kitchen' },
  { id: 'pet', x: 2.4, z: 2.8, w: 0.05, room: 'kitchen' },
  { id: 'bedHeight', x: -3.9, z: -3.2, w: 0.05, room: 'bed' },
];
export const hazardIndex = (fixed) => 1 - HAZARDS.filter((h) => !fixed.has(h.id)).reduce((p, h) => p * (1 - h.w), 1);

// The night route: bed → hallway → bathroom (x, z waypoints).
export const NIGHT_ROUTE = [[-3.7, -2.6], [-2.2, -1.4], [-0.5, -1.2], [-0.5, 0.2], [-0.5, 1.2], [-2.4, 1.6], [-3.6, 2.3], [-4.6, 3.3]];
// Risk along the route: each unfixed hazard within 1.6 m adds w·(1 − d/1.6).
export function routeRisk(fixed, x, z) {
  let r = 0;
  for (const h of HAZARDS) { if (fixed.has(h.id)) continue; const d = Math.hypot(h.x - x, h.z - z); if (d < 1.6) r += h.w * (1 - d / 1.6); }
  return Math.min(1, r * 3);
}

// ── STEADI ─────────────────────────────────────────────────────
export const CHECKLIST = [
  { id: 'fell', pts: 2 }, { id: 'aid', pts: 2 }, { id: 'unsteady', pts: 1 }, { id: 'furniture', pts: 1 },
  { id: 'worried', pts: 1 }, { id: 'push', pts: 1 }, { id: 'curb', pts: 1 }, { id: 'rush', pts: 1 },
  { id: 'feet', pts: 1 }, { id: 'lightheaded', pts: 1 }, { id: 'sleepMed', pts: 1 }, { id: 'sad', pts: 1 },
];
// 30-Second Chair Stand: a score BELOW these values is below average (CDC STEADI).
const CHAIR = {
  m: [[60, 64, 14], [65, 69, 12], [70, 74, 12], [75, 79, 11], [80, 84, 10], [85, 89, 8], [90, 94, 7]],
  f: [[60, 64, 12], [65, 69, 11], [70, 74, 10], [75, 79, 10], [80, 84, 9], [85, 89, 8], [90, 94, 4]],
};
export function chairNorm(age, sex) {
  const t = CHAIR[sex] || CHAIR.f;
  const a = Math.max(60, Math.min(94, age));
  return (t.find(([lo, hi]) => a >= lo && a <= hi) || t.at(-1))[2];
}
export function steadi({ answers, tug, chair, age, sex, tandem }) {
  const score = CHECKLIST.reduce((s, q) => s + (answers[q.id] ? q.pts : 0), 0);
  const flags = {
    checklist: score >= 4,
    tug: tug !== null && tug >= 12,
    chair: chair !== null && chair < chairNorm(age, sex),
    balance: tandem !== null && tandem < 10,
  };
  const n = Object.values(flags).filter(Boolean).length;
  return { score, flags, n, atRisk: n > 0, norm: chairNorm(age, sex) };
}

// ── Fall physics ───────────────────────────────────────────────
export function fallPhysics(mass = 70, h = 0.9, surfaceMm = 5) {
  const v = Math.sqrt(2 * G * h), t = Math.sqrt(2 * h / G), E = mass * G * h;
  const d = surfaceMm / 1000, a = v * v / (2 * d);
  return { v, t, E, a, g: a / G, F: mass * a };
}

// ── Scam trainer scenarios ─────────────────────────────────────
// Each message is split into parts; parts with a flag id are red flags to find.
export const SCAMS = [
  { id: 'grandkid', ch: 'call', scam: true, from: 'Unknown number', parts: [['p1'], ['p2', 'impersonation'], ['p3', 'urgency'], ['p4', 'secrecy'], ['p5', 'giftcards']] },
  { id: 'bank', ch: 'sms', scam: true, from: '+1 (555) 010-7788', parts: [['p1', 'impersonation'], ['p2', 'urgency'], ['p3', 'link']] },
  { id: 'delivery', ch: 'sms', scam: true, from: '+44 7700 900123', parts: [['p1'], ['p2', 'fee'], ['p3', 'link']] },
  { id: 'pharmacy', ch: 'sms', scam: false, from: 'Your Pharmacy', parts: [['p1'], ['p2'], ['p3']] },
  { id: 'tax', ch: 'call', scam: true, from: 'Tax Office (spoofed)', parts: [['p1', 'impersonation'], ['p2', 'threat'], ['p3', 'giftcards']] },
  { id: 'techsupport', ch: 'web', scam: true, from: 'Browser pop-up', parts: [['p1', 'threat'], ['p2', 'remote'], ['p3', 'urgency']] },
  { id: 'doctor', ch: 'email', scam: false, from: 'reception@yourclinic.example', parts: [['p1'], ['p2'], ['p3']] },
  { id: 'romance', ch: 'email', scam: true, from: 'captain.james@mail.example', parts: [['p1'], ['p2', 'secrecy'], ['p3', 'money']] },
  { id: 'prize', ch: 'email', scam: true, from: 'awards@winner-notify.example', parts: [['p1', 'toogood'], ['p2', 'fee'], ['p3', 'urgency']] },
  { id: 'family', ch: 'sms', scam: false, from: 'Maria (saved contact)', parts: [['p1'], ['p2']] },
];
