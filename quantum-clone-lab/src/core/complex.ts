/** Minimal complex-number arithmetic for the quantum state vector. Pure. */
export interface C {
  re: number;
  im: number;
}

export const c = (re = 0, im = 0): C => ({ re, im });
export const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const scale = (a: C, s: number): C => ({ re: a.re * s, im: a.im * s });
export const conj = (a: C): C => ({ re: a.re, im: -a.im });
/** Squared magnitude |z|² = probability weight. */
export const abs2 = (a: C): number => a.re * a.re + a.im * a.im;
export const abs = (a: C): number => Math.hypot(a.re, a.im);
export const phase = (a: C): number => Math.atan2(a.im, a.re);
/** e^{iθ} as a complex number. */
export const expi = (theta: number): C => ({ re: Math.cos(theta), im: Math.sin(theta) });

export const fmtC = (a: C, p = 3): string => {
  const r = +a.re.toFixed(p);
  const i = +a.im.toFixed(p);
  if (Math.abs(i) < 1e-9) return `${r}`;
  if (Math.abs(r) < 1e-9) return `${i}i`;
  return `${r}${i >= 0 ? '+' : ''}${i}i`;
};
