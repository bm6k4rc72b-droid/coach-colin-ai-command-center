/**
 * Learner progress, XP and clearance level.
 *
 * All of it is local storage — there is no account, no server and nothing to
 * leak. The rank ladder is cosmetic but does real work: it is what turns
 * "read four lessons" into something a person finishes.
 *
 * @module nexus/progress
 */

import { lessonCount } from './curriculum.js';

const STORE_KEY = 'nexus.progress.v1';

/** Clearance ladder. Thresholds are cumulative XP. */
export const RANKS = [
  { at: 0, name: 'Visitor', clearance: 'UNCLEARED' },
  { at: 120, name: 'Cadet', clearance: 'LEVEL 1' },
  { at: 380, name: 'Analyst', clearance: 'LEVEL 2' },
  { at: 820, name: 'Operator', clearance: 'LEVEL 3' },
  { at: 1500, name: 'Architect', clearance: 'LEVEL 4' },
  { at: 2600, name: 'Director', clearance: 'OMEGA' },
];

/** Unlockable citations. */
export const ACHIEVEMENTS = [
  { id: 'first-lesson', name: 'Briefed', note: 'Completed your first lesson.' },
  { id: 'first-quiz', name: 'Checked', note: 'Passed a module check.' },
  { id: 'perfect-quiz', name: 'Flawless', note: 'Scored full marks on a module check.' },
  { id: 'phish-hunter', name: 'Phish Hunter', note: 'Cleared the phishing triage without a miss.' },
  { id: 'locksmith', name: 'Locksmith', note: 'Forged a passphrase above 100 bits.' },
  { id: 'red-team', name: 'Red Team', note: 'Got a payload past the undefended agent.' },
  { id: 'blue-team', name: 'Blue Team', note: 'Watched the defended agent hold the line.' },
  { id: 'architect', name: 'Loop Architect', note: 'Built an agent loop that converged.' },
  { id: 'cryptographer', name: 'Cryptographer', note: 'Broke a cipher with frequency analysis.' },
  { id: 'field-agent', name: 'Field Agent', note: 'Scanned a real code with the camera.' },
  { id: 'watcher', name: 'Watcher', note: 'Brought every live feed online at once.' },
  { id: 'track-complete', name: 'Track Complete', note: 'Finished every lesson in a track.' },
];

/**
 * Resolve a rank from cumulative XP.
 *
 * @param {number} xp Experience points.
 * @returns {{ name: string, clearance: string, index: number, next: object|null, progress: number }}
 *   Rank state, with progress toward the next rank in [0, 1].
 */
export function rankFor(xp) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) if (xp >= RANKS[i].at) index = i;
  const current = RANKS[index];
  const next = RANKS[index + 1] || null;
  const progress = next ? (xp - current.at) / (next.at - current.at) : 1;
  return { name: current.name, clearance: current.clearance, index, next, progress: Math.min(1, Math.max(0, progress)) };
}

/**
 * Day key in the learner's own timezone, for streak counting.
 *
 * @param {Date} [date] Date to key.
 * @returns {string} `YYYY-MM-DD`.
 */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Advance a streak given the last active day.
 *
 * @param {string|null} lastDay Previous day key.
 * @param {number} streak Current streak.
 * @param {string} today Today's key.
 * @returns {number} The new streak.
 */
export function nextStreak(lastDay, streak, today = dayKey()) {
  if (!lastDay) return 1;
  if (lastDay === today) return streak || 1;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return lastDay === dayKey(yesterday) ? (streak || 0) + 1 : 1;
}

/**
 * The learner's record.
 */
export class Progress {
  constructor() {
    this.data = this.#load();
    this.listeners = new Set();
  }

  /**
   * Load the record, tolerating a corrupt or absent store.
   *
   * @returns {object} Record.
   */
  #load() {
    const blank = {
      xp: 0, lessons: {}, quizzes: {}, labs: {}, achievements: [],
      streak: 0, lastDay: null, created: Date.now(),
    };
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return raw && typeof raw === 'object' ? { ...blank, ...raw } : blank;
    } catch {
      return blank;
    }
  }

  /** Persist and notify. */
  #save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch {
      // Private browsing with storage disabled: the session still works,
      // it just will not be remembered.
    }
    for (const fn of this.listeners) fn(this.snapshot());
  }

  /**
   * Subscribe to changes.
   *
   * @param {(snapshot: object) => void} fn Listener.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /**
   * A read-only view for the UI.
   *
   * @returns {object} Snapshot with derived fields.
   */
  snapshot() {
    const done = Object.keys(this.data.lessons).length;
    return {
      ...this.data,
      lessonsDone: done,
      lessonsTotal: lessonCount(),
      completion: lessonCount() ? done / lessonCount() : 0,
      rank: rankFor(this.data.xp),
    };
  }

  /**
   * Award XP and roll the daily streak.
   *
   * @param {number} amount XP to add.
   * @param {string} [reason] What earned it.
   */
  award(amount, reason = '') {
    const today = dayKey();
    this.data.streak = nextStreak(this.data.lastDay, this.data.streak, today);
    this.data.lastDay = today;
    this.data.xp = Math.max(0, this.data.xp + Math.round(amount));
    this.data.lastReason = reason;
    this.#save();
  }

  /**
   * Mark a lesson complete. Repeat visits do not re-award.
   *
   * @param {string} key Lesson key.
   * @returns {boolean} True if this was the first completion.
   */
  completeLesson(key) {
    if (this.data.lessons[key]) return false;
    this.data.lessons[key] = Date.now();
    this.award(30, 'lesson');
    this.unlock('first-lesson');
    return true;
  }

  /**
   * Record a quiz result, keeping the best score.
   *
   * @param {string} moduleId Module id.
   * @param {number} correct Correct answers.
   * @param {number} total Question count.
   */
  recordQuiz(moduleId, correct, total) {
    const previous = this.data.quizzes[moduleId]?.correct ?? -1;
    if (correct > previous) this.data.quizzes[moduleId] = { correct, total, at: Date.now() };
    const gained = correct * 20 + (correct === total ? 40 : 0);
    this.award(gained, 'quiz');
    if (correct / total >= 0.6) this.unlock('first-quiz');
    if (correct === total) this.unlock('perfect-quiz');
  }

  /**
   * Record a lab result.
   *
   * @param {string} labId Lab id.
   * @param {number} score Score for the run.
   */
  recordLab(labId, score) {
    const best = this.data.labs[labId]?.score ?? -Infinity;
    this.data.labs[labId] = { score: Math.max(best, score), at: Date.now() };
    this.award(Math.max(0, Math.round(score / 2)), 'lab');
  }

  /**
   * Unlock an achievement.
   *
   * @param {string} id Achievement id.
   * @returns {object|null} The achievement if newly unlocked.
   */
  unlock(id) {
    if (this.data.achievements.includes(id)) return null;
    const found = ACHIEVEMENTS.find((a) => a.id === id);
    if (!found) return null;
    this.data.achievements.push(id);
    this.award(50, `achievement:${id}`);
    return found;
  }

  /**
   * Export the record as JSON for backup.
   *
   * @returns {string} Pretty JSON.
   */
  export() {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Replace the record from an export.
   *
   * @param {string} json Previously exported JSON.
   * @returns {boolean} Whether the import was accepted.
   */
  import(json) {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.xp !== 'number') return false;
      this.data = { ...this.data, ...parsed };
      this.#save();
      return true;
    } catch {
      return false;
    }
  }

  /** Wipe the record. */
  reset() {
    localStorage.removeItem(STORE_KEY);
    this.data = this.#load();
    this.#save();
  }
}
