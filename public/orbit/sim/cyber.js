// ORBIT · the cyber range: a defensive security-operations drill for launch day.
//
// Every scenario is a realistic DEFENSIVE triage decision: evidence arrives,
// the analyst picks a response, and the debrief explains the principle. No
// scenario teaches how to attack anything.
//
// Numbers used in the evidence panels:
//   GNSS/INS consistency test  z = |p_GNSS − p_INS| / σ,  alarm at z > 4
//   anti-replay window         accept only seq > last_seq and |t_pkt − t_now| < 5 s
//   brute-force odds           a 128-bit key: 2¹²⁸ ≈ 3.4 × 10³⁸ guesses
//   HMAC tag forgery           a 64-bit tag: 2⁻⁶⁴ ≈ 5.4 × 10⁻²⁰ per attempt

export const SCENARIOS = [
  { id: 'gnss', sev: 'high', at: 15, correct: 1, principle: 'crossCheck', sys: 'nav' },
  { id: 'replay', sev: 'high', at: 45, correct: 1, principle: 'antiReplay', sys: 'cmd' },
  { id: 'brute', sev: 'critical', at: 80, correct: 1, principle: 'identity', sys: 'it' },
  { id: 'jam', sev: 'high', at: 115, correct: 0, principle: 'resilience', sys: 'rf' },
  { id: 'firmware', sev: 'high', at: 150, correct: 1, principle: 'signing', sys: 'ot' },
  { id: 'phish', sev: 'medium', at: 185, correct: 1, principle: 'human', sys: 'it' },
  { id: 'scan', sev: 'low', at: 215, correct: 1, principle: 'context', sys: 'it' },
  { id: 'segment', sev: 'medium', at: 245, correct: 1, principle: 'segmentation', sys: 'ot' },
];
export const OPTIONS = 3;

// Evidence series for each alert's mini chart (generated deterministically).
export function evidence(id) {
  const pts = [];
  if (id === 'gnss') { for (let t = 0; t <= 20; t += 0.5) { const drift = t > 12 ? 45 * (t - 12) ** 1.5 : 0; pts.push([t, drift + 3 * Math.sin(t * 3)]); } return { pts, unit: 'm', label: 'GNSS − INS', limit: 4 * 12 }; }
  if (id === 'jam') { for (let t = 0; t <= 20; t += 0.5) pts.push([t, t < 11 ? 18 + Math.sin(t) * 0.6 : 3 + Math.sin(t * 2) * 0.8]); return { pts, unit: 'dB', label: 'Eb/N0', limit: 4.4 }; }
  if (id === 'brute') { for (let t = 0; t <= 20; t += 1) pts.push([t, t > 6 && t < 16 ? 180 + 60 * Math.sin(t) : 2]); return { pts, unit: '/min', label: 'failed logins', limit: 20 }; }
  if (id === 'replay') { for (let t = 0; t <= 20; t += 1) pts.push([t, t === 14 ? 94 : 0.2 + 0.1 * Math.sin(t)]); return { pts, unit: 's', label: 'packet age', limit: 5 }; }
  return null;
}

export const crypto = {
  keySpace: (bits) => 2 ** bits,
  yearsToBrute: (bits, guessesPerSec = 1e18) => 2 ** bits / 2 / guessesPerSec / 3.156e7,   // average case: half the space
  forgery: (tagBits) => 2 ** -tagBits,
  zScore: (x, mu, sigma) => Math.abs(x - mu) / sigma,
};
