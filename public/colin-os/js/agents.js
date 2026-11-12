/**
 * COLIN OS agents: six specialists and an orchestrator, each a Claude call with a strict JSON schema.
 *
 * Called from the browser with Colin's own Anthropic key (kept in localStorage, sent only to
 * api.anthropic.com). Every agent gets the same profile and guardrails, and every draft passes
 * the deterministic compliance check in core.js before it is shown as ready to post.
 *
 * @module colin-os/agents
 */
import Anthropic from '../../viralx/vendor/anthropic/sdk.mjs';
import { PROFILE, LANES, checkCompliance, withDisclosure, affiliateLink, offlineDraft } from './core.js';
import { ALL_AGENTS, BUSINESSES, routeGoal } from './team.js';

export const MODEL = 'claude-opus-5-5';
const KEY = 'colin-os.anthropicKey';

export const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setKey = (k) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });

const GUARDRAILS = `Guardrails (non-negotiable):
- Colin is a certified fitness and nutrition coach, not a doctor or pharmacist. Never give dosing, injection, reconstitution or stacking instructions. Never say a peptide or GLP-1 cures, treats or prevents any disease. Never call a product FDA approved. No guarantees, no "no side effects", no invented statistics, testimonials or before/after numbers.
- Any content that mentions Optimum Regen Peptides or the affiliate link carries a clear disclosure ("#ad" plus "I earn a commission") near the top.
- Blood work and a doctor's involvement are mandatory in Colin's GLP lane: say so whenever GLP-1 or peptides come up.
- Do not repeat unverifiable superlatives ("most certified in the world", "featured on Forbes"); list real certifications instead.
- No content aimed at minors about peptides or GLP-1. Athlete content stays on training, recovery and nutrition.`;

const context = () => `You work on COLIN OS, the AI content and client team for ${PROFILE.name} (Instagram @${PROFILE.handle}).
Offer: ${PROFILE.offer}.
Client lanes: ${Object.values(LANES).map((l) => l.blurb).join('; ')}.
Certifications: ${PROFILE.certifications.join('; ')}.
Partner (affiliate): ${PROFILE.partner.name}, ${PROFILE.partner.url}${PROFILE.partner.code ? `, code ${PROFILE.partner.code}` : ''}.
Brand voice: ${PROFILE.voice}
Brand look: black and gold, cowboy hat, neon-blue night city.
${GUARDRAILS}`;

/** The team. `schema` is what each agent must return. */
export const AGENTS = {
  scout: {
    name: 'Scout', role: 'Trend & angle research', icon: '🛰',
    task: (b) => `Find 6 content angles for this week. Topic focus: ${b.topic || 'open'}. Lane: ${b.lane || 'all'}. Notes: ${b.notes || 'none'}. Use what you know about what performs for fitness, GLP-1 lifestyle and peptide-education creators on Instagram Reels. Rank by likely reach x likely clients.`,
    schema: obj({ angles: { type: 'array', items: obj({ title: str, lane: str, why: str, format: str }) }, avoid: strs }),
  },
  script: {
    name: 'Scriptwriter', role: 'Reels scripts & hooks', icon: '🎬',
    task: (b, prev) => `Write a 30-45 second Reel script for the best angle${prev.scout ? ` from: ${JSON.stringify(prev.scout.angles?.slice(0, 3))}` : ` on: ${b.topic}`}. Give 5 alternative hooks (under 12 words, spoken in under 3 seconds), a beat-by-beat script with timestamps and camera notes in Colin's look, on-screen text, and a comment-keyword CTA.`,
    schema: obj({ angle: str, hooks: strs, beats: { type: 'array', items: obj({ t: str, say: str, shot: str }) }, onScreen: str, cta: str }),
  },
  caption: {
    name: 'Captioner', role: 'Captions, hashtags, links', icon: '✍️',
    task: (b, prev) => `Write the Instagram caption for this Reel: ${JSON.stringify(prev.script || { topic: b.topic })}. ${b.promote ? `It promotes ${PROFILE.partner.name}: include the disclosure and this tracked link: ${affiliateLink(PROFILE.partner.url, { campaign: b.campaign || 'weekly', content: b.topic || 'reel' })}.` : 'It does not promote the partner: no link.'} Also write a first comment, a story-sticker line, and 5-8 hashtags.`,
    schema: obj({ caption: str, firstComment: str, storyLine: str, hashtags: strs }),
  },
  compliance: {
    name: 'Guardian', role: 'FTC & health-claim check', icon: '🛡',
    task: (b, prev, flags) => `Review and fix this draft so it passes the guardrails, changing as little as possible. Automatic scanner flags: ${JSON.stringify(flags)}. Draft: ${JSON.stringify(prev.caption)}`,
    schema: obj({ caption: str, firstComment: str, changes: strs, verdict: { type: 'string', enum: ['ready', 'fixed', 'do-not-post'] } }),
  },
  dm: {
    name: 'Closer', role: 'Comments & DMs → clients', icon: '💬',
    task: (b) => `A follower wrote: "${b.message}". Detected lane: ${b.lane}; intent: ${b.intent}. Write Colin's reply (DM tone, under 70 words) that qualifies them for the lane (goal, timeline, blood work for GLP, online vs in person) and moves a qualified lead to a call. If they ask about peptides, you may share the disclosed affiliate link but no dosing. If they look under 18 and ask about peptides/GLP, decline politely and steer to training.`,
    schema: obj({ reply: str, followUp: str, qualifyQuestions: strs, nextStep: str }),
  },
  analyst: {
    name: 'Analyst', role: 'Insights → next moves', icon: '📈',
    task: (b) => `Here are a post's Instagram Insights and computed rates: ${JSON.stringify(b.metrics)}. Post was: ${b.topic || 'unknown'}. Diagnose in plain words what worked and what to change, then give 3 specific experiments for next week.`,
    schema: obj({ diagnosis: str, keep: strs, change: strs, experiments: strs }),
  },
};

/**
 * Runs one agent. Without a key it returns the offline draft so the UI still works.
 * @param {keyof AGENTS} id
 * @param {object} brief
 * @param {object} [prev] outputs of earlier agents in the run
 * @param {object} [extra] passed to the task builder (compliance flags)
 */
export async function runAgent(id, brief, prev = {}, extra) {
  const a = AGENTS[id];
  const apiKey = getKey();
  if (!apiKey) return { offline: true, ...offlineDraft(id, brief) };
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: a.schema } },
    system: `${context()}\n\nYou are the ${a.name} agent (${a.role}).`,
    messages: [{ role: 'user', content: a.task(brief, prev, extra) }],
  });
  if (res.stop_reason === 'refusal') throw new Error(`${a.name}: Claude declined (${res.stop_details?.explanation || 'policy'})`);
  if (res.stop_reason === 'max_tokens') throw new Error(`${a.name}: response was cut off; try again.`);
  return JSON.parse(res.content.filter((x) => x.type === 'text').map((x) => x.text).join(''));
}

/**
 * The orchestrator: Scout → Scriptwriter → Captioner → Guardian, each handing its work to the next.
 * The Guardian only calls Claude when the scanner finds something; the final draft is re-scanned.
 * @param {object} brief
 * @param {(id: string, state: 'run'|'done'|'skip'|'error', out?: any) => void} onStep
 */
export async function runPipeline(brief, onStep = () => {}) {
  const out = {};
  for (const id of ['scout', 'script', 'caption']) {
    onStep(id, 'run');
    try { out[id] = await runAgent(id, brief, out); onStep(id, 'done', out[id]); } catch (e) { onStep(id, 'error', e); throw e; }
  }
  const draft = `${out.caption.caption || ''}\n${out.caption.firstComment || ''}`;
  const scan = checkCompliance(draft, { promotesPartner: !!brief.promote || undefined });
  onStep('compliance', 'run');
  if (scan.ok && !scan.flags.length) {
    out.compliance = { verdict: 'ready', caption: out.caption.caption, firstComment: out.caption.firstComment || '', changes: [] };
  } else if (out.caption.offline) {
    out.compliance = { verdict: 'fixed', caption: withDisclosure(out.caption.caption), firstComment: '', changes: scan.flags.map((f) => f.fix) };
  } else {
    out.compliance = await runAgent('compliance', brief, out, scan.flags);
  }
  out.compliance.scan = checkCompliance(`${out.compliance.caption}\n${out.compliance.firstComment || ''}`, { promotesPartner: !!brief.promote || undefined });
  onStep('compliance', 'done', out.compliance);
  return out;
}

/** Plain-English API errors. */
export function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it at console.anthropic.com.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a minute and try again.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach api.anthropic.com. Check your connection.';
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`;
  return e?.message || String(e);
}

/* ── The 50-agent org chart and its CEO ─────────────────────────────── */

const DELIVERABLE = obj({ summary: str, deliverable: str, decisions: strs, handoff: str });

async function call(system, user, schema, maxTokens = 8000) {
  const client = new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system, messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') throw new Error(`Claude declined (${res.stop_details?.explanation || 'policy'})`);
  if (res.stop_reason === 'max_tokens') throw new Error('Response was cut off; try again.');
  return JSON.parse(res.content.filter((x) => x.type === 'text').map((x) => x.text).join(''));
}

const teamContext = (business) => `${business === 'beauty' ? `Business: ${BUSINESSES.beauty}
Guardrails: cosmetic claims only ("improves the look of"); no drug claims (regrows hair, boosts collagen, heals, SPF without testing); FTC disclosure on creator content; CAN-SPAM on email; no invented reviews or stats.` : context()}`;

/**
 * Runs one specialist from the org chart on a task.
 * @param {string} agentId @param {string} task @param {'coach'|'beauty'} business @param {string} [prior] earlier teammates' output
 */
export async function runSpecialist(agentId, task, business = 'coach', prior = '') {
  const a = ALL_AGENTS.find((x) => x.id === agentId);
  if (!a) throw new Error(`Unknown agent ${agentId}`);
  if (!getKey()) return { offline: true, summary: `${a.id} would: ${a.does.toLowerCase()}.`, deliverable: 'Add an Anthropic key in Settings to run this agent live, or run it in Claude Code: `claude --agent ' + a.id + '` (or ask the ceo agent).', decisions: [], handoff: '' };
  return call(`${teamContext(business)}\n\nYou are ${a.id}, in the ${a.deptName} department of a 50-agent marketing team. Your job: ${a.does}. Methods you follow: ${a.skills.join(', ')}. If an input is missing, say MISSING rather than invent it. Deliver work that can be used as-is.`,
    `Task: ${task}${prior ? `\n\nWork from teammates so far:\n${prior}` : ''}`, DELIVERABLE);
}

/**
 * The CEO: plans which specialists to use, runs them in order, then writes the one-page plan.
 * @param {string} goal @param {'coach'|'beauty'} business
 * @param {(event: {type: string, [k: string]: any}) => void} onEvent
 */
export async function runCEO(goal, business = 'coach', onEvent = () => {}) {
  if (!getKey()) {
    const picks = routeGoal(goal, 5);
    const plan = { outcome: goal, steps: picks.map((a) => ({ agent: a.id, brief: `${a.does} for: ${goal}` })), offline: true };
    onEvent({ type: 'plan', plan });
    return { plan, results: [], final: null };
  }
  const shortlist = routeGoal(goal, 12).map((a) => a.id);
  const planSchema = obj({ outcome: str, steps: { type: 'array', items: obj({ agent: { type: 'string', enum: ALL_AGENTS.map((a) => a.id) }, brief: str }) } });
  const plan = await call(`${teamContext(business)}\n\nYou are the CEO of a 50-agent marketing team. Roster: ${ALL_AGENTS.map((a) => `${a.id} (${a.does})`).join('; ')}.`,
    `Goal: ${goal}\nPick 3-6 specialists in the order they should work (research → strategy → content → conversion → analytics). A keyword shortlist to consider: ${shortlist.join(', ')}. Give each a precise brief and a measurable outcome for the whole plan.`, planSchema, 4000);
  onEvent({ type: 'plan', plan });
  const results = [];
  for (const step of plan.steps.slice(0, 6)) {
    onEvent({ type: 'step', agent: step.agent, state: 'run' });
    const prior = results.map((r) => `## ${r.agent}\n${r.out.summary}\n${r.out.deliverable}`).join('\n\n').slice(-12000);
    const out = await runSpecialist(step.agent, step.brief, business, prior);
    results.push({ agent: step.agent, out });
    onEvent({ type: 'step', agent: step.agent, state: 'done', out });
  }
  const final = await call(`${teamContext(business)}\n\nYou are the CEO. Merge your team's work into one plan.`,
    `Goal: ${goal}\nTeam output:\n${results.map((r) => `## ${r.agent}\n${JSON.stringify(r.out)}`).join('\n\n').slice(-30000)}`,
    obj({ headline: str, thisWeek: strs, decisions: strs, metric: str }), 4000);
  onEvent({ type: 'final', final });
  return { plan, results, final };
}
