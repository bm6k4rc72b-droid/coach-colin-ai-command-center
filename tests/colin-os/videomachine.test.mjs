import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { narration, footageTerms, buildMptParams, readTask, COLIN_SYSTEM_PROMPT } from '../../public/colin-os/js/videomachine.js';
import { offlineDraft } from '../../public/colin-os/js/core.js';

const script = { angle: 'GLP-1 muscle', hooks: ['Stop losing muscle on a GLP-1.'], beats: [{ t: '0-3s', say: 'Protein at every meal.', shot: 'Close-up meal prep (gold light)' }, { t: '3-8s', say: 'Lift three times a week.', shot: 'syringe on table' }], cta: 'Comment LANE.' };

test('narration keeps only spoken words, in order', () => {
  assert.equal(narration(script), 'Stop losing muscle on a GLP-1. Protein at every meal. Lift three times a week. Comment LANE.');
  assert.equal(narration(offlineDraft('script')).includes('0–2s'), false);
});

test('footage terms come from shots and the lane, and never show needles', () => {
  const t = footageTerms(script, 'glp');
  assert.ok(t.includes('close meal prep'));
  assert.ok(t.every((x) => !/syringe|needle|pill/.test(x)));
  assert.equal(t.length, 6);
});

test('buildMptParams: valid job, guardrails enforced, topic-only gets the system prompt', () => {
  const p = buildMptParams(script, { lane: 'glp' });
  assert.equal(p.video_aspect, '9:16');
  assert.equal(p.video_subject, 'GLP-1 muscle');
  assert.equal(p.custom_system_prompt, undefined);
  assert.throws(() => buildMptParams({ hook: 'This peptide cures diabetes. Inject 2mg daily.' }), /guardrails/);
  const t = buildMptParams({ topic: 'Recovery for firefighters' }, { lane: 'pressure' });
  assert.equal(t.video_script, '');
  assert.equal(t.custom_system_prompt, COLIN_SYSTEM_PROMPT);
  assert.ok(t.video_terms.includes('firefighter training'));
  assert.equal(buildMptParams(script, { overrides: { voice_name: 'en-US-GuyNeural-Male' } }).voice_name, 'en-US-GuyNeural-Male');
});

test('every job field exists in the pinned MoneyPrinterTurbo VideoParams schema', (t) => {
  let src;
  try { src = readFileSync(new URL('../../money-printer/MoneyPrinterTurbo/app/models/schema.py', import.meta.url), 'utf8'); } catch { t.skip('submodule not checked out (git submodule update --init)'); return; }
  const body = src.split('class VideoParams')[1].split(/\nclass /)[0];
  const fields = new Set([...body.matchAll(/^\s{4}([a-z_]+)\s*:/gm)].map((m) => m[1]));
  const p = buildMptParams({ topic: 'x' });
  for (const k of Object.keys(p)) assert.ok(fields.has(k), `unknown MoneyPrinterTurbo field ${k}`);
});

test('readTask maps MoneyPrinterTurbo task states', () => {
  assert.deepEqual(readTask({ data: { state: 4, progress: 40 } }), { done: false, ok: false, progress: 40, videos: [], error: null });
  assert.equal(readTask({ data: { state: 1, progress: 100, videos: ['/tasks/a/final-1.mp4'] } }).videos[0], '/tasks/a/final-1.mp4');
  assert.match(readTask({ data: { state: -1, failed_stage: 'material' } }).error, /material/);
});

test('offline script narration is spoken words only, hook not repeated', () => {
  const n = narration(offlineDraft('script'));
  assert.equal((n.match(/losing muscle/g) || []).length, 1);
  assert.doesNotMatch(n, /hat brim|gold light|close-up/i);
  assert.match(n, /Comment LANE/);
});
