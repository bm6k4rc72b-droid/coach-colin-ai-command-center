export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));
