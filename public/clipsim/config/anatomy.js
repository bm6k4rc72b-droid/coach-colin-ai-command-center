// ─────────────────────────────────────────────────────────────────────────────
// ANATOMY + MICROSCOPE CONFIG — tune sizes, positions and colours here.
//
// Units are MILLIMETRES. The model is a simplified, idealised teaching scene,
// not patient data.
//
// Coordinate frame (the surgeon's view through a right pterional craniotomy,
// after the sylvian fissure has been split):
//   +X  lateral / distal along the middle cerebral artery (toward the insula)
//   −X  medial, toward the midline, optic chiasm and anterior cerebral artery
//   +Y  anterior-superior, the FRONTAL lobe side (top of the screen)
//   −Y  posterior-inferior, the TEMPORAL lobe side (bottom of the screen)
//   +Z  superficial, toward the microscope
//   −Z  deep, toward the skull base
// ─────────────────────────────────────────────────────────────────────────────

export const HEART = {
  baseHR: 72,            // beats per minute at rest under anaesthesia
  // Radial pulsation (mm) of each tissue at peak systole. The aneurysm dome
  // is thin-walled, so it visibly pulses more than the parent artery.
  pulse: { artery: 0.07, aneurysm: 0.16, bleb: 0.22, brain: 0.05, nerve: 0.0 },
};

export const COLORS = {
  cortex:     '#e6a296',   // pia-covered cortex: pink-tan, glossy with CSF
  sulcus:     '#8e4b52',   // deeper, shadowed sulci
  artery:     '#b01c26',
  aneurysm:   '#cf3a47',   // thinner wall, looks lighter and redder
  bleb:       '#b0206a',   // the thinnest point on the dome, most rupture-prone
  vein:       '#5b3a7e',
  nerve:      '#efe3c6',   // myelinated cranial nerves are cream-white
  arachnoid:  '#dfe9ff',
  floor:      '#4a1f26',
  spatula:    '#cfd8e6',
};

export const BRAIN = {
  // Each lobe is a "superellipsoid" (a rounded box). A higher exponent makes it
  // boxier. The gap between the two lobes is the opened sylvian fissure.
  frontal:  { center: [5,  41, -30], radii: [85, 30, 34], exponent: 5 },
  temporal: { center: [5, -43, -33], radii: [85, 30, 34], exponent: 5 },
  gyralDepth: 1.6,     // mm of bumpiness from gyri and sulci
  gyralScale: 0.075,   // spatial frequency of the gyral pattern
  // Deep floor of the view: stands in for the basal cisterns and the tentorium.
  floor: { z: -45, size: 140 },
};

// Vessels are TubeGeometry along Catmull-Rom splines through these points.
// Radii are real-world typical values (radius = diameter / 2).
export const VESSELS = {
  // Supraclinoid internal carotid artery (~4 mm). It rises from the skull base
  // lateral to the optic nerve and ends by bifurcating into M1 and A1.
  ICA: { radius: 2.0, points: [[-3, -13, -46], [-3.6, -8, -37], [-3.2, -4.5, -30], [-1.2, 0, -24], [2, 4, -20]] },
  // M1: horizontal segment of the middle cerebral artery, running laterally
  // inside the sylvian fissure. Following M1 medially is how you find the ICA.
  M1:  { radius: 1.4, points: [[2, 4, -20], [8, 5, -19], [15, 5.5, -16], [22, 6, -12], [27, 6, -9]] },
  // M2 trunks: the MCA divides at the limen insulae into superior and inferior trunks.
  M2s: { radius: 1.0, points: [[27, 6, -9], [31, 8.5, -6], [36, 10.5, -3.5], [44, 11.5, -2]] },
  M2i: { radius: 1.0, points: [[27, 6, -9], [31, 3, -6], [36, -1, -4], [44, -4, -3]] },
  // A1: the first segment of the anterior cerebral artery, running medially above the optic nerve.
  A1:  { radius: 1.1, points: [[2, 4, -20], [-3, 6, -21], [-9, 8, -22], [-16, 9, -22.5], [-26, 9.5, -22]] },
  // Posterior communicating artery: leaves the posteromedial wall of the ICA
  // right at the PROXIMAL edge of the aneurysm neck, then runs posteromedially
  // above the oculomotor nerve to join the PCA. Blade tips that overshoot the
  // proximal edge of the neck catch its origin, so it must be seen and kept free.
  PCom: { radius: 0.65, points: [[-2.67, -10.05, -38.03], [-4.6, -12.8, -38.8], [-8, -16.5, -39.0], [-12.5, -22, -39.2]] },
  // Anterior choroidal artery: arises just DISTAL to the PCom and runs
  // posterolaterally. It is small, but occluding it can cause hemiplegia, so
  // always confirm its flow.
  AChA: { radius: 0.45, points: [[-2.4, -1.6, -26.5], [0, -5.2, -28.6], [5, -10.5, -30.6], [10, -16, -32], [15, -23, -33]] },
  // Superficial sylvian vein, running along the fissure edge on the temporal
  // side. It is usually preserved.
  SSV: { radius: 1.2, vein: true, points: [[-24, -19.5, -1.5], [0, -19, 0.2], [22, -18.6, 0.4], [48, -19.5, -0.8]] },
};

// Tiny lenticulostriate perforators that leave the top of M1 and run deep.
export const PERFORATORS = { count: 4, radius: 0.14, length: 8, fromParam: [0.25, 0.75] };

export const NERVES = {
  // Optic nerve (CN II): a flattened band running medial to the ICA toward the chiasm.
  optic: { radius: 2.3, flatten: 0.6, points: [[-9, 11, -43], [-9.5, 6.5, -34.5], [-11, 2.6, -30.6], [-14, 1.1, -29.4], [-19, -0.6, -28.5], [-30, -2.5, -28.5]] },
  // Oculomotor nerve (CN III): runs deep, below the PCom and right under a
  // posteroinferiorly projecting IC-PC aneurysm. This is why these aneurysms
  // can present with a third-nerve palsy.
  oculomotor: { radius: 1.2, flatten: 1, points: [[-15, -27, -41.5], [-10, -18, -40.5], [-6, -10.5, -40], [-4, -6, -43.5], [-3, -3, -51]] },
};

export const ANEURYSM = {
  // Where the neck sits along the ICA spline (0 = proximal, 1 = bifurcation):
  // at the PCom origin.
  neckParam: 0.44,
  // Projection: posterolateral and downward (deep), as a unit direction in the frame above.
  direction: [0.55, -0.6, -0.58],
  domeDiameter: 6.6,   // mm
  neckDiameter: 3.4,   // mm. A dome-to-neck ratio of about 1.9 makes it clippable.
  // Daughter sac ("bleb") on the dome: a thin, rupture-prone point.
  bleb: { radius: 0.95, polar: 0.35, azimuth: 1.2 },
};

export const ARACHNOID = {
  // Superficial arachnoid bridging the fissure, split into cuttable strips along X.
  superficial: { segments: 12, xRange: [-26, 46], yHalf: 17, z: -5.0, sag: 1.6, opacity: 0.34 },
  // Deeper membranes of the carotid and chiasmatic cisterns over the ICA, PCom and aneurysm.
  deep: { segments: 5, xRange: [-18, 6], yHalf: 11.5, z: -15.5, sag: 1.0, opacity: 0.3 },
};

export const SPATULAS = [
  // Retractors resting on the frontal and temporal lobes. The tips sit on the
  // fissure edges; the handles lead up out of the field toward the retractor arm.
  { id: 'spatulaFrontal',  tip: [17, 11.2, -14], handle: [26, 30, 70], width: 6, thickness: 0.5 },
  { id: 'spatulaTemporal', tip: [21, -13.2, -16], handle: [30, -33, 70], width: 6, thickness: 0.5 },
];

export const MICROSCOPE = {
  target: [0, -4, -28],        // initial focal point: the IC-PC region
  distance: 86,                // working distance, in scene units
  distanceRange: [38, 170],
  fov: 30,
  tiltLimitDeg: 34,            // how far the scope head can tilt off vertical
  startYawDeg: 128,   // scope sits anterolateral (frontal + lateral side), looking back at the ICA
  startTiltDeg: 24,
  panLimit: 40,
  // Post-processing.
  aperture: 0.0022,            // depth-of-field strength
  maxBlur: 0.009,
  bloom: { strength: 0.42, radius: 0.55, threshold: 0.78 },
  vignette: { radius: 0.47, softness: 0.05 },
  streak: 0.55,                // anamorphic horizontal lens-streak intensity
  holo: 0.6,                   // holographic split-tone grade intensity
  lightColor: '#ffe2bf',       // warm halogen/xenon scope light
};
