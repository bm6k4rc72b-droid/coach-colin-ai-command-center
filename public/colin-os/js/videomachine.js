/**
 * Video Machine: turns a COLIN OS script (or a bare topic) into a MoneyPrinterTurbo job.
 *
 * MoneyPrinterTurbo (github.com/harry0703/MoneyPrinterTurbo, MIT, in money-printer/) finds stock
 * footage, voices the script, burns subtitles and edits the vertical video. We hand it a script that
 * has already passed the COLIN OS guardrails, plus footage search terms that never show needles,
 * pills or medical procedures. Pure functions: used by the page and by money-printer/make-video.mjs.
 *
 * @module colin-os/videomachine
 */
import { checkCompliance } from './core.js';

/** Stock-footage search terms per client lane (Pexels / Pixabay). */
export const LANE_TERMS = {
  athlete: ['sprint training', 'football practice', 'athlete weight room', 'agility drills', 'basketball workout', 'track sprint start'],
  glp: ['healthy meal prep', 'strength training', 'woman lifting weights', 'man deadlift gym', 'protein breakfast', 'walking outdoors fitness'],
  pressure: ['firefighter training', 'real estate agent city', 'busy office stress', 'police fitness', 'morning workout city', 'businessman running'],
  general: ['gym workout night', 'personal trainer coaching', 'cowboy hat portrait', 'city lights night', 'kettlebell training', 'fitness motivation'],
};

/** Footage we never want next to peptide or GLP-1 talk. */
const BLOCKED_TERMS = /syringe|needle|inject|pill|tablet|capsule|vial|hospital|surgery|iv drip|drugs?|steroid|ozempic|pen injector/i;

/** Spoken narration: hook, beats and CTA, with no stage directions or timestamps. */
export function narration(script) {
  const beats = (script.beats || []).map((b) => (typeof b === 'string' ? b : b.say || '')).map((s) => s.replace(/^\s*\d+(\.\d+)?\s*[–-]\s*\d+(\.\d+)?s:\s*/, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  const hook = script.hooks?.[0] || script.hook || '';
  const lines = [hook, ...beats.filter((b) => b !== hook.trim()), script.cta || ''].map((s) => s.trim()).filter(Boolean);
  return lines.filter((l, i) => l !== lines[i - 1]).join(' ').replace(/\s+/g, ' ');
}

/** Footage terms: lane defaults plus words from the script's shot notes, with anything medical removed. */
export function footageTerms(script, lane = 'general', max = 6) {
  const fromShots = (script.beats || []).map((b) => (typeof b === 'object' ? b.shot : '')).filter(Boolean)
    .map((s) => s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(' ')).filter(Boolean);
  const all = [...fromShots, ...(LANE_TERMS[lane] || LANE_TERMS.general)];
  return [...new Set(all)].filter((t) => !BLOCKED_TERMS.test(t)).slice(0, max);
}

/** System prompt MoneyPrinterTurbo uses if it writes a script itself (topic-only CLI runs). */
export const COLIN_SYSTEM_PROMPT = `You write 30-45 second voice-over scripts for Coach Colin (@coachcolinc), a certified fitness and nutrition coach (ISSA GLP-1 Weight Loss Specialist, NASM Nutritionist). Voice: direct, confident, short punchy sentences.
Rules: Never give peptide or GLP-1 dosing, injection or stacking instructions. Never say a product cures, treats or prevents disease, or is FDA approved. No guarantees or invented numbers. Say blood work and a doctor come first whenever GLP-1 or peptides come up. If Optimum Regen Peptides is mentioned, start with "Paid partnership: I earn a commission from Optimum Regen links."
Output only the spoken words: a hook in the first sentence, 3 to 5 teaching points, and end with "Comment LANE and I'll tell you if you qualify."`;

/** Defaults tuned for Colin's look: vertical, bold gold subtitles, a deep male voice. */
export const MPT_DEFAULTS = {
  video_aspect: '9:16',
  video_language: 'en-US',
  voice_name: 'en-US-AndrewNeural-Male',
  voice_rate: 1.05,
  video_source: 'pexels',
  video_clip_duration: 3,
  video_concat_mode: 'random',
  video_count: 1,
  subtitle_enabled: true,
  subtitle_position: 'bottom',
  font_name: 'BeVietnamPro-Bold.ttf',
  text_fore_color: '#FFD978',
  stroke_color: '#000000',
  stroke_width: 1.5,
  font_size: 64,
  bgm_type: 'random',
  bgm_volume: 0.15,
  paragraph_number: 1,
};

/**
 * Builds the POST /api/v1/videos body. Throws if the script fails the guardrails.
 * @param {object} script COLIN OS script ({ hooks|hook, beats, cta, angle }) or { topic } alone
 * @param {{ lane?: string, promote?: boolean, overrides?: object, force?: boolean }} [opts]
 */
export function buildMptParams(script, opts = {}) {
  const lane = opts.lane || 'general';
  const text = script.topic && !script.beats ? '' : narration(script);
  const subject = script.angle || script.topic || (script.hooks?.[0] || script.hook || 'Coach Colin');
  if (text) {
    const scan = checkCompliance(text, { promotesPartner: opts.promote ?? undefined });
    const blocks = scan.flags.filter((f) => f.level === 'block');
    if (blocks.length && !opts.force) {
      const err = new Error(`Script fails the guardrails: ${blocks.map((f) => `"${f.match}" (${f.fix})`).join('; ')}`);
      err.flags = scan.flags;
      throw err;
    }
  }
  return {
    ...MPT_DEFAULTS,
    video_subject: subject.slice(0, 200),
    video_script: text,
    video_terms: footageTerms(script, lane),
    ...(text ? {} : { custom_system_prompt: COLIN_SYSTEM_PROMPT }),
    ...(opts.overrides || {}),
  };
}

/** Task states from MoneyPrinterTurbo (app/models/const.py). */
export const TASK_STATE = { failed: -1, complete: 1, processing: 4 };

/** Reads a GET /api/v1/tasks/{id} response into { done, ok, progress, videos, error }. */
export function readTask(res) {
  const d = res?.data || {};
  const done = d.state === TASK_STATE.complete || d.state === TASK_STATE.failed;
  return { done, ok: d.state === TASK_STATE.complete, progress: d.progress ?? 0, videos: d.videos || d.combined_videos || [], error: d.error || (d.state === TASK_STATE.failed ? `failed at ${d.failed_stage || 'unknown stage'}` : null) };
}
