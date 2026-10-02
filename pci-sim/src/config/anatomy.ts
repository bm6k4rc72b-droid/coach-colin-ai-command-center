/**
 * Every anatomy size, device size and physiology constant lives here.
 * Units: 1 scene unit = 1 mm, times in seconds, pressures in atm.
 *
 * World frame (patient standing, anatomical position):
 *   +X = patient's left, +Y = superior (head), +Z = anterior.
 *
 * Educational values: plausible, rounded, not a clinical reference.
 */

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- heart ----
export const HEART = {
  /** Centre of the ventricular mass. */
  centre: [18, -12, 0] as Vec3,
  /** Direction from centre to apex: left, inferior, anterior. */
  apexDir: [0.6, -0.55, 0.58] as Vec3,
  /** Distance centre → apex along the long axis. */
  apexLength: 64,
  /** Distance centre → base along the long axis (flattened base). */
  baseLength: 46,
  /** Short-axis radius toward the LV lateral wall. */
  radiusLateral: 46,
  /** Short-axis radius toward the anterior surface. */
  radiusAnterior: 38,
  /** Extra radius of the right-ventricular bulge (anterior-right). */
  rvBulge: 9,
  /** Angle (deg) around the long axis where the RV bulge peaks. 0 = lateral (LV), 90 = anterior. */
  rvBulgeAngle: 150,
  /** Anterior interventricular groove angle (deg). */
  antGrooveAngle: 82,
  /** Posterior interventricular groove angle (deg). */
  postGrooveAngle: 262,
  /** Atrioventricular groove position on the long axis (negative = toward base). */
  avGrooveV: -36,
  grooveDepth: 2.5,
  /** Systole as a fraction of the cardiac cycle. */
  systoleFraction: 0.38,
  /** Peak systolic shrink (fraction). */
  beatAmplitude: 0.05,
  meshSegmentsAround: 72,
  meshSegmentsLong: 56,
};

// --------------------------------------------------------------- aorta -----
export const AORTA = {
  rootRadius: 15,
  ascendingRadius: 14,
  archRadius: 12.5,
  descendingRadius: 11.5,
  /** Distance of the coronary ostia from the root centre (sinus radius). */
  sinusRadius: 14,
  /** Ascending / arch / descending centreline offsets from the root centre. */
  path: [
    [0, 0, 0],
    [-6, 30, 6],
    [-9, 62, 6],
    [-4, 88, -6],
    [12, 98, -28],
    [28, 88, -50],
    [34, 55, -60],
    [34, 0, -62],
    [34, -120, -62],
  ] as Vec3[],
  /** Index in `path` where the brachiocephalic trunk joins. */
  brachioJoinIndex: 3,
};

/** Right-radial access path, from the wrist to the brachiocephalic origin (offsets from aortic root). */
export const ACCESS = {
  segments: [
    {
      id: 'radial',
      name: 'Right radial artery',
      radius: 1.25,
      points: [
        [-560, -40, 60],
        [-480, -10, 52],
        [-400, 18, 42],
      ] as Vec3[],
      info: 'Access site at the wrist. Small (~2.5 mm) and prone to spasm; transradial access lowers bleeding risk versus femoral.',
    },
    {
      id: 'brachial',
      name: 'Brachial artery',
      radius: 2.0,
      points: [
        [-400, 18, 42],
        [-330, 52, 30],
        [-250, 86, 18],
      ] as Vec3[],
      info: 'Runs along the upper arm past the elbow. Loops and tortuosity here can make catheter torque harder to transmit.',
    },
    {
      id: 'axillary',
      name: 'Axillary artery',
      radius: 3.0,
      points: [
        [-250, 86, 18],
        [-180, 112, 10],
        [-120, 126, 6],
      ] as Vec3[],
      info: 'Through the armpit toward the chest.',
    },
    {
      id: 'subclavian',
      name: 'Right subclavian artery',
      radius: 4.0,
      points: [
        [-120, 126, 6],
        [-70, 134, 2],
        [-36, 126, 0],
      ] as Vec3[],
      info: 'Arches over the first rib under the clavicle. Subclavian tortuosity is a classic reason radial cases are harder in older patients.',
    },
    {
      id: 'brachiocephalic',
      name: 'Brachiocephalic trunk',
      radius: 6.0,
      points: [
        [-36, 126, 0],
        [-18, 108, -2],
        [-4, 88, -6],
      ] as Vec3[],
      info: 'First branch of the aortic arch. From here the catheter drops into the ascending aorta.',
    },
  ],
  /** Sample spacing (mm) for the access rail and tubes. */
  step: 2,
};

// ----------------------------------------------------------- coronaries ----
export interface BranchSpec {
  id: 'LM' | 'LAD' | 'LCx' | 'D1' | 'D2' | 'RCA';
  name: string;
  parent: BranchSpec['id'] | null;
  /** Arc length (mm) on the parent where this branch starts (Infinity = parent end). */
  branchAt: number;
  /** Proximal / distal reference diameters (mm). */
  dProx: number;
  dDist: number;
  /** Heart-surface path as (v, angleDeg) control points (v = mm along long axis, + toward apex). */
  surfacePath: [number, number][];
  /** Wire-tip rotation (deg) that steers into this branch. */
  wireAngle: number;
  info: string;
}

export const CORONARY: BranchSpec[] = [
  {
    id: 'LM',
    name: 'Left main (LM)',
    parent: null,
    branchAt: 0,
    dProx: 4.4,
    dDist: 4.2,
    surfacePath: [],
    wireAngle: 0,
    info: 'Short trunk from the left coronary cusp. Supplies ~75% of the LV via LAD and LCx — guide catheters must be seated coaxially and gently.',
  },
  {
    id: 'LAD',
    name: 'Left anterior descending (LAD)',
    parent: 'LM',
    branchAt: Infinity,
    dProx: 3.6,
    dDist: 1.5,
    surfacePath: [
      [-40, 70],
      [-30, 78],
      [-10, 82],
      [10, 82],
      [30, 78],
      [48, 70],
      [60, 52],
    ],
    wireAngle: 0,
    info: 'Runs in the anterior interventricular groove to the apex. Supplies the anterior wall and septum. The target lesion is in its mid segment, between D1 and D2.',
  },
  {
    id: 'LCx',
    name: 'Left circumflex (LCx)',
    parent: 'LM',
    branchAt: Infinity,
    dProx: 3.3,
    dDist: 2.0,
    surfacePath: [
      [-40, 64],
      [-38, 40],
      [-36, 10],
      [-34, -20],
      [-30, -50],
      [-18, -70],
    ],
    wireAngle: 165,
    info: 'Turns left in the AV groove around the lateral wall. A wire that "falls" here from the LM needs to be pulled back and re-steered toward the LAD.',
  },
  {
    id: 'D1',
    name: 'First diagonal (D1)',
    parent: 'LAD',
    branchAt: 18,
    dProx: 2.4,
    dDist: 1.3,
    surfacePath: [],
    wireAngle: 72,
    info: 'Branches laterally over the LV free wall, just proximal to the lesion.',
  },
  {
    id: 'D2',
    name: 'Second diagonal (D2)',
    parent: 'LAD',
    branchAt: 58,
    dProx: 2.1,
    dDist: 1.2,
    surfacePath: [],
    wireAngle: 82,
    info: 'Second lateral branch, just distal to the lesion. An occluded LAD balloon also stops D2 flow.',
  },
  {
    id: 'RCA',
    name: 'Right coronary artery (RCA)',
    parent: null,
    branchAt: 0,
    dProx: 3.8,
    dDist: 2.6,
    surfacePath: [
      [-38, 120],
      [-38, 150],
      [-36, 185],
      [-30, 220],
      [-24, 250],
      [-6, 262],
      [20, 266],
    ],
    wireAngle: 0,
    info: 'Arises from the right coronary cusp and runs in the right AV groove. Not part of this case; a guide facing the right cusp will not find the left main.',
  },
];

/** Diagonal branch directions on the heart surface: angle change per mm travelled from the LAD. */
export const DIAGONALS = {
  D1: { length: 52, lateralSweep: -0.9, apicalDrift: 0.55 },
  D2: { length: 46, lateralSweep: -0.8, apicalDrift: 0.6 },
};

/** LM centreline length (ostium → bifurcation). */
export const LM_LENGTH = 11;
/** Coronary centreline sample spacing (mm). */
export const CORONARY_STEP = 0.5;
/** How far the coronary centreline sits off the epicardium beyond its own radius. */
export const CORONARY_LIFT = 0.4;

// --------------------------------------------------------------- lesion ----
export const LESION = {
  vessel: 'LAD' as const,
  /** Centre of the lesion as arc length along the LAD (mm). */
  centre: 38,
  length: 14,
  plateau: 3,
  /** Maximum diameter stenosis (fraction). */
  maxStenosis: 0.9,
  /** Reference diameter (mm) of the LAD at the lesion centre. */
  referenceDiameter: 2.95,
};

/** LAD reference diameter as (arc length, diameter) knots; interpolated linearly. */
export const LAD_DIAMETER_KNOTS: [number, number][] = [
  [0, 3.6],
  [18, 3.25],
  [LESION.centre, LESION.referenceDiameter],
  [58, 2.6],
  [95, 2.1],
  [140, 1.5],
];

// --------------------------------------------------------------- guide -----
export const GUIDE = {
  french: 6,
  outerDiameter: 2.0,
  /** Rotation tolerance (deg) around the left cusp for engagement. */
  engageTolerance: 25,
  /** Torque away from the engaged orientation that pops the guide out (deg). */
  popOutTorque: 40,
  /** Rotation that faces the left coronary cusp (deg). */
  leftCuspAngle: 0,
  rightCuspAngle: 125,
  nonCoronaryCuspAngle: -120,
  initialRotation: 95,
  /** Advance speeds (mm/s): normal and fine (Shift). */
  speed: 55,
  fineSpeed: 10,
  /** Above this speed at the root the advance is not "gentle" (mm/s). */
  gentleSpeed: 25,
  rotateSpeed: 50,
  /** Depth (mm) the tip sits inside the LM ostium when engaged. */
  engagedDepth: 2,
  /** Length of the pre-shaped curved tip (mm). */
  tipCurveLength: 26,
};

// ------------------------------------------------------------ guidewire ----
export const WIRE = {
  diameterInch: 0.014,
  diameter: 0.36,
  speed: 15,
  fineSpeed: 4,
  rotateSpeed: 110,
  initialRotation: 120,
  /** Above this tip speed in the lesion the wire buckles (mm/s). */
  safeLesionSpeed: 8,
  /** Torque (rotating while advancing) raises the safe speed by this factor. */
  torqueBonus: 1.5,
  /** Fraction of the commanded advance that gets through while buckling. */
  buckleProgress: 0.3,
  /** Dissection risk accumulated per second at 2× the safe speed. */
  riskPerSecond: 0.35,
  /** Ceiling of the hidden dissection risk (a forced crossing can still get lucky). */
  maxRisk: 0.9,
  /** Diagonal/side-branch capture half-angle (deg). */
  sideBranchCapture: 50,
  /** Warn this many mm before the end of a vessel. */
  endWarnDistance: 6,
  /** Branch hint look-ahead (mm). */
  hintDistance: 14,
  /** Tip must be this far beyond the lesion's distal end to count as "parked distally". */
  parkBeyondLesion: 25,
  /** Radiopaque tip length (mm). */
  tipLength: 30,
};

// ------------------------------------------------------- balloons/stents ---
export interface DeviceSpec {
  kind: 'balloon' | 'stent';
  diameters: number[];
  lengths: number[];
  nominal: number;
  rbp: number;
  /** Fractional diameter growth per atm above nominal. */
  compliance: number;
}

export const BALLOON: DeviceSpec = {
  kind: 'balloon',
  diameters: [2.0, 2.5, 3.0, 3.5],
  lengths: [12, 15, 20],
  nominal: 8,
  rbp: 14,
  compliance: 0.015,
};

export const STENT: DeviceSpec = {
  kind: 'stent',
  diameters: [2.5, 2.75, 3.0, 3.5, 4.0],
  lengths: [12, 15, 18, 23, 28],
  nominal: 10,
  rbp: 16,
  compliance: 0.012,
};

export const INFLATION = {
  /** Pressure (atm) below which the balloon is still unfolding. */
  unfoldPressure: 2,
  /** Crossing profile of a folded balloon (mm). */
  foldedDiameter: 0.95,
  rate: 3,
  fineRate: 0.75,
  deflateRate: 7,
  /** Rupture at RBP + this. */
  ruptureMargin: 4,
  /** A stent becomes permanently deployed at this pressure. */
  stentDeployPressure: 6,
  /** Pre-dilation counts at this pressure over the lesion. */
  predilatePressure: 6,
  /** Balloon is "up" (occlusive) above this pressure. */
  occlusivePressure: 1.5,
  /** Plain balloon elastic recoil. */
  balloonRecoil: 0.3,
  /** Stent recoil. */
  stentRecoil: 0.03,
  /** Length (mm) over which a treated segment blends back into the native lumen. */
  edgeTaper: 1.2,
  /** Device:reference ratio that dissects. */
  dissectionRatio: 1.2,
  /** Distance beyond a stent end where an edge dissection appears (mm). */
  edgeDissectionOffset: 2.5,
  speed: 12,
  fineSpeed: 3,
  /** Distal balloon tip must stay this far behind the wire tip (mm). */
  wireLead: 8,
  /** Catheter "loaded" position (mm from ostium, negative = inside guide). */
  loadPosition: -60,
  /** Balloon tip length beyond the distal marker (mm). */
  tipLength: 2,
};

// ------------------------------------------------------ flow & contrast ----
export const FLOW = {
  /** Contrast front speed with unobstructed flow (mm/s). */
  baseSpeed: 150,
  /** Stenosis below which flow is unaffected. */
  safeStenosis: 0.6,
  /** Stenosis at and above which flow stops. */
  occlusiveStenosis: 0.98,
  dissectionPenalty: 0.45,
  timi3: 0.8,
  timi2: 0.25,
  timi1: 0.02,
  injectionDuration: 1.6,
  aorticInjectionDuration: 1.4,
  /** Extra washout time per unit of flow deficit. */
  washoutSlowing: 0.6,
  maxCine: 9,
  minCine: 3.2,
  /** Selective injection: reflux of contrast into the aortic root (fraction of selective intensity). */
  refluxIntensity: 0.18,
  refluxLength: 40,
  /** Coronary opacification from an aortic root flush. */
  aorticCoronaryIntensity: 0.55,
  /** How long a dissection stain lingers (s). */
  stainLinger: 7,
};

export const CONTRAST = {
  selectiveMl: 8,
  aorticMl: 20,
  okTotalMl: 120,
};

// --------------------------------------------------------------- fluoro ----
export const FLUORO = {
  fps: 15,
  renderSize: 512,
  /** Distance from isocentre to the virtual image intensifier (mm). */
  distance: 820,
  /** Field of view (deg), ~170 mm field at isocentre. */
  fov: 11.8,
  noise: 0.05,
  okTimeSeconds: 600,
  /** C-arm projection presets (LAO positive / RAO negative, CRA positive / CAU negative). */
  presets: [
    { name: 'RAO 30 CRA 30', lao: -30, cra: 30 },
    { name: 'AP CRA 35', lao: 0, cra: 35 },
    { name: 'LAO 45 CRA 30', lao: 45, cra: 30 },
    { name: 'LAO 45 CAU 30 (spider)', lao: 45, cra: -30 },
    { name: 'RAO 30 CAU 25', lao: -30, cra: -25 },
    { name: 'AP', lao: 0, cra: 0 },
  ],
  /** Two projections are "distinct" when they differ by at least this many degrees. */
  distinctViewDegrees: 20,
  armStep: 2,
  maxLao: 90,
  maxCra: 45,
};

/** X-ray attenuation coefficients (per mm of path, arbitrary but consistent). */
export const ATTENUATION = {
  softTissue: 0.0016,
  heart: 0.0058,
  diaphragm: 0.0045,
  bone: 0.011,
  rib: 0.03,
  contrast: 0.42,
  vesselBlood: 0.01,
  guide: 0.32,
  wire: 1.4,
  wireTip: 3.2,
  marker: 4.0,
  stentShell: 0.14,
  balloonContrast: 0.42,
};

/** Simplified thorax for the fluoro "body" layer (offsets from the heart centre). */
export const THORAX = {
  bodyRadiusX: 165,
  bodyRadiusZ: 115,
  spineOffset: [-14, 0, -88] as Vec3,
  vertebraHeight: 24,
  vertebraRadius: 17,
  vertebrae: 11,
  ribCount: 9,
  ribSpacing: 26,
  diaphragmCentre: [0, -150, -10] as Vec3,
  diaphragmRadius: 125,
};

// ----------------------------------------------------------- physiology ----
export const PHYSIOLOGY = {
  baseHR: 68,
  baseSys: 132,
  baseDia: 74,
  baseSpO2: 98,
  /** Seconds of LAD occlusion to full ischaemia. */
  ischaemiaRise: 20,
  /** Recovery time constant after reperfusion (s). */
  recoveryTau: 8,
  maxST: 4,
  /** LAD flow factor below which perfusion is "very poor". */
  poorFlow: 0.12,
  hrRise: 22,
  chestPainAt: 0.35,
  pvcAfter: 40,
  unstableAfter: 60,
  pvcProbability: 0.28,
  actBaseline: 128,
  actHeparin: 285,
  actTau: 25,
  heparinUnitsPerKg: 100,
  weightKg: 80,
  /** ACT considered therapeutic for PCI (s). */
  actTarget: 250,
};

export const INFLATION_OK_SECONDS = 30;

// ------------------------------------------------------------ the case -----
export const CASE = {
  age: 68,
  sex: 'man',
  weightKg: 80,
  vignette:
    'A 68-year-old, 80 kg man with exertional angina despite optimal medical therapy. ' +
    'Stress testing shows anterior ischaemia. Diagnostic angiography found a focal 90% stenosis ' +
    'of the mid left anterior descending artery between the first and second diagonals. ' +
    'Heart team decision: PCI via the right radial artery.',
};

// ----------------------------------------------------------------- input ---
export const INPUT = {
  /** Wheel notch travel (mm): [normal, fine] per device. */
  wheelGuide: [4, 1] as [number, number],
  wheelWire: [1, 0.25] as [number, number],
  wheelCatheter: [1, 0.25] as [number, number],
  carmNudgeSpeed: 30,
};

export const HEPARIN_UNITS = PHYSIOLOGY.heparinUnitsPerKg * PHYSIOLOGY.weightKg;
