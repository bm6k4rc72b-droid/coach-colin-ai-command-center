/**
 * Thermal palettes, and the rule that a ramp over brightness is not a temperature.
 *
 * @module tests/black-optic-6/thermal
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areaStats, autoGain, canReadTemperature, emissivityCorrect, EMISSIVITY, inIsotherm,
  ISOTHERM_MODES, luminanceField, manualGain, PALETTES, paletteFor, rampTable, readout,
  render, SOURCES, spot,
} from '../../public/black-optic-6/js/thermal.js';

/**
 * A frame with a horizontal brightness gradient.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {ImageData} A frame-shaped object.
 */
function gradient(width = 32, height = 16) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const value = Math.round((x / (width - 1)) * 255);
      data[p] = value;
      data[p + 1] = value;
      data[p + 2] = value;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

test('every palette is complete, ordered and ends brighter than it starts', () => {
  const seen = new Set();
  for (const palette of PALETTES) {
    assert.ok(!seen.has(palette.id), `duplicate palette ${palette.id}`);
    seen.add(palette.id);
    assert.ok(palette.stops.length >= 2, `${palette.id} needs stops`);
    assert.equal(palette.stops[0][0], 0, `${palette.id} must start at zero`);
    assert.equal(palette.stops[palette.stops.length - 1][0], 1, `${palette.id} must end at one`);
    for (let i = 1; i < palette.stops.length; i += 1) {
      assert.ok(palette.stops[i][0] > palette.stops[i - 1][0], `${palette.id} stops must ascend`);
    }
    assert.ok(palette.use.length > 30, `${palette.id} should say when to reach for it`);
  }
  assert.ok(PALETTES.length >= 12, 'the whole set is the point');
});

test('the ramp table interpolates the full 256 steps', () => {
  const ramp = rampTable(paletteFor('white-hot'));
  assert.equal(ramp.length, 768);
  assert.equal(ramp[0], 0);
  assert.equal(ramp[765], 255);
  assert.ok(ramp[384] > 100 && ramp[384] < 160, 'the middle should be mid-grey');
});

test('black hot is white hot inverted', () => {
  const white = rampTable(paletteFor('white-hot'));
  const black = rampTable(paletteFor('black-hot'));
  assert.ok(black[0] > black[765], 'black hot starts light and ends dark');
  assert.equal(black[0], white[765]);
});

test('an unknown palette falls back to the one that misleads least', () => {
  assert.equal(paletteFor('nonsense').id, 'white-hot');
});

test('auto gain uses percentiles, so one hot pixel cannot set the scale', () => {
  const field = new Float32Array(1000);
  for (let i = 0; i < field.length; i += 1) field[i] = 0.4 + (i / field.length) * 0.2;
  const clean = autoGain(field);
  field[0] = 1000;
  const withOutlier = autoGain(field);
  assert.ok(Math.abs(clean.high - withOutlier.high) < 0.05, 'an outlier must not flatten the frame');
  assert.ok(withOutlier.span > 0);
});

test('manual gain fixes the scale so two frames are comparable', () => {
  const gain = manualGain(30, 10);
  assert.equal(gain.low, 25);
  assert.equal(gain.high, 35);
  assert.equal(gain.span, 10);
  assert.ok(manualGain(30, 0).span > 0, 'a zero span would divide by zero');
});

test('isotherms pick out the part of the scale asked for', () => {
  assert.equal(inIsotherm(40, { mode: 'above', low: 35 }), true);
  assert.equal(inIsotherm(30, { mode: 'above', low: 35 }), false);
  assert.equal(inIsotherm(10, { mode: 'below', high: 15 }), true);
  assert.equal(inIsotherm(30, { mode: 'between', low: 25, high: 35 }), true);
  assert.equal(inIsotherm(40, { mode: 'between', low: 25, high: 35 }), false);
  assert.equal(inIsotherm(40, { mode: 'off' }), false);
  assert.equal(inIsotherm(NaN, { mode: 'above', low: 0 }), false);
  assert.ok(ISOTHERM_MODES.length >= 4);
});

test('emissivity correction is a fourth-power one, not an offset', () => {
  // A near-black body barely moves; polished metal moves a great deal.
  assert.ok(Math.abs(emissivityCorrect(36.5, 0.98, 20) - 36.5) < 1, 'skin needs almost no correction');
  const metal = emissivityCorrect(40, 0.1, 20);
  assert.ok(metal > 100, `polished metal reading 40 °C is far hotter than that, got ${metal.toFixed(0)}`);
  // Doubling the gap does not double the correction, because it is not linear.
  const near = emissivityCorrect(30, 0.5, 20) - 30;
  const far = emissivityCorrect(60, 0.5, 20) - 60;
  assert.ok(Math.abs(far - near) > 1, 'a linear offset would give the same correction at both');
  assert.equal(emissivityCorrect(25, 1, 20), 25, 'a perfect emitter needs no correction');
  assert.ok(EMISSIVITY.some((entry) => entry.value < 0.1), 'the table must include a shiny case');
});

test('a visible camera produces a luminance field, tagged as such', () => {
  const field = luminanceField(gradient());
  assert.equal(field.source, 'LUMINANCE');
  assert.equal(field.field.length, 32 * 16);
  assert.ok(field.field[0] < 0.05 && field.field[31] > 0.95, 'the gradient should run dark to light');
});

test('temperature is withheld unless the source can support it', () => {
  assert.equal(canReadTemperature('RADIOMETRIC'), true);
  assert.equal(canReadTemperature('THERMAL'), false);
  assert.equal(canReadTemperature('LUMINANCE'), false);
  assert.equal(canReadTemperature('nonsense'), false);

  const radiometric = readout('RADIOMETRIC', 36.7);
  assert.match(radiometric.text, /°C/);
  assert.equal(radiometric.temperature, true);

  for (const source of ['LUMINANCE', 'THERMAL']) {
    const reading = readout(source, 0.62);
    assert.doesNotMatch(reading.text, /°|C\b/, `${source} must never print a temperature`);
    assert.equal(reading.temperature, false);
  }
  assert.equal(readout('LUMINANCE', null).text, '—');
});

test('every source states what its numbers actually are', () => {
  for (const source of Object.values(SOURCES)) {
    assert.ok(source.meaning.length > 40, `${source.id} needs an explanation`);
    assert.ok(source.provenance, `${source.id} needs a provenance state`);
  }
  assert.match(SOURCES.LUMINANCE.meaning, /not heat|brightness/i);
});

test('the spot meter averages a small area and refuses to leave the frame', () => {
  const field = luminanceField(gradient());
  const left = spot(field.field, field.width, 2, 8, 1);
  const right = spot(field.field, field.width, 29, 8, 1);
  assert.ok(right > left, 'the bright end should read higher');
  assert.equal(spot(field.field, field.width, -5, 8), null);
  assert.equal(spot(field.field, field.width, 999, 8), null);
});

test('area statistics find the hotspot and its coordinates', () => {
  const field = luminanceField(gradient());
  const stats = areaStats(field.field, field.width, { x: 0, y: 0, w: 32, h: 16 });
  assert.equal(stats.count, 32 * 16);
  assert.ok(stats.max > stats.mean && stats.mean > stats.min);
  assert.equal(stats.hotspot.x, 31, 'the hottest column of a gradient is the last one');
  assert.equal(areaStats(field.field, field.width, { x: 100, y: 100, w: 4, h: 4 }).count, 0);
});

test('rendering paints the whole frame and honours an isotherm', () => {
  const frame = gradient();
  const field = luminanceField(frame);
  const out = { data: new Uint8ClampedArray(frame.width * frame.height * 4), width: frame.width, height: frame.height };
  render(field, out, { ramp: rampTable(paletteFor('ironbow')), gain: autoGain(field.field) });
  for (let i = 3; i < out.data.length; i += 4) assert.equal(out.data[i], 255, 'every pixel must be opaque');

  const alarmed = { data: new Uint8ClampedArray(out.data.length), width: frame.width, height: frame.height };
  render(field, alarmed, {
    ramp: rampTable(paletteFor('white-hot')),
    gain: { low: 0, span: 1 },
    isotherm: { mode: 'above', low: 0.9, colour: [255, 59, 78] },
  });
  const hottest = (15 * frame.width + 31) * 4;
  assert.equal(alarmed.data[hottest], 255);
  assert.equal(alarmed.data[hottest + 1], 59, 'the hot end should be painted in alarm colour');
});

/**
 * How many pixels fusion changed, for a given source frame.
 *
 * @param {ImageData} frame The visible frame whose edges are borrowed.
 * @returns {number} Pixels altered by the fusion pass.
 */
function fusionChanges(frame) {
  const field = luminanceField(frame);
  const options = { ramp: rampTable(paletteFor('white-hot')), gain: autoGain(field.field) };
  const plain = { data: new Uint8ClampedArray(frame.width * frame.height * 4), width: frame.width, height: frame.height };
  const fused = { data: new Uint8ClampedArray(plain.data.length), width: frame.width, height: frame.height };
  render(field, plain, options);
  render(field, fused, { ...options, fusion: frame, fusionStrength: 1 });
  let changed = 0;
  for (let i = 0; i < plain.data.length; i += 4) if (plain.data[i] !== fused.data[i]) changed += 1;
  return changed;
}

test('fusion lifts real edges and leaves a smooth frame alone', () => {
  // A gradient across a realistic frame width steps under a digital number per
  // pixel — genuinely no edges in it.
  const smooth = gradient(320, 32);
  const changed = fusionChanges(smooth);
  assert.ok(changed < (320 * 32) / 8, `a smooth ramp should not be repainted, ${changed} pixels changed`);

  // The same frame with a hard vertical line through it.
  const edged = gradient(320, 32);
  for (let y = 0; y < 32; y += 1) {
    const p = (y * 320 + 160) * 4;
    edged.data[p] = 255;
    edged.data[p + 1] = 255;
    edged.data[p + 2] = 255;
  }
  assert.ok(fusionChanges(edged) > changed, 'a hard edge must be picked up and laid over the thermal picture');
});
