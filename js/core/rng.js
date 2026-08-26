/* Deterministic-ish helpers + the variable-ratio reward scheduler.
   Variable-ratio schedules (Ferster & Skinner) produce the highest, most
   persistent response rates of any reinforcement schedule. We use a
   *bounded* one: a guaranteed floor so a good session is never dry, and a
   ceiling so payouts stay meaningful. */

export const rand  = (a=1, b=0) => b + Math.random() * (a - b);
export const randi = (a, b=0) => Math.floor(rand(a, b));
export const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = arr => {
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp  = (a, b, t) => a + (b - a) * t;

/* Gaussian-ish jitter without a heavy library. */
export const jitter = (base, spread) => base + (Math.random() + Math.random() + Math.random() - 1.5) * spread;

export class VariableRatio {
  /** @param {number} mean average successes per payout
   *  @param {number} floor guaranteed payout after this many dry successes */
  constructor(mean = 6, floor = 14){
    this.mean = mean; this.floor = floor; this.dry = 0;
  }
  /** Call on every *successful* rep. Returns true when the jackpot fires. */
  roll(){
    this.dry++;
    if(this.dry >= this.floor){ this.dry = 0; return true; }
    // geometric distribution around `mean`
    if(Math.random() < 1 / this.mean){ this.dry = 0; return true; }
    return false;
  }
  reset(){ this.dry = 0; }
}

/* Near-miss generator: returns how close a failed rep was, so the UI can
   say "12ms" instead of "wrong". Near-misses drive persistence — but we
   only ever report *true* margins, never fabricated ones. */
export const nearMiss = (actual, threshold) => {
  const gap = actual - threshold;
  return { gap, close: gap > 0 && gap < threshold * 0.18 };
};
