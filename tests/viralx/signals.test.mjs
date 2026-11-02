/**
 * ViralX signal timeline, shot DNA and the Camera Lab's lens maths.
 * @module tests/viralx/signals
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { shotSize, dominantTilt, isDutch, signalTimeline, attentionDips, SIGNALS } from '../../public/viralx/js/core.js';
import { TECHNIQUES, fov, otsPosition, recommend, CHEST, B } from '../../public/viralx/js/techniques.js';

/** Smooth stripes whose edges run at `deg` degrees from horizontal. */
function stripes(w, h, deg) {
  const d = new Uint8ClampedArray(w * h * 4), a = (deg * Math.PI) / 180;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = 128 + 100 * Math.sin((2 * Math.PI * (-x * Math.sin(a) + y * Math.cos(a))) / 14); // anti-aliased, like real footage
    const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}

test('shotSize buckets by face height', () => {
  assert.equal(shotSize(0).code, 'WS');
  assert.equal(shotSize(0.05).code, 'WS');
  assert.equal(shotSize(0.1).code, 'MS');
  assert.equal(shotSize(0.2).code, 'MCU');
  assert.equal(shotSize(0.3).code, 'CU');
  assert.equal(shotSize(0.6).code, 'ECU');
});

test('dominantTilt reads level stripes as 0° and rolled stripes as the roll', () => {
  assert.ok(Math.abs(dominantTilt(stripes(160, 120, 0), 160, 120).tilt) <= 1.5);
  for (const deg of [12, 20, -18]) {
    const t = dominantTilt(stripes(200, 160, deg), 200, 160);
    assert.ok(Math.abs(t.tilt - deg) <= 2.5, `${deg} → ${t.tilt}`);
    assert.ok(isDutch(t), `${deg} should be dutch`);
  }
  assert.equal(isDutch(dominantTilt(stripes(160, 120, 2), 160, 120)), false);
  assert.deepEqual(dominantTilt(new Uint8ClampedArray(64 * 64 * 4).fill(128), 64, 64), { tilt: 0, confidence: 0 });
});

const stats = { luma: 0.5, contrast: 0.3, saturation: 0.4, colorfulness: 40, sharpness: 150 };
const frame = (t, o = {}) => ({ t, diff: 0.01, faceH: 0, stats, ...o });

test('signalTimeline: busy, close, loud moments score higher; values stay 0–1', () => {
  const frames = [];
  for (let t = 0; t < 10; t += 0.5) frames.push(t < 5 ? frame(t) : frame(t, { diff: 0.07, faceH: 0.45 }));
  const curve = Array.from({ length: 100 }, (_, i) => (i < 50 ? -40 : -14));
  const T = signalTimeline(frames, curve, { duration: 10, cuts: [6, 8], bins: 10 });
  assert.deepEqual(Object.keys(T.rows), SIGNALS.map((s) => s.key));
  for (const k of Object.keys(T.rows)) for (const v of T.rows[k]) assert.ok(v >= 0 && v <= 1, `${k} ${v}`);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const k of ['attention', 'emotion', 'energy', 'pacing']) assert.ok(mean(T.rows[k].slice(5)) > mean(T.rows[k].slice(0, 5)), k);
  assert.ok(T.trend.attention > 0 && T.trend.energy > 0);
  for (const v of Object.values(T.totals)) assert.ok(v >= 0 && v <= 100);
});

test('signalTimeline works with no audio and fills empty bins', () => {
  const T = signalTimeline([frame(0), frame(9)], [], { duration: 10, bins: 20 });
  assert.equal(T.rows.energy.length, 20);
  assert.ok(T.rows.energy.every(Number.isFinite));
});

test('attentionDips finds sustained sags only', () => {
  const times = [0, 1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(attentionDips(times, [0.6, 0.2, 0.2, 0.2, 0.6, 0.1, 0.6, 0.6]), [{ from: 1, to: 3 }]);
  assert.deepEqual(attentionDips(times, [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.1, 0.1]), [{ from: 6, to: 7 }]);
});

test('fov: full-frame vertical field of view', () => {
  assert.ok(Math.abs(fov(24) - 53.13) < 0.01);
  assert.ok(Math.abs(fov(50) - 27.0) < 0.05);
  assert.ok(fov(85) < fov(24));
});

const ts = Array.from({ length: 101 }, (_, i) => i / 100);
const size = (s) => s.focal / Math.hypot(s.pos[0] - s.look[0], s.pos[1] - s.look[1], s.pos[2] - s.look[2]);

test('every technique gives a finite, sane camera for the whole move', () => {
  assert.equal(TECHNIQUES.length, 15);
  assert.equal(new Set(TECHNIQUES.map((t) => t.id)).size, 15);
  for (const T of TECHNIQUES) {
    assert.ok(T.name && T.feeling && T.lens && T.why.length >= 2 && T.phone, T.id);
    for (const t of ts) {
      const s = T.shot(t);
      assert.ok([...s.pos, ...s.look, s.focal, s.roll].every(Number.isFinite), `${T.id} @${t}`);
      assert.ok(s.focal >= 16 && s.focal <= 135, `${T.id} focal ${s.focal}`);
      assert.ok(s.pos[1] > 0.1, `${T.id} under the floor @${t}`);
    }
  }
});

test('techniques that keep the 180° line never cross it', () => {
  for (const T of TECHNIQUES.filter((x) => x.keepLine)) for (const t of ts) assert.ok(T.shot(t).pos[2] >= -1e-9, `${T.id} crosses @${t}`);
});

test('Invisible Master: chest height (44"), 15° off the line, 75mm then 32mm', () => {
  const T = TECHNIQUES.find((x) => x.id === 'invisible-master');
  assert.ok(Math.abs(CHEST - 44 * 0.0254) < 0.005);
  const p = otsPosition(15);
  assert.ok(Math.abs((Math.atan2(p[2], B[0] - p[0]) * 180) / Math.PI - 15) < 1e-9);
  assert.equal(T.shot(0.1).pos[1], CHEST);
  assert.equal(T.shot(0.25).focal, 75); assert.equal(T.shot(0.75).focal, 32);
});

test('Dolly zoom keeps the subject the same size while the lens changes', () => {
  const T = TECHNIQUES.find((x) => x.id === 'dolly-zoom');
  const s0 = size(T.shot(0));
  for (const t of ts) assert.ok(Math.abs(size(T.shot(t)) / s0 - 1) < 0.01, `@${t}`);
  assert.ok(T.shot(1).focal > 2.5 * T.shot(0).focal);
});

test('Impex: the 24→85mm swap keeps the framing identical, so no cut shows', () => {
  const T = TECHNIQUES.find((x) => x.id === 'impex');
  const before = T.shot(0.4999), after = T.shot(0.5);
  assert.equal(before.focal, 24); assert.equal(after.focal, 85);
  assert.ok(Math.abs(size(after) / size(before) - 1) < 0.02, `${size(before)} vs ${size(after)}`);
});

test('Parallax drift frames the subject the same at 32mm and 75mm', () => {
  const T = TECHNIQUES.find((x) => x.id === 'parallax');
  const a = T.shot(0.0), b = T.shot(0.5);
  assert.equal(a.focal, 32); assert.equal(b.focal, 75);
  assert.ok(Math.abs(size(a) / size(b) - 1) < 0.02);
});

test('recommend suggests close-ups for an all-wide clip and never more than 3', () => {
  const r = recommend(Array(10).fill({ code: 'WS' }), 0);
  assert.ok(r.length <= 3 && r.some((x) => x.id === 'ecu'));
  for (const x of r) assert.ok(TECHNIQUES.some((t) => t.id === x.id));
});
