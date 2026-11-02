/**
 * VIRALFORGE scoring maths, checked without a browser.
 * @module tests/viralforge/core
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  frameStats, frameDiff, detectCuts, kmeansPalette, rmsDb, loudnessCurve, soundOnset, hookScore, postScore,
  captionQuality, thumbHeuristic, chunkCaptions, captionAt, cropRect, SmoothCam, fillHooks, hashtags, lexSentiment,
  postingPlan, toICS, velocity, titlePatterns, HOOK_TEMPLATES,
} from '../../public/viralforge/js/core.js';

const solid = (w, h, [r, g, b]) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return d; };
const checker = (w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (x + y) % 2 ? 255 : 0; const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } return d; };

test('frameStats: flat grey is dull and soft, a checkerboard is contrasty and sharp', () => {
  const g = frameStats(solid(16, 16, [128, 128, 128]), 16, 16);
  assert.ok(Math.abs(g.luma - 128 / 255) < 1e-3);
  assert.ok(g.contrast < 1e-6 && g.sharpness < 1e-6); assert.equal(g.saturation, 0);
  const c = frameStats(checker(16, 16), 16, 16);
  assert.ok(c.contrast > 0.9 && c.sharpness > 1000);
  const red = frameStats(solid(8, 8, [255, 0, 0]), 8, 8);
  assert.equal(red.saturation, 1); assert.ok(red.colorfulness > 50);
});

test('frameDiff and detectCuts: a jump is a cut, steady drift is not', () => {
  assert.equal(frameDiff(solid(4, 4, [0, 0, 0]), solid(4, 4, [0, 0, 0])), 0);
  assert.ok(Math.abs(frameDiff(solid(4, 4, [0, 0, 0]), solid(4, 4, [255, 255, 255])) - 1) < 1e-6);
  const times = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];
  assert.deepEqual(detectCuts([0, 0.02, 0.02, 0.6, 0.02, 0.02, 0.03, 0.02], times), [0.75]);
  assert.deepEqual(detectCuts([0, 0.05, 0.05, 0.06, 0.05, 0.05, 0.06, 0.05], times), []);
});

test('kmeansPalette finds two colours in a half-and-half image, in share order, deterministically', () => {
  const d = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) { const red = i < 70; d[i * 4] = red ? 250 : 10; d[i * 4 + 1] = 10; d[i * 4 + 2] = red ? 10 : 240; d[i * 4 + 3] = 255; }
  const p = kmeansPalette(d, 2, { stride: 1 });
  assert.equal(p.length, 2);
  assert.equal(p[0].hex, '#fa0a0a'); assert.ok(Math.abs(p[0].share - 0.7) < 1e-9);
  assert.deepEqual(kmeansPalette(d, 2, { stride: 1 }), p);
});

test('audio: loudness, curve and onset', () => {
  assert.equal(rmsDb(new Float32Array(100)), -100);
  const s = new Float32Array(1000).fill(0.5);
  assert.ok(Math.abs(rmsDb(s) - 20 * Math.log10(0.5)) < 1e-6);
  const sig = new Float32Array(1000); sig.fill(0.3, 500);
  const curve = loudnessCurve(sig, 1000, 0.1);
  assert.equal(curve.length, 10);
  assert.equal(soundOnset(curve, 0.1), 0.5);
  assert.equal(soundOnset([-100, -100], 0.1), null);
});

const strong = { motion3: 0.1, cuts3: 2, faceAt: 0.25, text3: true, soundAt: 0, hookDb: -16, luma3: 0.52, color3: 70, sharp3: 400 };
const weak = { motion3: 0, cuts3: 0, faceAt: null, text3: false, soundAt: 2.5, hookDb: -60, luma3: 0.08, color3: 3, sharp3: 2 };

test('hookScore: a textbook hook scores 100, a dead opening scores low, and weights sum to 100', () => {
  const s = hookScore(strong), w = hookScore(weak);
  assert.equal(s.score, 100);
  assert.ok(w.score < 15, `weak ${w.score}`);
  assert.equal(s.parts.reduce((a, p) => a + p.weight, 0), 100);
  for (const p of s.parts) assert.ok(p.tip && p.label && p.value, p.key);
});

test('hookScore: each fix raises the score', () => {
  const base = hookScore(weak).score;
  for (const k of Object.keys(strong)) assert.ok(hookScore({ ...weak, [k]: strong[k] }).score > base, k);
});

test('postScore: vertical, in-range, captioned beats horizontal and long', () => {
  const good = postScore({ hook: 80, duration: 20, aspect: 9 / 16, captions: true, thumb: 80, cutsPerMin: 12, caption: 'Would you know?\n\nComment below #eldercare #caregiver #ai' });
  const bad = postScore({ hook: 80, duration: 140, aspect: 16 / 9, captions: false, thumb: 80, cutsPerMin: 1, caption: '' });
  assert.ok(good.score > bad.score + 30, `${good.score} vs ${bad.score}`);
  assert.equal(good.parts.reduce((a, p) => a + p.weight, 0), 100);
});

test('captionQuality rewards a short opener, a CTA and 3–8 tags', () => {
  assert.equal(captionQuality('').score, 0);
  assert.ok(Math.abs(captionQuality('Would you know if mom fell?\n#a1 #b2 #c3').score - 1) < 1e-9);
  assert.ok(captionQuality('x'.repeat(120)).score < 0.3);
});

test('thumbHeuristic: a big face on a vivid sharp frame beats a flat grey one', () => {
  const vivid = { luma: 0.5, contrast: 0.5, saturation: 0.6, colorfulness: 80, sharpness: 400 };
  const flat = { luma: 0.1, contrast: 0.02, saturation: 0, colorfulness: 0, sharpness: 1 };
  assert.equal(thumbHeuristic(vivid, { faces: 1, faceAt: 0, faceArea: 0.2 }), 100);
  assert.ok(thumbHeuristic(flat) < 10);
});

test('chunkCaptions: short cards, broken at sentence ends and pauses', () => {
  const w = (text, start, end) => ({ text, start, end });
  const cards = chunkCaptions([w('Would', 0, 0.2), w('you', 0.2, 0.35), w('know', 0.35, 0.6), w('if', 0.6, 0.7), w('mom', 0.7, 0.9), w('fell?', 0.9, 1.2), w('Watch.', 2.5, 2.9)]);
  assert.deepEqual(cards.map((c) => c.text), ['Would you know', 'if mom fell?', 'Watch.']);
  assert.equal(captionAt(cards, 0.75).text, 'if mom fell?');
  assert.equal(captionAt(cards, 2.0), null);
  for (const c of cards) assert.ok(c.text.length <= 18 && c.words.length <= 3);
});

test('cropRect keeps a 9:16 crop inside a 16:9 frame and follows the subject', () => {
  const r = cropRect(1920, 1080, 9 / 16, 0.5);
  assert.equal(r.h, 1080); assert.ok(Math.abs(r.w - 607.5) < 1e-9); assert.ok(Math.abs(r.x - (960 - 303.75)) < 1e-9);
  assert.equal(cropRect(1920, 1080, 9 / 16, 0).x, 0);
  assert.ok(Math.abs(cropRect(1920, 1080, 9 / 16, 1).x - (1920 - 607.5)) < 1e-9);
  const v = cropRect(1080, 1920, 9 / 16, 0.5);
  assert.deepEqual([v.x, v.y, v.w, v.h], [0, 0, 1080, 1920]);
});

test('SmoothCam ignores jitter inside the dead zone and glides to real moves', () => {
  const c = new SmoothCam({ alpha: 0.2, dead: 0.05 });
  for (let i = 0; i < 50; i++) c.update(0.5 + (i % 2 ? 0.03 : -0.03));
  assert.ok(Math.abs(c.x - 0.5) < 1e-9);
  for (let i = 0; i < 60; i++) c.update(0.8);
  assert.ok(Math.abs(c.x - 0.8) < 1e-3);
  const before = c.x; c.update(null); assert.ok(Math.abs(c.x - before) < 1e-3);
});

test('hooks, hashtags and the lexicon', () => {
  const h = fillHooks('AI fall detection', 'care-tech');
  assert.equal(h.length, HOOK_TEMPLATES.length);
  for (const x of h) assert.doesNotMatch(x.text, /\{[tpa]\}/);
  const t = hashtags('care-tech', ['fall detection'], 8);
  assert.equal(t.length, 8); assert.ok(t.includes('#falldetection')); assert.equal(new Set(t).size, t.length);
  assert.equal(lexSentiment('I love this, a lifesaver'), 'positive');
  assert.equal(lexSentiment('kinda creepy and dystopian'), 'negative');
  assert.equal(lexSentiment('not good'), 'negative');
  assert.equal(lexSentiment('where do I buy it'), 'neutral');
});

test('postingPlan gives 3 future slots a day and toICS writes one event per slot', () => {
  const start = new Date(2026, 10, 2, 10, 0);
  const p = postingPlan(start, 2);
  assert.deepEqual(p.map((d) => `${d.getDate()} ${d.getHours()}:${d.getMinutes()}`), ['2 12:15', '2 19:45', '3 7:30', '3 12:15', '3 19:45']);
  const ics = toICS(p.map((at) => ({ at, title: 'Post; now', note: 'a,b' })));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 5);
  assert.match(ics, /DTSTART:20261102T121500/);
  assert.match(ics, /SUMMARY:Post\\; now/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('trend helpers', () => {
  assert.equal(velocity(7000, '2026-10-26T00:00:00Z', new Date('2026-11-02T00:00:00Z')), 1000);
  const p = titlePatterns(['Would you know?', '3 signs mom needs help', 'POV: you stop worrying', 'NEVER do this']);
  const by = Object.fromEntries(p.map((x) => [x.pattern, x.share]));
  assert.equal(by['Question'], 0.25); assert.equal(by['Number / list'], 0.25); assert.equal(by['POV'], 0.25); assert.equal(by['Negative / warning'], 0.5); // 'NEVER' and 'stop'
});

test('stack.json accounts for every repo from the original list', async () => {
  const s = JSON.parse(await readFile(new URL('../../public/viralforge/data/stack.json', import.meta.url), 'utf8'));
  const asked = ['facebookresearch/llm-transparency-tool', 'openai/CLIP', 'harrywang0330/viral-clip-prediction', 'dylanhogg/tiktok-analytics',
    'charlesincharge/instagram-scraper', 'kornia/kornia', 'cardiffnlp/twitter-roberta-base-sentiment', 'PaddlePaddle/PaddleOCR', 'google/mediapipe',
    'instagrapi/instagrapi', 'SocialOomph API', 'sunniekapar/viral-tiktok-sounds'];
  assert.deepEqual(s.requested.map((r) => r.repo), asked);
  for (const r of s.requested) {
    assert.ok(['installed', 'replaced', 'optional'].includes(r.status), r.repo);
    assert.ok(r.why && r.with, r.repo);
  }
});
