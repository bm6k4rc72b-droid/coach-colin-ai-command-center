/**
 * "What can you actually use today?" — the AI / software / sensor stack behind invisibility
 * effects and their counter-measures, plus a real-time latency budget calculator. Pure data.
 * Latencies are typical orders of magnitude on a recent laptop, not benchmarks.
 */

export type Maturity = 'Shipping' | 'Prototype' | 'Research' | 'Fiction';
export type Category = 'Perception AI' | 'Generative AI' | '3D scene AI' | 'Sensors (the other side)' | 'Physical cloaks' | 'AI that builds the software';

export interface Tech {
  id: string;
  name: string;
  category: Category;
  what: string;
  cloakUse: string;
  limits: string;
  maturity: Maturity;
  runsOn: string;
  /** Where it is used in this lab, if anywhere. */
  inLab?: string;
  link?: string;
}

export const TECH: Tech[] = [
  {
    id: 'segmenter',
    name: 'Person segmentation — MediaPipe Image Segmenter',
    category: 'Perception AI',
    what: 'A small neural network labels every pixel as person or background, 30+ times a second, on-device.',
    cloakUse: 'Gives the cloak its mask: which pixels to replace.',
    limits: 'Edges (hair, fingers), fast motion and unusual poses leak through; it only knows "person".',
    maturity: 'Shipping',
    runsOn: 'Browser (WASM / WebGL), phones',
    inLab: 'Live Cloak — webcam mode, running in your browser',
    link: 'https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter',
  },
  {
    id: 'cleanplate',
    name: 'Clean-plate compositing',
    category: 'Perception AI',
    what: 'Store a frame of the empty scene, then paste it wherever the mask says a person is. Decades-old VFX technique — no AI by itself.',
    cloakUse: 'The core of every webcam "invisibility cloak" demo.',
    limits: 'Breaks the moment the camera moves, the light changes, or something behind you moves.',
    maturity: 'Shipping',
    runsOn: 'Anywhere (simple pixel maths)',
    inLab: 'Live Cloak — "Clean plate" mode',
  },
  {
    id: 'detector',
    name: 'Object detection — COCO-SSD / YOLO',
    category: 'Perception AI',
    what: 'Finds people and objects as boxes with confidence scores. YOLO-family models run in real time on GPUs and edge devices.',
    cloakUse: 'The "red team": does an AI still see a person in the cloaked video?',
    limits: 'Only judges the pixels it is given — a doctored video can fool it, the real scene cannot.',
    maturity: 'Shipping',
    runsOn: 'Browser (TensorFlow.js), GPU, edge boxes',
    inLab: 'Live Cloak — red team (real COCO-SSD in webcam mode)',
    link: 'https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd',
  },
  {
    id: 'pose',
    name: 'Pose & hand tracking — MediaPipe Hands / Pose',
    category: 'Perception AI',
    what: 'Tracks body and finger landmarks in real time.',
    cloakUse: 'Gesture triggers (pinch to vanish) — used in this repo’s UcantSeeMeX app.',
    limits: 'Needs the hand in view and reasonable light.',
    maturity: 'Shipping',
    runsOn: 'Browser, phones',
    link: 'https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker',
  },
  {
    id: 'sam',
    name: 'Segment Anything (SAM 2)',
    category: 'Perception AI',
    what: 'Promptable segmentation of any object, tracked through video.',
    cloakUse: 'Hide objects other than people (a bag, a car) with one click.',
    limits: 'Heavier models; real-time needs a strong GPU or a distilled variant.',
    maturity: 'Shipping',
    runsOn: 'GPU / server; small variants on device',
    link: 'https://github.com/facebookresearch/sam2',
  },
  {
    id: 'inpaint',
    name: 'Video inpainting — LaMa, ProPainter, generative fill',
    category: 'Generative AI',
    what: 'Invents plausible pixels behind a removed object, using the surrounding frames and learned image statistics.',
    cloakUse: 'Removes you even without a clean plate (moving cameras, crowded scenes).',
    limits: 'Slow (hundreds of ms per frame or offline), can hallucinate, flickers over time.',
    maturity: 'Shipping',
    runsOn: 'GPU / cloud; offline for video',
    link: 'https://github.com/sczhou/ProPainter',
  },
  {
    id: 'depth',
    name: 'Monocular depth — Depth Anything',
    category: '3D scene AI',
    what: 'Estimates distance for every pixel from a single image.',
    cloakUse: 'Lets a cloak shift the background with parallax as the viewer moves.',
    limits: 'Relative, not metric, depth without calibration; errors at edges.',
    maturity: 'Shipping',
    runsOn: 'GPU; small models in browser via WebGPU',
    link: 'https://github.com/DepthAnything/Depth-Anything-V2',
  },
  {
    id: 'splat',
    name: 'Neural scene capture — NeRF / 3D Gaussian Splatting',
    category: '3D scene AI',
    what: 'Reconstructs a scene in 3D from photos and renders it from any new viewpoint.',
    cloakUse: 'What a true optical cloak needs: the correct background for every observer angle.',
    limits: 'Capture and training take minutes to hours; scenes must be static.',
    maturity: 'Shipping',
    runsOn: 'GPU (training); fast rendering after',
    link: 'https://github.com/graphdeco-inria/gaussian-splatting',
  },
  {
    id: 'thermal',
    name: 'Thermal cameras (LWIR microbolometers)',
    category: 'Sensors (the other side)',
    what: 'Images heat (8–14 µm). Small modules cost about as much as a phone accessory.',
    cloakUse: 'Sees straight through optical cloaks — and electronics make you warmer.',
    limits: 'Lower resolution than visible cameras; glass blocks LWIR.',
    maturity: 'Shipping',
    runsOn: 'Hardware module',
    inLab: 'Spectrum Lab — thermal sensor model',
  },
  {
    id: 'radar',
    name: 'mmWave radar & Wi-Fi sensing',
    category: 'Sensors (the other side)',
    what: 'Single-chip radars detect motion and even breathing; Wi-Fi channel state reveals movement through walls (being standardised as IEEE 802.11bf).',
    cloakUse: 'Optical camouflage does nothing at radio wavelengths.',
    limits: 'Range and resolution limits; clutter; privacy concerns.',
    maturity: 'Shipping',
    runsOn: 'Hardware module / Wi-Fi chipsets',
    inLab: 'Spectrum Lab — radar and Wi-Fi models',
  },
  {
    id: 'adaptiv',
    name: 'Adaptive thermal tiles (BAE Systems "Adaptiv")',
    category: 'Physical cloaks',
    what: 'Hexagonal tiles that change temperature fast to mimic the background in thermal cameras (vehicle prototype shown in 2011).',
    cloakUse: 'Active camouflage in the thermal band.',
    limits: 'Power, weight and cost; matches one viewpoint/background at a time.',
    maturity: 'Prototype',
    runsOn: 'Vehicle-mounted hardware',
  },
  {
    id: 'lens',
    name: 'Lens cloaks (Rochester cloak) & lenticular sheets',
    category: 'Physical cloaks',
    what: 'Lens arrangements or lenticular plastic bend light around a small region for limited angles.',
    cloakUse: 'Real, passive optical hiding — for small objects and narrow viewing ranges.',
    limits: 'Only works over limited angles and sizes; obvious up close.',
    maturity: 'Research',
    runsOn: 'Optics bench',
  },
  {
    id: 'meta',
    name: 'Metamaterial cloaks',
    category: 'Physical cloaks',
    what: 'Engineered structures that guide waves around an object — first shown for microwaves in 2006.',
    cloakUse: 'Proof that cloaking physics works.',
    limits: 'Narrow frequency band, small objects, 2D demos; full-spectrum visible cloaking is not achievable with known materials.',
    maturity: 'Research',
    runsOn: 'Laboratory',
  },
  {
    id: 'harry',
    name: 'A wearable, full-spectrum, all-angle invisibility cloak',
    category: 'Physical cloaks',
    what: 'The movie version.',
    cloakUse: '—',
    limits: 'Would need to be correct for every viewer, every wavelength and every sensor at once. Not possible today.',
    maturity: 'Fiction',
    runsOn: '—',
  },
  {
    id: 'claude',
    name: 'AI coding assistants (e.g. Claude Code)',
    category: 'AI that builds the software',
    what: 'Large language models that read a codebase, write and test code, and explain it. This whole lab — physics models, pipeline, tests — was written with Claude Code.',
    cloakUse: 'Builds and iterates the pipeline: wire up MediaPipe, write the compositing maths, tune parameters, write tests.',
    limits: 'Not in the per-frame loop: a language model takes hundreds of milliseconds or more per answer, far over a 33 ms frame budget. Check its work with tests.',
    maturity: 'Shipping',
    runsOn: 'Cloud',
    inLab: 'Authored this lab',
    link: 'https://claude.com/claude-code',
  },
  {
    id: 'vlm',
    name: 'Vision-language models as a slow "judge"',
    category: 'AI that builds the software',
    what: 'Multimodal models can look at a frame and say, in words, whether a person is visible and why.',
    cloakUse: 'Offline red-teaming of recorded cloak footage, with explanations.',
    limits: 'Seconds per image, costs per call; not real-time.',
    maturity: 'Shipping',
    runsOn: 'Cloud',
  },
];

/** Components for the real-time budget calculator (typical latency per frame, ms). */
export interface Stage {
  id: string;
  name: string;
  ms: number;
  /** Rough quality contribution 0..1 (what it buys the cloak). */
  quality: number;
  role: 'mask' | 'background' | 'check';
}

export const STAGES: Stage[] = [
  { id: 'mp-seg', name: 'MediaPipe person segmenter', ms: 8, quality: 0.7, role: 'mask' },
  { id: 'sam2', name: 'SAM 2 video segmentation (large)', ms: 120, quality: 0.95, role: 'mask' },
  { id: 'plate', name: 'Clean-plate composite', ms: 2, quality: 0.6, role: 'background' },
  { id: 'lama', name: 'LaMa / generative inpainting', ms: 180, quality: 0.85, role: 'background' },
  { id: 'depth', name: 'Depth estimate + parallax warp', ms: 30, quality: 0.75, role: 'background' },
  { id: 'coco', name: 'COCO-SSD red-team check', ms: 40, quality: 0, role: 'check' },
  { id: 'llm', name: 'Language-model judge', ms: 1500, quality: 0, role: 'check' },
];

export interface Budget {
  totalMs: number;
  fps: number;
  realtime: boolean;
  quality: number;
  verdict: string;
}

/** Sequential pipeline: total latency, achievable fps, and whether it meets a 30 fps budget. */
export function budget(ids: string[], targetFps = 30): Budget {
  const chosen = STAGES.filter((s) => ids.includes(s.id));
  const totalMs = chosen.reduce((a, s) => a + s.ms, 0);
  const fps = totalMs > 0 ? 1000 / totalMs : Infinity;
  const mask = Math.max(0, ...chosen.filter((s) => s.role === 'mask').map((s) => s.quality));
  const bg = Math.max(0, ...chosen.filter((s) => s.role === 'background').map((s) => s.quality));
  const quality = mask * bg;
  const realtime = totalMs <= 1000 / targetFps;
  let verdict: string;
  if (!mask) verdict = 'No mask stage: the cloak does not know where you are.';
  else if (!bg) verdict = 'No background stage: nothing to replace your pixels with.';
  else if (realtime) verdict = `Real-time: ${Math.round(totalMs)} ms per frame fits the ${Math.round(1000 / targetFps)} ms budget.`;
  else verdict = `Too slow for live video (${Math.round(fps * 10) / 10} fps) — fine for offline post-production.`;
  return { totalMs, fps, realtime, quality, verdict };
}
