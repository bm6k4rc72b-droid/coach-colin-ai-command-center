import { describe, expect, it } from 'vitest';
import {
  exhaustVelocity, fanPower, G0, launch, MPH, range, packBoundKWh, PRESETS, R_AIR, ROADSTER_2026, ROADSTER_THRUST, ROADSTER_THRUST_80, suctionPressure, T_TANK, tankAirKg,
  tankPressure, thrustForTime,
} from '../src/core/physics';
import { carJump, entrySpeedFor, rollInertia, simulateStunt, STUNT_DEFAULTS, suctionNeeded } from '../src/core/stunt';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.car;

describe('2026 Roadster trims (as revealed 15 Oct 2026)', () => {
  it('Performance meets its "under 1.6 s" claim on suction and rear tyres alone', () => {
    const r = launch(preset('perf'));
    expect(r.t60!).toBeLessThan(1.7);
    expect(r.t60Rollout!).toBeLessThan(1.6);
    expect(r.peakG).toBeGreaterThan(ROADSTER_2026.mu * 0.99); // suction lets grip exceed μ·g
  });
  it('Thrust reproduces the 0.81 s shown live; a full 80 kN would be far quicker', () => {
    expect(launch(ROADSTER_THRUST).t60!).toBeCloseTo(0.81, 1);
    expect(launch(ROADSTER_THRUST_80).t60!).toBeLessThan(0.55);
    expect(thrustForTime(ROADSTER_THRUST, 0.81)).toBeLessThan(40000);
  });
  it('Rocket meets "under 0.59 s"', () => {
    expect(launch(preset('rocket')).t60!).toBeLessThan(0.59);
  });
  it('range lands near the 300+ miles quoted, and the charging claim bounds the pack', () => {
    const miles = range(preset('perf'), 70 * MPH) / 1.609;
    expect(miles).toBeGreaterThan(280);
    expect(miles).toBeLessThan(360);
    // 15 → 85 % in 10 min at ≤ 500 kW ⇒ pack ≤ 119 kWh
    expect(packBoundKWh(500, 0.15, 0.85, 10)).toBeCloseTo(119, 0);
  });
});

describe('compressed air', () => {
  it('ideal-gas mass in a 600 L tank at 300 bar is about 214 kg', () => {
    expect(tankAirKg(ROADSTER_THRUST)).toBeCloseTo((300e5 * 0.6) / (R_AIR * T_TANK), 6);
    expect(tankAirKg(ROADSTER_THRUST)).toBeGreaterThan(200);
    expect(tankPressure(ROADSTER_THRUST, tankAirKg(ROADSTER_THRUST))).toBeCloseTo(300, 6);
  });
  it('cold-air exhaust speed rises with pressure and stays below the ideal limit √(2cₚT)', () => {
    expect(exhaustVelocity(300)).toBeGreaterThan(exhaustVelocity(50));
    expect(exhaustVelocity(300)).toBeLessThan(Math.sqrt(2 * 1005 * 293));
    expect(exhaustVelocity(1)).toBe(0);
  });
});

describe('suction', () => {
  it('ΔP = F/A and fan power is modest', () => {
    expect(suctionPressure(9000, 6)).toBe(1500);
    const f = fanPower(1500, 11, 0.005);
    expect(f.watts).toBeGreaterThan(1000);
    expect(f.watts).toBeLessThan(30000);
  });
  it('needed only where the car is slower than √(gR) upside down', () => {
    expect(suctionNeeded(1700, 10, 6, Math.PI)).toBe(0);
    expect(suctionNeeded(1700, 5, 6, Math.PI)).toBeCloseTo(1700 * (G0 - 25 / 6), 6);
  });
});

describe('the ramp stunt', () => {
  it('completes: stays on the curl, half-rolls and lands softly', () => {
    const r = simulateStunt(ROADSTER_THRUST);
    expect(r.ok).toBe(true);
    expect(r.minNormal).toBeGreaterThan(0);
    expect(r.topSpeed).toBeLessThan(r.speedNoSuction); // only suction keeps it on
    expect(r.rollTime).toBeGreaterThan(0);
    expect(r.samples.at(-1)!.roll).toBeCloseTo(Math.PI, 6);
    expect(r.touchdownSpeed).toBeLessThan(2);
    expect(r.landingG).toBeLessThan(3);
    expect(r.airUsed).toBeGreaterThan(0);
  });
  it('without suction the same run falls off the ramp', () => {
    const r = simulateStunt(ROADSTER_THRUST, { ...STUNT_DEFAULTS, suction: 0 });
    expect(r.ok).toBe(false);
    expect(r.fellAt).not.toBeNull();
    expect(r.touchdownSpeed).toBeGreaterThan(8);
  });
  it('geometry and dynamics formulas', () => {
    expect(entrySpeedFor(0, 6)).toBeCloseTo(Math.sqrt(4 * G0 * 6), 6);
    expect(rollInertia(1200, 2, 1)).toBeCloseTo((1200 * 5) / 12, 6);
    const j = carJump(1700, 2.5, 20);
    expect(j.vy).toBeCloseTo(Math.sqrt(2 * G0 * 2.5), 6);
    expect(j.distance).toBeCloseTo(20 * (2 * j.vy) / G0, 6);
  });
});
