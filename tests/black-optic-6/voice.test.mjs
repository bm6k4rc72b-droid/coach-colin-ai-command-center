import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRelation, florenceDets, florencePrompt, parseCommand, resampleTo16k, singular, treePromptFor,
} from '../../public/black-optic-6/js/ai/voice.js';
import { treeFromPrompt, detectPaths } from '../../public/black-optic-6/js/ai/nvidia.js';

test('the rancher demo sentence parses to target, relation, anchor and compass word', () => {
  const c = parseCommand('Show me all horses near the north gate.');
  assert.equal(c.action, 'show');
  assert.equal(c.target, 'horse');
  assert.equal(c.relation, 'near');
  assert.equal(c.anchor, 'gate');
  assert.equal(c.qualifier, 'north');
  assert.equal(treePromptFor(c), '[a horse, a gate]');
  // The prompt is a valid NanoOWL tree with two detect labels.
  assert.deepEqual(detectPaths(treeFromPrompt(treePromptFor(c))), ['a horse', 'a gate']);
});

test('other commands', () => {
  assert.equal(parseCommand('How many sheep are there?').action, 'count');
  assert.equal(parseCommand('How many sheep are there?').target, 'sheep');
  assert.deepEqual(
    (({ action, target, relation, anchor }) => ({ action, target, relation, anchor }))(parseCommand('find the cattle left of the water trough')),
    { action: 'show', target: 'cow', relation: 'left', anchor: 'water trough' },
  );
  assert.equal(parseCommand('lock on the white truck').action, 'lock');
  assert.equal(parseCommand('lock on the white truck').target, 'white truck');
  assert.equal(parseCommand('What do you see?').action, 'describe');
  assert.equal(parseCommand('cancel').action, 'stop');
  assert.equal(parseCommand('banana').action, 'unknown');
  assert.equal(parseCommand('').action, 'unknown');
  assert.equal(treePromptFor(parseCommand('show me an elk')), '[an elk]');
});

test('singular', () => {
  for (const [p, s] of [['horses', 'horse'], ['sheep', 'sheep'], ['cattle', 'cow'], ['ponies', 'pony'], ['wolves', 'wolf'], ['gates', 'gate'], ['bus', 'bus'], ['people', 'person'], ['coyotes', 'coyote']]) assert.equal(singular(p), s);
});

const det = (cls, box) => ({ cls: `a ${cls}`, box, score: 0.5 });

test('near keeps finds within one anchor size of the anchor (frame pixels)', () => {
  const gate = det('gate', [100, 100, 40, 30]); // 40 px wide
  const close = det('horse', [150, 100, 20, 20]); // gap 10 px
  const edge = det('horse', [180, 100, 20, 20]); // gap exactly 40 px → kept
  const far = det('horse', [181.5, 100, 20, 20]); // gap 41.5 px → dropped
  const r = applyRelation([gate, close, edge, far], parseCommand('show me all horses near the north gate'));
  assert.deepEqual(r.kept, [close, edge]);
  assert.equal(r.anchors.length, 1);
  assert.match(r.note, /^2 of 3 horses near the gate\./);
  assert.match(r.note, /cannot tell north/);
});

test('near uses ground metres when calibrated', () => {
  const gate = det('gate', [0, 0, 10, 10]);
  const a = det('horse', [500, 0, 10, 10]); // far in pixels
  const ground = (box) => [box[0] === 500 ? 6 : 0, 8]; // but 6 m on the ground
  assert.equal(applyRelation([gate, a], parseCommand('show horses near the gate'), { ground }).kept.length, 1);
  assert.equal(applyRelation([gate, a], parseCommand('show horses near the gate'), { ground, nearMetres: 5 }).kept.length, 0);
});

test('left, right, front, behind and missing anchors', () => {
  const trough = det('trough', [100, 100, 50, 20]);
  const l = det('cow', [40, 100, 20, 20]); const r = det('cow', [200, 100, 20, 20]); const lowFoot = det('cow', [120, 130, 10, 20]);
  assert.deepEqual(applyRelation([trough, l, r], parseCommand('find cows left of the trough')).kept, [l]);
  assert.deepEqual(applyRelation([trough, l, r], parseCommand('find cows right of the trough')).kept, [r]);
  assert.deepEqual(applyRelation([trough, lowFoot, l], parseCommand('find cows in front of the trough')).kept, [lowFoot]);
  const none = applyRelation([l], parseCommand('find cows near the gate'));
  assert.equal(none.kept.length, 0);
  assert.match(none.note, /No gate in view/);
  assert.match(applyRelation([l, r], parseCommand('show cows')).note, /^2 cows in view/);
});

test('resampleTo16k: length, endpoints and a linear ramp stay exact', () => {
  const rate = 48000; const n = 4800;
  const ramp = Float32Array.from({ length: n }, (_, i) => i / n);
  const out = resampleTo16k(ramp, rate);
  assert.equal(out.length, 1600);
  for (let i = 0; i < out.length; i += 1) assert.ok(Math.abs(out[i] - (i * 3) / n) < 1e-6);
  const odd = resampleTo16k(new Float32Array(441).fill(0.25), 44100);
  assert.equal(odd.length, 160);
  assert.ok(odd.every((v) => v === 0.25));
  assert.deepEqual(Array.from(resampleTo16k([1, 2], 16000)), [1, 2]);
});

test('Florence-2 helpers', () => {
  assert.deepEqual(florenceDets({ bboxes: [[10, 20, 50, 80]], labels: ['horse</s>'] }), [{ box: [10, 20, 40, 60], cls: 'horse', score: null }]);
  assert.deepEqual(florenceDets('A horse in a field.'), []);
  assert.equal(florencePrompt('ground', ' a horse '), '<CAPTION_TO_PHRASE_GROUNDING>a horse');
  assert.equal(florencePrompt('more'), '<MORE_DETAILED_CAPTION>');
});
