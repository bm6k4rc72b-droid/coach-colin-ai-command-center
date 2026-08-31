/**
 * Sanity checks for the geometry and model code.
 *
 * These run the pure modules through node (no DOM, no camera) so a bad sign or
 * a transposed matrix shows up here rather than as quietly wrong yardage on a
 * practice field.
 */
import { join } from 'node:path';
import { compile } from './compile.mjs';

const out = compile(['src/vision/homography.ts', 'src/metrics/models.ts']);

const { computeHomography, applyHomography, distance, referenceRectangle } =
  await import(join(out, 'vision/homography.js'));
const { LogisticModel, expectedFirstDown, SEEDED_COMPLETION_COEFFICIENTS } =
  await import(join(out, 'metrics/models.js'));

let failures = 0;
const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!condition) failures++;
};

// --- Homography: a synthetic perspective view of a 10 x 15 yard box ---
const corners = [
  { x: 420, y: 700 }, { x: 980, y: 700 },   // near edge, wide apart
  { x: 830, y: 430 }, { x: 560, y: 430 },   // far edge, foreshortened
];
const H = computeHomography(corners, referenceRectangle(10, 15));
check('homography solves', H !== null);

// The calibration corners must map back onto the reference rectangle exactly.
const expected = referenceRectangle(10, 15);
let maxCornerError = 0;
corners.forEach((c, i) => {
  const mapped = applyHomography(H, c);
  maxCornerError = Math.max(maxCornerError, distance(mapped, expected[i]));
});
check('corners map to reference box', maxCornerError < 1e-6,
  `max error ${maxCornerError.toExponential(2)} yd`);

// A point at the pixel centre of the near edge should land at mid-width, y=0.
const nearMid = applyHomography(H, { x: 700, y: 700 });
check('near-edge midpoint is 5 yards across', Math.abs(nearMid.x - 5) < 1e-6, `x=${nearMid.x.toFixed(4)}`);
check('near-edge midpoint is on the goal-side line', Math.abs(nearMid.y) < 1e-6, `y=${nearMid.y.toFixed(4)}`);

// Perspective check: equal pixel steps far from the camera must cover MORE
// yards than the same step near the camera. This is the whole reason a flat
// pixels-per-yard scale is wrong, so it is worth asserting.
const nearStep = distance(applyHomography(H, { x: 700, y: 700 }), applyHomography(H, { x: 700, y: 680 }));
const farStep = distance(applyHomography(H, { x: 700, y: 450 }), applyHomography(H, { x: 700, y: 430 }));
check('perspective foreshortening is modelled', farStep > nearStep * 1.5,
  `near ${nearStep.toFixed(3)} yd vs far ${farStep.toFixed(3)} yd per 20px`);

// Degenerate input (three collinear points) must be rejected, not fudged.
const degenerate = computeHomography(
  [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }],
  referenceRectangle(10, 15));
check('collinear calibration rejected', degenerate === null);

// --- Model: directional sanity of the seeded priors ---
const model = new LogisticModel();
const clean = { throwDistance: 8, timeToThrow: 2.2, separationAtRelease: 9, pressured: 0 };
const pressured = { ...clean, pressured: 1 };
const deep = { ...clean, throwDistance: 40 };

check('pressure lowers completion', model.predict(pressured) < model.predict(clean),
  `${model.predict(pressured).toFixed(3)} < ${model.predict(clean).toFixed(3)}`);
check('depth lowers completion', model.predict(deep) < model.predict(clean),
  `${model.predict(deep).toFixed(3)} < ${model.predict(clean).toFixed(3)}`);
check('probabilities stay in range',
  [clean, pressured, deep].every((f) => { const p = model.predict(f); return p > 0 && p < 1; }));

// A short checkdown on 3rd-and-long converts far less often than it is caught.
const shortP = model.predict(clean);
check('first down gated by the sticks', expectedFirstDown(shortP, 8, 15) < shortP * 0.5,
  `xComp ${shortP.toFixed(3)} -> xFD ${expectedFirstDown(shortP, 8, 15).toFixed(3)}`);
check('throw past the sticks converts at the catch rate',
  Math.abs(expectedFirstDown(shortP, 18, 10) - shortP) < 1e-9);

// --- Refitting: the model must actually learn from labelled reps ---
// Synthetic data where pressure is far more punishing than the prior assumes.
const samples = [];
for (let i = 0; i < 400; i++) {
  const features = {
    throwDistance: 5 + (i % 35),
    timeToThrow: 1.5 + (i % 20) / 10,
    separationAtRelease: 1 + (i % 12),
    pressured: i % 2,
  };
  const trueP = 1 / (1 + Math.exp(-(3.0 - 0.06 * features.throwDistance - 2.6 * features.pressured)));
  samples.push({ features, completed: ((i * 2654435761) % 1000) / 1000 < trueP });
}
const fitted = new LogisticModel();
const before = fitted.predict(pressured);
fitted.fit(samples, { iterations: 1500 });
const after = fitted.predict(pressured);
check('fit moves the pressure coefficient toward the data',
  fitted.params.pressured < SEEDED_COMPLETION_COEFFICIENTS.pressured,
  `${SEEDED_COMPLETION_COEFFICIENTS.pressured.toFixed(2)} -> ${fitted.params.pressured.toFixed(2)}`);
check('fitted predictions stay valid', after > 0 && after < 1,
  `pressured xComp ${before.toFixed(3)} -> ${after.toFixed(3)}`);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
