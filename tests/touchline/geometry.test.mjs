/**
 * The geometry everything else stands on.
 *
 * If the homography is wrong, every number in the app is wrong in a way that
 * looks entirely plausible — a winger who accelerates whenever they run away
 * from the camera, a pass that measures thirty metres at one end of the pitch
 * and twenty at the other. So these tests check the mapping itself against a
 * camera whose matrix is known exactly, rather than checking that the app is
 * self-consistent.
 *
 * @module tests/touchline/geometry
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_PITCH,
  apply,
  distanceToLines,
  expectedPixelHeight,
  fitHomography,
  frameShift,
  invert3,
  jacobiEigen,
  landmarks,
  normalisePoints,
  onPitch,
  pitchLines,
  scaleAt,
  shiftHomography,
} from '../../public/touchline/js/pitch.js';
import { renderScene } from '../../public/touchline/js/demo.js';
import { DIMENSIONS, jitterMarks, marksFor, project, rig } from './synthetic.mjs';

test('a symmetric matrix is diagonalised by its own eigenvectors', () => {
  const m = [
    [4, 1, 0],
    [1, 3, 1],
    [0, 1, 2],
  ];
  const { values, vectors } = jacobiEigen(m);
  for (let k = 0; k < 3; k += 1) {
    for (let row = 0; row < 3; row += 1) {
      let got = 0;
      for (let col = 0; col < 3; col += 1) got += m[row][col] * vectors[col][k];
      assert.ok(
        Math.abs(got - values[k] * vectors[row][k]) < 1e-9,
        `eigenvector ${k} row ${row} did not satisfy Av = λv`,
      );
    }
  }
});

test('normalisation centres a cloud and scales it to a mean radius of √2', () => {
  const points = [
    { x: 100, y: 200 },
    { x: 140, y: 260 },
    { x: 90, y: 300 },
    { x: 220, y: 180 },
  ];
  const { points: moved } = normalisePoints(points);
  const mean = moved.reduce((sum, p) => sum + Math.hypot(p.x, p.y), 0) / moved.length;
  const cx = moved.reduce((sum, p) => sum + p.x, 0) / moved.length;
  assert.ok(Math.abs(cx) < 1e-9, 'cloud was not centred');
  assert.ok(Math.abs(mean - Math.SQRT2) < 1e-9, `mean radius was ${mean}`);
});

test('inverting a 3x3 twice returns the original', () => {
  const m = [0.9, 0.35, 40, -0.02, 0.18, 120, 0.0002, 0.004, 1];
  const back = invert3(invert3(m));
  for (let i = 0; i < 9; i += 1) assert.ok(Math.abs(back[i] / back[8] - m[i] / m[8]) < 1e-9);
});

test('a singular matrix has no inverse rather than a wrong one', () => {
  assert.equal(invert3([1, 2, 3, 2, 4, 6, 1, 1, 1]), null);
});

test('four exact landmarks recover the camera to floating-point precision', () => {
  const { pitchToImage } = rig();
  const fit = fitHomography(marksFor(pitchToImage).slice(0, 4));
  assert.ok(fit.residualM < 1e-9, `residual was ${fit.residualM} m`);

  // Points the fit never saw must land in the right place too, which is what
  // separates a fitted plane from four coincidences.
  for (const [x, y] of [
    [52.5, 34],
    [11, 34],
    [0, 0],
    [30, 60],
  ]) {
    const at = project(pitchToImage, x, y);
    const back = apply(fit.imageToPitch, { x: at.x, y: at.y });
    assert.ok(
      Math.hypot(back.x - x, back.y - y) < 1e-6,
      `(${x}, ${y}) came back as (${back.x}, ${back.y})`,
    );
  }
});

test('a fifth mark does not degrade the fit', () => {
  const { pitchToImage } = rig();
  const four = fitHomography(marksFor(pitchToImage).slice(0, 4));
  const five = fitHomography(marksFor(pitchToImage));
  assert.ok(five.residualM < 1e-6);
  assert.ok(Math.abs(five.worstM - four.worstM) < 1e-6);
});

test('a thumb-width of error on each mark costs less than a metre on the pitch', () => {
  const { pitchToImage } = rig();
  const fit = fitHomography(jitterMarks(marksFor(pitchToImage), 1.5));
  assert.ok(fit, 'the jittered marks did not fit at all');

  // The residual is what the app puts on screen, so it has to be honest about
  // this: a fit from sloppy marks must report a cost, not hide one.
  assert.ok(fit.residualM > 0, 'a jittered fit claimed to be exact');
  let worst = 0;
  for (const [x, y] of [
    [11, 34],
    [16.5, 34],
    [5.5, 24],
    [0, 34],
  ]) {
    const at = project(pitchToImage, x, y);
    const back = apply(fit.imageToPitch, { x: at.x, y: at.y });
    worst = Math.max(worst, Math.hypot(back.x - x, back.y - y));
  }
  assert.ok(worst < 1, `a point inside the marked area moved ${worst.toFixed(2)} m`);
});

test('three collinear marks are refused rather than fitted', () => {
  const { pitchToImage } = rig();
  const collinear = marksFor(pitchToImage, [
    [0, 34],
    [10, 34],
    [20, 34],
    [30, 34],
  ]);
  const fit = fitHomography(collinear);
  // Either the solve fails outright or it produces a mapping that cannot invert
  // — what must not happen is a confident, silently wrong plane.
  const usable =
    fit &&
    Number.isFinite(fit.residualM) &&
    fit.residualM < 0.5 &&
    Number.isFinite(apply(fit.imageToPitch, { x: 300, y: 100 }).x);
  assert.ok(!usable, 'a degenerate set of marks produced a usable pitch model');
});

test('fewer than four marks is not a fit', () => {
  const { pitchToImage } = rig();
  assert.equal(fitHomography(marksFor(pitchToImage).slice(0, 3)), null);
  assert.equal(fitHomography([]), null);
});

test('the lateral scale is what a player is tall in, not the averaged one', () => {
  const { basis, pitchToImage } = rig();
  const fit = fitHomography(marksFor(pitchToImage));
  for (const [x, y] of [
    [11, 20],
    [20, 40],
    [30, 55],
  ]) {
    const foot = project(pitchToImage, x, y);
    const expected = expectedPixelHeight(fit.imageToPitch, foot.x, foot.y);
    // The true pixel height of a 1.8 m post at that spot, from the camera the
    // fixture actually filmed through.
    const head = {
      x: basis.width / 2,
      y: basis.height / 2,
    };
    const rel = [x - basis.position[0], y - basis.position[1], 1.8 - basis.position[2]];
    const cameraZ =
      basis.forward[0] * rel[0] + basis.forward[1] * rel[1] + basis.forward[2] * rel[2];
    const cameraY = basis.down[0] * rel[0] + basis.down[1] * rel[1] + basis.down[2] * rel[2];
    head.y = basis.height / 2 + (basis.f * cameraY) / cameraZ;
    const truth = Math.abs(foot.y - head.y);
    assert.ok(
      Math.abs(expected - truth) / truth < 0.12,
      `at (${x}, ${y}) expected ${expected.toFixed(1)} px, truth ${truth.toFixed(1)} px`,
    );
  }
});

test('one pixel is worth far more ground at the far touchline than the near one', () => {
  const { pitchToImage } = rig();
  const fit = fitHomography(marksFor(pitchToImage));
  const near = project(pitchToImage, 20, 16);
  const far = project(pitchToImage, 20, 60);
  const nearScale = scaleAt(fit.imageToPitch, near.x, near.y);
  const farScale = scaleAt(fit.imageToPitch, far.x, far.y);
  assert.ok(
    farScale.maxM > nearScale.maxM * 1.5,
    `far ${farScale.maxM.toFixed(3)} m/px was not clearly worse than near ${nearScale.maxM.toFixed(3)}`,
  );
  assert.ok(nearScale.maxM > nearScale.minM, 'depth and lateral scales were identical');
});

test('a point above the horizon is off the pitch, not on the far side of it', () => {
  const { pitchToImage } = rig();
  const fit = fitHomography(marksFor(pitchToImage));
  // Row 0 of this camera is sky. Without the sign convention it maps to a
  // plausible-looking pitch coordinate.
  const sky = apply(fit.imageToPitch, { x: 320, y: 0 });
  assert.ok(!onPitch(sky, DIMENSIONS, 2), 'a pixel of sky was reported as being on the pitch');
  const grass = apply(fit.imageToPitch, { x: 320, y: 300 });
  assert.ok(onPitch(grass, DIMENSIONS, 4), 'a pixel of grass was reported as off the pitch');
});

test('the pitch model knows where its own paint is', () => {
  // The centre spot itself sits on the halfway line, so open space is measured
  // somewhere that genuinely is open.
  assert.ok(distanceToLines({ x: 35, y: 20 }) > 8, 'open midfield is not near a line');
  assert.ok(distanceToLines({ x: 52.5, y: 0 }) < 0.01, 'the touchline is a line');
  assert.ok(distanceToLines({ x: 16.5, y: 34 }) < 0.01, 'the D is on the box line');
  assert.ok(distanceToLines({ x: 30, y: 34 }) > 5, 'open space is not near a line');
});

test('every landmark the app asks for is a point on the pitch', () => {
  for (const mark of landmarks()) {
    assert.ok(mark.x >= 0 && mark.x <= FULL_PITCH.lengthM, `${mark.id} is off the length`);
    assert.ok(mark.y >= 0 && mark.y <= FULL_PITCH.widthM, `${mark.id} is off the width`);
    assert.ok(mark.label.length > 3, `${mark.id} has no usable label`);
  }
  const ids = new Set(landmarks().map((mark) => mark.id));
  assert.equal(ids.size, landmarks().length, 'two landmarks share an id');
});

test('the drawn pitch is the pitch that was asked for', () => {
  const lines = pitchLines({ lengthM: 100, widthM: 64 });
  let maxX = 0;
  let maxY = 0;
  for (const { a, b } of lines) {
    maxX = Math.max(maxX, a.x, b.x);
    maxY = Math.max(maxY, a.y, b.y);
  }
  assert.equal(Math.round(maxX), 100);
  assert.equal(Math.round(maxY), 64);
});

test('a still camera reports no movement, and a nudged one reports the nudge', () => {
  const cameraRig = rig();
  const scene = {
    basis: cameraRig.basis,
    pitchToImage: cameraRig.pitchToImage,
    players: [
      { x: 20, y: 30, kit: [30, 92, 200] },
      { x: 28, y: 44, kit: [206, 42, 48] },
    ],
  };
  const first = renderScene({ ...scene, seed: 5 });
  const same = renderScene({ ...scene, seed: 6 });
  const still = frameShift(first, same);
  assert.equal(still.dx, 0, `a still camera drifted ${still.dx} px across`);
  assert.equal(still.dy, 0, `a still camera drifted ${still.dy} px down`);

  // Shift the picture by hand and check it is measured back.
  const shifted = { data: new Uint8ClampedArray(first.data.length), width: first.width, height: first.height };
  const dx = 3;
  const dy = -2;
  for (let y = 0; y < first.height; y += 1) {
    for (let x = 0; x < first.width; x += 1) {
      const sx = Math.min(first.width - 1, Math.max(0, x - dx));
      const sy = Math.min(first.height - 1, Math.max(0, y - dy));
      const to = (y * first.width + x) * 4;
      const from = (sy * first.width + sx) * 4;
      for (let c = 0; c < 4; c += 1) shifted.data[to + c] = first.data[from + c];
    }
  }
  const measured = frameShift(first, shifted);
  assert.equal(measured.dx, dx);
  assert.equal(measured.dy, dy);
  assert.ok(measured.confidence > 0.3, `confidence was only ${measured.confidence.toFixed(2)}`);
});

test('sliding a homography by a nudge keeps positions where they were', () => {
  const { pitchToImage } = rig();
  const fit = fitHomography(marksFor(pitchToImage));
  const before = apply(fit.imageToPitch, { x: 300, y: 200 });
  const slid = shiftHomography(fit.imageToPitch, 4, -3);
  const after = apply(slid, { x: 304, y: 197 });
  assert.ok(
    Math.hypot(after.x - before.x, after.y - before.y) < 1e-6,
    'a compensated nudge moved the world',
  );
});
