/**
 * Segmentation: what the background model believes, and what it refuses.
 *
 * @module tests/sentry/scene
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { backdrop, idle, paintSubject, random } from './synthetic.mjs';
import {
  blobs,
  clean,
  createBackground,
  dilate,
  erode,
  isShadow,
  luminance,
  segment,
  updateBackground,
} from '../../public/sentry/js/scene.js';

/**
 * Settle a background model on an empty scene.
 *
 * @param {number} [frames=40] How many frames to absorb.
 * @returns {object} A warmed model.
 */
function warmed(frames = 40) {
  const background = createBackground(192, 144);
  for (const { frame } of idle(frames)) {
    updateBackground(background, frame, { rate: background.frames < 12 ? 6 : 1 });
  }
  return background;
}

test('an unchanged scene produces almost no foreground', () => {
  const background = warmed();
  const frame = backdrop({ rng: random(555) });
  const { changed } = segment(background, frame, {});
  const fraction = changed / (frame.width * frame.height);
  assert.ok(fraction < 0.01, `${(fraction * 100).toFixed(2)}% of an unchanged frame was called foreground`);
});

test('a subject standing in the scene is found', () => {
  const background = warmed();
  const frame = backdrop({ rng: random(556) });
  const box = paintSubject(frame, { x: 0, y: 6, heightM: 1.8 });
  const detection = segment(background, frame, {});
  const mask = clean(detection.mask, frame.width, frame.height);
  const regions = blobs(mask, frame.width, frame.height, { minArea: 12, energy: detection.energy });
  assert.equal(regions.length, 1, `expected one region, got ${regions.length}`);
  const found = regions[0];
  assert.ok(Math.abs(found.minY - box.minY) < 6, 'the top of the subject should be about right');
  assert.ok(Math.abs(found.maxY - box.maxY) < 4, 'the ground contact should be about right');
});

test('two separated subjects are two regions', () => {
  const background = warmed();
  const frame = backdrop({ rng: random(557) });
  paintSubject(frame, { x: -2, y: 6, heightM: 1.8 });
  paintSubject(frame, { x: 2, y: 6, heightM: 1.7, shade: 150 });
  const detection = segment(background, frame, {});
  const mask = clean(detection.mask, frame.width, frame.height);
  const regions = blobs(mask, frame.width, frame.height, { minArea: 12 });
  assert.equal(regions.length, 2, `expected two regions, got ${regions.length}`);
});

test('the background model converges on the median, not the mean', () => {
  // A subject who stands in one spot for a third of the window must not drag
  // the background toward them, or they dissolve and leave a hole behind.
  const background = warmed();
  const index = 100 * 192 + 96;
  const before = background.luma[index];
  const rng = random(77);
  for (let i = 0; i < 30; i += 1) {
    const frame = backdrop({ rng });
    if (i % 3 === 0) {
      // A bright intruder on one frame in three.
      for (let p = 0; p < frame.data.length; p += 4) frame.data[p + 1] = 240;
    }
    updateBackground(background, frame, { rate: 1 });
  }
  assert.ok(
    Math.abs(background.luma[index] - before) < 30,
    `the background moved ${(background.luma[index] - before).toFixed(1)} levels toward an occasional intruder`,
  );
});

test('a held region is not absorbed into the background', () => {
  const background = warmed();
  const rng = random(88);
  const hold = new Uint8Array(192 * 144).fill(1);
  const before = [...background.luma.slice(0, 8)];
  for (let i = 0; i < 40; i += 1) {
    const frame = backdrop({ rng });
    for (let p = 0; p < frame.data.length; p += 4) frame.data[p] = 250;
    updateBackground(background, frame, { rate: 1, hold });
  }
  for (let i = 0; i < 8; i += 1) {
    assert.equal(background.luma[i], before[i], 'held pixels must not move');
  }
});

test('a shadow is rejected and a dark object is not', () => {
  const background = createBackground(4, 1);
  background.luma[0] = 120;
  background.red[0] = 120;
  background.green[0] = 120;
  background.blue[0] = 120;

  // Half the light, same colour: shade.
  const shade = { r: 60, g: 60, b: 60 };
  assert.equal(isShadow(background, 0, shade.r, shade.g, shade.b, luminance(shade.r, shade.g, shade.b)), true);

  // Half the luminance, quite different ratios: an object.
  const object = { r: 20, g: 80, b: 30 };
  assert.equal(
    isShadow(background, 0, object.r, object.g, object.b, luminance(object.r, object.g, object.b)),
    false,
  );
});

test('shadow rejection can be turned off', () => {
  const background = warmed();
  const frame = backdrop({ rng: random(559) });
  // Darken a broad band by a uniform factor: pure shade.
  for (let y = 60; y < 110; y += 1) {
    for (let x = 40; x < 150; x += 1) {
      const p = (y * frame.width + x) * 4;
      frame.data[p] *= 0.55;
      frame.data[p + 1] *= 0.55;
      frame.data[p + 2] *= 0.55;
    }
  }
  const rejected = segment(background, frame, { rejectShadows: true }).changed;
  const kept = segment(background, frame, { rejectShadows: false }).changed;
  assert.ok(kept > rejected * 3, `shadow rejection dropped ${rejected} of ${kept} changed pixels`);
});

test('opening removes speckle but keeps a body', () => {
  const width = 40;
  const height = 40;
  const mask = new Uint8Array(width * height);
  for (let y = 12; y < 30; y += 1) for (let x = 16; x < 24; x += 1) mask[y * width + x] = 1;
  const rng = random(3);
  for (let i = 0; i < 60; i += 1) mask[Math.floor(rng() * mask.length)] = 1;
  const cleaned = clean(mask, width, height);
  const regions = blobs(cleaned, width, height, { minArea: 12 });
  assert.equal(regions.length, 1, `speckle survived: ${regions.length} regions`);
  assert.ok(regions[0].area > 100, 'the body should survive the opening');
});

test('the labeller separates touching diagonals correctly', () => {
  const width = 8;
  const height = 8;
  const mask = new Uint8Array(width * height);
  // Two 3x3 squares meeting at a corner: 8-connectivity makes them one region.
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) mask[y * width + x] = 1;
  for (let y = 3; y < 6; y += 1) for (let x = 3; x < 6; x += 1) mask[y * width + x] = 1;
  const regions = blobs(mask, width, height, { minArea: 1 });
  assert.equal(regions.length, 1, 'diagonally touching regions are connected under 8-connectivity');
  assert.equal(regions[0].area, 18);
});

test('erosion shrinks and dilation grows, by exactly one pixel', () => {
  const width = 9;
  const height = 9;
  const mask = new Uint8Array(width * height);
  for (let y = 3; y <= 5; y += 1) for (let x = 3; x <= 5; x += 1) mask[y * width + x] = 1;

  const eroded = erode(mask, width, height);
  assert.equal(eroded.reduce((a, b) => a + b, 0), 1, 'a 3×3 square erodes to its centre');
  assert.equal(eroded[4 * width + 4], 1);

  const dilated = dilate(mask, width, height);
  assert.equal(dilated.reduce((a, b) => a + b, 0), 25, 'and grows to 5×5');

  // Outside the frame counts as set under erosion, so a subject halfway
  // through the edge of the picture is not eaten away as they arrive.
  const atEdge = new Uint8Array(width * height);
  for (let y = 3; y <= 5; y += 1) for (let x = 0; x <= 1; x += 1) atEdge[y * width + x] = 1;
  assert.ok(erode(atEdge, width, height)[4 * width + 0] === 1, 'the edge column survives erosion');
});
