import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERSONAS, personaFor, score, assignVoices, lineFor, scriptFor, allScripts, Narrator,
} from '../../public/black-optic-6-site/js/voices.js';
import { SCENES, resolve } from '../../public/black-optic-6-site/js/catalog.js';
import { CAPABILITIES } from '../../public/black-optic-6/js/capability.js';

const voice = (name, lang = 'en-US', localService = true) => ({ name, lang, localService });

test('every act has a guide, and the guides are actually distinguishable', () => {
  for (const act of SCENES) {
    const persona = personaFor(act.id);
    assert.equal(persona.scene, act.id, `${act.id} has no guide of its own`);
    assert.ok(persona.greeting.length > 20);
    assert.ok(persona.prefer.length >= 2, `${persona.id} needs voice preferences to fall back through`);
  }
  // Pitch and rate are the separators when two guides land on one voice.
  const signatures = new Set(PERSONAS.map((p) => `${p.id}:${p.pitch}:${p.rate}`));
  assert.equal(signatures.size, new Set(PERSONAS.map((p) => p.id)).size,
    'two guides with the same id must have the same signature, and different ids different ones');
});

test('an unknown act still gets a guide rather than crashing mid-scroll', () => {
  assert.equal(personaFor('not-an-act').id, PERSONAS[0].id);
});

test('scoring rejects voices that cannot read English and rewards a preference', () => {
  const persona = personaFor('optics');
  assert.equal(score(voice('Amélie', 'fr-FR'), persona), -1);
  const preferred = score(voice(persona.prefer[0]), persona);
  const plain = score(voice('Generic Voice'), persona);
  assert.ok(preferred > plain + 50, 'a named preference must clearly outrank a generic voice');
  // A local voice outranks a remote one: network speech stalls in a barn.
  assert.ok(score(voice('Generic Voice', 'en-US', true), persona) > score(voice('Generic Voice', 'en-US', false), persona));
});

test('with enough voices installed, no two guides share one', () => {
  const voices = ['Daniel', 'Samantha', 'Moira', 'Rishi', 'Nicky', 'Zoe', 'Lee', 'Fred', 'Kathy', 'Ralph', 'Albert', 'Alex']
    .map((name) => voice(name));
  const assignment = assignVoices(voices);
  const used = [...assignment.values()].map((v) => v && v.name);
  assert.equal(used.length, new Set(PERSONAS.map((p) => p.id)).size);
  assert.equal(new Set(used).size, used.length, 'a guide must not borrow another guide\'s voice while spares exist');
});

test('assignment is deterministic — the same guide sounds the same on every load', () => {
  const voices = ['Voice A', 'Voice B', 'Voice C', 'Voice D'].map((name) => voice(name));
  const first = assignVoices(voices);
  const second = assignVoices(voices);
  for (const [id, chosen] of first) {
    assert.equal(second.get(id)?.name, chosen?.name, `${id} changed voice between loads`);
  }
});

test('too few voices degrades to sharing instead of throwing', () => {
  const assignment = assignVoices([voice('Only Voice')]);
  assert.equal(new Set(PERSONAS.map((p) => p.id)).size, assignment.size);
  for (const chosen of assignment.values()) assert.equal(chosen.name, 'Only Voice');
});

test('no voices at all is an ordinary case, not an error', () => {
  const assignment = assignVoices([]);
  for (const chosen of assignment.values()) assert.equal(chosen, null);
  assert.doesNotThrow(() => assignVoices(null));
});

test('non-English voices are used only when nothing else is installed', () => {
  const assignment = assignVoices([voice('Kyoko', 'ja-JP'), voice('Daniel', 'en-GB')]);
  const chosen = [...assignment.values()].map((v) => v.name);
  assert.ok(chosen.every((name) => name === 'Daniel'), 'an English page should not be read in Japanese while an English voice exists');
});

test('a spoken line is the ledger verdict, never a rewritten one', () => {
  for (const row of CAPABILITIES) {
    const line = lineFor(row.id);
    assert.ok(line.text.includes(row.verdict), `${row.id} was paraphrased on its way to the voice`);
    assert.equal(line.state, row.state);
  }
});

test('an untrustworthy row is announced as such before the explanation', () => {
  for (const row of CAPABILITIES) {
    const resolved = resolve(row.id);
    if (resolved.trustworthy) continue;
    const line = lineFor(row.id);
    const prefix = { BLOCKED: 'Blocked', HARDWARE: 'Needs hardware', UNSOUND: 'Unsound' }[row.state];
    const verdictAt = line.text.indexOf(row.verdict);
    const prefixAt = line.text.indexOf(prefix);
    assert.ok(prefixAt >= 0, `${row.id} must be announced as ${prefix}`);
    assert.ok(prefixAt < verdictAt, `${row.id}: the verdict must come before the reasoning`);
  }
});

test('no voice can say anything that is not in the ledger', () => {
  const verdicts = new Set(CAPABILITIES.map((row) => row.verdict));
  const greetings = new Set(PERSONAS.map((p) => p.greeting));
  const lines = new Set(SCENES.map((act) => act.line));
  for (const { scene: id, lines: script } of allScripts()) {
    for (const line of script) {
      if (line.capability) {
        assert.ok([...verdicts].some((verdict) => line.text.includes(verdict)),
          `${id} speaks a sentence with no ledger verdict in it`);
      } else {
        const framing = line.text.includes('ballistics trainer') || line.text.includes('targeting system');
        assert.ok(greetings.has(line.text) || lines.has(line.text) || framing,
          `${id} speaks copy that exists nowhere in the catalogue: "${line.text.slice(0, 60)}"`);
      }
    }
  }
});

test('the range script states the limit out loud before describing the tool', () => {
  const script = scriptFor('range');
  const framing = script.findIndex((line) => /not a targeting system/i.test(line.text));
  assert.ok(framing >= 0, 'the range act must say what it is not');
  const turret = script.findIndex((line) => line.capability === 'auto-turret');
  assert.ok(turret >= 0, 'and it must carry the turret row rather than dropping it');
  assert.equal(script[turret].state, 'UNSOUND');
});

test('every act has something to say', () => {
  for (const { scene: id, lines } of allScripts()) {
    assert.ok(lines.length >= 2, `${id} has no script`);
    for (const line of lines) assert.ok(line.text.trim().length > 10);
  }
  assert.deepEqual(scriptFor('not-an-act'), []);
});

test('the narrator treats a missing speech engine as ordinary', () => {
  const narrator = new Narrator(null);
  assert.equal(narrator.available, false);
  assert.equal(narrator.speak('optics'), false);
  assert.doesNotThrow(() => narrator.stop());
  assert.match(narrator.describe(PERSONAS[0]), /no speech engine/);
});

test('the narrator survives an engine that throws on getVoices', () => {
  const hostile = {
    getVoices() { throw new Error('nope'); },
    cancel() { throw new Error('also nope'); },
    speak() {},
    addEventListener() {},
  };
  const narrator = new Narrator(hostile);
  assert.deepEqual(narrator.voices, []);
  assert.doesNotThrow(() => narrator.stop());
});
