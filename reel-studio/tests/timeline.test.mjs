import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { segments, timeline, wavSeconds } from '../src/timeline.js';

const sample = JSON.parse(readFileSync(new URL('../props.sample.json', import.meta.url)));

test('segments: hook, beats, cta in order; blanks dropped', () => {
  const s = segments({ ...sample, beats: [...sample.beats, '  '] });
  assert.deepEqual(s.map((x) => x.kind), ['hook', 'beat', 'beat', 'beat', 'cta']);
  assert.ok(s.every((x) => x.seconds >= 2));
});

test('voice-over length wins over reading time', () => {
  const s = segments({ hook: 'Short hook here', cta: 'Go', audio: [{ src: 'vo/seg-0.wav', seconds: 4 }] });
  assert.equal(s[0].seconds, 4.25);
  assert.equal(s[0].audio, 'vo/seg-0.wav');
  assert.equal(s[1].audio, null);
});

test('timeline frames are contiguous and sum to the total', () => {
  const { segs, total } = timeline(sample, 30);
  segs.forEach((x, i) => { if (i) assert.equal(x.from, segs[i - 1].from + segs[i - 1].frames); });
  assert.equal(total, segs.at(-1).from + segs.at(-1).frames);
  assert.ok(total / 30 > 10 && total / 30 < 40, `length ${total / 30}s`);
});

test('wavSeconds reads a 16-bit mono 24 kHz header', () => {
  const rate = 24000; const n = rate * 1.5; const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  assert.equal(wavSeconds(b), 1.5);
  assert.throws(() => wavSeconds(Buffer.from('nope')));
});
