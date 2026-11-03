/**
 * The Black Optic 6 AI stack: every piece of maths and every wire format,
 * checked against independent references — pymavlink for MAVLink frames, the
 * official Meshtastic protobufs for mesh frames, pyproj for UTM, python
 * multiformats + blake3 for content addresses, and the label file inside the
 * bundled YAMNet model.
 *
 * @module tests/black-optic-6/ai
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  calibrateMetric, calibrateTiltRelative, distanceAt, focalPx, groundInverseDepth, groundSamples, heightFromAnchor,
  horizonRowFor, robustLine, sampleAt, scaleDisparity, tiltFromOrientation,
} from '../../public/black-optic-6/js/ai/depth-calib.js';
import { groundPoint, horizonRow, pose } from '../../public/sentry/js/ground.js';
import { chooseLock, COCO, decodeYolo, fromTransformers, letterbox, nms, parseQueries, promptFor } from '../../public/black-optic-6/js/ai/detect.js';
import { bhattacharyya, IdRegistry, maskIou, maskStats, signature, bestMask } from '../../public/black-optic-6/js/ai/reid.js';
import { EventGate, RANCH_EVENTS, ranchScores } from '../../public/black-optic-6/js/ai/audio-classes.js';
import { analyse, staLta, triggers } from '../../public/black-optic-6/js/ai/geophone.js';
import { crc, MavlinkParser, Vehicle } from '../../public/black-optic-6/js/ai/mavlink.js';
import { decodeFromRadio, encodeText, encodeWantConfig, frame, FrameReader, nodeId, parseGate } from '../../public/black-optic-6/js/ai/meshtastic.js';
import { keyMatches, parseSample, positionOf, restUrl } from '../../public/black-optic-6/js/ai/zenoh.js';
import { FREE, lzfDecompress, OCCUPIED, occupancy, parsePCD, UNKNOWN } from '../../public/black-optic-6/js/ai/pcd.js';
import {
  boxAround, cellStats, coarseWindow, dryness, epsgFor, epsgOf, indices, pixelWindow, scaling, stacSearch, toUtm, utmBox, utmZone,
} from '../../public/black-optic-6/js/ai/ndvi.js';
import { autoIsotherm, hotspots, otsu } from '../../public/black-optic-6/js/ai/isotherm.js';
import {
  blake3Hex, blake3Bytes, canonical, cidV1Blake3, clipManifest, EvidenceChain, GENESIS,
} from '../../public/black-optic-6/js/ai/evidence.js';
import { chatRequest, parseQuestions, parseReply, ruleEvents, schemaFor, speedup, timings } from '../../public/black-optic-6/js/ai/vlm.js';
import { INSTALLS, STATUS } from '../../public/black-optic-6/js/ai/installs.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (±${tol})`);
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/* =================================================================== depth */

const P = { heightM: 3, tiltDeg: 20, fovDeg: 70, width: 320, height: 240 };

/** Ground depth map with optional objects standing on it (nearer than the ground behind). */
function groundMap(p, { metric = true, alpha = 2, beta = 0, objects = [] } = {}) {
  const data = new Float32Array(p.width * p.height);
  for (let v = 0; v < p.height; v += 1) {
    const inv = groundInverseDepth(p, v);
    for (let u = 0; u < p.width; u += 1) {
      let invZ = inv > 0 ? inv : 0;
      for (const o of objects) if (u >= o.u0 && u < o.u1 && v >= o.v0 && v < o.v1) invZ = 1 / o.z;
      data[v * p.width + u] = metric ? (invZ > 0 ? 1 / invZ : 0) : alpha * invZ + beta;
    }
  }
  return { data, width: p.width, height: p.height };
}

test('equation (1): ground inverse depth matches ground.js projection and crosses zero at its horizon', () => {
  const p = pose(P);
  const f = focalPx(P.width, P.fovDeg);
  for (const v of [140, 180, 239]) {
    const g = groundPoint(p, 160, v);
    // Optical-axis depth of that ground point = range projected on the axis.
    const yn = (v - P.height / 2) / f;
    const zAxis = g.rangeM / Math.hypot(1, 0, yn);
    close(1 / groundInverseDepth(P, v), zAxis, 1e-9, `row ${v}`);
  }
  close(horizonRowFor(P.tiltDeg, P.width, P.height, P.fovDeg), horizonRow(p), 1e-9);
  // Zero crossing of the line is the horizon.
  close(groundInverseDepth(P, horizonRow(p)), 0, 1e-12);
});

test('robust line ignores 25% gross outliers', () => {
  const xs = []; const ys = [];
  for (let i = 0; i < 200; i += 1) { xs.push(i / 10); ys.push(i % 4 === 0 ? 50 + i : 2 * (i / 10) + 1); }
  const l = robustLine(xs, ys);
  close(l.m, 2, 1e-6); close(l.c, 1, 1e-6);
  close(l.inliers, 0.75, 0.01);
});

test('metric depth model: auto-calibration recovers height AND tilt, despite sheep in the frame', () => {
  const map = groundMap(P, { objects: [{ u0: 40, u1: 90, v0: 150, v1: 215, z: 4 }, { u0: 200, u1: 230, v0: 170, v1: 239, z: 3.5 }] });
  const s = groundSamples(map, { step: 3 });
  const r = calibrateMetric(s, P);
  close(r.heightM, 3, 1e-6, 'height');
  close(r.tiltDeg, 20, 1e-6, 'tilt');
  close(r.horizonRow, horizonRow(pose(P)), 1e-4);
  assert.ok(r.inliers < 0.95 && r.inliers > 0.6, 'the objects were rejected as outliers');
});

test('relative model: tilt from the zero crossing, height from one tape-measured click', () => {
  for (const tilt of [8, 20, 35]) {
    const p = { ...P, tiltDeg: tilt };
    const map = groundMap(p, { metric: false, alpha: 3.7, objects: [{ u0: 100, u1: 150, v0: 160, v1: 230, z: 5 }] });
    const r = calibrateTiltRelative(groundSamples(map, { step: 3 }), p);
    close(r.tiltDeg, tilt, 1e-4, `tilt ${tilt}`); // map stored as float32
  }
  // A ground pixel the operator tapes at its true distance gives the height back.
  const g = groundPoint(pose(P), 250, 200);
  const known = Math.hypot(g.x, g.y);
  close(heightFromAnchor(P, 250, 200, known), 3, 1e-9);
  assert.equal(heightFromAnchor(P, 160, 10, 10), null, 'above the horizon there is no ground');
});

test('any pose: disparity is tied to metres, then a standing object reads its true distance', () => {
  const ewe = { u0: 150, u1: 175, v0: 150, v1: 200, z: 7 };
  const map = groundMap(P, { metric: false, alpha: 2.5, beta: 0.07, objects: [ewe] });
  const s = groundSamples(map, { step: 2 });
  const k = scaleDisparity(s, P);
  close(k.alpha, 2.5, 1e-6); close(k.beta, 0.07, 1e-6);
  const u = 160; const v = 170;
  const d = distanceAt(k, sampleAt(map, u, v, P.width, P.height), u, v, P);
  close(d.depthM, 7, 1e-5);
  const f = focalPx(P.width, P.fovDeg);
  close(d.rangeM, 7 * Math.hypot(1, (u - 160) / f, (v - 120) / f), 1e-5);
  assert.equal(distanceAt(k, k.beta, u, v, P), null, 'disparity at β is infinitely far: refused');
});

test('phone tilt from the orientation sensor', () => {
  assert.equal(tiltFromOrientation(90), 0);
  assert.equal(tiltFromOrientation(70), 20);
  assert.equal(tiltFromOrientation(0), 90);
  assert.equal(tiltFromOrientation(undefined), null);
});

/* =============================================================== detection */

test('typed queries are parsed into a clean list', () => {
  assert.deepEqual(parseQueries('bolt cutters, White  Truck,coyote ,, coyote'), ['bolt cutters', 'white truck', 'coyote']);
  assert.equal(parseQueries(Array(30).fill('x').map((x, i) => `${x}${i}`).join(',')).length, 12);
  assert.equal(promptFor('coyote'), 'a photo of a coyote');
  assert.equal(promptFor('an axe'), 'a photo of an axe');
});

test('NMS keeps the best box per object and per class', () => {
  const kept = nms([
    { box: [0, 0, 10, 10], score: 0.9, cls: 'sheep' },
    { box: [1, 1, 10, 10], score: 0.8, cls: 'sheep' },
    { box: [1, 1, 10, 10], score: 0.7, cls: 'dog' },
    { box: [50, 50, 10, 10], score: 0.6, cls: 'sheep' },
  ], 0.5);
  assert.deepEqual(kept.map((k) => k.score), [0.9, 0.7, 0.6]);
});

test('YOLOv8 head decodes back to frame pixels through the letterbox', () => {
  const lb = letterbox(1280, 720, 640);
  assert.equal(lb.scale, 0.5); assert.equal(lb.padY, 140); assert.equal(lb.padX, 0);
  const C = 80; const N = 3;
  const data = new Float32Array((4 + C) * N);
  const set = (c, i, v) => { data[c * N + i] = v; };
  // Anchor 0: a sheep (class 18) at frame box [400, 300, 100, 60].
  set(0, 0, (400 + 50) * 0.5); set(1, 0, (300 + 30) * 0.5 + 140); set(2, 0, 50); set(3, 0, 30); set(4 + 18, 0, 0.9);
  // Anchor 1: the same sheep, slightly worse — suppressed.
  set(0, 1, 226); set(1, 1, 305); set(2, 1, 50); set(3, 1, 30); set(4 + 18, 1, 0.6);
  // Anchor 2: below threshold.
  set(4 + 0, 2, 0.1);
  const out = decodeYolo(data, [1, 4 + C, N], lb);
  assert.equal(out.length, 1);
  assert.equal(out[0].cls, 'sheep');
  out[0].box.forEach((v, k) => close(v, [400, 300, 100, 60][k], 1e-4));
  // Channels-last layout gives the same answer.
  const t = new Float32Array(data.length);
  for (let c = 0; c < 4 + C; c += 1) for (let i = 0; i < N; i += 1) t[i * (4 + C) + c] = data[c * N + i];
  assert.deepEqual(decodeYolo(t, [1, N, 4 + C], lb).map((d) => d.cls), ['sheep']);
  assert.equal(COCO.length, 80);
});

test('transformers.js boxes become tracker boxes, and lock prefers what it already holds', () => {
  const d = fromTransformers([{ score: 0.4, label: 'a photo of a white truck', box: { xmin: 10, ymin: 20, xmax: 50, ymax: 40 } }], 2, 2);
  assert.deepEqual(d[0], { box: [20, 40, 80, 40], score: 0.4, cls: 'white truck' });
  const tracks = [{ id: 1, cls: 'coyote', score: 0.5 }, { id: 2, cls: 'coyote', score: 0.9 }, { id: 3, cls: 'sheep', score: 1 }];
  assert.equal(chooseLock(tracks, ['coyote']).id, 2);
  assert.equal(chooseLock(tracks, ['coyote'], 1).id, 1);
  assert.equal(chooseLock(tracks, ['bolt cutters']), null);
});

/* ==================================================================== reid */

function solid(w, h, rgb, patch) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const inPatch = patch && x >= patch[0] && x < patch[0] + patch[2] && y >= patch[1] && y < patch[1] + patch[3];
    const c = inPatch ? patch[4] : rgb;
    data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}

test('mask statistics and IoU', () => {
  const m = new Uint8Array(100); for (const i of [11, 12, 21, 22]) m[i] = 1;
  assert.deepEqual(maskStats(m, 10, 10), { area: 4, box: [1, 1, 2, 2], centroid: [1.5, 1.5] });
  const n = new Uint8Array(100); for (const i of [12, 22, 13, 23]) n[i] = 1;
  close(maskIou(m, n), 2 / 6, 1e-12);
  assert.equal(bestMask([0.2, 0.9, 0.5]), 1);
});

test('a persistent ID follows the same animal to another feed, not a different one', () => {
  const ewe = solid(40, 40, [30, 90, 30], [10, 10, 15, 12, [235, 232, 225]]); // white ewe on grass
  const mask = new Uint8Array(1600); for (let y = 10; y < 22; y += 1) for (let x = 10; x < 25; x += 1) mask[y * 40 + x] = 1;
  const sig = signature(ewe, mask);
  close(sig.reduce((s, v) => s + v, 0), 1, 1e-12);
  const reg = new IdRegistry();
  const id = reg.enrol(sig, 'Q7-gate', 'ewe');
  // Same ewe on P10, slightly darker light.
  const later = solid(30, 30, [40, 70, 40], [5, 5, 12, 10, [222, 219, 212]]);
  const m2 = new Uint8Array(900); for (let y = 5; y < 15; y += 1) for (let x = 5; x < 17; x += 1) m2[y * 30 + x] = 1;
  const hit = reg.match(signature(later, m2), 'P10-barn');
  assert.ok(hit && hit.entry.id === id.id, 'matched');
  assert.ok(hit.entry.seen['P10-barn']);
  // A red truck is not that ewe.
  const truck = solid(30, 30, [200, 30, 30]);
  assert.equal(reg.match(signature(truck, null), 'P10-barn'), null);
  assert.ok(bhattacharyya(sig, signature(truck, null)) < 0.2);
});

/* =================================================================== audio */

test('every mapped YAMNet label exists in the bundled model\'s label list', () => {
  const labels = new Set(fs.readFileSync(path.join(HERE, 'fixtures/yamnet_label_list.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean));
  assert.equal(labels.size, 521);
  for (const e of RANCH_EVENTS) {
    for (const l of e.labels) assert.ok(labels.has(l), `${e.id}: "${l}" is a YAMNet class`);
    assert.ok(['direct', 'proxy'].includes(e.kind));
  }
  assert.equal(RANCH_EVENTS.find((e) => e.id === 'boltcutters').kind, 'proxy', 'no AudioSet class for bolt cutters');
  assert.equal(RANCH_EVENTS.find((e) => e.id === 'coyote').kind, 'proxy', 'no AudioSet class for coyotes');
});

test('ranch scores and the event gate', () => {
  const s = ranchScores([{ categoryName: 'Gunshot, gunfire', score: 0.7 }, { categoryName: 'Howl', score: 0.2 }, { categoryName: 'Speech', score: 0.1 }]);
  assert.equal(s[0].id, 'gunshot'); assert.equal(s[0].top, 'Gunshot, gunfire');
  assert.equal(s.find((x) => x.id === 'coyote').score, 0.2);
  const gate = new EventGate({ on: 0.3, off: 0.15, window: 3, need: 2 });
  assert.deepEqual(gate.push([{ id: 'chainsaw', score: 0.5 }]).started, []);
  assert.deepEqual(gate.push([{ id: 'chainsaw', score: 0.6 }]).started, ['chainsaw']);
  gate.push([{ id: 'chainsaw', score: 0.1 }]); gate.push([{ id: 'chainsaw', score: 0.1 }]);
  assert.deepEqual(gate.push([{ id: 'chainsaw', score: 0.05 }]).ended, ['chainsaw']);
});

/* ================================================================ geophone */

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; }; }

test('STA/LTA triggers on a burst and not on steady noise', () => {
  const fs_ = 60; const r = rng(7);
  const quiet = Float64Array.from({ length: 60 * 30 }, () => r() * 0.01);
  assert.equal(triggers(staLta(quiet, fs_)).length, 0);
  const burst = Float64Array.from(quiet);
  for (let i = 0; i < 30; i += 1) burst[60 * 20 + i] += Math.sin(i) * 0.3;
  assert.equal(triggers(staLta(burst, fs_)).length, 1);
});

test('footsteps, a vehicle and an impact are told apart', () => {
  const fs_ = 60; const r = rng(3);
  const base = () => Float64Array.from({ length: fs_ * 40 }, () => r() * 0.004);
  const steps = base();
  for (let k = 0; k < 14; k += 1) { // 2 steps/s for 7 s from t = 15 s
    const at = Math.round((15 + k * 0.5) * fs_);
    for (let i = 0; i < 9; i += 1) steps[at + i] += Math.sin((2 * Math.PI * 15 * i) / fs_) * 0.08 * Math.exp(-i / 3);
  }
  const s = analyse(steps, fs_);
  assert.equal(s.length, 1, JSON.stringify(s.map((x) => [x.start, x.end])));
  assert.equal(s[0].label, 'footsteps');
  close(s[0].cadenceHz, 2, 0.15);

  const truck = base();
  for (let i = 0; i < fs_ * 9; i += 1) truck[fs_ * 15 + i] += Math.sin((2 * Math.PI * 12 * i) / fs_) * 0.05 * (1 + 0.2 * Math.sin(i / 7));
  const t = analyse(truck, fs_);
  assert.equal(t[0].label, 'vehicle or machinery');
  close(t[0].dominantHz, 12, 0.5);

  const bang = base();
  for (let i = 0; i < 12; i += 1) bang[fs_ * 20 + i] += Math.sin(i * 1.7) * 0.2 * Math.exp(-i / 4);
  assert.equal(analyse(bang, fs_)[0].label, 'impact');
});

/* ================================================================= MAVLink */

// Frames produced by pymavlink 2.4.50 (common dialect, sys 1, comp 1).
const MAV = {
  heartbeat: 'fd09000000010100000000000000020c5104031b74',
  position: 'fd1c000000010121000040e20100e803f316d8970bb714530200a87500007800d3fff6ff5a2304d3',
  attitude: 'fd1c00000001011e000088130000cdcc4c3dcdccccbdb30cc93f00000000000000000ad7233cac44',
  gps: 'fd1e0000000101180000c09ee60500000000e803f316d8970bb7145302007800c80059012823030e22b1',
  hud: 'fd1300000001014a000000009040cdcc8c40c3f5f041cdcc4c3e5a00377eac',
  v1heartbeat: 'fe090001010000000000020c51040381b7',
};

test('MAVLink: pymavlink frames parse, CRCs check, truncated v2 payloads are restored', () => {
  const parser = new MavlinkParser();
  const all = fromHex(Object.values(MAV).join(''));
  // Feed it in awkward pieces, the way a serial port delivers.
  const msgs = [];
  for (let i = 0; i < all.length; i += 7) msgs.push(...parser.push(all.subarray(i, i + 7)));
  assert.deepEqual(msgs.map((m) => m.name), ['HEARTBEAT', 'GLOBAL_POSITION_INT', 'ATTITUDE', 'GPS_RAW_INT', 'VFR_HUD', 'HEARTBEAT']);
  assert.equal(parser.stats.badCrc, 0);
  const [hb, pos, att, gps, hud, hb1] = msgs;
  assert.equal(hb.fields.autopilot, 12); assert.equal(hb.fields.type, 2); assert.equal(hb.fields.armed, false); assert.equal(hb.fields.baseMode, 81);
  assert.equal(hb1.version, 1);
  close(pos.fields.lat, 38.5025, 1e-9); close(pos.fields.lon, -122.3977, 1e-9);
  close(pos.fields.altMslM, 152.34, 1e-9); close(pos.fields.relAltM, 30.12, 1e-9);
  close(pos.fields.vxMps, 1.2, 1e-12); close(pos.fields.vyMps, -0.45, 1e-12); close(pos.fields.headingDeg, 90.5, 1e-12);
  close(att.fields.yawDeg, (1.5707 * 180) / Math.PI, 1e-4);
  assert.equal(gps.fields.fixType, 3); assert.equal(gps.fields.satellites, 14); close(gps.fields.groundSpeedMps, 3.45, 1e-12); close(gps.fields.cogDeg, 90, 1e-12);
  close(hud.fields.altM, 30.12, 1e-5); assert.equal(hud.fields.headingDeg, 90);
  const v = new Vehicle();
  let fix = null;
  for (const m of msgs) fix = v.apply(m, 1000) ?? fix;
  close(fix.altitudeM, 30.12, 1e-9); close(fix.speedMps, Math.hypot(1.2, 0.45), 1e-12); close(fix.climbMps, 0.1, 1e-12);
  assert.match(v.describe(), /PX4 quadrotor, system 1, disarmed · GPS 3D, 14 sats/);
});

test('MAVLink: a corrupted byte is rejected by the CRC and the stream resynchronises', () => {
  const bad = fromHex(MAV.position); bad[20] ^= 0xff;
  const parser = new MavlinkParser();
  const msgs = parser.push(Uint8Array.from([...bad, ...fromHex(MAV.heartbeat)]));
  assert.deepEqual(msgs.map((m) => m.name), ['HEARTBEAT']);
  assert.equal(parser.stats.badCrc, 1);
  // CRC_EXTRA matters: the same bytes with another seed do not check.
  const hb = fromHex(MAV.heartbeat);
  assert.notEqual(crc(hb, 1, 19, 51), hb[19] | (hb[20] << 8));
  assert.equal(crc(hb, 1, 19, 50), hb[19] | (hb[20] << 8));
});

/* ============================================================== Meshtastic */

test('Meshtastic: encodes byte-for-byte what the official library does', () => {
  const t = encodeText('gate 3 open', { id: 0x12345678, hopLimit: 3, wantAck: true });
  assert.equal(toHex(t), '0a1f15ffffffff220f0801120b676174652033206f70656e357856341248035001');
  assert.equal(toHex(encodeWantConfig(42)), '182a');
  assert.deepEqual(Array.from(frame(Uint8Array.from([1, 2, 3]))), [0x94, 0xc3, 0, 3, 1, 2, 3]);
  assert.throws(() => encodeText('x'.repeat(201)));
});

test('Meshtastic: decodes text packets and node info, skipping debug log bytes', () => {
  const pkt = fromHex('080712250d0d0c0b0a15ffffffff220f0801120b476174652033204f50454e3563000000450000d040');
  const reader = new FrameReader();
  const stream = Uint8Array.from([...new TextEncoder().encode('DEBUG boot\n'), ...frame(pkt), ...frame(fromHex('1a05088d98ac50'))]);
  const { frames, log } = reader.push(stream.subarray(0, 20));
  const rest = reader.push(stream.subarray(20));
  const all = [...frames, ...rest.frames];
  assert.equal(all.length, 2);
  assert.match(log, /DEBUG boot/);
  const msg = decodeFromRadio(all[0]);
  assert.equal(msg.kind, 'packet');
  assert.equal(msg.packet.from, 0x0a0b0c0d); assert.equal(msg.packet.to, 0xffffffff);
  assert.equal(msg.packet.text, 'Gate 3 OPEN'); assert.equal(msg.packet.id, 99); close(msg.packet.rxSnr, 6.5, 1e-9);
  assert.equal(nodeId(msg.packet.from), '!0a0b0c0d');
  const info = decodeFromRadio(all[1]);
  assert.equal(info.kind, 'myInfo'); assert.equal(info.myNodeNum, 0x0a0b0c0d);
  assert.deepEqual(parseGate('Gate 3 OPEN'), { gate: '3', state: 'open' });
  assert.deepEqual(parseGate('north gate is closed'), null, 'gate name must follow the word gate');
  assert.deepEqual(parseGate('gate north closed'), { gate: 'north', state: 'closed' });
  assert.equal(parseGate('feeding done'), null);
});

/* =================================================================== Zenoh */

test('Zenoh key expressions, REST samples and positions', () => {
  assert.ok(keyMatches('ranch/**', 'ranch/x500/position'));
  assert.ok(keyMatches('ranch/*/position', 'ranch/x500/position'));
  assert.ok(!keyMatches('ranch/*/position', 'ranch/a/b/position'));
  assert.ok(keyMatches('ranch/**/position', 'ranch/position'));
  assert.ok(keyMatches('ranch/gate$*/state', 'ranch/gate3/state'));
  assert.ok(!keyMatches('ranch/gate$*/state', 'ranch/fence3/state'));
  assert.equal(restUrl('https://router.local:8000/', '/ranch/**'), 'https://router.local:8000/ranch/**');
  const s = parseSample(JSON.stringify({ key: 'ranch/x500/position', value: JSON.stringify({ lat: 385025000, lon: -1223977000, relative_alt: 30 }), encoding: 'application/json' }));
  assert.equal(s.key, 'ranch/x500/position');
  const p = positionOf(s.value);
  close(p.lat, 38.5025, 1e-9); close(p.lon, -122.3977, 1e-9); assert.equal(p.altitudeM, 30);
  assert.equal(parseSample('not json'), null);
  assert.equal(positionOf({ lat: 'x' }), null);
});

/* ===================================================================== PCD */

test('PCD: ascii, binary and LZF-compressed files parse to the same points', () => {
  const pts = [[0, 0, 0], [1.5, -2, 0.25], [3, 4, 1.75]];
  const head = (data, n = 3) => `# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH ${n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS ${n}\nDATA ${data}\n`;
  const ascii = new TextEncoder().encode(head('ascii') + pts.map((p) => `${p.join(' ')} 7`).join('\n'));
  const a = parsePCD(ascii);
  assert.deepEqual(Array.from(a.points), pts.flat());

  const body = new DataView(new ArrayBuffer(16 * 3));
  pts.forEach((p, i) => { p.forEach((v, k) => body.setFloat32(i * 16 + k * 4, v, true)); body.setFloat32(i * 16 + 12, 7, true); });
  const bin = new Uint8Array([...new TextEncoder().encode(head('binary')), ...new Uint8Array(body.buffer)]);
  assert.deepEqual(Array.from(parsePCD(bin).points), pts.flat());

  // binary_compressed: columns (all x, all y, all z, all intensity), LZF literal runs.
  const cols = new DataView(new ArrayBuffer(48));
  for (let f = 0; f < 4; f += 1) for (let i = 0; i < 3; i += 1) cols.setFloat32(f * 12 + i * 4, f < 3 ? pts[i][f] : 7, true);
  const raw = new Uint8Array(cols.buffer);
  const lzf = [];
  for (let i = 0; i < raw.length; i += 32) { const run = raw.subarray(i, i + 32); lzf.push(run.length - 1, ...run); }
  const sizes = new DataView(new ArrayBuffer(8)); sizes.setUint32(0, lzf.length, true); sizes.setUint32(4, raw.length, true);
  const comp = new Uint8Array([...new TextEncoder().encode(head('binary_compressed')), ...new Uint8Array(sizes.buffer), ...lzf]);
  assert.deepEqual(Array.from(parsePCD(comp).points), pts.flat());
});

test('LZF back-references (overlapping copies) decode exactly', () => {
  // "abc" literal, then copy 6 bytes from 3 back → "abcabcabc".
  assert.equal(new TextDecoder().decode(lzfDecompress(Uint8Array.from([2, 97, 98, 99, 4 << 5, 2]), 9)), 'abcabcabc');
  assert.throws(() => lzfDecompress(Uint8Array.from([2, 97, 98, 99]), 9));
});

test('occupancy: pasture is free, a post is occupied, the unseen is unknown', () => {
  const pts = [];
  for (let x = 0; x < 10; x += 0.25) for (let y = 0; y < 4; y += 0.25) if (!(x > 6 && y > 2)) pts.push(x, y, 0.02 * x); // gently sloping ground, a gap
  for (let z = 0; z < 2; z += 0.1) pts.push(5.1, 1.1, 0.1 + z); // a post
  const g = occupancy(Float32Array.from(pts), { cell: 0.5 });
  const at = (x, y) => g.grid[Math.floor((y - g.minY) / g.cell) * g.cols + Math.floor((x - g.minX) / g.cell)];
  assert.equal(at(5.1, 1.1), OCCUPIED);
  assert.equal(at(2, 2), FREE, 'the slope is ground, not an obstacle');
  assert.equal(at(8, 3.5), UNKNOWN);
  assert.equal(g.counts.occupied, 1);
});

/* ============================================================= Sentinel-2 */

test('UTM matches pyproj to a tenth of a millimetre', () => {
  // [lat, lon, EPSG, easting, northing] from pyproj 3 (EPSG:4326 → UTM).
  const ref = [
    [38.5025, -122.3977, 32610, 552517.6835, 4261742.6803],
    [-33.8688, 151.2093, 32756, 334368.6336, 6250948.3454],
    [0.0001, -122.9, 32610, 511127.5020, 11.0530],
    [64.1, -21.9, 32627, 456137.5541, 7108467.4170],
    [38.5, -119.2, 32610, 831407.0544, 4268140.4135], // far from the central meridian, forced zone
  ];
  for (const [lat, lon, epsg, e, n] of ref) {
    const zone = epsg % 100; const north = epsg < 32700;
    const r = toUtm(lat, lon, zone, north);
    close(r.easting, e, 1e-4, `E ${lat},${lon}`); close(r.northing, n, 1e-4, `N ${lat},${lon}`);
  }
  assert.equal(utmZone(38.5, -122.4), 10); assert.equal(utmZone(60, 5), 32); assert.equal(utmZone(78, 15), 33);
  assert.equal(epsgFor(10, true), 32610); assert.equal(epsgFor(56, false), 32756);
  const box = utmBox(boxAround(38.5025, -122.3977, 500), 10, true);
  close(box.maxN - box.minN, 1000, 5); close(box.maxE - box.minE, 1000, 15);
});

test('STAC query, reflectance scaling and the pixel window', () => {
  const q = stacSearch([-122.4, 38.5, -122.39, 38.51], { days: 30, maxCloud: 20, now: new Date('2026-11-01T00:00:00Z') });
  assert.deepEqual(q.collections, ['sentinel-2-l2a']);
  assert.equal(q.datetime, '2026-10-02T00:00:00.000Z/2026-11-01T00:00:00.000Z');
  assert.deepEqual(q.query, { 'eo:cloud_cover': { lt: 20 } });
  assert.deepEqual(scaling({}, { 'raster:bands': [{ scale: 0.0001, offset: -0.1 }] }), { scale: 0.0001, offset: -0.1, source: 'item raster:bands' });
  assert.equal(scaling({ properties: { 's2:processing_baseline': '05.11' } }, {}).offset, -0.1);
  assert.equal(scaling({ properties: { 's2:processing_baseline': '03.01' } }, {}).offset, 0);
  assert.equal(epsgOf({ properties: { 'proj:epsg': 32610 } }), 32610);
  assert.equal(epsgOf({ properties: { 'proj:code': 'EPSG:32610' } }), 32610);
  // A 10 m tile whose top-left corner is (499980, 4300020).
  assert.deepEqual(pixelWindow({ minE: 552000, maxE: 553000, minN: 4261000, maxN: 4262000 }, [499980, 4300020], [10, -10], 10980, 10980), [5202, 3802, 5302, 3902]);
  assert.deepEqual(coarseWindow([5203, 3801, 5303, 3901]), [2601, 1900, 2652, 1951]);
  assert.equal(pixelWindow({ minE: 0, maxE: 10, minN: 0, maxN: 10 }, [499980, 4300020], [10, -10], 10980, 10980), null);
});

test('NDVI and NDMI use reflectance (offset applied) and SCL masks cloud', () => {
  const cal = { scale: 1e-4, offset: -0.1 };
  // 2×2 at 10 m, 1×1 at 20 m. Grass: red ρ 0.05 → DN 1500; NIR ρ 0.40 → DN 5000; SWIR ρ 0.20 → DN 3000.
  const r = indices({ red: [1500, 1500, 1500, 0], nir: [5000, 5000, 5000, 0], swir: [3000], scl: [4], width: 2, height: 2, coarseWidth: 1, coarseHeight: 1, cal });
  close(r.ndvi[0], (0.4 - 0.05) / 0.45, 1e-6); // float32 raster
  close(r.ndmi[0], (0.4 - 0.2) / 0.6, 1e-6);
  assert.ok(Number.isNaN(r.ndvi[3]), 'no-data stays empty');
  close(r.clearFraction, 0.75, 1e-12);
  // Ignoring the offset would have given a different, wrong NDVI.
  assert.ok(Math.abs(r.ndvi[0] - (5000 - 1500) / 6500) > 0.2);
  // Odd window origin: 10 m column 5203 sits in 20 m column 2601, local 0; 5204 → 2602, local 1.
  const odd = indices({ red: [1500, 1500, 1500], nir: [5000, 5000, 5000], swir: [3000, 1000], scl: [4, 4], width: 3, height: 1, coarseWidth: 2, coarseHeight: 1, fineOrigin: [5203, 0], cal });
  close(odd.ndmi[0], (0.4 - 0.2) / 0.6, 1e-6);
  close(odd.ndmi[1], (0.4 - 0.0) / 0.4, 1e-6);
  close(odd.ndmi[2], (0.4 - 0.0) / 0.4, 1e-6);
  const cloudy = indices({ red: [1500], nir: [5000], swir: [3000], scl: [9], width: 1, height: 1, coarseWidth: 1, coarseHeight: 1, cal });
  assert.ok(Number.isNaN(cloudy.ndvi[0]));
  const grid = new Float32Array(16).fill(0.6); grid[0] = 0.1; grid[1] = 0.1; grid[4] = 0.1; grid[5] = 0.1;
  const cs = cellStats(grid, 4, 4, 2, 2);
  assert.deepEqual([cs.worst[0].col, cs.worst[0].row], [0, 0]);
  close(cs.worst[0].mean, 0.1, 1e-6);
  assert.equal(dryness(0.3, -0.3).level, 'very dry');
  assert.equal(dryness(0.7, 0.3).level, 'wet');
  assert.equal(dryness(NaN, NaN).level, 'unknown');
});

/* ================================================================ isotherm */

test('Otsu finds the gap between cool grass and a warm animal, and refuses noise', () => {
  const w = 40; const h = 30; const r = rng(11);
  const field = new Float32Array(w * h);
  for (let i = 0; i < field.length; i += 1) field[i] = 0.3 + r() * 0.1;
  for (let y = 5; y < 12; y += 1) for (let x = 5; x < 14; x += 1) field[y * w + x] = 0.8 + r() * 0.05;
  for (let y = 20; y < 25; y += 1) for (let x = 30; x < 34; x += 1) field[y * w + x] = 0.78 + r() * 0.05;
  const o = otsu(field);
  assert.ok(o.threshold > 0.36 && o.threshold < 0.77, `threshold ${o.threshold}`);
  assert.ok(o.separability > 0.9);
  const spots = hotspots(field, w, h, o.threshold);
  assert.equal(spots.length, 2);
  assert.deepEqual(spots[0].box, [5, 5, 9, 7]);
  assert.ok(autoIsotherm(field).usable);
  const noise = Float32Array.from({ length: 1200 }, () => 0.5 + r());
  assert.equal(autoIsotherm(noise).usable, false);
});

test('hot-spot labelling merges a U shape into one region', () => {
  const w = 5; const f = new Float32Array(25);
  for (const [x, y] of [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 1], [4, 0]]) f[y * w + x] = 1;
  const s = hotspots(f, 5, 5, 0.5, 1);
  assert.equal(s.length, 1); assert.equal(s[0].area, 9);
});

/* ================================================================ evidence */

test('BLAKE3 and the IPFS content address match the reference implementations', () => {
  assert.equal(blake3Hex('abc'), '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85');
  assert.equal(blake3Hex(''), 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
  // python: multiformats CID('base32', 1, 'raw', multihash.wrap(blake3(b'black optic 6'), 'blake3'))
  assert.equal(cidV1Blake3(blake3Bytes('black optic 6')), 'bafkr4ibe7zjhqdp7np4m2t33nn7lpdpr3usidyzblm2o2pur22ogqtv4ey');
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 0 }] }), '{"a":[2,{"c":0,"d":1}],"b":1}');
});

test('the hash chain verifies, and any edit, drop or reorder breaks it at that point', () => {
  const chain = new EvidenceChain();
  assert.equal(chain.head, GENESIS);
  for (let s = 0; s < 6; s += 1) chain.appendChunk(Uint8Array.from([s, s + 1, s + 2]), 1000 * s);
  chain.append('vlm', { frame: blake3Hex('jpeg'), prompt: 'Is a gate open?', reply: '{"answers":[]}' });
  assert.deepEqual(EvidenceChain.verify(chain.entries), { ok: true, brokenAt: null, reason: '7 entries verified' });
  const edited = chain.entries.map((e) => ({ ...e })); edited[3].bytes = 999;
  assert.equal(EvidenceChain.verify(edited).brokenAt, 3);
  const dropped = chain.entries.filter((_, i) => i !== 2);
  assert.equal(EvidenceChain.verify(dropped).brokenAt, 2);
  const swapped = [...chain.entries]; [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal(EvidenceChain.verify(swapped).brokenAt, 1);
  // A trimmed tail verifies from its own first link.
  const tail = chain.entries.slice(3);
  assert.equal(EvidenceChain.verify(tail, tail[0].prev, 3).ok, true);
  assert.equal(EvidenceChain.verify(tail).ok, false);
  const win = chain.window(1000, 3000);
  assert.deepEqual(win.map((e) => e.index), [1, 2, 3]);
  const m = clipManifest(Uint8Array.from([1, 2, 3]), win, { reason: 'test', atMs: 2000, mime: 'video/mp4' });
  assert.equal(m.blake3, blake3Hex(Uint8Array.from([1, 2, 3])));
  assert.match(m.cid, /^bafkr4i/);
  assert.equal(m.chain.head, win[2].link);
});

/* ===================================================================== VLM */

test('ask once: one request, a schema with one answer per question, robust parsing', () => {
  const qs = parseQuestions('Is a sheep down?\n\n Is the gate open? \nIs anyone by the tractor?');
  assert.equal(qs.length, 3);
  const body = chatRequest({ model: 'gemma3:4b', questions: qs, imageBase64: 'AAAA' });
  assert.equal(body.stream, false);
  assert.equal(body.messages.length, 1);
  assert.deepEqual(body.messages[0].images, ['AAAA']);
  assert.equal(body.format.properties.answers.minItems, 3);
  assert.deepEqual(schemaFor(2).properties.answers.items.properties.answer.enum, ['yes', 'no', 'unsure']);
  assert.match(body.messages[0].content, /1\. Is a sheep down\?\n2\. Is the gate open\?/);
  const reply = { message: { content: JSON.stringify({ answers: [{ answer: 'NO', evidence: 'All standing.' }, { answer: 'yes', evidence: 'Gate swung in.' }] }) }, total_duration: 2.5e9, eval_count: 40 };
  const p = parseReply(reply, qs);
  assert.equal(p.wellFormed, false, 'one answer missing');
  assert.deepEqual(p.answers.map((a) => a.answer), ['no', 'yes', 'unsure']);
  assert.deepEqual(ruleEvents(p.answers), [{ title: 'Is the gate open', detail: 'Gate swung in.' }]);
  assert.deepEqual(parseReply({ message: { content: 'garbage' } }, qs).answers.map((a) => a.answer), ['unsure', 'unsure', 'unsure']);
  assert.equal(timings(reply).totalMs, 2500);
  close(speedup(1000, [800, 900, 700]), 2.4, 1e-12);
});

/* ================================================================== ledger */

test('the install ledger covers every requested repo with a real status', () => {
  const repos = INSTALLS.map((i) => i.repo).join(' | ');
  for (const name of ['Depth-Anything-V2', 'Depth-Anything-3', 'GroundingDINO', 'nanoowl', 'nanosam', 'sam2', 'ultralytics', 'zenoh', 'foxglove', 'PX4', 'LIO-SAM', 'YAMNet', 'BirdNET', 'meshtastic', 'torchgeo', 'purethermal', 'noble-hashes', 'js-ipfs', 'ollama', 'langchain', 'glance-speedlab', 'whisper', 'Florence-2', 'Sentry', 'SpaceX', 'OSIRIS', 'OpenGridWorks', 'VistaView']) {
    assert.ok(repos.toLowerCase().includes(name.toLowerCase()), name);
  }
  for (const i of INSTALLS) {
    assert.ok(STATUS[i.status], i.repo);
    assert.ok(i.what.length > 40 && i.licence, i.repo);
  }
  assert.match(INSTALLS.find((i) => /ultralytics/.test(i.repo)).licence, /AGPL/);
});
