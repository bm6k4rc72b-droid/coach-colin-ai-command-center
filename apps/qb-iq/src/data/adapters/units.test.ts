import { describe, expect, test } from 'vitest';
import {
  degreesToRadians,
  G,
  hzToRpm,
  inchesToMetres,
  metresPerSecToMph,
  metresToInches,
  newtonsToBodyweights,
  poundsToKilograms,
  radPerSecToDegPerSec,
  radPerSecToRpm,
  radiansToDegrees,
  round,
  secondsToMs,
} from './units';

describe('length', () => {
  test('a metre is 39.37 inches', () => {
    expect(metresToInches(1)).toBeCloseTo(39.3701, 4);
  });

  test('inches and metres round-trip', () => {
    expect(metresToInches(inchesToMetres(75))).toBeCloseTo(75, 10);
  });
});

describe('speed', () => {
  test('a metre per second is 2.2369 mph', () => {
    expect(metresPerSecToMph(1)).toBeCloseTo(2.2369, 4);
  });

  test('a professional throw at 25 m/s lands in the mid-fifties in mph', () => {
    expect(metresPerSecToMph(25)).toBeCloseTo(55.9, 1);
  });
});

describe('angle', () => {
  test('π radians is 180 degrees, both ways', () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 10);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 10);
  });

  test('angular velocity converts with the same factor as angle', () => {
    // A shoulder solving at 60 rad/s is roughly 3438 °/s — professional range.
    expect(radPerSecToDegPerSec(60)).toBeCloseTo(3437.75, 1);
  });
});

describe('spin', () => {
  test('one revolution per second is 60 rpm from either input form', () => {
    expect(radPerSecToRpm(2 * Math.PI)).toBeCloseTo(60, 10);
    expect(hzToRpm(1)).toBe(60);
  });

  test('a 600 rpm spiral is about 62.8 rad/s', () => {
    expect(radPerSecToRpm(62.83)).toBeCloseTo(600, 0);
  });
});

describe('force', () => {
  test('a force equal to bodyweight is exactly 1 ×BW', () => {
    const massKg = 98.9;
    expect(newtonsToBodyweights(massKg * G, massKg)).toBeCloseTo(1, 10);
  });

  test('a 2 ×BW lead-leg brake reads as 2', () => {
    const massKg = 100;
    expect(newtonsToBodyweights(2 * massKg * G, massKg)).toBeCloseTo(2, 10);
  });

  test('rejects a non-positive mass rather than dividing by zero', () => {
    expect(() => newtonsToBodyweights(1000, 0)).toThrow();
  });

  test('pounds convert to kilograms', () => {
    expect(poundsToKilograms(218)).toBeCloseTo(98.88, 2);
  });
});

describe('time and rounding', () => {
  test('seconds become milliseconds', () => {
    expect(secondsToMs(2.604)).toBeCloseTo(2604, 9);
  });

  test('round leaves no float dust behind', () => {
    expect(round(1.005, 2)).toBe(1.0);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(74.5499, 1)).toBe(74.5);
  });
});
