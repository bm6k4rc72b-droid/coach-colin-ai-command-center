/**
 * Unit tests for Colin's studio voice: the recorded lines must still be
 * lines he says, and a mixed line must be cut so that only what was
 * recorded plays from the recordings.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { studioParts } from '../../public/astra/showcase/colin.js';
import { T } from '../../public/astra/showcase/i18n.js';
import { STATIONS } from '../../public/astra/showcase/sections.js';
import { LINES, lineKey, studioClip } from '../../public/astra/showcase/voicebank.js';

function englishCopy() {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') out.add(lineKey(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(T.en);
  for (const s of STATIONS) out.add(lineKey(s.colin));
  return out;
}

test('every recording is of a line he still says, served over https as MP3', () => {
  const copy = englishCopy();
  assert.ok(LINES.length > 0);
  for (const [text] of LINES) {
    assert.ok(copy.has(lineKey(text)), `recorded line no longer in the copy: ${text}`);
    assert.match(studioClip(text), /^https:\/\/[^ ]+\.mp3$/);
  }
});

test('lines match whatever their quotes, spacing or case', () => {
  assert.ok(studioClip('Right then.'));
  assert.equal(studioClip("  tea's not included, I'm afraid. "), studioClip('Tea’s not included, I’m afraid.'));
  assert.equal(studioClip('Something he never recorded.'), null);
});

test('a composed answer plays its recorded opener and sign-off around the device-spoken middle', () => {
  const parts = studioParts('Right then. Retatrutide is investigational. It is not approved anywhere. Hope that helps.');
  assert.deepEqual(parts.map((p) => Boolean(p.clip)), [true, false, true]);
  assert.equal(parts[1].text, 'Retatrutide is investigational. It is not approved anywhere.');
  assert.deepEqual(studioParts('Nothing recorded here.'), [{ text: 'Nothing recorded here.' }]);
  assert.equal(studioParts('Onward.').length, 1);
});
