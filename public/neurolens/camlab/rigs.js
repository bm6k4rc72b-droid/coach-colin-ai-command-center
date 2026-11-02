// NEUROLENS · Camera lab — the camera bodies and lenses. by Coach Colin
//
// Original rigs built from real sensor formats (sizes are the published active
// areas for each format in a 16:9 or native mode), so the field of view, depth
// of field and crop on screen are the ones those formats really give.

export const BODIES = [
  { id: 'lf', name: 'Atelier LF', format: 'Large format 65', sensor: { w: 54.1, h: 25.6 }, iso: [800, 3200], fps: [24, 25, 30, 48, 60], note: 'The biggest sensor: shallowest depth of field and the widest look for a given framing. Epic landscapes and intimate portraits.' },
  { id: 'ff', name: 'Studio FF', format: 'Full frame', sensor: { w: 36, h: 24 }, iso: [100, 800, 3200], fps: [24, 25, 30, 60, 120], note: 'The reference format that every "35 mm equivalent" focal length is measured against.' },
  { id: 's35', name: 'Studio S35', format: 'Super 35 (3-perf)', sensor: { w: 24.9, h: 14.0 }, iso: [800, 3200], fps: [24, 25, 30, 48, 60, 120], note: 'The classic cinema format: most feature films were shot on this size of frame.' },
  { id: 'mft', name: 'Run-and-gun MFT', format: 'Micro Four Thirds (16:9)', sensor: { w: 17.3, h: 9.7 }, iso: [200, 800, 3200], fps: [24, 30, 60, 120], note: 'Small, light and deep-focus friendly: more of the scene stays sharp at the same f-stop.' },
  { id: 'one', name: 'Gimbal 1-inch', format: '1-inch (16:9)', sensor: { w: 13.2, h: 7.4 }, iso: [100, 400, 1600], fps: [24, 30, 60, 120], note: 'The pocket gimbal and drone class: easy focus, hard to get a blurred background.' },
  { id: 'phone', name: 'Phone main camera', format: '1/1.3-inch (16:9)', sensor: { w: 9.8, h: 5.5 }, iso: [50, 400, 1600], fps: [24, 30, 60, 120, 240], note: 'A fixed aperture and a tiny sensor: background blur on a phone is computed, not optical. Here you see the optical truth.' },
];

/** Lenses. squeeze > 1 is anamorphic; transmission sets the T-stop. fixedN pins the aperture (phones). */
export const LENSES = [
  { id: 'p14', name: '14 mm prime', kind: 'Spherical prime', focals: [14], N: [2.8, 22], transmission: 0.82, squeeze: 1, minFocusM: 0.2 },
  { id: 'p24', name: '24 mm prime', kind: 'Spherical prime', focals: [24], N: [1.4, 22], transmission: 0.82, squeeze: 1, minFocusM: 0.25 },
  { id: 'p35', name: '35 mm prime', kind: 'Spherical prime', focals: [35], N: [1.4, 22], transmission: 0.82, squeeze: 1, minFocusM: 0.3 },
  { id: 'p50', name: '50 mm prime', kind: 'Spherical prime', focals: [50], N: [1.2, 22], transmission: 0.82, squeeze: 1, minFocusM: 0.45 },
  { id: 'p85', name: '85 mm prime', kind: 'Spherical prime', focals: [85], N: [1.4, 22], transmission: 0.82, squeeze: 1, minFocusM: 0.8 },
  { id: 'p135', name: '135 mm prime', kind: 'Spherical prime', focals: [135], N: [2, 22], transmission: 0.82, squeeze: 1, minFocusM: 1.0 },
  { id: 'z2470', name: '24–70 mm zoom', kind: 'Zoom', focals: [24, 70], N: [2.8, 22], transmission: 0.78, squeeze: 1, minFocusM: 0.38 },
  { id: 'z70200', name: '70–200 mm zoom', kind: 'Zoom', focals: [70, 200], N: [2.8, 22], transmission: 0.76, squeeze: 1, minFocusM: 1.0 },
  { id: 'a40', name: '40 mm 2× anamorphic', kind: 'Anamorphic', focals: [40], N: [2, 16], transmission: 0.72, squeeze: 2, minFocusM: 0.7 },
  { id: 'a75', name: '75 mm 2× anamorphic', kind: 'Anamorphic', focals: [75], N: [2, 16], transmission: 0.72, squeeze: 2, minFocusM: 0.9 },
  { id: 'a50', name: '50 mm 1.33× anamorphic', kind: 'Anamorphic', focals: [50], N: [2, 16], transmission: 0.74, squeeze: 1.33, minFocusM: 0.6 },
  { id: 'phone', name: 'Phone lens 6.9 mm', kind: 'Fixed', focals: [6.9], N: [1.8, 1.8], transmission: 0.9, squeeze: 1, minFocusM: 0.1, fixedN: 1.8 },
];

/** Standard full stops, for the aperture ring. */
export const STOPS = [1.2, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

/** Delivery aspect ratios for the frame guides. */
export const ASPECTS = [
  { id: 'native', label: 'Sensor' }, { id: '2.39', label: '2.39:1 scope', r: 2.39 }, { id: '1.85', label: '1.85:1 flat', r: 1.85 },
  { id: '16:9', label: '16:9', r: 16 / 9 }, { id: '4:5', label: '4:5 feed', r: 4 / 5 }, { id: '9:16', label: '9:16 reels', r: 9 / 16 },
];

/** Light sources on the set: colour temperature and the EV₁₀₀ that exposes them correctly. */
export const LIGHTS = [
  { id: 'tungsten', label: 'Tungsten practicals', K: 3200, ev: 7 },
  { id: 'golden', label: 'Golden hour', K: 3800, ev: 11 },
  { id: 'daylight', label: 'Overcast daylight', K: 6500, ev: 13 },
  { id: 'sun', label: 'Full sun', K: 5600, ev: 15 },
  { id: 'neon', label: 'Neon night', K: 4300, ev: 5 },
];

/** Built-in camera moves for a take. */
export const MOVES = [
  { id: 'static', label: 'Locked off' },
  { id: 'dolly', label: 'Dolly in' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'crane', label: 'Crane up' },
  { id: 'vertigo', label: 'Dolly zoom' },
  { id: 'rack', label: 'Rack focus' },
];

export const lensById = (id) => LENSES.find((l) => l.id === id) ?? LENSES[3];
export const bodyById = (id) => BODIES.find((b) => b.id === id) ?? BODIES[1];
