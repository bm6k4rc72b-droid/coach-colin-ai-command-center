/**
 * Unit tests for the syllabus and its retrieval index.
 *
 * The retrieval index is what answers questions when no language model is
 * connected, so its ranking is part of the product rather than an
 * implementation detail.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TRACKS, allLessons, bestSentences, buildIndex, findLesson, lessonCount, searchCurriculum, tokenize,
} from '../../public/nexus/js/curriculum.js';

test('the syllabus is well formed', () => {
  assert.ok(TRACKS.length >= 3);
  const keys = new Set();
  for (const track of TRACKS) {
    assert.ok(track.id && track.title && track.tagline && track.accent);
    assert.ok(track.modules.length >= 3, `${track.id} needs modules`);
    for (const mod of track.modules) {
      assert.ok(mod.lessons.length >= 1);
      assert.ok(mod.quiz.length >= 2, `${mod.id} needs a check`);
      for (const question of mod.quiz) {
        assert.ok(question.options.length >= 3);
        assert.ok(question.answer >= 0 && question.answer < question.options.length,
          `${mod.id} answer index out of range`);
        assert.ok(question.why.length > 30, `${mod.id} needs a real explanation`);
      }
      for (const lesson of mod.lessons) {
        const key = `${track.id}/${mod.id}/${lesson.id}`;
        assert.ok(!keys.has(key), `duplicate lesson key ${key}`);
        keys.add(key);
        assert.ok(lesson.body.length >= 3, `${key} is too thin`);
        assert.ok(lesson.keyPoints.length >= 3, `${key} needs key points`);
        for (const paragraph of lesson.body) {
          assert.ok(paragraph.length > 80, `${key} has a stub paragraph`);
        }
      }
    }
  }
  assert.equal(lessonCount(), keys.size);
  assert.ok(lessonCount() >= 20, 'the syllabus should be worth working through');
});

test('every lab referenced by a lesson exists', async () => {
  const { LABS } = await import('../../public/nexus/js/labs/index.js');
  const ids = new Set(LABS.map((lab) => lab.id));
  for (const { key, lesson } of allLessons()) {
    if (lesson.lab) assert.ok(ids.has(lesson.lab), `${key} points at a missing lab: ${lesson.lab}`);
  }
});

test('lessons are addressable by key', () => {
  const first = allLessons()[0];
  assert.equal(findLesson(first.key).lesson.title, first.lesson.title);
  assert.equal(findLesson('no/such/lesson'), null);
});

test('tokenising drops stop words and folds simple plurals', () => {
  const tokens = tokenize('The agents are running with their tools');
  assert.ok(!tokens.includes('the'));
  assert.ok(tokens.includes('agent'), tokens.join(','));
  assert.ok(tokens.includes('tool'), tokens.join(','));
});

test('retrieval puts the right lesson first', () => {
  const expectations = [
    ['how do I stop prompt injection', 'Prompt injection'],
    ['what is an agent loop', 'What actually makes something an agent'],
    ['how should I chunk documents for retrieval', 'RAG is a search problem'],
    ['why do people fall for phishing', 'Phishing, and why smart people fall for it'],
    ['what is wrong with SMS two factor', 'Passwords, passkeys'],
    ['how do I evaluate a non-deterministic system', 'Evaluating something non-deterministic'],
  ];
  for (const [query, expected] of expectations) {
    const [top] = searchCurriculum(query, 1);
    assert.ok(top, `no result for "${query}"`);
    assert.ok(top.entry.lesson.title.includes(expected),
      `"${query}" returned "${top.entry.lesson.title}", expected something containing "${expected}"`);
  }
});

test('retrieval returns nothing for a question outside the syllabus', () => {
  assert.equal(searchCurriculum('capital city of Peru rainfall', 3).length, 0);
  assert.equal(searchCurriculum('', 3).length, 0);
});

test('the index scores title terms above body terms', () => {
  const { docs } = buildIndex();
  const lesson = docs.find((d) => d.key.endsWith('prompt-injection'));
  assert.ok(lesson.tf.get('injection') > 3, 'title terms carry a boost');
});

test('sentence selection returns document-ordered, on-topic sentences', () => {
  const [top] = searchCurriculum('indirect prompt injection through documents', 1);
  const sentences = bestSentences(top.entry, 'indirect prompt injection through documents', 3);
  assert.ok(sentences.length > 0 && sentences.length <= 3);
  const joined = sentences.join(' ').toLowerCase();
  assert.ok(joined.includes('injection'));
  // Order must follow the lesson, not the score.
  const positions = sentences.map((s) => top.entry.lesson.body.join(' ').indexOf(s.slice(0, 30)));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});
