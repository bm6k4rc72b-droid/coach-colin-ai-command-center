// The models behind each exhibit. Plain functions, so every number shown on
// screen comes from here and is unit-tested. Each is a teaching model with its
// source and its simplifications noted.

// ---------------------------------------------------------------------------
// 1. Heart as a pump
//    Cardiac output = heart rate × stroke volume.
//    Mean arterial pressure ≈ cardiac output × systemic vascular resistance
//    + central venous pressure (the haemodynamic "Ohm's law").
//    Resistance in Wood units (mmHg·min/L); healthy adults ≈ 10–20.

export const CVP = 4; // mmHg, typical central venous pressure

export function cardiacOutput(hr: number, svMl: number) {
  return (hr * svMl) / 1000; // L/min
}

export function meanArterialPressure(hr: number, svMl: number, svrWood: number) {
  return cardiacOutput(hr, svMl) * svrWood + CVP; // mmHg
}

export function pressureBand(map: number): { label: string; tone: 'low' | 'ok' | 'high' } {
  if (map < 65) return { label: 'Too low to perfuse organs well', tone: 'low' };
  if (map <= 105) return { label: 'Typical range', tone: 'ok' };
  return { label: 'High', tone: 'high' };
}

// ---------------------------------------------------------------------------
// 2. Airway tree (Weibel's 23 generations, Murray's law)
//    Each generation splits in two. Murray's law: d(child) = d(parent)·2^(−1/3),
//    so diameter falls slowly while the number of tubes doubles and the total
//    cross-section grows. Trachea ≈ 18 mm across.

export const TRACHEA_MM = 18;
export const MAX_GEN = 23;

export function airways(gen: number) {
  return 2 ** gen;
}

export function airwayDiameterMm(gen: number) {
  return TRACHEA_MM * 2 ** (-gen / 3);
}

/** Total cross-sectional area of all tubes in a generation, cm². */
export function totalAreaCm2(gen: number) {
  const r = airwayDiameterMm(gen) / 20; // radius in cm
  return airways(gen) * Math.PI * r * r;
}

/** Mean air speed in that generation for a given airflow (L/s), in cm/s. */
export function airSpeedCmS(gen: number, flowLs: number) {
  return (flowLs * 1000) / totalAreaCm2(gen);
}

// ---------------------------------------------------------------------------
// 3. Nerve conduction
//    Myelinated fibres: Hursh's rule, ≈ 6 m/s per µm of fibre diameter.
//    Unmyelinated fibres: speed grows with √diameter; ≈ 1.6·√d m/s puts
//    C fibres (0.2–1.5 µm) at the measured 0.5–2 m/s.

export function conductionSpeed(diameterUm: number, myelinated: boolean) {
  return myelinated ? 6 * diameterUm : 1.6 * Math.sqrt(diameterUm); // m/s
}

export function travelMs(distanceM: number, speedMs: number) {
  return (distanceM / speedMs) * 1000;
}

/** On-screen slow-motion time (s) for a real travel time (ms): log-compressed so
 *  8 ms and 1.4 s can both be watched. */
export function playbackSeconds(ms: number) {
  return 0.5 + Math.max(0, Math.log10(ms / 5));
}

export function fibreClass(diameterUm: number, myelinated: boolean) {
  if (!myelinated) return 'C fibre: slow, dull pain and warmth';
  if (diameterUm >= 12) return 'Aα fibre: muscle position and motor';
  if (diameterUm >= 6) return 'Aβ fibre: touch and vibration';
  if (diameterUm >= 1) return 'Aδ fibre: sharp, fast pain and cold';
  return 'Thinly myelinated fibre';
}

// ---------------------------------------------------------------------------
// 4. Hip joint load (instrumented hip implants, Bergmann et al.)
//    Peak hip contact force as a multiple of body weight.

export const ACTIVITIES = [
  { id: 'walk', label: 'Walking', bw: 2.4, source: 'Bergmann et al. (2001)' },
  { id: 'upstairs', label: 'Stairs up', bw: 2.5, source: 'Bergmann et al. (2001)' },
  { id: 'downstairs', label: 'Stairs down', bw: 2.6, source: 'Bergmann et al. (2001)' },
  { id: 'jog', label: 'Jogging', bw: 5, source: 'Bergmann et al. (1993), approx.' },
  { id: 'stumble', label: 'Stumbling', bw: 8.7, source: 'Bergmann et al. (1993), peak' },
] as const;

export type ActivityId = (typeof ACTIVITIES)[number]['id'];

export function hipForceN(massKg: number, multiple: number) {
  return massKg * 9.81 * multiple;
}

// ---------------------------------------------------------------------------
// 5. Half-life race: what is left after it reaches the blood.

export const RACERS = [
  { id: 'glp1', label: 'Natural GLP-1', halfLifeH: 2 / 60, color: '#4FD1C5' },
  { id: 'exenatide', label: 'Exenatide', halfLifeH: 2.4, color: '#F2B35B' },
  { id: 'semaglutide', label: 'Semaglutide', halfLifeH: 165, color: '#7AA2FF' },
] as const;

export function remaining(halfLifeH: number, hours: number) {
  return 0.5 ** (hours / halfLifeH);
}

/** Log time axis from 1 minute to 4 weeks. */
export const RACE_MIN_H = 1 / 60;
export const RACE_MAX_H = 24 * 28;

export function raceHours(u: number) {
  return RACE_MIN_H * (RACE_MAX_H / RACE_MIN_H) ** Math.min(1, Math.max(0, u));
}

export function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

// ---------------------------------------------------------------------------
// 6. Reaction time

export const REACTION_BENCHMARKS = [
  { label: 'Amygdala flags a face', ms: 74, note: 'Méndez-Bértolo et al. (2016)' },
  { label: 'Meaning of a word settles', ms: 400, note: 'Kutas & Hillyard (1980)' },
  { label: 'Typical tap to a light', ms: 250, note: 'Simple visual reaction, roughly 200–300 ms' },
];

export function reactionVerdict(ms: number) {
  if (ms < 100) return 'Faster than seeing is possible: that was a guess.';
  if (ms < 200) return 'Very quick.';
  if (ms < 300) return 'Typical for a simple reaction.';
  if (ms < 450) return 'A little slow; tiredness and distraction add time.';
  return 'Slow. Try again when you are ready.';
}
