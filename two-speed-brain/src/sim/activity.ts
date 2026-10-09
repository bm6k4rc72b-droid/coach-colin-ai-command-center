// Turns a scenario's pulses into per-region activity at time t, applying the
// person's state (sleep, stress, practised pause) and top-down regulation.
//
// The model is deliberately simple and illustrative. Directions of effect come
// from the cited studies; magnitudes are chosen to be visible, not measured.

import { REGIONS } from '../data/regions';
import type { RegionId } from '../data/regions';
import type { Pulse, Scenario } from '../data/scenarios';

export interface StateMods {
  sleepLoss: boolean;
  stress: boolean;
  pause: boolean;
}

export const MOD_INFO: Record<keyof StateMods, { label: string; detail: string; ref: string }> = {
  sleepLoss: {
    label: 'Slept 5 hours',
    detail: 'Amygdala responses up (about 60% after a sleepless night), prefrontal brake weaker.',
    ref: 'yoo2007',
  },
  stress: {
    label: 'Already stressed',
    detail: 'Stress chemistry weakens prefrontal control and strengthens the body alarm.',
    ref: 'arnsten2009',
  },
  pause: {
    label: 'Practised pause',
    detail: 'Habitual labelling and reappraisal strengthen the prefrontal brake on the amygdala.',
    ref: 'ochsner2005',
  },
};

const FAST: RegionId[] = ['amygdala', 'insula', 'colliculus'];
const BODY: RegionId[] = ['hypothalamus', 'brainstem'];
const BRAKE: RegionId[] = ['lpfc', 'ofc'];

function smooth(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export function pulseAt(pl: Pulse, t: number) {
  if (t <= pl.start || t >= pl.end) return 0;
  if (t <= pl.peak) return pl.level * smooth((t - pl.start) / Math.max(1, pl.peak - pl.start));
  return pl.level * (1 - smooth((t - pl.peak) / Math.max(1, pl.end - pl.peak)));
}

export type Activity = Record<RegionId, number>;

export function emptyActivity(): Activity {
  return Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as Activity;
}

export function activityAt(sc: Scenario, t: number, mods: StateMods, out: Activity = emptyActivity()): Activity {
  for (const r of REGIONS) out[r.id] = 0;
  for (const pl of sc.pulses) out[pl.region] = Math.max(out[pl.region], pulseAt(pl, t));

  // State: scale the raw drives.
  const fastGain = (mods.sleepLoss ? 1.6 : 1) * (mods.stress ? 1.15 : 1);
  const bodyGain = mods.stress ? 1.4 : 1;
  const brakeGain = (mods.sleepLoss ? 0.75 : 1) * (mods.stress ? 0.7 : 1) * (mods.pause ? 1.25 : 1);
  for (const id of FAST) out[id] *= fastGain;
  for (const id of BODY) out[id] *= bodyGain;
  for (const id of BRAKE) out[id] *= brakeGain;
  out.mpfc *= mods.stress ? 0.85 : 1;

  // Regulation: the prefrontal brake damps the fast and body alarms. Its
  // strength (coupling) is weakened by sleep loss and stress and trained by pausing.
  const coupling = 0.55 * (mods.sleepLoss ? 0.55 : 1) * (mods.stress ? 0.75 : 1) * (mods.pause ? 1.6 : 1);
  const brake = Math.min(1, Math.max(out.lpfc, out.ofc));
  const damp = Math.max(0.15, 1 - coupling * brake);
  for (const id of [...FAST, ...BODY]) out[id] *= damp;

  for (const r of REGIONS) out[r.id] = Math.min(1, out[r.id]);
  return out;
}

/** Fast vs slow totals over the timeline, for the timeline's two curves. */
export function curves(sc: Scenario, mods: StateMods, duration: number, samples = 120) {
  const fast: number[] = [];
  const slow: number[] = [];
  const a = emptyActivity();
  for (let i = 0; i <= samples; i++) {
    activityAt(sc, (i / samples) * duration, mods, a);
    fast.push(Math.max(a.amygdala, a.insula, a.colliculus));
    slow.push(Math.max(a.lpfc, a.ofc));
  }
  return { fast, slow };
}

/**
 * The first time (ms) at which the slow brake leads the fast alarm, or null if
 * it never does. If the alarm never rises at all, this is simply when
 * reasoning first becomes the stronger signal.
 */
export function crossover(sc: Scenario, mods: StateMods, duration: number): number | null {
  const a = emptyActivity();
  let fastSeen = false;
  let firstSlowLead: number | null = null;
  for (let t = 0; t <= duration; t += 10) {
    activityAt(sc, t, mods, a);
    const f = Math.max(a.amygdala, a.insula, a.colliculus);
    const s = Math.max(a.lpfc, a.ofc);
    if (f > 0.2) fastSeen = true;
    const slowLeads = s > f && s > 0.2;
    if (slowLeads && firstSlowLead === null) firstSlowLead = t;
    if (fastSeen && slowLeads) return t;
  }
  return fastSeen ? null : firstSlowLead;
}
