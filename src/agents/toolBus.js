/**
 * Tool bus — the single place an agent's tool call turns into a real effect.
 *
 * Only EXECUTION lives here. The JSON schemas the model sees are assembled
 * server-side in `vite.config.js` from the existing `GEV_REALTIME_TOOLS` array,
 * so the globe tools have exactly one definition shared by voice control and
 * the agent swarm; duplicating thirty schemas into client code would guarantee
 * the two drift. The client sends the tool NAMES an agent is allowed to use and
 * the proxy resolves them.
 *
 * The allowlist is enforced here as well as advertised to the model. A model
 * that hallucinates a tool outside its grant gets a refusal it can read and
 * recover from, rather than an effect nobody authorized.
 */

import { agentToolNames } from './agentRoster.js';

/** Generic (non-globe) tools, executed in the browser. */
export const GENERIC_TOOL_NAMES = Object.freeze([
  'web_search',
  'web_fetch',
  'record_finding',
  'write_artifact',
]);

/**
 * Globe tools an agent may borrow from the voice tool surface.
 *
 * Deliberately a SUBSET of `GEV_REALTIME_TOOLS`. Tools that only make sense
 * with a human in the loop, or that seize output devices, are withheld:
 * `control_radio` (starts audio nobody asked for), `control_scene` (takes the
 * camera on a timed cinematic), and the voice-session plumbing.
 */
export const GEV_TOOL_NAMES = Object.freeze([
  'fly_to_location',
  'zoom_to_globe',
  'adjust_camera_zoom',
  'move_camera',
  'set_layer_visibility',
  'set_map_stack',
  'set_visual_style',
  'set_hud',
  'set_panel_open',
  'set_context_mode',
  'analyst_query',
  'get_current_view_state',
  'get_entity_context',
  'annotate_map',
  'clear_annotations',
  'frame_overhead',
  'track_entity',
  'stop_tracking',
  'control_cctv',
  'control_cockpit',
  'select_nearest_aircraft',
  'next_iss_pass',
]);

/** Every tool name the bus can resolve. */
export const ALL_TOOL_NAMES = Object.freeze([...GENERIC_TOOL_NAMES, ...GEV_TOOL_NAMES]);

/** Whether a name is a globe tool (routed to the GEV action runner). */
export function isGevTool(name) {
  return GEV_TOOL_NAMES.includes(name);
}

/**
 * Decide whether an agent may run a tool.
 *
 * @param {object} agent
 * @param {string} toolName
 * @returns {{allowed: boolean, reason: string}}
 */
export function checkToolGrant(agent, toolName) {
  if (!ALL_TOOL_NAMES.includes(toolName)) {
    return { allowed: false, reason: `No such tool "${toolName}". Available: ${agentToolNames(agent).join(', ')}` };
  }
  if (!agentToolNames(agent).includes(toolName)) {
    return {
      allowed: false,
      reason: `Agent "${agent.id}" is not granted "${toolName}". It may use: ${agentToolNames(agent).join(', ')}`,
    };
  }
  return { allowed: true, reason: '' };
}

/** Cap on a single tool result, so one huge page cannot blow the context. */
const MAX_RESULT_CHARS = 8000;

function truncate(text, limit = MAX_RESULT_CHARS) {
  const str = typeof text === 'string' ? text : JSON.stringify(text ?? null);
  if (str.length <= limit) return str;
  return `${str.slice(0, limit)}\n…[truncated ${str.length - limit} chars]`;
}

/**
 * Build the executor that runs one tool call for one agent.
 *
 * @param {object} options
 * @param {Function|null} options.runGevAction - From `createGevActionRunner`.
 * @param {Function} options.onArtifact - Called with each produced artifact.
 * @param {Function} options.onFinding - Called with each recorded finding.
 * @param {string} [options.apiBase] - Proxy base path.
 * @param {Function} [options.fetchImpl] - Injected for tests.
 * @returns {(agent: object, call: {name: string, args: object}, ctx: object) => Promise<object>}
 */
export function createToolBus({
  runGevAction = null,
  onArtifact = () => {},
  onFinding = () => {},
  apiBase = '/api',
  fetchImpl = null,
} = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

  return async function executeTool(agent, call, ctx = {}) {
    const name = String(call?.name || '');
    const args = call?.args && typeof call.args === 'object' ? call.args : {};

    const grant = checkToolGrant(agent, name);
    if (!grant.allowed) {
      // Returned as a RESULT, not thrown: the model gets to read why and pick
      // a tool it actually has, which is a recoverable turn rather than a
      // dead task.
      return { ok: false, error: grant.reason, refused: true };
    }

    try {
      switch (name) {
        case 'record_finding': {
          const finding = {
            text: String(args.finding ?? args.text ?? '').trim(),
            source: String(args.source ?? '').trim(),
            taskId: ctx.taskId || null,
            agentId: agent.id,
            at: Date.now(),
          };
          if (!finding.text) return { ok: false, error: 'record_finding needs a "finding"' };
          onFinding(finding);
          return { ok: true, recorded: true };
        }

        case 'write_artifact': {
          const artifact = {
            title: String(args.title ?? 'Untitled').trim().slice(0, 200),
            format: String(args.format ?? 'markdown').trim().slice(0, 32),
            content: String(args.content ?? ''),
            taskId: ctx.taskId || null,
            agentId: agent.id,
            at: Date.now(),
          };
          if (!artifact.content.trim()) return { ok: false, error: 'write_artifact needs "content"' };
          onArtifact(artifact);
          return { ok: true, saved: artifact.title, chars: artifact.content.length };
        }

        case 'web_search': {
          const query = String(args.query ?? '').trim();
          if (!query) return { ok: false, error: 'web_search needs a "query"' };
          const res = await doFetch(`${apiBase}/agent-web-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: Math.min(10, Math.max(1, Number(args.limit) || 5)) }),
            signal: ctx.signal,
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return { ok: false, error: body?.error || `Search failed (${res.status})` };
          return { ok: true, query, results: body.results || [] };
        }

        case 'web_fetch': {
          const url = String(args.url ?? '').trim();
          if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'web_fetch needs an http(s) "url"' };
          const res = await doFetch(`${apiBase}/agent-web-fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: ctx.signal,
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return { ok: false, error: body?.error || `Fetch failed (${res.status})` };
          return { ok: true, url, title: body.title || '', content: truncate(body.content || '') };
        }

        default: {
          if (!isGevTool(name)) return { ok: false, error: `Unroutable tool "${name}"` };
          if (typeof runGevAction !== 'function') {
            return { ok: false, error: 'Globe tools are unavailable — the map is not ready yet' };
          }
          const result = await runGevAction(name, args, { signal: ctx.signal });
          return result && typeof result === 'object' ? result : { ok: true, result };
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return { ok: false, error: String(error?.message || error || 'Tool failed') };
    }
  };
}

/** Serialize a tool result for the model, bounded in size. */
export function serializeToolResult(result) {
  return truncate(result);
}
