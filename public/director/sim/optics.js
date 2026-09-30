// DIRECTOR'S CHAIR · camera, lens and light math.
//
// All lengths in millimetres unless noted; subject distances in metres at the
// API and converted internally.
//
//   Field of view       FOV = 2·atan(w / 2f)                  (w = sensor width × anamorphic squeeze)
//   Circle of confusion c = d_sensor / 1500                   (Zeiss formula)
//   Hyperfocal          H = f² / (N·c) + f
//   Near / far focus    D_n = s(H − f)/(H + s − 2f),  D_f = s(H − f)/(H − s)   (∞ when s ≥ H)
//   Blur at distance d  b(d) = (f²/N)·|d − s| / (d·(s − f))    (blur-circle diameter on the sensor)
//   Shutter             t = (angle / 360°) / fps               (180° at 24 fps → 1/48 s)
//   Exposure value      EV₁₀₀ = log₂(N²/t) − log₂(ISO/100)
//   Frame height at d   h = d · sensorH / f  → focal for a framing: f = sensorH · d / h
//   Dolly zoom          f₂ = f₁ · d₂ / d₁  (subject size constant, background changes)
//   Illuminance         E = I / d²  (lux from candela); contrast in stops = log₂(E_key+E_fill)/E_fill

export const SENSORS = {
  s35: { w: 24.89, h: 18.66, name: 'Super 35' },
  ff: { w: 36.0, h: 24.0, name: 'Full frame' },
  lf: { w: 36.7, h: 25.54, name: 'Large format' },
  imax: { w: 70.41, h: 52.63, name: 'IMAX 65/70 mm' },
};
export const T_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
export const LENSES = [14, 18, 24, 32, 40, 50, 65, 85, 100, 135];
// Framing sizes: height of the frame at the subject, in metres.
export const FRAMINGS = { ecu: 0.16, cu: 0.38, mcu: 0.62, ms: 1.05, cowboy: 1.45, ws: 2.6, ews: 8 };

export const diag = (S) => Math.hypot(S.w, S.h);
export const cocLimit = (S) => diag(S) / 1500;
export const effW = (S, squeeze = 1) => S.w * squeeze;
export const fovH = (S, f, squeeze = 1) => 2 * Math.atan(effW(S, squeeze) / (2 * f));
export const fovV = (S, f) => 2 * Math.atan(S.h / (2 * f));
export const hyperfocal = (f, N, c) => (f * f) / (N * c) + f;                 // mm
export function dof(f, N, c, sM) {
  const s = sM * 1000, H = hyperfocal(f, N, c);
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s >= H ? Infinity : (s * (H - f)) / (H - s);
  return { H: H / 1000, near: near / 1000, far: far / 1000, total: far === Infinity ? Infinity : (far - near) / 1000 };
}
export const blurCircle = (f, N, sM, dM) => { const s = sM * 1000, d = dM * 1000; return ((f * f) / N) * Math.abs(d - s) / (d * Math.max(1e-3, s - f)); };
export const shutterTime = (angle, fps) => angle / 360 / fps;
export const ev100 = (N, t, iso) => Math.log2((N * N) / t) - Math.log2(iso / 100);
export const focalForFraming = (S, dM, hM) => (S.h * dM) / hM;
export const frameHeightAt = (S, f, dM) => (dM * S.h) / f;
// Relative exposure against a reference (T2.8, 1/48 s, ISO 800, no ND) in stops.
export const exposureStops = (N, t, iso, nd) => Math.log2(t / (1 / 48)) + Math.log2(iso / 800) + 2 * Math.log2(2.8 / N) - nd;

// Kelvin → linear-ish sRGB (Tanner Helland's fit to blackbody colour).
export function kelvinRGB(K) {
  const t = K / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * (t - 60) ** -0.1332047592; g = 288.1221695283 * (t - 60) ** -0.0755148492; }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (x) => Math.min(255, Math.max(0, x)) / 255;
  return [c(r), c(g), c(b)];
}
export const lux = (candela, dM) => candela / (dM * dM);
export const stopsRatio = (eKey, eFill) => Math.log2((eKey + eFill) / Math.max(1e-6, eFill));
