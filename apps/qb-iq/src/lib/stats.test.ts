import { describe, expect, test } from 'vitest';
import {
  clamp,
  cohensD,
  ewma,
  finite,
  linearFit,
  mad,
  mean,
  median,
  quantile,
  rate,
  rmsAbout,
  robustZ,
  rollingMean,
  scoreFromRange,
  stdDev,
  summarize,
} from './stats';

describe('finite', () => {
  test('drops nulls, undefined, NaN and infinities in one pass', () => {
    expect(finite([1, null, 2, undefined, Number.NaN, Number.POSITIVE_INFINITY, 3])).toEqual([1, 2, 3]);
  });
});

describe('central tendency', () => {
  test('mean and median agree on a symmetric sample', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  test('median resists an outlier that drags the mean', () => {
    const sample = [10, 11, 12, 13, 400];
    expect(median(sample)).toBe(12);
    expect(mean(sample)).toBeGreaterThan(80);
  });

  test('median interpolates on an even-length sample', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('empty samples answer null rather than zero', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(stdDev([1])).toBeNull();
  });
});

describe('quantile', () => {
  test('interpolates between order statistics', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([0, 10, 20, 30], 0.25)).toBeCloseTo(7.5, 6);
  });

  test('clamps out-of-range probabilities to the extremes', () => {
    expect(quantile([4, 8, 15], -1)).toBe(4);
    expect(quantile([4, 8, 15], 2)).toBe(15);
  });
});

describe('spread', () => {
  test('sample standard deviation uses the n − 1 denominator', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 3);
  });

  test('scaled MAD estimates the standard deviation on clean normal-ish data', () => {
    const sample = [9, 10, 10, 10, 11, 11, 12, 9, 10, 11];
    const scaled = mad(sample) as number;
    expect(scaled).toBeGreaterThan(0.5);
    expect(scaled).toBeLessThan(2.5);
  });

  test('MAD resists a wild value that blows the SD apart', () => {
    const clean = [10, 10, 11, 11, 12, 12, 13, 13, 10, 11];
    const dirty = [...clean.slice(0, 9), 900];
    // Resistant, not invariant: replacing a point still moves the median a
    // little. The point is the ratio — MAD barely stirs while the SD explodes,
    // which is exactly why the flag engine is built on it.
    expect(mad(dirty) as number).toBeLessThan((mad(clean) as number) * 2);
    expect(stdDev(dirty) as number).toBeGreaterThan((stdDev(clean) as number) * 50);
  });

  test('rmsAbout measures scatter around a stated centre, not the sample mean', () => {
    expect(rmsAbout([1, -1, 1, -1], 0)).toBe(1);
    expect(rmsAbout([5, 5, 5], 5)).toBe(0);
  });
});

describe('robustZ', () => {
  const reference = [100, 101, 99, 102, 98, 100, 101, 99, 100, 102, 98, 101];

  test('scores a departure in scaled MAD units', () => {
    const z = robustZ(110, reference) as number;
    expect(z).toBeGreaterThan(3);
  });

  test('is near zero at the reference median', () => {
    expect(Math.abs(robustZ(100, reference) as number)).toBeLessThan(0.5);
  });

  test('withholds an answer when the reference is too small', () => {
    expect(robustZ(10, [1, 2, 3])).toBeNull();
  });

  test('withholds an answer when the reference has no spread', () => {
    expect(robustZ(10, new Array(12).fill(5))).toBeNull();
  });
});

describe('rate', () => {
  test('is the share satisfying the predicate', () => {
    expect(rate([1, 2, 3, 4], (value) => value % 2 === 0)).toBe(0.5);
  });

  test('is null on an empty sample rather than zero', () => {
    expect(rate([], () => true)).toBeNull();
  });
});

describe('rollingMean', () => {
  test('is trailing — no window reaches forward in time', () => {
    expect(rollingMean([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  test('leaves positions without a full window empty rather than averaging a short one', () => {
    expect(rollingMean([5, 5, 5], 3)).toEqual([null, null, 5]);
  });

  test('rejects a window below one', () => {
    expect(() => rollingMean([1, 2], 0)).toThrow();
  });
});

describe('ewma', () => {
  test('alpha of 1 forgets everything but the latest value', () => {
    expect(ewma([1, 9, 4], 1)).toEqual([1, 9, 4]);
  });

  test('a small alpha lags a step change', () => {
    const smoothed = ewma([0, 0, 0, 100], 0.1);
    expect(smoothed[3] as number).toBeLessThan(20);
  });

  test('rejects an alpha outside (0, 1]', () => {
    expect(() => ewma([1], 0)).toThrow();
    expect(() => ewma([1], 1.5)).toThrow();
  });
});

describe('linearFit', () => {
  test('recovers an exact line', () => {
    const fit = linearFit([1, 2, 3, 4], [3, 5, 7, 9]) as NonNullable<ReturnType<typeof linearFit>>;
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  test('reports a low r² on noise', () => {
    const fit = linearFit([1, 2, 3, 4, 5, 6], [5, 1, 6, 2, 5, 3]) as NonNullable<ReturnType<typeof linearFit>>;
    expect(fit.r2).toBeLessThan(0.35);
  });

  test('refuses to fit without variance in x, or with too few points', () => {
    expect(linearFit([2, 2, 2], [1, 2, 3])).toBeNull();
    expect(linearFit([1, 2], [1, 2])).toBeNull();
  });
});

describe('cohensD', () => {
  test('is zero for identical distributions', () => {
    const sample = [1, 2, 3, 4, 5];
    expect(cohensD(sample, sample)).toBeCloseTo(0, 10);
  });

  test('is signed by which group is larger and scaled by pooled spread', () => {
    const d = cohensD([10, 11, 12, 13], [1, 2, 3, 4]) as number;
    expect(d).toBeGreaterThan(4);
    expect(cohensD([1, 2, 3, 4], [10, 11, 12, 13]) as number).toBeLessThan(-4);
  });

  test('withholds an answer when a side is too small', () => {
    expect(cohensD([1], [1, 2, 3])).toBeNull();
  });
});

describe('scoreFromRange and clamp', () => {
  test('maps the stated range onto 0–100 and clamps outside it', () => {
    expect(scoreFromRange(0, -30, 0)).toBe(100);
    expect(scoreFromRange(-30, -30, 0)).toBe(0);
    expect(scoreFromRange(-15, -30, 0)).toBe(50);
    expect(scoreFromRange(-100, -30, 0)).toBe(0);
    expect(scoreFromRange(50, -30, 0)).toBe(100);
  });

  test('clamp holds the bounds', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
  });
});

describe('summarize', () => {
  test('returns every field a distribution strip needs', () => {
    const summary = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) as NonNullable<ReturnType<typeof summarize>>;
    expect(summary.n).toBe(10);
    expect(summary.median).toBeCloseTo(5.5, 6);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(10);
    expect(summary.p10).toBeLessThan(summary.p90);
  });

  test('is null on an empty sample', () => {
    expect(summarize([])).toBeNull();
  });
});
