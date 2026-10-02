/**
 * Multi-spectrum detection: one actor crosses past a sensor post watched by a visible camera,
 * a thermal (LWIR) camera, a radar, a microphone and Wi-Fi motion sensing. Pure and testable.
 */
import {
  GAIT_SPEED,
  SPECTRUM as S,
  type AcousticCloak,
  type Gait,
  type Light,
  type RadarCloak,
  type ThermalCloak,
  type VisualCloak,
} from '../config/lab';

export type SensorId = 'visible' | 'thermal' | 'radar' | 'acoustic' | 'wifi';
export const SENSORS: SensorId[] = ['visible', 'thermal', 'radar', 'acoustic', 'wifi'];

export const SENSOR_INFO: Record<SensorId, { name: string; band: string; info: string }> = {
  visible: { name: 'Visible camera', band: '400–700 nm', info: 'Sees contrast and shape. Active camouflage targets this band only.' },
  thermal: { name: 'Thermal camera', band: 'LWIR 8–14 µm', info: 'Sees heat. Displays and electronics make you warmer, not cooler.' },
  radar: { name: 'Radar', band: 'mmWave / X-band', info: 'Sees reflectivity and motion (Doppler). Optical cloaks do nothing here.' },
  acoustic: { name: 'Microphone', band: '20 Hz–20 kHz', info: 'Hears footsteps. Spreading loss is only 6 dB per doubling of range.' },
  wifi: { name: 'Wi-Fi sensing', band: '2.4/5 GHz CSI', info: 'Bodies disturb Wi-Fi channel state; motion is detectable through walls.' },
};

export interface Loadout {
  visual: VisualCloak;
  thermal: ThermalCloak;
  radar: RadarCloak;
  acoustic: AcousticCloak;
  gait: Gait;
}

export const NO_CLOAK: Loadout = { visual: 'none', thermal: 'none', radar: 'none', acoustic: 'none', gait: 'walk' };

export interface Env {
  light: Light;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Johnson-style probability of detection from cycles across the target. */
export function johnson(cycles: number, n50: number): number {
  if (cycles <= 0) return 0;
  const r = cycles / n50;
  const e = 2.7 + 0.7 * r;
  const p = Math.pow(r, e);
  return p / (1 + p);
}

/** Pixels the actor spans vertically at range R for a sensor. */
export function pixelsOnTarget(range: number, pixels: number, fovDeg: number, height = S.actorHeight): number {
  const view = 2 * range * Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return (height / view) * pixels;
}

/** Contrast reduction factor: contrast/(contrast+knee), 0..1. */
const contrastFactor = (c: number, knee: number) => (c <= 0 ? 0 : c / (c + knee));

export interface ActorState {
  /** Position along the path (m). */
  x: number;
  speed: number;
  /** Distance to the sensor post (m). */
  range: number;
  /** Angle between the line of sight and the path normal (rad) — off-design viewpoint for display cloaks. */
  offAxis: number;
  /** Seconds since the start (for thermal blanket warm-up). */
  t: number;
}

export function actorAt(t: number, gait: Gait): ActorState {
  const speed = GAIT_SPEED[gait];
  const x = -S.pathHalf + speed * t;
  const range = Math.hypot(x, S.lateral);
  return { x, speed, range, offAxis: Math.atan2(Math.abs(x), S.lateral), t };
}

export const crossingTime = (gait: Gait) => (2 * S.pathHalf) / GAIT_SPEED[gait];

/** Residual visible contrast fraction left by the visual cloak. */
export function visualResidual(l: Loadout, a: ActorState): number {
  const V = S.visible;
  let r = V.residual[l.visual];
  if (l.visual !== 'none') r += V.motionPenalty * a.speed;
  if (l.visual === 'display') r += V.parallaxPenalty * a.offAxis * 0.3;
  return clamp01(r);
}

/** Apparent surface temperature difference vs ambient (°C). */
export function thermalDelta(l: Loadout, env: Env, t: number): number {
  const T = S.thermal;
  const amb = S.ambientC[env.light];
  let d: number;
  if (l.thermal === 'blanket') d = Math.min(T.blanketMax, T.blanketStart + T.blanketDrift * t);
  else if (l.thermal === 'cooling') d = T.coolingOffset;
  else d = T.surfaceC - amb;
  if (l.visual === 'display' || l.visual === 'adaptive') d += l.thermal === 'cooling' ? 0.1 : T.displayHeat * (l.visual === 'display' ? 1 : 0.4);
  return Math.max(0, d);
}

/** Instantaneous detection probability (per look) for each sensor. */
export function sensorProbabilities(l: Loadout, env: Env, a: ActorState): Record<SensorId, number> {
  // Visible
  const V = S.visible;
  const contrast = V.contrast[env.light] * visualResidual(l, a);
  const visCycles = (pixelsOnTarget(a.range, V.pixels, V.fov) / 2) * contrastFactor(contrast, V.contrastKnee) * V.gain;
  const visible = johnson(visCycles, V.n50);

  // Thermal
  const T = S.thermal;
  const dT = thermalDelta(l, env, a.t);
  const thCycles = (pixelsOnTarget(a.range, T.pixels, T.fov) / 2) * contrastFactor(dT, T.netd) * T.gain;
  const thermal = johnson(thCycles, T.n50);

  // Radar (radar equation SNR ∝ σ/R⁴, moving-target filter)
  const R = S.radar;
  const sigma = R.rcs * (l.radar === 'ram' ? R.ramFactor : 1);
  const snrDb = R.snr1m2at1km + 10 * Math.log10(sigma) + 40 * Math.log10(1000 / Math.max(1, a.range));
  const mti = a.speed / (a.speed + R.vKnee);
  const radar = sigmoid((snrDb - R.detectSnrDb) / 3) * mti;

  // Acoustic
  const A = S.acoustic;
  const src = A.sourceDb[l.gait] - (l.acoustic === 'quiet' ? A.quietReduction : 0);
  const received = src - 20 * Math.log10(Math.max(1, a.range));
  const acoustic = sigmoid((received - A.ambientDb[env.light] - 3) / 2.5);

  // Wi-Fi CSI motion sensing
  const W = S.wifi;
  const near = a.range > W.range ? 0 : 1 - a.range / W.range;
  // Motion dominates; breathing is only detectable very close.
  const wifi = clamp01(W.perSpeed * a.speed * near + 0.02 * near * near);

  return { visible, thermal, radar, acoustic, wifi };
}

export interface ScenarioResult {
  /** Cumulative probability each sensor has detected the actor by the end. */
  cumulative: Record<SensorId, number>;
  /** Peak per-look probability for each sensor. */
  peak: Record<SensorId, number>;
  /** Probability that at least one sensor detected the actor. */
  overall: number;
  duration: number;
  /** Timeline samples for plotting. */
  timeline: { t: number; x: number; p: Record<SensorId, number> }[];
  weightKg: number;
  powerW: number;
}

/** Each sensor takes `looksPerSecond` independent looks; cumulative P = 1 − Π(1 − p·dt·rate). */
export function runScenario(l: Loadout, env: Env, looksPerSecond = S.looksPerSecond): ScenarioResult {
  const duration = crossingTime(l.gait);
  const miss: Record<SensorId, number> = { visible: 1, thermal: 1, radar: 1, acoustic: 1, wifi: 1 };
  const peak: Record<SensorId, number> = { visible: 0, thermal: 0, radar: 0, acoustic: 0, wifi: 0 };
  const timeline: ScenarioResult['timeline'] = [];
  for (let t = 0; t <= duration + 1e-9; t += S.dt) {
    const a = actorAt(t, l.gait);
    const p = sensorProbabilities(l, env, a);
    for (const s of SENSORS) {
      peak[s] = Math.max(peak[s], p[s]);
      miss[s] *= 1 - clamp01(p[s] * looksPerSecond * S.dt);
    }
    timeline.push({ t, x: a.x, p });
  }
  const cumulative = {} as Record<SensorId, number>;
  let allMiss = 1;
  for (const s of SENSORS) {
    cumulative[s] = 1 - miss[s];
    allMiss *= miss[s];
  }
  const { kg, w } = loadoutCost(l);
  return { cumulative, peak, overall: 1 - allMiss, duration, timeline, weightKg: kg, powerW: w };
}

export function loadoutCost(l: Loadout): { kg: number; w: number } {
  let kg = 0;
  let w = 0;
  const add = (k: keyof typeof S.cost) => {
    kg += S.cost[k].kg;
    w += S.cost[k].w;
  };
  if (l.visual !== 'none') add(l.visual);
  if (l.thermal !== 'none') add(l.thermal);
  if (l.radar !== 'none') add(l.radar);
  if (l.acoustic !== 'none') add(l.acoustic);
  return { kg, w };
}

/** Plain-language lessons drawn from a result. */
export function lessons(l: Loadout, r: ScenarioResult): string[] {
  const out: string[] = [];
  const caught = SENSORS.filter((s) => r.cumulative[s] > 0.5);
  if (l.visual !== 'none' && r.cumulative.visible < 0.5 && caught.length)
    out.push(`Your optical cloak worked on the camera, but ${caught.map((s) => SENSOR_INFO[s].name.toLowerCase()).join(', ')} still caught you. Invisibility is per band.`);
  if (l.visual === 'display' && l.thermal === 'none') out.push('An active display skin is a heater: it raised your thermal signature.');
  if (l.thermal === 'blanket') out.push('Thermal blankets work at first, then warm up — heat has to go somewhere.');
  if (l.thermal === 'cooling') out.push(`Active cooling hides heat but costs ${S.cost.cooling.w} W and ${S.cost.cooling.kg} kg of batteries and hardware.`);
  if (l.gait === 'sprint') out.push('Sprinting is loud and makes Doppler radar and Wi-Fi sensing light up.');
  if (l.gait === 'creep') out.push('Moving slowly is the oldest stealth technology: it beats moving-target radar, microphones and Wi-Fi sensing.');
  if (r.overall < 0.2) out.push('Low overall detection — but notice the weight and power you are carrying to get there.');
  if (!out.length) out.push('Try adding one countermeasure at a time and watch which sensor bar drops.');
  return out;
}
