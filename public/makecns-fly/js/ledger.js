/**
 * The scorecard — what is actually flying this thing.
 *
 * Everything else in the app is apparatus for this file. A demonstration shows
 * you one run and asks you to attribute it to the most interesting component
 * present. This module runs the same flight several times, removing one
 * component at a time, and attributes the outcome to whatever actually changes it.
 *
 * The conditions are chosen so that each one answers a specific question a
 * sceptical reader would ask, and the questions are worth stating in full:
 *
 * | Condition | The question it answers |
 * | --- | --- |
 * | `airframe-only` | Does this thing hover on its own under constant throttle? |
 * | `teacher` | How well can this airframe be flown at all? |
 * | `intact` | How well does the fitted readout on the intact network fly it? |
 * | `no-recurrence` | Does the network's recurrent activity matter, or is it a relay? |
 * | `poisson-surrogate` | Does anything beyond the firing *rate* matter? |
 * | `frozen` | Does ongoing neural activity matter at all after training? |
 * | `untrained-readout` | Does an unfitted "just wire it up" readout fly? |
 * | `hand-only` | Does the demonstration's stated sensor configuration fly? |
 *
 * Attribution is then arithmetic rather than judgement. Each component's share is
 * the performance it costs to remove, as a fraction of the total performance that
 * removing things costs. A component whose removal changes nothing gets a share
 * of zero, however many neurons it contains.
 *
 * A word on what this cannot settle. The ledger measures *this* network on *this*
 * airframe, and a synthetic connectome is not the reconstructed one. It cannot
 * prove what happened in someone else's video. What it can do is establish what
 * evidence a video would have to contain before the claim in it is worth
 * believing — the ablations above, run on the hardware, with the numbers shown.
 * None of which is expensive. That none of it is ever included is the finding.
 *
 * @module makecns-fly/ledger
 */

import { FlightLoop } from './loop.js';
import { Quadrotor } from './plant.js';

/**
 * The conditions the ledger runs, in the order it reports them.
 *
 * @type {ReadonlyArray<Readonly<object>>}
 */
export const CONDITIONS = Object.freeze([
  Object.freeze({
    id: 'airframe-only',
    label: 'Airframe alone, constant throttle',
    question: 'Does it hover on its own?',
    attributes: 'plant',
  }),
  Object.freeze({
    id: 'teacher',
    label: 'PD controller, no network',
    question: 'How well can this airframe be flown at all?',
    attributes: 'reference',
  }),
  Object.freeze({
    id: 'intact',
    label: 'Fitted readout, intact network',
    question: 'How well does the full thing fly?',
    attributes: 'reference',
  }),
  Object.freeze({
    id: 'no-recurrence',
    label: 'Recurrent connections cut at hand-off',
    question: 'Is the network computing, or relaying?',
    attributes: 'recurrence',
  }),
  Object.freeze({
    id: 'poisson-surrogate',
    label: 'Spikes replaced by rate-matched noise',
    question: 'Does anything beyond the firing rate matter?',
    attributes: 'spike-structure',
  }),
  Object.freeze({
    id: 'frozen',
    label: 'Network frozen at hand-off',
    question: 'Does ongoing activity matter after training?',
    attributes: 'network-activity',
  }),
  Object.freeze({
    id: 'untrained-readout',
    label: 'Readout weights random, never fitted',
    question: 'Does an unfitted wiring-up fly?',
    attributes: 'readout',
  }),
  Object.freeze({
    id: 'hand-only',
    label: 'Sensors as described: palm openness only',
    question: 'Does the stated configuration fly?',
    attributes: 'sensing',
  }),
]);

/** How the conditions are turned into a loop configuration. */
function configureFor(condition, base) {
  switch (condition) {
    case 'teacher':
      return { ...base, readoutMode: 'direct' };
    case 'intact':
      return { ...base, readoutMode: 'trained' };
    case 'no-recurrence':
    case 'poisson-surrogate':
    case 'frozen':
      return { ...base, readoutMode: 'trained', flightAblation: condition };
    case 'untrained-readout':
      return { ...base, readoutMode: 'fixed-random' };
    case 'hand-only':
      return { ...base, readoutMode: 'trained', sensorSet: 'hand-only' };
    default:
      return { ...base };
  }
}

/**
 * Fly the airframe with a fixed throttle and no control whatsoever.
 *
 * The baseline the whole exercise rests on. If this scored well there would be
 * nothing to explain, because the airframe would be flying itself.
 *
 * The craft is *placed* at the commanded altitude with its rotors already at a
 * trim-corrected hover, because that is the question this row has to answer:
 * left alone up there, does it stay? Launching it from the ground instead would
 * answer a different and easier question — at the nominal hover throttle an
 * untrimmed airframe is slightly underpowered, never leaves the ground, and
 * therefore never falls over, which would let this row report twenty untroubled
 * seconds and quietly imply the airframe is stable. It is not.
 *
 * @param {object} [options] Plant options and duration.
 * @returns {object} A score shaped like {@link module:makecns-fly/loop.FlightLoop#score}.
 */
export function airframeOnly(options = {}) {
  const { seconds = 15, targetZ = 1.0, plant: plantOptions = {}, seed = 1 } = options;
  const plant = new Quadrotor({ seed, ...plantOptions });
  let trim = 0;
  for (let i = 0; i < 4; i += 1) trim += plant.rotorTrim[i] / 4;
  const throttle = plant.hoverThrottle / Math.sqrt(trim);
  const command = [throttle, throttle, throttle, throttle];
  // Start it where a hovering craft would be, with the rotors already spun up.
  plant.pos.z = targetZ;
  plant.airborne = true;
  for (let i = 0; i < 4; i += 1) plant.omega[i] = throttle;
  const steps = Math.round(seconds * 1000);
  let holds = 0;
  let samples = 0;
  let errorSumSq = 0;
  let tiltSumSq = 0;
  let crashedAt = null;
  for (let i = 0; i < steps; i += 1) {
    const state = plant.step(command, 0.001);
    if (i % 5 === 0) {
      samples += 1;
      const error = state.pos.z - targetZ;
      errorSumSq += error * error;
      tiltSumSq += state.tiltRad * state.tiltRad;
      if (Math.abs(error) <= 0.25 && state.tiltRad <= 0.44 && !state.crashed) holds += 1;
    }
    // No break: the window is scored to the end, because a wreck is not holding
    // altitude and must not be excused from the samples that say so.
    if (state.crashed && crashedAt === null) crashedAt = state.t;
  }
  const n = Math.max(1, samples);
  return {
    holdFraction: holds / n,
    maxAltitudeM: plant.pos.z,
    rmsAltitudeErrorM: Math.sqrt(errorSumSq / n),
    rmsTiltDeg: Math.sqrt(tiltSumSq / n) * 57.2958,
    unsupervisedSeconds: seconds,
    survived: !plant.crashed,
    crashedAtSeconds: crashedAt,
    crashReason: plant.crashReason,
    firstSustainedHoldSeconds: null,
    supervisedSeconds: 0,
    closedLoop: false,
    samples,
  };
}

/**
 * Run one condition to completion.
 *
 * @param {string} condition Condition id from {@link CONDITIONS}.
 * @param {object} [base] Options passed through to {@link module:makecns-fly/loop.FlightLoop}.
 * @param {number} [evaluateSeconds] Unsupervised seconds to score.
 * @returns {object} The condition's score, with its loop attached for inspection.
 */
export function runCondition(condition, base = {}, evaluateSeconds = 15) {
  if (condition === 'airframe-only') {
    return { condition, ...airframeOnly({ ...base, seconds: evaluateSeconds }) };
  }
  const options = configureFor(condition, base);
  const loop = new FlightLoop(options);
  const trainSeconds = loop.decoder.mode === 'trained' ? loop.config.trainSeconds : 0;
  const total = loop.config.settleSeconds + trainSeconds + evaluateSeconds;
  const score = loop.run(total);
  return { condition, ...score };
}

/**
 * A ledger run that can be advanced in slices.
 *
 * The ledger is several complete flights, which is seconds of arithmetic. Done in
 * one call it freezes the page, and a frozen page during a measurement is how you
 * end up with a measurement nobody watched. So this hands back a stepper: the app
 * gives it a few milliseconds per animation frame and paints the progress.
 *
 * @param {object} [base] Shared loop options.
 * @param {object} [options] Runner settings, as for {@link controlAuthorityLedger}.
 * @returns {{advance: (budgetMs: number) => boolean, progress: () => object, result: () => object|null}} Stepper.
 */
export function createLedgerRun(base = {}, options = {}) {
  const { evaluateSeconds = 15 } = options;
  const list = options.only ? CONDITIONS.filter((c) => options.only.includes(c.id)) : CONDITIONS;
  const rows = [];
  let index = 0;
  let loop = null;
  let stepsLeft = 0;
  let finished = null;

  const startCondition = () => {
    const condition = list[index];
    if (condition.id === 'airframe-only') {
      rows.push({ ...condition, score: airframeOnly({ ...base, seconds: evaluateSeconds }) });
      index += 1;
      return;
    }
    loop = new FlightLoop(configureFor(condition.id, base));
    const trainSeconds = loop.decoder.mode === 'trained' ? loop.config.trainSeconds : 0;
    const total = loop.config.settleSeconds + trainSeconds + evaluateSeconds;
    stepsLeft = Math.round((total * 1000) / loop.config.dtMs);
  };

  return {
    /**
     * Do as much work as fits in the budget.
     *
     * @param {number} budgetMs Wall-clock milliseconds to spend.
     * @returns {boolean} Whether the whole ledger is now finished.
     */
    advance(budgetMs = 12) {
      const until = Date.now() + budgetMs;
      while (Date.now() < until) {
        if (finished) return true;
        if (index >= list.length) {
          finished = summarise(rows);
          return true;
        }
        if (!loop && stepsLeft === 0) {
          startCondition();
          continue;
        }
        // A slice small enough that the budget check stays responsive, large
        // enough that the check itself is not the cost.
        const slice = Math.min(stepsLeft, 250);
        for (let i = 0; i < slice; i += 1) loop.step();
        stepsLeft -= slice;
        if (stepsLeft <= 0) {
          rows.push({ ...list[index], score: loop.score() });
          loop = null;
          index += 1;
        }
      }
      return false;
    },
    /** @returns {object} How far along, for a progress bar. */
    progress() {
      return {
        done: index,
        total: list.length,
        condition: index < list.length ? list[index].label : 'complete',
        fraction: list.length ? (index + (stepsLeft ? 0.5 : 0)) / list.length : 1,
      };
    },
    /** @returns {object|null} The summary, once every condition has run. */
    result() {
      return finished;
    },
  };
}

/**
 * Run every condition and attribute the result.
 *
 * Expensive — it is a handful of complete flights — so the app runs it on demand
 * and reports progress rather than blocking the render loop.
 *
 * @param {object} [base] Shared loop options.
 * @param {object} [options] Runner settings.
 * @param {number} [options.evaluateSeconds] Unsupervised seconds per condition.
 * @param {string[]} [options.only] Restrict to these condition ids.
 * @param {(done: number, total: number, condition: string) => void} [options.onProgress] Progress callback.
 * @returns {object} Rows, attribution shares and a verdict.
 */
export function controlAuthorityLedger(base = {}, options = {}) {
  const { evaluateSeconds = 15, onProgress = null } = options;
  const list = options.only
    ? CONDITIONS.filter((c) => options.only.includes(c.id))
    : CONDITIONS;

  const rows = [];
  list.forEach((condition, index) => {
    if (onProgress) onProgress(index, list.length, condition.id);
    const score = runCondition(condition.id, base, evaluateSeconds);
    rows.push({ ...condition, score });
  });
  if (onProgress) onProgress(list.length, list.length, 'done');

  return summarise(rows);
}

/**
 * Turn condition rows into shares and a verdict.
 *
 * Kept separate from the running so that the tests can check the arithmetic
 * against fabricated rows without simulating anything.
 *
 * @param {Array<object>} rows Output rows from {@link controlAuthorityLedger}.
 * @returns {object} Rows, shares, and the sentences that go on screen.
 */
export function summarise(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const intact = byId.get('intact')?.score.holdFraction ?? 0;
  const floor = byId.get('airframe-only')?.score.holdFraction ?? 0;

  // Each ablation's cost is how much performance it removed, floored at zero:
  // an ablation that improves things has not demonstrated authority, it has
  // demonstrated that the component was in the way.
  const costs = [];
  for (const row of rows) {
    if (row.attributes === 'reference' || row.attributes === 'plant') continue;
    const cost = Math.max(0, intact - row.score.holdFraction);
    costs.push({ id: row.id, component: row.attributes, label: row.label, cost, score: row.score.holdFraction });
  }
  const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
  const shares = costs.map((c) => ({
    ...c,
    share: totalCost > 0 ? c.cost / totalCost : 0,
  }));

  const network = shares
    .filter((s) => s.component === 'recurrence' || s.component === 'spike-structure' || s.component === 'network-activity')
    .reduce((sum, s) => sum + s.share, 0);
  const readout = shares.filter((s) => s.component === 'readout').reduce((sum, s) => sum + s.share, 0);
  const sensing = shares.filter((s) => s.component === 'sensing').reduce((sum, s) => sum + s.share, 0);

  const surrogate = byId.get('poisson-surrogate')?.score.holdFraction ?? null;
  const handOnly = byId.get('hand-only')?.score;
  const teacher = byId.get('teacher')?.score.holdFraction ?? null;

  const findings = [];
  if (floor > 0.3) {
    findings.push(
      `The airframe holds ${(floor * 100).toFixed(0)}% of the time under constant throttle with nothing controlling it. On this airframe, a hover is not evidence of a controller.`,
    );
  } else {
    findings.push(
      `Under constant throttle and no control the airframe holds ${(floor * 100).toFixed(0)}% of the time${byId.get('airframe-only')?.score.crashReason ? ` and ${byId.get('airframe-only').score.crashReason}` : ''}. Anything that hovers here is being flown.`,
    );
  }
  if (surrogate !== null) {
    const retained = intact > 0 ? surrogate / intact : 0;
    findings.push(
      retained > 0.8
        ? `Replacing every spike with rate-matched noise retains ${(retained * 100).toFixed(0)}% of the performance. The network's spiking structure is not what is flying this: its firing rates alone carry the control signal.`
        : `Replacing every spike with rate-matched noise costs ${((1 - retained) * 100).toFixed(0)}% of the performance, so the network's activity is doing measurable work.`,
    );
  }
  if (handOnly) {
    findings.push(
      handOnly.holdFraction < 0.1
        ? `With palm openness as the only sensory input — the configuration the demonstration describes — the craft holds ${(handOnly.holdFraction * 100).toFixed(0)}% of the time and ${handOnly.survived ? 'never reaches the commanded altitude' : `crashes after ${handOnly.crashedAtSeconds?.toFixed(1)} s`}. No error signal reaches the network, so nothing downstream of it can correct anything.`
        : `With palm openness as the only sensory input the craft holds ${(handOnly.holdFraction * 100).toFixed(0)}% of the time, which is unexpected and worth investigating before it is believed.`,
    );
  }
  if (teacher !== null && intact > 0) {
    findings.push(
      `The eleven-line PD controller holds ${(teacher * 100).toFixed(0)}% of the time; the fitted readout on the network holds ${(intact * 100).toFixed(0)}%.`,
    );
  }

  return {
    rows,
    shares,
    totals: { network, readout, sensing },
    intactHoldFraction: intact,
    airframeHoldFraction: floor,
    findings,
    caveats: CAVEATS,
    verdict: verdictFor({ network, readout, sensing, intact }),
  };
}

/**
 * What these numbers cannot settle, printed with them rather than after them.
 *
 * The first one matters most and cuts against the app's own headline. The three
 * network ablations all change the statistics of the rates the readout was fitted
 * to, and the readout is not refitted afterwards. So part of what they measure is
 * a readout operating outside its calibration, which is not the same thing as the
 * network having computed something. A stricter experiment would refit under each
 * ablation and compare the refitted performance; this app does not do that, and
 * the network's share should be read as an upper bound rather than an estimate.
 *
 * @type {ReadonlyArray<string>}
 */
export const CAVEATS = Object.freeze([
  'The network ablations are not refitted. Cutting recurrence, scrambling spikes or freezing the pool all shift the rate statistics the readout was fitted to, so some of the measured loss is a readout out of calibration rather than a computation removed. Read the network\u2019s share as an upper bound.',
  'The ablations that are free of that confound are the sensor and readout rows, and the bare airframe. Those say what they appear to say.',
  'One seed, one network, one airframe. Hold fraction and the share of neurons that fire both move substantially with the seed, so a single run of this ledger is an anecdote. Rebuild on several seeds before believing any row.',
  'The network is generated from published summary statistics, not reconstructed. Nothing here establishes what a real connectome would do, and nothing here establishes what happened in anyone else\u2019s video.',
]);

/** One sentence naming what the measurements support. */
function verdictFor({ network, readout, sensing, intact }) {
  if (intact < 0.1) {
    return 'Nothing here flies well enough to attribute. That is itself a result: the arrangement the demonstration describes does not produce a hover on this airframe.';
  }
  if (network >= 0.5) {
    return `The network carries ${(network * 100).toFixed(0)}% of the measured control authority — removing it costs more than removing anything else. On these numbers the neural claim holds up.`;
  }
  if (sensing >= 0.5) {
    return `Sensing carries ${(sensing * 100).toFixed(0)}% of the measured control authority. The flight depends on having proprioception, not on what is between the sensors and the motors.`;
  }
  return `The network carries ${(network * 100).toFixed(0)}% of the measured control authority; the fitted readout and the sensor configuration carry the rest. The connectome is in the signal path, not in charge of it.`;
}
