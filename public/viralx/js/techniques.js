/**
 * ViralX Camera Lab: the technique library, as camera paths with real lens maths.
 *
 * The set is in metres, y up. Actor A stands at x = −0.85 facing +x, actor B at x = +0.85
 * facing −x, so the 180° line runs along the x axis and the camera stays on the z ≥ 0 side
 * unless a technique says it crosses. Eye height 1.60 m; chest height 1.12 m (44").
 *
 * shot(t) for t in [0, 1] returns { pos, look, focal (mm, full-frame), roll (deg) }.
 * fov() turns focal length into the vertical field of view of a 36×24 mm sensor, so the lens
 * view in the lab frames exactly what that lens would.
 *
 * @module viralx/techniques
 */

export const A = [-0.85, 0, 0];
export const B = [0.85, 0, 0];
export const EYE = 1.6;
export const CHEST = 1.12; // 44 inches
const HEAD_A = [A[0], 1.62, 0];
const HEAD_B = [B[0], 1.62, 0];

/** Vertical field of view (degrees) for a focal length on a full-frame (24 mm tall) sensor. */
export const fov = (focal) => (2 * Math.atan(12 / focal) * 180) / Math.PI;

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = (t) => t * t * (3 - 2 * t);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const deg = (d) => (d * Math.PI) / 180;
/** Small deterministic handheld drift, in metres. */
const hand = (t, amp = 0.012) => [amp * Math.sin(t * 23.1) + amp * 0.5 * Math.sin(t * 57.3), amp * Math.sin(t * 31.7 + 1), amp * 0.6 * Math.sin(t * 41.3 + 2)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** OTS position: behind A's shoulder, `offset`° off the 180° line, at chest height, `dist` m from B. */
export function otsPosition(offset = 15, dist = 2.45, height = CHEST) {
  return [B[0] - dist * Math.cos(deg(offset)), height, dist * Math.sin(deg(offset))];
}

export const TECHNIQUES = [
  {
    id: 'invisible-master', n: 'Tip 3', name: 'The Invisible Master', es: 'El Maestro Invisible', feeling: 'Immersion',
    lens: '75mm → 32mm', height: '44" chest', fps: '24 fps', keepLine: true,
    why: ['Stays on one side of the 180° line with a 15° offset, so viewers always know where everyone is.', 'Chest height (44") matches a seated listener\'s eye-line, so the camera feels like it isn\'t there.', '75mm squeezes the space and feels intimate. 32mm shows the room and makes the background drift more.'],
    phone: 'Main lens (≈26mm) for the wide, 3× tele (≈77mm) for the tight. Lock the phone at chest height on a gimbal, 15° off the line, and drift slowly sideways.',
    shot(t) {
      const drift = 0.18 * Math.sin(t * Math.PI * 2);
      const p = otsPosition(15);
      return { pos: [p[0], p[1], p[2] + drift], look: [B[0], 1.5, 0], focal: t < 0.5 ? 75 : 32, roll: 0 };
    },
  },
  {
    id: 'impex', n: 'Tip 2', name: 'The Impex', es: 'El Impex', feeling: 'Wonder',
    lens: '24mm probe → 85mm', height: 'Eye line', fps: '24 → 48 fps', keepLine: false,
    why: ['Opens microscopically close on an eye. It\'s strange and intimate, and people stay to find out where they are.', 'At the swap point the lens changes while the framing stays identical (85/24 × the distance), so nobody sees a cut.', 'Ends on a compressed 85mm chase. The flattened background makes the speed feel huge.'],
    phone: 'Shoot the macro eye on the 0.5× or macro mode, then the chase on 3×. Match the motion direction at the swap and blend 6 frames in the editor.',
    shot(t) {
      const eye = [HEAD_A[0] + 0.09, HEAD_A[1], 0.03];
      const n = Math.hypot(1, 0.02, 0.15), dir = [1 / n, 0.02 / n, 0.15 / n];
      const at = (d) => [eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d];
      if (t < 0.5) return { pos: at(lerp(0.42, 0.085, ease(seg(t, 0, 0.5)))), look: eye, focal: 24, roll: 0 };
      // The swap: 85mm from 85/24 of the distance frames the eye identically, so no cut shows.
      const start = at(0.085 * (85 / 24));
      const end = [B[0] - 6.5 * Math.cos(deg(25)), 1.4, 6.5 * Math.sin(deg(25))];
      const u = ease(seg(t, 0.5, 1));
      const p = lerp3(start, end, u);
      p[1] += 1.2 * Math.sin(u * Math.PI);
      return { pos: p, look: lerp3(eye, HEAD_B, u), focal: 85, roll: 0 };
    },
  },
  {
    id: 'low-angle', name: 'Low Angle', feeling: 'Power', lens: '24mm', height: '0.3 m', fps: '24 fps', keepLine: true,
    why: ['Looking up at someone makes them look dominant. We look up to people who outrank us.', 'A wide lens close to the subject makes them loom and stretches the ceiling lines.'],
    phone: '0.5× lens, phone almost on the floor, tilt up. Walk it in slowly.',
    shot(t) { const u = ease(t); return { pos: [lerp(-0.45, -0.05, u), 0.3, lerp(0.55, 0.4, u)], look: [B[0], 1.7, 0], focal: 24, roll: 0 }; },
  },
  {
    id: 'high-angle', name: 'High Angle', feeling: 'Vulnerability', lens: '35mm', height: '3.4 m', fps: '24 fps', keepLine: true,
    why: ['Looking down shrinks the subject: we see them as watched, small, at risk.', 'Pairs with a low angle on the other character to show the power gap without words.'],
    phone: 'Monopod or selfie stick overhead, main lens, pointed down at 45–70°.',
    shot(t) { const u = ease(t); return { pos: [-0.2, lerp(3.4, 2.9, u), lerp(0.9, 0.7, u)], look: [A[0], 1.2, 0], focal: 35, roll: 0 }; },
  },
  {
    id: 'dutch', name: 'Dutch Angle', feeling: 'Unease', lens: '32mm', height: 'Eye line', fps: '24 fps', keepLine: true,
    why: ['A tilted horizon tells the brain the world is off-balance before anything happens.', 'Use it for one beat only. Overused, it stops meaning anything.'],
    phone: 'Roll the phone 15–25°. Keep the gimbal\'s horizon lock off.',
    shot(t) { return { pos: add([-0.6, EYE, 1.6], hand(t)), look: [B[0], 1.55, 0], focal: 32, roll: lerp(14, 22, Math.sin(t * Math.PI)) }; },
  },
  {
    id: 'dolly-zoom', name: 'Dolly Zoom', feeling: 'Realisation', lens: '24 → 75mm', height: 'Eye line', fps: '24 fps', keepLine: true,
    why: ['The camera pulls back while the lens zooms in, so the subject keeps the same size and the world stretches behind them.', 'It reads as the moment something sinks in, without any dialogue.'],
    phone: 'Walk backwards while pinching to zoom so the face stays the same size. Some apps can do this automatically.',
    shot(t) {
      const u = ease(t);
      const d = lerp(1.6, 5.0, u);
      return { pos: [B[0] - d * Math.cos(deg(20)), EYE, d * Math.sin(deg(20))], look: [B[0], 1.6, 0], focal: (24 * d) / 1.6, roll: 0 };
    },
  },
  {
    id: 'push-in', name: 'Slow Push-In', feeling: 'Intimacy', lens: '50mm', height: 'Eye line', fps: '24 fps', keepLine: true,
    why: ['Moving slowly closer tells the viewer that this moment matters, so lean in.', 'Time it to start on the line that changes everything.'],
    phone: 'Gimbal, walk in 1 m over 6 s. Hold the speed even.',
    shot(t) { const u = ease(t); const d = lerp(4, 1.5, u); return { pos: [B[0] - d * Math.cos(deg(25)), EYE, d * Math.sin(deg(25))], look: [B[0], 1.6, 0], focal: 50, roll: 0 }; },
  },
  {
    id: 'pull-out', name: 'Slow Pull-Out', feeling: 'Loneliness', lens: '35mm', height: 'Rising', fps: '24 fps', keepLine: true,
    why: ['Leaving the subject behind while the space grows around them makes them look alone.', 'It works as an ending: it closes the scene by revealing it.'],
    phone: 'Drone or a long walk backwards on the 0.5× lens, rising if you can.',
    shot(t) { const u = ease(t); const d = lerp(1.2, 9, u); return { pos: [B[0] - d * Math.cos(deg(35)), lerp(1.6, 3.6, u), d * Math.sin(deg(35))], look: [B[0], 1.3, 0], focal: 35, roll: 0 }; },
  },
  {
    id: 'ecu', name: 'Extreme Close-Up', feeling: 'Intensity', lens: '100mm', height: 'Eye line', fps: '48 fps', keepLine: true,
    why: ['Only the eyes. Every micro-expression becomes the whole story.', 'A long lens from further back avoids distorting the face and keeps the camera out of the actor\'s space.'],
    phone: '3×–5× tele from 1 m away. Tap-lock focus on the eyes, and use slow motion for half-speed blinks.',
    shot(t) { return { pos: add([B[0] - 1.3, 1.63, 0.35], hand(t, 0.004)), look: [B[0] - 0.1, 1.64, 0], focal: 100, roll: 0 }; },
  },
  {
    id: 'orbit', name: 'Hero Orbit', feeling: 'Triumph', lens: '35mm', height: 'Chest', fps: '24 fps', keepLine: false,
    why: ['Circling a subject makes them the centre of the world.', 'It crosses the line on purpose: the orbit shows the whole space, so nobody gets lost.'],
    phone: 'Gimbal in follow mode, walk a steady circle around the subject at about 2 m.',
    shot(t) { const a = deg(100) + t * Math.PI * 2; return { pos: [B[0] + 2.2 * Math.cos(a), 1.3, 2.2 * Math.sin(a)], look: [B[0], 1.45, 0], focal: 35, roll: 0 }; },
  },
  {
    id: 'crane', name: 'Crane Reveal', feeling: 'Scale', lens: '24mm', height: '0.4 → 4.5 m', fps: '24 fps', keepLine: true,
    why: ['Rising up and away turns a private moment into part of a bigger world.', 'It also works as an opener: start on a detail, end on the whole place.'],
    phone: 'Selfie stick raised slowly overhead, or a drone backing up and climbing.',
    shot(t) { const u = ease(t); return { pos: [0, lerp(0.4, 4.5, u), lerp(1.4, 5.2, u)], look: [0, lerp(1.2, 0.6, u), 0], focal: 24, roll: 0 }; },
  },
  {
    id: 'whip', name: 'Whip Pan', feeling: 'Energy', lens: '35mm', height: 'Eye line', fps: '24 fps', keepLine: true,
    why: ['A fast swing hides a cut and jumps attention from one face to the other.', 'It resets attention mid-clip, which is why short-form editors use it constantly.'],
    phone: 'Snap the wrist from subject to subject in about 0.2 s. Do it on both clips you join, in the same direction.',
    shot(t) { const u = ease(seg(t, 0.45, 0.55)); const yaw = lerp(-1, 1, u); return { pos: [0, EYE, 2.3], look: [0.85 * yaw * 1.4, 1.6, 0], focal: 35, roll: 0 }; },
  },
  {
    id: 'pov', name: 'POV', feeling: 'Presence', lens: '28mm', height: 'Eye line', fps: '24 fps', keepLine: false,
    why: ['The viewer becomes the character. B looks right at the lens, so right at them.', 'POV and "you" hooks share the same psychology. It\'s the native format of short-form.'],
    phone: 'Hold the phone at your own eye level, main lens, a little natural handheld.',
    shot(t) { return { pos: add([A[0] + 0.12, 1.62, 0], hand(t, 0.01)), look: [B[0], 1.6, 0], focal: 28, roll: 2 * Math.sin(t * 9) }; },
  },
  {
    id: 'symmetry', name: 'Symmetry Two-Shot', feeling: 'Order', lens: '24mm', height: 'Chest', fps: '24 fps', keepLine: true,
    why: ['A centred frame with matched sides feels deliberate, controlled, even unsettling.', 'Strong lines meeting in the middle pull the eye straight to the centre.'],
    phone: 'Turn on the grid, centre the vanishing point, 0.5× lens, push in slowly.',
    shot(t) { const u = ease(t); return { pos: [0, 1.3, lerp(4.2, 3.0, u)], look: [0, 1.25, -2], focal: 24, roll: 0 }; },
  },
  {
    id: 'parallax', name: 'Parallax Drift', feeling: 'Depth', lens: '32mm vs 75mm', height: 'Chest', fps: '24 fps', keepLine: true,
    why: ['Moving sideways makes near things slide past far things, and that slide is how the eye reads depth.', 'At 32mm the background shifts a lot (real, alive). At 75mm subject and background move together (calm, stable).'],
    phone: 'Slide the phone sideways on a gimbal. Compare the main lens with 3× from further back.',
    shot(t) {
      const wide = t < 0.5;
      const u = Math.sin(seg(t % 0.5, 0, 0.5) * Math.PI * 2);
      const d = wide ? 3.2 : 3.2 * (75 / 32);
      const x = 1.0 * u;
      return { pos: [x, CHEST, d], look: [x, 1.2, 0], focal: wide ? 32 : 75, roll: 0 };
    },
  },
];

/** The technique to suggest from a clip's shot DNA. */
export function recommend(shots = [], dutchCount = 0) {
  const codes = shots.map((s) => s.code);
  const share = (c) => (codes.length ? codes.filter((x) => x === c).length / codes.length : 0);
  const out = [];
  if (share('ECU') + share('CU') < 0.15) out.push({ id: 'ecu', why: 'Almost no close-ups. Cut to the eyes on your key line.' });
  if (share('WS') > 0.6) out.push({ id: 'push-in', why: 'Mostly wide. A slow push-in tells people what matters.' });
  if (new Set(codes).size <= 1) out.push({ id: 'invisible-master', why: 'One shot size throughout. Alternate a 75mm OTS and a 32mm wide.' });
  if (!dutchCount) out.push({ id: 'dutch', why: 'For the tense beat, a 15–20° dutch for a second or two.' });
  out.push({ id: 'whip', why: 'A whip pan at a dip in attention resets the viewer.' });
  return out.slice(0, 3);
}
