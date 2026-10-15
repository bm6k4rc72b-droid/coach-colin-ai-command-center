/**
 * Unit tests for THE HOLLYWOOD SECRET: the plan read-out against the seven
 * pillars, the diagnosis from the entry question, reading a free-text
 * answer, and the honesty lines the pitch is not allowed to drop.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BANNED, CALL_SHEET, CAUTION, COACHING_URL, DOING, GAUGE, GUIDE_URL, LINES, PAIN_POINTS, PILLARS,
  assessPlan, diagnose, guessPain,
} from '../../public/astra/showcase/hollywood.js';

test('the plan is scored against seven pillars from chips and free text', () => {
  assert.equal(PILLARS.length, 7);
  const none = assessPlan(['nothing'], '');
  assert.equal(none.score, 0);
  assert.equal(none.missing.length, 7);
  assert.match(none.verdict, /plan/i);
  const some = assessPlan(['counting', 'lifting'], 'I walk 10k steps and sleep 8 hours');
  assert.deepEqual(new Set(some.covered), new Set(['numbers', 'training', 'steps', 'recovery']));
  assert.equal(some.score, 4);
  assert.deepEqual(some.missing.map((p) => p.id), ['protein', 'measure', 'accountability']);
  const all = assessPlan(['counting', 'protein', 'lifting', 'walking', 'sleep', 'weighing', 'coach'], '');
  assert.equal(all.score, 7);
  assert.equal(all.missing.length, 0);
});

test('saying "nothing" in your own words is not mistaken for a pillar', () => {
  assert.equal(assessPlan([], 'nothing').score, 0);
  assert.equal(assessPlan([], 'idk').score, 0);
});

test('short sleep is the problem, not the pillar', () => {
  assert.ok(!assessPlan([], 'I walk most days but sleep about 5 hours').covered.includes('recovery'));
  assert.ok(!assessPlan([], 'I get 4 hours of sleep').covered.includes('recovery'));
  assert.ok(assessPlan([], 'I sleep 8 hours a night').covered.includes('recovery'));
});

test('pillars are never double counted', () => {
  // Cardio and walking are the same pillar.
  assert.equal(assessPlan(['cardio', 'walking'], 'running and spin classes').score, 1);
});

test('every chip maps to a known pillar or to none', () => {
  const ids = new Set(PILLARS.map((p) => p.id));
  for (const d of DOING) assert.ok(d.pillar === null || ids.has(d.pillar), d.id);
});

test('each pain point has a diagnosis and both fixes', () => {
  assert.equal(PAIN_POINTS.length, 6);
  for (const p of PAIN_POINTS) {
    assert.ok(p.label && p.headline && p.deflate && p.coaching);
    assert.ok(p.likely.length >= 3);
    assert.equal(diagnose(p.id), p);
  }
  assert.equal(diagnose('unknown').id, PAIN_POINTS[0].id);
});

test('a free-text answer is read into the nearest pain point', () => {
  assert.equal(guessPain('I am on Ozempic and stuck'), 'glp1');
  assert.equal(guessPain('always bloated and puffy'), 'bloat');
  assert.equal(guessPain('I lose it then it comes back'), 'rebound');
  assert.equal(guessPain("I don't know what to eat"), 'what');
  assert.equal(guessPain('I fall off every weekend'), 'consistency');
  assert.equal(guessPain('the scale is stuck'), 'clean');
});

test('the room stays honest: water not fat, banned shortcuts, potassium caution', () => {
  const fat = GAUGE.find(([name]) => name === 'Body fat');
  assert.ok(fat && fat[1] < 10, 'fat barely moves in 72 hours');
  assert.ok(GAUGE.find(([n]) => n === 'Water')[1] > 80);
  assert.ok(BANNED.some(([t]) => /water pills|detox/i.test(t)));
  assert.ok(BANNED.some(([t]) => /medication/i.test(t)));
  assert.match(CAUTION, /kidney/);
  assert.match(CAUTION, /ACE inhibitor/);
  assert.match(LINES.panels[0], /water/);
  assert.equal(CALL_SHEET.length, 3);
});

test('the guide and coaching links are real https URLs, not the Instagram wrapper', () => {
  assert.match(GUIDE_URL, /^https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]{36}$/);
  assert.equal(COACHING_URL, 'https://www.instagram.com/coachcolinc/');
  assert.doesNotMatch(COACHING_URL, /rpxt|igsh|utm_/);
  assert.doesNotMatch(GUIDE_URL, /instagram/);
});

test('Colin keeps asking what the visitor is doing', () => {
  assert.match(LINES.enter, /what are you doing/i);
  assert.ok(LINES.nags.length >= 3);
  assert.ok(LINES.nags.some((l) => /what are you doing/i.test(l)));
});
