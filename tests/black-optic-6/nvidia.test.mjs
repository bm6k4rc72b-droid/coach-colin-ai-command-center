/**
 * NanoOWL tree prompts and NanoSAM pre/post-processing, checked against
 * NVIDIA-AI-IOT's own Python (nanoowl/tree.py run on the same prompts;
 * nanosam/utils/predictor.py's arithmetic by hand).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASSIFY, DETECT, detectPaths, fromCrop, nanosamPoints, nanosamResize, nanosamTensor, nanosamUpscale, runTree, treeFromPrompt,
} from '../../public/black-optic-6/js/ai/nvidia.js';

test('tree prompts parse exactly as NanoOWL parses them', () => {
  // Expected values are nanoowl.tree.Tree.from_prompt(p).to_dict() from NVIDIA's code.
  assert.deepEqual(treeFromPrompt('[a person [a face (smiling, frowning)], a truck]'), {
    nodes: [{ op: DETECT, input: 0, outputs: [1, 5] }, { op: DETECT, input: 1, outputs: [2] }, { op: CLASSIFY, input: 2, outputs: [3, 4] }],
    labels: ['image', 'a person', 'a face', 'smiling', 'frowning', 'a truck'],
  });
  assert.deepEqual(treeFromPrompt('[a face (indoors, outdoors)]'), {
    nodes: [{ op: DETECT, input: 0, outputs: [1] }, { op: CLASSIFY, input: 1, outputs: [2, 3] }], labels: ['image', 'a face', 'indoors', 'outdoors'],
  });
  assert.deepEqual(treeFromPrompt('(a cat, a dog)'), { nodes: [{ op: CLASSIFY, input: 0, outputs: [1, 2] }], labels: ['image', 'a cat', 'a dog'] });
  assert.deepEqual(treeFromPrompt('[bolt cutters, white truck, coyote]').labels, ['image', 'bolt cutters', 'white truck', 'coyote']);
  assert.throws(() => treeFromPrompt('[a face'), /Missing '\]'/);
  assert.throws(() => treeFromPrompt('a face]'), /Unexpected '\]'/);
  assert.throws(() => treeFromPrompt('(a, b]'), /Unexpected '\]'/);
  assert.deepEqual(detectPaths(treeFromPrompt('[a person [a face], a truck]')), ['a person', 'a truck', 'a person › a face']);
});

test('a tree runs breadth first: faces inside each person, classified, back in frame pixels', async () => {
  const tree = treeFromPrompt('[a person [a face (smiling, frowning)], a truck]');
  const calls = [];
  const detect = async (box, labels) => {
    calls.push(['detect', box.map(Math.round), labels]);
    if (labels.includes('a person')) return [{ box: [10, 10, 40, 100], score: 0.6, label: 0 }, { box: [200, 20, 40, 90], score: 0.5, label: 0 }, { box: [300, 50, 120, 60], score: 0.4, label: 1 }];
    // Inside a person: a face near the top of that box.
    return [{ box: fromCrop([10, 5, 20, 20], box), score: 0.3, label: 0 }];
  };
  const classify = async (box, labels) => { calls.push(['classify', labels]); return { label: box[0] > 100 ? 1 : 0, score: 0.8 }; };
  const out = await runTree(tree, [0, 0, 640, 360], detect, classify);
  assert.equal(out.length, 5);
  assert.deepEqual(out.map((d) => d.path), ['a person', 'a person', 'a truck', 'a person › a face', 'a person › a face']);
  const faces = out.filter((d) => d.path.endsWith('face'));
  assert.deepEqual(faces.map((f) => f.box), [[20, 15, 20, 20], [210, 25, 20, 20]]);
  assert.deepEqual(faces.map((f) => f.parent), [0, 1]);
  assert.deepEqual(faces.map((f) => f.classes[0].label), ['smiling', 'frowning']);
  assert.equal(calls.filter((c) => c[0] === 'detect').length, 3, 'once on the image, once inside each person — not inside the truck');
});

test('NanoSAM pre-processing follows predictor.py', () => {
  assert.deepEqual(nanosamResize(1920, 1080), { w: 1024, h: 576 });
  assert.deepEqual(nanosamResize(1080, 1920), { w: 576, h: 1024 });
  assert.deepEqual(nanosamResize(1000, 333), { w: 1024, h: 340 }, 'int() truncates: 1024/3.003 = 340.99');
  const px = new Uint8ClampedArray([123.675, 116.28, 103.53, 255, 255, 255, 255, 255].map(Math.round));
  const t = nanosamTensor(px, 2, 1, 4);
  assert.equal(t.length, 3 * 16);
  assert.ok(Math.abs(t[0] - (124 - 123.675) / 58.395) < 1e-6);
  assert.ok(Math.abs(t[1] - (255 - 123.675) / 58.395) < 1e-6);
  assert.ok(Math.abs(t[16 + 1] - (255 - 116.28) / 57.12) < 1e-6, 'green plane');
  assert.equal(t[5], 0, 'padding is zero, not the mean');
  assert.deepEqual(nanosamPoints([[960, 540]], 1920, 1080), [[512, 288]]);
});

test('NanoSAM mask upscale: valid corner only, bilinear, logits above zero', () => {
  // Identity: a 256×256 image reads the logits straight through.
  const n = 256; const L = new Float32Array(n * n).fill(-1);
  for (let y = 100; y < 150; y += 1) for (let x = 60; x < 90; x += 1) L[y * n + x] = 1;
  const m = nanosamUpscale(L, 256, 256);
  assert.equal(m[120 * 256 + 70], 1); assert.equal(m[10 * 256 + 10], 0);
  assert.equal(m.reduce((s, v) => s + v, 0), 50 * 30);
  // A 512×256 (wide) image uses the top 128 rows of the grid, scaled ×2.
  const W = new Float32Array(n * n).fill(-1);
  for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) W[y * n + x] = 1; // left half of the valid region
  const mw = nanosamUpscale(W, 512, 256);
  assert.equal(mw[128 * 512 + 100], 1); assert.equal(mw[128 * 512 + 400], 0);
  const area = mw.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(area - 256 * 256) <= 256 * 2, `left half of the frame: ${area}`);
  // Rows of the grid below the valid corner (the padding) never reach the image.
  const P = new Float32Array(n * n).fill(-1); for (let y = 128; y < 256; y += 1) for (let x = 0; x < n; x += 1) P[y * n + x] = 5;
  assert.equal(nanosamUpscale(P, 512, 256).reduce((s, v) => s + v, 0), 0);
});
