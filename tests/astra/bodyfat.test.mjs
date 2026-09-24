/**
 * Unit tests for the body-composition module.
 *
 * Four published equations, an error model and a change-detection rule. The
 * equations are checked against hand-worked values rather than against
 * themselves, because a transcription error in a regression coefficient
 * produces a plausible-looking number that is simply wrong — which is the
 * exact failure mode this deck is supposed to argue against.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BANDS, FIELDS, LEVERS, METHODS, bandsTouched, bmi, changeThreshold,
  compareReadings, composition, confidence, describeBand, estimate,
  frameQuality, method, readiness, trend, validate,
} from '../../public/astra/js/bodyfat.js';
import { TIERS, tier } from '../../public/astra/js/evidence.js';
import { PEPTIDES } from '../../public/astra/js/data/peptides.js';

/** A complete, ordinary set of measurements for a man. */
const MAN = { sex: 'male', age: 34, height: 180, weight: 82, neck: 38, waist: 88, hip: 100, fold1: 10, fold2: 20, fold3: 12 };

/** The same for a woman. */
const WOMAN = { sex: 'female', age: 31, height: 166, weight: 62, neck: 31, waist: 72, hip: 96, fold1: 16, fold2: 14, fold3: 22 };

/* --------------------------------------------------------------- equations */

test('BMI is the textbook quantity', () => {
  assert.equal(Math.round(bmi({ weight: 82, height: 180 }) * 100) / 100, 25.31);
  assert.equal(bmi({ weight: 0, height: 180 }), null);
  assert.equal(bmi({ weight: 82 }), null);
});

test('the Navy equation reproduces a hand-worked value', () => {
  // 495 / (1.0324 - 0.19077*log10(88-38) + 0.15456*log10(180)) - 450
  const expected = 495 / (1.0324 - 0.19077 * (Math.log(50) / Math.LN10) + 0.15456 * (Math.log(180) / Math.LN10)) - 450;
  const got = method('navy').estimate(MAN);
  assert.ok(Math.abs(got - expected) < 1e-9, `${got} != ${expected}`);
  // And the value is physiologically sane for that body.
  assert.ok(got > 14 && got < 24, `${got}% is not plausible for a 180/82 man with an 88cm waist`);
});

test('the Navy equation uses the hip for women and not for men', () => {
  const withHip = method('navy').estimate(WOMAN);
  const wider = method('navy').estimate({ ...WOMAN, hip: 106 });
  assert.ok(wider > withHip, 'a wider hip must raise the female estimate');
  const manWider = method('navy').estimate({ ...MAN, hip: 130 });
  assert.equal(manWider, method('navy').estimate(MAN), 'the male equation must ignore the hip');
});

test('Relative Fat Mass is the published two-term form', () => {
  assert.equal(method('rfm').estimate({ sex: 'male', height: 180, waist: 90 }), 64 - 20 * (180 / 90));
  assert.equal(method('rfm').estimate({ sex: 'female', height: 165, waist: 75 }), 76 - 20 * (165 / 75));
  // The twelve-point sex offset is the whole difference between the two.
  const m = method('rfm').estimate({ sex: 'male', height: 170, waist: 80 });
  const f = method('rfm').estimate({ sex: 'female', height: 170, waist: 80 });
  assert.ok(Math.abs((f - m) - 12) < 1e-9);
});

test('the Deurenberg equation reproduces its published coefficients', () => {
  const value = method('deurenberg').estimate(MAN);
  assert.ok(Math.abs(value - (1.20 * bmi(MAN) + 0.23 * 34 - 10.8 - 5.4)) < 1e-9);
  // Sex costs 10.8 points, age adds 0.23 a year.
  const older = method('deurenberg').estimate({ ...MAN, age: 44 });
  assert.ok(Math.abs((older - value) - 2.3) < 1e-9);
  const female = method('deurenberg').estimate({ ...MAN, sex: 'female' });
  assert.ok(Math.abs((female - value) - 10.8) < 1e-9);
});

test('the skinfold equation runs through body density and Siri', () => {
  const sum = 10 + 20 + 12;
  const density = 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * 34;
  assert.ok(Math.abs(method('jp3').estimate(MAN) - ((495 / density) - 450)) < 1e-9);
  // Thicker folds mean more fat, which is the one direction that must hold.
  assert.ok(method('jp3').estimate({ ...MAN, fold2: 30 }) > method('jp3').estimate(MAN));
});

test('every method moves the right way when the waist grows', () => {
  for (const entry of METHODS) {
    if (!entry.needs.includes('waist')) continue;
    const before = entry.estimate(MAN);
    const after = entry.estimate({ ...MAN, waist: MAN.waist + 8 });
    assert.ok(after > before, `${entry.id} did not rise with the waist`);
  }
});

test('every method produces a plausible figure for an ordinary body', () => {
  for (const subject of [MAN, WOMAN]) {
    for (const entry of METHODS) {
      const value = entry.estimate(subject);
      assert.ok(value > 5 && value < 50, `${entry.id} returned ${value}% for a healthy adult`);
    }
  }
});

/* -------------------------------------------------------------- readiness */

test('a method knows what it is missing', () => {
  const { ready, missing } = readiness(method('navy'), { sex: 'male', height: 180 });
  assert.equal(ready, false);
  assert.deepEqual(missing, ['neck', 'waist']);
  assert.equal(readiness(method('navy'), MAN).ready, true);
});

test('the female Navy equation additionally requires a hip', () => {
  const withoutHip = { ...WOMAN, hip: undefined };
  assert.deepEqual(readiness(method('navy'), withoutHip).missing, ['hip']);
  // The same measurements read as a man are complete, because the male
  // equation never asks for it.
  assert.equal(readiness(method('navy'), { ...withoutHip, sex: 'male' }).ready, true);
});

test('implausible input is refused rather than estimated from', () => {
  assert.deepEqual(validate(MAN), []);
  const problems = validate({ ...MAN, height: 18 });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, 'height');
  assert.match(problems[0].message, /outside 120–230 cm/);
  // A waist inside the neck makes the Navy logarithm undefined.
  assert.ok(validate({ ...MAN, waist: 36 }).some((p) => /not larger than the neck/.test(p.message)));
});

/* ------------------------------------------------------------- estimating */

test('a full set of measurements runs every method', () => {
  const result = estimate(MAN);
  assert.equal(result.readings.length, METHODS.length);
  assert.ok(result.readings.every((reading) => reading.ready), 'every method should have what it needs');
  assert.ok(result.pooled.methods === METHODS.length);
});

test('a reading is always a band, never a point', () => {
  for (const reading of estimate(MAN).readings) {
    assert.ok(reading.high > reading.percent && reading.low < reading.percent, `${reading.method.id} has no interval`);
    assert.ok(Math.abs((reading.high - reading.percent) - reading.method.see) < 1e-9,
      `${reading.method.id}'s interval does not match its published error`);
  }
});

test('the pooled interval is never tighter than the best single method', () => {
  for (const subject of [MAN, WOMAN, { ...MAN, waist: 118, weight: 106 }]) {
    const { pooled, readings } = estimate(subject);
    const best = Math.min(...readings.filter((r) => r.ready).map((r) => r.method.see));
    assert.ok(pooled.margin >= best - 1e-9,
      `pooling manufactured accuracy: ${pooled.margin} < ${best}`);
  }
});

test('disagreement between methods widens the pooled band', () => {
  // A very muscular body is where BMI and tape part company hardest.
  const lean = estimate({ ...MAN, weight: 105, waist: 82, neck: 43 });
  const ordinary = estimate(MAN);
  assert.ok(lean.spread > ordinary.spread, 'the muscular case should split the methods further');
  assert.ok(lean.pooled.margin >= ordinary.pooled.margin);
  assert.ok(lean.confidence < ordinary.confidence, 'disagreement must cost confidence');
});

test('pooling weights the tighter method more heavily', () => {
  const { pooled, readings } = estimate(MAN);
  const navy = readings.find((r) => r.method.id === 'navy').percent;
  const rfm = readings.find((r) => r.method.id === 'rfm').percent;
  const plainMean = readings.filter((r) => r.ready).reduce((sum, r) => sum + r.percent, 0) / readings.length;
  assert.notEqual(pooled.percent, plainMean, 'inverse-variance weighting is not a plain mean');
  // Whatever the weighting, the answer stays inside the range of its inputs.
  const values = readings.filter((r) => r.ready).map((r) => r.percent);
  assert.ok(pooled.percent >= Math.min(...values) && pooled.percent <= Math.max(...values));
  assert.ok(Number.isFinite(navy) && Number.isFinite(rfm));
});

test('with nothing measured there is no reading at all', () => {
  const result = estimate({});
  assert.equal(result.pooled, null);
  assert.equal(result.confidence, 0);
  assert.ok(result.readings.every((reading) => !reading.ready));
});

test('one method alone cannot reach high confidence', () => {
  const single = estimate({ sex: 'male', height: 180, waist: 88 });
  const usable = single.readings.filter((r) => r.ready);
  assert.equal(usable.length, 1, 'only RFM should run on height and waist');
  assert.ok(single.confidence <= 0.65, `a single method reached ${single.confidence}`);
  assert.ok(single.confidence > 0);
});

test('confidence is bounded and never certain', () => {
  for (const spread of [0, 1, 3, 8, 20]) {
    for (const count of [1, 2, 3, 4]) {
      const value = confidence(new Array(count).fill({ method: { see: 4 } }), spread);
      assert.ok(value > 0 && value <= 0.92, `confidence ${value} out of bounds`);
    }
  }
  assert.equal(confidence([], 0), 0);
});

test('an equation pushed outside its range reports nothing rather than a number', () => {
  // A waist barely larger than the neck sends the Navy logarithm to a
  // nonsensical figure; it must be withheld, not printed.
  const result = estimate({ ...MAN, neck: 38, waist: 38.2 });
  const navy = result.readings.find((reading) => reading.method.id === 'navy');
  assert.equal(navy.ready, false);
  assert.equal(navy.percent, null);
  assert.equal(navy.outOfRange, true);
});

test('fat and lean mass sum back to body weight', () => {
  const split = composition(20, 82);
  assert.ok(Math.abs(split.fat - 16.4) < 1e-9);
  assert.ok(Math.abs(split.fat + split.lean - 82) < 1e-9);
  assert.equal(composition(20, 0), null);
  assert.equal(composition(NaN, 82), null);
});

/* ------------------------------------------------------------------ bands */

test('descriptive bands ascend and cover every figure', () => {
  for (const sex of ['male', 'female']) {
    let last = -1;
    for (const entry of BANDS[sex]) {
      assert.ok(entry.max > last, `${sex} bands are not ascending`);
      last = entry.max;
    }
    assert.equal(BANDS[sex][BANDS[sex].length - 1].max, Infinity, 'the top band must be open');
    for (const percent of [2, 9, 16, 22, 30, 48]) {
      assert.ok(describeBand(percent, sex), `${percent}% fell through the ${sex} ladder`);
    }
  }
  assert.equal(describeBand(NaN, 'male'), null);
});

test('an error bar that straddles a boundary touches more than one band', () => {
  // The point of the deck: 18.1% ± 3.7 is not "fitness range", it is three
  // bands at once.
  const touched = bandsTouched({ low: 13.5, high: 21.2 }, 'male');
  assert.ok(touched.length >= 3, `expected an ambiguous reading, got ${touched.map((b) => b.id).join(', ')}`);
  // A tight band well inside one range touches only that one.
  const tight = bandsTouched({ low: 15.5, high: 17.0 }, 'male');
  assert.equal(tight.length, 1);
  assert.equal(tight[0].id, 'fitness');
});

/* --------------------------------------------------------------- tracking */

test('the change threshold comes from repeatability, not estimate error', () => {
  for (const entry of METHODS) {
    const threshold = changeThreshold(entry);
    assert.ok(Math.abs(threshold - 1.96 * entry.tem * Math.SQRT2) < 1e-9);
    assert.ok(threshold < entry.see * 1.96 * Math.SQRT2,
      `${entry.id} would be unable to detect any change if it used its estimate error`);
  }
});

test('a small change within one method is called noise, honestly', () => {
  const result = compareReadings({ percent: 20.0, methodId: 'navy' }, { percent: 18.8, methodId: 'navy' });
  assert.equal(result.real, false);
  assert.equal(result.sameMethod, true);
  assert.ok(Math.abs(result.delta + 1.2) < 1e-9);
  assert.match(result.reason, /not yet distinguishable from measurement noise/);
});

test('a large change within one method is called real', () => {
  const result = compareReadings({ percent: 26.0, methodId: 'navy' }, { percent: 20.0, methodId: 'navy' });
  assert.equal(result.real, true);
  assert.match(result.reason, /exceeds this method's/);
});

test('comparing across methods is governed by the much larger estimate error', () => {
  const across = compareReadings({ percent: 24.0, methodId: 'deurenberg' }, { percent: 20.0, methodId: 'navy' });
  assert.equal(across.sameMethod, false);
  const within = compareReadings({ percent: 24.0, methodId: 'navy' }, { percent: 20.0, methodId: 'navy' });
  assert.ok(across.threshold > within.threshold * 2,
    'switching method must cost far more than repeating one');
  assert.equal(across.real, false, 'a 4-point cross-method difference is not evidence of anything');
  assert.match(across.reason, /Compare like with like/);
});

test('a trend needs two readings and reports the span in days', () => {
  const day = 86400000;
  assert.equal(trend([]), null);
  assert.equal(trend([{ at: 0, percent: 20, methodId: 'navy' }]), null);
  const result = trend([
    { at: 60 * day, percent: 19.2, methodId: 'navy' },
    { at: 0, percent: 25.0, methodId: 'navy' },
    { at: 30 * day, percent: 22.0, methodId: 'navy' },
  ]);
  assert.equal(result.count, 3);
  assert.equal(result.span, 60);
  assert.ok(Math.abs(result.change + 5.8) < 1e-9, 'the trend must run first to last, in order');
  assert.equal(result.real, true);
});

/* ---------------------------------------------------------------- framing */

/**
 * Build a frame of a given luminance, optionally lit from one side.
 *
 * @param {number} level Base luminance in [0, 1].
 * @param {number} [sideBias] Extra luminance added across the left half.
 * @param {number} [noise] Per-pixel variation, which becomes contrast.
 * @returns {ImageData} A frame-shaped object.
 */
function frame(level, sideBias = 0, noise = 0) {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const x = i % width;
    const bias = x < width / 2 ? sideBias : 0;
    const wobble = noise * ((i % 2) ? 1 : -1);
    const value = Math.max(0, Math.min(255, (level + bias + wobble) * 255));
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

test('a dark frame is reported as unusable', () => {
  const quality = frameQuality(frame(0.05, 0, 0.02));
  assert.equal(quality.ok, false);
  assert.ok(quality.notes.some((note) => /Too dark/.test(note)));
});

test('a blown-out frame is reported as unusable', () => {
  assert.ok(frameQuality(frame(0.95, 0, 0.02)).notes.some((note) => /Blown out/.test(note)));
});

test('side lighting is caught, because it is what breaks comparability', () => {
  const quality = frameQuality(frame(0.4, 0.45, 0.1));
  assert.ok(quality.evenness < 0.45, `evenness ${quality.evenness} should be poor`);
  assert.ok(quality.notes.some((note) => /one side/.test(note)));
  assert.equal(quality.ok, false);
});

test('a flat frame with no subject separation is caught', () => {
  assert.ok(frameQuality(frame(0.45, 0, 0)).notes.some((note) => /Very flat/.test(note)));
});

test('an evenly lit frame with detail passes, and says what to remember', () => {
  const quality = frameQuality(frame(0.45, 0, 0.15));
  assert.equal(quality.ok, true);
  assert.equal(quality.notes.length, 1);
  assert.match(quality.notes[0], /next one matches/);
});

test('no frame yields no verdict', () => {
  assert.equal(frameQuality(null), null);
  assert.equal(frameQuality({ data: null, width: 0 }), null);
});

/* ----------------------------------------------------------------- levers */

test('every lever carries a tier the evidence module recognises', () => {
  const ids = new Set(TIERS.map((entry) => entry.id));
  for (const lever of LEVERS) {
    assert.ok(ids.has(lever.tier), `${lever.id} claims unknown tier ${lever.tier}`);
    assert.ok(tier(lever.tier).label);
    assert.ok(lever.finding.length > 60, `${lever.id} has no substance`);
    assert.ok(lever.caveat.length > 40, `${lever.id} has no caveat`);
    assert.ok(lever.search, `${lever.id} cannot be looked up`);
  }
});

test('a lever that names a compound names one the library actually holds', () => {
  const known = new Set(PEPTIDES.map((entry) => entry.id));
  for (const lever of LEVERS.filter((entry) => entry.compound)) {
    assert.ok(known.has(lever.compound), `${lever.id} links to missing compound ${lever.compound}`);
  }
});

test('no lever tells the reader what to do', () => {
  // The governing constraint of the whole platform, enforced on the one deck
  // most likely to drift into advice.
  const imperatives = /\b(you should|you must|aim for|your target|we recommend|recommended (dose|intake|protocol)|increase your|reduce your|start taking|stop taking)\b/i;
  for (const lever of LEVERS) {
    for (const field of ['title', 'finding', 'caveat']) {
      assert.ok(!imperatives.test(lever[field]),
        `${lever.id}.${field} reads as advice: "${lever[field]}"`);
    }
  }
});

test('the fields the deck collects all have a sane range', () => {
  for (const field of FIELDS) {
    assert.ok(field.min < field.max, `${field.id} has an impossible range`);
    assert.ok(field.unit && field.label, `${field.id} is unlabelled`);
  }
  // Every input any method asks for must be collectable.
  const collectable = new Set([...FIELDS.map((field) => field.id), 'sex']);
  for (const entry of METHODS) {
    for (const need of [...entry.needs, ...(entry.needsFemale || [])]) {
      assert.ok(collectable.has(need), `${entry.id} needs uncollectable "${need}"`);
    }
  }
});

test('every method documents its limits and its source', () => {
  for (const entry of METHODS) {
    assert.ok(entry.limits.length >= 3, `${entry.id} lists too few limits`);
    assert.match(entry.source, /\d{4}/, `${entry.id} has no dated source`);
    assert.ok(entry.see > 0 && entry.tem > 0);
    assert.ok(entry.tem < entry.see, `${entry.id} claims worse repeatability than accuracy`);
  }
});
