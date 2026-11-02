/**
 * NeuroLens camera lab: the optics behind every number on the camera panel,
 * checked against hand calculations and published values.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  airyDisk, blurDisc, blurPixels, circleOfConfusion, cropFactor, depthOfField, diffractionLimitN, dollyZoomFocal, equivalentFocal,
  exposureOffset, exposureValue, fieldOfView, fieldWidthAt, fmtDistance, fmtShutter, frameFill, hyperfocal, kelvinToRgb,
  shutterTime, tStop, whiteBalanceGains,
} from '../../public/neurolens/camlab/optics.js';
import { BODIES, LENSES, bodyById, lensById } from '../../public/neurolens/camlab/rigs.js';

const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (±${tol})`);
const FF = { w: 36, h: 24 };
const S35 = { w: 24.9, h: 14 };

test('field of view: 50 mm on full frame is 39.6° horizontal, 27.0° vertical, 46.8° diagonal', () => {
  const f = fieldOfView(FF, 50);
  close(f.h, 39.598, 0.01); close(f.v, 26.991, 0.01); close(f.d, 46.793, 0.01);
  // A 2× anamorphic 50 mm sees the horizontal field of a 25 mm.
  close(fieldOfView(FF, 50, 2).h, fieldOfView(FF, 25).h, 1e-9);
});

test('crop factor and equivalent focal length', () => {
  close(cropFactor(FF), 1, 1e-12);
  close(cropFactor({ w: 17.3, h: 13 }), 2.0, 0.01, 'Micro Four Thirds is a 2× crop');
  close(equivalentFocal({ w: 17.3, h: 13 }, 25), 50.0, 0.1);
  close(circleOfConfusion(FF), 43.2666 / 1500, 1e-6);
  close(circleOfConfusion(FF), 0.0288, 1e-4);
});

test('hyperfocal and depth of field match the textbook example (50 mm f/8 full frame)', () => {
  const c = 0.03;
  // H = 50²/(8·0.03) + 50 = 10 466.7 mm
  close(hyperfocal(50, 8, c), 2500 / 0.24 + 50, 1e-9);
  const d = depthOfField(50, 8, 3000, c);
  // Dn = 3000·(10416.67)/(10466.67+3000−100) = 2337.9 mm; Df = 3000·10416.67/(10466.67−3000) = 4185.3 mm
  close(d.nearMm, (3000 * (2500 / 0.24)) / (2500 / 0.24 + 50 + 3000 - 100), 1e-9);
  close(d.nearMm, 2337.9, 0.1); close(d.farMm, 4185.3, 0.1);
  // Focused at the hyperfocal distance: sharp from H/2 to infinity.
  const h = depthOfField(50, 8, hyperfocal(50, 8, c), c);
  assert.equal(h.farMm, Infinity);
  close(h.nearMm, hyperfocal(50, 8, c) / 2, 1);
  // Wider aperture → shallower; longer lens at the same framing → also shallower background blur.
  assert.ok(depthOfField(50, 1.4, 3000, c).totalMm < d.totalMm);
});

test('blur disc: zero at focus, and the limit equals the f/N aperture image of infinity', () => {
  assert.equal(blurDisc(50, 2, 2000, 2000), 0);
  // b(∞) = f²/(N(s−f)): 50²/(2·1950) = 0.641 mm
  close(blurDisc(50, 2, 2000, 1e12), 2500 / 3900, 1e-6);
  // The DOF limits are exactly where the blur disc equals c.
  const c = 0.03; const d = depthOfField(85, 2.8, 2500, c);
  close(blurDisc(85, 2.8, 2500, d.nearMm), c, 1e-9);
  close(blurDisc(85, 2.8, 2500, d.farMm), c, 1e-9);
  assert.equal(blurDisc(50, 2, 40, 2000), Infinity, 'focused inside the focal length is impossible');
  // In pixels: a 1080-line frame, S35, the blur is b/h × 1080; anamorphic ovals are narrower than tall.
  const o = { fMm: 50, N: 2, sMm: 2000, sensor: S35, squeeze: 1 };
  const [ph, pv] = blurPixels(o, 1e12, 1080);
  close(pv, (2500 / 3900 / 14) * 1080, 1e-6); close(ph, pv, 1e-12);
  const [ah, av] = blurPixels({ ...o, squeeze: 2 }, 1e12, 1080);
  close(ah, av / 2, 1e-12);
});

test('exposure: sunny-16, the 180° rule, T-stops and ND', () => {
  // Sunny 16: f/16 at 1/100 s, ISO 100 → EV ≈ 14.64; the EV 15 "full sun" scene is +0.36 stop bright.
  close(exposureValue(16, 1 / 100, 100), Math.log2(256 * 100), 1e-12);
  close(exposureValue(16, 1 / 100, 100), 14.644, 1e-3);
  // Doubling ISO lowers the EV needed by exactly one stop.
  close(exposureValue(4, 1 / 50, 200) - exposureValue(4, 1 / 50, 100), -1, 1e-12);
  close(shutterTime(180, 24), 1 / 48, 1e-15);
  close(shutterTime(90, 24), 1 / 96, 1e-15);
  close(tStop(2, 0.82), 2.2086, 1e-4);
  close(exposureOffset(15, 15, 3), -3, 1e-12, 'a 3-stop ND under the right exposure is 3 stops dark');
  assert.equal(fmtShutter(1 / 48), '1/48');
});

test('diffraction: the Airy disk at f/16 is 21.5 µm and starts to bite near f/21 on full frame', () => {
  close(airyDisk(16) * 1000, 21.472, 1e-3);
  close(diffractionLimitN(0.0288), 0.0288 / (2.44 * 550e-6), 1e-9);
  close(diffractionLimitN(0.0288), 21.46, 0.01);
});

test('framing and the dolly zoom', () => {
  close(fieldWidthAt(FF, 50, 5), 3.6, 1e-12, 'a 50 on full frame sees 3.6 m across at 5 m');
  close(dollyZoomFocal(35, 3, 6), 70, 1e-12);
  // The subject keeps its frame fill through the move.
  close(frameFill(FF, 35, 1.8, 3), frameFill(FF, 70, 1.8, 6), 1e-12);
  close(frameFill(FF, 50, 1.8, 3.75), 1, 1e-12, 'a 1.8 m person fills the height at 3.75 m');
  assert.equal(fmtDistance(Infinity), '∞'); assert.equal(fmtDistance(2337.9), '2.34 m'); assert.equal(fmtDistance(450), '45 cm');
});

test('colour temperature: 6600 K is neutral; tungsten through a daylight balance looks orange', () => {
  const w = kelvinToRgb(6600);
  close(w[0], 1, 0.01); close(w[2], 1, 0.03);
  const t = kelvinToRgb(3200);
  assert.ok(t[0] > t[1] && t[1] > t[2], 'tungsten is red > green > blue');
  const g = whiteBalanceGains(3200, 5600);
  assert.ok(g[0] > 1 && g[2] < 1, `orange cast: ${g}`);
  const n = whiteBalanceGains(4300, 4300);
  n.forEach((v) => close(v, 1, 1e-12));
});

test('every rig is well formed', () => {
  for (const b of BODIES) { assert.ok(b.sensor.w > b.sensor.h && b.iso.length > 0 && (b.fps.includes(24) || b.fps.includes(30)), b.id); }
  for (const l of LENSES) { assert.ok(l.focals.length && l.N[0] <= l.N[1] && l.transmission > 0 && l.transmission <= 1, l.id); }
  close(equivalentFocal(bodyById('phone').sensor, lensById('phone').focals[0]), 26.6, 0.3, 'phone main camera ≈ 26 mm eq. in 16:9');
  close(cropFactor(bodyById('s35').sensor), 1.51, 0.01);
});
