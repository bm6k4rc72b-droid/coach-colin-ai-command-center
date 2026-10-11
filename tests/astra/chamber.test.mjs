/**
 * Unit tests for the chamber's courtroom and translation hub logic.
 *
 * The court decides who wins an argument about evidence, so its arithmetic
 * is pinned here: what an exhibit is worth, when an objection is sustained,
 * how the jury is seated and how the verdict is weighed. The hub's tests pin
 * the parts that run with no AI at all — script detection and the
 * phrasebook — since those are what most browsers will actually use.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  JURY_SIZE, argue, citedLetters, deliberate, exhibitValue, object, openCase, seatJury, transcript, vote,
} from '../../public/astra/showcase/court.js';
import { GLOSSARY, HUB_LANGS, PHRASES, SAFETY, guessLanguage, phrasebook, translate } from '../../public/astra/showcase/hub.js';

const SEED = Date.UTC(2026, 9, 11, 12, 0, 0, 305);

test('a case on a BPC-157 myth brings its studies in as lettered exhibits', () => {
  const k = openCase({ motion: 'BPC-157 heals almost any injury in the body', seed: SEED });
  assert.match(k.number, /^COLIN-2026-BPC157-\d{3}$/);
  assert.equal(k.subject.id, 'bpc-157');
  assert.ok(k.exhibits.length >= 2 && k.exhibits.length <= 6);
  assert.deepEqual(k.exhibits.map((e) => e.letter), 'ABCDEF'.slice(0, k.exhibits.length).split(''));
  assert.equal(k.favoured, 'against');
});

test('an exhibit is worth what its design is worth, to the side it helps', () => {
  const rct = { letter: 'A', tierLabel: 'RCT', ceiling: 0.96, direction: 1 };
  const rat = { letter: 'B', tierLabel: 'Animal', ceiling: 0.45, direction: 1 };
  const against = { letter: 'C', tierLabel: 'RCT', ceiling: 0.96, direction: -1 };
  assert.equal(exhibitValue(rct, 'a', '').points, 10);
  assert.equal(exhibitValue(rat, 'a', '').points, 5);
  assert.equal(exhibitValue(against, 'a', '').points, -4);
  assert.equal(exhibitValue(against, 'b', '').points, 12);
  // The prosecution gains by exposing weak evidence: (1 − 0.45) × 6 = 3.3 → 3.
  assert.equal(exhibitValue(rat, 'b', '').points, 3);
  // Leaning on a strong supportive study costs the prosecution, unless it argues a limitation.
  assert.equal(exhibitValue(rct, 'b', 'it works').points, -3);
  assert.equal(exhibitValue(rct, 'b', 'a short trial with a small sample').points, 3);
});

test('exhibit letters are read from the argument itself', () => {
  const k = openCase({ motion: 'BPC-157 heals almost any injury in the body', seed: SEED });
  assert.deepEqual(citedLetters('As exhibits A and B show…', k), ['A', 'B']);
  assert.deepEqual(citedLetters('Exhibit Z says nothing', k), []);
});

test('objections are sustained only when the argument does what it is accused of', () => {
  const k = openCase({ motion: 'BPC-157 heals almost any injury in the body', seed: SEED });
  argue(k, 'My mate swears it always works and everyone at the gym agrees', { at: 1 });
  const before = { ...k.totals };
  const hearsay = object(k, 'hearsay', { at: 2 });
  assert.ok(hearsay.ok && hearsay.sustained);
  assert.equal(hearsay.by, 'b');
  assert.equal(k.totals.b, before.b + 5);
  assert.equal(k.totals.a, Math.max(0, before.a - 5));
  // One objection per argument.
  assert.equal(object(k, 'relevance').ok, false);
  argue(k, 'Exhibit A is a rat study with n=72 and no randomised human trial — a real limitation', { at: 3 });
  const b = k.totals.a;
  const relevance = object(k, 'relevance', { at: 4 });
  assert.ok(relevance.ok && !relevance.sustained);
  assert.equal(k.totals.a, Math.max(0, b - 3));
});

test('turns alternate for three rounds, then the court closes', () => {
  const k = openCase({ motion: 'Tesamorelin reduces visceral fat in people with HIV', seed: SEED });
  for (let i = 0; i < 6; i += 1) assert.ok(argue(k, 'A randomised placebo-controlled trial with 412 participants was published.'));
  assert.equal(k.closed, true);
  assert.equal(argue(k, 'One more thing'), null);
});

test('the jury seats the room first, then follows the scorecard; the verdict is 70/30', () => {
  const k = openCase({ motion: 'BPC-157 heals almost any injury in the body', seed: SEED });
  k.totals = { a: 10, b: 30 };
  vote(k, 'a');
  vote(k, 'b');
  vote(k, 'b');
  const seats = seatJury(k, { final: true });
  assert.equal(seats.length, JURY_SIZE);
  // 3 room votes (1 a, 2 b); 9 empty seats split by the scorecard: round(9 × 0.25) = 2 to a.
  assert.equal(seats.filter((s) => s === 'a').length, 3);
  const v = deliberate(k);
  assert.equal(v.winner, 'b');
  assert.ok(Math.abs(v.score.a - (0.7 * 0.25 + 0.3 * (3 / 12))) < 1e-9);
  assert.ok(Math.abs(v.score.a + v.score.b - 1) < 1e-9);
  assert.match(transcript(k), /Case No\. COLIN-2026-BPC157-\d{3}[\s\S]*Verdict for the Prosecution/);
});

test('more than twelve votes are scaled to twelve seats', () => {
  const k = openCase({ motion: 'BPC-157 heals almost any injury in the body', seed: SEED });
  for (let i = 0; i < 20; i += 1) vote(k, i < 15 ? 'a' : 'b');
  const seats = seatJury(k);
  assert.equal(seats.filter((s) => s === 'a').length, 9);
  assert.equal(seats.filter((s) => s === 'b').length, 3);
});

test('every glossary term, question and the safety line exist in all twelve languages', () => {
  for (const entry of [...GLOSSARY, ...PHRASES]) for (const l of HUB_LANGS) assert.ok(entry[l.id], `${entry.id} missing ${l.id}`);
  for (const l of HUB_LANGS) assert.ok(SAFETY[l.id], `safety missing ${l.id}`);
});

test('script detection names the language without any model', () => {
  assert.equal(guessLanguage('ما هي الآثار الجانبية؟').lang, 'ar');
  assert.equal(guessLanguage('副作用は何ですか？').lang, 'ja');
  assert.equal(guessLanguage('有哪些副作用？').lang, 'zh');
  assert.equal(guessLanguage('부작용은 무엇인가요?').lang, 'ko');
  assert.equal(guessLanguage('इसके दुष्प्रभाव क्या हैं?').lang, 'hi');
  assert.equal(guessLanguage('Какие побочные эффекты?').lang, 'ru');
  assert.equal(guessLanguage('¿Qué dice la evidencia sobre la semaglutida?').lang, 'es');
  assert.equal(guessLanguage('Was sagt die Evidenz über das Peptid?').lang, 'de');
  assert.equal(guessLanguage('What does the evidence say about this?').lang, 'en');
});

test('the phrasebook translates exactly what it holds, from any of its languages', async () => {
  assert.equal(phrasebook('half-life', 'en', 'ja'), '半減期');
  assert.equal(phrasebook('¿Está aprobado?', 'auto', 'ru'), 'Он одобрен?');
  assert.equal(phrasebook('something it has never seen', 'en', 'fr'), null);
  const r = await translate('placebo', 'en', 'ar');
  assert.equal(r.engine, 'phrasebook');
  assert.equal(r.text, 'دواء وهمي');
  const none = await translate('an unseen sentence', 'en', 'fr');
  assert.equal(none.engine, 'none');
  assert.equal(none.text, '');
});

/* --------------------------------------------- the classified file, EX-039 */

import {
  CLAIMS, EXENATIDE, GLP1, IDENTITY, STUDIES as EX_STUDIES, TEASER_CHECK, alignment, kaFor, keFrom, lifetime, simulate, tmaxOf,
} from '../../public/astra/showcase/classified.js';
import { inkLength, signatureValid, strokeHash } from '../../public/astra/showcase/vault.js';

test('exenatide is 39 residues and 53% identical to GLP-1 over GLP-1’s 30', () => {
  assert.equal(EXENATIDE.length, 39);
  assert.equal(GLP1.length, 30);
  const a = alignment();
  assert.equal(a.identical, 16);
  assert.ok(Math.abs(a.percent - 53.33) < 0.01);
  // Position 2: glycine against alanine — the DPP-4 resistance.
  assert.deepEqual([a.positions[1].ex, a.positions[1].glp, a.positions[1].same], ['G', 'A', false]);
  assert.equal(a.positions.filter((p) => p.tail).length, 9);
});

test('the kinetics reproduce the label: t½ 2.4 h, tmax 2.1 h', () => {
  const ke = keFrom(IDENTITY.halfLife);
  assert.ok(Math.abs(ke - Math.LN2 / 2.4) < 1e-12);
  const ka = kaFor(IDENTITY.tmax, ke);
  assert.ok(Math.abs(tmaxOf(ka, ke) - 2.1) < 1e-6);
  const sim = simulate({ interval: 12 });
  // Five half-lives in 12 h: 2⁻⁵ = 3.125% left; R = 1/(1 − 2⁻⁵).
  assert.ok(Math.abs(sim.remaining - 2 ** -5) < 1e-12);
  assert.ok(Math.abs(sim.accumulation - 1 / (1 - 2 ** -5)) < 1e-12);
  // A single dose, scaled, peaks at 1 near 2.1 h.
  const first = sim.points.filter(([t]) => t < 12);
  const peak = first.reduce((m, p) => (p[1] > m[1] ? p : m));
  assert.ok(Math.abs(peak[0] - 2.1) < 0.11 && Math.abs(peak[1] - 1) < 1e-3);
});

test('sampled lifetimes have the drug’s half-life as their median', () => {
  assert.equal(lifetime(0.5, 2.4), 2.4);
  assert.ok(Math.abs(lifetime(0.25, 2.4) - 4.8) < 1e-12);
});

test('the evidence file is graded and the teaser’s fiction is called fiction', () => {
  assert.equal(EX_STUDIES.length, 7);
  for (const s of EX_STUDIES) assert.ok(s.title && s.journal && s.year && s.tier && s.finding && s.limitation, s.id);
  assert.equal(EX_STUDIES.find((s) => s.id === 'exenatide-pd3').direction, -1);
  const byId = Object.fromEntries(CLAIMS.map((c) => [c.id, c]));
  assert.equal(byId.parkinson.level, 'contradicted');
  assert.equal(byId.muscle.score, 0);
  assert.ok(byId.glycaemia.score > 0.6);
  assert.equal(TEASER_CHECK.find((c) => /hypertrophy/.test(c.said)).verdict, 'false');
  assert.equal(TEASER_CHECK.find((c) => /2\.4 hours/.test(c.said)).verdict, 'true');
});

test('a signature needs real ink across the pad; its reference is stable', () => {
  const scribble = [[[10, 50], [12, 52]]];
  assert.equal(signatureValid(scribble, 300), false);
  const wave = [Array.from({ length: 40 }, (_, i) => [10 + i * 7, 50 + Math.sin(i / 3) * 25])];
  assert.ok(inkLength(wave) > 280);
  assert.equal(signatureValid(wave, 300), true);
  assert.equal(strokeHash(wave.flat()), strokeHash(wave.flat()));
  assert.match(strokeHash(wave.flat()), /^[0-9A-F]{8}$/);
});
