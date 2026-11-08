/**
 * Unit tests for RANCH COMMAND's pure modules: the air-swipe detector and its
 * calibration, alert routing, the MQTT client's framing, and the MAVLink
 * parser — the last checked against frames packed by pymavlink, an
 * independent implementation, rather than against itself.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DEFAULTS, MotionCentroid, OneEuro, SwipeDetector, calibrate, measureRest, measureStroke } from '../../public/ranch-command/js/gesture.js';
import { AlertQueue, fromEdge, fromFrigate, isNight, kindOf, route } from '../../public/ranch-command/js/events.js';
import { connectPacket, decodeLength, decodePublish, encodeLength, json, parsePackets, subscribePacket, topicMatches, MqttClient } from '../../public/ranch-command/js/mqtt.js';
import { Fleet, MavlinkParser, distance, fromMavlink2Rest, inspectionPlan, x25 } from '../../public/ranch-command/js/mavlink.js';

const RULES = JSON.parse(readFileSync(new URL('../../public/ranch-command/rules.json', import.meta.url)));
const ROUTING = JSON.parse(readFileSync(new URL('./fixtures/routing.json', import.meta.url)));
const FRAMES = JSON.parse(readFileSync(new URL('./fixtures/mavlink-frames.json', import.meta.url))).frames;

/* ------------------------------------------------------------- gesture */

/**
 * Simulate a hand: rest at `from`, sweep to `to` over `duration` seconds with
 * an ease-in-out profile, rest again. 30 fps, with optional shake.
 */
function stroke({ from = 0.75, to = 0.25, duration = 0.28, rest = 0.3, shake = 0, t0 = 0, fps = 30 } = {}) {
  const out = [];
  const dt = 1 / fps;
  let t = t0;
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return ((seed / 2147483647) - 0.5) * 2 * shake; };
  for (; t < t0 + rest; t += dt) out.push({ x: from + noise(), t });
  const start = t;
  for (; t < start + duration; t += dt) {
    const p = (t - start) / duration;
    const ease = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
    out.push({ x: from + (to - from) * ease + noise(), t });
  }
  const end = t;
  for (; t < end + rest; t += dt) out.push({ x: to + noise(), t });
  return out;
}

const run = (detector, samples) => samples.map((s) => detector.push(s.x, s.t)).filter(Boolean);

test('a hand moved to the reader\'s left pulls the next slide in', () => {
  assert.deepEqual(run(new SwipeDetector(), stroke({ from: 0.75, to: 0.25 })), ['next']);
  assert.deepEqual(run(new SwipeDetector(), stroke({ from: 0.25, to: 0.75 })), ['prev']);
});

test('invert swaps the directions', () => {
  assert.deepEqual(run(new SwipeDetector({}, { invert: true }), stroke({ from: 0.75, to: 0.25 })), ['prev']);
});

test('a slow drift across the frame is not a swipe', () => {
  assert.deepEqual(run(new SwipeDetector(), stroke({ from: 0.8, to: 0.2, duration: 2.5 })), []);
});

test('a short twitch is not a swipe', () => {
  assert.deepEqual(run(new SwipeDetector(), stroke({ from: 0.5, to: 0.42, duration: 0.08 })), []);
});

test('a still, shaky hand never fires', () => {
  const samples = stroke({ from: 0.5, to: 0.5, duration: 0.1, rest: 3, shake: 0.02 });
  assert.deepEqual(run(new SwipeDetector(), samples), []);
});

test('the return stroke after a swipe is swallowed', () => {
  const go = stroke({ from: 0.75, to: 0.25, rest: 0.05 });
  const back = stroke({ from: 0.25, to: 0.75, rest: 0.05, t0: go[go.length - 1].t + 0.03, duration: 0.3 });
  assert.deepEqual(run(new SwipeDetector(), [...go, ...back]), ['next'], 'the hand coming back must not count as "previous"');
});

test('two deliberate swipes in a row both count', () => {
  const one = stroke({ from: 0.75, to: 0.25 });
  // Reset position off-camera (hand drops out), then swipe again.
  const gap = [{ x: null, t: one[one.length - 1].t + 0.1 }];
  const two = stroke({ from: 0.75, to: 0.25, t0: one[one.length - 1].t + 0.6 });
  assert.deepEqual(run(new SwipeDetector(), [...one, ...gap, ...two]), ['next', 'next']);
});

test('a hand that leaves mid-stroke does not complete it', () => {
  const s = stroke({ from: 0.75, to: 0.25 });
  const half = s.slice(0, Math.floor(s.length * 0.55));
  const samples = [...half, { x: null, t: half[half.length - 1].t + 0.03 }];
  assert.deepEqual(run(new SwipeDetector(), samples), []);
});

test('a jittery but real swipe still counts', () => {
  assert.deepEqual(run(new SwipeDetector(), stroke({ from: 0.78, to: 0.22, shake: 0.015 })), ['next']);
});

test('the One Euro filter quietens rest and keeps speed', () => {
  const f = new OneEuro();
  const rest = [];
  for (let i = 0; i < 60; i += 1) rest.push(f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i / 30));
  const spread = Math.max(...rest.slice(20)) - Math.min(...rest.slice(20));
  assert.ok(spread < 0.012, `rest jitter survived the filter: ${spread}`);
  const g = new OneEuro();
  let last = 0;
  for (let i = 0; i < 10; i += 1) last = g.filter(i * 0.05, i / 30);
  assert.ok(last > 0.3, `a fast move was smoothed away: ${last}`);
});

/* ----------------------------------------------------------- calibration */

test('calibration sets thresholds from the reader\'s own swipes', () => {
  const strokes = [
    stroke({ from: 0.7, to: 0.35 }), stroke({ from: 0.72, to: 0.33 }), stroke({ from: 0.3, to: 0.68 }),
    stroke({ from: 0.32, to: 0.7 }),
  ].map(measureStroke);
  const rest = measureRest(stroke({ from: 0.5, to: 0.5, duration: 0.1, rest: 1.5, shake: 0.005 }));
  const { thresholds, quality, notes } = calibrate({ strokes, rest });
  assert.ok(thresholds.minDistance > 0.12 && thresholds.minDistance < 0.25, `minDistance ${thresholds.minDistance}`);
  assert.ok(thresholds.minSpeed < strokes[0].peak, 'the threshold must sit below a typical stroke');
  assert.ok(thresholds.minSpeed > thresholds.restSpeed, 'the threshold must sit above the shake');
  assert.ok(quality >= 60, `quality ${quality}`);
  assert.ok(notes.length >= 1);
  // And the calibrated detector accepts the reader's own swipe.
  assert.deepEqual(run(new SwipeDetector(thresholds), stroke({ from: 0.7, to: 0.36 })), ['next']);
});

test('calibration with nothing usable keeps the defaults and says why', () => {
  const result = calibrate({ strokes: [null, measureStroke([{ x: 0.5, t: 0 }])], rest: 0 });
  assert.equal(result.quality, 0);
  assert.equal(result.thresholds.minDistance, DEFAULTS.minDistance);
  assert.match(result.notes[0], /Not enough clear swipes/);
});

test('a shaky hand raises the speed bar', () => {
  const strokes = [stroke(), stroke(), stroke()].map(measureStroke);
  const calm = calibrate({ strokes, rest: 0.05 }).thresholds;
  const shaky = calibrate({ strokes, rest: 0.6 }).thresholds;
  assert.ok(shaky.restSpeed > calm.restSpeed);
  assert.ok(shaky.minSpeed >= shaky.restSpeed * 1.6 - 1e-9);
});

test('the motion fallback finds where things moved', () => {
  const w = 32;
  const h = 24;
  const frame = (bx) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 8; y < 16; y += 1) for (let x = bx; x < bx + 6; x += 1) px.set([255, 255, 255, 255], (y * w + x) * 4);
    return px;
  };
  const m = new MotionCentroid();
  assert.equal(m.push(frame(2), w, h), null, 'first frame has nothing to compare against');
  const x = m.push(frame(20), w, h);
  assert.ok(x > 0.3 && x < 0.8, `centroid ${x}`);
  const mirrored = new MotionCentroid();
  mirrored.push(frame(2), w, h);
  assert.ok(Math.abs(mirrored.push(frame(20), w, h, { mirror: true }) - (1 - x)) < 1e-9);
  assert.equal(m.push(frame(20), w, h), null, 'nothing moved, nothing reported');
});

/* -------------------------------------------------------------- routing */

for (const c of ROUTING.cases) {
  test(`routing: ${c.name}`, () => {
    const got = route(c.event, RULES, { hour: c.hour });
    assert.deepEqual({ rule: got.rule, workflow: got.workflow, priority: got.priority }, c.expect);
  });
}

test('labels map to kinds case- and space-insensitively', () => {
  assert.equal(kindOf('Mountain Lion', RULES), 'predator');
  assert.equal(kindOf('  COW ', RULES), 'livestock');
  assert.equal(kindOf('spaceship', RULES), 'unknown');
});

test('a night window that does not wrap midnight also works', () => {
  assert.equal(isNight(3, { start: 1, end: 5 }), true);
  assert.equal(isNight(6, { start: 1, end: 5 }), false);
});

test('a Frigate event normalises, preferring the sub-label', () => {
  const e = fromFrigate({ type: 'new', after: { id: '1712.4-abc', camera: 'gate_cam', label: 'animal', sub_label: ['coyote', 0.81], top_score: 0.74, start_time: 1712000000.5, current_zones: ['main_gate'], entered_zones: ['main_gate', 'road'], has_snapshot: true } });
  assert.equal(e.id, 'frigate:1712.4-abc');
  assert.equal(e.label, 'coyote');
  assert.equal(e.baseLabel, 'animal');
  assert.deepEqual(e.zones, ['main_gate', 'road']);
  assert.equal(e.score, 0.74);
  assert.equal(fromFrigate({ type: 'new' }), null);
});

test('the queue dedupes updates and never quietly demotes', () => {
  const q = new AlertQueue(RULES);
  const base = { id: 'frigate:x', label: 'person', score: 0.9, zones: ['main_gate'] };
  q.add(base, { hour: 2 });
  q.add({ ...base, zones: ['hay_yard'] }, { hour: 2 });
  assert.equal(q.list().length, 1);
  assert.equal(q.list()[0].routing.priority, 'high', 'a later, quieter update must not demote');
  assert.equal(q.verify('frigate:x', 'dismissed'), true);
  assert.equal(q.list({ open: true }).length, 0);
  assert.equal(q.add({ id: 'frigate:y', label: 'person', score: 0.1 }), null, 'below-threshold events are not queued');
  assert.equal(q.add({ id: 'frigate:z', label: 'person', score: 0.9, falsePositive: true }), null);
});

test('the queue sorts loudest first', () => {
  const q = new AlertQueue(RULES);
  q.add({ id: 'a', label: 'deer', score: 0.9 }, { hour: 12 });
  q.add({ id: 'b', label: 'calving', score: 0.9 }, { hour: 12 });
  q.add({ id: 'c', label: 'person', score: 0.9, zones: ['main_gate'] }, { hour: 12 });
  assert.deepEqual(q.list().map((a) => a.id), ['b', 'c', 'a']);
});

test('edge events keep the routing the edge gave them', () => {
  const e = fromEdge({ id: 'e1', label: 'coyote', score: 0.7, routing: { rule: 'predator', workflow: 'wildlife', priority: 'medium' }, models: ['megadetector-v6'] });
  const q = new AlertQueue(RULES);
  assert.equal(q.add(e).routing.rule, 'predator');
});

/* ----------------------------------------------------------------- mqtt */

test('MQTT remaining length round-trips at every boundary', () => {
  for (const n of [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455]) {
    const bytes = Uint8Array.from(encodeLength(n));
    assert.deepEqual(decodeLength(bytes, 0), { value: n, bytes: bytes.length });
  }
  assert.deepEqual(encodeLength(321), [0xc1, 0x02], 'the worked example from the MQTT 3.1.1 spec');
});

test('CONNECT is a well-formed 3.1.1 packet', () => {
  const p = connectPacket({ clientId: 'ab', username: 'u', password: 'p', keepAlive: 30 });
  assert.equal(p[0], 0x10);
  assert.equal(p[1], p.length - 2);
  assert.deepEqual([...p.subarray(2, 8)], [0, 4, 0x4d, 0x51, 0x54, 0x54], 'protocol name "MQTT"');
  assert.equal(p[8], 4, 'protocol level 4 = 3.1.1');
  assert.equal(p[9], 0xc2, 'username + password + clean session');
  assert.deepEqual([...p.subarray(10, 12)], [0, 30]);
});

test('SUBSCRIBE carries every topic with its QoS', () => {
  const p = subscribePacket(7, ['frigate/events', 'msh/#']);
  assert.equal(p[0], 0x82, 'SUBSCRIBE has reserved flags 0010');
  const { packets } = parsePackets(p);
  assert.equal(packets.length, 1);
  assert.equal((packets[0].body[0] << 8) | packets[0].body[1], 7);
});

test('PUBLISH decodes at QoS 0 and QoS 1, split across WebSocket frames', () => {
  const topic = new TextEncoder().encode('frigate/events');
  const payload = new TextEncoder().encode('{"type":"new"}');
  const q0 = Uint8Array.from([0x30, 2 + topic.length + payload.length, 0, topic.length, ...topic, ...payload]);
  const q1 = Uint8Array.from([0x32, 2 + topic.length + 2 + payload.length, 0, topic.length, ...topic, 0x12, 0x34, ...payload]);
  const stream = Uint8Array.from([...q0, ...q1]);
  const first = parsePackets(stream.subarray(0, 9));
  assert.equal(first.packets.length, 0, 'an incomplete packet waits');
  const { packets, rest } = parsePackets(stream);
  assert.equal(rest.length, 0);
  const a = decodePublish(packets[0]);
  const b = decodePublish(packets[1]);
  assert.equal(a.topic, 'frigate/events');
  assert.deepEqual(json(a.payload), { type: 'new' });
  assert.equal(b.qos, 1);
  assert.equal(b.packetId, 0x1234);
  assert.deepEqual(json(b.payload), { type: 'new' });
});

test('topic filters honour + and #', () => {
  assert.ok(topicMatches('msh/+/2/json/#', 'msh/US/2/json/LongFast/!abcd'));
  assert.ok(topicMatches('frigate/events', 'frigate/events'));
  assert.ok(!topicMatches('frigate/events', 'frigate/events/x'));
  assert.ok(topicMatches('#', 'anything/at/all'));
  assert.ok(!topicMatches('a/+', 'a/b/c'));
});

test('the client connects, subscribes, acks QoS 1 and reports a refusal', () => {
  const sent = [];
  class FakeWS {
    constructor() { FakeWS.last = this; this.readyState = 1; }
    send(b) { sent.push(Uint8Array.from(b)); }
    close() { this.readyState = 3; }
  }
  const messages = [];
  const statuses = [];
  const c = new MqttClient({ url: 'wss://x', topics: ['frigate/events'], onMessage: (t, p) => messages.push([t, json(p)]), onStatus: (s, d) => statuses.push(d ? `${s}:${d}` : s), WebSocketImpl: FakeWS });
  c.connect();
  FakeWS.last.onopen();
  assert.equal(sent[0][0], 0x10, 'CONNECT first');
  c.receive(Uint8Array.from([0x20, 0x02, 0x00, 0x00]));
  assert.equal(sent[1][0], 0x82, 'SUBSCRIBE after CONNACK');
  assert.ok(statuses.includes('connected'));
  const topic = new TextEncoder().encode('frigate/events');
  const payload = new TextEncoder().encode('{"a":1}');
  c.receive(Uint8Array.from([0x32, 2 + topic.length + 2 + payload.length, 0, topic.length, ...topic, 0, 9, ...payload]));
  assert.deepEqual(messages, [['frigate/events', { a: 1 }]]);
  assert.deepEqual([...sent[2]], [0x40, 0x02, 0, 9], 'PUBACK for QoS 1');
  clearInterval(c.ping);

  const s2 = [];
  const d = new MqttClient({ url: 'wss://x', topics: ['t'], onMessage() {}, onStatus: (s, m) => s2.push(`${s}:${m}`), WebSocketImpl: FakeWS });
  d.connect();
  FakeWS.last.onopen();
  d.receive(Uint8Array.from([0x20, 0x02, 0x00, 0x05]));
  assert.ok(s2.includes('error:not authorised'));
});

/* -------------------------------------------------------------- mavlink */

test('the X.25 checksum matches its published check value', () => {
  assert.equal(x25(new TextEncoder().encode('123456789')), 0x6f91, 'CRC-16/MCRF4XX check value');
});

test('pymavlink frames decode, field for field', () => {
  const parser = new MavlinkParser();
  const msgs = parser.push(Uint8Array.from(FRAMES.flat()));
  // The ground-station heartbeat is a second HEARTBEAT; keep the first of each.
  const byName = {};
  for (const m of msgs) byName[m.name] ??= m.fields;
  assert.equal(parser.stats.badCrc, 0, 'every real frame must pass its checksum');
  assert.equal(parser.stats.unknown, 0, 'an undecodable frame at the end waits for the next byte');
  parser.push(Uint8Array.from(FRAMES[0]));
  assert.equal(parser.stats.unknown, 1, 'then SYSTEM_TIME is skipped, not rejected');
  assert.equal(msgs[0].fields.type, 2);
  assert.equal(msgs[0].fields.custom_mode, 5);
  assert.equal(byName.GLOBAL_POSITION_INT.lat, 345678901);
  assert.equal(byName.GLOBAL_POSITION_INT.lon, -1195678901);
  assert.equal(byName.GLOBAL_POSITION_INT.relative_alt, 40250);
  assert.equal(byName.GLOBAL_POSITION_INT.hdg, 27050);
  assert.equal(byName.SYS_STATUS.voltage_battery, 15840);
  assert.equal(byName.SYS_STATUS.battery_remaining, 76);
  assert.ok(Math.abs(byName.ATTITUDE.roll - 0.1) < 1e-6, 'a zero-trimmed payload must be padded back out');
  assert.equal(byName.ATTITUDE.time_boot_ms, 999);
  assert.equal(byName.GPS_RAW_INT.satellites_visible, 14);
  assert.equal(byName.GPS_RAW_INT.fix_type, 3);
  assert.equal(byName.VFR_HUD.heading, 270);
  assert.equal(byName.VFR_HUD.throttle, 38);
});

test('the parser survives byte-at-a-time delivery and line noise', () => {
  const parser = new MavlinkParser();
  // Noise containing both start bytes, then a live stream that keeps coming —
  // a false start waits for enough bytes to be disproved, as on a real link.
  const noisy = [0x00, 0xfd, 0x13, 0x37, ...FRAMES[0], 0x55, 0xfe, ...FRAMES[1], ...FRAMES.slice(2, 6).flat(), ...FRAMES.slice(0, 6).flat()];
  const out = [];
  for (const b of noisy) out.push(...parser.push(Uint8Array.of(b)));
  const names = out.map((m) => m.name);
  assert.deepEqual(names.slice(0, 2), ['HEARTBEAT', 'GLOBAL_POSITION_INT'], 'no real frame is swallowed by the noise');
  assert.equal(names.filter((n) => n === 'GLOBAL_POSITION_INT').length, 2);
});

test('a corrupted frame is rejected', () => {
  const bad = [...FRAMES[1]];
  bad[15] ^= 0xff;
  const parser = new MavlinkParser();
  assert.deepEqual(parser.push(Uint8Array.from(bad)), []);
  assert.ok(parser.stats.badCrc >= 1);
});

test('the fleet turns telemetry into an aircraft', () => {
  const fleet = new Fleet();
  const parser = new MavlinkParser();
  for (const m of parser.push(Uint8Array.from(FRAMES.flat()))) fleet.apply(m, 1000);
  const [v] = fleet.list(1500);
  assert.equal(fleet.list().length, 1, 'the ground-station heartbeat is not an aircraft');
  assert.equal(v.kind, 'Quadcopter');
  assert.equal(v.armed, true);
  assert.equal(v.mode, 'Loiter');
  assert.equal(v.state, 'active');
  assert.ok(Math.abs(v.lat - 34.5678901) < 1e-9);
  assert.ok(Math.abs(v.alt - 40.25) < 1e-9);
  assert.equal(v.battery, 76);
  assert.equal(v.sats, 14);
  assert.equal(v.fix, '3D');
  assert.equal(v.stale, false);
  assert.equal(fleet.list(9000)[0].stale, true);
});

test('mavlink2rest JSON lands in the same shape', () => {
  const fleet = new Fleet();
  fleet.apply(fromMavlink2Rest({ header: { system_id: 3, component_id: 1 }, message: { type: 'HEARTBEAT', custom_mode: 6, mavtype: { type: 'MAV_TYPE_QUADROTOR' }, autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' }, base_mode: { bits: 0x51 }, system_status: { type: 'MAV_STATE_STANDBY' }, mavlink_version: 3 } }));
  fleet.apply(fromMavlink2Rest({ header: { system_id: 3, component_id: 1 }, message: { type: 'GLOBAL_POSITION_INT', lat: 300000000, lon: -1000000000, relative_alt: 5000, vx: 0, vy: 0, vz: 0, hdg: 9000 } }));
  const [v] = fleet.list();
  assert.equal(v.kind, 'Quadcopter');
  assert.equal(v.mode, 'RTL');
  assert.equal(v.armed, false);
  assert.equal(v.state, 'standby');
  assert.equal(v.lat, 30);
  assert.equal(v.heading, 90);
  assert.equal(fromMavlink2Rest({}), null);
});

test('dispatch produces a plan for a pilot, and refuses nonsense', () => {
  const plan = inspectionPlan({ home: { lat: 34.6, lon: -120.4 }, target: { lat: 34.61, lon: -120.41 }, altitude: 45 });
  assert.equal(plan.fileType, 'Plan');
  assert.equal(plan.mission.firmwareType, 3, 'ArduPilot');
  assert.deepEqual(plan.mission.items.map((i) => i.command), [22, 16, 19, 20], 'takeoff, waypoint, loiter, return to launch');
  assert.equal(plan.mission.items[1].params[6], 45);
  assert.throws(() => inspectionPlan({ home: { lat: 1, lon: 1 }, target: { lat: 1, lon: 1 }, altitude: 300 }), /120 m/);
  assert.throws(() => inspectionPlan({ home: {}, target: { lat: 1, lon: 1 } }), /latitude/);
  // An empty field read as 0, 0 must not become a mission.
  assert.throws(() => inspectionPlan({ home: { lat: 34.6, lon: -120.4 }, target: { lat: 0, lon: 0 } }), /km from home/);
});

test('distance is great-circle metres', () => {
  const d = distance({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(d - 111195) < 50, `${d}`);
});
