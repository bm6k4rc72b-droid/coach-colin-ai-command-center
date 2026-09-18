/**
 * The network and its wiring, including the regimes in which it stops working.
 *
 * The interesting assertions here are the ones about *information*, not about
 * firing. A network that spikes beautifully and carries nothing is the failure
 * this app was written to detect, and it is invisible to any test that only
 * checks that neurons fired. So the last test in this file measures whether the
 * aircraft's state can be linearly recovered from the motor pool, and pins the
 * tonic-drive setting at which it can and cannot.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rng, hashSeed, mulberry32 } from '../../public/makecns-fly/js/rng.js';
import { PROFILES, buildSynthetic, importEdgeList } from '../../public/makecns-fly/js/connectome.js';
import { ABLATIONS, SpikingNetwork } from '../../public/makecns-fly/js/net.js';
import { SensoryEncoder } from '../../public/makecns-fly/js/encode.js';

test('the same seed produces the same numbers, and different seeds do not', () => {
  const a = Array.from({ length: 8 }, mulberry32(42));
  const b = Array.from({ length: 8 }, mulberry32(42));
  const c = Array.from({ length: 8 }, mulberry32(43));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('named streams are independent of one another', () => {
  const root = new Rng(7);
  const weights = root.stream('weights');
  const poisson = root.stream('poisson');
  const weightsAgain = new Rng(7).stream('weights');
  assert.equal(weights.uniform(), weightsAgain.uniform());
  assert.notEqual(new Rng(7).stream('weights').uniform(), new Rng(7).stream('poisson').uniform());
  assert.notEqual(hashSeed('weights'), hashSeed('poisson'));
});

test('Poisson draws have the requested mean, in both the exact and approximate branches', () => {
  const rng = new Rng(3);
  for (const lambda of [0.5, 4, 80]) {
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) sum += rng.poisson(lambda);
    const mean = sum / n;
    assert.ok(Math.abs(mean - lambda) < lambda * 0.06 + 0.05, `lambda ${lambda} gave ${mean}`);
  }
  assert.equal(rng.poisson(0), 0);
  assert.equal(rng.poisson(-1), 0);
});

test('the synthetic network matches the statistics it claims to match', () => {
  const connectome = buildSynthetic({ count: 2048, seed: 11, profile: 'flywire' });
  const stats = connectome.statistics();
  assert.equal(stats.neurons, 2048);
  // Heavy-tailed out-degree, not uniform: a Poisson graph would sit near zero.
  assert.ok(stats.outDegreeCv > 0.6, `degree CV ${stats.outDegreeCv}`);
  // Excitatory fraction near the reference, allowing for forced-excitatory afferents.
  const reference = PROFILES.flywire.excitatoryFraction;
  assert.ok(Math.abs(stats.excitatoryFraction - reference) < 0.09, `E fraction ${stats.excitatoryFraction}`);
  // Inhibition is per-neuron, not per-synapse: every edge from one source shares a sign.
  for (let i = 0; i < connectome.count; i += 97) {
    const sign = connectome.sign[i];
    for (let e = connectome.rowPtr[i]; e < connectome.rowPtr[i + 1]; e += 1) {
      assert.equal(Math.sign(connectome.weight[e]), sign, `Dale violated at neuron ${i}`);
    }
  }
});

test('the network never claims to be a fly brain', () => {
  const connectome = buildSynthetic({ count: 512, seed: 1 });
  assert.equal(connectome.provenance.kind, 'synthetic');
  assert.match(connectome.provenance.warning, /not a fly brain/i);
  assert.ok(connectome.scale.fraction < 0.01);
  assert.equal(connectome.scale.referenced, PROFILES.flywire.neurons);
});

test('the quoted figures are carried as quoted, and flagged as unmatched', () => {
  const claimed = PROFILES.claimed;
  assert.equal(claimed.neurons, 166700);
  assert.equal(claimed.synapses, 25000000);
  assert.ok(claimed.neurons > PROFILES.flywire.neurons);
  assert.ok(claimed.synapses < PROFILES.flywire.synapses);
  assert.match(claimed.note, /Unresolved/);
});

test('an imported edge list keeps its attribution and counts its assumptions', () => {
  const rows = [
    { pre: 'A', post: 'B', synapses: 10, nt: 'ACh' },
    { pre: 'B', post: 'C', synapses: 8, nt: 'GABA' },
    { pre: 'C', post: 'A', synapses: 12 },
    { pre: 'A', post: 'C', synapses: 2, nt: 'ACh' },
  ];
  const connectome = importEdgeList(rows, { attribution: 'Test dataset v1', minSynapses: 5 });
  assert.equal(connectome.provenance.kind, 'imported');
  assert.match(connectome.provenance.label, /Test dataset v1/);
  assert.equal(connectome.provenance.droppedConnections, 1, 'the 2-synapse edge is below threshold');
  assert.equal(connectome.provenance.assumedExcitatory, 1, 'C had no transmitter label');
  assert.match(connectome.provenance.warning, /assumed excitatory/);
  assert.equal(connectome.edgeCount, 3);
});

test('at the default tonic drive the network is silent until something drives it', () => {
  const connectome = buildSynthetic({ count: 2048, seed: 5 });
  const encoder = new SensoryEncoder(connectome, {});
  const quiet = new Float32Array(connectome.count);

  const resting = new SpikingNetwork(connectome, { seed: 5 });
  for (let i = 0; i < 1500; i += 1) resting.step(quiet, 1);
  assert.equal(resting.meanRateHz(), 0, 'the default regime is input-driven, so silence is correct here');

  const driven = new SpikingNetwork(connectome, { seed: 5 });
  const observation = { palm: 0.7, z: 1, vz: 0, roll: 0.1, pitch: 0, p: 0, q: 0 };
  for (let i = 0; i < 1500; i += 1) driven.step(encoder.encode(observation).current, 1);
  assert.ok(driven.populationRateHz('proprio') > 1, 'afferents must respond to their input');
  assert.ok(driven.populationRateHz('motor') > 0, 'the motor pool must be reachable from the afferents');
});

test('raising tonic drive makes the network fire without any input at all', () => {
  const connectome = buildSynthetic({ count: 2048, seed: 5 });
  const net = new SpikingNetwork(connectome, { seed: 5, biasMvPerMs: 0.3 });
  const quiet = new Float32Array(connectome.count);
  for (let i = 0; i < 1500; i += 1) net.step(quiet, 1);
  const rate = net.meanRateHz();
  assert.ok(rate > 5, `a self-driven pool should be busy on its own, got ${rate} Hz`);
});

test('participation reports how much of the network actually took part', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 6 });
  const encoder = new SensoryEncoder(connectome, {});
  const net = new SpikingNetwork(connectome, { seed: 6 });
  const observation = { palm: 0.6, z: 1, vz: 0, roll: 0, pitch: 0, p: 0, q: 0 };
  for (let i = 0; i < 1200; i += 1) net.step(encoder.encode(observation).current, 1);
  const participation = net.participation();
  assert.ok(participation.overall >= 0 && participation.overall <= 1);
  // The honest headline: in the input-driven regime most of the pool never fires.
  assert.ok(participation.byPool.proprio > participation.byPool.inter,
    'afferents must take part more than interneurons in an input-driven network');
  net.reset();
  assert.equal(net.participation().overall, 0, 'reset must clear the participation record');
});

test('every ablation runs, and frozen means frozen', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 2 });
  const encoder = new SensoryEncoder(connectome, {});
  const observation = { palm: 0.7, z: 1, vz: 0, roll: 0.1, pitch: 0, p: 0, q: 0 };
  const results = new Map();
  for (const ablation of ABLATIONS) {
    const net = new SpikingNetwork(connectome, { seed: 2, ablation });
    let spikes = 0;
    for (let i = 0; i < 600; i += 1) spikes += net.step(encoder.encode(observation).current, 1);
    results.set(ablation, spikes);
  }
  assert.equal(results.get('frozen'), 0, 'a frozen network must not spike');
  assert.ok(results.get('intact') > 0, 'an intact network given input must spike');
  assert.ok(results.get('poisson-surrogate') >= 0);
  assert.throws(() => new SpikingNetwork(connectome, { seed: 2 }).setAblation('nonsense'));
});

test('cutting recurrence matters in the regime where recurrence is active', () => {
  // In the input-driven default the interneuron pool barely fires, so cutting its
  // output changes almost nothing — which is the app's finding, not a bug. The
  // ablation must still bite where there is something to cut.
  const connectome = buildSynthetic({ count: 1024, seed: 2 });
  const quiet = new Float32Array(connectome.count);
  const counts = {};
  for (const ablation of ['intact', 'no-recurrence']) {
    const net = new SpikingNetwork(connectome, { seed: 2, ablation, biasMvPerMs: 0.3 });
    let spikes = 0;
    for (let i = 0; i < 800; i += 1) spikes += net.step(quiet, 1);
    counts[ablation] = spikes;
  }
  assert.notEqual(counts.intact, counts['no-recurrence'],
    'with a self-driven pool, removing recurrent connections must change the activity');
});

test('cutting recurrence removes recurrent input but leaves afferents intact', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 4 });
  const encoder = new SensoryEncoder(connectome, {});
  const observation = { palm: 0.5, z: 1, vz: 0, roll: 0, pitch: 0, p: 0, q: 0 };
  const cut = new SpikingNetwork(connectome, { seed: 4, ablation: 'no-recurrence' });
  for (let i = 0; i < 800; i += 1) cut.step(encoder.encode(observation).current, 1);
  // Afferent pools are driven directly, so they must still be firing.
  assert.ok(cut.populationRateHz('proprio') > 0, 'afferents should still respond to their input');
});

test('the motor pool encodes the aircraft only when the network is input-driven', async () => {
  // The claim under test: tonic drive decides whether this network transmits.
  const { FlightLoop } = await import('../../public/makecns-fly/js/loop.js');

  const decodability = (bias) => {
    const loop = new FlightLoop({ neurons: 1536, seed: 5, readoutMode: 'trained',
      loop: { trainSeconds: 1e6, explorationDither: 0.06 } });
    loop.net.params.biasMvPerMs = bias;
    loop.run(2);
    loop.net.params.biasMvPerMs = bias;

    const range = loop.connectome.range('motor');
    const samples = [];
    for (let i = 0; i < 18000; i += 1) {
      loop.step();
      if (i % 25 !== 0) continue;
      let sum = 0;
      for (let n = range.start; n < range.end; n += 1) sum += loop.net.rates[n] * (n % 2 ? 1 : -1);
      samples.push({ x: sum, y: loop.plant.state().att.roll });
    }
    // Correlation between a fixed random projection of motor rates and roll.
    const n = samples.length;
    const mx = samples.reduce((a, s) => a + s.x, 0) / n;
    const my = samples.reduce((a, s) => a + s.y, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const s of samples) {
      sxy += (s.x - mx) * (s.y - my);
      sxx += (s.x - mx) ** 2;
      syy += (s.y - my) ** 2;
    }
    return Math.abs(sxy / Math.sqrt(sxx * syy || 1e-12));
  };

  const listening = decodability(0.06);
  const chattering = decodability(0.30);
  assert.ok(listening > chattering,
    `an input-driven pool (${listening.toFixed(3)}) must carry more about roll than a self-driven one (${chattering.toFixed(3)})`);
});
