import { describe, expect, it } from 'vitest';
import {
  airSpeedCmS,
  airwayDiameterMm,
  airways,
  cardiacOutput,
  conductionSpeed,
  hipForceN,
  meanArterialPressure,
  remaining,
  raceHours,
  totalAreaCm2,
  travelMs,
} from '../src/models/physiology';

describe('heart', () => {
  it('a resting adult gives about 5 L/min and a normal mean pressure', () => {
    expect(cardiacOutput(70, 70)).toBeCloseTo(4.9, 1);
    const map = meanArterialPressure(70, 70, 17);
    expect(map).toBeGreaterThan(80);
    expect(map).toBeLessThan(100);
  });
});

describe('airways', () => {
  it('doubles the tubes and shrinks the diameter by 2^(1/3) each generation', () => {
    expect(airways(23)).toBe(8388608);
    expect(airwayDiameterMm(3) / airwayDiameterMm(0)).toBeCloseTo(0.5, 6);
  });
  it('total area grows, so air slows down deeper in', () => {
    expect(totalAreaCm2(10)).toBeGreaterThan(totalAreaCm2(0));
    expect(airSpeedCmS(10, 0.5)).toBeLessThan(airSpeedCmS(0, 0.5));
    // About 2 m/s in the trachea at quiet breathing.
    expect(airSpeedCmS(0, 0.5)).toBeGreaterThan(150);
    expect(airSpeedCmS(0, 0.5)).toBeLessThan(250);
  });
});

describe('nerves', () => {
  it('matches measured ranges for A-alpha and C fibres', () => {
    expect(conductionSpeed(15, true)).toBeGreaterThan(70);
    expect(conductionSpeed(15, true)).toBeLessThan(120);
    expect(conductionSpeed(1, false)).toBeGreaterThan(0.5);
    expect(conductionSpeed(1, false)).toBeLessThan(2);
  });
  it('a metre takes about 10 ms on a fast fibre and most of a second on a slow one', () => {
    expect(travelMs(1, conductionSpeed(16, true))).toBeLessThan(15);
    expect(travelMs(1, conductionSpeed(1, false))).toBeGreaterThan(500);
  });
});

describe('hip and half-life', () => {
  it('computes hip force in newtons', () => {
    expect(hipForceN(70, 2.4)).toBeCloseTo(1648, 0);
  });
  it('halves once per half-life', () => {
    expect(remaining(2, 2)).toBeCloseTo(0.5, 9);
    expect(remaining(165, 165 * 2)).toBeCloseTo(0.25, 9);
  });
  it('log race axis spans 1 minute to 4 weeks', () => {
    expect(raceHours(0)).toBeCloseTo(1 / 60, 9);
    expect(raceHours(1)).toBeCloseTo(672, 6);
  });
});
