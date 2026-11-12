/**
 * The camera maths behind the Colin Cook reveal, kept pure so it is tested without a GPU.
 *
 * The look emulates large-format 65 mm (IMAX 15/70) photography: a 70.41 x 52.63 mm gate, a
 * 50 mm lens for the wides and an 80 mm for the portraits, shot at 24 fps with a 180° shutter.
 *
 * @module colin-cook/film
 */

/** IMAX 15-perf 70 mm camera aperture, in millimetres. */
export const GATE = { width: 70.41, height: 52.63 };

/**
 * Vertical field of view (degrees) of a lens on the 15/70 gate, fitted to the screen.
 * Wide screens are fitted by gate width, tall (phone) screens by gate height, so the subject
 * stays framed either way.
 * @param {number} focal lens focal length in mm
 * @param {number} aspect viewport width / height
 */
export function verticalFov(focal, aspect) {
  const gateAspect = GATE.width / GATE.height;
  const filmHeight = aspect >= gateAspect ? GATE.width / aspect : GATE.height;
  return (2 * Math.atan(filmHeight / 2 / focal) * 180) / Math.PI;
}

export const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (x * 6 - 15) + 10); };
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Camera keyframes, one per page section: position, look-at target and lens.
 * `wide` is the x offset used on landscape screens so the subject sits beside the text;
 * on phones the subject is centred and the text sits below it.
 */
export const KEYS = [
  { pos: [0, 0.2, 11], look: [0, 0, 0], focal: 50 },            // 0 title: the rings
  { pos: [-1.2, 0.4, -9], look: [0, 0.3, -20], focal: 80, wide: 2.6 },   // 1 rooftop portrait, slow arc
  { pos: [-7, 0.6, -36], look: [-3.5, 0.2, -47], focal: 50 },   // 2 credential wall, truck left to right…
  { pos: [6, 0.2, -52], look: [0, 0, -68], focal: 80, wide: -2.8 },      // 3 …into the profile close-up
  { pos: [0, 2.6, -84], look: [0, -0.6, -96], focal: 50 },      // 4 beauty: crane down over the second rig
  { pos: [-2.5, 0.8, -104], look: [1, 0, -116], focal: 50 },    // 5 clinics
  { pos: [0, 3.2, -118], look: [0, 1.2, -150], focal: 50 },     // 6 apply: push toward the sunrise
  { pos: [0, 4.2, -124], look: [0, 1.6, -150], focal: 50 },     // (end)
];

/**
 * Camera state at fractional scene index `f` (0 = first section, 1.5 = halfway between the 2nd and 3rd).
 * @param {number} f
 * @param {boolean} landscape
 */
export function cameraAt(f, landscape = true) {
  const i = Math.min(KEYS.length - 2, Math.max(0, Math.floor(f)));
  const t = smooth(f - i);
  const a = KEYS[i]; const b = KEYS[i + 1];
  const ax = landscape ? a.wide || 0 : 0; const bx = landscape ? b.wide || 0 : 0;
  const off = lerp(ax, bx, t);
  return {
    pos: a.pos.map((v, k) => lerp(v, b.pos[k], t) - (k === 0 ? off * 0.35 : 0)),
    look: a.look.map((v, k) => lerp(v, b.look[k], t) - (k === 0 ? off : 0)),
    focal: lerp(a.focal, b.focal, t),
  };
}

/**
 * Fractional scene index from the scroll position.
 * @param {{ top: number, height: number }[]} sections document offsets
 * @param {number} y scroll offset of the viewport centre
 */
export function sceneIndex(sections, y) {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (y >= sections[i].top) return i + Math.min(1, (y - sections[i].top) / sections[i].height);
  }
  return 0;
}

/** SMPTE-style timecode at 24 fps. */
export function timecode(seconds) {
  const f = Math.floor(seconds * 24);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(f / 86400))}:${p(Math.floor(f / 1440) % 60)}:${p(Math.floor(f / 24) % 60)}:${p(f % 24)}`;
}

/** Colin's credentials, as shown on the wall. */
export const CREDENTIALS = [
  ['ISSA', 'Certified Personal Trainer'], ['ISSA', 'Elite Trainer'], ['ISSA', 'Master Trainer'], ['ISSA', 'GLP-1 Weight Loss Specialist'],
  ['ISSA', 'Strength & Conditioning Specialist'], ['ISSA', 'Corrective Exercise Specialist'], ['ISSA', 'Exercise Therapist'],
  ['ISSA', 'Tactical Conditioning Specialist'], ['ISSA', 'Bodybuilding Specialist'], ['ISSA', 'Glutes Training Specialist'],
  ['ISSA', 'Nutritionist'], ['ISSA', 'Transformation Specialist'], ['ISSA', 'Brain Fitness Coach'], ['ISSA', 'DNA Specialist'],
  ['NASM', 'Performance Enhancement Specialist'], ['NASM', 'Behavior Change Specialist'], ['NASM', 'Nutritionist'],
  ['NASM', 'Sports Nutritionist'], ['NASM', 'Wellness Coach'], ['', 'Neuro-type Individualized Nutrition Specialist'],
];
