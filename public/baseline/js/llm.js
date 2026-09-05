/**
 * Optional language-model narration.
 *
 * The coach in `coach.js` decides. This module only ever changes how the
 * decision is *said*, and answers questions the offline responder cannot. That
 * split is deliberate and worth defending: a training prescription drawn from
 * health measurements should come from rules a person can read and test, not
 * from whatever a model felt like generating, and it should not stop working
 * when the phone has no signal.
 *
 * A key is pasted by the user, stored in this browser only, and sent to the
 * endpoint the user chose. The reading summary that goes with it is a handful
 * of numbers — no video, no images, no identity.
 *
 * @module baseline/llm
 */

const KEY_STORE = 'baseline.llm.v1';

/** Providers the client speaks to. */
export const PROVIDERS = Object.freeze([
  {
    id: 'anthropic',
    label: 'Claude',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-5',
    hint: 'An Anthropic API key (starts with sk-ant-).',
  },
  {
    id: 'openai',
    label: 'OpenAI-compatible',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    hint: 'Any OpenAI-compatible endpoint, including a local one.',
  },
]);

/** @returns {{provider: string, key: string, url: string, model: string}|null} Stored credentials. */
export function loadCredentials() {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Store or clear credentials.
 *
 * @param {object|null} credentials Credentials, or null to forget them.
 */
export function saveCredentials(credentials) {
  try {
    if (!credentials) localStorage.removeItem(KEY_STORE);
    else localStorage.setItem(KEY_STORE, JSON.stringify(credentials));
  } catch {
    /* Without a store the key simply does not persist past this session. */
  }
}

/**
 * Compact the state into the few numbers a narrator needs.
 *
 * @param {object} state App state.
 * @returns {string} A short factual brief.
 */
export function briefFor(state) {
  const { reading, readiness, baseline, plan, profile, context } = state;
  const lines = [
    `Resting pulse ${Math.round(reading.bpm)} bpm (usual ${Math.round(baseline.restingHr.centre || 0) || 'unknown'}).`,
    reading.hrv?.reliable
      ? `HRV RMSSD ${Math.round(reading.hrv.rmssd)} ms (usual ${Math.round(baseline.hrv.centre || 0) || 'unknown'}).`
      : 'HRV was not reliable in this scan.',
    reading.breathsPerMin ? `Breathing ${Math.round(reading.breathsPerMin)} per minute.` : '',
    `Scan quality ${reading.grade} at ${Math.round((reading.confidence || 0) * 100)}%.`,
    readiness.score === null
      ? `Baseline still building (${baseline.n} of 4 scans).`
      : `Readiness ${readiness.score} (${readiness.band.label}).`,
    context.sleepHours ? `Slept ${context.sleepHours} h, quality ${context.sleepQuality}/4.` : '',
    Number.isFinite(context.soreness) ? `Soreness ${context.soreness}/4, stress ${context.stress}/4.` : '',
    `Goal ${profile.goal}, age ${profile.age}.`,
    `Prescription: ${plan.verdict} — ${plan.session.title}, ${plan.session.minutes} min, ceiling zone ${plan.capZone}.`,
    `Reasons: ${plan.rationale.join(' ')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** The standing instruction sent with every request. */
export const SYSTEM_PROMPT = [
  'You are the voice of a training-readiness app. The app has already decided today\'s session using',
  'rules; your job is to explain and answer, never to overrule it. Be brief — three sentences unless',
  'asked for more. Speak plainly, like an experienced coach who respects the athlete.',
  'The measurements come from a phone camera: good for pulse rate, only fair for variability, and',
  'not medical instrumentation. Never diagnose, never name a condition, and never tell anyone to',
  'ignore symptoms; if something sounds clinical, say plainly that it is a question for a doctor.',
].join(' ');

/**
 * Ask the model something, with the reading as context.
 *
 * @param {string} question The athlete's question.
 * @param {string} brief Output of {@link briefFor}.
 * @param {object} credentials Provider, key, url and model.
 * @param {object} [options] Options.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<string>} The model's answer.
 * @throws {Error} When the endpoint rejects the request or returns nothing.
 */
export async function ask(question, brief, credentials, options = {}) {
  const provider = PROVIDERS.find((entry) => entry.id === credentials.provider) || PROVIDERS[0];
  const url = credentials.url || provider.url;
  const model = credentials.model || provider.model;
  const content = `Today's numbers:\n${brief}\n\nAthlete asks: ${question}`;

  const request = provider.id === 'anthropic'
    ? {
      headers: {
        'content-type': 'application/json',
        'x-api-key': credentials.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
    }
    : {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${credentials.key}`,
      },
      body: {
        model,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      },
    };

  const response = await fetch(url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`The coach's endpoint returned ${response.status}. The offline coach still works.`);
  }
  const data = await response.json();
  const text = provider.id === 'anthropic'
    ? data?.content?.map((block) => block.text).filter(Boolean).join('\n')
    : data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('The endpoint replied with no text.');
  return String(text).trim();
}
