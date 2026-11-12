import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { verticalFov, cameraAt, sceneIndex, timecode, KEYS, CREDENTIALS, smooth } from '../../public/colin-cook/js/film.js';

const html = readFileSync(new URL('../../public/colin-cook/index.html', import.meta.url), 'utf8');
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');

test('lens maths: 50 mm on the 15/70 gate', () => {
  assert.ok(Math.abs(verticalFov(50, 70.41 / 52.63) - 55.5) < 0.2); // gate-shaped screen: full gate height
  assert.ok(verticalFov(50, 16 / 9) < verticalFov(50, 4 / 3));        // wider screen crops the gate height
  assert.ok(Math.abs(verticalFov(50, 9 / 16) - 55.5) < 0.2);          // phones keep the full gate height
  assert.ok(verticalFov(80, 16 / 9) < verticalFov(50, 16 / 9));       // longer lens, tighter view
});

test('camera path hits each keyframe and eases between them', () => {
  assert.deepEqual(cameraAt(0, false).pos, KEYS[0].pos);
  assert.deepEqual(cameraAt(2, false).look, KEYS[2].look);
  const mid = cameraAt(0.5, false);
  assert.ok(mid.pos[2] < KEYS[0].pos[2] && mid.pos[2] > KEYS[1].pos[2]);
  assert.equal(cameraAt(99, true).focal, KEYS.at(-1).focal);
  assert.notEqual(cameraAt(1, true).look[0], cameraAt(1, false).look[0]); // subject moves aside on landscape
  assert.equal(smooth(0), 0); assert.equal(smooth(1), 1); assert.equal(smooth(0.5), 0.5);
});

test('sceneIndex and timecode', () => {
  const s = [{ top: 0, height: 800 }, { top: 800, height: 1200 }];
  assert.equal(sceneIndex(s, 0), 0); assert.equal(sceneIndex(s, 400), 0.5); assert.equal(sceneIndex(s, 1400), 1.5);
  assert.equal(timecode(0), '00:00:00:00'); assert.equal(timecode(61.5), '00:01:01:12');
});

test('one keyframe per section, plus the end', () => {
  assert.equal((html.match(/data-scene="/g) || []).length, KEYS.length - 1);
});

test('SEO: title, description, one h1, canonical, image alts', () => {
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  assert.match(title, /Colin Cook/); assert.match(title, /Personal Trainer/); assert.ok(title.length <= 75, String(title.length));
  const desc = html.match(/name="description" content="([^"]+)"/)[1];
  assert.match(desc, /anti-aging clinics/);
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /rel="canonical"/);
  for (const img of html.match(/<img [^>]+>/g)) assert.match(img, /alt="[^"]{20,}"/);
  assert.match(text, /Peptide beauty &amp; anti-aging clinics/);
});

test('structured data parses and the FAQ matches the visible page', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const types = ld['@graph'].map((n) => n['@type']);
  assert.deepEqual(types, ['Person', 'ProfessionalService', 'FAQPage']);
  const person = ld['@graph'][0];
  assert.equal(person.name, 'Colin Cook');
  assert.ok(person.hasCredential.length >= 10);
  assert.equal(ld['@graph'][1].aggregateRating, undefined); // no invented reviews
  for (const q of ld['@graph'][2].mainEntity.slice(0, 1)) assert.ok(text.includes(q.name), q.name);
});

test('every credential on the 3D wall is also in the page text (and there are 20)', () => {
  assert.equal(CREDENTIALS.length, 20);
  for (const [, t] of CREDENTIALS) assert.ok(text.replace(/&amp;/g, '&').includes(t.replace('Neuro-type', 'Neuro-type')), t);
});

test('claims: disclosure present; nothing unverifiable or medical', () => {
  assert.match(text, /#ad/); assert.match(text, /earns a commission/); assert.match(text, /research use only/);
  assert.match(html, /rel="sponsored noopener"/);
  for (const bad of [/forbes/i, /most certified/i, /fda[- ]approved/i, /\bcures?\b/i, /\bheals?\b/i, /boosts? collagen/i, /\b\d+\s?(mg|mcg|iu)\b/i, /\binject/i, /guarantee/i]) assert.doesNotMatch(text, bad);
});

test('llms.txt and sitemap exist and point at the page', () => {
  for (const f of ['llms.txt', 'sitemap.xml']) assert.ok(existsSync(new URL(`../../public/colin-cook/${f}`, import.meta.url)));
  assert.match(readFileSync(new URL('../../public/colin-cook/llms.txt', import.meta.url), 'utf8'), /^# Colin Cook/);
});
