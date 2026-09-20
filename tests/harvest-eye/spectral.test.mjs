/**
 * Vegetation-index tests.
 *
 * The index formulas are checked against hand-computed values, and the canopy
 * analysis against synthetic scenes whose answer is known by construction: a
 * healthy sward, a yellowing one, bare soil, and a field with one stressed
 * corner that must show up as a hotspot in the right tile.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMERA_MODES, INDICES, analyzeCanopy, availableIndices, indexById, indexValue,
  interpretCanopy, otsuThreshold, paintIndexMap, ramp,
} from '../../public/harvest-eye/js/spectral.js';

/**
 * Build a frame from a per-pixel colour function.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {(x:number, y:number) => [number, number, number]} paint Colour source.
 * @returns {{data:Uint8ClampedArray,width:number,height:number}} Frame.
 */
function frameOf(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Vigorous green canopy with leaf-scale texture. */
const healthy = (x, y) => [46 + ((x * 7 + y * 3) % 9), 120 + ((x * 3 + y * 5) % 13), 40];
/** Chlorotic canopy: red channel up, green down — the yellowing signature. */
const yellowing = (x, y) => [150 + ((x * 7 + y * 3) % 9), 150 + ((x * 3 + y * 5) % 11), 45];
/** Bare soil. */
const soil = (x, y) => [135 + ((x + y) % 7), 100 + ((x * 2 + y) % 5), 72];

test('every index definition is coherent', () => {
  for (const index of INDICES) {
    assert.ok(index.range[0] < index.range[1], `${index.id} needs an ascending range`);
    assert.ok(
      index.stressBelow > index.range[0] && index.stressBelow < index.range[1],
      `${index.id} stress line must sit inside its range`,
    );
    assert.ok(index.measures.length > 10 && index.formula.length > 5);
  }
  assert.equal(indexById('nope').id, 'exg', 'unknown ids fall back to ExG');
});

test('ExG matches its definition on chromatic coordinates', () => {
  // Pure green: r=0, g=1, b=0 → 2(1) − 0 − 0 = 2, over a sum of 1.
  assert.equal(indexValue('exg', 0, 1, 0), 2);
  // Neutral grey has no excess of anything.
  assert.ok(Math.abs(indexValue('exg', 0.5, 0.5, 0.5)) < 1e-9);
});

test('NGRDI, VARI and GLI match hand-computed values', () => {
  assert.ok(Math.abs(indexValue('ngrdi', 0.2, 0.6, 0.1) - 0.5) < 1e-9);
  assert.ok(Math.abs(indexValue('vari', 0.2, 0.6, 0.1) - (0.4 / 0.7)) < 1e-9);
  assert.ok(Math.abs(indexValue('gli', 0.2, 0.6, 0.1) - (0.9 / 1.5)) < 1e-9);
});

test('TGI rises as a leaf gets greener relative to red and blue', () => {
  const chlorotic = indexValue('tgi', 0.6, 0.6, 0.2);
  const green = indexValue('tgi', 0.2, 0.6, 0.15);
  assert.ok(green > chlorotic, `green leaf ${green} should exceed chlorotic ${chlorotic}`);
});

test('VARI refuses to report on pixels where its denominator collapses', () => {
  assert.ok(Number.isNaN(indexValue('vari', 0.3, 0.3, 0.6)), 'sky-blue pixels have no VARI');
});

test('indices are undefined for black pixels rather than silently zero', () => {
  for (const index of INDICES) {
    assert.ok(Number.isNaN(indexValue(index.id, 0, 0, 0)), `${index.id} on black`);
  }
});

test('NDVI needs NIR and computes correctly when it has it', () => {
  assert.ok(Number.isNaN(indexValue('ndvi', 0.2, 0.5, 0.1)), 'no NIR, no NDVI');
  assert.ok(Math.abs(indexValue('ndvi', 0, 0, 0, { nir: 0.8, visible: 0.2 }) - 0.6) < 1e-9);
});

test('NDVI is offered only to cameras that can see NIR', () => {
  const plain = availableIndices('rgb').map((index) => index.id);
  assert.ok(!plain.includes('ndvi'), 'a standard phone camera must not offer NDVI');
  assert.ok(plain.includes('tgi'));
  const converted = availableIndices('ir-red').map((index) => index.id);
  assert.ok(converted.includes('ndvi'));
  assert.equal(CAMERA_MODES[0].nir, null);
});

test('Otsu splits a clean bimodal histogram between the modes', () => {
  const histogram = new Uint32Array(256);
  for (let i = 40; i < 60; i += 1) histogram[i] = 100;
  for (let i = 190; i < 210; i += 1) histogram[i] = 100;
  const total = histogram.reduce((sum, count) => sum + count, 0);
  const threshold = otsuThreshold(histogram, total);
  // `best` is the last bin of the low class, so the top edge of the low mode
  // (59) is the correct split, not a value floating in the empty gap.
  assert.ok(threshold >= 59 && threshold < 190, `threshold ${threshold} should separate the modes`);
  assert.equal(otsuThreshold(new Uint32Array(256), 0), 128, 'an empty histogram degrades safely');
});

test('healthy canopy scores above chlorotic canopy on every RGB index', () => {
  for (const index of availableIndices('rgb')) {
    const good = analyzeCanopy(frameOf(64, 48, healthy), { index: index.id });
    const bad = analyzeCanopy(frameOf(64, 48, yellowing), { index: index.id });
    assert.ok(good.usable, `${index.id}: healthy frame should be measurable`);
    assert.ok(
      good.stats.mean > bad.stats.mean,
      `${index.id}: healthy ${good.stats.mean} should beat chlorotic ${bad.stats.mean}`,
    );
  }
});

test('bare soil reports almost no canopy and is not usable', () => {
  const result = analyzeCanopy(frameOf(64, 48, soil), { index: 'exg' });
  assert.ok(result.canopyCover < 0.05, `cover was ${result.canopyCover}`);
  assert.equal(result.usable, false);
});

test('canopy cover tracks the green fraction of a mixed scene', () => {
  // Left half canopy, right half soil.
  const mixed = frameOf(64, 48, (x, y) => (x < 32 ? healthy(x, y) : soil(x, y)));
  const result = analyzeCanopy(mixed, { index: 'exg' });
  assert.ok(Math.abs(result.canopyCover - 0.5) < 0.08, `cover was ${result.canopyCover}`);
});

test('a stressed corner surfaces as a hotspot in the right tile', () => {
  const scene = frameOf(96, 72, (x, y) => (x > 71 && y > 53 ? yellowing(x, y) : healthy(x, y)));
  const result = analyzeCanopy(scene, { index: 'ngrdi', tileCols: 4, tileRows: 3 });
  assert.ok(result.hotspots.length > 0);
  const worst = result.hotspots[0];
  assert.equal(worst.col, 3, 'the weak tile is the right-hand column');
  assert.equal(worst.row, 2, 'the weak tile is the bottom row');
  assert.ok(worst.mean < result.stats.mean, 'the hotspot must be below the frame mean');
});

test('patchiness separates a uniform sward from a mottled one', () => {
  const uniform = analyzeCanopy(frameOf(64, 48, healthy), { index: 'ngrdi' });
  const mottled = analyzeCanopy(
    frameOf(64, 48, (x, y) => ((x >> 3) % 2 ? yellowing(x, y) : healthy(x, y))),
    { index: 'ngrdi' },
  );
  assert.ok(mottled.stats.cv > uniform.stats.cv, 'mottled canopy must read as more variable');
});

test('yellowing and necrosis are reported as leaf-area fractions', () => {
  const chlorotic = analyzeCanopy(frameOf(64, 48, yellowing), { index: 'exg' });
  assert.ok(chlorotic.chlorosisShare > 0.5, `got ${chlorotic.chlorosisShare}`);

  const necrotic = analyzeCanopy(
    frameOf(64, 48, (x, y) => (y < 24 ? [88, 58, 30] : healthy(x, y))),
    { index: 'exg' },
  );
  assert.ok(necrotic.necrosisShare > 0.3, `got ${necrotic.necrosisShare}`);
  assert.ok(chlorotic.necrosisShare < 0.1, 'yellow leaves are not necrotic');
});

test('the index map paints canopy and leaves everything else transparent', () => {
  const mixed = frameOf(64, 48, (x, y) => (x < 32 ? healthy(x, y) : soil(x, y)));
  const analysis = analyzeCanopy(mixed, { index: 'exg' });
  const painted = paintIndexMap(analysis, { alpha: 200 });
  assert.equal(painted.width, 64);

  let canopyPainted = 0;
  let soilPainted = 0;
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const alpha = painted.data[(y * 64 + x) * 4 + 3];
      if (alpha > 0) {
        if (x < 32) canopyPainted += 1;
        else soilPainted += 1;
      }
    }
  }
  assert.ok(canopyPainted > 1200, `expected the canopy half painted, got ${canopyPainted}`);
  assert.ok(soilPainted < 120, `soil should stay transparent, got ${soilPainted}`);
});

test('the colour ramp runs red to green and clamps outside its range', () => {
  const low = ramp(0);
  const high = ramp(1);
  assert.ok(low[0] > low[1], 'the stressed end is red-dominant');
  assert.ok(high[1] > high[0], 'the healthy end is green-dominant');
  assert.deepEqual(ramp(-5), low, 'values below the range clamp');
  assert.deepEqual(ramp(5), high, 'values above the range clamp');
  assert.deepEqual(ramp(Number.NaN), low, 'NaN degrades to the low end, never to a crash');
});

test('interpretation escalates from even canopy to a stress alert', () => {
  const good = interpretCanopy(analyzeCanopy(frameOf(64, 48, healthy), { index: 'ngrdi' }));
  assert.equal(good.severity, 'ok');

  const bad = interpretCanopy(analyzeCanopy(frameOf(64, 48, yellowing), { index: 'ngrdi' }));
  assert.equal(bad.severity, 'alert');
  assert.match(bad.detail, /yellowing|stress line|weak/);

  const empty = interpretCanopy(analyzeCanopy(frameOf(64, 48, soil), { index: 'ngrdi' }));
  assert.match(empty.headline, /No canopy/);
});

test('a drop against the block baseline is called out', () => {
  const analysis = analyzeCanopy(frameOf(64, 48, healthy), { index: 'ngrdi' });
  const verdict = interpretCanopy(analysis, { mean: analysis.stats.mean + 0.09 });
  assert.match(verdict.detail, /down 0\.0/);
  assert.notEqual(verdict.severity, 'ok', 'a real decline is at least worth watching');
});

test('an IR-converted camera produces a usable NDVI map', () => {
  // Red channel carries NIR: healthy vegetation is bright in NIR, dark in the
  // visible band, which is exactly what makes NDVI high.
  const scene = frameOf(64, 48, (x, y) => [210 + ((x + y) % 6), 90, 40 + ((x * 3) % 5)]);
  const result = analyzeCanopy(scene, { index: 'ndvi', cameraMode: 'ir-red' });
  assert.ok(result.usable);
  assert.ok(result.stats.mean > 0.5, `NDVI mean was ${result.stats.mean}`);
});

test('relative stress finds weak canopy that clears the absolute floor', () => {
  // A field that is healthy everywhere except one corner, all of it well above
  // any absolute stress line: only a relative measure can see the corner.
  const scene = frameOf(96, 72, (x, y) => (
    x > 63 && y > 47 ? [70, 108, 44] : healthy(x, y)
  ));
  const result = analyzeCanopy(scene, { index: 'ngrdi' });
  assert.equal(result.stats.stressedShare, 0, 'nothing here is absolutely stressed');
  assert.ok(
    result.stats.relativeStressShare > 0.08,
    `the weak corner should register relatively, got ${result.stats.relativeStressShare}`,
  );
  assert.ok(result.stats.reference > result.stats.mean, 'the reference is the strong tail');
  assert.ok(result.stats.zones > 20, 'relative stress is judged over many zones');
  assert.ok(Math.abs(result.stats.relativeCut - result.stats.reference * 0.9) < 1e-9);
  // The threshold-free measure: how far the weak end sits below the strong end.
  assert.ok(result.stats.zoneDeficit > 0.3, `deficit was ${result.stats.zoneDeficit}`);
  assert.ok(result.stats.weakZone < result.stats.reference);
});

test('an even canopy has almost no relative stress', () => {
  const result = analyzeCanopy(frameOf(64, 48, healthy), { index: 'ngrdi' });
  // Judging zones rather than pixels is what keeps sensor noise from inventing
  // a few per cent of phantom stress on a field that is perfectly uniform.
  assert.equal(
    result.stats.relativeStressShare,
    0,
    `uniform canopy should not flag itself, got ${result.stats.relativeStressShare}`,
  );
  assert.ok(result.stats.zoneDeficit < 0.05, `deficit was ${result.stats.zoneDeficit}`);
});

test('relative stress is reported as zero when there is no reference to speak of', () => {
  const result = analyzeCanopy(frameOf(64, 48, soil), { index: 'ngrdi' });
  assert.equal(result.stats.relativeStressShare, 0);
  assert.equal(result.stats.zoneDeficit, 0);
});

test('the interpretation leads with the spread, not an absolute threshold', () => {
  const scene = frameOf(96, 72, (x, y) => (x > 63 && y > 47 ? [70, 108, 44] : healthy(x, y)));
  const verdict = interpretCanopy(analyzeCanopy(scene, { index: 'ngrdi' }));
  assert.notEqual(verdict.severity, 'ok', 'a 50% deficit is not an even canopy');
  assert.match(verdict.detail, /down on the best|below the field/);
  assert.match(verdict.detail, /zones worth walking to/);
});
