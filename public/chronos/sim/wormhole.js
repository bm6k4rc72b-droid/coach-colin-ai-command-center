// CHRONOS · traversable wormholes and the Morris–Thorne–Yurtsever time machine (1988).
//
// Ellis–Morris–Thorne throat:  ds² = −c²dt² + dl² + (b² + l²)dΩ²      (r(l) = √(b² + l²))
//   embedding surface  z(r) = ± b·arccosh(r/b)
// Holding the throat open needs exotic (negative) energy; to order of magnitude
//   |m| ≈ c²·b / G   ≈ 1.35 × 10²⁷ kg per metre of throat radius (≈ 0.7 Jupiter masses).
// Time machine: carry one mouth on a round trip at speed β for Earth time T.
//   The travelling mouth ages T/γ, so the mouths' clocks differ by  Δ = T·(1 − 1/γ).
//   Through the throat the two mouths keep the same clock time, so stepping in at the moving
//   mouth after it returns takes you Δ into the past at the other mouth — but never to before
//   the machine existed. A closed timelike curve appears once Δ exceeds the light travel
//   time between the mouths, D/c (Hawking's chronology protection suggests vacuum
//   fluctuations would blow up exactly then).

export const G = 6.674e-11, C = 2.99792458e8, MJ = 1.898e27, MSUN = 1.989e30;
export const exoticMass = (bMetres) => (C * C * bMetres) / G;                 // kg (magnitude)
export function timeMachine(T, beta, D) {
  const gamma = 1 / Math.sqrt(1 - beta * beta), delta = T * (1 - 1 / gamma);
  return { gamma, delta, mouthAge: T / gamma, ctc: delta > D, margin: delta - D };
}
export const embedZ = (r, b) => b * Math.acosh(Math.max(1, r / b));
