// NEUROLENS · Camera lab — the optics, exactly. by Coach Colin
//
// Every number the camera lab shows comes from the thin-lens model and the
// exposure equation, with the units stated (millimetres on the sensor, metres
// in the world, seconds, stops). Nothing here touches the DOM, so all of it is
// tested.
//
//   field of view        FOV = 2·atan(w / 2f)
//   crop factor          k = 43.27 mm / sensor diagonal
//   circle of confusion  c = diagonal / 1500
//   hyperfocal           H = f² / (N c) + f
//   near / far limits    Dn = s(H − f) / (H + s − 2f),  Df = s(H − f) / (H − s)  (∞ when s ≥ H)
//   blur disc on sensor  b(d) = f² · |d − s| / (N · d · (s − f))
//   exposure value       EV₁₀₀ = log₂(T² / t) − log₂(ISO / 100)
//   shutter angle        t = (angle / 360°) / fps
//   diffraction (Airy)   ⌀ = 2.44 · λ · N
//   dolly zoom           f₂ = f₁ · d₂ / d₁  (subject keeps its size)

export const FULL_FRAME_DIAG = Math.hypot(36, 24); // 43.2666 mm
const RAD = Math.PI / 180;

/** Sensor diagonal, mm. */
export const diagonal = (sensor) => Math.hypot(sensor.w, sensor.h);

/** Crop factor relative to full frame (36 × 24 mm). */
export const cropFactor = (sensor) => FULL_FRAME_DIAG / diagonal(sensor);

/** Circle of confusion, mm (the diagonal/1500 convention). */
export const circleOfConfusion = (sensor) => diagonal(sensor) / 1500;

/**
 * Angles of view in degrees. An anamorphic lens squeezes `squeeze`× more
 * scene horizontally onto the same sensor width.
 */
export function fieldOfView(sensor, fMm, squeeze = 1) {
  return {
    h: (2 * Math.atan((sensor.w * squeeze) / (2 * fMm))) / RAD,
    v: (2 * Math.atan(sensor.h / (2 * fMm))) / RAD,
    d: (2 * Math.atan(Math.hypot(sensor.w * squeeze, sensor.h) / (2 * fMm))) / RAD,
  };
}

/** Full-frame equivalent focal length (by diagonal). */
export const equivalentFocal = (sensor, fMm) => fMm * cropFactor(sensor);

/** Hyperfocal distance, mm. */
export const hyperfocal = (fMm, N, cMm) => (fMm * fMm) / (N * cMm) + fMm;

/**
 * Depth of field around a focus distance.
 *
 * @param {number} fMm Focal length, mm.
 * @param {number} N f-number (geometric aperture, not T-stop).
 * @param {number} sMm Focus distance from the lens, mm.
 * @param {number} cMm Circle of confusion, mm.
 * @returns {{nearMm: number, farMm: number, totalMm: number, hyperfocalMm: number}}
 */
export function depthOfField(fMm, N, sMm, cMm) {
  const H = hyperfocal(fMm, N, cMm);
  const nearMm = (sMm * (H - fMm)) / (H + sMm - 2 * fMm);
  const farMm = sMm >= H ? Infinity : (sMm * (H - fMm)) / (H - sMm);
  return { nearMm, farMm, totalMm: farMm - nearMm, hyperfocalMm: H };
}

/**
 * Diameter of the blur disc on the sensor, mm, for an object at distance d
 * when the lens is focused at s.
 */
export function blurDisc(fMm, N, sMm, dMm) {
  if (!(sMm > fMm) || !(dMm > 0)) return Infinity;
  return (fMm * fMm * Math.abs(dMm - sMm)) / (N * dMm * (sMm - fMm));
}

/** Exposure time from shutter angle and frame rate, seconds. */
export const shutterTime = (angleDeg, fps) => angleDeg / 360 / fps;

/** EV at ISO 100 for an aperture (use the T-stop for exposure), shutter time and ISO. */
export const exposureValue = (T, tSec, iso) => Math.log2((T * T) / tSec) - Math.log2(iso / 100);

/** T-stop for an f-number and a lens transmission (0..1). */
export const tStop = (N, transmission) => N / Math.sqrt(transmission);

/**
 * How far the image is from a correct exposure, in stops (positive = brighter).
 *
 * @param {number} sceneEv EV₁₀₀ that would expose this scene correctly.
 * @param {number} cameraEv EV₁₀₀ the camera settings correspond to.
 * @param {number} [ndStops=0] ND filter strength in stops.
 */
export const exposureOffset = (sceneEv, cameraEv, ndStops = 0) => sceneEv - cameraEv - ndStops;

/** Airy disk diameter, mm (λ = 550 nm by default). */
export const airyDisk = (N, lambdaMm = 550e-6) => 2.44 * lambdaMm * N;

/** The f-number at which the Airy disk equals the circle of confusion (diffraction starts to cost sharpness). */
export const diffractionLimitN = (cMm, lambdaMm = 550e-6) => cMm / (2.44 * lambdaMm);

/** Width of the scene covered at a distance, metres. */
export const fieldWidthAt = (sensor, fMm, dM, squeeze = 1) => (dM * sensor.w * squeeze) / fMm;

/** New focal length that keeps a subject the same size after moving from d1 to d2 (dolly zoom). */
export const dollyZoomFocal = (f1, d1, d2) => (f1 * d2) / d1;

/** Fraction of the frame height a subject of height hM fills at distance dM. */
export const frameFill = (sensor, fMm, hM, dM) => (hM * fMm) / (dM * sensor.h);

/**
 * Colour of a black body at a temperature, as linear-ish 0..1 RGB
 * (Tanner Helland's fit to the CIE data, 1000–40000 K).
 */
export function kelvinToRgb(K) {
  const t = Math.min(40000, Math.max(1000, K)) / 100;
  let r; let g; let b;
  if (t <= 66) r = 255; else r = 329.698727446 * (t - 60) ** -0.1332047592;
  if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661; else g = 288.1221695283 * (t - 60) ** -0.0755148492;
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.min(255, Math.max(0, v)) / 255;
  return [c(r), c(g), c(b)];
}

/**
 * White-balance gains: what a scene lit at lightK looks like through a camera
 * balanced for cameraK. Normalised so green is 1.
 */
export function whiteBalanceGains(lightK, cameraK) {
  const L = kelvinToRgb(lightK); const C = kelvinToRgb(cameraK);
  const g = [L[0] / Math.max(1e-6, C[0]), L[1] / Math.max(1e-6, C[1]), L[2] / Math.max(1e-6, C[2])];
  return g.map((v) => v / g[1]);
}

/**
 * Blur in output pixels for an object at dMm: [horizontal, vertical].
 * Spherical lenses blur round. Anamorphic lenses give tall oval bokeh after
 * desqueeze; the horizontal size is taken as the vertical size / squeeze
 * (a common first approximation — real ovals vary by lens design).
 */
export function blurPixels(o, dMm, outH) {
  const b = blurDisc(o.fMm, o.N, o.sMm, dMm);
  const v = (b / o.sensor.h) * outH;
  // The output frame has the sensor's (desqueezed) aspect, so a round disc is the same size both ways.
  return [o.squeeze > 1 ? v / o.squeeze : v, v];
}

/** Format a distance in mm for a label. */
export function fmtDistance(mm) {
  if (!Number.isFinite(mm)) return '∞';
  if (mm >= 10000) return `${(mm / 1000).toFixed(0)} m`;
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${(mm / 10).toFixed(0)} cm`;
}

/** The nearest standard shutter fraction label for a time, e.g. 1/48. */
export function fmtShutter(tSec) {
  if (tSec >= 0.5) return `${tSec.toFixed(1)} s`;
  return `1/${Math.round(1 / tSec)}`;
}
