/**
 * The camera, the encoder and the link to real hardware.
 *
 * The encoder tests are about what the network is *allowed* to know, which is the
 * question the whole app turns on. The vision tests check that the estimator can
 * tell a fist from a spread hand and, more importantly, that it refuses to answer
 * when it cannot. The link tests are all refusals: every one of them checks that
 * something does not happen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSynthetic } from '../../public/makecns-fly/js/connectome.js';
import { CHANNELS, SENSOR_SETS, SensoryEncoder } from '../../public/makecns-fly/js/encode.js';
import { PalmTracker, handMetrics, skinMask } from '../../public/makecns-fly/js/vision.js';
import { BENCH_STATES, HardwareLink, mspSetRawRc, throttleToUs } from '../../public/makecns-fly/js/link.js';

/** A frame with skin-coloured pixels wherever `shape` says so. */
function frame(width, height, shape) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const on = shape(x, y);
      const p = (y * width + x) * 4;
      data[p] = on ? 172 : 22;
      data[p + 1] = on ? 112 : 24;
      data[p + 2] = on ? 96 : 26;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

const FIST = frame(64, 64, (x, y) => x > 20 && x < 44 && y > 20 && y < 44);
const SPREAD = frame(64, 64, (x, y) =>
  (y > 16 && y < 34 && x % 8 < 4 && x > 16 && x < 48) || (y >= 34 && y < 48 && x > 18 && x < 46));
const EMPTY = frame(64, 64, () => false);

test('a spread hand reads as more open than a fist', () => {
  const fist = handMetrics(skinMask(FIST));
  const spread = handMetrics(skinMask(SPREAD));
  assert.ok(fist.found && spread.found);
  assert.ok(spread.openness > fist.openness + 0.3, `fist ${fist.openness} vs spread ${spread.openness}`);
  assert.ok(spread.meanRuns > fist.meanRuns, 'a spread hand crosses more skin runs per scanline');
  assert.ok(fist.fillRatio > spread.fillRatio, 'a fist fills its box more completely');
});

test('an empty frame is refused rather than guessed at', () => {
  const metrics = handMetrics(skinMask(EMPTY));
  assert.equal(metrics.found, false);
  assert.equal(metrics.openness, null);
  assert.equal(metrics.confidence, 0);
  assert.match(metrics.reason, /no skin-coloured region/);
});

test('a frame that is entirely skin-coloured is refused too', () => {
  const wall = frame(64, 64, () => true);
  const metrics = handMetrics(skinMask(wall));
  assert.equal(metrics.found, false);
  assert.match(metrics.reason, /fills too much/);
});

test('the tracker holds its last value when the hand is lost, and reports the staleness', () => {
  const tracker = new PalmTracker();
  const good = handMetrics(skinMask(SPREAD));
  for (let i = 0; i < 40; i += 1) tracker.update(good, 33);
  const held = tracker.value;
  assert.ok(held > 0.5, `an open hand should read high, got ${held}`);

  const lost = handMetrics(skinMask(EMPTY));
  const reading = tracker.update(lost, 500);
  assert.equal(reading.stale, true);
  assert.equal(reading.value, held, 'a lost hand must not slam the control to zero');
  assert.ok(reading.staleMs >= 500);
  assert.equal(tracker.stale, true);
});

test('calibration rescales the range and refuses when there is nothing to record', () => {
  const tracker = new PalmTracker();
  assert.equal(tracker.calibrate('closed'), false, 'nothing seen yet');
  tracker.update(handMetrics(skinMask(FIST)), 33);
  assert.equal(tracker.calibrate('closed'), true);
  tracker.update(handMetrics(skinMask(SPREAD)), 33);
  assert.equal(tracker.calibrate('open'), true);
  assert.equal(tracker.calibration.calibrated, true);
  tracker.resetCalibration();
  assert.equal(tracker.calibration.calibrated, false);
});

test('hand-only leaves the proprioceptive pool dark', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 5 });
  const encoder = new SensoryEncoder(connectome, { sensorSet: 'hand-only' });
  const { current } = encoder.encode({ palm: 0.5, z: 1, vz: 0.5, roll: 0.2, pitch: 0, p: 1, q: 0 });
  const proprio = connectome.range('proprio');
  let injected = 0;
  for (let i = proprio.start; i < proprio.end; i += 1) injected += Math.abs(current[i]);
  assert.equal(injected, 0, 'in hand-only mode the aircraft must reach no neuron at all');
  assert.equal(encoder.closedLoop, false);
  assert.equal(SENSOR_SETS['hand-only'].closedLoop, false);
});

test('the full sensor set does reach the proprioceptive pool', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 5 });
  const encoder = new SensoryEncoder(connectome, { sensorSet: 'hand+proprioception' });
  const { current } = encoder.encode({ palm: 0.5, z: 1, vz: 0, roll: 0.2, pitch: 0, p: 0, q: 0 });
  const proprio = connectome.range('proprio');
  let injected = 0;
  for (let i = proprio.start; i < proprio.end; i += 1) injected += Math.abs(current[i]);
  assert.ok(injected > 0);
  assert.equal(encoder.closedLoop, true);
  assert.equal(encoder.allocation().length, 7);
});

test('a channel pinned at its rail is reported rather than silently clamped', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 5 });
  const encoder = new SensoryEncoder(connectome, {});
  const inRange = encoder.encode({ palm: 0.5, z: 1, vz: 0, roll: 0, pitch: 0, p: 0, q: 0 });
  assert.deepEqual(inRange.saturated, []);
  const pinned = encoder.encode({ palm: 0.5, z: 1, vz: 0, roll: 99, pitch: 0, p: 0, q: 0 });
  assert.ok(pinned.saturated.includes('roll'), 'a sensor at its rail has stopped sensing');
});

test('narrowing a channel range changes what a small movement does', () => {
  const connectome = buildSynthetic({ count: 1024, seed: 5 });
  const wide = new SensoryEncoder(connectome, { ranges: { roll: { min: -2, max: 2 } } });
  const narrow = new SensoryEncoder(connectome, { ranges: { roll: { min: -0.1, max: 0.1 } } });
  const small = { palm: 0.5, z: 1, vz: 0, roll: 0.05, pitch: 0, p: 0, q: 0 };
  const zero = { ...small, roll: 0 };
  const delta = (encoder) => {
    const a = Float32Array.from(encoder.encode(zero).current);
    const b = encoder.encode(small).current;
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return sum;
  };
  assert.ok(delta(narrow) > delta(wide) * 2, 'a narrow range must resolve a small movement better');
});

test('every channel declares a range that is actually a range', () => {
  for (const channel of CHANNELS) {
    assert.ok(channel.max > channel.min, `${channel.key} has an empty range`);
    assert.ok(['sensory', 'proprio'].includes(channel.pool));
  }
});

test('the MSP frame is well formed and its checksum is right', () => {
  const frameBytes = mspSetRawRc([1500, 1500, 1500, 1500]);
  assert.equal(frameBytes[0], 0x24);
  assert.equal(frameBytes[1], 0x4d);
  assert.equal(frameBytes[2], 0x3c);
  assert.equal(frameBytes[3], 8, 'payload length is two bytes per channel');
  assert.equal(frameBytes[4], 200, 'MSP_SET_RAW_RC');
  let checksum = 0;
  for (let i = 3; i < frameBytes.length - 1; i += 1) checksum ^= frameBytes[i];
  assert.equal(frameBytes[frameBytes.length - 1], checksum);
  assert.throws(() => mspSetRawRc([1500, 1500]), /between 4 and 16/);
});

test('throttles map onto the RC range and clamp at both ends', () => {
  assert.equal(throttleToUs(0), 1000);
  assert.equal(throttleToUs(1), 2000);
  assert.equal(throttleToUs(0.5), 1500);
  assert.equal(throttleToUs(-5), 1000);
  assert.equal(throttleToUs(5), 2000);
});

test('the link refuses to arm until every precondition is met, and says which', () => {
  const link = new HardwareLink();
  assert.match(link.armingBlocker(), /no serial device/);
  link.attach({ write: () => {} });
  assert.match(link.armingBlocker(), /bench state/);
  link.declareBenchState('props-off');
  assert.equal(link.armingBlocker(), null);
  assert.equal(link.arm(0).armed, true);
  assert.throws(() => link.declareBenchState('hoping-for-the-best'));
});

test('declaring a new bench state disarms', () => {
  const link = new HardwareLink({ transport: { write: () => {} } });
  link.declareBenchState('props-off');
  link.arm(0);
  assert.equal(link.armed, true);
  link.declareBenchState('netted');
  assert.equal(link.armed, false, 'changing the physical situation must require re-arming');
  assert.equal(BENCH_STATES.netted.allowsFlight, true);
  assert.equal(BENCH_STATES['props-off'].allowsFlight, false);
});

test('the throttle ceiling is enforced on every frame, not just at arming', () => {
  const sent = [];
  const link = new HardwareLink({ transport: { write: (b) => sent.push(b) } });
  link.declareBenchState('props-off');
  link.setThrottleCeiling(0.3);
  link.arm(0);
  const result = link.send([0.95, 0.95, 0.95, 0.95], 10);
  assert.equal(result.sent, true);
  assert.equal(result.capped, true);
  assert.equal(sent.length, 1);
  // 30% of the 1000–2000 µs band.
  const value = result.frame[5] | (result.frame[6] << 8);
  assert.equal(value, 1300);
  assert.throws(() => link.setThrottleCeiling(0));
  assert.throws(() => link.setThrottleCeiling(1.5));
});

test('the failsafe disarms when frames stop arriving', () => {
  const link = new HardwareLink({ transport: { write: () => {} } });
  link.declareBenchState('props-off');
  link.arm(0);
  link.send([0.2, 0.2, 0.2, 0.2], 100);
  assert.equal(link.tick(200), true, 'still inside the window');
  assert.equal(link.tick(500), false, 'a gap longer than the failsafe must disarm');
  assert.match(link.status().lastRefusal, /failsafe/);
});

test('arming expires, so a forgotten tab does not stay armed', () => {
  const link = new HardwareLink({ transport: { write: () => {} } });
  link.declareBenchState('netted');
  link.arm(0);
  const late = link.send([0.2, 0.2, 0.2, 0.2], 60000);
  assert.equal(late.sent, false);
  assert.match(late.reason, /expired|failsafe/);
  assert.equal(link.armed, false);
});

test('a refusal never throws, because a control loop that throws stops updating', () => {
  const link = new HardwareLink();
  const result = link.send([0.5, 0.5, 0.5, 0.5], 0);
  assert.equal(result.sent, false);
  assert.equal(result.frame, null);
  assert.ok(typeof result.reason === 'string');
});
