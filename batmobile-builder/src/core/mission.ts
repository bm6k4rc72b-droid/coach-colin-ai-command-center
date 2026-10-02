/** Mission requirements, scoring and debrief for the "Gotham pursuit" spec. Pure. */
import { MISSION as M } from '../config/parts';
import type { TestSuite } from './vehicle';

export type Status = 'pass' | 'close' | 'fail';

export interface Requirement {
  id: string;
  label: string;
  target: string;
  value: string;
  status: Status;
  lesson: string;
}

const status = (ok: boolean, close: boolean): Status => (ok ? 'pass' : close ? 'close' : 'fail');
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');

export function evaluate(s: TestSuite): Requirement[] {
  const d = s.derived;
  const r: Requirement[] = [];
  r.push({
    id: 'accel',
    label: '0–100 km/h',
    target: `≤ ${M.accel0to100} s`,
    value: `${f1(s.accel.t0to100)} s`,
    status: status(s.accel.t0to100 <= M.accel0to100, s.accel.t0to100 <= M.accel0to100 * 1.2),
    lesson:
      s.accel.tractionLimited > 0.5
        ? `Traction-limited ${Math.round(s.accel.tractionLimited * 100)}% of the run: more power just spins the tyres. All-wheel drive or stickier tyres help more than horsepower.`
        : `Power-limited: acceleration ≈ power ÷ (mass × speed). You have ${Math.round(d.powerToWeight)} W/kg.`,
  });
  r.push({
    id: 'top',
    label: 'Top speed',
    target: `≥ ${M.topSpeedKmh} km/h`,
    value: `${Math.round(s.top.kmh)} km/h`,
    status: status(s.top.kmh >= M.topSpeedKmh, s.top.kmh >= M.topSpeedKmh * 0.9),
    lesson:
      s.top.limitedBy === 'drag'
        ? `Drag power grows with speed cubed — doubling top speed needs ~8× the power. Your drag area is ${d.cdA.toFixed(2)} m².`
        : 'Limited by gearing / motor speed, not by drag.',
  });
  r.push({
    id: 'brake',
    label: '100–0 km/h braking',
    target: `≤ ${M.brake100to0} m`,
    value: `${f1(s.brake)} m`,
    status: status(s.brake <= M.brake100to0, s.brake <= M.brake100to0 * 1.15),
    lesson: 'Braking distance ≈ v² / (2 μ g): it depends on tyre grip, not on mass — heavier cars need bigger brakes, not longer roads.',
  });
  r.push({
    id: 'hairpin',
    label: `Hairpin (R ${M.hairpinRadius} m)`,
    target: `≥ ${M.hairpinKmh} km/h, no rollover`,
    value: `${Math.round(s.hairpin.maxKmh)} km/h (${s.hairpin.limitedBy})`,
    status: status(s.hairpin.maxKmh >= M.hairpinKmh && s.hairpin.limitedBy === 'grip', s.hairpin.maxKmh >= M.hairpinKmh * 0.9),
    lesson:
      s.hairpin.limitedBy === 'rollover'
        ? `It would tip over before it slides (stability factor ${d.ssf.toFixed(2)} < grip ${d.mu.toFixed(2)}). Lower the centre of gravity or widen the track.`
        : `Slides before it tips (stability factor ${d.ssf.toFixed(2)} > grip ${d.mu.toFixed(2)}) — the safe failure mode.`,
  });
  r.push({
    id: 'jump',
    label: `Canal jump (${M.jumpGap} m gap)`,
    target: `clear it, landing ≤ ${M.landingMaxG} g`,
    value: `${f1(s.jump.range)} m · ${f1(s.jump.occupantG)} g${s.jump.bottomedOut ? ' · bottomed out' : ''}`,
    status: status(s.jump.clears && s.jump.occupantG <= M.landingMaxG && !s.jump.bottomedOut, s.jump.clears && s.jump.occupantG <= M.landingMaxG * 1.5),
    lesson: s.jump.bottomedOut
      ? `The suspension absorbed only ${Math.round(s.jump.absorbed * 100)}% of the landing energy and hit its stops. More travel or a stiffer spring stores more energy (½ k x²).`
      : 'Long suspension travel turns a violent landing into a long, gentle stop: g ≈ v² / (2 · stroke).',
  });
  r.push({
    id: 'crash',
    label: `Crash test (${M.crashKmh} km/h barrier)`,
    target: `≤ ${M.crashMaxG} g on occupants`,
    value: `${f1(s.crash.occupantG)} g (crumple ${s.crash.crumple.toFixed(2)} m)`,
    status: status(s.crash.occupantG <= M.crashMaxG, s.crash.occupantG <= M.crashMaxG * 1.2),
    lesson: 'Armour does not soften a crash — stiff plating steals crumple distance, so occupants decelerate harder. Safety comes from controlled crush.',
  });
  r.push({
    id: 'range',
    label: `Range at ${M.cruiseKmh} km/h`,
    target: `≥ ${M.rangeKm} km`,
    value: `${Math.round(s.rangeKm)} km`,
    status: status(s.rangeKm >= M.rangeKm, s.rangeKm >= M.rangeKm * 0.85),
    lesson: 'At cruise, energy per km = (drag + rolling resistance) / efficiency. Mass and frontal area cost range; electric motors are ~3× more efficient than engines.',
  });
  r.push({
    id: 'protection',
    label: 'Protection rating',
    target: `≥ ${M.protection}`,
    value: `${d.protection} / 5`,
    status: status(d.protection >= M.protection, d.protection >= M.protection - 1),
    lesson: 'Every kilogram of armour is paid for in acceleration, braking, cornering and range.',
  });
  return r;
}

export function score(reqs: Requirement[]): { score: number; grade: string; headline: string } {
  const pts = reqs.reduce((a, r) => a + (r.status === 'pass' ? 1 : r.status === 'close' ? 0.5 : 0), 0);
  const score = Math.round((100 * pts) / reqs.length);
  const grade = score === 100 ? 'Mission ready' : score >= 75 ? 'Nearly there' : score >= 50 ? 'Back to the workshop' : 'Not road-worthy';
  const fails = reqs.filter((r) => r.status !== 'pass').map((r) => r.label.toLowerCase());
  const headline =
    score === 100 ? 'Every requirement met. The trade-offs balance — this is the hard part of real vehicle design.' : `Still missing: ${fails.join(', ')}.`;
  return { score, grade, headline };
}
