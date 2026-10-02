/**
 * Every physical and pipeline constant lives here. Values are rounded, textbook-level figures
 * for teaching — not engineering design data. EMP figures are relative / conceptual.
 */

// ------------------------------------------------------------ live cloak ----
export const CLOAK = {
  /** Processing resolution of the cloak pipeline (px). */
  width: 480,
  height: 360,
  /** Default mask threshold and feather (px). */
  threshold: 0.5,
  feather: 3,
  dilate: 2,
  /** Synthetic actor: walking speed across the frame (fraction of width per second). */
  syntheticSpeed: 0.07,
  /** Simulated segmenter noise in synthetic mode (fraction of edge pixels flipped). */
  syntheticMaskNoise: 0.08,
  /** Lighting drift amplitude when "lights change" is on (fraction of brightness). */
  lightingDrift: 0.4,
  /** Shimmer (refraction) displacement in px. */
  shimmerStrength: 6,
  /** Residual-evidence detector (synthetic red team): logistic midpoint and slope. */
  evidenceMid: 0.05,
  evidenceSlope: 70,
  /** Person-detector confidence considered "detected". */
  detectThreshold: 0.5,
};

/** MediaPipe Tasks Vision runtime (WASM loaded from a CDN, model bundled with the app). */
export const MEDIAPIPE = {
  version: '1.0.1',
  /** Self-hosted copy (scripts/fetch-models.mjs), with the CDN as fallback. */
  wasmLocal: 'mediapipe-wasm',
  wasmCdn: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
  segmenterModel: 'models/selfie_segmenter.tflite',
  cocoLocal: 'models/coco-ssd/model.json',
};

// ------------------------------------------------------------- spectrum ----
export type VisualCloak = 'none' | 'adaptive' | 'display';
export type ThermalCloak = 'none' | 'blanket' | 'cooling';
export type RadarCloak = 'none' | 'ram';
export type AcousticCloak = 'none' | 'quiet';
export type Gait = 'walk' | 'creep' | 'sprint';
export type Light = 'day' | 'dusk' | 'night';

export const GAIT_SPEED: Record<Gait, number> = { walk: 1.4, creep: 0.45, sprint: 4.5 };

export const SPECTRUM = {
  /** Path from x = −pathHalf to +pathHalf (m), passing `lateral` m from the sensor post. */
  pathHalf: 50,
  lateral: 40,
  /** Independent operator/algorithm looks per second at each sensor. */
  looksPerSecond: 0.15,
  actorHeight: 1.75,
  dt: 0.1,
  visible: {
    /** Vertical pixels and vertical field of view (deg). */
    pixels: 1080,
    fov: 40,
    /** Johnson-style N50: cycles across the target for 50% detection. */
    n50: 1.0,
    /** Apparent contrast of an uncloaked person against the background, per light level. */
    contrast: { day: 0.45, dusk: 0.25, night: 0.12 } as Record<Light, number>,
    contrastKnee: 0.3,
    /** Cycles gain (blur, compression, clutter). */
    gain: 0.1,
    /** Residual contrast left by each visual cloak at its design viewpoint. */
    residual: { none: 1, adaptive: 0.35, display: 0.02 } as Record<VisualCloak, number>,
    /** Extra residual per m/s of motion (display latency / pattern lag). */
    motionPenalty: 0.03,
    /** Extra residual for the display cloak per radian off its design viewpoint (parallax). */
    parallaxPenalty: 0.5,
  },
  thermal: {
    pixels: 240,
    fov: 24,
    n50: 1.0,
    /** Clothing surface temperature of an uncloaked person (°C). */
    surfaceC: 30,
    /** Thermal blanket: starts this far above ambient and warms with time (°C, °C/s). */
    blanketStart: 0.3,
    blanketDrift: 0.06,
    blanketMax: 6,
    /** Active cooling holds this offset (°C) but costs power. */
    coolingOffset: 0.1,
    /** Heat from an active display skin (°C added to surface). */
    displayHeat: 2.5,
    /** Noise-equivalent temperature difference knee (°C). */
    netd: 2,
    gain: 0.22,
  },
  radar: {
    /** Human radar cross-section (m²) and radar-absorbent reduction factor. */
    rcs: 0.5,
    ramFactor: 0.15,
    /** SNR (dB) of a 1 m² target at 1 km. */
    snr1m2at1km: -38,
    detectSnrDb: 13,
    /** Moving-target filter: fraction kept for a target moving at v (m/s) = v/(v+vKnee). */
    vKnee: 0.6,
  },
  acoustic: {
    /** Footstep level at 1 m (dB) by gait and quiet-boot reduction. */
    sourceDb: { walk: 64, creep: 48, sprint: 78 } as Record<Gait, number>,
    quietReduction: 10,
    ambientDb: { day: 45, dusk: 38, night: 30 } as Record<Light, number>,
  },
  wifi: {
    /** Wi-Fi motion sensing (CSI) range (m) and sensitivity per m/s. */
    range: 45,
    perSpeed: 0.35,
  },
  ambientC: { day: 24, dusk: 18, night: 12 } as Record<Light, number>,
  /** Loadout cost (kg, W). */
  cost: {
    adaptive: { kg: 1.5, w: 15 },
    display: { kg: 4.0, w: 60 },
    blanket: { kg: 1.2, w: 0 },
    cooling: { kg: 6.0, w: 150 },
    ram: { kg: 3.0, w: 0 },
    quiet: { kg: 0.4, w: 0 },
  },
};

// ------------------------------------------------------------------ EMP -----
/** Conceptual high-altitude EMP model in relative units (IEC 61000-2-9 uses 50 kV/m as its E1 reference). */
export const EMP = {
  /** E1 reference peak field (kV/m) at threat level 1.0. */
  e1RefKvPerM: 50,
  /** Fraction of field × length that appears as conductor voltage (rough coupling). */
  coupling: 0.02,
  /** E3 stress per km of connected line at threat 1.0 (relative). */
  e3PerKm: 0.012,
  /** Filtered / clamped let-through voltage for protected conductors (V). */
  filterLetThrough: 60,
};

export const ENCLOSURES = {
  none: { name: 'None', seDb: 0, kg: 0, cost: 0 },
  metal: { name: 'Metal box (gaps, vents)', seDb: 20, kg: 2, cost: 40 },
  bag: { name: 'Faraday bag / tight can', seDb: 50, kg: 0.3, cost: 30 },
  room: { name: 'Shielded room (welded, gasketed)', seDb: 80, kg: 0, cost: 5000 },
} as const;
export type EnclosureId = keyof typeof ENCLOSURES;
