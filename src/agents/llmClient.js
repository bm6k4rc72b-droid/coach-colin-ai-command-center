/**
 * LLM client — one call shape for every agent turn.
 *
 * The browser never sees an API key. This posts to `/api/agent-chat`, which
 * holds the key, resolves the agent's allowed tool NAMES into real schemas, and
 * forwards to the provider. That indirection is also what lets the tool
 * definitions stay single-sourced from `GEV_REALTIME_TOOLS`.
 */

/** Thrown when the proxy is reachable but the run cannot proceed. */
export class AgentChatError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'AgentChatError';
    this.status = status;
    this.retryable = retryable;
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * Run one model turn.
 *
 * @param {object} options
 * @param {object[]} options.messages - Chat messages (system/user/assistant/tool).
 * @param {string[]} [options.tools] - Tool names the model may call.
 * @param {string} [options.model] - Override the server default.
 * @param {object} [options.responseFormat] - e.g. `{ type: 'json_object' }`.
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.fetchImpl] - Injected for tests.
 * @param {string} [options.apiBase]
 * @returns {Promise<{content: string, toolCalls: {id: string, name: string, args: object}[], usage: object}>}
 */
export async function agentChat({
  messages,
  tools = [],
  model = '',
  responseFormat = null,
  temperature = null,
  signal = null,
  fetchImpl = null,
  apiBase = '/api',
} = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

  let res;
  try {
    res = await doFetch(`${apiBase}/agent-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        tools,
        model: model || undefined,
        response_format: responseFormat || undefined,
        temperature: temperature ?? undefined,
      }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // A transport failure is worth another attempt; a 400 is not.
    throw new AgentChatError(`Cannot reach the agent proxy: ${error?.message || error}`, { retryable: true });
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AgentChatError(body?.error || describeProxyFailure(res.status), {
      status: res.status,
      retryable: RETRYABLE_STATUS.has(res.status),
    });
  }

  return {
    content: String(body?.content || ''),
    toolCalls: Array.isArray(body?.tool_calls) ? body.tool_calls.map(normalizeToolCall).filter(Boolean) : [],
    usage: body?.usage || null,
    model: body?.model || '',
  };
}

/**
 * Explain a proxy failure that carried no message of its own.
 *
 * The 404/405 case is the one worth spelling out: it is what a STATIC deploy
 * (GitHub Pages and friends) returns, because `/api/agent-chat` only exists on
 * the Vite dev/preview server. A bare "returned 404" reads as a bug in the
 * swarm; the real answer is that this build has no backend behind it.
 *
 * @param {number} status
 * @returns {string}
 */
export function describeProxyFailure(status) {
  if (status === 404 || status === 405) {
    return 'No agent backend here — /api/agent-chat is missing, which means this is a static build (e.g. GitHub Pages). The swarm needs the local server: run ./start.sh and open the app from there.';
  }
  if (status === 401 || status === 403) {
    return 'The agent proxy rejected the request — check that OPENAI_API_KEY is set and valid.';
  }
  return `Agent proxy returned ${status}`;
}

/**
 * Normalize a provider tool call into `{id, name, args}`.
 *
 * Arguments arrive as a JSON STRING and the model can emit invalid JSON. A
 * parse failure becomes an empty-args call carrying `parseError` rather than a
 * thrown exception, so the worker can hand the model a readable tool error and
 * let it retry the call — one malformed argument blob should not kill a task.
 */
export function normalizeToolCall(raw) {
  const name = raw?.function?.name || raw?.name;
  if (!name) return null;
  const rawArgs = raw?.function?.arguments ?? raw?.arguments ?? '{}';
  let args = {};
  let parseError = null;
  if (typeof rawArgs === 'object' && rawArgs !== null) {
    args = rawArgs;
  } else {
    try {
      args = JSON.parse(String(rawArgs || '{}'));
      if (!args || typeof args !== 'object') {
        parseError = 'Tool arguments must be a JSON object';
        args = {};
      }
    } catch (error) {
      parseError = `Tool arguments were not valid JSON: ${error.message}`;
      args = {};
    }
  }
  return { id: String(raw?.id || name), name: String(name), args, parseError };
}

/**
 * Parse a planner response that was requested as JSON.
 *
 * Models sometimes wrap JSON in a ```json fence even under a JSON response
 * format, so the fence is stripped before parsing rather than treated as a
 * failure.
 */
export function parsePlanJson(text) {
  const trimmed = String(text || '').trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { ok: true, plan: JSON.parse(unfenced), error: null };
  } catch (error) {
    return { ok: false, plan: null, error: `Planner did not return valid JSON: ${error.message}` };
  }
}
