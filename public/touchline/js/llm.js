/**
 * An optional analyst that is handed the numbers and nothing else.
 *
 * The match report is written on-device from the measurements, and it is
 * complete without this. What a language model adds is restating it in plainer
 * words and answering a coach's follow-up question — "which of my full-backs
 * ran more in the last ten minutes" — without anyone reading a table.
 *
 * What leaves the device is the digest from `report.js`: distances, speeds,
 * possession seconds, coverage fractions. No frame, no crop, no still, no
 * location, no kit colours that could name a club. There is no way to send an
 * image from here, which is the design rather than an omission — footage of
 * children playing football is not something an app should be able to post to a
 * third party because a setting was left on.
 *
 * The rules the model works under are as important as the data. It cannot add a
 * fact that is not in the digest, cannot rate a player, and cannot turn a
 * coverage-limited number into a match total. A model that says "he covered
 * 11 km" from a digest that reports 3.1 km over 28% coverage has invented the
 * most quotable sentence in the report.
 *
 * @module touchline/llm
 */

const KEY_STORE = 'touchline.llm.v1';

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

/** The rules the analyst works under. */
export const SYSTEM_PROMPT = [
  'You explain football tracking measurements to a coach who is looking at the same numbers.',
  'You are given a digest of measurements only. You have never seen the footage.',
  '',
  'Rules, without exception:',
  '1. Every claim must come from a number in the digest, and you name the number.',
  '2. Coverage is the fraction of the session a player was tracked for. Never scale a',
  '   figure up to a full match, and say the coverage whenever you quote a total.',
  '3. Possession shares are shares of attributed time only. Always give attributedShare',
  '   alongside them. Never present them as shares of the match.',
  '4. Never rate, rank or grade a player as good or bad. Distances and speeds are',
  '   workload, not quality, and you do not know the tactics, the score or the position.',
  '5. Never guess a name, club, age or anything about who a player is. They are labels.',
  '6. If the digest does not answer the question, say which measurement is missing.',
  '7. Four sentences at most. Plain words. No headings, no bullet points, no preamble.',
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
    /* private browsing; the analyst simply stays off */
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
        max_tokens: 400,
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
      max_tokens: 400,
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
 * @returns {string} The answer, or an empty string.
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
 * Ask about a match digest.
 *
 * @param {object} digest Numbers from `report.matchReport`.
 * @param {string} [question] A coach's question about them.
 * @returns {Promise<{text: string, error: string|null}>} The answer, or the
 *   reason there is none.
 */
export async function ask(digest, question = '') {
  const credentials = loadCredentials();
  if (!credentials?.key) return { text: '', error: 'No key stored — the analyst is off.' };
  const prompt = [
    'Measurements from one tracked session:',
    JSON.stringify(digest, null, 2),
    question ? `\nThe coach asks: ${question}` : '\nSummarise what was measured.',
  ].join('\n');
  const request = buildRequest(credentials, prompt);
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    if (!response.ok) return { text: '', error: `Provider returned ${response.status}.` };
    const payload = await response.json();
    const text = extractText(payload);
    return text ? { text, error: null } : { text: '', error: 'Empty response.' };
  } catch (error) {
    return { text: '', error: String(error?.message ?? error) };
  }
}
