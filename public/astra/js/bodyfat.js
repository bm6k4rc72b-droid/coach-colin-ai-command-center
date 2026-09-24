/**
 * ASTRA — body-composition assessment.
 *
 * This deck exists because body composition is the one number in this whole
 * subject area that readers most want, most often see faked, and least often
 * see with an error bar on it. So it is built the same way as the rest of the
 * facility: a reading, the design that produced it, and the honest width of
 * what that design can know.
 *
 * Three decisions shape the module, and they are worth stating because each
 * one rules out something the reader might expect:
 *
 * - **The camera does not estimate body fat.** There is no published,
 *   validated equation that turns a phone photograph into a body-fat
 *   percentage, so this module does not pretend to have one. Every number
 *   here comes from a peer-reviewed anthropometric equation fed by
 *   measurements the reader takes. The camera's job is framing, lighting and
 *   a comparable progress photo — a real job, honestly described.
 * - **Every method reports its own error.** Each equation carries the
 *   standard error of estimate its validation study published, and the
 *   reading is shown as a band, never a point. Two methods run on the same
 *   measurements will disagree by several points; that disagreement is the
 *   lesson, not a bug to average away.
 * - **Accuracy and repeatability are different numbers.** How wrong your
 *   absolute figure is (large) and how small a change the method can detect
 *   (much smaller) are separate quantities, because the part of the error
 *   that is systematic for a given body cancels when you subtract two
 *   readings. Conflating them is why people believe a tape measure cannot
 *   track progress, and why others believe their 19.2% is a real 19.2%.
 *
 * Nothing here diagnoses, prescribes or plans. `LEVERS` reports what the
 * literature found in populations, tiered and cited like every other claim in
 * the facility, and stops there.
 *
 * @module astra/bodyfat
 */

import { tier } from './evidence.js';

/* --------------------------------------------------------------- equations */

/**
 * Base-10 logarithm, named for the equations that are written with it.
 *
 * @param {number} value A positive number.
 * @returns {number} log10.
 */
const log10 = (value) => Math.log(value) / Math.LN10;

/**
 * The Siri two-compartment conversion from body density to fat percentage.
 *
 * @param {number} density Body density in g/cm³.
 * @returns {number} Per cent body fat.
 */
const siri = (density) => (495 / density) - 450;

/**
 * Body mass index.
 *
 * @param {{ weight: number, height: number }} m Weight in kg, height in cm.
 * @returns {number|null} BMI, or null if either input is missing.
 */
export function bmi({ weight, height }) {
  if (!weight || !height) return null;
  return weight / ((height / 100) ** 2);
}

/**
 * The estimators.
 *
 * Each one is a published equation with a published validation. `see` is the
 * standard error of estimate that validation reported against its criterion
 * method — how far a single reading typically sits from a DXA or hydrostatic
 * measurement of the same body. `tem` is the technical error of measurement:
 * how much the same method drifts on the same body between two sittings, which
 * is a much smaller number and the one that governs whether a change is real.
 *
 * Every one of these is a cross-sectional validation against a criterion, so
 * every one sits at `human-observational`. None of them is a trial, and none
 * of them should be read as one.
 *
 * @type {Array<object>}
 */
export const METHODS = [
  {
    id: 'navy',
    name: 'Circumference (US Navy)',
    short: 'Navy',
    needs: ['sex', 'height', 'neck', 'waist'],
    needsFemale: ['hip'],
    tier: 'human-observational',
    see: 3.7,
    tem: 1.2,
    source: 'Hodgdon & Beckett, Naval Health Research Center, 1984',
    search: 'Hodgdon Beckett body fat circumference equation Navy',
    blurb: 'Neck, waist and height (plus hip for women), through a logarithmic equation fitted against hydrostatic weighing.',
    limits: [
      'Fitted on a US military sample — leaner and younger than the general population, so it drifts at higher body fat.',
      'A tape measure reads girth, not tissue. A thick neck or a bloated abdomen moves the answer without any fat changing.',
      'Tape placement is the dominant error. A centimetre at the waist is worth roughly a point of body fat.',
    ],
    /**
     * @param {object} m Measurements.
     * @returns {number} Per cent body fat.
     */
    estimate(m) {
      if (m.sex === 'female') {
        return 495 / (1.29579 - 0.35004 * log10(m.waist + m.hip - m.neck) + 0.22100 * log10(m.height)) - 450;
      }
      return 495 / (1.0324 - 0.19077 * log10(m.waist - m.neck) + 0.15456 * log10(m.height)) - 450;
    },
  },
  {
    id: 'rfm',
    name: 'Relative Fat Mass',
    short: 'RFM',
    needs: ['sex', 'height', 'waist'],
    tier: 'human-observational',
    see: 5.2,
    tem: 1.1,
    source: 'Woolcott & Bergman, Scientific Reports, 2018',
    search: 'Woolcott Bergman relative fat mass RFM NHANES DXA',
    blurb: 'Height-to-waist ratio alone, developed against DXA in a NHANES sample of over twelve thousand adults.',
    limits: [
      'Two measurements only, so it is the crudest estimator here — but it was validated on a large, genuinely general-population sample rather than a fit cohort.',
      'Less biased than BMI across body sizes, which is the claim it was built to make. That is a lower bar than being accurate.',
      'Carries no information about where fat sits, or about muscle at all.',
    ],
    /**
     * @param {object} m Measurements.
     * @returns {number} Per cent body fat.
     */
    estimate(m) {
      return (m.sex === 'female' ? 76 : 64) - 20 * (m.height / m.waist);
    },
  },
  {
    id: 'deurenberg',
    name: 'BMI-based (Deurenberg)',
    short: 'BMI',
    needs: ['sex', 'age', 'weight', 'height'],
    tier: 'human-observational',
    see: 4.1,
    tem: 0.6,
    source: 'Deurenberg, Weststrate & Seidell, British Journal of Nutrition, 1991',
    search: 'Deurenberg body mass index body fat percentage prediction 1991',
    blurb: 'Weight, height, age and sex — the weakest inputs, and the one estimator that needs no tape at all.',
    limits: [
      'BMI cannot distinguish muscle from fat, so this equation misreads muscular bodies badly in one direction and sedentary ones in the other.',
      'Derived in a Dutch sample; the BMI-to-fat relationship differs by ancestry, and the equation does not know that.',
      'Its repeatability is excellent and its accuracy is not. A stable wrong number is still wrong.',
    ],
    /**
     * @param {object} m Measurements.
     * @returns {number} Per cent body fat.
     */
    estimate(m) {
      return 1.20 * bmi(m) + 0.23 * m.age - 10.8 * (m.sex === 'female' ? 0 : 1) - 5.4;
    },
  },
  {
    id: 'jp3',
    name: 'Skinfold (Jackson–Pollock 3-site)',
    short: 'Skinfold',
    needs: ['sex', 'age', 'fold1', 'fold2', 'fold3'],
    tier: 'human-observational',
    see: 3.5,
    tem: 1.8,
    source: 'Jackson & Pollock 1978; Jackson, Pollock & Ward 1980',
    search: 'Jackson Pollock three site skinfold generalized equation body density',
    blurb: 'Three caliper sites — chest, abdomen and thigh for men; triceps, suprailiac and thigh for women — through a body-density equation and the Siri conversion.',
    limits: [
      'The published standard error assumes a trained measurer. Self-measured folds are considerably worse, and the error here is written for that case.',
      'Measures subcutaneous fat at three points and infers the whole body, including visceral fat it never touches.',
      'Caliper pressure, pinch depth and exact site all move the reading, and they move it the same way each time you make the same mistake.',
    ],
    /**
     * @param {object} m Measurements.
     * @returns {number} Per cent body fat.
     */
    estimate(m) {
      const sum = m.fold1 + m.fold2 + m.fold3;
      const density = m.sex === 'female'
        ? 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * m.age
        : 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * m.age;
      return siri(density);
    },
  },
];

/** Method lookup by id. */
const METHOD_BY_ID = new Map(METHODS.map((method) => [method.id, method]));

/**
 * A method by id.
 *
 * @param {string} id Method id.
 * @returns {object|null} The method.
 */
export function method(id) {
  return METHOD_BY_ID.get(id) || null;
}

/* ------------------------------------------------------------ measurements */

/** The measurements the deck can collect, with the range each one may occupy. */
export const FIELDS = [
  { id: 'age', label: 'Age', unit: 'years', min: 14, max: 99, step: 1 },
  { id: 'height', label: 'Height', unit: 'cm', min: 120, max: 230, step: 0.5 },
  { id: 'weight', label: 'Weight', unit: 'kg', min: 30, max: 250, step: 0.1 },
  { id: 'neck', label: 'Neck', unit: 'cm', min: 20, max: 70, step: 0.1, hint: 'Below the larynx, tape sloping slightly down at the front.' },
  { id: 'waist', label: 'Waist', unit: 'cm', min: 45, max: 200, step: 0.1, hint: 'At the navel for men, at the narrowest point for women. Relaxed, at the end of a normal breath out.' },
  { id: 'hip', label: 'Hip', unit: 'cm', min: 50, max: 200, step: 0.1, hint: 'The widest point of the buttocks. Needed for the Navy equation in women.' },
  { id: 'fold1', label: 'Skinfold 1', unit: 'mm', min: 2, max: 60, step: 0.5, hint: 'Chest (men) / triceps (women).' },
  { id: 'fold2', label: 'Skinfold 2', unit: 'mm', min: 2, max: 60, step: 0.5, hint: 'Abdomen (men) / suprailiac (women).' },
  { id: 'fold3', label: 'Skinfold 3', unit: 'mm', min: 2, max: 60, step: 0.5, hint: 'Thigh, front midpoint, both sexes.' },
];

/** Field lookup by id. */
const FIELD_BY_ID = new Map(FIELDS.map((field) => [field.id, field]));

/**
 * Whether a set of measurements can feed a method.
 *
 * @param {object} method A method.
 * @param {object} m Measurements.
 * @returns {{ ready: boolean, missing: string[] }} Readiness and what is absent.
 */
export function readiness(method, m = {}) {
  const needed = [...method.needs, ...(m.sex === 'female' ? (method.needsFemale || []) : [])];
  const missing = needed.filter((key) => {
    if (key === 'sex') return m.sex !== 'male' && m.sex !== 'female';
    return !Number.isFinite(m[key]) || m[key] <= 0;
  });
  return { ready: missing.length === 0, missing };
}

/**
 * Check measurements against their plausible ranges.
 *
 * Out-of-range input is refused rather than silently estimated from, because
 * a confident body-fat percentage computed from a mistyped waist is exactly
 * the sort of authoritative-looking nonsense this platform exists to argue
 * against.
 *
 * @param {object} m Measurements.
 * @returns {Array<{ field: string, label: string, message: string }>} Problems.
 */
export function validate(m = {}) {
  const problems = [];
  for (const [key, value] of Object.entries(m)) {
    const field = FIELD_BY_ID.get(key);
    if (!field || value === null || value === undefined || value === '') continue;
    if (!Number.isFinite(value)) {
      problems.push({ field: key, label: field.label, message: 'is not a number' });
    } else if (value < field.min || value > field.max) {
      problems.push({
        field: key,
        label: field.label,
        message: `is outside ${field.min}–${field.max} ${field.unit}`,
      });
    }
  }
  if (Number.isFinite(m.neck) && Number.isFinite(m.waist) && m.waist <= m.neck) {
    problems.push({ field: 'waist', label: 'Waist', message: 'is not larger than the neck, which the Navy equation cannot solve' });
  }
  return problems;
}

/* --------------------------------------------------------------- estimating */

/**
 * Run every method the measurements can feed.
 *
 * The result deliberately keeps the methods apart. There is a pooled figure,
 * because readers want one number and will compute a worse one themselves if
 * the module refuses — but it is reported with the spread beside it, and the
 * spread is usually the more informative of the two.
 *
 * @param {object} m Measurements, including `sex`.
 * @returns {object} `{ readings, pooled, spread, confidence, problems }`.
 */
export function estimate(m = {}) {
  const problems = validate(m);
  const readings = [];
  for (const entry of METHODS) {
    const { ready, missing } = readiness(entry, m);
    if (!ready) {
      readings.push({ method: entry, ready: false, missing, percent: null });
      continue;
    }
    const percent = entry.estimate(m);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 75) {
      // An equation pushed outside the body shapes it was fitted on returns a
      // number, and the number is meaningless. Say so rather than print it.
      readings.push({ method: entry, ready: false, missing: [], percent: null, outOfRange: true });
      continue;
    }
    readings.push({
      method: entry,
      ready: true,
      missing: [],
      percent,
      low: Math.max(1, percent - entry.see),
      high: percent + entry.see,
      tier: tier(entry.tier),
    });
  }

  const usable = readings.filter((reading) => reading.ready);
  if (!usable.length) {
    return { readings, pooled: null, spread: null, confidence: 0, problems };
  }

  // Inverse-variance weighting: a method with a tighter published error gets
  // more say than one with a loose one. This is the standard way to combine
  // estimates of differing precision, and it is why the tape beats the BMI
  // equation here without anybody having to assert that it does.
  let weightSum = 0;
  let valueSum = 0;
  for (const reading of usable) {
    const weight = 1 / (reading.method.see ** 2);
    weightSum += weight;
    valueSum += reading.percent * weight;
  }
  const percent = valueSum / weightSum;
  const percents = usable.map((reading) => reading.percent);
  const spread = Math.max(...percents) - Math.min(...percents);

  // The pooled interval never claims to be tighter than the best single
  // method, and widens when the methods disagree with each other. Combining
  // estimates cannot manufacture accuracy none of them had.
  const bestSee = Math.min(...usable.map((reading) => reading.method.see));
  const margin = Math.max(bestSee, spread / 2);

  return {
    readings,
    pooled: {
      percent,
      low: Math.max(1, percent - margin),
      high: percent + margin,
      margin,
      methods: usable.length,
    },
    spread,
    confidence: confidence(usable, spread),
    problems,
  };
}

/**
 * How much weight the pooled reading deserves, in [0, 1].
 *
 * Driven by how many independent methods contributed and how far apart they
 * landed. Agreement between methods built on different inputs is real
 * evidence; agreement is also easy to fake by only running one method, which
 * is why a single reading is capped well below the top.
 *
 * @param {object[]} usable Readings that produced a number.
 * @param {number} spread Points between the highest and lowest.
 * @returns {number} Confidence in [0, 1].
 */
export function confidence(usable, spread) {
  if (!usable.length) return 0;
  const breadth = Math.min(1, (usable.length - 1) / 3);
  // Agreement decays smoothly and never bottoms out, because methods twenty
  // points apart are telling a worse story than methods ten points apart and
  // a floor would score those two cases the same. A single method has nothing
  // to agree with, so it is given a middling value it cannot improve on.
  const agreement = usable.length < 2 ? 0.5 : 1 / (1 + (spread / 4) ** 2);
  // Agreement dominates: breadth only earns credit for methods that landed in
  // the same place. Four estimators that disagree wildly are four reasons to
  // distrust the figure, not four reasons to believe it.
  return Math.max(0.05, Math.min(0.92, 0.12 + 0.55 * agreement + 0.25 * breadth * agreement));
}

/**
 * Split a body into fat and everything else.
 *
 * @param {number} percent Per cent body fat.
 * @param {number} weight Body weight in kg.
 * @returns {{ fat: number, lean: number }|null} Masses in kg.
 */
export function composition(percent, weight) {
  if (!Number.isFinite(percent) || !Number.isFinite(weight) || weight <= 0) return null;
  const fat = weight * (percent / 100);
  return { fat, lean: weight - fat };
}

/* ----------------------------------------------------------------- reading */

/**
 * Descriptive population bands.
 *
 * These describe where a figure sits in published population distributions.
 * They are not targets, health thresholds or goals, and the deck says so
 * wherever it shows them — the ranges come from fitness-industry convention
 * (ACE) rather than from outcome trials, and no trial has shown that moving
 * between two of these bands changes anything by itself.
 */
export const BANDS = {
  male: [
    { id: 'essential', label: 'Essential fat range', max: 6, note: 'At or below the fat the body uses structurally. Sustained residence here is associated with endocrine disruption.' },
    { id: 'athletic', label: 'Athletic range', max: 14, note: 'Typical of competitive athletes in lean sports.' },
    { id: 'fitness', label: 'Fitness range', max: 18, note: 'Typical of regularly active adults.' },
    { id: 'average', label: 'Population average range', max: 25, note: 'Where most adult men in survey data sit.' },
    { id: 'above', label: 'Above the survey average', max: Infinity, note: 'Above the typical range in population survey data.' },
  ],
  female: [
    { id: 'essential', label: 'Essential fat range', max: 14, note: 'At or below the fat the body uses structurally. Sustained residence here is associated with menstrual and bone consequences.' },
    { id: 'athletic', label: 'Athletic range', max: 21, note: 'Typical of competitive athletes in lean sports.' },
    { id: 'fitness', label: 'Fitness range', max: 25, note: 'Typical of regularly active adults.' },
    { id: 'average', label: 'Population average range', max: 32, note: 'Where most adult women in survey data sit.' },
    { id: 'above', label: 'Above the survey average', max: Infinity, note: 'Above the typical range in population survey data.' },
  ],
};

/**
 * Which descriptive band a figure falls in.
 *
 * @param {number} percent Per cent body fat.
 * @param {'male'|'female'} sex Which distribution to read against.
 * @returns {object|null} The band.
 */
export function describeBand(percent, sex) {
  if (!Number.isFinite(percent)) return null;
  const ladder = BANDS[sex === 'female' ? 'female' : 'male'];
  return ladder.find((entry) => percent <= entry.max) || ladder[ladder.length - 1];
}

/**
 * Whether a reading's band is ambiguous — its error bar straddles a boundary.
 *
 * A figure of 18.1% is not "fitness range"; it is a number whose error bar
 * covers three of these bands at once. Saying which band you are in, from an
 * estimate with a four-point error, is the single most common overclaim made
 * with these equations.
 *
 * @param {{ low: number, high: number }} reading A reading with an interval.
 * @param {'male'|'female'} sex Which distribution.
 * @returns {object[]} Every band the interval touches.
 */
export function bandsTouched({ low, high }, sex) {
  const ladder = BANDS[sex === 'female' ? 'female' : 'male'];
  return ladder.filter((entry, index) => {
    const floor = index === 0 ? 0 : ladder[index - 1].max;
    return high > floor && low <= entry.max;
  });
}

/* ---------------------------------------------------------------- tracking */

/**
 * The smallest change a method can distinguish from its own noise.
 *
 * This is the reliable-change index: `1.96 × TEM × √2` for the difference of
 * two measurements. It uses the technical error of measurement — repeatability
 * — and *not* the standard error of estimate, because the part of a method's
 * error that comes from the equation not fitting your particular body is
 * constant for your body and subtracts out when you compare two of your own
 * readings.
 *
 * That only holds while the method, the tape and the measurer stay the same.
 * Switch any of them and the systematic term changes, so the comparison is
 * governed by the much larger `see` instead.
 *
 * @param {object} method A method.
 * @returns {number} Points of body fat.
 */
export function changeThreshold(method) {
  return 1.96 * method.tem * Math.SQRT2;
}

/**
 * Whether a change between two readings is bigger than the measurement error.
 *
 * @param {object} earlier `{ percent, methodId }`.
 * @param {object} later `{ percent, methodId }`.
 * @returns {object} `{ delta, threshold, real, sameMethod, reason }`.
 */
export function compareReadings(earlier, later) {
  const delta = later.percent - earlier.percent;
  const sameMethod = earlier.methodId === later.methodId;
  const entry = method(later.methodId);
  if (!entry) return { delta, threshold: null, real: false, sameMethod, reason: 'Unknown method.' };
  // Across methods the systematic error no longer cancels, so the comparison
  // is governed by the estimate error of both, not by repeatability.
  const threshold = sameMethod
    ? changeThreshold(entry)
    : 1.96 * Math.hypot(entry.see, method(earlier.methodId)?.see || entry.see);
  const real = Math.abs(delta) >= threshold;
  return {
    delta,
    threshold,
    real,
    sameMethod,
    reason: sameMethod
      ? (real
        ? `A ${Math.abs(delta).toFixed(1)}-point change exceeds this method's ${threshold.toFixed(1)}-point repeatability threshold — larger than it usually drifts on its own.`
        : `A ${Math.abs(delta).toFixed(1)}-point change is inside this method's ${threshold.toFixed(1)}-point repeatability threshold. It is not yet distinguishable from measurement noise.`)
      : `These readings came from different methods, so the comparison carries both methods' estimate error — ${threshold.toFixed(1)} points before a difference means anything. Compare like with like.`,
  };
}

/**
 * Read a series of stored entries as a trend.
 *
 * @param {Array<{ at: number, percent: number, methodId: string, weight?: number }>} entries Log entries, any order.
 * @returns {object|null} `{ first, last, span, change, verdict }`.
 */
export function trend(entries = []) {
  const sorted = [...entries].filter((entry) => Number.isFinite(entry.percent)).sort((a, b) => a.at - b.at);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const comparison = compareReadings(first, last);
  return {
    first,
    last,
    count: sorted.length,
    span: Math.round((last.at - first.at) / 86400000),
    change: comparison.delta,
    ...comparison,
  };
}

/* ------------------------------------------------------------------ camera */

/**
 * Read a camera frame for whether it is a usable progress photograph.
 *
 * This is the whole of the camera's contribution, and it is worth being blunt
 * about why. A photograph cannot be turned into a body-fat percentage by any
 * method with a published validation, so nothing here tries. What a
 * photograph can do is be *comparable to the last one*, and the thing that
 * most often breaks comparability is lighting. So this measures the light.
 *
 * @param {ImageData|null} image A frame from the camera.
 * @returns {object|null} `{ luminance, contrast, evenness, ok, notes }`.
 */
export function frameQuality(image) {
  if (!image || !image.data || !image.width) return null;
  const { data, width, height } = image;
  const pixels = data.length / 4;
  let sum = 0;
  let sumSq = 0;
  // Four quadrant means, to tell flat even light from light coming hard from
  // one side — the difference between two photographs you can compare and two
  // you cannot.
  const quads = [0, 0, 0, 0];
  const quadCounts = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    sum += luma;
    sumSq += luma * luma;
    const quad = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
    quads[quad] += luma;
    quadCounts[quad] += 1;
  }
  const luminance = sum / pixels;
  const contrast = Math.sqrt(Math.max(0, sumSq / pixels - luminance * luminance));
  const means = quads.map((total, index) => (quadCounts[index] ? total / quadCounts[index] : 0));
  const evenness = 1 - Math.min(1, (Math.max(...means) - Math.min(...means)) / 0.5);

  const notes = [];
  if (luminance < 0.18) notes.push('Too dark to compare against another photograph.');
  else if (luminance > 0.82) notes.push('Blown out — detail is being lost in the highlights.');
  if (contrast < 0.08) notes.push('Very flat — the subject is not separating from the background.');
  if (evenness < 0.45) notes.push('Light is coming hard from one side, which changes apparent definition more than a month of training does.');
  if (!notes.length) notes.push('Even light and usable exposure. Note where you are standing so the next one matches.');

  return {
    luminance,
    contrast,
    evenness,
    ok: luminance >= 0.18 && luminance <= 0.82 && contrast >= 0.08 && evenness >= 0.45,
    notes,
  };
}

/* ------------------------------------------------------------------ levers */

/**
 * What the published literature reports moves body composition.
 *
 * Population-level findings, tiered and cited like every other claim in the
 * facility. Deliberately *not* a plan: each entry says what was studied, in
 * whom, and what was found, and none of them says what the reader should do.
 * Where a finding involves a compound the library covers, it links across so
 * the reader can read that compound's full evidence rather than this summary
 * of one trial.
 *
 * @type {Array<object>}
 */
export const LEVERS = [
  {
    id: 'deficit',
    title: 'Energy balance sets fat mass',
    tier: 'human-rct',
    finding: 'Controlled feeding and metabolic-ward studies consistently show fat mass tracking energy balance. No dietary composition has been shown to produce fat loss without a deficit when calories and protein are matched.',
    caveat: 'This says what changes fat mass, not what makes any particular person able to sustain a deficit — which is where the actual difficulty lives and where the trials are far weaker.',
    search: 'isocaloric diet comparison body composition metabolic ward controlled feeding',
  },
  {
    id: 'protein-resistance',
    title: 'Resistance training with higher protein attenuates lean-mass loss during a deficit',
    tier: 'human-rct',
    finding: 'Meta-analyses of randomised trials in people losing weight report that resistance training plus a higher protein intake preserves more fat-free mass than a deficit alone, shifting the composition of what is lost.',
    caveat: 'Effect sizes are modest and the trials are mostly short. "Attenuates" is the correct verb — no protocol prevents lean-mass loss in a deficit.',
    search: 'resistance training protein intake fat free mass retention energy restriction meta-analysis',
  },
  {
    id: 'sleep',
    title: 'Sleep restriction shifts weight loss toward lean tissue',
    tier: 'human-rct',
    finding: 'A randomised crossover trial in adults on an identical energy deficit found that shortened sleep reduced the fraction of weight lost as fat and increased the fraction lost as fat-free mass, with the same total loss.',
    caveat: 'A small, short, highly controlled study in a laboratory. It demonstrates the mechanism exists; it does not establish the size of the effect in ordinary life.',
    search: 'Nedeltcheva insufficient sleep undermines dietary efforts reduce adiposity',
  },
  {
    id: 'glp1',
    title: 'GLP-1 receptor agonism produces large weight loss, part of it lean mass',
    tier: 'human-rct',
    compound: 'semaglutide',
    finding: 'Body-composition substudies within the large randomised semaglutide obesity trials report substantial total weight loss, with a meaningful proportion of the loss coming from fat-free mass — proportionally similar to other means of losing that much weight.',
    caveat: 'The substudies are small relative to their parent trials and measure composition by differing methods. The compound\'s own record in this library carries the full evidence; this line is one finding from it.',
    search: 'semaglutide STEP body composition lean mass DXA substudy',
  },
  {
    id: 'incretin-dual',
    title: 'Dual incretin agonism reports larger losses again',
    tier: 'human-rct',
    compound: 'tirzepatide',
    finding: 'Randomised trials of the dual GIP/GLP-1 agonist report greater mean weight reduction than GLP-1 agonism alone, with body-composition substudies reporting a greater proportion of fat mass in what is lost.',
    caveat: 'Head-to-head composition comparisons are limited, and the trials measure different populations over different durations.',
    search: 'tirzepatide SURMOUNT body composition fat mass lean mass',
  },
  {
    id: 'method-noise',
    title: 'Changing method moves the number more than most interventions do',
    tier: 'human-observational',
    finding: 'Validation studies comparing field methods against DXA routinely find differences of several percentage points between methods measuring the same body on the same day — larger than the change many interventions produce over months.',
    caveat: 'This is the reason this deck reports a band and not a figure, and the reason a comparison between two different methods is nearly meaningless.',
    search: 'comparison field methods body composition DXA agreement Bland-Altman',
  },
];

/* ----------------------------------------------------------------- storage */

/** Where the reader's measurements live. On this device, and nowhere else. */
const KEY = 'astra.bodyfat.v1';

/**
 * Load the reader's stored measurements and log.
 *
 * Body measurements are the most personal thing this platform will ever hold,
 * so they are held the same way everything else here is: in this browser, in
 * local storage, never transmitted. There is no account and no server to send
 * them to.
 *
 * @returns {{ measures: object, log: object[], photo: string|null }} The record.
 */
export function loadRecord() {
  const empty = { measures: { sex: 'male' }, log: [], photo: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw ? { ...empty, ...raw } : empty;
  } catch {
    return empty;
  }
}

/**
 * Save the reader's record.
 *
 * @param {object} record The record.
 * @returns {boolean} Whether it was written.
 */
export function saveRecord(record) {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget everything this deck has stored.
 *
 * @returns {object} A fresh, empty record.
 */
export function clearRecord() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget if storage is unavailable.
  }
  return { measures: { sex: 'male' }, log: [], photo: null };
}
