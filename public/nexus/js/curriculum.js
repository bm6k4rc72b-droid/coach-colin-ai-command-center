/**
 * Curriculum index and retrieval.
 *
 * Joins the three tracks into one addressable syllabus and builds the search
 * index the mentor answers from when no language model is configured. The
 * retrieval is a small BM25-flavoured scorer over lesson-sized chunks — no
 * embeddings, no network, and good enough that the console teaches something
 * useful on a plane.
 *
 * @module nexus/curriculum
 */

import { AGENTS_TRACK } from './tracks/agents.js';
import { APPCRAFT_TRACK } from './tracks/appcraft.js';
import { CYBER_TRACK } from './tracks/cyber.js';

/**
 * @typedef {object} Lesson
 * @property {string} id Stable id, unique within its module.
 * @property {string} title Lesson title.
 * @property {string[]} body Paragraphs.
 * @property {{ lang: string, text: string }} [code] Optional worked example.
 * @property {string[]} keyPoints Takeaways.
 * @property {string} [lab] Id of a lab this lesson unlocks.
 */

/**
 * @typedef {object} Module
 * @property {string} id Module id.
 * @property {string} title Module title.
 * @property {number} minutes Estimated duration.
 * @property {Lesson[]} lessons Lessons in order.
 * @property {Array<{ q: string, options: string[], answer: number, why: string }>} quiz Check questions.
 */

/**
 * @typedef {object} Track
 * @property {string} id Track id.
 * @property {string} title Track title.
 * @property {string} tagline One-line description.
 * @property {string} accent Theme colour.
 * @property {Module[]} modules Modules in order.
 */

/** @type {Track[]} */
export const TRACKS = [AGENTS_TRACK, APPCRAFT_TRACK, CYBER_TRACK];

/**
 * Every lesson in the syllabus, flattened with its parents attached.
 *
 * @returns {Array<{ key: string, track: Track, module: Module, lesson: Lesson, index: number }>}
 *   Ordered lesson records.
 */
export function allLessons() {
  const out = [];
  for (const track of TRACKS) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        out.push({
          key: `${track.id}/${mod.id}/${lesson.id}`,
          track,
          module: mod,
          lesson,
          index: out.length,
        });
      }
    }
  }
  return out;
}

/**
 * Look up one lesson by its `track/module/lesson` key.
 *
 * @param {string} key Lesson key.
 * @returns {object|null} The lesson record, or null.
 */
export function findLesson(key) {
  return allLessons().find((entry) => entry.key === key) || null;
}

/**
 * Total lesson count, used for progress percentages.
 *
 * @returns {number} Lessons in the syllabus.
 */
export function lessonCount() {
  return allLessons().length;
}

/** Words too common to carry signal in a syllabus this size. */
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'that', 'this', 'it', 'as', 'at', 'by', 'from', 'you',
  'your', 'not', 'do', 'does', 'can', 'will', 'what', 'how', 'why', 'when', 'which', 'who', 'me',
  'i', 'my', 'we', 'our', 'they', 'them', 'their', 'has', 'have', 'had', 'if', 'so', 'than', 'then',
  'about', 'into', 'more', 'most', 'one', 'its', 'also', 'there', 'here', 'up', 'out', 'over']);

/**
 * Tokenise text into lowercase word stems.
 *
 * Stemming is crude on purpose — trailing plurals and common suffixes only —
 * which is enough to match "agents" to "agent" without a stemmer library.
 *
 * @param {string} text Input.
 * @returns {string[]} Tokens.
 */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-\s]/g, ' ')
    .split(/[\s.]+/)
    .map((word) => word.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((word) => word.length > 2 && !STOP.has(word))
    .map((word) => word.replace(/(ies)$/, 'y').replace(/(sses|ses|s)$/, (m) => (m === 'sses' ? 'ss' : ''))
      .replace(/(ing|ed)$/, ''))
    .filter(Boolean);
}

/**
 * Build the retrieval index over every lesson.
 *
 * @returns {{ docs: Array<object>, df: Map<string, number>, avgLen: number }} Index.
 */
export function buildIndex() {
  const docs = allLessons().map((entry) => {
    const text = [
      entry.track.title, entry.module.title, entry.lesson.title,
      ...entry.lesson.body, ...entry.lesson.keyPoints,
    ].join(' ');
    const tokens = tokenize(text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    // Title terms are worth more than body terms.
    for (const token of tokenize(`${entry.lesson.title} ${entry.module.title}`)) {
      tf.set(token, (tf.get(token) || 0) + 3);
    }
    return { key: entry.key, entry, tf, length: tokens.length };
  });
  const df = new Map();
  for (const doc of docs) {
    for (const token of doc.tf.keys()) df.set(token, (df.get(token) || 0) + 1);
  }
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen };
}

let cachedIndex = null;

/**
 * Search the syllabus.
 *
 * @param {string} query Natural-language question.
 * @param {number} [limit] Maximum results.
 * @returns {Array<{ key: string, score: number, entry: object }>} Ranked lessons.
 */
export function searchCurriculum(query, limit = 4) {
  if (!cachedIndex) cachedIndex = buildIndex();
  const { docs, df, avgLen } = cachedIndex;
  const terms = tokenize(query);
  if (!terms.length) return [];
  const k1 = 1.4;
  const b = 0.72;
  const results = docs.map((doc) => {
    let score = 0;
    for (const term of terms) {
      const f = doc.tf.get(term);
      if (!f) continue;
      const n = df.get(term) || 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / avgLen)));
    }
    return { key: doc.key, score, entry: doc.entry };
  });
  return results
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}

/**
 * Pick the sentences from a lesson that best answer a question.
 *
 * @param {object} entry A lesson record from {@link allLessons}.
 * @param {string} query The question.
 * @param {number} [count] Sentences to return.
 * @returns {string[]} The best-matching sentences, in document order.
 */
export function bestSentences(entry, query, count = 3) {
  const terms = new Set(tokenize(query));
  const sentences = entry.lesson.body
    .flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z“"])/))
    .filter((s) => s.trim().length > 40);
  const scored = sentences.map((sentence, i) => {
    const tokens = tokenize(sentence);
    let hits = 0;
    for (const token of tokens) if (terms.has(token)) hits += 1;
    return { sentence: sentence.trim(), score: hits / Math.sqrt(tokens.length || 1), i };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
    .map((s) => s.sentence);
}
