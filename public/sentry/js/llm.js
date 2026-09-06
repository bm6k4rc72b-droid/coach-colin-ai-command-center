/**
 * Optional language-model narration of a track summary.
 *
 * The offline writer in `dossier.js` decides what is true. This module only
 * changes how it is said, and answers an operator's follow-up questions about a
 * summary already produced. That split is not decoration: a system that watches
 * people should not have a language model deciding what they were doing, and it
 * should keep working when the connection drops — which, for a camera in a shed
 * at the end of a drive, is most nights.
 *
 * What crosses the network is the digest from `dossier.digest`: a dozen numbers
 * and a category label. No frame, no crop, no thumbnail, no location, no
 * timestamps. The key is pasted by the operator, kept in this browser only, and
 * sent to the endpoint they chose.
 *
 * The system prompt below is part of the safety story rather than prompt
 * decoration. Handed movement statistics about a person, a model's default
 * register is the language of suspicion — "loitering", "casing", "acting
 * evasively" — and that register is a claim about a mind, generated from a
 * number about a body. The instructions forbid it explicitly, and the offline
 * summary is always shown alongside so the operator can see what was measured
 * versus what was narrated.
 *
 * @module sentry/llm
 */

const KEY_STORE = 'sentry.llm.v1';

/** Endpoints the client speaks to. */
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
    hint: 'Any OpenAI-compatible endpoint, including one on your own network.',
  },
]);

/** The rules the narrator works under. */
export const SYSTEM_PROMPT = [
  'You narrate movement measurements from a security camera for the person who owns it.',
  'You are given numbers only — distances, speeds, a step cadence, posture ratios, zone events.',
  'You have never seen the footage and you cannot see the subject.',
  '',
  'Rules, without exception:',
  '1. Describe only what the numbers measure. Never infer intent, emotion, character or criminality.',
  '2. Never use the vocabulary of suspicion — casing, lurking, prowling, suspicious, threatening.',
  '   "Stopped for 40 s by the gate" is the sentence; "loitering suspiciously" is not.',
  '3. Never guess identity, sex, age, ethnicity or anything else about who the subject is.',
  '4. Say plainly when a measurement is missing or weak rather than filling the gap.',
  '5. Pulse and breathing figures from a camera are estimates, not medical readings. Say so if you use them.',
  '6. Three sentences at most. Plain words. No headings, no bullet points, no preamble.',
].join('\n');

/**
 * Read stored credentials.
 *
 * @returns {{provider: string, key: string, url: string, model: string}|null}
 *   Credentials, or null when none are stored.
 */
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
 * @param {object|null} credentials Credentials to keep, or null to forget them.
 * @returns {void}
 */
export function saveCredentials(credentials) {
  try {
    if (!credentials) localStorage.removeItem(KEY_STORE);
    else localStorage.setItem(KEY_STORE, JSON.stringify(credentials));
  } catch {
    /* private browsing; narration simply stays off */
  }
}

/**
 * Build the request body for a provider.
 *
 * @param {object} credentials Stored credentials.
 * @param {string} prompt User-side content.
 * @returns {{url: string, headers: Record<string, string>, body: string}}
 *   Everything `fetch` needs.
 */
export function buildRequest(credentials, prompt) {
  if (credentials.provider === 'anthropic') {
    return {
      url: credentials.url,
      headers: {
        'content-type': 'application/json',
        'x-api-key': credentials.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: credentials.model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    };
  }
  return {
    url: credentials.url,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${credentials.key}`,
    },
    body: JSON.stringify({
      model: credentials.model,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  };
}

/**
 * Pull the text out of either provider's response shape.
 *
 * @param {object} payload Parsed response body.
 * @returns {string} The narration, or an empty string.
 */
export function extractText(payload) {
  if (Array.isArray(payload?.content)) {
    return payload.content
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('')
      .trim();
  }
  return String(payload?.choices?.[0]?.message?.content ?? '').trim();
}

/**
 * Narrate a track digest.
 *
 * @param {object} digest Numbers from `dossier.digest`.
 * @param {string} [question] An operator's follow-up question about them.
 * @returns {Promise<{text: string, error: string|null}>} Narration, or the
 *   reason there is none.
 */
export async function narrate(digest, question = '') {
  const credentials = loadCredentials();
  if (!credentials?.key) return { text: '', error: 'No key stored — narration is off.' };
  const prompt = [
    'Measurements for one tracked subject:',
    JSON.stringify(digest, null, 2),
    question ? `\nThe operator asks: ${question}` : '\nSummarise what was measured.',
  ].join('\n');
  const request = buildRequest(credentials, prompt);
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    if (!response.ok) {
      return { text: '', error: `Provider returned ${response.status}.` };
    }
    const payload = await response.json();
    const text = extractText(payload);
    return text ? { text, error: null } : { text: '', error: 'Empty response.' };
  } catch (error) {
    return { text: '', error: String(error?.message ?? error) };
  }
}
