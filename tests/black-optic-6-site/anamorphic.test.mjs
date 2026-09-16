import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SQUEEZE, FLARE_RGB, bokehAxes, streakIntensity, distort, aberration, vignette, halation,
} from '../../public/black-optic-6-site/js/anamorphic.js';

test('bokeh is taller than it is wide, by the squeeze factor', () => {
  const axes = bokehAxes(10);
  assert.equal(axes.ry, 10);
  assert.equal(axes.rx, 10 / SQUEEZE);
  assert.ok(axes.ry > axes.rx, 'anamorphic bokeh is a vertical oval — getting this backwards is the classic tell');
  assert.equal(bokehAxes(-4).ry, 0, 'a negative radius must not flip the oval');
});

test('the streak falls off slowly along the frame and sharply across it', () => {
  const along = streakIntensity(0.2, 0);
  const across = streakIntensity(0, 0.02);
  assert.ok(along > across * 50, 'a streak that is not far wider than it is tall is a glow, not a flare');
  assert.equal(streakIntensity(0, 0), 1, 'the source itself reads full');
  assert.ok(streakIntensity(0.2, 0) > streakIntensity(0.6, 0));
  // Symmetric about the source in both axes.
  assert.equal(streakIntensity(-0.3, 0.01), streakIntensity(0.3, -0.01));
});

test('degenerate streak parameters return nothing rather than NaN', () => {
  assert.equal(streakIntensity(0.1, 0, 0), 0);
  assert.equal(streakIntensity(0.1, 0, 0.4, 0), 0);
});

test('mustache distortion barrels the middle and pulls the corners back', () => {
  const centre = distort(0, 0);
  assert.equal(centre.x, 0);
  assert.equal(centre.y, 0);

  const mid = distort(0.4, 0);
  assert.ok(mid.x > 0.4, 'barrel pushes the mid-field out');

  // The r^4 term must eventually claw the extreme corner back toward the centre.
  const nearCorner = distort(0.85, 0.85);
  const linear = Math.hypot(0.85, 0.85);
  const distorted = Math.hypot(nearCorner.x, nearCorner.y);
  assert.ok(distorted < linear * 1.06, 'the corners must not keep ballooning — that is barrel, not mustache');
});

test('chromatic aberration is radial and zero on the optical axis', () => {
  const axis = aberration(0, 0);
  assert.equal(axis.magnitude, 0, 'an aberration that is constant across frame is a filter, not a lens');

  const edge = aberration(0.9, 0);
  const middle = aberration(0.3, 0);
  assert.ok(edge.magnitude > middle.magnitude);

  // Strictly along the radius.
  const diagonal = aberration(0.5, 0.5);
  assert.ok(Math.abs(diagonal.x - diagonal.y) < 1e-12);
});

test('vignette is an ellipse, so the corners of a wide frame hold up', () => {
  const side = vignette(1, 0);
  const top = vignette(0, 1);
  assert.ok(side > top, 'the squeeze makes horizontal falloff gentler than vertical');
  assert.equal(vignette(0, 0), 1);
  assert.ok(vignette(4, 4) >= 0, 'never negative, whatever is thrown at it');
});

test('halation only touches what is already bright', () => {
  assert.equal(halation(0.5), 0);
  assert.ok(halation(0.9) > 0);
  assert.ok(halation(1) <= 1);
  assert.ok(halation(1) > halation(0.8));
});

test('the flare is blue, the way a coated anamorphic actually flares', () => {
  const [r, g, b] = FLARE_RGB;
  assert.ok(b > g && g > r, 'blue dominant, green second — not white, not cyan');
});
