/**
 * The hook writer's brain: Claude, called from the browser with the creator's own API key.
 *
 * The key is kept in this browser only (localStorage) and sent only to api.anthropic.com.
 * The request carries what the analysis measured (scores, transcript, on-screen text), so
 * the hooks are written for this exact clip rather than generically.
 *
 * @module viralforge/claude
 */
import Anthropic from '../vendor/anthropic/sdk.mjs';

export const MODEL = 'claude-opus-5-5';
const KEY = 'viralforge.anthropicKey';

export const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setKey = (k) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hooks', 'onScreenText', 'caption', 'hashtags', 'shotList', 'reasoning'],
  properties: {
    hooks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['text', 'pattern', 'why'],
        properties: { text: { type: 'string' }, pattern: { type: 'string' }, why: { type: 'string' } },
      },
    },
    onScreenText: { type: 'string', description: '3–7 word hook to burn on screen for the first 3 seconds' },
    caption: { type: 'string', description: 'post caption: hook line, 1–3 short lines, a question or CTA' },
    hashtags: { type: 'array', items: { type: 'string' } },
    shotList: { type: 'array', items: { type: 'string' }, description: 'a re-edit plan, one beat per item with a timestamp' },
    reasoning: { type: 'string', description: 'two sentences on what will most improve retention for this clip' },
  },
};

const SYSTEM = `You are a short-form video strategist (Instagram Reels, TikTok, YouTube Shorts). You write hooks that stop the scroll in under 3 seconds and captions that earn comments and saves.
Rules: hooks are spoken in under 3 seconds (max ~12 words); plain words; no clickbait claims the clip cannot back up; never invent statistics, testimonials or medical claims; for elder-care footage, protect resident dignity and privacy (no faces of residents without consent, no mocking of falls).
Use the measured analysis you are given to decide what to fix first.`;

/**
 * @param {object} p
 * @param {string} p.apiKey
 * @param {string} p.topic
 * @param {string} p.niche
 * @param {string} p.audience
 * @param {object} [p.analysis] summary from the analyser
 * @param {string} [p.transcript]
 */
export async function writeHooks(p) {
  const client = new Anthropic({ apiKey: p.apiKey, dangerouslyAllowBrowser: true });
  const brief = {
    topic: p.topic, niche: p.niche, audience: p.audience, platform: p.platform || 'Instagram Reels',
    analysis: p.analysis || null, transcript: (p.transcript || '').slice(0, 6000) || null,
  };
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Write 8 hooks (varied patterns), the on-screen text, a caption, 5–8 hashtags and a re-edit shot list for this clip.\n\n${JSON.stringify(brief, null, 2)}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error(`Claude declined: ${res.stop_details?.explanation || 'policy'}`);
  if (res.stop_reason === 'max_tokens') throw new Error('Response was cut off; try again.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { ...JSON.parse(text), model: res.model, usage: res.usage };
}

/** Maps SDK errors to plain English for the UI. */
export function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it at console.anthropic.com.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a minute and try again.';
  if (e instanceof Anthropic.BadRequestError) return `Request rejected: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach api.anthropic.com. Check your connection.';
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`;
  return e.message || String(e);
}
