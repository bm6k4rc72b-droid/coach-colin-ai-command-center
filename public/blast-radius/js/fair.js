/**
 * Quantitative risk: Monte Carlo over loss distributions.
 *
 * A red square on a heat map cannot be compared to a salary, a project, or
 * another red square, so it cannot be used to decide anything. This module does
 * what a finance team would recognise instead: model how often a loss event
 * happens and how big it is, sample the pair a few tens of thousands of times,
 * and report the distribution — including the tail, which is the part the board
 * is actually buying insurance against.
 *
 * The shape follows FAIR: annualised loss expectancy is loss event frequency
 * times loss magnitude, both uncertain, both expressed as ranges an engineer
 * can defend in a room rather than point estimates nobody believes.
 *
 * Every simulation is seeded, so the number in a report is reproducible by
 * whoever reads it. An unreproducible risk number is an opinion with a currency
 * symbol in front of it.
 *
 * @module blast-radius/fair
 */

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * @param {number} seed Integer seed.
 * @returns {() => number} Generator returning values in [0, 1).
 */
export function rng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a standard normal variate (Box–Muller).
 *
 * @param {() => number} random Uniform source.
 * @returns {number} Standard normal sample.
 */
export function standardNormal(random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Sample a lognormal loss magnitude from a 90% confidence interval.
 *
 * Estimators are far better at "I am 90% sure it lands between £2M and £40M"
 * than at naming a mean, and losses are right-skewed, so the interval is fitted
 * to a lognormal rather than a normal.
 *
 * @param {() => number} random Uniform source.
 * @param {number} low 5th-percentile estimate.
 * @param {number} high 95th-percentile estimate.
 * @returns {number} One sampled magnitude.
 */
export function sampleLognormal(random, low, high) {
  const safeLow = Math.max(1, low);
  const safeHigh = Math.max(safeLow * 1.0001, high);
  const mu = (Math.log(safeLow) + Math.log(safeHigh)) / 2;
  const sigma = (Math.log(safeHigh) - Math.log(safeLow)) / (2 * 1.6448536269514722);
  return Math.exp(mu + (sigma * standardNormal(random)));
}

/**
 * Sample a gamma variate (Marsaglia–Tsang), used to build beta variates.
 *
 * @param {() => number} random Uniform source.
 * @param {number} shape Shape parameter, > 0.
 * @returns {number} Gamma sample with scale 1.
 */
export function sampleGamma(random, shape) {
  if (shape < 1) {
    return sampleGamma(random, shape + 1) * Math.pow(random() || Number.EPSILON, 1 / shape);
  }
  const d = shape - (1 / 3);
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = standardNormal(random);
    const v = Math.pow(1 + (c * x), 3);
    if (v <= 0) continue;
    const u = random();
    if (u < 1 - (0.0331 * x * x * x * x)) return d * v;
    if (Math.log(u) < (0.5 * x * x) + (d * (1 - v + Math.log(v)))) return d * v;
  }
}

/**
 * Sample a PERT-distributed frequency from a three-point estimate.
 *
 * PERT weights the most-likely value four times as heavily as the extremes,
 * which matches how engineers actually estimate: confident about the middle,
 * vague about the ends.
 *
 * @param {() => number} random Uniform source.
 * @param {number} min Lowest plausible events per year.
 * @param {number} mode Most likely events per year.
 * @param {number} max Highest plausible events per year.
 * @returns {number} One sampled frequency.
 */
export function samplePert(random, min, mode, max) {
  if (max <= min) return min;
  const clampedMode = Math.min(Math.max(mode, min), max);
  const mean = (min + (4 * clampedMode) + max) / 6;
  const range = max - min;
  let alpha = ((mean - min) / range) * 6;
  let beta = ((max - mean) / range) * 6;
  alpha = Math.max(alpha, 0.05);
  beta = Math.max(beta, 0.05);
  const x = sampleGamma(random, alpha);
  const y = sampleGamma(random, beta);
  return min + (range * (x / (x + y)));
}

/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} name
 * @property {string} narrative One paragraph an executive can read aloud.
 * @property {{min: number, mode: number, max: number}} frequency Loss events
 *   per year.
 * @property {{low: number, high: number}} magnitude 90% interval for the loss
 *   of a single event, in currency units.
 * @property {string[]} [basis] Where the estimates came from.
 * @property {string[]} [controls] Control ids that bear on this scenario.
 */

/**
 * @typedef {object} SimulationResult
 * @property {string} id
 * @property {string} name
 * @property {number[]} losses Annual loss per simulated year, ascending.
 * @property {number} mean Annualised loss expectancy.
 * @property {number} median
 * @property {number} p90
 * @property {number} p95
 * @property {number} p99
 * @property {number} max
 * @property {number} probabilityOfAnyLoss Share of years with a loss event.
 */

/**
 * Simulate one scenario.
 *
 * @param {Scenario} scenario Scenario to simulate.
 * @param {number} [iterations] Simulated years.
 * @param {number} [seed] Seed, so the run is reproducible.
 * @returns {SimulationResult} Distribution and its summary statistics.
 */
export function simulate(scenario, iterations = 20_000, seed = 20260101) {
  const random = rng(seed);
  const losses = new Array(iterations);
  let lossYears = 0;

  for (let index = 0; index < iterations; index += 1) {
    const frequency = samplePert(random, scenario.frequency.min, scenario.frequency.mode, scenario.frequency.max);
    const events = poisson(random, frequency);
    let total = 0;
    for (let event = 0; event < events; event += 1) {
      total += sampleLognormal(random, scenario.magnitude.low, scenario.magnitude.high);
    }
    if (total > 0) lossYears += 1;
    losses[index] = total;
  }

  losses.sort((a, b) => a - b);
  return {
    id: scenario.id,
    name: scenario.name,
    losses,
    mean: losses.reduce((sum, value) => sum + value, 0) / iterations,
    median: percentile(losses, 0.5),
    p90: percentile(losses, 0.9),
    p95: percentile(losses, 0.95),
    p99: percentile(losses, 0.99),
    max: losses[losses.length - 1],
    probabilityOfAnyLoss: lossYears / iterations,
  };
}

/**
 * Draw a Poisson count for a given rate (Knuth, adequate for these rates).
 *
 * @param {() => number} random Uniform source.
 * @param {number} rate Expected events per year.
 * @returns {number} Event count for one year.
 */
export function poisson(random, rate) {
  if (rate <= 0) return 0;
  if (rate > 30) return Math.max(0, Math.round(rate + (Math.sqrt(rate) * standardNormal(random))));
  const limit = Math.exp(-rate);
  let count = 0;
  let product = random();
  while (product > limit) {
    count += 1;
    product *= random();
  }
  return count;
}

/**
 * Read a percentile off a sorted array.
 *
 * @param {number[]} sorted Ascending values.
 * @param {number} fraction Percentile in [0, 1].
 * @returns {number} The value at that percentile.
 */
export function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))));
  return sorted[index];
}

/**
 * Build a loss exceedance curve: the probability that a year's loss exceeds
 * each level.
 *
 * This is the one chart worth putting in front of a board. It answers "what is
 * the chance we lose more than X this year" for every X, and a control is
 * justified by how far it pulls the curve left.
 *
 * The axis is truncated at a high quantile rather than at the worst simulated
 * year. One 1-in-20,000 outlier would otherwise compress every decision-
 * relevant loss into the left few percent of the chart, which is how a curve
 * ends up looking reassuring.
 *
 * @param {number[]} sortedLosses Ascending annual losses.
 * @param {number} [points] Number of curve points.
 * @param {number} [cap] Quantile at which to truncate the loss axis.
 * @returns {Array<{loss: number, probability: number}>} Curve, ascending in loss.
 */
export function exceedanceCurve(sortedLosses, points = 60, cap = 0.995) {
  const curve = [];
  const maximum = percentile(sortedLosses, cap);
  if (maximum <= 0) return [{ loss: 0, probability: 0 }];
  for (let step = 0; step <= points; step += 1) {
    const loss = (maximum * step) / points;
    const firstAbove = upperBound(sortedLosses, loss);
    curve.push({ loss, probability: (sortedLosses.length - firstAbove) / sortedLosses.length });
  }
  return curve;
}

/**
 * Index of the first element strictly greater than a value.
 *
 * Strictly greater, not greater-or-equal: the curve reports the probability of
 * *exceeding* each level, so at zero it reads the probability of any loss at
 * all rather than a meaningless 100%.
 *
 * @param {number[]} sorted Ascending values.
 * @param {number} value Threshold.
 * @returns {number} Insertion index.
 */
function upperBound(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid] <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Aggregate scenarios into one portfolio distribution.
 *
 * Adding the means of several scenarios understates the tail, because a bad
 * year is one in which more than one thing goes wrong. Summing per simulated
 * year keeps that correlation-free but additive tail intact.
 *
 * @param {Scenario[]} scenarios Scenarios to combine.
 * @param {number} [iterations] Simulated years.
 * @param {number} [seed] Base seed; each scenario is offset from it.
 * @returns {SimulationResult} Portfolio-level distribution.
 */
export function aggregate(scenarios, iterations = 20_000, seed = 20260101) {
  const runs = scenarios.map((scenario, index) => simulate(scenario, iterations, seed + (index * 7919)));
  const totals = new Array(iterations).fill(0);
  for (const run of runs) {
    // Each run is sorted, so re-draw the unsorted pairing by shuffling deterministically.
    for (let index = 0; index < iterations; index += 1) {
      totals[index] += run.losses[(index * 2654435761) % iterations];
    }
  }
  totals.sort((a, b) => a - b);
  return {
    id: 'portfolio',
    name: 'All scenarios',
    losses: totals,
    mean: totals.reduce((sum, value) => sum + value, 0) / iterations,
    median: percentile(totals, 0.5),
    p90: percentile(totals, 0.9),
    p95: percentile(totals, 0.95),
    p99: percentile(totals, 0.99),
    max: totals[totals.length - 1],
    probabilityOfAnyLoss: totals.filter((value) => value > 0).length / iterations,
  };
}

/**
 * @typedef {object} ControlEffect
 * @property {string} control Control id.
 * @property {string} scenario Scenario id.
 * @property {number} [frequencyMultiplier] Factor applied to event frequency.
 * @property {number} [magnitudeMultiplier] Factor applied to loss magnitude.
 * @property {string} justification Why the factor is what it is.
 */

/**
 * Apply control effects to a scenario.
 *
 * @param {Scenario} scenario Baseline scenario.
 * @param {ControlEffect[]} effects Effects that apply to it.
 * @returns {Scenario} Residual scenario after the controls.
 */
export function applyEffects(scenario, effects) {
  const relevant = effects.filter((effect) => effect.scenario === scenario.id);
  const frequencyFactor = relevant.reduce((product, effect) => product * (effect.frequencyMultiplier ?? 1), 1);
  const magnitudeFactor = relevant.reduce((product, effect) => product * (effect.magnitudeMultiplier ?? 1), 1);
  return {
    ...scenario,
    frequency: {
      min: scenario.frequency.min * frequencyFactor,
      mode: scenario.frequency.mode * frequencyFactor,
      max: scenario.frequency.max * frequencyFactor,
    },
    magnitude: {
      low: scenario.magnitude.low * magnitudeFactor,
      high: scenario.magnitude.high * magnitudeFactor,
    },
  };
}

/**
 * Rank controls by risk reduced per unit of spend.
 *
 * The ranking, not the absolute numbers, is the durable output: estimates move,
 * but "this £8k guardrail beats that £90k approval queue" survives being wrong
 * about the inputs by a factor of two.
 *
 * @param {Scenario[]} scenarios Baseline scenarios.
 * @param {Array<{id: string, name: string, annualCost: number}>} controls
 *   Candidate controls.
 * @param {ControlEffect[]} effects Effect table linking controls to scenarios.
 * @param {number} [iterations] Simulated years per run.
 * @param {number} [seed] Base seed.
 * @returns {Array<{id: string, name: string, cost: number, reduction: number,
 *   residual: number, roi: number, tailReduction: number}>} Controls, best
 *   return first.
 */
export function rankByRoi(scenarios, controls, effects, iterations = 8_000, seed = 20260101) {
  const baseline = aggregate(scenarios, iterations, seed);
  return controls.map((control) => {
    const controlEffects = effects.filter((effect) => effect.control === control.id);
    const residualScenarios = scenarios.map((scenario) => applyEffects(scenario, controlEffects));
    const residual = aggregate(residualScenarios, iterations, seed);
    const reduction = baseline.mean - residual.mean;
    return {
      id: control.id,
      name: control.name,
      cost: control.annualCost,
      reduction,
      residual: residual.mean,
      tailReduction: baseline.p95 - residual.p95,
      roi: control.annualCost > 0 ? reduction / control.annualCost : Infinity,
    };
  }).sort((a, b) => b.roi - a.roi);
}

/**
 * Format a currency amount the way it should appear in a report: rounded to a
 * precision the estimate can actually support.
 *
 * Writing £3,417,882 for a number derived from a 90% interval spanning an order
 * of magnitude is a lie told with significant figures.
 *
 * @param {number} amount Amount in currency units.
 * @param {string} [symbol] Currency symbol.
 * @returns {string} Human-readable amount.
 */
export function formatMoney(amount, symbol = '$') {
  const absolute = Math.abs(amount);
  if (absolute >= 1_000_000_000) return `${symbol}${(amount / 1_000_000_000).toFixed(1)}bn`;
  if (absolute >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  if (absolute >= 1_000) return `${symbol}${Math.round(amount / 1_000)}k`;
  return `${symbol}${Math.round(amount)}`;
}
