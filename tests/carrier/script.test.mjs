/**
 * The script format: markup, pacing, and what the validator refuses to ignore.
 *
 * @module tests/carrier/script
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captionAt, captionSeconds, captionWords, normaliseScene, parseScript, parseTitle,
  titleText, totalSeconds, validateScript, WORDS_PER_SECOND,
} from '../../public/carrier/js/script.js';
import { WIFI_CSI } from '../../public/carrier/js/episodes/wifi-csi.js';

test('title markup colours a phrase without touching the words', () => {
  const runs = parseTitle('Phase Shifts → [3D Skeleton]');
  assert.deepEqual(runs, [
    { text: 'Phase Shifts → ', tone: 'plain' },
    { text: '3D Skeleton', tone: 'accent' },
  ]);
  assert.equal(titleText('Phase Shifts → [3D Skeleton]'), 'Phase Shifts → 3D Skeleton');
});

test('every tone delimiter is recognised', () => {
  const runs = parseTitle('a [b] !c! {d}');
  assert.deepEqual(runs.map((r) => r.tone), ['plain', 'accent', 'plain', 'alert', 'plain', 'good']);
});

test('an unmatched delimiter stays a literal character', () => {
  assert.deepEqual(parseTitle('50% [off'), [{ text: '50% [off', tone: 'plain' }]);
});

test('an empty pair of delimiters is not a run', () => {
  assert.deepEqual(parseTitle('a[]b'), [{ text: 'a[]b', tone: 'plain' }]);
});

test('caption pacing is words over reading rate, plus a hold', () => {
  const caption = 'one two three four five six';
  assert.equal(captionWords(caption).length, 6);
  assert.ok(Math.abs(captionSeconds(caption) - (6 / WORDS_PER_SECOND + 0.9)) < 1e-9);
  assert.equal(captionSeconds('   '), 0);
});

test('the typewriter reveals one word at a time and then settles', () => {
  const caption = 'alpha bravo charlie delta';
  assert.equal(captionAt(caption, 0).shown, 1);
  assert.equal(captionAt(caption, 0).highlight, 0);
  assert.equal(captionAt(caption, 1 / WORDS_PER_SECOND + 0.01).shown, 2);
  const settled = captionAt(caption, 99);
  assert.equal(settled.shown, 4);
  assert.equal(settled.highlight, -1, 'a finished caption highlights nothing');
  assert.equal(settled.done, true);
});

test('a scene with no duration is given one long enough to read', () => {
  const scene = normaliseScene({ caption: 'one two three four five six seven eight' }, 0);
  assert.ok(scene.seconds >= captionSeconds(scene.caption), 'default duration must fit the caption');
  assert.equal(scene.id, 'scene-1');
});

test('a caption that outruns its cut is a warning, not silence', () => {
  const findings = validateScript({
    scenes: [{ id: 'a', title: 'Title', seconds: 2, caption: 'one two three four five six seven eight nine ten' }],
  });
  assert.ok(findings.some((f) => f.level === 'warning' && /needs/.test(f.message)));
});

test('a claim without a source is a warning', () => {
  const findings = validateScript({ scenes: [{ id: 'a', title: 'T', seconds: 5, claim: true }] });
  assert.ok(findings.some((f) => /source/i.test(f.message)));
  const cited = validateScript({
    scenes: [{ id: 'a', title: 'T', seconds: 5, claim: true, source: 'Zhao et al. 2018' }],
  });
  assert.equal(cited.filter((f) => /source/i.test(f.message)).length, 0);
});

test('an unknown panel type is an error and a duplicate id is an error', () => {
  const findings = validateScript({
    scenes: [
      { id: 'a', title: 'T', seconds: 4, panel: { type: 'telepathy' } },
      { id: 'a', title: 'T', seconds: 4 },
    ],
  });
  assert.equal(findings.filter((f) => f.level === 'error').length, 2);
});

test('validating an already-parsed script does not double-normalise it', () => {
  const parsed = parseScript(WIFI_CSI);
  assert.deepEqual(validateScript(parsed), validateScript(WIFI_CSI));
});

test('the shipped episode is clean and fits a reel', () => {
  const script = parseScript(WIFI_CSI);
  assert.deepEqual(validateScript(script), [], 'the reference episode must pass its own checks');
  const runtime = totalSeconds(script);
  assert.ok(runtime > 30 && runtime <= 90, `runtime ${runtime}s should sit inside a reel's length`);
  assert.ok(script.scenes.every((scene) => scene.stats.length <= 3));
});

test('every scene in the shipped episode that makes a claim cites it', () => {
  const script = parseScript(WIFI_CSI);
  for (const scene of script.scenes) {
    if (scene.claim) assert.ok(scene.source, `${scene.id} claims something with no source`);
  }
});
