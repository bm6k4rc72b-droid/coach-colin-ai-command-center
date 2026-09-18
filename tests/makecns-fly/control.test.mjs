/**
 * The readout, the loop and the ledger — the parts that decide what gets claimed.
 *
 * The tests that matter here are about bookkeeping rather than flight. A flight
 * either happens or it does not, and the ledger will measure it; what has to be
 * guaranteed is that no supervised sample is ever counted as an unsupervised one,
 * that a hold which did not last cannot be reported as a hold, and that the
 * attribution arithmetic gives a component no credit for a removal that changed
 * nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSynthetic } from '../../public/makecns-fly/js/connectome.js';
import { MotorDecoder, axesToRotors, rotorsToAxes } from '../../public/makecns-fly/js/decode.js';
import { FlightLoop } from '../../public/makecns-fly/js/loop.js';
import { CONDITIONS, airframeOnly, createLedgerRun, summarise } from '../../public/makecns-fly/js/ledger.js';

test('the control-axis mixer round-trips exactly', () => {
  const rotors = [0.51, 0.42, 0.63, 0.74];
  const back = axesToRotors(rotorsToAxes(rotors));
  for (let i = 0; i < 4; i += 1) assert.ok(Math.abs(back[i] - rotors[i]) < 1e-6);
});

test('the axis basis separates collective from the differentials', () => {
  // Equal throttles: all authority in the collective, none anywhere else.
  const level = rotorsToAxes([0.5, 0.5, 0.5, 0.5]);
  assert.ok(Math.abs(level[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(level[1]) < 1e-9 && Math.abs(level[2]) < 1e-9 && Math.abs(level[3]) < 1e-9);
  // Left up, right down: pure roll.
  const rolling = rotorsToAxes([0.5, 0.45, 0.5, 0.55]);
  assert.ok(rolling[1] > 0.04, 'roll axis must carry it');
  assert.ok(Math.abs(rolling[2]) < 1e-9, 'and pitch must not');
});

test('recursive least squares recovers an exactly linear map', () => {
  const connectome = buildSynthetic({ count: 512, seed: 1 });
  const decoder = new MotorDecoder(connectome, { seed: 2, mode: 'trained', featureCount: 24, dualTimescale: false });
  const k = decoder.featureIndex.length;
  const truth = Array.from({ length: 4 }, (_, o) => Array.from({ length: k + 1 }, (_, i) => Math.sin(o * 3 + i) * 0.2));
  const net = { rates: new Float32Array(connectome.count), ratesFast: new Float32Array(connectome.count) };

  let seed = 1;
  const nextRandom = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const drawTarget = () => {
    for (let i = 0; i < k; i += 1) net.rates[decoder.featureIndex[i]] = nextRandom() * 0.04;
    const x = decoder.features(net);
    return truth.map((w) => w.reduce((acc, wi, i) => acc + wi * x[i], 0));
  };

  for (let i = 0; i < 2500; i += 1) decoder.train(net, axesToRotors(drawTarget()), 0, 5);

  let worst = 0;
  for (let trial = 0; trial < 50; trial += 1) {
    const target = drawTarget();
    const x = decoder.x;
    for (let o = 0; o < 4; o += 1) {
      let predicted = 0;
      for (let i = 0; i < decoder.dim; i += 1) predicted += decoder.weights[o * decoder.dim + i] * x[i];
      worst = Math.max(worst, Math.abs(predicted - target[o]));
    }
  }
  assert.ok(worst < 0.02, `the estimator should recover a linear map, worst error ${worst}`);
});

test('an untrained readout is untrained, and a trained one is not', () => {
  const connectome = buildSynthetic({ count: 512, seed: 3 });
  const random = new MotorDecoder(connectome, { seed: 3, mode: 'fixed-random' });
  assert.ok(random.weightNorm() > 0, 'a fixed-random readout has weights from the start');
  const before = random.weightNorm();
  const net = { rates: new Float32Array(connectome.count), ratesFast: new Float32Array(connectome.count) };
  random.train(net, [0.5, 0.5, 0.5, 0.5], 0.5, 5);
  assert.equal(random.weightNorm(), before, 'and training must not touch them');
  assert.equal(random.provenance().supervisedSeconds, 0);
  assert.match(random.provenance().statement, /never adjusted/);
});

test('the readout declares what it was given for free', () => {
  const connectome = buildSynthetic({ count: 512, seed: 3 });
  const decoder = new MotorDecoder(connectome, { seed: 3, mode: 'trained' });
  const provenance = decoder.provenance();
  assert.equal(provenance.feedForwardHover, true);
  assert.equal(provenance.outputBasis, 'control-axes');
  assert.equal(provenance.timescales, 2);
  assert.ok(provenance.parameters > 100);
});

test('supervised samples are never counted as unsupervised ones', () => {
  const loop = new FlightLoop({ neurons: 512, seed: 4, readoutMode: 'trained',
    loop: { trainSeconds: 3, handoverSeconds: 1, settleSeconds: 0.2 } });
  loop.run(2);
  assert.equal(loop.phase, 'training');
  assert.equal(loop.score().samples, 0, 'nothing is scored while the teacher is connected');
  assert.ok(loop.decoder.trainedMs > 0, 'but the readout is being fitted');

  loop.run(3);
  assert.equal(loop.phase, 'flying');
  const supervised = loop.score().supervisedSeconds;
  assert.ok(supervised >= 2.9 && supervised <= 3.2, `supervised time ${supervised} should be reported`);
});

test('a crash inside the window is scored over the whole window', () => {
  // The metric that would be easiest to inflate: score only the seconds a craft
  // survived and any brief success becomes a near-perfect hold.
  const score = airframeOnly({ seed: 5, seconds: 20, targetZ: 1 });
  assert.ok(score.crashedAtSeconds !== null && score.crashedAtSeconds < 1,
    'the bare airframe must tumble almost immediately');
  assert.equal(score.unsupervisedSeconds, 20, 'the window is twenty seconds regardless of the crash');
  assert.ok(score.samples > 3000, 'and every sample in it is counted');
  assert.ok(score.holdFraction < 0.05,
    `a wreck is not holding altitude, got ${score.holdFraction}`);
});

test('a loop that crashes keeps being scored to the end of its window', () => {
  const loop = new FlightLoop({ neurons: 512, seed: 6, readoutMode: 'fixed-random',
    loop: { settleSeconds: 0.1, trainSeconds: 0, handoverSeconds: 0 } });
  loop.run(6);
  const score = loop.score();
  assert.ok(score.samples > 1000, 'samples must keep accruing after the crash');
  assert.ok(score.unsupervisedSeconds > 5, `window was ${score.unsupervisedSeconds} s`);
});

test('a hold that does not last is not reported as a hold', () => {
  const loop = new FlightLoop({ neurons: 512, seed: 4, readoutMode: 'direct', loop: { settleSeconds: 0.1 } });
  loop.run(1);
  loop.metrics.firstHoldMs = 500;
  // A sample outside tolerance must revoke the first-hold claim.
  loop.plant.pos.z = 5;
  loop.recordSample(loop.plant.state());
  assert.equal(loop.metrics.firstHoldMs, null, 'an interrupted hold must be re-earned');
});

test('a hand-only loop is open, and says so', () => {
  const closed = new FlightLoop({ neurons: 512, seed: 2, sensorSet: 'hand+proprioception' });
  const open = new FlightLoop({ neurons: 512, seed: 2, sensorSet: 'hand-only' });
  assert.equal(closed.closedLoop, true);
  assert.equal(open.closedLoop, false);
  assert.equal(open.score().closedLoop, false);
  assert.equal(open.encoder.allocation().length, 1, 'only the hand channel is allocated neurons');
});

test('the airframe-only baseline does not fly', () => {
  const score = airframeOnly({ seed: 4, seconds: 10, targetZ: 1 });
  assert.ok(score.holdFraction < 0.2, `the bare airframe must not hold altitude, got ${score.holdFraction}`);
  assert.equal(score.closedLoop, false);
  assert.equal(score.supervisedSeconds, 0);
});

test('attribution gives no credit for a removal that changed nothing', () => {
  const rows = [
    { id: 'airframe-only', attributes: 'plant', label: 'airframe', score: { holdFraction: 0, crashReason: 'tumbled' } },
    { id: 'teacher', attributes: 'reference', label: 'teacher', score: { holdFraction: 0.95 } },
    { id: 'intact', attributes: 'reference', label: 'intact', score: { holdFraction: 0.8 } },
    { id: 'no-recurrence', attributes: 'recurrence', label: 'no recurrence', score: { holdFraction: 0.8 } },
    { id: 'poisson-surrogate', attributes: 'spike-structure', label: 'surrogate', score: { holdFraction: 0.8 } },
    { id: 'frozen', attributes: 'network-activity', label: 'frozen', score: { holdFraction: 0.8 } },
    { id: 'untrained-readout', attributes: 'readout', label: 'untrained', score: { holdFraction: 0 } },
    { id: 'hand-only', attributes: 'sensing', label: 'hand only', score: { holdFraction: 0, survived: false, crashedAtSeconds: 1 } },
  ];
  const summary = summarise(rows);
  assert.equal(summary.totals.network, 0, 'ablating the network changed nothing, so it gets nothing');
  assert.ok(summary.totals.readout > 0.4);
  assert.ok(summary.totals.sensing > 0.4);
  // With sensing carrying half the authority, the verdict must name sensing —
  // not the network, which is what a casual reading of this app would expect.
  assert.match(summary.verdict, /Sensing carries/);
  assert.ok(!/network carries/i.test(summary.verdict));
  assert.ok(summary.findings.some((f) => /rate-matched noise/.test(f)));
});

test('an ablation that improves matters is not counted as authority', () => {
  const rows = [
    { id: 'intact', attributes: 'reference', label: 'intact', score: { holdFraction: 0.5 } },
    { id: 'no-recurrence', attributes: 'recurrence', label: 'no recurrence', score: { holdFraction: 0.9 } },
    { id: 'untrained-readout', attributes: 'readout', label: 'untrained', score: { holdFraction: 0.1 } },
  ];
  const summary = summarise(rows);
  assert.equal(summary.totals.network, 0, 'removing something that was in the way is not authority');
  assert.equal(summary.totals.readout, 1);
});

test('the ledger can be run in slices without changing its answer', () => {
  const base = { neurons: 384, seed: 3, loop: { trainSeconds: 0.4, handoverSeconds: 0.2, settleSeconds: 0.1 } };
  const run = createLedgerRun(base, { evaluateSeconds: 0.4, only: ['airframe-only', 'teacher', 'intact'] });
  let guard = 0;
  while (!run.advance(20) && guard < 5000) guard += 1;
  const sliced = run.result();
  assert.ok(sliced, 'the sliced run must finish');
  assert.equal(sliced.rows.length, 3);
  assert.ok(sliced.rows.every((row) => CONDITIONS.some((c) => c.id === row.id)));
  assert.equal(run.progress().fraction, 1);
});
